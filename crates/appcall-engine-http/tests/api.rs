use appcall_engine::*;
use appcall_engine_http::*;
use serde_json::Value;
const TOKEN: &str = "test-token-is-at-least-thirty-two-bytes";

fn body(response: ApiResponse) -> Value {
    serde_json::from_slice(&response.body).unwrap()
}

#[test]
fn authenticated_api_runs_same_core_and_rejects_content() {
    let d = tempfile::tempdir().unwrap();
    let e = Engine::open(d.path().join("db")).unwrap();
    let mut api = HttpAdapter::new(e, TOKEN).unwrap();
    let body =
        br#"{"id":"r","workflow":"echo","version":"v1","input":{"key":"input","ephemeral":false}}"#;
    assert_eq!(api.handle("POST", "/runs", "", body).status, 401);
    let auth = format!("Bearer {TOKEN}");
    assert_eq!(api.handle("POST", "/runs", &auth, body).status, 201);
    assert_eq!(api.handle("GET", "/runs/r", &auth, b"").status, 200);
    assert_eq!(
        api.handle(
            "POST",
            "/runs/r/signals",
            &auth,
            br#"{"name":"go","value":{"key":"raw secret content","ephemeral":false}}"#
        )
        .status,
        400
    );
    assert_eq!(api.handle("POST", "/runs/r/cancel", &auth, b"").status, 202);
    assert_eq!(api.engine_mut().status("r").unwrap(), RunState::Cancelled);
    assert_eq!(
        api.handle("POST", "/runs", &auth, &vec![b'x'; 65537])
            .status,
        413
    );
}
#[test]
fn encoded_slash_run_id_is_addressable_and_duplicate_is_conflict() {
    let d = tempfile::tempdir().unwrap();
    let mut api = HttpAdapter::new(Engine::open(d.path().join("db")).unwrap(), TOKEN).unwrap();
    let auth = format!("Bearer {TOKEN}");
    let body =
        br#"{"id":"a/b","workflow":"f","version":"v1","input":{"key":"input","ephemeral":false}}"#;
    assert_eq!(api.handle("POST", "/runs", &auth, body).status, 201);
    assert_eq!(api.handle("GET", "/runs/a%2Fb", &auth, b"").status, 200);
    assert_eq!(api.handle("POST", "/runs", &auth, body).status, 409);
}
#[test]
fn authenticated_resume_rechecks_a_persisted_run_without_duplicate() {
    let d = tempfile::tempdir().unwrap();
    let db = d.path().join("db");
    let mut e = Engine::open(&db).unwrap();
    e.start(
        "r",
        "late-workflow",
        "v1",
        PayloadRef::durable("input").unwrap(),
    )
    .unwrap();
    assert!(matches!(
        e.drive("r", 0).unwrap(),
        DriveOutcome::Suspended(RunState::NeedsImplementation)
    ));
    drop(e);
    let mut e = Engine::open(&db).unwrap();
    e.register_workflow("late-workflow", "v1", |c| Ok(c.input().clone()))
        .unwrap();
    let mut api = HttpAdapter::new(e, TOKEN).unwrap();
    let auth = format!("Bearer {TOKEN}");
    assert_eq!(api.handle("POST", "/runs/r/resume", "", b"").status, 401);
    assert_eq!(api.handle("POST", "/runs/r/resume", &auth, b"").status, 202);
    assert_eq!(api.handle("POST", "/runs/r/resume", &auth, b"").status, 202);
    assert!(matches!(
        api.engine_mut().drive("r", 0).unwrap(),
        DriveOutcome::Completed(_)
    ));
}
#[test]
fn authenticated_resume_cannot_bypass_persisted_unknown_outcome() {
    fn unknown(c: &mut Context) -> WorkflowResult {
        c.activity("unknown", "v1", c.input().clone(), EffectPolicy::Unknown)
    }

    let d = tempfile::tempdir().unwrap();
    let db = d.path().join("db");
    let mut e = Engine::open(&db).unwrap();
    e.register_workflow("unknown", "v1", unknown).unwrap();
    e.register_activity("unknown", "v1").unwrap();
    e.start("r", "unknown", "v1", PayloadRef::durable("input").unwrap())
        .unwrap();
    assert!(matches!(
        e.drive("r", 0).unwrap(),
        DriveOutcome::Activity(_)
    ));
    drop(e);

    let mut e = Engine::open(&db).unwrap();
    e.register_workflow("unknown", "v1", unknown).unwrap();
    e.register_activity("unknown", "v1").unwrap();
    let mut api = HttpAdapter::new(e, TOKEN).unwrap();
    assert!(matches!(
        api.engine_mut().drive("r", 0).unwrap(),
        DriveOutcome::Suspended(RunState::OutcomeUnknown)
    ));
    let auth = format!("Bearer {TOKEN}");
    assert_eq!(api.handle("POST", "/runs/r/resume", &auth, b"").status, 409);
    assert_eq!(
        api.engine_mut().status("r").unwrap(),
        RunState::OutcomeUnknown
    );
}

