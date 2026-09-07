use crate::qa::Executor;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
#[derive(Clone, Default)]
pub struct Cancellation {
    cancelled: Arc<AtomicBool>,
    notify: Arc<tokio::sync::Notify>,
}
impl Cancellation {
    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::Release);
        self.notify.notify_waiters();
    }
    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::Acquire)
    }
}
pub struct Deadline<'a, E> {
    pub inner: &'a E,
    pub deadline: tokio::time::Instant,
    pub cancellation: Cancellation,
}
impl<E: Executor> Executor for Deadline<'_, E> {
    async fn execute(
        &self,
        r: appcall_actions::ExecuteRequest,
    ) -> Result<serde_json::Value, String> {
        let notified = self.cancellation.notify.notified();
        tokio::pin!(notified);
        notified.as_mut().enable();
        if self.cancellation.is_cancelled() {
            return Err("INTERRUPTED".into());
        }
        if tokio::time::Instant::now() >= self.deadline {
            return Err("TIMEOUT".into());
        }
        tokio::select! {
            biased;
            _=&mut notified=>Err("INTERRUPTED".into()),
        result=tokio::time::timeout_at(self.deadline,self.inner.execute(r))=>result.map_err(|_|"TIMEOUT".to_owned())?,
        }
    }
}
