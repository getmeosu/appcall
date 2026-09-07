use appcall_actions::{CredentialResolver, ExecuteRequest, ExecuteResult};
use appcall_api::*;
use appcall_auth::{Principal, StaticApiKey};
use appcall_runner_client::{ClientOptions, RunnerClient};
use appcall_store::*;
use postgres::{Client, NoTls};
use serde_json::{json, Map, Value};
use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Arc,
};
struct Unused;
impl Executor for Unused {
    async fn execute_action(&self, _: ExecuteRequest) -> appcall_api::Result<ExecuteResult> {
        unreachable!()
    }
}
struct Credentials(Arc<AtomicUsize>, bool);
impl CredentialResolver for Credentials {
    async fn resolve(
        &self,
        _: &appcall_actions::Connection,
        _: &str,
    ) -> appcall_actions::Result<Map<String, Value>> {
        self.0.fetch_add(1, Ordering::SeqCst);
        if self.1 {
            Err(appcall_actions::ActionError::new("MISSING_CREDENTIAL"))
        } else {
            Ok(Map::new())
        }
    }
}
fn health_runner(response: Value) -> (RunnerClient, std::thread::JoinHandle<()>) {
    use std::io::{Read, Write};
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let task = std::thread::spawn(move || {
        let (mut socket, _) = listener.accept().unwrap();
        socket
            .set_read_timeout(Some(std::time::Duration::from_secs(3)))
            .unwrap();
        let mut bytes = Vec::new();
        let mut chunk = [0; 4096];
        let split = loop {
            let n = socket.read(&mut chunk).unwrap();
            assert!(n > 0);
            bytes.extend_from_slice(&chunk[..n]);
            if let Some(p) = bytes.windows(4).position(|w| w == b"\r\n\r\n") {
                break p + 4;
            }
        };
        let head = std::str::from_utf8(&bytes[..split]).unwrap();
        let length: usize = head
            .lines()
            .find_map(|l| {
                l.to_lowercase()
                    .strip_prefix("content-length:")
                    .map(|v| v.trim().parse().unwrap())
            })
            .unwrap();
        while bytes.len() < split + length {
            let n = socket.read(&mut chunk).unwrap();
            assert!(n > 0);
            bytes.extend_from_slice(&chunk[..n]);
        }
        let request: Value = serde_json::from_slice(&bytes[split..split + length]).unwrap();
        let body = {
            let mut response = response;
            response["id"] = request["id"].clone();
            response
        }
        .to_string();
        write!(socket,"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",body.len(),body).unwrap();
    });
    (
        RunnerClient::new(&url, "", ClientOptions::default()).unwrap(),
        task,
    )
}

#[test]
#[ignore = "requires isolated APPCALL_ENGINE_POSTGRES_URL and local TCP"]
fn health_and_local_disconnect_match_go_without_weakening_scope() {
    let url = std::env::var("APPCALL_ENGINE_POSTGRES_URL").unwrap();
    for (status, auth, reply, error, expected_status, expected_test) in [
        (
            "degraded",
            "api_key",
            Some(json!({"ok":true,"result":{"status":"ok","source":"provider"}})),
            None,
            "degraded",
            "passed",
        ),
        (
            "active",
            "external_bearer",
            Some(json!({"ok":true,"result":{"status":"ok","source":"connector"}})),
            None,
            "active",
            "unknown",
        ),
        (
            "authorizing",
            "api_key",
            Some(json!({"ok":true,"result":{"status":"ok","source":"connector"}})),
            None,
            "authorizing",
            "unknown",
        ),
        (
            "active",
            "api_key",
            Some(json!({"ok":true,"result":{"status":"error","source":"provider"}})),
            None,
            "degraded",
            "failed",
        ),
        (
            "active",
            "api_key",
            Some(
                json!({"ok":false,"error":{"code":"UPSTREAM_UNAVAILABLE","message":"private provider detail"}}),
            ),
            Some("runner"),
            "degraded",
            "passed",
        ),
        (
            "active",
            "api_key",
            None,
            Some("credential"),
            "degraded",
            "passed",
        ),
        (
            "disconnected",
            "api_key",
            None,
            Some("disconnected"),
            "disconnected",
            "passed",
        ),
    ] {
        let schema = format!("connection_health_{}", uuid::Uuid::new_v4().simple());
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
        client
            .batch_execute("INSERT INTO projects(id,name) VALUES('p','fixture')")
            .unwrap();
        client.execute("INSERT INTO connections(id,project_id,connector,auth_type,status,last_test_status,external_account_id,credential_owner) VALUES('c','p','unipile',$1,$2,'passed','brand','brand'),('pooled','p','unipile','api_key','active','unknown',NULL,'platform')",&[&auth,&status]).unwrap();
        let (runner, task) = match reply {
            Some(reply) => {
                let (r, t) = health_runner(reply);
                (r, Some(t))
            }
            None => (
                RunnerClient::new("http://127.0.0.1:1", "", ClientOptions::default()).unwrap(),
                None,
            ),
        };
        let calls = Arc::new(AtomicUsize::new(0));
        let key = StaticApiKey::from_hash(
            &appcall_auth::hash_api_key("fixture"),
            Principal::project("p").unwrap(),
        )
        .unwrap();
        let services = Services::new(
            Store::new(client, LocalProvider::new(&[7; 32]).unwrap()),
            Arc::new(key),
            Unused,
            Credentials(calls.clone(), error == Some("credential")),
            runner,
        );
        let rt = tokio::runtime::Runtime::new().unwrap();
        let identity = Identity {
            project_id: "p".into(),
            account_id: "brand".into(),
            admin_scope: false,
        };
        let result = rt.block_on(services.test_connection(&identity, "c"));
        assert_eq!(
            result.is_err(),
            error.is_some(),
            "case {status}/{auth}/{error:?}: {result:?}"
        );
        if matches!(error, Some("runner" | "credential")) {
            assert_eq!(result.as_ref().unwrap_err().code, "INTERNAL_ERROR");
            assert!(result.as_ref().unwrap_err().detail.is_none());
        }
        if let Some(task) = task {
            task.join().unwrap();
        }
        let current = rt.block_on(services.connection(&identity, "c")).unwrap();
        assert_eq!(current.status.as_str(), expected_status);
        assert_eq!(current.last_test_status.as_str(), expected_test);
        if auth == "external_bearer" {
            assert_eq!(calls.load(Ordering::SeqCst), 0);
        }
        assert!(rt
            .block_on(services.disconnect(&identity, "pooled"))
            .is_err());
        rt.block_on(services.disconnect(&identity, "c")).unwrap();
        assert_eq!(
            rt.block_on(services.connection(&identity, "c"))
                .unwrap()
                .status,
            Status::Disconnected
        );
        assert_eq!(
            rt.block_on(services.connection(&identity, "pooled"))
                .unwrap()
                .status,
            Status::Active
        );
        drop(services);
        drop(rt);
        let mut admin = Client::connect(&url, NoTls).unwrap();
        admin
            .batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
            .unwrap();
    }
}

