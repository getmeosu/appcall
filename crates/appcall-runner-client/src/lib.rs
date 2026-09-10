//! Optional async Bun transport. No HTTP dependencies are introduced into the
//! embedded engine. This client never retries requests or follows redirects.
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    fmt,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

pub const PROTOCOL_VERSION: &str = "2026-05-14";
pub const DEFAULT_WIRE_LIMIT: usize = 8 * 1024 * 1024;
const REQUEST_ID_HEADER: &str = "x-request-id";

#[derive(Clone, Debug)]
pub struct ClientOptions {
    pub timeout: Duration,
    pub max_request_bytes: usize,
    pub max_response_bytes: usize,
}
impl Default for ClientOptions {
    fn default() -> Self {
        Self {
            timeout: Duration::from_secs(60),
            max_request_bytes: DEFAULT_WIRE_LIMIT,
            max_response_bytes: DEFAULT_WIRE_LIMIT,
        }
    }
}
#[derive(Clone, Debug)]
pub struct RequestContext {
    pub request_id: String,
    pub deadline_unix_ms: Option<u64>,
}
impl Default for RequestContext {
    fn default() -> Self {
        Self {
            request_id: "req_runner_client".into(),
            deadline_unix_ms: None,
        }
    }
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DispatchOutcome {
    NotDispatched,
    ResponseReceived,
    Unknown,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ErrorKind {
    Configuration,
    InvalidRequest,
    RequestTooLarge,
    Timeout,
    Transport,
    RedirectBlocked,
    ResponseTooLarge,
    MalformedResponse,
    HttpStatus,
    Runner,
    IncompatibleProtocol,
}
#[derive(Clone, Debug)]
pub struct Error {
    pub kind: ErrorKind,
    pub outcome: DispatchOutcome,
    pub code: Option<String>,
    pub retry_after_seconds: Option<u64>,
    pub message: String,
}
impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "runner {:?}: {}", self.kind, self.message)
    }
}
impl std::error::Error for Error {}
impl Error {
    fn new(kind: ErrorKind, outcome: DispatchOutcome, message: &str) -> Self {
        Self {
            kind,
            outcome,
            code: None,
            retry_after_seconds: None,
            message: message.into(),
        }
    }
}
pub type Result<T> = std::result::Result<T, Error>;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DescribeResponse {
    pub protocol_version: String,
    pub runner: String,
    #[serde(default)]
    pub durable_capabilities: Vec<String>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct HealthcheckResponse {
    pub status: String,
    #[serde(default)]
    pub source: String,
    #[serde(flatten)]
    pub metadata: serde_json::Map<String, Value>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionExecuteRequest {
    pub connector_key: String,
    pub action: String,
    pub input: Value,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncListRequest {
    pub connector_key: String,
    pub sync: String,
    pub input: Value,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct OutputResponse {
    pub output: Value,
}
pub type ActionExecuteResponse = OutputResponse;
pub type SyncListResponse = OutputResponse;
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WebhookVerifyRequest {
    pub connector_key: String,
    #[serde(skip_serializing_if = "std::collections::BTreeMap::is_empty")]
    pub headers: std::collections::BTreeMap<String, String>,
    pub payload: Value,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct WebhookVerifyResponse {
    pub verified: bool,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WebhookParseRequest {
    pub connector_key: String,
    pub payload: Value,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WebhookParseResponse {
    pub idempotency_key: String,
    #[serde(default)]
    pub operation: String,
    pub sanitized: Value,
}

// Deliberately no derived Debug: reqwest and bearer configuration are private.
#[derive(Clone)]
pub struct RunnerClient {
    endpoint: reqwest::Url,
    http: reqwest::Client,
    bearer: String,
    options: ClientOptions,
}
#[derive(Deserialize)]
struct Envelope {
    id: Option<String>,
    ok: Option<bool>,
    result: Option<Value>,
    error: Option<RemoteError>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RemoteError {
    code: String,
    message: String,
    retry_after_seconds: Option<u64>,
}

impl RunnerClient {
    pub fn new(base_url: &str, bearer_token: &str, options: ClientOptions) -> Result<Self> {
        let invalid = || {
            Error::new(
                ErrorKind::Configuration,
                DispatchOutcome::NotDispatched,
                "Invalid runner client configuration.",
            )
        };
        if options.timeout.is_zero()
            || options.max_request_bytes == 0
            || options.max_response_bytes == 0
            || options.timeout.as_millis() > u64::MAX as u128
        {
            return Err(invalid());
        }
        let mut endpoint = reqwest::Url::parse(base_url).map_err(|_| invalid())?;
        if !matches!(endpoint.scheme(), "http" | "https")
            || !endpoint.username().is_empty()
            || endpoint.password().is_some()
            || endpoint.query().is_some()
            || endpoint.fragment().is_some()
            || endpoint.host_str().is_none()
        {
            return Err(invalid());
        }
        endpoint.set_path(&format!("{}/rpc", endpoint.path().trim_end_matches('/')));
        let bearer = bearer_token.trim().to_owned();
        let mut headers = reqwest::header::HeaderMap::new();
        if !bearer.is_empty() {
            let mut header = reqwest::header::HeaderValue::from_str(&format!("Bearer {bearer}"))
                .map_err(|_| invalid())?;
            header.set_sensitive(true);
            headers.insert(reqwest::header::AUTHORIZATION, header);
        }
        let http = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .default_headers(headers)
            .no_proxy()
            .build()
            .map_err(|_| invalid())?;
        Ok(Self {
            endpoint,
            http,
            bearer,
            options,
        })
    }
    pub async fn describe(&self, context: &RequestContext) -> Result<DescribeResponse> {
        let response: DescribeResponse = self.call(context, "runner.describe", None).await?;
        if response.protocol_version != PROTOCOL_VERSION {
            return Err(Error::new(
                ErrorKind::IncompatibleProtocol,
                DispatchOutcome::ResponseReceived,
                "Runner protocol is incompatible.",
            ));
        }
        Ok(response)
    }
    pub async fn healthcheck(
        &self,
        context: &RequestContext,
        connector_key: &str,
        input: Value,
    ) -> Result<HealthcheckResponse> {
        self.call(
            context,
            "connector.healthcheck",
            Some(json!({"connectorKey":connector_key,"input":input})),
        )
        .await
    }
    pub async fn action_execute(
        &self,
        context: &RequestContext,
        request: ActionExecuteRequest,
    ) -> Result<ActionExecuteResponse> {
        self.call(
            context,
            "connector.action.execute",
            Some(to_value(request)?),
        )
        .await
    }
    pub async fn sync_list(
        &self,
        context: &RequestContext,
        request: SyncListRequest,
    ) -> Result<SyncListResponse> {
        self.call(context, "connector.sync.list", Some(to_value(request)?))
            .await
    }
    pub async fn webhook_verify(
        &self,
        context: &RequestContext,
        request: WebhookVerifyRequest,
    ) -> Result<WebhookVerifyResponse> {
        self.call(
            context,
            "connector.webhook.verify",
            Some(to_value(request)?),
        )
        .await
    }
    pub async fn webhook_parse(
        &self,
        context: &RequestContext,
        request: WebhookParseRequest,
    ) -> Result<WebhookParseResponse> {
        self.call(context, "connector.webhook.parse", Some(to_value(request)?))
            .await
    }
    async fn call<T: DeserializeOwned>(
        &self,
        context: &RequestContext,
        method: &str,
        params: Option<Value>,
    ) -> Result<T> {
        if context.request_id.is_empty() || context.request_id.len() > 256 {
            return Err(Error::new(
                ErrorKind::InvalidRequest,
                DispatchOutcome::NotDispatched,
                "Invalid request correlation ID.",
            ));
        }
        let now = unix_ms()?;
        let deadline = now
            .saturating_add(self.options.timeout.as_millis() as u64)
            .min(context.deadline_unix_ms.unwrap_or(u64::MAX));
        if deadline <= now {
            return Err(timeout(DispatchOutcome::NotDispatched));
        }
        let mut secrets = vec![self.bearer.clone()];
        if let Some(value) = &params {
            collect_secrets(value, &mut secrets, 0);
        }
        let mut envelope =
            json!({"id":context.request_id,"method":method,"deadlineUnixMs":deadline});
        if let Some(params) = params {
            envelope["params"] = params;
        }
        let bytes = serde_json::to_vec(&envelope).map_err(|_| {
            Error::new(
                ErrorKind::InvalidRequest,
                DispatchOutcome::NotDispatched,
                "Runner request cannot be encoded.",
            )
        })?;
        if bytes.len() > self.options.max_request_bytes {
            return Err(Error::new(
                ErrorKind::RequestTooLarge,
                DispatchOutcome::NotDispatched,
                "Runner request exceeds the wire byte limit.",
            ));
        }
        let remaining = deadline.saturating_sub(unix_ms()?);
        if remaining == 0 {
            return Err(timeout(DispatchOutcome::NotDispatched));
        }
        let monotonic_deadline = tokio::time::Instant::now() + Duration::from_millis(remaining);
        let result = tokio::time::timeout(
            Duration::from_millis(remaining),
            self.exchange::<T>(&context.request_id, bytes, &secrets),
        )
        .await
        .map_err(|_| timeout(DispatchOutcome::Unknown))?;
        if tokio::time::Instant::now() >= monotonic_deadline {
            return Err(timeout(DispatchOutcome::Unknown));
        }
        result
    }
    async fn exchange<T: DeserializeOwned>(
        &self,
        id: &str,
        body: Vec<u8>,
        secrets: &[String],
    ) -> Result<T> {
        let unknown = |kind, message| Error::new(kind, DispatchOutcome::Unknown, message);
        let mut request = self
            .http
            .post(self.endpoint.clone())
            .header("content-type", "application/json")
            .header("accept", "application/json");
        if is_safe_request_id(id) {
            request = request.header(REQUEST_ID_HEADER, id);
        }
        let mut response = request
            .body(body)
            .send()
            .await
            .map_err(|_| unknown(ErrorKind::Transport, "Runner transport failed."))?;
        if response.status().is_redirection() {
            return Err(unknown(
                ErrorKind::RedirectBlocked,
                "Runner redirects are prohibited.",
            ));
        }
        if response
            .content_length()
            .is_some_and(|length| length > self.options.max_response_bytes as u64)
        {
            return Err(unknown(
                ErrorKind::ResponseTooLarge,
                "Runner response exceeds the wire byte limit.",
            ));
        }
        let status = response.status();
        let mut bytes = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_| unknown(ErrorKind::Transport, "Runner response body failed."))?
        {
            if chunk.len() > self.options.max_response_bytes.saturating_sub(bytes.len()) {
                return Err(unknown(
                    ErrorKind::ResponseTooLarge,
                    "Runner response exceeds the wire byte limit.",
                ));
            }
            bytes.extend_from_slice(&chunk);
        }
        let malformed = || {
            unknown(
                ErrorKind::MalformedResponse,
                "Runner response envelope is malformed.",
            )
        };
        // from_slice consumes the entire input and rejects trailing JSON and
        // duplicate struct fields, unlike a single streaming decode.
        let envelope: Envelope = serde_json::from_slice(&bytes).map_err(|_| malformed())?;
        if envelope.id.as_deref() != Some(id) {
            return Err(malformed());
        }
        match (envelope.ok, envelope.result, envelope.error) {
            (Some(true), Some(result), None) if status.is_success() => {
                serde_json::from_value(result).map_err(|_| malformed())
            }
            (Some(false), None, Some(error)) if !error.code.is_empty() => {
                let admission_busy = status == reqwest::StatusCode::SERVICE_UNAVAILABLE
                    && error.code == "RUNNER_BUSY";
                if error.code == "RUNNER_BUSY" && !admission_busy {
                    return Err(malformed());
                }
                let ambiguous = matches!(
                    error.code.as_str(),
                    "OPERATION_TIMEOUT" | "OUTBOUND_TIMEOUT"
                );
                Err(Error {
                    kind: ErrorKind::Runner,
                    outcome: if admission_busy {
                        DispatchOutcome::NotDispatched
                    } else if ambiguous {
                        DispatchOutcome::Unknown
                    } else {
                        DispatchOutcome::ResponseReceived
                    },
                    code: Some(redact(&error.code, secrets)),
                    retry_after_seconds: error.retry_after_seconds,
                    message: redact(&error.message, secrets),
                })
            }
            _ => Err(malformed()),
        }
    }
}
fn to_value(value: impl Serialize) -> Result<Value> {
    serde_json::to_value(value).map_err(|_| {
        Error::new(
            ErrorKind::InvalidRequest,
            DispatchOutcome::NotDispatched,
            "Invalid runner request.",
        )
    })
}
fn unix_ms() -> Result<u64> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis().min(u64::MAX as u128) as u64)
        .map_err(|_| {
            Error::new(
                ErrorKind::Configuration,
                DispatchOutcome::NotDispatched,
                "System clock is invalid.",
            )
        })
}
fn timeout(outcome: DispatchOutcome) -> Error {
    Error::new(
        ErrorKind::Timeout,
        outcome,
        "Runner request deadline exceeded.",
    )
}
fn is_safe_request_id(id: &str) -> bool {
    let bytes = id.as_bytes();
    !bytes.is_empty()
        && bytes.len() <= 256
        && bytes[0].is_ascii_alphanumeric()
        && bytes[1..]
            .iter()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b':' | b'-'))
}
fn collect_secrets(value: &Value, secrets: &mut Vec<String>, depth: usize) {
    if depth > 32 {
        return;
    }
    match value {
        Value::Object(fields) => {
            for (key, value) in fields {
                let key: String = key
                    .chars()
                    .filter(|c| c.is_ascii_alphanumeric())
                    .flat_map(char::to_lowercase)
                    .collect();
                if [
                    "token",
                    "secret",
                    "password",
                    "apikey",
                    "authorization",
                    "credential",
                    "basicauth",
                    "cookie",
                ]
                .iter()
                .any(|part| key.contains(part))
                {
                    if let Some(secret) = value.as_str() {
                        secrets.push(secret.into());
                    }
                }
                collect_secrets(value, secrets, depth + 1);
            }
        }
        Value::Array(values) => {
            for value in values {
                collect_secrets(value, secrets, depth + 1);
            }
        }
        _ => {}
    }
}
fn redact(message: &str, secrets: &[String]) -> String {
    // Bound diagnostic work without returning a prefix of an unredacted secret.
    if message.len() > 4096 || secrets.len() > 128 {
        return "Runner returned an error.".into();
    }
    let mut variants = Vec::new();
    for secret in secrets.iter().filter(|secret| !secret.is_empty()) {
        variants.push(secret.clone());
        let mut url = reqwest::Url::parse("https://redact.invalid").expect("static URL");
        url.query_pairs_mut().append_pair("v", secret);
        let encoded = url
            .query()
            .unwrap_or("")
            .strip_prefix("v=")
            .unwrap_or("")
            .to_owned();
        variants.push(encoded.replace('+', "%20"));
        variants.push(encoded);
    }
    let lowercase_escapes: Vec<String> = variants
        .iter()
        .map(|value| {
            let mut bytes = value.as_bytes().to_vec();
            for index in 0..bytes.len().saturating_sub(2) {
                if bytes[index] == b'%' {
                    bytes[index + 1] = bytes[index + 1].to_ascii_lowercase();
                    bytes[index + 2] = bytes[index + 2].to_ascii_lowercase();
                }
            }
            String::from_utf8(bytes).expect("ASCII escape edits preserve UTF-8")
        })
        .collect();
    variants.extend(lowercase_escapes);
    variants.sort_by_key(|value| std::cmp::Reverse(value.len()));
    variants.dedup();
    let mut safe = message.to_owned();
    for variant in variants {
        if !variant.is_empty() {
            safe = safe.replace(&variant, "[REDACTED]");
        }
    }
    safe.chars().take(4096).collect()
}
