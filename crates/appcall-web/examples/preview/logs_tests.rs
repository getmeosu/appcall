//! Finite synthetic browser fixtures; these do not qualify production auth or filtering.
use super::*;

fn logs_data(name: &str) -> ScenarioData {
    ScenarioData::new(Scenario::parse(name).expect("explicit Logs startup scenario"))
}

async fn list(data: &ScenarioData, fields: &[(&str, &str)]) -> Result<Value, Error> {
    let mut request = crate::tests::dashboard_request(DashboardOperation::Logs);
    request.fields = fields
        .iter()
        .map(|(k, v)| ((*k).into(), (*v).into()))
        .collect();
    data.execute(request).await
}

#[tokio::test]
async fn logs_fixture_rows_filters_and_finite_pages() {
    let data = logs_data("logs");
    let all = list(&data, &[]).await.unwrap();
    assert_eq!(all["logs"].as_array().unwrap().len(), 3);
    for row in all["logs"].as_array().unwrap() {
        for field in [
            "id",
            "connectionId",
            "requestId",
            "connector",
            "action",
            "createdAt",
            "status",
        ] {
            assert!(row[field].is_string(), "{field}: {row}");
        }
        if row["status"] == "succeeded" {
            assert!(row.get("errorCode").is_none());
        } else {
            assert_eq!(row["errorCode"], "ACTION_TIMEOUT");
        }
    }
    for fields in [
        vec![("status", "failed")],
        vec![("errorCode", "ACTION_TIMEOUT")],
        vec![("requestId", "preview_logs_b")],
        vec![
            ("createdFrom", "2026-09-08T09:00:00Z"),
            ("createdBefore", "2026-09-08T10:00:00Z"),
        ],
    ] {
        let value = list(&data, &fields).await.unwrap();
        assert_eq!(value["logs"].as_array().unwrap().len(), 1);
        assert_eq!(value["logs"][0]["requestId"], "preview_logs_b");
    }
    for (key, value) in [
        ("connector", "connector-1"),
        ("action", "files.list"),
        ("connectionId", "preview_logs_connection"),
    ] {
        let value = list(&data, &[(key, value)]).await.unwrap();
        assert_eq!(value["logs"][0]["requestId"], "preview_logs_no_replay");
        assert_eq!(value["logs"].as_array().unwrap().len(), 1);
    }
    assert!(
        list(&data, &[("status", "failed"), ("connector", "connector-1")])
            .await
            .unwrap()["logs"]
            .as_array()
            .unwrap()
            .is_empty()
    );
    let first = list(&data, &[("limit", "1")]).await.unwrap();
    assert_eq!(first["pagination"]["hasMore"], true);
    assert_eq!(first["logs"][0]["requestId"], "preview_original");
    let cursor = first["pagination"]["nextCursor"].as_str().unwrap();
    let second = list(&data, &[("limit", "1"), ("cursor", cursor)])
        .await
        .unwrap();
    assert_eq!(second["logs"][0]["requestId"], "preview_logs_b");
    assert_eq!(second["pagination"]["hasMore"], true);
    let cursor = second["pagination"]["nextCursor"].as_str().unwrap();
    let third = list(&data, &[("limit", "1"), ("cursor", cursor)])
        .await
        .unwrap();
    assert_eq!(third["logs"][0]["requestId"], "preview_logs_no_replay");
    assert_eq!(third["pagination"]["hasMore"], false);
    assert!(third["pagination"].get("nextCursor").is_none());
    for fields in [
        vec![("createdFrom", "unrecognized")],
        vec![("cursor", "unknown")],
        vec![("limit", "0")],
        vec![("limit", "101")],
    ] {
        assert_eq!(list(&data, &fields).await.unwrap_err(), Error::Invalid);
    }
}

#[tokio::test]
async fn logs_fixture_no_replay_and_native_pagination() {
    let data = logs_data("logs");
    for id in ["preview_logs_b", "preview_logs_no_replay"] {
        let mut request = crate::tests::dashboard_request(DashboardOperation::Trace);
        request.resource = Some(id.into());
        let trace = data.execute(request).await.unwrap();
        assert_eq!(trace["replayAvailable"], false);
        assert_eq!(trace["replayUnavailableReason"], "no_replay_log");
        assert!(trace.get("reason").is_none());
        assert!(trace.get("replayLog").is_none());
    }
    let response = crate::transport::dispatch_preview(
        "GET",
        "/app/logs/preview_logs_no_replay?view=drawer",
        b"",
        &data,
    )
    .await
    .unwrap();
    assert_eq!(response.status, 200);
    assert!(response.body.contains("Replay is not available"));
    assert!(!response.body.contains("Run this again"));
    let response = crate::transport::dispatch_preview(
        "GET",
        "/app/logs?connector=connector-0&limit=1",
        b"",
        &data,
    )
    .await
    .unwrap();
    assert_eq!(response.status, 200);
    assert!(response.body.contains("cursor="));
    assert!(response.body.contains("connector=connector-0"));
    assert!(response.body.contains("limit=1"));
    assert!(data.stats()["operations"]
        .as_object()
        .unwrap()
        .values()
        .all(|value| value == 0));
}

