//! Loopback-only developer browser. No Anusa token, cookie or admin authority is minted.
use crate::{
    browser_host::{drive, parse_request, BrowserHost, CancelGuard, Cancellation},
    ApiError, RawResponse, Request, Result,
};
use appcall_auth::Principal;
use appcall_web::DashboardData;
use std::{net::SocketAddr, sync::Arc, time::Duration};
#[derive(Clone)]
pub struct DevelopmentBrowserConfig {
    origin: String,
    authority: String,
}
impl DevelopmentBrowserConfig {
    pub fn new(production: bool, bind: &str, origin: &str) -> Result<Self> {
        let bind: SocketAddr = bind
            .parse()
            .map_err(|_| ApiError::new("INVALID_CONFIGURATION"))?;
        let url = url::Url::parse(origin).map_err(|_| ApiError::new("INVALID_CONFIGURATION"))?;
        if production
            || !bind.ip().is_loopback()
            || !matches!(url.scheme(), "http" | "https")
            || !matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"))
            || !url.username().is_empty()
            || url.password().is_some()
            || url.query().is_some()
            || url.fragment().is_some()
            || url.path() != "/"
        {
            return Err(ApiError::new("INVALID_CONFIGURATION"));
        }
        let authority = url[url::Position::BeforeHost..url::Position::AfterPort].to_owned();
        Ok(Self {
            origin: url.origin().ascii_serialization(),
            authority,
        })
    }
    fn validate_request(&self, r: &Request) -> Result<()> {
        let hosts = r
            .headers
            .iter()
            .filter(|(k, _)| k.eq_ignore_ascii_case("host"))
            .map(|(_, v)| v)
            .collect::<Vec<_>>();
        if hosts.len() != 1 || !hosts[0].eq_ignore_ascii_case(&self.authority) {
            return Err(ApiError::new("FORBIDDEN"));
        }
        Ok(())
    }
}
pub struct DevelopmentBrowserHost {
    config: DevelopmentBrowserConfig,
    data: Arc<dyn DashboardData>,
    admission: Arc<tokio::sync::Semaphore>,
}
impl DevelopmentBrowserHost {
    pub fn new(config: DevelopmentBrowserConfig, data: Arc<dyn DashboardData>) -> Self {
        Self {
            config,
            data,
            admission: Arc::new(tokio::sync::Semaphore::new(4)),
        }
    }
    pub fn database_health(&self) -> Option<bool> {
        self.data.database_health()
    }
    pub async fn verify_session(&self, r: &Request) -> Result<Principal> {
        self.config.validate_request(r)?;
        parse_request(r)?;
        Principal::project("proj_dev").map_err(|_| ApiError::new("UNAUTHORIZED"))
    }
    /// Handles browser routes after development Host-header and request validation.
    /// Returns `Ok(None)` outside the browser surface and preserves binary assets.
    /// Admission or deadline exhaustion returns `SERVICE_BUSY`.
    pub async fn handle(&self, r: &Request) -> Result<Option<RawResponse>> {
        let path = r.uri.split('?').next().unwrap_or("");
        if !crate::browser_host::public_path(&r.method, path) {
            return Ok(None);
        }
        self.config.validate_request(r)?;
        let parsed = parse_request(r)?;
        let permit = self
            .admission
            .clone()
            .try_acquire_owned()
            .map_err(|_| ApiError::new("SERVICE_BUSY"))?;
        let cancel = Arc::new(Cancellation::default());
        let _guard = CancelGuard(cancel.clone());
        let data = self.data.clone();
        let config = self.config.clone();
        let task = tokio::task::spawn_blocking(move || {
            let _permit = permit;
            let dashboard = appcall_web::DevelopmentDashboard {
                public_origin: &config.origin,
                data: &*data,
            };
            let r = appcall_web::Request {
                method: &parsed.method,
                path: &parsed.path,
                cookies: &parsed.cookies,
                origin: parsed.origin.as_deref(),
                referer: parsed.referer.as_deref(),
                fields: parsed.fields,
                now: chrono::Utc::now().timestamp(),
            };
            Ok(drive(dashboard.handle(&r), cancel)?.map(crate::browser_host::web_response))
        });
        tokio::time::timeout(Duration::from_secs(15), task)
            .await
            .map_err(|_| ApiError::new("SERVICE_BUSY"))?
            .map_err(|_| ApiError::new("STORAGE_UNAVAILABLE"))?
    }
}
/// Selected once from server configuration, retained across database generations.
pub enum BrowserMode {
    Anusa(BrowserHost),
    Recovering(crate::browser_recovery::RecoveringBrowserHost),
    Development(DevelopmentBrowserHost),
}
impl BrowserMode {
    pub fn database_health(&self) -> Option<bool> {
        match self {
            Self::Anusa(v) => v.database_health(),
            Self::Recovering(v) => v.database_health(),
            Self::Development(v) => v.database_health(),
        }
    }
    pub async fn handle(&self, r: &Request) -> Result<Option<RawResponse>> {
        match self {
            Self::Anusa(v) => v.handle(r).await,
            Self::Recovering(v) => v.handle(r).await,
            Self::Development(v) => v.handle(r).await,
        }
    }
    pub async fn authorize_headers(&self, h: &[(String, String)]) -> Result<Principal> {
        match self {
            Self::Anusa(v) => v.authorize_headers(h).await,
            Self::Recovering(v) => v.authorize_headers(h).await,
            Self::Development(_) => Err(ApiError::new("UNAUTHORIZED")),
        }
    }
    pub async fn verify_session(&self, r: &Request) -> Result<Principal> {
        match self {
            Self::Anusa(v) => v.verify_session(r).await,
            Self::Recovering(v) => v.verify_session(r).await,
            Self::Development(v) => v.verify_session(r).await,
        }
    }
    pub async fn authorize_session(&self, r: &Request) -> Result<(Principal, String)> {
        match self {
            Self::Anusa(v) => v.authorize_session(r).await,
            Self::Recovering(v) => v.authorize_session(r).await,
            Self::Development(v) => Ok((v.verify_session(r).await?, String::new())),
        }
    }
}
