//! Actual executable contracts for ephemeral development without AppCall PostgreSQL.
use serde_json::{json, Value};
use std::{
    io::{Read, Write},
    net::{SocketAddr, TcpListener, TcpStream},
    process::{Child, Command, Stdio},
    time::{Duration, Instant},
};

const KEY: &str = "synthetic-memory-platform-key";
#[test]
fn signal_memory_canonical_stream_is_persistent_and_legacy_redirects() {
    let host = Host::start(&[]);
    let mut socket = TcpStream::connect(host.address).unwrap();
    socket
        .set_read_timeout(Some(Duration::from_secs(3)))
        .unwrap();
    write!(
        socket,
        "GET /app/triggers/stream?cursor=a%2Fb HTTP/1.1\r\nHost: {}\r\nConnection: close\r\n\r\n",
        host.address
    )
    .unwrap();
    let mut legacy = String::new();
    // Read a bounded first response chunk: a regression must not wait on an SSE body.
    let mut buffer = [0; 4096];
    let count = socket.read(&mut buffer).unwrap();
    legacy.push_str(std::str::from_utf8(&buffer[..count]).unwrap());
    assert!(legacy.starts_with("HTTP/1.1 301"), "{legacy}");
    assert!(legacy
        .to_lowercase()
        .contains("location: /app/events/stream?cursor=a%2fb"));
    let mut socket = TcpStream::connect(host.address).unwrap();
    socket
        .set_read_timeout(Some(Duration::from_secs(3)))
        .unwrap();
    write!(
        socket,
        "GET /app/events/stream HTTP/1.1\r\nHost: {}\r\n\r\n",
        host.address
    )
    .unwrap();
    let mut response = String::new();
    while !response.contains(": connected") {
        let count = socket.read(&mut buffer).unwrap();
        assert!(count > 0, "stream ended: {response}");
        response.push_str(std::str::from_utf8(&buffer[..count]).unwrap());
        assert!(response.len() < 16384);
    }
    assert!(response.starts_with("HTTP/1.1 200"));
    assert!(response.to_lowercase().contains("text/event-stream"));
}

