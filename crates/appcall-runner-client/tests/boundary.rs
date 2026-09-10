use appcall_runner_client::*;
use serde_json::json;
use std::time::Duration;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
};

async fn fixture(body: String) -> (String, tokio::task::JoinHandle<Vec<u8>>) {
    fixture_with_status(200, body).await
}
async fn fixture_with_status(
    status: u16,
    body: String,
) -> (String, tokio::task::JoinHandle<Vec<u8>>) {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let task = tokio::spawn(async move {
        let (mut stream, _) = listener.accept().await.unwrap();
        let request = read_request(&mut stream).await;
        let response = format!(
            "HTTP/1.1 {status} Test\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            body.len(),
            body
        );
        stream.write_all(response.as_bytes()).await.unwrap();
        request
    });
    (url, task)
}
async fn read_request(stream: &mut tokio::net::TcpStream) -> Vec<u8> {
    let mut request = Vec::new();
    loop {
        let mut chunk = [0; 4096];
        let count = stream.read(&mut chunk).await.unwrap();
        assert!(count > 0, "request ended before its body");
        request.extend_from_slice(&chunk[..count]);
        assert!(request.len() <= 16384);
        if let Some(header_end) = request.windows(4).position(|window| window == b"\r\n\r\n") {
            let headers = String::from_utf8_lossy(&request[..header_end]);
            let length = headers
                .lines()
                .find_map(|line| {
                    let (name, value) = line.split_once(':')?;
                    name.eq_ignore_ascii_case("content-length")
                        .then(|| value.trim().parse::<usize>().unwrap())
                })
                .unwrap_or(0);
            if request.len() >= header_end + 4 + length {
                break;
            }
        }
    }
    request
}

fn context() -> RequestContext {
    RequestContext {
        request_id: "test-id".into(),
        deadline_unix_ms: None,
    }
}

#[tokio::test]
async fn malformed_or_uncorrelated_response_is_unknown_outcome() {
    for body in [
        r#"{"ok":true,"result":{}}"#,
        r#"{"id":"test-id","ok":true,"result":{}} {}"#,
        r#"{"id":"other","ok":true,"result":{}}"#,
    ] {
        let (url, server) = fixture(body.into()).await;
        let client = RunnerClient::new(&url, "", ClientOptions::default()).unwrap();
        let err = client.describe(&context()).await.unwrap_err();
        assert_eq!(err.kind, ErrorKind::MalformedResponse);
        assert_eq!(err.outcome, DispatchOutcome::Unknown);
        server.await.unwrap();
    }
}

#[tokio::test]
async fn correlated_runner_busy_admission_is_typed_not_dispatched() {
    let (url, server) = fixture_with_status(
        503,
        json!({
            "id": "test-id",
            "ok": false,
            "error": {
                "code": "RUNNER_BUSY",
                "message": "Runner admission limit reached."
            }
        })
        .to_string(),
    )
    .await;
    let client = RunnerClient::new(&url, "", ClientOptions::default()).unwrap();
    let error = client.describe(&context()).await.unwrap_err();
    assert_eq!(error.kind, ErrorKind::Runner);
    assert_eq!(error.outcome, DispatchOutcome::NotDispatched);
    assert_eq!(error.code.as_deref(), Some("RUNNER_BUSY"));
    let request = String::from_utf8(server.await.unwrap()).unwrap();
    assert!(request
        .to_ascii_lowercase()
        .contains("x-request-id: test-id"));
}

#[tokio::test]
async fn runner_busy_admission_requires_matching_id_and_503_status() {
    let cases = [
        (
            503,
            json!({
                "ok": false,
                "error": {"code": "RUNNER_BUSY", "message": "busy"}
            }),
        ),
        (
            503,
            json!({
                "id": "other-id",
                "ok": false,
                "error": {"code": "RUNNER_BUSY", "message": "busy"}
            }),
        ),
        (
            200,
            json!({
                "id": "test-id",
                "ok": false,
                "error": {"code": "RUNNER_BUSY", "message": "busy"}
            }),
        ),
    ];
    for (status, body) in cases {
        let (url, server) = fixture_with_status(status, body.to_string()).await;
        let client = RunnerClient::new(&url, "", ClientOptions::default()).unwrap();
        let error = client.describe(&context()).await.unwrap_err();
        assert_eq!(error.kind, ErrorKind::MalformedResponse);
        assert_eq!(error.outcome, DispatchOutcome::Unknown);
        server.await.unwrap();
    }
}

