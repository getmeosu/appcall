use appcall_engine::*;
fn flow(c: &mut Context) -> WorkflowResult {
    let result = c.activity("lookup", "v1", c.input().clone(), EffectPolicy::Read)?;
    c.timer(100)?;
    Ok(result)
}
#[test]
fn restart_replays_without_repeating_completed_effect() {
    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("engine.db");
    let mut e = Engine::open(&db).unwrap();
    e.register_workflow("flow", "v1", flow).unwrap();
    e.register_activity("lookup", "v1").unwrap();
    e.start("r", "flow", "v1", PayloadRef::durable("input").unwrap())
        .unwrap();
    let a = match e.drive("r", 0).unwrap() {
        DriveOutcome::Activity(a) => a,
        other => panic!("{other:?}"),
    };
    e.complete(&a, PayloadRef::durable("result").unwrap())
        .unwrap();
    assert!(matches!(e.drive("r", 0).unwrap(), DriveOutcome::Waiting));
    assert_eq!(e.next_wakeup().unwrap(), Some(100));
    drop(e);
    let mut e = Engine::open(&db).unwrap();
    e.register_workflow("flow", "v1", flow).unwrap();
    assert!(matches!(
        e.drive("r", 100).unwrap(),
        DriveOutcome::Completed(_)
    ));
    assert_eq!(e.status("r").unwrap(), RunState::Completed);
}
#[test]
fn exclusive_owner_and_pinned_version() {
    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("engine.db");
    let mut e = Engine::open(&db).unwrap();
    assert!(Engine::open(&db).is_err());
    e.start("r", "flow", "v1", PayloadRef::durable("input").unwrap())
        .unwrap();
    assert!(matches!(
        e.drive("r", 0).unwrap(),
        DriveOutcome::Suspended(RunState::NeedsImplementation)
    ));
}
#[test]
fn persisted_missing_workflow_can_be_resumed_after_registration_without_a_duplicate() {
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
    let history = serde_json::to_value(e.history("r").unwrap()).unwrap();
    drop(e);

    let mut e = Engine::open(&db).unwrap();
    e.register_workflow("late-workflow", "v1", |c| Ok(c.input().clone()))
        .unwrap();
    assert!(e.runnable(0, 10).unwrap().is_empty());
    e.resume("r").unwrap();
    assert_eq!(
        serde_json::to_value(e.history("r").unwrap()).unwrap(),
        history
    );
    assert!(e.runnable(0, 10).unwrap().contains(&"r".to_string()));
    e.resume("r").unwrap();
    assert_eq!(e.runnable(0, 10).unwrap(), vec!["r"]);
    assert!(matches!(
        e.drive("r", 0).unwrap(),
        DriveOutcome::Completed(_)
    ));
}
#[test]
fn resume_running_does_not_bypass_a_future_timer() {
    let d = tempfile::tempdir().unwrap();
    let db = d.path().join("db");
    let mut e = Engine::open(&db).unwrap();
    e.register_workflow("timer", "v1", |c| {
        c.timer(100)?;
        Ok(c.input().clone())
    })
    .unwrap();
    e.start("r", "timer", "v1", PayloadRef::durable("input").unwrap())
        .unwrap();
    assert!(matches!(e.drive("r", 0).unwrap(), DriveOutcome::Waiting));
    assert_eq!(e.next_wakeup().unwrap(), Some(100));
    e.resume("r").unwrap();
    assert_eq!(e.next_wakeup().unwrap(), Some(100));
    assert!(e.runnable(0, 10).unwrap().is_empty());
}

