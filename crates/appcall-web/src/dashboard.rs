use crate::{http::escape, *};
use appcall_auth::Principal;
use serde_json::Value;
use std::{collections::BTreeMap, future::Future, pin::Pin};
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DashboardOperation {
    Overview,
    Catalog,
    Connector,
    TestForm,
    Options,
    RunInputFields,
    Setup,
    Test,
    RequestConnector,
    Connections,
    TestConnection,
    DisconnectConnection,
    Events,
    ReplayEvent,
    Stream,
    Logs,
    Runs,
    RunDetail,
    RunNow,
    ResetRun,
    CancelRun,
    ActionClaims,
    ReconcileActionClaim,
    Trace,
    ReplayTrace,
    Certification,
    Usage,
    Branding,
    SaveBranding,
}
pub struct DashboardRequest {
    pub principal: Principal,
    pub operation: DashboardOperation,
    pub resource: Option<String>,
    pub account_id: Option<String>,
    pub fields: BTreeMap<String, String>,
    pub form_values: BTreeMap<String, Vec<String>>,
}
pub trait DashboardData: Send + Sync {
    /// Nonblocking database health snapshot: None means the handle is currently
    /// busy, not failed. In-memory fixtures have no database to reconnect.
    fn database_health(&self) -> Option<bool> {
        Some(true)
    }

    fn execute(
        &self,
        request: DashboardRequest,
    ) -> Pin<Box<dyn Future<Output = Result<Value, Error>> + Send + '_>>;

    fn execute_detailed(
        &self,
        request: DashboardRequest,
    ) -> Pin<Box<dyn Future<Output = Result<Value, DashboardFailure>> + Send + '_>> {
        Box::pin(async move { self.execute(request).await.map_err(DashboardFailure::from) })
    }
}
pub struct Dashboard<'a> {
    pub browser: &'a Browser<'a>,
    pub data: &'a dyn DashboardData,
}
impl Dashboard<'_> {
    pub async fn handle(&self, r: &Request<'_>) -> Option<Response> {
        if r.method == "GET" && r.path == "/" {
            return Some(Response::redirect("/app"));
        }
        if r.path.starts_with("/static/") {
            return Some(crate::shell::asset(r.path, r.method));
        }
        if let Some(response) = self.browser.handle(r).await {
            return Some(response);
        }
        let operation = match resolve(r.method, r.path) {
            Some(o) => o,
            None => return None,
        };
        let trace_drawer = match crate::trace::drawer_request(r, operation) {
            Ok(drawer) => drawer,
            Err(error) => return Some(Response::new(400, escape(&error.to_string()))),
        };
        if r.method == "POST"
            && verify_csrf(self.browser.public_origin, r.origin, r.referer).is_err()
        {
            return Some(Response::new(403, "Access denied".into()));
        }
        let session = match cookie(r.cookies, "appcall_session")
            .ok()
            .flatten()
            .and_then(|raw| self.browser.codec.open_session(raw).ok())
        {
            Some(s) => s,
            None => {
                return Some(
                    session_required(trace_drawer).cookie(self.browser.codec.clear_session()),
                )
            }
        };
        let access_token_expired = matches!(
            self.browser
                .identity
                .jwt
                .verify(&session.access_token, r.now),
            Err(appcall_auth::AuthError::Expired)
        );
        let previous_session = session.clone();
        let (session, principal) = match self.browser.identity.refresh(&session, r.now).await {
            Ok(pair) => pair,
            Err(Error::Unavailable) => {
                let response = Response::new(503, "Identity service unavailable".into());
                if access_token_expired {
                    // The refresh cache returns the completed rotation, or the
                    // cached failure, without retrying a single-use token here.
                    if let Ok((access_token, refresh_token)) = self
                        .browser
                        .identity
                        .broker
                        .refresh_tokens(&previous_session.refresh_token)
                        .await
                    {
                        let handoff = Session {
                            access_token,
                            refresh_token,
                            ..previous_session.clone()
                        };
                        if handoff != previous_session {
                            return Some(match self.browser.codec.session_cookie(&handoff) {
                                Ok(cookie) => response.cookie(cookie),
                                Err(_) => response,
                            });
                        }
                    }
                }
                return Some(response);
            }
            Err(_) => {
                return Some(
                    session_required(trace_drawer).cookie(self.browser.codec.clear_session()),
                )
            }
        };
        let rotated_session_cookie = if session != previous_session {
            Some(match self.browser.codec.session_cookie(&session) {
                Ok(cookie) => cookie,
                Err(_) => return Some(Response::new(503, "Session unavailable".into())),
            })
        } else {
            None
        };
        let result = DashboardRenderer { data: self.data }
            .render(r, operation, &session, principal)
            .await;
        let response = match result {
            Ok(response) => response,
            Err(e) => Response::new(
                match e {
                    Error::Invalid => 400,
                    Error::RequestTooLarge => 413,
                    Error::Unauthorized => 401,
                    Error::Forbidden => 403,
                    Error::NotFound => 404,
                    Error::Conflict => 409,
                    _ => 503,
                },
                escape(&e.to_string()),
            ),
        };
        if let Some(cookie) = rotated_session_cookie {
            return Some(response.cookie(cookie));
        }
        Some(response)
    }
}
fn session_required(drawer: bool) -> Response {
    if drawer {
        Response::new(401, "Sign in to inspect this trace.".into())
    } else {
        Response::redirect("/app/login")
    }
}
pub(crate) struct DashboardRenderer<'a> {
    pub data: &'a dyn DashboardData,
}

