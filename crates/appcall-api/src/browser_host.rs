//! Browser host boundary: exact routing, bounded parsing and off-reactor identity SQL.
pub mod dashboard_failure;
use crate::run_operator::RunOperatorGrants;
use crate::{ApiError, Backend, RawResponse, Request, Result};
use appcall_auth::{JwtPolicy, JwtVerifier, PostgresApiKeys, PostgresMemberships};
use appcall_web::{DashboardData, DashboardFailure, DashboardOperation as Op, DashboardRequest};
use serde_json::{json, Value};
use std::{
    collections::BTreeMap,
    future::Future,
    pin::Pin,
    sync::{Arc, Mutex},
    task::{Context, Poll, Wake, Waker},
    time::Duration,
};

#[derive(Clone)]
pub struct BrowserConfig {
    pub public_origin: String,
    pub broker_url: String,
    pub session_secret: String,
    pub jwt_secret: String,
    pub cookie_secure: bool,
    pub product_slug: String,
}
impl BrowserConfig {
    pub fn from_env() -> Result<Self> {
        Self::from_map(&std::env::vars().collect())
    }
    pub fn from_map(env: &BTreeMap<String, String>) -> Result<Self> {
        let get = |key: &str| env.get(key).cloned().unwrap_or_default();
        let production = matches!(
            get("APPCALL_ENV").trim().to_ascii_lowercase().as_str(),
            "production" | "prod"
        );
        let config = Self {
            public_origin: get("APPCALL_PUBLIC_BASE_URL"),
            broker_url: get("ANUSA_API_URL"),
            session_secret: get("APPCALL_SESSION_SECRET"),
            jwt_secret: get("ANUSA_JWT_ACCESS_SECRET"),
            cookie_secure: production
                || matches!(get("APPCALL_SESSION_COOKIE_SECURE").as_str(), "1" | "true"),
            product_slug: "appcall".into(),
        };
        config.validate()?;
        Ok(config)
    }
    fn validate(&self) -> Result<()> {
        let url = url::Url::parse(&self.public_origin)
            .map_err(|_| ApiError::new("INVALID_CONFIGURATION"))?;
        if self.session_secret.is_empty()
            || self.jwt_secret.is_empty()
            || self.broker_url.is_empty()
            || !url.username().is_empty()
            || url.password().is_some()
            || url.query().is_some()
            || url.fragment().is_some()
            || url.path() != "/"
            || !(url.scheme() == "https"
                || url.scheme() == "http"
                    && matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]")))
            || self.cookie_secure && url.scheme() != "https"
        {
            return Err(ApiError::new("INVALID_CONFIGURATION"));
        }
        Ok(())
    }
}
struct BrowserInner {
    codec: appcall_web::SessionCodec,
    jwt: JwtVerifier,
    memberships: PostgresMemberships,
    broker: Arc<appcall_web::Broker>,
    origin: String,
    data: Arc<dyn DashboardData>,
}
pub struct BrowserHost {
    inner: Arc<BrowserInner>,
    admission: Arc<tokio::sync::Semaphore>,
}
impl BrowserHost {
    pub fn new(
        config: BrowserConfig,
        membership_client: postgres::Client,
        data: Arc<dyn DashboardData>,
    ) -> Result<Self> {
        let broker = Arc::new(
            appcall_web::Broker::new(&config.broker_url, &config.product_slug)
                .map_err(web_error)?,
        );
        Self::with_broker(config, membership_client, data, broker)
    }
    pub fn with_broker(
        config: BrowserConfig,
        membership_client: postgres::Client,
        data: Arc<dyn DashboardData>,
        broker: Arc<appcall_web::Broker>,
    ) -> Result<Self> {
        config.validate()?;
        Ok(Self {
            inner: Arc::new(BrowserInner {
                codec: appcall_web::SessionCodec::new(&config.session_secret, config.cookie_secure)
                    .map_err(web_error)?,
                jwt: JwtVerifier::new(config.jwt_secret, JwtPolicy::default())
                    .map_err(|_| ApiError::new("INVALID_CONFIGURATION"))?,
                memberships: PostgresMemberships::new(membership_client),
                broker,
                origin: config.public_origin.trim_end_matches('/').into(),
                data,
            }),
            admission: Arc::new(tokio::sync::Semaphore::new(4)),
        })
    }
    pub fn database_health(&self) -> Option<bool> {
        crate::combined_database_health([
            self.inner.memberships.database_health(),
            self.inner.data.database_health(),
        ])
    }
    async fn invoke<T: Send + 'static>(
        &self,
        f: impl FnOnce(Arc<BrowserInner>, Arc<Cancellation>) -> Result<T> + Send + 'static,
    ) -> Result<T> {
        let permit = self
            .admission
            .clone()
            .try_acquire_owned()
            .map_err(|_| ApiError::new("SERVICE_BUSY"))?;
        let cancel = Arc::new(Cancellation::default());
        let _guard = CancelGuard(cancel.clone());
        let inner = self.inner.clone();
        let task = tokio::task::spawn_blocking(move || {
            let _permit = permit;
            cancel.check()?;
            f(inner, cancel)
        });
        tokio::time::timeout(Duration::from_secs(15), task)
            .await
            .map_err(|_| ApiError::new("SERVICE_BUSY"))?
            .map_err(|_| ApiError::new("STORAGE_UNAVAILABLE"))?
    }
    pub async fn authorize_headers(
        &self,
        headers: &[(String, String)],
    ) -> Result<appcall_auth::Principal> {
        if headers.len() > 64
            || headers
                .iter()
                .map(|(k, v)| k.len() + v.len())
                .sum::<usize>()
                > 16384
        {
            return Err(ApiError::new("REQUEST_TOO_LARGE"));
        }
        let headers = headers.to_vec();
        self.invoke(move |inner, cancel| {
            let headers = headers
                .iter()
                .map(|(k, v)| appcall_auth::Header::new(k, v))
                .collect::<Vec<_>>();
            let result = appcall_auth::Authenticator::production(
                None,
                Some(&inner.jwt),
                Some(&inner.memberships),
            )
            .and_then(|a| {
                a.authorize(
                    &headers,
                    &appcall_auth::RequestContext {
                        now_unix: chrono::Utc::now().timestamp(),
                        ..Default::default()
                    },
                )
            })
            .map_err(crate::authentication_error);
            cancel.check()?;
            result
        })
        .await
    }
    pub async fn verify_session(&self, request: &Request) -> Result<appcall_auth::Principal> {
        let parsed = parse_request(request)?;
        self.invoke(move |inner, cancel| {
            let raw = appcall_web::cookie(&parsed.cookies, "appcall_session")
                .map_err(web_error)?
                .ok_or_else(|| ApiError::new("UNAUTHORIZED"))?;
            let session = inner.codec.open_session(raw).map_err(web_error)?;
            let identity = appcall_web::Identity {
                jwt: &inner.jwt,
                memberships: &inner.memberships,
                broker: &inner.broker,
            };
            let result = identity
                .authorize(&session, chrono::Utc::now().timestamp())
                .map_err(web_error);
            cancel.check()?;
            result
        })
        .await
    }
    pub async fn authorize_session(
        &self,
        request: &Request,
    ) -> Result<(appcall_auth::Principal, String)> {
        let parsed = parse_request(request)?;
        self.invoke(move |inner, cancel| {
            let raw = appcall_web::cookie(&parsed.cookies, "appcall_session")
                .map_err(web_error)?
                .ok_or_else(|| ApiError::new("UNAUTHORIZED"))?;
            let session = inner.codec.open_session(raw).map_err(web_error)?;
            let identity = appcall_web::Identity {
                jwt: &inner.jwt,
                memberships: &inner.memberships,
                broker: &inner.broker,
            };
            let (session, principal) = drive(
                identity.refresh(&session, chrono::Utc::now().timestamp()),
                cancel,
            )?
            .map_err(web_error)?;
            Ok((
                principal,
                inner.codec.session_cookie(&session).map_err(web_error)?,
            ))
        })
        .await
    }
    /// Handles browser routes, preserving binary asset bytes in the response.
    /// Returns `Ok(None)` for routes outside the browser surface and propagates
    /// request-validation errors. Admission or deadline exhaustion is `SERVICE_BUSY`.
    pub async fn handle(&self, request: &Request) -> Result<Option<RawResponse>> {
        if !public_path(&request.method, request.uri.split('?').next().unwrap_or("")) {
            return Ok(None);
        }
        let validated = validate_request(request)?;
        if let Some(response) = legacy_redirect(request) {
            return Ok(Some(response));
        }
        let parsed = parse_request_validated(request, validated)?;
        self.invoke(move |inner, cancel| {
            let browser = appcall_web::Browser {
                codec: &inner.codec,
                identity: appcall_web::Identity {
                    jwt: &inner.jwt,
                    memberships: &inner.memberships,
                    broker: &inner.broker,
                },
                public_origin: &inner.origin,
            };
            let dashboard = appcall_web::Dashboard {
                browser: &browser,
                data: &*inner.data,
            };
            let request = appcall_web::Request {
                method: &parsed.method,
                path: &parsed.path,
                cookies: &parsed.cookies,
                origin: parsed.origin.as_deref(),
                referer: parsed.referer.as_deref(),
                fields: parsed.fields,
                now: chrono::Utc::now().timestamp(),
            };
            Ok(drive(dashboard.handle(&request), cancel)?.map(web_response))
        })
        .await
    }
}
#[derive(Default)]
pub(crate) struct Cancellation {
    cancelled: std::sync::atomic::AtomicBool,
    thread: Mutex<Option<std::thread::Thread>>,
}
impl Cancellation {
    pub(crate) fn check(&self) -> Result<()> {
        if self.cancelled.load(std::sync::atomic::Ordering::Acquire) {
            Err(ApiError::new("SERVICE_BUSY"))
        } else {
            Ok(())
        }
    }
}
pub(crate) struct CancelGuard(pub(crate) Arc<Cancellation>);
impl Drop for CancelGuard {
    fn drop(&mut self) {
        self.0
            .cancelled
            .store(true, std::sync::atomic::Ordering::Release);
        if let Ok(thread) = self.0.thread.lock() {
            if let Some(thread) = &*thread {
                thread.unpark()
            }
        }
    }
}
thread_local! {static REQUEST_CANCEL:std::cell::RefCell<Option<Arc<Cancellation>>>=const{std::cell::RefCell::new(None)};}
pub(crate) fn ensure_active() -> std::result::Result<(), appcall_web::Error> {
    REQUEST_CANCEL.with(|slot| {
        if slot
            .borrow()
            .as_ref()
            .is_some_and(|token| token.check().is_err())
        {
            Err(appcall_web::Error::Unavailable)
        } else {
            Ok(())
        }
    })
}
// spawn_blocking retains the Tokio handle for network/timer registration. This
// executor polls outside an entered async runtime so synchronous postgres may
// drive its own runtime safely while the caller reactor remains responsive.
pub(crate) fn drive<F: Future>(future: F, cancel: Arc<Cancellation>) -> Result<F::Output> {
    *cancel
        .thread
        .lock()
        .map_err(|_| ApiError::new("SERVICE_BUSY"))? = Some(std::thread::current());
    REQUEST_CANCEL.with(|slot| *slot.borrow_mut() = Some(cancel.clone()));
    struct Clear;
    impl Drop for Clear {
        fn drop(&mut self) {
            REQUEST_CANCEL.with(|slot| *slot.borrow_mut() = None)
        }
    }
    let _clear = Clear;
    struct Signal(std::thread::Thread);
    impl Wake for Signal {
        fn wake(self: Arc<Self>) {
            self.0.unpark()
        }
        fn wake_by_ref(self: &Arc<Self>) {
            self.0.unpark()
        }
    }
    let waker = Waker::from(Arc::new(Signal(std::thread::current())));
    let mut cx = Context::from_waker(&waker);
    let mut future = std::pin::pin!(future);
    loop {
        cancel.check()?;
        match future.as_mut().poll(&mut cx) {
            Poll::Ready(value) => return Ok(value),
            Poll::Pending => std::thread::park(),
        }
    }
}
pub struct ParsedRequest {
    pub method: String,
    pub path: String,
    pub cookies: String,
    pub origin: Option<String>,
    pub referer: Option<String>,
    pub fields: BTreeMap<String, Vec<String>>,
}
pub(crate) struct ValidatedRequest {
    url: url::Url,
    origin: Option<String>,
    referer: Option<String>,
}
pub(crate) fn validate_request(request: &Request) -> Result<ValidatedRequest> {
    if request.uri.len() > 4096
        || request.body.len() > 65536
        || request.headers.len() > 64
        || request
            .headers
            .iter()
            .map(|(k, v)| k.len() + v.len())
            .sum::<usize>()
            > 16384
    {
        return Err(ApiError::new("REQUEST_TOO_LARGE"));
    }
    let url = url::Url::parse(&format!("http://local.invalid{}", request.uri))
        .map_err(|_| ApiError::new("INVALID_REQUEST"))?;
    let singleton = |name: &str| -> Result<Option<String>> {
        let matches = request
            .headers
            .iter()
            .filter(|(k, _)| k.eq_ignore_ascii_case(name))
            .collect::<Vec<_>>();
        if matches.len() > 1 {
            return Err(ApiError::new("INVALID_REQUEST"));
        }
        Ok(matches.first().map(|(_, v)| v.clone()))
    };
    let origin = singleton("Origin")?;
    let referer = singleton("Referer")?;
    let content_type = singleton("Content-Type")?;
    if request
        .headers
        .iter()
        .any(|(k, v)| k.chars().any(char::is_control) || v.contains(['\r', '\n']))
    {
        return Err(ApiError::new("INVALID_REQUEST"));
    }
    if !request.body.is_empty()
        && content_type
            .as_deref()
            .and_then(|s| s.split(';').next())
            .map(str::trim)
            != Some("application/x-www-form-urlencoded")
    {
        return Err(ApiError::new("INVALID_REQUEST"));
    }
    Ok(ValidatedRequest {
        url,
        origin,
        referer,
    })
}
pub(crate) fn parse_request_validated(
    request: &Request,
    validated: ValidatedRequest,
) -> Result<ParsedRequest> {
    let ValidatedRequest {
        url,
        origin,
        referer,
    } = validated;
    let mut fields: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for (key, value) in url
        .query_pairs()
        .chain(url::form_urlencoded::parse(&request.body))
    {
        if fields.len() >= 64 || key.len() > 256 || value.len() > 16384 {
            return Err(ApiError::new("REQUEST_TOO_LARGE"));
        }
        let bound = if key.starts_with("f.") && (key.ends_with(".key") || key.ends_with(".val")) {
            64
        } else {
            8
        };
        let values = fields.entry(key.into_owned()).or_default();
        if values.len() >= bound {
            return Err(ApiError::new("INVALID_REQUEST"));
        }
        values.push(value.into_owned())
    }
    Ok(ParsedRequest {
        method: request.method.clone(),
        path: appcall_web::canonical_browser_path(&request.method, url.path())
            .unwrap_or_else(|| url.path().into()),
        cookies: request
            .headers
            .iter()
            .filter(|(k, _)| k.eq_ignore_ascii_case("Cookie"))
            .map(|(_, v)| v.as_str())
            .collect::<Vec<_>>()
            .join("; "),
        origin,
        referer,
        fields,
    })
}
pub fn parse_request(request: &Request) -> Result<ParsedRequest> {
    parse_request_validated(request, validate_request(request)?)
}
/// Preserves status and headers, preferring binary bytes over the UTF-8 text body.
pub(crate) fn web_response(response: appcall_web::Response) -> RawResponse {
    RawResponse {
        status: response.status,
        headers: response.headers,
        body: response
            .binary_body
            .map_or_else(|| response.body.into_bytes(), |b| b.to_vec()),
    }
}

