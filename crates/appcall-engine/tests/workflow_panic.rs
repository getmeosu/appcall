use appcall_engine::*;
use std::{
    panic::{catch_unwind, AssertUnwindSafe},
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    },
};

#[test]
fn workflow_panic_fails_once_and_restart_does_not_replay() {
    let directory = tempfile::tempdir().unwrap();
    let database = directory.path().join("engine.db");
    let invocations = Arc::new(AtomicUsize::new(0));
    let panic_invocations = invocations.clone();
    let mut engine = Engine::open(&database).unwrap();
    engine
        .register_workflow("bad", "v1", move |_| {
            panic_invocations.fetch_add(1, Ordering::SeqCst);
            panic!("workflow panic payload must not be persisted");
        })
        .unwrap();
    engine
        .start(
            "bad-run",
            "bad",
            "v1",
            PayloadRef::durable("input").unwrap(),
        )
        .unwrap();

    let first_drive = catch_unwind(AssertUnwindSafe(|| engine.drive("bad-run", 0)));
    assert!(
        first_drive.is_ok(),
        "workflow panic escaped the engine drive boundary"
    );
    assert!(matches!(
        first_drive.unwrap().unwrap(),
        DriveOutcome::Suspended(RunState::Failed)
    ));
    assert_eq!(invocations.load(Ordering::SeqCst), 1);
    assert_eq!(
        engine.failure_reason("bad-run").unwrap(),
        Some(RunFailure::InvalidCommand)
    );
    drop(engine);

    let persisted = std::fs::read(&database).unwrap();
    assert!(!persisted
        .windows(b"workflow panic payload must not be persisted".len())
        .any(|window| window == b"workflow panic payload must not be persisted"));

    let restart_invocations = invocations.clone();
    let mut restarted = Engine::open(&database).unwrap();
    restarted
        .register_workflow("bad", "v1", move |_| {
            restart_invocations.fetch_add(1, Ordering::SeqCst);
            panic!("workflow must not replay after failure");
        })
        .unwrap();
    assert!(matches!(
        restarted.drive("bad-run", 0).unwrap(),
        DriveOutcome::Suspended(RunState::Failed)
    ));
    assert_eq!(invocations.load(Ordering::SeqCst), 1);
}