#[tokio::test]
async fn expired_deadline_never_dispatches() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let client = RunnerClient::new(
        &format!("http://{}", listener.local_addr().unwrap()),
        "",
        ClientOptions::default(),
    )
    .unwrap();
    let err = client
        .describe(&RequestContext {
            deadline_unix_ms: Some(1),
            ..context()
        })
        .await
        .unwrap_err();
    assert_eq!(err.outcome, DispatchOutcome::NotDispatched);
    assert!(
        tokio::time::timeout(Duration::from_millis(20), listener.accept())
            .await
            .is_err()
    );
}

#[tokio::test]
async fn unsafe_request_id_is_rejected_before_network_dispatch() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let client = RunnerClient::new(
        &format!("http://{}", listener.local_addr().unwrap()),
        "",
        ClientOptions {
            timeout: Duration::from_millis(100),
            ..ClientOptions::default()
        },
    )
    .unwrap();
    let error = client
        .describe(&RequestContext {
            request_id: "unsafe id".into(),
            ..context()
        })
        .await
        .unwrap_err();

    assert!(
        tokio::time::timeout(Duration::from_millis(20), listener.accept())
            .await
            .is_err(),
        "unsafe request IDs must not reach the network"
    );
    assert_eq!(error.kind, ErrorKind::InvalidRequest);
    assert_eq!(error.outcome, DispatchOutcome::NotDispatched);
}

#[tokio::test]
async fn retries_are_typed_and_reflected_credentials_redacted() {
    let (url, server) = fixture(json!({"id":"test-id","ok":false,"error":{"code":"CONNECTOR_RATE_LIMITED","message":"secret-bearer slow","retryAfterSeconds":120}}).to_string()).await;
    let client = RunnerClient::new(&url, "secret-bearer", ClientOptions::default()).unwrap();
    let err = client.describe(&context()).await.unwrap_err();
    assert_eq!(err.retry_after_seconds, Some(120));
    assert!(!format!("{err:?}").contains("secret-bearer"));
    let request = String::from_utf8(server.await.unwrap()).unwrap();
    assert!(request
        .to_lowercase()
        .contains("authorization: bearer secret-bearer"));
    assert!(request.contains("deadlineUnixMs"));
}

#[tokio::test]
async fn redirects_are_not_followed() {
    let target = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let destination = target.local_addr().unwrap();
    let server = tokio::spawn(async move {
        let (mut socket, _) = listener.accept().await.unwrap();
        let _request = read_request(&mut socket).await;
        socket.write_all(format!("HTTP/1.1 307 Temporary Redirect\r\nLocation: http://{destination}/rpc\r\nContent-Length: 0\r\n\r\n").as_bytes()).await.unwrap();
    });
    let client = RunnerClient::new(&url, "secret", ClientOptions::default()).unwrap();
    let error = client.describe(&context()).await.unwrap_err();
    assert_eq!(error.kind, ErrorKind::RedirectBlocked);
    assert!(
        tokio::time::timeout(Duration::from_millis(20), target.accept())
            .await
            .is_err()
    );
    server.await.unwrap();
}

#[tokio::test]
async fn deadline_covers_body_and_cancels_the_socket() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let server = tokio::spawn(async move {
        let (mut socket, _) = listener.accept().await.unwrap();
        let mut input = [0u8; 4096];
        let _request = read_request(&mut socket).await;
        socket
            .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 999\r\n\r\n{")
            .await
            .unwrap();
        socket.read(&mut input).await.unwrap()
    });
    let client = RunnerClient::new(
        &url,
        "",
        ClientOptions {
            timeout: Duration::from_millis(50),
            ..ClientOptions::default()
        },
    )
    .unwrap();
    let error = client.describe(&context()).await.unwrap_err();
    assert_eq!(error.kind, ErrorKind::Timeout);
    assert_eq!(error.outcome, DispatchOutcome::Unknown);
    assert_eq!(
        tokio::time::timeout(Duration::from_secs(1), server)
            .await
            .unwrap()
            .unwrap(),
        0
    );
}

