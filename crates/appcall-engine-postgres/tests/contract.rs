// Contracts AC-WF-CHILD-TERMINAL-001 and AC-WF-CHILD-COLLISION-001.
use appcall_engine::*;
use appcall_engine_postgres::PostgresStore;
use postgres::{Client, NoTls};
#[test]
#[ignore = "requires APPCALL_ENGINE_POSTGRES_URL; creates and drops a private test schema"]
fn postgres_atomic_replay_ownership_and_parent_wakeup() {
    let url = std::env::var("APPCALL_ENGINE_POSTGRES_URL").unwrap();
    let schema = format!("engine_test_{}", std::process::id());
    let mut admin = Client::connect(&url, NoTls).unwrap();
    admin
        .batch_execute(&format!("CREATE SCHEMA {schema}"))
        .unwrap();
    let connect = || {
        let mut c = Client::connect(&url, NoTls).unwrap();
        c.batch_execute(&format!("SET search_path TO {schema}"))
            .unwrap();
        c
    };
    let store = PostgresStore::from_client(connect()).unwrap();
    assert!(PostgresStore::from_client(connect()).is_err());
    let mut e = Engine::with_store(store);
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
    assert!(e.runnable(0, 10).unwrap().contains(&"r".into()));
    drop(e);
    let mut store = PostgresStore::from_client(connect()).unwrap();
    let original = store.load("r").unwrap();
    let mut changed = original.clone();
    changed.revision += 1;
    changed.state = RunState::Cancelled;
    assert!(matches!(
        store.commit(original.revision, &changed, std::slice::from_ref(&original)),
        Err(Error::Invalid("child id collision"))
    ));
    assert_eq!(store.load("r").unwrap().state, RunState::Running);
    let mut e = Engine::with_store(store);
    e.register_workflow("parent", "v1", |c| {
        let child = c.child("child", "v1", c.input().clone())?;
        c.join_child(child)
    })
    .unwrap();
    assert!(matches!(
        e.drive("r", 0).unwrap(),
        DriveOutcome::Completed(_)
    ));
    e.start(
        "failed-parent",
        "parent",
        "v1",
        PayloadRef::durable("input").unwrap(),
    )
    .unwrap();
    e.drive("failed-parent", 0).unwrap();
    let before = serde_json::to_value(e.history("failed-parent").unwrap()).unwrap();
    e.reject_run("failed-parent:c:0", RunFailure::ResourceLimit)
        .unwrap();
    assert!(
        e.runnable(0, 10)
            .unwrap()
            .contains(&"failed-parent".to_string()),
        "failed child did not wake PG parent"
    );
    assert!(matches!(
        e.drive("failed-parent", 0).unwrap(),
        DriveOutcome::Suspended(RunState::Failed)
    ));
    assert_eq!(
        e.failure_reason("failed-parent").unwrap(),
        Some(RunFailure::ResourceLimit)
    );
    assert_eq!(
        serde_json::to_value(e.history("failed-parent").unwrap()).unwrap(),
        before
    );
    e.register_workflow("root", "v1", |c| {
        let child = c.child("parent", "v1", c.input().clone())?;
        c.join_child(child)
    })
    .unwrap();
    e.start("root", "root", "v1", PayloadRef::durable("input").unwrap())
        .unwrap();
    e.drive("root", 0).unwrap();
    e.drive("root:c:0", 0).unwrap();
    e.reject_run("root:c:0:c:0", RunFailure::InvalidCommand)
        .unwrap();
    for id in ["root:c:0", "root"] {
        assert!(e.runnable(0, 10).unwrap().contains(&id.to_string()));
        assert!(matches!(
            e.drive(id, 0).unwrap(),
            DriveOutcome::Suspended(RunState::Failed)
        ));
        assert_eq!(
            e.failure_reason(id).unwrap(),
            Some(RunFailure::InvalidCommand)
        );
    }
    // AC-WF-CHILD-CANCEL-001: cancellation beats a later ready select source.
    for signal in [false, true] {
        let workflow = if signal {
            "cancel-signal"
        } else {
            "cancel-timer"
        };
        e.register_workflow(workflow, "v1", move |c| {
            let child = c.child("child", "v1", c.input().clone())?;
            c.child("child", "v1", c.input().clone())?;
            let other = if signal {
                WaitSource::Signal("ready".into())
            } else {
                WaitSource::Timer(10)
            };
            c.select(vec![WaitSource::Child(child), other])?;
            Ok(c.input().clone())
        })
        .unwrap();
        e.start(
            workflow,
            workflow,
            "v1",
            PayloadRef::durable("input").unwrap(),
        )
        .unwrap();
        e.drive(workflow, 0).unwrap();
        let history = serde_json::to_value(e.history(workflow).unwrap()).unwrap();
        e.cancel(&format!("{workflow}:c:0")).unwrap();
        if signal {
            e.signal(workflow, "ready", PayloadRef::durable("ready").unwrap())
                .unwrap();
        }
        assert!(matches!(
            e.drive(workflow, 10).unwrap(),
            DriveOutcome::Suspended(RunState::Cancelled)
        ));
        assert_eq!(
            e.status(&format!("{workflow}:c:1")).unwrap(),
            RunState::Cancelled
        );
        assert_eq!(
            serde_json::to_value(e.history(workflow).unwrap()).unwrap(),
            history
        );
    }
    drop(e);
    let mut recovered = Engine::with_store(PostgresStore::from_client(connect()).unwrap());
    for id in ["failed-parent", "root:c:0", "root"] {
        assert!(matches!(
            recovered.drive(id, 0).unwrap(),
            DriveOutcome::Suspended(RunState::Failed)
        ));
    }
    assert_eq!(
        serde_json::to_value(recovered.history("failed-parent").unwrap()).unwrap(),
        before
    );
    for workflow in ["cancel-timer", "cancel-signal"] {
        for id in [
            workflow.to_string(),
            format!("{workflow}:c:0"),
            format!("{workflow}:c:1"),
        ] {
            assert!(matches!(
                recovered.drive(&id, 10).unwrap(),
                DriveOutcome::Suspended(RunState::Cancelled)
            ));
        }
    }
    drop(recovered);
    admin
        .batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
        .unwrap();
}

