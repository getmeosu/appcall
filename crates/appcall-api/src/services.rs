use crate::*;
use appcall_actions::{
    ActionCatalog, ActionRepository, ActionRunner, CredentialResolver, PolicyGate,
};
use appcall_auth::{ApiKeyVerifier, Authenticator, Header, RequestContext};
use appcall_runner_client::RunnerClient;
use appcall_store::{CredentialOwner, Scope, Status, Store};
use std::sync::{Arc, Mutex};

pub trait Executor: Send + Sync {
    fn database_health(&self) -> Option<bool> {
        Some(true)
    }
    async fn execute_action(&self, request: ExecuteRequest) -> Result<ExecuteResult>;
}
impl<E: Executor> Executor for Arc<E> {
    fn database_health(&self) -> Option<bool> {
        (**self).database_health()
    }
    async fn execute_action(&self, request: ExecuteRequest) -> Result<ExecuteResult> {
        (**self).execute_action(request).await
    }
}
impl<
        R: ActionRepository,
        C: ActionCatalog,
        V: CredentialResolver,
        D: ActionRunner,
        P: PolicyGate,
    > Executor for appcall_actions::Service<R, C, V, D, P>
{
    fn database_health(&self) -> Option<bool> {
        appcall_actions::Service::database_health(self)
    }
    async fn execute_action(&self, request: ExecuteRequest) -> Result<ExecuteResult> {
        self.execute(request).await.map_err(ApiError::from)
    }
}

