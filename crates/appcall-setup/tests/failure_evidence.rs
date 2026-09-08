use appcall_connectors::{Connector, Registry};
use appcall_runner_client::{ClientOptions, RunnerClient};
use appcall_setup::{Credentials, Error, RunnerValidator, ValidationFailure};
use std::{
    collections::BTreeMap,
    io::{self, Read, Write},
    net::{TcpListener, TcpStream},
    sync::Arc,
    time::{Duration, Instant},
};

fn accept_before(listener: &TcpListener, deadline: Instant) -> io::Result<TcpStream> {
    listener.set_nonblocking(true)?;
    loop {
        match listener.accept() {
            Ok((socket, _)) => {
                socket.set_nonblocking(false)?;
                return Ok(socket);
            }
            Err(error) if error.kind() == io::ErrorKind::WouldBlock => {
                let remaining = deadline.saturating_duration_since(Instant::now());
                if remaining.is_zero() {
                    return Err(io::Error::new(
                        io::ErrorKind::TimedOut,
                        "fixture RPC did not arrive",
                    ));
                }
                std::thread::sleep(remaining.min(Duration::from_millis(1)));
            }
            Err(error) => return Err(error),
        }
    }
}

#[test]
fn fixture_accept_deadline_expires_without_a_client() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    assert_eq!(
        accept_before(&listener, Instant::now()).unwrap_err().kind(),
        io::ErrorKind::TimedOut
    );
}

#[test]
fn health_and_setup_distinguish_timeout_from_dropped_transport() {
    for (health, followup) in [(false, false), (true, false), (false, true)] {
        for timeout in [false, true] {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            let url = format!("http://{}", listener.local_addr().unwrap());
            let server = std::thread::spawn(move || {
                let mut socket =
                    accept_before(&listener, Instant::now() + Duration::from_secs(3)).unwrap();
                if followup {
                    socket
                        .set_read_timeout(Some(Duration::from_secs(3)))
                        .unwrap();
                    let mut raw = Vec::new();
                    let request = loop {
                        let mut bytes = [0; 4096];
                        let count = socket.read(&mut bytes).unwrap();
                        assert!(count > 0);
                        raw.extend_from_slice(&bytes[..count]);
                        if let Some(end) = raw.windows(4).position(|w| w == b"\r\n\r\n") {
                            if let Ok(request) =
                                serde_json::from_slice::<serde_json::Value>(&raw[end + 4..])
                            {
                                break request;
                            }
                        }
                    };
                    let body = serde_json::json!({"id": request["id"], "ok": true, "result": {"status": "ok", "source": "static"}}).to_string();
                    write!(
                        socket,
                        "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                        body.len(),
                        body
                    )
                    .unwrap();
                    drop(socket);
                    socket =
                        accept_before(&listener, Instant::now() + Duration::from_secs(3)).unwrap();
                }
                socket
                    .set_read_timeout(Some(Duration::from_secs(3)))
                    .unwrap();
                let mut bytes = [0; 4096];
                assert!(socket.read(&mut bytes).unwrap() > 0);
                if timeout {
                    std::thread::sleep(Duration::from_millis(300));
                }
            });
            let runtime = tokio::runtime::Runtime::new().unwrap();
            let registry = Arc::new(
                Registry::from_connectors([Connector::from_bytes(include_bytes!(
                    "../../../runner/connectors/notion/manifest.json"
                ))
                .unwrap()])
                .unwrap(),
            );
            let validator = RunnerValidator::new(
                Arc::new(
                    RunnerClient::new(
                        &url,
                        "",
                        ClientOptions {
                            timeout: Duration::from_millis(100),
                            ..Default::default()
                        },
                    )
                    .unwrap(),
                ),
                registry,
                runtime.handle().clone(),
            );
            let credentials = Credentials::from_fields(BTreeMap::from([(
                "notionToken".into(),
                "submitted-secret".into(),
            )]))
            .unwrap();
            let error = if health {
                validator
                    .health_checked("notion", &credentials, &|| true)
                    .unwrap_err()
            } else {
                validator.check("p", "notion", &credentials).unwrap_err()
            };
            server.join().unwrap();
            let evidence = format!("{error:?}");
            assert!(!evidence.contains("submitted-secret"));
            assert_eq!(
                error,
                Error::Validation(if timeout {
                    ValidationFailure::Timeout
                } else {
                    ValidationFailure::Transport
                })
            );
        }
    }
}

#[test]
fn only_typed_runner_timeout_and_transport_prove_specific_causes() {
    use appcall_runner_client::ErrorKind as K;
    for kind in [
        K::Configuration,
        K::InvalidRequest,
        K::RequestTooLarge,
        K::RedirectBlocked,
        K::ResponseTooLarge,
        K::MalformedResponse,
        K::HttpStatus,
        K::Runner,
        K::IncompatibleProtocol,
    ] {
        assert_eq!(
            ValidationFailure::from_runner_kind(kind),
            ValidationFailure::VerificationFailed
        );
    }
}
