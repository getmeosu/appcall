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
