use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Manifest {
    pub key: String,
    pub name: String,
    pub version: String,
    pub runtime: String,
    pub visibility: String,
    pub categories: Vec<String>,
    pub auth: AuthConfig,
    pub network: NetworkConfig,
    pub operations: BTreeMap<String, Operation>,
    pub models: Vec<String>,
}
impl Manifest {
    pub fn is_public(&self) -> bool {
        self.visibility.is_empty() || self.visibility == "public"
    }
    pub fn has_category(&self, category: &str) -> bool {
        let wanted = category.trim().to_lowercase();
        !wanted.is_empty()
            && self
                .categories
                .iter()
                .any(|c| c.trim().to_lowercase() == wanted)
    }
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct AuthConfig {
    #[serde(rename = "type")]
    pub type_: String,
    pub scopes: Vec<String>,
    pub setup: SetupConfig,
    pub oauth: Option<OAuthConfig>,
}
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct OAuthConfig {
    pub authorize_url: String,
    pub token_url: String,
    pub pkce: bool,
    pub supports_refresh: bool,
    pub client_auth: String,
    pub version: String,
    pub extra_auth_params: BTreeMap<String, String>,
}
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct SetupConfig {
    pub mode: String,
    pub fields: Vec<SetupField>,
    pub help: String,
    pub docs_url: String,
    pub routes: Vec<SetupRoute>,
    pub derive: Vec<DeriveField>,
}
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct SetupField {
    pub key: String,
    pub label: String,
    pub required: bool,
    pub secret: bool,
}
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct SetupRoute {
    pub id: String,
    pub label: String,
    pub fields: Vec<SetupField>,
}
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct DeriveField {
    pub field: String,
    pub kind: String,
    pub from: Vec<String>,
}
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct NetworkConfig {
    pub allowed_hosts: Vec<String>,
    pub egress: String,
}
impl NetworkConfig {
    pub fn makes_outbound_calls(&self) -> bool {
        self.egress != "none"
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OperationKind {
    Action,
    Sync,
    Webhook,
    #[default]
    Unknown,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SideEffect {
    Read,
    Write,
    Destructive,
}
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Operation {
    pub kind: OperationKind,
    pub timeout_ms: i64,
    pub max_input_bytes: i64,
    pub max_response_bytes: i64,
    pub title: String,
    pub description: String,
    pub input_schema: Option<Value>,
    pub output_schema: Option<Value>,
    pub sample: Option<Value>,
    pub side_effect: String,
}
impl Operation {
    pub fn has_tool_schema(&self) -> bool {
        self.kind == OperationKind::Action
            && !self.description.trim().is_empty()
            && self.input_schema.as_ref().is_some_and(Value::is_object)
    }
    pub fn side_effect_kind(&self) -> SideEffect {
        match self.side_effect.as_str() {
            "read" => SideEffect::Read,
            "destructive" => SideEffect::Destructive,
            _ => SideEffect::Write,
        }
    }
    pub fn is_read_only(&self) -> bool {
        self.side_effect_kind() == SideEffect::Read
    }
    pub fn is_destructive(&self) -> bool {
        self.side_effect_kind() == SideEffect::Destructive
    }
}