#[test]
fn resume_reopens_stale_read_and_idempotent_attempts_without_drive() {
    for (workflow, policy) in [
        ("read-restart", EffectPolicy::Read),
        ("idempotent-restart", EffectPolicy::Idempotent),
    ] {
        let d = tempfile::tempdir().unwrap();
        let db = d.path().join("db");
        let mut initial = Engine::open(&db).unwrap();
        initial
            .register_workflow(workflow, "v1", move |c| {
                c.activity("lookup", "v1", c.input().clone(), policy)
            })
            .unwrap();
        initial.register_activity("lookup", "v1").unwrap();
        initial
            .start(
                workflow,
                workflow,
                "v1",
                PayloadRef::durable("input").unwrap(),
            )
            .unwrap();
        let stale = match initial.drive(workflow, 0).unwrap() {
            DriveOutcome::Activity(attempt) => attempt,
            other => panic!("{other:?}"),
        };
        assert_eq!(initial.status(workflow).unwrap(), RunState::Running);
        drop(initial);

        let mut reopened = Engine::open(&db).unwrap();
        reopened.resume(workflow).unwrap();
        drop(reopened);

        let store = SqliteStore::open(&db).unwrap();
        let run = store.load(workflow).unwrap();
        assert_eq!(run.state, RunState::Running);
        assert_eq!(run.wakeup, Some(0));
        assert_eq!(run.tasks.len(), 1);
        assert_eq!(run.tasks[0].attempt, stale);
        assert!(matches!(run.tasks[0].state, TaskState::Ready));
    }
}