#[test]
fn authenticated_resume_recovers_restarted_in_flight_unknown_attempt_without_drive() {
    fn unknown(c: &mut Context) -> WorkflowResult {
        c.activity("unknown", "v1", c.input().clone(), EffectPolicy::Unknown)
    }

    let d = tempfile::tempdir().unwrap();
    let db = d.path().join("db");
    let mut initial = Engine::open(&db).unwrap();
    initial.register_workflow("unknown", "v1", unknown).unwrap();
    initial.register_activity("unknown", "v1").unwrap();
    initial
        .start("r", "unknown", "v1", PayloadRef::durable("input").unwrap())
        .unwrap();
    let attempt = match initial.drive("r", 0).unwrap() {
        DriveOutcome::Activity(attempt) => attempt,
        other => panic!("{other:?}"),
    };
    assert_eq!(initial.status("r").unwrap(), RunState::Running);
    drop(initial);

    let mut recovered = Engine::open(&db).unwrap();
    recovered
        .register_workflow("unknown", "v1", unknown)
        .unwrap();
    recovered.register_activity("unknown", "v1").unwrap();
    assert_eq!(recovered.runnable(0, 10).unwrap(), vec!["r"]);
    let mut api = HttpAdapter::new(recovered, TOKEN).unwrap();
    let auth = format!("Bearer {TOKEN}");
    assert_eq!(api.handle("POST", "/runs/r/resume", &auth, b"").status, 409);
    assert_eq!(
        api.engine_mut().status("r").unwrap(),
        RunState::OutcomeUnknown
    );
    assert!(api.engine_mut().runnable(0, 10).unwrap().is_empty());
    assert!(api
        .engine_mut()
        .complete(&attempt, PayloadRef::durable("late").unwrap())
        .is_err());
}

#[test]
fn deployment_scope_cannot_be_changed_by_client_ids() {
    let d = tempfile::tempdir().unwrap();
    let mut e = Engine::open(d.path().join("db")).unwrap();
    e.start(
        "other/run",
        "f",
        "v1",
        PayloadRef::durable("input").unwrap(),
    )
    .unwrap();
    let mut api = HttpAdapter::with_scope(e, TOKEN, "project").unwrap();
    let auth = format!("Bearer {TOKEN}");
    assert_eq!(
        api.handle("GET", "/runs/other%2Frun", &auth, b"").status,
        404
    );
    assert_eq!(
        api.handle("GET", "/runs/..%2Fother%2Frun", &auth, b"")
            .status,
        404
    );
}