fn catalog_matches(connector: &Value, query: &str) -> bool {
    let query = query.trim().to_lowercase();
    if query.is_empty() {
        return true;
    }
    let text_matches = |value: Option<&str>| {
        value
            .map(str::to_lowercase)
            .is_some_and(|value| value.contains(&query))
    };
    text_matches(connector.get("name").and_then(Value::as_str))
        || text_matches(connector.get("key").and_then(Value::as_str))
        || connector
            .get("categories")
            .and_then(Value::as_array)
            .is_some_and(|categories| {
                categories
                    .iter()
                    .filter_map(Value::as_str)
                    .any(|category| text_matches(Some(category)))
            })
        || connector
            .get("operations")
            .and_then(Value::as_array)
            .is_some_and(|operations| {
                operations.iter().any(|operation| {
                    text_matches(operation.get("title").and_then(Value::as_str))
                        || text_matches(operation.get("name").and_then(Value::as_str))
                })
            })
}

impl DashboardRenderer<'_> {
    pub(crate) async fn render(
        &self,
        r: &Request<'_>,
        operation: Option<DashboardOperation>,
        session: &Session,
        principal: Principal,
    ) -> Result<Response, Error> {
        if operation.is_none() {
            return Ok(Response::new(
                200,
                crate::shell::layout(
                    if r.path == "/app/docs" {
                        "Documentation"
                    } else {
                        "Support"
                    },
                    session,
                    &crate::pages::static_page(r.path),
                    r.path,
                ),
            ));
        }
        let operation = operation.ok_or(Error::Invalid)?;
        // No trusted operator authority is configured; tenant grants cannot authorize certification.
        if operation == DashboardOperation::Certification {
            return Err(Error::Forbidden);
        }
        let trace_drawer = crate::trace::drawer_request(r, Some(operation))?;
        let log_filters = if operation == DashboardOperation::Logs {
            crate::logs::Filters::from_request(r)?
        } else {
            crate::logs::Filters::default()
        };
        // Match the Runs API alias precedence without changing forwarded fields
        // or the principal's account scope. Navigation emits the canonical key.
        let run_account_filter = if matches!(
            operation,
            DashboardOperation::Runs | DashboardOperation::RunDetail
        ) {
            let account = r.field("accountId")?;
            if account.is_empty() {
                r.field("externalAccountId")?
            } else {
                account
            }
        } else {
            ""
        };
        let has_filters = match operation {
            DashboardOperation::Catalog => {
                !r.field("category")?.trim().is_empty() || !r.field("search")?.trim().is_empty()
            }
            DashboardOperation::Logs => log_filters.active(),
            DashboardOperation::Runs => {
                ["status", "connector", "tool"]
                    .iter()
                    .map(|key| r.field(key))
                    .collect::<Result<Vec<_>, _>>()?
                    .iter()
                    .any(|value| !value.is_empty())
                    || !run_account_filter.is_empty()
            }
            _ => false,
        };
        let mut fields = BTreeMap::new();
        if r.fields.len() > 64 {
            return Err(Error::Invalid);
        }
        for (key, values) in &r.fields {
            if operation == DashboardOperation::Trace && key == "view" {
                continue;
            }
            if values.len() > 1
                && key.starts_with("f.")
                && (key.ends_with(".key") || key.ends_with(".val"))
            {
                if values.len() > 64 || values.iter().any(|v| v.len() > 16384) {
                    return Err(Error::Invalid);
                }
            } else {
                fields.insert(key.clone(), r.field(key)?.to_owned());
            }
        }
        let segments: Vec<_> = r.path.trim_start_matches('/').split('/').collect();
        let resource = if segments.len() >= 3
            && !matches!(
                operation,
                DashboardOperation::Usage
                    | DashboardOperation::Branding
                    | DashboardOperation::SaveBranding
                    | DashboardOperation::RequestConnector
                    | DashboardOperation::Stream
                    | DashboardOperation::ActionClaims
                    | DashboardOperation::ReconcileActionClaim
            ) {
            Some(segments[2].to_owned())
        } else {
            None
        };
        if resource.as_ref().is_some_and(|id| {
            id.is_empty()
                || id.len() > 256
                || !id
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.'))
        }) {
            return Err(Error::Invalid);
        }
        let account_id = if matches!(
            operation,
            DashboardOperation::Runs
                | DashboardOperation::RunDetail
                | DashboardOperation::ActionClaims
                | DashboardOperation::ReconcileActionClaim
        ) {
            if matches!(
                operation,
                DashboardOperation::ActionClaims | DashboardOperation::ReconcileActionClaim
            ) {
                let account = r.field("externalAccountId")?;
                (!account.is_empty()).then(|| account.to_owned())
            } else {
                (!run_account_filter.is_empty()).then(|| run_account_filter.to_owned())
            }
        } else {
            fields
                .get("externalAccountId")
                .filter(|id| !id.is_empty())
                .cloned()
        };
        let form_values = r
            .fields
            .iter()
            .filter(|(key, _)| operation != DashboardOperation::Trace || key.as_str() != "view")
            .map(|(key, values)| (key.clone(), values.clone()))
            .collect();
        let value = self
            .data
            .execute_detailed(DashboardRequest {
                principal,
                operation,
                resource: resource.clone(),
                account_id,
                fields,
                form_values,
            })
            .await;
        let mut value = match value {
            Ok(value) => value,
            Err(error)
                if operation == DashboardOperation::Overview
                    && error.classification() == Error::Unavailable =>
            {
                return Ok(Response::new(
                    503,
                    crate::shell::layout(
                        crate::pages::title(operation),
                        session,
                        &crate::overview::unavailable(),
                        r.path,
                    ),
                ));
            }
            Err(error)
                if operation == DashboardOperation::Logs
                    && error.classification() == Error::Invalid =>
            {
                return Ok(Response::new(
                    400,
                    crate::shell::layout(
                        "Logs",
                        session,
                        &crate::logs::invalid(&log_filters),
                        r.path,
                    ),
                ));
            }
            Err(error)
                if operation == DashboardOperation::RequestConnector
                    && matches!(
                        error.classification(),
                        Error::Invalid | Error::Unavailable | Error::Configuration
                    ) =>
            {
                return Ok(crate::sse::response(&crate::pages::request_failure()));
            }
            Err(error)
                if matches!(
                    operation,
                    DashboardOperation::Test | DashboardOperation::TestForm
                ) =>
            {
                return Ok(tool_failure(operation, &error, resource.as_deref()));
            }
            Err(error)
                if matches!(
                    operation,
                    DashboardOperation::Setup
                        | DashboardOperation::TestConnection
                        | DashboardOperation::ReplayTrace
                ) && !matches!(
                    error.classification(),
                    Error::Unauthorized | Error::Forbidden
                ) =>
            {
                let status = match error.classification() {
                    Error::Invalid => 400,
                    _ => 503,
                };
                let content =
                    crate::dashboard_failure::recovery(operation, resource.as_deref(), &error);
                return Ok(Response::new(
                    status,
                    crate::shell::layout(crate::pages::title(operation), session, &content, r.path),
                ));
            }
            Err(error)
                if matches!(
                    operation,
                    DashboardOperation::RunNow
                        | DashboardOperation::ResetRun
                        | DashboardOperation::CancelRun
                ) =>
            {
                let status = match error.classification() {
                    Error::Invalid => 400,
                    Error::Unauthorized => 401,
                    Error::Forbidden => 403,
                    Error::NotFound => 404,
                    Error::Conflict => 409,
                    _ => 503,
                };
                let content =
                    crate::dashboard_failure::recovery(operation, resource.as_deref(), &error);
                return Ok(Response::new(
                    status,
                    crate::shell::layout(
                        crate::pages::title(operation),
                        session,
                        &content,
                        "/app/runs",
                    ),
                ));
            }
            Err(error) => return Err(error.classification()),
        };
        if matches!(
            operation,
            DashboardOperation::Catalog | DashboardOperation::Logs | DashboardOperation::Runs
        ) {
            let target = if value.get("data").is_some() {
                value.get_mut("data").ok_or(Error::Unavailable)?
            } else {
                &mut value
            };
            if target.is_array() {
                let key = match operation {
                    DashboardOperation::Catalog => "connectors",
                    DashboardOperation::Logs => "logs",
                    DashboardOperation::Runs => "runs",
                    _ => unreachable!(),
                };
                *target = serde_json::json!({key:target.clone()});
            }
            let map = target.as_object_mut().ok_or(Error::Unavailable)?;
            // This presentation flag is derived only from the current request,
            // overwriting any provider-supplied value without echoing query text.
            map.insert("hasFilters".into(), Value::Bool(has_filters));
        }
        if operation == DashboardOperation::Runs {
            let target = if value.get("data").is_some() {
                value.get_mut("data").ok_or(Error::Unavailable)?
            } else {
                &mut value
            };
            let map = target.as_object_mut().ok_or(Error::Unavailable)?;
            for (query_key, data_key) in [
                ("status", "selectedStatus"),
                ("connector", "selectedConnector"),
                ("tool", "selectedTool"),
            ] {
                map.insert(data_key.into(), r.field(query_key)?.into());
            }
            map.insert("selectedAccountId".into(), run_account_filter.into());
        }
        if operation == DashboardOperation::Catalog {
            let target = if value.get("data").is_some() {
                value.get_mut("data").ok_or(Error::Unavailable)?
            } else {
                &mut value
            };
            let map = target.as_object_mut().ok_or(Error::Unavailable)?;
            let connectors = ["connectors", "items", "cards"]
                .iter()
                .find_map(|key| map.get(*key).and_then(Value::as_array))
                .ok_or(Error::Unavailable)?;
            let categories = connectors
                .iter()
                .flat_map(|c| {
                    c.get("categories")
                        .and_then(Value::as_array)
                        .into_iter()
                        .flatten()
                })
                .filter_map(Value::as_str)
                .map(str::to_owned)
                .collect::<std::collections::BTreeSet<_>>();
            let selected = r.field("category")?;
            let search = r.field("search")?;
            let filtered = connectors
                .iter()
                .filter(|c| {
                    (selected.trim().is_empty()
                        || c.get("categories")
                            .and_then(Value::as_array)
                            .is_some_and(|values| {
                                values
                                    .iter()
                                    .filter_map(Value::as_str)
                                    .any(|value| value.trim().eq_ignore_ascii_case(selected.trim()))
                            }))
                        && catalog_matches(c, search)
                })
                .cloned()
                .collect::<Vec<_>>();
            map.insert("connectors".into(), Value::Array(filtered));
            map.insert("categories".into(), serde_json::json!(categories));
            map.insert("category".into(), Value::String(selected.into()));
            map.insert("search".into(), Value::String(search.into()));
        }
        if operation == DashboardOperation::Options {
            let target = if value.get("data").is_some() {
                value.get_mut("data").ok_or(Error::Unavailable)?
            } else {
                &mut value
            };
            let map = target.as_object_mut().ok_or(Error::Unavailable)?;
            for key in ["fieldName", "detailSource"] {
                map.insert(key.into(), Value::String(r.field(key)?.into()));
            }
            map.insert(
                "key".into(),
                Value::String(resource.clone().unwrap_or_default()),
            );
        }
        use DashboardOperation::*;
        let redirect = match operation {
            DisconnectConnection => Some("/app/connections?success=disconnected".to_owned()),
            TestConnection => {
                let data = value.get("data").unwrap_or(&value);
                let status = data
                    .get("lastTestStatus")
                    .or_else(|| data.get("last_test_status"))
                    .or_else(|| data.get("lastTest"))
                    .and_then(Value::as_str)
                    .unwrap_or("");
                Some(
                    if status == "passed" {
                        "/app/connections?success=test-passed"
                    } else {
                        "/app/connections?success=test-unverified"
                    }
                    .to_owned(),
                )
            }
            ReplayEvent => Some("/app/events?replayed=1".to_owned()),
            ReplayTrace => Some(format!(
                "/app/logs/{}?replayed=1",
                resource.as_deref().unwrap_or("")
            )),
            RunNow => Some("/app/runs?success=run-now".to_owned()),
            ResetRun => Some("/app/runs?success=reset".to_owned()),
            CancelRun => Some("/app/runs?success=cancelled".to_owned()),
            SaveBranding => Some("/app/settings/white-labeling?saved=1".to_owned()),
            _ => None,
        };
        if let Some(url) = redirect {
            return Ok(Response::redirect(&url));
        }
        if operation == Setup {
            if let Some(url) = value.get("redirectUrl").and_then(Value::as_str) {
                if value.get("developmentOAuth").and_then(Value::as_bool) == Some(true)
                    && valid_local_setup_redirect(url, resource.as_deref().unwrap_or(""))
                {
                    return Ok(Response::redirect(url));
                }
                let parsed = reqwest::Url::parse(url).map_err(|_| Error::Invalid)?;
                if parsed.scheme() != "https"
                    || !parsed.username().is_empty()
                    || parsed.password().is_some()
                {
                    return Err(Error::Invalid);
                }
                return Ok(Response::redirect(url));
            }
        }
        if operation == Setup {
            return Ok(Response::redirect(&format!(
                "/app/connectors/{}?success=1",
                resource.as_deref().ok_or(Error::Invalid)?
            )));
        }
        if operation == Stream {
            let body = value
                .get("events")
                .and_then(Value::as_array)
                .ok_or(Error::Unavailable)?
                .iter()
                .map(crate::render_event_patch)
                .collect::<Result<Vec<_>, _>>()?
                .join("");
            let mut response = Response::new(200, body);
            response.headers.retain(|(k, _)| k != "Content-Type");
            response
                .headers
                .push(("Content-Type".into(), "text/event-stream".into()));
            return Ok(response);
        }
        if operation == Connector {
            let tab = crate::connector::selected_tab(r.field("tab")?);
            let data = if value.get("data").is_some() {
                value.get_mut("data").ok_or(Error::Unavailable)?
            } else {
                &mut value
            };
            data.as_object_mut()
                .ok_or(Error::Unavailable)?
                .insert("tab".into(), tab.into());
        }
        if trace_drawer {
            return Ok(Response::new(
                200,
                crate::trace::content(&value, resource.as_deref().ok_or(Error::Invalid)?)?,
            ));
        }
        let mut content = if operation == Logs {
            crate::logs::render(&value, &log_filters, has_filters)?
        } else if operation == DashboardOperation::Events {
            let data = value.get("data").unwrap_or(&value);
            let stream_url = event_stream_url(r, data)?;
            crate::remaining_pages::events_with_stream(data, &stream_url)?
        } else {
            match crate::pages::render(operation, &value, resource.as_deref()) {
                Ok(content) => content,
                Err(Error::Unavailable) if operation == Overview => {
                    return Ok(Response::new(
                        503,
                        crate::shell::layout(
                            crate::pages::title(operation),
                            session,
                            &crate::overview::unavailable(),
                            r.path,
                        ),
                    ));
                }
                Err(error) => return Err(error),
            }
        };
        if operation == Branding && r.field("saved")? == "1" {
            content = crate::admin_ui::banner("Review the current branding settings below.", true)
                + &content;
        }
        let connection_data = value.get("data").unwrap_or(&value);
        let has_connections = ["connections", "rows", "items"]
            .iter()
            .find_map(|key| connection_data.get(key).and_then(Value::as_array))
            .is_some_and(|rows| !rows.is_empty());
        let (banner, recovery) = match (operation, r.field("success")?, r.field("error")?) {
            (Connections, _, "test-failed") if has_connections => {
                ("Review the connection setup and its recorded status.", true)
            }
            (Connections, _, "disconnect-failed") if has_connections => (
                "Check the connection's current status before running another tool.",
                true,
            ),
            (Connections, "test-passed" | "test-unverified", _) if has_connections => (
                "Review the connection's recorded check result below.",
                false,
            ),
            (Connections, "disconnected", _) if has_connections => (
                "Check the connection's current status before running another tool.",
                false,
            ),
            (Runs, "run-now", _) => ("Run queued now. Refreshing the current queue state.", false),
            (Runs, "reset", _) => (
                "Attempts reset and the run was queued from its saved checkpoint.",
                false,
            ),
            (Runs, "cancelled", _) => (
                "Run cancelled. Any older worker lease is fenced from committing.",
                false,
            ),
            _ => ("", false),
        };
        if matches!(operation, Logs | Events | Runs) {
            let data = value.get("data").unwrap_or(&value);
            if let Some(cursor) = data
                .pointer("/pagination/nextCursor")
                .and_then(Value::as_str)
                .filter(|v| !v.is_empty())
            {
                let mut url = reqwest::Url::parse(&format!("https://local.invalid{}", r.path))
                    .map_err(|_| Error::Invalid)?;
                let filter_keys: &[&str] = if operation == Runs {
                    &["status", "connector", "tool", "accountId"]
                } else if operation == Logs {
                    crate::logs::FILTER_KEYS
                } else {
                    &["connector", "connectionId", "operation"]
                };
                for key in filter_keys {
                    let value = if operation == Runs && *key == "accountId" {
                        run_account_filter
                    } else {
                        r.field(key)?
                    };
                    if !value.is_empty() {
                        url.query_pairs_mut().append_pair(key, value);
                    }
                }
                url.query_pairs_mut().append_pair("cursor", cursor);
                let href = format!("{}?{}", url.path(), url.query().unwrap_or(""));
                let next = crate::ui::Button {
                    target: crate::ui::ButtonTarget::Link(
                        crate::ui::LocalPath::new(&href).ok_or(Error::Invalid)?,
                    ),
                    ..crate::ui::Button::new("Next page")
                }
                .render();
                content.push_str(&format!(
                    "<div class=\"mt-4 flex justify-center\">{next}</div>"
                ));
            }
        }
        if !banner.is_empty() {
            content = crate::admin_ui::banner(banner, !recovery) + &content;
        }
        if matches!(
            operation,
            Test | Options | RunInputFields | TestForm | RequestConnector
        ) {
            return Ok(crate::sse::response(&content));
        }
        Ok(Response::new(
            200,
            crate::shell::layout(crate::pages::title(operation), session, &content, r.path),
        ))
    }
}

