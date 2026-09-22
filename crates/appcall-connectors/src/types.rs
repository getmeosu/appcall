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
    pub icon_url: String,
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

    /// Registrable provider host used for identity, never an API/CDN label.
    pub fn brand_host(&self) -> Option<String> {
        self.network
            .allowed_hosts
            .iter()
            .filter_map(|host| brand_host(host))
            .next()
            .or_else(|| host_from_url(&self.auth.setup.docs_url))
            .or_else(|| {
                self.auth.oauth.as_ref().and_then(|oauth| {
                    [&oauth.authorize_url, &oauth.token_url]
                        .into_iter()
                        .find_map(|url| host_from_url(url))
                })
            })
            .or_else(|| {
                PRODUCT_HOSTS
                    .iter()
                    .find(|(key, _)| *key == self.key)
                    .map(|(_, host)| (*host).to_owned())
            })
    }

    /// HTTPS icon address. Prefers an explicit manifest URL, otherwise the
    /// provider's own `/favicon.ico`. Never a bundled or downloaded asset.
    pub fn resolved_icon_url(&self) -> Option<String> {
        let explicit = self.icon_url.trim();
        if !explicit.is_empty() {
            return Some(explicit.to_owned());
        }
        Some(match self.brand_host() {
            Some(host) => format!("https://{host}/favicon.ico"),
            None => FIRST_PARTY_ICON.to_owned(),
        })
    }
}

const FIRST_PARTY_ICON: &str = "https://github.com/getmeosu.png";

const PRODUCT_HOSTS: &[(&str, &str)] = &[
    ("confluence", "atlassian.com"),
    ("gitlab", "gitlab.com"),
    ("lemmy", "join-lemmy.org"),
    ("mastodon", "joinmastodon.org"),
    ("wordpress", "wordpress.org"),
];

fn host_from_url(value: &str) -> Option<String> {
    url::Url::parse(value.trim())
        .ok()
        .and_then(|url| url.host_str().map(str::to_owned))
        .and_then(|host| brand_host(&host))
}

const SERVICE_LABELS: &[&str] = &[
    "api", "apis", "api2", "app", "apps", "rest", "graph", "hooks", "hook", "webhook", "webhooks",
    "events", "event", "ws", "wss", "www", "m", "mobile", "cdn", "static", "upload", "uploads",
    "files", "file", "media",
];

fn brand_host(host: &str) -> Option<String> {
    let host = host.trim().trim_end_matches('.').to_ascii_lowercase();
    if host.is_empty() || host.contains('/') || host.contains(':') {
        return None;
    }
    let host = host.strip_prefix("*.").unwrap_or(&host);
    let mut labels: Vec<&str> = host
        .split('.')
        .filter(|label| !label.is_empty() && *label != "*" && !label.contains('{'))
        .collect();
    while labels.len() > 2 && SERVICE_LABELS.contains(&labels[0]) {
        labels.remove(0);
    }
    let valid = labels.len() >= 2
        && labels.iter().all(|label| {
            let bytes = label.as_bytes();
            !bytes.is_empty()
                && bytes[0] != b'-'
                && bytes[bytes.len() - 1] != b'-'
                && bytes
                    .iter()
                    .all(|b| b.is_ascii_alphanumeric() || *b == b'-')
        });
    valid.then(|| labels.join("."))
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