#[test]
#[ignore = "requires APPCALL_ENGINE_POSTGRES_URL; creates and drops a private test schema"]
fn postgres_persisted_blocked_runs_resume_after_registration_and_input_restore() {
    let url = std::env::var("APPCALL_ENGINE_POSTGRES_URL").unwrap();
    let schema = format!(
        "engine_resume_test_{}_{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    );
    let mut admin = Client::connect(&url, NoTls).unwrap();
    admin
        .batch_execute(&format!("CREATE SCHEMA {schema}"))
        .unwrap();
    let connect = || {
        let mut c = Client::connect(&url, NoTls).unwrap();
        c.batch_execute(&format!("SET search_path TO {schema}"))
            .unwrap();
        c
    };
    let mut e = Engine::with_store(PostgresStore::from_client(connect()).unwrap());
    e.start(
        "implementation",
        "late-workflow",
        "v1",
        PayloadRef::durable("input").unwrap(),
    )
    .unwrap();
    assert!(matches!(
        e.drive("implementation", 0).unwrap(),
        DriveOutcome::Suspended(RunState::NeedsImplementation)
    ));
    let history = serde_json::to_value(e.history("implementation").unwrap()).unwrap();
    drop(e);

    let mut e = Engine::with_store(PostgresStore::from_client(connect()).unwrap());
    e.register_workflow("late-workflow", "v1", |c| Ok(c.input().clone()))
        .unwrap();
    assert!(e.runnable(0, 10).unwrap().is_empty());
    e.resume("implementation").unwrap();
    assert_eq!(
        serde_json::to_value(e.history("implementation").unwrap()).unwrap(),
        history
    );
    e.resume("implementation").unwrap();
    assert_eq!(e.runnable(0, 10).unwrap(), vec!["implementation"]);
    assert!(matches!(
        e.drive("implementation", 0).unwrap(),
        DriveOutcome::Completed(_)
    ));

    e.register_workflow("input", "v1", |c| Ok(c.input().clone()))
        .unwrap();
    e.start(
        "input",
        "input",
        "v1",
        PayloadRef::ephemeral("cache-key").unwrap(),
    )
    .unwrap();
    assert!(matches!(
        e.drive("input", 0).unwrap(),
        DriveOutcome::Suspended(RunState::NeedsInput)
    ));
    drop(e);

    struct Restored;
    impl PayloadResolver for Restored {
        fn resolve(&self, _: &PayloadRef) -> Result<Option<Vec<u8>>> {
            Ok(Some(b"restored input".to_vec()))
        }
    }
    let mut e = Engine::with_store(PostgresStore::from_client(connect()).unwrap());
    e.register_workflow("input", "v1", |c| Ok(c.input().clone()))
        .unwrap();
    e.resume("input").unwrap();
    assert!(matches!(
        e.drive_with_resolver("input", 0, &Restored).unwrap(),
        DriveOutcome::Completed(_)
    ));

    e.register_workflow("unknown", "v1", one_unknown).unwrap();
    e.register_activity("unknown", "v1").unwrap();
    e.start(
        "unknown",
        "unknown",
        "v1",
        PayloadRef::durable("input").unwrap(),
    )
    .unwrap();
    let attempt = match e.drive("unknown", 0).unwrap() {
        DriveOutcome::Activity(attempt) => attempt,
        other => panic!("{other:?}"),
    };
    drop(e);
    let mut e = Engine::with_store(PostgresStore::from_client(connect()).unwrap());
    e.register_workflow("unknown", "v1", one_unknown).unwrap();
    e.register_activity("unknown", "v1").unwrap();
    assert!(matches!(
        e.drive("unknown", 0).unwrap(),
        DriveOutcome::Suspended(RunState::OutcomeUnknown)
    ));
    assert!(matches!(e.resume("unknown"), Err(Error::Conflict)));
    assert!(e
        .complete(&attempt, PayloadRef::durable("late").unwrap())
        .is_err());

    drop(e);
    admin
        .batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
        .unwrap();
}

fn one_unknown(c: &mut Context) -> WorkflowResult {
    c.activity("unknown", "v1", c.input().clone(), EffectPolicy::Unknown)
}
