use crate::*;
use appcall_connectors::{Operation, OperationKind, Registry};
use appcall_runner_client::{RequestContext, RunnerClient, SyncListRequest};
use appcall_store::{AuthType, Connection, Scope, Status, Store};
use serde_json::{json, Map};
use std::{
    future::Future,
    sync::{Arc, Mutex},
    time::UNIX_EPOCH,
};
/// Credential bytes and the exact connection row selected or activated with them.
/// Resolvers must return both from the same fenced lifecycle transaction.
pub struct ResolvedCredentials {
    pub connection: Connection,
    pub fields: Map<String, Value>,
}
/// Resolve afresh for every page. Implementations must use only trusted stored credentials.
pub trait CredentialResolver: Send + Sync {
    fn is_idle(&self) -> bool {
        true
    }
    fn database_health(&self) -> Option<bool> {
        Some(true)
    }
    fn resolve(
        &self,
        connection: Connection,
    ) -> impl Future<Output = Result<ResolvedCredentials>> + Send;
}
pub struct Service<C> {
    repository: Arc<Mutex<Repository>>,
    connections: Arc<Mutex<Store>>,
    pub(crate) registry: Registry,
    runner: RunnerClient,
    credentials: C,
    pub(crate) config: Config,
}

/// Inputs for one fenced runner sync call.
pub(crate) struct SyncCall<'a> {
    pub(crate) project_id: &'a str,
    pub(crate) connection_id: &'a str,
    pub(crate) connection_generation: i64,
    pub(crate) operation: &'a str,
    pub(crate) input: &'a Value,
    pub(crate) cursor: &'a str,
    pub(crate) leased_until: Option<SystemTime>,
    pub(crate) request_id: String,
}

fn claim_policy(config: &Config) -> Value {
    json!({
        "source": "service_config",
        "maxAttempts": config.max_attempts,
        "leaseDurationMs": config.lease_duration.as_millis() as u64,
        "retryBaseMs": config.retry_base.as_millis().to_string(),
        "maxRetryDelayMs": config.max_retry_delay.as_millis() as u64,
    })
}

