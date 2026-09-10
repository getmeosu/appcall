//! API/MCP composition over one process-local repository. No production store fallback.
use super::*;
use crate::{ApiError, Backend, Identity, RawResponse, Request, Response, Result};
use appcall_actions::{ExecuteRequest, ExecuteResult};
use appcall_auth::{Grant, Principal, StaticApiKey};
use appcall_store::Connection;
use serde_json::{json, Value};
use std::{collections::BTreeMap, sync::Arc, time::Duration};
#[derive(Clone)]
pub struct MemoryConnectionLister(MemoryRepository);
impl MemoryConnectionLister {
    pub fn new(repository: MemoryRepository) -> Self {
        Self(repository)
    }
}
impl appcall_mcp::ConnectionLister for MemoryConnectionLister {
    async fn list(
        &self,
        project: &str,
    ) -> std::result::Result<Vec<appcall_mcp::Connection>, appcall_mcp::InfrastructureError> {
        self.0
            .list_connections(project, None)
            .map_err(|_| appcall_mcp::InfrastructureError)
            .map(|rows| {
                rows.into_iter()
                    .map(|c| appcall_mcp::Connection {
                        id: c.id,
                        project_id: c.project_id,
                        external_account_id: c.external_account_id,
                        connector: c.connector,
                        status: c.status.as_str().into(),
                    })
                    .collect()
            })
    }
}
pub struct MemoryCore {
    pub repository: MemoryRepository,
    pub actions: Arc<MemoryActions>,
    pub setup: Arc<MemorySetup>,
    pub history: MemoryHistory,
    pub events: Arc<MemoryEvents>,
    pub unipile_max_accounts: i64,
}
impl MemoryCore {
    pub fn new(
        repository: MemoryRepository,
        actions: Arc<MemoryActions>,
        setup: Arc<MemorySetup>,
        events: Arc<MemoryEvents>,
        unipile_max_accounts: i64,
    ) -> Self {
        Self {
            history: MemoryHistory::new(repository.clone()),
            repository,
            actions,
            setup,
            events,
            unipile_max_accounts,
        }
    }
    pub fn registry(&self) -> &appcall_connectors::Registry {
        &self.repository.state.registry
    }
    pub fn usage(&self, i: &Identity, month: &str) -> Result<Value> {
        self.repository
            .usage_monthly(&i.project_id, account(i), month)
            .map_err(usage_error)
    }
    pub async fn connections(&self, i: &Identity) -> Result<Vec<Connection>> {
        self.repository
            .list_connections(&i.project_id, account(i))
            .map_err(memory_error)
    }
    pub async fn connection(&self, i: &Identity, id: &str) -> Result<Connection> {
        self.repository
            .get_connection(&i.project_id, account(i), id)
            .map(|(c, _)| c)
            .map_err(memory_error)
    }
    pub async fn test_connection(&self, i: &Identity, id: &str) -> Result<Connection> {
        let setup = self.setup.clone();
        let i = i.clone();
        let id = id.to_owned();
        memory_work(move || {
            setup
                .test_checked(&i.project_id, account(&i), &id, &active)
                .map_err(crate::setup_failure::memory_connection_check_error)
        })
        .await
    }
    pub async fn disconnect(&self, i: &Identity, id: &str) -> Result<()> {
        let setup = self.setup.clone();
        let i = i.clone();
        let id = id.to_owned();
        memory_work(move || {
            setup
                .disconnect_checked(&i.project_id, account(&i), &id, &active)
                .map(|_| ())
                .map_err(setup_error)
        })
        .await
    }
    pub async fn execute(&self, r: ExecuteRequest) -> Result<ExecuteResult> {
        self.actions.execute(r).await.map_err(ApiError::from)
    }
    pub async fn read(&self, i: &Identity, r: &Request) -> Result<Option<Response>> {
        let url = request_url(r)?;
        if r.method == "GET" {
            let body = match url.path() {
                "/v1/usage/monthly" => Some(self.usage(i, &query(&url, "month")?)?),
                "/v1/usage/action-calls/decision" => Some(
                    self.repository
                        .usage_decision(&i.project_id, {
                            let raw = query(&url, "quantity")?;
                            if raw.is_empty() {
                                1
                            } else {
                                raw.parse().map_err(|_| ApiError::new("INVALID_QUANTITY"))?
                            }
                        })
                        .map_err(usage_error)?,
                ),
                "/v1/entitlements" => Some(
                    self.repository
                        .usage_entitlements(&i.project_id, self.unipile_max_accounts)
                        .map_err(usage_error)?,
                ),
                _ => None,
            };
            if let Some(body) = body {
                return Ok(Some(response(200, body)));
            }
            if let Some(value) = self.history.read(i, &url)? {
                return Ok(Some(value));
            }
        }
        let parts = url.path().trim_matches('/').split('/').collect::<Vec<_>>();
        if let ("POST", ["v1", "requests" | "replay-logs", id, "replay"]) =
            (r.method.as_str(), parts.as_slice())
        {
            let execute = self.history.prepare_replay(i, id, r)?;
            let output = self.execute(execute).await?;
            return Ok(Some(response(
                200,
                json!({"requestId":output.request_id,"replayLogId":output.replay_log_id,"output":output.output}),
            )));
        }
        Ok(None)
    }
}
type MemoryMcp =
    appcall_mcp::Server<MemoryConnectionLister, Arc<MemoryActions>, Arc<appcall_mcp::MemoryUsage>>;