#[test]
fn browser_response_adapter_preserves_binary_and_utf8_contracts() {
    for binary_body in [None, Some(&b"wOF2\xff\x00\xfe"[..])] {
        let headers = vec![("Content-Type".into(), "font/woff2".into())];
        let response = web_response(appcall_web::Response {
            status: 200,
            headers: headers.clone(),
            body: "UTF-8 café ✓".into(),
            binary_body,
        });
        assert_eq!(response.status, 200);
        assert_eq!(response.headers, headers);
        assert_eq!(
            response.body,
            binary_body.unwrap_or("UTF-8 café ✓".as_bytes())
        );
    }
}

/// Tests whether a method and query-free path belong to the browser routing surface.
/// This does not authorize access; protected handlers still validate sessions.
pub(crate) fn legacy_redirect(request: &Request) -> Option<RawResponse> {
    let location = appcall_web::legacy_browser_location(&request.method, &request.uri)?;
    Some(RawResponse {
        status: 301,
        headers: vec![
            ("Location".into(), location),
            ("Cache-Control".into(), "no-store".into()),
        ],
        body: vec![],
    })
}

pub fn public_path(method: &str, path: &str) -> bool {
    let canonical = appcall_web::canonical_browser_path(method, path);
    let path = canonical.as_deref().unwrap_or(path);
    if !matches!(method, "GET" | "POST")
        || path.contains(['%', '\\'])
        || path
            .split('/')
            .any(|s| s == "." || s == ".." || s.chars().any(char::is_control))
    {
        return false;
    }
    if method == "GET"
        && matches!(
            path,
            "/" | "/app"
                | "/app/connectors"
                | "/app/connections"
                | "/app/events"
                | "/app/events/stream"
                | "/app/logs"
                | "/app/certification"
                | "/app/docs"
                | "/app/support"
                | "/app/settings/team"
                | "/app/sessions"
                | "/app/settings"
                | "/app/settings/account"
                | "/app/settings/organization"
                | "/app/settings/billing"
                | "/app/usage"
                | "/app/settings/white-labeling"
                | "/app/login"
                | "/app/login/password"
                | "/app/otp"
                | "/app/signup"
                | "/signup"
                | "/app/forgot-password"
                | "/reset-password"
                | "/app/magic-link"
                | "/app/logout"
                | "/auth/magic-link"
                | "/auth/callback"
                | "/auth/login"
                | "/verify-email"
                | "/static/app.css"
                | "/static/dashboard.css"
                | "/static/dashboard.js"
                | "/static/logs.js"
                | "/static/datastar.js"
                | "/static/palette.js"
                | "/static/oauth-callback.js"
                | "/static/favicon.svg"
                | "/static/fonts/archivo-latin-variable.woff2"
                | "/static/fonts/ibm-plex-mono-variable.woff2"
        )
    {
        return true;
    }
    if method == "POST"
        && matches!(
            path,
            "/app/login"
                | "/app/login/mfa"
                | "/app/signup"
                | "/app/otp"
                | "/app/otp/verify"
                | "/app/forgot-password"
                | "/reset-password"
                | "/app/magic-link"
                | "/auth/callback"
                | "/resend-verification"
                | "/app/connectors/request"
                | "/app/settings/team/invite"
                | "/app/settings/organization"
                | "/app/settings/white-labeling"
                | "/app/settings/account/change-password"
                | "/app/settings/account/mfa/setup"
                | "/app/settings/account/mfa/verify"
                | "/app/settings/account/mfa/disable"
                | "/app/settings/billing/checkout"
                | "/app/settings/billing/portal"
        )
    {
        return true;
    }
    let p: Vec<_> = path.split('/').collect();
    let id = |s: &str| {
        !s.is_empty()
            && s.len() <= 256
            && !matches!(s, "." | "..")
            && s.bytes()
                .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.'))
    };
    match (method, p.as_slice()) {
        ("GET", ["", "app", "oauth", provider]) => {
            matches!(*provider, "google" | "github" | "microsoft")
        }
        ("GET", ["", "app", "connectors" | "logs", key]) => id(key),
        ("GET", ["", "app", "runs", key]) => id(key),
        ("GET", ["", "app", "runs"]) => true,
        ("GET", ["", "app", "connectors", key, "test-form" | "options" | "runinput-fields"]) => {
            id(key)
        }
        ("POST", ["", "app", "connectors", key, "setup" | "test"])
        | ("POST", ["", "app", "connections", key, "test" | "disconnect"])
        | ("POST", ["", "app", "events" | "logs", key, "replay"])
        | ("POST", ["", "app", "runs", key, "run-now" | "reset" | "cancel"])
        | ("POST", ["", "app", "settings", "team", key, "remove" | "role"])
        | ("POST", ["", "app", "settings", "account", "sessions", key, "revoke"]) => id(key),
        _ => false,
    }
}
fn web_error(error: appcall_web::Error) -> ApiError {
    ApiError::new(match error {
        appcall_web::Error::Invalid => "INVALID_REQUEST",
        appcall_web::Error::RequestTooLarge => "REQUEST_TOO_LARGE",
        appcall_web::Error::Unauthorized => "UNAUTHORIZED",
        appcall_web::Error::Forbidden => "FORBIDDEN",
        appcall_web::Error::NotFound => "RUN_NOT_FOUND",
        appcall_web::Error::Conflict => "RUN_STATE_CONFLICT",
        _ => "STORAGE_UNAVAILABLE",
    })
}

