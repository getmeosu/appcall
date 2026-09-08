//! Host-owned recovery. Failed requests are returned once and never replayed.
use crate::{ApiError, Backend, Identity, RawResponse, Request, Response, Result};
use appcall_actions::{ExecuteRequest, ExecuteResult};
use appcall_runtime::{SessionHealth, SessionTracker};
use appcall_store::Connection;
use std::{
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        Arc, Mutex, Weak,
    },
    time::Duration,
};

pub trait ManagedBackend: Backend + 'static {
    /// False dominates Busy(None); implementations must only try_lock physical owners.
    fn database_health(&self) -> Option<bool>;
    fn stop(&self);
    fn retirement_ready(&self) -> bool {
        true
    }
}
pub type Factory<B> = dyn Fn() -> Result<(B, Arc<SessionTracker>)> + Send + Sync;
struct OwnedBackend<B: ManagedBackend> {
    value: Option<B>,
    reaper: std::sync::mpsc::SyncSender<(B, Arc<AtomicUsize>)>,
    reaping: Arc<AtomicUsize>,
}
impl<B: ManagedBackend> std::ops::Deref for OwnedBackend<B> {
    type Target = B;
    fn deref(&self) -> &B {
        self.value.as_ref().expect("backend retained until drop")
    }
}
impl<B: ManagedBackend> Drop for OwnedBackend<B> {
    fn drop(&mut self) {
        if let Some(backend) = self.value.take() {
            backend.stop();
            // One bounded reaper per manager. Retirement session tracking waits
            // for actual physical destruction, including detached owners.
            self.reaping.fetch_add(1, Ordering::AcqRel);
            if let Err(error) = self.reaper.send((backend, self.reaping.clone())) {
                // A dead reaper must not drop a sync postgres runtime on Tokio.
                std::mem::forget(error.0);
            }
        }
    }
}
struct Node<B: ManagedBackend> {
    backend: OwnedBackend<B>,
    tracker: Arc<SessionTracker>,
    available: AtomicBool,
}
struct Retired<B: ManagedBackend> {
    node: Weak<Node<B>>,
    tracker: Arc<SessionTracker>,
}
struct State<B: ManagedBackend> {
    current: Arc<Node<B>>,
    retired: Option<Retired<B>>,
}
pub struct Generation<B: ManagedBackend> {
    state: Arc<Mutex<State<B>>>,
    factory: Arc<Factory<B>>,
    serial: Arc<tokio::sync::Semaphore>,
    stopping: Arc<AtomicBool>,
    pinned: Option<Arc<Node<B>>>,
    reaper: std::sync::mpsc::SyncSender<(B, Arc<AtomicUsize>)>,
    reaping: Arc<AtomicUsize>,
}
impl<B: ManagedBackend> Clone for Generation<B> {
    fn clone(&self) -> Self {
        Self {
            state: self.state.clone(),
            factory: self.factory.clone(),
            serial: self.serial.clone(),
            stopping: self.stopping.clone(),
            pinned: self.pinned.clone(),
            reaper: self.reaper.clone(),
            reaping: self.reaping.clone(),
        }
    }
}
impl<B: ManagedBackend> Generation<B> {
    pub fn new(initial: B, tracker: Arc<SessionTracker>, factory: Arc<Factory<B>>) -> Self {
        let (reaper, receiver) = std::sync::mpsc::sync_channel::<(B, Arc<AtomicUsize>)>(4);
        std::thread::Builder::new()
            .name("database-reaper".into())
            .spawn(move || {
                for (backend, pending) in receiver {
                    while !backend.retirement_ready() {
                        std::thread::sleep(Duration::from_millis(10));
                    }
                    drop(backend);
                    pending.fetch_sub(1, Ordering::AcqRel);
                }
            })
            .expect("database reaper thread");
        let reaping = Arc::new(AtomicUsize::new(0));
        Self {
            state: Arc::new(Mutex::new(State {
                current: Arc::new(Node {
                    backend: OwnedBackend {
                        value: Some(initial),
                        reaper: reaper.clone(),
                        reaping: reaping.clone(),
                    },
                    tracker,
                    available: AtomicBool::new(true),
                }),
                retired: None,
            })),
            factory,
            serial: Arc::new(tokio::sync::Semaphore::new(1)),
            stopping: Arc::new(AtomicBool::new(false)),
            pinned: None,
            reaper,
            reaping,
        }
    }
    fn current(&self) -> Result<Arc<Node<B>>> {
        self.state
            .lock()
            .map(|s| s.current.clone())
            .map_err(|_| unavailable())
    }
    fn snapshot(&self) -> Result<Arc<Node<B>>> {
        let node = match &self.pinned {
            Some(node) => node.clone(),
            None => self.current()?,
        };
        if self.stopping.load(Ordering::Acquire) || !node.available.load(Ordering::Acquire) {
            return Err(unavailable());
        }
        if node.backend.database_health() == Some(false) {
            node.available.store(false, Ordering::Release);
            node.backend.stop();
            return Err(unavailable());
        }
        Ok(node)
    }
    pub fn stop(&self) {
        self.stopping.store(true, Ordering::Release);
        if let Ok(node) = self.current() {
            node.available.store(false, Ordering::Release);
            node.backend.stop();
        }
    }
    /// Called only by a host runtime; embedded services own no background loop.
    pub fn start(&self) {
        let this = self.clone();
        tokio::spawn(async move {
            while !this.stopping.load(Ordering::Acquire) {
                let _ = this.maintain().await;
                tokio::time::sleep(Duration::from_secs(1)).await;
            }
        });
    }
    /// One bounded check/rebuild. A closure retains the serial permit after caller
    /// cancellation, so a slow probe/factory cannot create parallel candidates.
    pub async fn maintain(&self) -> Result<()> {
        if self.stopping.load(Ordering::Acquire) {
            return Ok(());
        }
        let permit = match self.serial.clone().try_acquire_owned() {
            Ok(p) => Arc::new(p),
            Err(_) => return Ok(()),
        };
        let node = self.current()?;
        let closed = node.backend.database_health() == Some(false);
        if !closed {
            let tracker = node.tracker.clone();
            let hold = permit.clone();
            let health = bounded(move || {
                let _hold = hold;
                tracker.probe()
            })
            .await?;
            match health {
                SessionHealth::Healthy => {
                    node.available.store(true, Ordering::Release);
                    return Ok(());
                }
                SessionHealth::Unavailable => {
                    node.available.store(false, Ordering::Release);
                    return Err(unavailable());
                }
                SessionHealth::Missing => {}
            }
        }
        node.available.store(false, Ordering::Release);
        node.backend.stop();
        drop(node);
        let retired = self
            .state
            .lock()
            .map_err(|_| unavailable())?
            .retired
            .as_ref()
            .map(|r| (r.node.clone(), r.tracker.clone()));
        if let Some((retired, tracker)) = retired {
            if retired.strong_count() > 0 {
                return Ok(());
            }
            let hold = permit.clone();
            if bounded(move || {
                let _hold = hold;
                tracker.live_sessions()
            })
            .await?
            .map_err(|_| unavailable())?
                > 0
            {
                return Ok(());
            }
            self.state.lock().map_err(|_| unavailable())?.retired = None;
        }
        if self.reaping.load(Ordering::Acquire) > 0 {
            return Ok(());
        }
        let factory = self.factory.clone();
        let hold = permit.clone();
        let reaper = self.reaper.clone();
        let reaping = self.reaping.clone();
        let (backend, tracker) = bounded(move || {
            let _hold = hold;
            factory().map(|(backend, tracker)| {
                (
                    OwnedBackend {
                        value: Some(backend),
                        reaper,
                        reaping,
                    },
                    tracker,
                )
            })
        })
        .await??;
        if self.stopping.load(Ordering::Acquire) {
            backend.stop();
            return Ok(());
        }
        if backend.database_health() != Some(true) {
            backend.stop();
            return Err(unavailable());
        }
        let check = tracker.clone();
        let hold = permit.clone();
        if bounded(move || {
            let _hold = hold;
            check.probe()
        })
        .await?
            != SessionHealth::Healthy
        {
            backend.stop();
            return Err(unavailable());
        }
        let next = Arc::new(Node {
            backend,
            tracker,
            available: AtomicBool::new(true),
        });
        let mut state = self.state.lock().map_err(|_| unavailable())?;
        if self.stopping.load(Ordering::Acquire) {
            next.backend.stop();
            return Ok(());
        }
        let previous = std::mem::replace(&mut state.current, next);
        state.retired = Some(Retired {
            node: Arc::downgrade(&previous),
            tracker: previous.tracker.clone(),
        });
        Ok(())
    }
}
async fn bounded<T: Send + 'static>(work: impl FnOnce() -> T + Send + 'static) -> Result<T> {
    tokio::time::timeout(Duration::from_secs(45), tokio::task::spawn_blocking(work))
        .await
        .map_err(|_| unavailable())?
        .map_err(|_| unavailable())
}
fn unavailable() -> ApiError {
    ApiError::new("STORAGE_UNAVAILABLE")
}
impl<B: ManagedBackend> Backend for Generation<B> {
    fn pin_request(&self) -> Result<Option<Self>> {
        let mut pinned = self.clone();
        pinned.pinned = Some(match &self.pinned {
            Some(node) => node.clone(),
            None => self.current()?,
        });
        Ok(Some(pinned))
    }
    async fn event_stream(&self, r: &Request) -> Result<Option<crate::streaming::StreamResponse>> {
        self.snapshot()?.backend.event_stream(r).await
    }
    fn requires_api_auth(&self, m: &str, p: &str) -> bool {
        self.snapshot()
            .map(|n| n.backend.requires_api_auth(m, p))
            .unwrap_or(true)
    }
    async fn raw_route(&self, r: &Request) -> Result<Option<RawResponse>> {
        self.snapshot()?.backend.raw_route(r).await
    }
    async fn public_route(&self, r: &Request) -> Result<Option<Response>> {
        self.snapshot()?.backend.public_route(r).await
    }
    async fn auxiliary_route(&self, i: &Identity, r: &Request) -> Result<Option<Response>> {
        self.snapshot()?.backend.auxiliary_route(i, r).await
    }
    async fn authorize_sync_control(&self, i: &Identity, r: &Request) -> Result<()> {
        self.snapshot()?.backend.authorize_sync_control(i, r).await
    }
    async fn authorize(&self, h: &[(String, String)]) -> Result<Identity> {
        self.snapshot()?.backend.authorize(h).await
    }
    async fn ready(&self) -> Result<()> {
        self.snapshot()?.backend.ready().await
    }
    async fn connections(&self, i: &Identity) -> Result<Vec<Connection>> {
        self.snapshot()?.backend.connections(i).await
    }
    async fn platform_connectors(&self, i: &Identity) -> Result<Vec<String>> {
        self.snapshot()?.backend.platform_connectors(i).await
    }
    async fn connection(&self, i: &Identity, id: &str) -> Result<Connection> {
        self.snapshot()?.backend.connection(i, id).await
    }
    async fn test_connection(&self, i: &Identity, id: &str) -> Result<Connection> {
        self.snapshot()?.backend.test_connection(i, id).await
    }
    async fn disconnect(&self, i: &Identity, id: &str) -> Result<()> {
        self.snapshot()?.backend.disconnect(i, id).await
    }
    async fn execute(&self, r: ExecuteRequest) -> Result<ExecuteResult> {
        self.snapshot()?.backend.execute(r).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicUsize;
    struct TestBackend {
        id: usize,
        healthy: Arc<AtomicBool>,
        effects: Arc<AtomicUsize>,
        client: Option<Arc<Mutex<postgres::Client>>>,
        effect_sql: Option<String>,
        gate: Mutex<Option<(Arc<tokio::sync::Notify>, Arc<tokio::sync::Notify>)>>,
    }
    impl ManagedBackend for TestBackend {
        fn database_health(&self) -> Option<bool> {
            Some(self.healthy.load(Ordering::Acquire))
        }
        fn stop(&self) {}
    }
    impl Backend for TestBackend {
        async fn authorize(&self, _: &[(String, String)]) -> Result<Identity> {
            let gate = self.gate.lock().unwrap().take();
            if let Some((entered, release)) = gate {
                entered.notify_one();
                release.notified().await;
            }
            Ok(Identity {
                project_id: self.id.to_string(),
                account_id: String::new(),
                admin_scope: false,
            })
        }
        async fn ready(&self) -> Result<()> {
            Ok(())
        }
        async fn connections(&self, _: &Identity) -> Result<Vec<Connection>> {
            Ok(vec![])
        }
        async fn platform_connectors(&self, _: &Identity) -> Result<Vec<String>> {
            Ok(vec![])
        }
        async fn connection(&self, _: &Identity, _: &str) -> Result<Connection> {
            Err(unavailable())
        }
        async fn test_connection(&self, _: &Identity, _: &str) -> Result<Connection> {
            Err(unavailable())
        }
        async fn disconnect(&self, _: &Identity, _: &str) -> Result<()> {
            self.effects.fetch_add(1, Ordering::SeqCst);
            if let (Some(client), Some(sql)) = (&self.client, &self.effect_sql) {
                let client = client.clone();
                let sql = sql.clone();
                tokio::task::spawn_blocking(move || client.lock().unwrap().batch_execute(&sql))
                    .await
                    .unwrap()
                    .unwrap();
            }
            Err(unavailable())
        }
        async fn execute(&self, _: ExecuteRequest) -> Result<ExecuteResult> {
            Err(unavailable())
        }
    }
    fn fake(id: usize) -> TestBackend {
        TestBackend {
            id,
            healthy: Arc::new(AtomicBool::new(true)),
            effects: Arc::new(AtomicUsize::new(0)),
            client: None,
            effect_sql: None,
            gate: Mutex::new(None),
        }
    }
    #[tokio::test]
    async fn request_pin_never_authorizes_old_and_dispatches_new_generation() {
        let manager = Generation::new(
            fake(1),
            Arc::new(SessionTracker::default()),
            Arc::new(|| Ok((fake(2), Arc::new(SessionTracker::default())))),
        );
        let pinned = manager.pin_request().unwrap().unwrap();
        let identity = pinned.authorize(&[]).await.unwrap();
        let old = manager.current().unwrap();
        old.backend.healthy.store(false, Ordering::Release);
        manager.maintain().await.unwrap();
        assert_eq!(manager.authorize(&[]).await.unwrap().project_id, "2");
        assert!(pinned.disconnect(&identity, "c").await.is_err());
        assert_eq!(
            manager
                .current()
                .unwrap()
                .backend
                .effects
                .load(Ordering::SeqCst),
            0
        );
        assert_eq!(old.backend.effects.load(Ordering::SeqCst), 0);
        manager.stop();
    }
    #[tokio::test(flavor = "current_thread")]
    #[ignore = "requires local TCP sockets"]
    async fn transport_pins_generation_across_pre_auth_and_route_authorization() {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        tokio::task::LocalSet::new().run_until(async {
            let initial=fake(1);
            let entered=Arc::new(tokio::sync::Notify::new());
            let release=Arc::new(tokio::sync::Notify::new());
            *initial.gate.lock().unwrap()=Some((entered.clone(),release.clone()));
            let manager=Generation::new(initial,Arc::new(SessionTracker::default()),Arc::new(||Ok((fake(2),Arc::new(SessionTracker::default())))));
            let listener=tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            let address=listener.local_addr().unwrap();
            let registry=appcall_connectors::Registry::load("../../runner/connectors").unwrap();
            let api=std::rc::Rc::new(crate::Api{registry,backend:manager.clone()});
            let (stop,done)=tokio::sync::oneshot::channel();
            let server=tokio::task::spawn_local(crate::serve(listener,api,async{let _=done.await;}));
            let request=tokio::task::spawn_local(async move {
                let mut stream=tokio::net::TcpStream::connect(address).await.unwrap();
                stream.write_all(b"GET /v1/connections HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n").await.unwrap();
                let mut response=String::new();stream.read_to_string(&mut response).await.unwrap();response
            });
            entered.notified().await;
            manager.current().unwrap().backend.healthy.store(false,Ordering::Release);
            manager.maintain().await.unwrap();
            release.notify_one();
            let response=request.await.unwrap();
            assert!(response.starts_with("HTTP/1.1 503"),"{response}");
            assert_eq!(manager.authorize(&[]).await.unwrap().project_id,"2");
            stop.send(()).unwrap();server.await.unwrap().unwrap();manager.stop();
        }).await;
    }
    #[test]
    #[ignore = "requires explicit local PostgreSQL"]
    fn idle_killed_client_rotates_and_actual_sync_clients_drop_off_runtime() {
        use std::collections::BTreeMap;
        let cfg = appcall_runtime::Config::from_map(&BTreeMap::from([
            (
                "APPCALL_DATABASE_URL".into(),
                std::env::var("APPCALL_ENGINE_POSTGRES_URL").expect("explicit PostgreSQL URL"),
            ),
            ("APPCALL_RUNNER_URL".into(), "http://127.0.0.1:1".into()),
            ("APPCALL_SECRET_KEY".into(), "07".repeat(32)),
        ]))
        .unwrap();
        let build = move || {
            let (config, tracker) = cfg.generation();
            let mut backend = fake(1);
            backend.client = Some(Arc::new(Mutex::new(
                config.connect().map_err(|_| unavailable())?,
            )));
            Ok((backend, tracker))
        };
        let (mut initial, tracker) = build().unwrap();
        let table = format!("recovery_effect_{}", uuid::Uuid::new_v4().simple());
        initial
            .client
            .as_ref()
            .unwrap()
            .lock()
            .unwrap()
            .batch_execute(&format!("CREATE TABLE {table}(n int)"))
            .unwrap();
        initial.effect_sql = Some(format!("INSERT INTO {table}(n) VALUES(1)"));
        let pid: i32 = initial
            .client
            .as_ref()
            .unwrap()
            .lock()
            .unwrap()
            .query_one("SELECT pg_backend_pid()", &[])
            .unwrap()
            .get(0);
        let manager = Generation::new(initial, tracker, Arc::new(build));
        let mut admin = appcall_runtime::connect_database_url(
            &std::env::var("APPCALL_ENGINE_POSTGRES_URL").unwrap(),
            false,
        )
        .unwrap();
        let runtime = tokio::runtime::Runtime::new().unwrap();
        runtime.block_on(async {
            let identity = manager.authorize(&[]).await.unwrap();
            assert!(manager.disconnect(&identity, "c").await.is_err());
        });
        admin
            .query_one("SELECT pg_terminate_backend($1)", &[&pid])
            .unwrap();
        runtime.block_on(async {
            manager.maintain().await.unwrap();
            assert!(manager.current().unwrap().available.load(Ordering::Acquire));
        });
        let count: i64 = admin
            .query_one(&format!("SELECT count(*) FROM {table}"), &[])
            .unwrap()
            .get(0);
        assert_eq!(
            count, 1,
            "committed effect with lost outcome must never replay"
        );
        admin.batch_execute(&format!("DROP TABLE {table}")).unwrap();
        let node = manager.current().unwrap();
        node.backend
            .client
            .as_ref()
            .unwrap()
            .lock()
            .unwrap()
            .simple_query("SELECT 1")
            .unwrap();
        drop(node);
        runtime.block_on(async {
            manager.stop();
            drop(manager);
        });
        runtime.shutdown_timeout(Duration::from_secs(2));
    }
    #[test]
    #[ignore = "requires initdb/pg_ctl and local TCP sockets"]
    fn full_database_restart_recovers_without_rotating_on_monitor_unavailability() {
        use std::{
            collections::BTreeMap,
            process::{Command, Stdio},
        };
        let directory = std::env::temp_dir().join(format!(
            "appcall_recovery_{}",
            uuid::Uuid::new_v4().simple()
        ));
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        drop(listener);
        assert!(Command::new("initdb")
            .args(["-A", "trust", "-U", "postgres", "-D"])
            .arg(&directory)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .unwrap()
            .success());
        struct Cluster(std::path::PathBuf);
        impl Drop for Cluster {
            fn drop(&mut self) {
                let _ = Command::new("pg_ctl")
                    .args(["-D"])
                    .arg(&self.0)
                    .args(["-m", "immediate", "stop"])
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .status();
                let _ = std::fs::remove_dir_all(&self.0);
            }
        }
        let _cluster = Cluster(directory.clone());
        let control = |action: &str| {
            assert!(Command::new("pg_ctl")
                .arg("-D")
                .arg(&directory)
                .args([
                    "-w",
                    "-t",
                    "10",
                    "-o",
                    &format!("-h 127.0.0.1 -p {port} -k /tmp"),
                    action
                ])
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status()
                .unwrap()
                .success());
        };
        control("start");
        let cfg = appcall_runtime::Config::from_map(&BTreeMap::from([
            (
                "APPCALL_DATABASE_URL".into(),
                format!("postgres://postgres@127.0.0.1:{port}/postgres?sslmode=disable"),
            ),
            ("APPCALL_RUNNER_URL".into(), "http://127.0.0.1:1".into()),
            ("APPCALL_SECRET_KEY".into(), "07".repeat(32)),
        ]))
        .unwrap();
        let builds = Arc::new(AtomicUsize::new(0));
        let count = builds.clone();
        let build = move || {
            count.fetch_add(1, Ordering::SeqCst);
            let (config, tracker) = cfg.generation();
            let mut backend = fake(1);
            backend.client = Some(Arc::new(Mutex::new(
                config.connect().map_err(|_| unavailable())?,
            )));
            Ok((backend, tracker))
        };
        let (backend, tracker) = build().unwrap();
        let manager = Generation::new(backend, tracker, Arc::new(build));
        let runtime = tokio::runtime::Runtime::new().unwrap();
        control("stop");
        assert!(runtime.block_on(manager.maintain()).is_err());
        assert_eq!(
            builds.load(Ordering::SeqCst),
            1,
            "monitor outage must not rotate a known healthy client"
        );
        control("start");
        runtime.block_on(manager.maintain()).unwrap();
        assert_eq!(builds.load(Ordering::SeqCst), 2);
        let node = manager.current().unwrap();
        node.backend
            .client
            .as_ref()
            .unwrap()
            .lock()
            .unwrap()
            .simple_query("SELECT 1")
            .unwrap();
        drop(node);
        runtime.block_on(async {
            manager.stop();
            drop(manager);
        });
        runtime.shutdown_timeout(Duration::from_secs(2));
    }
}
