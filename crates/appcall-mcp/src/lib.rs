//! Framework-neutral MCP gateway. The host supplies authenticated scope; actions
//! remain the single owner of credential injection, policy, metering and dispatch.
#![allow(async_fn_in_trait)]
mod adapters;
mod profile;
mod server;
mod session;
mod usage;
pub use adapters::*;
use appcall_actions::{ActionError, ExecuteRequest, ExecuteResult};
pub use profile::*;
pub use server::*;
pub use session::{auth_context_fingerprint, MAX_MCP_SESSION_ID_BYTES, MCP_SESSION_ID_HEADER};
use std::{
    collections::BTreeMap,
    sync::{Arc, Mutex},
};
use tokio::sync::Notify;
pub use usage::*;

pub const MAX_REQUEST_BYTES: usize = 1 << 20;
pub const PROTOCOL_VERSION: &str = "2025-06-18";
/// Construct only from authenticated HTTP context, never tool arguments.
/// Deliberately not Debug or Serialize because it carries a caller credential.
///
/// Keep this shape stable: callers may construct a `Scope` directly when using
/// the framework-neutral, non-session API. HTTP session state lives in
/// `McpRequestContext` instead of adding fields to this public struct.
#[derive(Clone, Default)]
pub struct Scope {
    pub project_id: String,
    pub account_id: String,
    pub profile: String,
    pub connector_token: String,
}
impl Scope {
    pub fn new(project: &str, account: &str) -> Self {
        Self {
            project_id: project.into(),
            account_id: account.into(),
            ..Self::default()
        }
    }
    pub fn with_profile(mut self, profile: &str) -> Self {
        self.profile = profile.into();
        self
    }
    pub fn with_connector_token(mut self, token: &str) -> Self {
        self.connector_token = token.into();
        self
    }
}

/// Per-request context supplied by an authenticated HTTP host.
///
/// The session ID is server-issued and visible-safe. The authentication
/// fingerprint is a non-secret digest of the headers that established the
/// identity; raw credentials are never retained here.
#[derive(Clone)]
pub struct McpRequestContext {
    session_id: Option<String>,
    auth_context_fingerprint: String,
    namespace_id: u64,
    session_admission: bool,
    durable_cancellation: bool,
}
impl Default for McpRequestContext {
    fn default() -> Self {
        Self::new()
    }
}
impl McpRequestContext {
    pub fn new() -> Self {
        Self {
            session_id: None,
            auth_context_fingerprint: String::new(),
            namespace_id: session::next_legacy_scope_id(),
            session_admission: true,
            durable_cancellation: true,
        }
    }
    /// Build the context used by a legacy direct HTTP call. It retains the
    /// cancellation reservation semantics but does not create an inaccessible
    /// server session for callers that only use `Scope`.
    pub(crate) fn legacy_http() -> Self {
        Self {
            session_admission: false,
            durable_cancellation: false,
            ..Self::new()
        }
    }
    pub fn from_headers(headers: &[(String, String)]) -> Self {
        let session_id = headers
            .iter()
            .find(|(name, _)| name.eq_ignore_ascii_case(MCP_SESSION_ID_HEADER))
            .map(|(_, value)| value.as_str());
        Self::new()
            .with_auth_context_fingerprint(&auth_context_fingerprint(headers))
            .with_session_header(session_id)
    }
    pub fn with_auth_context_fingerprint(mut self, fingerprint: &str) -> Self {
        self.auth_context_fingerprint = fingerprint.into();
        self
    }
    pub fn with_session_header(mut self, session_id: Option<&str>) -> Self {
        self.session_id = session_id.map(str::to_owned);
        self.session_admission = true;
        self.durable_cancellation = true;
        self
    }
    pub fn with_session_id(self, session_id: &str) -> Self {
        self.with_session_header(Some(session_id))
    }
    pub fn with_session(self, session_id: &str) -> Self {
        self.with_session_id(session_id)
    }
    pub fn session_id(&self) -> Option<&str> {
        self.session_id.as_deref()
    }
    pub(crate) fn auth_context_fingerprint(&self) -> &str {
        &self.auth_context_fingerprint
    }
    pub(crate) fn admits_sessions(&self) -> bool {
        self.session_admission
    }
    pub(crate) fn durable_cancellation(&self) -> bool {
        self.durable_cancellation
    }
}

