use super::*;
use crate::Request;
use appcall_auth::Principal;
use appcall_connectors::OperationKind;
use appcall_events::ParsedWebhook;
use appcall_store::{AuthType, Connection, CredentialOwner, Status, TestStatus};

fn parsed(id: &str, operation: &str) -> ParsedWebhook {
    ParsedWebhook {
        idempotency_key: id.into(),
        operation: operation.into(),
        sanitized: serde_json::json!({"text":"safe","apiKey":"never-retain"}),
    }
}

fn manifest_operation(
    repo: &MemoryRepository,
    connector: &str,
    expected: &str,
    kind: OperationKind,
) -> String {
    let operation = repo.registry().operation(connector, expected).unwrap();
    assert_eq!(operation.kind, kind);
    expected.into()
}

fn add_connection(repo: &MemoryRepository, id: &str, connector: &str) -> (Connection, u64) {
    repo.create_connection(
        Connection {
            id: id.into(),
            project_id: "proj_dev".into(),
            connector: connector.into(),
            auth_type: AuthType::ApiKey,
            status: Status::Active,
            secret_ref_id: String::new(),
            last_test_status: TestStatus::Unknown,
            external_account_id: "brand".into(),
            credential_owner: CredentialOwner::Brand,
        },
        None,
    )
    .unwrap();
    repo.get_connection("proj_dev", None, id).unwrap()
}

#[tokio::test]
async fn event_only_manifest_webhooks_retain_operations_in_memory_history() {
    let repo = super::history_tests::fixture();
    let events = MemoryEvents::new(repo.clone(), None, None);
    let apollo_operation = manifest_operation(
        &repo,
        "apollo",
        "webhook.phone_revealed",
        OperationKind::Webhook,
    );
    let rb2b_operation = manifest_operation(
        &repo,
        "rb2b",
        "webhook.visitor_identified",
        OperationKind::Webhook,
    );
    let cases = [
        (
            "apollo",
            "apollo-event",
            apollo_operation.as_str(),
            serde_json::json!({"personId":"person-1","apiKey":"never-retain"}),
        ),
        (
            "rb2b",
            "rb2b-event",
            rb2b_operation.as_str(),
            serde_json::json!({"visitorId":"visitor-1","apiKey":"never-retain"}),
        ),
    ];
    for (connector, id, operation, sanitized) in cases {
        let (connection, revision) = add_connection(&repo, connector, connector);
        let accepted = events
            .accept(
                &connection,
                revision,
                &ParsedWebhook {
                    idempotency_key: id.into(),
                    operation: operation.into(),
                    sanitized,
                },
            )
            .unwrap();
        assert!(!accepted.duplicate);
    }

    let principal = Principal::project("proj_dev").unwrap();
    let polled = events.poll(&principal, "").await.unwrap();
    assert_eq!(polled.len(), 2);
    for (id, operation) in [
        ("apollo-event", apollo_operation.as_str()),
        ("rb2b-event", rb2b_operation.as_str()),
    ] {
        let event = polled.iter().find(|event| event.id == id).unwrap();
        assert_eq!(event.operation, operation);
        assert!(!event.payload.to_string().contains("never-retain"));
    }

    let history = events
        .handle(
            Some(&principal),
            &Request {
                method: "GET".into(),
                uri: "/v1/webhook-events".into(),
                headers: vec![],
                body: vec![],
            },
        )
        .await
        .unwrap()
        .unwrap();
    for (id, operation) in [
        ("apollo-event", apollo_operation.as_str()),
        ("rb2b-event", rb2b_operation.as_str()),
    ] {
        let event = history.body["events"]
            .as_array()
            .unwrap()
            .iter()
            .find(|event| event["id"] == id)
            .unwrap();
        assert_eq!(event["operation"], operation);
    }
}

