use appcall_engine::*;
// Shared regression contract AC-WF-CHILD-TERMINAL-001.

#[test]
fn failed_child_wakes_parent_and_preserves_terminal_failure_across_restart() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("failed-child.db");
    let mut engine = Engine::open(&path).unwrap();
    engine
        .register_workflow("parent", "v1", |c| {
            let child = c.child("child", "v1", c.input().clone())?;
            c.join_child(child)
        })
        .unwrap();
    engine
        .start(
            "parent",
            "parent",
            "v1",
            PayloadRef::durable("input").unwrap(),
        )
        .unwrap();
    assert!(matches!(
        engine.drive("parent", 0).unwrap(),
        DriveOutcome::Waiting
    ));
    let history = serde_json::to_value(engine.history("parent").unwrap()).unwrap();
    engine
        .reject_run("parent:c:0", RunFailure::ResourceLimit)
        .unwrap();
    assert!(
        engine
            .runnable(0, 10)
            .unwrap()
            .contains(&"parent".to_string()),
        "failed child did not wake parent"
    );
    assert!(matches!(
        engine.drive("parent", 0).unwrap(),
        DriveOutcome::Suspended(RunState::Failed)
    ));
    assert_eq!(
        engine.failure_reason("parent").unwrap(),
        Some(RunFailure::ResourceLimit)
    );
    assert_eq!(
        serde_json::to_value(engine.history("parent").unwrap()).unwrap(),
        history
    );
    engine
        .register_workflow("root", "v1", |c| {
            let child = c.child("parent", "v1", c.input().clone())?;
            c.join_child(child)
        })
        .unwrap();
    engine
        .start("root", "root", "v1", PayloadRef::durable("input").unwrap())
        .unwrap();
    engine.drive("root", 0).unwrap();
    engine.drive("root:c:0", 0).unwrap();
    engine
        .reject_run("root:c:0:c:0", RunFailure::InvalidCommand)
        .unwrap();
    for id in ["root:c:0", "root"] {
        assert!(engine.runnable(0, 10).unwrap().contains(&id.to_string()));
        assert!(matches!(
            engine.drive(id, 0).unwrap(),
            DriveOutcome::Suspended(RunState::Failed)
        ));
        assert_eq!(
            engine.failure_reason(id).unwrap(),
            Some(RunFailure::InvalidCommand)
        );
    }
    drop(engine);
    let mut engine = Engine::open(&path).unwrap();
    for id in ["root:c:0", "root"] {
        assert!(matches!(
            engine.drive(id, 0).unwrap(),
            DriveOutcome::Suspended(RunState::Failed)
        ));
        assert_eq!(
            engine.failure_reason(id).unwrap(),
            Some(RunFailure::InvalidCommand)
        );
    }
    assert!(matches!(
        engine.drive("parent", 0).unwrap(),
        DriveOutcome::Suspended(RunState::Failed)
    ));
    assert_eq!(
        serde_json::to_value(engine.history("parent").unwrap()).unwrap(),
        history
    );
}

// Shared regression contract AC-WF-CHILD-CANCEL-001.
#[test]
fn cancelled_child_select_cascades_before_ready_timer_or_signal_and_survives_restart() {
    for signal in [false, true] {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("cancel-select.db");
        let mut e = Engine::open(&path).unwrap();
        e.register_workflow("parent", "v1", move |c| {
            let a = c.child("child", "v1", c.input().clone())?;
            c.child("child", "v1", c.input().clone())?;
            let other = if signal {
                WaitSource::Signal("ready".into())
            } else {
                WaitSource::Timer(10)
            };
            c.select(vec![WaitSource::Child(a), other])?;
            Ok(c.input().clone())
        })
        .unwrap();
        e.start("r", "parent", "v1", PayloadRef::durable("input").unwrap())
            .unwrap();
        assert!(matches!(e.drive("r", 0).unwrap(), DriveOutcome::Waiting));
        let history = serde_json::to_value(e.history("r").unwrap()).unwrap();
        e.cancel("r:c:0").unwrap();
        if signal {
            e.signal("r", "ready", PayloadRef::durable("ready").unwrap())
                .unwrap();
        }
        assert!(matches!(
            e.drive("r", 10).unwrap(),
            DriveOutcome::Suspended(RunState::Cancelled)
        ));
        assert_eq!(e.status("r:c:1").unwrap(), RunState::Cancelled);
        assert_eq!(
            serde_json::to_value(e.history("r").unwrap()).unwrap(),
            history
        );
        drop(e);
        let mut e = Engine::open(&path).unwrap();
        for id in ["r", "r:c:0", "r:c:1"] {
            assert!(matches!(
                e.drive(id, 10).unwrap(),
                DriveOutcome::Suspended(RunState::Cancelled)
            ));
        }
        assert_eq!(
            serde_json::to_value(e.history("r").unwrap()).unwrap(),
            history
        );
    }
}

#[test]
fn parent_cancellation_preserves_terminal_child_states() {
    for (child_workflow, expected_state) in [
        ("failed-child", RunState::Failed),
        ("nondeterministic-child", RunState::Nondeterminism),
    ] {
        let dir = tempfile::tempdir().unwrap();
        let mut e = Engine::open(dir.path().join("terminal-child.db")).unwrap();
        e.register_workflow("parent", "v1", move |c| {
            let child = c.child(child_workflow, "v1", c.input().clone())?;
            c.join_child(child)
        })
        .unwrap();
        if expected_state == RunState::Failed {
            e.register_workflow("failed-child", "v1", |c| Ok(c.input().clone()))
                .unwrap();
        } else {
            e.register_workflow("nondeterministic-child", "v1", |_| {
                Err(WorkflowError::Invalid)
            })
            .unwrap();
        }
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
        if expected_state == RunState::Failed {
            e.reject_run("parent:c:0", RunFailure::ResourceLimit)
                .unwrap();
        } else {
            assert!(matches!(
                e.drive("parent:c:0", 0).unwrap(),
                DriveOutcome::Suspended(RunState::Nondeterminism)
            ));
        }

        e.cancel("parent").unwrap();

        assert_eq!(e.status("parent:c:0").unwrap(), expected_state);
        if expected_state == RunState::Failed {
            assert_eq!(
                e.failure_reason("parent:c:0").unwrap(),
                Some(RunFailure::ResourceLimit)
            );
        }
    }
}

#[test]
fn parent_cancellation_keeps_unknown_child_reconcilable() {
    let dir = tempfile::tempdir().unwrap();
    let mut e = Engine::open(dir.path().join("unknown-child.db")).unwrap();
    e.register_workflow("parent", "v1", |c| {
        let child = c.child("child", "v1", c.input().clone())?;
        c.join_child(child)
    })
    .unwrap();
    e.register_workflow("child", "v1", |c| {
        c.activity("lookup", "v1", c.input().clone(), EffectPolicy::Unknown)
    })
    .unwrap();
    e.register_activity("lookup", "v1").unwrap();
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
    let child_attempt = match e.drive("parent:c:0", 0).unwrap() {
        DriveOutcome::Activity(attempt) => attempt,
        other => panic!("{other:?}"),
    };
    e.fail(&child_attempt, ActivityFailure::OutcomeUnknown)
        .unwrap();

    e.cancel("parent").unwrap();

    assert_eq!(e.status("parent:c:0").unwrap(), RunState::OutcomeUnknown);
    e.reconcile("parent:c:0", &child_attempt.effect_id, None)
        .unwrap();
    assert_eq!(e.status("parent:c:0").unwrap(), RunState::Running);
}
