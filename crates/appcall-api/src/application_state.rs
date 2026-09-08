//! Process-scoped state retained while physical database generations are replaced.
use std::{collections::BTreeMap, sync::Arc};
pub struct BrowserState {
    pub config: appcall_api::browser_host::BrowserConfig,
    pub database_url: String,
    pub broker: Arc<appcall_web::Broker>,
}
pub struct ApplicationSharedState {
    pub(crate) mcp_usage: Arc<appcall_mcp::MemoryUsage>,
    pub(crate) circuit: appcall_actions::Circuit,
    pub(crate) dashboard: Arc<appcall_api::browser_host::DashboardSharedState>,
    pub(crate) run_operator_grants: Arc<appcall_api::run_operator::RunOperatorGrants>,
    pub(crate) browser: Option<BrowserState>,
    pub(crate) development_browser:
        Option<appcall_api::development_browser::DevelopmentBrowserConfig>,
    pub(crate) platform: Option<Arc<appcall_auth::StaticApiKey>>,
}
impl ApplicationSharedState {
    pub fn capture(
        config: &appcall_runtime::Config,
    ) -> Result<Arc<Self>, Box<dyn std::error::Error>> {
        let run_operator_grants = Arc::new(
            appcall_api::run_operator::RunOperatorGrants::from_env()
                .map_err(|_| "invalid Runs operator grants configuration")?,
        );
        let environment = capture_environment()?;
        Self::capture_with_grants(config, &environment, run_operator_grants)
    }
    #[cfg(test)]
    fn capture_from_map(
        config: &appcall_runtime::Config,
        environment: &BTreeMap<String, String>,
    ) -> Result<Arc<Self>, Box<dyn std::error::Error>> {
        // Capture this process policy once. Recovery generations reuse this
        // shared state instead of re-reading mutable environment variables.
        let run_operator_grants = Arc::new(
            appcall_api::run_operator::RunOperatorGrants::from_map(environment)
                .map_err(|_| "invalid Runs operator grants configuration")?,
        );
        Self::capture_with_grants(config, environment, run_operator_grants)
    }
    fn capture_with_grants(
        config: &appcall_runtime::Config,
        environment: &BTreeMap<String, String>,
        run_operator_grants: Arc<appcall_api::run_operator::RunOperatorGrants>,
    ) -> Result<Arc<Self>, Box<dyn std::error::Error>> {
        let platform = super::platform_key(
            environment
                .get("APPCALL_DEV_API_KEY")
                .map(String::as_str)
                .unwrap_or_default(),
            config.production,
        )?
        .map(Arc::new);
        let browser = if config.production
            || environment.contains_key("APPCALL_SESSION_SECRET")
            || environment.contains_key("ANUSA_JWT_ACCESS_SECRET")
        {
            let config = appcall_api::browser_host::BrowserConfig::from_map(environment)
                .map_err(|_| "invalid browser configuration")?;
            let broker = Arc::new(
                appcall_web::Broker::new(&config.broker_url, &config.product_slug)
                    .map_err(|_| "invalid browser broker configuration")?,
            );
            Some(BrowserState {
                config,
                database_url: environment
                    .get("ANUSA_DATABASE_URL")
                    .cloned()
                    .ok_or("missing identity database")?,
                broker,
            })
        } else {
            None
        };
        if !run_operator_grants.is_empty() && browser.is_none() {
            return Err("Runs operator grants require authenticated browser configuration".into());
        }
        let development_browser = if browser.is_none() && !config.production {
            let bind = environment
                .get("APPCALL_RUST_LISTEN")
                .cloned()
                .or_else(|| environment.get("APPCALL_HTTP_ADDR").cloned())
                .unwrap_or_else(|| "0.0.0.0:5080".into());
            if bind
                .parse::<std::net::SocketAddr>()
                .is_ok_and(|a| a.ip().is_loopback())
            {
                let origin = environment
                    .get("APPCALL_PUBLIC_BASE_URL")
                    .cloned()
                    .unwrap_or_else(|| format!("http://{bind}"));
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
            run_operator_grants,
            browser,
            development_browser,
            platform,
        }))
    }
}