#[test]
fn signal_fonts_survive_real_http_without_text_conversion() {
    let host = Host::start(&[]);
    for name in [
        "archivo-latin-variable.woff2",
        "ibm-plex-mono-variable.woff2",
    ] {
        let mut socket = TcpStream::connect(host.address).unwrap();
        socket
            .set_read_timeout(Some(Duration::from_secs(10)))
            .unwrap();
        write!(
            socket,
            "GET /static/fonts/{name} HTTP/1.1\r\nHost: {}\r\nConnection: close\r\n\r\n",
            host.address
        )
        .unwrap();
        let mut bytes = Vec::new();
        socket.read_to_end(&mut bytes).unwrap();
        let split = bytes.windows(4).position(|v| v == b"\r\n\r\n").unwrap();
        let headers = std::str::from_utf8(&bytes[..split])
            .unwrap()
            .to_ascii_lowercase();
        assert!(headers.starts_with("http/1.1 200"), "{name}: {headers}");
        assert!(headers.contains("content-type: font/woff2"));
        assert!(headers.contains("x-content-type-options: nosniff"));
        let expected = std::fs::read(format!(
            "{}/../appcall-web/static/fonts/{name}",
            env!("CARGO_MANIFEST_DIR")
        ))
        .unwrap();
        assert_eq!(&expected[..4], b"wOF2");
        assert!(std::str::from_utf8(&expected).is_err());
        assert_eq!(&bytes[split + 4..], expected);
    }
}
struct Host {
    child: Child,
    address: SocketAddr,
}
impl Host {
    fn start(extra: &[(&str, &str)]) -> Self {
        let address = TcpListener::bind("127.0.0.1:0")
            .unwrap()
            .local_addr()
            .unwrap();
        let mut command = Command::new(env!("CARGO_BIN_EXE_appcall-api"));
        command
            .env_clear()
            .envs(std::env::var_os("LLVM_PROFILE_FILE").map(|v| ("LLVM_PROFILE_FILE", v)))
            .env("PATH", "/nonexistent-appcall-test-path")
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
        for (key, value) in extra {
            command.env(key, value);
        }
        let mut host = Self {
            child: command.spawn().unwrap(),
            address,
        };
        let end = Instant::now() + Duration::from_secs(20);
        loop {
            if let Some(status) = host.child.try_wait().unwrap() {
                let mut error = String::new();
                host.child
                    .stderr
                    .take()
                    .unwrap()
                    .read_to_string(&mut error)
                    .unwrap();
                panic!("memory host exited {status}: {error}");
            }
            if TcpStream::connect(address).is_ok() {
                return host;
            }
            assert!(Instant::now() < end, "memory startup timed out");
            std::thread::sleep(Duration::from_millis(20));
        }
    }
    fn request(&self, method: &str, path: &str, authenticated: bool, body: &str) -> (u16, String) {
        let mut socket = TcpStream::connect(self.address).unwrap();
        socket
            .set_read_timeout(Some(Duration::from_secs(10)))
            .unwrap();
        let key = if authenticated {
            format!("X-API-Key: {KEY}\r\nX-External-Account-Id: synthetic-memory-brand\r\n")
        } else {
            String::new()
        };
        write!(socket, "{method} {path} HTTP/1.1\r\nHost: {}\r\n{key}Content-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", self.address, body.len()).unwrap();
        let mut response = String::new();
        socket.read_to_string(&mut response).unwrap();
        let status = response.split_whitespace().nth(1).unwrap().parse().unwrap();
        (
            status,
            response.split_once("\r\n\r\n").unwrap().1.to_owned(),
        )
    }
    fn json(&self, method: &str, path: &str, expected: u16, body: Value) -> Value {
        let (status, text) = self.request(method, path, true, &body.to_string());
        assert_eq!(status, expected, "{method} {path}: {text}");
        serde_json::from_str(&text).unwrap()
    }
    fn graceful_stop(&mut self) {
        assert!(Command::new("/bin/kill")
            .args(["-TERM", &self.child.id().to_string()])
            .status()
            .unwrap()
            .success());
        let end = Instant::now() + Duration::from_secs(10);
        loop {
            if let Some(status) = self.child.try_wait().unwrap() {
                assert!(status.success());
                return;
            }
            assert!(Instant::now() < end, "memory shutdown timed out");
            std::thread::sleep(Duration::from_millis(20));
        }
    }
}
impl Drop for Host {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

#[test]
#[ignore = "binds actual application process on loopback"]
fn memory_api_dashboard_actions_and_restart_share_ephemeral_state() {
    let mut host = Host::start(&[]);
    assert_eq!(host.request("GET", "/readyz", false, "").0, 200);
    assert_eq!(host.request("GET", "/v1/connections", false, "").0, 401);
    let catalog = host.json("GET", "/v1/connectors", 200, Value::Null);
    assert!(catalog["connectors"]
        .as_array()
        .unwrap()
        .iter()
        .any(|c| c["key"] == "telegram"));
    let created = host.json(
        "POST",
        "/v1/connectors/telegram/setup/api-key",
        201,
        json!({"fields":{"botToken":"synthetic-token-only"}}),
    );
    let id = created["connection"]["id"]
        .as_str()
        .expect("setup connection id");
    let result = host.json(
        "POST",
        &format!("/v1/connections/{id}/actions/bot.getMe"),
        200,
        json!({"input":{}}),
    );
    assert_eq!(result["output"]["mode"], "local");
    assert!(!result.to_string().contains("synthetic-token-only"));
    assert!(result["replayLogId"]
        .as_str()
        .is_some_and(|s| !s.is_empty()));
    for path in [
        "/app",
        "/app/connectors",
        "/app/connections",
        "/app/logs",
        "/app/events",
        "/app/usage",
    ] {
        let (status, _) = host.request("GET", path, false, "");
        assert_eq!(status, 200, "{path}");
    }
    let (status, certification) = host.request("GET", "/app/certification", false, "");
    assert_eq!(status, 403);
    assert!(!certification.contains("manifestFingerprint"));
    assert_eq!(host.request("GET", "/v1/unipile/accounts", true, "").0, 404);
    let rows = host.json("GET", "/v1/connections", 200, Value::Null);
    assert_eq!(rows["connections"].as_array().unwrap().len(), 1);
    host.graceful_stop();
    let restarted = Host::start(&[]);
    let rows = restarted.json("GET", "/v1/connections", 200, Value::Null);
    assert!(rows["connections"].as_array().unwrap().is_empty());
}

#[test]
#[ignore = "binds actual application process on loopback"]
fn memory_missing_platform_key_preserves_health_only_mode() {
    let host = Host::start(&[("APPCALL_DEV_API_KEY", "")]);
    assert_eq!(host.request("GET", "/healthz", false, "").0, 200);
    assert_eq!(host.request("GET", "/readyz", false, "").0, 200);
    for path in ["/app", "/v1/connectors", "/mcp"] {
        assert_eq!(host.request("GET", path, false, "").0, 404);
    }
}

#[test]
#[ignore = "binds actual application process on loopback"]
fn memory_registry_failure_preserves_health_only_mode() {
    let host = Host::start(&[("APPCALL_CONNECTOR_DIR", "/nonexistent-appcall-connectors")]);
    assert_eq!(host.request("GET", "/healthz", false, "").0, 200);
    assert_eq!(host.request("GET", "/readyz", false, "").0, 200);
    for path in ["/app", "/v1/connections", "/mcp"] {
        assert_eq!(host.request("GET", path, true, "").0, 404);
    }
}

#[test]
#[ignore = "launches actual application processes"]
fn unsafe_or_partially_configured_hosts_never_fall_back_to_memory() {
    let cases = [
        ("APPCALL_ENV", "production"),
        ("APPCALL_ENV", " PrOd "),
        ("APPCALL_DATABASE_URL", " "),
        ("APPCALL_DATABASE_URL", "invalid-database-synthetic-marker"),
        ("APPCALL_SESSION_SECRET", ""),
        ("ANUSA_JWT_ACCESS_SECRET", ""),
        ("APPCALL_HTTP_ADDR", "0.0.0.0:0"),
    ];
    for (key, value) in cases {
        let mut child = Command::new(env!("CARGO_BIN_EXE_appcall-api"))
            .env_clear()
            .envs(std::env::var_os("LLVM_PROFILE_FILE").map(|v| ("LLVM_PROFILE_FILE", v)))
            .env("PATH", "/nonexistent-appcall-test-path")
            .env("APPCALL_ENV", "development")
            .env("APPCALL_DEV_API_KEY", KEY)
            .env("APPCALL_HTTP_ADDR", "127.0.0.1:0")
            .env(
                "APPCALL_CONNECTOR_DIR",
                concat!(env!("CARGO_MANIFEST_DIR"), "/../../runner/connectors"),
            )
            .env(key, value)
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap();
        let end = Instant::now() + Duration::from_secs(20);
        let status = loop {
            if let Some(status) = child.try_wait().unwrap() {
                break status;
            }
            if Instant::now() >= end {
                let _ = child.kill();
                let _ = child.wait();
                panic!("invalid {key} left a live host");
            }
            std::thread::sleep(Duration::from_millis(20));
        };
        assert!(!status.success(), "invalid {key} was accepted");
        let mut error = String::new();
        child
            .stderr
            .take()
            .unwrap()
            .read_to_string(&mut error)
            .unwrap();
        assert!(error.contains("rust_api_startup_failed"));
        assert!(!error.contains("synthetic-marker"));
    }
}

#[test]
#[ignore = "launches application and runner simulator on loopback"]
fn memory_configured_runner_uses_rpc_and_injects_stored_credentials() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    listener.set_nonblocking(true).unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let server = std::thread::spawn(move || {
        let end = Instant::now() + Duration::from_secs(30);
        let mut seen = Vec::new();
        while seen.len() < 3 {
            let mut socket = match listener.accept() {
                Ok((socket, _)) => socket,
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    assert!(Instant::now() < end, "runner RPC missing");
                    std::thread::sleep(Duration::from_millis(10));
                    continue;
                }
                Err(e) => panic!("runner accept: {e}"),
            };
            socket.set_nonblocking(false).unwrap();
            socket
                .set_read_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            let mut bytes = Vec::new();
            let mut chunk = [0; 4096];
            let split = loop {
                let n = socket.read(&mut chunk).unwrap();
                assert!(n > 0);
                bytes.extend_from_slice(&chunk[..n]);
                assert!(bytes.len() < 65536);
                if let Some(p) = bytes.windows(4).position(|w| w == b"\r\n\r\n") {
                    break p + 4;
                }
            };
            let head = std::str::from_utf8(&bytes[..split]).unwrap();
            let length: usize = head
                .lines()
                .find_map(|line| {
                    let (name, value) = line.split_once(':')?;
                    name.eq_ignore_ascii_case("content-length")
                        .then(|| value.trim().parse().unwrap())
                })
                .unwrap();
            assert!(length < 65536);
            while bytes.len() < split + length {
                let n = socket.read(&mut chunk).unwrap();
                assert!(n > 0);
                bytes.extend_from_slice(&chunk[..n]);
            }
            let rpc: Value = serde_json::from_slice(&bytes[split..split + length]).unwrap();
            assert_eq!(rpc["params"]["input"]["botToken"], "synthetic-runner-token");
            let method = rpc["method"].as_str().unwrap();
            let result = if method == "connector.healthcheck" {
                json!({"status":"ok","source":"provider"})
            } else {
                assert_eq!(method, "connector.action.execute");
                match rpc["params"]["action"].as_str().unwrap() {
                    "credentials.validate" => json!({"output":{"valid":true}}),
                    "bot.getMe" => json!({"output":{"bot":{"id":42,"username":"synthetic_bot"}}}),
                    other => panic!("unexpected RPC action {other}"),
                }
            };
            seen.push((method.to_owned(), rpc["params"]["action"].clone()));
            let body = json!({"id":rpc["id"],"ok":true,"result":result}).to_string();
            write!(socket, "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()).unwrap();
        }
        seen
    });
    let mut host = Host::start(&[("APPCALL_RUNNER_URL", &url)]);
    let created = host.json(
        "POST",
        "/v1/connectors/telegram/setup/api-key",
        201,
        json!({"fields":{"botToken":"synthetic-runner-token"}}),
    );
    let id = created["connection"]["id"].as_str().unwrap();
    let result = host.json(
        "POST",
        &format!("/v1/connections/{id}/actions/bot.getMe"),
        200,
        json!({"input":{}}),
    );
    assert_eq!(result["output"]["bot"]["id"], 42);
    assert!(result["output"]["mode"].is_null());
    assert!(!result.to_string().contains("synthetic-runner-token"));
    assert_eq!(server.join().unwrap().len(), 3);
    host.graceful_stop();
}
