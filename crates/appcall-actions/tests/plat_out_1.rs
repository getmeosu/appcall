//! PLAT-OUT-1: a closed-schema operation dispatched through the real Bun runner
//! (runner/bun/src/serve.ts -> server.ts) and the real ActionService output
//! validation (service.rs validate_output -> appcall_connectors schema.rs).
//! Only the provider HTTP call is stubbed, inside the Bun process.
use appcall_actions::*;
use appcall_runner_client::{ClientOptions, RunnerClient};
use serde_json::{json, Map, Value};
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

#[derive(Default)]
struct State {
    cached: Option<Value>,
    marked: bool,
}
struct Repo {
    state: Arc<Mutex<State>>,
}
impl ActionRepository for Repo {
    async fn record_replay(&self, _: &Attempt, _: &Value) -> Result<String> {
        Ok("replay_plat_out_1".into())
    }
    async fn connection(&self, p: &str, id: &str) -> Result<Connection> {
        Ok(Connection {
            id: id.into(),
            project_id: p.into(),
            external_account_id: "owner".into(),
            connector: "ambient-weather".into(),
            status: "active".into(),
            auth_type: "api_key".into(),
            secret_ref_id: Some("secret".into()),
        })
    }
    async fn acquire(&self, _: &Attempt) -> Result<Acquisition> {
        Ok(Acquisition::Acquired)
    }
    async fn mark_dispatched(&self, _: &Attempt) -> Result<()> {
        self.state.lock().unwrap().marked = true;
        Ok(())
    }
    async fn release_pending(&self, _: &Attempt) -> Result<()> {
        Ok(())
    }
    async fn release_not_dispatched_with_reservation(
        &self,
        _: &Attempt,
        _: &PolicyReservation,
    ) -> Result<()> {
        Ok(())
    }
    async fn finish(&self, _: &Attempt, v: Option<&Value>, _: Option<&str>) -> Result<()> {
        if let Some(v) = v {
            self.state.lock().unwrap().cached = Some(v.clone());
        }
        Ok(())
    }
    async fn finish_read_timeout(&self, _: &Attempt, _: ActionDispatchOutcome) -> Result<()> {
        Ok(())
    }
}
struct Credentials;
impl CredentialResolver for Credentials {
    async fn resolve(&self, _: &Connection, _: &str) -> Result<Map<String, Value>> {
        Ok(json!({"apiKey":"api-key","applicationKey":"app-key"})
            .as_object()
            .unwrap()
            .clone())
    }
}
struct Allow;
impl PolicyGate for Allow {
    async fn authorize(&self, _: &ExecuteRequest, _: &Connection, _: &Operation) -> Result<()> {
        Ok(())
    }
}

fn registry() -> appcall_connectors::Registry {
    appcall_connectors::Registry::load(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../runner/connectors"
    ))
    .unwrap()
}

#[test]
fn ambient_weather_healthcheck_schema_is_closed() {
    // Guards the premise: the op under test keeps a closed top-level schema.
    let registry = registry();
    let op = registry
        .operation("ambient-weather", "healthcheck")
        .unwrap();
    let schema = op.output_schema.as_ref().unwrap();
    assert_eq!(schema["additionalProperties"], json!(false));
    assert!(op.validate_output(&json!({"data": []})).is_ok());
    assert!(op
        .validate_output(&json!({"data": [], "connector": "ambient-weather"}))
        .is_err());
}

#[test]
#[ignore = "requires Bun on PATH and starts a real local createFetchHandler process"]
fn closed_schema_action_passes_real_runner_and_service_validation() {
    let runner = BunRunner::start();
    let runtime = tokio::runtime::Runtime::new().unwrap();
    runtime.block_on(async {
        let state = Arc::new(Mutex::new(State::default()));
        let service = Service::new(
            Repo {
                state: state.clone(),
            },
            registry(),
            Credentials,
            runner.client(),
            Allow,
        );
        let result = service
            .execute(ExecuteRequest {
                project_id: "p".into(),
                connection_id: "c".into(),
                external_account_id: "owner".into(),
                admin_scope: false,
                action: "healthcheck".into(),
                idempotency_key: "plat-out-1".into(),
                input: json!({}),
                caller_credential: String::new(),
            })
            .await;
        let output = match result {
            Ok(result) => result.output,
            Err(error) => panic!("closed-schema action failed: {}", error.code),
        };
        assert_eq!(
            output,
            json!({"data": [{"macAddress": "00:11:22:33:44:55", "info": {"name": "Yard"}}]})
        );
        assert!(state.lock().unwrap().marked);
    });
    assert_eq!(runner.provider_calls(), 1);
}