pub type BrowserActions = appcall_actions::Service<
    appcall_actions::PgActionRepository,
    appcall_connectors::Registry,
    appcall_actions::LifecycleCredentialResolver,
    appcall_runner_client::RunnerClient,
    appcall_actions::PgPolicy,
>;
pub type BrowserCore = crate::Services<
    PostgresApiKeys,
    Arc<BrowserActions>,
    appcall_actions::LifecycleCredentialResolver,
>;
#[derive(Default)]
pub struct DashboardSharedState {
    branding: Mutex<BTreeMap<String, Value>>,
    requests: Mutex<Vec<Value>>,
}
pub struct ApiDashboard {
    development: bool,
    dev_oauth: Option<crate::dev_oauth::DevOAuth>,
    registry: appcall_connectors::Registry,
    core: Arc<BrowserCore>,
    client: Mutex<postgres::Client>,
    setup: Arc<appcall_setup::Service>,
    defaults: crate::data_routes::UsageDefaults,
    state: Arc<DashboardSharedState>,
    run_operator_grants: Arc<RunOperatorGrants>,
}
impl ApiDashboard {
    pub fn new(
        registry: appcall_connectors::Registry,
        core: Arc<BrowserCore>,
        client: postgres::Client,
        setup: Arc<appcall_setup::Service>,
        defaults: crate::data_routes::UsageDefaults,
    ) -> Self {
        Self::with_shared_state(
            registry,
            core,
            client,
            setup,
            defaults,
            Arc::new(DashboardSharedState::default()),
        )
    }
    pub fn with_shared_state(
        registry: appcall_connectors::Registry,
        core: Arc<BrowserCore>,
        client: postgres::Client,
        setup: Arc<appcall_setup::Service>,
        defaults: crate::data_routes::UsageDefaults,
        state: Arc<DashboardSharedState>,
    ) -> Self {
        Self {
            development: false,
            dev_oauth: None,
            registry,
            core,
            client: Mutex::new(client),
            setup,
            defaults,
            state,
            run_operator_grants: Arc::new(RunOperatorGrants::default()),
        }
    }
    pub fn with_run_operator_grants(mut self, grants: Arc<RunOperatorGrants>) -> Self {
        self.run_operator_grants = grants;
        self
    }
    pub fn with_dev_oauth(mut self, dev_oauth: crate::dev_oauth::DevOAuth) -> Self {
        self.dev_oauth = Some(dev_oauth);
        self
    }
    pub fn database_health(&self) -> Option<bool> {
        match self.client.try_lock() {
            Ok(client) => Some(!client.is_closed()),
            Err(std::sync::TryLockError::WouldBlock) => None,
            Err(std::sync::TryLockError::Poisoned(_)) => Some(false),
        }
    }
    pub fn with_development(
        mut self,
        _: &crate::development_browser::DevelopmentBrowserConfig,
    ) -> Self {
        self.development = true;
        self
    }
    pub fn shared_state(&self) -> Arc<DashboardSharedState> {
        self.state.clone()
    }
    fn operator_authorized(&self, principal: &appcall_auth::Principal) -> bool {
        let Some(tenant_id) = principal.tenant_id.as_deref() else {
            return false;
        };
        let Some(user_id) = principal.user_id.as_deref() else {
            return false;
        };
        if tenant_id.is_empty() || user_id.is_empty() {
            return false;
        }
        // Authenticator derives browser projects from the verified tenant;
        // retain this relation so a configured pair cannot authorize a forged
        // or development principal.
        principal.project_id == format!("proj_{tenant_id}")
            && self
                .run_operator_grants
                .permits(&principal.project_id, Some(user_id))
    }
    async fn run(&self, r: DashboardRequest) -> std::result::Result<Value, DashboardFailure> {
        use appcall_web::Error;
        // Global certification data requires trusted operator authority, not tenant grants.
        if r.operation == appcall_web::DashboardOperation::Certification {
            return Err(Error::Forbidden.into());
        }
        let account = r
            .account_id
            .as_deref()
            .or(r.principal.brand_id.as_deref())
            .unwrap_or("");
        if r.principal.project_id.is_empty()
            || r.principal.user_id.is_none()
                && !(self.development
                    && r.principal.project_id == "proj_dev"
                    && r.principal.tenant_id.is_none())
            || r.principal
                .brand_id
                .as_deref()
                .is_some_and(|b| b != account)
            || !r.principal.allowed_brands.permits(account)
            || r.principal.scopes != appcall_auth::Grant::All
        {
            return Err(Error::Forbidden.into());
        }
        let operator_authorized = self.operator_authorized(&r.principal);
        if matches!(r.operation, Op::RunNow | Op::ResetRun | Op::CancelRun) && !operator_authorized
        {
            return Err(Error::Forbidden.into());
        }
        let identity = crate::Identity {
            project_id: r.principal.project_id.clone(),
            account_id: account.into(),
            admin_scope: false,
        };
        let resource = r.resource.as_deref().unwrap_or("");
        let field = |key: &str| r.fields.get(key).map(String::as_str).unwrap_or("");
        // An active, freshly verified membership may establish its own project;
        // no form value can choose the project id or change an existing project.
        self.db(|client| {
            client
                .execute(
                    "INSERT INTO projects(id,name) VALUES($1,$1) ON CONFLICT(id) DO NOTHING",
                    &[&identity.project_id],
                )
                .map_err(|_| Error::Unavailable)?;
            Ok(())
        })?;
        ensure_active()?;
        match r.operation {
            Op::Catalog=>Ok(json!({"connectors":self.registry.public_list().map(|c|catalog_item(c.manifest())).collect::<Vec<_>>()})),
            Op::Connector|Op::TestForm=>{let c=self.registry.public_connector(resource).map_err(|_|Error::Invalid)?;let mut item=catalog_item(c.manifest());item["setup"]=serde_json::to_value(&c.manifest().auth.setup).map_err(|_|Error::Unavailable)?;
                let selected=selected_action(c.manifest(),field("action"))?;
                let connections=self.core.connections(&identity).await.map_err(dashboard_failure::map_api_error)?;
                item["connections"]=self.connection_values(&identity,&connections)?.into_iter().filter(|c|c.get("connector").and_then(Value::as_str)==Some(resource)).collect();
                if let Some((action,op))=selected{item["action"]=action.clone().into();item["inputSchema"]=op.input_schema.clone().unwrap_or_else(||json!({"type":"object"}));item["sample"]=op.sample.clone().unwrap_or(Value::Null);item["connectionId"]=field("connectionId").into();}Ok(item)},
            Op::Overview=>{let toolkit_count=self.registry.public_list().count();Ok(self.db(|client|crate::data_routes::overview::read(client,&identity,toolkit_count).map_err(api_error))?)},
            Op::Connections=>{let connections=self.core.connections(&identity).await.map_err(dashboard_failure::map_api_error)?;Ok(json!({"connections":self.connection_values(&identity,&connections)?}))},
            Op::TestConnection=>Ok(connection_value(&self.core.test_connection(&identity,resource).await.map_err(dashboard_failure::map_api_error)?)),
            Op::DisconnectConnection=>{self.core.disconnect(&identity,resource).await.map_err(dashboard_failure::map_api_error)?;Ok(json!({"disconnected":true}))},
            Op::Logs|Op::Events|Op::Stream|Op::Trace=>{
                let mut url=url::Url::parse(&format!("http://local.invalid{}",match r.operation{Op::Logs=>"/v1/action-logs".to_owned(),Op::Trace=>format!("/v1/requests/{resource}"),_=>"/v1/webhook-events".to_owned()})).map_err(|_|Error::Invalid)?;
                for (k,v) in &r.fields {if ["limit","cursor","connectionId","connector","action","status","requestId","errorCode","operation"].contains(&k.as_str()) || r.operation == Op::Logs && ["createdFrom","createdBefore"].contains(&k.as_str()){url.query_pairs_mut().append_pair(k,v);}}
                self.db(|client| Ok(crate::data_routes::read(client,&identity,&url)))?.map_err(dashboard_failure::map_api_error)?.map(|r|r.body).ok_or_else(|| Error::Invalid.into())
            },
            Op::Runs=>{
                let mut url=url::Url::parse("http://local.invalid/v1/sync-runs").map_err(|_|Error::Invalid)?;
                for (k,v) in &r.fields {if ["limit","cursor","connector","tool","status","accountId","externalAccountId"].contains(&k.as_str()){url.query_pairs_mut().append_pair(k,v);}}
                let value = self.db(|client| crate::data_routes::read(client,&identity,&url).map_err(api_error))?
                    .map(|r|r.body)
                    .ok_or(Error::Invalid)?;
                Ok(enrich_runs_operator(value, operator_authorized))
            },
            Op::RunDetail=>{
                let url = run_history_url(resource, &r.fields)?;
                self.db(|client| crate::data_routes::read(client,&identity,&url).map_err(api_error))?
                    .map(|r| {
                        let mut body = r.body;
                        if let Some(object) = body.as_object_mut() {
                            object.insert(
                                "historyAccountScope".into(),
                                identity.account_id.clone().into(),
                            );
                        }
                        enrich_runs_operator(body, operator_authorized)
                    })
                    .ok_or_else(|| Error::Invalid.into())
            },
            Op::RunNow|Op::ResetRun|Op::CancelRun=>{
                let action=match r.operation {Op::RunNow=>appcall_sync::OperatorAction::RunNow,Op::ResetRun=>appcall_sync::OperatorAction::ResetAttempts,Op::CancelRun=>appcall_sync::OperatorAction::Cancel,_=>unreachable!()};
                let run_id=resource.to_owned();
                self.db(|client|{
                    let mut tx=client.transaction().map_err(|_|Error::Unavailable)?;
                    appcall_sync::control_in_transaction(&mut tx,&identity.project_id,&identity.account_id,&run_id,action).map_err(sync_error)?;
                    tx.commit().map_err(|_|Error::Unavailable)?;
                    Ok(json!({"runId":run_id,"action":match action {appcall_sync::OperatorAction::RunNow=>"run-now",appcall_sync::OperatorAction::ResetAttempts=>"reset",appcall_sync::OperatorAction::Cancel=>"cancel"}}))
                }).map_err(DashboardFailure::from)
            },
            Op::ReplayTrace=>{let command=self.db(|client| Ok(crate::data_routes::prepare_replay(client,&identity,resource,true)))?.map_err(dashboard_failure::map_api_error)?;let mut execute=command.execute;execute.admin_scope=account.is_empty();ensure_active()?;let result=self.core.execute(execute).await.map_err(dashboard_failure::map_api_error)?;Ok(json!({"requestId":command.request_id,"replayLogId":command.log_id,"output":result.output}))},
            Op::ReplayEvent=>self.db(|client|Ok(crate::data_routes::webhook_replay(client,&r.principal,resource,&mut appcall_worker::SyncDispatchSink)))?.map(|r|r.body).map_err(dashboard_failure::map_api_error),
            Op::Usage=>{let month=field("month");let mut usage=if month.is_empty(){self.usage(&identity)?}else{self.usage_at(&identity,month)?};usage["toolCalls"]=usage["actionCalls"].clone();Ok(usage)},
            Op::Certification=>self.db(|client|{let rows=client.query("SELECT connector,overall,results::text,to_char(last_run_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"'),total,passed,failed,not_certified FROM qa_connector_status ORDER BY connector LIMIT 1000",&[]).map_err(|_|Error::Unavailable)?;Ok(json!({"certifications":rows.iter().map(|r|{let result:Value=serde_json::from_str(&r.get::<_,String>(2)).unwrap_or(Value::Null);json!({"connector":r.get::<_,String>(0),"status":r.get::<_,String>(1),"manifestFingerprint":result.get("manifestDigest").cloned().unwrap_or(Value::Null),"certifiedAt":r.get::<_,String>(3),"total":r.get::<_,i32>(4),"passed":r.get::<_,i32>(5),"failed":r.get::<_,i32>(6),"notCertified":r.get::<_,i32>(7),"drifted":self.registry.public_connector(&r.get::<_,String>(0)).ok().is_none_or(|c|result.get("manifestDigest").and_then(Value::as_str)!=Some(c.manifest_digest()))})}).collect::<Vec<_>>()}))}).map_err(DashboardFailure::from),
            Op::Branding=>Ok(self.state.branding.lock().map_err(|_|Error::Unavailable)?.get(&identity.project_id).cloned().unwrap_or_else(||json!({"appName":"appcall","logoURL":"","tagColor":"#5eead4"}))),
            Op::SaveBranding=>{let name=field("appName").trim();let logo=field("logoURL");let color=field("tagColor");if name.len()>128||logo.len()>2048||(!logo.is_empty()&&url::Url::parse(logo).ok().is_none_or(|u|u.scheme()!="https"||!u.username().is_empty()||u.password().is_some()))||!(color.len()==7&&color.starts_with('#')&&color[1..].bytes().all(|b|b.is_ascii_hexdigit())){return Err(Error::Invalid.into())}let value=json!({"appName":if name.is_empty(){"appcall"}else{name},"logoURL":logo,"tagColor":color});self.state.branding.lock().map_err(|_|Error::Unavailable)?.insert(identity.project_id,value.clone());Ok(value)},
            Op::RequestConnector=>{if field("name").trim().is_empty()||field("name").len()>256||field("email").len()>256||field("notes").len()>4000{return Err(Error::Invalid.into())}let mut requests=self.state.requests.lock().map_err(|_|Error::Unavailable)?;if requests.len()>=1000{return Err(Error::Unavailable.into())}let event=json!({"event":"toolkit_requested","projectId":identity.project_id,"name":field("name"),"email":field("email"),"notes":field("notes")});eprintln!("{event}");requests.push(event);Ok(json!({"accepted":true}))},
            Op::Setup=>{
                if identity.project_id=="proj_dev" {
                    if let Some(local)=&self.dev_oauth {
                        if let Some(result)=local.start_checked(&identity,resource,(!field("connectionId").is_empty()).then_some(field("connectionId")),&|| ensure_active().is_ok()).map_err(dashboard_failure::map_api_error)? {
                            return Ok(json!({"redirectUrl":result.authorization_url,"connectionId":result.connection.id,"developmentOAuth":true}));
                        }
                    }
                }
                let scope=appcall_setup::SetupScope::new(&identity.project_id,(!account.is_empty()).then_some(account)).map_err(|_|Error::Invalid)?;
                let description=self.setup.describe(resource).map_err(|_|Error::Invalid)?;
                let existing=field("connectionId");
                if description.setup.mode=="oauth2" {
                    let result=self.setup.start_checked(&scope,resource,(!existing.is_empty()).then_some(existing),&|| ensure_active().is_ok()).map_err(|e|dashboard_failure::setup_failure(e,Error::Unavailable,&description.setup,field("route")))?;
                    Ok(json!({"redirectUrl":result.authorization_url,"connectionId":result.connection.id}))
                } else {
                    let fields=r.fields.iter().filter(|(key,_)|!["externalAccountId","route","projectId","connectionId"].contains(&key.as_str())).map(|(k,v)|(k.clone(),v.clone())).collect();
                    let connection=if existing.is_empty() {
                        self.setup.submit_new_checked(&scope,resource,field("route"),&fields,&|| ensure_active().is_ok())
                    } else {
                        self.setup.update_checked(&scope,existing,resource,field("route"),&fields,&|| ensure_active().is_ok())
                    }.map_err(|e|dashboard_failure::setup_failure(e,Error::Invalid,&description.setup,field("route")))?;
                    Ok(connection_value(&connection))
                }
            },
            Op::Test|Op::Options|Op::RunInputFields=>{
                let connection=field("connectionId");let action=match r.operation{Op::Options=>field("source"),Op::RunInputFields=>if field("source").is_empty(){"actors.input_schema"}else{field("source")},_=>field("action")};
                let c=self.core.connection(&identity,connection).await.map_err(dashboard_failure::map_api_error)?;if c.connector!=resource{return Err(Error::Forbidden.into())}
                let operation=self.registry.operation(resource,action).map_err(|_|Error::Invalid)?;
                if r.operation!=Op::Test&&!operation.is_read_only(){return Err(Error::Forbidden.into())}
                let input=match r.operation {Op::Options=>{let key=if field("searchParam").is_empty(){"search"}else{field("searchParam")};json!({key:field("q")})},Op::RunInputFields=>json!({"actorId":field("actorId")}),_=>{let raw=if field("input_raw").is_empty(){field("input")}else{field("input_raw")};if raw.is_empty(){guided_action_input_detailed(operation.input_schema.as_ref().unwrap_or(&json!({})),&r.form_values,field("runInputSchema"))?}else{serde_json::from_str(raw).map_err(dashboard_failure::invalid_json)?}}};
                ensure_active()?;let result=self.core.execute(appcall_actions::ExecuteRequest{project_id:identity.project_id,connection_id:connection.into(),external_account_id:account.into(),admin_scope:account.is_empty(),action:action.into(),input,idempotency_key:String::new(),caller_credential:field("callerToken").into()}).await.map_err(dashboard_failure::map_api_error)?;
                match r.operation{Op::Options=>{let values=result.output.get("options").and_then(Value::as_array).ok_or(Error::Unavailable)?;let value_field=if field("valueField").is_empty(){"value"}else{field("valueField")};let label_field=if field("labelField").is_empty(){"label"}else{field("labelField")};Ok(json!({"options":values.iter().map(|v|json!({"value":v[value_field],"label":v[label_field]})).collect::<Vec<_>>()}))},Op::RunInputFields=>{let schema=result.output.get("schema").filter(|v|v.is_object()).ok_or(Error::Unavailable)?;Ok(json!({"inputSchema":schema,"schema":schema,"actorId":field("actorId")}))},_=>Ok(json!({"requestId":result.request_id,"output":result.output}))}
            }
        }
    }
    fn usage(&self, identity: &crate::Identity) -> std::result::Result<Value, appcall_web::Error> {
        self.usage_at(identity, "")
    }
    fn usage_at(
        &self,
        identity: &crate::Identity,
        month: &str,
    ) -> std::result::Result<Value, appcall_web::Error> {
        let mut url = url::Url::parse("http://local.invalid/v1/usage/monthly")
            .map_err(|_| appcall_web::Error::Invalid)?;
        if !month.is_empty() {
            url.query_pairs_mut().append_pair("month", month);
        }
        self.db(|client| {
            crate::data_routes::usage_read(client, identity, &url, &self.defaults)
                .map_err(api_error)?
                .map(|r| r.body)
                .ok_or(appcall_web::Error::Unavailable)
        })
    }
    fn connection_values(
        &self,
        identity: &crate::Identity,
        connections: &[appcall_store::Connection],
    ) -> std::result::Result<Vec<Value>, appcall_web::Error> {
        let project = identity.project_id.clone();
        let account = identity.account_id.clone();
        let ages = self.db(|client| {
            client
                .query(
                    "SELECT c.id, \
                            GREATEST(0, EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - c.created_at)))::bigint, \
                            CASE WHEN c.status='authorizing' \
                                 AND i.operation='authorization' AND i.state='authorizing' \
                                 THEN GREATEST(0, EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - i.created_at)))::bigint \
                            END \
                     FROM connections AS c \
                     LEFT JOIN oauth_refresh_intents AS i \
                       ON i.project_id=c.project_id AND i.connection_id=c.id \
                      AND i.operation='authorization' AND i.state='authorizing' \
                     WHERE c.project_id=$1 \
                       AND ($2='' OR c.external_account_id=$2 OR c.credential_owner='platform')",
                    &[&project, &account],
                )
                .map_err(|_| appcall_web::Error::Unavailable)
                .map(|rows| {
                    rows.into_iter()
                        .map(|row| {
                            (
                                row.get::<_, String>(0),
                                (
                                    row.get::<_, i64>(1),
                                    row.get::<_, Option<i64>>(2),
                                ),
                            )
                        })
                        .collect::<std::collections::BTreeMap<_, _>>()
                })
        })?;
        Ok(connections
            .iter()
            .map(|connection| {
                let mut value = connection_value(connection);
                if let Some((created_age, authorization_age)) = ages.get(&connection.id) {
                    value["createdAgeSeconds"] = json!(created_age);
                    if let Some(age) = authorization_age {
                        value["authorizationAgeSeconds"] = json!(age);
                    }
                }
                value
            })
            .collect())
    }
    fn db<T>(
        &self,
        f: impl FnOnce(&mut postgres::Client) -> std::result::Result<T, appcall_web::Error>,
    ) -> std::result::Result<T, appcall_web::Error> {
        let mut client = self
            .client
            .lock()
            .map_err(|_| appcall_web::Error::Unavailable)?;
        client
            .batch_execute("SET statement_timeout='1s'; SET lock_timeout='250ms'")
            .map_err(|_| appcall_web::Error::Unavailable)?;
        ensure_active()?;
        f(&mut client)
    }
}
impl DashboardData for ApiDashboard {
    fn execute_detailed(
        &self,
        request: DashboardRequest,
    ) -> Pin<Box<dyn Future<Output = std::result::Result<Value, DashboardFailure>> + Send + '_>>
    {
        Box::pin(self.run(request))
    }

    fn database_health(&self) -> Option<bool> {
        self.database_health()
    }
    fn execute(
        &self,
        request: DashboardRequest,
    ) -> Pin<Box<dyn Future<Output = std::result::Result<Value, appcall_web::Error>> + Send + '_>>
    {
        Box::pin(async move { self.run(request).await.map_err(|e| e.classification()) })
    }
}
fn enrich_runs_operator(mut value: Value, authorized: bool) -> Value {
    value["operatorAuthorized"] = authorized.into();
    value["operatorControlsUnavailable"] = (!authorized).into();
    if let Some(rows) = value.get_mut("runs").and_then(Value::as_array_mut) {
        for row in rows {
            let Some(row) = row.as_object_mut() else {
                continue;
            };
            enrich_run_operator(row, authorized);
        }
    }
    if let Some(row) = value.get_mut("run").and_then(Value::as_object_mut) {
        enrich_run_operator(row, authorized);
    }
    value
}

fn enrich_run_operator(row: &mut serde_json::Map<String, Value>, authorized: bool) {
    for (eligible, allowed) in [
        ("runNowEligible", "runNowAllowed"),
        ("resetEligible", "resetAllowed"),
        ("cancelEligible", "cancelAllowed"),
    ] {
        let permitted = authorized && row.get(eligible).and_then(Value::as_bool) == Some(true);
        row.insert(allowed.into(), permitted.into());
    }
}

#[cfg(test)]
mod run_history_route_tests {
    use super::*;

    #[test]
    fn detail_operator_projection_overwrites_untrusted_allowed_flags() {
        let value = json!({"run":{"runNowEligible":true,"resetEligible":false,"cancelEligible":true,"runNowAllowed":true,"resetAllowed":true,"cancelAllowed":true}});
        let allowed = enrich_runs_operator(value.clone(), true);
        assert_eq!(allowed["run"]["resetAllowed"], false);
        assert_eq!(allowed["run"]["cancelAllowed"], true);
        let denied = enrich_runs_operator(value, false);
        assert_eq!(denied["run"]["runNowAllowed"], false);
        assert_eq!(denied["run"]["cancelAllowed"], false);
    }

    #[test]
    fn history_url_uses_exact_run_id_and_forwards_only_history_query_fields() {
        let fields = BTreeMap::from([
            ("accountId".to_owned(), "acct-primary".to_owned()),
            ("cursor".to_owned(), "Mw".to_owned()),
            ("limit".to_owned(), "7".to_owned()),
            ("status".to_owned(), "failed".to_owned()),
        ]);
        let url = run_history_url("run-42", &fields).expect("history URL should be valid");
        assert_eq!(url.path(), "/v1/sync-runs/run-42/history");
        assert_eq!(
            url.query_pairs().collect::<Vec<_>>(),
            vec![("cursor".into(), "Mw".into()), ("limit".into(), "7".into()),]
        );
    }

    #[test]
    fn history_url_rejects_untrusted_resource_path_bytes() {
        for id in ["run/42", ".", ".."] {
            let error = run_history_url(id, &BTreeMap::new()).unwrap_err();
            assert_eq!(error, appcall_web::Error::Invalid, "id={id}");
        }
    }
}

fn run_history_url(
    id: &str,
    fields: &BTreeMap<String, String>,
) -> std::result::Result<url::Url, appcall_web::Error> {
    if id.is_empty()
        || id.len() > 256
        || matches!(id, "." | "..")
        || !id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
    {
        return Err(appcall_web::Error::Invalid);
    }
    let mut url = url::Url::parse(&format!("http://local.invalid/v1/sync-runs/{id}/history"))
        .map_err(|_| appcall_web::Error::Invalid)?;
    for key in ["cursor", "limit"] {
        if let Some(value) = fields.get(key) {
            url.query_pairs_mut().append_pair(key, value);
        }
    }
    Ok(url)
}
fn api_error(error: ApiError) -> appcall_web::Error {
    match error.code {
        "UNAUTHORIZED" => appcall_web::Error::Unauthorized,
        "FORBIDDEN" | "CONNECTION_NOT_FOUND" | "ACTION_NOT_PERMITTED" => {
            appcall_web::Error::Forbidden
        }
        "RUN_NOT_FOUND" => appcall_web::Error::NotFound,
        "RUN_STATE_CONFLICT" => appcall_web::Error::Conflict,
        "REQUEST_TOO_LARGE" => appcall_web::Error::RequestTooLarge,
        "INVALID_REQUEST" | "INVALID_JSON" | "INVALID_LIMIT" | "INVALID_CURSOR"
        | "INVALID_RUN_STATUS" | "INVALID_RUN_FILTER" | "INVALID_TIME_RANGE" | "INVALID_STATUS"
        | "INVALID_ERROR_CODE"
        | "UNKNOWN_ACTION"
        | "UNSUPPORTED_OPERATION_BUDGET" => appcall_web::Error::Invalid,
        _ => appcall_web::Error::Unavailable,
    }
}
fn sync_error(error: appcall_sync::Error) -> appcall_web::Error {
    match error {
        appcall_sync::Error::NotFound => appcall_web::Error::NotFound,
        appcall_sync::Error::Conflict => appcall_web::Error::Conflict,
        appcall_sync::Error::InvalidInput => appcall_web::Error::Invalid,
        _ => appcall_web::Error::Unavailable,
    }
}
pub(crate) fn connection_value(c: &appcall_store::Connection) -> Value {
    // The provider has not approved an identity read model yet. Keep the
    // dashboard explicit about that absence instead of deriving an identity
    // from the tenant-scoped external_account_id or exposing health details.
    json!({"id":c.id,"connector":c.connector,"authType":c.auth_type,"status":c.status,"lastTest":c.last_test_status,"identityStatus":"not_recorded","statusCause":"unrecorded"})
}
pub(crate) fn catalog_item(m: &appcall_connectors::Manifest) -> Value {
    json!({"key":m.key,"name":m.name,"categories":m.categories,"operations":m.operations.iter().map(|(name,op)|json!({"name":name,"key":name,"title":op.title,"kind":op.kind,"description":op.description,"inputSchema":op.input_schema,"outputSchema":op.output_schema,"readOnly":op.is_read_only(),"destructive":op.is_destructive()})).collect::<Vec<_>>()})
}
/// Keep the alphabetical default for an omitted action, but never substitute
/// another operation for an explicitly requested invalid or non-action key.
pub(crate) fn selected_action<'a>(
    manifest: &'a appcall_connectors::Manifest,
    action: &str,
) -> std::result::Result<Option<(&'a String, &'a appcall_connectors::Operation)>, appcall_web::Error>
{
    if action.is_empty() {
        Ok(manifest
            .operations
            .iter()
            .find(|(_, op)| op.kind == appcall_connectors::OperationKind::Action))
    } else {
        manifest
            .operations
            .get_key_value(action)
            .filter(|(_, op)| op.kind == appcall_connectors::OperationKind::Action)
            .map(Some)
            .ok_or(appcall_web::Error::Invalid)
    }
}
/// Only the manifest shapes ordinary action input. The actor schema is limited
/// to the provider's freeform runInput object, then ordinary action validation
/// still runs inside the action service.
pub(crate) fn guided_action_input_detailed(
    schema: &Value,
    fields: &BTreeMap<String, Vec<String>>,
    run_schema: &str,
) -> std::result::Result<Value, DashboardFailure> {
    guided_action_input(schema, fields, run_schema).map_err(|classification| {
        DashboardFailure::new(
            classification,
            appcall_web::FailureCause::InvalidActionInput,
        )
        .with_outcome(appcall_web::ExecutionOutcome::NotDispatched)
    })
}
pub fn guided_action_input(
    schema: &Value,
    fields: &BTreeMap<String, Vec<String>>,
    run_schema: &str,
) -> std::result::Result<Value, appcall_web::Error> {
    let mut input = appcall_web::assemble_guided_input(schema, fields)?;
    if !run_schema.trim().is_empty() {
        let actor: Value =
            serde_json::from_str(run_schema).map_err(|_| appcall_web::Error::Invalid)?;
        let freeform = schema
            .get("properties")
            .and_then(|v| v.get("runInput"))
            .is_some_and(|v| v.get("type").and_then(Value::as_str) == Some("object"));
        if !freeform {
            return Err(appcall_web::Error::Invalid);
        }
        let mapped = fields
            .iter()
            .filter_map(|(k, v)| {
                k.strip_prefix("f.runInput.")
                    .map(|key| (format!("f.{key}"), v.clone()))
            })
            .collect();
        let run_input = appcall_web::assemble_guided_input(&actor, &mapped)?;
        if run_input.as_object().is_some_and(|v| !v.is_empty()) {
            input["runInput"] = run_input
        }
    }
    Ok(input)
}

#[cfg(test)]
mod cancellation_tests;
#[cfg(test)]
mod toolkit_tests;

#[cfg(test)]
#[test]
fn logs_filter_errors_are_invalid_in_production_dashboard() {
    for code in ["INVALID_TIME_RANGE", "INVALID_STATUS", "INVALID_ERROR_CODE"] {
        assert_eq!(
            api_error(ApiError::new(code)),
            appcall_web::Error::Invalid,
            "{code}"
        );
    }
}

#[test]
fn browser_request_too_large_error_preserves_public_code() {
    assert_eq!(
        web_error(appcall_web::Error::RequestTooLarge).code,
        "REQUEST_TOO_LARGE"
    );
    assert_eq!(
        api_error(ApiError::new("REQUEST_TOO_LARGE")),
        appcall_web::Error::RequestTooLarge
    );
}
