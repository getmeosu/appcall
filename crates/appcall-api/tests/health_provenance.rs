use appcall_actions::{
    CredentialResolver, ExecuteRequest, ExecuteResult, ResolvedActionCredentials,
};
use appcall_api::*;
use appcall_auth::{Principal, StaticApiKey};
use appcall_runner_client::{ClientOptions, RunnerClient};
use appcall_store::*;
use postgres::{Client, NoTls};
use serde_json::{json, Map, Value};
use std::sync::{Arc, Mutex};
struct Unused;
impl Executor for Unused {
    async fn execute_action(&self, _: ExecuteRequest) -> appcall_api::Result<ExecuteResult> {
        unreachable!()
    }
}
struct Refresh(Arc<Mutex<Client>>);
impl CredentialResolver for Refresh {
    async fn resolve(
        &self,
        c: &appcall_actions::Connection,
        caller: &str,
    ) -> appcall_actions::Result<Map<String, Value>> {
        Ok(self.resolve_tracked(c, caller).await?.fields)
    }
    async fn resolve_tracked(
        &self,
        c: &appcall_actions::Connection,
        _: &str,
    ) -> appcall_actions::Result<ResolvedActionCredentials> {
        let client = self.0.clone();
        let mut c = c.clone();
        tokio::task::spawn_blocking(move || {
            client
                .lock()
                .unwrap()
                .batch_execute("UPDATE connections SET secret_ref_id='refreshed' WHERE id='c'")
                .unwrap();
            c.secret_ref_id = Some("refreshed".into());
            Ok(ResolvedActionCredentials {
                connection: c,
                fields: json!({"accessToken":"fresh"}).as_object().unwrap().clone(),
            })
        })
        .await
        .unwrap()
    }
}
#[test]
#[ignore = "requires isolated APPCALL_ENGINE_POSTGRES_URL and local TCP"]
fn refreshed_credentials_pass_health_but_concurrent_reconnect_does_not() {
    use std::io::{Read, Write};
    let url = std::env::var("APPCALL_ENGINE_POSTGRES_URL").unwrap();
    for reconnect in [false, true] {
        let schema = format!("health_fence_{}", uuid::Uuid::new_v4().simple());
        let mut client = Client::connect(&url, NoTls).unwrap();
        client
            .batch_execute(&format!(
                "CREATE SCHEMA {schema}; SET search_path TO {schema}"
            ))
            .unwrap();
        for sql in [
            include_str!("../../../migrations/202605140001_init.sql"),
            include_str!("../../../migrations/202605290001_connections_ownership.sql"),
            include_str!("../../../migrations/202605290004_connections_owner_check.sql"),
        ] {
            client.batch_execute(sql).unwrap();
        }
        client.batch_execute("INSERT INTO projects(id,name) VALUES('p','fixture');INSERT INTO secret_envelopes(id,project_id,kind,key_id,algorithm,nonce,ciphertext) VALUES('initial','p','oauth_token','test','test','x','x'),('refreshed','p','oauth_token','test','test','x','x'),('replacement','p','oauth_token','test','test','x','x');INSERT INTO connections(id,project_id,connector,auth_type,status,secret_ref_id,external_account_id,credential_owner) VALUES('c','p','slack','oauth2','active','initial','brand','brand')").unwrap();
        let mut refresh_client = Client::connect(&url, NoTls).unwrap();
        refresh_client
            .batch_execute(&format!("SET search_path TO {schema}"))
            .unwrap();
        let mut reconnect_client = Client::connect(&url, NoTls).unwrap();
        reconnect_client
            .batch_execute(&format!("SET search_path TO {schema}"))
            .unwrap();
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let runner = RunnerClient::new(
            &format!("http://{}", listener.local_addr().unwrap()),
            "",
            ClientOptions::default(),
        )
        .unwrap();
        let task = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            let mut bytes = vec![];
            let mut chunk = [0; 4096];
            let (split, length) = loop {
                let n = socket.read(&mut chunk).unwrap();
                assert!(n > 0);
                bytes.extend_from_slice(&chunk[..n]);
                if let Some(pos) = bytes.windows(4).position(|w| w == b"\r\n\r\n") {
                    let split = pos + 4;
                    let head = std::str::from_utf8(&bytes[..split]).unwrap();
                    let length: usize = head
                        .lines()
                        .find_map(|l| {
                            l.to_lowercase()
                                .strip_prefix("content-length:")
                                .map(|v| v.trim().parse().unwrap())
                        })
                        .unwrap();
                    break (split, length);
                }
            };
            while bytes.len() < split + length {
                let n = socket.read(&mut chunk).unwrap();
                assert!(n > 0);
                bytes.extend_from_slice(&chunk[..n]);
            }
            let request: Value = serde_json::from_slice(&bytes[split..split + length]).unwrap();
            assert!(request.to_string().contains("fresh"));
            if reconnect {
                reconnect_client
                    .batch_execute(
                        "UPDATE connections SET secret_ref_id='replacement' WHERE id='c'",
                    )
                    .unwrap();
            }
            let body =
                json!({"id":request["id"],"ok":true,"result":{"status":"ok","source":"provider"}})
                    .to_string();
            write!(socket,"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",body.len(),body).unwrap();
        });
        let key = StaticApiKey::from_hash(
            &appcall_auth::hash_api_key("fixture"),
            Principal::project("p").unwrap(),
        )
        .unwrap();
        let services = Services::new(
            Store::new(client, LocalProvider::new(&[7; 32]).unwrap()),
            Arc::new(key),
            Unused,
            Refresh(Arc::new(Mutex::new(refresh_client))),
            runner,
        );
        let rt = tokio::runtime::Runtime::new().unwrap();
        let result = rt.block_on(services.test_connection(
            &Identity {
                project_id: "p".into(),
                account_id: "brand".into(),
                admin_scope: false,
            },
            "c",
        ));
        task.join().unwrap();
        drop(services);
        drop(rt);
        let mut admin = Client::connect(&url, NoTls).unwrap();
        admin
            .batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
            .unwrap();
        if reconnect {
            assert_eq!(result.unwrap_err().code, "CONNECTION_CHANGED")
        } else {
            assert_eq!(result.unwrap().last_test_status, TestStatus::Passed)
        }
    }
}