#[tokio::test]
async fn event_only_manifest_webhooks_support_filters_usage_replay_and_deduplication() {
    let repo = super::history_tests::fixture();
    let events = MemoryEvents::new(repo.clone(), None, None);
    let apollo_operation = manifest_operation(
        &repo,
        "apollo",
        "webhook.phone_revealed",
        OperationKind::Webhook,
    );
    let rb2b_operation = manifest_operation(
        &repo,
        "rb2b",
        "webhook.visitor_identified",
        OperationKind::Webhook,
    );
    let (apollo, apollo_revision) = add_connection(&repo, "apollo", "apollo");
    let (rb2b, rb2b_revision) = add_connection(&repo, "rb2b", "rb2b");
    let apollo_event = parsed("apollo-event", &apollo_operation);
    let rb2b_event = parsed("rb2b-event", &rb2b_operation);
    events
        .accept(&apollo, apollo_revision, &apollo_event)
        .unwrap();
    events.accept(&rb2b, rb2b_revision, &rb2b_event).unwrap();

    let principal = Principal::project("proj_dev").unwrap();
    for (connector, connection_id, operation, id) in [
        (
            "apollo",
            "apollo",
            apollo_operation.as_str(),
            "apollo-event",
        ),
        ("rb2b", "rb2b", rb2b_operation.as_str(), "rb2b-event"),
    ] {
        let filtered = events
            .poll_filtered(
                &principal,
                "",
                &crate::streaming::EventFilters {
                    connector: connector.into(),
                    connection_id: connection_id.into(),
                    operation: operation.into(),
                },
            )
            .await
            .unwrap();
        assert_eq!(
            filtered
                .iter()
                .map(|event| event.id.as_str())
                .collect::<Vec<_>>(),
            [id]
        );
        assert_eq!(filtered[0].operation, operation);
    }

    let usage = repo.list_usage_events("proj_dev", Some("brand")).unwrap();
    assert_eq!(usage.len(), 2);
    assert!(usage
        .iter()
        .all(|event| event.kind == "webhook_event" && event.quantity == 1));
    assert_eq!(
        repo.usage_monthly("proj_dev", Some("brand"), "").unwrap()["webhookEvents"],
        2
    );

    let replay = events
        .handle(
            Some(&principal),
            &Request {
                method: "POST".into(),
                uri: "/v1/webhook-events/apollo-event/replay".into(),
                headers: vec![],
                body: vec![],
            },
        )
        .await
        .unwrap()
        .unwrap();
    assert_eq!(replay.status, 202);
    assert_eq!(replay.body["replayed"], true);

    let duplicate = events
        .accept(&apollo, apollo_revision, &apollo_event)
        .unwrap();
    assert!(duplicate.duplicate);
    assert_eq!(events.poll(&principal, "").await.unwrap().len(), 2);
    assert_eq!(
        repo.list_usage_events("proj_dev", Some("brand"))
            .unwrap()
            .len(),
        2
    );
    assert_eq!(
        repo.usage_monthly("proj_dev", Some("brand"), "").unwrap()["webhookEvents"],
        2
    );
}

