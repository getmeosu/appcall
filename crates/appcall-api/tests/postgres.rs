use appcall_actions::{CredentialResolver, ExecuteRequest, ExecuteResult};
use appcall_api::*;
use appcall_auth::{Principal, StaticApiKey};
use appcall_runner_client::{ClientOptions, RunnerClient};
use appcall_store::*;
use postgres::{Client, NoTls};
use serde_json::{json, Map, Value};
use std::sync::Arc;

struct Unused;
impl Executor for Unused {
    async fn execute_action(&self, _: ExecuteRequest) -> appcall_api::Result<ExecuteResult> {
        panic!("read routes dispatched action")
    }
}
impl CredentialResolver for Unused {
    async fn resolve(
        &self,
        _: &appcall_actions::Connection,
        _: &str,
    ) -> appcall_actions::Result<Map<String, Value>> {
        panic!("read routes loaded secrets")
    }
}

#[test]
#[ignore = "requires isolated APPCALL_ENGINE_POSTGRES_URL"]
fn rust_routes_read_existing_schema_without_exposing_credentials() {
    let url = std::env::var("APPCALL_ENGINE_POSTGRES_URL").unwrap();
    let mut client = Client::connect(&url, NoTls).unwrap();
    let schema = format!("api_test_{}", uuid::Uuid::new_v4().simple());
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
        .batch_execute("INSERT INTO projects(id,name) VALUES ('p','owner'),('q','other')")
        .unwrap();
    let mut store = Store::new(client, LocalProvider::new(&[7; 32]).unwrap());
    let owner = Scope::new("p", Some("brand")).unwrap();
    store
        .create(
            &owner,
            &Connection {
                id: "c".into(),
                project_id: "p".into(),
                connector: "slack".into(),
                auth_type: AuthType::ApiKey,
                status: Status::Active,
                secret_ref_id: String::new(),
                last_test_status: TestStatus::Unknown,
                external_account_id: "brand".into(),
                credential_owner: CredentialOwner::Brand,
            },
        )
        .unwrap();
    // The known SHA256 is a synthetic fixture key shared with Go auth tests.
    let key = StaticApiKey::from_hash(
        "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
        Principal::project("p").unwrap(),
    )
    .unwrap();
    let runner = RunnerClient::new("http://127.0.0.1:1", "", ClientOptions::default()).unwrap();
    let api = Api {
        registry: appcall_connectors::Registry::load(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../runner/connectors"
        ))
        .unwrap(),
        backend: Services::new(store, Arc::new(key), Unused, Unused, runner),
    };
    let rt = tokio::runtime::Runtime::new().unwrap();
    rt.block_on(async{
  let request=|brand:&str|Request{method:"GET".into(),uri:"/v1/connections/c".into(),headers:vec![("X-API-Key".into(),"hello".into()),("X-External-Account-Id".into(),brand.into())],body:vec![]};
  let response=api.handle(request("brand")).await;
  assert_eq!(response.status,200);assert_eq!(response.body,json!({"id":"c","connector":"slack","authType":"api_key","status":"active","lastTestStatus":"unknown","credentialOwner":"brand"}));
  assert_eq!(api.handle(request("other")).await.status,404);
 });
    drop(api);
    drop(rt);
    let mut admin = Client::connect(&url, NoTls).unwrap();
    admin
        .batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
        .unwrap();
}

struct Credentials(Arc<std::sync::atomic::AtomicUsize>);
impl CredentialResolver for Credentials {
    async fn resolve(
        &self,
        _: &appcall_actions::Connection,
        _: &str,
    ) -> appcall_actions::Result<Map<String, Value>> {
        self.0.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        Ok(Map::new())
    }
}
fn health_runner(source: &'static str) -> (RunnerClient, std::thread::JoinHandle<()>) {
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
        let body = json!({"id":request["id"],"ok":true,"result":{"status":"ok","source":source}})
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
fn services_health_evidence_and_auth_scope_fail_closed() {
    let url = std::env::var("APPCALL_ENGINE_POSTGRES_URL").unwrap();
    for (source, expected) in [
        ("static", TestStatus::Unknown),
        ("provider", TestStatus::Passed),
    ] {
        let mut client = Client::connect(&url, NoTls).unwrap();
        let schema = format!("api_health_{}", uuid::Uuid::new_v4().simple());
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
            .batch_execute("INSERT INTO projects(id,name) VALUES ('p','fixture')")
            .unwrap();
        let mut store = Store::new(client, LocalProvider::new(&[7; 32]).unwrap());
        let scope = Scope::new("p", None).unwrap();
        let connection = Connection {
            id: "c".into(),
            project_id: "p".into(),
            connector: "slack".into(),
            auth_type: AuthType::ApiKey,
            status: Status::Active,
            secret_ref_id: String::new(),
            last_test_status: TestStatus::Unknown,
            external_account_id: "brand".into(),
            credential_owner: CredentialOwner::Brand,
        };
        store.create(&scope, &connection).unwrap();
        store
            .create(
                &scope,
                &Connection {
                    id: "pooled".into(),
                    external_account_id: String::new(),
                    credential_owner: CredentialOwner::Platform,
                    ..connection
                },
            )
            .unwrap();
        let mut principal = Principal::project("p").unwrap();
        principal.scopes = appcall_auth::Grant::Only(["read".into()].into());
        let key =
            StaticApiKey::from_hash(&appcall_auth::hash_api_key("fixture"), principal).unwrap();
        let (runner, task) = health_runner(source);
        let calls = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let services = Services::new(
            store,
            Arc::new(key),
            Unused,
            Credentials(calls.clone()),
            runner,
        );
        let mut blocker = Client::connect(&url, NoTls).unwrap();
        blocker
            .batch_execute(&format!("SET search_path TO {schema}"))
            .unwrap();
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            assert!(
                services
                    .authorize(&[("X-API-Key".into(), "fixture".into())])
                    .await
                    .is_err(),
                "scoped grant must not become unrestricted identity"
            );
            let identity = Identity {
                project_id: "p".into(),
                account_id: "brand".into(),
                admin_scope: false,
            };
            let checked = services.test_connection(&identity, "c").await.unwrap();
            assert_eq!(checked.last_test_status, expected);
            assert!(services.test_connection(&identity, "pooled").await.is_err());
            assert_eq!(
                calls.load(std::sync::atomic::Ordering::SeqCst),
                1,
                "brand may not load pooled credentials for mutation-side tests"
            );
            let (locked_tx, locked_rx) = std::sync::mpsc::channel();
            let holder = std::thread::spawn(move || {
                let mut tx = blocker.transaction().unwrap();
                tx.query_one("SELECT id FROM connections WHERE id='c' FOR UPDATE", &[])
                    .unwrap();
                locked_tx.send(()).unwrap();
                std::thread::sleep(std::time::Duration::from_secs(3));
            });
            locked_rx.recv().unwrap();
            let started = std::time::Instant::now();
            assert!(
                services.disconnect(&identity, "c").await.is_err(),
                "locked database mutation must time out"
            );
            assert!(started.elapsed() < std::time::Duration::from_secs(3));
            holder.join().unwrap();
            services.disconnect(&identity, "c").await.unwrap();
            assert!(services.test_connection(&identity, "c").await.is_err());
        });
        task.join().unwrap();
        drop(services);
        drop(rt);
        let mut admin = Client::connect(&url, NoTls).unwrap();
        admin
            .batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
            .unwrap();
    }
}
