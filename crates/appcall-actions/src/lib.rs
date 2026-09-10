//! Scoped action execution with durable dispatch fencing. Logs contain metadata only.
#![allow(async_fn_in_trait)]
mod adapters;
mod canonical;
mod circuit;
mod credentials;
mod evidence;
mod normalized;
pub use credentials::*;
mod policy;
mod policy_postgres;
pub use policy_postgres::*;
mod history;
mod postgres_store;
mod service;
pub use canonical::scoped_input_hash;
pub use circuit::*;
pub use history::sanitize_replay_input;
pub use policy::*;
pub use postgres_store::*;
pub use service::*;

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

/// RPC evidence, not a claim that the provider operation succeeded.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum ActionDispatchOutcome {
    NotDispatched,
    ResponseReceived,
    #[default]
    Unknown,
}
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum ActionFailureOrigin {
    #[default]
    Unknown,
    /// Rejection by an owned policy authorization, input preparation or reservation.
    LocalAdmission,
    LocalValidation,
    Runner,
}
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ActionFailureEvidence {
    pub outcome: ActionDispatchOutcome,
    pub origin: ActionFailureOrigin,
    /// Final failed runner attempt's supplied hint, never an internal backoff.
    pub retry_after_seconds: Option<u64>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ActionError {
    pub evidence: Box<ActionFailureEvidence>,
    pub code: String,
    pub request_id: String,
    pub usage: Option<UsageSnapshot>,
    pub detail: Option<Box<FailureDetail>>,
}
impl ActionError {
    pub fn new(code: &str) -> Self {
        Self {
            evidence: Box::default(),
            code: code.into(),
            request_id: String::new(),
            usage: None,
            detail: None,
        }
    }
}
impl ActionError {
    pub(crate) fn local_admission(mut self) -> Self {
        self.evidence = Box::new(ActionFailureEvidence {
            outcome: ActionDispatchOutcome::NotDispatched,
            origin: ActionFailureOrigin::LocalAdmission,
            retry_after_seconds: None,
        });
        self
    }
    pub(crate) fn local_validation(mut self) -> Self {
        self.evidence = Box::new(ActionFailureEvidence {
            outcome: ActionDispatchOutcome::NotDispatched,
            origin: ActionFailureOrigin::LocalValidation,
            retry_after_seconds: None,
        });
        self
    }
    pub fn with_detail(mut self, detail: Option<FailureDetail>) -> Self {
        self.detail = detail.map(Box::new);
        self
    }
    pub fn response_too_large(actual_bytes: usize, limit_bytes: usize) -> Self {
        Self::new("ACTION_RESPONSE_TOO_LARGE").with_detail(Some(FailureDetail {
            safe_message: None,
            response_size: Some(ResponseSize {
                actual_bytes,
                limit_bytes,
            }),
        }))
    }
}
/// Provider diagnostic already scrubbed at the runner boundary. Internal transport
/// errors must not be placed in safe_message. Byte counts describe a fully withheld output.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct FailureDetail {
    pub safe_message: Option<String>,
    pub response_size: Option<ResponseSize>,
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ResponseSize {
    pub actual_bytes: usize,
    pub limit_bytes: usize,
}
impl std::fmt::Display for ActionError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.code)
    }
}
impl std::error::Error for ActionError {}
pub type Result<T> = std::result::Result<T, ActionError>;

