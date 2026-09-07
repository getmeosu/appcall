//! Process-local application state. No record or encryption key survives restart.
use appcall_connectors::Registry;
use appcall_store::{Connection, Envelope, LocalProvider};
use chrono::{DateTime, Utc};
use serde_json::Value;
use std::{
    collections::BTreeMap,
    sync::{Arc, Mutex},
    time::Instant,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MemoryError {
    Invalid,
    Forbidden,
    NotFound,
    Conflict,
    Capacity,
    Unavailable,
}
impl std::fmt::Display for MemoryError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "development memory {:?}", self)
    }
}
impl std::error::Error for MemoryError {}
pub type Result<T> = std::result::Result<T, MemoryError>;

/// Held by the physical provider invocation, including after its caller cancels.
pub(crate) struct EffectGuard {
    state: Arc<MemoryState>,
}
impl EffectGuard {
    pub(crate) fn acquire(state: Arc<MemoryState>, active: &dyn Fn() -> bool) -> Result<Self> {
        {
            let mut data = state.data.lock().map_err(|_| MemoryError::Unavailable)?;
            if !active() {
                return Err(MemoryError::Unavailable);
            }
            if data.active_effects >= state.limits.concurrent_effects {
                return Err(MemoryError::Capacity);
            }
            data.active_effects += 1;
        }
        Ok(Self { state })
    }
}
impl Drop for EffectGuard {
    fn drop(&mut self) {
        // A poisoned state remains unavailable, but this physical slot still ends.
        let mut data = self
            .state
            .data
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        data.active_effects -= 1;
    }
}

