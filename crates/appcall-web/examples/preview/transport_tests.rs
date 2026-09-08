use super::*;

#[tokio::test]
async fn advertised_trace_ids_use_the_actual_trace_dto() {
    let data = ScenarioData::new(Scenario::Populated);
    for id in ["preview_original", "preview_current"] {
        let mut request = crate::tests::dashboard_request(DashboardOperation::Trace);
        request.resource = Some(id.into());
        let trace = data.execute(request).await.unwrap();
        assert_eq!(trace["requestId"], id);
        assert!(trace.get("actionLog").is_some());
        assert_eq!(trace["replayAvailable"], true);
        assert!(trace.get("input").is_none());
        assert!(trace.get("replayRequestId").is_none());
        for field in [
            "id",
            "connectionId",
            "connector",
            "createdAt",
            "requestId",
            "action",
        ] {
            assert!(
                trace["actionLog"][field].is_string(),
                "missing action field {field}"
            );
            assert!(
                trace["replayLog"][field].is_string(),
                "missing replay field {field}"
            );
        }
        assert!(trace["actionLog"].get("sanitizedInput").is_none());
        assert!(trace["replayLog"].get("sanitizedInput").is_none());
        assert!(trace["replayLog"].get("status").is_none());
    }
    let data = ScenarioData::new(Scenario::Failure(FailureFixture::TimeoutUnknown));
    let mut request = crate::tests::dashboard_request(DashboardOperation::Trace);
    request.resource = Some("preview_current".into());
    let trace = data.execute(request).await.unwrap();
    assert_eq!(trace["actionLog"]["status"], "failed");
    assert!(trace["actionLog"].get("outcome").is_none());
}

#[tokio::test]
async fn rejected_request_fixtures_leave_time_to_inspect_pending() {
    for scenario in [Scenario::RequestInvalid, Scenario::RequestUnavailable] {
        let data = ScenarioData::new(scenario);
        let started = std::time::Instant::now();
        assert!(data
            .execute(crate::tests::dashboard_request(
                DashboardOperation::RequestConnector
            ))
            .await
            .is_err());
        assert!(started.elapsed() >= Duration::from_millis(1800));
    }
}

#[tokio::test]
async fn whitespace_in_header_names_cannot_hide_body_framing() {
    for raw in [
        "POST / HTTP/1.1\r\nContent-Length : 10\r\n\r\nshort",
        "POST / HTTP/1.1\r\n Content-Length: 10\r\n\r\nshort",
        "POST / HTTP/1.1\r\nTransfer-Encoding : chunked\r\n\r\n",
    ] {
        assert!(
            read_preview_request(&mut raw.as_bytes()).await.is_err(),
            "{raw}"
        );
    }
}

#[test]
fn unsafe_targets_cannot_be_normalized_into_allowed_routes() {
    for target in [
        "//elsewhere/app/login",
        "/app/connectors/../login",
        "/app/login#fragment",
        "/app/%2e%2e/app/login",
        "/app\\login",
    ] {
        assert!(preview_fields(target, b"").is_err(), "{target}");
    }
}

#[tokio::test]
async fn shared_reader_enforces_decimal_length_and_a_deadline() {
    for raw in [
        "POST / HTTP/1.1\r\nContent-Length: +0\r\n\r\n",
        "POST / HTTP/1.1\r\nContent-Length: nope\r\n\r\n",
        "POST / HTTP/1.1\r\nContent-Length: 0\r\nContent-Length: 0\r\n\r\n",
        "POST / HTTP/1.1\r\nTransfer-Encoding: chunked\r\n\r\n",
    ] {
        assert!(
            read_preview_request(&mut raw.as_bytes()).await.is_err(),
            "{raw}"
        );
    }
    let (_client, mut server) = tokio::io::duplex(128);
    let result = tokio::time::timeout(
        Duration::from_millis(100),
        read_with_deadline(&mut server, Duration::from_millis(10)),
    )
    .await;
    assert!(matches!(result,Ok(Err(ref error)) if error.kind()==std::io::ErrorKind::TimedOut));
}

#[tokio::test]
async fn broker_joins_fragmented_body_and_rejects_malformed_requests() {
    let (mut client, mut server) = tokio::io::duplex(65536);
    let receiver =
        tokio::spawn(async move { serve_broker(&mut server, Scenario::AuthAccepted).await });
    client
        .write_all(b"POST /api/auth/forgot-password HTTP/1.1\r\nContent-Length: 19\r\n\r\n")
        .await
        .unwrap();
    tokio::time::sleep(Duration::from_millis(20)).await;
    let completed_early = receiver.is_finished();
    let _ = client.write_all(b"{\"email\":\"private\"}").await;
    client.shutdown().await.unwrap();
    let mut bytes = Vec::new();
    client.read_to_end(&mut bytes).await.unwrap();
    receiver.await.unwrap().unwrap();
    assert!(!completed_early, "broker answered before complete body");
    let raw = String::from_utf8(bytes).unwrap();
    assert!(raw.starts_with("HTTP/1.1 200"));
    assert!(!raw.contains("private"));
    for raw in [
        "POST /api/auth/forgot-password HTTP/1.1\r\nContent-Length: 10\r\n\r\nshort",
        "POST /api/auth/forgot-password HTTP/1.1\r\nContent-Length: 0\r\nContent-Length: 0\r\n\r\n",
        "POST /api/auth/forgot-password HTTP/1.1\r\nTransfer-Encoding: chunked\r\n\r\n",
        "POST /api/auth/forgot-password HTTP/1.1\r\nContent-Length: 1\r\n\r\n{",
    ] {
        let (mut client, mut server) = tokio::io::duplex(4096);
        let receiver =
            tokio::spawn(async move { serve_broker(&mut server, Scenario::AuthAccepted).await });
        client.write_all(raw.as_bytes()).await.unwrap();
        client.shutdown().await.unwrap();
        let mut bytes = Vec::new();
        client.read_to_end(&mut bytes).await.unwrap();
        receiver.await.unwrap().unwrap();
        let output = String::from_utf8(bytes).unwrap();
        assert!(output.starts_with("HTTP/1.1 400"), "{output}");
        let value: Value = serde_json::from_str(output.split_once("\r\n\r\n").unwrap().1).unwrap();
        assert!(value["error"].is_string());
    }
}