// Secrets deliberately have no Debug/Serialize implementation.
pub struct ExecuteRequest {
    pub project_id: String,
    pub connection_id: String,
    pub external_account_id: String,
    pub admin_scope: bool,
    pub action: String,
    pub idempotency_key: String,
    pub input: Value,
    pub caller_credential: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecuteResult {
    pub request_id: String,
    pub output: Value,
    pub replay_log_id: String,
    pub usage_warning: bool,
    #[serde(default)]
    pub usage: UsageSnapshot,
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Connection {
    pub id: String,
    pub project_id: String,
    pub external_account_id: String,
    pub connector: String,
    pub status: String,
    pub auth_type: String,
    pub secret_ref_id: Option<String>,
}
#[derive(Clone, Debug)]
pub struct Operation {
    pub read_only: bool,
    pub timeout_ms: u64,
    pub max_input_bytes: usize,
    pub max_response_bytes: usize,
    pub credential_fields: Vec<String>,
}
#[derive(Clone, Debug)]
pub struct Attempt {
    pub request_id: String,
    pub project_id: String,
    pub connection_id: String,
    pub connector: String,
    pub external_account_id: String,
    pub action: String,
    pub key: String,
    pub input_hash: String,
    pub lease_ms: i64,
}
#[derive(Clone, Debug)]
pub enum Acquisition {
    Acquired,
    Cached(Value),
}

pub trait ActionRepository: Send + Sync {
    fn database_health(&self) -> Option<bool> {
        Some(true)
    }
    async fn connection(&self, project: &str, id: &str) -> Result<Connection>;
    async fn acquire(&self, attempt: &Attempt) -> Result<Acquisition>;
    async fn mark_dispatched(&self, attempt: &Attempt) -> Result<()>;
    /// Storage adapters should atomically compare the credential revision with
    /// dispatch marking. The default supports repositories without transactions.
    async fn mark_dispatched_checked(
        &self,
        attempt: &Attempt,
        revision: &Connection,
    ) -> Result<()> {
        let current = self
            .connection(&attempt.project_id, &attempt.connection_id)
            .await?;
        if current != *revision || current.status != "active" {
            return Err(ActionError::new("CONNECTION_CHANGED"));
        }
        self.mark_dispatched(attempt).await
    }
    /// Atomically fences external dispatch and a policy reservation when the
    /// storage adapter supports both state transitions. Adapters without a
    /// durable quota reservation retain the legacy dispatch behavior.
    async fn mark_dispatched_checked_with_reservation(
        &self,
        attempt: &Attempt,
        revision: &Connection,
        reservation: &PolicyReservation,
    ) -> Result<()> {
        let _ = reservation;
        self.mark_dispatched_checked(attempt, revision).await
    }
    /// Reserve replay storage before the external effect. Bounded stores must
    /// reject insufficient capacity here, never after a successful provider call.
    async fn prepare_replay(&self, _: &Attempt, _: &Value) -> Result<()> {
        Ok(())
    }
    async fn record_replay(&self, attempt: &Attempt, sanitized_input: &Value) -> Result<String>;
    async fn release_pending(&self, attempt: &Attempt) -> Result<()>;
    /// Release a quota claim only when the caller has evidence that no
    /// provider effect was dispatched. Dispatched or ambiguous work must keep
    /// its reservation until a successful settlement or explicit recovery.
    async fn release_pending_with_reservation(
        &self,
        attempt: &Attempt,
        reservation: &PolicyReservation,
    ) -> Result<()> {
        let _ = reservation;
        self.release_pending(attempt).await
    }
    /// Release quota after a provider response proved that this invocation
    /// did not succeed, while retaining any dispatched idempotency claim so a
    /// mutation cannot be replayed speculatively.
    async fn release_quota_with_reservation(
        &self,
        attempt: &Attempt,
        reservation: &PolicyReservation,
    ) -> Result<()> {
        self.release_pending_with_reservation(attempt, reservation)
            .await
    }
    /// Release quota and clear the claim only when the runner proved that no
    /// provider request was dispatched.
    async fn release_not_dispatched_with_reservation(
        &self,
        attempt: &Attempt,
        reservation: &PolicyReservation,
    ) -> Result<()> {
        self.release_pending_with_reservation(attempt, reservation)
            .await
    }
    /// Record a failure after explicit no-dispatch evidence while clearing the
    /// claim and any dispatch reservations. Repositories with durable state
    /// should make the cleanup and failure log one fenced transition.
    async fn finish_not_dispatched_with_reservation(
        &self,
        attempt: &Attempt,
        reservation: &PolicyReservation,
        error_code: &str,
    ) -> Result<()> {
        self.release_not_dispatched_with_reservation(attempt, reservation)
            .await?;
        self.finish_with_reservation(attempt, reservation, None, Some(error_code))
            .await
    }
    async fn finish(
        &self,
        attempt: &Attempt,
        output: Option<&Value>,
        error_code: Option<&str>,
    ) -> Result<()>;
    /// Settle a policy reservation and finish the action in one transaction
    /// when supported by the repository. Legacy adapters keep their existing
    /// finish behavior.
    async fn finish_with_reservation(
        &self,
        attempt: &Attempt,
        reservation: &PolicyReservation,
        output: Option<&Value>,
        error_code: Option<&str>,
    ) -> Result<()> {
        let _ = reservation;
        self.finish(attempt, output, error_code).await
    }
}
/// Credential fields and the exact connection revision that supplied them.
/// No Debug/Serialize implementation: fields may contain live credentials.
pub struct ResolvedActionCredentials {
    pub connection: Connection,
    pub fields: Map<String, Value>,
}
pub trait CredentialResolver: Send + Sync {
    /// Stores with numeric revisions can bind the resolved provenance to the
    /// owning pending attempt before dispatch. Existing adapters retain behavior.
    async fn resolve_for_attempt(
        &self,
        _: &Attempt,
        connection: &Connection,
        caller_credential: &str,
    ) -> Result<ResolvedActionCredentials> {
        self.resolve_tracked(connection, caller_credential).await
    }
    fn database_health(&self) -> Option<bool> {
        Some(true)
    }
    /// Diagnostic resolution differs from action execution: external bearer
    /// connectors are probed without a caller token and cannot gain a fake pass.
    async fn resolve_health_tracked(
        &self,
        connection: &Connection,
    ) -> Result<ResolvedActionCredentials> {
        if connection.auth_type == "external_bearer" {
            return Ok(ResolvedActionCredentials {
                connection: connection.clone(),
                fields: Map::new(),
            });
        }
        self.resolve_tracked(connection, "").await
    }
    async fn resolve_tracked(
        &self,
        connection: &Connection,
        caller_credential: &str,
    ) -> Result<ResolvedActionCredentials> {
        Ok(ResolvedActionCredentials {
            connection: connection.clone(),
            fields: self.resolve(connection, caller_credential).await?,
        })
    }
    async fn resolve(
        &self,
        connection: &Connection,
        caller_credential: &str,
    ) -> Result<Map<String, Value>>;
}
pub trait ActionCatalog: Send + Sync {
    fn requires_credentials(&self, _: &str) -> Result<bool> {
        Ok(true)
    }
    fn operation(&self, connector: &str, action: &str) -> Result<Operation>;
    fn validate_input(&self, connector: &str, action: &str, input: &Value) -> Result<()>;
    fn validate_output(&self, connector: &str, action: &str, output: &Value) -> Result<()>;
}
#[derive(Clone, Debug, Default)]
pub struct RunnerFailure {
    pub outcome: ActionDispatchOutcome,
    pub retry_after_seconds: Option<u64>,
    pub code: String,
    pub transient: bool,
    pub retry_after_ms: u64,
    pub detail: Option<FailureDetail>,
}
pub trait ActionRunner: Send + Sync {
    async fn execute(
        &self,
        attempt: &Attempt,
        input: Value,
        deadline_unix_ms: u64,
    ) -> std::result::Result<Value, RunnerFailure>;
}
// Mandatory injection: unported entitlements, LinkedIn safety, spend/send caps,
// Apollo callbacks and Unipile subaccount routing must never silently become no-ops.
pub trait PolicyGate: Send + Sync {
    async fn prepare_input(
        &self,
        _: &ExecuteRequest,
        _: &Connection,
        input: Value,
    ) -> Result<Value> {
        Ok(input)
    }
    async fn reserve(
        &self,
        _: &ExecuteRequest,
        _: &Connection,
        _: &Operation,
        _: &Value,
    ) -> Result<PolicyReservation> {
        Ok(PolicyReservation::default())
    }
    async fn observe_failure(
        &self,
        _: &ExecuteRequest,
        _: &Connection,
        _: &PolicyReservation,
        _: &str,
    ) -> Result<()> {
        Ok(())
    }
    async fn authorize(
        &self,
        request: &ExecuteRequest,
        connection: &Connection,
        operation: &Operation,
    ) -> Result<()>;
}
pub struct ReadOnlyPolicy;
impl PolicyGate for ReadOnlyPolicy {
    async fn authorize(&self, _: &ExecuteRequest, c: &Connection, o: &Operation) -> Result<()> {
        if !o.read_only || matches!(c.connector.as_str(), "unipile" | "linkedin" | "apollo") {
            Err(ActionError::new("POLICY_UNSUPPORTED"))
        } else {
            Ok(())
        }
    }
}

#[derive(Clone, Default, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageSnapshot {
    pub month: String,
    pub current: i64,
    pub projected: i64,
    pub soft_limit: i64,
    pub hard_limit: i64,
}