fn event_stream_url(r: &Request<'_>, data: &Value) -> Result<String, Error> {
    let mut url = reqwest::Url::parse("https://local.invalid/app/events/stream")
        .map_err(|_| Error::Invalid)?;
    for key in ["connector", "connectionId", "operation"] {
        let value = r.field(key)?;
        if !value.is_empty() {
            url.query_pairs_mut().append_pair(key, value);
        }
    }
    if let Some(cursor) = data.get("streamCursor") {
        let cursor = cursor.as_str().ok_or(Error::Unavailable)?;
        if cursor.len() > 4096 || cursor.chars().any(char::is_control) {
            return Err(Error::Invalid);
        }
        if !cursor.is_empty() {
            url.query_pairs_mut().append_pair("since", cursor);
        }
    }
    let stream_url = match url.query() {
        Some(query) if !query.is_empty() => format!("{}?{query}", url.path()),
        _ => url.path().to_owned(),
    };
    if stream_url.len() > 4096 {
        return Err(Error::RequestTooLarge);
    }
    Ok(stream_url)
}

/// Only data-operation failures become inline SSE. Session refresh and CSRF
/// rejection happen before this renderer and keep their existing HTTP behavior.
fn tool_failure(
    operation: DashboardOperation,
    error: &DashboardFailure,
    resource: Option<&str>,
) -> Response {
    let fields = operation == DashboardOperation::TestForm;
    let message = crate::dashboard_failure::recovery(operation, resource, error);
    let (tag, target, label, heading, marker) = if fields {
        (
            "div",
            "tk-test-fields",
            "tk-fields-label",
            "Tool input",
            "data-fields-valid=\"false\"",
        )
    } else {
        (
            "section",
            "tk-test-result",
            "tk-result-label",
            "Result",
            "class=\"tk-result-pane\" data-result-state=\"error\"",
        )
    };
    crate::sse::response(&format!(
        "<{tag} id=\"{target}\" {marker} aria-live=\"polite\" aria-busy=\"false\" aria-labelledby=\"{label}\"><h3 id=\"{label}\">{heading}</h3>{}{message}</{tag}>",
        crate::ui::state(crate::ui::Tone::Dead, if fields { "Fields unavailable" } else { "Request failed" })
    ))
}
pub(crate) fn resolve(method: &str, path: &str) -> Option<Option<DashboardOperation>> {
    use DashboardOperation::*;
    let direct = match (method, path) {
        ("GET", "/app") => Overview,
        ("GET", "/app/connectors") => Catalog,
        ("POST", "/app/connectors/request") => RequestConnector,
        ("GET", "/app/connections") => Connections,
        ("GET", "/app/events") => Events,
        ("GET", "/app/events/stream") => Stream,
        ("GET", "/app/logs") => Logs,
        ("GET", "/app/certification") => Certification,
        ("GET", "/app/usage") => Usage,
        ("GET", "/app/runs") => Runs,
        ("GET", "/app/action-claims") => ActionClaims,
        ("POST", "/app/action-claims/reconcile") => ReconcileActionClaim,
        ("GET", "/app/settings/white-labeling") => Branding,
        ("POST", "/app/settings/white-labeling") => SaveBranding,
        ("GET", "/app/docs" | "/app/support") => return Some(None),
        _ => {
            let parts: Vec<_> = path.trim_start_matches('/').split('/').collect();
            if parts.first() != Some(&"app") {
                return None;
            }
            match (
                method,
                parts.get(1).copied(),
                parts.len(),
                parts.get(3).copied(),
            ) {
                ("GET", Some("connectors"), 3, _) => Connector,
                ("GET", Some("runs"), 3, _) => RunDetail,
                ("GET", Some("connectors"), 4, Some("test-form")) => TestForm,
                ("GET", Some("connectors"), 4, Some("options")) => Options,
                ("GET", Some("connectors"), 4, Some("runinput-fields")) => RunInputFields,
                ("POST", Some("connectors"), 4, Some("setup")) => Setup,
                ("POST", Some("connectors"), 4, Some("test")) => Test,
                ("POST", Some("connections"), 4, Some("test")) => TestConnection,
                ("POST", Some("connections"), 4, Some("disconnect")) => DisconnectConnection,
                ("POST", Some("events"), 4, Some("replay")) => ReplayEvent,
                ("POST", Some("runs"), 4, Some("run-now")) => RunNow,
                ("POST", Some("runs"), 4, Some("reset")) => ResetRun,
                ("POST", Some("runs"), 4, Some("cancel")) => CancelRun,
                ("GET", Some("logs"), 3, _) => Trace,
                ("POST", Some("logs"), 4, Some("replay")) => ReplayTrace,
                _ => return None,
            }
        }
    };
    Some(Some(direct))
}