pub struct MemoryBackend {
    pub core: Arc<MemoryCore>,
    pub browser: Option<Arc<crate::development_browser::BrowserMode>>,
    keys: Option<Arc<StaticApiKey>>,
    mcp: MemoryMcp,
    shutdown: tokio::sync::watch::Sender<bool>,
}
impl MemoryBackend {
    pub fn new(
        core: Arc<MemoryCore>,
        keys: Option<Arc<StaticApiKey>>,
        browser: Option<Arc<crate::development_browser::BrowserMode>>,
    ) -> Self {
        let mcp = appcall_mcp::Server::new(
            core.registry().clone(),
            MemoryConnectionLister::new(core.repository.clone()),
            core.actions.clone(),
            Arc::new(appcall_mcp::MemoryUsage::default()),
        );
        Self {
            core,
            keys,
            browser,
            mcp,
            shutdown: tokio::sync::watch::channel(false).0,
        }
    }
    pub fn stop(&self) {
        self.shutdown.send_replace(true);
    }
    pub async fn principal(&self, headers: &[(String, String)]) -> Result<Principal> {
        let principal = if headers
            .iter()
            .any(|(k, _)| k.eq_ignore_ascii_case("Authorization"))
        {
            self.browser
                .as_ref()
                .ok_or_else(|| ApiError::new("UNAUTHORIZED"))?
                .authorize_headers(headers)
                .await?
        } else {
            let headers = headers
                .iter()
                .map(|(k, v)| appcall_auth::Header::new(k, v))
                .collect::<Vec<_>>();
            appcall_auth::Authenticator::production(
                self.keys
                    .as_deref()
                    .map(|k| k as &dyn appcall_auth::ApiKeyVerifier),
                None,
                None,
            )
            .and_then(|auth| auth.authorize(&headers, &appcall_auth::RequestContext::default()))
            .map_err(crate::authentication_error)?
        };
        if principal.scopes != Grant::All {
            return Err(ApiError::new("FORBIDDEN"));
        }
        self.core
            .repository
            .ensure_project(&principal.project_id)
            .map_err(memory_error)?;
        Ok(principal)
    }
    async fn setup_route(&self, i: Option<&Identity>, r: &Request) -> Result<Option<Response>> {
        let url = request_url(r)?;
        let parts = url.path().trim_matches('/').split('/').collect::<Vec<_>>();
        let (connector, operation) = match (r.method.as_str(), parts.as_slice()) {
            ("GET", ["v1", "connectors", c, "setup"]) => (*c, "describe"),
            ("POST", ["v1", "connectors", c, "setup", "api-key"]) => (*c, "submit"),
            ("POST", ["v1", "connectors", c, "setup", "oauth"]) => (*c, "start"),
            ("GET", ["v1", "connectors", c, "setup", "oauth", "callback"]) => (*c, "callback"),
            _ => return Ok(None),
        };
        let setup = self.core.setup.clone();
        let connector = connector.to_owned();
        let identity = i.cloned();
        if operation == "callback" {
            let code = query(&url, "code")?;
            let state = query(&url, "state")?;
            return memory_work(move || {
                setup
                    .callback_checked(
                        &connector,
                        identity.as_ref().map(|i| i.project_id.as_str()),
                        &code,
                        &state,
                        &active,
                    )
                    .map(|_| Some(response(204, Value::Null)))
                    .map_err(setup_error)
            })
            .await;
        }
        let i = identity.ok_or_else(|| ApiError::new("UNAUTHORIZED"))?;
        if operation == "describe" {
            let d = setup.describe(&connector).map_err(setup_error)?;
            let mut value = json!({"connector":d.connector,"authType":d.auth_type,"mode":d.setup.mode,"fields":d.setup.fields,"routes":d.setup.routes});
            if !d.setup.help.is_empty() {
                value["help"] = d.setup.help.into();
            }
            if !d.setup.docs_url.is_empty() {
                value["docsUrl"] = d.setup.docs_url.into();
            }
            return Ok(Some(response(200, value)));
        }
        let body = if operation == "start" && r.body.is_empty() {
            json!({})
        } else {
            serde_json::from_slice::<Value>(&r.body).map_err(|_| ApiError::new("INVALID_JSON"))?
        };
        if !body.is_object() {
            return Err(ApiError::new("INVALID_JSON"));
        }
        if operation == "start" {
            if body
                .get("redirectUri")
                .is_some_and(|v| !v.is_null() && !v.is_string())
            {
                return Err(ApiError::new("INVALID_JSON"));
            }
            return memory_work(move||setup.start_checked(&i.project_id,account(&i),&connector,None,&active).map(|s|Some(response(201,json!({"connection":crate::connection_json(&s.connection),"authorizationUrl":s.authorization_url})))).map_err(setup_error)).await;
        }
        let route = match body.get("route") {
            None | Some(Value::Null) => String::new(),
            Some(Value::String(route)) => route.clone(),
            Some(_) => return Err(ApiError::new("INVALID_JSON")),
        };
        let fields: BTreeMap<String, String> = match body.get("fields") {
            None | Some(Value::Null) => BTreeMap::new(),
            Some(v) => {
                serde_json::from_value(v.clone()).map_err(|_| ApiError::new("INVALID_JSON"))?
            }
        };
        memory_work(move || {
            setup
                .submit_checked(
                    &i.project_id,
                    account(&i),
                    &connector,
                    &route,
                    &fields,
                    &active,
                )
                .map(|c| {
                    Some(response(
                        201,
                        json!({"connection": crate::connection_json(&c)}),
                    ))
                })
                .map_err(setup_error)
        })
        .await
    }
}
impl Backend for MemoryBackend {
    async fn event_stream(&self, r: &Request) -> Result<Option<crate::streaming::StreamResponse>> {
        let url = request_url(r)?;
        if r.method != "GET" || !matches!(url.path(), "/v1/events" | "/app/events/stream") {
            return Ok(None);
        }
        let dashboard = url.path() == "/app/events/stream";
        let (principal, cookie, verify): (Principal, String, crate::streaming::SessionVerifier) =
            if dashboard {
                let browser = self
                    .browser
                    .clone()
                    .ok_or_else(|| ApiError::new("UNAUTHORIZED"))?;
                let (principal, cookie) = browser.authorize_session(r).await?;
                let headers = if cookie.is_empty() {
                    r.headers.clone()
                } else {
                    vec![(
                        "Cookie".into(),
                        cookie.split(';').next().unwrap_or("").into(),
                    )]
                };
                let request = Arc::new(Request {
                    method: "GET".into(),
                    uri: r.uri.clone(),
                    headers,
                    body: vec![],
                });
                let verify: crate::streaming::SessionVerifier = Arc::new(move || {
                    let browser = browser.clone();
                    let request = request.clone();
                    Box::pin(async move { browser.verify_session(&request).await })
                });
                (principal, cookie, verify)
            } else {
                let principal = self.principal(&r.headers).await?;
                let keys = self.keys.clone();
                let browser = self.browser.clone();
                let headers = Arc::new(r.headers.clone());
                let verify: crate::streaming::SessionVerifier = Arc::new(move || {
                    let keys = keys.clone();
                    let browser = browser.clone();
                    let headers = headers.clone();
                    Box::pin(async move {
                        if headers
                            .iter()
                            .any(|(k, _)| k.eq_ignore_ascii_case("Authorization"))
                        {
                            return browser
                                .as_ref()
                                .ok_or_else(|| ApiError::new("UNAUTHORIZED"))?
                                .authorize_headers(&headers)
                                .await;
                        }
                        let headers = headers
                            .iter()
                            .map(|(k, v)| appcall_auth::Header::new(k, v))
                            .collect::<Vec<_>>();
                        appcall_auth::Authenticator::production(
                            keys.as_deref()
                                .map(|k| k as &dyn appcall_auth::ApiKeyVerifier),
                            None,
                            None,
                        )
                        .and_then(|auth| {
                            auth.authorize(&headers, &appcall_auth::RequestContext::default())
                        })
                        .map_err(crate::authentication_error)
                    })
                });
                (principal, String::new(), verify)
            };
        let cursor = crate::data_routes::sse_cursor(&url, &r.headers);
        let filters = crate::data_routes::sse_filters(&url)?;
        let receiver = self
            .core
            .events
            .open_filtered(
                principal,
                cursor,
                filters,
                self.shutdown.subscribe(),
                verify,
                dashboard,
            )
            .await?;
        Ok(Some(crate::streaming::StreamResponse {
            receiver,
            headers: if cookie.is_empty() {
                vec![]
            } else {
                vec![("set-cookie".into(), cookie)]
            },
        }))
    }
    async fn authorize(&self, h: &[(String, String)]) -> Result<Identity> {
        let p = self.principal(h).await?;
        Ok(Identity {
            project_id: p.project_id,
            account_id: p.brand_id.unwrap_or_default(),
            admin_scope: false,
        })
    }
    async fn ready(&self) -> Result<()> {
        if self
            .browser
            .as_ref()
            .is_some_and(|b| b.database_health() == Some(false))
        {
            Err(ApiError::new("STORAGE_UNAVAILABLE"))
        } else {
            Ok(())
        }
    }
    async fn connections(&self, i: &Identity) -> Result<Vec<Connection>> {
        self.core.connections(i).await
    }
    async fn platform_connectors(&self, i: &Identity) -> Result<Vec<String>> {
        Ok(self
            .core
            .connections(i)
            .await?
            .into_iter()
            .filter(|c| c.credential_owner == appcall_store::CredentialOwner::Platform)
            .map(|c| c.connector)
            .collect::<std::collections::BTreeSet<_>>()
            .into_iter()
            .collect())
    }
    async fn connection(&self, i: &Identity, id: &str) -> Result<Connection> {
        self.core.connection(i, id).await
    }
    async fn test_connection(&self, i: &Identity, id: &str) -> Result<Connection> {
        self.core.test_connection(i, id).await
    }
    async fn disconnect(&self, i: &Identity, id: &str) -> Result<()> {
        self.core.disconnect(i, id).await
    }
    async fn execute(&self, r: ExecuteRequest) -> Result<ExecuteResult> {
        self.core.execute(r).await
    }
    fn requires_api_auth(&self, method: &str, path: &str) -> bool {
        !(memory_unipile_path(path)
            || method == "GET" && path == "/oauth/local/authorize"
            || crate::provider_routes::public_exact(method, path)
            || crate::event_routes::public_exact(method, path)
            || self.browser.is_some() && crate::browser_host::public_path(method, path))
    }
    async fn public_route(&self, r: &Request) -> Result<Option<Response>> {
        let url = request_url(r)?;
        if memory_unipile_path(url.path()) {
            return Ok(Some(response(
                404,
                json!({"error":{"code":"NOT_FOUND","message":"The route was not found."}}),
            )));
        }
        let event = crate::event_routes::public_exact(&r.method, url.path());
        if !event && !crate::provider_routes::public_exact(&r.method, url.path()) {
            return Ok(None);
        }
        let p = if r.headers.iter().any(|(k, _)| {
            k.eq_ignore_ascii_case("Authorization") || k.eq_ignore_ascii_case("X-API-Key")
        }) {
            Some(self.principal(&r.headers).await?)
        } else {
            None
        };
        if event {
            return self.core.events.handle(p.as_ref(), r).await;
        }
        let i = p.map(|p| Identity {
            project_id: p.project_id,
            account_id: p.brand_id.unwrap_or_default(),
            admin_scope: false,
        });
        self.setup_route(i.as_ref(), r).await
    }
    async fn auxiliary_route(&self, i: &Identity, r: &Request) -> Result<Option<Response>> {
        if let Some(v) = self.setup_route(Some(i), r).await? {
            return Ok(Some(v));
        }
        let url = request_url(r)?;
        if url.path().starts_with("/v1/webhook-events") {
            let p = self.principal(&r.headers).await?;
            if let Some(v) = self.core.events.handle(Some(&p), r).await? {
                return Ok(Some(v));
            }
        }
        if r.method == "GET" && url.path() == "/v1/usage/tools" {
            let counts = self
                .mcp
                .usage()
                .list(&i.project_id, &i.account_id)
                .map_err(|_| ApiError::new("STORAGE_UNAVAILABLE"))?;
            let total = counts
                .iter()
                .fold(0i64, |sum, c| sum.saturating_add(c.count));
            return Ok(Some(response(200, json!({"tools":counts,"total":total}))));
        }
        self.core.read(i, r).await
    }
    async fn raw_route(&self, r: &Request) -> Result<Option<RawResponse>> {
        let url = request_url(r)?;
        if r.method == "GET" && url.path() == "/oauth/local/authorize" {
            if r.headers.iter().any(|(k, _)| {
                k.eq_ignore_ascii_case("Authorization") || k.eq_ignore_ascii_case("X-API-Key")
            }) && self.principal(&r.headers).await?.project_id != "proj_dev"
            {
                return Err(ApiError::new("FORBIDDEN"));
            }
            if url.query_pairs().count() != 2 {
                return Err(ApiError::new("INVALID_REQUEST"));
            }
            let connector = query(&url, "connector")?;
            let id = query(&url, "connectionId")?;
            let setup = self.core.setup.clone();
            return memory_work(move || {
                setup
                    .local_callback_checked(&connector, &id, &active)
                    .map(|_| {
                        Some(RawResponse {
                            status: 302,
                            body: vec![],
                            headers: vec![("location".into(), "/app/connections".into())],
                        })
                    })
                    .map_err(setup_error)
            })
            .await;
        }
        if let Some(browser) = &self.browser {
            if let Some(response) = browser.handle(r).await? {
                return Ok(Some(response));
            }
        }
        if url.path() != "/v1/mcp" {
            return Ok(None);
        }
        let i = self.authorize(&r.headers).await?;
        let token = header(r, "X-Connector-Token");
        let scope = appcall_mcp::Scope::new(&i.project_id, &i.account_id)
            .with_profile(header(r, "X-Capability-Profile"))
            .with_connector_token(token.strip_prefix("Bearer ").unwrap_or(token));
        let result = self.mcp.handle_http(&r.method, &scope, &r.body).await;
        Ok(Some(RawResponse {
            status: result.status,
            headers: vec![("content-type".into(), "application/json".into())],
            body: result
                .body
                .map(|v| serde_json::to_vec(&v))
                .transpose()
                .map_err(|_| ApiError::new("INVALID_RESPONSE"))?
                .unwrap_or_default(),
        }))
    }
}
pub fn memory_unipile_path(path: &str) -> bool {
    path == "/v1/unipile"
        || path.starts_with("/v1/unipile/")
        || [
            "/v1/connectors/unipile/accounts/",
            "/v1/connectors/unipile/webhooks/",
        ]
        .iter()
        .any(|p| path.starts_with(p))
        || matches!(
            path,
            "/v1/connectors/unipile/setup/hosted" | "/v1/connectors/unipile/setup/notify"
        )
}
pub(crate) fn account(i: &Identity) -> Option<&str> {
    (!i.account_id.is_empty()).then_some(i.account_id.as_str())
}
pub(crate) fn active() -> bool {
    crate::browser_host::ensure_active().is_ok()
}
pub(crate) fn request_url(r: &Request) -> Result<url::Url> {
    crate::validate_request_uri(&r.uri)
}
pub(crate) fn response(status: u16, body: Value) -> Response {
    Response {
        status,
        body,
        headers: vec![],
    }
}
pub(crate) fn query(url: &url::Url, key: &str) -> Result<String> {
    let values = url
        .query_pairs()
        .filter(|(k, _)| k == key)
        .map(|(_, v)| v.into_owned())
        .collect::<Vec<_>>();
    if values.len() > 1 {
        return Err(ApiError::new("INVALID_REQUEST"));
    }
    Ok(values.into_iter().next().unwrap_or_default())
}
fn header<'a>(r: &'a Request, key: &str) -> &'a str {
    r.headers
        .iter()
        .find(|(k, _)| k.eq_ignore_ascii_case(key))
        .map(|(_, v)| v.as_str())
        .unwrap_or("")
}
pub(crate) fn memory_error(e: MemoryError) -> ApiError {
    ApiError::new(match e {
        MemoryError::Invalid => "INVALID_REQUEST",
        MemoryError::NotFound => "CONNECTION_NOT_FOUND",
        MemoryError::Forbidden => "FORBIDDEN",
        MemoryError::Conflict => "CONNECTION_CHANGED",
        MemoryError::Capacity => "SERVICE_BUSY",
        MemoryError::Unavailable => "STORAGE_UNAVAILABLE",
    })
}
pub(crate) fn setup_error(e: appcall_setup::Error) -> ApiError {
    ApiError::from(e)
}
pub(crate) async fn memory_work<T: Send + 'static>(
    work: impl FnOnce() -> Result<T> + Send + 'static,
) -> Result<T> {
    static ADMISSION: std::sync::OnceLock<Arc<tokio::sync::Semaphore>> = std::sync::OnceLock::new();
    let permit = ADMISSION
        .get_or_init(|| Arc::new(tokio::sync::Semaphore::new(4)))
        .clone()
        .try_acquire_owned()
        .map_err(|_| ApiError::new("SERVICE_BUSY"))?;
    let cancel = Arc::new(crate::browser_host::Cancellation::default());
    let _guard = crate::browser_host::CancelGuard(cancel.clone());
    let task = tokio::task::spawn_blocking(move || {
        let _permit = permit;
        crate::browser_host::drive(async { work() }, cancel)
    });
    tokio::time::timeout(Duration::from_secs(15), task)
        .await
        .map_err(|_| ApiError::new("SERVICE_BUSY"))?
        .map_err(|_| ApiError::new("STORAGE_UNAVAILABLE"))??
}

fn usage_error(error: appcall_actions::ActionError) -> ApiError {
    match error.code.as_str() {
        "INVALID_MONTH" => ApiError::new("INVALID_MONTH"),
        "INVALID_QUANTITY" => ApiError::new("INVALID_QUANTITY"),
        _ => ApiError::from(error),
    }
}
