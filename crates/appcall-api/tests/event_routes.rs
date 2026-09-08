use appcall_api::{
    event_routes::{public_exact, EventRoutes},
    Request,
};
use appcall_auth::{Principal, WebhookVerifier};
use appcall_store::{LocalProvider, Store};
use postgres::{Client, NoTls};
use serde_json::{json, Value};
use std::{
    io::{Read, Write},
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    },
    time::Duration,
};
const TOKEN: &str =
    "eyJwIjoicCIsImMiOiJjIiwiayI6InNsYWNrIn0.LVmHbEaZ8w7z9Ir26XhIybs2jclqEc2rbbAOtVRqzxc";
#[test]
fn only_exact_ingestion_routes_can_use_callback_authentication() {
    assert!(public_exact("POST", "/v1/connections/c/webhooks/slack"));
    for path in [
        "/v1/webhook-events",
        "/v1/connections/c/webhooks/slack/extra",
        "/v1/connections//webhooks/slack",
        "/v1/connections/c/webhooks/%2e%2e",
    ] {
        assert!(!public_exact("POST", path));
    }
    assert!(!public_exact("GET", "/v1/connections/c/webhooks/slack"));
}
fn connect(schema: &str) -> Client {
    let mut c = Client::connect(
        &std::env::var("APPCALL_ENGINE_POSTGRES_URL").expect("explicit PostgreSQL URL required"),
        NoTls,
    )
    .unwrap();
    if !schema.is_empty() {
        c.batch_execute(&format!("SET search_path TO {schema}"))
            .unwrap();
    }
    c
}
#[test]
#[ignore = "requires isolated PostgreSQL and synthetic local runner"]
fn signed_ingestion_verifies_then_persists_sanitized_event_and_durable_outbox() {
    let mut db = connect("");
    let schema = format!("event_route_{}", uuid::Uuid::new_v4().simple());
    db.batch_execute(&format!(
        "CREATE SCHEMA {schema}; SET search_path TO {schema}"
    ))
    .unwrap();
    for sql in [
        include_str!("../../../migrations/202605140001_init.sql"),
        include_str!("../../../migrations/202605290001_connections_ownership.sql"),
        include_str!("../../../migrations/202605290003_usage_brand_dim.sql"),
        include_str!("../../../migrations/202605290004_connections_owner_check.sql"),
        include_str!("../../../migrations/202609040001_sync_job_terminal_failure.sql"),
        include_str!("../../../migrations/202609070001_event_outbox.sql"),
        include_str!("../../../migrations/202609070002_sync_recovery.sql"),
        include_str!("../../../migrations/202609090001_sync_job_history.sql"),
    ] {
        db.batch_execute(sql).unwrap();
    }
    db.batch_execute("INSERT INTO projects(id,name) VALUES('p','p');INSERT INTO connections(id,project_id,connector,auth_type,status,credential_owner,external_account_id) VALUES('c','p','slack','api_key','active','brand','brand')").unwrap();
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    listener.set_nonblocking(true).unwrap();
    let calls = Arc::new(AtomicUsize::new(0));
    let observed = calls.clone();
    let stop = Arc::new(std::sync::atomic::AtomicBool::new(false));
    let stopping = stop.clone();
    let mut concurrent = connect(&schema);
    let server = std::thread::spawn(move || {
        while !stopping.load(Ordering::SeqCst) {
            let (mut socket, _) = match listener.accept() {
                Ok(s) => s,
                Err(_) => {
                    std::thread::sleep(Duration::from_millis(2));
                    continue;
                }
            };
            socket.set_nonblocking(false).unwrap();
            socket
                .set_read_timeout(Some(Duration::from_secs(2)))
                .unwrap();
            let mut raw = Vec::new();
            let mut buf = [0; 4096];
            let end = loop {
                let n = socket.read(&mut buf).unwrap();
                assert!(n > 0);
                raw.extend_from_slice(&buf[..n]);
                if let Some(n) = raw.windows(4).position(|s| s == b"\r\n\r\n") {
                    break n + 4;
                }
            };
            let head = String::from_utf8_lossy(&raw[..end]);
            let length: usize = head
                .lines()
                .find_map(|l| {
                    l.to_ascii_lowercase()
                        .strip_prefix("content-length:")
                        .map(|s| s.trim().parse().unwrap())
                })
                .unwrap();
            while raw.len() < end + length {
                let n = socket.read(&mut buf).unwrap();
                assert!(n > 0);
                raw.extend_from_slice(&buf[..n]);
            }
            let rpc: Value = serde_json::from_slice(&raw[end..end + length]).unwrap();
            observed.fetch_add(1, Ordering::SeqCst);
            assert_eq!(rpc["params"]["connectorKey"], "slack");
            assert!(rpc["params"]["payload"]["secret"].is_string());
            assert!(rpc["deadlineUnixMs"].is_u64());
            let payload = &rpc["params"]["payload"];
            let result = if rpc["method"] == "connector.webhook.verify" {
                json!({"verified":payload["badSignature"]!=true})
            } else {
                assert_eq!(rpc["method"], "connector.webhook.parse");
                if payload["id"] == "late" {
                    concurrent
                        .execute(
                            "UPDATE connections SET external_account_id='new-brand' WHERE id='c'",
                            &[],
                        )
                        .unwrap();
                }

                json!({"idempotencyKey":payload["id"],"operation":"messages.list","sanitized":if payload["poison"]==true{json!({})}else{json!({"channel":"C123","safe":true})}})
            };
            let body = json!({"ok":true,"id":rpc["id"],"result":result}).to_string();
            write!(
                socket,
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            )
            .unwrap();
        }
    });
    let runner = appcall_runner_client::RunnerClient::new(
        &format!("http://{address}"),
        "",
        Default::default(),
    )
    .unwrap();
    let unsigned_routes = EventRoutes::new(
        connect(&schema),
        Store::new(connect(&schema), LocalProvider::new(&[7; 32]).unwrap()),
        runner.clone(),
        None,
    );
    let routes = EventRoutes::new(
        connect(&schema),
        Store::new(connect(&schema), LocalProvider::new(&[7; 32]).unwrap()),
        runner,
        Some(WebhookVerifier::new("fixture-hook-secret").unwrap()),
    );
    let runtime = tokio::runtime::Runtime::new().unwrap();
    runtime.block_on(async {
        let request = |token: &str, body: Value| Request {
            method: "POST".into(),
            uri: format!("/v1/connections/c/webhooks/slack?token={token}"),
            headers: vec![("Content-Type".into(), "application/json".into())],
            body: serde_json::to_vec(&body).unwrap(),
        };
        let body = json!({"id":"provider-event","secret":"must-not-persist"});
        assert!(routes
            .handle(None, &request("forged", body.clone()))
            .await
            .is_err());
        assert_eq!(calls.load(Ordering::SeqCst), 0);
        assert!(unsigned_routes
            .handle(None, &request(TOKEN, body.clone()))
            .await
            .is_err());
        let mut oversized = request(TOKEN, body.clone());
        oversized.body = vec![b'x'; 1024 * 1024 + 1];
        assert_eq!(
            routes.handle(None, &oversized).await.unwrap_err().code,
            "WEBHOOK_PAYLOAD_TOO_LARGE"
        );
        let mut restricted = Principal::project("p").unwrap();
        restricted.allowed_brands =
            appcall_auth::Grant::Only(["other-brand".into()].into_iter().collect());
        assert!(routes
            .handle(Some(&restricted), &request(TOKEN, body.clone()))
            .await
            .is_err());
        assert_eq!(calls.load(Ordering::SeqCst), 0);

        assert!(routes
            .handle(
                Some(&Principal::project("other").unwrap()),
                &request(TOKEN, body.clone())
            )
            .await
            .is_err());
        assert_eq!(calls.load(Ordering::SeqCst), 0);
        assert_eq!(
            routes
                .handle(None, &request(TOKEN, body.clone()))
                .await
                .unwrap()
                .unwrap()
                .status,
            202
        );
        assert_eq!(
            routes
                .handle(None, &request(TOKEN, body))
                .await
                .unwrap()
                .unwrap()
                .status,
            200
        );
        assert!(routes
            .handle(
                None,
                &request(TOKEN, json!({"id":"poison","secret":"s","poison":true}))
            )
            .await
            .is_err());
        assert!(routes
            .handle(
                None,
                &request(TOKEN, json!({"id":"bad","secret":"s","badSignature":true}))
            )
            .await
            .is_err());
        let read = Request {
            method: "GET".into(),
            uri: "/v1/webhook-events".into(),
            headers: vec![],
            body: vec![],
        };
        assert!(routes.handle(None, &read).await.is_err());
        let p = Principal::project("p").unwrap();
        let mut authenticated = request("", json!({"id":"provider-event","secret":"s"}));
        authenticated.uri = "/v1/connections/c/webhooks/slack".into();
        assert_eq!(
            unsigned_routes
                .handle(Some(&p), &authenticated)
                .await
                .unwrap()
                .unwrap()
                .status,
            200
        );

        let response = routes.handle(Some(&p), &read).await.unwrap().unwrap();
        assert_eq!(response.body["events"].as_array().unwrap().len(), 1);
        assert!(!response.body.to_string().contains("must-not-persist"));
        assert_eq!(routes.poll(&p, "").await.unwrap().len(), 1);
        let (first, second) = tokio::join!(routes.poll(&p, ""), routes.poll(&p, ""));
        assert_eq!(first.unwrap().len(), 1);
        assert_eq!(second.unwrap().len(), 1);

        let replay = Request {
            method: "POST".into(),
            uri: "/v1/webhook-events/provider-event/replay".into(),
            headers: vec![],
            body: vec![],
        };
        assert_eq!(
            routes
                .handle(Some(&p), &replay)
                .await
                .unwrap()
                .unwrap()
                .status,
            202
        );
        assert_eq!(
            routes
                .handle(None, &request(TOKEN, json!({"id":"late","secret":"s"})))
                .await
                .unwrap_err()
                .code,
            "CONNECTION_CHANGED"
        );
    });
    assert_eq!(
        db.query_one("SELECT count(*) FROM webhook_events", &[])
            .unwrap()
            .get::<_, i64>(0),
        1
    );
    assert_eq!(
        db.query_one("SELECT count(*) FROM webhook_outbox", &[])
            .unwrap()
            .get::<_, i64>(0),
        1
    );
    assert_eq!(
        db.query_one("SELECT input FROM sync_jobs", &[])
            .unwrap()
            .get::<_, Value>(0),
        json!({"channelId":"C123"})
    );
    drop(routes);
    drop(unsigned_routes);
    drop(runtime);
    stop.store(true, Ordering::SeqCst);
    server.join().unwrap();
    db.batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
        .unwrap();
}

