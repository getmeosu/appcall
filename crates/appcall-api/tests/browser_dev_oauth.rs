//! Browser development OAuth parity through the actual Rust application binary.
//! Every identity, credential and provider is synthetic; PostgreSQL schemas are isolated.
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
struct Database {
    admin: postgres::Client,
    app: String,
    identity: String,
    url: String,
}
impl Database {
    fn new(url: String) -> Self {
        let mut admin = postgres::Client::connect(&url, postgres::NoTls).unwrap();
        let suffix = uuid::Uuid::new_v4().simple().to_string();
        let app = format!("browser_dev_oauth_{suffix}");
        let identity = format!("browser_dev_identity_{suffix}");
        admin
            .batch_execute(&format!(
                "CREATE SCHEMA {app}; CREATE SCHEMA {identity}; SET search_path TO {app}"
            ))
            .unwrap();
        let mut scoped_url = url::Url::parse(&url).unwrap();
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
        admin
            .batch_execute(
                "INSERT INTO projects(id,name)VALUES('proj_dev','Browser development OAuth')",
            )
            .unwrap();
        admin.batch_execute(&format!("SET search_path TO {identity}; CREATE TABLE users(id text PRIMARY KEY,is_active boolean); CREATE TABLE tenants(id text PRIMARY KEY,is_active boolean); CREATE TABLE tenant_memberships(user_id text,tenant_id text); CREATE TABLE revoked_tokens(token_hash text); INSERT INTO users VALUES('11111111-1111-1111-1111-111111111111',true); INSERT INTO tenants VALUES('dev',true); INSERT INTO tenant_memberships VALUES('11111111-1111-1111-1111-111111111111','dev'); SET search_path TO {app}")).unwrap();
        Self {
            admin,
            app,
            identity,
            url,
        }
    }
    fn url(&self, schema: &str) -> String {
        let mut url = url::Url::parse(&self.url).unwrap();
        url.query_pairs_mut()
            .append_pair("options", &format!("-csearch_path={schema}"));
        url.into()
    }
    fn local_count(&mut self) -> i64 {
        self.admin
            .query_one(
                "SELECT count(*) FROM connections WHERE id LIKE 'conn_dev_%'",
                &[],
            )
            .unwrap()
            .get(0)
    }
    fn status(&mut self, id: &str) -> (String, String, String) {
        let row = self
            .admin
            .query_one(
                "SELECT status,secret_ref_id,project_id FROM connections WHERE id=$1",
                &[&id],
            )
            .unwrap();
        (
            row.get(0),
            row.get::<_, Option<String>>(1).unwrap_or_default(),
            row.get(2),
        )
    }
}
impl Drop for Database {
    fn drop(&mut self) {
        let _ = self.admin.batch_execute(&format!(
            "DROP SCHEMA {} CASCADE; DROP SCHEMA {} CASCADE",
            self.app, self.identity
        ));
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
        let payload = json!({"accessToken":fixture["jwt"],"refreshToken":"synthetic-browser-refresh","memberships":[{"tenantId":"dev","tenantName":"Development","isRoot":true}]}).to_string();
        let worker = std::thread::spawn(move || {
            while !stopped.load(Ordering::Acquire) {
                match listener.accept() {
                    Ok((mut socket, _)) => {
                        // BSD accepts inherit the nonblocking listener flag.
                        socket.set_nonblocking(false).unwrap();
                        socket
                            .set_read_timeout(Some(Duration::from_secs(3)))
                            .unwrap();
                        let request = read_request(&mut socket);
                        assert!(
                            request.starts_with("POST /api/auth/login "),
                            "unexpected broker request: {}",
                            request.lines().next().unwrap_or("")
                        );
                        write!(socket,"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{payload}",payload.len()).unwrap();
                    }
                    Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                        std::thread::sleep(Duration::from_millis(5))
                    }
                    Err(e) => panic!("broker listener failed: {e}"),
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
    process: Child,
    address: SocketAddr,
    origin: String,
}
impl Host {
    fn start(
        database: &Database,
        broker: &Broker,
        fixture: &Value,
        production: bool,
        managed: bool,
    ) -> Self {
        let reserve = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = reserve.local_addr().unwrap();
        drop(reserve);
        let origin = if production {
            "https://browser-oauth.example.invalid".to_owned()
        } else {
            format!("http://{address}")
        };
        let mut command = Command::new(env!("CARGO_BIN_EXE_appcall-api"));
        command
            .env_clear()
            .envs(std::env::var_os("LLVM_PROFILE_FILE").map(|value| ("LLVM_PROFILE_FILE", value)))
            .env("APPCALL_RUST_QUALIFICATION", "0")
            .env(
                "APPCALL_ENV",
                if production {
                    "production"
                } else {
                    "development"
                },
            )
            .env(
                "APPCALL_DEV_API_KEY",
                "synthetic-browser-platform-key-123456",
            )
            .env("APPCALL_SECRET_KEY", "01".repeat(32))
            .env("APPCALL_OAUTH_STATE_SECRET", "02".repeat(32))
            .env(
                "APPCALL_WEBHOOK_SIGNING_SECRET",
                "synthetic-browser-signing-key",
            )
            .env("APPCALL_DATABASE_URL", database.url(&database.app))
            .env("ANUSA_DATABASE_URL", database.url(&database.identity))
            .env("APPCALL_RUNNER_URL", "http://127.0.0.1:1")
            .env("APPCALL_RUNNER_TOKEN", "synthetic-runner-token")
            .env("APPCALL_SESSION_SECRET", "synthetic-browser-session-secret")
            .env(
                "ANUSA_JWT_ACCESS_SECRET",
                fixture["jwt_secret"].as_str().unwrap(),
            )
            .env("ANUSA_API_URL", format!("http://{}", broker.address))
            .env("APPCALL_PUBLIC_BASE_URL", &origin)
            .env("APPCALL_RUST_LISTEN", address.to_string())
            .env(
                "APPCALL_CONNECTOR_DIR",
                concat!(env!("CARGO_MANIFEST_DIR"), "/../../runner/connectors"),
            )
            .stdout(Stdio::null())
            .stderr(Stdio::piped());
        if managed {
            command.env(
                "APPCALL_GOOGLE_OAUTH_CLIENT_ID",
                "synthetic-incomplete-managed-client",
            );
        }
        let mut host = Self {
            process: command.spawn().unwrap(),
            address,
            origin,
        };
        let deadline = Instant::now() + Duration::from_secs(20);
        loop {
            if TcpStream::connect(address).is_ok() {
                break;
            }
            if let Some(status) = host.process.try_wait().unwrap() {
                let mut logs = String::new();
                host.process
                    .stderr
                    .take()
                    .unwrap()
                    .read_to_string(&mut logs)
                    .unwrap();
                panic!(
                    "application exited {status} production={production} managed={managed}: {logs}"
                );
            }
            assert!(Instant::now() < deadline, "application did not listen");
            std::thread::sleep(Duration::from_millis(20));
        }
        let mut check =
            postgres::Client::connect(&database.url(&database.app), postgres::NoTls).unwrap();
        assert!(check
            .query_one("SELECT bool_and(success) FROM _sqlx_migrations", &[])
            .unwrap()
            .get::<_, bool>(0));
        host
    }
    fn request(&self, method: &str, path: &str, cookie: &str, body: &str) -> String {
        let mut socket = TcpStream::connect(self.address).unwrap();
        socket
            .set_read_timeout(Some(Duration::from_secs(5)))
            .unwrap();
        write!(socket,"{method} {path} HTTP/1.1\r\nHost: {}\r\nOrigin: {}\r\nCookie: {cookie}\r\nContent-Type: application/x-www-form-urlencoded\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",self.address,self.origin,body.len()).unwrap();
        let mut response = String::new();
        socket.read_to_string(&mut response).unwrap();
        response
    }
    fn login(&self) -> String {
        let response = self.request(
            "POST",
            "/app/login",
            "",
            "email=fixture%40example.invalid&password=synthetic",
        );
        assert!(response.starts_with("HTTP/1.1 302"), "{response}");
        assert!(response.to_ascii_lowercase().contains("httponly"));
        header(&response, "set-cookie")
            .unwrap()
            .split(';')
            .next()
            .unwrap()
            .to_owned()
    }
}
impl Drop for Host {
    fn drop(&mut self) {
        let _ = self.process.kill();
        let _ = self.process.wait();
    }
}
fn header<'a>(wire: &'a str, name: &str) -> Option<&'a str> {
    wire.split("\r\n\r\n")
        .next()
        .unwrap()
        .lines()
        .find_map(|line| {
            line.split_once(':')
                .filter(|(key, _)| key.eq_ignore_ascii_case(name))
                .map(|(_, v)| v.trim())
        })
}
fn read_request(socket: &mut TcpStream) -> String {
    let mut bytes = Vec::new();
    let mut chunk = [0; 4096];
    loop {
        let count = socket.read(&mut chunk).unwrap();
        assert!(count > 0);
        bytes.extend_from_slice(&chunk[..count]);
        assert!(bytes.len() < 65536);
        if let Some(end) = bytes.windows(4).position(|w| w == b"\r\n\r\n") {
            let headers = String::from_utf8_lossy(&bytes[..end]);
            let size = headers
                .lines()
                .find_map(|l| {
                    l.to_ascii_lowercase()
                        .strip_prefix("content-length:")
                        .and_then(|v| v.trim().parse::<usize>().ok())
                })
                .unwrap_or(0);
            if bytes.len() >= end + 4 + size {
                break;
            }
        }
    }
    String::from_utf8(bytes).unwrap()
}
#[test]
#[ignore = "requires isolated local PostgreSQL and actual application process"]
fn browser_setup_local_callback_and_production_managed_fallback_guards() {
    let mut database = Database::new(std::env::var("APPCALL_ENGINE_POSTGRES_URL").unwrap());
    let fixture: Value =
        serde_json::from_str(include_str!("../../appcall-auth/tests/auth_golden.json")).unwrap();
    let broker = Broker::new(&fixture);
    let host = Host::start(&database, &broker, &fixture, false, false);
    let cookie = host.login();
    let start = host.request(
        "POST",
        "/app/connectors/google-workspace/setup",
        &cookie,
        "externalAccountId=brand-browser",
    );
    assert!(
        start.starts_with("HTTP/1.1 302"),
        "browser setup must redirect to local OAuth: {start}"
    );
    let location = header(&start, "location").expect("setup redirect");
    assert!(
        location.starts_with("/oauth/local/authorize?"),
        "{location}"
    );
    let parsed = url::Url::parse(&format!("http://local.invalid{location}")).unwrap();
    let id = parsed
        .query_pairs()
        .find(|(k, _)| k == "connectionId")
        .unwrap()
        .1
        .into_owned();
    assert_eq!(
        database.status(&id),
        ("authorizing".into(), String::new(), "proj_dev".into())
    );
    let callback = host.request("GET", location, &cookie, "");
    assert!(callback.starts_with("HTTP/1.1 302"), "{callback}");
    assert_eq!(
        header(&callback, "location"),
        Some("/app/connectors/google-workspace?success=1")
    );
    assert_eq!(
        database.status(&id),
        ("active".into(), String::new(), "proj_dev".into())
    );
    let account: String = database
        .admin
        .query_one(
            "SELECT external_account_id FROM connections WHERE id=$1",
            &[&id],
        )
        .unwrap()
        .get(0);
    assert_eq!(account, "brand-browser");
    let replay = host.request("GET", location, &cookie, "");
    assert!(!replay.starts_with("HTTP/1.1 302"));
    let reconnect = host.request(
        "POST",
        "/app/connectors/google-workspace/setup",
        &cookie,
        &format!("externalAccountId=brand-browser&connectionId={id}"),
    );
    assert_eq!(header(&reconnect, "location"), Some(location));
    assert_eq!(
        database.local_count(),
        1,
        "reconnect must reuse the scoped connection"
    );
    assert_eq!(database.status(&id).0, "authorizing");
    assert!(host
        .request("GET", location, &cookie, "")
        .starts_with("HTTP/1.1 302"));
    drop(host);
    database.admin.execute("INSERT INTO connections(id,project_id,connector,auth_type,status,credential_owner)VALUES('conn_dev_forbidden','proj_dev','google-workspace','oauth2','authorizing','platform')",&[]).unwrap();
    let forbidden_callback =
        "/oauth/local/authorize?connector=google-workspace&connectionId=conn_dev_forbidden";
    let before = database.local_count();
    for (production, managed) in [(false, true), (true, false)] {
        let host = Host::start(&database, &broker, &fixture, production, managed);
        let cookie = host.login();
        let normal_before: i64 = database.admin.query_one(
            "SELECT count(*) FROM connections WHERE project_id='proj_dev' AND connector='google-workspace' AND external_account_id='brand-browser' AND id NOT LIKE 'conn_dev_%' AND status='disconnected'",
            &[],
        ).unwrap().get(0);
        let response = host.request(
            "POST",
            "/app/connectors/google-workspace/setup",
            &cookie,
            "externalAccountId=brand-browser",
        );
        assert!(
            response.starts_with("HTTP/1.1 503"),
            "valid setup must reach the unconfigured managed OAuth path, not input validation: {response}"
        );
        assert!(
            !header(&response, "location").is_some_and(|u| u.starts_with("/oauth/local/authorize")),
            "fallback forbidden for production={production}, managed={managed}: {response}"
        );
        assert_eq!(
            database.local_count(),
            before,
            "forbidden fallback created a local connection"
        );
        let normal_after: i64 = database.admin.query_one(
            "SELECT count(*) FROM connections WHERE project_id='proj_dev' AND connector='google-workspace' AND external_account_id='brand-browser' AND id NOT LIKE 'conn_dev_%' AND status='disconnected'",
            &[],
        ).unwrap().get(0);
        assert_eq!(
            normal_after, normal_before,
            "invalid managed OAuth configuration must be rejected before persisting a candidate"
        );
        let blocked = host.request("GET", forbidden_callback, &cookie, "");
        // Production does not install the local adapter, so this cookie-only
        // request reaches API-key authentication. Development installs it but
        // refuses managed connectors before touching the pending connection.
        let (expected_status, expected_code) = if production {
            ("HTTP/1.1 401", "UNAUTHORIZED")
        } else {
            ("HTTP/1.1 404", "CONNECTION_NOT_FOUND")
        };
        assert!(
            blocked.starts_with(expected_status),
            "local callback must not be available: {blocked}"
        );
        let body: Value = serde_json::from_str(blocked.split_once("\r\n\r\n").unwrap().1).unwrap();
        assert_eq!(body["error"]["code"], expected_code, "{blocked}");
        assert_eq!(
            database.status("conn_dev_forbidden").0,
            "authorizing",
            "forbidden callback activated a pending connection"
        );
    }
}
