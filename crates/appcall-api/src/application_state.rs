//! Process-scoped state retained while physical database generations are replaced.
use std::sync::Arc;
pub struct BrowserState {
    pub config: appcall_api::browser_host::BrowserConfig,
    pub database_url: String,
    pub broker: Arc<appcall_web::Broker>,
}
pub struct ApplicationSharedState {
    pub(crate) mcp_usage: Arc<appcall_mcp::MemoryUsage>,
    pub(crate) circuit: appcall_actions::Circuit,
    pub(crate) dashboard: Arc<appcall_api::browser_host::DashboardSharedState>,
    pub(crate) browser: Option<BrowserState>,
    pub(crate) development_browser:
        Option<appcall_api::development_browser::DevelopmentBrowserConfig>,
    pub(crate) platform: Option<Arc<appcall_auth::StaticApiKey>>,
}
impl ApplicationSharedState {
    pub fn capture(
        config: &appcall_runtime::Config,
    ) -> Result<Arc<Self>, Box<dyn std::error::Error>> {
        let platform = super::platform_key(
            &std::env::var("APPCALL_DEV_API_KEY").unwrap_or_default(),
            config.production,
        )?
        .map(Arc::new);
        let browser = if config.production
            || std::env::var("APPCALL_SESSION_SECRET").is_ok()
            || std::env::var("ANUSA_JWT_ACCESS_SECRET").is_ok()
        {
            let config = appcall_api::browser_host::BrowserConfig::from_env()
                .map_err(|_| "invalid browser configuration")?;
            let broker = Arc::new(
                appcall_web::Broker::new(&config.broker_url, &config.product_slug)
                    .map_err(|_| "invalid browser broker configuration")?,
            );
            Some(BrowserState {
                config,
                database_url: std::env::var("ANUSA_DATABASE_URL")?,
                broker,
            })
        } else {
            None
        };
        let development_browser = if browser.is_none() && !config.production {
            let bind = std::env::var("APPCALL_RUST_LISTEN")
                .or_else(|_| std::env::var("APPCALL_HTTP_ADDR"))
                .unwrap_or_else(|_| "0.0.0.0:5080".into());
            if bind
                .parse::<std::net::SocketAddr>()
                .is_ok_and(|a| a.ip().is_loopback())
            {
                let origin = std::env::var("APPCALL_PUBLIC_BASE_URL")
                    .unwrap_or_else(|_| format!("http://{bind}"));
                Some(
                    appcall_api::development_browser::DevelopmentBrowserConfig::new(
                        false, &bind, &origin,
                    )
                    .map_err(|_| "invalid development browser configuration")?,
                )
            } else {
                None
            }
        } else {
            None
        };
        Ok(Arc::new(Self {
            mcp_usage: Arc::new(appcall_mcp::MemoryUsage::default()),
            circuit: appcall_actions::Circuit::default(),
            dashboard: Arc::new(appcall_api::browser_host::DashboardSharedState::default()),
            browser,
            development_browser,
            platform,
        }))
    }
}
