use super::*;
#[test]
fn cancellation_wakes_parked_worker_and_drops_future_before_side_effect() {
    let token = Arc::new(Cancellation::default());
    let guard = CancelGuard(token.clone());
    let dropped = Arc::new(std::sync::atomic::AtomicBool::new(false));
    let flag = dropped.clone();
    let (tx, rx) = std::sync::mpsc::channel();
    let worker = std::thread::spawn(move || {
        struct Probe(Arc<std::sync::atomic::AtomicBool>);
        impl Drop for Probe {
            fn drop(&mut self) {
                self.0.store(true, std::sync::atomic::Ordering::Release)
            }
        }
        drive(
            async move {
                let _probe = Probe(flag);
                tx.send(()).unwrap();
                std::future::pending::<()>().await;
                panic!("cancelled mutation dispatched")
            },
            token,
        )
    });
    rx.recv_timeout(Duration::from_secs(2)).unwrap();
    drop(guard);
    assert_eq!(worker.join().unwrap().unwrap_err().code, "SERVICE_BUSY");
    assert!(dropped.load(std::sync::atomic::Ordering::Acquire));
}
