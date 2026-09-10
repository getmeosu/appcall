use appcall_actions::*;
use appcall_runner_client::{ClientOptions, RunnerClient};
use serde_json::{json, Value};
use std::{
    io::{Read, Write},
    net::{SocketAddr, TcpListener, TcpStream},
    path::PathBuf,
    process::{Child, Command, Stdio},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
fn attempt() -> Attempt {
    Attempt {
        request_id: "req_adapter".into(),
        project_id: "p".into(),
        connection_id: "c".into(),
        connector: "slack".into(),
        external_account_id: "brand".into(),
        action: "messages.send".into(),
        key: String::new(),
        input_hash: String::new(),
        lease_ms: 1000,
    }
}
fn deadline() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64
        + 5000
}
#[test]
#[ignore = "opens local runner sockets"]
fn runner_adapter_keeps_typed_rate_retry_and_bounds_unknown_or_oversized_responses() {
    use std::io::{Read, Write};
    let rt = tokio::runtime::Runtime::new().unwrap();
    for mode in ["success", "rate", "busy", "malformed", "oversized"] {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let thread = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            let mut bytes = vec![];
            let mut chunk = [0; 4096];
            let split = loop {
                let n = socket.read(&mut chunk).unwrap();
                assert!(n > 0);
                bytes.extend_from_slice(&chunk[..n]);
                if let Some(p) = bytes.windows(4).position(|w| w == b"\r\n\r\n") {
                    break p + 4;
                }
            };
            let head = std::str::from_utf8(&bytes[..split]).unwrap();
            let length: usize = head
                .lines()
                .find_map(|l| {
                    l.to_lowercase()
                        .strip_prefix("content-length:")
                        .map(|s| s.trim().parse().unwrap())
                })
                .unwrap();
            while bytes.len() < split + length {
                let n = socket.read(&mut chunk).unwrap();
                assert!(n > 0);
                bytes.extend_from_slice(&chunk[..n]);
            }
            let request: Value = serde_json::from_slice(&bytes[split..split + length]).unwrap();
            assert_eq!(request["method"], "connector.action.execute");
            let (status, body)=match mode {
                "success"=>(200,json!({"id":request["id"],"ok":true,"result":{"output":{"sent":true}}}).to_string()),
                "rate"=>(200,json!({"id":request["id"],"ok":false,"error":{"code":"CONNECTOR_RATE_LIMITED","message":"provider detail runtime/key runtime%2Fkey","retryAfterSeconds":7}}).to_string()),
                "busy"=>(503,json!({"id":request["id"],"ok":false,"error":{"code":"RUNNER_BUSY","message":"Runner admission limit reached."}}).to_string()),
                "oversized"=>(200,"x".repeat(4000)),
                _=>(200,"not json".into()),
            };
            let _=write!(socket,"HTTP/1.1 {status} Test\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",body.len(),body);
        });
        let runner = RunnerClient::new(
            &url,
            "",
            ClientOptions {
                max_response_bytes: 1024,
                ..Default::default()
            },
        )
        .unwrap();
        let result = rt.block_on(ActionRunner::execute(
            &runner,
            &attempt(),
            json!({"text":"hi","dsn":"runtime/key"}),
            deadline(),
        ));
        thread.join().unwrap();
        match mode {
            "success" => assert_eq!(result.unwrap(), json!({"sent":true})),
            "rate" => {
                let e = result.unwrap_err();
                assert_eq!(e.code, "CONNECTOR_RATE_LIMITED");
                assert!(e.transient);
                assert_eq!(e.retry_after_ms, 7000);
                let message = e.detail.unwrap().safe_message.unwrap();
                assert!(message.contains("provider detail"));
                assert!(!message.contains("runtime"));
            }
            "busy" => {
                let e = result.unwrap_err();
                assert_eq!(e.code, "RUNNER_BUSY");
                assert!(e.transient);
                assert_eq!(e.outcome, ActionDispatchOutcome::NotDispatched);
            }
            "oversized" => assert_eq!(result.unwrap_err().code, "ACTION_RESPONSE_TOO_LARGE"),
            _ => {
                let e = result.unwrap_err();
                assert_eq!(e.code, "ACTION_FAILED");
                assert_eq!(e.outcome, ActionDispatchOutcome::Unknown);
            }
        }
    }
    let closed = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://{}", closed.local_addr().unwrap());
    drop(closed);
    let runner = RunnerClient::new(
        &url,
        "",
        ClientOptions {
            timeout: Duration::from_millis(100),
            ..Default::default()
        },
    )
    .unwrap();
    let e = rt
        .block_on(ActionRunner::execute(
            &runner,
            &attempt(),
            json!({}),
            deadline(),
        ))
        .unwrap_err();
    assert_eq!(e.code, "CONNECTOR_UNAVAILABLE");
    assert!(e.transient);
    let e = rt
        .block_on(ActionRunner::execute(&runner, &attempt(), json!({}), 1))
        .unwrap_err();
    assert_eq!(e.code, "ACTION_TIMEOUT");
    assert!(!e.transient);
}
#[test]
fn real_catalog_rejects_sync_dispatch_and_invalid_action_schemas() {
    let registry = appcall_connectors::Registry::load(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../runner/connectors"
    ))
    .unwrap();
    assert_eq!(
        ActionCatalog::operation(&registry, "ashby", "jobs.list")
            .unwrap_err()
            .code,
        "UNKNOWN_ACTION"
    );
    assert_eq!(
        ActionCatalog::operation(&registry, "missing", "healthcheck")
            .unwrap_err()
            .code,
        "UNKNOWN_ACTION"
    );
    assert_eq!(
        ActionCatalog::validate_input(&registry, "ashby", "healthcheck", &json!({"forged":true}))
            .unwrap_err()
            .code,
        "INVALID_ACTION_INPUT"
    );
    assert_eq!(
        ActionCatalog::validate_output(&registry, "ashby", "healthcheck", &json!({"status":1}))
            .unwrap_err()
            .code,
        "ACTION_RESPONSE_INVALID"
    );
}

