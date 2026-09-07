//! Replace only physically lost PostgreSQL sessions; never replay failed work.
use super::LiveWorker;
use appcall_runtime::{Config, SessionHealth, SessionTracker};
use appcall_worker::{LifecycleCredentials, TickLimits, Worker};
use std::{
    sync::{
        atomic::{AtomicU8, AtomicUsize, Ordering},
        mpsc::{sync_channel, SyncSender},
        Arc,
    },
    time::Duration,
};
use tokio::sync::watch;
pub struct Generation {
    pub worker: Arc<LiveWorker>,
    tracker: Arc<SessionTracker>,
}
type Factory = Arc<dyn Fn() -> Result<Arc<Generation>, &'static str> + Send + Sync>;
pub struct Host {
    current: watch::Sender<Arc<Generation>>,
    factory: Factory,
    retained: Arc<AtomicUsize>,
    pub ready: Arc<AtomicU8>,
}
pub struct Reaper {
    thread: std::thread::JoinHandle<()>,
    completed: std::sync::mpsc::Receiver<()>,
}
impl Reaper {
    pub fn join(self) -> bool {
        if self.completed.recv_timeout(Duration::from_secs(2)).is_err() {
            return false;
        }
        self.thread.join().is_ok()
    }
}
fn retain(
    sender: &SyncSender<Arc<Generation>>,
    count: &AtomicUsize,
    generation: &Arc<Generation>,
) -> Result<(), &'static str> {
    if count.fetch_add(1, Ordering::SeqCst) >= 4 {
        count.fetch_sub(1, Ordering::SeqCst);
        return Err("worker retirement capacity reached");
    }
    if sender.try_send(generation.clone()).is_err() {
        count.fetch_sub(1, Ordering::SeqCst);
        return Err("worker retirement unavailable");
    }
    Ok(())
}
impl Host {
    /// Construct and retain every generation off Tokio, including candidates
    /// whose asynchronous caller disappears before receiving the factory result.
    pub fn new(config: &Config, jobs: usize) -> Result<(Arc<Self>, Reaper), &'static str> {
        let config = config.clone();
        let registry = config
            .registry()
            .map_err(|_| "worker registry unavailable")?;
        let runner = config.runner().map_err(|_| "worker runner unavailable")?;
        let retained = Arc::new(AtomicUsize::new(0));
        let count = retained.clone();
        let (sender, receiver) = sync_channel::<Arc<Generation>>(4);
        let (finished, completed) = std::sync::mpsc::channel();
        let reaper = std::thread::spawn(move || {
            while let Ok(generation) = receiver.recv() {
                while Arc::strong_count(&generation) > 1 || !generation.worker.is_idle() {
                    std::thread::sleep(Duration::from_millis(10));
                }
                drop(generation);
                count.fetch_sub(1, Ordering::SeqCst);
            }
            let _ = finished.send(());
        });
        let count = retained.clone();
        let factory: Factory = Arc::new(move || {
            let (cfg, tracker) = config.generation();
            let credentials = LifecycleCredentials::new(
                cfg.lifecycle(Arc::new(registry.clone()))
                    .map_err(|_| "worker credentials unavailable")?,
                1,
                Duration::from_secs(15),
            )
            .map_err(|_| "worker credentials unavailable")?;
            let sync = appcall_sync::Service::new(
                appcall_sync::Repository::new(
                    cfg.connect().map_err(|_| "worker database unavailable")?,
                ),
                cfg.store().map_err(|_| "worker database unavailable")?,
                registry.clone(),
                runner.clone(),
                credentials,
                appcall_sync::Config::default(),
            )
            .map_err(|_| "worker sync unavailable")?;
            let generation = Arc::new(Generation {
                worker: Arc::new(
                    Worker::new(
                        cfg.connect().map_err(|_| "worker database unavailable")?,
                        sync,
                        TickLimits { outbox: 100, jobs },
                    )
                    .map_err(|_| "worker unavailable")?,
                ),
                tracker,
            });
            retain(&sender, &count, &generation)?;
            Ok(generation)
        });
        let first = factory()?;
        let (current, _) = watch::channel(first);
        Ok((
            Arc::new(Self {
                current,
                factory,
                retained,
                ready: Arc::new(AtomicU8::new(3)),
            }),
            Reaper {
                thread: reaper,
                completed,
            },
        ))
    }
    pub fn current(&self) -> Arc<Generation> {
        self.current.borrow().clone()
    }
    pub fn observe(&self, generation: &Arc<Generation>, bit: u8, healthy: bool) {
        let current = self.current.borrow();
        if Arc::ptr_eq(generation, &current) {
            if healthy {
                self.ready.fetch_or(bit, Ordering::SeqCst);
            } else {
                self.ready.fetch_and(!bit, Ordering::SeqCst);
            }
        }
    }
    pub fn stop(&self) {
        self.ready.fetch_or(4, Ordering::SeqCst);
        self.current().worker.request_shutdown();
    }
    pub async fn monitor(self: Arc<Self>, mut stop: watch::Receiver<bool>) {
        loop {
            if *stop.borrow() {
                break;
            }
            let generation = self.current();
            let physical = generation.worker.database_health();
            let tracker = generation.tracker.clone();
            let probe = tokio::task::spawn_blocking(move || tracker.probe())
                .await
                .unwrap_or(SessionHealth::Unavailable);
            if *stop.borrow() {
                break;
            }
            if physical == Some(false) || probe == SessionHealth::Missing {
                self.ready.fetch_or(8, Ordering::SeqCst);
                generation.worker.request_shutdown();
                if self.retained.load(Ordering::SeqCst) < 4 {
                    let factory = self.factory.clone();
                    match tokio::task::spawn_blocking(move || factory()).await {
                        Ok(Ok(next)) if !*stop.borrow() => {
                            self.current.send_modify(|current| {
                                *current = next;
                                self.ready.store(8, Ordering::SeqCst);
                            });
                            super::log("worker_database_recovered", true);
                        }
                        _ => super::log("worker_database_recovery_failed", false),
                    }
                }
            } else if probe == SessionHealth::Healthy {
                self.ready.fetch_and(!8, Ordering::SeqCst);
            } else {
                self.ready.fetch_or(8, Ordering::SeqCst);
            }
            tokio::select! {_=stop.changed()=>break,_=tokio::time::sleep(Duration::from_secs(1))=>{}}
        }
    }
}
