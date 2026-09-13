use appcall_engine::*;

const SECRET: &str = "synthetic-secret-token-47";

fn after_timer(c: &mut Context) -> WorkflowResult {
    if c.input().key() == "next" {
        return Ok(c.input().clone());
    }
    c.timer(100)?;
    c.continue_as_new(PayloadRef::durable("next").unwrap())
}

fn after_child(c: &mut Context) -> WorkflowResult {
    if c.input().key() == "next" {
        return Ok(c.input().clone());
    }
    let child = c.child("leaf", "v1", c.input().clone())?;
    c.join_child(child)?;
    c.continue_as_new(PayloadRef::durable("next").unwrap())
}

fn with_activity(c: &mut Context) -> WorkflowResult {
    let out = c.activity("lookup", "v1", c.input().clone(), EffectPolicy::Read)?;
    if c.input().key() == "next" {
        return Ok(out);
    }
    c.continue_as_new(PayloadRef::durable("next").unwrap())
}

fn leaf(c: &mut Context) -> WorkflowResult {
    Ok(c.input().clone())
}

fn continuing_child(c: &mut Context) -> WorkflowResult {
    if c.input().key() == "next" {
        return Ok(c.input().clone());
    }
    c.timer(100)?;
    c.continue_as_new(PayloadRef::durable("next").unwrap())
}

fn write_activity(c: &mut Context) -> WorkflowResult {
    c.activity("write", "v1", c.input().clone(), EffectPolicy::Reconcile)
}

fn attempt(e: &mut Engine, id: &str) -> ActivityAttempt {
    match e.drive(id, 0).unwrap() {
        DriveOutcome::Activity(attempt) => attempt,
        other => panic!("{other:?}"),
    }
}

fn secret_input() -> PayloadRef {
    PayloadRef::digest(SECRET.as_bytes()).unwrap()
}

struct SecretResolver;
impl PayloadResolver for SecretResolver {
    fn resolve(&self, _: &PayloadRef) -> Result<Option<Vec<u8>>> {
        Ok(Some(SECRET.as_bytes().to_vec()))
    }
}

#[test]
fn continue_as_new_after_timer_starts_successor_with_empty_history() {
    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("engine.db");
    let mut e = Engine::open(&db).unwrap();
    e.register_workflow("flow", "v1", after_timer).unwrap();
    e.start("r", "flow", "v1", PayloadRef::durable("input").unwrap())
        .unwrap();
    assert!(matches!(e.drive("r", 0).unwrap(), DriveOutcome::Waiting));
    assert!(Engine::open(&db).is_err());
    let successor = match e.drive("r", 100).unwrap() {
        DriveOutcome::ContinuedAsNew { successor } => successor,
        other => panic!("{other:?}"),
    };
    assert_eq!(successor, "r:n:1");
    assert_eq!(e.status("r").unwrap(), RunState::ContinuedAsNew);
    assert_eq!(e.continued_as("r").unwrap().as_deref(), Some("r:n:1"));
    assert!(e.history("r:n:1").unwrap().is_empty());
    assert!(matches!(
        e.drive("r:n:1", 0).unwrap(),
        DriveOutcome::Completed(output) if output == PayloadRef::durable("next").unwrap()
    ));
    assert_eq!(e.status("r:n:1").unwrap(), RunState::Completed);
    assert_eq!(e.status("r").unwrap(), RunState::ContinuedAsNew);
}

#[test]
fn continue_as_new_after_completed_child_preserves_parent_link() {
    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("engine.db");
    let mut e = Engine::open(&db).unwrap();
    e.register_workflow("flow", "v1", after_child).unwrap();
    e.register_workflow("leaf", "v1", leaf).unwrap();
    e.start("r", "flow", "v1", PayloadRef::durable("input").unwrap())
        .unwrap();
    assert!(matches!(e.drive("r", 0).unwrap(), DriveOutcome::Waiting));
    assert!(matches!(
        e.drive("r:c:0", 0).unwrap(),
        DriveOutcome::Completed(_)
    ));
    let successor = match e.drive("r", 0).unwrap() {
        DriveOutcome::ContinuedAsNew { successor } => successor,
        other => panic!("{other:?}"),
    };
    assert_eq!(successor, "r:n:2");
    assert_eq!(e.status("r:c:0").unwrap(), RunState::Completed);
    assert!(matches!(
        e.drive("r:n:2", 0).unwrap(),
        DriveOutcome::Completed(_)
    ));
}

