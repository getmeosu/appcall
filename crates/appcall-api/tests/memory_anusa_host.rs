//! No AppCall database: the independent Anusa database remains authoritative.
use serde_json::{json, Value};
use std::{
    io::{Read, Write},
    net::{SocketAddr, TcpListener, TcpStream},
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};
const KEY: &str = "synthetic-memory-platform-key";
struct IdentityDb {
    admin: postgres::Client,
    schema: String,
    url: String,
    application: String,
}
impl IdentityDb {
    fn new() -> Self {
        let base =
            std::env::var("APPCALL_ENGINE_POSTGRES_URL").expect("isolated local PostgreSQL URL");
        let mut admin = postgres::Client::connect(&base, postgres::NoTls).unwrap();
        let schema = format!("memory_anusa_{}", uuid::Uuid::new_v4().simple());
        let application = schema.clone();
        admin.batch_execute(&format!("CREATE SCHEMA {schema}; SET search_path TO {schema}; CREATE TABLE users(id text PRIMARY KEY,is_active boolean); CREATE TABLE tenants(id text PRIMARY KEY,is_active boolean); CREATE TABLE tenant_memberships(user_id text,tenant_id text); CREATE TABLE revoked_tokens(token_hash text); INSERT INTO users VALUES('11111111-1111-1111-1111-111111111111',true); INSERT INTO tenants VALUES('tenant-memory',true),('other',true); INSERT INTO tenant_memberships VALUES('11111111-1111-1111-1111-111111111111','tenant-memory')")).unwrap();
        let mut url = url::Url::parse(&base).unwrap();
        url.query_pairs_mut()
            .append_pair("options", &format!("-csearch_path={schema}"))
            .append_pair("application_name", &application);
        Self {
            admin,
            schema,
            url: url.into(),
            application,
        }
    }
    fn sessions(&mut self) -> i64 {
        self.admin
            .query_one(
                "SELECT count(*) FROM pg_stat_activity WHERE application_name=$1",
                &[&self.application],
            )
            .unwrap()
            .get(0)
    }
}
impl Drop for IdentityDb {
    fn drop(&mut self) {
        let _ = self
            .admin
            .batch_execute(&format!("DROP SCHEMA {} CASCADE", self.schema));
    }
}
struct Broker {
    address: SocketAddr,
    stop: Arc<AtomicBool>,
    worker: Option<std::thread::JoinHandle<()>>,
}
impl Broker {
    fn new(fixture: &Value) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let address = listener.local_addr().unwrap();
        let stop = Arc::new(AtomicBool::new(false));
        let stopped = stop.clone();
        let payload=json!({"accessToken":fixture["jwt"],"refreshToken":"synthetic-refresh","memberships":[{"tenantId":"tenant-memory","tenantName":"Memory tenant","isRoot":true}]}).to_string();
        let worker = std::thread::spawn(move || {
            while !stopped.load(Ordering::Acquire) {
                match listener.accept() {
                    Ok((mut socket, _)) => {
                        socket.set_nonblocking(false).unwrap();
                        socket
                            .set_read_timeout(Some(Duration::from_secs(3)))
                            .unwrap();
                        let request = read_request(&mut socket);
                        assert!(request.starts_with("POST /api/auth/login "));
                        write!(socket,"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",payload.len(),payload).unwrap();
                    }
                    Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                        std::thread::sleep(Duration::from_millis(5))
                    }
                    Err(e) => panic!("broker: {e}"),
                }
            }
        });
        Self {
            address,
            stop,
            worker: Some(worker),
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
struct Host {
    child: Child,
    address: SocketAddr,
    origin: String,
}
impl Host {
    fn command(address: SocketAddr) -> Command {
        let mut c = Command::new(env!("CARGO_BIN_EXE_appcall-api"));
        c.env_clear()
            .envs(std::env::var_os("LLVM_PROFILE_FILE").map(|v| ("LLVM_PROFILE_FILE", v)))
            .env("PATH", "/nonexistent-memory-test-path")
            .env("APPCALL_ENV", "development")
            .env("APPCALL_DEV_API_KEY", KEY)
            .env("APPCALL_HTTP_ADDR", address.to_string())
            .env("APPCALL_PUBLIC_BASE_URL", format!("http://{address}"))
            .env(
                "APPCALL_CONNECTOR_DIR",
                concat!(env!("CARGO_MANIFEST_DIR"), "/../../runner/connectors"),
            )
            .stdout(Stdio::null())
            .stderr(Stdio::piped());
        c
    }
    fn start(db: &IdentityDb, broker: &Broker, fixture: &Value) -> Self {
        let address = TcpListener::bind("127.0.0.1:0")
            .unwrap()
            .local_addr()
            .unwrap();
        let origin = format!("http://{address}");
        let mut command = Self::command(address);
        command
            .env("ANUSA_DATABASE_URL", &db.url)
            .env("ANUSA_API_URL", format!("http://{}", broker.address))
            .env(
                "ANUSA_JWT_ACCESS_SECRET",
                fixture["jwt_secret"].as_str().unwrap(),
            )
            .env("APPCALL_SESSION_SECRET", "synthetic-memory-session-secret");
        let mut host = Self {
            child: command.spawn().unwrap(),
            address,
            origin,
        };
        let until = Instant::now() + Duration::from_secs(20);
        loop {
            if let Some(status) = host.child.try_wait().unwrap() {
                let mut logs = String::new();
                host.child
                    .stderr
                    .take()
                    .unwrap()
                    .read_to_string(&mut logs)
                    .unwrap();
                panic!("host exited {status}: {logs}")
            }
            if TcpStream::connect(address).is_ok() {
                return host;
            }
            assert!(Instant::now() < until, "startup timeout");
            std::thread::sleep(Duration::from_millis(20));
        }
    }
    fn request(&self, method: &str, path: &str, headers: &str, body: &str, form: bool) -> String {
        let mut socket = TcpStream::connect(self.address).unwrap();
        socket
            .set_read_timeout(Some(Duration::from_secs(10)))
            .unwrap();
        let mime = if form {
            "application/x-www-form-urlencoded"
        } else {
            "application/json"
        };
        write!(socket,"{method} {path} HTTP/1.1\r\nHost: {}\r\nOrigin: {}\r\n{headers}Content-Type: {mime}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",self.address,self.origin,body.len()).unwrap();
        let mut response = String::new();
        socket.read_to_string(&mut response).unwrap();
        response
    }
    fn stop(&mut self) {
        assert!(Command::new("/bin/kill")
            .args(["-TERM", &self.child.id().to_string()])
            .status()
            .unwrap()
            .success());
        let until = Instant::now() + Duration::from_secs(10);
        loop {
            if let Some(status) = self.child.try_wait().unwrap() {
                assert!(status.success(), "shutdown {status}");
                break;
            }
            assert!(Instant::now() < until, "shutdown timeout");
            std::thread::sleep(Duration::from_millis(20));
        }
        let mut logs = String::new();
        self.child
            .stderr
            .take()
            .unwrap()
            .read_to_string(&mut logs)
            .unwrap();
        assert!(!logs.contains("panicked"));
        assert!(!logs.contains("Cannot drop a runtime"));
    }
}
impl Drop for Host {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}
fn read_request(socket: &mut TcpStream) -> String {
    let mut bytes = Vec::new();
    loop {
        let mut chunk = [0; 4096];
        let n = socket.read(&mut chunk).unwrap();
        assert!(n > 0);
        bytes.extend_from_slice(&chunk[..n]);
        assert!(bytes.len() < 65536);
        if let Some(end) = bytes.windows(4).position(|w| w == b"\r\n\r\n") {
            let text = String::from_utf8_lossy(&bytes[..end]);
            let size = text
                .lines()
                .find_map(|l| {
                    l.to_ascii_lowercase()
                        .strip_prefix("content-length:")
                        .and_then(|s| s.trim().parse::<usize>().ok())
                })
                .unwrap_or(0);
            if bytes.len() >= end + 4 + size {
                return String::from_utf8(bytes).unwrap();
            }
        }
    }
}
fn status(wire: &str) -> u16 {
    wire.split_whitespace().nth(1).unwrap().parse().unwrap()
}
fn header<'a>(wire: &'a str, name: &str) -> Option<&'a str> {
    wire.split("\r\n\r\n")
        .next()
        .unwrap()
        .lines()
        .find_map(|l| {
            l.split_once(':')
                .filter(|(k, _)| k.eq_ignore_ascii_case(name))
                .map(|(_, v)| v.trim())
        })
}
fn body(wire: &str) -> &str {
    wire.split_once("\r\n\r\n").unwrap().1
}
fn response_json(wire: &str, expected: u16) -> Value {
    assert_eq!(status(wire), expected, "{wire}");
    serde_json::from_str(body(wire)).unwrap()
}

