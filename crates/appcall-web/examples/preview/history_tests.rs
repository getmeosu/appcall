use super::*;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};

const RUN_ID: &str = "synthetic-history-run";

fn history_request(limit: &str, cursor: Option<&str>) -> DashboardRequest {
    let mut request = crate::tests::dashboard_request(DashboardOperation::RunDetail);
    request.resource = Some(RUN_ID.into());
    request
        .fields
        .insert("accountId".into(), "synthetic-account".into());
    request.account_id = Some("synthetic-account".into());
    request.fields.insert("limit".into(), limit.into());
    if let Some(cursor) = cursor {
        request.fields.insert("cursor".into(), cursor.into());
    }
    request
}

#[tokio::test]
async fn persisted_run_history_preview_matches_reader_contract_and_renders_detail() {
    assert_eq!(
        Scenario::parse("run-history").unwrap(),
        Scenario::RunHistory
    );
    let data = ScenarioData::new(Scenario::RunHistory);

    let first = data
        .execute(history_request("3", None))
        .await
        .expect("history fixture should expose the reader DTO");
    assert_eq!(first["run"]["id"], RUN_ID);
    assert_eq!(first["run"]["connectionId"], "synthetic-history-connection");
    assert_eq!(first["run"]["connector"], "synthetic-mail");
    assert_eq!(first["run"]["tool"], "messages.sync");
    assert_eq!(first["run"]["accountId"], "synthetic-account");
    assert_eq!(first["run"]["status"], "succeeded");
    assert_eq!(first["run"]["health"], "succeeded");
    assert_eq!(first["run"]["attemptsSpent"], 1);
    assert_eq!(first["run"]["maxAttempts"], 8);
    assert_eq!(first["run"]["attemptsRemaining"], 7);
    assert_eq!(first["run"]["wakeAt"], "2026-09-09T09:00:07.000000Z");
    assert_eq!(first["run"]["leaseUntil"], "");
    assert_eq!(first["run"]["leaseRemainingSeconds"], 0);
    assert_eq!(first["run"]["createdAt"], "2026-09-09T09:00:00.000000Z");
    assert_eq!(first["run"]["updatedAt"], "2026-09-09T09:00:07.000000Z");
    assert_eq!(first["run"]["currentCursor"], "");
    assert_eq!(first["run"]["runNowEligible"], false);
    assert_eq!(first["run"]["resetEligible"], false);
    assert_eq!(first["run"]["cancelEligible"], false);
    assert_eq!(first["run"]["runNowAllowed"], false);
    assert_eq!(first["run"]["resetAllowed"], false);
    assert_eq!(first["run"]["cancelAllowed"], false);

    assert_eq!(first["history"]["complete"], true);
    assert_eq!(first["historyAccountScope"], "synthetic-account");
    assert_eq!(first["recordsObserved"], 12);
    assert_eq!(first["recordsPartial"], false);
    assert_eq!(
        first["history"]["events"]
            .as_array()
            .unwrap()
            .iter()
            .map(|event| event["seq"].as_i64().unwrap())
            .collect::<Vec<_>>(),
        vec![1, 2, 3]
    );
    assert_eq!(first["history"]["events"][0]["kind"], "scheduled");
    assert_eq!(first["history"]["events"][0]["detail"]["reason"], "new_job");
    assert_eq!(first["history"]["events"][2]["kind"], "page");
    assert_eq!(first["history"]["events"][2]["detail"]["recordsWritten"], 5);
    assert_eq!(first["history"]["events"][2]["detail"]["hasMore"], true);
    assert_eq!(first["pagination"]["hasMore"], true);
    assert_eq!(
        first["pagination"]["nextCursor"],
        URL_SAFE_NO_PAD.encode("3")
    );
    assert_eq!(
        first["policy"],
        json!({
            "source": "service_config",
            "maxAttempts": 8,
            "leaseDurationMs": 30000,
            "retryBaseMs": "1000",
            "maxRetryDelayMs": 60000,
        })
    );
    assert_eq!(first["policyEventSeq"], 6);
    assert_eq!(first["policyRecordedAt"], "2026-09-09T09:00:05.000000Z");

    let cursor = first["pagination"]["nextCursor"].as_str().unwrap();
    let second = data
        .execute(history_request("3", Some(cursor)))
        .await
        .expect("history cursor should continue the persisted event page");
    assert_eq!(
        second["history"]["events"]
            .as_array()
            .unwrap()
            .iter()
            .map(|event| event["seq"].as_i64().unwrap())
            .collect::<Vec<_>>(),
        vec![4, 5, 6]
    );
    assert_eq!(second["history"]["events"][0]["kind"], "claimed");
    assert_eq!(
        second["history"]["events"][0]["detail"]["policy"]["source"],
        "service_config"
    );
    assert_eq!(second["history"]["events"][1]["kind"], "retry");
    assert_eq!(
        second["history"]["events"][1]["detail"]["retryDelayMs"],
        250
    );
    assert_eq!(
        second["history"]["events"][1]["detail"]["code"],
        "SYNC_PROCESSING_FAILED"
    );
    assert_eq!(second["history"]["events"][2]["kind"], "claimed");
    assert_eq!(second["pagination"]["hasMore"], true);
    assert_eq!(second["recordsObserved"], 12);
    assert_eq!(second["policyEventSeq"], 6);
    assert_eq!(
        second["pagination"]["nextCursor"],
        URL_SAFE_NO_PAD.encode("6")
    );

    let cursor = second["pagination"]["nextCursor"].as_str().unwrap();
    let third = data
        .execute(history_request("3", Some(cursor)))
        .await
        .expect("history cursor should expose the final persisted page");
    assert_eq!(
        third["history"]["events"]
            .as_array()
            .unwrap()
            .iter()
            .map(|event| event["seq"].as_i64().unwrap())
            .collect::<Vec<_>>(),
        vec![7, 8]
    );
    assert_eq!(third["history"]["events"][0]["kind"], "page");
    assert_eq!(third["history"]["events"][0]["detail"]["recordsWritten"], 7);
    assert_eq!(third["history"]["events"][1]["kind"], "succeeded");
    assert_eq!(third["pagination"]["hasMore"], false);
    assert_eq!(third["recordsObserved"], 12);
    assert_eq!(third["policyEventSeq"], 6);

    let runs =
        transport::dispatch_preview("GET", "/app/runs?accountId=synthetic-account", b"", &data)
            .await
            .expect("history scenario should expose the linked persisted run");
    assert_eq!(runs.status, 200, "{}", runs.body);
    assert!(runs
        .body
        .contains("href=\"/app/runs/synthetic-history-run\""));

    let response = transport::dispatch_preview(
        "GET",
        "/app/runs/synthetic-history-run?accountId=synthetic-account&limit=3",
        b"",
        &data,
    )
    .await
    .expect("history detail route should render through the real dashboard");
    assert_eq!(response.status, 200, "{}", response.body);
    assert!(response.body.contains("id=\"run-detail\""));
    assert!(response.body.contains("Persisted history"));
    assert!(response.body.contains("Recorded policy"));
    assert!(response.body.contains("service_config"));
    assert!(response.body.contains("data-event-seq=\"1\""));
    assert!(response.body.contains("New job"));
    assert!(response.body.contains("5 records committed"));
    assert!(response.body.contains("More pages remain"));
    assert!(response.body.contains("Records observed"));
    assert!(response.body.contains("synthetic-history-run"));
    assert!(response.body.contains("accountId=synthetic-account"));
    assert!(response.body.contains("cursor=Mw"));
    assert!(!response.body.contains("/run-now"));
    assert!(!response.body.contains("/reset"));
    assert!(!response.body.contains("/cancel"));

    let rejected_post = transport::dispatch_preview(
        "POST",
        "/app/runs/synthetic-history-run/run-now",
        b"",
        &data,
    )
    .await
    .expect("preview must answer unsupported mutation routes");
    assert_eq!(rejected_post.status, 404);
}
