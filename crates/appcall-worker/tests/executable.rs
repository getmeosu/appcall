use std::{
    io::{Read, Write},
    process::{Command, Stdio},
    time::{Duration, Instant},
};
#[test]
fn invalid_worker_configuration_exits_nonzero_without_secrets() {
    let out = Command::new(env!("CARGO_BIN_EXE_appcall-worker"))
        .env_clear()
        .envs(std::env::var_os("LLVM_PROFILE_FILE").map(|value| ("LLVM_PROFILE_FILE", value)))
        .env(
            "APPCALL_DATABASE_URL",
            "postgres://secret-password@localhost/db",
        )
        .output()
        .unwrap();
    assert!(!out.status.success());
    let text = String::from_utf8_lossy(&out.stdout);
    assert!(text.contains("worker_failed"));
    assert!(!text.contains("secret-password"));
}
#[test]
#[ignore = "requires explicit PostgreSQL and local HTTP subprocess sockets"]
fn daemon_health_and_sigterm_drain_and_oneshot_exit() {
    let database =
        std::env::var("APPCALL_ENGINE_POSTGRES_URL").expect("explicit database URL required");
    let mut db = postgres::Client::connect(&database, postgres::NoTls).unwrap();
    let schema = format!(
        "worker_exec_{}_{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    );
    db.batch_execute(&format!(
        "CREATE SCHEMA {schema};SET search_path TO {schema}"
    ))
    .unwrap();
    let database = format!(
        "{database}{}options=-csearch_path%3D{schema}",
        if database.contains('?') { "&" } else { "?" }
    );
    appcall_runtime::SqlxMigration::new(
        concat!(env!("CARGO_MANIFEST_DIR"), "/../../migrations"),
        &database,
        Duration::from_secs(30),
    )
    .unwrap()
    .apply()
    .unwrap();
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let runner = format!("http://{}", listener.local_addr().unwrap());
    let (started_tx, started_rx) = std::sync::mpsc::channel();
    let (release_tx, release_rx) = std::sync::mpsc::channel();
    let server = std::thread::spawn(move || {
        let mut call = 0;
        'connections: while call < 4 {
            let (mut socket, _) = listener.accept().unwrap();
            socket.set_nonblocking(false).unwrap();
            socket
                .set_read_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            let mut data = Vec::new();
            let request = loop {
                let mut b = [0; 1024];
                let n = match socket.read(&mut b) {
                    Ok(0) if data.is_empty() => continue 'connections,
                    Err(error)
                        if data.is_empty()
                            && matches!(
                                error.kind(),
                                std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut
                            ) =>
                    {
                        continue 'connections
                    }
                    result => result.expect("incomplete runner HTTP request"),
                };
                assert!(n > 0);
                data.extend_from_slice(&b[..n]);
                if let Some(end) = data.windows(4).position(|b| b == b"\r\n\r\n") {
                    let headers = String::from_utf8_lossy(&data[..end]);
                    let len: usize = headers
                        .lines()
                        .find_map(|l| {
                            l.to_lowercase()
                                .strip_prefix("content-length:")
                                .map(|n| n.trim().parse().unwrap())
                        })
                        .unwrap();
                    if data.len() >= end + 4 + len {
                        break serde_json::from_slice::<serde_json::Value>(
                            &data[end + 4..end + 4 + len],
                        )
                        .unwrap();
                    }
                }
            };
            let result = if call == 0 || call == 2 {
                assert_eq!(request["method"], "runner.describe");
                serde_json::json!({"protocolVersion":"2026-05-14","runner":"fixture","durableCapabilities":["absolute-deadline","bounded-rpc","cancellation"]})
            } else {
                assert_eq!(request["method"], "connector.sync.list");
                if call == 1 {
                    started_tx.send(()).unwrap();
                    release_rx.recv_timeout(Duration::from_secs(5)).unwrap();
                }
                assert_eq!(request["params"]["input"]["accessToken"], "exec-fixture");
                serde_json::json!({"output":{"items":[{"id":"m","provider":"slack","providerMessageId":"1","channelId":"C123","senderId":"U1","modelVersion":"2026-05-14","text":"executable","raw":{}}]}})
            };
            let body =
                serde_json::json!({"id":request["id"],"ok":true,"result":result}).to_string();
            write!(
                socket,
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            )
            .unwrap();
            call += 1;
        }
    });
    let health = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let address = health.local_addr().unwrap();
    drop(health);
    let mut command = Command::new(env!("CARGO_BIN_EXE_appcall-worker"));
    command
        .env_clear()
        .envs(std::env::var_os("LLVM_PROFILE_FILE").map(|value| ("LLVM_PROFILE_FILE", value)))
        .env("APPCALL_DATABASE_URL", &database)
        .env("APPCALL_SECRET_KEY", "ab".repeat(32))
        .env("APPCALL_OAUTH_STATE_SECRET", "cd".repeat(32))
        .env("APPCALL_CONNECTOR_DIR", "../../runner/connectors")
        .env("APPCALL_RUNNER_URL", &runner)
        .env("APPCALL_WORKER_HTTP_ADDR", address.to_string())
        .env("APPCALL_WORKER_INTERVAL_MS", "50")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut daemon = command.spawn().unwrap();
    let until = Instant::now() + Duration::from_secs(10);
    loop {
        assert!(
            daemon.try_wait().unwrap().is_none(),
            "daemon exited before ready"
        );
        if let Ok(mut socket) = std::net::TcpStream::connect(address) {
            socket
                .set_read_timeout(Some(Duration::from_secs(1)))
                .unwrap();
            socket
                .write_all(b"GET /readyz HTTP/1.1\r\nHost: local\r\n\r\n")
                .unwrap();
            let mut reply = String::new();
            socket.read_to_string(&mut reply).unwrap();
            if reply.starts_with("HTTP/1.1 200") {
                break;
            }
        }
        assert!(Instant::now() < until, "health did not become ready");
        std::thread::sleep(Duration::from_millis(20));
    }
    db.batch_execute("INSERT INTO projects(id,name) VALUES('p','p');INSERT INTO connections(id,project_id,connector,auth_type,status,credential_owner,external_account_id) VALUES('c','p','slack','api_key','active','brand','brand')").unwrap();
    let mut vault =
        appcall_store::Store::new(db, appcall_store::LocalProvider::new(&[0xab; 32]).unwrap());
    vault
        .store_secret(
            "p",
            "exec-secret",
            "api_key",
            br#"{"accessToken":"exec-fixture"}"#,
        )
        .unwrap();
    vault
        .set_secret_ref(
            &appcall_store::Scope::new("p", Some("brand")).unwrap(),
            "c",
            "exec-secret",
        )
        .unwrap();
    let mut db = vault.into_client();
    appcall_events::PgEvents::new(&mut db)
        .accept(
            &appcall_auth::WebhookClaims {
                project_id: "p".into(),
                connection_id: "c".into(),
                connector: "slack".into(),
            },
            &appcall_events::ParsedWebhook {
                idempotency_key: "daemon-event".into(),
                operation: "messages.list".into(),
                sanitized: serde_json::json!({"channel":"C123"}),
            },
        )
        .unwrap();
    started_rx.recv_timeout(Duration::from_secs(5)).unwrap();
    assert!(Command::new("kill")
        .args(["-TERM", &daemon.id().to_string()])
        .status()
        .unwrap()
        .success());
    std::thread::sleep(Duration::from_millis(100));
    assert!(
        daemon.try_wait().unwrap().is_none(),
        "active page was not drained"
    );
    release_tx.send(()).unwrap();
    let until = Instant::now() + Duration::from_secs(5);
    loop {
        if let Some(status) = daemon.try_wait().unwrap() {
            assert!(status.success());
            break;
        }
        assert!(Instant::now() < until, "daemon did not drain");
        std::thread::sleep(Duration::from_millis(20));
    }
    appcall_events::PgEvents::new(&mut db)
        .accept(
            &appcall_auth::WebhookClaims {
                project_id: "p".into(),
                connection_id: "c".into(),
                connector: "slack".into(),
            },
            &appcall_events::ParsedWebhook {
                idempotency_key: "exec-event".into(),
                operation: "messages.list".into(),
                sanitized: serde_json::json!({"channel":"C123"}),
            },
        )
        .unwrap();
    let output = command
        .env("APPCALL_WORKER_MAX_JOBS", "1")
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stdout)
    );
    assert!(String::from_utf8_lossy(&output.stdout).contains("worker_cycle_completed"));
    server.join().unwrap();
    assert_eq!(
        db.query_one("SELECT text FROM synced_messages", &[])
            .unwrap()
            .get::<_, String>(0),
        "executable"
    );
    assert_eq!(
        db.query_one("SELECT min(status) FROM sync_jobs", &[])
            .unwrap()
            .get::<_, String>(0),
        "succeeded"
    );
    db.batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
        .unwrap();
}