#[test]
#[ignore = "requires isolated PostgreSQL"]
fn live_stream_retirement_releases_database_owners_before_blocking_cleanup() {
    let mut admin = connect("");
    let schema = format!("stream_retire_{}", uuid::Uuid::new_v4().simple());
    admin
        .batch_execute(&format!(
            "CREATE SCHEMA {schema}; SET search_path TO {schema}"
        ))
        .unwrap();
    for sql in [
        include_str!("../../../migrations/202605140001_init.sql"),
        include_str!("../../../migrations/202605290001_connections_ownership.sql"),
        include_str!("../../../migrations/202605290003_usage_brand_dim.sql"),
        include_str!("../../../migrations/202605290004_connections_owner_check.sql"),
        include_str!("../../../migrations/202609040001_sync_job_terminal_failure.sql"),
        include_str!("../../../migrations/202609070001_event_outbox.sql"),
        include_str!("../../../migrations/202609070002_sync_recovery.sql"),
    ] {
        admin.batch_execute(sql).unwrap();
    }
    admin
        .batch_execute("INSERT INTO projects(id,name) VALUES('p','p')")
        .unwrap();
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();
    for mode in 0..3 {
        let mut events = connect(&schema);
        let mut connections = connect(&schema);
        let mut identity = connect(&schema);
        let pids: Vec<i32> = [&mut events, &mut connections, &mut identity]
            .into_iter()
            .map(|c| c.query_one("SELECT pg_backend_pid()", &[]).unwrap().get(0))
            .collect();
        let routes = EventRoutes::new(
            events,
            Store::new(connections, LocalProvider::new(&[7; 32]).unwrap()),
            appcall_runner_client::RunnerClient::new(
                "http://127.0.0.1:1",
                "synthetic",
                Default::default(),
            )
            .unwrap(),
            None,
        );
        let identity = Arc::new(std::sync::Mutex::new(identity));
        runtime.block_on(async move {
            let revoked = Arc::new(std::sync::atomic::AtomicBool::new(false));
            let flag = revoked.clone();
            let retained_identity = identity.clone();
            let verify: appcall_api::streaming::SessionVerifier = Arc::new(move || {
                let _identity = &retained_identity;
                let valid = !flag.load(Ordering::Acquire);
                Box::pin(async move {
                    if valid {
                        Ok(Principal::project("p").unwrap())
                    } else {
                        Err(appcall_api::ApiError::new("UNAUTHORIZED"))
                    }
                })
            });
            let (stop, shutdown) = tokio::sync::watch::channel(false);
            let mut receiver = appcall_api::streaming::open_verified(
                routes.clone(),
                Principal::project("p").unwrap(),
                String::new(),
                shutdown,
                verify,
            )
            .await
            .unwrap();
            receiver.recv().await.unwrap();
            assert!(!routes.retirement_ready());
            match mode {
                0 => {
                    stop.send_replace(true);
                }
                1 => drop(receiver),
                _ => {
                    revoked.store(true, Ordering::Release);
                }
            }
            tokio::time::timeout(Duration::from_secs(3), async {
                while !routes.retirement_ready() {
                    tokio::task::yield_now().await;
                }
            })
            .await
            .unwrap();
            assert_eq!(
                Arc::strong_count(&identity),
                1,
                "verifier PG owner released before retirement acknowledgment"
            );
            tokio::task::spawn_blocking(move || {
                drop(routes);
                drop(identity);
            })
            .await
            .unwrap();
        });
        let count: i64 = admin
            .query_one(
                "SELECT count(*) FROM pg_stat_activity WHERE pid=ANY($1)",
                &[&pids],
            )
            .unwrap()
            .get(0);
        assert_eq!(count, 0, "retirement must close all physical sessions");
    }
    // Exercise the real generation manager while a PostgreSQL-backed stream is live.
    let pids = Arc::new(std::sync::Mutex::new(vec![]));
    let old = retiring_events(&schema, &pids);
    let healthy = old.healthy.clone();
    let generation_schema = schema.clone();
    let generation_pids = pids.clone();
    let builds = Arc::new(AtomicUsize::new(0));
    let factory_builds = builds.clone();
    let manager = appcall_api::generation::Generation::new(
        old,
        Arc::new(appcall_runtime::SessionTracker::default()),
        Arc::new(move || {
            factory_builds.fetch_add(1, Ordering::AcqRel);
            Ok((
                retiring_events(&generation_schema, &generation_pids),
                Arc::new(appcall_runtime::SessionTracker::default()),
            ))
        }),
    );
    runtime.block_on(async move {
        use appcall_api::Backend;
        let request = Request {
            method: "GET".into(),
            uri: "/v1/events".into(),
            headers: vec![],
            body: vec![],
        };
        let mut stream = manager
            .event_stream(&request)
            .await
            .unwrap()
            .unwrap()
            .receiver;
        stream.recv().await.unwrap();
        healthy.store(false, Ordering::Release);
        manager.maintain().await.unwrap();
        tokio::time::timeout(Duration::from_secs(3), async {
            while stream.recv().await.is_some() {}
        })
        .await
        .unwrap();
        assert_eq!(builds.load(Ordering::Acquire), 1);
        let mut replacement = manager
            .event_stream(&request)
            .await
            .unwrap()
            .unwrap()
            .receiver;
        replacement.recv().await.unwrap();
        manager.stop();
        drop(replacement);
        drop(manager);
        tokio::time::sleep(Duration::from_millis(50)).await;
    });
    for attempt in 0..100 {
        let ids = pids.lock().unwrap().clone();
        let live: i64 = admin
            .query_one(
                "SELECT count(*) FROM pg_stat_activity WHERE pid=ANY($1)",
                &[&ids],
            )
            .unwrap()
            .get(0);
        if live == 0 {
            break;
        }
        assert!(
            attempt < 99,
            "generation reaper leaked old/new stream sessions"
        );
        std::thread::sleep(Duration::from_millis(10));
    }
    drop(runtime);
    admin
        .batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
        .unwrap();
}

