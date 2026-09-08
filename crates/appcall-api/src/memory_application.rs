//! Development-only process assembly without an AppCall PostgreSQL database.
//! Identity PostgreSQL, when configured, remains a separate mandatory authority.
use appcall_api::development_browser::{
    BrowserMode, DevelopmentBrowserConfig, DevelopmentBrowserHost,
};
use appcall_api::development_memory::*;
use appcall_api::{Api, ApiError, Backend, Identity, RawResponse, Request, Response};
use appcall_auth::{Principal, StaticApiKey};
use appcall_connectors::Registry;
use std::{collections::BTreeMap, net::SocketAddr, rc::Rc, sync::Arc, time::Duration};
type Result<T> = std::result::Result<T, Box<dyn std::error::Error>>;

pub fn selected(env: &BTreeMap<String, String>) -> bool {
    env.get("APPCALL_DATABASE_URL").is_none_or(String::is_empty)
}

fn validate_run_operator_grants(env: &BTreeMap<String, String>) -> Result<()> {
    let grants = appcall_api::run_operator::RunOperatorGrants::from_map(env)
        .map_err(|_| "invalid Runs operator grants configuration")?;
    if !grants.is_empty() {
        return Err(
            "Runs operator grants require durable authenticated browser configuration".into(),
        );
    }
    Ok(())
}