struct BunRunner {
    child: Child,
    address: SocketAddr,
}

impl BunRunner {
    fn start() -> Self {
        let address = TcpListener::bind("127.0.0.1:0")
            .unwrap()
            .local_addr()
            .unwrap();
        let repo_root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
        // The provider stub replaces fetch before the runner modules load, so the
        // runner's execution-context fetch wrapper forwards to it unchanged.
        // The ppid watchdog stops the child even when the test process is killed
        // and Drop never runs.
        let script = r#"
const parentPid = process.ppid;
setInterval(() => {
  if (process.ppid !== parentPid) process.exit(0);
}, 250);
let providerCalls = 0;
globalThis.fetch = async (input) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.hostname !== "rt.ambientweather.net" || url.pathname !== "/v1/devices") {
    return new Response("unexpected", { status: 599 });
  }
  providerCalls += 1;
  return Response.json([{ macAddress: "00:11:22:33:44:55", info: { name: "Yard" } }]);
};
const { createFetchHandler } = await import(Bun.env.PLAT_OUT_1_SERVE_MODULE);
const handler = createFetchHandler({});
Bun.serve({
  hostname: "127.0.0.1",
  port: Number(Bun.env.PLAT_OUT_1_RUNNER_PORT),
  fetch(request) {
    if (new URL(request.url).pathname === "/__plat_out_1/state") {
      return Response.json({ providerCalls });
    }
    return handler(request);
  },
});
"#;
        let mut command = Command::new("bun");
        command
            .arg("--eval")
            .arg(script)
            .env(
                "PLAT_OUT_1_SERVE_MODULE",
                repo_root.join("runner/bun/src/serve.ts"),
            )
            .env("PLAT_OUT_1_RUNNER_PORT", address.port().to_string())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        let mut runner = Self {
            child: command.spawn().unwrap(),
            address,
        };
        runner.wait_until_ready();
        runner
    }

    fn client(&self) -> RunnerClient {
        RunnerClient::new(
            &format!("http://{}", self.address),
            "",
            ClientOptions {
                timeout: Duration::from_secs(10),
                ..ClientOptions::default()
            },
        )
        .unwrap()
    }

    fn get(&self, path: &str) -> (u16, Vec<u8>) {
        let mut socket = TcpStream::connect(self.address).unwrap();
        socket
            .set_read_timeout(Some(Duration::from_secs(2)))
            .unwrap();
        write!(
            socket,
            "GET {path} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n"
        )
        .unwrap();
        let mut raw = Vec::new();
        let _ = socket.read_to_end(&mut raw);
        let text = String::from_utf8_lossy(&raw);
        let status = text
            .split_whitespace()
            .nth(1)
            .and_then(|s| s.parse().ok())
            .unwrap_or(0);
        let body = text
            .split_once("\r\n\r\n")
            .map(|(_, b)| b.as_bytes().to_vec())
            .unwrap_or_default();
        (status, body)
    }

    fn provider_calls(&self) -> u64 {
        let (status, body) = self.get("/__plat_out_1/state");
        assert_eq!(status, 200);
        serde_json::from_slice::<Value>(&body).unwrap()["providerCalls"]
            .as_u64()
            .unwrap()
    }

    fn wait_until_ready(&mut self) {
        let deadline = Instant::now() + Duration::from_secs(10);
        loop {
            if let Some(status) = self.child.try_wait().unwrap() {
                panic!("Bun runner exited before readiness: {status}");
            }
            if TcpStream::connect(self.address).is_ok() && self.get("/healthz").0 == 200 {
                return;
            }
            assert!(Instant::now() < deadline, "Bun runner readiness timed out");
            std::thread::sleep(Duration::from_millis(25));
        }
    }
}

impl Drop for BunRunner {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}
