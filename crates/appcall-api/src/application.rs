//! Assembled Rust API host. Deployment remains gated by full route qualification.
#[path = "application_state.rs"]
mod state;
use appcall_actions::{LifecycleCredentialResolver, PgActionRepository, PgPolicy, Service};
use appcall_api::{ApiError, Backend, Identity, RawResponse, Request, Response, Result, Services};
use appcall_auth::PostgresApiKeys;
use appcall_connectors::Registry;
use appcall_runner_client::RunnerClient;
pub use state::ApplicationSharedState;
use std::sync::{Arc, Mutex};

pub type Actions =
    Service<PgActionRepository, Registry, LifecycleCredentialResolver, RunnerClient, PgPolicy>;
pub type Core = Services<PostgresApiKeys, Arc<Actions>, LifecycleCredentialResolver>;
type Mcp =
    appcall_mcp::Server<appcall_mcp::PgConnections, Arc<Actions>, Arc<appcall_mcp::MemoryUsage>>;
pub struct Application {
    pub core: Arc<Core>,
    shared: Arc<ApplicationSharedState>,
    dev_oauth: Option<appcall_api::dev_oauth::DevOAuth>,
    browser: Option<Arc<appcall_api::development_browser::BrowserMode>>,
    keys: Arc<ApplicationKeys>,
    events: appcall_api::event_routes::EventRoutes,
    admission: Arc<tokio::sync::Semaphore>,
    shutdown: tokio::sync::watch::Sender<bool>,
    providers: appcall_api::provider_routes::ProviderRoutes,
    mcp: Mcp,
    mcp_database: Arc<Mutex<postgres::Client>>,
}
impl Application {
    pub fn new(
        config: &appcall_runtime::Config,
        registry: Registry,
        runtime: tokio::runtime::Handle,
    ) -> std::result::Result<Self, Box<dyn std::error::Error>> {
        let shared = ApplicationSharedState::capture(config)?;
        Self::new_with_state(config, registry, runtime, shared)
    }
    pub fn new_with_state(
        config: &appcall_runtime::Config,
        registry: Registry,
        runtime: tokio::runtime::Handle,
        shared: Arc<ApplicationSharedState>,
    ) -> std::result::Result<Self, Box<dyn std::error::Error>> {
        let platform = shared.platform.clone();
        let dev_oauth = if config.production {
            None
        } else {
            Some(
                appcall_api::dev_oauth::DevOAuth::new(
                    false,
                    "proj_dev",
                    Arc::new(Mutex::new(config.store()?)),
                    Arc::new(registry.clone()),
                    config.oauth_apps().keys().cloned().collect(),
                )
                .map_err(|_| "invalid development OAuth configuration")?,
            )
        };
        let lifecycle = config.lifecycle(Arc::new(registry.clone()))?;
        let runner = config.runner()?;
        let repository = PgActionRepository::new(config.connect()?);
        let policy_config = config.policy_config();
        if config.production && policy_config.webhook_secret.is_empty() {
            return Err("production webhook signing key is required".into());
        }
        let policy = PgPolicy::new(repository.clone(), policy_config.clone())?;
        let executor = Arc::new(
            Service::new(
                repository,
                registry.clone(),
                LifecycleCredentialResolver(lifecycle.clone()),
                runner.clone(),
                policy,
            )
            .with_circuit(shared.circuit.clone()),
        );
        let keys = Arc::new(ApplicationKeys::new(config.connect()?, platform)?);
        let database_keys = Arc::new(PostgresApiKeys::new(config.connect()?));
        let defaults = appcall_api::data_routes::UsageDefaults {
            limits: policy_config.defaults.clone(),
            unipile_max_accounts: config.unipile_max_accounts(),
        };
        let core = Arc::new(
            Services::new(
                config.store()?,
                database_keys,
                executor.clone(),
                LifecycleCredentialResolver(lifecycle.clone()),
                runner.clone(),
            )
            .with_usage_defaults(defaults.clone()),
        );
        let setup = Arc::new(appcall_setup::Service::new(
            Arc::new(Mutex::new(config.store()?)),
            Arc::new(registry.clone()),
            lifecycle,
            Arc::new(appcall_setup::RunnerValidator::new(
                Arc::new(runner.clone()),
                Arc::new(registry.clone()),
                runtime,
            )),
        ));
        let unipile = Some(Arc::new(appcall_provider::Service::new(
            config.connect()?,
            Arc::new(appcall_provider::StoreCredentials::new(Arc::new(
                Mutex::new(config.store()?),
            ))),
            Arc::new(appcall_provider::PgAccountGate::new(
                config.connect()?,
                config.unipile_max_accounts(),
            )?),
            appcall_provider::Config {
                public_base_url: policy_config.public_base_url.clone(),
                success_redirect_url: String::new(),
                signing_secret: policy_config.webhook_secret.clone(),
                allow_loopback_http: !config.production,
            },
        )?));
        let browser = if shared.browser.is_some() || shared.development_browser.is_some() {
            let mut data = appcall_api::browser_host::ApiDashboard::with_shared_state(
                registry.clone(),
                core.clone(),
                config.connect()?,
                setup.clone(),
                defaults,
                shared.dashboard.clone(),
            )
            .with_run_operator_grants(shared.run_operator_grants.clone());
            if let Some(local) = dev_oauth.clone() {
                data = data.with_dev_oauth(local);
            }
            if let Some(config) = &shared.development_browser {
                data = data.with_development(config);
            }
            let data = Arc::new(data);
            let mode = if let Some(state) = &shared.browser {
                appcall_api::development_browser::BrowserMode::Anusa(
                    appcall_api::browser_host::BrowserHost::with_broker(
                        state.config.clone(),
                        config.connect_auxiliary(&state.database_url)?,
                        data,
                        state.broker.clone(),
                    )
                    .map_err(|_| "invalid browser configuration")?,
                )
            } else {
                appcall_api::development_browser::BrowserMode::Development(
                    appcall_api::development_browser::DevelopmentBrowserHost::new(
                        shared
                            .development_browser
                            .clone()
                            .ok_or("missing development browser configuration")?,
                        data,
                    ),
                )
            };
            Some(Arc::new(mode))
        } else {
            None
        };
        let mcp_database = Arc::new(Mutex::new(config.connect()?));
        let mcp = appcall_mcp::Server::new(
            registry,
            appcall_mcp::PgConnections::new(mcp_database.clone()),
            executor,
            shared.mcp_usage.clone(),
        );
        let verifier = if policy_config.webhook_secret.is_empty() {
            None
        } else {
            Some(appcall_auth::WebhookVerifier::new(
                &policy_config.webhook_secret,
            )?)
        };
        let events = appcall_api::event_routes::EventRoutes::new(
            config.connect()?,
            config.store()?,
            runner,
            verifier,
        );
        let (shutdown, _) = tokio::sync::watch::channel(false);
        Ok(Self {
            core,
            shared,
            dev_oauth,
            browser,
            keys,
            events,
            shutdown,
            admission: Arc::new(tokio::sync::Semaphore::new(16)),
            providers: appcall_api::provider_routes::ProviderRoutes::new(setup, unipile),
            mcp,
            mcp_database,
        })
    }
    pub fn shared_state(&self) -> Arc<ApplicationSharedState> {
        self.shared.clone()
    }
    pub fn database_health(&self) -> Option<bool> {
        let mcp = match self.mcp_database.try_lock() {
            Ok(client) => Some(!client.is_closed()),
            Err(std::sync::TryLockError::WouldBlock) => None,
            Err(std::sync::TryLockError::Poisoned(_)) => Some(false),
        };
        appcall_api::combined_database_health([
            self.core.database_health(),
            self.keys.database.database_health(),
            self.events.database_health(),
            self.providers.database_health(),
            mcp,
            self.browser
                .as_ref()
                .map_or(Some(true), |b| b.database_health()),
            self.dev_oauth
                .as_ref()
                .map_or(Some(true), |d| d.database_health()),
        ])
    }
    async fn local_work<T: Send + 'static>(
        &self,
        work: impl FnOnce(&dyn Fn() -> bool) -> Result<T> + Send + 'static,
    ) -> Result<T> {
        let permit = self
            .admission
            .clone()
            .try_acquire_owned()
            .map_err(|_| ApiError::new("SERVICE_BUSY"))?;
        let (_alive, cancelled) = tokio::sync::watch::channel(());
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
        let task = tokio::task::spawn_blocking(move || {
            let _permit = permit;
            let active = || std::time::Instant::now() < deadline && cancelled.has_changed().is_ok();
            if !active() {
                return Err(ApiError::new("SERVICE_BUSY"));
            }
            work(&active)
        });
        tokio::time::timeout_at(tokio::time::Instant::from_std(deadline), task)
            .await
            .map_err(|_| ApiError::new("SERVICE_BUSY"))?
            .map_err(|_| ApiError::new("STORAGE_UNAVAILABLE"))?
    }
    async fn local_start(&self, identity: &Identity, r: &Request) -> Result<Option<Response>> {
        let Some(local) = self.dev_oauth.clone() else {
            return Ok(None);
        };
        if r.method != "POST" || identity.project_id != "proj_dev" {
            return Ok(None);
        }
        let path = r.uri.split('?').next().unwrap_or("");
        let Some(connector) = path
            .strip_prefix("/v1/connectors/")
            .and_then(|p| p.strip_suffix("/setup/oauth"))
        else {
            return Ok(None);
        };
        if connector.contains('/') {
            return Ok(None);
        }
        if r.uri.len() > 4096 || r.body.len() > 1024 * 1024 {
            return Err(ApiError::new("REQUEST_TOO_LARGE"));
        }
        let body: serde_json::Value =
            serde_json::from_slice(&r.body).map_err(|_| ApiError::new("INVALID_JSON"))?;
        if !body.is_object()
            || body
                .get("redirectUri")
                .is_some_and(|v| !v.is_null() && !v.is_string())
        {
            return Err(ApiError::new("INVALID_JSON"));
        }
        let identity = identity.clone();
        let connector = connector.to_owned();
        let start = self
            .local_work(move |active| local.start_checked(&identity, &connector, None, active))
            .await?;
        Ok(start.map(|s| Response { status: 201, headers: vec![], body: serde_json::json!({
            "connection": appcall_api::connection_json(&s.connection), "authorizationUrl": s.authorization_url
        }) }))
    }
    pub fn stop(&self) {
        self.shutdown.send_replace(true);
    }
    async fn principal(&self, headers: &[(String, String)]) -> Result<appcall_auth::Principal> {
        if headers
            .iter()
            .any(|(k, _)| k.eq_ignore_ascii_case("Authorization"))
        {
            return self
                .browser
                .as_ref()
                .ok_or_else(|| ApiError::new("UNAUTHORIZED"))?
                .authorize_headers(headers)
                .await;
        }
        let permit = self
            .admission
            .clone()
            .try_acquire_owned()
            .map_err(|_| ApiError::new("SERVICE_BUSY"))?;
        let keys = self.keys.clone();
        let headers = headers.to_vec();
        let work = tokio::task::spawn_blocking(move || {
            let _permit = permit;
            let headers = headers
                .iter()
                .map(|(k, v)| appcall_auth::Header::new(k, v))
                .collect::<Vec<_>>();
            appcall_auth::Authenticator::production(Some(&*keys), None, None)
                .and_then(|auth| auth.authorize(&headers, &appcall_auth::RequestContext::default()))
                .map_err(appcall_api::authentication_error)
        });
        tokio::time::timeout(std::time::Duration::from_secs(2), work)
            .await
            .map_err(|_| ApiError::new("SERVICE_BUSY"))?
            .map_err(|_| ApiError::new("STORAGE_UNAVAILABLE"))?
    }
}
impl appcall_api::generation::ManagedBackend for Application {
    fn retirement_ready(&self) -> bool {
        self.events.retirement_ready()
    }
    fn database_health(&self) -> Option<bool> {
        Application::database_health(self)
    }
    fn stop(&self) {
        Application::stop(self)
    }
}
impl Backend for Application {
    async fn authorize(&self, h: &[(String, String)]) -> Result<Identity> {
        let principal = self.principal(h).await?;
        if principal.scopes != appcall_auth::Grant::All {
            return Err(ApiError::new("FORBIDDEN"));
        }
        Ok(Identity {
            project_id: principal.project_id,
            account_id: principal.brand_id.unwrap_or_default(),
            admin_scope: false,
        })
    }
    async fn ready(&self) -> Result<()> {
        self.core.ready().await
    }
    async fn connections(&self, i: &Identity) -> Result<Vec<appcall_store::Connection>> {
        self.core.connections(i).await
    }
    async fn platform_connectors(&self, i: &Identity) -> Result<Vec<String>> {
        self.core.platform_connectors(i).await
    }
    async fn connection(&self, i: &Identity, id: &str) -> Result<appcall_store::Connection> {
        self.core.connection(i, id).await
    }
    async fn test_connection(&self, i: &Identity, id: &str) -> Result<appcall_store::Connection> {
        self.core.test_connection(i, id).await
    }
    async fn disconnect(&self, i: &Identity, id: &str) -> Result<()> {
        self.core.disconnect(i, id).await
    }
    async fn execute(
        &self,
        r: appcall_actions::ExecuteRequest,
    ) -> Result<appcall_actions::ExecuteResult> {
        self.core.execute(r).await
    }
    fn requires_api_auth(&self, method: &str, path: &str) -> bool {
        !((self.dev_oauth.is_some() && method == "GET" && path == "/oauth/local/authorize")
            || appcall_api::provider_routes::public_exact(method, path)
            || appcall_api::event_routes::public_exact(method, path)
            || self.browser.is_some() && appcall_api::browser_host::public_path(method, path))
    }
    async fn public_route(&self, r: &Request) -> Result<Option<Response>> {
        let url = request_url(r)?;
        let event = appcall_api::event_routes::public_exact(&r.method, url.path());
        if !event && !appcall_api::provider_routes::public_exact(&r.method, url.path()) {
            return Ok(None);
        }
        // Supplied credentials must validate even on callback routes; signed state
        // remains authoritative when no caller identity is supplied.
        let supplied = r.headers.iter().any(|(k, _)| {
            k.eq_ignore_ascii_case("Authorization") || k.eq_ignore_ascii_case("X-API-Key")
        });
        if event {
            let principal = if supplied {
                Some(self.principal(&r.headers).await?)
            } else {
                None
            };
            return self.events.handle(principal.as_ref(), r).await;
        }
        let identity = if supplied {
            Some(self.authorize(&r.headers).await?)
        } else {
            None
        };
        self.providers.handle(identity.as_ref(), r).await
    }
    async fn auxiliary_route(&self, i: &Identity, r: &Request) -> Result<Option<Response>> {
        if let Some(response) = self.local_start(i, r).await? {
            return Ok(Some(response));
        }
        if let Some(response) = self.providers.handle(Some(i), r).await? {
            return Ok(Some(response));
        }
        if request_url(r)?.path().starts_with("/v1/webhook-events") {
            let principal = self.principal(&r.headers).await?;
            if let Some(response) = self.events.handle(Some(&principal), r).await? {
                return Ok(Some(response));
            }
        }
        if r.method == "GET" && request_url(r)?.path() == "/v1/usage/tools" {
            let counts = self
                .mcp
                .usage()
                .list(&i.project_id, &i.account_id)
                .map_err(|_| ApiError::new("STORAGE_UNAVAILABLE"))?;
            let total = counts
                .iter()
                .fold(0i64, |sum, count| sum.saturating_add(count.count));
            return Ok(Some(Response {
                status: 200,
                headers: vec![],
                body: serde_json::json!({"tools":counts,"total":total}),
            }));
        }
        self.core.auxiliary_route(i, r).await
    }
    async fn raw_route(&self, r: &Request) -> Result<Option<RawResponse>> {
        if r.method == "GET" && request_url(r)?.path() == "/oauth/local/authorize" {
            if let Some(local) = self.dev_oauth.clone() {
                if r.headers.iter().any(|(k, _)| {
                    k.eq_ignore_ascii_case("Authorization") || k.eq_ignore_ascii_case("X-API-Key")
                }) {
                    let identity = self.authorize(&r.headers).await?;
                    if identity.project_id != "proj_dev" {
                        return Err(ApiError::new("FORBIDDEN"));
                    }
                }
                let request = Request {
                    method: r.method.clone(),
                    uri: r.uri.clone(),
                    headers: r.headers.clone(),
                    body: r.body.clone(),
                };
                return self
                    .local_work(move |active| local.handle_checked(&request, active))
                    .await;
            }
        }
        if let Some(browser) = &self.browser {
            if let Some(response) = browser.handle(r).await? {
                return Ok(Some(response));
            }
        }
        if request_url(r)?.path() != "/v1/mcp" {
            return Ok(None);
        }
        let identity = self.authorize(&r.headers).await?;
        let token = header(r, "X-Connector-Token");
        let scope = appcall_mcp::Scope::new(&identity.project_id, &identity.account_id)
            .with_profile(header(r, "X-Capability-Profile"))
            .with_connector_token(token.strip_prefix("Bearer ").unwrap_or(token));
        let response = self.mcp.handle_http(&r.method, &scope, &r.body).await;
        Ok(Some(RawResponse {
            status: response.status,
            headers: vec![("content-type".into(), "application/json".into())],
            body: match response.body {
                Some(v) => serde_json::to_vec(&v).map_err(|_| ApiError::new("INVALID_RESPONSE"))?,
                None => vec![],
            },
        }))
    }
    async fn event_stream(
        &self,
        r: &Request,
    ) -> Result<Option<appcall_api::streaming::StreamResponse>> {
        let url = request_url(r)?;
        if r.method == "GET" && url.path() == "/app/events/stream" {
            let browser = self
                .browser
                .as_ref()
                .ok_or_else(|| ApiError::new("UNAUTHORIZED"))?;
            let (principal, cookie) = browser.authorize_session(r).await?;
            let verify_request = Arc::new(Request {
                method: "GET".into(),
                uri: "/app/events/stream".into(),
                headers: if cookie.is_empty() {
                    r.headers.clone()
                } else {
                    vec![(
                        "Cookie".into(),
                        cookie.split(';').next().unwrap_or("").into(),
                    )]
                },
                body: vec![],
            });
            let verifier_browser = browser.clone();
            let verifier: appcall_api::streaming::SessionVerifier = Arc::new(move || {
                let browser = verifier_browser.clone();
                let request = verify_request.clone();
                Box::pin(async move { browser.verify_session(&request).await })
            });
            let cursor = appcall_api::data_routes::sse_cursor(&url, &r.headers);
            let filters = appcall_api::data_routes::sse_filters(&url)?;
            let receiver = appcall_api::streaming::open_dashboard_with_filters(
                self.events.clone(),
                principal,
                cursor,
                filters,
                self.shutdown.subscribe(),
                verifier,
            )
            .await?;
            return Ok(Some(appcall_api::streaming::StreamResponse {
                receiver,
                headers: if cookie.is_empty() {
                    vec![]
                } else {
                    vec![("set-cookie".into(), cookie)]
                },
            }));
        }
        if r.method != "GET" || url.path() != "/v1/events" {
            return Ok(None);
        }
        let principal = self.principal(&r.headers).await?;
        let cursor = appcall_api::data_routes::sse_cursor(&url, &r.headers);
        let filters = appcall_api::data_routes::sse_filters(&url)?;
        let browser = self.browser.clone();
        let keys = self.keys.clone();
        let admission = self.admission.clone();
        let headers = Arc::new(r.headers.clone());
        let verify: appcall_api::streaming::SessionVerifier = Arc::new(move || {
            let browser = browser.clone();
            let keys = keys.clone();
            let admission = admission.clone();
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
                let permit = admission
                    .try_acquire_owned()
                    .map_err(|_| ApiError::new("SERVICE_BUSY"))?;
                let work = tokio::task::spawn_blocking(move || {
                    let _permit = permit;
                    let headers = headers
                        .iter()
                        .map(|(k, v)| appcall_auth::Header::new(k, v))
                        .collect::<Vec<_>>();
                    appcall_auth::Authenticator::production(Some(&*keys), None, None)
                        .and_then(|auth| {
                            auth.authorize(&headers, &appcall_auth::RequestContext::default())
                        })
                        .map_err(appcall_api::authentication_error)
                });
                tokio::time::timeout(std::time::Duration::from_secs(2), work)
                    .await
                    .map_err(|_| ApiError::new("SERVICE_BUSY"))?
                    .map_err(|_| ApiError::new("STORAGE_UNAVAILABLE"))?
            })
        });
        let receiver = appcall_api::streaming::open_verified_with_filters(
            self.events.clone(),
            principal,
            cursor,
            filters,
            self.shutdown.subscribe(),
            verify,
        )
        .await?;
        Ok(Some(appcall_api::streaming::StreamResponse {
            receiver,
            headers: vec![],
        }))
    }
}
fn request_url(r: &Request) -> Result<url::Url> {
    if !r.uri.starts_with('/') || r.uri.starts_with("//") {
        return Err(ApiError::new("INVALID_REQUEST"));
    }
    url::Url::parse(&format!("http://appcall.invalid{}", r.uri))
        .map_err(|_| ApiError::new("INVALID_REQUEST"))
}
fn header<'a>(r: &'a Request, name: &str) -> &'a str {
    r.headers
        .iter()
        .find(|(k, _)| k.eq_ignore_ascii_case(name))
        .map(|(_, v)| v.as_str())
        .unwrap_or("")
}

