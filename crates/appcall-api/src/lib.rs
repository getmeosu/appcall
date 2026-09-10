//! HTTP contract adapter for the Rust application services.
#![allow(async_fn_in_trait)]
pub mod browser_host;
pub mod browser_recovery;
pub mod data_routes;
pub mod dev_oauth;
pub mod development_browser;
pub mod development_memory;
pub mod event_routes;
pub mod generation;
pub mod provider_routes;
pub mod rate_limit;
pub mod run_operator;
mod services;
pub mod streaming;
pub use services::*;
mod transport;
pub use transport::serve;
pub use transport::serve_with_rate;

use appcall_actions::{ExecuteRequest, ExecuteResult};
use appcall_connectors::Registry;
use appcall_store::Connection;
use serde::Deserialize;
use serde_json::Value;
use std::{collections::BTreeSet, time::Duration};

pub struct Request {
    pub method: String,
    pub uri: String,
    pub headers: Vec<(String, String)>,
    pub body: Vec<u8>,
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Identity {
    pub project_id: String,
    pub account_id: String,
    pub admin_scope: bool,
}
#[derive(Debug)]
pub struct RawResponse {
    pub status: u16,
    pub body: Vec<u8>,
    pub headers: Vec<(String, String)>,
}
#[derive(Debug)]
pub struct Response {
    pub status: u16,
    pub body: Value,
    pub headers: Vec<(String, String)>,
}
#[derive(Clone, Debug)]
pub enum ApiFailureEvidence {
    Action(appcall_actions::ActionFailureEvidence),
    Setup(SetupFailureEvidence),
    ConnectionCheck(ConnectionCheckFailure),
}
mod setup_failure;
pub use setup_failure::{ConnectionCheckFailure, SetupFailureEvidence};
#[derive(Clone, Debug)]
pub struct ApiError {
    /// Internal presentation evidence; not part of the public response envelope.
    pub evidence: Option<Box<ApiFailureEvidence>>,
    pub code: &'static str,
    pub request_id: String,
    pub usage: Option<Box<appcall_actions::UsageSnapshot>>,
    pub retry_after_seconds: Option<u64>,
    pub detail: Option<Box<appcall_actions::FailureDetail>>,
}
impl ApiError {
    pub fn new(code: &'static str) -> Self {
        Self {
            evidence: None,
            code,
            request_id: String::new(),
            usage: None,
            retry_after_seconds: None,
            detail: None,
        }
    }
}
/// Preserve infrastructure outages separately from invalid caller credentials.
pub fn authentication_error(error: appcall_auth::AuthError) -> ApiError {
    ApiError::new(match error {
        appcall_auth::AuthError::Unavailable => "STORAGE_UNAVAILABLE",
        appcall_auth::AuthError::Forbidden => "FORBIDDEN",
        _ => "UNAUTHORIZED",
    })
}
/// A known closed client dominates a busy client; busy does not mean unhealthy.
pub fn combined_database_health(states: impl IntoIterator<Item = Option<bool>>) -> Option<bool> {
    let mut busy = false;
    for state in states {
        match state {
            Some(false) => return Some(false),
            None => busy = true,
            Some(true) => {}
        }
    }
    if busy {
        None
    } else {
        Some(true)
    }
}
impl From<appcall_actions::ActionError> for ApiError {
    fn from(error: appcall_actions::ActionError) -> Self {
        const CODES: &[&str] = &[
            "ACTION_FAILED",
            "INVALID_ACTION_INPUT",
            "MISSING_ACCOUNT_SCOPE",
            "CONNECTION_NOT_FOUND",
            "CONNECTION_CHANGED",
            "CONNECTION_DISCONNECTED",
            "UNKNOWN_ACTION",
            "ACTION_INPUT_TOO_LARGE",
            "ACTION_TIMEOUT",
            "ACTION_RESPONSE_INVALID",
            "ACTION_RESPONSE_TOO_LARGE",
            "IDEMPOTENCY_CONFLICT",
            "IDEMPOTENCY_IN_PROGRESS",
            "MISSING_CREDENTIAL",
            "MISSING_SUBACCOUNT",
            "USAGE_LIMIT_EXCEEDED",
            "USAGE_DECISION_FAILED",
            "SEND_CAP_EXCEEDED",
            "SPEND_CAP_EXCEEDED",
            "LINKEDIN_INVITE_CAP_EXCEEDED",
            "LINKEDIN_NOTED_INVITE_CAP_EXCEEDED",
            "LINKEDIN_MESSAGE_CAP_EXCEEDED",
            "LINKEDIN_VIEW_CAP_EXCEEDED",
            "LINKEDIN_ACTION_TOO_FAST",
            "LINKEDIN_WARMUP_LIMITED",
            "CONNECTION_RESTRICTED",
            "ACTION_NOT_PERMITTED",
            "CONNECTOR_RATE_LIMITED",
            "CONNECTOR_UNAVAILABLE",
            "RUNNER_BUSY",
            "POLICY_UNSUPPORTED",
            "CIRCUIT_OPEN",
            "STORAGE_UNAVAILABLE",
            "PROJECT_DISABLED",
            "NOTE_TOO_LONG",
        ];
        let code = CODES
            .iter()
            .copied()
            .find(|code| *code == error.code)
            .unwrap_or("ACTION_FAILED");
        let mut result = Self::new(code);
        result.request_id = error.request_id;
        result.usage = error.usage.map(Box::new);
        result.detail = error.detail;
        result.evidence = Some(Box::new(ApiFailureEvidence::Action(*error.evidence)));
        if code == "IDEMPOTENCY_IN_PROGRESS" {
            result.retry_after_seconds = Some(2)
        }
        result
    }
}
pub type Result<T> = std::result::Result<T, ApiError>;

/// Backends enforce identity and storage ownership; no default permissive
/// implementation is supplied. HTTP bodies can never provide Identity.
pub trait Backend: Send + Sync {
    /// Pin a replaceable backend once for the entire HTTP authorization/effect flow.
    fn pin_request(&self) -> Result<Option<Self>>
    where
        Self: Sized,
    {
        Ok(None)
    }
    async fn event_stream(&self, _request: &Request) -> Result<Option<streaming::StreamResponse>> {
        Ok(None)
    }
    fn requires_api_auth(&self, _method: &str, _path: &str) -> bool {
        true
    }
    async fn raw_route(&self, _request: &Request) -> Result<Option<RawResponse>> {
        Ok(None)
    }
    async fn public_route(&self, _request: &Request) -> Result<Option<Response>> {
        Ok(None)
    }
    async fn auxiliary_route(
        &self,
        _identity: &Identity,
        _request: &Request,
    ) -> Result<Option<Response>> {
        Ok(None)
    }

