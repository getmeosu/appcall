use postgres::{Client, NoTls};
use serde_json::{json, Value};
use std::{
    io::{Read, Write},
    process::Command,
    time::Duration,
};
struct Fixture {
    db: Client,
    schema: String,
    url: String,
    // SQLx's migration advisory lock is database-wide, not schema-wide. Keep
    // admission through caller-owned child work and Drop's schema cleanup.
    _admission: std::sync::MutexGuard<'static, ()>,
}

static FIXTURE_ADMISSION: std::sync::Mutex<()> = std::sync::Mutex::new(());

fn acquire_fixture_admission() -> std::sync::MutexGuard<'static, ()> {
    // A failed test must not poison unrelated UUID-scoped fixtures. Unwinding
    // drops child guards and runs fixture cleanup before releasing admission.
    FIXTURE_ADMISSION
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

#[test]
fn fixture_admission_serializes_until_guard_is_dropped() {
    let admission = acquire_fixture_admission();
    let (ready_tx, ready_rx) = std::sync::mpsc::channel();
    let (acquired_tx, acquired_rx) = std::sync::mpsc::channel();
    let worker = std::thread::spawn(move || {
        ready_tx.send(()).unwrap();
        let _admission = acquire_fixture_admission();
        acquired_tx.send(()).unwrap();
    });
    let ready = ready_rx.recv_timeout(Duration::from_secs(2));
    let premature = acquired_rx.recv_timeout(Duration::from_millis(100));
    drop(admission);
    // Admission is not FIFO: unrelated PostgreSQL fixtures may run first.
    // This wait does not change the exclusion check or any QA deadline.
    let acquired = acquired_rx.recv_timeout(Duration::from_secs(30));
    let joined = worker.join();
    ready.unwrap();
    assert!(matches!(
        premature,
        Err(std::sync::mpsc::RecvTimeoutError::Timeout)
    ));
    acquired.unwrap();
    joined.unwrap();
}

#[test]
#[ignore = "requires isolated local PostgreSQL"]
fn fixture_admission_is_held_until_schema_cleanup_completes() {
    for migration_only in [false, true] {
        let fixture = if migration_only {
            Fixture::migration_only()
        } else {
            Fixture::new()
        };
        let schema = fixture.schema.clone();
        let (ready_tx, ready_rx) = std::sync::mpsc::channel();
        let (cleaned_tx, cleaned_rx) = std::sync::mpsc::channel();
        let worker = std::thread::spawn(move || {
            ready_tx.send(()).unwrap();
            let _admission = acquire_fixture_admission();
            let base = std::env::var("APPCALL_ENGINE_POSTGRES_URL").unwrap();
            let mut config: postgres::Config = base.parse().unwrap();
            config.connect_timeout(Duration::from_secs(5));
            let mut client = config.connect(NoTls).unwrap();
            client.batch_execute("SET statement_timeout='5s'").unwrap();
            let exists: bool = client
                .query_one(
                    "SELECT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname=$1)",
                    &[&schema],
                )
                .unwrap()
                .get(0);
            cleaned_tx.send(!exists).unwrap();
        });
        let ready = ready_rx.recv_timeout(Duration::from_secs(2));
        // The fixture stays alive through all child-process work in its caller.
        let premature = cleaned_rx.recv_timeout(Duration::from_millis(100));
        drop(fixture);
        let cleaned = cleaned_rx.recv_timeout(Duration::from_secs(30));
        let joined = worker.join();
        ready.unwrap();
        assert!(matches!(
            premature,
            Err(std::sync::mpsc::RecvTimeoutError::Timeout)
        ));
        assert!(cleaned.unwrap());
        joined.unwrap();
    }
}

fn scoped_fixture_url(base: &str, schema: &str) -> Result<String, &'static str> {
    const INVALID: &str = "invalid isolated PostgreSQL fixture URL";
    if !(base.starts_with("postgres://") || base.starts_with("postgresql://"))
        || base.contains('#')
        || !schema.starts_with("cli_")
        || schema.len() > 63
        || !schema
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'_')
    {
        return Err(INVALID);
    }
    let config: postgres::Config = base.parse().map_err(|_| INVALID)?;
    if config.get_options().is_some() {
        return Err(INVALID);
    }
    let scoped = format!(
        "{base}{}options=-csearch_path%3D{schema}",
        if base.contains('?') { "&" } else { "?" }
    );
    let config: postgres::Config = scoped.parse().map_err(|_| INVALID)?;
    if config.get_options() != Some(format!("-csearch_path={schema}").as_str()) {
        return Err(INVALID);
    }
    Ok(scoped)
}