#[test]
#[ignore = "requires Bun on PATH and starts a real local createFetchHandler process"]
// The Rust process-suite convention is opt-in here because CI installs Bun in
// the separate runner-tests job; run this target with `-- --ignored` locally.
fn issue_69_real_bun_admission_maps_saturation_and_draining_to_retryable_not_dispatched() {
    let runtime = tokio::runtime::Runtime::new().unwrap();
    runtime.block_on(async {
        let saturated = BunAdmissionProcess::start("saturated");
        let client = saturated.client();
        let first = tokio::spawn(run_action(client.clone(), "issue69-saturated-held"));
        saturated.wait_for_state("actionCalls", 1);

        let error = run_action(client.clone(), "issue69-saturated-rejected")
            .await
            .unwrap_err();
        assert_runner_busy(error);
        assert_eq!(saturated.state()["actionCalls"], 1);

        saturated.release_action();
        first.await.unwrap().unwrap();
        drop(saturated);

        let draining = BunAdmissionProcess::start("draining");
        let client = draining.client();
        let first = tokio::spawn(run_action(client.clone(), "issue69-draining-first"));
        draining.wait_for_state("actionCalls", 1);

        let queued = tokio::spawn(run_action(client.clone(), "issue69-draining-queued"));
        draining.wait_for_state("arrivals", 2);
        draining.release_action();
        first.await.unwrap().unwrap();
        draining.wait_for_state("actionCalls", 2);

        let error = run_action(client.clone(), "issue69-draining-rejected")
            .await
            .unwrap_err();
        assert_runner_busy(error);
        assert_eq!(draining.state()["actionCalls"], 2);

        draining.release_action();
        queued.await.unwrap().unwrap();
    });
}

async fn run_action(
    client: RunnerClient,
    request_id: &'static str,
) -> std::result::Result<Value, RunnerFailure> {
    ActionRunner::execute(
        &client,
        &attempt_with_request_id(request_id),
        json!({}),
        deadline(),
    )
    .await
}

fn attempt_with_request_id(request_id: &str) -> Attempt {
    Attempt {
        request_id: request_id.into(),
        connector: "fake".into(),
        action: "messages.send".into(),
        ..attempt()
    }
}

fn assert_runner_busy(error: RunnerFailure) {
    assert_eq!(error.code, "RUNNER_BUSY");
    assert!(error.transient);
    assert_eq!(error.outcome, ActionDispatchOutcome::NotDispatched);
}

struct BunAdmissionProcess {
    child: Child,
    address: SocketAddr,
}

