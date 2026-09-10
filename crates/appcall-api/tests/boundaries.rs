//! Request-boundary qualification, using a scoped backend that records dispatch.
use appcall_actions::{ExecuteRequest, ExecuteResult};
use appcall_api::*;
use appcall_connectors::Registry;
use appcall_store::{AuthType, Connection, CredentialOwner, Status, TestStatus};
use serde_json::{json, Value};
use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Mutex,
};

#[derive(Default)]
struct BoundaryBackend {
    readiness: usize,
    authentications: AtomicUsize,
    early_dispatches: AtomicUsize,
    action_dispatches: AtomicUsize,
    calls: Mutex<Vec<(String, String, String)>>,
}
impl BoundaryBackend {
    fn scoped(&self, operation: &str, identity: &Identity, id: &str) -> Result<Connection> {
        self.calls.lock().unwrap().push((
            operation.into(),
            identity.project_id.clone(),
            identity.account_id.clone(),
        ));
        if identity.project_id != "project" || identity.account_id != "brand" || id != "connection"
        {
            return Err(ApiError::new("CONNECTION_NOT_FOUND"));
        }
        Ok(Connection {
            id: id.into(),
            project_id: "project".into(),
            connector: "slack".into(),
            auth_type: AuthType::ApiKey,
            status: Status::Active,
            secret_ref_id: "private-secret-reference".into(),
            last_test_status: TestStatus::Passed,
            external_account_id: "brand".into(),
            credential_owner: CredentialOwner::Brand,
        })
    }
}
impl Backend for BoundaryBackend {
    async fn raw_route(&self, _: &Request) -> Result<Option<RawResponse>> {
        self.early_dispatches.fetch_add(1, Ordering::SeqCst);
        Ok(None)
    }
    async fn event_stream(&self, _: &Request) -> Result<Option<streaming::StreamResponse>> {
        self.early_dispatches.fetch_add(1, Ordering::SeqCst);
        Ok(None)
    }

    async fn authorize(&self, headers: &[(String, String)]) -> Result<Identity> {
        self.authentications.fetch_add(1, Ordering::SeqCst);
        if self.readiness == 3 {
            return Err(authentication_error(appcall_auth::AuthError::Unavailable));
        }
        let key = headers
            .iter()
            .find(|(k, _)| k.eq_ignore_ascii_case("X-API-Key"))
            .map(|(_, v)| v.as_str());
        if key != Some("test-key") {
            return Err(ApiError::new("UNAUTHORIZED"));
        }
        Ok(Identity {
            project_id: "project".into(),
            account_id: headers
                .iter()
                .find(|(k, _)| k == "X-External-Account-Id")
                .map(|(_, v)| v.clone())
                .unwrap_or_default(),
            admin_scope: false,
        })
    }
    async fn ready(&self) -> Result<()> {
        match self.readiness {
            0 => Ok(()),
            1 => Err(ApiError::new("STORAGE_UNAVAILABLE")),
            _ => std::future::pending().await,
        }
    }
    async fn connections(&self, i: &Identity) -> Result<Vec<Connection>> {
        Ok(vec![self.scoped("list", i, "connection")?])
    }
    async fn platform_connectors(&self, _: &Identity) -> Result<Vec<String>> {
        Ok(vec!["slack".into()])
    }
    async fn connection(&self, i: &Identity, id: &str) -> Result<Connection> {
        self.scoped("get", i, id)
    }
    async fn test_connection(&self, i: &Identity, id: &str) -> Result<Connection> {
        self.scoped("test", i, id)
    }
    async fn disconnect(&self, i: &Identity, id: &str) -> Result<()> {
        self.scoped("disconnect", i, id).map(|_| ())
    }
    async fn execute(&self, _: ExecuteRequest) -> Result<ExecuteResult> {
        self.action_dispatches.fetch_add(1, Ordering::SeqCst);
        Ok(ExecuteResult {
            request_id: "req_boundary".into(),
            output: json!({"accepted": true}),
            replay_log_id: String::new(),
            usage_warning: false,
            usage: Default::default(),
        })
    }
}
fn api(readiness: usize) -> Api<BoundaryBackend> {
    Api {
        registry: Registry::load(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../runner/connectors"
        ))
        .unwrap(),
        backend: BoundaryBackend {
            readiness,
            ..Default::default()
        },
    }
}
fn request(method: &str, uri: &str) -> Request {
    Request {
        method: method.into(),
        uri: uri.into(),
        headers: vec![
            ("X-API-Key".into(), "test-key".into()),
            ("X-External-Account-Id".into(), "brand".into()),
        ],
        body: vec![],
    }
}

