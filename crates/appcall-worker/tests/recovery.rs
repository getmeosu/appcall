use std::{
    io::{Read, Write},
    net::{SocketAddr, TcpListener, TcpStream},
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};
struct Database {
    root: PathBuf,
    port: u16,
    bin: PathBuf,
}
impl Database {
    fn command(&self, name: &str) -> Command {
        Command::new(self.bin.join(name))
    }
    fn start(&self) {
        assert!(self
            .command("pg_ctl")
            .arg("-D")
            .arg(self.root.join("data"))
            .arg("-l")
            .arg(self.root.join("postgres.log"))
            .args(["-w", "start", "-o"])
            .arg(format!("-h 127.0.0.1 -p {} -k /tmp -F", self.port))
            .stdout(Stdio::null())
            .status()
            .unwrap()
            .success());
    }
    fn stop(&self) {
        assert!(self
            .command("pg_ctl")
            .arg("-D")
            .arg(self.root.join("data"))
            .args(["-m", "immediate", "-w", "stop"])
            .stdout(Stdio::null())
            .status()
            .unwrap()
            .success());
    }
}
impl Drop for Database {
    fn drop(&mut self) {
        let _ = self
            .command("pg_ctl")
            .arg("-D")
            .arg(self.root.join("data"))
            .args(["-m", "immediate", "-w", "stop"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        let _ = std::fs::remove_dir_all(&self.root);
    }
}
struct Process(Child);
impl Drop for Process {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}
fn readiness(addr: SocketAddr) -> Option<u16> {
    let Ok(mut socket) = TcpStream::connect_timeout(&addr, Duration::from_millis(200)) else {
        return None;
    };
    socket
        .set_read_timeout(Some(Duration::from_secs(1)))
        .unwrap();
    if socket
        .write_all(b"GET /readyz HTTP/1.1\r\nHost: local\r\n\r\n")
        .is_err()
    {
        return None;
    }
    let mut out = String::new();
    socket.read_to_string(&mut out).ok()?;
    out.split_whitespace().nth(1)?.parse().ok()
}
fn wait_ready(addr: SocketAddr, want: bool, child: &mut Process) {
    let deadline = Instant::now() + Duration::from_secs(20);
    loop {
        assert!(child.0.try_wait().unwrap().is_none(), "worker exited");
        if readiness(addr) == Some(if want { 200 } else { 503 }) {
            return;
        }
        assert!(
            Instant::now() < deadline,
            "worker readiness did not become {want}"
        );
        std::thread::sleep(Duration::from_millis(20));
    }
}
#[test]
#[ignore = "launches isolated initdb cluster and loopback worker/runner processes"]
fn daemon_recovers_lost_session_and_database_restart_without_provider_replay() {
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let root = std::env::temp_dir().join(format!("worker_recovery_{}_{stamp}", std::process::id()));
    std::fs::create_dir_all(&root).unwrap();
    let port = TcpListener::bind("127.0.0.1:0")
        .unwrap()
        .local_addr()
        .unwrap()
        .port();
    let db = Database {
        root,
        port,
        bin: std::env::var_os("APPCALL_TEST_POSTGRES_BIN")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("/opt/homebrew/bin")),
    };
    assert!(db
        .command("initdb")
        .arg("-D")
        .arg(db.root.join("data"))
        .args(["-A", "trust", "-U", "fixture"])
        .stdout(Stdio::null())
        .status()
        .unwrap()
        .success());
    db.start();
    let url = format!("postgres://fixture@127.0.0.1:{port}/postgres?sslmode=disable");
    let mut admin = postgres::Client::connect(&url, postgres::NoTls).unwrap();
    appcall_runtime::SqlxMigration::new(
        concat!(env!("CARGO_MANIFEST_DIR"), "/../../migrations"),
        &url,
        Duration::from_secs(30),
    )
    .unwrap()
    .apply()
    .unwrap();
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    listener.set_nonblocking(true).unwrap();
    let runner_url = format!("http://{}", listener.local_addr().unwrap());
    let stop = Arc::new(AtomicBool::new(false));
    let stopped = stop.clone();
    let calls = Arc::new(AtomicUsize::new(0));
    let called = calls.clone();
    let server = std::thread::spawn(move || {
        'connections: while !stopped.load(Ordering::Acquire) {
            let (mut socket, _) = match listener.accept() {
                Ok(v) => v,
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(Duration::from_millis(5));
                    continue;
                }
                Err(e) => panic!("{e}"),
            };
            socket.set_nonblocking(false).unwrap();
            socket
                .set_read_timeout(Some(Duration::from_secs(2)))
                .unwrap();
            let mut raw = Vec::new();
            let request = loop {
                let mut bytes = [0; 4096];
                let n = match socket.read(&mut bytes) {
                    Ok(0) if raw.is_empty() => continue 'connections,
                    Err(error)
                        if raw.is_empty()
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
                raw.extend_from_slice(&bytes[..n]);
                if let Some(end) = raw.windows(4).position(|x| x == b"\r\n\r\n") {
                    if let Ok(value) = serde_json::from_slice::<serde_json::Value>(&raw[end + 4..])
                    {
                        break value;
                    }
                }
            };
            assert_eq!(request["method"], "runner.describe");
            called.fetch_add(1, Ordering::SeqCst);
            let body=serde_json::json!({"id":request["id"],"ok":true,"result":{"protocolVersion":"2026-05-14","runner":"fixture","durableCapabilities":["absolute-deadline","bounded-rpc","cancellation"]}}).to_string();
            write!(
                socket,
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            )
            .unwrap();
        }
    });
    let health = TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = health.local_addr().unwrap();
    drop(health);
    let log = std::fs::File::create(db.root.join("worker.log")).unwrap();
    let mut child = Process(
        Command::new(env!("CARGO_BIN_EXE_appcall-worker"))
            .env_clear()
            .envs(std::env::var_os("LLVM_PROFILE_FILE").map(|value| ("LLVM_PROFILE_FILE", value)))
            .env(
                "APPCALL_DATABASE_URL",
                format!("{url}&application_name=worker_recovery_fixture"),
            )
            .env("APPCALL_SECRET_KEY", "ab".repeat(32))
            .env("APPCALL_OAUTH_STATE_SECRET", "cd".repeat(32))
            .env(
                "APPCALL_CONNECTOR_DIR",
                concat!(env!("CARGO_MANIFEST_DIR"), "/../../runner/connectors"),
            )
            .env("APPCALL_RUNNER_URL", runner_url)
            .env("APPCALL_WORKER_HTTP_ADDR", addr.to_string())
            .env("APPCALL_WORKER_INTERVAL_MS", "50")
            .stdout(log.try_clone().unwrap())
            .stderr(log)
            .spawn()
            .unwrap(),
    );
    wait_ready(addr, true, &mut child);
    let pid:i32=admin.query_one("SELECT pid FROM pg_stat_activity WHERE application_name='worker_recovery_fixture' ORDER BY backend_start LIMIT 1",&[]).unwrap().get(0);
    admin
        .query_one("SELECT pg_terminate_backend($1)", &[&pid])
        .unwrap();
    wait_ready(addr, false, &mut child);
    wait_ready(addr, true, &mut child);
    db.stop();
    wait_ready(addr, false, &mut child);
    db.start();
    wait_ready(addr, true, &mut child);
    assert_eq!(
        calls.load(Ordering::SeqCst),
        1,
        "recovery must not replay provider work"
    );
    assert!(Command::new("kill")
        .args(["-TERM", &child.0.id().to_string()])
        .status()
        .unwrap()
        .success());
    let deadline = Instant::now() + Duration::from_secs(10);
    loop {
        if let Some(status) = child.0.try_wait().unwrap() {
            assert!(status.success());
            break;
        }
        assert!(Instant::now() < deadline, "worker did not drain");
        std::thread::sleep(Duration::from_millis(20));
    }
    stop.store(true, Ordering::Release);
    server.join().unwrap();
}
