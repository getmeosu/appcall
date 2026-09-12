use crate::*;
use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc,
    },
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tokio::sync::oneshot;
pub(crate) enum Event {
    Request {
        method: String,
        path: String,
        authorization: String,
        body: Vec<u8>,
        deadline: Instant,
        reply: oneshot::Sender<ApiResponse>,
    },
    Native(NativeResult),
    Wake,
}
#[derive(Clone)]
pub struct EngineClient {
    sender: mpsc::SyncSender<Event>,
    alive: Arc<AtomicBool>,
}
pub struct EngineHost {
    client: EngineClient,
    stopping: Arc<AtomicBool>,
    worker: Option<thread::JoinHandle<Result<()>>>,
}
impl EngineHost {
    /// Owns one store-driving thread. Native invocations run separately, bounded
    /// by Engine's dispatch limit; no async runtime is installed in the core.
    pub fn spawn<S: Store + Send + 'static>(
        adapter: HttpAdapter<S>,
        resolver: Arc<dyn PayloadResolver + Send + Sync>,
    ) -> Result<Self> {
        let (sender, receiver) = mpsc::sync_channel(256);
        let stopping = Arc::new(AtomicBool::new(false));
        let alive = Arc::new(AtomicBool::new(true));
        let alive_worker = alive.clone();
        let tx = sender.clone();
        let stop = stopping.clone();
        let worker = thread::Builder::new()
            .name("appcall-engine".into())
            .spawn(move || {
                struct Liveness(Arc<AtomicBool>);
                impl Drop for Liveness {
                    fn drop(&mut self) {
                        self.0.store(false, Ordering::Release);
                    }
                }
                let _alive = Liveness(alive_worker);
                drive(adapter, resolver, tx, receiver, stop)
            })
            .map_err(|_| Error::Unavailable)?;
        Ok(Self {
            client: EngineClient { sender, alive },
            stopping,
            worker: Some(worker),
        })
    }
    pub fn client(&self) -> EngineClient {
        self.client.clone()
    }
    /// Pauses work without cancelling runs. Native code already executing is
    /// not forcibly stopped; interrupted effects recover by their policy.
    pub fn shutdown(mut self) -> Result<()> {
        self.stopping.store(true, Ordering::Release);
        let _ = self.client.sender.try_send(Event::Wake);
        self.worker
            .take()
            .ok_or(Error::Conflict)?
            .join()
            .map_err(|_| Error::Unavailable)?
    }
}
impl Drop for EngineHost {
    fn drop(&mut self) {
        self.stopping.store(true, Ordering::Release);
        let _ = self.client.sender.try_send(Event::Wake);
    }
}
impl EngineClient {
    pub fn is_alive(&self) -> bool {
        self.alive.load(Ordering::Acquire)
    }
    pub async fn request(
        &self,
        method: String,
        path: String,
        authorization: String,
        body: Vec<u8>,
        timeout: Duration,
    ) -> ApiResponse {
        if !self.is_alive() {
            return crate::response(
                503,
                serde_json::json!({"success":false,"error":"unavailable"}),
            );
        }
        if timeout.is_zero()
            || timeout > Duration::from_secs(300)
            || body.len() > 65536
            || path.len() > 4096
            || authorization.len() > 512
            || method.len() > 16
        {
            return crate::response(
                400,
                serde_json::json!({"success":false,"error":"invalid_request"}),
            );
        }
        let (reply, receiver) = oneshot::channel();
        let event = Event::Request {
            method,
            path,
            authorization,
            body,
            deadline: Instant::now() + timeout,
            reply,
        };
        if self.sender.try_send(event).is_err() {
            return crate::response(
                503,
                serde_json::json!({"success":false,"error":"unavailable"}),
            );
        }
        match tokio::time::timeout(timeout, receiver).await {
            Ok(Ok(response)) => response,
            Ok(Err(_)) => crate::response(
                503,
                serde_json::json!({"success":false,"error":"unavailable"}),
            ),
            Err(_) => crate::response(
                504,
                serde_json::json!({"success":false,"error":"request_timeout"}),
            ),
        }
    }
}
fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(i64::MAX as u128) as i64
}
fn drive<S: Store>(
    mut api: HttpAdapter<S>,
    resolver: Arc<dyn PayloadResolver + Send + Sync>,
    sender: mpsc::SyncSender<Event>,
    receiver: mpsc::Receiver<Event>,
    stopping: Arc<AtomicBool>,
) -> Result<()> {
    while !stopping.load(Ordering::Acquire) {
        for id in api.engine_mut().runnable(now(), 32)? {
            let outcome = match api
                .engine_mut()
                .drive_with_resolver(&id, now(), resolver.as_ref())
            {
                Ok(outcome) => outcome,
                Err(Error::Invalid(_) | Error::Nondeterminism) => {
                    api.engine_mut()
                        .reject_run(&id, RunFailure::InvalidCommand)?;
                    continue;
                }
                Err(Error::Limit) => {
                    api.engine_mut()
                        .reject_run(&id, RunFailure::ResourceLimit)?;
                    continue;
                }
                Err(Error::Unavailable) => {
                    api.engine_mut()
                        .reject_run(&id, RunFailure::PayloadUnavailable)?;
                    continue;
                }
                Err(error) => return Err(error),
            };
            if let DriveOutcome::Activity(attempt) = outcome {
                if !api
                    .engine_mut()
                    .has_native_activity(&attempt.name, &attempt.version)
                {
                    api.engine_mut()
                        .reject_dispatch(&attempt, RunFailure::MissingActivityImplementation)?;
                    continue;
                }
                let invocation =
                    match api
                        .engine_mut()
                        .prepare_registered_at(&attempt, resolver.as_ref(), now())
                    {
                        Ok(invocation) => invocation,
                        Err(Error::Invalid(_) | Error::Nondeterminism) => {
                            api.engine_mut()
                                .reject_dispatch(&attempt, RunFailure::InvalidCommand)?;
                            continue;
                        }
                        Err(Error::Limit) => {
                            api.engine_mut()
                                .reject_dispatch(&attempt, RunFailure::ResourceLimit)?;
                            continue;
                        }
                        Err(Error::Unavailable) => {
                            api.engine_mut()
                                .reject_dispatch(&attempt, RunFailure::PayloadUnavailable)?;
                            continue;
                        }
                        Err(error) => return Err(error),
                    };
                if let Some(invocation) = invocation {
                    let sender = sender.clone();
                    thread::Builder::new()
                        .name("appcall-activity".into())
                        .spawn(move || {
                            let _ = sender.send(Event::Native(invocation.run()));
                        })
                        .map_err(|_| Error::Unavailable)?;
                }
            }
        }
        let event = match api.engine_mut().next_wakeup()? {
            Some(deadline) => match receiver.recv_timeout(Duration::from_millis(
                deadline.saturating_sub(now()).max(0) as u64,
            )) {
                Ok(event) => Some(event),
                Err(mpsc::RecvTimeoutError::Timeout) => None,
                Err(_) => return Ok(()),
            },
            None => Some(receiver.recv().map_err(|_| Error::Unavailable)?),
        };
        match event {
            Some(Event::Request {
                method,
                path,
                authorization,
                body,
                deadline,
                reply,
            }) => {
                if Instant::now() >= deadline || reply.is_closed() {
                    let _ = reply.send(crate::response(
                        504,
                        serde_json::json!({"success":false,"error":"request_timeout"}),
                    ));
                } else {
                    let _ = reply.send(api.handle(&method, &path, &authorization, &body));
                }
            }
            Some(Event::Native(result)) => {
                if let Err(error) = api.engine_mut().finish_registered(result) {
                    if !matches!(error, Error::Conflict) {
                        return Err(error);
                    }
                }
            }
            Some(Event::Wake) | None => {}
        }
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn bounded_request_queue_deadline_and_stopped_owner_are_explicit() {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let (sender, _receiver) = mpsc::sync_channel(1);
        let alive = Arc::new(AtomicBool::new(true));
        let client = EngineClient {
            sender,
            alive: alive.clone(),
        };
        runtime.block_on(async {
            let timeout = Duration::from_millis(10);
            assert_eq!(
                client
                    .request(
                        "GET".into(),
                        "/runs/r".into(),
                        "Bearer token".into(),
                        vec![],
                        timeout
                    )
                    .await
                    .status,
                504
            );
            assert_eq!(
                client
                    .request(
                        "GET".into(),
                        "/runs/r".into(),
                        "Bearer token".into(),
                        vec![],
                        timeout
                    )
                    .await
                    .status,
                503
            );
            alive.store(false, Ordering::Release);
            assert_eq!(
                client
                    .request(
                        "GET".into(),
                        "/runs/r".into(),
                        "Bearer token".into(),
                        vec![],
                        timeout
                    )
                    .await
                    .status,
                503
            );
        });
    }

    #[test]
    fn host_cancels_retry_during_backoff_and_runs_unrelated_work() {
        struct Local;
        impl PayloadResolver for Local {
            fn resolve(&self, _: &PayloadRef) -> Result<Option<Vec<u8>>> {
                Ok(Some(Vec::new()))
            }
        }

        let directory = tempfile::tempdir().unwrap();
        let retry_calls = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let retry_calls_for_activity = retry_calls.clone();
        let (run_sender, run_receiver) = mpsc::channel();
        let mut engine = Engine::open(directory.path().join("engine.db")).unwrap();
        engine
            .set_retry_policy(RetryPolicy::new(3, 5_000, 300, 300).unwrap())
            .unwrap();
        engine
            .register_workflow("one", "v1", |context| {
                context.activity("lookup", "v1", context.input().clone(), EffectPolicy::Read)
            })
            .unwrap();
        engine
            .register_activity_fn("lookup", "v1", move |attempt, _| {
                run_sender.send(attempt.run_id.clone()).unwrap();
                if attempt.run_id == "retry" {
                    retry_calls_for_activity.fetch_add(1, Ordering::SeqCst);
                    Err(ActivityFailure::Retryable)
                } else {
                    Ok(PayloadRef::durable("other-result").unwrap())
                }
            })
            .unwrap();
        let host = EngineHost::spawn(
            HttpAdapter::new(engine, "test-token-is-at-least-thirty-two-bytes").unwrap(),
            Arc::new(Local),
        )
        .unwrap();
        let client = host.client();
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let auth = "Bearer test-token-is-at-least-thirty-two-bytes".to_string();
        let start = |id: &str| {
            runtime.block_on(client.request(
                "POST".into(),
                "/runs".into(),
                auth.clone(),
                format!(
                    "{{\"id\":\"{id}\",\"workflow\":\"one\",\"version\":\"v1\",\"input\":{{\"key\":\"input\",\"ephemeral\":false}}}}"
                )
                .into_bytes(),
                Duration::from_secs(1),
            ))
        };

        assert_eq!(start("retry").status, 201);
        assert_eq!(
            run_receiver.recv_timeout(Duration::from_secs(1)).unwrap(),
            "retry"
        );
        assert_eq!(
            runtime
                .block_on(client.request(
                    "POST".into(),
                    "/runs/retry/cancel".into(),
                    auth.clone(),
                    Vec::new(),
                    Duration::from_secs(1),
                ))
                .status,
            202
        );
        assert_eq!(start("other").status, 201);
        assert_eq!(
            run_receiver.recv_timeout(Duration::from_secs(1)).unwrap(),
            "other"
        );
        thread::sleep(Duration::from_millis(350));
        assert_eq!(retry_calls.load(Ordering::SeqCst), 1);
        let status = runtime.block_on(client.request(
            "GET".into(),
            "/runs/retry".into(),
            auth,
            Vec::new(),
            Duration::from_secs(1),
        ));
        assert_eq!(status.status, 200);
        assert!(String::from_utf8(status.body)
            .unwrap()
            .contains("Cancelled"));
        host.shutdown().unwrap();
    }
}