/// Host-owned services. Blocking PostgreSQL work has a bounded admission gate.
pub struct Services<K, E, C> {
    store: Arc<Mutex<Store>>,
    keys: Arc<K>,
    executor: E,
    credentials: C,
    runner: RunnerClient,
    admission: Arc<tokio::sync::Semaphore>,
    usage_defaults: data_routes::UsageDefaults,
}
impl<E: Executor, C> Services<appcall_auth::PostgresApiKeys, E, C> {
    pub fn database_health(&self) -> Option<bool> {
        let store = match self.store.try_lock() {
            Ok(store) => store.database_health(),
            Err(std::sync::TryLockError::WouldBlock) => None,
            Err(std::sync::TryLockError::Poisoned(_)) => Some(false),
        };
        crate::combined_database_health([
            store,
            self.keys.database_health(),
            self.executor.database_health(),
        ])
    }
}
impl<K, E, C> Services<K, E, C> {
    pub fn new(
        store: Store,
        keys: Arc<K>,
        executor: E,
        credentials: C,
        runner: RunnerClient,
    ) -> Self {
        Self {
            store: Arc::new(Mutex::new(store)),
            keys,
            executor,
            credentials,
            runner,
            admission: Arc::new(tokio::sync::Semaphore::new(16)),
            usage_defaults: data_routes::UsageDefaults::default(),
        }
    }
    pub fn with_usage_defaults(mut self, defaults: data_routes::UsageDefaults) -> Self {
        self.usage_defaults = defaults;
        self
    }
    async fn database<T: Send + 'static>(
        &self,
        f: impl FnOnce(&mut Store) -> std::result::Result<T, appcall_store::Error> + Send + 'static,
    ) -> Result<T> {
        let store = self.store.clone();
        bounded(&self.admission, move |cancelled| {
            let mut store = store
                .lock()
                .map_err(|_| ApiError::new("STORAGE_UNAVAILABLE"))?;
            if cancelled.load(std::sync::atomic::Ordering::Acquire) {
                return Err(ApiError::new("SERVICE_BUSY"));
            }
            // Session limits also cover transactions opened by Store methods.
            store
                .transaction(|tx| {
                    tx.client()
                        .batch_execute("SET statement_timeout='1s'; SET lock_timeout='250ms'")?;
                    Ok(())
                })
                .map_err(store_error)?;
            if cancelled.load(std::sync::atomic::Ordering::Acquire) {
                return Err(ApiError::new("SERVICE_BUSY"));
            }
            f(&mut store).map_err(store_error)
        })
        .await
    }
}
impl<K: ApiKeyVerifier + 'static, E: Executor, C: CredentialResolver> Backend
    for Services<K, E, C>
{
    async fn authorize(&self, headers: &[(String, String)]) -> Result<Identity> {
        let keys = self.keys.clone();
        let headers = headers.to_vec();
        bounded(&self.admission, move |_| {
            let headers = headers
                .iter()
                .map(|(k, v)| Header::new(k, v))
                .collect::<Vec<_>>();
            let principal = Authenticator::production(Some(&*keys), None, None)
                .and_then(|auth| auth.authorize(&headers, &RequestContext::default()))
                .map_err(crate::authentication_error)?;
            if principal.scopes != appcall_auth::Grant::All {
                return Err(ApiError::new("UNAUTHORIZED"));
            }
            Ok(Identity {
                project_id: principal.project_id,
                account_id: principal.brand_id.unwrap_or_default(),
                admin_scope: false,
            })
        })
        .await
    }
    async fn ready(&self) -> Result<()> {
        self.database(|s| {
            s.transaction(|tx| {
                tx.client().simple_query("SELECT 1")?;
                Ok(())
            })
        })
        .await
    }
    async fn connections(&self, i: &Identity) -> Result<Vec<Connection>> {
        let scope = scope(i)?;
        let project = i.project_id.clone();
        self.database(move |s| {
            // Match Go's project-wide, best-effort abandoned OAuth cleanup.
            // A failed cleanup rolls back independently and cannot break reads.
            let _ = s.transaction(|tx| {
                tx.client().execute("UPDATE connections SET status='disconnected',updated_at=now() WHERE project_id=$1 AND status='authorizing' AND created_at < now()-interval '30 minutes'", &[&project])?;
                Ok(())
            });
            s.list(&scope)
        }).await
    }
    async fn platform_connectors(&self, i: &Identity) -> Result<Vec<String>> {
        let scope = Scope::new(&i.project_id, None).map_err(store_error)?;
        self.database(move |s| {
            Ok(s.list(&scope)?
                .into_iter()
                .filter(|c| {
                    c.status == Status::Active && c.credential_owner == CredentialOwner::Platform
                })
                .map(|c| c.connector)
                .collect())
        })
        .await
    }
    async fn connection(&self, i: &Identity, id: &str) -> Result<Connection> {
        let scope = scope(i)?;
        let id = id.to_owned();
        self.database(move |s| s.get(&scope, &id)).await
    }
    async fn test_connection(&self, i: &Identity, id: &str) -> Result<Connection> {
        let connection = self.connection(i, id).await?;
        if !i.account_id.is_empty() && connection.external_account_id != i.account_id {
            return Err(ApiError::new("CONNECTION_NOT_FOUND"));
        }
        if connection.status == Status::Disconnected {
            return Err(ApiError::new("CONNECTION_DISCONNECTED"));
        }
        let action_connection = appcall_actions::Connection {
            id: connection.id.clone(),
            project_id: connection.project_id.clone(),
            external_account_id: connection.external_account_id.clone(),
            connector: connection.connector.clone(),
            status: connection.status.as_str().into(),
            auth_type: connection.auth_type.as_str().into(),
            secret_ref_id: (!connection.secret_ref_id.is_empty())
                .then(|| connection.secret_ref_id.clone()),
        };
        let resolved = self
            .credentials
            .resolve_health_tracked(&action_connection)
            .await;
        let (revision, result) = match resolved {
            Ok(resolved) => {
                let revision = resolved.connection;
                if revision.id != connection.id
                    || revision.project_id != connection.project_id
                    || revision.external_account_id != connection.external_account_id
                    || revision.connector != connection.connector
                    || revision.auth_type != connection.auth_type.as_str()
                    || revision.status == "disconnected"
                {
                    return Err(ApiError::new("CONNECTION_CHANGED"));
                }
                let context = appcall_runner_client::RequestContext {
                    request_id: format!("req_{}", uuid::Uuid::new_v4().simple()),
                    deadline_unix_ms: None,
                };
                let result = self
                    .runner
                    .healthcheck(
                        &context,
                        &connection.connector,
                        Value::Object(resolved.fields),
                    )
                    .await
                    .map_err(|_| ApiError::new("INTERNAL_ERROR"));
                (revision, result)
            }
            Err(_) => (action_connection, Err(ApiError::new("INTERNAL_ERROR"))),
        };
        // Go records reachability separately from verification. Failed RPCs
        // degrade the connection without overwriting prior verification evidence;
        // successful diagnostics never reactivate an already degraded row.
        let test_status = match &result {
            Ok(r) if r.status == "ok" && r.source == "provider" => {
                Some(appcall_store::TestStatus::Passed)
            }
            Ok(r) if r.status == "ok" => Some(appcall_store::TestStatus::Unknown),
            Ok(_) => Some(appcall_store::TestStatus::Failed),
            Err(_) => None,
        };
        let degraded = result.as_ref().is_err() || result.as_ref().is_ok_and(|r| r.status != "ok");
        let failure = result.err();
        let scope = scope(i)?;
        let checked = self
            .database(move |s| {
                s.transaction(|tx| {
                    let current = tx.lock_connection(&scope, &connection.id)?;
                    if current.secret_ref_id != revision.secret_ref_id.as_deref().unwrap_or("")
                        || current.connector != revision.connector
                        || current.auth_type.as_str() != revision.auth_type
                        || current.external_account_id != revision.external_account_id
                        || current.status.as_str() != revision.status
                    {
                        return Err(appcall_store::Error::Conflict);
                    }
                    let checked = match test_status {
                        Some(status) => tx.update_test_status(&scope, &connection.id, status)?,
                        None => current,
                    };
                    if degraded {
                        tx.update_status(&scope, &connection.id, Status::Degraded)
                    } else {
                        Ok(checked)
                    }
                })
            })
            .await?;
        match failure {
            Some(error) => Err(error),
            None => Ok(checked),
        }
    }
    async fn disconnect(&self, i: &Identity, id: &str) -> Result<()> {
        let scope = scope(i)?;
        let id = id.to_owned();
        self.database(move |s| {
            s.transaction(|tx| {
                tx.lock_connection(&scope, &id)?;
                tx.update_status(&scope, &id, Status::Disconnected)?;
                Ok(())
            })
        })
        .await
    }
    async fn auxiliary_route(
        &self,
        identity: &Identity,
        request: &Request,
    ) -> Result<Option<Response>> {
        let url = url::Url::parse(&format!("http://appcall.invalid{}", request.uri))
            .map_err(|_| ApiError::new("INVALID_REQUEST"))?;
        if request.method == "GET" {
            let path = url.path();
            if ![
                "/v1/action-logs",
                "/v1/replay-logs",
                "/v1/webhook-events",
                "/v1/requests/",
                "/v1/usage/monthly",
                "/v1/usage/action-calls/decision",
                "/v1/entitlements",
            ]
            .iter()
            .any(|prefix| {
                path == *prefix
                    || path
                        .strip_prefix(prefix)
                        .is_some_and(|rest| rest.starts_with('/') || prefix.ends_with('/'))
            }) {
                return Ok(None);
            }
            let identity = identity.clone();
            let defaults = self.usage_defaults.clone();
            return self
                .database(move |store| {
                    store.transaction(|tx| {
                        Ok((|| {
                            if let Some(response) = data_routes::read(tx.client(), &identity, &url)?
                            {
                                return Ok(Some(response));
                            }
                            data_routes::usage_read(tx.client(), &identity, &url, &defaults)
                        })())
                    })
                })
                .await?;
        }
        let parts: Vec<_> = url.path().trim_matches('/').split('/').collect();
        let target = match (request.method.as_str(), parts.as_slice()) {
            ("POST", ["v1", "replay-logs", id, "replay"]) => Some(((*id).to_owned(), false)),
            ("POST", ["v1", "requests", id, "replay"]) => Some(((*id).to_owned(), true)),
            _ => None,
        };
        let Some((id, by_request)) = target else {
            return Ok(None);
        };
        let id = percent_encoding::percent_decode_str(&id)
            .decode_utf8()
            .map_err(|_| ApiError::new("INVALID_REQUEST"))?
            .into_owned();
        let identity = identity.clone();
        let command = self
            .database(move |store| {
                store.transaction(|tx| {
                    Ok(data_routes::prepare_replay(
                        tx.client(),
                        &identity,
                        &id,
                        by_request,
                    ))
                })
            })
            .await??;
        let result = match self.execute(command.execute).await {
            Ok(result) => result,
            Err(error) => {
                let (code, message) = match error.code {
                    "CONNECTOR_RATE_LIMITED" => (
                        "CONNECTOR_RATE_LIMITED",
                        "The upstream provider rate limited this request.",
                    ),
                    "CONNECTOR_UNAVAILABLE" => (
                        "CONNECTOR_UNAVAILABLE",
                        "The upstream provider is unavailable.",
                    ),
                    _ => ("CONNECTOR_FAILED", "The connector request failed."),
                };
                return Ok(Some(Response {
                    status: 502,
                    headers: vec![],
                    body: serde_json::json!({"error":{"code":code,"message":message,"requestId":command.request_id,"replayLogId":command.log_id}}),
                }));
            }
        };
        Ok(Some(Response {
            status: 200,
            body: serde_json::json!({"requestId":command.request_id,"replayLogId":command.log_id,"output":result.output}),
            headers: vec![],
        }))
    }
    async fn execute(&self, request: ExecuteRequest) -> Result<ExecuteResult> {
        self.executor.execute_action(request).await
    }
}
fn scope(i: &Identity) -> Result<Scope> {
    Scope::new(&i.project_id, Some(&i.account_id)).map_err(store_error)
}
fn store_error(e: appcall_store::Error) -> ApiError {
    ApiError::new(match e {
        appcall_store::Error::NotFound => "CONNECTION_NOT_FOUND",
        appcall_store::Error::Conflict => "CONNECTION_CHANGED",
        appcall_store::Error::Invalid => "INVALID_REQUEST",
        _ => "STORAGE_UNAVAILABLE",
    })
}