impl<C: CredentialResolver> Service<C> {
    /// Detached blocking adapters must finish before an owning generation drops.
    pub fn is_idle(&self) -> bool {
        Arc::strong_count(&self.repository) == 1
            && Arc::strong_count(&self.connections) == 1
            && self.credentials.is_idle()
    }
    pub fn database_health(&self) -> Option<bool> {
        let repository = match self.repository.try_lock() {
            Ok(repository) => repository.database_health(),
            Err(std::sync::TryLockError::WouldBlock) => None,
            Err(std::sync::TryLockError::Poisoned(_)) => Some(false),
        };
        let connections = match self.connections.try_lock() {
            Ok(store) => store.database_health(),
            Err(std::sync::TryLockError::WouldBlock) => None,
            Err(std::sync::TryLockError::Poisoned(_)) => Some(false),
        };
        let states = [repository, connections, self.credentials.database_health()];
        if states.contains(&Some(false)) {
            Some(false)
        } else if states.contains(&None) {
            None
        } else {
            Some(true)
        }
    }
    pub fn new(
        repository: Repository,
        connections: Store,
        registry: Registry,
        runner: RunnerClient,
        credentials: C,
        config: Config,
    ) -> Result<Self> {
        if config.lease_duration < Duration::from_millis(10)
            || config.lease_duration > Duration::from_secs(3600)
            || config.max_attempts == 0
            || config.max_attempts > i32::MAX as u32
            || config.retry_base.is_zero()
            || config.max_retry_delay.is_zero()
            || config.max_retry_delay > Duration::from_secs(86400)
        {
            return Err(Error::InvalidInput);
        }
        Ok(Self {
            repository: Arc::new(Mutex::new(repository)),
            connections: Arc::new(Mutex::new(connections)),
            registry,
            runner,
            credentials,
            config,
        })
    }
    pub(crate) async fn db<T: Send + 'static>(
        &self,
        f: impl FnOnce(&mut Repository) -> Result<T> + Send + 'static,
    ) -> Result<T> {
        let db = self.repository.clone();
        tokio::task::spawn_blocking(move || f(&mut *db.lock().map_err(|_| Error::Storage)?))
            .await
            .map_err(|_| Error::Storage)?
    }
    pub async fn schedule(&self, request: ScheduleRequest) -> Result<Job> {
        self.db(move |r| r.enqueue(&request)).await
    }
    pub async fn claim(&self, worker: &str) -> Result<Option<Job>> {
        let worker = worker.to_owned();
        let lease = self.config.lease_duration;
        let policy = claim_policy(&self.config);
        self.db(move |r| r.claim_with_policy(&worker, lease, Some(&policy)))
            .await
    }
    async fn current_generation(&self, project_id: &str, connection_id: &str) -> Result<i64> {
        let project_id = project_id.to_owned();
        let connection_id = connection_id.to_owned();
        self.db(move |repository| repository.connection_generation(&project_id, &connection_id))
            .await
    }
    async fn cancel_stale(&self, job: &Job) -> Result<()> {
        let job = job.clone();
        self.db(move |repository| match repository.cancel_stale(&job) {
            Ok(()) | Err(Error::LeaseLost) => Ok(()),
            Err(error) => Err(error),
        })
        .await
    }
    /// One durable page per claim. Progress does not spend a failure attempt.
    pub async fn process(&self, job: Job) -> Result<()> {
        let claim = job.clone();
        let cursor = match self.db(move |r| r.cursor(&claim)).await {
            Err(Error::StaleGeneration) => {
                self.cancel_stale(&job).await?;
                return Err(Error::StaleGeneration);
            }
            result => result?,
        };
        let outcome = self.fetch(&job, &cursor).await;
        let result = match outcome {
            Ok((page, connection)) => {
                let claim = job.clone();
                self.db(move |r| r.commit_page_for_connection(&claim, &cursor, &page, &connection))
                    .await
            }
            Err(e) => Err(e),
        };
        if let Err(cause) = result {
            if cause == Error::StaleGeneration {
                self.cancel_stale(&job).await?;
                return Err(cause);
            }
            if cause == Error::LeaseLost {
                return Err(cause);
            }
            let hint = match cause {
                Error::Runner {
                    retry_after_seconds,
                } => retry_after_seconds,
                _ => None,
            };
            let terminal = job.attempts.saturating_add(1) >= self.config.max_attempts
                || matches!(
                    cause,
                    Error::CursorCycle | Error::UnsupportedModel | Error::InvalidInput
                );
            let delay = self.config.retry_delay(job.attempts, hint);
            let failure = cause.clone();
            self.db(move |r| r.fail_with_error(&job, delay, terminal, Some(&failure)))
                .await?;
            return Err(cause);
        }
        Ok(())
    }
    async fn fetch(&self, j: &Job, cursor: &str) -> Result<(Page, Connection)> {
        validate_input(&j.input)?;
        let (output, connection) = self
            .call_sync(
                SyncCall {
                    project_id: &j.project_id,
                    connection_id: &j.connection_id,
                    connection_generation: j.connection_generation,
                    operation: &j.operation,
                    input: &j.input,
                    cursor,
                    leased_until: j.leased_until,
                    request_id: format!("sync_{}", j.id),
                },
                |connector, operation| {
                    operation.kind == OperationKind::Sync
                        && appcall_connectors::is_message_sync(connector, &j.operation)
                },
            )
            .await?;
        Page::decode(output).map(|page| (page, connection))
    }
    /// One lease-bounded runner sync call with freshly resolved credentials.
    /// `admit` decides whether the resolved connector/operation may run here.
    pub(crate) async fn call_sync(
        &self,
        call: SyncCall<'_>,
        admit: impl Fn(&str, &Operation) -> bool,
    ) -> Result<(Value, Connection)> {
        let expires = call.leased_until.ok_or(Error::LeaseLost)?;
        // Leave a small commit window; never let provider work outlive ownership.
        let deadline = expires
            .checked_sub(Duration::from_millis(5))
            .ok_or(Error::LeaseLost)?;
        if deadline <= SystemTime::now() {
            return Err(Error::LeaseLost);
        }
        if self
            .current_generation(call.project_id, call.connection_id)
            .await?
            != call.connection_generation
        {
            return Err(Error::StaleGeneration);
        }
        let connections = self.connections.clone();
        let project = call.project_id.to_owned();
        let id = call.connection_id.to_owned();
        let c = tokio::task::spawn_blocking(move || {
            connections
                .lock()
                .map_err(|_| Error::Storage)?
                .get(
                    &Scope::new(&project, None).map_err(|_| Error::InvalidInput)?,
                    &id,
                )
                .map_err(|_| Error::NotFound)
        })
        .await
        .map_err(|_| Error::Storage)??;
        if c.status != Status::Active || c.auth_type == AuthType::ExternalBearer {
            return Err(Error::Unavailable);
        }
        let operation = self
            .registry
            .operation(&c.connector, call.operation)
            .map_err(|_| Error::UnsupportedModel)?;
        if !admit(&c.connector, operation) {
            return Err(Error::UnsupportedModel);
        }
        let deadline = deadline.min(
            SystemTime::now()
                + Duration::from_millis(if operation.timeout_ms > 0 {
                    operation.timeout_ms as u64
                } else {
                    60000
                }),
        );
        let remaining = deadline
            .duration_since(SystemTime::now())
            .map_err(|_| Error::LeaseLost)?;
        let resolved = tokio::time::timeout(remaining, self.credentials.resolve(c.clone()))
            .await
            .map_err(|_| Error::Runner {
                retry_after_seconds: None,
            })??;
        if resolved.connection.id != c.id
            || resolved.connection.project_id != c.project_id
            || resolved.connection.connector != c.connector
            || resolved.connection.external_account_id != c.external_account_id
            || resolved.connection.credential_owner != c.credential_owner
            || resolved.connection.auth_type != c.auth_type
            || resolved.connection.status != Status::Active
        {
            return Err(Error::Unavailable);
        }
        let c = resolved.connection;
        if self
            .current_generation(call.project_id, call.connection_id)
            .await?
            != call.connection_generation
        {
            return Err(Error::StaleGeneration);
        }
        let mut input = call.input.as_object().ok_or(Error::InvalidInput)?.clone();
        input.extend(resolved.fields);
        input.remove("cursor");
        if !call.cursor.is_empty() {
            input.insert("cursor".into(), Value::String(call.cursor.into()));
        }
        let input = Value::Object(input);
        let input_size = serde_json::to_vec(&input)
            .map_err(|_| Error::InvalidInput)?
            .len();
        if input_size > 8 * 1024 * 1024
            || (operation.max_input_bytes > 0 && input_size > operation.max_input_bytes as usize)
        {
            return Err(Error::InvalidInput);
        }
        let response = self
            .runner
            .sync_list(
                &RequestContext {
                    request_id: call.request_id,
                    deadline_unix_ms: Some(
                        deadline
                            .duration_since(UNIX_EPOCH)
                            .map_err(|_| Error::LeaseLost)?
                            .as_millis() as u64,
                    ),
                },
                SyncListRequest {
                    connector_key: c.connector.clone(),
                    sync: call.operation.to_owned(),
                    input,
                },
            )
            .await
            .map_err(|e| Error::Runner {
                retry_after_seconds: e.retry_after_seconds,
            })?;
        if operation.max_response_bytes > 0
            && serde_json::to_vec(&response.output)
                .map_err(|_| Error::InvalidPage)?
                .len()
                > operation.max_response_bytes as usize
        {
            return Err(Error::InvalidPage);
        }
        Ok((response.output, c))
    }
}
