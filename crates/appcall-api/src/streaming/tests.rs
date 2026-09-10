use super::*;
use http_body_util::BodyExt;
#[tokio::test]
async fn body_streams_separate_frames_and_receiver_drop_closes_sender() {
    let (tx, rx) = mpsc::channel(16);
    let mut body = EventBody::new(rx);
    tx.send(b"first\n\n".to_vec()).await.unwrap();
    assert_eq!(
        body.frame().await.unwrap().unwrap().into_data().unwrap(),
        Bytes::from_static(b"first\n\n")
    );
    assert!(!body.is_end_stream());
    tx.send(b"second\n\n".to_vec()).await.unwrap();
    assert_eq!(
        body.frame().await.unwrap().unwrap().into_data().unwrap(),
        Bytes::from_static(b"second\n\n")
    );
    drop(body);
    tx.closed().await;
}
struct Source {
    events: std::sync::Mutex<Vec<Event>>,
    polls: std::sync::atomic::AtomicUsize,
}
impl Poller for Source {
    fn poll<'a>(
        &'a self,
        cursor: &'a str,
        filters: &'a EventFilters,
    ) -> Pin<Box<dyn Future<Output = Result<Vec<Event>>> + Send + 'a>> {
        Box::pin(async move {
            self.polls.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            let events = self.events.lock().unwrap();
            let position = if cursor.is_empty() {
                0
            } else {
                events
                    .iter()
                    .find(|e| stream_cursor(e) == cursor)
                    .map(|e| e.stream_position)
                    .ok_or_else(|| ApiError::new("INVALID_CURSOR"))?
            };
            Ok(events
                .iter()
                .filter(|e| {
                    e.stream_position > position
                        && (filters.connection_id.is_empty()
                            || filters.connection_id == e.connection_id)
                        && (filters.connector.is_empty() || filters.connector == e.connector)
                        && (filters.operation.is_empty() || filters.operation == e.operation)
                })
                .take(crate::event_routes::STREAM_PAGE_SIZE)
                .cloned()
                .collect())
        })
    }
}
fn event(position: i64) -> Event {
    Event {
        id: format!("event-{position}"),
        project_id: "private-project".into(),
        connection_id: "connection".into(),
        external_account_id: "brand".into(),
        connector: "slack".into(),
        operation: "message.created".into(),
        payload: serde_json::json!({"text":"hello"}),
        created_at: chrono::Utc::now(),
        stream_position: position,
    }
}

#[test]
fn dashboard_page_preserves_unsupported_ids_without_replay_targets() {
    let mut malformed = event(2);
    malformed.id = "bad/id".into();
    let page = encode_page(vec![event(1), malformed, event(3)], "", Format::Dashboard)
        .expect("one unsupported replay id must not discard the event row");
    assert_eq!(page.frames.len(), 3);
    let frames = page
        .frames
        .iter()
        .map(|(_, frame)| String::from_utf8_lossy(frame))
        .collect::<Vec<_>>();
    assert!(frames[0].contains("/app/events/event-1/replay"));
    assert!(frames[1].contains("Replay unavailable"));
    assert!(!frames[1].contains("/app/events/bad/id/replay"));
    assert!(frames[2].contains("/app/events/event-3/replay"));
}

#[test]
fn dashboard_page_advances_cursor_across_all_unsupported_ids() {
    let mut first = event(1);
    first.id = "bad/id".into();
    let mut second = event(2);
    second.id = "still unsupported".into();
    let page = encode_page(vec![first, second], "", Format::Dashboard)
        .expect("unsupported replay ids must still produce stream frames");
    assert_eq!(page.frames.len(), 2);
    assert_ne!(page.frames[0].0, page.frames[1].0);
    for (_, frame) in page.frames {
        let frame = String::from_utf8_lossy(&frame);
        assert!(frame.contains("Replay unavailable"));
        assert!(!frame.contains("/app/events/bad/id/replay"));
        assert!(!frame.contains("/app/events/still unsupported/replay"));
    }
}