// Timed-out/cancelled requests retain physical admission until their worker exits.
// A queued database mutation checks cancellation again after acquiring the mutex.
struct CancelOnDrop(Arc<std::sync::atomic::AtomicBool>);
impl Drop for CancelOnDrop {
    fn drop(&mut self) {
        self.0.store(true, std::sync::atomic::Ordering::Release);
    }
}
async fn bounded<T: Send + 'static>(
    admission: &Arc<tokio::sync::Semaphore>,
    f: impl FnOnce(Arc<std::sync::atomic::AtomicBool>) -> Result<T> + Send + 'static,
) -> Result<T> {
    let permit = admission
        .clone()
        .try_acquire_owned()
        .map_err(|_| ApiError::new("SERVICE_BUSY"))?;
    let cancelled = Arc::new(std::sync::atomic::AtomicBool::new(false));
    let _guard = CancelOnDrop(cancelled.clone());
    let task = tokio::task::spawn_blocking(move || {
        let _permit = permit;
        if cancelled.load(std::sync::atomic::Ordering::Acquire) {
            return Err(ApiError::new("SERVICE_BUSY"));
        }
        f(cancelled)
    });
    tokio::time::timeout(std::time::Duration::from_secs(2), task)
        .await
        .map_err(|_| ApiError::new("SERVICE_BUSY"))?
        .map_err(|_| ApiError::new("STORAGE_UNAVAILABLE"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn cancelled_blocking_call_retains_physical_admission_until_exit() {
        let admission = Arc::new(tokio::sync::Semaphore::new(1));
        let gate = Arc::new((Mutex::new(false), std::sync::Condvar::new()));
        let (started_tx, started_rx) = tokio::sync::oneshot::channel();
        let (exited_tx, exited_rx) = tokio::sync::oneshot::channel();
        let worker_gate = gate.clone();
        let worker_admission = admission.clone();
        let task = tokio::spawn(async move {
            bounded(&worker_admission, move |_| {
                let _ = started_tx.send(());
                let (lock, wake) = &*worker_gate;
                let mut released = lock.lock().unwrap();
                while !*released {
                    released = wake.wait(released).unwrap();
                }
                let _ = exited_tx.send(());
                Ok(())
            })
            .await
        });
        started_rx.await.unwrap();
        task.abort();
        assert!(task.await.is_err());
        assert_eq!(
            bounded(&admission, |_| Ok(())).await.unwrap_err().code,
            "SERVICE_BUSY"
        );
        *gate.0.lock().unwrap() = true;
        gate.1.notify_all();
        exited_rx.await.unwrap();
        let returned = tokio::time::timeout(std::time::Duration::from_secs(1), admission.acquire())
            .await
            .unwrap()
            .unwrap();
        drop(returned);
        assert!(bounded(&admission, |_| Ok(())).await.is_ok());
    }
}