#[test]
fn fixture_url_rejects_literal_fragments_before_database_work() {
    for base in [
        "postgres://user:private_fixture_password@localhost/db#fragment",
        "postgresql://localhost/db?application_name=probe#fragment",
        "postgres://localhost/db#",
    ] {
        assert_eq!(
            scoped_fixture_url(base, "cli_probe"),
            Err("invalid isolated PostgreSQL fixture URL")
        );
    }
}

#[test]
fn fixture_url_preserves_encoded_hashes_and_query_parameters() {
    for base in [
        "postgres://user:encoded%23password@localhost/db",
        "postgresql://localhost/db?application_name=probe%23encoded",
    ] {
        let scoped = scoped_fixture_url(base, "cli_probe").unwrap();
        assert!(scoped.starts_with(base));
        assert_eq!(scoped.matches("options=").count(), 1);
        let parsed: postgres::Config = scoped.parse().unwrap();
        assert_eq!(parsed.get_options(), Some("-csearch_path=cli_probe"));
        assert!(scoped.contains("%23"));
    }
}

#[test]
fn fixture_url_rejects_unsupported_configuration_with_redacted_errors() {
    for base in [
        "",
        "host=localhost dbname=db password=private_fixture_password",
        "https://user:private_fixture_password@localhost/db",
        "postgres://localhost:invalid/db",
        "postgres://localhost/db?unknown=private_fixture_password",
        "postgres://localhost/db?options=-csearch_path%3Dpublic",
        "postgres://localhost/db?%6fptions=-csearch_path%3Dpublic",
    ] {
        assert_eq!(
            scoped_fixture_url(base, "cli_probe"),
            Err("invalid isolated PostgreSQL fixture URL")
        );
    }
}

#[test]
fn fixture_url_only_accepts_bounded_private_schema_names() {
    let oversized = format!("cli_{}", "a".repeat(60));
    for schema in [
        "",
        "public",
        "cli_bad;DROP SCHEMA public",
        "cli_bad/path",
        &oversized,
    ] {
        assert_eq!(
            scoped_fixture_url("postgres://localhost/db", schema),
            Err("invalid isolated PostgreSQL fixture URL")
        );
    }
    for prefix in ["cli_", "cli_migration_"] {
        let first = format!("{prefix}{}", uuid::Uuid::new_v4().simple());
        let second = format!("{prefix}{}", uuid::Uuid::new_v4().simple());
        let first_url = scoped_fixture_url("postgres://localhost/db", &first).unwrap();
        let second_url = scoped_fixture_url("postgres://localhost/db", &second).unwrap();
        assert_ne!(first_url, second_url);
        let parsed: postgres::Config = first_url.parse().unwrap();
        assert_eq!(
            parsed.get_options(),
            Some(format!("-csearch_path={first}").as_str())
        );
    }
}

