//! Host-driven integration. This crate starts no runtime or polling loop.
use appcall_sync::{CredentialResolver, ScheduleRequest, Service};
use sha2::{Digest, Sha256};
use std::{
    sync::{Arc, Mutex},
    time::Duration,
};
use tokio::sync::Semaphore;
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Error {
    InvalidConfig,
    Busy,
    Storage,
    Join,
}
impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "worker {:?}", self)
    }
}
impl std::error::Error for Error {}
pub type Result<T> = std::result::Result<T, Error>;
pub fn sync_job_id(project: &str, dedup: &str) -> String {
    let mut h = Sha256::new();
    h.update((project.len() as u64).to_be_bytes());
    h.update(project);
    h.update(dedup);
    format!(
        "syncjob_{}",
        h.finalize()
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect::<String>()
    )
}
/// All scheduling writes use the outbox transaction; no provider work occurs here.
pub struct SyncDispatchSink;
impl appcall_events::DispatchSink for SyncDispatchSink {
    fn schedule(
        &mut self,
        tx: &mut postgres::Transaction<'_>,
        j: &appcall_events::SyncJob,
    ) -> appcall_events::Result<()> {
        appcall_sync::enqueue(
            tx,
            &ScheduleRequest {
                id: sync_job_id(&j.project_id, &j.dedup_key),
                project_id: j.project_id.clone(),
                connection_id: j.connection_id.clone(),
                operation: j.operation.clone(),
                dedup_key: j.dedup_key.clone(),
                input: j.input.clone(),
            },
        )
        .map(|_| ())
        .map_err(|_| appcall_events::Error::Dispatch)
    }
}
/// A timed-out blocking refresh retains its permit until it actually exits.
/// This bounds outstanding lifecycle work even when callers cancel repeatedly.
pub struct LifecycleCredentials {
    lifecycle: Arc<appcall_oauth::Lifecycle>,
    permits: Arc<Semaphore>,
    timeout: Duration,
}
impl LifecycleCredentials {
    pub fn new(
        lifecycle: Arc<appcall_oauth::Lifecycle>,
        max_concurrent: usize,
        timeout: Duration,
    ) -> Result<Self> {
        if max_concurrent == 0
            || max_concurrent > 64
            || timeout.is_zero()
            || timeout > Duration::from_secs(60)
        {
            return Err(Error::InvalidConfig);
        }
        Ok(Self {
            lifecycle,
            permits: Arc::new(Semaphore::new(max_concurrent)),
            timeout,
        })
    }
}
impl CredentialResolver for LifecycleCredentials {
    fn is_idle(&self) -> bool {
        Arc::strong_count(&self.permits) == 1
    }
    fn database_health(&self) -> Option<bool> {
        self.lifecycle.database_health()
    }
    async fn resolve(
        &self,
        c: appcall_store::Connection,
    ) -> appcall_sync::Result<appcall_sync::ResolvedCredentials> {
        let lifecycle = self.lifecycle.clone();
        let active = Arc::new(std::sync::atomic::AtomicBool::new(true));
        struct Cancel(Arc<std::sync::atomic::AtomicBool>);
        impl Drop for Cancel {
            fn drop(&mut self) {
                self.0.store(false, std::sync::atomic::Ordering::Release);
            }
        }
        let _cancel = Cancel(active.clone());
        bounded_blocking(self.permits.clone(), self.timeout, move || {
            let brand =
                (!c.external_account_id.is_empty()).then_some(c.external_account_id.as_str());
            let scope = appcall_store::Scope::new(&c.project_id, brand)
                .map_err(|_| appcall_sync::Error::Unavailable)?;
            lifecycle
                .resolve_checked_fenced(
                    &scope,
                    &c.id,
                    &c.connector,
                    Some((c.external_account_id.as_str(), c.auth_type.as_str())),
                    false,
                    &|| active.load(std::sync::atomic::Ordering::Acquire),
                )
                .map(|(connection, v)| appcall_sync::ResolvedCredentials {
                    connection,
                    fields: v.into_fields(),
                })
                .map_err(|_| appcall_sync::Error::Unavailable)
        })
        .await
    }
}
async fn bounded_blocking<T: Send + 'static>(
    permits: Arc<Semaphore>,
    timeout: Duration,
    work: impl FnOnce() -> appcall_sync::Result<T> + Send + 'static,
) -> appcall_sync::Result<T> {
    let permit = permits
        .try_acquire_owned()
        .map_err(|_| appcall_sync::Error::Unavailable)?;
    let task = tokio::task::spawn_blocking(move || {
        let _permit = permit;
        work()
    });
    tokio::time::timeout(timeout, task)
        .await
        .map_err(|_| appcall_sync::Error::Unavailable)?
        .map_err(|_| appcall_sync::Error::Unavailable)?
}
#[derive(Clone, Copy, Debug)]
pub struct TickLimits {
    pub outbox: usize,
    pub jobs: usize,
}
impl Default for TickLimits {
    fn default() -> Self {
        Self {
            outbox: 100,
            jobs: 10,
        }
    }
}
impl TickLimits {
    pub fn validate(&self) -> Result<()> {
        if self.outbox == 0 || self.outbox > 1000 || self.jobs == 0 || self.jobs > 100 {
            Err(Error::InvalidConfig)
        } else {
            Ok(())
        }
    }
}
#[derive(Debug, Default)]
pub struct TickReport {
    pub outbox_completed: usize,
    pub outbox_failed: usize,
    pub pages_completed: usize,
    pub job_failures: Vec<(String, appcall_sync::Error)>,
}
pub struct Worker<C> {
    events: Arc<Mutex<postgres::Client>>,
    sync: Arc<Service<C>>,
    permits: Arc<Semaphore>,
    limits: TickLimits,
    outbox_permits: Arc<Semaphore>,
    stopping: Arc<std::sync::atomic::AtomicBool>,
}
impl<C: CredentialResolver + 'static> Worker<C> {
    pub fn database_health(&self) -> Option<bool> {
        let events = match self.events.try_lock() {
            Ok(client) => Some(!client.is_closed()),
            Err(std::sync::TryLockError::WouldBlock) => None,
            Err(std::sync::TryLockError::Poisoned(_)) => Some(false),
        };
        let states = [events, self.sync.database_health()];
        if states.contains(&Some(false)) {
            Some(false)
        } else if states.contains(&None) {
            None
        } else {
            Some(true)
        }
    }
    pub fn is_idle(&self) -> bool {
        Arc::strong_count(&self.events) == 1
            && Arc::strong_count(&self.sync) == 1
            && self.permits.available_permits() == 1
            && self.outbox_permits.available_permits() == 1
            && self.sync.is_idle()
    }
    pub fn new(events: postgres::Client, sync: Service<C>, limits: TickLimits) -> Result<Self> {
        limits.validate()?;
        Ok(Self {
            events: Arc::new(Mutex::new(events)),
            sync: Arc::new(sync),
            permits: Arc::new(Semaphore::new(1)),
            limits,
            outbox_permits: Arc::new(Semaphore::new(1)),
            stopping: Arc::new(std::sync::atomic::AtomicBool::new(false)),
        })
    }
    pub fn request_shutdown(&self) {
        self.stopping
            .store(true, std::sync::atomic::Ordering::SeqCst);
    }
    pub async fn dispatch_outbox(&self) -> Result<appcall_events::DispatchReport> {
        if self.stopping.load(std::sync::atomic::Ordering::SeqCst) {
            return Ok(Default::default());
        }
        let permit = self
            .outbox_permits
            .clone()
            .try_acquire_owned()
            .map_err(|_| Error::Busy)?;
        let events = self.events.clone();
        let limit = self.limits.outbox;
        tokio::task::spawn_blocking(move || {
            let _permit = permit;
            let mut db = events.lock().map_err(|_| Error::Storage)?;
            appcall_events::PgEvents::new(&mut db)
                .dispatch_pending(limit, &mut SyncDispatchSink)
                .map_err(|_| Error::Storage)
        })
        .await
        .map_err(|_| Error::Join)?
    }
    /// Complete a finite outbox + sync batch (one-shot compatibility).
    pub async fn tick(&self, worker_id: &str) -> Result<TickReport> {
        self.cycle(worker_id, true).await
    }
    /// Run only sync pages so daemon outbox progress is independent of slow providers.
    pub async fn tick_jobs(&self, worker_id: &str) -> Result<TickReport> {
        self.cycle(worker_id, false).await
    }
    async fn cycle(&self, worker_id: &str, outbox: bool) -> Result<TickReport> {
        if worker_id.is_empty() || worker_id.len() > 256 {
            return Err(Error::InvalidConfig);
        }
        let permit = self
            .permits
            .clone()
            .try_acquire_owned()
            .map_err(|_| Error::Busy)?;
        let dispatched = if outbox {
            self.dispatch_outbox().await?
        } else {
            Default::default()
        };
        let sync = self.sync.clone();
        let limits = self.limits;
        let stopping = self.stopping.clone();
        let worker_id = worker_id.to_owned();
        tokio::spawn(async move {
            let _permit = permit;
            let mut report = TickReport {
                outbox_completed: dispatched.completed,
                outbox_failed: dispatched.failed,
                ..Default::default()
            };
            for _ in 0..limits.jobs {
                if stopping.load(std::sync::atomic::Ordering::SeqCst) {
                    break;
                }
                let Some(job) = sync.claim(&worker_id).await.map_err(|_| Error::Storage)? else {
                    break;
                };
                let id = job.id.clone();
                match sync.process(job).await {
                    Ok(()) => report.pages_completed += 1,
                    Err(e) => report.job_failures.push((id, e)),
                }
            }
            Ok(report)
        })
        .await
        .map_err(|_| Error::Join)?
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn canceled_blocking_work_retains_capacity_until_it_exits() {
        let permits = Arc::new(Semaphore::new(1));
        let (release, blocked) = std::sync::mpsc::channel();
        let result = bounded_blocking(permits.clone(), Duration::from_millis(20), move || {
            blocked.recv().unwrap();
            Ok(())
        })
        .await;
        assert_eq!(result, Err(appcall_sync::Error::Unavailable));
        assert_eq!(
            bounded_blocking(permits.clone(), Duration::from_secs(1), || Ok(())).await,
            Err(appcall_sync::Error::Unavailable)
        );
        release.send(()).unwrap();
        let permit = tokio::time::timeout(Duration::from_secs(1), permits.clone().acquire_owned())
            .await
            .unwrap()
            .unwrap();
        drop(permit);
        assert!(bounded_blocking(permits, Duration::from_secs(1), || Ok(()))
            .await
            .is_ok());
    }
}