#[derive(Clone, Eq, PartialEq, Ord, PartialOrd)]
struct ScopeKey {
    project_id: String,
    account_id: String,
    profile: String,
    session_id: String,
    legacy_scope_id: u64,
}
impl ScopeKey {
    fn from_scope(scope: &Scope, context: &McpRequestContext) -> Self {
        let session_id = context.session_id.clone().unwrap_or_default();
        Self {
            project_id: scope.project_id.clone(),
            account_id: scope.account_id.clone(),
            profile: scope.profile.clone(),
            session_id,
            legacy_scope_id: if context.session_id.is_some() {
                0
            } else if !context.admits_sessions() {
                session::legacy_scope_id(scope)
            } else {
                context.namespace_id
            },
        }
    }
}

#[derive(Clone, Eq, PartialEq, Ord, PartialOrd)]
struct RequestKey {
    scope: ScopeKey,
    request_id: String,
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum CancelPhase {
    BeforeDispatch,
    AfterDispatch,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum InFlightState {
    Pending,
    Dispatched,
    Cancelled(CancelPhase),
    Completed,
}

struct InFlightEntry {
    state: Mutex<InFlightEntryState>,
    notify: Notify,
}
struct InFlightEntryState {
    lifecycle: InFlightState,
    connection_id: Option<String>,
}
impl InFlightEntry {
    fn new(connection_id: Option<String>) -> Self {
        Self {
            state: Mutex::new(InFlightEntryState {
                lifecycle: InFlightState::Pending,
                connection_id,
            }),
            notify: Notify::new(),
        }
    }
    async fn wait_cancelled(&self) {
        loop {
            let notified = self.notify.notified();
            if self.is_cancelled() {
                return;
            }
            notified.await;
        }
    }
    fn is_cancelled(&self) -> bool {
        matches!(self.state_guard().lifecycle, InFlightState::Cancelled(_))
    }
    fn state_guard(&self) -> std::sync::MutexGuard<'_, InFlightEntryState> {
        self.state
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
    }
    fn set_connection(&self, connection_id: &str) -> bool {
        let mut state = self.state_guard();
        if state.lifecycle != InFlightState::Pending {
            return false;
        }
        state.connection_id = Some(connection_id.to_owned());
        true
    }
    fn begin_dispatch(&self) -> bool {
        let mut state = self.state_guard();
        if state.lifecycle != InFlightState::Pending {
            return false;
        }
        state.lifecycle = InFlightState::Dispatched;
        true
    }
    fn complete(&self) -> bool {
        let mut state = self.state_guard();
        if state.lifecycle != InFlightState::Dispatched {
            return false;
        }
        state.lifecycle = InFlightState::Completed;
        true
    }
    fn finish_execution(&self) -> bool {
        let mut state = self.state_guard();
        match state.lifecycle {
            InFlightState::Dispatched => {
                state.lifecycle = InFlightState::Completed;
                true
            }
            InFlightState::Cancelled(CancelPhase::AfterDispatch) => {
                state.lifecycle = InFlightState::Completed;
                false
            }
            _ => false,
        }
    }
    fn abort_execution(&self) -> bool {
        let mut state = self.state_guard();
        match state.lifecycle {
            InFlightState::Dispatched | InFlightState::Cancelled(CancelPhase::AfterDispatch) => {
                state.lifecycle = InFlightState::Completed;
                true
            }
            _ => false,
        }
    }
    fn can_cleanup_on_drop(&self) -> bool {
        matches!(
            self.state_guard().lifecycle,
            InFlightState::Pending | InFlightState::Cancelled(CancelPhase::BeforeDispatch)
        )
    }
    fn cancel(&self, requested_connection_id: Option<&str>) -> Option<CancelPhase> {
        let phase = {
            let mut state = self.state_guard();
            if requested_connection_id
                .is_some_and(|requested| state.connection_id.as_deref() != Some(requested))
            {
                return None;
            }
            let phase = match state.lifecycle {
                InFlightState::Pending => CancelPhase::BeforeDispatch,
                InFlightState::Dispatched => CancelPhase::AfterDispatch,
                InFlightState::Cancelled(phase) => return Some(phase),
                InFlightState::Completed => return None,
            };
            state.lifecycle = InFlightState::Cancelled(phase);
            phase
        };
        self.notify.notify_one();
        Some(phase)
    }
    fn cancellation_phase(&self) -> Option<CancelPhase> {
        match self.state_guard().lifecycle {
            InFlightState::Cancelled(phase) => Some(phase),
            _ => None,
        }
    }
}

pub(crate) struct InFlightRegistry {
    entries: Mutex<BTreeMap<RequestKey, Arc<InFlightEntry>>>,
    capacity: usize,
}
impl InFlightRegistry {
    fn new(capacity: usize) -> Self {
        Self {
            entries: Mutex::new(BTreeMap::new()),
            capacity,
        }
    }
    fn lock(&self) -> std::sync::MutexGuard<'_, BTreeMap<RequestKey, Arc<InFlightEntry>>> {
        self.entries
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
    }
    fn register(
        self: &Arc<Self>,
        scope: &Scope,
        context: &McpRequestContext,
        request_id: &str,
        connection_id: Option<String>,
    ) -> Result<InFlightRegistration, RegistrationError> {
        let key = RequestKey {
            scope: ScopeKey::from_scope(scope, context),
            request_id: request_id.to_owned(),
        };
        let mut entries = self.lock();
        if entries.contains_key(&key) {
            return Err(RegistrationError::Duplicate);
        }
        if entries.len() >= self.capacity {
            return Err(RegistrationError::Capacity);
        }
        let entry = Arc::new(InFlightEntry::new(connection_id));
        entries.insert(key.clone(), entry.clone());
        Ok(InFlightRegistration {
            registry: Arc::clone(self),
            key,
            entry,
        })
    }
    fn cancel(
        &self,
        scope: &Scope,
        context: &McpRequestContext,
        request_id: &str,
        connection_id: Option<&str>,
    ) -> Option<CancelPhase> {
        let key = RequestKey {
            scope: ScopeKey::from_scope(scope, context),
            request_id: request_id.to_owned(),
        };
        let entry = self.lock().get(&key).cloned()?;
        entry.cancel(connection_id)
    }
    fn remove_if_same(&self, key: &RequestKey, entry: &Arc<InFlightEntry>) {
        let mut entries = self.lock();
        if entries
            .get(key)
            .is_some_and(|current| Arc::ptr_eq(current, entry))
        {
            entries.remove(key);
        }
    }
    pub(crate) fn len(&self) -> usize {
        self.lock().len()
    }
}

