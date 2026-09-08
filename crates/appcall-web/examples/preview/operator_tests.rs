use super::*;

fn run_id(index: usize) -> String {
    format!("synthetic-run-{index}-{}", "long-identifier-".repeat(9))
}

fn control_target(id: &str, action: &str) -> String {
    format!("formaction=\"/app/runs/{id}/{action}\" formmethod=\"post\"")
}

#[tokio::test]
async fn runs_operator_preview_renders_controls_only_for_startup_scenario() {
    let operator = ScenarioData::new(Scenario::parse("runs-operator").unwrap());
    let payload = operator
        .execute(crate::tests::dashboard_request(DashboardOperation::Runs))
        .await
        .unwrap();
    assert_eq!(payload["synthetic"], true);
    assert_eq!(payload["operatorAuthorized"], true);
    assert_eq!(payload["operatorControlsUnavailable"], false);

    let expected_actions = [
        (0, ["run-now", "reset", "cancel"].as_slice()),
        (1, ["cancel"].as_slice()),
        (2, ["run-now", "reset", "cancel"].as_slice()),
        (3, ["reset"].as_slice()),
        (4, [].as_slice()),
    ];
    for (index, actions) in expected_actions {
        let row = &payload["runs"][index];
        let id = run_id(index);
        assert_eq!(row["id"].as_str(), Some(id.as_str()));
        for action in ["run-now", "reset", "cancel"] {
            let key = match action {
                "run-now" => "runNowAllowed",
                "reset" => "resetAllowed",
                "cancel" => "cancelAllowed",
                _ => unreachable!(),
            };
            assert_eq!(row[key], actions.contains(&action), "{id} {action}");
        }
    }

    let page = crate::transport::dispatch_preview("GET", "/app/runs", b"", &operator)
        .await
        .unwrap();
    assert_eq!(page.status, 200);
    assert!(!page
        .body
        .contains("id=\"runs-operator-controls-unavailable\""));
    for (index, actions) in expected_actions {
        let id = run_id(index);
        for action in ["run-now", "reset", "cancel"] {
            let target = control_target(&id, action);
            assert_eq!(
                page.body.contains(&target),
                actions.contains(&action),
                "{target}"
            );
        }
    }

    for action in ["run-now", "reset", "cancel"] {
        let response = crate::transport::dispatch_preview(
            "POST",
            &format!("/app/runs/{}/{}", run_id(0), action),
            b"",
            &operator,
        )
        .await
        .unwrap();
        assert_eq!(response.status, 404, "preview must not fake {action}");
    }
    assert_eq!(operator.stats()["operations"]["run"], 0);
    assert_eq!(operator.stats()["operations"]["post-attempts"], 3);
    assert_eq!(operator.stats()["operations"]["rejected-posts"], 3);

    let normal = ScenarioData::new(Scenario::Runs);
    let mut browser_fields = crate::tests::dashboard_request(DashboardOperation::Runs);
    browser_fields
        .fields
        .insert("scenario".into(), "runs-operator".into());
    let normal_payload = normal.execute(browser_fields).await.unwrap();
    assert!(normal_payload.get("operatorAuthorized").is_none());
    assert_eq!(normal_payload["operatorControlsUnavailable"], true);
    assert!(normal_payload["runs"]
        .as_array()
        .unwrap()
        .iter()
        .all(|row| row["runNowAllowed"] == false
            && row["resetAllowed"] == false
            && row["cancelAllowed"] == false));
    let normal_page =
        crate::transport::dispatch_preview("GET", "/app/runs?scenario=runs-operator", b"", &normal)
            .await
            .unwrap();
    assert_eq!(normal_page.status, 200);
    assert!(normal_page
        .body
        .contains("id=\"runs-operator-controls-unavailable\""));
    assert!(!normal_page.body.contains("formaction=\"/app/runs/"));
}

