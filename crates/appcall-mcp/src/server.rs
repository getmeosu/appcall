use crate::session::{SessionBinding, SessionError, SessionRegistry, MAX_MCP_SESSIONS};
use crate::*;
use appcall_connectors::Registry;
use serde::Deserialize;
use serde_json::{json, Value};
use std::{
    collections::BTreeSet,
    future::Future,
    pin::Pin,
    sync::Arc,
    task::{Context, Poll},
};
use url::Url;

pub const MAX_MCP_IN_FLIGHT_REQUESTS: usize = 128;
const MAX_MCP_REQUEST_ID_BYTES: usize = 256;
pub const MCP_PROTOCOL_VERSION_HEADER: &str = "MCP-Protocol-Version";

#[derive(Clone, Debug, Default)]
pub struct McpTransportConfig {
    allowed_origins: BTreeSet<String>,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct TransportConfigError;
impl McpTransportConfig {
    pub fn from_allowed_origins<I, S>(origins: I) -> Result<Self, TransportConfigError>
    where
        I: IntoIterator<Item = S>,
        S: AsRef<str>,
    {
        let mut allowed_origins = BTreeSet::new();
        for origin in origins {
            allowed_origins.insert(canonical_origin(origin.as_ref(), false)?);
        }
        Ok(Self { allowed_origins })
    }
    fn validate_headers(&self, headers: &[(String, String)]) -> Result<(), TransportHeaderError> {
        let protocol_values = header_values(headers, MCP_PROTOCOL_VERSION_HEADER);
        match protocol_values.as_slice() {
            [] => {}
            [value] if *value == PROTOCOL_VERSION => {}
            [value] if value.trim() != *value || value.is_empty() => {
                return Err(TransportHeaderError::ProtocolInvalid)
            }
            [_] => return Err(TransportHeaderError::ProtocolUnsupported),
            _ => return Err(TransportHeaderError::ProtocolInvalid),
        }

        let origin_values = header_values(headers, "Origin");
        match origin_values.as_slice() {
            [] => Ok(()),
            [_] => {
                let origin = canonical_origin(origin_values[0], true)
                    .map_err(|_| TransportHeaderError::OriginInvalid)?;
                if self.allowed_origins.contains(&origin) {
                    Ok(())
                } else {
                    Err(TransportHeaderError::OriginNotAllowed)
                }
            }
            _ => Err(TransportHeaderError::OriginInvalid),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum TransportHeaderError {
    ProtocolInvalid,
    ProtocolUnsupported,
    OriginInvalid,
    OriginNotAllowed,
}
impl TransportHeaderError {
    fn code(self) -> &'static str {
        match self {
            Self::ProtocolInvalid => "MCP_PROTOCOL_VERSION_INVALID",
            Self::ProtocolUnsupported => "MCP_PROTOCOL_VERSION_UNSUPPORTED",
            Self::OriginInvalid => "MCP_ORIGIN_INVALID",
            Self::OriginNotAllowed => "MCP_ORIGIN_NOT_ALLOWED",
        }
    }
    fn message(self) -> &'static str {
        match self {
            Self::ProtocolInvalid => {
                "MCP-Protocol-Version must contain one valid protocol version."
            }
            Self::ProtocolUnsupported => "The requested MCP protocol version is not supported.",
            Self::OriginInvalid => "Origin must contain one valid browser origin.",
            Self::OriginNotAllowed => "The request Origin is not allowed for MCP transport.",
        }
    }
}

fn header_values<'a>(headers: &'a [(String, String)], name: &str) -> Vec<&'a str> {
    headers
        .iter()
        .filter(|(header, _)| header.eq_ignore_ascii_case(name))
        .map(|(_, value)| value.as_str())
        .collect()
}