impl BunAdmissionProcess {
    fn start(mode: &str) -> Self {
        let address = TcpListener::bind("127.0.0.1:0")
            .unwrap()
            .local_addr()
            .unwrap();
        let repo_root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
        let script = r#"
const { defaultConnectorRegistry } = await import(Bun.env.ISSUE69_REGISTRY_MODULE);
const { createFetchHandler } = await import(Bun.env.ISSUE69_SERVE_MODULE);
const mode = Bun.env.ISSUE69_MODE;
let arrivals = 0;
let actionCalls = 0;
const releases = [];
defaultConnectorRegistry.executeAction = () => {
  actionCalls += 1;
  return { ok: true, output: new Promise(resolve => releases.push(resolve)) };
};
const handler = createFetchHandler({
  maxConcurrent: 1,
  maxQueued: mode === "draining" ? 1 : 0,
  ...(mode === "draining" ? { maxJobs: 1 } : {}),
});
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: Number(Bun.env.ISSUE69_RUNNER_PORT),
  fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === "/__issue69/state") {
      return Response.json({ mode, arrivals, actionCalls, pending: releases.length });
    }
    if (path === "/__issue69/release") {
      const release = releases.shift();
      if (!release) return Response.json({ ok: false }, { status: 409 });
      release({ sent: true });
      return Response.json({ ok: true });
    }
    if (path === "/rpc") arrivals += 1;
    return handler(request);
  },
});
console.info(JSON.stringify({ component: "issue69-test-runner", event: "started", port: server.port }));
"#;
        let mut command = Command::new("bun");
        command
            .arg("--eval")
            .arg(script)
            .env(
                "ISSUE69_REGISTRY_MODULE",
                repo_root.join("runner/bun/src/registry.ts"),
            )
            .env(
                "ISSUE69_SERVE_MODULE",
                repo_root.join("runner/bun/src/serve.ts"),
            )
            .env("ISSUE69_MODE", mode)
            .env("ISSUE69_RUNNER_PORT", address.port().to_string())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        let mut process = Self {
            child: command.spawn().unwrap(),
            address,
        };
        process.wait_until_ready();
        process
    }

    fn client(&self) -> RunnerClient {
        RunnerClient::new(
            &format!("http://{}", self.address),
            "",
            ClientOptions {
                timeout: Duration::from_secs(5),
                ..ClientOptions::default()
            },
        )
        .unwrap()
    }

    fn wait_until_ready(&mut self) {
        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            if let Some(status) = self.child.try_wait().unwrap() {
                panic!("Bun runner exited before readiness: {status}");
            }
            if let Ok(mut socket) = TcpStream::connect(self.address) {
                socket
                    .set_read_timeout(Some(Duration::from_secs(1)))
                    .unwrap();
                socket
                    .write_all(
                        b"GET /healthz HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n",
                    )
                    .unwrap();
                if read_http_response(&mut socket).0 == 200 {
                    return;
                }
            }
            assert!(Instant::now() < deadline, "Bun runner readiness timed out");
            std::thread::sleep(Duration::from_millis(20));
        }
    }

    fn state(&self) -> Value {
        let mut socket = TcpStream::connect(self.address).unwrap();
        socket
            .set_read_timeout(Some(Duration::from_secs(1)))
            .unwrap();
        write!(
            socket,
            "GET /__issue69/state HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n"
        )
        .unwrap();
        let (status, body) = read_http_response(&mut socket);
        assert_eq!(status, 200);
        serde_json::from_slice(&body).unwrap()
    }

    fn wait_for_state(&self, field: &str, expected: u64) {
        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            let state = self.state();
            if state[field].as_u64().unwrap_or_default() >= expected {
                return;
            }
            assert!(
                Instant::now() < deadline,
                "Bun runner state {field} timed out: {state}"
            );
            std::thread::sleep(Duration::from_millis(20));
        }
    }

    fn release_action(&self) {
        let mut socket = TcpStream::connect(self.address).unwrap();
        socket
            .set_read_timeout(Some(Duration::from_secs(1)))
            .unwrap();
        write!(
            socket,
            "GET /__issue69/release HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n"
        )
        .unwrap();
        let (status, body) = read_http_response(&mut socket);
        assert_eq!(
            status,
            200,
            "release response: {}",
            String::from_utf8_lossy(&body)
        );
    }
}

impl Drop for BunAdmissionProcess {
    fn drop(&mut self) {
        if self.child.try_wait().unwrap().is_none() {
            let _ = self.child.kill();
        }
        let _ = self.child.wait();
    }
}

fn read_http_response(socket: &mut TcpStream) -> (u16, Vec<u8>) {
    let mut bytes = Vec::new();
    let header_end;
    loop {
        let mut chunk = [0; 4096];
        let count = socket.read(&mut chunk).unwrap();
        assert!(count > 0, "HTTP response ended before headers");
        bytes.extend_from_slice(&chunk[..count]);
        assert!(bytes.len() <= 65536, "HTTP response exceeded test bound");
        if let Some(position) = bytes.windows(4).position(|window| window == b"\r\n\r\n") {
            header_end = position;
            break;
        }
    }
    let headers = String::from_utf8_lossy(&bytes[..header_end]);
    let status = headers
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .and_then(|value| value.parse::<u16>().ok())
        .unwrap();
    let content_length = headers.lines().find_map(|line| {
        let (name, value) = line.split_once(':')?;
        name.eq_ignore_ascii_case("content-length")
            .then(|| value.trim().parse::<usize>().unwrap())
    });
    let body_start = header_end + 4;
    if let Some(length) = content_length {
        assert!(length <= 65536, "HTTP response body exceeded test bound");
        while bytes.len() < body_start + length {
            let mut chunk = [0; 4096];
            let count = socket.read(&mut chunk).unwrap();
            assert!(count > 0, "HTTP response ended before its body");
            bytes.extend_from_slice(&chunk[..count]);
            assert!(
                bytes.len() <= body_start + length,
                "HTTP response exceeded body length"
            );
        }
        (status, bytes[body_start..body_start + length].to_vec())
    } else {
        socket.read_to_end(&mut bytes).unwrap();
        (status, bytes[body_start..].to_vec())
    }
}
