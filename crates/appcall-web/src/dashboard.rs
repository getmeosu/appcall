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
                    Response::redirect("/app/login").cookie(self.browser.codec.clear_session()),
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
                    Response::redirect("/app/login").cookie(self.browser.codec.clear_session()),
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
pub(crate) struct DashboardRenderer<'a> {
    pub data: &'a dyn DashboardData,
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
                ),
            ));
        }
        let operation = operation.ok_or(Error::Invalid)?;
        let mut fields = BTreeMap::new();
        if r.fields.len() > 64 {
            return Err(Error::Invalid);
        }
        for (key, values) in &r.fields {
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
        let mut value = self
            .data
            .execute(DashboardRequest {
                principal,
                operation,
                resource: resource.clone(),
                account_id,
                fields,
                form_values: r.fields.clone(),
            })
            .await?;
        if operation == DashboardOperation::Catalog {
            let target = if value.get("data").is_some() {
                value.get_mut("data").ok_or(Error::Unavailable)?
            } else {
                &mut value
            };
            let map = target.as_object_mut().ok_or(Error::Unavailable)?;
            let connectors = map
                .get("connectors")
                .and_then(Value::as_array)
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
            let filtered = connectors
                .iter()
                .filter(|c| {
                    selected.is_empty()
                        || c.get("categories")
                            .and_then(Value::as_array)
                            .is_some_and(|values| {
                                values.iter().any(|v| v.as_str() == Some(selected))
                            })
                })
                .cloned()
                .collect::<Vec<_>>();
            map.insert("connectors".into(), Value::Array(filtered));
            map.insert("categories".into(), serde_json::json!(categories));
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
        let mut content = crate::pages::render(operation, &value, resource.as_deref())?;
        if operation == Branding && r.field("saved")? == "1" {
            content = crate::admin_ui::banner("Branding saved.", true) + &content;
        }
        let banner=match (operation,r.field("success")?,r.field("error")?) {
            (AuthConfigs,"test-passed",_)=>"Connection test passed successfully.",
            (AuthConfigs,"test-unverified",_)=>"Connector is reachable, but the connection could not be verified — its credential is supplied per call, so there was nothing to check here.",
            (AuthConfigs,"disconnected",_)=>"Account disconnected successfully.",
            (AuthConfigs,_,"test-failed")=>"Connection test failed. Check credentials and try again.",
            (AuthConfigs,_,"disconnect-failed")=>"Failed to disconnect the account. Please try again.",
            _=>""
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
                for key in ["status", "connector", "action", "connectionId"] {
                    let value = r.field(key)?;
                    if !value.is_empty() {
                        url.query_pairs_mut().append_pair(key, value);
                    }
                }
                url.query_pairs_mut().append_pair("cursor", cursor);
                content.push_str(&format!("<div class=\"mt-4 flex justify-center\"><a class=\"rounded-lg border border-space-indigo-700 px-4 py-2 text-sm\" href=\"{}?{}\">Load more</a></div>",url.path(),escape(url.query().unwrap_or(""))));
            }
        }
        if !banner.is_empty() {
            content=format!("<div role=\"status\" class=\"mb-4 rounded-lg border border-space-indigo-800 p-4 text-sm\">{}</div>{content}",escape(banner));
        }
        if matches!(
            operation,
            Test | Options | RunInputFields | TestForm | RequestToolkit
        ) {
            return Ok(crate::sse::response(&content));
        }
        Ok(Response::new(
            200,
            crate::shell::layout(crate::pages::title(operation), session, &content),
        ))
    }
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