fn canonical_origin(raw: &str, request: bool) -> Result<String, TransportConfigError> {
    if raw.is_empty()
        || raw.trim() != raw
        || raw.eq_ignore_ascii_case("null")
        || raw.chars().any(char::is_control)
    {
        return Err(TransportConfigError);
    }
    let url = Url::parse(raw).map_err(|_| TransportConfigError)?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str().is_none()
        || url.username() != ""
        || url.password().is_some()
    {
        return Err(TransportConfigError);
    }
    if request
        && (url.path() != "" && url.path() != "/"
            || url.query().is_some()
            || url.fragment().is_some())
    {
        return Err(TransportConfigError);
    }
    Ok(url.origin().ascii_serialization())
}

struct ExecutionGuard {
    registration: InFlightRegistration,
    finished: bool,
}
impl ExecutionGuard {
    fn new(registration: InFlightRegistration) -> Self {
        Self {
            registration,
            finished: false,
        }
    }
    fn finish_execution(&mut self) -> bool {
        self.finished = true;
        self.registration.finish_execution()
    }
}
impl Drop for ExecutionGuard {
    fn drop(&mut self) {
        if !self.finished {
            self.registration.abort_execution();
        }
    }
}

struct AbortOnDrop<T>(Option<tokio::task::JoinHandle<T>>);
impl<T> AbortOnDrop<T> {
    fn new(handle: tokio::task::JoinHandle<T>) -> Self {
        Self(Some(handle))
    }
    fn detach(mut self) {
        // Dropping a JoinHandle detaches the task while releasing the runtime's
        // join reference. Keep the task alive, but do not leak its output or
        // handle when the caller no longer needs to await it.
        self.0.take();
    }
}
impl<T> Future for AbortOnDrop<T> {
    type Output = Result<T, tokio::task::JoinError>;