#[tokio::test]
async fn run_history_operator_preview_renders_granted_controls_for_pending_retry() {
    let operator = ScenarioData::new(Scenario::parse("run-history-operator").unwrap());

    let mut runs_request = crate::tests::dashboard_request(DashboardOperation::Runs);
    runs_request
        .fields
        .insert("accountId".into(), "synthetic-account".into());
    let runs_payload = operator.execute(runs_request).await.unwrap();
    assert_eq!(runs_payload["synthetic"], true);
    assert_eq!(runs_payload["operatorAuthorized"], true);
    assert_eq!(runs_payload["operatorControlsUnavailable"], false);
    let rows = runs_payload["runs"].as_array().unwrap();
    assert_eq!(rows.len(), 1);
    let row = &rows[0];
    assert_eq!(row["id"], "synthetic-history-run");
    assert_eq!(row["status"], "pending");
    assert_eq!(row["health"], "backingoff");
    assert_eq!(row["attemptsSpent"], 1);
    assert_eq!(row["attemptsRemaining"], 7);
    assert_eq!(row["currentCursor"], "cursor-history-next");
    assert_eq!(row["runNowEligible"], true);
    assert_eq!(row["resetEligible"], true);
    assert_eq!(row["cancelEligible"], true);
    assert_eq!(row["runNowAllowed"], true);
    assert_eq!(row["resetAllowed"], true);
    assert_eq!(row["cancelAllowed"], true);

    let page = crate::transport::dispatch_preview(
        "GET",
        "/app/runs?accountId=synthetic-account",
        b"",
        &operator,
    )
    .await
    .unwrap();
    assert_eq!(page.status, 200, "{}", page.body);
    assert!(!page
        .body
        .contains("id=\"runs-operator-controls-unavailable\""));
    for action in ["run-now", "reset", "cancel"] {
        assert!(
            page.body
                .contains(&control_target("synthetic-history-run", action)),
            "missing confirmation action {action}"
        );
    }
    assert_eq!(page.body.matches("data-confirm-submit").count(), 3);
    assert!(page.body.contains("Run synthetic-history-run now?"));
    assert!(page.body.contains("Reset synthetic-history-run attempts?"));
    assert!(page.body.contains("Cancel synthetic-history-run?"));

    let mut detail_request = crate::tests::dashboard_request(DashboardOperation::RunDetail);
    detail_request.resource = Some("synthetic-history-run".into());
    detail_request
        .fields
        .insert("accountId".into(), "synthetic-account".into());
    let detail = operator.execute(detail_request).await.unwrap();
    assert_eq!(detail["run"]["status"], "pending");
    assert_eq!(detail["run"]["health"], "backingoff");
    assert_eq!(detail["run"]["attemptsSpent"], 1);
    assert_eq!(detail["run"]["currentCursor"], "cursor-history-next");
    assert_eq!(detail["history"]["complete"], true);
    assert_eq!(detail["historyAccountScope"], "synthetic-account");
    assert_eq!(detail["recordsObserved"], 3);
    assert_eq!(detail["recordsPartial"], false);
    assert_eq!(
        detail["history"]["events"]
            .as_array()
            .unwrap()
            .iter()
            .map(|event| event["seq"].as_i64().unwrap())
            .collect::<Vec<_>>(),
        vec![1, 2, 3, 4, 5]
    );
    assert_eq!(detail["history"]["events"][4]["kind"], "retry");
    assert_eq!(detail["policyEventSeq"], 4);
    assert_eq!(detail["policyRecordedAt"], "2026-09-09T09:00:03.000000Z");

    let detail_page = crate::transport::dispatch_preview(
        "GET",
        "/app/runs/synthetic-history-run?accountId=synthetic-account",
        b"",
        &operator,
    )
    .await
    .unwrap();
    assert_eq!(detail_page.status, 200, "{}", detail_page.body);
    assert!(detail_page.body.contains("Backing off"));
    assert!(detail_page.body.contains("3 records committed"));
    assert!(detail_page.body.contains("Retry scheduled"));
    assert!(detail_page.body.contains("Retry after 250 ms"));

    for action in ["run-now", "reset", "cancel"] {
        let response = crate::transport::dispatch_preview(
            "POST",
            &format!("/app/runs/synthetic-history-run/{action}"),
            b"",
            &operator,
        )
        .await
        .unwrap();
        assert_eq!(response.status, 404, "preview must not fake {action}");
    }
    assert_eq!(operator.stats()["operations"]["run"], 0);
    assert_eq!(operator.stats()["operations"]["post-attempts"], 3);
    assert_eq!(operator.stats()["operations"]["rejected-posts"], 3);
}
