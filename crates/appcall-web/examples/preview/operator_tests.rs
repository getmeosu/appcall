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
