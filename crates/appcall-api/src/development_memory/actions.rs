use appcall_actions::{ActionRunner, Attempt, RunnerFailure};
use appcall_runner_client::RunnerClient;
use serde_json::{json, Map, Value};

#[derive(Clone)]
pub struct DevelopmentRunner(Option<RunnerClient>);
impl DevelopmentRunner {
    pub fn new(runner: Option<RunnerClient>) -> Self {
        Self(runner)
    }
}
impl ActionRunner for DevelopmentRunner {
    async fn execute(
        &self,
        attempt: &Attempt,
        input: Value,
        deadline: u64,
    ) -> Result<Value, RunnerFailure> {
        match &self.0 {
            Some(runner) => ActionRunner::execute(runner, attempt, input, deadline).await,
            None => {
                Ok(json!({"connector":attempt.connector,"action":attempt.action,"mode":"local"}))
            }
        }
    }
}
pub(super) fn caller_fields(caller: &str) -> appcall_actions::Result<Map<String, Value>> {
    let token = caller.trim();
    if token.is_empty() || token.len() > 64 * 1024 || token.chars().any(char::is_control) {
        return Err(appcall_actions::ActionError::new("MISSING_CREDENTIAL"));
    }
    Ok(json!({"accessToken":token})
        .as_object()
        .expect("object")
        .clone())
}

#[cfg(test)]
pub(super) fn stored_credentials(
    repository: &super::MemoryRepository,
    expected: &appcall_actions::Connection,
    caller: &str,
    health: bool,
) -> appcall_actions::Result<appcall_actions::ResolvedActionCredentials> {
    stored_credentials_versioned(repository, expected, caller, health, None)
        .map(|(resolved, _)| resolved)
}
fn stored_credentials_versioned(
    repository: &super::MemoryRepository,
    expected: &appcall_actions::Connection,
    caller: &str,
    health: bool,
    attempt: Option<&appcall_actions::Attempt>,
) -> appcall_actions::Result<(appcall_actions::ResolvedActionCredentials, u64)> {
    use appcall_actions::{ActionError, ResolvedActionCredentials};
    let (revision, secret) = match attempt {
        Some(attempt) => repository.secret_for_attempt(attempt, expected),
        None => repository.secret_for_connection_versioned(expected),
    }
    .map_err(|_| ActionError::new("CONNECTION_CHANGED"))?;
    if !health && expected.status != "active" {
        return Err(ActionError::new("CONNECTION_DISCONNECTED"));
    }
    let fields = if expected.auth_type == "external_bearer" {
        if health {
            Map::new()
        } else {
            caller_fields(caller)?
        }
    } else if let Some((kind, secret)) = secret {
        if !matches!(kind.as_str(), "api_key" | "connector_setup_bundle") {
            return Err(ActionError::new("MISSING_CREDENTIAL"));
        }
        let fields: Map<String, Value> = serde_json::from_slice(secret.as_bytes())
            .map_err(|_| ActionError::new("MISSING_CREDENTIAL"))?;
        if fields.values().any(|v| !v.is_string()) {
            return Err(ActionError::new("MISSING_CREDENTIAL"));
        }
        fields
    } else {
        Map::new()
    };
    Ok((
        ResolvedActionCredentials {
            connection: expected.clone(),
            fields,
        },
        revision,
    ))
}

