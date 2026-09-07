use std::{
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    process::{Child, Command, Stdio},
    time::{Duration, Instant},
};
struct Process(Child);
impl Drop for Process {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

#[test]
#[ignore = "requires isolated APPCALL_ENGINE_POSTGRES_URL and local TCP sockets"]
fn qualification_binary_reads_existing_go_schema_and_preserves_api_key_boundary() {
    check_host(true, false);
}
#[test]
#[ignore = "requires isolated APPCALL_ENGINE_POSTGRES_URL and local TCP sockets"]
fn rust_application_host_serves_authenticated_mcp_without_qualification_mode() {
    check_host(false, false);
}
#[test]
#[ignore = "requires isolated PostgreSQL and local sockets"]
fn production_configuration_runs_rust_host_with_required_identity_boundaries() {
    check_host(false, true);
}
fn check_host(qualification: bool, production: bool) {
    let database = std::env::var("APPCALL_ENGINE_POSTGRES_URL").unwrap();
    let mut admin = postgres::Client::connect(&database, postgres::NoTls).unwrap();
    let schema = format!("api_host_{}", uuid::Uuid::new_v4().simple());
    admin
        .batch_execute(&format!(
            "CREATE SCHEMA {schema}; SET search_path TO {schema}"
        ))
        .unwrap();
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    drop(listener);
    let mut url = url::Url::parse(&database).unwrap();
    url.query_pairs_mut()
        .append_pair("options", &format!("-csearch_path={schema}"));
    appcall_runtime::SqlxMigration::new(
        concat!(env!("CARGO_MANIFEST_DIR"), "/../../migrations"),
        url.as_str(),
        Duration::from_secs(30),
    )
    .unwrap()
    .apply()
    .unwrap();
    admin.batch_execute("INSERT INTO projects(id,name) VALUES('p','fixture'); INSERT INTO api_keys(id,project_id,key_hash) VALUES('k','p','2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'); INSERT INTO connections(id,project_id,connector,auth_type,status,credential_owner) VALUES('c','p','slack','api_key','active','platform')").unwrap();
    let mut process = Process(
        Command::new(env!("CARGO_BIN_EXE_appcall-api"))
            .env(
                "APPCALL_DEV_API_KEY",
                "synthetic-platform-bootstrap-key-123456",
            )
            .env(
                "APPCALL_RUST_QUALIFICATION",
                if qualification { "1" } else { "0" },
            )
            .env(
                "APPCALL_ENV",
                if production {
                    "production"
                } else {
                    "development"
                },
            )
            .env(
                "APPCALL_SESSION_SECRET",
                "synthetic-session-key-01234567890",
            )
            .env(
                "APPCALL_SESSION_COOKIE_SECURE",
                if production { "true" } else { "false" },
            )
            .env(
                "ANUSA_JWT_ACCESS_SECRET",
                "synthetic-jwt-key-0123456789012345",
            )
            .env("ANUSA_DATABASE_URL", url.as_str())
            .env("ANUSA_API_URL", "http://127.0.0.1:1")
            .env(
                "APPCALL_PUBLIC_BASE_URL",
                if production {
                    "https://app.fixture.invalid"
                } else {
                    "http://127.0.0.1:5080"
                },
            )
            .env(
                "APPCALL_WEBHOOK_SIGNING_SECRET",
                "synthetic-webhook-key-01234567890",
            )
            .env("APPCALL_SECRET_KEY", "01".repeat(32))
            .env("APPCALL_DATABASE_URL", url.as_str())
            .env("APPCALL_VAULT_MASTER_KEY", "01".repeat(32))
            .env(
                "APPCALL_OAUTH_STATE_KEY",
                "01234567890123456789012345678901",
            )
            .env("APPCALL_RUNNER_URL", "http://127.0.0.1:1")
            .env("APPCALL_RUNNER_TOKEN", "synthetic-fixture")
            .env(
                "APPCALL_RUST_LISTEN",
                if qualification {
                    address.to_string()
                } else {
                    format!(":{}", address.port())
                },
            )
            .env(
                "APPCALL_CONNECTOR_DIR",
                concat!(env!("CARGO_MANIFEST_DIR"), "/../../runner/connectors"),
            )
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .unwrap(),
    );
    let start = Instant::now();
    loop {
        if TcpStream::connect(address).is_ok() {
            break;
        }
        assert!(
            process.0.try_wait().unwrap().is_none(),
            "host exited before ready"
        );
        assert!(start.elapsed() < Duration::from_secs(10));
        std::thread::sleep(Duration::from_millis(20));
    }
    assert!(admin
        .query_one("SELECT bool_and(success) FROM _sqlx_migrations", &[])
        .unwrap()
        .get::<_, bool>(0));
    let request = |key: &str| {
        let mut socket = TcpStream::connect(address).unwrap();
        socket
            .set_read_timeout(Some(Duration::from_secs(3)))
            .unwrap();
        socket.write_all(format!("GET /v1/connections/c HTTP/1.1\r\nHost: localhost\r\nX-API-Key: {key}\r\nConnection: close\r\n\r\n").as_bytes()).unwrap();
        let mut output = String::new();
        socket.read_to_string(&mut output).unwrap();
        output
    };
    let good = request("hello");
    assert!(good.starts_with("HTTP/1.1 200"), "{good}");
    let body: serde_json::Value =
        serde_json::from_str(good.split("\r\n\r\n").nth(1).unwrap()).unwrap();
    assert_eq!(body["id"], "c");
    assert!(body.get("secretRefId").is_none());
    assert!(body.get("projectId").is_none());
    assert!(request("wrong").starts_with("HTTP/1.1 401"));
    if !qualification {
        // Trusted platform configuration authenticates only proj_dev, while the
        // persisted key above retains access to p. Cross-project c is invisible.
        let platform = request("synthetic-platform-bootstrap-key-123456");
        assert!(platform.starts_with("HTTP/1.1 404"), "{platform}");
        assert_eq!(
            admin
                .query_one("SELECT count(*) FROM projects WHERE id='proj_dev'", &[])
                .unwrap()
                .get::<_, i64>(0),
            1
        );
        assert_eq!(
            admin
                .query_one("SELECT count(*) FROM api_keys", &[])
                .unwrap()
                .get::<_, i64>(0),
            1
        );
        let mut socket = TcpStream::connect(address).unwrap();
        socket
            .set_read_timeout(Some(Duration::from_secs(3)))
            .unwrap();
        let payload = r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}"#;
        socket.write_all(format!("POST /v1/mcp HTTP/1.1\r\nHost: localhost\r\nX-API-Key: hello\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{payload}", payload.len()).as_bytes()).unwrap();
        let mut reply = String::new();
        socket.read_to_string(&mut reply).unwrap();
        assert!(reply.starts_with("HTTP/1.1 200"), "{reply}");
        assert!(reply.contains("2025-06-18"), "{reply}");
        let exchange = |request: &str| {
            let mut socket = TcpStream::connect(address).unwrap();
            socket
                .set_read_timeout(Some(Duration::from_secs(2)))
                .unwrap();
            socket.write_all(request.as_bytes()).unwrap();
            let mut reply = String::new();
            // Protected requests must reject before reading an advertised body.
            let mut bytes = [0; 2048];
            let n = socket.read(&mut bytes).unwrap();
            reply.push_str(std::str::from_utf8(&bytes[..n]).unwrap());
            reply
        };
        assert!(exchange(
            "POST /v1/mcp HTTP/1.1\r\nHost: localhost\r\nContent-Length: 1000\r\n\r\n"
        )
        .starts_with("HTTP/1.1 401"));
        assert!(exchange("GET /v1/connectors/slack/setup/oauth/callback HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n").starts_with("HTTP/1.1 400"));
        assert!(exchange("GET /v1/connectors/slack/setup/oauth/callback HTTP/1.1\r\nHost: localhost\r\nX-API-Key: wrong\r\nConnection: close\r\n\r\n").starts_with("HTTP/1.1 401"));
        let mut stream = TcpStream::connect(address).unwrap();
        stream
            .set_read_timeout(Some(Duration::from_secs(5)))
            .unwrap();
        stream
            .write_all(b"GET /v1/events HTTP/1.1\r\nHost: localhost\r\nX-API-Key: hello\r\n\r\n")
            .unwrap();
        let mut buffer = [0; 4096];
        let n = stream.read(&mut buffer).unwrap();
        assert!(std::str::from_utf8(&buffer[..n])
            .unwrap()
            .starts_with("HTTP/1.1 200"));
        // Insert after streaming headers: this must arrive through a subsequent
        // durable poll, not a buffered one-time response.
        admin.execute("INSERT INTO webhook_events(id,project_id,connection_id,connector,payload) VALUES('live_fixture','p','c','slack','{}')",&[]).unwrap();
        let until = Instant::now();
        let mut frames = String::new();
        while !frames.contains("live_fixture") {
            let n = stream.read(&mut buffer).unwrap();
            assert!(n > 0, "event stream closed before live event");
            frames.push_str(std::str::from_utf8(&buffer[..n]).unwrap());
            assert!(until.elapsed() < Duration::from_secs(6), "{frames}");
        }
        assert!(frames.contains("event: webhook_event"), "{frames}");
        drop(stream);
    }
    // Exercise graceful shutdown, including synchronous PostgreSQL and OAuth
    // client destruction outside the async runtime. Drop remains a panic guard.
    assert!(Command::new("kill")
        .args([
            if qualification { "-INT" } else { "-TERM" },
            &process.0.id().to_string()
        ])
        .status()
        .unwrap()
        .success());
    let shutdown = Instant::now();
    loop {
        if let Some(status) = process.0.try_wait().unwrap() {
            assert!(status.success(), "host shutdown failed");
            break;
        }
        assert!(
            shutdown.elapsed() < Duration::from_secs(5),
            "host did not stop"
        );
        std::thread::sleep(Duration::from_millis(20));
    }
    drop(process);
    admin
        .batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
        .unwrap();
}