#[tokio::test]
async fn request_and_response_wire_limits_are_enforced() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let client = RunnerClient::new(
        &format!("http://{}", listener.local_addr().unwrap()),
        "",
        ClientOptions {
            max_request_bytes: 10,
            ..ClientOptions::default()
        },
    )
    .unwrap();
    let error = client.describe(&context()).await.unwrap_err();
    assert_eq!(error.kind, ErrorKind::RequestTooLarge);
    assert_eq!(error.outcome, DispatchOutcome::NotDispatched);
    assert!(
        tokio::time::timeout(Duration::from_millis(20), listener.accept())
            .await
            .is_err()
    );
    let (url, task) = fixture("x".repeat(1000)).await;
    let client = RunnerClient::new(
        &url,
        "",
        ClientOptions {
            max_response_bytes: 20,
            ..ClientOptions::default()
        },
    )
    .unwrap();
    assert_eq!(
        client.describe(&context()).await.unwrap_err().kind,
        ErrorKind::ResponseTooLarge
    );
    task.await.unwrap();
}

#[tokio::test]
async fn default_wire_budget_supports_declared_large_operation_responses() {
    assert_eq!(ClientOptions::default().timeout, Duration::from_secs(300));
    assert!(ClientOptions::default().max_response_bytes > 50 * 1024 * 1024);
    let output = "x".repeat(8 * 1024 * 1024 + 1024);
    let body = json!({
        "id": "test-id",
        "ok": true,
        "result": {"output": {"data": output}}
    })
    .to_string();
    let (url, task) = fixture(body).await;
    let client = RunnerClient::new(&url, "", ClientOptions::default()).unwrap();
    let response = client
        .action_execute(
            &context(),
            ActionExecuteRequest {
                connector_key: "apify".into(),
                action: "actor.run_sync_get_dataset_items".into(),
                input: json!({}),
            },
        )
        .await
        .unwrap();
    assert_eq!(
        response.output["data"].as_str().unwrap().len(),
        8 * 1024 * 1024 + 1024
    );
    task.await.unwrap();
}

#[tokio::test]
async fn connector_credentials_are_removed_from_remote_diagnostics() {
    let (url, task) = fixture(json!({"id":"test-id","ok":false,"error":{"code":"CONNECTOR_UPSTREAM_ERROR","message":"token=a%2Fb%20value; raw=a/b value"}}).to_string()).await;
    let client = RunnerClient::new(&url, "", ClientOptions::default()).unwrap();
    let error = client
        .action_execute(
            &context(),
            ActionExecuteRequest {
                connector_key: "fixture".into(),
                action: "send".into(),
                input: json!({"accessToken":"a/b value"}),
            },
        )
        .await
        .unwrap_err();
    assert_eq!(error.message, "token=[REDACTED]; raw=[REDACTED]");
    task.await.unwrap();
}