// The trusted environment key has Go's static lifetime: it is never inserted
// into api_keys, so removing or rotating configuration removes its authority.
// Only the stable project is persisted. No verifier state implements Debug.
pub struct ApplicationKeys {
    platform: Option<Arc<appcall_auth::StaticApiKey>>,
    database: PostgresApiKeys,
}
impl ApplicationKeys {
    fn new(
        mut client: postgres::Client,
        platform: Option<Arc<appcall_auth::StaticApiKey>>,
    ) -> std::result::Result<Self, &'static str> {
        if platform.is_some() {
            client.execute("INSERT INTO projects(id,name) VALUES('proj_dev','Development') ON CONFLICT(id) DO NOTHING", &[])
                .map_err(|_| "platform project initialization failed")?;
        }
        Ok(Self {
            platform,
            database: PostgresApiKeys::new(client),
        })
    }
}
impl appcall_auth::ApiKeyVerifier for ApplicationKeys {
    fn verify_api_key(
        &self,
        raw: &str,
    ) -> std::result::Result<Option<appcall_auth::Principal>, appcall_auth::AuthError> {
        if let Some(platform) = &self.platform {
            if let Some(principal) = platform.verify_api_key(raw)? {
                return Ok(Some(principal));
            }
        }
        self.database.verify_api_key(raw)
    }
}
fn platform_key(
    raw: &str,
    production: bool,
) -> std::result::Result<Option<appcall_auth::StaticApiKey>, &'static str> {
    let trimmed = raw.trim();
    if raw.len() > 4096
        || production && (trimmed.len() < 24 || matches!(trimmed, "devkey" | "ak_dev_local"))
    {
        return Err("invalid platform API key configuration");
    }
    if raw.is_empty() {
        return Ok(None);
    }
    let principal =
        appcall_auth::Principal::project("proj_dev").map_err(|_| "invalid platform project")?;
    appcall_auth::StaticApiKey::from_hash(&appcall_auth::hash_api_key(raw), principal)
        .map(Some)
        .map_err(|_| "invalid platform API key configuration")
}