#[test]
fn continue_as_new_child_keeps_parent_join_and_cancels_with_predecessor() {
    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("engine.db");
    let mut e = Engine::open(&db).unwrap();
    e.register_workflow("parent", "v1", |c| {
        let child = c.child("child", "v1", c.input().clone())?;
        c.join_child(child)
    })
    .unwrap();
    e.register_workflow("child", "v1", continuing_child)
        .unwrap();
    e.start(
        "parent",
        "parent",
        "v1",
        PayloadRef::durable("input").unwrap(),
    )
    .unwrap();
    assert!(matches!(
        e.drive("parent", 0).unwrap(),
        DriveOutcome::Waiting
    ));
    assert!(matches!(
        e.drive("parent:c:0", 0).unwrap(),
        DriveOutcome::Waiting
    ));
    let successor = match e.drive("parent:c:0", 100).unwrap() {
        DriveOutcome::ContinuedAsNew { successor } => successor,
        other => panic!("{other:?}"),
    };
    assert_eq!(successor, "parent:c:0:n:1");
    assert_eq!(e.status("parent:c:0").unwrap(), RunState::ContinuedAsNew);
    assert!(matches!(
        e.drive("parent:c:0:n:1", 0).unwrap(),
        DriveOutcome::Completed(_)
    ));
    assert!(matches!(
        e.drive("parent", 0).unwrap(),
        DriveOutcome::Completed(output) if output == PayloadRef::durable("next").unwrap()
    ));

    let mut cancelled = Engine::open(dir.path().join("cancel.db")).unwrap();
    cancelled
        .register_workflow("parent", "v1", |c| {
            let child = c.child("child", "v1", c.input().clone())?;
            c.join_child(child)
        })
        .unwrap();
    cancelled
        .register_workflow("child", "v1", continuing_child)
        .unwrap();
    cancelled
        .start(
            "parent",
            "parent",
            "v1",
            PayloadRef::durable("input").unwrap(),
        )
        .unwrap();
    cancelled.drive("parent", 0).unwrap();
    cancelled.drive("parent:c:0", 0).unwrap();
    cancelled.drive("parent:c:0", 100).unwrap();
    cancelled.cancel("parent").unwrap();
    assert_eq!(cancelled.status("parent").unwrap(), RunState::Cancelled);
    assert_eq!(cancelled.status("parent:c:0").unwrap(), RunState::Cancelled);
    assert_eq!(
        cancelled.status("parent:c:0:n:1").unwrap(),
        RunState::Cancelled
    );
}

#[test]
fn restart_mid_continue_as_new_does_not_replay_predecessor_activities() {
    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("engine.db");
    let mut e = Engine::open(&db).unwrap();
    e.register_workflow("flow", "v1", with_activity).unwrap();
    e.register_activity("lookup", "v1").unwrap();
    e.start("r", "flow", "v1", PayloadRef::durable("input").unwrap())
        .unwrap();
    let first = attempt(&mut e, "r");
    assert_eq!(first.effect_id, "r:a:0");
    e.complete(&first, PayloadRef::durable("done").unwrap())
        .unwrap();
    let successor = match e.drive("r", 0).unwrap() {
        DriveOutcome::ContinuedAsNew { successor } => successor,
        other => panic!("{other:?}"),
    };
    assert_eq!(successor, "r:n:1");
    let predecessor_history = serde_json::to_value(e.history("r").unwrap()).unwrap();
    assert!(e.history("r:n:1").unwrap().is_empty());
    drop(e);

    let mut e = Engine::open(&db).unwrap();
    e.register_workflow("flow", "v1", with_activity).unwrap();
    e.register_activity("lookup", "v1").unwrap();
    assert_eq!(e.status("r").unwrap(), RunState::ContinuedAsNew);
    assert_eq!(
        serde_json::to_value(e.history("r").unwrap()).unwrap(),
        predecessor_history
    );
    assert!(e.runnable(0, 10).unwrap().contains(&"r:n:1".to_string()));
    let second = attempt(&mut e, "r:n:1");
    assert_eq!(second.effect_id, "r:n:1:a:0");
    assert_ne!(second.effect_id, first.effect_id);
    e.complete(&second, PayloadRef::durable("next-done").unwrap())
        .unwrap();
    assert!(matches!(
        e.drive("r:n:1", 0).unwrap(),
        DriveOutcome::Completed(_)
    ));
    assert!(e
        .history("r:n:1")
        .unwrap()
        .iter()
        .all(|event| match &event.command {
            Command::Activity { input, .. } => input.key() == "next",
            Command::ContinueAsNew { .. } => false,
            _ => true,
        }));
    assert_eq!(e.history("r").unwrap().len(), 2);
}