#[cfg(test)]
mod run_detail_route_tests {
    use super::*;
    use serde_json::json;
    use std::{collections::BTreeMap, future::Future, pin::Pin, sync::Mutex};

    #[test]
    fn get_run_detail_resolves_only_the_bounded_run_resource_route() {
        assert_eq!(
            resolve("GET", "/app/runs/run-42"),
            Some(Some(DashboardOperation::RunDetail))
        );
        assert_eq!(resolve("POST", "/app/runs/run-42"), None);
        assert_eq!(resolve("GET", "/app/runs/run-42/extra"), None);
        assert_eq!(
            resolve("GET", "/app/runs"),
            Some(Some(DashboardOperation::Runs))
        );
    }

    struct Capture {
        value: Value,
        requests: Mutex<Vec<DashboardRequest>>,
    }

    impl DashboardData for Capture {
        fn execute(
            &self,
            request: DashboardRequest,
        ) -> Pin<Box<dyn Future<Output = Result<Value, Error>> + Send + '_>> {
            self.requests.lock().unwrap().push(request);
            let value = self.value.clone();
            Box::pin(async move { Ok(value) })
        }
    }

    #[tokio::test]
    async fn run_detail_forwards_resource_effective_account_and_history_query() {
        let data = Capture {
            value: json!({
                "run": {
                    "id": "run-42",
                    "connector": "github",
                    "tool": "issues.list",
                    "accountId": "acct-primary",
                    "health": "succeeded",
                    "attemptsSpent": 1,
                    "attemptsRemaining": 2,
                    "currentCursor": "cursor-42"
                },
                "history": {"complete": true, "events": []},
                "recordsObserved": 0,
                "recordsPartial": false,
                "pagination": {"hasMore": false}
            }),
            requests: Mutex::new(Vec::new()),
        };
        let mut fields = BTreeMap::new();
        fields.insert("accountId".into(), vec!["acct-primary".into()]);
        fields.insert("externalAccountId".into(), vec!["acct-alias".into()]);
        fields.insert("limit".into(), vec!["7".into()]);
        fields.insert("cursor".into(), vec!["Mw".into()]);
        let request = Request {
            method: "GET",
            path: "/app/runs/run-42",
            cookies: "",
            origin: None,
            referer: None,
            fields,
            now: 100,
        };
        let session = Session {
            access_token: String::new(),
            refresh_token: String::new(),
            user_id: "user".into(),
            email: "user@example.test".into(),
            tenant_id: "tenant".into(),
            tenant_name: "Tenant".into(),
        };

        let _ = DashboardRenderer { data: &data }
            .render(
                &request,
                Some(DashboardOperation::RunDetail),
                &session,
                Principal::project("project").unwrap(),
            )
            .await
            .unwrap();

        let requests = data.requests.lock().unwrap();
        assert_eq!(requests.len(), 1);
        let forwarded = &requests[0];
        assert_eq!(forwarded.operation, DashboardOperation::RunDetail);
        assert_eq!(forwarded.resource.as_deref(), Some("run-42"));
        assert_eq!(forwarded.account_id.as_deref(), Some("acct-primary"));
        assert_eq!(forwarded.fields.get("limit").map(String::as_str), Some("7"));
        assert_eq!(
            forwarded.fields.get("cursor").map(String::as_str),
            Some("Mw")
        );
        assert_eq!(
            forwarded.fields.get("accountId").map(String::as_str),
            Some("acct-primary")
        );
        assert_eq!(
            forwarded
                .fields
                .get("externalAccountId")
                .map(String::as_str),
            Some("acct-alias")
        );
    }

    #[tokio::test]
    async fn events_page_builds_an_encoded_filtered_stream_url_from_snapshot_cursor() {
        let data = Capture {
            value: json!({
                "events": [{
                    "id": "event-1",
                    "connector": "mail",
                    "operation": "messages.list",
                    "connectionId": "connection-1",
                    "createdAt": "2026-09-08T00:00:00Z"
                }],
                "streamCursor": "cursor<&"
            }),
            requests: Mutex::new(Vec::new()),
        };
        let mut fields = BTreeMap::new();
        fields.insert("connector".into(), vec!["mail".into()]);
        fields.insert("connectionId".into(), vec!["connection<&".into()]);
        fields.insert("operation".into(), vec!["messages.list".into()]);
        let response = DashboardRenderer { data: &data }
            .render(
                &Request {
                    method: "GET",
                    path: "/app/events",
                    cookies: "",
                    origin: None,
                    referer: None,
                    fields,
                    now: 100,
                },
                Some(DashboardOperation::Events),
                &Session {
                    access_token: String::new(),
                    refresh_token: String::new(),
                    user_id: "user".into(),
                    email: "user@example.test".into(),
                    tenant_id: "tenant".into(),
                    tenant_name: "Tenant".into(),
                },
                Principal::project("project").unwrap(),
            )
            .await
            .unwrap();

        assert!(response.body.contains(
            "data-init=\"@get('/app/events/stream?connector=mail&amp;connectionId=connection%3C%26&amp;operation=messages.list&amp;since=cursor%3C%26')\""
        ));
    }

    #[test]
    fn event_stream_url_classifies_combined_encoded_filter_overflow_as_request_too_large() {
        let filter = "<&".repeat(700);
        assert!(filter.len() <= 4096);
        let request = Request {
            method: "GET",
            path: "/app/events",
            cookies: "",
            origin: None,
            referer: None,
            fields: [
                ("connector".into(), vec![filter.clone()]),
                ("connectionId".into(), vec![filter.clone()]),
                ("operation".into(), vec![filter]),
            ]
            .into(),
            now: 100,
        };

        let error = event_stream_url(&request, &json!({})).unwrap_err();
        assert_eq!(error, Error::RequestTooLarge);
    }

    #[tokio::test]
    async fn events_pagination_preserves_connector_connection_and_operation_filters() {
        let data = Capture {
            value: json!({
                "events": [],
                "pagination": {"hasMore": true, "nextCursor": "next+cursor="}
            }),
            requests: Mutex::new(Vec::new()),
        };
        let mut fields = BTreeMap::new();
        fields.insert("connector".into(), vec!["mail".into()]);
        fields.insert("connectionId".into(), vec!["connection<&".into()]);
        fields.insert("operation".into(), vec!["messages.list".into()]);
        let response = DashboardRenderer { data: &data }
            .render(
                &Request {
                    method: "GET",
                    path: "/app/events",
                    cookies: "",
                    origin: None,
                    referer: None,
                    fields,
                    now: 100,
                },
                Some(DashboardOperation::Events),
                &Session {
                    access_token: String::new(),
                    refresh_token: String::new(),
                    user_id: "user".into(),
                    email: "user@example.test".into(),
                    tenant_id: "tenant".into(),
                    tenant_name: "Tenant".into(),
                },
                Principal::project("project").unwrap(),
            )
            .await
            .unwrap();

        assert!(response.body.contains(
            "href=\"/app/events?connector=mail&amp;connectionId=connection%3C%26&amp;operation=messages.list&amp;cursor=next%2Bcursor%3D\""
        ));
        assert!(!response.body.contains("status="));
        assert!(!response.body.contains("action="));
    }
}

