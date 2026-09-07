//! Framework-neutral MCP gateway. The host supplies authenticated scope; actions
//! remain the single owner of credential injection, policy, metering and dispatch.
#![allow(async_fn_in_trait)]
mod adapters;
mod profile;
mod server;
mod usage;
pub use adapters::*;
use appcall_actions::{ActionError, ExecuteRequest, ExecuteResult};
pub use profile::*;
pub use server::*;
pub use usage::*;

pub const MAX_REQUEST_BYTES: usize = 1 << 20;
pub const PROTOCOL_VERSION: &str = "2025-06-18";
/// Construct only from authenticated HTTP context, never tool arguments.
/// Deliberately not Debug or Serialize because it carries a caller credential.
#[derive(Default)]
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