    /// Run controls are privileged mutations. The trusted operator principal
    /// has not yet been defined by the product auth contract, so every
    /// backend defaults to deny until it explicitly implements this hook.
    async fn authorize_sync_control(&self, _identity: &Identity, _request: &Request) -> Result<()> {
        Err(ApiError::new("FORBIDDEN"))
    }

    async fn authorize(&self, headers: &[(String, String)]) -> Result<Identity>;
    async fn ready(&self) -> Result<()>;
    async fn connections(&self, identity: &Identity) -> Result<Vec<Connection>>;
    async fn platform_connectors(&self, identity: &Identity) -> Result<Vec<String>>;
    async fn connection(&self, identity: &Identity, id: &str) -> Result<Connection>;
    async fn test_connection(&self, identity: &Identity, id: &str) -> Result<Connection>;
    async fn disconnect(&self, identity: &Identity, id: &str) -> Result<()>;
    async fn execute(&self, request: ExecuteRequest) -> Result<ExecuteResult>;
}

pub struct Api<B> {
    pub registry: Registry,
    pub backend: B,
}

impl<B: Backend> Api<B> {
    pub async fn handle(&self, request: Request) -> Response {
        match self.route(request).await {
            Ok(response) => response,
            Err(error) => error_response(error),
        }
    }
    async fn route(&self, request: Request) -> Result<Response> {
        if request.uri.len() > 4096 || request.body.len() > 2 * 1024 * 1024 {
            return Err(ApiError::new("REQUEST_TOO_LARGE"));
        }
        validate_headers(&request.headers)?;
        let url = validate_request_uri(&request.uri)?;
        let path = url.path();
        if request.method == "GET" && path == "/healthz" {
            return Ok(ok(serde_json::json!({"service":"appcall","status":"ok"})));
        }
        if request.method == "GET" && path == "/readyz" {
            return Ok(
                match tokio::time::timeout(Duration::from_secs(2), self.backend.ready()).await {
                    Ok(Ok(())) => ok(serde_json::json!({"service":"appcall","status":"ready"})),
                    _ => Response {
                        status: 503,
                        headers: vec![],
                        body: serde_json::json!({"service":"appcall","status":"unavailable"}),
                    },
                },
            );
        }
        let segments = path
            .trim_matches('/')
            .split('/')
            .map(|p| {
                percent_encoding::percent_decode_str(p)
                    .decode_utf8()
                    .map(|s| s.into_owned())
                    .map_err(|_| ApiError::new("INVALID_REQUEST"))
            })
            .collect::<Result<Vec<_>>>()?;
        let segments: Vec<&str> = segments.iter().map(String::as_str).collect();
        if let Some(response) = self.backend.public_route(&request).await? {
            return Ok(response);
        }
        let identity = self.backend.authorize(&request.headers).await?;
        if identity.project_id.is_empty() {
            return Err(ApiError::new("UNAUTHORIZED"));
        }

        match (request.method.as_str(), segments.as_slice()) {
            ("GET", ["v1", "connectors"]) => {
                let platform = self.backend.platform_connectors(&identity).await?;
                let categories: BTreeSet<String> = url
                    .query_pairs()
                    .filter(|(k, _)| k == "category")
                    .flat_map(|(_, v)| {
                        v.split(',')
                            .map(|s| s.trim().to_lowercase())
                            .filter(|s| !s.is_empty())
                            .collect::<Vec<_>>()
                    })
                    .collect();
                let profile = header(&request.headers, "X-Capability-Profile");
                let connectors=self.registry.public_list().filter(|c|{
                    let m=c.manifest();
                    (categories.is_empty()||categories.iter().any(|category|m.has_category(category))) &&
                    (profile!="sena_mvt"||["apollo","brevo","google-workspace","rb2b","unipile","apify","cal-com","calendly","googlemeet"].contains(&m.key.as_str()))
                }).map(|c|{let m=c.manifest();serde_json::json!({"key":m.key,"name":m.name,"authType":m.auth.type_,"setupMode":m.auth.setup.mode,"runtime":m.runtime,"platformConnected":platform.contains(&m.key),"categories":nullable_list(&m.categories),"models":nullable_list(&m.models),"toolCount":m.operations.values().filter(|o|o.has_tool_schema()).count()})}).collect::<Vec<_>>();
                Ok(ok(serde_json::json!({"connectors":connectors})))
            }
            ("GET", ["v1", "connectors", key]) => {
                let c = self
                    .registry
                    .public_connector(key)
                    .map_err(|_| ApiError::new("CONNECTOR_NOT_FOUND"))?;
                let m = c.manifest();
                let operations=m.operations.iter().map(|(k,o)|serde_json::json!({"key":k,"kind":o.kind,"timeoutMs":o.timeout_ms,"maxInputBytes":o.max_input_bytes,"maxResponseBytes":o.max_response_bytes})).collect::<Vec<_>>();
                Ok(ok(
                    serde_json::json!({"key":m.key,"name":m.name,"authType":m.auth.type_,"setupMode":m.auth.setup.mode,"setupFields":m.auth.setup.fields,"runtime":m.runtime,"categories":nullable_list(&m.categories),"models":nullable_list(&m.models),"operations":operations}),
                ))
            }
            ("GET", ["v1", "connectors", key, "setup"]) => {
                let c = self
                    .registry
                    .public_connector(key)
                    .map_err(|_| ApiError::new("CONNECTOR_NOT_FOUND"))?;
                let m = c.manifest();
                Ok(ok(
                    serde_json::json!({"connector":m.key,"authType":m.auth.type_,"mode":m.auth.setup.mode,"fields":m.auth.setup.fields,"routes":m.auth.setup.routes,"help":m.auth.setup.help,"docsUrl":m.auth.setup.docs_url}),
                ))
            }
            ("GET", ["v1", "connections"]) => Ok(ok(
                serde_json::json!({"connections":self.backend.connections(&identity).await?.iter().map(connection_json).collect::<Vec<_>>()}),
            )),
            ("GET", ["v1", "connections", id]) => Ok(ok(connection_json(
                &self.backend.connection(&identity, id).await?,
            ))),
            ("POST", ["v1", "connections", id, "test"]) => Ok(ok(connection_json(
                &self.backend.test_connection(&identity, id).await?,
            ))),
            ("POST", ["v1", "connections", id, "disconnect"]) => {
                self.backend.disconnect(&identity, id).await?;
                Ok(Response {
                    status: 204,
                    headers: vec![],
                    body: Value::Null,
                })
            }
            ("POST", ["v1", "connections", id, "actions", action]) => {
                #[derive(Deserialize)]
                #[serde(deny_unknown_fields)]
                struct Body {
                    #[serde(default = "empty_input")]
                    input: Value,
                }
                let body: Body = if request.body.is_empty() || request.body.trim_ascii() == b"null"
                {
                    Body {
                        input: empty_input(),
                    }
                } else {
                    if request.body.iter().find(|b| !b.is_ascii_whitespace()) != Some(&b'{') {
                        return Err(ApiError::new("INVALID_REQUEST"));
                    }
                    serde_json::from_slice(&request.body)
                        .map_err(|_| ApiError::new("INVALID_REQUEST"))?
                };
                if !body.input.is_object() {
                    return Err(ApiError::new("INVALID_REQUEST"));
                }
                let result = self
                    .backend
                    .execute(ExecuteRequest {
                        project_id: identity.project_id,
                        connection_id: (*id).into(),
                        external_account_id: identity.account_id,
                        admin_scope: false,
                        action: (*action).into(),
                        idempotency_key: header(&request.headers, "Idempotency-Key").into(),
                        input: body.input,
                        caller_credential: connector_token(&request.headers).into(),
                    })
                    .await?;
                let mut value =
                    serde_json::json!({"requestId":result.request_id,"output":result.output});
                if !result.replay_log_id.is_empty() {
                    value["replayLogId"] = result.replay_log_id.into();
                }
                if result.usage_warning {
                    value["usageWarning"] = true.into();
                    value["usage"] = serde_json::to_value(result.usage)
                        .map_err(|_| ApiError::new("ACTION_FAILED"))?;
                }
                Ok(ok(value))
            }
            ("POST", ["v1", "unified", "posts"]) => {
                let execute =
                    data_routes::unified_request(&identity, &request.body, &request.headers)?;
                data_routes::unified_response(self.backend.execute(execute).await.map_err(
                    |mut error| {
                        error.detail = None;
                        error
                    },
                )?)
            }
            _ => {
                if request.method == "POST"
                    && matches!(
                        segments.as_slice(),
                        ["v1", "sync-runs", _, "run-now" | "reset" | "cancel"]
                    )
                {
                    self.backend
                        .authorize_sync_control(&identity, &request)
                        .await?;
                }
                self.backend
                    .auxiliary_route(&identity, &request)
                    .await?
                    .ok_or_else(|| ApiError::new("ROUTE_NOT_FOUND"))
            }
        }
    }
}

fn error_response(error: ApiError) -> Response {
    // Setup adapters share the established provider-route status and safe text.
    let setup = match error.code {
        "MISSING_SETUP_FIELD" => match error.evidence.as_deref() {
            Some(ApiFailureEvidence::Setup(SetupFailureEvidence::MissingField(Some(key)))) => {
                Some(appcall_setup::Error::MissingDeclaredField(key.clone()))
            }
            _ => Some(appcall_setup::Error::MissingField),
        },
        "UNSUPPORTED_SETUP_MODE" => Some(appcall_setup::Error::Unsupported),
        "CONNECTOR_SETUP_VALIDATION_FAILED" => Some(appcall_setup::Error::ValidationFailed),
        "INVALID_OAUTH_STATE" => Some(appcall_setup::Error::OAuth(
            appcall_oauth::Error::InvalidState,
        )),
        "OAUTH_APP_NOT_CONFIGURED" => Some(appcall_setup::Error::OAuth(
            appcall_oauth::Error::NotConfigured,
        )),
        "OAUTH_EXCHANGE_FAILED" => {
            Some(appcall_setup::Error::OAuth(appcall_oauth::Error::Transport))
        }
        _ => None,
    };
    if let Some(error) = setup {
        return provider_routes::setup_error(error, false);
    }

    let (status, message) = match error.code {
        "UNAUTHORIZED" => (401, "Missing or invalid API key."),
        "FORBIDDEN" => (403, "Access is not permitted."),
        "INVALID_JSON" => (
            400,
            "Request body must contain connectionId and an input object, with no unknown fields.",
        ),
        "INVALID_LIMIT" => (400, "Limit must be a non-negative integer."),
        "INVALID_STATUS" => (400, "Status must be succeeded or failed."),
        "INVALID_RUN_STATUS" => (400, "Run status is invalid."),
        "INVALID_RUN_FILTER" => (400, "Run filter is invalid."),
        "INVALID_ERROR_CODE" => (400, "Error code must be a stable action error code."),
        "INVALID_CURSOR" => (400, "Cursor is invalid."),
        "INVALID_TIME_RANGE" => (400, "Created time range is invalid."),
        "INVALID_MONTH" => (400, "Month must use YYYY-MM format."),
        "INVALID_QUANTITY" => (
            400,
            "Quantity must be a positive integer no greater than 1000.",
        ),
        "ACTION_LOG_NOT_FOUND" => (404, "Action log was not found."),
        "REPLAY_LOG_NOT_FOUND" => (404, "Replay log was not found."),
        "REQUEST_TRACE_NOT_FOUND" => (404, "Request trace was not found."),
        "WEBHOOK_EVENT_NOT_FOUND" => (404, "Webhook event was not found."),
        "ACTION_LOGS_FAILED" => (500, "Action logs could not be loaded."),
        "REPLAY_LOGS_FAILED" => (500, "Replay logs could not be loaded."),
        "REQUEST_TRACE_FAILED" => (500, "Request trace could not be loaded."),
        "WEBHOOK_EVENTS_FAILED" => (500, "Webhook events could not be loaded."),
        "RUNS_FAILED" => (500, "Durable runs could not be loaded."),
        "RUN_NOT_FOUND" => (404, "Durable run was not found."),
        "RUN_STATE_CONFLICT" => (409, "Durable run state changed; refresh before retrying."),
        "WEBHOOK_REPLAY_FAILED" => (500, "Webhook event could not be replayed."),
        "WEBHOOK_SIGNATURE_INVALID" => (401, "Webhook signature is invalid."),
        "INVALID_WEBHOOK_PAYLOAD" => (400, "Webhook payload could not be read."),
        "WEBHOOK_INGEST_FAILED" => (500, "Webhook event could not be accepted."),
        "WEBHOOK_CONFIGURATION_REQUIRED" => (422, "Webhook sync requires provider configuration."),
        "WEBHOOK_PAYLOAD_TOO_LARGE" => (413, "Webhook payload is too large."),
        "USAGE_FAILED" => (500, "Usage could not be loaded."),
        "USAGE_DECISION_FAILED" => (500, "Usage decision could not be loaded."),
        "ENTITLEMENTS_FAILED" => (500, "Entitlements could not be loaded."),
        "CONNECTION_NOT_FOUND" => (404, "Connection was not found."),
        "CONNECTOR_NOT_FOUND" => (404, "Connector was not found."),
        "UNKNOWN_ACTION" => (404, "Action was not found."),
        "INVALID_ACTION_INPUT" => (400, "Action input is invalid."),
        "MISSING_ACCOUNT_SCOPE" => (
            400,
            "This request requires an external account id (X-External-Account-Id).",
        ),
        "INVALID_REQUEST" => (400, "The request is invalid."),
        "REQUEST_TOO_LARGE" => (413, "The request is too large."),
        "ACTION_INPUT_TOO_LARGE" => (413, "Action input exceeded the configured size limit."),
        "REQUEST_TIMEOUT" => (408, "The request timed out."),
        "ACTION_TIMEOUT" => (504, "Action execution timed out."),
        "ACTION_RESPONSE_INVALID" => (502, "Action response was invalid."),
        "ACTION_RESPONSE_TOO_LARGE" => (502, "Action response exceeded the configured size limit."),
        "CONNECTION_DISCONNECTED" => (400, "Connection is disconnected."),
        "CONNECTION_CHANGED" => (409, "The connection is unavailable or changed."),
        "IDEMPOTENCY_CONFLICT" => (
            409,
            "Idempotency key was already used for a different action request.",
        ),
        "IDEMPOTENCY_IN_PROGRESS" => (409, "Idempotency key is already being processed."),
        "MISSING_CREDENTIAL" => (
            422,
            "Connection is missing a required credential; reconnect it.",
        ),
        "MISSING_SUBACCOUNT" => (
            409,
            "No connected account is bound to this brand for the action's channel.",
        ),
        "USAGE_LIMIT_EXCEEDED" => (429, "Usage limit exceeded."),
        "SEND_CAP_EXCEEDED" | "SPEND_CAP_EXCEEDED" => {
            (429, "The configured outbound capacity is exhausted.")
        }
        "LINKEDIN_INVITE_CAP_EXCEEDED"
        | "LINKEDIN_NOTED_INVITE_CAP_EXCEEDED"
        | "LINKEDIN_MESSAGE_CAP_EXCEEDED"
        | "LINKEDIN_VIEW_CAP_EXCEEDED"
        | "LINKEDIN_ACTION_TOO_FAST"
        | "LINKEDIN_WARMUP_LIMITED" => (429, "The connected account's safety limit is exhausted."),
        "CONNECTION_RESTRICTED" => (409, "The connected account is restricted; reconnect it."),
        "ACTION_NOT_PERMITTED" => (403, "The connected account cannot perform this action."),
        "NOTE_TOO_LONG" => (400, "The invitation note is too long."),
        "CONNECTOR_RATE_LIMITED" => (429, "The connector is rate limited."),
        "RATE_LIMITED" => (429, "Too many requests. Slow down and retry."),
        "SERVICE_BUSY" | "STORAGE_UNAVAILABLE" | "PROJECT_DISABLED" | "RUNNER_BUSY" => {
            (503, "The service is unavailable.")
        }
        "POLICY_UNSUPPORTED" | "CONNECTOR_UNAVAILABLE" | "CIRCUIT_OPEN" => {
            (503, "The requested operation is unavailable.")
        }
        "ROUTE_NOT_FOUND" => (404, "Route was not found."),
        _ => (500, "Action execution failed."),
    };
    let mut body = serde_json::json!({"error":{"code":error.code,"message":message}});
    if let Some(detail) = error.detail {
        if let Some(size) = detail.response_size {
            body["error"]["actualBytes"] = size.actual_bytes.into();
            body["error"]["limitBytes"] = size.limit_bytes.into();
        }
        if error.code == "ACTION_FAILED" {
            if let Some(message) = detail
                .safe_message
                .filter(|message| !message.trim().is_empty())
            {
                body["error"]["message"] = format!(
                    "Action execution failed: {}",
                    message.chars().take(300).collect::<String>()
                )
                .into();
            }
        }
    }
    if !error.request_id.is_empty() {
        body["error"]["requestId"] = error.request_id.into()
    }
    if let Some(usage) = error.usage {
        body["error"]["usage"] = serde_json::to_value(usage).expect("usage serializes")
    }
    let mut headers = Vec::new();
    if let Some(seconds) = error.retry_after_seconds {
        body["error"]["retryAfterSeconds"] = seconds.into();
        headers.push(("Retry-After".into(), seconds.to_string()));
    }
    Response {
        status,
        body,
        headers,
    }
}

fn ok(body: Value) -> Response {
    Response {
        status: 200,
        body,
        headers: vec![],
    }
}
fn empty_input() -> Value {
    serde_json::json!({})
}
fn nullable_list(values: &[String]) -> Value {
    if values.is_empty() {
        Value::Null
    } else {
        serde_json::json!(values)
    }
}
fn header<'a>(headers: &'a [(String, String)], name: &str) -> &'a str {
    headers
        .iter()
        .find(|(k, _)| k.eq_ignore_ascii_case(name))
        .map(|(_, v)| v.as_str())
        .unwrap_or("")
}
/// Validate the raw request target before URL parsing can normalize its path.
/// Shared by the socket boundary and direct API calls; query escapes are opaque.
fn validate_request_uri(uri: &str) -> Result<url::Url> {
    if uri.len() > 4096 {
        return Err(ApiError::new("REQUEST_TOO_LARGE"));
    }
    if !uri.starts_with('/')
        || uri.starts_with("//")
        || uri.contains('#')
        || uri.chars().any(char::is_control)
    {
        return Err(ApiError::new("INVALID_REQUEST"));
    }
    let path = uri.split('?').next().unwrap_or("");
    if path.contains('\\') {
        return Err(ApiError::new("INVALID_REQUEST"));
    }
    let bytes = path.as_bytes();
    for (index, byte) in bytes.iter().enumerate() {
        if *byte == b'%'
            && (index + 2 >= bytes.len()
                || !bytes[index + 1].is_ascii_hexdigit()
                || !bytes[index + 2].is_ascii_hexdigit())
        {
            return Err(ApiError::new("INVALID_REQUEST"));
        }
    }
    if path != "/" {
        let segments = path.strip_prefix('/').unwrap_or(path);
        let segments = segments.strip_suffix('/').unwrap_or(segments);
        for segment in segments.split('/') {
            let decoded = percent_encoding::percent_decode_str(segment)
                .decode_utf8()
                .map_err(|_| ApiError::new("INVALID_REQUEST"))?;
            if decoded.is_empty()
                || decoded == "."
                || decoded == ".."
                || decoded.contains(['/', '\\'])
                || decoded.chars().any(char::is_control)
            {
                return Err(ApiError::new("INVALID_REQUEST"));
            }
        }
    }
    url::Url::parse(&format!("http://appcall.invalid{uri}"))
        .map_err(|_| ApiError::new("INVALID_REQUEST"))
}