#[test]
fn pure_workflow_result_returns_durable_reference_without_history_or_payload() {
    let d = tempfile::tempdir().unwrap();
    let mut engine = Engine::open(d.path().join("db")).unwrap();
    engine
        .register_workflow("pure", "v1", |_| {
            Ok(PayloadRef::durable("durable-result").unwrap())
        })
        .unwrap();
    engine
        .start("run", "pure", "v1", PayloadRef::durable("input").unwrap())
        .unwrap();
    assert!(matches!(
        engine.drive("run", 0).unwrap(),
        DriveOutcome::Completed(output) if output == PayloadRef::durable("durable-result").unwrap()
    ));
    assert!(engine.history("run").unwrap().is_empty());

    let mut api = HttpAdapter::new(engine, TOKEN).unwrap();
    let result = body(api.handle("GET", "/runs/run/result", &format!("Bearer {TOKEN}"), b""));
    assert_eq!(result["success"], true);
    assert_eq!(result["data"]["id"], "run");
    assert_eq!(result["data"]["outcome"], "completed");
    assert_eq!(result["data"]["output"]["key"], "durable-result");
    assert_eq!(result["data"]["output"]["ephemeral"], false);
    assert!(!result.to_string().contains("raw payload contents"));
}

#[test]
fn result_endpoint_reports_pending_without_an_output_reference() {
    let d = tempfile::tempdir().unwrap();
    let mut engine = Engine::open(d.path().join("db")).unwrap();
    engine
        .register_workflow("pending", "v1", |context| {
            context.timer(i64::MAX)?;
            Ok(context.input().clone())
        })
        .unwrap();
    engine
        .start(
            "run",
            "pending",
            "v1",
            PayloadRef::durable("input").unwrap(),
        )
        .unwrap();
    let mut api = HttpAdapter::new(engine, TOKEN).unwrap();

    let result = body(api.handle("GET", "/runs/run/result", &format!("Bearer {TOKEN}"), b""));
    assert_eq!(result["data"]["outcome"], "pending");
    assert!(result["data"].get("output").is_none());
}

#[test]
fn result_endpoint_reports_failed_and_cancelled_runs_without_output() {
    let d = tempfile::tempdir().unwrap();
    let mut engine = Engine::open(d.path().join("db")).unwrap();
    engine
        .register_workflow("cancelled", "v1", |context| {
            context.timer(i64::MAX)?;
            Ok(context.input().clone())
        })
        .unwrap();
    for (id, workflow) in [("failed-run", "failed"), ("cancelled-run", "cancelled")] {
        engine
            .start(id, workflow, "v1", PayloadRef::durable("input").unwrap())
            .unwrap();
    }
    engine
        .reject_run("failed-run", RunFailure::InvalidCommand)
        .unwrap();
    engine.cancel("cancelled-run").unwrap();
    let mut api = HttpAdapter::new(engine, TOKEN).unwrap();
    let auth = format!("Bearer {TOKEN}");

    let failed = body(api.handle("GET", "/runs/failed-run/result", &auth, b""));
    assert_eq!(failed["data"]["outcome"], "failed");
    assert_eq!(failed["data"]["failure_reason"], "InvalidCommand");
    assert!(failed["data"].get("output").is_none());

    let cancelled = body(api.handle("GET", "/runs/cancelled-run/result", &auth, b""));
    assert_eq!(cancelled["data"]["outcome"], "cancelled");
    assert!(cancelled["data"].get("output").is_none());
}

#[test]
fn result_endpoint_reports_unknown_outcome_and_missing_runs_safely() {
    let d = tempfile::tempdir().unwrap();
    let mut engine = Engine::open(d.path().join("db")).unwrap();
    engine
        .register_workflow("unknown", "v1", |context| {
            context.activity(
                "unknown",
                "v1",
                context.input().clone(),
                EffectPolicy::Unknown,
            )
        })
        .unwrap();
    engine.register_activity("unknown", "v1").unwrap();
    engine
        .start(
            "unknown-run",
            "unknown",
            "v1",
            PayloadRef::durable("input").unwrap(),
        )
        .unwrap();
    let attempt = match engine.drive("unknown-run", 0).unwrap() {
        DriveOutcome::Activity(attempt) => attempt,
        other => panic!("unexpected drive outcome: {other:?}"),
    };
    engine
        .fail(&attempt, ActivityFailure::OutcomeUnknown)
        .unwrap();
    let mut api = HttpAdapter::new(engine, TOKEN).unwrap();
    let auth = format!("Bearer {TOKEN}");

    let unknown = body(api.handle("GET", "/runs/unknown-run/result", &auth, b""));
    assert_eq!(unknown["data"]["outcome"], "unknown");
    assert!(unknown["data"].get("output").is_none());
    assert_eq!(
        api.handle("GET", "/runs/missing-run/result", &auth, b"")
            .status,
        404
    );
    assert_eq!(
        api.handle("GET", "/runs/unknown-run/result", "Bearer wrong", b"")
            .status,
        401
    );
}

