//! Actual process qualification of PostgreSQL development mode without Anusa.
use std::{
    io::{Read, Write},
    net::{SocketAddr, TcpListener, TcpStream},
    process::{Child, Command, Stdio},
    time::{Duration, Instant},
};
struct Fixture {
    db: postgres::Client,
    schema: String,
    url: String,
    process: Option<Child>,
    address: SocketAddr,
}
impl Fixture {
    fn new() -> Self {
        let raw = std::env::var("APPCALL_ENGINE_POSTGRES_URL").unwrap();
        let mut db = postgres::Client::connect(&raw, postgres::NoTls).unwrap();
        let schema = format!("browser_development_{}", uuid::Uuid::new_v4().simple());
        db.batch_execute(&format!(
            "CREATE SCHEMA {schema}; SET search_path TO {schema}"
        ))
        .unwrap();
        let mut url = url::Url::parse(&raw).unwrap();
        url.query_pairs_mut()
            .append_pair("options", &format!("-csearch_path={schema}"));
        let address = TcpListener::bind("127.0.0.1:0")
            .unwrap()
            .local_addr()
            .unwrap();
        Self {
            db,
            schema,
            url: url.into(),
            process: None,
            address,
        }
    }
    fn start(&mut self, extra: &[(&str, &str)], should_start: bool) {
        let mut cmd = Command::new(env!("CARGO_BIN_EXE_appcall-api"));
        cmd.env_clear()
            .envs(std::env::var_os("LLVM_PROFILE_FILE").map(|value| ("LLVM_PROFILE_FILE", value)))
            .env("APPCALL_ENV", "development")
            .env("APPCALL_DATABASE_URL", &self.url)
            .env("APPCALL_SECRET_KEY", "01".repeat(32))
            .env("APPCALL_DEV_API_KEY", "synthetic-development-platform-key")
            .env("APPCALL_RUNNER_URL", "http://127.0.0.1:1")
            .env("APPCALL_RUST_LISTEN", self.address.to_string())
            .env(
                "APPCALL_PUBLIC_BASE_URL",
                format!("http://{}", self.address),
            )
            .env(
                "APPCALL_CONNECTOR_DIR",
                concat!(env!("CARGO_MANIFEST_DIR"), "/../../runner/connectors"),
            )
            .stdout(Stdio::null())
            .stderr(Stdio::piped());
        for (k, v) in extra {
            cmd.env(k, v);
        }
        self.process = Some(cmd.spawn().unwrap());
        let end = Instant::now() + Duration::from_secs(20);
        loop {
            if let Some(status) = self.process.as_mut().unwrap().try_wait().unwrap() {
                let mut logs = String::new();
                self.process
                    .as_mut()
                    .unwrap()
                    .stderr
                    .take()
                    .unwrap()
                    .read_to_string(&mut logs)
                    .unwrap();
                assert!(!should_start, "startup failed {status}: {logs}");
                assert!(!status.success());
                return;
            }
            if TcpStream::connect(self.address).is_ok() {
                assert!(should_start);
                return;
            }
            assert!(Instant::now() < end, "startup timed out");
            std::thread::sleep(Duration::from_millis(25));
        }
    }
    fn stop(&mut self) {
        if let Some(mut p) = self.process.take() {
            let _ = p.kill();
            let _ = p.wait();
        }
    }
    fn request(&self, method: &str, path: &str, host: &str, origin: &str, body: &str) -> String {
        let mut socket = TcpStream::connect(self.address).unwrap();
        socket
            .set_read_timeout(Some(Duration::from_secs(5)))
            .unwrap();
        write!(socket,"{method} {path} HTTP/1.1\r\nHost: {host}\r\nOrigin: {origin}\r\nContent-Type: application/x-www-form-urlencoded\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",body.len()).unwrap();
        let mut response = String::new();
        socket.read_to_string(&mut response).unwrap();
        response
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        self.stop();
        let _ = self
            .db
            .batch_execute(&format!("DROP SCHEMA {} CASCADE", self.schema));
    }
}
#[test]
#[ignore = "requires isolated local PostgreSQL and actual application binary"]
fn postgres_developer_dashboard_without_anusa_and_fail_closed_configuration() {
    let mut f = Fixture::new();
    f.start(&[], true);
    assert!(f
        .db
        .query_one("SELECT bool_and(success) FROM _sqlx_migrations", &[])
        .unwrap()
        .get::<_, bool>(0));
    assert!(f
        .db
        .query_one("SELECT to_regclass('webhook_outbox') IS NOT NULL", &[])
        .unwrap()
        .get::<_, bool>(0));
    let host = f.address.to_string();
    let origin = format!("http://{host}");
    for path in [
        "/app",
        "/app/connectors",
        "/app/connections",
        "/app/events",
        "/app/logs",
        "/app/settings",
        "/app/usage",
        "/app/settings/white-labeling",
    ] {
        let response = f.request("GET", path, &host, &origin, "");
        assert!(response.starts_with("HTTP/1.1 200"), "{path}: {response}");
        assert!(response.contains("dev@appcall.local"));
    }
    let certification = f.request("GET", "/app/certification", &host, &origin, "");
    assert!(certification.starts_with("HTTP/1.1 403"));
    assert!(!certification.contains("manifestFingerprint"));
    for path in [
        "/app/settings/team",
        "/app/settings/account",
        "/app/settings/organization",
        "/app/settings/billing",
    ] {
        assert!(f
            .request("GET", path, &host, &origin, "")
            .contains("Configure anusa auth"));
    }
    let legacy_sessions = f.request("GET", "/app/sessions", &host, &origin, "");
    assert!(
        legacy_sessions.starts_with("HTTP/1.1 301"),
        "{legacy_sessions}"
    );
    let location = legacy_sessions.lines().find_map(|line| {
        line.split_once(':')
            .filter(|(key, _)| key.eq_ignore_ascii_case("Location"))
            .map(|(_, value)| value.trim())
    });
    assert_eq!(location, Some("/app/settings/account#account-sessions"));
    let save = f.request(
        "POST",
        "/app/settings/white-labeling",
        &host,
        &origin,
        "appName=Development+brand&tagColor=%23112233",
    );
    assert!(save.starts_with("HTTP/1.1 302"), "{save}");
    assert!(f
        .request("GET", "/app/settings/white-labeling", &host, &origin, "")
        .contains("Development brand"));
    assert!(f
        .request(
            "POST",
            "/app/settings/white-labeling",
            &host,
            "https://evil.example",
            "appName=evil"
        )
        .starts_with("HTTP/1.1 403"));
    assert!(f
        .request("GET", "/app/connectors", "evil.example", &origin, "")
        .starts_with("HTTP/1.1 403"));
    assert!(f
        .request(
            "POST",
            "/app/settings/team/invite",
            &host,
            &origin,
            "email=ignored@example.invalid"
        )
        .starts_with("HTTP/1.1 302"));
    let setup = f.request(
        "POST",
        "/app/connectors/google-workspace/setup",
        &host,
        &origin,
        "projectId=other&externalAccountId=development-brand",
    );
    assert!(setup.starts_with("HTTP/1.1 302"), "{setup}");
    let location = setup
        .lines()
        .find_map(|line| {
            line.split_once(':')
                .filter(|(k, _)| k.eq_ignore_ascii_case("location"))
                .map(|(_, v)| v.trim())
        })
        .unwrap();
    assert!(location.starts_with("/oauth/local/authorize?"));
    let callback = f.request("GET", location, &host, &origin, "");
    assert!(callback.starts_with("HTTP/1.1 302"), "{callback}");
    let row=f.db.query_one("SELECT id,project_id,status FROM connections WHERE external_account_id='development-brand'",&[]).unwrap();
    let id: String = row.get(0);
    assert_eq!(row.get::<_, String>(1), "proj_dev");
    assert_eq!(row.get::<_, String>(2), "active");
    let mut stream = TcpStream::connect(f.address).unwrap();
    stream
        .set_read_timeout(Some(Duration::from_millis(250)))
        .unwrap();
    write!(
        stream,
        "GET /app/events/stream HTTP/1.1\r\nHost: {host}\r\n\r\n"
    )
    .unwrap();
    let mut wire = String::new();
    wait_for(&mut stream, &mut wire, ": connected");
    assert!(wire.starts_with("HTTP/1.1 200"), "{wire}");
    assert!(!wire.to_ascii_lowercase().contains("set-cookie:"));
    f.db.execute("INSERT INTO webhook_events(id,project_id,connection_id,connector,operation,payload,external_account_id)VALUES('development-live-event','proj_dev',$1,'google-workspace','message.created','{}','development-brand')",&[&id]).unwrap();
    wait_for(&mut stream, &mut wire, "development-live-event");
    assert!(wire.contains("event: datastar-patch-elements"));
    drop(stream);
    f.stop();
    f.start(&[("APPCALL_SESSION_SECRET", "")], false);
    f.stop();
    f.start(&[("APPCALL_ENV", "production")], false);
}

fn wait_for(socket: &mut TcpStream, wire: &mut String, needle: &str) {
    let end = Instant::now() + Duration::from_secs(5);
    while !wire.contains(needle) {
        let mut bytes = [0; 8192];
        match socket.read(&mut bytes) {
            Ok(0) => panic!("stream closed: {wire}"),
            Ok(n) => wire.push_str(&String::from_utf8_lossy(&bytes[..n])),
            Err(e)
                if matches!(
                    e.kind(),
                    std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut
                ) => {}
            Err(e) => panic!("stream read: {e}"),
        }
        assert!(Instant::now() < end, "stream missing {needle}: {wire}");
    }
}