#[test]
fn kill_during_timer_wait_replays_without_losing_progress() {
    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("engine.db");
    let mut e = Engine::open(&db).unwrap();
    e.register_workflow("timer", "v1", |c| {
        c.timer(100)?;
        Ok(c.input().clone())
    })
    .unwrap();
    e.start("r", "timer", "v1", PayloadRef::durable("input").unwrap())
        .unwrap();
    assert!(matches!(e.drive("r", 0).unwrap(), DriveOutcome::Waiting));
    let history = serde_json::to_value(e.history("r").unwrap()).unwrap();
    drop(e);

    let mut e = Engine::open(&db).unwrap();
    e.register_workflow("timer", "v1", |c| {
        c.timer(100)?;
        Ok(c.input().clone())
    })
    .unwrap();
    assert_eq!(
        serde_json::to_value(e.history("r").unwrap()).unwrap(),
        history
    );
    assert!(matches!(
        e.drive("r", 100).unwrap(),
        DriveOutcome::Completed(_)
    ));
}

#[test]
fn kill_during_signal_wait_keeps_the_wait_and_consumes_once() {
    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("engine.db");
    let mut e = Engine::open(&db).unwrap();
    e.register_workflow("signal", "v1", |c| {
        c.signal("go")?;
        Ok(c.input().clone())
    })
    .unwrap();
    e.start("r", "signal", "v1", PayloadRef::durable("input").unwrap())
        .unwrap();
    assert!(matches!(e.drive("r", 0).unwrap(), DriveOutcome::Waiting));
    drop(e);

    let mut e = Engine::open(&db).unwrap();
    e.register_workflow("signal", "v1", |c| {
        c.signal("go")?;
        Ok(c.input().clone())
    })
    .unwrap();
    e.signal("r", "go", PayloadRef::durable("ready").unwrap())
        .unwrap();
    assert!(matches!(
        e.drive("r", 0).unwrap(),
        DriveOutcome::Completed(_)
    ));
}

#[test]
fn kill_during_in_flight_write_reports_unknown_without_a_new_effect() {
    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("engine.db");
    let mut e = Engine::open(&db).unwrap();
    e.register_workflow("write", "v1", write_activity).unwrap();
    e.register_activity("write", "v1").unwrap();
    e.start("r", "write", "v1", PayloadRef::durable("input").unwrap())
        .unwrap();
    let first = attempt(&mut e, "r");
    assert_eq!(first.attempt, 1);
    drop(e);

    let mut e = Engine::open(&db).unwrap();
    e.register_workflow("write", "v1", write_activity).unwrap();
    e.register_activity("write", "v1").unwrap();
    assert!(matches!(
        e.drive("r", 0).unwrap(),
        DriveOutcome::Suspended(RunState::OutcomeUnknown)
    ));
    assert!(matches!(e.resume("r"), Err(Error::Conflict)));
    assert!(e
        .complete(&first, PayloadRef::durable("late").unwrap())
        .is_err());
    e.reconcile("r", &first.effect_id, None).unwrap();
    let second = attempt(&mut e, "r");
    assert_eq!(second.effect_id, first.effect_id);
    assert_eq!(second.attempt, first.attempt + 1);
    assert!(e
        .complete(&first, PayloadRef::durable("stale").unwrap())
        .is_err());
    e.complete(&second, PayloadRef::durable("observed").unwrap())
        .unwrap();
    assert!(matches!(
        e.drive("r", 0).unwrap(),
        DriveOutcome::Completed(_)
    ));
}