use super::{DevelopmentPolicy, MemoryOAuth, MemoryRepository};
use appcall_actions::{ActionError, Connection, CredentialResolver, ResolvedActionCredentials};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::time::Duration;
#[derive(Clone)]
pub struct MemoryCredentials {
    repository: MemoryRepository,
    oauth: Arc<MemoryOAuth>,
    permits: Arc<tokio::sync::Semaphore>,
}
impl MemoryCredentials {
    pub fn new(repository: MemoryRepository, oauth: Arc<MemoryOAuth>) -> Self {
        let concurrency = repository.limits().concurrent_effects;
        Self {
            repository,
            oauth,
            permits: Arc::new(tokio::sync::Semaphore::new(concurrency)),
        }
    }
    async fn tracked(
        &self,
        expected: &Connection,
        caller: &str,
        health: bool,
        attempt: Option<Attempt>,
    ) -> appcall_actions::Result<ResolvedActionCredentials> {
        let permit =
            tokio::time::timeout(Duration::from_secs(2), self.permits.clone().acquire_owned())
                .await
                .map_err(|_| ActionError::new("CONNECTOR_UNAVAILABLE"))?
                .map_err(|_| ActionError::new("CONNECTOR_UNAVAILABLE"))?;
        let cancelled = Arc::new(AtomicBool::new(false));
        let _guard = CancelResolution(cancelled.clone());
        let repository = self.repository.clone();
        let oauth = self.oauth.clone();
        let expected = expected.clone();
        let caller = zeroize::Zeroizing::new(caller.to_owned());
        let job = tokio::task::spawn_blocking(move || {
            let _permit = permit;
            let active = || !cancelled.load(Ordering::Acquire);
            if !active() {
                return Err(ActionError::new("ACTION_TIMEOUT"));
            }
            let (resolved, revision) = if expected.auth_type == "oauth2" {
                let (connection, revision, fields) = if health {
                    oauth.resolve_health_tracked_versioned(&expected, &active)
                } else if let Some(attempt) = &attempt {
                    oauth.resolve_tracked_for_attempt(attempt, &expected, &active)
                } else {
                    oauth.resolve_tracked_versioned(&expected, &active)
                }
                .map_err(|_| ActionError::new("MISSING_CREDENTIAL"))?;
                (
                    ResolvedActionCredentials {
                        connection: super::action_connection(&connection),
                        fields: fields
                            .fields()
                            .iter()
                            .map(|(k, v)| (k.clone(), Value::String(v.clone())))
                            .collect(),
                    },
                    revision,
                )
            } else {
                stored_credentials_versioned(
                    &repository,
                    &expected,
                    &caller,
                    health,
                    attempt.as_ref(),
                )?
            };
            if !active() {
                return Err(ActionError::new("ACTION_TIMEOUT"));
            }
            if let Some(attempt) = &attempt {
                repository.bind_resolved_revision(attempt, &resolved.connection, revision)?;
            }
            Ok(resolved)
        });
        tokio::time::timeout(Duration::from_secs(25), job)
            .await
            .map_err(|_| ActionError::new("ACTION_TIMEOUT"))?
            .map_err(|_| ActionError::new("CONNECTOR_UNAVAILABLE"))?
    }
}
struct CancelResolution(Arc<AtomicBool>);
impl Drop for CancelResolution {
    fn drop(&mut self) {
        self.0.store(true, Ordering::Release);
    }
}
impl CredentialResolver for MemoryCredentials {
    async fn resolve_for_attempt(
        &self,
        attempt: &Attempt,
        c: &Connection,
        caller: &str,
    ) -> appcall_actions::Result<ResolvedActionCredentials> {
        self.tracked(c, caller, false, Some(attempt.clone())).await
    }
    async fn resolve(
        &self,
        c: &Connection,
        caller: &str,
    ) -> appcall_actions::Result<Map<String, Value>> {
        Ok(self.tracked(c, caller, false, None).await?.fields)
    }
    async fn resolve_tracked(
        &self,
        c: &Connection,
        caller: &str,
    ) -> appcall_actions::Result<ResolvedActionCredentials> {
        self.tracked(c, caller, false, None).await
    }
    async fn resolve_health_tracked(
        &self,
        c: &Connection,
    ) -> appcall_actions::Result<ResolvedActionCredentials> {
        self.tracked(c, "", true, None).await
    }
}
pub type MemoryActions = appcall_actions::Service<
    MemoryRepository,
    appcall_connectors::Registry,
    MemoryCredentials,
    DevelopmentRunner,
    DevelopmentPolicy,
>;
pub fn memory_actions(
    repository: MemoryRepository,
    runner: Option<RunnerClient>,
    config: appcall_actions::PolicyConfig,
    oauth: Arc<MemoryOAuth>,
) -> appcall_actions::Result<Arc<MemoryActions>> {
    let policy = DevelopmentPolicy::new(repository.clone(), config)?;
    let credentials = MemoryCredentials::new(repository.clone(), oauth);
    Ok(Arc::new(appcall_actions::Service::new(
        repository.clone(),
        (**repository.registry()).clone(),
        credentials,
        DevelopmentRunner::new(runner),
        policy,
    )))
}
