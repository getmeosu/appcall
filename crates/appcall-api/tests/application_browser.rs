//! Actual application process qualification; all identities and providers are synthetic.
use serde_json::{json, Value};
use std::{
    io::{Read, Write},
    net::{SocketAddr, TcpListener, TcpStream},
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};
const SESSION_SECRET: &str = "application-browser-synthetic-session";
#[path = "application_browser/trace_cases.rs"]
mod trace_cases;
struct Schemas {
    admin: postgres::Client,
    app: String,
    anusa: String,
}
impl Schemas {
    fn new(database: &str) -> Self {
        let mut admin = postgres::Client::connect(database, postgres::NoTls).unwrap();
        let unique = uuid::Uuid::new_v4().simple().to_string();
        let app = format!("application_browser_{unique}");
        let anusa = format!("anusa_browser_{unique}");
        admin
            .batch_execute(&format!(
                "CREATE SCHEMA {app};CREATE SCHEMA {anusa};SET search_path TO {app}"
            ))
            .unwrap();
        let mut scoped_url = url::Url::parse(database).unwrap();
        scoped_url
            .query_pairs_mut()
            .append_pair("options", &format!("-csearch_path={app}"));
        appcall_runtime::SqlxMigration::new(
            concat!(env!("CARGO_MANIFEST_DIR"), "/../../migrations"),
            scoped_url.as_str(),
            Duration::from_secs(30),
        )
        .unwrap()
        .apply()
        .unwrap();
        admin.batch_execute("INSERT INTO projects(id,name)VALUES('proj_tenant-a','Browser fixture'),('other','Other project');INSERT INTO connections(id,project_id,connector,auth_type,status,credential_owner)VALUES('application-browser-connection','proj_tenant-a','slack','api_key','active','platform'),('other-project-secret-connection','other','slack','api_key','active','platform')").unwrap();
        admin.batch_execute(&format!("SET search_path TO {anusa};CREATE TABLE users(id text PRIMARY KEY,is_active boolean);CREATE TABLE tenants(id text PRIMARY KEY,is_active boolean);CREATE TABLE tenant_memberships(user_id text,tenant_id text);CREATE TABLE revoked_tokens(token_hash text);INSERT INTO users VALUES('11111111-1111-1111-1111-111111111111',true);INSERT INTO tenants VALUES('tenant-a',true);INSERT INTO tenant_memberships VALUES('11111111-1111-1111-1111-111111111111','tenant-a');SET search_path TO {app}")).unwrap();
        Self { admin, app, anusa }
    }
    fn urls(&self, base: &str) -> (String, String) {
        let with_schema = |schema: &str| {
            let mut url = url::Url::parse(base).unwrap();
            url.query_pairs_mut()
                .append_pair("options", &format!("-csearch_path={schema}"));
            url.to_string()
        };
        (with_schema(&self.app), with_schema(&self.anusa))
    }
    fn event(&mut self, id: &str) {
        self.admin.execute("INSERT INTO webhook_events(id,project_id,connection_id,connector,operation,payload,external_account_id)VALUES($1,'proj_tenant-a','application-browser-connection','slack','message.created','{}','brand-a')",&[&id]).unwrap();
    }
    fn revoke(&mut self) {
        self.admin
            .batch_execute(&format!("DELETE FROM {}.tenant_memberships", self.anusa))
            .unwrap();
    }
}
impl Drop for Schemas {
    fn drop(&mut self) {
        let _ = self.admin.batch_execute(&format!(
            "DROP SCHEMA {} CASCADE;DROP SCHEMA {} CASCADE",
            self.app, self.anusa
        ));
    }
}
struct Broker {
    address: SocketAddr,
    stop: Arc<AtomicBool>,
    worker: Option<std::thread::JoinHandle<()>>,
    calls: Arc<Mutex<Vec<String>>>,
}
impl Broker {
    fn new(fixture: &Value) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let address = listener.local_addr().unwrap();
        let stop = Arc::new(AtomicBool::new(false));
        let stopped = stop.clone();
        let calls = Arc::new(Mutex::new(Vec::new()));
        let observed = calls.clone();
        let payload=json!({"accessToken":fixture["jwt"],"refreshToken":"synthetic-rotated-refresh","memberships":[{"tenantId":"tenant-a","tenantName":"Tenant A","isRoot":true}]}).to_string();
        let worker = std::thread::spawn(move || {
            let mut clients: Vec<std::thread::JoinHandle<()>> = Vec::new();
            while !stopped.load(Ordering::Acquire) {
                match listener.accept() {
                    Ok((mut socket, _)) => {
                        // BSD sockets inherit O_NONBLOCK from the listener.
                        socket.set_nonblocking(false).unwrap();
                        socket
                            .set_read_timeout(Some(Duration::from_secs(3)))
                            .unwrap();
                        socket
                            .set_write_timeout(Some(Duration::from_secs(3)))
                            .unwrap();
                        let mut pending = Vec::new();
                        for client in clients.drain(..) {
                            if client.is_finished() {
                                client.join().unwrap();
                            } else {
                                pending.push(client);
                            }
                        }
                        clients = pending;
                        assert!(
                            clients.len() < 8,
                            "broker fixture connection limit exceeded"
                        );
                        let observed = observed.clone();
                        let payload = payload.clone();
                        clients.push(std::thread::spawn(move || {
                            let Some(request) = read_request(&mut socket) else { return; };
                            let line = request.lines().next().unwrap_or("").to_owned();
                            observed.lock().unwrap().push(line.clone());
                            assert!(
                                line.starts_with("POST /api/auth/login ")
                                    || line.starts_with("POST /api/auth/refresh "),
                                "unexpected broker operation: {line}"
                            );
                            write!(socket,"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",payload.len(),payload).unwrap();
                        }));
                    }
                    Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                        std::thread::sleep(Duration::from_millis(5))
                    }
                    Err(e) => panic!("broker socket failed: {e}"),
                }
            }
            for client in clients {
                client.join().unwrap();
            }
        });
        Self {
            address,
            stop,
            worker: Some(worker),
            calls,
        }
    }
}
impl Drop for Broker {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Release);
        if let Some(worker) = self.worker.take() {
            worker.join().unwrap();
        }
    }
}
struct Process(Child);
impl Drop for Process {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}
fn read_request(socket: &mut TcpStream) -> Option<String> {
    let mut bytes = Vec::new();
    let mut chunk = [0; 4096];
    loop {
        let count = match socket.read(&mut chunk) {
            Ok(0) if bytes.is_empty() => return None,
            Ok(count) => count,
            Err(e)
                if bytes.is_empty()
                    && matches!(
                        e.kind(),
                        std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut
                    ) =>
            {
                return None
            }
            Err(e) => panic!("broker read failed after {} bytes: {e}", bytes.len()),
        };
        assert!(count > 0);
        bytes.extend_from_slice(&chunk[..count]);
        assert!(bytes.len() < 65536);
        if let Some(end) = bytes.windows(4).position(|w| w == b"\r\n\r\n") {
            let headers = String::from_utf8_lossy(&bytes[..end]);
            let length = headers
                .lines()
                .find_map(|line| {
                    line.to_lowercase()
                        .strip_prefix("content-length:")
                        .and_then(|v| v.trim().parse::<usize>().ok())
                })
                .unwrap_or(0);
            if bytes.len() >= end + 4 + length {
                break;
            }
        }
    }
    Some(String::from_utf8(bytes).unwrap())
}
fn start_host(
    address: SocketAddr,
    app_url: &str,
    anusa_url: &str,
    broker: &Broker,
    fixture: &Value,
) -> Process {
    let mut process = Process(
        Command::new(env!("CARGO_BIN_EXE_appcall-api"))
            .env_clear()
            .envs(std::env::var_os("LLVM_PROFILE_FILE").map(|value| ("LLVM_PROFILE_FILE", value)))
            .env("APPCALL_RUST_QUALIFICATION", "0")
            .env("APPCALL_ENV", "development")
            .env("APPCALL_SECRET_KEY", "01".repeat(32))
            .env("APPCALL_DATABASE_URL", app_url)
            .env("ANUSA_DATABASE_URL", anusa_url)
            .env("APPCALL_OAUTH_STATE_SECRET", "01".repeat(32))
            .env("APPCALL_RUNNER_URL", "http://127.0.0.1:1")
            .env("APPCALL_RUNNER_TOKEN", "synthetic-runner-token")
            .env("APPCALL_SESSION_SECRET", SESSION_SECRET)
            .env(
                "ANUSA_JWT_ACCESS_SECRET",
                fixture["jwt_secret"].as_str().unwrap(),
            )
            .env("ANUSA_API_URL", format!("http://{}", broker.address))
            .env("APPCALL_PUBLIC_BASE_URL", format!("http://{address}"))
            .env("APPCALL_RUST_LISTEN", address.to_string())
            .env(
                "APPCALL_CONNECTOR_DIR",
                concat!(env!("CARGO_MANIFEST_DIR"), "/../../runner/connectors"),
            )
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap(),
    );
    let until = Instant::now() + Duration::from_secs(10);
    loop {
        if TcpStream::connect(address).is_ok() {
            break;
        }
        if let Some(status) = process.0.try_wait().unwrap() {
            let mut logs = String::new();
            process
                .0
                .stderr
                .take()
                .unwrap()
                .read_to_string(&mut logs)
                .unwrap();
            panic!("application exited {status}: {logs}")
        }
        assert!(Instant::now() < until, "application did not listen");
        std::thread::sleep(Duration::from_millis(20));
    }
    process
}
fn request(address: SocketAddr, method: &str, path: &str, cookie: &str, body: &str) -> String {
    let mut socket = TcpStream::connect(address).unwrap();
    socket
        .set_read_timeout(Some(Duration::from_secs(5)))
        .unwrap();
    write!(socket,"{method} {path} HTTP/1.1\r\nHost: {address}\r\nOrigin: http://{address}\r\nCookie: {cookie}\r\nContent-Type: application/x-www-form-urlencoded\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",body.len()).unwrap();
    let mut wire = String::new();
    socket.read_to_string(&mut wire).unwrap_or_else(|error| {
        panic!("{method} {path} response read failed: {error}; received: {wire}")
    });
    wire
}
fn cookie(wire: &str) -> String {
    wire.split("\r\n\r\n")
        .next()
        .unwrap()
        .lines()
        .find_map(|line| {
            line.split_once(':')
                .filter(|(key, _)| key.eq_ignore_ascii_case("set-cookie"))
                .map(|(_, value)| value.trim().split(';').next().unwrap().to_owned())
        })
        .expect("response must set session cookie")
}
fn wait_for(socket: &mut TcpStream, wire: &mut String, needle: &str) {
    let deadline = Instant::now() + Duration::from_secs(5);
    let mut buffer = [0; 8192];
    while !wire.contains(needle) {
        assert!(
            Instant::now() < deadline,
            "stream did not contain {needle}: {wire}"
        );
        match socket.read(&mut buffer) {
            Ok(0) => panic!("stream ended before {needle}: {wire}"),
            Ok(count) => wire.push_str(&String::from_utf8_lossy(&buffer[..count])),
            Err(e)
                if matches!(
                    e.kind(),
                    std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut
                ) => {}
            Err(e) => panic!("stream read: {e}"),
        }
    }
}