fn source(events: Vec<Event>) -> Arc<Source> {
    Arc::new(Source {
        events: std::sync::Mutex::new(events),
        polls: std::sync::atomic::AtomicUsize::new(0),
    })
}
fn timing() -> Timing {
    Timing {
        poll: Duration::from_millis(5),
        heartbeat: Duration::from_millis(50),
        send: Duration::from_millis(30),
    }
}
async fn receive(rx: &mut EventReceiver) -> Vec<u8> {
    tokio::time::timeout(Duration::from_secs(2), rx.recv())
        .await
        .unwrap()
        .unwrap()
}
#[tokio::test]
async fn durable_cursor_live_delivery_reconnect_and_shutdown() {
    let events = source(vec![event(1)]);
    let (tx, shutdown) = watch::channel(false);
    let mut rx = open_with(events.clone(), String::new(), shutdown.clone(), timing())
        .await
        .unwrap();
    assert_eq!(receive(&mut rx).await, b": connected\n\n");
    let first = String::from_utf8(receive(&mut rx).await).unwrap();
    assert!(first.contains("event-1"));
    assert!(!first.contains("private-project"));
    assert!(first.contains("\"accountId\":\"brand\""));
    events.events.lock().unwrap().push(event(2));
    let second = String::from_utf8(receive(&mut rx).await).unwrap();
    assert!(second.contains("event-2"));
    drop(rx);
    let cursor = stream_cursor(&events.events.lock().unwrap()[0]);
    let mut resumed = open_with(events.clone(), cursor, shutdown, timing())
        .await
        .unwrap();
    receive(&mut resumed).await;
    assert!(String::from_utf8(receive(&mut resumed).await)
        .unwrap()
        .contains("event-2"));
    tx.send(true).unwrap();
    assert!(tokio::time::timeout(Duration::from_secs(1), resumed.recv())
        .await
        .unwrap()
        .is_none());
}
#[tokio::test]
async fn bad_cursor_fails_before_headers_and_slow_receiver_is_bounded() {
    let mut large = event(1);
    large.payload = serde_json::json!({"text":"x".repeat(1024*1024)});
    let events = source(vec![large]);
    let (_tx, shutdown) = watch::channel(false);
    assert!(
        open_with(events.clone(), "bad".into(), shutdown.clone(), timing())
            .await
            .is_err()
    );
    let mut rx = open_with(events.clone(), String::new(), shutdown, timing())
        .await
        .unwrap();
    tokio::time::sleep(Duration::from_millis(100)).await;
    assert!(rx.len() <= 16);
    let mut bytes = 0;
    while let Some(frame) = rx.recv().await {
        bytes += frame.len()
    }
    assert!(bytes <= 16 * 32768);
    assert_eq!(events.polls.load(std::sync::atomic::Ordering::SeqCst), 2);
}
#[tokio::test]
async fn actual_http_body_delivers_later_events_and_disconnect_stops_polling() {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    let events = source(vec![event(1)]);
    let (_tx, shutdown) = watch::channel(false);
    let rx = open_with(events.clone(), String::new(), shutdown, timing())
        .await
        .unwrap();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let server = tokio::spawn(async move {
        let (socket, _) = listener.accept().await.unwrap();
        let slot = std::sync::Mutex::new(Some(rx));
        let service = hyper::service::service_fn(move |_| {
            let receiver = slot.lock().unwrap().take().unwrap();
            async move { Ok::<_, Infallible>(response(receiver)) }
        });
        let _ = hyper::server::conn::http1::Builder::new()
            .keep_alive(false)
            .serve_connection(hyper_util::rt::TokioIo::new(socket), service)
            .await;
    });
    let mut client = tokio::net::TcpStream::connect(address).await.unwrap();
    client
        .write_all(b"GET /v1/events HTTP/1.1\r\nHost: localhost\r\n\r\n")
        .await
        .unwrap();
    let mut received = String::new();
    let mut bytes = [0; 4096];
    while !received.contains("event-1") {
        let n = tokio::time::timeout(Duration::from_secs(2), client.read(&mut bytes))
            .await
            .unwrap()
            .unwrap();
        assert!(n > 0);
        received.push_str(&String::from_utf8_lossy(&bytes[..n]));
    }
    assert!(received.contains("text/event-stream"));
    events.events.lock().unwrap().push(event(2));
    while !received.contains("event-2") {
        let n = tokio::time::timeout(Duration::from_secs(2), client.read(&mut bytes))
            .await
            .unwrap()
            .unwrap();
        assert!(n > 0);
        received.push_str(&String::from_utf8_lossy(&bytes[..n]));
    }
    drop(client);
    tokio::time::timeout(Duration::from_secs(2), server)
        .await
        .unwrap()
        .unwrap();
    tokio::time::sleep(Duration::from_millis(20)).await;
    let polls = events.polls.load(std::sync::atomic::Ordering::SeqCst);
    tokio::time::sleep(Duration::from_millis(20)).await;
    assert_eq!(
        polls,
        events.polls.load(std::sync::atomic::Ordering::SeqCst)
    );
}
#[tokio::test]
async fn dashboard_patches_revalidate_and_stop_after_revocation() {
    let events = source(vec![event(1)]);
    let principal = Principal::project("p").unwrap();
    let revoked = Arc::new(std::sync::atomic::AtomicBool::new(false));
    let flag = revoked.clone();
    let identity = principal.clone();
    let verify: SessionVerifier = Arc::new(move || {
        let revoked = flag.load(std::sync::atomic::Ordering::Acquire);
        let identity = identity.clone();
        Box::pin(async move {
            if revoked {
                Err(ApiError::new("UNAUTHORIZED"))
            } else {
                Ok(identity)
            }
        })
    });
    let source = Arc::new(VerifiedPoller {
        source: events,
        expected: principal,
        verify,
    });
    let (_tx, shutdown) = watch::channel(false);
    let mut rx = open_mode(source, String::new(), shutdown, timing(), Format::Dashboard)
        .await
        .unwrap();
    receive(&mut rx).await;
    let frame = String::from_utf8(receive(&mut rx).await).unwrap();
    assert!(frame.contains("event: datastar-patch-elements"));
    assert!(frame.contains("data: selector #trigger-rows"));
    assert!(frame.contains("id: "));
    assert!(!frame.contains("event: webhook_event"));
    revoked.store(true, std::sync::atomic::Ordering::Release);
    let terminal = String::from_utf8(receive(&mut rx).await).unwrap();
    assert!(terminal.contains("EVENT_STREAM_BACKFILL_FAILED"));
    assert!(tokio::time::timeout(Duration::from_secs(1), rx.recv())
        .await
        .unwrap()
        .is_none());
}
#[tokio::test]
async fn api_stream_revalidates_before_delivering_new_events() {
    let events = source(vec![event(1)]);
    let principal = Principal::project("p").unwrap();
    for changed_scope in [false, true] {
        let revoked = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let flag = revoked.clone();
        let identity = principal.clone();
        let verify: SessionVerifier = Arc::new(move || {
            let revoked = flag.load(std::sync::atomic::Ordering::Acquire);
            let identity = identity.clone();
            Box::pin(async move {
                if !revoked {
                    Ok(identity)
                } else if changed_scope {
                    Ok(Principal::project("other").unwrap())
                } else {
                    Err(ApiError::new("UNAUTHORIZED"))
                }
            })
        });
        let (_tx, shutdown) = watch::channel(false);
        let mut rx = open_verified_with(
            events.clone(),
            principal.clone(),
            String::new(),
            shutdown,
            verify,
            timing(),
            Format::Api,
        )
        .await
        .unwrap();
        receive(&mut rx).await;
        assert!(String::from_utf8(receive(&mut rx).await)
            .unwrap()
            .contains("event: webhook_event"));
        revoked.store(true, std::sync::atomic::Ordering::Release);
        let terminal = String::from_utf8(receive(&mut rx).await).unwrap();
        assert!(terminal.contains("EVENT_STREAM_BACKFILL_FAILED"));
        assert!(tokio::time::timeout(Duration::from_secs(1), rx.recv())
            .await
            .unwrap()
            .is_none());
    }
}