#[tokio::test]
async fn memory_api_rejects_manifest_sync_operations_without_mutation() {
    let repo = super::history_tests::fixture();
    let events = MemoryEvents::new(repo.clone(), None, None);
    let operation = manifest_operation(&repo, "slack", "messages.list", OperationKind::Sync);
    let principal = Principal::project("proj_dev").unwrap();
    let error = events
        .handle(
            Some(&principal),
            &Request {
                method: "POST".into(),
                uri: "/v1/connections/c/webhooks/slack".into(),
                headers: vec![],
                body: serde_json::to_vec(&serde_json::json!({
                    "event_id":"sync-event",
                    "operation":operation,
                    "channel":"C123",
                    "apiKey":"never-retain"
                }))
                .unwrap(),
            },
        )
        .await
        .unwrap_err();
    assert_eq!(error.code, "WEBHOOK_SYNC_UNAVAILABLE");
    assert!(events.poll(&principal, "").await.unwrap().is_empty());
    assert!(repo
        .list_usage_events("proj_dev", Some("brand"))
        .unwrap()
        .is_empty());
    assert_eq!(repo.lock().unwrap().next_sequence, 0);
}
#[tokio::test]
async fn events_are_scoped_sanitized_atomic_and_reject_sync_before_insert() {
    let repo = super::history_tests::fixture();
    let events = MemoryEvents::new(repo.clone(), None, None);
    let (expected, revision) = repo.get_connection("proj_dev", None, "c").unwrap();
    assert!(events
        .accept(&expected, revision, &parsed("sync", "messages.list"))
        .is_err());
    assert_eq!(repo.lock().unwrap().events.len(), 0);
    let first = events
        .accept(&expected, revision, &parsed("e1", ""))
        .unwrap();
    assert!(!first.duplicate);
    assert!(
        events
            .accept(&expected, revision, &parsed("e1", ""))
            .unwrap()
            .duplicate
    );
    assert_eq!(repo.lock().unwrap().usage_events.len(), 1);
    let p = Principal::project("proj_dev").unwrap();
    let page = events.poll(&p, "").await.unwrap();
    assert_eq!(page.len(), 1);
    assert!(!page[0].payload.to_string().contains("never-retain"));
    assert!(events
        .poll(&Principal::project("other").unwrap(), "")
        .await
        .unwrap()
        .is_empty());
    let cursor = appcall_events::stream_cursor(&page[0]);
    assert!(events.poll(&p, &cursor).await.unwrap().is_empty());
    let request = Request {
        method: "POST".into(),
        uri: "/v1/connections/c/webhooks/slack".into(),
        headers: vec![],
        body: b"{}".to_vec(),
    };
    assert_eq!(
        events.handle(None, &request).await.unwrap_err().code,
        "UNAUTHORIZED"
    );
    let replacement = expected.clone();
    let (_, rev) = repo.get_connection("proj_dev", None, "c").unwrap();
    repo.replace_connection(
        "proj_dev",
        None,
        rev,
        replacement,
        Some(("api_key", br#"{"apiKey":"rotated"}"#)),
    )
    .unwrap();
    assert!(events
        .accept(&expected, revision, &parsed("stale", ""))
        .is_err());
    assert_eq!(repo.lock().unwrap().events.len(), 1);
}

#[tokio::test]
async fn history_snapshot_cursor_delivers_only_events_after_the_snapshot() {
    let repo = super::history_tests::fixture();
    let events = MemoryEvents::new(repo.clone(), None, None);
    let (expected, revision) = repo.get_connection("proj_dev", None, "c").unwrap();
    events
        .accept(&expected, revision, &parsed("before-snapshot", ""))
        .unwrap();
    let principal = Principal::project("proj_dev").unwrap();
    let history = events
        .handle(
            Some(&principal),
            &Request {
                method: "GET".into(),
                uri: "/v1/webhook-events".into(),
                headers: vec![],
                body: vec![],
            },
        )
        .await
        .unwrap()
        .unwrap();
    let cursor = history.body["streamCursor"]
        .as_str()
        .expect("history must expose its stream high-water cursor")
        .to_owned();

    assert!(events.poll(&principal, &cursor).await.unwrap().is_empty());
    let after_id = events
        .accept(&expected, revision, &parsed("after-snapshot", ""))
        .unwrap()
        .event_id;
    let delivered = events.poll(&principal, &cursor).await.unwrap();
    assert_eq!(
        delivered
            .iter()
            .map(|event| event.id.as_str())
            .collect::<Vec<_>>(),
        [after_id.as_str()]
    );
}

#[tokio::test]
async fn filtered_stream_delivers_matching_new_events_only() {
    let repo = super::history_tests::fixture();
    let events = MemoryEvents::new(repo.clone(), None, None);
    let (expected, revision) = repo.get_connection("proj_dev", None, "c").unwrap();
    events
        .accept(&expected, revision, &parsed("before-filter", ""))
        .unwrap();
    let principal = Principal::project("proj_dev").unwrap();
    let history = events
        .handle(
            Some(&principal),
            &Request {
                method: "GET".into(),
                uri: "/v1/webhook-events".into(),
                headers: vec![],
                body: vec![],
            },
        )
        .await
        .unwrap()
        .unwrap();
    let cursor = history.body["streamCursor"].as_str().unwrap().to_owned();
    let matching_id = events
        .accept(&expected, revision, &parsed("matching-after", ""))
        .unwrap()
        .event_id;
    let nonmatching_id = events
        .accept(&expected, revision, &parsed("nonmatching-operation", ""))
        .unwrap()
        .event_id;
    {
        let mut data = repo.lock().unwrap();
        data.events
            .get_mut(&("proj_dev".into(), matching_id.clone()))
            .unwrap()
            .operation = "messages.list".into();
        data.events
            .get_mut(&("proj_dev".into(), nonmatching_id))
            .unwrap()
            .operation = "messages.send".into();
    }
    let matching = crate::streaming::EventFilters {
        connector: "slack".into(),
        connection_id: "c".into(),
        operation: "messages.list".into(),
    };
    let delivered = events
        .poll_filtered(&principal, &cursor, &matching)
        .await
        .unwrap();
    assert_eq!(
        delivered
            .iter()
            .map(|event| event.id.as_str())
            .collect::<Vec<_>>(),
        [matching_id.as_str()]
    );
    for filters in [
        crate::streaming::EventFilters {
            connector: "github".into(),
            ..matching.clone()
        },
        crate::streaming::EventFilters {
            connection_id: "other-connection".into(),
            ..matching.clone()
        },
        crate::streaming::EventFilters {
            operation: "messages.delete".into(),
            ..matching.clone()
        },
    ] {
        assert!(events
            .poll_filtered(&principal, &cursor, &filters)
            .await
            .unwrap()
            .is_empty());
    }
}

#[tokio::test]
async fn event_inserted_between_snapshot_and_stream_open_is_delivered() {
    let repo = super::history_tests::fixture();
    let events = MemoryEvents::new(repo.clone(), None, None);
    let (expected, revision) = repo.get_connection("proj_dev", None, "c").unwrap();
    events
        .accept(&expected, revision, &parsed("before-open", ""))
        .unwrap();
    let principal = Principal::project("proj_dev").unwrap();
    let history = events
        .handle(
            Some(&principal),
            &Request {
                method: "GET".into(),
                uri: "/v1/webhook-events".into(),
                headers: vec![],
                body: vec![],
            },
        )
        .await
        .unwrap()
        .unwrap();
    let cursor = history.body["streamCursor"].as_str().unwrap().to_owned();
    let between_id = events
        .accept(
            &expected,
            revision,
            &parsed("between-snapshot-and-open", ""),
        )
        .unwrap()
        .event_id;
    let expected_principal = principal.clone();
    let verify: crate::streaming::SessionVerifier = std::sync::Arc::new(move || {
        let expected_principal = expected_principal.clone();
        Box::pin(async move { Ok(expected_principal) })
    });
    let (_stop, shutdown) = tokio::sync::watch::channel(false);
    let mut receiver = events
        .open_filtered(
            principal,
            cursor,
            crate::streaming::EventFilters::default(),
            shutdown,
            verify,
            false,
        )
        .await
        .unwrap();
    assert_eq!(receiver.recv().await.unwrap(), b": connected\n\n");
    let frame = tokio::time::timeout(std::time::Duration::from_secs(1), receiver.recv())
        .await
        .unwrap()
        .unwrap();
    let frame = String::from_utf8(frame).unwrap();
    assert!(frame.contains(&between_id));
    assert!(!frame.contains("before-open"));
}

#[tokio::test]
async fn shared_stream_backfill_live_revalidation_and_drain() {
    use std::sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    };
    let repo = super::history_tests::fixture();
    let events = MemoryEvents::new(repo.clone(), None, None);
    let (expected, revision) = repo.get_connection("proj_dev", None, "c").unwrap();
    let backfill_id = events
        .accept(&expected, revision, &parsed("backfill", ""))
        .unwrap()
        .event_id;
    let p = Principal::project("proj_dev").unwrap();
    let live = Arc::new(AtomicBool::new(true));
    let allowed = live.clone();
    let principal = p.clone();
    let verify: crate::streaming::SessionVerifier = Arc::new(move || {
        let principal = principal.clone();
        let allowed = allowed.clone();
        Box::pin(async move {
            if allowed.load(Ordering::Acquire) {
                Ok(principal)
            } else {
                Err(crate::ApiError::new("UNAUTHORIZED"))
            }
        })
    });
    let (stop, shutdown) = tokio::sync::watch::channel(false);
    let mut receiver = events
        .open(p, String::new(), shutdown, verify, false)
        .await
        .unwrap();
    assert!(!events.retirement_ready());
    let first = String::from_utf8(receiver.recv().await.unwrap()).unwrap();
    assert_eq!(first, ": connected\n\n");
    let backfill = String::from_utf8(receiver.recv().await.unwrap()).unwrap();
    assert!(backfill.contains(&backfill_id));
    let live_id = events
        .accept(&expected, revision, &parsed("live", ""))
        .unwrap()
        .event_id;
    let next = tokio::time::timeout(std::time::Duration::from_secs(3), async {
        loop {
            let frame = receiver.recv().await.unwrap();
            if frame.windows(5).any(|w| w == b"data:") {
                break frame;
            }
        }
    })
    .await
    .unwrap();
    assert!(String::from_utf8(next).unwrap().contains(&live_id));
    live.store(false, Ordering::Release);
    tokio::time::timeout(std::time::Duration::from_secs(3), async {
        while let Some(frame) = receiver.recv().await {
            let text = String::from_utf8(frame).unwrap();
            assert!(!text.contains("webhook_event"));
        }
    })
    .await
    .unwrap();
    assert!(events.retirement_ready());
    drop(stop);
}
#[tokio::test]
#[ignore = "requires synthetic local runner TCP socket"]
async fn signed_rpc_ingestion_authentication_and_no_scheduler_are_actual_boundaries() {
    use std::sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    };
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let calls = Arc::new(AtomicUsize::new(0));
    let seen = calls.clone();
    let repo = super::history_tests::fixture();
    let concurrent = repo.clone();
    let server = tokio::spawn(async move {
        for _ in 0..6 {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut bytes = Vec::new();
            let mut chunk = [0; 2048];
            let end = loop {
                let n = socket.read(&mut chunk).await.unwrap();
                assert!(n > 0);
                bytes.extend_from_slice(&chunk[..n]);
                if let Some(i) = bytes.windows(4).position(|w| w == b"\r\n\r\n") {
                    break i + 4;
                }
            };
            let size: usize = String::from_utf8_lossy(&bytes[..end])
                .lines()
                .find_map(|l| {
                    l.to_ascii_lowercase()
                        .strip_prefix("content-length:")
                        .map(|n| n.trim().parse().unwrap())
                })
                .unwrap();
            while bytes.len() < end + size {
                let n = socket.read(&mut chunk).await.unwrap();
                bytes.extend_from_slice(&chunk[..n]);
            }
            let rpc: serde_json::Value = serde_json::from_slice(&bytes[end..end + size]).unwrap();
            assert!(rpc["deadlineUnixMs"].is_u64());
            seen.fetch_add(1, Ordering::SeqCst);
            let result = if rpc["method"] == "connector.webhook.verify" {
                serde_json::json!({"verified":true})
            } else {
                if rpc["params"]["payload"]["aba"] == true {
                    let (original, revision) =
                        concurrent.get_connection("proj_dev", None, "c").unwrap();
                    assert!(original.secret_ref_id.is_empty());
                    let mut disconnected = original.clone();
                    disconnected.status = appcall_store::Status::Disconnected;
                    concurrent
                        .replace_connection("proj_dev", None, revision, disconnected, None)
                        .unwrap();
                    let (_, revision) = concurrent.get_connection("proj_dev", None, "c").unwrap();
                    concurrent
                        .replace_connection("proj_dev", None, revision, original, None)
                        .unwrap();
                }
                serde_json::json!({"idempotencyKey":rpc["params"]["payload"]["id"],"operation":if rpc["params"]["payload"]["sync"]==true{"messages.list"}else{""},"sanitized":{"text":"safe"}})
            };
            let body = serde_json::json!({"ok":true,"id":rpc["id"],"result":result}).to_string();
            socket
                .write_all(
                    format!(
                        "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                        body.len(),
                        body
                    )
                    .as_bytes(),
                )
                .await
                .unwrap();
        }
    });
    let runner = appcall_runner_client::RunnerClient::new(
        &format!("http://{address}"),
        "fixture-runner-token",
        Default::default(),
    )
    .unwrap();
    let events = MemoryEvents::new(
        repo.clone(),
        Some(runner),
        Some(appcall_auth::WebhookVerifier::new(b"memory-hook-test").unwrap()),
    );
    let token="eyJwIjoicHJval9kZXYiLCJjIjoiYyIsImsiOiJzbGFjayJ9.63yqic5zhbBw5dE8z_w8rpfy-0ipomG26ugRba7IN8Y";
    let mut request = Request {
        method: "POST".into(),
        uri: "/v1/connections/c/webhooks/slack?token=forged".into(),
        headers: vec![],
        body: br#"{"id":"e","secret":"raw-never-retained"}"#.to_vec(),
    };
    assert_eq!(
        events.handle(None, &request).await.unwrap_err().code,
        "UNAUTHORIZED"
    );
    assert_eq!(calls.load(Ordering::SeqCst), 0);
    request.uri = format!("/v1/connections/c/webhooks/slack?token={token}");
    request.body = br#"{"id":"stale","aba":true}"#.to_vec();
    assert_eq!(
        events.handle(None, &request).await.unwrap_err().code,
        "CONNECTION_CHANGED"
    );
    assert_eq!(repo.lock().unwrap().events.len(), 0);
    assert_eq!(repo.lock().unwrap().usage_events.len(), 0);
    assert_eq!(repo.lock().unwrap().next_sequence, 0);
    request.body = br#"{"id":"e","secret":"raw-never-retained"}"#.to_vec();
    let result = events.handle(None, &request).await.unwrap().unwrap();
    assert_eq!(result.status, 202);
    assert_eq!(repo.lock().unwrap().events.len(), 1);
    request.body = br#"{"id":"sync","sync":true}"#.to_vec();
    assert_eq!(
        events.handle(None, &request).await.unwrap_err().code,
        "WEBHOOK_SYNC_UNAVAILABLE"
    );
    assert_eq!(repo.lock().unwrap().events.len(), 1);
    server.await.unwrap();
    assert_eq!(calls.load(Ordering::SeqCst), 6);
}
#[tokio::test]
async fn event_filters_capacity_and_grants_fail_without_partial_mutation() {
    let repo = super::history_tests::fixture();
    let events = MemoryEvents::new(repo.clone(), None, None);
    let (expected, revision) = repo.get_connection("proj_dev", None, "c").unwrap();
    events
        .accept(&expected, revision, &parsed("one", ""))
        .unwrap();
    events
        .accept(&expected, revision, &parsed("two", ""))
        .unwrap();
    let p = Principal::project("proj_dev").unwrap();
    let request = Request {
        method: "GET".into(),
        uri: "/v1/webhook-events?limit=1&limit=bad&connector=slack&connector=other".into(),
        headers: vec![],
        body: vec![],
    };
    let response = events.handle(Some(&p), &request).await.unwrap().unwrap();
    assert_eq!(response.body["events"].as_array().unwrap().len(), 1);
    assert_eq!(response.body["pagination"]["hasMore"], true);
    let mut narrow = p.clone();
    narrow.allowed_brands = appcall_auth::Grant::Only(["brand".into()].into_iter().collect());
    assert!(events.poll(&narrow, "").await.is_err());
    narrow.brand_id = Some("other".into());
    assert!(events.poll(&narrow, "").await.is_err());
    narrow.brand_id = Some("brand".into());
    assert_eq!(events.poll(&narrow, "").await.unwrap().len(), 2);
    let before = repo.lock().unwrap().events.len();
    {
        let mut data = repo.lock().unwrap();
        data.bytes_reserved = repo.state.limits.payload_bytes;
    }
    assert_eq!(
        events
            .accept(&expected, revision, &parsed("full", ""))
            .unwrap_err()
            .code,
        "MEMORY_CAPACITY_EXCEEDED"
    );
    let data = repo.lock().unwrap();
    assert_eq!(data.events.len(), before);
    assert_eq!(data.usage_events.len(), before);
    assert_eq!(data.next_sequence, 2);
}
#[tokio::test]
async fn no_runner_local_webhook_keeps_api_auth_and_sanitized_simulation() {
    let repo = super::history_tests::fixture();
    let events = MemoryEvents::new(repo.clone(), None, None);
    let p = Principal::project("proj_dev").unwrap();
    let mut r = Request {
        method: "POST".into(),
        uri: "/v1/connections/c/webhooks/slack".into(),
        headers: vec![],
        body: br#"{"event_id":"local","text":"safe","apiKey":"private-fixture"}"#.to_vec(),
    };
    assert_eq!(
        events.handle(None, &r).await.unwrap_err().code,
        "UNAUTHORIZED"
    );
    let accepted = events.handle(Some(&p), &r).await.unwrap().unwrap();
    assert_eq!(accepted.status, 202);
    let event_id = accepted.body["eventId"].as_str().unwrap().to_owned();
    assert!(event_id.starts_with("wh_"));
    assert_ne!(event_id, "local");
    let visible = events.poll(&p, "").await.unwrap();
    assert_eq!(visible.len(), 1);
    assert!(!visible[0].payload.to_string().contains("private-fixture"));
    r.uri.push_str("?token=forged");
    assert_eq!(
        events.handle(Some(&p), &r).await.unwrap_err().code,
        "UNAUTHORIZED"
    );
    r.uri = "/v1/connections/c/webhooks/slack".into();
    r.body = br#"{"event_id":"sync","operation":"messages.list"}"#.to_vec();
    assert_eq!(
        events.handle(Some(&p), &r).await.unwrap_err().code,
        "WEBHOOK_SYNC_UNAVAILABLE"
    );
    assert_eq!(repo.lock().unwrap().events.len(), 1);
}
#[tokio::test]
async fn event_detail_replay_and_stream_disconnect_preserve_scope() {
    use std::sync::Arc;
    let repo = super::history_tests::fixture();
    let events = MemoryEvents::new(repo.clone(), None, None);
    let (expected, revision) = repo.get_connection("proj_dev", None, "c").unwrap();
    let event_id = events
        .accept(&expected, revision, &parsed("e", ""))
        .unwrap()
        .event_id;
    let p = Principal::project("proj_dev").unwrap();
    let mut request = Request {
        method: "GET".into(),
        uri: format!("/v1/webhook-events/{event_id}"),
        headers: vec![],
        body: vec![],
    };
    assert_eq!(
        events
            .handle(Some(&p), &request)
            .await
            .unwrap()
            .unwrap()
            .body["id"],
        event_id.as_str()
    );
    assert_eq!(
        events
            .handle(Some(&Principal::project("other").unwrap()), &request)
            .await
            .unwrap_err()
            .code,
        "WEBHOOK_EVENT_NOT_FOUND"
    );
    request.method = "POST".into();
    request.uri.push_str("/replay");
    assert_eq!(
        events
            .handle(Some(&p), &request)
            .await
            .unwrap()
            .unwrap()
            .status,
        202
    );
    let mut restricted = p.clone();
    restricted.scopes = appcall_auth::Grant::Only(["events:read".into()].into_iter().collect());
    assert_eq!(
        events
            .handle(Some(&restricted), &request)
            .await
            .unwrap_err()
            .code,
        "FORBIDDEN"
    );
    let principal = p.clone();
    let verify: crate::streaming::SessionVerifier = Arc::new(move || {
        let p = principal.clone();
        Box::pin(async move { Ok(p) })
    });
    let (stop, shutdown) = tokio::sync::watch::channel(false);
    let receiver = events
        .open(p.clone(), String::new(), shutdown, verify.clone(), false)
        .await
        .unwrap();
    drop(receiver);
    tokio::time::timeout(std::time::Duration::from_secs(2), async {
        while !events.retirement_ready() {
            tokio::task::yield_now().await
        }
    })
    .await
    .unwrap();
    let mut receiver = events
        .open(p, String::new(), stop.subscribe(), verify, false)
        .await
        .unwrap();
    stop.send(true).unwrap();
    tokio::time::timeout(std::time::Duration::from_secs(2), async {
        while receiver.recv().await.is_some() {}
    })
    .await
    .unwrap();
    assert!(events.retirement_ready());
}
