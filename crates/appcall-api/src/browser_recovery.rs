//! Reconnect only the independent identity database; retain all memory services
//! and the broker's single-use refresh coordination across client generations.
use crate::{
    browser_host::{BrowserConfig, BrowserHost},
    ApiError, RawResponse, Request, Result,
};
use appcall_auth::Principal;
use appcall_web::{Broker, DashboardData};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use std::time::{Duration, Instant};

pub struct RecoveringBrowserHost(Arc<Inner>);
struct Inner {
    config: BrowserConfig,
    database: String,
    broker: Arc<Broker>,
    data: Arc<dyn DashboardData>,
    state: Mutex<State>,
    rebuilding: AtomicBool,
}
struct State {
    current: Arc<BrowserHost>,
    // A removed host remains owned here until its async callers release it.
    // Collection runs on a blocking thread, never on the Tokio reactor.
    retired: Vec<Arc<BrowserHost>>,
    retry_at: Instant,
}
impl RecoveringBrowserHost {
    /// Construct and ultimately drop the host outside an entered Tokio runtime.
    pub fn new(
        config: BrowserConfig,
        database: String,
        data: Arc<dyn DashboardData>,
    ) -> Result<Self> {
        let broker = Arc::new(
            Broker::new(&config.broker_url, &config.product_slug)
                .map_err(|_| ApiError::new("INVALID_CONFIGURATION"))?,
        );
        let current = connect(&config, &database, data.clone(), broker.clone())?;
        Ok(Self(Arc::new(Inner {
            config,
            database,
            broker,
            data,
            state: Mutex::new(State {
                current: Arc::new(current),
                retired: Vec::new(),
                retry_at: Instant::now(),
            }),
            rebuilding: AtomicBool::new(false),
        })))
    }
    fn current(&self) -> Result<Arc<BrowserHost>> {
        self.0
            .state
            .try_lock()
            .map(|s| s.current.clone())
            .map_err(|_| unavailable())
    }
    pub fn database_health(&self) -> Option<bool> {
        let health = snapshot_health(self.current());
        if health == Some(false) {
            self.recover();
        }
        health
    }
    fn available(&self) -> Result<Arc<BrowserHost>> {
        let current = self.current()?;
        if current.database_health() == Some(false) {
            self.recover();
            return Err(unavailable());
        }
        Ok(current)
    }
    fn recover(&self) {
        let Ok(runtime) = tokio::runtime::Handle::try_current() else {
            return;
        };
        let Ok(state) = self.0.state.try_lock() else {
            return;
        };
        if Instant::now() < state.retry_at {
            return;
        }
        drop(state);
        if self
            .0
            .rebuilding
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .is_err()
        {
            return;
        }
        let inner = self.0.clone();
        runtime.spawn_blocking(move || {
            let _reset = Reset(&inner.rebuilding);
            {
                let Ok(mut state) = inner.state.lock() else {
                    return;
                };
                state.retry_at = Instant::now() + Duration::from_millis(250);
                state.retired.retain(|host| Arc::strong_count(host) != 1);
                // Bound retained physical owners even under repeated failures
                // with slow in-flight requests. A later probe retries collection.
                if state.retired.len() >= 16 {
                    return;
                }
            }
            let Ok(next) = connect(
                &inner.config,
                &inner.database,
                inner.data.clone(),
                inner.broker.clone(),
            ) else {
                return;
            };
            if let Ok(mut state) = inner.state.lock() {
                let old = std::mem::replace(&mut state.current, Arc::new(next));
                state.retired.push(old);
            }
        });
    }
    pub async fn handle(&self, request: &Request) -> Result<Option<RawResponse>> {
        let path = request.uri.split('?').next().unwrap_or("");
        if !crate::browser_host::public_path(&request.method, path) {
            return Ok(None);
        }
        let result = self.available()?.handle(request).await;
        self.database_health();
        result
    }
    pub async fn authorize_headers(&self, headers: &[(String, String)]) -> Result<Principal> {
        let result = self.available()?.authorize_headers(headers).await;
        self.database_health();
        result
    }
    pub async fn verify_session(&self, request: &Request) -> Result<Principal> {
        let result = self.available()?.verify_session(request).await;
        self.database_health();
        result
    }
    pub async fn authorize_session(&self, request: &Request) -> Result<(Principal, String)> {
        let result = self.available()?.authorize_session(request).await;
        self.database_health();
        result
    }
}
fn connect(
    config: &BrowserConfig,
    database: &str,
    data: Arc<dyn DashboardData>,
    broker: Arc<Broker>,
) -> Result<BrowserHost> {
    let client =
        appcall_runtime::connect_database_url(database, false).map_err(|_| unavailable())?;
    BrowserHost::with_broker(config.clone(), client, data, broker)
}
fn unavailable() -> ApiError {
    ApiError::new("STORAGE_UNAVAILABLE")
}
fn snapshot_health(current: Result<Arc<BrowserHost>>) -> Option<bool> {
    match current {
        Ok(current) => current.database_health(),
        Err(_) => Some(false),
    }
}
struct Reset<'a>(&'a AtomicBool);
impl Drop for Reset<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn unavailable_identity_snapshot_is_never_healthy() {
        assert_eq!(
            super::snapshot_health(Err(super::unavailable())),
            Some(false)
        );
    }
}