#[cfg(test)]
mod action_claim_route_tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn action_claim_routes_are_bounded_and_csrf_relevant() {
        assert_eq!(
            resolve("GET", "/app/action-claims"),
            Some(Some(DashboardOperation::ActionClaims))
        );
        assert_eq!(
            resolve("POST", "/app/action-claims/reconcile"),
            Some(Some(DashboardOperation::ReconcileActionClaim))
        );
        assert_eq!(resolve("GET", "/app/action-claims/reconcile"), None);
        assert_eq!(resolve("POST", "/app/action-claims"), None);
        assert_eq!(resolve("POST", "/app/action-claims/reconcile/extra"), None);
    }

    #[test]
    fn action_claim_lookup_renders_scoped_inputs_and_no_actor_field() {
        let html = crate::pages::render(
            DashboardOperation::ActionClaims,
            &json!({"accountId":"brand-a","claim":null}),
            None,
        )
        .unwrap();
        for expected in [
            "id=\"action-claims-page\"",
            "Action claim recovery",
            "name=\"externalAccountId\"",
            "name=\"idempotencyKey\"",
            "name=\"expectedRequestId\"",
            "Inspect claim",
        ] {
            assert!(html.contains(expected), "missing {expected}: {html}");
        }
        assert!(!html.contains("name=\"actorId\""));
        assert!(!html.contains("inputHash"));
    }

    #[test]
    fn action_claim_detail_exposes_only_typed_resolution_and_bounded_evidence() {
        let html = crate::pages::render(
            DashboardOperation::ActionClaims,
            &json!({
                "accountId":"brand-a",
                "claim": {
                    "projectId":"proj_tenant-a",
                    "idempotencyKey":"claim-key",
                    "requestId":"req-1",
                    "connectionId":"connection-original",
                    "externalAccountId":"brand-a",
                    "connector":"fixture",
                    "action":"messages.send",
                    "inputHash":"hash-original",
                    "dispatched":true,
                    "leaseExpired":true,
                    "ownershipProven":true,
                    "reconciliationAllowed":true,
                    "leasedUntil":"2026-09-12T10:00:00Z",
                    "dispatchedAt":"2026-09-12T09:00:00Z",
                    "createdAt":"2026-09-12T08:00:00Z",
                    "reservation":{"id":"reservation-1","state":"dispatched","month":"2026-09","expiresAt":"2026-09-13T08:00:00Z","identityBound":true}
                }
            }),
            None,
        )
        .unwrap();
        for expected in [
            "claim-key",
            "req-1",
            "messages.send",
            "Reconcile this claim",
            "provenNotDispatched",
            "providerOutcomeKnown",
            "providerSucceeded",
            "evidenceRef",
            "No provider call or automatic retry is performed",
            "name=\"expectedRequestId\"",
            "value=\"req-1\"",
        ] {
            assert!(html.contains(expected), "missing {expected}: {html}");
        }
        assert!(!html.contains("name=\"actorId\""));
        assert!(!html.contains("name=\"input\""));
    }

    #[test]
    fn action_claim_reconciliation_result_is_explicitly_audited() {
        let html = crate::pages::render(
            DashboardOperation::ReconcileActionClaim,
            &json!({
                "auditId":"recon_123",
                "resolution":{"kind":"provenNotDispatched"},
                "reservationState":"released",
                "chargesRefunded":true,
                "usageRecorded":false
            }),
            None,
        )
        .unwrap();
        for expected in [
            "Reconciliation recorded",
            "recon_123",
            "released",
            "Charges refunded",
            "No provider call or automatic retry was performed",
            "/app/action-claims",
        ] {
            assert!(html.contains(expected), "missing {expected}: {html}");
        }
    }
}