#[tokio::test]
async fn dispatcher_uses_real_routes_counts_and_authorization() {
    let data = ScenarioData::new(Scenario::Populated);
    for (path, status, key) in [
        ("/app/connectors/connector-0/setup", 302, "setup"),
        ("/app/connections/preview_connection/test", 302, "check"),
        (
            "/app/connections/preview_connection/disconnect",
            302,
            "disconnect",
        ),
        ("/app/logs/preview_original/replay", 302, "replay-trace"),
        ("/app/events/preview_event/replay", 302, "replay-event"),
        ("/app/connectors/request", 200, "request"),
    ] {
        assert_eq!(
            dispatch_preview("POST", path, b"name=PRIVATE", &data)
                .await
                .unwrap()
                .status,
            status
        );
        assert_eq!(data.stats()["operations"][key], 1);
    }
    assert_eq!(data.stats()["operations"]["post-attempts"], 6);
    assert_eq!(data.stats()["operations"]["request-attempts"], 1);
    assert!(!data.stats().to_string().contains("PRIVATE"));
    assert_eq!(
        dispatch_preview("POST", "/app/connectors/other/test", b"", &data)
            .await
            .unwrap()
            .status,
        404
    );
    assert_eq!(data.stats()["operations"]["run"], 0);
    for (scenario, status) in [(Scenario::NoSession, 302), (Scenario::UntrustedOrigin, 403)] {
        let data = ScenarioData::new(scenario);
        assert_eq!(
            dispatch_preview("POST", "/app/connectors/request", b"name=PRIVATE", &data)
                .await
                .unwrap()
                .status,
            status
        );
        assert_eq!(data.stats()["operations"]["request-attempts"], 1);
        assert_eq!(data.stats()["operations"]["request"], 0);
    }
}

#[tokio::test]
async fn request_delivery_failure_occurs_only_after_real_acceptance() {
    for scenario in [Scenario::RequestMissingPatch, Scenario::RequestDrop] {
        let data = ScenarioData::new(scenario);
        let started = std::time::Instant::now();
        let response = dispatch_preview(
            "POST",
            "/app/connectors/request",
            b"name=PRIVATE&email=synthetic%40example.invalid&notes=unchanged",
            &data,
        )
        .await
        .unwrap();
        assert!(started.elapsed() >= Duration::from_millis(1800));
        assert!(response.body.contains("data-request-state=\"success\""));
        assert_eq!(data.stats()["operations"]["request"], 1);
        let delivery = request_result(scenario, "POST", "/app/connectors/request", response);
        if scenario == Scenario::RequestDrop {
            assert!(delivery.is_none());
        } else {
            let patch = delivery.unwrap();
            assert_eq!(patch.status, 200);
            assert!(patch.body.contains("data: selector #preview-absent-target"));
            assert!(!patch.body.contains("PRIVATE"));
        }
        assert!(request_result(
            scenario,
            "POST",
            "/app/connectors/request",
            plain_response(403, "Access denied".into())
        )
        .is_some());
    }
}

#[tokio::test]
async fn event_frames_are_written_separately_with_finite_delays() {
    let (mut client, mut server) = tokio::io::duplex(65536);
    let started = std::time::Instant::now();
    let writer = tokio::spawn(async move { write_event_stream(&mut server).await });
    let mut raw = Vec::new();
    let mut chunk = [0; 8192];
    while !String::from_utf8_lossy(&raw).contains("First synthetic event") {
        let count = tokio::time::timeout(Duration::from_secs(5), client.read(&mut chunk))
            .await
            .unwrap()
            .unwrap();
        assert!(count > 0);
        raw.extend_from_slice(&chunk[..count]);
    }
    let first_elapsed = started.elapsed();
    let saw_second_early = String::from_utf8_lossy(&raw).contains("Second synthetic event");
    tokio::time::timeout(Duration::from_secs(5), client.read_to_end(&mut raw))
        .await
        .unwrap()
        .unwrap();
    writer.await.unwrap().unwrap();
    assert!(first_elapsed >= Duration::from_millis(1800));
    assert!(!saw_second_early);
    let raw = String::from_utf8(raw).unwrap();
    assert!(
        raw.find("First synthetic event").unwrap() < raw.find("Second synthetic event").unwrap()
    );
    assert_eq!(raw.matches("selector #trigger-rows").count(), 2);
}
