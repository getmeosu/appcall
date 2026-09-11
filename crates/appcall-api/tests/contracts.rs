use appcall_actions::{ExecuteRequest, ExecuteResult};
use appcall_api::*;
use appcall_connectors::Registry;
use appcall_store::Connection;
use serde_json::{json, Value};
use std::{sync::Mutex, time::Duration};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

struct Fixture {
    inputs: Mutex<Vec<Value>>,
    executions: Mutex<Vec<(String, String, bool, String)>>,
    stream_shutdown: tokio::sync::watch::Sender<bool>,
}
impl Default for Fixture {
    fn default() -> Self {
        let (stream_shutdown, _) = tokio::sync::watch::channel(false);
        Self {
            inputs: Mutex::new(Vec::new()),
            executions: Mutex::new(Vec::new()),
            stream_shutdown,
        }
    }
}
impl Backend for Fixture {
    async fn authorize(&self, h: &[(String, String)]) -> Result<Identity> {
        if h.iter()
            .any(|(k, v)| k.eq_ignore_ascii_case("X-API-Key") && v == "fixture-key")
        {
            Ok(Identity {
                project_id: "project".into(),
                account_id: "brand".into(),
                admin_scope: false,
            })
        } else {
            Err(ApiError::new("UNAUTHORIZED"))
        }
    }
    async fn ready(&self) -> Result<()> {
        Ok(())
    }
    async fn connections(&self, _: &Identity) -> Result<Vec<Connection>> {
        Ok(vec![])
    }
    async fn platform_connectors(&self, i: &Identity) -> Result<Vec<String>> {
        assert_eq!(i.project_id, "project");
        Ok(vec!["slack".into()])
    }
    async fn connection(&self, _: &Identity, _: &str) -> Result<Connection> {
        Err(ApiError::new("CONNECTION_NOT_FOUND"))
    }
    async fn test_connection(&self, i: &Identity, id: &str) -> Result<Connection> {
        self.connection(i, id).await
    }
    async fn disconnect(&self, _: &Identity, _: &str) -> Result<()> {
        Ok(())
    }
    async fn execute(&self, r: ExecuteRequest) -> Result<ExecuteResult> {
        self.inputs.lock().unwrap().push(r.input.clone());
        let warn = r
            .input
            .get("warn")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        self.executions.lock().unwrap().push((
            r.project_id,
            r.external_account_id,
            r.admin_scope,
            r.idempotency_key,
        ));
        Ok(ExecuteResult {
            request_id: "req1".into(),
            output: json!({"sent":true}),
            replay_log_id: String::new(),
            usage_warning: warn,
            usage: appcall_actions::UsageSnapshot {
                month: "2026-09".into(),
                current: 9,
                projected: 10,
                soft_limit: 10,
                hard_limit: 20,
            },
        })
    }
    async fn event_stream(&self, r: &Request) -> Result<Option<streaming::StreamResponse>> {
        if r.method != "GET" || r.uri.split('?').next() != Some("/v1/events") {
            return Ok(None);
        }
        let (tx, receiver) = tokio::sync::mpsc::channel(1);
        tx.try_send(b": fixture stream\n\n".to_vec()).unwrap();
        let mut shutdown = self.stream_shutdown.subscribe();
        tokio::spawn(async move {
            tokio::select! {
                _ = shutdown.changed() => {}
                _ = tx.closed() => {}
            }
            drop(tx);
        });
        Ok(Some(streaming::StreamResponse {
            receiver,
            headers: vec![],
        }))
    }
}

#[tokio::test]
async fn optional_input_and_usage_warning_match_go_contract() {
    let api = api();
    assert_eq!(
        api.handle(request("POST", "/v1/connections/c/actions/a", json!({})))
            .await
            .status,
        200
    );
    let response = api
        .handle(request(
            "POST",
            "/v1/connections/c/actions/a",
            json!({"input":{"warn":true}}),
        ))
        .await;
    assert_eq!(response.body["usageWarning"], true);
    assert_eq!(
        response.body["usage"],
        json!({"month":"2026-09","current":9,"projected":10,"softLimit":10,"hardLimit":20})
    );
}
fn api() -> Api<Fixture> {
    Api {
        registry: Registry::load(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../runner/connectors"
        ))
        .unwrap(),
        backend: Fixture::default(),
    }
}
fn request(method: &str, uri: &str, body: Value) -> Request {
    Request {
        method: method.into(),
        uri: uri.into(),
        headers: vec![("X-API-Key".into(), "fixture-key".into())],
        body: serde_json::to_vec(&body).unwrap(),
    }
}