#[test]
fn result_endpoint_preserves_completed_reference_after_restart() {
    let d = tempfile::tempdir().unwrap();
    let db = d.path().join("db");
    let mut initial = Engine::open(&db).unwrap();
    initial
        .register_workflow("pure", "v1", |_| {
            Ok(PayloadRef::durable("persisted-result").unwrap())
        })
        .unwrap();
    initial
        .start("run", "pure", "v1", PayloadRef::durable("input").unwrap())
        .unwrap();
    assert!(matches!(
        initial.drive("run", 0).unwrap(),
        DriveOutcome::Completed(_)
    ));
    drop(initial);

    let mut reopened = Engine::open(&db).unwrap();
    reopened
        .register_workflow("pure", "v1", |_| {
            Ok(PayloadRef::durable("persisted-result").unwrap())
        })
        .unwrap();
    let mut api = HttpAdapter::new(reopened, TOKEN).unwrap();
    let result = body(api.handle("GET", "/runs/run/result", &format!("Bearer {TOKEN}"), b""));
    assert_eq!(result["data"]["outcome"], "completed");
    assert_eq!(result["data"]["output"]["key"], "persisted-result");
}

#[test]
fn result_endpoint_respects_namespace_and_authentication() {
    let d = tempfile::tempdir().unwrap();
    let mut api =
        HttpAdapter::with_scope(Engine::open(d.path().join("db")).unwrap(), TOKEN, "tenant")
            .unwrap();
    let auth = format!("Bearer {TOKEN}");
    let start_body =
        br#"{"id":"run","workflow":"pure","version":"v1","input":{"key":"input","ephemeral":false}}"#;
    assert_eq!(api.handle("POST", "/runs", &auth, start_body).status, 201);
    api.engine_mut()
        .register_workflow("pure", "v1", |_| {
            Ok(PayloadRef::durable("tenant-result").unwrap())
        })
        .unwrap();
    assert!(matches!(
        api.engine_mut().drive("tenant/run", 0).unwrap(),
        DriveOutcome::Completed(_)
    ));

    let result = body(api.handle("GET", "/runs/run/result", &auth, b""));
    assert_eq!(result["data"]["outcome"], "completed");
    assert_eq!(result["data"]["output"]["key"], "tenant-result");
    assert_eq!(
        api.handle("GET", "/runs/other%2Frun/result", &auth, b"")
            .status,
        404
    );
    assert_eq!(
        api.handle("GET", "/runs/run/result", "Bearer wrong", b"")
            .status,
        401
    );
}