#[tokio::test]
async fn public_probes_distinguish_liveness_database_failure_and_stalled_readiness() {
    for state in 0..3 {
        let api = api(state);
        let mut health = request("GET", "/healthz");
        health.headers.clear();
        assert_eq!(
            api.handle(health).await.body,
            json!({"service":"appcall","status":"ok"})
        );
        let mut ready = request("GET", "/readyz");
        ready.headers.clear();
        let response = tokio::time::timeout(std::time::Duration::from_secs(3), api.handle(ready))
            .await
            .expect("readiness must bound a stalled backend");
        assert_eq!(response.status, if state == 0 { 200 } else { 503 });
        assert_eq!(
            response.body["status"],
            if state == 0 { "ready" } else { "unavailable" }
        );
        assert_eq!(api.backend.authentications.load(Ordering::SeqCst), 0);
    }
}

#[tokio::test]
async fn oversized_requests_and_header_injection_fail_before_auth_or_dispatch() {
    let api = api(0);
    let mut requests = vec![];
    let mut uri = request("GET", "/v1/connections");
    uri.uri = format!("/{}", "x".repeat(4096));
    requests.push((uri, 413));
    let mut body = request("POST", "/v1/connections/connection/actions/a");
    body.body = vec![b' '; 2 * 1024 * 1024 + 1];
    requests.push((body, 413));
    let mut count = request("GET", "/v1/connections");
    count
        .headers
        .extend((0..63).map(|n| (format!("X-{n}"), "a".into())));
    requests.push((count, 413));
    let mut bytes = request("GET", "/v1/connections");
    bytes.headers.push(("X-Long".into(), "a".repeat(16384)));
    requests.push((bytes, 413));
    for (name, value) in [
        ("X-\nInjected", "x"),
        ("X-Other", "x\r\nAuthorization: injected"),
    ] {
        let mut r = request("GET", "/v1/connections");
        r.headers.push((name.into(), value.into()));
        requests.push((r, 400));
    }
    for (r, status) in requests {
        assert_eq!(api.handle(r).await.status, status);
    }
    assert_eq!(api.backend.authentications.load(Ordering::SeqCst), 0);
    assert!(api.backend.calls.lock().unwrap().is_empty());
}

#[tokio::test]
async fn encoded_separators_controls_and_invalid_utf8_never_reach_connection_backend() {
    let api = api(0);
    for uri in [
        "//other/v1/connections",
        "https://other/v1/connections",
        "/v1//connections/connection",
        "/v1/connections/%2fconnection",
        "/v1/connections/%00",
        "/v1/connections/%FF",
        "/v1/../healthz",
        "/v1/%2e%2e/healthz",
        "/v1/.%2E/healthz",
        "/v1/./connections",
        "/v1/%2e/connections",
        "/v1/connections/%",
        "/v1/connections/%2",
        "/v1/connections/%GG",
        "/v1/connections/%5cconnection",
        "/v1\\connections",
        "/healthz#ignored",
        "/v1/connections/%C0%AF",
    ] {
        let response = api.handle(request("GET", uri)).await;
        assert_eq!(response.status, 400, "{uri}: {:?}", response.body);
    }
    assert!(api.backend.calls.lock().unwrap().is_empty());
    let unknown = api.handle(request("GET", "/v1/unknown-route")).await;
    assert_eq!(unknown.status, 404);
    assert_eq!(unknown.body["error"]["code"], "ROUTE_NOT_FOUND");
}