#[test]
#[ignore = "requires local PostgreSQL, local broker and spawned application process"]
fn application_login_refresh_dashboard_live_stream_and_membership_revocation() {
    let database = std::env::var("APPCALL_ENGINE_POSTGRES_URL").unwrap();
    let mut schemas = Schemas::new(&database);
    trace_cases::seed(&mut schemas.admin);
    let (app_url, anusa_url) = schemas.urls(&database);
    assert_ne!(app_url, anusa_url);
    let fixture: Value =
        serde_json::from_str(include_str!("../../appcall-auth/tests/go_golden.json")).unwrap();
    let broker = Broker::new(&fixture);
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    drop(listener);
    let mut process = start_host(address, &app_url, &anusa_url, &broker, &fixture);
    assert!(schemas
        .admin
        .query_one("SELECT bool_and(success) FROM _sqlx_migrations", &[])
        .unwrap()
        .get::<_, bool>(0));
    let unauthenticated = request(address, "GET", "/app/connections", "", "");
    assert!(unauthenticated.starts_with("HTTP/1.1 302"));
    trace_cases::assert_assets(address);
    trace_cases::assert_session_required(address, "");
    let login = request(
        address,
        "POST",
        "/app/login",
        "",
        "email=fixture%40example.invalid&password=synthetic",
    );
    assert!(login.starts_with("HTTP/1.1 302"), "{login}");
    let original_cookie = cookie(&login);
    assert!(!original_cookie.contains("synthetic-rotated-refresh"));
    assert!(!original_cookie.contains(fixture["jwt"].as_str().unwrap()));
    assert!(login.to_lowercase().contains("httponly"));
    let catalog = request(address, "GET", "/app/connectors", &original_cookie, "");
    assert!(catalog.starts_with("HTTP/1.1 200"), "{catalog}");
    assert!(catalog.contains("Slack"));
    let configs = request(address, "GET", "/app/connections", &original_cookie, "");
    assert!(configs.starts_with("HTTP/1.1 200"), "{configs}");
    assert!(configs.contains("application-browser-connection"));
    assert!(!configs.contains("other-project-secret-connection"));
    trace_cases::assert_traces(address, &original_cookie);
    // Age only this synthetic session's signed access token; exercise the real
    // browser refresh route without waiting for wall-clock token expiry.
    let codec = appcall_web::SessionCodec::new(SESSION_SECRET, false).unwrap();
    let mut session = codec
        .open_session(original_cookie.split_once('=').unwrap().1)
        .unwrap();
    session.access_token = EXPIRED_TOKEN.into();
    let aged_cookie = codec
        .session_cookie(&session)
        .unwrap()
        .split(';')
        .next()
        .unwrap()
        .to_owned();
    let refreshed = request(address, "GET", "/app", &aged_cookie, "");
    assert!(refreshed.starts_with("HTTP/1.1 200"), "{refreshed}");
    let refreshed_cookie = cookie(&refreshed);
    let legacy = request(
        address,
        "GET",
        "/app/triggers/stream?cursor=a%2Fb",
        &refreshed_cookie,
        "",
    );
    assert!(legacy.starts_with("HTTP/1.1 301"), "{legacy}");
    assert!(legacy
        .to_lowercase()
        .contains("location: /app/events/stream?cursor=a%2fb"));
    let canonical_anonymous = request(address, "GET", "/app/connections", "", "");
    assert!(
        canonical_anonymous.starts_with("HTTP/1.1 302"),
        "{canonical_anonymous}"
    );

    assert!(broker
        .calls
        .lock()
        .unwrap()
        .iter()
        .any(|line| line.starts_with("POST /api/auth/refresh ")));
    let mut stream = TcpStream::connect(address).unwrap();
    stream
        .set_read_timeout(Some(Duration::from_millis(250)))
        .unwrap();
    write!(
        stream,
        "GET /app/events/stream HTTP/1.1\r\nHost: {address}\r\nCookie: {refreshed_cookie}\r\n\r\n"
    )
    .unwrap();
    let mut wire = String::new();
    wait_for(&mut stream, &mut wire, ": connected");
    assert!(wire.starts_with("HTTP/1.1 200"), "{wire}");
    assert!(wire.to_lowercase().contains("text/event-stream"));
    assert!(wire.to_lowercase().contains("set-cookie:"));
    schemas.event("browser-live-event");
    wait_for(&mut stream, &mut wire, "browser-live-event");
    assert!(wire.contains("event: datastar-patch-elements"));
    assert!(wire.contains("data: selector #trigger-rows"));
    assert!(wire.contains("id: "));
    assert!(!wire.contains("private-project"));
    schemas.revoke();
    wait_for(&mut stream, &mut wire, "EVENT_STREAM_BACKFILL_FAILED");
    let deadline = Instant::now() + Duration::from_secs(3);
    let mut bytes = [0; 4096];
    loop {
        match stream.read(&mut bytes) {
            Ok(0) => break,
            Ok(_) => {}
            Err(e)
                if matches!(
                    e.kind(),
                    std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut
                ) =>
            {
                assert!(Instant::now() < deadline, "revoked stream remained open")
            }
            Err(e) => panic!("revocation read failed: {e}"),
        }
    }
    assert!(
        request(address, "GET", "/app/connections", &refreshed_cookie, "")
            .starts_with("HTTP/1.1 302")
    );
    trace_cases::assert_session_required(address, &refreshed_cookie);
    assert!(Command::new("kill")
        .args(["-TERM", &process.0.id().to_string()])
        .status()
        .unwrap()
        .success());
    let deadline = Instant::now() + Duration::from_secs(5);
    loop {
        if let Some(status) = process.0.try_wait().unwrap() {
            assert!(status.success(), "application shutdown failed: {status}");
            break;
        }
        assert!(Instant::now() < deadline, "application did not stop");
        std::thread::sleep(Duration::from_millis(20));
    }
    assert!(broker
        .calls
        .lock()
        .unwrap()
        .iter()
        .any(|line| line.starts_with("POST /api/auth/login ")));
}