/// An absent database is a configuration choice; an invalid configured URL is not.
/// Its private field prevents constructing this permit without checking that choice.
pub struct DevelopmentPermit {
    _private: (),
}
impl DevelopmentPermit {
    pub fn validate(production: bool, database_url: Option<&str>) -> Result<Self> {
        if production || database_url.is_some_and(|url| !url.is_empty()) {
            return Err(MemoryError::Forbidden);
        }
        Ok(Self { _private: () })
    }
}
#[derive(Clone, Copy, Debug)]
pub struct MemoryLimits {
    pub payload_bytes: usize,
    pub connections: usize,
    pub oauth_states: usize,
    pub histories: usize,
    pub concurrent_effects: usize,
}
impl Default for MemoryLimits {
    fn default() -> Self {
        Self {
            payload_bytes: 64 * 1024 * 1024,
            connections: 1000,
            oauth_states: 1024,
            histories: 10000,
            concurrent_effects: 16,
        }
    }
}
impl MemoryLimits {
    pub(crate) fn validate(self) -> Result<Self> {
        let max = Self::default();
        if self.payload_bytes == 0
            || self.payload_bytes > max.payload_bytes
            || self.connections == 0
            || self.connections > max.connections
            || self.oauth_states == 0
            || self.oauth_states > max.oauth_states
            || self.histories == 0
            || self.histories > max.histories
            || self.concurrent_effects == 0
            || self.concurrent_effects > max.concurrent_effects
        {
            return Err(MemoryError::Invalid);
        }
        Ok(self)
    }
}
/// Ciphertext only. Authorization must precede vault access; envelopes carry no scope.
pub(crate) struct OwnedEnvelope {
    pub project_id: String,
    pub connection_id: String,
    pub kind: String,
    pub envelope: Envelope,
    pub bytes: usize,
}
#[derive(Clone, Debug)]
pub struct MemoryProject {
    pub id: String,
    pub disabled: bool,
    pub plan: String,
}
#[derive(Clone)]
pub struct ActionLog {
    pub attempt: appcall_actions::Attempt,
    pub status: String,
    pub error_code: String,
    pub created_at: DateTime<Utc>,
}
#[derive(Clone)]
pub struct ReplayLog {
    pub id: String,
    pub attempt: appcall_actions::Attempt,
    pub sanitized_input: Value,
    pub created_at: DateTime<Utc>,
}
#[derive(Clone, Debug)]
pub struct UsageEvent {
    pub id: String,
    pub project_id: String,
    pub connection_id: String,
    pub external_account_id: String,
    pub connector: String,
    pub action: String,
    pub kind: String,
    pub quantity: i64,
    pub occurred_at: DateTime<Utc>,
}
/// Pending verifier and tokens are referenced by encrypted vault IDs, never plaintext.
pub struct OAuthPending {
    pub project_id: String,
    pub connection_id: String,
    pub connector: String,
    pub revision: u64,
    pub secret_ref: String,
    pub redirect_uri: String,
    pub expires_at: DateTime<Utc>,
    pub consumed: bool,
    pub dispatched: bool,
    pub reserved_bytes: usize,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum ClaimPhase {
    Pending,
    Dispatched,
    Completed,
    OutcomeUnknown,
}
pub(crate) struct UsageReservation {
    pub project: String,
    pub brand: String,
    pub month: String,
}
pub(crate) struct ActionClaim {
    pub attempt: appcall_actions::Attempt,
    pub phase: ClaimPhase,
    pub expires_at: Instant,
    pub output: Option<Value>,
    pub revision: u64,
    pub reserved_bytes: usize,
    pub reserved_histories: usize,
    pub retained_bytes: usize,
}
/// This is a shared mutex, not a SQL emulation. Never hold it over provider I/O.
/// Domain adapters must check capacity and all fallible validation before mutation.
#[derive(Default)]
pub(crate) struct MemoryData {
    pub projects: BTreeMap<String, MemoryProject>,
    pub connections: BTreeMap<String, Connection>,
    pub connection_revision: BTreeMap<String, u64>,
    pub secrets: BTreeMap<String, OwnedEnvelope>,
    pub action_claims: BTreeMap<(String, String), ActionClaim>,
    pub action_logs: BTreeMap<String, ActionLog>,
    pub replay_logs: BTreeMap<String, ReplayLog>,
    pub usage_events: BTreeMap<String, UsageEvent>,
    pub usage_monthly: BTreeMap<(String, String, String, String), i64>,
    pub usage_reserved: BTreeMap<String, UsageReservation>,
    pub action_limits: appcall_actions::Entitlements,
    pub events: BTreeMap<(String, String), appcall_events::Event>,
    pub oauth_pending: BTreeMap<String, OAuthPending>,
    pub next_sequence: i64,
    pub bytes_used: usize,
    pub bytes_reserved: usize,
    pub histories_reserved: usize,
    /// Storage-admitted actions that have not crossed their provider boundary.
    pub pending_actions: usize,
    /// Shared action/OAuth effects; unknown abandoned dispatches keep their slot.
    pub active_effects: usize,
}
impl MemoryData {
    pub fn history_count(&self) -> usize {
        self.action_claims.len()
            + self.action_logs.len()
            + self.replay_logs.len()
            + self.usage_events.len()
            + self.events.len()
    }
    pub fn check_capacity(
        &self,
        limits: MemoryLimits,
        bytes: usize,
        histories: usize,
    ) -> Result<()> {
        let total = self
            .bytes_used
            .checked_add(self.bytes_reserved)
            .and_then(|n| n.checked_add(bytes))
            .ok_or(MemoryError::Capacity)?;
        let count = self
            .history_count()
            .checked_add(self.histories_reserved)
            .and_then(|n| n.checked_add(histories))
            .ok_or(MemoryError::Capacity)?;
        if total > limits.payload_bytes || count > limits.histories {
            return Err(MemoryError::Capacity);
        }
        Ok(())
    }
}
pub(crate) struct MemoryState {
    pub registry: Arc<Registry>,
    pub limits: MemoryLimits,
    pub vault: LocalProvider,
    pub data: Mutex<MemoryData>,
}