#[tokio::test]
async fn catalog_filters_compose_without_exposing_credentials_and_setup_is_public_metadata() {
    let api = api(0);
    let filtered = api
        .handle(request(
            "GET",
            "/v1/connectors?category=%20MESSAGING%20,,&category=nonexistent",
        ))
        .await;
    assert_eq!(filtered.status, 200);
    let list = filtered.body["connectors"].as_array().unwrap();
    assert!(list.iter().any(|c| c["key"] == "slack"));
    assert!(list.iter().all(|c| c["categories"]
        .as_array()
        .unwrap()
        .iter()
        .any(|v| v == "messaging")));
    let mut narrow = request("GET", "/v1/connectors?category=messaging");
    narrow
        .headers
        .push(("X-Capability-Profile".into(), "sena_mvt".into()));
    let narrow = api.handle(narrow).await;
    assert!(!narrow.body["connectors"]
        .as_array()
        .unwrap()
        .iter()
        .any(|c| c["key"] == "slack"));
    let empty = api
        .handle(request("GET", "/v1/connectors?category=nonexistent"))
        .await;
    assert_eq!(empty.body, json!({"connectors":[]}));
    let detail = api.handle(request("GET", "/v1/connectors/slack")).await;
    assert_eq!(detail.status, 200);
    assert_eq!(detail.body["authType"], "oauth2");
    assert!(detail.body["operations"]
        .as_array()
        .unwrap()
        .iter()
        .any(|v| v["key"] == "messages.send"));
    let setup = api
        .handle(request("GET", "/v1/connectors/slack/setup"))
        .await;
    assert_eq!(setup.status, 200);
    assert_eq!(setup.body["connector"], "slack");
    assert_eq!(setup.body["mode"], "oauth2");
    assert!(setup.body.get("credentials").is_none());
    for route in [
        "/v1/connectors/not-a-connector",
        "/v1/connectors/not-a-connector/setup",
    ] {
        assert_eq!(api.handle(request("GET", route)).await.status, 404);
    }
}

#[tokio::test]
async fn connection_routes_keep_verified_scope_and_redact_private_fields() {
    let api = api(0);
    for (method, path, operation) in [
        ("GET", "/v1/connections", "list"),
        ("GET", "/v1/connections/connection", "get"),
        ("POST", "/v1/connections/connection/test", "test"),
        (
            "POST",
            "/v1/connections/connection/disconnect",
            "disconnect",
        ),
    ] {
        let response = api.handle(request(method, path)).await;
        assert_eq!(
            response.status,
            if operation == "disconnect" { 204 } else { 200 }
        );
        assert!(!response
            .body
            .to_string()
            .contains("private-secret-reference"));
        if operation == "disconnect" {
            assert_eq!(response.body, Value::Null);
        }
        assert_eq!(
            api.backend.calls.lock().unwrap().last().unwrap(),
            &(operation.into(), "project".into(), "brand".into())
        );
        let mut denied = request(method, path);
        denied.headers[1].1 = "other-brand".into();
        let denied = api.handle(denied).await;
        assert_eq!(denied.status, 404);
        assert_eq!(denied.body["error"]["code"], "CONNECTION_NOT_FOUND");
    }
}

#[tokio::test]
async fn query_escapes_are_not_mistaken_for_path_separators() {
    let api = api(0);
    for query in ["?next=%2f%2e%2e%2f", "?value=%25", "?value=%E2%9C%93"] {
        assert_eq!(
            api.handle(request("GET", &format!("/healthz{query}")))
                .await
                .status,
            200
        );
    }
}

#[tokio::test]
#[ignore = "opens local TCP sockets"]
async fn malformed_raw_paths_fail_before_authentication_raw_or_event_dispatch() {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    tokio::task::LocalSet::new()
        .run_until(async {
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            let address = listener.local_addr().unwrap();
            let api = std::rc::Rc::new(api(0));
            let (stop, shutdown) = tokio::sync::oneshot::channel();
            let server = tokio::task::spawn_local(serve(listener, api.clone(), async {
                let _ = shutdown.await;
            }));
            for path in [
                "/v1/x/../mcp",
                "/v1/%2e%2e/healthz",
                "/app/./triggers/stream",
                "/v1/%FF",
                "/v1/%GG",
                "/v1/%5c",
            ] {
                let mut socket = tokio::net::TcpStream::connect(address).await.unwrap();
                socket
                    .write_all(
                        format!(
                            "GET {path} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n"
                        )
                        .as_bytes(),
                    )
                    .await
                    .unwrap();
                let mut bytes = vec![];
                tokio::time::timeout(
                    std::time::Duration::from_secs(2),
                    socket.read_to_end(&mut bytes),
                )
                .await
                .unwrap()
                .unwrap();
                assert!(
                    String::from_utf8(bytes)
                        .unwrap()
                        .starts_with("HTTP/1.1 400"),
                    "{path}"
                );
            }
            assert_eq!(api.backend.authentications.load(Ordering::SeqCst), 0);
            assert_eq!(api.backend.early_dispatches.load(Ordering::SeqCst), 0);
            stop.send(()).unwrap();
            server.await.unwrap().unwrap();
        })
        .await;
}