const EXPIRED_TOKEN:&str="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxMTExMTExMS0xMTExLTExMTEtMTExMS0xMTExMTExMTExMTEiLCJlbWFpbCI6ImZpeHR1cmVAZXhhbXBsZS5pbnZhbGlkIiwidG9rZW5UeXBlIjoiYWNjZXNzIiwiZXhwIjoxNzAwMDAwMDAxLCJuYmYiOjE2MDAwMDAwMDAsImlhdCI6MTYwMDAwMDAwMCwianRpIjoiZXhwaXJlZC1icm93c2VyLWZpeHR1cmUifQ.Vq-1CQL7hoM79bfLg0spSxyklxblb2-Ld1Ho-MlEu-g";

#[test]
fn broker_serves_request_while_another_connection_is_idle() {
    let broker = Broker::new(&json!({"jwt": "synthetic-token"}));
    let _idle = TcpStream::connect(broker.address).unwrap();
    std::thread::sleep(Duration::from_millis(30));
    let mut request = TcpStream::connect(broker.address).unwrap();
    request
        .set_read_timeout(Some(Duration::from_secs(1)))
        .unwrap();
    request.write_all(b"POST /api/auth/refresh HTTP/1.1\r\nHost: localhost\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}").unwrap();
    let mut response = String::new();
    request.read_to_string(&mut response).unwrap();
    assert!(response.starts_with("HTTP/1.1 200"), "{response}");
    assert_eq!(
        broker.calls.lock().unwrap().as_slice(),
        &["POST /api/auth/refresh HTTP/1.1"]
    );
}
