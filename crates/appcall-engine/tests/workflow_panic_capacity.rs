use appcall_engine::*;
use std::{
    panic::{catch_unwind, AssertUnwindSafe},
    sync::{
        atomic::{AtomicUsize, Ordering},
        mpsc, Arc, Mutex,
    },
    thread,
    time::Duration,
};

#[test]
fn workflow_panic_keeps_in_flight_capacity_until_late_native_result() {
    let directory = tempfile::tempdir().unwrap();
    let database = directory.path().join("engine.db");
    let replay_count = Arc::new(AtomicUsize::new(0));
    let panic_replay_count = replay_count.clone();
    let mut engine = Engine::open(&database).unwrap();
    engine.set_dispatch_limit(1).unwrap();
    engine
        .register_workflow("panic", "v1", move |context| {
            if panic_replay_count.fetch_add(1, Ordering::SeqCst) > 0 {
                panic!("panic during replay");
            }
            context.activity(
                "blocking",
                "v1",
                context.input().clone(),
                EffectPolicy::Unknown,
            )
        })
        .unwrap();
    engine
        .register_workflow("healthy", "v1", |context| {
            context.activity(
                "blocking",
                "v1",
                context.input().clone(),
                EffectPolicy::Unknown,
            )
        })
        .unwrap();

    let (started_sender, started_receiver) = mpsc::channel();
    let (release_sender, release_receiver) = mpsc::channel();
    let release_receiver = Mutex::new(release_receiver);
    engine
        .register_activity_fn("blocking", "v1", move |_, _| {
            started_sender.send(()).unwrap();
            release_receiver
                .lock()
                .unwrap()
                .recv_timeout(Duration::from_secs(10))
                .unwrap();
            Ok(PayloadRef::durable("native-result").unwrap())
        })
        .unwrap();
    engine
        .start(
            "panic-run",
            "panic",
            "v1",
            PayloadRef::durable("input").unwrap(),
        )
        .unwrap();
    engine
        .start(
            "healthy-run",
            "healthy",
            "v1",
            PayloadRef::durable("input").unwrap(),
        )
        .unwrap();

    let attempt = match engine.drive("panic-run", 0).unwrap() {
        DriveOutcome::Activity(attempt) => attempt,
        outcome => panic!("expected first activity dispatch, got {outcome:?}"),
    };
    let invocation = engine
        .prepare_registered(&attempt, &Local)
        .unwrap()
        .unwrap();
    let worker = thread::spawn(move || invocation.run());
    let mut native = NativeGuard {
        release_sender: Some(release_sender),
        worker: Some(worker),
    };
    started_receiver
        .recv_timeout(Duration::from_secs(2))
        .unwrap();

    assert!(matches!(
        engine.drive("healthy-run", 0).unwrap(),
        DriveOutcome::Waiting
    ));
    assert_eq!(engine.next_wakeup().unwrap(), None);

    let mut forged_attempt = attempt.clone();
    forged_attempt.input = PayloadRef::durable("forged-input").unwrap();
    assert!(matches!(
        engine.complete(
            &forged_attempt,
            PayloadRef::durable("forged-output").unwrap()
        ),
        Err(Error::Conflict)
    ));
    assert!(matches!(
        engine.drive("healthy-run", 0).unwrap(),
        DriveOutcome::Waiting
    ));

    let replay_drive = catch_unwind(AssertUnwindSafe(|| engine.drive("panic-run", 0)));
    assert!(
        replay_drive.is_ok(),
        "workflow panic escaped while native work was in flight"
    );
    assert!(matches!(
        replay_drive.unwrap().unwrap(),
        DriveOutcome::Suspended(RunState::Failed)
    ));
    assert_eq!(
        engine.failure_reason("panic-run").unwrap(),
        Some(RunFailure::InvalidCommand)
    );
    assert!(matches!(
        engine.drive("healthy-run", 0).unwrap(),
        DriveOutcome::Waiting
    ));
    let late_result = native.finish();
    assert!(matches!(
        engine.finish_registered(late_result),
        Err(Error::Conflict)
    ));
    assert!(engine
        .runnable(0, 10)
        .unwrap()
        .contains(&"healthy-run".into()));
    assert!(matches!(
        engine.drive("healthy-run", 0).unwrap(),
        DriveOutcome::Activity(_)
    ));
}

#[test]
fn malformed_blocked_rejection_releases_detached_dispatch_capacity() {
    let directory = tempfile::tempdir().unwrap();
    let mut engine = Engine::open(directory.path().join("engine.db")).unwrap();
    engine.set_dispatch_limit(1).unwrap();
    engine
        .register_workflow("malformed", "v1", |context| {
            let _ = context.spawn_activity(
                "detached",
                "v1",
                context.input().clone(),
                EffectPolicy::Read,
            )?;
            context.timer(100)?;
            Err(WorkflowError::Blocked)
        })
        .unwrap();
    engine
        .register_workflow("healthy", "v1", |context| {
            context.activity(
                "detached",
                "v1",
                context.input().clone(),
                EffectPolicy::Read,
            )
        })
        .unwrap();
    engine.register_activity("detached", "v1").unwrap();
    engine
        .start(
            "malformed-run",
            "malformed",
            "v1",
            PayloadRef::durable("input").unwrap(),
        )
        .unwrap();
    engine
        .start(
            "healthy-run",
            "healthy",
            "v1",
            PayloadRef::durable("input").unwrap(),
        )
        .unwrap();

    let detached_attempt = match engine.drive("malformed-run", 0).unwrap() {
        DriveOutcome::Activity(attempt) => attempt,
        outcome => panic!("expected detached activity dispatch, got {outcome:?}"),
    };
    assert_eq!(detached_attempt.run_id, "malformed-run");
    assert!(matches!(
        engine.drive("healthy-run", 0).unwrap(),
        DriveOutcome::Waiting
    ));

    assert!(matches!(
        engine.drive("malformed-run", 100).unwrap(),
        DriveOutcome::Suspended(RunState::Failed)
    ));
    assert_eq!(engine.status("malformed-run").unwrap(), RunState::Failed);
    assert_eq!(
        engine.failure_reason("malformed-run").unwrap(),
        Some(RunFailure::InvalidCommand)
    );
    assert!(engine
        .runnable(100, 10)
        .unwrap()
        .contains(&"healthy-run".into()));

    let healthy_attempt = match engine.drive("healthy-run", 100).unwrap() {
        DriveOutcome::Activity(attempt) => attempt,
        outcome => panic!("expected healthy activity dispatch, got {outcome:?}"),
    };
    assert!(matches!(
        engine.complete(
            &detached_attempt,
            PayloadRef::durable("late-output").unwrap()
        ),
        Err(Error::Conflict)
    ));
    engine
        .complete(
            &healthy_attempt,
            PayloadRef::durable("healthy-output").unwrap(),
        )
        .unwrap();
}

struct Local;
impl PayloadResolver for Local {
    fn resolve(&self, _: &PayloadRef) -> Result<Option<Vec<u8>>> {
        Ok(Some(vec![]))
    }
}

struct NativeGuard {
    release_sender: Option<mpsc::Sender<()>>,
    worker: Option<thread::JoinHandle<NativeResult>>,
}
impl NativeGuard {
    fn finish(&mut self) -> NativeResult {
        self.release_sender.take().unwrap().send(()).unwrap();
        self.worker.take().unwrap().join().unwrap()
    }
}
impl Drop for NativeGuard {
    fn drop(&mut self) {
        if let Some(sender) = self.release_sender.take() {
            let _ = sender.send(());
        }
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}