pub(crate) enum RegistrationError {
    Capacity,
    Duplicate,
}

#[derive(Clone)]
pub(crate) struct InFlightRegistration {
    registry: Arc<InFlightRegistry>,
    key: RequestKey,
    entry: Arc<InFlightEntry>,
}
impl InFlightRegistration {
    pub(crate) async fn wait_cancelled(&self) {
        self.entry.wait_cancelled().await
    }
    pub(crate) fn set_connection(&self, connection_id: &str) -> bool {
        self.entry.set_connection(connection_id)
    }
    pub(crate) fn begin_dispatch(&self) -> bool {
        self.entry.begin_dispatch()
    }
    pub(crate) fn complete(&self) -> bool {
        let completed = self.entry.complete();
        if completed {
            self.registry.remove_if_same(&self.key, &self.entry);
        }
        completed
    }
    pub(crate) fn finish_execution(&self) -> bool {
        let accepted = self.entry.finish_execution();
        if matches!(self.entry.state_guard().lifecycle, InFlightState::Completed) {
            self.registry.remove_if_same(&self.key, &self.entry);
        }
        accepted
    }
    pub(crate) fn abort_execution(&self) {
        if self.entry.abort_execution() {
            self.registry.remove_if_same(&self.key, &self.entry);
        }
    }
    pub(crate) fn cancellation_phase(&self) -> Option<CancelPhase> {
        self.entry.cancellation_phase()
    }
}
impl Drop for InFlightRegistration {
    fn drop(&mut self) {
        if self.entry.can_cleanup_on_drop() {
            self.registry.remove_if_same(&self.key, &self.entry);
        }
    }
}
#[derive(Clone, Debug)]
pub struct Connection {
    pub id: String,
    pub project_id: String,
    pub external_account_id: String,
    pub connector: String,
    pub status: String,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct InfrastructureError;
impl std::fmt::Display for InfrastructureError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("MCP infrastructure unavailable")
    }
}
impl std::error::Error for InfrastructureError {}
pub trait ConnectionLister: Send + Sync {
    fn database_health(&self) -> Option<bool> {
        Some(true)
    }
    /// Return project connections. The service independently filters project and brand.
    async fn list(&self, project: &str) -> Result<Vec<Connection>, InfrastructureError>;
}
pub trait ActionExecutor: Send + Sync {
    async fn execute(&self, request: ExecuteRequest) -> Result<ExecuteResult, ActionError>;
}
pub fn encode_tool_name(connector: &str, operation: &str) -> String {
    format!("{}__{}", connector, operation.replace('.', "__"))
}
pub fn decode_tool_name(name: &str) -> Option<(&str, String)> {
    let parts: Vec<_> = name.split("__").collect();
    if parts.len() < 2 || parts.iter().any(|p| p.is_empty()) {
        return None;
    }
    Some((parts[0], parts[1..].join(".")))
}