#[tokio::test]
async fn all_public_methods_keep_existing_wire_names() {
    let cases = [
        (
            "runner.describe",
            json!({"protocolVersion":PROTOCOL_VERSION,"runner":"appcall-bun"}),
        ),
        (
            "connector.healthcheck",
            json!({"status":"ok","source":"provider"}),
        ),
        ("connector.action.execute", json!({"output":{"id":"done"}})),
        (
            "connector.sync.list",
            json!({"output":{"items":[],"cursor":null}}),
        ),
        ("connector.webhook.verify", json!({"verified":true})),
        (
            "connector.webhook.parse",
            json!({"idempotencyKey":"event","sanitized":{}}),
        ),
    ];
    for (method, result) in cases {
        let (url, task) =
            fixture(json!({"id":"test-id","ok":true,"result":result}).to_string()).await;
        let client = RunnerClient::new(&url, "", ClientOptions::default()).unwrap();
        match method {
            "runner.describe" => {
                assert_eq!(
                    client.describe(&context()).await.unwrap().protocol_version,
                    PROTOCOL_VERSION
                );
            }
            "connector.healthcheck" => {
                assert_eq!(
                    client
                        .healthcheck(&context(), "slack", json!({}))
                        .await
                        .unwrap()
                        .source,
                    "provider"
                );
            }
            "connector.action.execute" => {
                client
                    .action_execute(
                        &context(),
                        ActionExecuteRequest {
                            connector_key: "slack".into(),
                            action: "messages.send".into(),
                            input: json!({}),
                        },
                    )
                    .await
                    .unwrap();
            }
            "connector.sync.list" => {
                client
                    .sync_list(
                        &context(),
                        SyncListRequest {
                            connector_key: "slack".into(),
                            sync: "messages.list".into(),
                            input: json!({}),
                        },
                    )
                    .await
                    .unwrap();
            }
            "connector.webhook.verify" => {
                assert!(
                    client
                        .webhook_verify(
                            &context(),
                            WebhookVerifyRequest {
                                connector_key: "slack".into(),
                                headers: Default::default(),
                                payload: json!({})
                            }
                        )
                        .await
                        .unwrap()
                        .verified
                );
            }
            _ => {
                assert_eq!(
                    client
                        .webhook_parse(
                            &context(),
                            WebhookParseRequest {
                                connector_key: "slack".into(),
                                payload: json!({})
                            }
                        )
                        .await
                        .unwrap()
                        .idempotency_key,
                    "event"
                );
            }
        }
        let request = String::from_utf8(task.await.unwrap()).unwrap();
        assert!(request.starts_with("POST /rpc HTTP/1.1"));
        let body: serde_json::Value =
            serde_json::from_str(request.split_once("\r\n\r\n").unwrap().1).unwrap();
        assert_eq!(body["method"], method);
        assert_eq!(body["id"], "test-id");
        if method != "runner.describe" {
            assert_eq!(body["params"]["connectorKey"], "slack");
        }
    }
}

#[tokio::test]
async fn chunked_response_cannot_bypass_limit() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let client = RunnerClient::new(
        &format!("http://{}", listener.local_addr().unwrap()),
        "",
        ClientOptions {
            max_response_bytes: 10,
            ..ClientOptions::default()
        },
    )
    .unwrap();
    let task = tokio::spawn(async move {
        let (mut socket, _) = listener.accept().await.unwrap();
        let _request = read_request(&mut socket).await;
        socket.write_all(b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n10\r\n0123456789abcdef\r\n0\r\n\r\n").await.unwrap();
    });
    assert_eq!(
        client.describe(&context()).await.unwrap_err().kind,
        ErrorKind::ResponseTooLarge
    );
    task.await.unwrap();
}

#[tokio::test]
async fn caller_absolute_deadline_is_carried_without_extension() {
    let (url, task)=fixture(json!({"id":"test-id","ok":true,"result":{"protocolVersion":PROTOCOL_VERSION,"runner":"appcall-bun"}}).to_string()).await;
    let client = RunnerClient::new(
        &url,
        "",
        ClientOptions {
            timeout: Duration::from_secs(60),
            ..ClientOptions::default()
        },
    )
    .unwrap();
    let deadline = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64
        + 1000;
    client
        .describe(&RequestContext {
            deadline_unix_ms: Some(deadline),
            ..context()
        })
        .await
        .unwrap();
    let request = String::from_utf8(task.await.unwrap()).unwrap();
    let body: serde_json::Value =
        serde_json::from_str(request.split_once("\r\n\r\n").unwrap().1).unwrap();
    assert_eq!(body["deadlineUnixMs"], deadline);
}

#[test]
fn unsafe_configuration_never_echoes_credentials() {
    for url in [
        "http://secret:password@example.com",
        "http://example.com?token=secret",
        "file:///secret",
    ] {
        let error = match RunnerClient::new(url, "", ClientOptions::default()) {
            Err(error) => error,
            Ok(_) => panic!("unsafe configuration accepted"),
        };
        assert_eq!(error.kind, ErrorKind::Configuration);
        assert!(!error.to_string().contains("secret"));
    }
    assert!(RunnerClient::new(
        "http://127.0.0.1",
        "injected\r\nheader",
        ClientOptions::default()
    )
    .is_err());
}
