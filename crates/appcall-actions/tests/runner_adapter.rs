use appcall_actions::*;
use appcall_runner_client::{ClientOptions, RunnerClient};
use serde_json::{json, Value};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
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
    for mode in ["success", "rate", "malformed", "oversized"] {
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
            let body=match mode {"success"=>json!({"id":request["id"],"ok":true,"result":{"output":{"sent":true}}}).to_string(),"rate"=>json!({"id":request["id"],"ok":false,"error":{"code":"CONNECTOR_RATE_LIMITED","message":"provider detail runtime/key runtime%2Fkey","retryAfterSeconds":7}}).to_string(),"oversized"=>"x".repeat(4000),_=>"not json".into()};
            let _=write!(socket,"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",body.len(),body);
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
            "oversized" => assert_eq!(result.unwrap_err().code, "ACTION_RESPONSE_TOO_LARGE"),
            _ => assert_eq!(result.unwrap_err().code, "ACTION_FAILED"),
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
