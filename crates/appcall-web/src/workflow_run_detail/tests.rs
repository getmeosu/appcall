use serde_json::json;

fn render(value: &serde_json::Value, id: &str) -> Result<String, crate::Error> {
    super::standalone(value, id)
}

#[test]
fn unavailable_and_error_never_look_like_success() {
    let unavailable = render(&json!({"status":"unavailable"}), "run-1").unwrap();
    assert!(unavailable.contains("id=\"workflow-run-detail-page\""));
    assert!(unavailable.contains("Back to Runs"));
    assert!(unavailable.contains("href=\"/app/workflows/runs\""));
    assert!(unavailable.contains("Workflow engine is not connected"));
    assert!(unavailable.contains("role=\"alert\""));
    assert!(!unavailable.contains("ui-state-ok"));

    let error = render(&json!({"status":"error"}), "run-1").unwrap();
    assert!(error.contains("Workflow engine unreachable"));
    assert!(error.contains("role=\"alert\""));
    assert!(error.contains("href=\"/app/workflows/runs/run-1\""));
    assert!(!error.contains("ui-state-ok"));
}

#[test]
fn not_found_uses_empty_state_with_back_to_runs() {
    let html = render(&json!({"status":"not_found"}), "missing-run").unwrap();
    assert!(html.contains("id=\"workflow-run-detail-page\""));
    assert!(html.contains("Back to Runs"));
    assert!(html.contains("href=\"/app/workflows/runs\""));
    assert!(html.contains("Run not found"));
    assert!(html.contains("role=\"status\""));
    assert!(html.contains("ui-empty-state"));
    assert!(!html.contains("ui-state-ok"));
    assert!(!html.contains("Reconciliation history"));
}

#[test]
fn outcome_unknown_is_reconcile_not_success() {
    let html = render(
        &json!({
            "status":"ok",
            "id":"run-1",
            "state":"OutcomeUnknown",
            "failure_reason":null,
            "reconciliation_audit":[]
        }),
        "run-1",
    )
    .unwrap();
    assert!(html.contains("id=\"workflow-run-detail-page\""));
    assert!(html.contains("Reconcile"));
    assert!(html.contains("ui-state-dead"));
    assert!(!html.contains("ui-state-ok"));
    assert!(html.contains("Failure reason"));
    assert!(html.contains("Unavailable"));
    assert!(html.contains("No reconciliation events recorded"));
}

#[test]
fn summary_and_audit_use_real_fields_only() {
    let html = render(
        &json!({
            "status":"ok",
            "id":"run-42",
            "state":"Failed",
            "failure_reason":"RetryExhausted",
            "reconciliation_audit":[{
                "effect_id":"run-42:effect-1",
                "attempt":2,
                "owner_epoch":1,
                "evidence_ref":"ev-9",
                "recorded_at_ms":1_704_000_000_000i64,
                "observed":true
            }]
        }),
        "run-42",
    )
    .unwrap();
    assert!(html.contains("Retry exhausted"));
    assert!(html.contains("run-42:effect-1"));
    assert!(html.contains("Attempt 2"));
    assert!(html.contains("Owner epoch 1"));
    assert!(html.contains("Evidence ev-9"));
    assert!(html.contains("1704000000000"));
    assert!(html.contains("Observed"));
    assert!(html.contains("Reconciliation events"));
    assert!(html.contains(">1<") || html.contains("tabular\">1</dd>"));
    // Never invent workflow/version/parent — they are not on GET /runs/{id}.
    assert!(!html.contains("<dt>Workflow</dt>"));
    assert!(!html.contains("<dt>Version</dt>"));
}

#[test]
fn missing_audit_is_unavailable_not_empty() {
    let html = render(
        &json!({
            "status":"ok",
            "id":"run-1",
            "state":"Running",
            "failure_reason":null
        }),
        "run-1",
    )
    .unwrap();
    assert!(
        html.contains("Reconciliation history unavailable")
            || html.contains("aria-label=\"Reconciliation history unavailable\"")
    );
    assert!(!html.contains("No reconciliation events recorded"));
}

#[test]
fn id_mismatch_and_unknown_state_stay_unavailable() {
    assert!(matches!(
        render(
            &json!({"status":"ok","id":"other","state":"Running","reconciliation_audit":[]}),
            "run-1"
        ),
        Err(crate::Error::Unavailable)
    ));
    assert!(matches!(
        render(
            &json!({"status":"ok","id":"run-1","state":"MadeUp","reconciliation_audit":[]}),
            "run-1"
        ),
        Err(crate::Error::Unavailable)
    ));
}