fn validate_headers(headers: &[(String, String)]) -> Result<()> {
    if headers.len() > 64
        || headers
            .iter()
            .map(|(k, v)| k.len() + v.len())
            .sum::<usize>()
            > 16384
    {
        return Err(ApiError::new("REQUEST_TOO_LARGE"));
    }
    let mut seen = BTreeSet::new();
    for (key, value) in headers {
        if key.chars().any(char::is_control) || value.contains(['\r', '\n']) {
            return Err(ApiError::new("INVALID_REQUEST"));
        }
        let key = key.to_ascii_lowercase();
        if [
            "x-api-key",
            "authorization",
            "x-external-account-id",
            "x-admin-scope",
            "idempotency-key",
            "x-connector-token",
            "x-capability-profile",
            "x-tenant-id",
            "cookie",
            "origin",
            "referer",
            "last-event-id",
        ]
        .contains(&key.as_str())
            && !seen.insert(key)
        {
            return Err(ApiError::new("INVALID_REQUEST"));
        }
    }
    Ok(())
}
pub fn connection_json(connection: &Connection) -> Value {
    serde_json::json!({"id":connection.id,"connector":connection.connector,"authType":connection.auth_type,"status":connection.status,"lastTestStatus":connection.last_test_status,"credentialOwner":connection.credential_owner})
}