#[tokio::test]
async fn logs_fixture_delayed_a_does_not_block_b_or_execute_tools() {
    let data = logs_data("logs");
    let a = crate::transport::dispatch_preview(
        "GET",
        "/app/logs/preview_original?view=drawer",
        b"",
        &data,
    );
    tokio::pin!(a);
    assert!(
        tokio::time::timeout(std::time::Duration::from_millis(25), &mut a)
            .await
            .is_err()
    );
    let b = tokio::time::timeout(
        std::time::Duration::from_millis(500),
        crate::transport::dispatch_preview(
            "GET",
            "/app/logs/preview_logs_b?view=drawer",
            b"",
            &data,
        ),
    )
    .await
    .unwrap()
    .unwrap();
    assert_eq!(b.status, 200);
    assert!(b.body.contains("data-request-id=\"preview_logs_b\""));
    assert!(
        tokio::time::timeout(std::time::Duration::from_millis(25), &mut a)
            .await
            .is_err()
    );
    assert_eq!(
        tokio::time::timeout(std::time::Duration::from_secs(3), a)
            .await
            .unwrap()
            .unwrap()
            .status,
        200
    );
    assert!(data.stats()["operations"]
        .as_object()
        .unwrap()
        .values()
        .all(|value| value == 0));
}

#[tokio::test]
async fn logs_fixture_failures_are_known_drawer_gets_only() {
    for (name, status) in [
        ("logs-401", 401),
        ("logs-403", 403),
        ("logs-503", 503),
        ("logs-malformed", 200),
    ] {
        let data = logs_data(name);
        let response = crate::transport::dispatch_preview(
            "GET",
            "/app/logs/preview_logs_b?view=drawer",
            b"",
            &data,
        )
        .await
        .unwrap();
        assert_eq!(response.status, status, "{name}");
        if name == "logs-malformed" {
            assert!(!response.body.contains("id=\"trace-content\""));
            assert!(!response.body.contains("<script"));
        }
        for target in ["/app/logs", "/app/logs/preview_logs_b"] {
            assert_eq!(
                crate::transport::dispatch_preview("GET", target, b"", &data)
                    .await
                    .unwrap()
                    .status,
                200
            );
        }
        assert_ne!(
            crate::transport::dispatch_preview("GET", "/app/logs/unknown?view=drawer", b"", &data)
                .await
                .unwrap()
                .status,
            200
        );
        for target in [
            "/app/logs/preview_logs_b?view=wrong",
            "/app/logs/preview_logs_b?view=drawer&view=drawer",
        ] {
            assert_eq!(
                crate::transport::dispatch_preview("GET", target, b"", &data)
                    .await
                    .unwrap()
                    .status,
                400
            );
        }
        assert!(data.stats()["operations"]
            .as_object()
            .unwrap()
            .values()
            .all(|value| value == 0));
        assert_eq!(
            crate::transport::dispatch_preview(
                "POST",
                "/app/logs/preview_logs_b?view=drawer",
                b"",
                &data
            )
            .await
            .unwrap()
            .status,
            404
        );
        assert_eq!(data.stats()["operations"]["run"], 0);
        assert_eq!(data.stats()["operations"]["replay-trace"], 0);
    }
    assert!(Scenario::parse("logs-unknown").is_err());
}

#[tokio::test]
async fn logs_fixture_time_matrix_is_explicit_and_bounded() {
    let data = logs_data("logs");
    for (from, before, count) in [
        ("2026-09-08T08:00:00Z", "2026-09-08T09:00:00Z", 1),
        ("2026-09-08T09:00:00Z", "2026-09-08T10:00:00Z", 1),
        ("2026-09-08T10:00:00Z", "2026-09-08T11:00:00Z", 1),
        ("2026-09-08T08:00:00Z", "2026-09-08T11:00:00Z", 3),
    ] {
        assert_eq!(
            list(&data, &[("createdFrom", from), ("createdBefore", before)])
                .await
                .unwrap()["logs"]
                .as_array()
                .unwrap()
                .len(),
            count
        );
    }
    for (from, before) in [
        ("2026-09-08T10:00:00Z", "2026-09-08T09:00:00Z"),
        ("2026-09-08T09:00:00Z", "2026-09-08T09:00:00Z"),
        ("2026-09-08T09:30:00Z", "2026-09-08T10:00:00Z"),
        ("2026-09-08T14:30:00+05:30", "2026-09-08T10:00:00Z"),
    ] {
        assert_eq!(
            list(&data, &[("createdFrom", from), ("createdBefore", before)])
                .await
                .unwrap_err(),
            Error::Invalid
        );
    }
}