#[test]
#[ignore = "requires isolated APPCALL_ENGINE_POSTGRES_URL"]
fn connection_list_reaps_old_authorizing_rows_and_tolerates_cleanup_failure() {
    let url = std::env::var("APPCALL_ENGINE_POSTGRES_URL").unwrap();
    let schema = format!("connection_expiry_{}", uuid::Uuid::new_v4().simple());
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
    client.batch_execute("INSERT INTO projects(id,name) VALUES('p','fixture'),('q','other'); INSERT INTO connections(id,project_id,connector,auth_type,status,external_account_id,credential_owner,created_at) VALUES('old','p','slack','oauth2','authorizing','brand','brand',now()-interval '31 minutes'),('fresh','p','slack','oauth2','authorizing','brand','brand',now()-interval '29 minutes'),('degraded','p','slack','oauth2','degraded','brand','brand',now()-interval '1 day'),('other','q','slack','oauth2','authorizing','brand','brand',now()-interval '1 day')").unwrap();
    let key = StaticApiKey::from_hash(
        &appcall_auth::hash_api_key("fixture"),
        Principal::project("p").unwrap(),
    )
    .unwrap();
    let services = Services::new(
        Store::new(client, LocalProvider::new(&[7; 32]).unwrap()),
        Arc::new(key),
        Unused,
        Credentials(Arc::new(AtomicUsize::new(0)), false),
        RunnerClient::new("http://127.0.0.1:1", "", ClientOptions::default()).unwrap(),
    );
    let rt = tokio::runtime::Runtime::new().unwrap();
    let identity = Identity {
        project_id: "p".into(),
        account_id: "brand".into(),
        admin_scope: false,
    };
    let listed = rt.block_on(services.connections(&identity)).unwrap();
    assert_eq!(
        listed.iter().find(|c| c.id == "old").unwrap().status,
        Status::Disconnected
    );
    assert_eq!(
        listed.iter().find(|c| c.id == "fresh").unwrap().status,
        Status::Authorizing
    );
    assert_eq!(
        listed.iter().find(|c| c.id == "degraded").unwrap().status,
        Status::Degraded
    );
    let mut admin = Client::connect(&url, NoTls).unwrap();
    admin
        .batch_execute(&format!("SET search_path TO {schema}"))
        .unwrap();
    assert_eq!(
        admin
            .query_one("SELECT status FROM connections WHERE id='other'", &[])
            .unwrap()
            .get::<_, String>(0),
        "authorizing"
    );
    admin.batch_execute("UPDATE connections SET status='authorizing' WHERE id='old'; CREATE FUNCTION reject_cleanup() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected cleanup failure'; END $$; CREATE TRIGGER reject_cleanup BEFORE UPDATE ON connections FOR EACH ROW EXECUTE FUNCTION reject_cleanup()").unwrap();
    let listed = rt.block_on(services.connections(&identity)).unwrap();
    assert_eq!(
        listed.iter().find(|c| c.id == "old").unwrap().status,
        Status::Authorizing
    );
    drop(services);
    drop(rt);
    admin
        .batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
        .unwrap();
}
