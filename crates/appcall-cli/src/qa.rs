use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ScenarioFile {
    pub connector: String,
    #[serde(default, deserialize_with = "null_vec")]
    pub scenarios: Vec<Scenario>,
}
#[derive(Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Scenario {
    pub name: String,
    pub operation: String,
    #[serde(default = "object")]
    pub input: Value,
    pub expect: Expectation,
    #[serde(default, deserialize_with = "null_vec")]
    pub setup: Vec<Step>,
    #[serde(default, deserialize_with = "null_vec")]
    pub teardown: Vec<Step>,
}
fn object() -> Value {
    serde_json::json!({})
}
#[derive(Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Step {
    pub operation: String,
    #[serde(default = "object")]
    pub input: Value,
}
#[derive(Clone, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Expectation {
    pub status: String,
    #[serde(default)]
    pub error_code: String,
    #[serde(default, deserialize_with = "null_vec")]
    pub assertions: Vec<Assertion>,
}
#[derive(Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Assertion {
    pub path: String,
    pub op: String,
    #[serde(default)]
    pub value: Value,
}
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct ScenarioResult {
    pub name: String,
    pub status: String,
    #[serde(
        default,
        deserialize_with = "null_vec",
        skip_serializing_if = "Vec::is_empty"
    )]
    pub failures: Vec<String>,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub error: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub error_code: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub failure_kind: String,
    #[serde(default, skip_serializing_if = "is_false")]
    pub probe_passed: bool,
}
fn is_false(v: &bool) -> bool {
    !*v
}
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct OperationResult {
    pub operation: String,
    pub side_effect: String,
    pub status: String,
    #[serde(
        default,
        deserialize_with = "null_vec",
        skip_serializing_if = "Vec::is_empty"
    )]
    pub scenarios: Vec<ScenarioResult>,
    #[serde(
        default,
        deserialize_with = "null_vec",
        skip_serializing_if = "Vec::is_empty"
    )]
    pub leak_warnings: Vec<String>,
}
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct ConnectorReport {
    #[serde(default)]
    pub manifest_digest: String,
    pub connector: String,
    pub overall: String,
    pub total: usize,
    pub passed: usize,
    pub failed: usize,
    pub not_certified: usize,
    #[serde(default, deserialize_with = "null_vec")]
    pub operations: Vec<OperationResult>,
    #[serde(default)]
    pub last_run_at: Option<DateTime<Utc>>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectorHealth {
    pub connector: String,
    pub state: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_run_at: Option<DateTime<Utc>>,
    pub passed_operations: usize,
    pub uncertified_operations: usize,
    pub reason: String,
}
pub use crate::qa_health::assess;
pub use crate::qa_value::{check_assertion, expand};
#[allow(async_fn_in_trait)]
pub trait Executor {
    async fn execute(&self, request: appcall_actions::ExecuteRequest) -> Result<Value, String>;
}
impl<
        R: appcall_actions::ActionRepository,
        C: appcall_actions::ActionCatalog,
        V: appcall_actions::CredentialResolver,
        D: appcall_actions::ActionRunner,
        P: appcall_actions::PolicyGate,
    > Executor for appcall_actions::Service<R, C, V, D, P>
{
    async fn execute(&self, r: appcall_actions::ExecuteRequest) -> Result<Value, String> {
        self.execute(r).await.map(|r| r.output).map_err(|e| e.code)
    }
}
pub use crate::qa_run::run_connector;

fn null_vec<'de, D: serde::Deserializer<'de>, T: Deserialize<'de>>(
    d: D,
) -> Result<Vec<T>, D::Error> {
    Ok(Option::<Vec<T>>::deserialize(d)?.unwrap_or_default())
}
impl<E: Executor> Executor for &E {
    async fn execute(&self, r: appcall_actions::ExecuteRequest) -> Result<Value, String> {
        (*self).execute(r).await
    }
}
