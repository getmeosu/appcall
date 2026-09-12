use super::*;
use serde_json::json;

fn authorized_runs_payload() -> Value {
    json!({
        "operatorAuthorized": true,
        "operatorControlsUnavailable": false,
        "runs": [{
            "id": "run_1",
            "connector": "slack",
            "tool": "messages.list",
            "accountId": "brand-a",
            "health": "running",
            "attemptsSpent": 2,
            "attemptsRemaining": 8,
            "maxAttempts": 10,
            "wakeAt": "2026-09-08T10:00:00Z",
            "leaseUntil": "2026-09-08T10:01:00Z",
            "leaseRemainingSeconds": 42,
            "currentCursor": "cursor-1",
            "lastError": "provider timeout",
            "runNowAllowed": true,
            "resetAllowed": true,
            "cancelAllowed": true
        }],
        "pendingRuns": 0,
        "runningRuns": 1,
        "backingoffRuns": 0,
        "records24h": 4,
        "deadRuns": 0,
        "workerHeartbeatUnavailable": true
    })
}

fn confirmation_dialog<'a>(html: &'a str, action: &str) -> &'a str {
    let target = format!("formaction=\"/app/runs/run_1/{action}\" formmethod=\"post\"");
    html.split("<dialog ")
        .find(|dialog| dialog.contains(&target))
        .unwrap_or_else(|| panic!("missing confirmation dialog for {action}: {html}"))
}

fn confirmation_copy<'a>(html: &'a str, action: &str) -> &'a str {
    confirmation_dialog(html, action)
        .split("<div class=\"ui-confirm-actions\">")
        .next()
        .expect("confirmation dialog has copy before its actions")
}

#[test]
fn authorized_runs_render_each_allowed_action_with_signal_confirmation_copy() {
    let html = render(Op::Runs, &authorized_runs_payload(), None).unwrap();

    assert_eq!(html.matches("data-confirm-open=").count(), 3);
    assert_eq!(html.matches("<dialog ").count(), 3);
    assert_eq!(html.matches("data-confirm-submit").count(), 3);
    assert_eq!(html.matches("<form id=\"confirm-").count(), 3);
    assert_eq!(html.matches("data-runs-control").count(), 3);
    assert!(!html.contains("id=\"runs-operator-controls-unavailable\""));

    for action in ["run-now", "reset", "cancel"] {
        let copy = confirmation_copy(&html, action);
        assert!(
            copy.contains("run_1"),
            "{action} copy omits its run ID: {copy}"
        );
        assert!(
            copy.contains("<h2") && copy.contains("<p"),
            "{action} must use the Signal confirmation heading and body: {copy}"
        );
    }

    let reset_copy = confirmation_copy(&html, "reset").to_ascii_lowercase();
    assert!(confirmation_dialog(&html, "reset").contains("Reset attempts"));
    assert!(reset_copy.contains("zero"));
    assert!(
        reset_copy.contains("cursor"),
        "reset copy must name the cursor"
    );
    assert!(
        reset_copy.contains("preserv"),
        "reset copy must explain that the cursor is preserved: {reset_copy}"
    );

    let cancel_copy = confirmation_copy(&html, "cancel").to_ascii_lowercase();
    for expected in [
        "stops future work",
        "in-flight",
        "provider",
        "cannot",
        "recall",
    ] {
        assert!(
            cancel_copy.contains(expected),
            "cancel copy must explain provider cancellation consequence ({expected}): {cancel_copy}"
        );
    }
}

#[test]
fn action_claim_recovery_link_is_operator_only() {
    let authorized = render(Op::Runs, &authorized_runs_payload(), None).unwrap();
    assert!(authorized.contains("id=\"runs-action-claims-link\""));
    assert!(authorized.contains("href=\"/app/action-claims\""));

    let mut ordinary_payload = authorized_runs_payload();
    ordinary_payload["operatorAuthorized"] = json!(false);
    ordinary_payload["operatorControlsUnavailable"] = json!(true);
    let ordinary = render(Op::Runs, &ordinary_payload, None).unwrap();
    assert!(!ordinary.contains("id=\"runs-action-claims-link\""));
    assert!(!ordinary.contains("href=\"/app/action-claims\""));
}

#[test]
fn runs_renderer_requires_explicit_operator_authorization_and_available_controls() {
    let cases: [(&str, Option<Value>, Option<Value>); 6] = [
        ("operator authorization missing", None, Some(json!(false))),
        (
            "operator authorization false",
            Some(json!(false)),
            Some(json!(false)),
        ),
        (
            "operator authorization malformed",
            Some(json!("true")),
            Some(json!(false)),
        ),
        ("controls availability missing", Some(json!(true)), None),
        ("controls unavailable", Some(json!(true)), Some(json!(true))),
        (
            "controls availability malformed",
            Some(json!(true)),
            Some(json!("false")),
        ),
    ];

    for (label, authorized, unavailable) in cases {
        let mut value = authorized_runs_payload();
        let object = value.as_object_mut().expect("runs payload object");
        match authorized {
            Some(authorized) => {
                object.insert("operatorAuthorized".into(), authorized);
            }
            None => {
                object.remove("operatorAuthorized");
            }
        }
        match unavailable {
            Some(unavailable) => {
                object.insert("operatorControlsUnavailable".into(), unavailable);
            }
            None => {
                object.remove("operatorControlsUnavailable");
            }
        }

        let html = render(Op::Runs, &value, None).unwrap();
        assert_eq!(
            html.matches("data-confirm-open=").count(),
            0,
            "{label} rendered an operator confirmation"
        );
        assert_eq!(
            html.matches("<dialog ").count(),
            0,
            "{label} rendered a confirmation dialog"
        );
        for action in ["run-now", "reset", "cancel"] {
            assert!(
                !html.contains(&format!("/app/runs/run_1/{action}")),
                "{label} rendered /{action}"
            );
        }
    }
}

#[test]
fn runs_renderer_requires_explicit_row_allowance_for_each_action() {
    for (field, action) in [
        ("runNowAllowed", "run-now"),
        ("resetAllowed", "reset"),
        ("cancelAllowed", "cancel"),
    ] {
        for (label, replacement) in [("missing", None), ("false", Some(json!(false)))] {
            let mut value = authorized_runs_payload();
            let row = value["runs"][0]
                .as_object_mut()
                .expect("runs payload row object");
            match replacement {
                Some(replacement) => {
                    row.insert(field.into(), replacement);
                }
                None => {
                    row.remove(field);
                }
            }

            let html = render(Op::Runs, &value, None).unwrap();
            assert_eq!(
                html.matches("data-confirm-open=").count(),
                2,
                "{field} {label} should hide exactly one operator control"
            );
            assert!(
                !html.contains(&format!("/app/runs/run_1/{action}")),
                "{field} {label} rendered its unauthorized action"
            );
            for other_action in ["run-now", "reset", "cancel"] {
                if other_action != action {
                    assert!(
                        html.contains(&format!("/app/runs/run_1/{other_action}")),
                        "{field} {label} unexpectedly hid /{other_action}"
                    );
                }
            }
        }
    }
}