#[test]
fn failed_migration_prevents_api_startup_without_disclosing_database_credentials() {
    // A closed local port exercises the real migration connection failure.
    let reserved = TcpListener::bind("127.0.0.1:0").unwrap();
    let database_address = reserved.local_addr().unwrap();
    drop(reserved);
    let listen = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listen.local_addr().unwrap();
    drop(listen);
    let secret = "private-database-password";
    let database = format!("postgres://synthetic:{secret}@{database_address}/unreachable");
    let out = Command::new(env!("CARGO_BIN_EXE_appcall-api"))
        .env_clear()
        .envs(std::env::var_os("LLVM_PROFILE_FILE").map(|value| ("LLVM_PROFILE_FILE", value)))
        .env("APPCALL_ENV", "development")
        .env("APPCALL_DATABASE_URL", &database)
        .env("APPCALL_RUST_LISTEN", address.to_string())
        .env("APPCALL_RUNNER_URL", "http://127.0.0.1:1")
        .env("APPCALL_SECRET_KEY", "01".repeat(32))
        .output()
        .unwrap();
    assert!(!out.status.success());
    let stderr = String::from_utf8_lossy(&out.stderr);
    assert!(stderr.contains("rust_api_startup_failed"), "{stderr}");
    assert!(!stderr.contains(secret));
    assert!(!stderr.contains(&database));
    assert!(!String::from_utf8_lossy(&out.stdout).contains(secret));
    assert!(TcpStream::connect(address).is_err());
}