fn connector_token(headers: &[(String, String)]) -> &str {
    let value = header(headers, "X-Connector-Token").trim();
    if value
        .get(..7)
        .is_some_and(|prefix| prefix.eq_ignore_ascii_case("Bearer "))
    {
        value[7..].trim()
    } else {
        value
    }
}

#[cfg(test)]
mod action_error_tests {
    use super::*;
    #[test]
    fn invalid_created_time_range_has_fixed_public_error() {
        let response = error_response(ApiError::new("INVALID_TIME_RANGE"));
        assert_eq!(response.status, 400);
        assert_eq!(
            response.body,
            serde_json::json!({
                "error": {"code": "INVALID_TIME_RANGE", "message": "Created time range is invalid."}
            })
        );
    }

    #[test]
    fn action_errors_keep_identity_status_and_retry_contract() {
        for (code, status) in [
            ("UNKNOWN_ACTION", 404),
            ("ACTION_INPUT_TOO_LARGE", 413),
            ("ACTION_TIMEOUT", 504),
            ("ACTION_RESPONSE_INVALID", 502),
            ("ACTION_RESPONSE_TOO_LARGE", 502),
            ("MISSING_CREDENTIAL", 422),
            ("MISSING_SUBACCOUNT", 409),
            ("CONNECTION_DISCONNECTED", 400),
            ("CONNECTION_CHANGED", 409),
            ("IDEMPOTENCY_IN_PROGRESS", 409),
        ] {
            let mut error = appcall_actions::ActionError::new(code);
            error.request_id = "req_test".into();
            let response = error_response(ApiError::from(error));
            assert_eq!(response.status, status, "{code}");
            assert_eq!(response.body["error"]["code"], code);
            assert_eq!(response.body["error"]["requestId"], "req_test");
            if code == "IDEMPOTENCY_IN_PROGRESS" {
                assert_eq!(response.body["error"]["retryAfterSeconds"], 2);
                assert!(response
                    .headers
                    .contains(&("Retry-After".into(), "2".into())));
            }
        }
    }
    #[test]
    fn runner_busy_keeps_not_dispatched_evidence_and_public_retryable_status() {
        use appcall_actions::{ActionDispatchOutcome, ActionFailureEvidence, ActionFailureOrigin};
        let evidence = ActionFailureEvidence {
            outcome: ActionDispatchOutcome::NotDispatched,
            origin: ActionFailureOrigin::Runner,
            retry_after_seconds: Some(7),
        };
        let mut error = appcall_actions::ActionError::new("RUNNER_BUSY");
        error.request_id = "req_runner_busy".into();
        error.evidence = Box::new(evidence.clone());

        let api = ApiError::from(error);
        assert_eq!(api.code, "RUNNER_BUSY");
        match api.evidence.as_deref() {
            Some(ApiFailureEvidence::Action(actual)) => assert_eq!(actual, &evidence),
            _ => panic!("runner admission evidence was lost"),
        }

        let response = error_response(api);
        assert_eq!(response.status, 503);
        assert_eq!(
            response.body,
            serde_json::json!({
                "error": {
                    "code": "RUNNER_BUSY",
                    "message": "The service is unavailable.",
                    "requestId": "req_runner_busy"
                }
            })
        );
        assert!(response.headers.is_empty());
    }
    #[test]
    fn usage_limit_error_retains_snapshot_at_error_scope() {
        let mut error = appcall_actions::ActionError::new("USAGE_LIMIT_EXCEEDED");
        error.request_id = "req_usage".into();
        error.usage = Some(appcall_actions::UsageSnapshot {
            month: "2026-09".into(),
            current: 300,
            projected: 301,
            soft_limit: 200,
            hard_limit: 300,
        });
        let response = error_response(ApiError::from(error));
        assert_eq!(response.status, 429);
        assert_eq!(
            response.body["error"]["usage"],
            serde_json::json!({"month":"2026-09","current":300,"projected":301,"softLimit":200,"hardLimit":300})
        );
        assert_eq!(response.body["error"]["requestId"], "req_usage");
    }
    #[test]
    fn unknown_action_error_content_never_enters_public_envelope() {
        let response = error_response(ApiError::from(appcall_actions::ActionError::new(
            "secret-provider-body",
        )));
        assert_eq!(response.body["error"]["code"], "ACTION_FAILED");
        assert!(!response.body.to_string().contains("secret-provider-body"));
    }
    #[test]
    fn sync_run_errors_preserve_not_found_conflict_and_storage_statuses() {
        for (code, status) in [
            ("RUN_NOT_FOUND", 404),
            ("RUN_STATE_CONFLICT", 409),
            ("RUNS_FAILED", 500),
            ("INVALID_RUN_STATUS", 400),
        ] {
            let response = error_response(ApiError::new(code));
            assert_eq!(response.status, status, "{code}");
            assert_eq!(response.body["error"]["code"], code);
        }
    }
    #[test]
    fn action_evidence_conversion_preserves_internal_context_and_public_contract() {
        use appcall_actions::{ActionDispatchOutcome, ActionFailureEvidence, ActionFailureOrigin};
        for hint in [None, Some(0), Some(19)] {
            let mut error = appcall_actions::ActionError::new("provider-private-code");
            error.evidence = Box::new(ActionFailureEvidence {
                outcome: ActionDispatchOutcome::ResponseReceived,
                origin: ActionFailureOrigin::Runner,
                retry_after_seconds: hint,
            });
            error.usage = Some(appcall_actions::UsageSnapshot {
                current: 23,
                projected: 24,
                hard_limit: 22,
                ..Default::default()
            });
            error.detail = Some(Box::new(appcall_actions::FailureDetail {
                safe_message: None,
                response_size: Some(appcall_actions::ResponseSize {
                    actual_bytes: 1234,
                    limit_bytes: 1024,
                }),
            }));
            let expected = error.evidence.clone();
            let api = ApiError::from(error);
            match api.evidence.as_deref() {
                Some(ApiFailureEvidence::Action(actual)) => assert_eq!(actual, expected.as_ref()),
                _ => panic!("action evidence was lost"),
            }
            assert_eq!(api.code, "ACTION_FAILED");
            assert_eq!(api.usage.as_ref().unwrap().current, 23);
            assert_eq!(
                api.detail
                    .as_ref()
                    .unwrap()
                    .response_size
                    .as_ref()
                    .unwrap()
                    .actual_bytes,
                1234
            );
            let response = error_response(api);
            assert!(response.body["error"].get("evidence").is_none());
            assert!(!response.body.to_string().contains("provider-private-code"));
        }
        let api = ApiError::from(appcall_actions::ActionError::new("IDEMPOTENCY_IN_PROGRESS"));
        assert_eq!(api.retry_after_seconds, Some(2));
        match api.evidence.as_deref() {
            Some(ApiFailureEvidence::Action(evidence)) => {
                assert_eq!(evidence.outcome, ActionDispatchOutcome::Unknown);
                assert_eq!(evidence.origin, ActionFailureOrigin::Unknown);
                assert_eq!(evidence.retry_after_seconds, None);
            }
            _ => panic!("default action evidence was lost"),
        }
    }
}