#[test]
#[ignore = "requires isolated PostgreSQL, local broker and actual application executable"]
fn memory_with_independent_anusa_enforces_membership_and_shares_state() {
    let mut db = IdentityDb::new();
    let fixture: Value =
        serde_json::from_str(include_str!("../../appcall-auth/tests/go_golden.json")).unwrap();
    let broker = Broker::new(&fixture);
    let mut host = Host::start(&db, &broker, &fixture);
    assert_eq!(status(&host.request("GET", "/readyz", "", "", false)), 200);
    let anonymous = host.request("GET", "/app", "", "", false);
    assert_eq!(status(&anonymous), 302);
    assert!(header(&anonymous, "location").unwrap().contains("login"));
    assert_eq!(
        status(&host.request("GET", "/v1/connections", "", "", false)),
        401
    );
    let jwt = fixture["jwt"].as_str().unwrap();
    let auth = format!("Authorization: Bearer {jwt}\r\nX-Tenant-ID: tenant-memory\r\n");
    let wrong = format!("Authorization: Bearer {jwt}\r\nX-Tenant-ID: other\r\n");
    assert_eq!(
        status(&host.request("GET", "/v1/connections", &wrong, "", false)),
        403
    );
    let invalid = format!(
        "Authorization: Bearer invalid\r\nX-Tenant-ID: tenant-memory\r\nX-API-Key: {KEY}\r\n"
    );
    assert_eq!(
        status(&host.request("GET", "/v1/connections", &invalid, "", false)),
        401
    );
    let created = response_json(
        &host.request(
            "POST",
            "/v1/connectors/telegram/setup/api-key",
            &auth,
            &json!({"fields":{"botToken":"synthetic-memory-token"}}).to_string(),
            false,
        ),
        201,
    );
    let id = created["connection"]["id"].as_str().unwrap();
    let rows = response_json(
        &host.request("GET", "/v1/connections", &auth, "", false),
        200,
    );
    assert_eq!(rows["connections"].as_array().unwrap().len(), 1);
    let platform = format!("X-API-Key: {KEY}\r\n");
    let platform_rows = response_json(
        &host.request("GET", "/v1/connections", &platform, "", false),
        200,
    );
    assert!(platform_rows["connections"].as_array().unwrap().is_empty());
    let login = host.request(
        "POST",
        "/app/login",
        "",
        "email=fixture%40example.invalid&password=synthetic",
        true,
    );
    assert_eq!(status(&login), 302, "{login}");
    let cookie = header(&login, "set-cookie")
        .unwrap()
        .split(';')
        .next()
        .unwrap();
    let cookie_header = format!("Cookie: {cookie}\r\n");
    let page = host.request("GET", "/app/connections", &cookie_header, "", false);
    assert_eq!(status(&page), 200, "{page}");
    assert!(body(&page).contains(id));
    assert!(!body(&page).contains("synthetic-memory-token"));
    let tables: i64 = db
        .admin
        .query_one(
            "SELECT count(*) FROM information_schema.tables WHERE table_schema=$1",
            &[&db.schema],
        )
        .unwrap()
        .get(0);
    assert_eq!(
        tables, 4,
        "AppCall migrations must not touch identity database"
    );
    assert!(db.sessions() > 0);
    let old_pids = db
        .admin
        .query(
            "SELECT pid,pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name=$1",
            &[&db.application],
        )
        .unwrap()
        .into_iter()
        .map(|r| {
            assert!(r.get::<_, bool>(1));
            r.get::<_, i32>(0)
        })
        .collect::<Vec<_>>();
    assert!(!old_pids.is_empty());
    let recovery_deadline = Instant::now() + Duration::from_secs(5);
    loop {
        let readiness = host.request("GET", "/readyz", "", "", false);
        assert!(matches!(status(&readiness), 200 | 503), "{readiness}");
        let response = host.request("GET", "/v1/connections", &auth, "", false);
        assert!(
            matches!(status(&response), 200 | 503),
            "identity failure must not become unauthorized or anonymous: {response}"
        );
        let replacement = db
            .admin
            .query(
                "SELECT pid FROM pg_stat_activity WHERE application_name=$1",
                &[&db.application],
            )
            .unwrap()
            .into_iter()
            .any(|r| !old_pids.contains(&r.get::<_, i32>(0)));
        if status(&response) == 200 && replacement {
            let rows = response_json(&response, 200);
            assert_eq!(rows["connections"].as_array().unwrap().len(), 1);
            assert_eq!(rows["connections"][0]["id"], id);
            break;
        }
        assert!(
            Instant::now() < recovery_deadline,
            "closed identity database client never recovered"
        );
        std::thread::sleep(Duration::from_millis(40));
    }
    let recovered_page = host.request("GET", "/app/connections", &cookie_header, "", false);
    assert_eq!(status(&recovered_page), 200, "{recovered_page}");
    assert!(body(&recovered_page).contains(id));
    db.admin
        .batch_execute("DELETE FROM tenant_memberships")
        .unwrap();
    assert_eq!(
        status(&host.request("GET", "/v1/connections", &auth, "", false)),
        403
    );
    assert_ne!(
        status(&host.request("GET", "/app/connections", &cookie_header, "", false)),
        200
    );
    db.admin.batch_execute("INSERT INTO tenant_memberships VALUES('11111111-1111-1111-1111-111111111111','tenant-memory')").unwrap();
    let rows = response_json(
        &host.request("GET", "/v1/connections", &auth, "", false),
        200,
    );
    assert_eq!(rows["connections"].as_array().unwrap().len(), 1);
    host.stop();
    let until = Instant::now() + Duration::from_secs(3);
    while db.sessions() != 0 {
        assert!(
            Instant::now() < until,
            "identity database owners leaked after shutdown"
        );
        std::thread::sleep(Duration::from_millis(20));
    }
}

#[test]
#[ignore = "requires isolated PostgreSQL and actual application executable"]
fn identity_database_alone_never_selects_anonymous_development_browser() {
    let db = IdentityDb::new();
    let mut command = Host::command("127.0.0.1:0".parse().unwrap());
    command.env("ANUSA_DATABASE_URL", &db.url);
    let mut child = command.spawn().unwrap();
    let until = Instant::now() + Duration::from_secs(5);
    let status = loop {
        if let Some(status) = child.try_wait().unwrap() {
            break status;
        }
        if Instant::now() >= until {
            let _ = child.kill();
            let _ = child.wait();
            panic!("partial Anusa configuration left a running anonymous development host")
        }
        std::thread::sleep(Duration::from_millis(20));
    };
    assert!(!status.success());
    let mut logs = String::new();
    child
        .stderr
        .take()
        .unwrap()
        .read_to_string(&mut logs)
        .unwrap();
    assert!(logs.contains("rust_api_startup_failed"));
    assert!(!logs.contains(&db.url));
}