// Read only the string-valued settings needed by shared-state assembly. Using
// var_os avoids panicking on unrelated non-Unicode process variables, while a
// malformed value for a known setting still fails closed.
fn capture_environment() -> Result<BTreeMap<String, String>, Box<dyn std::error::Error>> {
    const KEYS: &[&str] = &[
        "APPCALL_DEV_API_KEY",
        "APPCALL_ENV",
        "APPCALL_SESSION_SECRET",
        "ANUSA_JWT_ACCESS_SECRET",
        "ANUSA_API_URL",
        "ANUSA_DATABASE_URL",
        "APPCALL_SESSION_COOKIE_SECURE",
        "APPCALL_RUST_LISTEN",
        "APPCALL_HTTP_ADDR",
        "APPCALL_PUBLIC_BASE_URL",
    ];
    let mut environment = BTreeMap::new();
    for key in KEYS {
        if let Some(value) = std::env::var_os(key) {
            let value = value
                .to_str()
                .ok_or("invalid application configuration")?
                .to_owned();
            environment.insert((*key).to_owned(), value);
        }
    }
    Ok(environment)
}

#[cfg(test)]
mod tests {
    use super::*;
    use appcall_api::run_operator::ENV_KEY;

    fn runtime_config() -> appcall_runtime::Config {
        appcall_runtime::Config::from_map(&BTreeMap::from([
            (
                "APPCALL_DATABASE_URL".into(),
                "postgres://127.0.0.1/appcall".into(),
            ),
            ("APPCALL_SECRET_KEY".into(), "07".repeat(32)),
            ("APPCALL_OAUTH_STATE_SECRET".into(), "08".repeat(32)),
            ("APPCALL_RUNNER_URL".into(), "http://127.0.0.1:1".into()),
        ]))
        .unwrap()
    }

    fn browser_environment(grants: &str) -> BTreeMap<String, String> {
        BTreeMap::from([
            ("APPCALL_PUBLIC_BASE_URL".into(), "http://127.0.0.1/".into()),
            ("ANUSA_API_URL".into(), "http://127.0.0.1:1".into()),
            (
                "ANUSA_DATABASE_URL".into(),
                "postgres://127.0.0.1/anusa".into(),
            ),
            (
                "APPCALL_SESSION_SECRET".into(),
                "synthetic-session-secret".into(),
            ),
            (
                "ANUSA_JWT_ACCESS_SECRET".into(),
                "synthetic-jwt-secret".into(),
            ),
            (ENV_KEY.into(), grants.into()),
        ])
    }

    #[test]
    fn nonempty_operator_grants_require_authenticated_browser_configuration() {
        let environment = BTreeMap::from([(
            ENV_KEY.into(),
            r#"[{"projectId":"proj_tenant-a","userId":"user-a"}]"#.into(),
        )]);
        let result = ApplicationSharedState::capture_from_map(&runtime_config(), &environment);
        let error = match result {
            Ok(_) => panic!("nonempty operator grants enabled without browser auth"),
            Err(error) => error,
        };
        assert_eq!(
            error.to_string(),
            "Runs operator grants require authenticated browser configuration"
        );
        assert!(!error.to_string().contains("user-a"));
    }

    #[test]
    fn captured_operator_grants_are_not_mutated_by_later_configuration_maps() {
        let initial = ApplicationSharedState::capture_from_map(
            &runtime_config(),
            &browser_environment(r#"[{"projectId":"proj_tenant-a","userId":"user-a"}]"#),
        )
        .unwrap();
        let captured = initial.run_operator_grants.clone();
        let changed = ApplicationSharedState::capture_from_map(
            &runtime_config(),
            &browser_environment(r#"[{"projectId":"proj_tenant-a","userId":"user-b"}]"#),
        )
        .unwrap();

        // A later configuration parse cannot mutate the already captured
        // policy. Recovery receives this shared state Arc from its caller.
        assert!(Arc::ptr_eq(&captured, &initial.run_operator_grants));
        assert!(!Arc::ptr_eq(&captured, &changed.run_operator_grants));
        assert!(initial
            .run_operator_grants
            .permits("proj_tenant-a", Some("user-a")));
        assert!(!initial
            .run_operator_grants
            .permits("proj_tenant-a", Some("user-b")));
        assert!(changed
            .run_operator_grants
            .permits("proj_tenant-a", Some("user-b")));
    }
}