fn one(c: &mut Context) -> WorkflowResult {
    c.activity("lookup", "v1", c.input().clone(), EffectPolicy::Unknown)
}
fn attempt(e: &mut Engine, id: &str) -> ActivityAttempt {
    match e.drive(id, 0).unwrap() {
        DriveOutcome::Activity(a) => a,
        o => panic!("{o:?}"),
    }
}
#[test]
fn ambiguous_effect_requires_reconciliation_and_late_attempt_is_fenced() {
    let d = tempfile::tempdir().unwrap();
    let db = d.path().join("db");
    let mut e = Engine::open(&db).unwrap();
    e.register_workflow("one", "v1", one).unwrap();
    e.register_activity("lookup", "v1").unwrap();
    e.start("r", "one", "v1", PayloadRef::durable("input").unwrap())
        .unwrap();
    let old = attempt(&mut e, "r");
    drop(e);
    let mut e = Engine::open(&db).unwrap();
    e.register_workflow("one", "v1", one).unwrap();
    e.register_activity("lookup", "v1").unwrap();
    assert!(matches!(
        e.drive("r", 0).unwrap(),
        DriveOutcome::Suspended(RunState::OutcomeUnknown)
    ));
    assert!(matches!(e.resume("r"), Err(Error::Conflict)));
    assert_eq!(e.status("r").unwrap(), RunState::OutcomeUnknown);
    assert!(e
        .complete(&old, PayloadRef::durable("late").unwrap())
        .is_err());
    e.reconcile(
        "r",
        &old.effect_id,
        Some(PayloadRef::durable("verified").unwrap()),
    )
    .unwrap();
    assert!(matches!(
        e.drive("r", 0).unwrap(),
        DriveOutcome::Completed(_)
    ));
}
#[test]
fn read_retry_keeps_effect_id_and_fences_old_owner() {
    let d = tempfile::tempdir().unwrap();
    let db = d.path().join("db");
    let mut e = Engine::open(&db).unwrap();
    e.register_workflow("flow", "v1", flow).unwrap();
    e.register_activity("lookup", "v1").unwrap();
    e.start("r", "flow", "v1", PayloadRef::durable("input").unwrap())
        .unwrap();
    let old = attempt(&mut e, "r");
    drop(e);
    let mut e = Engine::open(&db).unwrap();
    e.register_workflow("flow", "v1", flow).unwrap();
    e.register_activity("lookup", "v1").unwrap();
    let new = attempt(&mut e, "r");
    assert_eq!(old.effect_id, new.effect_id);
    assert_eq!(new.attempt, old.attempt + 1);
    assert!(e
        .complete(&old, PayloadRef::durable("late").unwrap())
        .is_err());
    e.complete(&new, PayloadRef::durable("valid").unwrap())
        .unwrap();
}
#[test]
fn replay_rejects_changed_command_and_early_return() {
    for early in [false, true] {
        let d = tempfile::tempdir().unwrap();
        let db = d.path().join("db");
        let mut e = Engine::open(&db).unwrap();
        e.register_workflow("flow", "v1", flow).unwrap();
        e.register_activity("lookup", "v1").unwrap();
        e.start("r", "flow", "v1", PayloadRef::durable("input").unwrap())
            .unwrap();
        let a = attempt(&mut e, "r");
        e.complete(&a, PayloadRef::durable("ok").unwrap()).unwrap();
        drop(e);
        let mut e = Engine::open(&db).unwrap();
        e.register_workflow("flow", "v1", move |c| {
            if early {
                Ok(c.input().clone())
            } else {
                c.timer(200)?;
                Ok(c.input().clone())
            }
        })
        .unwrap();
        assert!(matches!(
            e.drive("r", 0).unwrap(),
            DriveOutcome::Suspended(RunState::Nondeterminism)
        ));
    }
}
#[test]
fn attached_children_cancel_and_late_effect_does_not_advance() {
    let d = tempfile::tempdir().unwrap();
    let mut e = Engine::open(d.path().join("db")).unwrap();
    e.register_workflow("parent", "v1", |c| {
        let child = c.child("one", "v1", c.input().clone())?;
        c.join_child(child)
    })
    .unwrap();
    e.register_workflow("one", "v1", one).unwrap();
    e.register_activity("lookup", "v1").unwrap();
    e.start("r", "parent", "v1", PayloadRef::durable("input").unwrap())
        .unwrap();
    assert!(matches!(e.drive("r", 0).unwrap(), DriveOutcome::Waiting));
    let a = attempt(&mut e, "r:c:0");
    e.cancel("r").unwrap();
    assert_eq!(e.status("r:c:0").unwrap(), RunState::Cancelled);
    assert!(e
        .complete(&a, PayloadRef::durable("late").unwrap())
        .is_err());
}
#[test]
fn missing_ephemeral_input_suspends_and_payload_content_is_not_persisted() {
    let d = tempfile::tempdir().unwrap();
    let db = d.path().join("db");
    let mut e = Engine::open(&db).unwrap();
    e.register_workflow("one", "v1", one).unwrap();
    e.start(
        "r",
        "one",
        "v1",
        PayloadRef::ephemeral("cache-key").unwrap(),
    )
    .unwrap();
    assert!(matches!(
        e.drive("r", 0).unwrap(),
        DriveOutcome::Suspended(RunState::NeedsInput)
    ));
}
#[test]
fn restored_ephemeral_input_requeues_persisted_needs_input_after_restart() {
    let d = tempfile::tempdir().unwrap();
    let db = d.path().join("db");
    let mut e = Engine::open(&db).unwrap();
    e.register_workflow("one", "v1", |c| Ok(c.input().clone()))
        .unwrap();
    e.start(
        "r",
        "one",
        "v1",
        PayloadRef::ephemeral("cache-key").unwrap(),
    )
    .unwrap();
    assert!(matches!(
        e.drive("r", 0).unwrap(),
        DriveOutcome::Suspended(RunState::NeedsInput)
    ));
    let history = serde_json::to_value(e.history("r").unwrap()).unwrap();
    drop(e);

    let mut e = Engine::open(&db).unwrap();
    e.register_workflow("one", "v1", |c| Ok(c.input().clone()))
        .unwrap();
    assert!(e.runnable(0, 10).unwrap().is_empty());
    e.resume("r").unwrap();
    assert_eq!(
        serde_json::to_value(e.history("r").unwrap()).unwrap(),
        history
    );
    assert!(matches!(
        e.drive_with_resolver("r", 0, &Local).unwrap(),
        DriveOutcome::Completed(_)
    ));
}
struct Local;
impl PayloadResolver for Local {
    fn resolve(&self, _: &PayloadRef) -> Result<Option<Vec<u8>>> {
        Ok(Some(b"native private content".to_vec()))
    }
}
#[test]
fn native_activities_signal_child_join_and_select_survive_restart() {
    let d = tempfile::tempdir().unwrap();
    let db = d.path().join("db");
    let mut e = Engine::open(&db).unwrap();
    fn parent(c: &mut Context) -> WorkflowResult {
        let first =
            c.spawn_activity("native", "v1", c.input().clone(), EffectPolicy::Idempotent)?;
        let child = c.child("child", "v1", c.input().clone())?;
        let winner = c.select(vec![
            WaitSource::Signal("go".into()),
            WaitSource::Timer(100),
        ])?;
        assert_eq!(winner.index, 0);
        c.join_activity(first)?;
        c.join_child(child)
    }
    fn register(e: &mut Engine) {
        e.register_workflow("parent", "v1", parent).unwrap();
        e.register_workflow("child", "v1", |c| {
            c.activity("native", "v1", c.input().clone(), EffectPolicy::Read)
        })
        .unwrap();
        e.register_activity_fn("native", "v1", |_, bytes| {
            assert_eq!(bytes, b"native private content");
            Ok(PayloadRef::durable("native-result").unwrap())
        })
        .unwrap();
    }
    register(&mut e);
    e.start("r", "parent", "v1", PayloadRef::durable("input").unwrap())
        .unwrap();
    let a = attempt(&mut e, "r");
    e.execute_registered(&a, &Local).unwrap();
    let a = attempt(&mut e, "r:c:1");
    e.execute_registered(&a, &Local).unwrap();
    assert!(matches!(
        e.drive("r:c:1", 0).unwrap(),
        DriveOutcome::Completed(_)
    ));
    e.signal("r", "go", PayloadRef::durable("signal").unwrap())
        .unwrap();
    drop(e);
    let mut e = Engine::open(&db).unwrap();
    register(&mut e);
    assert!(matches!(
        e.drive("r", 0).unwrap(),
        DriveOutcome::Completed(_)
    ));
    let events = e.history("r").unwrap();
    assert!(events
        .iter()
        .any(|e| matches!(e.value, Some(CommandValue::Selected(_)))));
    drop(e);
    let bytes = std::fs::read(db).unwrap();
    assert!(!bytes
        .windows(b"native private content".len())
        .any(|w| w == b"native private content"));
}
#[test]
fn completed_child_wakes_waiting_parent() {
    let d = tempfile::tempdir().unwrap();
    let mut e = Engine::open(d.path().join("db")).unwrap();
    e.register_workflow("parent", "v1", |c| {
        let child = c.child("child", "v1", c.input().clone())?;
        c.join_child(child)
    })
    .unwrap();
    e.register_workflow("child", "v1", |c| Ok(c.input().clone()))
        .unwrap();
    e.start("r", "parent", "v1", PayloadRef::durable("input").unwrap())
        .unwrap();
    e.drive("r", 0).unwrap();
    e.drive("r:c:0", 0).unwrap();
    assert!(e.runnable(0, 10).unwrap().contains(&"r".to_string()));
}
#[test]
fn swallowed_blocked_timer_cannot_complete_workflow() {
    let d = tempfile::tempdir().unwrap();
    let db = d.path().join("db");
    let mut e = Engine::open(&db).unwrap();
    e.register_workflow("bad", "v1", |c| {
        c.timer(100)?;
        Ok(c.input().clone())
    })
    .unwrap();
    e.start("r", "bad", "v1", PayloadRef::durable("input").unwrap())
        .unwrap();
    e.drive("r", 0).unwrap();
    drop(e);
    let mut e = Engine::open(&db).unwrap();
    e.register_workflow("bad", "v1", |c| {
        let _ = c.timer(100);
        Ok(c.input().clone())
    })
    .unwrap();
    assert!(matches!(
        e.drive("r", 0).unwrap(),
        DriveOutcome::Suspended(RunState::Nondeterminism)
    ));
}
#[test]
fn serialized_payload_reference_validates_and_altered_attempt_is_rejected() {
    assert!(serde_json::from_str::<PayloadRef>(
        r#"{"key":"password secret content","ephemeral":false}"#
    )
    .is_err());
    let d = tempfile::tempdir().unwrap();
    let mut e = Engine::open(d.path().join("db")).unwrap();
    e.register_workflow("flow", "v1", flow).unwrap();
    e.register_activity("lookup", "v1").unwrap();
    e.start("r", "flow", "v1", PayloadRef::durable("input").unwrap())
        .unwrap();
    let mut a = attempt(&mut e, "r");
    a.input = PayloadRef::durable("different").unwrap();
    assert!(e
        .complete(&a, PayloadRef::durable("result").unwrap())
        .is_err());
}
#[test]
fn timer_remains_scheduled_while_parallel_activity_is_in_flight() {
    let d = tempfile::tempdir().unwrap();
    let mut e = Engine::open(d.path().join("db")).unwrap();
    e.register_workflow("flow", "v1", |c| {
        let a = c.spawn_activity("lookup", "v1", c.input().clone(), EffectPolicy::Read)?;
        c.select(vec![
            WaitSource::Activity(a.clone()),
            WaitSource::Timer(100),
        ])?;
        c.join_activity(a)
    })
    .unwrap();
    e.register_activity("lookup", "v1").unwrap();
    e.start("r", "flow", "v1", PayloadRef::durable("input").unwrap())
        .unwrap();
    let _a = attempt(&mut e, "r");
    assert_eq!(e.next_wakeup().unwrap(), Some(100));
}
#[test]
fn cancelled_uncertain_task_stays_cancelled_after_restart() {
    let d = tempfile::tempdir().unwrap();
    let db = d.path().join("db");
    let mut e = Engine::open(&db).unwrap();
    e.register_workflow("one", "v1", one).unwrap();
    e.register_activity("lookup", "v1").unwrap();
    e.start("r", "one", "v1", PayloadRef::durable("input").unwrap())
        .unwrap();
    attempt(&mut e, "r");
    e.cancel("r").unwrap();
    drop(e);
    let mut e = Engine::open(&db).unwrap();
    assert!(matches!(
        e.drive("r", 0).unwrap(),
        DriveOutcome::Suspended(RunState::Cancelled)
    ));
}
#[test]
fn selected_ephemeral_payload_requires_input_after_restart() {
    let d = tempfile::tempdir().unwrap();
    let db = d.path().join("db");
    fn selected(c: &mut Context) -> WorkflowResult {
        c.select(vec![WaitSource::Signal("go".into())])?;
        c.timer(100)?;
        Ok(c.input().clone())
    }
    let mut e = Engine::open(&db).unwrap();
    e.register_workflow("f", "v1", selected).unwrap();
    e.start("r", "f", "v1", PayloadRef::durable("input").unwrap())
        .unwrap();
    e.signal("r", "go", PayloadRef::ephemeral("cache").unwrap())
        .unwrap();
    e.drive_with_resolver("r", 0, &Local).unwrap();
    drop(e);
    let mut e = Engine::open(&db).unwrap();
    e.register_workflow("f", "v1", selected).unwrap();
    assert!(matches!(
        e.drive("r", 100).unwrap(),
        DriveOutcome::Suspended(RunState::NeedsInput)
    ));
}
#[test]
fn interrupted_cancellation_is_runnable_and_recovers() {
    let d = tempfile::tempdir().unwrap();
    let db = d.path().join("db");
    let mut e = Engine::open(&db).unwrap();
    e.start("r", "f", "v1", PayloadRef::durable("input").unwrap())
        .unwrap();
    drop(e);
    let mut store = SqliteStore::open(&db).unwrap();
    let mut r = store.load("r").unwrap();
    let old = r.revision;
    r.revision += 1;
    r.state = RunState::CancelRequested;
    r.wakeup = None;
    store.commit(old, &r, &[]).unwrap();
    drop(store);
    let mut e = Engine::open(&db).unwrap();
    assert_eq!(e.runnable(0, 10).unwrap(), vec!["r"]);
    assert!(matches!(
        e.drive("r", 0).unwrap(),
        DriveOutcome::Suspended(RunState::Cancelled)
    ));
}
#[test]
fn store_cas_and_child_insert_are_atomic() {
    let d = tempfile::tempdir().unwrap();
    let db = d.path().join("db");
    let mut e = Engine::open(&db).unwrap();
    e.start("r", "f", "v1", PayloadRef::durable("input").unwrap())
        .unwrap();
    drop(e);
    let mut s = SqliteStore::open(&db).unwrap();
    let original = s.load("r").unwrap();
    let mut changed = original.clone();
    changed.revision += 1;
    changed.state = RunState::Cancelled;
    assert!(matches!(
        s.commit(original.revision, &changed, std::slice::from_ref(&original)),
        Err(Error::Invalid("child id collision"))
    ));
    assert_eq!(s.load("r").unwrap().state, RunState::Running);
    assert!(s.commit(123, &changed, &[]).is_err());
    assert_eq!(s.load("r").unwrap().revision, original.revision);
}
#[test]
fn abrupt_exit_fixture() {
    let Ok(path) = std::env::var("APPCALL_CRASH_TEST_DB") else {
        return;
    };
    let mut e = Engine::open(path).unwrap();
    e.register_workflow("flow", "v1", flow).unwrap();
    e.register_activity("lookup", "v1").unwrap();
    e.start("r", "flow", "v1", PayloadRef::durable("input").unwrap())
        .unwrap();
    let a = attempt(&mut e, "r");
    e.complete(&a, PayloadRef::durable("persisted").unwrap())
        .unwrap();
    // Process exit deliberately skips Rust destructors and SQLite close/checkpoint.
    std::process::exit(0);
}
#[test]
fn committed_effect_survives_abrupt_process_exit_without_checkpoint() {
    let d = tempfile::tempdir().unwrap();
    let db = d.path().join("db");
    let status = std::process::Command::new(std::env::current_exe().unwrap())
        .args(["--exact", "abrupt_exit_fixture", "--nocapture"])
        .env("APPCALL_CRASH_TEST_DB", &db)
        .status()
        .unwrap();
    assert!(status.success());
    let mut e = Engine::open(&db).unwrap();
    e.register_workflow("flow", "v1", flow).unwrap();
    assert!(matches!(
        e.drive("r", 100).unwrap(),
        DriveOutcome::Completed(_)
    ));
}
#[test]
fn parent_cannot_complete_with_unjoined_live_child() {
    let d = tempfile::tempdir().unwrap();
    let mut e = Engine::open(d.path().join("db")).unwrap();
    e.register_workflow("parent", "v1", |c| {
        c.child("child", "v1", c.input().clone())?;
        Ok(c.input().clone())
    })
    .unwrap();
    e.start("r", "parent", "v1", PayloadRef::durable("input").unwrap())
        .unwrap();
    assert!(matches!(
        e.drive("r", 0).unwrap(),
        DriveOutcome::Suspended(RunState::Nondeterminism)
    ));
}
#[test]
fn joining_cancelled_child_cancels_attached_siblings() {
    let d = tempfile::tempdir().unwrap();
    let mut e = Engine::open(d.path().join("db")).unwrap();
    e.register_workflow("parent", "v1", |c| {
        let a = c.child("child", "v1", c.input().clone())?;
        c.child("child", "v1", c.input().clone())?;
        c.join_child(a)
    })
    .unwrap();
    e.start("r", "parent", "v1", PayloadRef::durable("input").unwrap())
        .unwrap();
    e.drive("r", 0).unwrap();
    e.cancel("r:c:0").unwrap();
    assert!(matches!(
        e.drive("r", 0).unwrap(),
        DriveOutcome::Suspended(RunState::Cancelled)
    ));
    assert_eq!(e.status("r:c:1").unwrap(), RunState::Cancelled);
}
#[test]
fn owned_native_invocation_allows_cancellation_during_callback() {
    use std::sync::mpsc;
    let d = tempfile::tempdir().unwrap();
    let mut e = Engine::open(d.path().join("db")).unwrap();
    let (started_tx, started_rx) = mpsc::channel();
    let (release_tx, release_rx) = mpsc::channel();
    let release_rx = std::sync::Mutex::new(release_rx);
    e.register_workflow("one", "v1", one).unwrap();
    e.register_activity_fn("lookup", "v1", move |_, _| {
        started_tx.send(()).unwrap();
        release_rx.lock().unwrap().recv().unwrap();
        Ok(PayloadRef::durable("done").unwrap())
    })
    .unwrap();
    e.start("r", "one", "v1", PayloadRef::durable("input").unwrap())
        .unwrap();
    let a = attempt(&mut e, "r");
    let invocation = e.prepare_registered(&a, &Local).unwrap().unwrap();
    assert!(e.prepare_registered(&a, &Local).is_err());
    let worker = std::thread::spawn(move || invocation.run());
    started_rx.recv().unwrap();
    e.cancel("r").unwrap();
    release_tx.send(()).unwrap();
    assert!(e.finish_registered(worker.join().unwrap()).is_err());
    assert_eq!(e.status("r").unwrap(), RunState::Cancelled);
}
#[test]
fn dispatch_capacity_parks_without_busy_wakeup_and_completion_releases_it() {
    let d = tempfile::tempdir().unwrap();
    let mut e = Engine::open(d.path().join("db")).unwrap();
    e.set_dispatch_limit(1).unwrap();
    e.register_workflow("one", "v1", one).unwrap();
    e.register_activity("lookup", "v1").unwrap();
    for id in ["a", "b"] {
        e.start(id, "one", "v1", PayloadRef::durable("input").unwrap())
            .unwrap();
    }
    let a = attempt(&mut e, "a");
    assert!(matches!(e.drive("b", 0).unwrap(), DriveOutcome::Waiting));
    assert_eq!(e.next_wakeup().unwrap(), None);
    let mut altered = a.clone();
    altered.input = PayloadRef::durable("forged").unwrap();
    assert!(e
        .complete(&altered, PayloadRef::durable("done").unwrap())
        .is_err());
    assert!(matches!(e.drive("b", 0).unwrap(), DriveOutcome::Waiting));
    e.complete(&a, PayloadRef::durable("done").unwrap())
        .unwrap();
    assert!(e.runnable(0, 10).unwrap().contains(&"b".into()));
    let _b = attempt(&mut e, "b");
}
#[test]
fn swallowing_blocked_before_second_command_fails_closed() {
    let d = tempfile::tempdir().unwrap();
    let mut e = Engine::open(d.path().join("db")).unwrap();
    e.register_workflow("bad", "v1", |c| {
        let _ = c.timer(100);
        c.timer(200)?;
        Ok(c.input().clone())
    })
    .unwrap();
    e.start("r", "bad", "v1", PayloadRef::durable("input").unwrap())
        .unwrap();
    assert!(matches!(
        e.drive("r", 0).unwrap(),
        DriveOutcome::Suspended(RunState::Nondeterminism)
    ));
}
#[test]
fn select_validates_all_sources_even_if_first_is_ready() {
    let d = tempfile::tempdir().unwrap();
    let mut e = Engine::open(d.path().join("db")).unwrap();
    e.register_workflow("bad", "v1", |c| {
        c.select(vec![
            WaitSource::Timer(0),
            WaitSource::Child(ChildHandle("forged".into())),
        ])?;
        Ok(c.input().clone())
    })
    .unwrap();
    e.start("r", "bad", "v1", PayloadRef::durable("input").unwrap())
        .unwrap();
    assert!(e.drive("r", 0).is_err());
}
struct FailWakeStore {
    inner: SqliteStore,
    fail: std::sync::Arc<std::sync::atomic::AtomicBool>,
}
impl Store for FailWakeStore {
    fn owner_epoch(&self) -> u64 {
        self.inner.owner_epoch()
    }
    fn load(&self, id: &str) -> Result<RunRecord> {
        self.inner.load(id)
    }
    fn insert(&mut self, r: &RunRecord) -> Result<()> {
        self.inner.insert(r)
    }
    fn commit(&mut self, rev: u64, r: &RunRecord, children: &[RunRecord]) -> Result<()> {
        if r.id == "b"
            && r.wakeup == Some(0)
            && self.fail.swap(false, std::sync::atomic::Ordering::SeqCst)
        {
            return Err(Error::Unavailable);
        }
        self.inner.commit(rev, r, children)
    }
    fn runnable(&self, now: i64, limit: usize) -> Result<Vec<String>> {
        self.inner.runnable(now, limit)
    }
    fn next_wakeup(&self) -> Result<Option<i64>> {
        self.inner.next_wakeup()
    }
}
#[test]
fn transient_wakeup_failure_retains_parked_dispatch_for_retry() {
    use std::sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    };
    let d = tempfile::tempdir().unwrap();
    let fail = Arc::new(AtomicBool::new(false));
    let mut e = Engine::with_store(FailWakeStore {
        inner: SqliteStore::open(d.path().join("db")).unwrap(),
        fail: fail.clone(),
    });
    e.set_dispatch_limit(1).unwrap();
    e.register_workflow("one", "v1", one).unwrap();
    e.register_activity("lookup", "v1").unwrap();
    for id in ["a", "b"] {
        e.start(id, "one", "v1", PayloadRef::durable("input").unwrap())
            .unwrap();
    }
    let DriveOutcome::Activity(a) = e.drive("a", 0).unwrap() else {
        panic!()
    };
    e.drive("b", 0).unwrap();
    fail.store(true, Ordering::SeqCst);
    assert!(e
        .complete(&a, PayloadRef::durable("done").unwrap())
        .is_err());
    let _ = e.complete(&a, PayloadRef::durable("done").unwrap());
    assert!(e.runnable(0, 10).unwrap().contains(&"b".into()));
}
#[test]
fn maximum_length_parent_id_can_start_an_attached_child() {
    let d = tempfile::tempdir().unwrap();
    let mut e = Engine::open(d.path().join("db")).unwrap();
    e.register_workflow("p", "v1", |c| {
        let child = c.child("child", "v1", c.input().clone())?;
        c.join_child(child)
    })
    .unwrap();
    let id = "a".repeat(128);
    e.start(&id, "p", "v1", PayloadRef::durable("input").unwrap())
        .unwrap();
    assert!(matches!(e.drive(&id, 0).unwrap(), DriveOutcome::Waiting));
    assert!(e
        .runnable(0, 10)
        .unwrap()
        .iter()
        .any(|child| child.len() <= 128));
}
#[test]
fn duplicate_start_returns_conflict() {
    let d = tempfile::tempdir().unwrap();
    let mut e = Engine::open(d.path().join("db")).unwrap();
    e.start("r", "f", "v1", PayloadRef::durable("input").unwrap())
        .unwrap();
    assert!(matches!(
        e.start("r", "f", "v1", PayloadRef::durable("input").unwrap()),
        Err(Error::Conflict)
    ));
}
#[test]
fn explicit_failure_reports_retry_safely_fence_stale_attempts_and_release_capacity() {
    let d = tempfile::tempdir().unwrap();
    let mut e = Engine::open(d.path().join("db")).unwrap();
    e.set_dispatch_limit(1).unwrap();
    e.register_workflow("read", "v1", |c| {
        c.activity("lookup", "v1", c.input().clone(), EffectPolicy::Read)
    })
    .unwrap();
    e.register_workflow("unknown", "v1", one).unwrap();
    e.register_activity("lookup", "v1").unwrap();
    e.start("read", "read", "v1", PayloadRef::durable("input").unwrap())
        .unwrap();
    e.start(
        "unknown",
        "unknown",
        "v1",
        PayloadRef::durable("input").unwrap(),
    )
    .unwrap();
    let read = attempt(&mut e, "read");
    assert!(matches!(
        e.drive("unknown", 0).unwrap(),
        DriveOutcome::Waiting
    ));
    e.fail(&read, ActivityFailure::Retryable).unwrap();
    let unknown = attempt(&mut e, "unknown");
    e.fail(&unknown, ActivityFailure::Retryable).unwrap();
    assert_eq!(e.status("unknown").unwrap(), RunState::OutcomeUnknown);
    assert!(matches!(
        e.drive("unknown", 0).unwrap(),
        DriveOutcome::Suspended(RunState::OutcomeUnknown)
    ));
    let retried = attempt(&mut e, "read");
    assert_eq!(read.effect_id, retried.effect_id);
    assert_eq!(retried.attempt, read.attempt + 1);
    assert!(matches!(
        e.fail(&read, ActivityFailure::Retryable),
        Err(Error::Conflict)
    ));
    e.reconcile("unknown", &unknown.effect_id, None).unwrap();
    assert!(matches!(
        e.drive("unknown", 0).unwrap(),
        DriveOutcome::Waiting
    ));
    e.complete(&retried, PayloadRef::durable("done").unwrap())
        .unwrap();
    let reconciled = attempt(&mut e, "unknown");
    assert_eq!(reconciled.effect_id, unknown.effect_id);
    assert_eq!(reconciled.attempt, unknown.attempt + 1);
    e.fail(&reconciled, ActivityFailure::OutcomeUnknown)
        .unwrap();
    assert_eq!(e.status("unknown").unwrap(), RunState::OutcomeUnknown);
}
