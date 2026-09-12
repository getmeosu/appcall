// Contracts AC-WF-CHILD-TERMINAL-001 and AC-WF-CHILD-COLLISION-001.
use appcall_engine::*;
use appcall_engine_postgres::PostgresStore;
use postgres::{Client, NoTls};
use std::sync::{Mutex, MutexGuard};

static POSTGRES_CONTRACT_LOCK: Mutex<()> = Mutex::new(());

fn postgres_contract_guard() -> MutexGuard<'static, ()> {
    POSTGRES_CONTRACT_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

#[test]
fn postgres_contract_guard_serializes_parallel_tests() {
    let _guard = postgres_contract_guard();
    let acquired = std::thread::spawn(|| POSTGRES_CONTRACT_LOCK.try_lock().is_ok())
        .join()
        .unwrap();
    assert!(!acquired);
}

#[test]
#[ignore = "requires APPCALL_ENGINE_POSTGRES_URL; creates and drops a private test schema"]
fn postgres_revision_overflow_returns_limit_and_conflict() {
    let _guard = postgres_contract_guard();
    let url = std::env::var("APPCALL_ENGINE_POSTGRES_URL").unwrap();
    let schema = format!(
        "engine_revision_test_{}_{}",
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

    let mut engine = Engine::with_store(PostgresStore::from_client(connect()).unwrap());
    engine
        .start("r", "missing", "v1", PayloadRef::durable("input").unwrap())
        .unwrap();
    drop(engine);

    let mut store = PostgresStore::from_client(connect()).unwrap();
    let original = store.load("r").unwrap();

    let mut max_insert = original.clone();
    max_insert.id = "max-insert".into();
    max_insert.revision = u64::MAX;
    assert!(matches!(store.insert(&max_insert), Err(Error::Limit)));

    let mut max_expected = original.clone();
    max_expected.revision = original.revision + 1;
    max_expected.state = RunState::Cancelled;
    assert!(matches!(
        store.commit(u64::MAX, &max_expected, &[]),
        Err(Error::Conflict)
    ));

    let mut max_successor = original.clone();
    max_successor.revision = u64::MAX;
    assert!(matches!(
        store.commit(u64::MAX - 1, &max_successor, &[]),
        Err(Error::Limit)
    ));

    drop(store);
    admin
        .batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
        .unwrap();
}

#[test]
#[ignore = "requires APPCALL_ENGINE_POSTGRES_URL; creates and drops a private test schema"]
fn postgres_atomic_replay_ownership_and_parent_wakeup() {
    let _guard = postgres_contract_guard();
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
    let _guard = postgres_contract_guard();
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

#[test]
#[ignore = "requires APPCALL_ENGINE_POSTGRES_URL; creates and drops a private test schema"]
fn postgres_retry_deadline_and_attempt_budget_survive_restart() {
    let _guard = postgres_contract_guard();
    let url = std::env::var("APPCALL_ENGINE_POSTGRES_URL").unwrap();
    let schema = format!(
        "engine_retry_test_{}_{}",
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
    e.set_retry_policy(RetryPolicy::new(2, 1_000, 10, 10).unwrap())
        .unwrap();
    e.register_workflow("one", "v1", one_read).unwrap();
    e.register_activity("lookup", "v1").unwrap();
    e.start("r", "one", "v1", PayloadRef::durable("input").unwrap())
        .unwrap();
    let first = match e.drive("r", 100).unwrap() {
        DriveOutcome::Activity(attempt) => attempt,
        other => panic!("{other:?}"),
    };
    e.fail_at(&first, ActivityFailure::Retryable, 100).unwrap();
    assert!(e.runnable(109, 10).unwrap().is_empty());
    assert_eq!(e.next_wakeup().unwrap(), Some(110));
    drop(e);

    let mut e = Engine::with_store(PostgresStore::from_client(connect()).unwrap());
    e.register_workflow("one", "v1", one_read).unwrap();
    e.register_activity("lookup", "v1").unwrap();
    assert!(e.runnable(109, 10).unwrap().is_empty());
    let second = match e.drive("r", 110).unwrap() {
        DriveOutcome::Activity(attempt) => attempt,
        other => panic!("{other:?}"),
    };
    assert_eq!(second.attempt, 2);
    e.fail_at(&second, ActivityFailure::Retryable, 110).unwrap();
    assert_eq!(e.status("r").unwrap(), RunState::Failed);
    assert_eq!(
        e.failure_reason("r").unwrap(),
        Some(RunFailure::RetryExhausted)
    );

    drop(e);
    admin
        .batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
        .unwrap();
}

#[test]
#[ignore = "requires APPCALL_ENGINE_POSTGRES_URL; creates and drops a private test schema"]
fn postgres_recovery_preserves_passive_waits_and_recovers_ready_tasks() {
    let _guard = postgres_contract_guard();
    let url = std::env::var("APPCALL_ENGINE_POSTGRES_URL").unwrap();
    let schema = format!(
        "engine_recovery_test_{}_{}",
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
    e.register_workflow("signal-wait", "v1", |c| {
        c.select(vec![WaitSource::Signal("go".into())])?;
        Ok(c.input().clone())
    })
    .unwrap();
    e.start(
        "signal-wait",
        "signal-wait",
        "v1",
        PayloadRef::durable("input").unwrap(),
    )
    .unwrap();
    assert!(matches!(
        e.drive("signal-wait", 0).unwrap(),
        DriveOutcome::Waiting
    ));
    assert_eq!(e.next_wakeup().unwrap(), None);
    drop(e);

    let e = Engine::with_store(PostgresStore::from_client(connect()).unwrap());
    assert!(e.runnable(0, 10).unwrap().is_empty());
    assert_eq!(e.next_wakeup().unwrap(), None);
    drop(e);

    let mut e = Engine::with_store(PostgresStore::from_client(connect()).unwrap());
    e.register_workflow("parent-wait", "v1", |c| {
        let child = c.child("timer-child", "v1", c.input().clone())?;
        c.join_child(child)
    })
    .unwrap();
    e.register_workflow("timer-child", "v1", |c| {
        c.timer(100)?;
        Ok(c.input().clone())
    })
    .unwrap();
    e.start(
        "parent-wait",
        "parent-wait",
        "v1",
        PayloadRef::durable("input").unwrap(),
    )
    .unwrap();
    assert!(matches!(
        e.drive("parent-wait", 0).unwrap(),
        DriveOutcome::Waiting
    ));
    assert!(matches!(
        e.drive("parent-wait:c:0", 0).unwrap(),
        DriveOutcome::Waiting
    ));
    assert_eq!(e.next_wakeup().unwrap(), Some(100));
    drop(e);

    let e = Engine::with_store(PostgresStore::from_client(connect()).unwrap());
    assert!(e.runnable(0, 10).unwrap().is_empty());
    assert_eq!(e.next_wakeup().unwrap(), Some(100));
    drop(e);

    let mut e = Engine::with_store(PostgresStore::from_client(connect()).unwrap());
    e.set_dispatch_limit(1).unwrap();
    e.register_workflow("ready-one", "v1", one_read).unwrap();
    e.register_activity("lookup", "v1").unwrap();
    for id in ["ready-a", "ready-b"] {
        e.start(id, "ready-one", "v1", PayloadRef::durable("input").unwrap())
            .unwrap();
    }
    let _a = match e.drive("ready-a", 0).unwrap() {
        DriveOutcome::Activity(attempt) => attempt,
        other => panic!("{other:?}"),
    };
    assert!(matches!(
        e.drive("ready-b", 0).unwrap(),
        DriveOutcome::Waiting
    ));
    let ready_b_wakeup: Option<i64> = connect()
        .query_one(
            "SELECT wakeup FROM appcall_workflow_runs WHERE id=$1",
            &[&"ready-b"],
        )
        .unwrap()
        .get(0);
    assert_eq!(ready_b_wakeup, None);
    drop(e);

    let e = Engine::with_store(PostgresStore::from_client(connect()).unwrap());
    assert!(e.runnable(0, 10).unwrap().contains(&"ready-b".to_string()));
    drop(e);

    admin
        .batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
        .unwrap();
}

#[test]
#[ignore = "requires APPCALL_ENGINE_POSTGRES_URL; creates and drops a private test schema"]
fn postgres_recovery_visits_rows_added_after_the_first_bounded_batch() {
    let _guard = postgres_contract_guard();
    let url = std::env::var("APPCALL_ENGINE_POSTGRES_URL").unwrap();
    let schema = format!(
        "engine_recovery_batch_test_{}_{}",
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
    e.set_dispatch_limit(1).unwrap();
    e.register_workflow("one", "v1", one_read).unwrap();
    e.register_activity("lookup", "v1").unwrap();
    e.start("a", "one", "v1", PayloadRef::durable("input").unwrap())
        .unwrap();
    for i in 0..65 {
        e.start(
            &format!("busy-{i:03}"),
            "one",
            "v1",
            PayloadRef::durable("input").unwrap(),
        )
        .unwrap();
    }
    assert!(matches!(
        e.drive("a", 0).unwrap(),
        DriveOutcome::Activity(_)
    ));
    for i in 0..65 {
        assert!(matches!(
            e.drive(&format!("busy-{i:03}"), 0).unwrap(),
            DriveOutcome::Waiting
        ));
    }
    drop(e);

    admin
        .batch_execute(&format!(
            "SET search_path TO {schema};
             CREATE FUNCTION append_recovery_tail() RETURNS trigger LANGUAGE plpgsql AS $$
             BEGIN
                 IF NEW.id = 'a' AND OLD.wakeup IS NULL AND NEW.wakeup = 0 THEN
                     INSERT INTO appcall_workflow_runs(id, revision, state, wakeup, record)
                     VALUES ('zz', NEW.revision, 'running', NULL,
                         convert_to(jsonb_set(convert_from(NEW.record, 'UTF8')::jsonb,
                             '{{id}}', to_jsonb('zz'::text))::text, 'UTF8'))
                     ON CONFLICT (id) DO NOTHING;
                 END IF;
                 RETURN NEW;
             END;
             $$;
             CREATE TRIGGER append_recovery_tail AFTER UPDATE OF wakeup
                 ON appcall_workflow_runs FOR EACH ROW EXECUTE FUNCTION append_recovery_tail();"
        ))
        .unwrap();

    let recovered = PostgresStore::from_client(connect()).unwrap();
    let tail_wakeup: Option<i64> = connect()
        .query_one(
            "SELECT wakeup FROM appcall_workflow_runs WHERE id=$1",
            &[&"zz"],
        )
        .unwrap()
        .get(0);
    assert_eq!(tail_wakeup, Some(0));
    drop(recovered);

    admin
        .batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
        .unwrap();
}

#[test]
#[ignore = "requires APPCALL_ENGINE_POSTGRES_URL; creates and drops a private test schema"]
fn postgres_recovered_safe_attempt_fails_at_persisted_elapsed_deadline() {
    let _guard = postgres_contract_guard();
    let url = std::env::var("APPCALL_ENGINE_POSTGRES_URL").unwrap();
    let schema = format!(
        "engine_retry_elapsed_test_{}_{}",
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

    let policy = RetryPolicy::new(5, 25, 10, 10).unwrap();
    let mut e = Engine::with_store(PostgresStore::from_client(connect()).unwrap());
    e.set_retry_policy(policy).unwrap();
    e.register_workflow("one", "v1", one_read).unwrap();
    e.register_activity("lookup", "v1").unwrap();
    e.start("r", "one", "v1", PayloadRef::durable("input").unwrap())
        .unwrap();
    let first = match e.drive("r", 100).unwrap() {
        DriveOutcome::Activity(attempt) => attempt,
        other => panic!("{other:?}"),
    };
    assert_eq!(first.retry_started_at_ms, 100);
    drop(e);

    let mut e = Engine::with_store(PostgresStore::from_client(connect()).unwrap());
    e.register_workflow("one", "v1", one_read).unwrap();
    e.register_activity("lookup", "v1").unwrap();
    assert!(e.runnable(125, 10).unwrap().contains(&"r".to_string()));
    assert!(matches!(
        e.drive("r", 125).unwrap(),
        DriveOutcome::Suspended(RunState::Failed)
    ));
    assert_eq!(
        e.failure_reason("r").unwrap(),
        Some(RunFailure::RetryExhausted)
    );
    assert_eq!(e.next_wakeup().unwrap(), None);
    assert!(e.runnable(125, 10).unwrap().is_empty());

    drop(e);
    admin
        .batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
        .unwrap();
}

#[test]
#[ignore = "requires APPCALL_ENGINE_POSTGRES_URL; creates and drops a private test schema"]
fn postgres_reopen_requeues_ready_task_with_future_timer_wakeup() {
    let _guard = postgres_contract_guard();
    let url = std::env::var("APPCALL_ENGINE_POSTGRES_URL").unwrap();
    let schema = format!(
        "engine_recovery_timer_test_{}_{}",
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
    e.set_dispatch_limit(1).unwrap();
    e.register_workflow("busy", "v1", one_read).unwrap();
    e.register_workflow("parked", "v1", |c| {
        c.spawn_activity("lookup", "v1", c.input().clone(), EffectPolicy::Read)?;
        c.timer(50)?;
        Ok(c.input().clone())
    })
    .unwrap();
    e.register_activity("lookup", "v1").unwrap();
    e.start("busy", "busy", "v1", PayloadRef::durable("input").unwrap())
        .unwrap();
    e.start(
        "parked",
        "parked",
        "v1",
        PayloadRef::durable("input").unwrap(),
    )
    .unwrap();
    match e.drive("busy", 0).unwrap() {
        DriveOutcome::Activity(_) => {}
        other => panic!("{other:?}"),
    }
    assert!(matches!(
        e.drive("parked", 0).unwrap(),
        DriveOutcome::Waiting
    ));
    assert_eq!(e.next_wakeup().unwrap(), Some(50));
    drop(e);

    let mut e = Engine::with_store(PostgresStore::from_client(connect()).unwrap());
    e.register_workflow("busy", "v1", one_read).unwrap();
    e.register_workflow("parked", "v1", |c| {
        c.spawn_activity("lookup", "v1", c.input().clone(), EffectPolicy::Read)?;
        c.timer(50)?;
        Ok(c.input().clone())
    })
    .unwrap();
    e.register_activity("lookup", "v1").unwrap();
    assert!(e.runnable(0, 10).unwrap().contains(&"parked".to_string()));
    match e.drive("parked", 0).unwrap() {
        DriveOutcome::Activity(attempt) => assert_eq!(attempt.attempt, 1),
        other => panic!("{other:?}"),
    }
    assert!(!e.runnable(49, 10).unwrap().contains(&"parked".to_string()));
    assert!(e.runnable(50, 10).unwrap().contains(&"parked".to_string()));

    drop(e);
    admin
        .batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
        .unwrap();
}

fn one_unknown(c: &mut Context) -> WorkflowResult {
    c.activity("unknown", "v1", c.input().clone(), EffectPolicy::Unknown)
}

fn one_read(c: &mut Context) -> WorkflowResult {
    c.activity("lookup", "v1", c.input().clone(), EffectPolicy::Read)
}