#[cfg(test)]
mod platform_key_tests {
    use super::*;
    use appcall_auth::ApiKeyVerifier;
    #[test]
    #[ignore = "requires isolated local PostgreSQL"]
    fn bootstrap_seeds_once_rotates_without_key_rows_and_keeps_database_keys() {
        let base = std::env::var("APPCALL_ENGINE_POSTGRES_URL").unwrap();
        let mut admin = postgres::Client::connect(&base, postgres::NoTls).unwrap();
        let schema = format!("platform_bootstrap_{}", uuid::Uuid::new_v4().simple());
        admin.batch_execute(&format!("CREATE SCHEMA {schema}; SET search_path TO {schema}; CREATE TABLE projects(id text PRIMARY KEY,name text,disabled_at timestamptz); CREATE TABLE api_keys(key_hash text PRIMARY KEY,project_id text,disabled_at timestamptz)")).unwrap();
        let connect = || {
            let mut c = postgres::Client::connect(&base, postgres::NoTls).unwrap();
            c.batch_execute(&format!("SET search_path TO {schema}"))
                .unwrap();
            c
        };
        let old = ApplicationKeys::new(
            connect(),
            platform_key("synthetic-old-platform-key-12345", true)
                .unwrap()
                .map(Arc::new),
        )
        .unwrap();
        assert_eq!(
            admin
                .query_one("SELECT count(*) FROM projects WHERE id='proj_dev'", &[])
                .unwrap()
                .get::<_, i64>(0),
            1
        );
        assert_eq!(
            admin
                .query_one("SELECT count(*) FROM api_keys", &[])
                .unwrap()
                .get::<_, i64>(0),
            0
        );
        admin.batch_execute("UPDATE projects SET name='Preserve'; INSERT INTO projects(id,name)VALUES('other','Other')").unwrap();
        admin
            .execute(
                "INSERT INTO api_keys(key_hash,project_id)VALUES($1,'other')",
                &[&appcall_auth::hash_api_key("persisted-synthetic")],
            )
            .unwrap();
        assert_eq!(
            old.verify_api_key("persisted-synthetic")
                .unwrap()
                .unwrap()
                .project_id,
            "other"
        );
        drop(old);
        let new = ApplicationKeys::new(
            connect(),
            platform_key("synthetic-new-platform-key-12345", true)
                .unwrap()
                .map(Arc::new),
        )
        .unwrap();
        assert!(new
            .verify_api_key("synthetic-old-platform-key-12345")
            .unwrap()
            .is_none());
        assert_eq!(
            new.verify_api_key("synthetic-new-platform-key-12345")
                .unwrap()
                .unwrap()
                .project_id,
            "proj_dev"
        );
        assert_eq!(
            admin
                .query_one("SELECT name FROM projects WHERE id='proj_dev'", &[])
                .unwrap()
                .get::<_, String>(0),
            "Preserve"
        );
        drop(new);
        admin
            .batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
            .unwrap();
    }
    #[test]
    fn production_requires_strong_configured_platform_key() {
        for raw in ["", " ", "devkey", "ak_dev_local", "12345678901234567890123"] {
            assert!(platform_key(raw, true).is_err());
        }
        assert!(platform_key("", false).unwrap().is_none());
    }
    #[test]
    fn static_platform_key_rotates_and_never_grants_another_project() {
        let old = platform_key("synthetic-old-platform-key-12345", true)
            .unwrap()
            .unwrap();
        let new = platform_key("synthetic-new-platform-key-12345", true)
            .unwrap()
            .unwrap();
        assert_eq!(
            old.verify_api_key("synthetic-old-platform-key-12345")
                .unwrap()
                .unwrap()
                .project_id,
            "proj_dev"
        );
        assert!(new
            .verify_api_key("synthetic-old-platform-key-12345")
            .unwrap()
            .is_none());
        assert!(new
            .verify_api_key("synthetic-new-platform-key-12345")
            .unwrap()
            .is_some());
    }
}
