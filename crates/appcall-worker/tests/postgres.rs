use appcall_worker::*;
use postgres::{Client, NoTls};
use serde_json::{json, Value};
use std::{
    io::{Read, Write},
    sync::{Arc, Mutex},
    time::Duration,
};
fn client(schema: Option<&str>) -> Client {
    let mut c = Client::connect(
        &std::env::var("APPCALL_ENGINE_POSTGRES_URL")
            .expect("explicit test PostgreSQL URL required"),
        NoTls,
    )
    .unwrap();
    if let Some(schema) = schema {
        c.batch_execute(&format!("SET search_path TO {schema}"))
            .unwrap();
    }
    c
}
static FIXTURE_ID: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
fn fixture() -> (Client, String) {
    let mut db = client(None);
    let schema = format!(
        "worker_test_{}_{}_{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos(),
        FIXTURE_ID.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
    );
    db.batch_execute(&format!(
        "CREATE SCHEMA {schema}; SET search_path TO {schema}"
    ))
    .unwrap();
    for migration in [
        include_str!("../../../migrations/202605140001_init.sql"),
        include_str!("../../../migrations/202605290001_connections_ownership.sql"),
        include_str!("../../../migrations/202605290003_usage_brand_dim.sql"),
        include_str!("../../../migrations/202605290004_connections_owner_check.sql"),
        include_str!("../../../migrations/202609040001_sync_job_terminal_failure.sql"),
        include_str!("../../../migrations/202609070001_event_outbox.sql"),
        include_str!("../../../migrations/202609070002_sync_recovery.sql"),
        include_str!("../../../migrations/202609070004_oauth_refresh_intents.sql"),
    ] {
        db.batch_execute(migration).unwrap();
    }
    db.batch_execute("INSERT INTO projects(id,name) VALUES('p','p');INSERT INTO connections(id,project_id,connector,auth_type,status,credential_owner,external_account_id) VALUES('c','p','slack','api_key','active','brand','brand')").unwrap();
    (db, schema)
}
#[test]
#[ignore = "requires explicit PostgreSQL and local HTTP"]
fn accepted_event_reaches_runner_and_atomic_records() {
    run_event(0);
}
#[test]
#[ignore = "requires explicit PostgreSQL and local HTTP"]
fn disconnected_connection_rejects_late_provider_page() {
    run_event(1);
}
#[test]
#[ignore = "requires explicit PostgreSQL and local HTTP"]
fn managed_refresh_commits_using_activated_credential_snapshot() {
    run_event(2);
}
#[test]
#[ignore = "requires explicit PostgreSQL and local HTTP"]
fn reconnect_after_managed_refresh_rejects_late_page() {
    run_event(3);
}
struct RefreshProvider(Arc<std::sync::atomic::AtomicUsize>);
impl appcall_oauth::TokenProvider for RefreshProvider {
    fn refresh(
        &self,
        _: &appcall_connectors::OAuthConfig,
        _: &appcall_oauth::AppCredentials,
        refresh: &str,
        _: i64,
    ) -> appcall_oauth::Result<appcall_oauth::TokenSet> {
        assert_eq!(refresh, "expired-refresh");
        self.0.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        appcall_oauth::TokenSet::decode(br#"{"accessToken":"managed-fresh","refreshToken":"rotated-refresh","expiresAt":"2099-01-01T00:00:00Z"}"#)
    }
    fn exchange(
        &self,
        _: &appcall_connectors::OAuthConfig,
        _: &appcall_oauth::AppCredentials,
        _: &str,
        _: &str,
        _: i64,
    ) -> appcall_oauth::Result<appcall_oauth::TokenSet> {
        panic!("unexpected exchange")
    }
}
#[test]
#[ignore = "requires explicit PostgreSQL and local HTTP"]
fn maximum_provider_event_id_reaches_durable_sync() {
    run_event(4);
}
fn run_event(mode: u8) {
    let disconnect = mode == 1 || mode == 3;
    let managed = mode == 2 || mode == 3;
    let (mut db, schema) = fixture();
    let claims = appcall_auth::WebhookClaims {
        project_id: "p".into(),
        connection_id: "c".into(),
        connector: "slack".into(),
    };
    let parsed = appcall_events::ParsedWebhook {
        idempotency_key: if mode == 4 {
            "e".repeat(1024)
        } else {
            "provider-event".into()
        },
        operation: "messages.list".into(),
        sanitized: json!({"channel":"C123"}),
    };
    let accepted = appcall_events::PgEvents::new(&mut db)
        .accept(&claims, &parsed)
        .unwrap();
    // A failing usage write must roll back sync scheduling and outbox completion together.
    db.batch_execute(
        "ALTER TABLE usage_monthly_rollups ADD CONSTRAINT fail_usage CHECK(quantity=0)",
    )
    .unwrap();
    let report = appcall_events::PgEvents::new(&mut db)
        .dispatch_pending(1, &mut SyncDispatchSink)
        .unwrap();
    assert_eq!(report.failed, 1);
    assert_eq!(
        db.query_one("SELECT count(*) FROM sync_jobs", &[])
            .unwrap()
            .get::<_, i64>(0),
        0
    );
    assert!(db
        .query_one("SELECT dispatched_at IS NULL FROM webhook_outbox", &[])
        .unwrap()
        .get::<_, bool>(0));
    db.batch_execute("ALTER TABLE usage_monthly_rollups DROP CONSTRAINT fail_usage;UPDATE webhook_outbox SET next_attempt_at=now()").unwrap();
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let captured = Arc::new(Mutex::new(None));
    let saved = captured.clone();
    let server_schema = schema.clone();
    let server = std::thread::spawn(move || {
        let (mut socket, _) = listener.accept().unwrap();
        socket
            .set_read_timeout(Some(Duration::from_secs(5)))
            .unwrap();
        let mut data = Vec::new();
        let request = loop {
            let mut b = [0; 1024];
            let n = socket.read(&mut b).unwrap();
            assert!(n > 0);
            data.extend_from_slice(&b[..n]);
            if let Some(end) = data.windows(4).position(|w| w == b"\r\n\r\n") {
                let headers = String::from_utf8_lossy(&data[..end]);
                let len: usize = headers
                    .lines()
                    .find_map(|line| {
                        line.to_lowercase()
                            .strip_prefix("content-length:")
                            .map(|v| v.trim().parse().unwrap())
                    })
                    .unwrap();
                if data.len() >= end + 4 + len {
                    break serde_json::from_slice::<Value>(&data[end + 4..end + 4 + len]).unwrap();
                }
            }
        };
        *saved.lock().unwrap() = Some(request.clone());
        if mode == 1 {
            client(Some(&server_schema))
                .batch_execute("UPDATE connections SET status='disconnected' WHERE id='c'")
                .unwrap();
        }
        if mode == 3 {
            let mut store = appcall_store::Store::new(
                client(Some(&server_schema)),
                appcall_store::LocalProvider::new(&[1; 32]).unwrap(),
            );
            store
                .store_secret(
                    "p",
                    "reconnected-bundle",
                    "api_key",
                    br#"{"accessToken":"different-account"}"#,
                )
                .unwrap();
            store
                .replace_credentials(
                    &appcall_store::Scope::new("p", Some("brand")).unwrap(),
                    "c",
                    "reconnected-bundle",
                    appcall_store::AuthType::ApiKey,
                )
                .unwrap();
        }
        let reply=json!({"id":request["id"],"ok":true,"result":{"output":{"items":[{"id":"message","provider":"slack","providerMessageId":"ts","channelId":"C123","senderId":"U1","text":"hello","modelVersion":"2026-05-14","raw":{}}]}}}).to_string();
        write!(
            socket,
            "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            reply.len(),
            reply
        )
        .unwrap();
    });
    let registry = appcall_connectors::Registry::load("../../runner/connectors").unwrap();
    let mut manifest = registry.connector("slack").unwrap().raw_manifest().clone();
    manifest["auth"]["oauth"]["supportsRefresh"] = json!(true);
    let registry =
        appcall_connectors::Registry::from_connectors([appcall_connectors::Connector::from_bytes(
            &serde_json::to_vec(&manifest).unwrap(),
        )
        .unwrap()])
        .unwrap();
    let runner =
        appcall_runner_client::RunnerClient::new(&url, "runner-token", Default::default()).unwrap();
    let store = appcall_store::Store::new(
        client(Some(&schema)),
        appcall_store::LocalProvider::new(&[1; 32]).unwrap(),
    );
    let mut vault = appcall_store::Store::new(
        client(Some(&schema)),
        appcall_store::LocalProvider::new(&[1; 32]).unwrap(),
    );
    vault
        .store_secret(
            "p",
            "fixture-bundle",
            if managed {"oauth_tokens_c"}else{"api_key"},
            if managed {br#"{"accessToken":"expired-access","refreshToken":"expired-refresh","expiresAt":"2020-01-01T00:00:00Z"}"#}else{br#"{"accessToken":"fixture-secret"}"#},
        )
        .unwrap();
    vault
        .set_secret_ref(
            &appcall_store::Scope::new("p", Some("brand")).unwrap(),
            "c",
            "fixture-bundle",
        )
        .unwrap();
    if managed {
        db.batch_execute("UPDATE connections SET auth_type='oauth2' WHERE id='c'")
            .unwrap();
    }
    let refreshes = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let apps = std::collections::BTreeMap::from([(
        "slack".into(),
        appcall_oauth::AppCredentials {
            client_id: "fixture".into(),
            client_secret: "fixture".into(),
            redirect_uri: "https://example.com/callback".into(),
        },
    )]);
    let lifecycle = appcall_oauth::Lifecycle::new(
        Arc::new(Mutex::new(vault)),
        Arc::new(registry.clone()),
        apps,
        appcall_oauth::StateSigner::new(&[3; 32]).unwrap(),
        Arc::new(RefreshProvider(refreshes.clone())),
    );
    let credentials =
        LifecycleCredentials::new(Arc::new(lifecycle), 1, Duration::from_secs(5)).unwrap();
    let service = appcall_sync::Service::new(
        appcall_sync::Repository::new(client(Some(&schema))),
        store,
        registry,
        runner,
        credentials,
        Default::default(),
    )
    .unwrap();
    let worker = Worker::new(
        client(Some(&schema)),
        service,
        TickLimits { outbox: 1, jobs: 1 },
    )
    .unwrap();
    let rt = tokio::runtime::Runtime::new().unwrap();
    let report = rt.block_on(worker.tick("worker")).unwrap();
    assert_eq!(report.outbox_completed, 1);
    assert_eq!(
        refreshes.load(std::sync::atomic::Ordering::SeqCst),
        usize::from(managed)
    );
    assert_eq!(report.pages_completed, usize::from(!disconnect));
    if disconnect {
        assert_eq!(report.job_failures[0].1, appcall_sync::Error::Unavailable);
        server.join().unwrap();
        for table in ["synced_messages", "sync_job_checkpoints"] {
            assert_eq!(
                db.query_one(&format!("SELECT count(*) FROM {table}"), &[])
                    .unwrap()
                    .get::<_, i64>(0),
                0
            );
        }
        assert_eq!(
            db.query_one(
                "SELECT sum(quantity)::bigint FROM usage_monthly_rollups",
                &[]
            )
            .unwrap()
            .get::<_, i64>(0),
            1
        );
        drop(worker);
        drop(rt);
        db.batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
            .unwrap();
        return;
    }
    assert!(report.job_failures.is_empty());
    server.join().unwrap();
    let body = captured.lock().unwrap().clone().unwrap();
    assert_eq!(body["params"]["input"]["channelId"], "C123");
    assert_eq!(
        body["params"]["input"]["accessToken"],
        if managed {
            "managed-fresh"
        } else {
            "fixture-secret"
        }
    );
    assert_eq!(body["method"], "connector.sync.list");
    let row = db
        .query_one("SELECT id,input,status FROM sync_jobs", &[])
        .unwrap();
    assert_eq!(
        row.get::<_, String>(0),
        sync_job_id("p", &format!("webhook:{}", accepted.event_id))
    );
    assert_eq!(
        db.query_one("SELECT dedup_key FROM sync_jobs", &[])
            .unwrap()
            .get::<_, String>(0),
        format!("webhook:{}", accepted.event_id)
    );
    assert_eq!(row.get::<_, Value>(1), json!({"channelId":"C123"}));
    assert_eq!(row.get::<_, String>(2), "succeeded");
    assert_eq!(
        db.query_one("SELECT text FROM synced_messages", &[])
            .unwrap()
            .get::<_, String>(0),
        "hello"
    );
    assert_eq!(
        db.query_one(
            "SELECT sum(quantity)::bigint FROM usage_monthly_rollups",
            &[]
        )
        .unwrap()
        .get::<_, i64>(0),
        2
    );
    assert_eq!(
        rt.block_on(worker.tick("worker")).unwrap().pages_completed,
        0
    );
    appcall_sync::enqueue(
        &mut db,
        &appcall_sync::ScheduleRequest {
            id: "after-stop".into(),
            project_id: "p".into(),
            connection_id: "c".into(),
            operation: "messages.list".into(),
            dedup_key: "after-stop".into(),
            input: json!({"channelId":"C123"}),
        },
    )
    .unwrap();
    worker.request_shutdown();
    assert_eq!(
        rt.block_on(worker.tick_jobs("worker"))
            .unwrap()
            .pages_completed,
        0
    );
    assert_eq!(
        db.query_one("SELECT status FROM sync_jobs WHERE id='after-stop'", &[])
            .unwrap()
            .get::<_, String>(0),
        "pending"
    );
    drop(worker);
    drop(rt);
    db.batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
        .unwrap();
}