#[test]
fn result_endpoint_preserves_nondeterminism_state_without_inventing_failure_reason() {
    let d = tempfile::tempdir().unwrap();
    let db = d.path().join("db");
    let mut initial = Engine::open(&db).unwrap();
    initial
        .register_workflow("replay", "v1", |context| {
            context.timer(200)?;
            Ok(context.input().clone())
        })
        .unwrap();
    initial
        .start("run", "replay", "v1", PayloadRef::durable("input").unwrap())
        .unwrap();
    assert!(matches!(
        initial.drive("run", 0).unwrap(),
        DriveOutcome::Waiting
    ));
    drop(initial);

    let mut reopened = Engine::open(&db).unwrap();
    reopened
        .register_workflow("replay", "v1", |context| Ok(context.input().clone()))
        .unwrap();
    assert!(matches!(
        reopened.drive("run", 0).unwrap(),
        DriveOutcome::Suspended(RunState::Nondeterminism)
    ));

    let mut api = HttpAdapter::new(reopened, TOKEN).unwrap();
    let auth = format!("Bearer {TOKEN}");
    let status = body(api.handle("GET", "/runs/run", &auth, b""));
    assert_eq!(status["data"]["state"], "Nondeterminism");

    let result = body(api.handle("GET", "/runs/run/result", &auth, b""));
    assert_eq!(result["data"]["outcome"], "nondeterminism");
    assert_eq!(result["data"]["failure_reason"], Value::Null);
    assert!(result["data"].get("output").is_none());
}

fn two_unknown_effects(c: &mut Context) -> WorkflowResult {
    c.spawn_activity("first", "v1", c.input().clone(), EffectPolicy::Unknown)?;
    c.spawn_activity("second", "v1", c.input().clone(), EffectPolicy::Unknown)?;
    c.timer(100)?;
    Ok(c.input().clone())
}

