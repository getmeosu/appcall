use crate::{http::escape, *};
use appcall_auth::Principal;
use serde_json::Value;
use std::{collections::BTreeMap, future::Future, pin::Pin};
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DashboardOperation {
    Overview,
    Catalog,
    Toolkit,
    TestForm,
    Options,
    RunInputFields,
    Setup,
    Test,
    RequestToolkit,
    AuthConfigs,
    TestConnection,
    DisconnectConnection,
    Triggers,
    ReplayEvent,
    Stream,
    Logs,
    Trace,
    ReplayTrace,
    Qa,
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
        let (session, principal) = match self.browser.identity.refresh(&session, r.now).await {
            Ok(pair) => pair,
            Err(Error::Unavailable) => {
                return Some(Response::new(503, "Identity service unavailable".into()))
            }
            Err(_) => {
                return Some(
                    session_required(trace_drawer).cookie(self.browser.codec.clear_session()),
                )
            }
        };
        let result = DashboardRenderer { data: self.data }
            .render(r, operation, &session, principal)
            .await;
        Some(match result {
            Ok(response) => match self.browser.codec.session_cookie(&session) {
                Ok(c) => response.cookie(c),
                Err(_) => Response::new(503, "Session unavailable".into()),
            },
            Err(e) => Response::new(
                match e {
                    Error::Invalid => 400,
                    Error::Unauthorized => 401,
                    Error::Forbidden => 403,
                    _ => 503,
                },
                escape(&e.to_string()),
            ),
        })
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
        // No trusted operator authority is configured; tenant grants cannot authorize QA.
        if operation == DashboardOperation::Qa {
            return Err(Error::Forbidden);
        }
        let trace_drawer = crate::trace::drawer_request(r, Some(operation))?;
        let log_filters = if operation == DashboardOperation::Logs {
            crate::logs::Filters::from_request(r)?
        } else {
            crate::logs::Filters::default()
        };
        let has_filters = match operation {
            DashboardOperation::Catalog => {
                !r.field("category")?.trim().is_empty() || !r.field("search")?.trim().is_empty()
            }
            DashboardOperation::Logs => log_filters.active(),
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
                    | DashboardOperation::RequestToolkit
                    | DashboardOperation::Stream
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
        let account_id = fields
            .get("externalAccountId")
            .filter(|id| !id.is_empty())
            .cloned();
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
                if operation == DashboardOperation::RequestToolkit
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
            Err(error) => return Err(error.classification()),
        };
        if matches!(
            operation,
            DashboardOperation::Catalog | DashboardOperation::Logs
        ) {
            let target = if value.get("data").is_some() {
                value.get_mut("data").ok_or(Error::Unavailable)?
            } else {
                &mut value
            };
            if target.is_array() {
                let key = if operation == DashboardOperation::Catalog {
                    "connectors"
                } else {
                    "logs"
                };
                *target = serde_json::json!({key:target.clone()});
            }
            let map = target.as_object_mut().ok_or(Error::Unavailable)?;
            // This presentation flag is derived only from the current request,
            // overwriting any provider-supplied value without echoing query text.
            map.insert("hasFilters".into(), Value::Bool(has_filters));
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
            DisconnectConnection => Some("/app/auth-configs?success=disconnected".to_owned()),
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
                        "/app/auth-configs?success=test-passed"
                    } else {
                        "/app/auth-configs?success=test-unverified"
                    }
                    .to_owned(),
                )
            }
            ReplayEvent => Some("/app/triggers?replayed=1".to_owned()),
            ReplayTrace => Some(format!(
                "/app/logs/{}?replayed=1",
                resource.as_deref().unwrap_or("")
            )),
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
                "/app/toolkits/{}?success=1",
                resource.as_deref().ok_or(Error::Invalid)?
            )));
        }
        if operation == Stream {
            let body = value
                .get("events")
                .and_then(Value::as_array)
                .ok_or(Error::Unavailable)?
                .iter()
                .map(crate::render_trigger_patch)
                .collect::<Result<Vec<_>, _>>()?
                .join("");
            let mut response = Response::new(200, body);
            response.headers.retain(|(k, _)| k != "Content-Type");
            response
                .headers
                .push(("Content-Type".into(), "text/event-stream".into()));
            return Ok(response);
        }
        if operation == Toolkit {
            let tab = crate::toolkit::selected_tab(r.field("tab")?);
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
            (AuthConfigs, _, "test-failed") if has_connections => {
                ("Review the connection setup and its recorded status.", true)
            }
            (AuthConfigs, _, "disconnect-failed") if has_connections => (
                "Check the connection's current status before running another tool.",
                true,
            ),
            (AuthConfigs, "test-passed" | "test-unverified", _) if has_connections => (
                "Review the connection's recorded check result below.",
                false,
            ),
            (AuthConfigs, "disconnected", _) if has_connections => (
                "Check the connection's current status before running another tool.",
                false,
            ),
            _ => ("", false),
        };
        if matches!(operation, Logs | Triggers) {
            let data = value.get("data").unwrap_or(&value);
            if let Some(cursor) = data
                .pointer("/pagination/nextCursor")
                .and_then(Value::as_str)
                .filter(|v| !v.is_empty())
            {
                let mut url = reqwest::Url::parse(&format!("https://local.invalid{}", r.path))
                    .map_err(|_| Error::Invalid)?;
                let keys: &[&str] = if operation == Logs {
                    crate::logs::FILTER_KEYS
                } else {
                    &["status", "connector", "action", "connectionId"]
                };
                for key in keys {
                    let value = r.field(key)?;
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
            Test | Options | RunInputFields | TestForm | RequestToolkit
        ) {
            return Ok(crate::sse::response(&content));
        }
        Ok(Response::new(
            200,
            crate::shell::layout(crate::pages::title(operation), session, &content, r.path),
        ))
    }
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
        ("GET", "/app/toolkits") => Catalog,
        ("POST", "/app/toolkits/request") => RequestToolkit,
        ("GET", "/app/auth-configs") => AuthConfigs,
        ("GET", "/app/triggers") => Triggers,
        ("GET", "/app/triggers/stream") => Stream,
        ("GET", "/app/logs") => Logs,
        ("GET", "/app/qa") => Qa,
        ("GET", "/app/settings/usage") => Usage,
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
                ("GET", Some("toolkits"), 3, _) => Toolkit,
                ("GET", Some("toolkits"), 4, Some("test-form")) => TestForm,
                ("GET", Some("toolkits"), 4, Some("options")) => Options,
                ("GET", Some("toolkits"), 4, Some("runinput-fields")) => RunInputFields,
                ("POST", Some("toolkits"), 4, Some("setup")) => Setup,
                ("POST", Some("toolkits"), 4, Some("test")) => Test,
                ("POST", Some("auth-configs"), 4, Some("test")) => TestConnection,
                ("POST", Some("auth-configs"), 4, Some("disconnect")) => DisconnectConnection,
                ("POST", Some("triggers"), 4, Some("replay")) => ReplayEvent,
                ("GET", Some("logs"), 3, _) => Trace,
                ("POST", Some("logs"), 4, Some("replay")) => ReplayTrace,
                _ => return None,
            }
        }
    };
    Some(Some(direct))
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