#[tokio::test]
async fn catalog_contract_is_scoped_and_internal_connectors_are_hidden() {
    let api = api();
    let response = api
        .handle(request("GET", "/v1/connectors", Value::Null))
        .await;
    assert_eq!(response.status, 200);
    let connectors = response.body["connectors"].as_array().unwrap();
    assert!(connectors
        .iter()
        .any(|c| c["key"] == "slack" && c["platformConnected"] == true));
    for c in connectors {
        assert!(c.get("authType").is_some());
        assert!(c.get("operations").is_none());
    }
    let mut unauth = request("GET", "/v1/connectors", Value::Null);
    unauth.headers.clear();
    assert_eq!(api.handle(unauth).await.status, 401);
}
#[tokio::test]
async fn actions_use_verified_scope_and_preserve_legacy_response_shape() {
    let api = api();
    let mut req = request(
        "POST",
        "/v1/connections/connection/actions/messages.send",
        json!({"input":{"text":"hello"}}),
    );
    req.headers.push(("Idempotency-Key".into(), "one".into()));
    req.headers.push(("X-Admin-Scope".into(), "true".into()));
    let response = api.handle(req).await;
    assert_eq!(response.status, 200);
    assert_eq!(
        response.body,
        json!({"requestId":"req1","output":{"sent":true}})
    );
    assert_eq!(
        *api.backend.executions.lock().unwrap(),
        vec![("project".into(), "brand".into(), false, "one".into())]
    );
}
#[tokio::test]
async fn ambiguous_headers_and_nonobject_action_body_never_dispatch() {
    let api = api();
    let mut req = request("POST", "/v1/connections/c/actions/a", json!({"input":{}}));
    req.headers.push(("x-api-key".into(), "other".into()));
    assert_eq!(api.handle(req).await.status, 400);
    for input in [
        json!(false),
        json!([]),
        json!({"input":{},"projectId":"attacker"}),
    ] {
        assert_eq!(
            api.handle(request("POST", "/v1/connections/c/actions/a", input))
                .await
                .status,
            400
        );
    }
    assert!(api.backend.executions.lock().unwrap().is_empty());
}

#[tokio::test]
#[ignore = "opens local TCP sockets"]
async fn transport_rejects_unauthenticated_body_without_waiting_and_serves_health() {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    let local = tokio::task::LocalSet::new();
    local.run_until(async {
        let listener=tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address=listener.local_addr().unwrap();
        let (stop,shutdown)=tokio::sync::oneshot::channel();
        let server=tokio::task::spawn_local(serve(listener,std::rc::Rc::new(api()),async{let _=shutdown.await;}));
        for (request,status) in [("GET /healthz HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n","200 OK"),("POST /v1/connections/c/actions/a HTTP/1.1\r\nHost: localhost\r\nContent-Length: 1000000\r\n\r\n","401 Unauthorized")] {
            let mut stream=tokio::net::TcpStream::connect(address).await.unwrap();
            stream.write_all(request.as_bytes()).await.unwrap();
            let mut bytes=Vec::new();
            tokio::time::timeout(std::time::Duration::from_secs(2),stream.read_to_end(&mut bytes)).await.unwrap().unwrap();
            assert!(String::from_utf8(bytes).unwrap().contains(status));
        }
        stop.send(()).unwrap();server.await.unwrap().unwrap();
    }).await;
}

async fn read_headers(stream: &mut TcpStream) -> Vec<u8> {
    let mut bytes = Vec::new();
    loop {
        let mut chunk = [0; 1024];
        let count = tokio::time::timeout(Duration::from_secs(2), stream.read(&mut chunk))
            .await
            .unwrap()
            .unwrap();
        assert!(count > 0, "connection closed before response headers");
        bytes.extend_from_slice(&chunk[..count]);
        if bytes.windows(4).any(|window| window == b"\r\n\r\n") {
            return bytes;
        }
    }
}

async fn send_request(address: std::net::SocketAddr, request: &[u8]) -> Vec<u8> {
    let mut stream = TcpStream::connect(address).await.unwrap();
    stream.write_all(request).await.unwrap();
    let mut bytes = Vec::new();
    tokio::time::timeout(Duration::from_secs(2), stream.read_to_end(&mut bytes))
        .await
        .unwrap()
        .unwrap();
    bytes
}

async fn open_stream(address: std::net::SocketAddr) -> (TcpStream, String) {
    let mut stream = TcpStream::connect(address).await.unwrap();
    stream
        .write_all(b"GET /v1/events HTTP/1.1\r\nHost: localhost\r\nX-API-Key: fixture-key\r\n\r\n")
        .await
        .unwrap();
    let response = read_headers(&mut stream).await;
    (stream, String::from_utf8_lossy(&response).into_owned())
}

async fn saturate_streams(address: std::net::SocketAddr) -> Vec<TcpStream> {
    let mut admitted = Vec::new();
    for _ in 0..64 {
        let (stream, response) = open_stream(address).await;
        if response.contains(" 200 ") {
            admitted.push(stream);
        } else {
            assert!(response.contains(" 503 Service Unavailable"), "{response}");
        }
    }
    assert!(!admitted.is_empty());
    assert!(admitted.len() < 64, "all streams were admitted");
    admitted
}