#[test]
fn scoped_reconciliation_is_authenticated_audited_and_restart_safe() {
    let d = tempfile::tempdir().unwrap();
    let db = d.path().join("db");
    let mut engine = Engine::open(&db).unwrap();
    engine
        .register_workflow("two-unknown", "v1", two_unknown_effects)
        .unwrap();
    engine.register_activity("first", "v1").unwrap();
    engine.register_activity("second", "v1").unwrap();
    engine
        .start(
            "tenant/run",
            "two-unknown",
            "v1",
            PayloadRef::durable("input").unwrap(),
        )
        .unwrap();
    let first = match engine.drive("tenant/run", 0).unwrap() {
        DriveOutcome::Activity(attempt) => attempt,
        other => panic!("unexpected first dispatch: {other:?}"),
    };
    let second = match engine.drive("tenant/run", 0).unwrap() {
        DriveOutcome::Activity(attempt) => attempt,
        other => panic!("unexpected second dispatch: {other:?}"),
    };
    engine
        .fail(&first, ActivityFailure::OutcomeUnknown)
        .unwrap();
    engine
        .fail(&second, ActivityFailure::OutcomeUnknown)
        .unwrap();

    let mut api = HttpAdapter::with_scope(engine, TOKEN, "tenant").unwrap();
    let auth = format!("Bearer {TOKEN}");
    let reconcile_body = |attempt: &ActivityAttempt, observed: Option<PayloadRef>| {
        serde_json::to_vec(&serde_json::json!({
            "effect_id": &attempt.effect_id,
            "attempt": attempt.attempt,
            "owner_epoch": attempt.owner_epoch,
            "evidence_ref": "test-reconciliation",
            "observed": observed,
        }))
        .unwrap()
    };
    assert_eq!(
        api.handle("POST", "/runs/run/reconcile", "", b"{}").status,
        401
    );
    assert_eq!(
        api.handle(
            "POST",
            "/runs/run/reconcile",
            &auth,
            &reconcile_body(&first, None),
        )
        .status,
        202
    );
    let audit = body(api.handle("GET", "/runs/run/reconciliation", &auth, b""));
    assert_eq!(audit["data"]["events"].as_array().unwrap().len(), 1);
    assert_eq!(audit["data"]["events"][0]["effect_id"], "tenant/run:a:0");
    assert_eq!(audit["data"]["events"][0]["attempt"], first.attempt);
    assert_eq!(audit["data"]["events"][0]["owner_epoch"], first.owner_epoch);
    assert_eq!(audit["data"]["events"][0]["observed"], false);
    assert_eq!(
        audit["data"]["events"][0]["evidence_ref"],
        "test-reconciliation"
    );
    assert!(audit["data"]["events"][0]["recorded_at_ms"]
        .as_i64()
        .is_some_and(|timestamp| timestamp > 0));
    assert_eq!(
        api.handle(
            "POST",
            "/runs/run/reconcile",
            &auth,
            &reconcile_body(&first, None),
        )
        .status,
        409
    );
    assert_eq!(
        api.handle(
            "POST",
            "/runs/run/reconcile",
            &auth,
            br#"{"effect_id":"tenant/run:a:99","attempt":1,"owner_epoch":1,"evidence_ref":"test-reconciliation","observed":null}"#,
        )
        .status,
        409
    );
    assert_eq!(
        api.handle(
            "POST",
            "/runs/run/reconcile",
            &auth,
            br#"{"effect_id":"tenant/run:a:1","attempt":1,"owner_epoch":1,"evidence_ref":"test-reconciliation","observed":{"key":"bad key","ephemeral":false}}"#,
        )
        .status,
        400
    );
    assert_eq!(
        api.handle(
            "POST",
            "/runs/run/reconcile",
            &auth,
            br#"{"effect_id":"tenant/run:a:1","attempt":1,"owner_epoch":1,"evidence_ref":"operator note","observed":null}"#,
        )
        .status,
        400
    );
    assert_eq!(
        api.handle(
            "POST",
            "/runs/run/reconcile",
            &auth,
            br#"{"effect_id":"tenant/run:a:1","attempt":1,"owner_epoch":1,"evidence_ref":"test-reconciliation"}"#,
        )
        .status,
        400
    );
    assert_eq!(
        api.handle(
            "POST",
            "/runs/run/reconcile",
            &auth,
            br#"{"effect_id":"tenant/run:a:1","attempt":1,"owner_epoch":1,"evidence_ref":"test-reconciliation","observed":null,"unexpected":true}"#,
        )
        .status,
        400
    );
    assert_eq!(
        api.handle(
            "POST",
            "/runs/run/reconcile",
            &auth,
            &reconcile_body(&second, Some(PayloadRef::durable("second-result").unwrap())),
        )
        .status,
        202
    );
    let newer_first = match api.engine_mut().drive("tenant/run", 0).unwrap() {
        DriveOutcome::Activity(attempt) => attempt,
        other => panic!("reconciled sibling should permit a fresh dispatch: {other:?}"),
    };
    api.engine_mut()
        .fail(&newer_first, ActivityFailure::OutcomeUnknown)
        .unwrap();
    assert_eq!(
        api.handle(
            "POST",
            "/runs/run/reconcile",
            &auth,
            &reconcile_body(&first, Some(PayloadRef::durable("stale").unwrap())),
        )
        .status,
        409
    );
    assert_eq!(
        api.handle(
            "POST",
            "/runs/run/reconcile",
            &auth,
            &reconcile_body(
                &newer_first,
                Some(PayloadRef::durable("first-result").unwrap())
            ),
        )
        .status,
        202
    );
    assert!(matches!(
        api.engine_mut().drive("tenant/run", 100).unwrap(),
        DriveOutcome::Completed(_)
    ));
    assert_eq!(
        api.handle("GET", "/runs/other%2Frun/reconciliation", &auth, b"")
            .status,
        404
    );
    drop(api);

    let mut reopened = Engine::open(&db).unwrap();
    reopened
        .register_workflow("two-unknown", "v1", two_unknown_effects)
        .unwrap();
    reopened.register_activity("first", "v1").unwrap();
    reopened.register_activity("second", "v1").unwrap();
    let mut api = HttpAdapter::with_scope(reopened, TOKEN, "tenant").unwrap();
    let audit = body(api.handle("GET", "/runs/run/reconciliation", &auth, b""));
    assert_eq!(audit["data"]["events"].as_array().unwrap().len(), 3);
    assert_eq!(
        api.engine_mut().status("tenant/run").unwrap(),
        RunState::Completed
    );
    assert_eq!(
        api.handle("POST", "/runs/run/reconcile", &auth, br#"{}"#)
            .status,
        400
    );
}