#[test]
fn kill_after_completed_activity_does_not_renew_attempt_budget() {
    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("engine.db");
    let mut e = Engine::open(&db).unwrap();
    e.register_workflow("flow", "v1", with_activity).unwrap();
    e.register_activity("lookup", "v1").unwrap();
    e.start("r", "flow", "v1", PayloadRef::durable("input").unwrap())
        .unwrap();
    let first = attempt(&mut e, "r");
    e.complete(&first, PayloadRef::durable("done").unwrap())
        .unwrap();
    drop(e);

    let mut e = Engine::open(&db).unwrap();
    e.register_workflow("flow", "v1", with_activity).unwrap();
    e.register_activity("lookup", "v1").unwrap();
    let successor = match e.drive("r", 0).unwrap() {
        DriveOutcome::ContinuedAsNew { successor } => successor,
        other => panic!("{other:?}"),
    };
    assert_eq!(successor, "r:n:1");
    drop(e);

    let store = SqliteStore::open(&db).unwrap();
    let predecessor = store.load("r").unwrap();
    assert_eq!(predecessor.tasks.len(), 1);
    assert_eq!(predecessor.tasks[0].attempt.attempt, first.attempt);
    assert!(matches!(predecessor.tasks[0].state, TaskState::Done(_)));
}

#[test]
fn kill_during_in_flight_child_does_not_lose_child_completion() {
    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("engine.db");
    let mut e = Engine::open(&db).unwrap();
    e.register_workflow("parent", "v1", |c| {
        let child = c.child("child", "v1", c.input().clone())?;
        c.join_child(child)
    })
    .unwrap();
    e.register_workflow("child", "v1", |c| {
        c.timer(100)?;
        Ok(c.input().clone())
    })
    .unwrap();
    e.start(
        "parent",
        "parent",
        "v1",
        PayloadRef::durable("input").unwrap(),
    )
    .unwrap();
    assert!(matches!(
        e.drive("parent", 0).unwrap(),
        DriveOutcome::Waiting
    ));
    assert!(matches!(
        e.drive("parent:c:0", 0).unwrap(),
        DriveOutcome::Waiting
    ));
    drop(e);

    let mut e = Engine::open(&db).unwrap();
    e.register_workflow("parent", "v1", |c| {
        let child = c.child("child", "v1", c.input().clone())?;
        c.join_child(child)
    })
    .unwrap();
    e.register_workflow("child", "v1", |c| {
        c.timer(100)?;
        Ok(c.input().clone())
    })
    .unwrap();
    assert!(matches!(
        e.drive("parent:c:0", 100).unwrap(),
        DriveOutcome::Completed(_)
    ));
    assert!(e.runnable(0, 10).unwrap().contains(&"parent".to_string()));
    assert!(matches!(
        e.drive("parent", 0).unwrap(),
        DriveOutcome::Completed(_)
    ));
}

#[test]
fn history_json_does_not_persist_raw_secret_input() {
    assert!(PayloadRef::durable(SECRET).is_ok());
    let input = secret_input();
    assert_ne!(input.key(), SECRET);
    assert!(!input.key().contains(SECRET));

    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("engine.db");
    let mut e = Engine::open(&db).unwrap();
    e.register_workflow("private", "v1", |c| {
        c.activity("lookup", "v1", c.input().clone(), EffectPolicy::Read)?;
        Ok(c.input().clone())
    })
    .unwrap();
    e.register_activity_fn("lookup", "v1", |_, bytes| {
        assert_eq!(bytes, SECRET.as_bytes());
        Ok(PayloadRef::durable("done").unwrap())
    })
    .unwrap();
    e.start("r", "private", "v1", input.clone()).unwrap();
    let attempt = match e.drive_with_resolver("r", 0, &SecretResolver).unwrap() {
        DriveOutcome::Activity(attempt) => attempt,
        other => panic!("{other:?}"),
    };
    e.complete(&attempt, PayloadRef::durable("done").unwrap())
        .unwrap();
    assert!(matches!(
        e.drive_with_resolver("r", 0, &SecretResolver).unwrap(),
        DriveOutcome::Completed(_)
    ));
    let history = serde_json::to_vec(&e.history("r").unwrap()).unwrap();
    assert!(
        !history
            .windows(SECRET.len())
            .any(|window| window == SECRET.as_bytes()),
        "history JSON embedded the raw secret"
    );
    drop(e);
    let persisted = std::fs::read(&db).unwrap();
    assert!(!persisted
        .windows(SECRET.len())
        .any(|window| window == SECRET.as_bytes()));
}