pub fn run(env: BTreeMap<String, String>) -> Result<()> {
    // Memory mode has no durable browser generation to authorize Runs
    // mutations. Parse the policy anyway so malformed or non-empty grants
    // cannot be silently ignored on this startup path.
    validate_run_operator_grants(&env)?;
    let production = matches!(
        env.get("APPCALL_ENV")
            .map(|v| v.trim().to_ascii_lowercase())
            .as_deref(),
        Some("production" | "prod")
    );
    let permit = DevelopmentPermit::validate(
        production,
        env.get("APPCALL_DATABASE_URL").map(String::as_str),
    )?;
    let address: SocketAddr = env
        .get("APPCALL_RUST_LISTEN")
        .or_else(|| env.get("APPCALL_HTTP_ADDR"))
        .map(String::as_str)
        .unwrap_or("127.0.0.1:5080")
        .parse()?;
    if !address.ip().is_loopback() {
        return Err("memory listener must be loopback".into());
    }
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .max_blocking_threads(32)
        .build()?;
    let rate = appcall_api::rate_limit::RateConfig::from_env()?;
    let key = env
        .get("APPCALL_DEV_API_KEY")
        .filter(|k| !k.trim().is_empty());
    let loaded = key.map(|_| {
        Registry::load(
            env.get("APPCALL_CONNECTOR_DIR")
                .map(String::as_str)
                .unwrap_or("runner/connectors"),
        )
    });
    let (registry, backend) = match (key, loaded) {
        (Some(key), Some(Ok(registry))) => {
            let repository =
                MemoryRepository::new(permit, Arc::new(registry.clone()), MemoryLimits::default())?;
            let policy = appcall_runtime::policy_from_map(&env)?;
            let runner = env
                .get("APPCALL_RUNNER_URL")
                .filter(|u| !u.is_empty())
                .map(|url| {
                    appcall_runner_client::RunnerClient::new(
                        url,
                        env.get("APPCALL_RUNNER_TOKEN")
                            .map(String::as_str)
                            .unwrap_or(""),
                        Default::default(),
                    )
                })
                .transpose()?;
            // Blocking token client and optional PostgreSQL identities are built
            // before entering Tokio; the API owner is also dropped outside it.
            let oauth = Arc::new(MemoryOAuth::new(
                repository.clone(),
                appcall_runtime::oauth_apps_from_map(&env),
                Arc::new(appcall_oauth::TokenClient::new(
                    Duration::from_secs(15),
                    appcall_oauth::EndpointPolicy::LoopbackDevelopment,
                )?),
            )?);
            let validator = runner.clone().map(|client| {
                Arc::new(appcall_setup::RunnerValidator::new(
                    Arc::new(client),
                    Arc::new(registry.clone()),
                    runtime.handle().clone(),
                ))
            });
            let setup = Arc::new(MemorySetup::new(
                repository.clone(),
                validator,
                oauth.clone(),
            ));
            let actions =
                memory_actions(repository.clone(), runner.clone(), policy.clone(), oauth)?;
            let verifier = if policy.webhook_secret.is_empty() {
                None
            } else {
                Some(appcall_auth::WebhookVerifier::new(&policy.webhook_secret)?)
            };
            let events = Arc::new(MemoryEvents::new(repository.clone(), runner, verifier));
            let core = Arc::new(MemoryCore::new(
                repository,
                actions,
                setup,
                events,
                appcall_runtime::unipile_limit_from_map(&env)?,
            ));
            let data = Arc::new(MemoryDashboard::new(core.clone()));
            let browser = if [
                "APPCALL_SESSION_SECRET",
                "ANUSA_JWT_ACCESS_SECRET",
                "ANUSA_DATABASE_URL",
                "ANUSA_API_URL",
            ]
            .iter()
            .any(|key| env.contains_key(*key))
            {
                let config = appcall_api::browser_host::BrowserConfig::from_map(&env)
                    .map_err(|_| "invalid browser configuration")?;
                let database = env
                    .get("ANUSA_DATABASE_URL")
                    .filter(|s| !s.is_empty())
                    .ok_or("missing identity database")?;
                BrowserMode::Recovering(
                    appcall_api::browser_recovery::RecoveringBrowserHost::new(
                        config,
                        database.clone(),
                        data,
                    )
                    .map_err(|_| "invalid browser configuration")?,
                )
            } else {
                let origin = env
                    .get("APPCALL_PUBLIC_BASE_URL")
                    .cloned()
                    .unwrap_or_else(|| format!("http://{address}"));
                let config = DevelopmentBrowserConfig::new(false, &address.to_string(), &origin)
                    .map_err(|_| "invalid development browser configuration")?;
                BrowserMode::Development(DevelopmentBrowserHost::new(config, data))
            };
            let key = StaticApiKey::from_hash(
                &appcall_auth::hash_api_key(key),
                Principal::project("proj_dev")?,
            )?;
            (
                registry,
                MemoryHost(Some(MemoryBackend::new(
                    core,
                    Some(Arc::new(key)),
                    Some(Arc::new(browser)),
                ))),
            )
        }
        _ => {
            eprintln!(
                "{}",
                serde_json::json!({"level":"warn","event":"development_api_disabled","message":"Configure a development API key and valid connector registry."})
            );
            (Registry::from_connectors([])?, MemoryHost(None))
        }
    };
    let api = Rc::new(Api { registry, backend });
    runtime.block_on(tokio::task::LocalSet::new().run_until(async {
        let listener=tokio::net::TcpListener::bind(address).await?;
        eprintln!("{}",serde_json::json!({"event":"rust_api_started","mode":"development-memory","persistence":"ephemeral","listen":address.to_string()}));
        appcall_api::serve_with_rate(listener,api.clone(),async {
            super::shutdown_signal().await;
            if let Some(backend)=&api.backend.0 {backend.stop();}
        },rate).await
    }))?;
    // No synchronous Postgres owner is destroyed inside an async runtime.
    drop(api);
    // A system resolver or interrupted socket must not make process shutdown
    // wait indefinitely for an already bounded, detached recovery attempt.
    runtime.shutdown_timeout(Duration::from_secs(20));
    Ok(())
}
struct MemoryHost(Option<MemoryBackend>);
impl MemoryHost {
    fn backend(&self) -> appcall_api::Result<&MemoryBackend> {
        self.0.as_ref().ok_or_else(|| ApiError::new("NOT_FOUND"))
    }
}
impl Backend for MemoryHost {
    async fn ready(&self) -> appcall_api::Result<()> {
        match &self.0 {
            Some(b) => b.ready().await,
            None => Ok(()),
        }
    }
    fn requires_api_auth(&self, m: &str, p: &str) -> bool {
        self.0.as_ref().is_some_and(|b| b.requires_api_auth(m, p))
    }
    async fn authorize(&self, h: &[(String, String)]) -> appcall_api::Result<Identity> {
        self.backend()?.authorize(h).await
    }
    async fn connections(
        &self,
        i: &Identity,
    ) -> appcall_api::Result<Vec<appcall_store::Connection>> {
        self.backend()?.connections(i).await
    }
    async fn platform_connectors(&self, i: &Identity) -> appcall_api::Result<Vec<String>> {
        self.backend()?.platform_connectors(i).await
    }
    async fn connection(
        &self,
        i: &Identity,
        id: &str,
    ) -> appcall_api::Result<appcall_store::Connection> {
        self.backend()?.connection(i, id).await
    }
    async fn test_connection(
        &self,
        i: &Identity,
        id: &str,
    ) -> appcall_api::Result<appcall_store::Connection> {
        self.backend()?.test_connection(i, id).await
    }
    async fn disconnect(&self, i: &Identity, id: &str) -> appcall_api::Result<()> {
        self.backend()?.disconnect(i, id).await
    }
    async fn execute(
        &self,
        r: appcall_actions::ExecuteRequest,
    ) -> appcall_api::Result<appcall_actions::ExecuteResult> {
        self.backend()?.execute(r).await
    }
    async fn raw_route(&self, r: &Request) -> appcall_api::Result<Option<RawResponse>> {
        match &self.0 {
            Some(b) => b.raw_route(r).await,
            None => Ok(None),
        }
    }
    async fn public_route(&self, r: &Request) -> appcall_api::Result<Option<Response>> {
        match &self.0 {
            Some(b) => b.public_route(r).await,
            None => Ok(Some(Response {
                status: 404,
                body: serde_json::json!({"error":{"code":"NOT_FOUND","message":"The route was not found."}}),
                headers: vec![],
            })),
        }
    }
    async fn auxiliary_route(
        &self,
        i: &Identity,
        r: &Request,
    ) -> appcall_api::Result<Option<Response>> {
        self.backend()?.auxiliary_route(i, r).await
    }
    async fn event_stream(
        &self,
        r: &Request,
    ) -> appcall_api::Result<Option<appcall_api::streaming::StreamResponse>> {
        match &self.0 {
            Some(b) => b.event_stream(r).await,
            None => Ok(None),
        }
    }
}
#[cfg(test)]
mod tests {
    #[test]
    fn memory_selection_never_accepts_a_supplied_invalid_database() {
        let mut env = std::collections::BTreeMap::new();
        assert!(super::selected(&env));
        env.insert("APPCALL_DATABASE_URL".into(), String::new());
        assert!(super::selected(&env));
        for invalid in [" ", "not a database", "postgres://127.0.0.1/unavailable"] {
            env.insert("APPCALL_DATABASE_URL".into(), invalid.into());
            assert!(!super::selected(&env));
        }
    }

