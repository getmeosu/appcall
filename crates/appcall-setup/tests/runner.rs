use appcall_connectors::{Connector, Registry};
use appcall_runner_client::{ClientOptions, RunnerClient};
use appcall_setup::*;
use std::{
    collections::BTreeMap,
    io::{Read, Write},
    net::TcpListener,
    sync::Arc,
};
#[test]
fn validator_checks_provider_provenance_and_forwards_fields() {
    for source in ["static", "provider"] {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let thread = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            let mut raw = Vec::new();
            let request = loop {
                let mut bytes = [0; 4096];
                let n = socket.read(&mut bytes).unwrap();
                assert!(n > 0);
                raw.extend_from_slice(&bytes[..n]);
                if let Some(end) = raw.windows(4).position(|v| v == b"\r\n\r\n") {
                    let headers = String::from_utf8_lossy(&raw[..end]);
                    let length = headers
                        .lines()
                        .find_map(|line| {
                            let (k, v) = line.split_once(':')?;
                            k.eq_ignore_ascii_case("content-length")
                                .then(|| v.trim().parse::<usize>().unwrap())
                        })
                        .unwrap();
                    if raw.len() >= end + 4 + length {
                        break serde_json::from_slice::<serde_json::Value>(
                            &raw[end + 4..end + 4 + length],
                        )
                        .unwrap();
                    }
                }
            };
            let body=serde_json::json!({"id":request["id"],"ok":true,"result":{"status":"ok","source":source}}).to_string();
            write!(
                socket,
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            )
            .unwrap();
            request
        });
        let registry = Arc::new(
            Registry::from_connectors([Connector::from_bytes(include_bytes!(
                "../../../runner/connectors/brevo/manifest.json"
            ))
            .unwrap()])
            .unwrap(),
        );
        let runtime = tokio::runtime::Runtime::new().unwrap();
        let validator = RunnerValidator::new(
            Arc::new(RunnerClient::new(&url, "", ClientOptions::default()).unwrap()),
            registry.clone(),
            runtime.handle().clone(),
        );
        let credential = " \u{2003}synthetic\u{2003} ";
        let credentials = collect_fields(
            &registry.connector("brevo").unwrap().manifest().auth.setup,
            "",
            &BTreeMap::from([("apiKey".into(), credential.into())]),
        )
        .unwrap();
        let result = validator.validate("p", "brevo", &credentials);
        assert_eq!(result.is_ok(), source == "provider");
        let request = thread.join().unwrap();
        assert_eq!(request["params"]["input"]["apiKey"], credential);
    }
}
#[test]
fn credential_action_negative_or_malformed_is_not_success() {
    for output in [
        serde_json::json!({"valid":false}),
        serde_json::json!({"ok":false}),
        serde_json::json!({}),
        serde_json::json!({"valid":"true"}),
        serde_json::json!({"valid":true}),
    ] {
        let expected = if output.get("valid").and_then(serde_json::Value::as_bool) == Some(true) {
            Ok(ValidationEvidence::LocalAccepted)
        } else {
            Err(Error::ValidationFailed)
        };
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let thread = std::thread::spawn(move || {
            for result in [
                serde_json::json!({"status":"ok","source":"static"}),
                serde_json::json!({"output":output}),
            ] {
                let (mut socket, _) = listener.accept().unwrap();
                let mut raw = Vec::new();
                let request = loop {
                    let mut bytes = [0; 4096];
                    let n = socket.read(&mut bytes).unwrap();
                    assert!(n > 0);
                    raw.extend_from_slice(&bytes[..n]);
                    if let Some(end) = raw.windows(4).position(|v| v == b"\r\n\r\n") {
                        if let Ok(request) =
                            serde_json::from_slice::<serde_json::Value>(&raw[end + 4..])
                        {
                            break request;
                        }
                    }
                };
                let body =
                    serde_json::json!({"id":request["id"],"ok":true,"result":result}).to_string();
                write!(
                    socket,
                    "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    body.len(),
                    body
                )
                .unwrap();
            }
        });
        let registry = Arc::new(
            Registry::from_connectors([Connector::from_bytes(include_bytes!(
                "../../../runner/connectors/notion/manifest.json"
            ))
            .unwrap()])
            .unwrap(),
        );
        let runtime = tokio::runtime::Runtime::new().unwrap();
        let validator = RunnerValidator::new(
            Arc::new(RunnerClient::new(&url, "", ClientOptions::default()).unwrap()),
            registry.clone(),
            runtime.handle().clone(),
        );
        let fields = collect_fields(
            &registry.connector("notion").unwrap().manifest().auth.setup,
            "",
            &BTreeMap::from([("notionToken".into(), "synthetic".into())]),
        )
        .unwrap();
        assert_eq!(validator.check("p", "notion", &fields), expected);
        thread.join().unwrap();
    }
}

#[test]
fn cancellation_after_health_prevents_followup_validation_rpc() {
    use std::sync::atomic::{AtomicBool, Ordering};
    let cancelled = Arc::new(AtomicBool::new(false));
    let worker_cancelled = cancelled.clone();
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let thread = std::thread::spawn(move || {
        let (mut socket, _) = listener.accept().unwrap();
        let mut raw = Vec::new();
        let request = loop {
            let mut bytes = [0; 4096];
            let n = socket.read(&mut bytes).unwrap();
            assert!(n > 0);
            raw.extend_from_slice(&bytes[..n]);
            if let Some(end) = raw.windows(4).position(|v| v == b"\r\n\r\n") {
                if let Ok(request) = serde_json::from_slice::<serde_json::Value>(&raw[end + 4..]) {
                    break request;
                }
            }
        };
        worker_cancelled.store(true, Ordering::Release);
        let body=serde_json::json!({"id":request["id"],"ok":true,"result":{"status":"ok","source":"connector"}}).to_string();
        write!(
            socket,
            "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            body.len(),
            body
        )
        .unwrap();
        listener
    });
    let registry = Arc::new(
        Registry::from_connectors([Connector::from_bytes(include_bytes!(
            "../../../runner/connectors/notion/manifest.json"
        ))
        .unwrap()])
        .unwrap(),
    );
    let runtime = tokio::runtime::Runtime::new().unwrap();
    let validator = RunnerValidator::new(
        Arc::new(RunnerClient::new(&url, "", ClientOptions::default()).unwrap()),
        registry.clone(),
        runtime.handle().clone(),
    );
    let fields = collect_fields(
        &registry.connector("notion").unwrap().manifest().auth.setup,
        "",
        &BTreeMap::from([("notionToken".into(), "synthetic".into())]),
    )
    .unwrap();
    assert_eq!(
        validator.check_checked("p", "notion", &fields, &|| !cancelled
            .load(Ordering::Acquire)),
        Err(Error::Cancelled)
    );
    let listener = thread.join().unwrap();
    listener.set_nonblocking(true).unwrap();
    assert!(matches!(listener.accept(),Err(error) if error.kind()==std::io::ErrorKind::WouldBlock));
}