#[tokio::test]
#[ignore = "opens local TCP sockets"]
async fn persistent_stream_saturation_reserves_health_readiness_and_action_capacity() {
    let local = tokio::task::LocalSet::new();
    local
        .run_until(async {
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            let address = listener.local_addr().unwrap();
            let (stop, shutdown) = tokio::sync::oneshot::channel();
            let server = tokio::task::spawn_local(serve(
                listener,
                std::rc::Rc::new(api()),
                async {
                    let _ = shutdown.await;
                },
            ));
            let admitted = saturate_streams(address).await;

            let health = send_request(
                address,
                b"GET /healthz HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n",
            )
            .await;
            assert!(String::from_utf8_lossy(&health).contains(" 200 OK"));
            let readiness = send_request(
                address,
                b"GET /readyz HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n",
            )
            .await;
            assert!(String::from_utf8_lossy(&readiness).contains(" 200 OK"));
            let action = send_request(
                address,
                b"POST /v1/connections/c/actions/a HTTP/1.1\r\nHost: localhost\r\nX-API-Key: fixture-key\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}",
            )
            .await;
            assert!(String::from_utf8_lossy(&action).contains(" 200 OK"));

            drop(admitted);
            stop.send(()).unwrap();
            tokio::time::timeout(Duration::from_secs(2), server)
                .await
                .unwrap()
                .unwrap()
                .unwrap();
        })
        .await;
}

#[tokio::test]
#[ignore = "opens local TCP sockets"]
async fn persistent_stream_disconnect_releases_admission() {
    let local = tokio::task::LocalSet::new();
    local
        .run_until(async {
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            let address = listener.local_addr().unwrap();
            let (stop, shutdown) = tokio::sync::oneshot::channel();
            let server_api = std::rc::Rc::new(api());
            let server = tokio::task::spawn_local(serve(listener, server_api, async {
                let _ = shutdown.await;
            }));

            let mut admitted = saturate_streams(address).await;
            drop(admitted.pop().expect("at least one admitted stream"));
            let mut replacement = None;
            for _ in 0..40 {
                let (stream, response) = open_stream(address).await;
                if response.contains(" 200 ") {
                    replacement = Some(stream);
                    break;
                }
                assert!(response.contains(" 503 Service Unavailable"), "{response}");
                drop(stream);
                tokio::time::sleep(Duration::from_millis(5)).await;
            }
            admitted.push(replacement.expect("a disconnected stream releases its slot"));

            drop(admitted);
            stop.send(()).unwrap();
            tokio::time::timeout(Duration::from_secs(2), server)
                .await
                .unwrap()
                .unwrap()
                .unwrap();
        })
        .await;
}

#[tokio::test]
#[ignore = "opens local TCP sockets"]
async fn persistent_stream_shutdown_closes_admitted_connections() {
    let local = tokio::task::LocalSet::new();
    local
        .run_until(async {
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            let address = listener.local_addr().unwrap();
            let (stop, shutdown) = tokio::sync::oneshot::channel();
            let server_api = std::rc::Rc::new(api());
            let shutdown_streams = server_api.backend.stream_shutdown.clone();
            let server = tokio::task::spawn_local(serve(listener, server_api, async {
                let _ = shutdown.await;
            }));

            let mut admitted = saturate_streams(address).await;
            shutdown_streams.send_replace(true);
            stop.send(()).unwrap();
            tokio::time::timeout(Duration::from_secs(2), server)
                .await
                .unwrap()
                .unwrap()
                .unwrap();
            for stream in &mut admitted {
                let mut bytes = Vec::new();
                tokio::time::timeout(Duration::from_secs(2), stream.read_to_end(&mut bytes))
                    .await
                    .unwrap()
                    .unwrap();
            }
        })
        .await;
}

#[tokio::test]
async fn empty_action_body_defaults_to_object_without_bypassing_authentication() {
    let api = api();
    let mut req = request("POST", "/v1/connections/c/actions/a", json!({}));
    req.body.clear();
    assert_eq!(api.handle(req).await.status, 200);
    assert_eq!(*api.backend.inputs.lock().unwrap(), vec![json!({})]);
    let mut unauth = request("POST", "/v1/connections/c/actions/a", json!({}));
    unauth.body.clear();
    unauth.headers.clear();
    assert_eq!(api.handle(unauth).await.status, 401);
    let mut malformed = request("POST", "/v1/connections/c/actions/a", json!({}));
    malformed.body = b"  ".to_vec();
    assert_eq!(api.handle(malformed).await.status, 400);
    assert_eq!(api.backend.inputs.lock().unwrap().len(), 1);
}

#[tokio::test]
async fn null_action_body_matches_go_zero_value_binding() {
    let api = api();
    for raw in [b"null".as_slice(), b" \nnull\t".as_slice()] {
        let mut req = request("POST", "/v1/connections/c/actions/a", json!({}));
        req.body = raw.to_vec();
        assert_eq!(api.handle(req).await.status, 200);
    }
    assert_eq!(
        *api.backend.inputs.lock().unwrap(),
        vec![json!({}), json!({})]
    );
}