#[tokio::test]
#[ignore = "opens local TCP sockets"]
async fn transport_accepts_shared_budget_requests_above_the_legacy_two_mib_cap() {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    tokio::task::LocalSet::new()
        .run_until(async {
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            let address = listener.local_addr().unwrap();
            let api = std::rc::Rc::new(api(0));
            let (stop, shutdown) = tokio::sync::oneshot::channel();
            let server = tokio::task::spawn_local(serve(listener, api.clone(), async {
                let _ = shutdown.await;
            }));
            let body = serde_json::to_string(&json!({
                "input": {"blob": "x".repeat(2 * 1024 * 1024)}
            }))
            .unwrap();
            assert!(body.len() > 2 * 1024 * 1024);
            assert!(body.len() <= appcall_connectors::budget::rpc_request_bytes());
            let mut socket = tokio::net::TcpStream::connect(address).await.unwrap();
            socket
                .write_all(
                    format!(
                        "POST /v1/connections/connection/actions/a HTTP/1.1\r\nHost: localhost\r\nX-API-Key: test-key\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                        body.len(), body
                    )
                    .as_bytes(),
                )
                .await
                .unwrap();
            let mut bytes = Vec::new();
            tokio::time::timeout(
                std::time::Duration::from_secs(3),
                socket.read_to_end(&mut bytes),
            )
            .await
            .unwrap()
            .unwrap();
            let response = String::from_utf8(bytes).unwrap();
            assert!(response.starts_with("HTTP/1.1 200"), "{response}");
            assert!(response.contains("\"accepted\":true"), "{response}");
            assert_eq!(api.backend.action_dispatches.load(Ordering::SeqCst), 1);
            stop.send(()).unwrap();
            server.await.unwrap().unwrap();
        })
        .await;
}

#[tokio::test]
async fn api_accepts_shared_budget_request_above_the_legacy_two_mib_cap() {
    let api = api(0);
    let body = serde_json::to_vec(&json!({
        "input": {"blob": "x".repeat(2 * 1024 * 1024)}
    }))
    .unwrap();
    assert!(body.len() > 2 * 1024 * 1024);
    assert!(body.len() <= appcall_connectors::budget::rpc_request_bytes());
    let response = api
        .handle(Request {
            method: "POST".into(),
            uri: "/v1/connections/connection/actions/a".into(),
            headers: vec![("X-API-Key".into(), "test-key".into())],
            body,
        })
        .await;
    assert_eq!(response.status, 200, "{:?}", response.body);
    assert_eq!(api.backend.action_dispatches.load(Ordering::SeqCst), 1);
}

#[test]
fn unavailable_identity_storage_is_not_reported_as_invalid_credentials() {
    assert_eq!(
        authentication_error(appcall_auth::AuthError::Unavailable).code,
        "STORAGE_UNAVAILABLE"
    );
    assert_eq!(
        authentication_error(appcall_auth::AuthError::Forbidden).code,
        "FORBIDDEN"
    );
}

#[test]
fn database_health_does_not_treat_busy_as_closed_or_hide_a_closed_peer() {
    assert_eq!(combined_database_health([Some(true), None]), None);
    assert_eq!(combined_database_health([None, Some(false)]), Some(false));
    assert_eq!(combined_database_health([Some(false), None]), Some(false));
    assert_eq!(
        combined_database_health([Some(true), Some(true)]),
        Some(true)
    );
}

#[tokio::test]
async fn identity_database_outage_returns_service_unavailable_on_http_contract() {
    let response = api(3).handle(request("GET", "/v1/connections")).await;
    assert_eq!(response.status, 503);
    assert_eq!(response.body["error"]["code"], "STORAGE_UNAVAILABLE");
}