#[tokio::test]
async fn api_stream_closes_when_verified_jwt_expires_or_api_key_is_revoked() {
    use appcall_auth::{
        ApiKeyVerifier, AuthError, Authenticator, Header, JwtPolicy, JwtVerifier, RequestContext,
        StaticApiKey,
    };
    struct RevocableKey {
        key: StaticApiKey,
        revoked: std::sync::atomic::AtomicBool,
    }
    impl ApiKeyVerifier for RevocableKey {
        fn verify_api_key(&self, key: &str) -> std::result::Result<Option<Principal>, AuthError> {
            if self.revoked.load(std::sync::atomic::Ordering::Acquire) {
                Ok(None)
            } else {
                self.key.verify_api_key(key)
            }
        }
    }
    let fixture: serde_json::Value =
        serde_json::from_str(include_str!("../../../appcall-auth/tests/auth_golden.json")).unwrap();
    let principal = Principal::project("p").unwrap();
    let key = Arc::new(RevocableKey {
        key: StaticApiKey::from_hash(
            fixture["api_key_sha256"].as_str().unwrap(),
            principal.clone(),
        )
        .unwrap(),
        revoked: std::sync::atomic::AtomicBool::new(false),
    });
    let now = Arc::new(std::sync::atomic::AtomicI64::new(1800000000));
    for jwt_mode in [false, true] {
        key.revoked
            .store(false, std::sync::atomic::Ordering::Release);
        now.store(1800000000, std::sync::atomic::Ordering::Release);
        let verify_key = key.clone();
        let verify_now = now.clone();
        let jwt = Arc::new(
            JwtVerifier::new(
                fixture["jwt_secret"].as_str().unwrap(),
                JwtPolicy::default(),
            )
            .unwrap(),
        );
        let token = fixture["jwt"].as_str().unwrap().to_owned();
        let api_key = fixture["api_key"].as_str().unwrap().to_owned();
        let expected = principal.clone();
        let verify: SessionVerifier = Arc::new(move || {
            let result = if jwt_mode {
                jwt.verify(
                    &token,
                    verify_now.load(std::sync::atomic::Ordering::Acquire),
                )
                .map(|_| expected.clone())
            } else {
                Authenticator::production(Some(&*verify_key), None, None).and_then(|a| {
                    a.authorize(
                        &[Header::new("X-API-Key", &api_key)],
                        &RequestContext::default(),
                    )
                })
            }
            .map_err(|_| ApiError::new("UNAUTHORIZED"));
            Box::pin(async move { result })
        });
        let events = source(vec![event(1)]);
        let (_tx, shutdown) = watch::channel(false);
        let mut rx = open_verified_with(
            events.clone(),
            principal.clone(),
            String::new(),
            shutdown,
            verify,
            timing(),
            Format::Api,
        )
        .await
        .unwrap();
        receive(&mut rx).await;
        receive(&mut rx).await;
        now.store(2100000000, std::sync::atomic::Ordering::Release);
        key.revoked
            .store(true, std::sync::atomic::Ordering::Release);
        events.events.lock().unwrap().push(event(2));
        let terminal = String::from_utf8(receive(&mut rx).await).unwrap();
        assert!(terminal.contains("EVENT_STREAM_BACKFILL_FAILED"));
        assert!(!terminal.contains("event-2"));
        assert!(tokio::time::timeout(Duration::from_secs(1), rx.recv())
            .await
            .unwrap()
            .is_none());
    }
}
#[tokio::test]
async fn retirement_acknowledges_source_release_after_shutdown_and_disconnect() {
    for disconnect in [false, true] {
        let activity = Arc::new(StreamActivity::default());
        let events = source(vec![event(1)]);
        let watched: Arc<dyn Poller> = Arc::new(TrackedPoller {
            source: events.clone(),
            _guard: activity.acquire(),
        });
        let (stop, shutdown) = watch::channel(false);
        let mut rx = open_with(watched, String::new(), shutdown, timing())
            .await
            .unwrap();
        receive(&mut rx).await;
        assert!(!activity.idle());
        if disconnect {
            drop(rx);
        } else {
            stop.send_replace(true);
        }
        tokio::time::timeout(Duration::from_secs(1), async {
            while !activity.idle() {
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap();
        assert_eq!(
            Arc::strong_count(&events),
            1,
            "ack must follow source release"
        );
    }
}