#[test]
fn write_accepted_before_complete_is_unknown_after_restart() {
    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("engine.db");
    let mut e = Engine::open(&db).unwrap();
    e.register_workflow("write", "v1", write_activity).unwrap();
    e.register_activity("write", "v1").unwrap();
    e.start("r", "write", "v1", PayloadRef::durable("input").unwrap())
        .unwrap();
    let first = attempt(&mut e, "r");
    drop(e);

    let mut e = Engine::open(&db).unwrap();
    e.register_workflow("write", "v1", write_activity).unwrap();
    e.register_activity("write", "v1").unwrap();
    assert_eq!(e.status("r").unwrap(), RunState::Running);
    assert!(matches!(
        e.drive("r", 0).unwrap(),
        DriveOutcome::Suspended(RunState::OutcomeUnknown)
    ));
    assert_eq!(e.result("r").unwrap(), RunResult::Unknown);
    assert!(matches!(
        e.drive("r", 0).unwrap(),
        DriveOutcome::Suspended(RunState::OutcomeUnknown)
    ));
    drop(e);

    let store = SqliteStore::open(&db).unwrap();
    let run = store.load("r").unwrap();
    assert_eq!(run.tasks.len(), 1);
    assert_eq!(run.tasks[0].attempt.effect_id, first.effect_id);
    assert!(matches!(run.tasks[0].state, TaskState::Uncertain));
}

#[test]
fn compatible_code_upgrade_completes_a_parked_v1_run() {
    fn v1(c: &mut Context) -> WorkflowResult {
        c.timer(100)?;
        Ok(c.input().clone())
    }
    fn v2_compatible(c: &mut Context) -> WorkflowResult {
        c.timer(100)?;
        Ok(c.input().clone())
    }

    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("engine.db");
    let mut e = Engine::open(&db).unwrap();
    e.register_workflow("flow", "v1", v1).unwrap();
    e.start("r", "flow", "v1", PayloadRef::durable("input").unwrap())
        .unwrap();
    assert!(matches!(e.drive("r", 0).unwrap(), DriveOutcome::Waiting));
    let history = serde_json::to_value(e.history("r").unwrap()).unwrap();
    drop(e);

    let mut e = Engine::open(&db).unwrap();
    e.register_workflow("flow", "v2", v2_compatible).unwrap();
    assert!(matches!(
        e.drive("r", 100).unwrap(),
        DriveOutcome::Suspended(RunState::NeedsImplementation)
    ));
    e.resume("r").unwrap();
    e.register_workflow("flow", "v1", v2_compatible).unwrap();
    assert_eq!(
        serde_json::to_value(e.history("r").unwrap()).unwrap(),
        history
    );
    assert!(matches!(
        e.drive("r", 100).unwrap(),
        DriveOutcome::Completed(_)
    ));
}

#[test]
fn incompatible_code_upgrade_fails_nondeterminism_without_skipping() {
    fn v1(c: &mut Context) -> WorkflowResult {
        c.timer(100)?;
        Ok(c.input().clone())
    }
    fn v2_reordered(c: &mut Context) -> WorkflowResult {
        c.activity("lookup", "v1", c.input().clone(), EffectPolicy::Read)?;
        c.timer(100)?;
        Ok(c.input().clone())
    }

    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("engine.db");
    let mut e = Engine::open(&db).unwrap();
    e.register_workflow("flow", "v1", v1).unwrap();
    e.start("r", "flow", "v1", PayloadRef::durable("input").unwrap())
        .unwrap();
    assert!(matches!(e.drive("r", 0).unwrap(), DriveOutcome::Waiting));
    let history = serde_json::to_value(e.history("r").unwrap()).unwrap();
    drop(e);

    let mut e = Engine::open(&db).unwrap();
    e.register_workflow("flow", "v1", v2_reordered).unwrap();
    e.register_activity("lookup", "v1").unwrap();
    assert!(matches!(
        e.drive("r", 100).unwrap(),
        DriveOutcome::Suspended(RunState::Nondeterminism)
    ));
    assert_eq!(
        serde_json::to_value(e.history("r").unwrap()).unwrap(),
        history
    );
    assert!(matches!(
        e.history("r").unwrap()[0].command,
        Command::Timer(100)
    ));
}