struct RetiringEvents {
    events: EventRoutes,
    healthy: Arc<std::sync::atomic::AtomicBool>,
    stop: tokio::sync::watch::Sender<bool>,
}
impl appcall_api::generation::ManagedBackend for RetiringEvents {
    fn database_health(&self) -> Option<bool> {
        Some(self.healthy.load(Ordering::Acquire))
    }
    fn stop(&self) {
        self.stop.send_replace(true);
    }
    fn retirement_ready(&self) -> bool {
        self.events.retirement_ready()
    }
}
impl appcall_api::Backend for RetiringEvents {
    async fn event_stream(
        &self,
        _: &Request,
    ) -> appcall_api::Result<Option<appcall_api::streaming::StreamResponse>> {
        Ok(Some(appcall_api::streaming::StreamResponse {
            receiver: appcall_api::streaming::open(
                self.events.clone(),
                Principal::project("p").unwrap(),
                String::new(),
                self.stop.subscribe(),
            )
            .await?,
            headers: vec![],
        }))
    }
    async fn authorize(
        &self,
        _: &[(String, String)],
    ) -> appcall_api::Result<appcall_api::Identity> {
        Err(appcall_api::ApiError::new("UNAUTHORIZED"))
    }
    async fn ready(&self) -> appcall_api::Result<()> {
        Ok(())
    }
    async fn connections(
        &self,
        _: &appcall_api::Identity,
    ) -> appcall_api::Result<Vec<appcall_store::Connection>> {
        Ok(vec![])
    }
    async fn platform_connectors(
        &self,
        _: &appcall_api::Identity,
    ) -> appcall_api::Result<Vec<String>> {
        Ok(vec![])
    }
    async fn connection(
        &self,
        _: &appcall_api::Identity,
        _: &str,
    ) -> appcall_api::Result<appcall_store::Connection> {
        Err(appcall_api::ApiError::new("CONNECTION_NOT_FOUND"))
    }
    async fn test_connection(
        &self,
        i: &appcall_api::Identity,
        id: &str,
    ) -> appcall_api::Result<appcall_store::Connection> {
        self.connection(i, id).await
    }
    async fn disconnect(&self, _: &appcall_api::Identity, _: &str) -> appcall_api::Result<()> {
        Err(appcall_api::ApiError::new("CONNECTION_NOT_FOUND"))
    }
    async fn execute(
        &self,
        _: appcall_actions::ExecuteRequest,
    ) -> appcall_api::Result<appcall_actions::ExecuteResult> {
        panic!("retirement must not execute an action")
    }
}
fn retiring_events(schema: &str, pids: &std::sync::Mutex<Vec<i32>>) -> RetiringEvents {
    let mut events = connect(schema);
    let mut store = connect(schema);
    for client in [&mut events, &mut store] {
        pids.lock().unwrap().push(
            client
                .query_one("SELECT pg_backend_pid()", &[])
                .unwrap()
                .get(0),
        );
    }
    RetiringEvents {
        events: EventRoutes::new(
            events,
            Store::new(store, LocalProvider::new(&[7; 32]).unwrap()),
            appcall_runner_client::RunnerClient::new(
                "http://127.0.0.1:1",
                "synthetic",
                Default::default(),
            )
            .unwrap(),
            None,
        ),
        healthy: Arc::new(std::sync::atomic::AtomicBool::new(true)),
        stop: tokio::sync::watch::channel(false).0,
    }
}