    fn poll(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Self::Output> {
        Pin::new(
            self.get_mut()
                .0
                .as_mut()
                .expect("detached task cannot be polled"),
        )
        .poll(cx)
    }
}
impl<T> Drop for AbortOnDrop<T> {
    fn drop(&mut self) {
        if let Some(handle) = self.0.as_ref() {
            handle.abort();
        }
    }
}

pub struct HttpResponse {
    pub status: u16,
    pub headers: Vec<(String, String)>,
    pub body: Option<Value>,
}
pub struct Server<L, E, U = ()> {
    registry: Registry,
    connections: L,
    executor: Arc<E>,
    usage: U,
    in_flight: Arc<InFlightRegistry>,
    sessions: Arc<SessionRegistry>,
    transport: McpTransportConfig,
}
impl<L: ConnectionLister, E: ActionExecutor + 'static, U: UsageRecorder> Server<L, E, U> {
    pub fn new(registry: Registry, connections: L, executor: E, usage: U) -> Self {
        Self {
            registry,
            connections,
            executor: Arc::new(executor),
            usage,
            in_flight: Arc::new(InFlightRegistry::new(MAX_MCP_IN_FLIGHT_REQUESTS)),
            sessions: Arc::new(SessionRegistry::new(MAX_MCP_SESSIONS)),
            transport: McpTransportConfig::default(),
        }
    }
    pub fn with_transport_config(mut self, transport: McpTransportConfig) -> Self {
        self.transport = transport;
        self
    }
    pub fn in_flight_len(&self) -> usize {
        self.in_flight.len()
    }
    pub fn session_len(&self) -> usize {
        self.sessions.len()
    }
    pub fn database_health(&self) -> Option<bool> {
        self.connections.database_health()
    }
    pub fn usage(&self) -> &U {
        &self.usage
    }
    /// The host must bound reads to MAX_REQUEST_BYTES + 1 before buffering.
    /// This compatibility path does not issue a server session because its
    /// `Scope` has no session state. Session-aware hosts must use
    /// `handle_http_with_headers` or `handle_http_with_context`.
    pub async fn handle_http(&self, method: &str, scope: &Scope, body: &[u8]) -> HttpResponse {
        self.handle_http_with_context_inner(method, scope, &McpRequestContext::legacy_http(), body)
            .await
    }
    pub async fn handle_http_with_headers(
        &self,
        method: &str,
        scope: &Scope,
        headers: &[(String, String)],
        body: &[u8],
    ) -> HttpResponse
    where
        E: 'static,
    {
        if scope.project_id.is_empty() {
            return http_error(401, "UNAUTHORIZED", "Missing or invalid API key.");
        }
        if let Err(error) = self.transport.validate_headers(headers) {
            return http_error(400, error.code(), error.message());
        }
        let context = McpRequestContext::from_headers(headers);
        self.handle_http_with_context_inner(method, scope, &context, body)
            .await
    }
    pub async fn handle_http_with_context(
        &self,
        method: &str,
        scope: &Scope,
        context: &McpRequestContext,
        body: &[u8],
    ) -> HttpResponse
    where
        E: 'static,
    {
        self.handle_http_with_context_inner(method, scope, context, body)
            .await
    }
    async fn handle_http_with_context_inner(
        &self,
        method: &str,
        scope: &Scope,
        context: &McpRequestContext,
        body: &[u8],
    ) -> HttpResponse
    where
        E: 'static,
    {
        if scope.project_id.is_empty() {
            return http_error(401, "UNAUTHORIZED", "Missing or invalid API key.");
        }
        if method == "DELETE" {
            return self.close_session(scope, context);
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
        let admission = session_admission(body);
        let mut context = context.clone();
        let mut issued_session = None;
        if !matches!(admission, SessionAdmission::Invalid) {
            if let Some(session_id) = context.session_id() {
                let binding = SessionBinding::from_scope(scope, &context);
                if let Err(error) = self.sessions.validate(session_id, &binding) {
                    return session_error(error);
                }
            } else if matches!(admission, SessionAdmission::Request) && context.admits_sessions() {
                let binding = SessionBinding::from_scope(scope, &context);
                let session_id = match self.sessions.issue(binding) {
                    Ok(session_id) => session_id,
                    Err(error) => return session_error(error),
                };
                context = context.with_session_id(&session_id);
                issued_session = Some(session_id);
            }
        }
        let body = self.handle_with_context(scope, &context, body).await;
        let headers = issued_session
            .map(|session_id| (MCP_SESSION_ID_HEADER.into(), session_id))
            .into_iter()
            .collect();
        HttpResponse {
            status: if body.is_some() { 200 } else { 202 },
            headers,
            body,
        }
    }
    fn close_session(&self, scope: &Scope, context: &McpRequestContext) -> HttpResponse {
        let Some(session_id) = context.session_id() else {
            return session_error(SessionError::Unknown);
        };
        let binding = SessionBinding::from_scope(scope, context);
        match self.sessions.close(session_id, &binding) {
            Ok(()) => HttpResponse {
                status: 204,
                headers: Vec::new(),
                body: None,
            },
            Err(error) => session_error(error),
        }
    }
    pub async fn handle(&self, scope: &Scope, raw: &[u8]) -> Option<Value> {
        self.handle_with_context(scope, &McpRequestContext::legacy_http(), raw)
            .await
    }
    pub async fn handle_with_context(
        &self,
        scope: &Scope,
        context: &McpRequestContext,
        raw: &[u8],
    ) -> Option<Value>
    where
        E: 'static,
    {
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
        if id
            .as_ref()
            .is_some_and(|id| bounded_request_id(id).is_none())
        {
            return Some(rpc_error(Some(Value::Null), -32600, "Invalid request ID."));
        }
        // Notifications never receive a response. Cancellation notifications do
        // update the process-local registry so a matching request can observe it.
        if method == "notifications/cancelled" {
            self.cancel_request(scope, context, request.get("params").cloned());
            return None;
        }
        if method == "notifications/initialized" {
            return None;
        }
        let id = id?;
        let result = match method {
            "initialize" => {
                if let Err(message) = validate_initialize_params(request.get("params")) {
                    return Some(rpc_error(Some(id), -32602, message));
                }
                json!({"protocolVersion":PROTOCOL_VERSION,"capabilities":{"tools":{"listChanged":false}},"serverInfo":{"name":"appcall-mcp-gateway","version":"0.1.0"}})
            }
            "ping" => json!({}),
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
                        context,
                        &call.name,
                        call.arguments,
                        call.idempotency_key,
                        call.connection_id,
                        Some(id.clone()),
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
    fn cancel_request(&self, scope: &Scope, context: &McpRequestContext, params: Option<Value>) {
        let Some(params) =
            params.and_then(|params| serde_json::from_value::<CancellationParams>(params).ok())
        else {
            return;
        };
        let Some(request_id) = bounded_request_id(&params.request_id) else {
            return;
        };
        if params
            .connection_id
            .as_deref()
            .is_some_and(|id| !valid_connection_id(id))
        {
            return;
        }
        let _ = self
            .in_flight
            .cancel(scope, context, &request_id, params.connection_id.as_deref());
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
    ) -> Result<Value, InfrastructureError>
    where
        E: 'static,
    {
        let context = McpRequestContext::default();
        self.call_tool_with_key(scope, &context, name, input, None, None, None)
            .await
    }
    pub async fn call_tool_for_connection(
        &self,
        scope: &Scope,
        name: &str,
        connection_id: &str,
        input: Value,
    ) -> Result<Value, InfrastructureError>
    where
        E: 'static,
    {
        let context = McpRequestContext::default();
        self.call_tool_with_key(
            scope,
            &context,
            name,
            input,
            None,
            Some(connection_id.to_owned()),
            None,
        )
        .await
    }
    #[allow(clippy::too_many_arguments)]
    async fn call_tool_with_key(
        &self,
        scope: &Scope,
        context: &McpRequestContext,
        name: &str,
        input: Value,
        idempotency_key: Option<String>,
        connection_id: Option<String>,
        request_id: Option<Value>,
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
        let registration = match request_id.as_ref().and_then(bounded_request_id) {
            Some(request_id) => {
                match self
                    .in_flight
                    .register(scope, context, &request_id, connection_id.clone())
                {
                    Ok(registration) => Some(registration),
                    Err(RegistrationError::Capacity) => {
                        return Ok(tool_error(
                            "MCP_REQUEST_CAPACITY",
                            "Too many MCP tool requests are in flight; retry shortly.",
                        ));
                    }
                    Err(RegistrationError::Duplicate) => {
                        return Ok(tool_error(
                            "MCP_REQUEST_IN_FLIGHT",
                            "An MCP tool request with this ID is already in flight.",
                        ));
                    }
                }
            }
            None => None,
        };
        let selected = match registration.as_ref() {
            Some(registration) => {
                tokio::select! {
                    biased;
                    _ = registration.wait_cancelled() => {
                        return Ok(cancellation_payload(registration));
                    }
                    selected = self.select_connection(scope, connector, connection_id.as_deref()) => selected,
                }
            }
            None => {
                self.select_connection(scope, connector, connection_id.as_deref())
                    .await
            }
        }?;
        let connection = match selected {
            Ok(connection) => connection,
            Err(error) => return Ok(tool_error(error.code(), error.message())),
        };
        if let Some(registration) = registration.as_ref() {
            if !registration.set_connection(&connection.id) {
                return Ok(cancellation_payload(registration));
            }
        }
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
        if let Some(registration) = registration.as_ref() {
            if !registration.begin_dispatch() {
                return Ok(cancellation_payload(registration));
            }
        }
        let execution = match registration.as_ref() {
            Some(registration) if context.durable_cancellation() => {
                let executor = Arc::clone(&self.executor);
                let reservation = registration.clone();
                let mut task = AbortOnDrop::new(tokio::task::spawn_local(async move {
                    let mut guard = ExecutionGuard::new(reservation);
                    let result = executor.execute(request).await;
                    let accepted = guard.finish_execution();
                    (accepted, result)
                }));
                tokio::select! {
                    biased;
                    _ = registration.wait_cancelled() => {
                        task.detach();
                        return Ok(cancellation_payload(registration));
                    }
                    joined = &mut task => match joined {
                        Ok((true, result)) => result,
                        Ok((false, _)) => return Ok(cancellation_payload(registration)),
                        Err(_) => return Ok(tool_error("ACTION_FAILED", "Tool execution failed.")),
                    }
                }
            }
            Some(registration) => {
                tokio::select! {
                    biased;
                    _ = registration.wait_cancelled() => {
                        return Ok(cancellation_payload(registration));
                    }
                    result = self.executor.execute(request) => {
                        if !registration.complete() {
                            return Ok(cancellation_payload(registration));
                        }
                        result
                    }
                }
            }
            None => self.executor.execute(request).await,
        };
        match execution {
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

#[derive(Deserialize)]
struct CancellationParams {
    #[serde(rename = "requestId")]
    request_id: Value,
    #[serde(
        default,
        deserialize_with = "deserialize_present_connection_id",
        rename = "connectionId"
    )]
    connection_id: Option<String>,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum SessionAdmission {
    Invalid,
    Notification,
    Request,
}

fn session_admission(raw: &[u8]) -> SessionAdmission {
    let Ok(request) = serde_json::from_slice::<Value>(raw) else {
        return SessionAdmission::Invalid;
    };
    let Some(object) = request.as_object() else {
        return SessionAdmission::Invalid;
    };
    let Some(jsonrpc) = object.get("jsonrpc").and_then(Value::as_str) else {
        return SessionAdmission::Invalid;
    };
    let Some(method) = object.get("method").and_then(Value::as_str) else {
        return SessionAdmission::Invalid;
    };
    if jsonrpc != "2.0" || method.is_empty() {
        return SessionAdmission::Invalid;
    }
    let Some(id) = object.get("id") else {
        return SessionAdmission::Notification;
    };
    if bounded_request_id(id).is_none() {
        return SessionAdmission::Invalid;
    }
    if method.starts_with("notifications/") {
        return SessionAdmission::Notification;
    }
    if method == "initialize" && validate_initialize_params(object.get("params")).is_err() {
        return SessionAdmission::Invalid;
    }
    if method == "tools/call"
        && !object
            .get("params")
            .is_some_and(|params| valid_call_params(Some(params)))
    {
        return SessionAdmission::Invalid;
    }
    SessionAdmission::Request
}

fn validate_initialize_params(params: Option<&Value>) -> Result<(), &'static str> {
    let Some(params) = params.filter(|params| !params.is_null()) else {
        return Ok(());
    };
    let Some(params) = params.as_object() else {
        return Err("Invalid initialize params.");
    };
    match params.get("protocolVersion") {
        None => Ok(()),
        Some(Value::String(version)) if version == PROTOCOL_VERSION => Ok(()),
        Some(_) => Err("Unsupported MCP protocol version."),
    }
}

fn valid_call_params(params: Option<&Value>) -> bool {
    let Some(params) = params.filter(|params| !params.is_null()) else {
        return false;
    };
    serde_json::from_value::<CallParams>(params.clone()).is_ok_and(|call| !call.name.is_empty())
}

fn bounded_request_id(id: &Value) -> Option<String> {
    if !id.is_string() && !id.is_number() {
        return None;
    }
    let serialized = serde_json::to_string(id).ok()?;
    (serialized.len() <= MAX_MCP_REQUEST_ID_BYTES).then_some(serialized)
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
fn cancellation_payload(registration: &InFlightRegistration) -> Value {
    cancellation_error(
        registration
            .cancellation_phase()
            .unwrap_or(CancelPhase::AfterDispatch),
    )
}
fn cancellation_error(phase: CancelPhase) -> Value {
    let (dispatch_outcome, phase_name, message) = match phase {
        CancelPhase::BeforeDispatch => (
            "not_dispatched",
            "before_dispatch",
            "MCP request was cancelled before dispatch; no provider effect was attempted.",
        ),
        CancelPhase::AfterDispatch => (
            "unknown",
            "after_dispatch",
            "MCP request was cancelled after dispatch began; provider effect is unknown and was not rolled back.",
        ),
    };
    tool_error_with_metadata(
        "MCP_REQUEST_CANCELLED",
        message,
        Some(json!({
            "dispatch":{"outcome":dispatch_outcome,"origin":if phase == CancelPhase::BeforeDispatch { "local_admission" } else { "unknown" }},
            "cancellation":{"phase":phase_name,"rollback":"not_attempted"}
        })),
    )
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
        headers: Vec::new(),
        body: Some(json!({"error":{"code":code,"message":message}})),
    }
}
fn session_error(error: SessionError) -> HttpResponse {
    match error {
        SessionError::Invalid => http_error(400, "MCP_SESSION_INVALID", "Invalid MCP session."),
        SessionError::Unknown | SessionError::Mismatch => {
            http_error(404, "MCP_SESSION_NOT_FOUND", "MCP session was not found.")
        }
        SessionError::Capacity | SessionError::Quota | SessionError::Unavailable => http_error(
            503,
            "MCP_SESSION_UNAVAILABLE",
            "MCP session could not be established.",
        ),
    }
}

#[cfg(test)]
mod abort_on_drop_tests {
    use super::AbortOnDrop;
    use std::sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    };
    use std::time::Duration;
    use tokio::sync::Notify;

    struct DropProbe(Arc<AtomicUsize>);

    impl Drop for DropProbe {
        fn drop(&mut self) {
            self.0.fetch_add(1, Ordering::SeqCst);
        }
    }

    #[tokio::test(flavor = "current_thread")]
    async fn detached_task_drops_its_join_handle_and_output() {
        tokio::task::LocalSet::new()
            .run_until(async {
                let drops = Arc::new(AtomicUsize::new(0));
                let task_drops = Arc::clone(&drops);
                AbortOnDrop::new(tokio::task::spawn_local(async move {
                    tokio::task::yield_now().await;
                    DropProbe(task_drops)
                }))
                .detach();

                tokio::time::timeout(Duration::from_millis(100), async {
                    while drops.load(Ordering::SeqCst) == 0 {
                        tokio::task::yield_now().await;
                    }
                })
                .await
                .expect("detached task output was retained");
                assert_eq!(drops.load(Ordering::SeqCst), 1);
            })
            .await;
    }

    #[tokio::test(flavor = "current_thread")]
    async fn normal_completion_drops_output_when_the_joined_value_is_released() {
        tokio::task::LocalSet::new()
            .run_until(async {
                let drops = Arc::new(AtomicUsize::new(0));
                let task_drops = Arc::clone(&drops);
                let output =
                    AbortOnDrop::new(tokio::task::spawn_local(
                        async move { DropProbe(task_drops) },
                    ))
                    .await
                    .expect("normal task completion failed");
                assert_eq!(drops.load(Ordering::SeqCst), 0);
                drop(output);
                assert_eq!(drops.load(Ordering::SeqCst), 1);
            })
            .await;
    }

    #[tokio::test(flavor = "current_thread")]
    async fn abort_on_drop_releases_in_progress_task_output() {
        tokio::task::LocalSet::new()
            .run_until(async {
                let drops = Arc::new(AtomicUsize::new(0));
                let task_drops = Arc::clone(&drops);
                let started = Arc::new(Notify::new());
                let task_started = Arc::clone(&started);
                let task = AbortOnDrop::new(tokio::task::spawn_local(async move {
                    let output = DropProbe(task_drops);
                    task_started.notify_one();
                    tokio::time::sleep(Duration::from_secs(60)).await;
                    output
                }));
                started.notified().await;
                drop(task);
                tokio::time::timeout(Duration::from_millis(100), async {
                    while drops.load(Ordering::SeqCst) == 0 {
                        tokio::task::yield_now().await;
                    }
                })
                .await
                .expect("aborted task output was retained");
                assert_eq!(drops.load(Ordering::SeqCst), 1);
            })
            .await;
    }
}
