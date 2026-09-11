use appcall_engine::*;
use appcall_engine_http::*;
const TOKEN: &str = "test-token-is-at-least-thirty-two-bytes";
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