// The trusted service must explicitly identify a configured development flow.
// Local callback URLs carry only the connector and connection selected by that
// service, never arbitrary destinations or browser-supplied redirect parameters.
fn valid_local_setup_redirect(raw: &str, connector: &str) -> bool {
    if raw.len() > 2048 || !raw.starts_with("/oauth/local/authorize?") {
        return false;
    }
    let Ok(url) = reqwest::Url::parse(&format!("https://local.invalid{raw}")) else {
        return false;
    };
    if url.path() != "/oauth/local/authorize" || url.fragment().is_some() {
        return false;
    }
    let mut fields = BTreeMap::new();
    for (key, value) in url.query_pairs() {
        if !matches!(key.as_ref(), "connector" | "connectionId")
            || fields
                .insert(key.into_owned(), value.into_owned())
                .is_some()
        {
            return false;
        }
    }
    fields.len() == 2
        && fields.get("connector").is_some_and(|v| v == connector)
        && fields.get("connectionId").is_some_and(|id| {
            !id.is_empty()
                && id.len() <= 256
                && id
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
        })
}

#[cfg(test)]
#[path = "dashboard/tests.rs"]
mod renderer_contract_tests;

#[cfg(test)]
#[path = "dashboard/copy_tests.rs"]
mod copy_tests;

#[cfg(test)]
mod redirect_tests {
    #[test]
    fn local_setup_redirect_is_exact_bound_and_unambiguous() {
        assert!(super::valid_local_setup_redirect(
            "/oauth/local/authorize?connector=google-workspace&connectionId=conn_dev_123",
            "google-workspace"
        ));
        for url in [
            "//evil.example/oauth/local/authorize?connector=google-workspace&connectionId=x",
            "/oauth/local/authorize/../elsewhere?connector=google-workspace&connectionId=x",
            "/oauth/local/authorize?connector=other&connectionId=x",
            "/oauth/local/authorize?connector=google-workspace&connector=google-workspace&connectionId=x",
            "/oauth/local/authorize?connector=google-workspace&connectionId=x&connectionId=y",
            "/oauth/local/authorize?connector=google-workspace&connectionId=x&next=https://evil.example",
            "/oauth/local/authorize?connector=google-workspace&connectionId=x#fragment",
            "/oauth/local/authorize?connector=google-workspace&connectionId=%2Foutside",
        ] { assert!(!super::valid_local_setup_redirect(url,"google-workspace"),"{url}"); }
    }
}