    #[test]
    fn memory_mode_missing_or_empty_run_operator_grants_are_deny_all() {
        let missing = std::collections::BTreeMap::new();
        assert!(super::validate_run_operator_grants(&missing).is_ok());

        let empty = std::collections::BTreeMap::from([(
            appcall_api::run_operator::ENV_KEY.to_owned(),
            "[]".to_owned(),
        )]);
        assert!(super::validate_run_operator_grants(&empty).is_ok());
    }

    #[test]
    fn memory_mode_rejects_malformed_or_nonempty_run_operator_grants() {
        let malformed = std::collections::BTreeMap::from([(
            appcall_api::run_operator::ENV_KEY.to_owned(),
            "not-json".to_owned(),
        )]);
        let error = super::validate_run_operator_grants(&malformed)
            .expect_err("malformed grants must fail closed")
            .to_string();
        assert_eq!(error, "invalid Runs operator grants configuration");
        assert!(!error.contains("not-json"));

        let configured = std::collections::BTreeMap::from([(
            appcall_api::run_operator::ENV_KEY.to_owned(),
            r#"[{"projectId":"proj_tenant-a","userId":"user-a"}]"#.to_owned(),
        )]);
        let error = super::validate_run_operator_grants(&configured)
            .expect_err("memory mode cannot authorize durable Runs operators")
            .to_string();
        assert_eq!(
            error,
            "Runs operator grants require durable authenticated browser configuration"
        );
        assert!(!error.contains("proj_tenant-a"));
        assert!(!error.contains("user-a"));
    }
}