impl Fixture {
    fn new() -> Self {
        let admission = acquire_fixture_admission();
        let base = std::env::var("APPCALL_ENGINE_POSTGRES_URL")
            .expect("explicit isolated PostgreSQL URL required");
        let schema = format!("cli_{}", uuid::Uuid::new_v4().simple());
        let url = scoped_fixture_url(&base, &schema).expect("fixture URL preflight failed");
        let mut db = Client::connect(&base, NoTls).unwrap();
        db.batch_execute(&format!(
            "CREATE SCHEMA {schema};SET search_path TO {schema}"
        ))
        .unwrap();
        appcall_runtime::SqlxMigration::new(
            concat!(env!("CARGO_MANIFEST_DIR"), "/../../migrations"),
            &url,
            Duration::from_secs(30),
        )
        .unwrap()
        .apply()
        .unwrap();
        db.batch_execute("INSERT INTO projects(id,name) VALUES('p','p')")
            .unwrap();
        Self {
            db,
            schema,
            url,
            _admission: admission,
        }
    }
    fn migration_only() -> Self {
        let admission = acquire_fixture_admission();
        let base = std::env::var("APPCALL_ENGINE_POSTGRES_URL")
            .expect("explicit isolated PostgreSQL URL required");
        let schema = format!("cli_migration_{}", uuid::Uuid::new_v4().simple());
        let url = scoped_fixture_url(&base, &schema).expect("fixture URL preflight failed");
        let mut db = Client::connect(&base, NoTls).unwrap();
        db.batch_execute(&format!(
            "CREATE SCHEMA {schema};\
             SET search_path TO {schema};\
             CREATE TABLE _sqlx_migrations (\
                 version BIGINT PRIMARY KEY,\
                 description TEXT NOT NULL,\
                 installed_on TIMESTAMPTZ NOT NULL DEFAULT now(),\
                 success BOOLEAN NOT NULL,\
                 checksum BYTEA NOT NULL,\
                 execution_time BIGINT NOT NULL\
             )"
        ))
        .unwrap();
        Self {
            db,
            schema,
            url,
            _admission: admission,
        }
    }
    fn plan(&self, args: &[&str]) -> std::process::Output {
        Command::new(env!("CARGO_BIN_EXE_planctl"))
            .env_clear()
            .envs(std::env::var_os("LLVM_PROFILE_FILE").map(|v| ("LLVM_PROFILE_FILE", v)))
            .env("APPCALL_DATABASE_URL", &self.url)
            .args(args)
            .output()
            .unwrap()
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        self.db
            .batch_execute(&format!("DROP SCHEMA {} CASCADE", self.schema))
            .unwrap();
    }
}
#[test]
#[ignore = "requires isolated local PostgreSQL"]
fn planctl_assign_show_audit_and_ledger_warning_preserve_operator_contract() {
    let mut f = Fixture::new();
    let out = f.plan(&["-project", "p", "-show"]);
    assert!(out.status.success());
    assert!(String::from_utf8_lossy(&out.stdout).contains("no plan row"));
    let out = f.plan(&[
        "-project",
        "p",
        "-plan",
        "starter",
        "-overrides",
        "{\"send_cap\":75}",
    ]);
    assert!(
        out.status.success(),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );
    assert_eq!(
        f.db.query_one(
            "SELECT plan_key FROM project_plans WHERE project_id='p'",
            &[]
        )
        .unwrap()
        .get::<_, String>(0),
        "starter"
    );
    let audit = f.plan(&["-project", "p", "-audit"]);
    let rows: Value = serde_json::from_slice(&audit.stdout).unwrap();
    assert_eq!(rows[0]["provider"], "admin");
    assert_eq!(rows[0]["type"], "plan.set");
    assert!(
        String::from_utf8_lossy(&f.plan(&["-project", "p", "-show"]).stdout)
            .contains("plan=starter")
    );
    let out = f.plan(&["-project", "p", "-plan", "bad"]);
    assert!(!out.status.success());
    assert_eq!(
        f.db.query_one("SELECT count(*) FROM billing_events", &[])
            .unwrap()
            .get::<_, i64>(0),
        1
    );
    f.db.batch_execute("DROP TABLE billing_events").unwrap();
    let out = f.plan(&["-project", "p", "-plan", "growth"]);
    assert!(out.status.success());
    assert!(String::from_utf8_lossy(&out.stderr).contains("plan applied but ledger write failed"));
}
fn copy_migrations(root: &std::path::Path) {
    let target = root.join("migrations");
    std::fs::create_dir(&target).unwrap();
    for entry in
        std::fs::read_dir(concat!(env!("CARGO_MANIFEST_DIR"), "/../../migrations")).unwrap()
    {
        let entry = entry.unwrap();
        if entry.file_type().unwrap().is_file() {
            std::fs::copy(entry.path(), target.join(entry.file_name())).unwrap();
        }
    }
}
fn write_probe_migration(root: &std::path::Path) {
    let target = root.join("migrations");
    std::fs::create_dir(&target).unwrap();
    std::fs::write(target.join("1_probe.sql"), "SELECT 1;\n").unwrap();
}
struct ChildGuard(Option<std::process::Child>);
impl ChildGuard {
    fn new(child: std::process::Child) -> Self {
        Self(Some(child))
    }
    fn as_mut(&mut self) -> &mut std::process::Child {
        self.0.as_mut().expect("child already reaped")
    }
    fn finish(&mut self) -> std::process::Output {
        self.0
            .take()
            .expect("child already reaped")
            .wait_with_output()
            .unwrap()
    }
}
impl Drop for ChildGuard {
    fn drop(&mut self) {
        let Some(mut child) = self.0.take() else {
            return;
        };
        let _ = child.kill();
        let _ = child.wait_with_output();
    }
}
fn wait_for_migration_lock(
    observer: &mut Client,
    ledger_oid: u32,
    child: &mut ChildGuard,
    started: std::time::Instant,
) -> i32 {
    observer
        .batch_execute("SET statement_timeout='250ms'")
        .unwrap();
    let ready_by = started + Duration::from_secs(5);
    loop {
        if let Some(status) = child.as_mut().try_wait().unwrap() {
            let _output = child.finish();
            panic!(
                "QA exited before migration lock readiness (status={status}; child diagnostics redacted)"
            );
        }
        let blocked = match observer.query_opt(
            "SELECT a.pid \
             FROM pg_stat_activity a \
             JOIN pg_locks l ON l.pid=a.pid \
             WHERE a.application_name='appcall-migrations' \
               AND a.wait_event_type='Lock' \
               AND NOT l.granted \
               AND l.relation=$1::oid \
             LIMIT 1",
            &[&ledger_oid],
        ) {
            Ok(row) => row,
            Err(error) if error.code().is_some_and(|code| code.code() == "57014") => None,
            Err(_) => panic!("migration lock observer query failed"),
        };
        if let Some(row) = blocked {
            return row.get(0);
        }
        assert!(
            std::time::Instant::now() < ready_by,
            "migration lock was not observed within the bounded readiness window"
        );
        std::thread::sleep(Duration::from_millis(5));
    }
}
fn manifest() -> Value {
    json!({"key":"test","name":"Test","version":"1","runtime":"bun","models":["item"],"auth":{"type":"api_key","setup":{"mode":"api_key","fields":[{"key":"apiKey","label":"API key","secret":true,"required":true}]}},"network":{"egress":"none"},"operations":{"read":{"kind":"action","timeoutMs":1000,"maxInputBytes":1000,"maxResponseBytes":1000,"inputSchema":{"type":"object"},"outputSchema":{"type":"object","required":["id"]},"sideEffect":"read"}}})
}
#[test]
#[ignore = "requires isolated local PostgreSQL and local HTTP"]
fn qa_subprocess_uses_encrypted_credentials_real_actions_and_persists_fingerprint() {
    let mut f = Fixture::new();
    let key = [7u8; 32];
    let mut client = Client::connect(&f.url, NoTls).unwrap();
    client.batch_execute("SET statement_timeout='3s'").unwrap();
    let mut store =
        appcall_store::Store::new(client, appcall_store::LocalProvider::new(&key).unwrap());
    store
        .store_secret(
            "p",
            "credential_fixture",
            "api_key",
            br#"{"apiKey":"synthetic-secret"}"#,
        )
        .unwrap();
    f.db.batch_execute("INSERT INTO connections(id,project_id,connector,auth_type,status,credential_owner,external_account_id,secret_ref_id) VALUES('c','p','test','api_key','active','brand','b','credential_fixture')").unwrap();
    let root = tempfile::tempdir().unwrap();
    copy_migrations(root.path());
    let manifests = root.path().join("runner/connectors/test");
    std::fs::create_dir_all(&manifests).unwrap();
    let raw = serde_json::to_vec(&manifest()).unwrap();
    std::fs::write(manifests.join("manifest.json"), &raw).unwrap();
    std::fs::write(manifests.join("qa.json"),serde_json::to_vec(&json!({"connector":"test","scenarios":[{"name":"probe","operation":"read","expect":{"status":"ok","assertions":[{"path":"id","op":"eq","value":42}]}}]})).unwrap()).unwrap();
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    listener.set_nonblocking(true).unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let server = std::thread::spawn(move || {
        let deadline = std::time::Instant::now() + Duration::from_secs(8);
        'connections: loop {
            assert!(
                std::time::Instant::now() < deadline,
                "runner request deadline"
            );
            let (mut socket, _) = loop {
                match listener.accept() {
                    Ok(s) => break s,
                    Err(e)
                        if e.kind() == std::io::ErrorKind::WouldBlock
                            && std::time::Instant::now() < deadline =>
                    {
                        std::thread::sleep(Duration::from_millis(10))
                    }
                    Err(e) => panic!("local runner accept: {e}"),
                }
            };
            socket.set_nonblocking(false).unwrap();
            socket
                .set_read_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            let mut data = vec![];
            let request = loop {
                let mut b = [0; 2048];
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
                    assert!(headers
                        .to_lowercase()
                        .contains("authorization: bearer local-fixture"));
                    let len: usize = headers
                        .lines()
                        .find_map(|l| {
                            l.to_lowercase()
                                .strip_prefix("content-length:")
                                .map(|s| s.trim().parse().unwrap())
                        })
                        .unwrap();
                    if data.len() >= end + 4 + len {
                        break serde_json::from_slice::<Value>(&data[end + 4..end + 4 + len])
                            .unwrap();
                    }
                }
            };
            assert_eq!(request["method"], "connector.action.execute");
            assert_eq!(request["params"]["input"]["apiKey"], "synthetic-secret");
            let body =
                json!({"id":request["id"],"ok":true,"result":{"output":{"id":42}}}).to_string();
            write!(
                socket,
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            )
            .unwrap();
            break;
        }
    });
    let out = Command::new(env!("CARGO_BIN_EXE_qa"))
        .current_dir(root.path())
        .env_clear()
        .envs(std::env::var_os("LLVM_PROFILE_FILE").map(|v| ("LLVM_PROFILE_FILE", v)))
        .env("APPCALL_DATABASE_URL", &f.url)
        .env("APPCALL_SECRET_KEY", "07".repeat(32))
        .env("APPCALL_RUNNER_URL", url)
        .env("APPCALL_RUNNER_TOKEN", "local-fixture")
        .args([
            "run",
            "--project",
            "p",
            "--read-only",
            "--json",
            "--require-probe",
        ])
        .output()
        .unwrap();
    assert!(
        out.status.success(),
        "stdout={} stderr={}",
        String::from_utf8_lossy(&out.stdout),
        String::from_utf8_lossy(&out.stderr)
    );
    server.join().unwrap();
    let reports: Value = serde_json::from_slice(&out.stdout).unwrap();
    assert_eq!(reports[0]["overall"], "green");
    assert_eq!(
        reports[0]["operations"][0]["scenarios"][0]["probePassed"],
        true
    );
    assert!(!String::from_utf8_lossy(&out.stdout).contains("synthetic-secret"));
    assert_eq!(
        f.db.query_one("SELECT count(*) FROM action_logs", &[])
            .unwrap()
            .get::<_, i64>(0),
        1
    );
    let saved: Value =
        f.db.query_one(
            "SELECT results FROM qa_connector_status WHERE connector='test'",
            &[],
        )
        .unwrap()
        .get(0);
    assert_eq!(saved["manifestDigest"], reports[0]["manifestDigest"]);
    let report_file = root.path().join("report.json");
    std::fs::write(&report_file, &out.stdout).unwrap();
    let check = || {
        Command::new(env!("CARGO_BIN_EXE_qa"))
            .current_dir(root.path())
            .args(["check", "--report", report_file.to_str().unwrap()])
            .output()
            .unwrap()
    };
    assert!(check().status.success());
    let mut changed = raw;
    changed.push(b'\n');
    std::fs::write(manifests.join("manifest.json"), changed).unwrap();
    let out = check();
    assert!(!out.status.success());
    assert!(String::from_utf8_lossy(&out.stdout).contains("manifest changed"));
}
#[test]
#[ignore = "requires isolated local PostgreSQL and process signals"]
fn sigterm_during_report_persistence_is_not_swallowed() {
    let mut f = Fixture::new();
    let root = tempfile::tempdir().unwrap();
    copy_migrations(root.path());
    let manifests = root.path().join("runner/connectors/test");
    std::fs::create_dir_all(&manifests).unwrap();
    std::fs::write(
        manifests.join("manifest.json"),
        serde_json::to_vec(&manifest()).unwrap(),
    )
    .unwrap();
    let app = format!("signal_{}", uuid::Uuid::new_v4().simple());
    let url = format!("{}&application_name={app}", f.url);
    let mut lockdb = Client::connect(&f.url, NoTls).unwrap();
    let mut tx = lockdb.transaction().unwrap();
    tx.batch_execute("LOCK TABLE qa_connector_status IN ACCESS EXCLUSIVE MODE")
        .unwrap();
    let mut child = ChildGuard::new(
        Command::new(env!("CARGO_BIN_EXE_qa"))
            .current_dir(root.path())
            .env_clear()
            .envs(std::env::var_os("LLVM_PROFILE_FILE").map(|v| ("LLVM_PROFILE_FILE", v)))
            .env("APPCALL_DATABASE_URL", url)
            .env("APPCALL_SECRET_KEY", "07".repeat(32))
            .env("APPCALL_RUNNER_URL", "http://127.0.0.1:1")
            .env("APPCALL_RUNNER_TOKEN", "fixture")
            .args(["run", "--project=p", "--read-only", "--json"])
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .unwrap(),
    );
    let until = std::time::Instant::now() + Duration::from_secs(5);
    loop {
        let waiting:bool=f.db.query_one("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock' AND query LIKE 'INSERT INTO qa_connector_status%')",&[&app]).unwrap().get(0);
        if waiting {
            break;
        };
        assert!(
            std::time::Instant::now() < until,
            "CLI did not reach persistence"
        );
        std::thread::sleep(Duration::from_millis(10));
    }
    assert!(Command::new("kill")
        .args(["-TERM", &child.as_mut().id().to_string()])
        .status()
        .unwrap()
        .success());
    let out = child.finish();
    assert_eq!(
        out.status.code(),
        Some(1),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );
    assert!(String::from_utf8_lossy(&out.stderr).contains("interrupted"));
    tx.rollback().unwrap();
}

