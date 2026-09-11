use crate::*;
use appcall_connectors::Registry;
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::BTreeMap;

pub struct HttpResponse {
    pub status: u16,
    pub body: Option<Value>,
}
pub struct Server<L, E, U = ()> {
    registry: Registry,
    connections: L,
    executor: E,
    usage: U,
}
impl<L: ConnectionLister, E: ActionExecutor, U: UsageRecorder> Server<L, E, U> {
    pub fn new(registry: Registry, connections: L, executor: E, usage: U) -> Self {
        Self {
            registry,
            connections,
            executor,
            usage,
        }
    }
    pub fn database_health(&self) -> Option<bool> {
        self.connections.database_health()
    }
    pub fn usage(&self) -> &U {
        &self.usage
    }
    /// The host must bound reads to MAX_REQUEST_BYTES + 1 before buffering.
    /// Dropping this future cancels in-flight action execution; its durable action
    /// claim preserves the existing no-automatic-retry boundary after dispatch.
    pub async fn handle_http(&self, method: &str, scope: &Scope, body: &[u8]) -> HttpResponse {
        if scope.project_id.is_empty() {
            return http_error(401, "UNAUTHORIZED", "Missing or invalid API key.");
        }
        if method != "POST" {
            return http_error(405, "METHOD_NOT_ALLOWED", "Use POST to send MCP requests.");
        }
        if body.len() > MAX_REQUEST_BYTES {
            return http_error(
                413,
                "REQUEST_TOO_LARGE",
                "Request body exceeded the configured size limit.",
            );
        }
        let body = self.handle(scope, body).await;
        HttpResponse {
            status: if body.is_some() { 200 } else { 202 },
            body,
        }
    }
    pub async fn handle(&self, scope: &Scope, raw: &[u8]) -> Option<Value> {
        let request: Value = match serde_json::from_slice(raw) {
            Ok(v) => v,
            Err(_) => return Some(rpc_error(None, -32700, "Parse error.")),
        };
        if request.is_null() {
            return None;
        }
        for field in ["jsonrpc", "method"] {
            if request
                .get(field)
                .is_some_and(|v| !v.is_null() && !v.is_string())
            {
                return Some(rpc_error(None, -32700, "Parse error."));
            }
        }
        let id = request.get("id").cloned();
        if !request.is_object() {
            return Some(rpc_error(None, -32700, "Parse error."));
        }
        let method = request
            .get("method")
            .and_then(Value::as_str)
            .unwrap_or_default();
        if request.get("jsonrpc").and_then(Value::as_str) != Some("2.0") || method.is_empty() {
            return id.map(|id| rpc_error(Some(id), -32600, "Invalid request."));
        }
        // No notification dispatches side effects. Cancellation notifications are
        // accepted without a response, matching the stateless Go gateway.
        let id = id?;
        let result = match method {
            "initialize" => {
                json!({"protocolVersion":PROTOCOL_VERSION,"capabilities":{"tools":{"listChanged":false}},"serverInfo":{"name":"appcall-mcp-gateway","version":"0.1.0"}})
            }
            "ping" => json!({}),
            "notifications/initialized" | "notifications/cancelled" => return None,
            "tools/list" => match self.list_tools(scope).await {
                Ok(tools) => json!({"tools":tools}),
                Err(_) => return Some(rpc_error(Some(id), -32603, "Tools could not be listed.")),
            },
            "tools/call" => {
                let params = request.get("params").cloned().unwrap_or(Value::Null);
                let call = if params.is_null() {
                    CallParams::default()
                } else {
                    match serde_json::from_value::<CallParams>(params) {
                        Ok(c) => c,
                        Err(_) => {
                            return Some(rpc_error(Some(id), -32600, "Invalid tools/call params."))
                        }
                    }
                };
                if call.name.is_empty() {
                    return Some(rpc_error(
                        Some(id),
                        -32600,
                        "tools/call requires a tool name.",
                    ));
                }
                match self
                    .call_tool_with_key(
                        scope,
                        &call.name,
                        call.arguments,
                        call.idempotency_key,
                        call.connection_id,
                    )
                    .await
                {
                    Ok(result) => result,
                    Err(_) => return Some(rpc_error(Some(id), -32603, "Tool execution failed.")),
                }
            }
            _ => return Some(rpc_error(Some(id), -32601, "Method not found.")),
        };
        Some(json!({"jsonrpc":"2.0","id":id,"result":result}))
    }
    async fn scoped_connections(
        &self,
        scope: &Scope,
    ) -> Result<Vec<Connection>, InfrastructureError> {
        if scope.project_id.is_empty() {
            return Err(InfrastructureError);
        }
        if scope.account_id.is_empty() {
            return Ok(Vec::new());
        }
        Ok(self
            .connections
            .list(&scope.project_id)
            .await?
            .into_iter()
            .filter(|c| {
                c.project_id == scope.project_id
                    && c.status == "active"
                    && connection_visible_to_scope(scope, c)
            })
            .collect())
    }
    pub async fn list_tools(&self, scope: &Scope) -> Result<Vec<Value>, InfrastructureError> {
        let mut connection_ids_by_connector = BTreeMap::<String, Vec<String>>::new();
        for connection in self.scoped_connections(scope).await? {
            connection_ids_by_connector
                .entry(connection.connector)
                .or_default()
                .push(connection.id);
        }
        let mut tools = Vec::new();
        for (key, mut connection_ids) in connection_ids_by_connector {
            connection_ids.sort_unstable();
            connection_ids.dedup();
            let Ok(connector) = self.registry.connector(&key) else {
                continue;
            };
            for (operation, op) in &connector.manifest().operations {
                if !op.has_tool_schema() || !tool_allowed(&scope.profile, &key, operation) {
                    continue;
                }
                let annotations = if op.is_read_only() {
                    json!({"readOnlyHint":true})
                } else {
                    json!({"readOnlyHint":false,"destructiveHint":op.side_effect.is_empty()||op.is_destructive()})
                };
                // Keep provider input schemas stable; the authenticated connection
                // target is a gateway-level selector carried in MCP metadata.
                let mut tool = json!({
                    "name":encode_tool_name(&key,operation),
                    "inputSchema":op.input_schema,
                    "annotations":annotations,
                    "_meta":{
                        "appcall":{
                            "connectionIds":connection_ids,
                            "connectionSelector":{
                                "location":"tools/call.params.connectionId",
                                "schema":{"type":"string","enum":connection_ids}
                            }
                        }
                    }
                });
                if !op.title.is_empty() {
                    tool["title"] = json!(op.title)
                }
                if !op.description.is_empty() {
                    tool["description"] = json!(op.description)
                }
                if let Some(output) = &op.output_schema {
                    tool["outputSchema"] = output.clone()
                }
                tools.push(tool);
            }
        }
        Ok(tools)
    }
    pub async fn call_tool(
        &self,
        scope: &Scope,
        name: &str,
        input: Value,
    ) -> Result<Value, InfrastructureError> {
        self.call_tool_with_key(scope, name, input, None, None)
            .await
    }
    pub async fn call_tool_for_connection(
        &self,
        scope: &Scope,
        name: &str,
        connection_id: &str,
        input: Value,
    ) -> Result<Value, InfrastructureError> {
        self.call_tool_with_key(scope, name, input, None, Some(connection_id.to_owned()))
            .await
    }
    async fn call_tool_with_key(
        &self,
        scope: &Scope,
        name: &str,
        input: Value,
        idempotency_key: Option<String>,
        connection_id: Option<String>,
    ) -> Result<Value, InfrastructureError> {
        if scope.project_id.is_empty() {
            return Ok(tool_error("UNAUTHORIZED", "Missing or invalid API key."));
        }
        if scope.account_id.is_empty() {
            return Ok(tool_error(
                "MISSING_ACCOUNT_SCOPE",
                "An account scope is required to execute MCP tools.",
            ));
        }
        if !idempotency_key.as_deref().is_none_or(valid_idempotency_key) {
            return Ok(tool_error("INVALID_TOOL_INPUT", "Invalid idempotency key."));
        }
        if !connection_id.as_deref().is_none_or(valid_connection_id) {
            return Ok(tool_error("INVALID_TOOL_INPUT", "Invalid connection ID."));
        }
        let Some((connector, operation)) = decode_tool_name(name) else {
            return Ok(tool_error("UNKNOWN_TOOL", "Unknown tool."));
        };
        let Ok(op) = self.registry.operation(connector, &operation) else {
            return Ok(tool_error("UNKNOWN_TOOL", "Unknown tool."));
        };
        if !op.has_tool_schema() {
            return Ok(tool_error("UNKNOWN_TOOL", "Unknown tool."));
        }
        if !tool_allowed(&scope.profile, connector, &operation) {
            return Ok(tool_error(
                "TOOL_NOT_ALLOWED",
                "Tool is not allowed for this capability profile.",
            ));
        }
        let connection = match self
            .select_connection(scope, connector, connection_id.as_deref())
            .await?
        {
            Ok(connection) => connection,
            Err(error) => return Ok(tool_error(error.code(), error.message())),
        };
        let idempotency_key = idempotency_key.unwrap_or_default();
        let request = appcall_actions::ExecuteRequest {
            project_id: scope.project_id.clone(),
            connection_id: connection.id.clone(),
            external_account_id: scope.account_id.clone(),
            admin_scope: false,
            action: operation.clone(),
            idempotency_key: idempotency_key.clone(),
            input,
            caller_credential: scope.connector_token.clone(),
        };
        match self.executor.execute(request).await {
            Ok(result) => {
                let _ =
                    self.usage
                        .record(&scope.project_id, &scope.account_id, connector, &operation);
                let metadata = action_metadata(
                    Some(&result.request_id),
                    Some(&result.replay_log_id),
                    Some(&idempotency_key),
                    None,
                );
                let output = result.output;
                let mut payload =
                    json!({"content":[{"type":"text","text":output.to_string()}],"isError":false});
                if output.is_object() {
                    payload["structuredContent"] = output
                }
                attach_action_metadata(&mut payload, Some(metadata));
                Ok(payload)
            }
            Err(error) => {
                let code = match error.code.as_str() {
                    "INVALID_ACTION_INPUT" => "INVALID_TOOL_INPUT",
                    "CONNECTION_NOT_FOUND" => "CONNECTION_REQUIRED",
                    c if safe_code(c) => c,
                    _ => "ACTION_FAILED",
                };
                let message = failure_message(&error, code);
                let metadata = action_metadata(
                    Some(&error.request_id),
                    None,
                    Some(&idempotency_key),
                    Some(error.evidence.as_ref()),
                );
                Ok(tool_error_with_metadata(code, &message, Some(metadata)))
            }
        }
    }
    async fn select_connection(
        &self,
        scope: &Scope,
        connector: &str,
        requested_id: Option<&str>,
    ) -> Result<Result<Connection, ConnectionSelectionError>, InfrastructureError> {
        let connections = self.connections.list(&scope.project_id).await?;
        if let Some(requested_id) = requested_id {
            let Some(connection) = connections.iter().find(|c| c.id == requested_id) else {
                return Ok(Err(ConnectionSelectionError::NotFound));
            };
            if connection.project_id != scope.project_id
                || connection.connector != connector
                || !connection_visible_to_scope(scope, connection)
            {
                return Ok(Err(ConnectionSelectionError::NotFound));
            }
            if connection.status != "active" {
                return Ok(Err(ConnectionSelectionError::Disconnected));
            }
            return Ok(Ok(connection.clone()));
        }

        let connections: Vec<_> = connections
            .into_iter()
            .filter(|c| {
                c.project_id == scope.project_id
                    && c.connector == connector
                    && c.status == "active"
                    && connection_visible_to_scope(scope, c)
            })
            .collect();
        let preferred: Vec<_> = if scope.account_id.is_empty() {
            connections
        } else {
            let own: Vec<_> = connections
                .iter()
                .filter(|c| c.external_account_id == scope.account_id)
                .cloned()
                .collect();
            if own.is_empty() {
                connections
                    .into_iter()
                    .filter(|c| c.external_account_id.is_empty())
                    .collect()
            } else {
                own
            }
        };
        match preferred.as_slice() {
            [] => Ok(Err(ConnectionSelectionError::Required)),
            [connection] => Ok(Ok(connection.clone())),
            _ => Ok(Err(ConnectionSelectionError::Ambiguous)),
        }
    }
}
#[derive(Deserialize)]
struct CallParams {
    #[serde(default)]
    name: String,
    #[serde(default = "empty_arguments")]
    arguments: Value,
    #[serde(
        default,
        deserialize_with = "deserialize_present_idempotency_key",
        rename = "idempotencyKey"
    )]
    idempotency_key: Option<String>,
    #[serde(
        default,
        deserialize_with = "deserialize_present_connection_id",
        rename = "connectionId"
    )]
    connection_id: Option<String>,
}
fn empty_arguments() -> Value {
    json!({})
}
fn deserialize_present_idempotency_key<'de, D>(deserializer: D) -> Result<Option<String>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    String::deserialize(deserializer).map(Some)
}
fn deserialize_present_connection_id<'de, D>(deserializer: D) -> Result<Option<String>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    String::deserialize(deserializer).map(Some)
}
impl Default for CallParams {
    fn default() -> Self {
        Self {
            name: String::new(),
            arguments: empty_arguments(),
            idempotency_key: None,
            connection_id: None,
        }
    }
}
fn valid_idempotency_key(key: &str) -> bool {
    !key.is_empty() && key.len() <= 128 && key.bytes().all(|b| (33..=126).contains(&b))
}
fn valid_connection_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 256 && !id.chars().any(|c| c.is_control() || c.is_whitespace())
}
fn connection_visible_to_scope(scope: &Scope, connection: &Connection) -> bool {
    !scope.account_id.is_empty()
        && (connection.external_account_id.is_empty()
            || connection.external_account_id == scope.account_id)
}
#[derive(Clone, Copy)]
enum ConnectionSelectionError {
    Required,
    Ambiguous,
    NotFound,
    Disconnected,
}
impl ConnectionSelectionError {
    fn code(self) -> &'static str {
        match self {
            Self::Required => "CONNECTION_REQUIRED",
            Self::Ambiguous => "CONNECTION_AMBIGUOUS",
            Self::NotFound => "CONNECTION_NOT_FOUND",
            Self::Disconnected => "CONNECTION_DISCONNECTED",
        }
    }
    fn message(self) -> &'static str {
        match self {
            Self::Required => "No active connection for this connector. Connect it first.",
            Self::Ambiguous => {
                "Multiple active connections match this connector. Specify connectionId."
            }
            Self::NotFound => "The selected connection is not available for this scope.",
            Self::Disconnected => "The selected connection is disconnected.",
        }
    }
}
fn safe_code(code: &str) -> bool {
    !code.is_empty()
        && code.len() <= 96
        && code
            .bytes()
            .all(|b| b.is_ascii_uppercase() || b.is_ascii_digit() || b == b'_')
}
const MAX_MCP_RETRY_AFTER_SECONDS: u64 = 86_400;
const MAX_MCP_METADATA_ID_BYTES: usize = 256;
fn action_metadata(
    request_id: Option<&str>,
    replay_log_id: Option<&str>,
    idempotency_key: Option<&str>,
    evidence: Option<&appcall_actions::ActionFailureEvidence>,
) -> Value {
    let mut metadata = json!({});
    if let Some(request_id) = request_id.and_then(bounded_metadata_id) {
        metadata["requestId"] = json!(request_id);
    }
    if let Some(replay_log_id) = replay_log_id
        .filter(|id| !id.is_empty())
        .and_then(bounded_metadata_id)
    {
        metadata["replayLogId"] = json!(replay_log_id);
    }
    if let Some(idempotency_key) = idempotency_key.and_then(bounded_idempotency_key) {
        metadata["idempotencyKey"] = json!(idempotency_key);
    }
    if let Some(evidence) = evidence {
        metadata["dispatch"] = json!({
            "outcome": dispatch_outcome(evidence.outcome),
            "origin": failure_origin(evidence.origin),
        });
        if let Some(seconds) = evidence
            .retry_after_seconds
            .map(|seconds| seconds.min(MAX_MCP_RETRY_AFTER_SECONDS))
        {
            metadata["retryAfterSeconds"] = json!(seconds);
        }
    }
    metadata
}
fn bounded_metadata_id(value: &str) -> Option<&str> {
    (!value.is_empty()
        && value.len() <= MAX_MCP_METADATA_ID_BYTES
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b':')))
    .then_some(value)
}
fn bounded_idempotency_key(value: &str) -> Option<&str> {
    valid_idempotency_key(value).then_some(value)
}
fn dispatch_outcome(outcome: appcall_actions::ActionDispatchOutcome) -> &'static str {
    match outcome {
        appcall_actions::ActionDispatchOutcome::NotDispatched => "not_dispatched",
        appcall_actions::ActionDispatchOutcome::ResponseReceived => "response_received",
        appcall_actions::ActionDispatchOutcome::Unknown => "unknown",
    }
}
fn failure_origin(origin: appcall_actions::ActionFailureOrigin) -> &'static str {
    match origin {
        appcall_actions::ActionFailureOrigin::Unknown => "unknown",
        appcall_actions::ActionFailureOrigin::LocalAdmission => "local_admission",
        appcall_actions::ActionFailureOrigin::LocalValidation => "local_validation",
        appcall_actions::ActionFailureOrigin::Runner => "runner",
    }
}
fn failure_message(error: &appcall_actions::ActionError, code: &str) -> String {
    if let Some(size) = error.detail.as_ref().and_then(|d| d.response_size.as_ref()) {
        return format!("Result too large: {} bytes exceeds the {}-byte limit. The full result was withheld (truncated, not delivered) — narrow the query or paginate.", size.actual_bytes, size.limit_bytes);
    }
    let gate = gate_message(code);
    if gate != "Tool execution failed." {
        return gate.to_owned();
    }
    if let Some(message) = error
        .detail
        .as_ref()
        .and_then(|d| d.safe_message.as_deref())
        .map(str::trim)
        .filter(|m| !m.is_empty())
    {
        return format!("Tool execution failed: {code}: {message}");
    }
    gate.to_owned()
}
fn gate_message(code: &str) -> &'static str {
    match code {
        "LINKEDIN_WARMUP_LIMITED"=>"This LinkedIn account is still new, so it is in a warm-up ramp: today's safety ceiling for this action is already used. The ceiling rises automatically as the account ages — try again tomorrow.",
        "LINKEDIN_ACTION_TOO_FAST"=>"LinkedIn actions are spaced to look human, and this one fired too soon after the previous one. Wait a few minutes and retry.",
        "LINKEDIN_NOTED_INVITE_CAP_EXCEEDED"=>"The monthly quota of personalized-note invitations (~5/month on free LinkedIn) is used up. Send the invitation without a note, or wait for the calendar month to reset.",
        "LINKEDIN_INVITE_CAP_EXCEEDED"=>"This account's LinkedIn invitation ceiling (daily/weekly safety cap) is reached. Wait for the window to reset before sending more invitations.",
        "LINKEDIN_MESSAGE_CAP_EXCEEDED"=>"This account's LinkedIn message ceiling is reached for the current window.",
        "LINKEDIN_VIEW_CAP_EXCEEDED"=>"This account's LinkedIn profile-view/search ceiling is reached for the current window.",
        "CONNECTION_RESTRICTED"=>"LinkedIn flagged this account, so the connection is quarantined and all sends fail closed. Reconnect the account to clear the quarantine.",
        "SEND_CAP_EXCEEDED"=>"The outbound send-volume cap for this brand is reached for the current window.",
        "SPEND_CAP_EXCEEDED"=>"The daily spend cap is reached.",
        "CIRCUIT_OPEN"=>"This connection's circuit breaker is open after repeated upstream failures. Wait and retry later.",
        _=>"Tool execution failed.",
    }
}
fn tool_error(code: &str, message: &str) -> Value {
    tool_error_with_metadata(code, message, None)
}
fn tool_error_with_metadata(code: &str, message: &str, metadata: Option<Value>) -> Value {
    let mut payload = json!({"content":[{"type":"text","text":message}],"isError":true,"structuredContent":{"code":code,"message":message}});
    attach_action_metadata(&mut payload, metadata);
    payload
}
fn attach_action_metadata(payload: &mut Value, metadata: Option<Value>) {
    if let Some(metadata) = metadata {
        if metadata
            .as_object()
            .is_some_and(|object| !object.is_empty())
        {
            payload["_meta"] = json!({"appcall": metadata});
        }
    }
}
fn rpc_error(id: Option<Value>, code: i32, message: &str) -> Value {
    let mut v = json!({"jsonrpc":"2.0","error":{"code":code,"message":message}});
    if let Some(id) = id {
        v["id"] = id
    }
    v
}
fn http_error(status: u16, code: &str, message: &str) -> HttpResponse {
    HttpResponse {
        status,
        body: Some(json!({"error":{"code":code,"message":message}})),
    }
}