#[test]
#[cfg(unix)]
#[ignore = "requires isolated local PostgreSQL and process signals"]
fn qa_total_deadline_and_sigterm_cancel_blocked_sqlx_migration() {
    for signal in [false, true] {
        let mut f = Fixture::migration_only();
        let root = tempfile::tempdir().unwrap();
        write_probe_migration(root.path());
        let manifests = root.path().join("runner/connectors/test");
        std::fs::create_dir_all(&manifests).unwrap();
        std::fs::write(
            manifests.join("manifest.json"),
            serde_json::to_vec(&manifest()).unwrap(),
        )
        .unwrap();
        let app = format!("migration_cancel_{}", uuid::Uuid::new_v4().simple());
        let url = format!("{}&application_name={app}", f.url);
        let ledger_oid: u32 =
            f.db.query_one("SELECT '_sqlx_migrations'::regclass::oid", &[])
                .unwrap()
                .get(0);
        let mut lockdb = Client::connect(&f.url, NoTls).unwrap();
        let mut tx = lockdb.transaction().unwrap();
        tx.batch_execute("LOCK TABLE _sqlx_migrations IN ACCESS EXCLUSIVE MODE")
            .unwrap();
        let mut observer = Client::connect(&f.url, NoTls).unwrap();
        let started = std::time::Instant::now();
        let mut child = ChildGuard::new(
            Command::new(env!("CARGO_BIN_EXE_qa"))
                .current_dir(root.path())
                .env_clear()
                .envs(std::env::var_os("LLVM_PROFILE_FILE").map(|v| ("LLVM_PROFILE_FILE", v)))
                .env("APPCALL_DATABASE_URL", &url)
                .env("APPCALL_SECRET_KEY", "07".repeat(32))
                .env("APPCALL_RUNNER_URL", "http://127.0.0.1:1")
                .args([
                    "run",
                    "--project=p",
                    "--timeout",
                    if signal { "10s" } else { "3s" },
                ])
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped())
                .spawn()
                .unwrap(),
        );
        let migration_pid = wait_for_migration_lock(&mut observer, ledger_oid, &mut child, started);
        let migration_started = std::time::Instant::now();
        if signal {
            assert!(Command::new("kill")
                .args(["-TERM", &child.as_mut().id().to_string()])
                .status()
                .unwrap()
                .success());
        }
        while child.as_mut().try_wait().unwrap().is_none() {
            if migration_started.elapsed() > Duration::from_secs(6) {
                let _ = child.as_mut().kill();
                let _ = child.as_mut().wait();
                panic!("blocked migration did not stop within its bounded drain");
            }
            std::thread::sleep(Duration::from_millis(5));
        }
        let output = child.finish();
        assert!(!output.status.success());
        assert!(
            migration_started.elapsed() < Duration::from_secs(if signal { 2 } else { 4 }),
            "signal={signal} elapsed={:?}",
            migration_started.elapsed()
        );
        let remaining: i64 =
            f.db.query_one(
                "SELECT count(*) FROM pg_stat_activity WHERE pid=$1",
                &[&migration_pid],
            )
            .unwrap()
            .get(0);
        assert_eq!(
            remaining, 0,
            "migration connection must close before process exits"
        );
        assert!(!String::from_utf8_lossy(&output.stderr).contains(&url));
        tx.rollback().unwrap();
    }
}
