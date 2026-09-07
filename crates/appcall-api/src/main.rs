//! Rust application host; optional local qualification mode retains a read-only policy.
mod application;
mod memory_application;
use appcall_actions::{LifecycleCredentialResolver, PgActionRepository, ReadOnlyPolicy, Service};
use appcall_api::{serve, Api, Services};
use appcall_auth::PostgresApiKeys;
use appcall_connectors::Registry;
use appcall_oauth::{EndpointPolicy, Lifecycle, StateSigner, TokenClient};
use appcall_runner_client::{ClientOptions, RunnerClient};
use appcall_store::{LocalProvider, Store};
use std::{
    collections::BTreeMap,
    rc::Rc,
    sync::{Arc, Mutex},
    time::Duration,
};

fn main() {
    if run().is_err() {
        // Do not print connection strings, credentials or provider errors.
        eprintln!(
            "{}",
            serde_json::json!({"level":"error","event":"rust_api_startup_failed","message":"Check the application configuration."})
        );
        std::process::exit(1);
    }
}
fn required(name: &str) -> Result<String, Box<dyn std::error::Error>> {
    let value = std::env::var(name)?;
    if value.is_empty() {
        return Err("missing configuration".into());
    }
    Ok(value)
}
fn key(name: &str) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    let value = required(name)?;
    if value.len() == 32 {
        return Ok(value.into_bytes());
    }
    if value.len() != 64 || !value.is_ascii() {
        return Err("invalid key encoding".into());
    }
    (0..64)
        .step_by(2)
        .map(|i| u8::from_str_radix(&value[i..i + 2], 16).map_err(Into::into))
        .collect()
}
fn run() -> Result<(), Box<dyn std::error::Error>> {
    if std::env::var("APPCALL_RUST_QUALIFICATION").as_deref() != Ok("1") {
        return run_application();
    }
    let database = required("APPCALL_DATABASE_URL")?;
    let database = local_database(&database)?;
    let connect = || -> Result<postgres::Client, postgres::Error> {
        let mut client = database.connect(postgres::NoTls)?;
        client.batch_execute("SET statement_timeout='5s'; SET lock_timeout='1s'; SET idle_in_transaction_session_timeout='5s'")?;
        Ok(client)
    };
    let vault_key = key("APPCALL_VAULT_MASTER_KEY")?;
    let store = || -> Result<Store, Box<dyn std::error::Error>> {
        Ok(Store::new(connect()?, LocalProvider::new(&vault_key)?))
    };
    let registry = Registry::load(
        std::env::var("APPCALL_CONNECTOR_DIR").unwrap_or_else(|_| "runner/connectors".into()),
    )?;
    let lifecycle = Arc::new(Lifecycle::new(
        Arc::new(Mutex::new(store()?)),
        Arc::new(registry.clone()),
        BTreeMap::new(),
        StateSigner::new(&key("APPCALL_OAUTH_STATE_KEY")?)?,
        Arc::new(TokenClient::new(
            Duration::from_secs(15),
            EndpointPolicy::HttpsOnly,
        )?),
    ));
    let runner_url = required("APPCALL_RUNNER_URL")?;
    validate_runner_url(&runner_url)?;
    let runner = RunnerClient::new(
        &runner_url,
        &required("APPCALL_RUNNER_TOKEN")?,
        ClientOptions::default(),
    )?;
    let executor = Service::new(
        PgActionRepository::new(connect()?),
        registry.clone(),
        LifecycleCredentialResolver(lifecycle.clone()),
        runner.clone(),
        ReadOnlyPolicy,
    );
    let api = Api {
        registry,
        backend: Services::new(
            store()?,
            Arc::new(PostgresApiKeys::new(connect()?)),
            executor,
            LifecycleCredentialResolver(lifecycle),
            runner,
        ),
    };
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .max_blocking_threads(16)
        .build()?;
    let api = Rc::new(api);
    let address: std::net::SocketAddr = std::env::var("APPCALL_RUST_LISTEN")
        .unwrap_or_else(|_| "127.0.0.1:8088".into())
        .parse()?;
    if !address.ip().is_loopback() {
        return Err("qualification listener must be loopback".into());
    }
    runtime.block_on(tokio::task::LocalSet::new().run_until(async {
        let listener = tokio::net::TcpListener::bind(address).await?;
        eprintln!("{}",serde_json::json!({"level":"info","event":"rust_api_started","listen":address.to_string(),"mode":"qualification","routeParity":"incomplete"}));
        serve(listener, api.clone(), async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await
    }))?;
    Ok(())
}

fn application_listen(configured: Option<&str>) -> String {
    let value = configured
        .filter(|value| !value.is_empty())
        .unwrap_or("0.0.0.0:5080");
    if value.starts_with(':') {
        format!("0.0.0.0{value}")
    } else {
        value.into()
    }
}

fn run_application() -> Result<(), Box<dyn std::error::Error>> {
    let environment = std::env::vars().collect();
    if memory_application::selected(&environment) {
        return memory_application::run(environment);
    }
    let config = appcall_runtime::Config::from_env()?;
    config.migrate()?;
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .max_blocking_threads(32)
        .build()?;
    let registry = config.registry()?;
    let rate = appcall_api::rate_limit::RateConfig::from_env()?;
    let (initial_config, tracker) = config.generation();
    let initial =
        application::Application::new(&initial_config, registry.clone(), runtime.handle().clone())?;
    let shared = initial.shared_state();
    let factory_registry = registry.clone();
    let handle = runtime.handle().clone();
    let backend = appcall_api::generation::Generation::new(
        initial,
        tracker,
        Arc::new(move || {
            let (generation, tracker) = config.generation();
            let application = application::Application::new_with_state(
                &generation,
                factory_registry.clone(),
                handle.clone(),
                shared.clone(),
            )
            .map_err(|_| appcall_api::ApiError::new("STORAGE_UNAVAILABLE"))?;
            Ok((application, tracker))
        }),
    );
    let api = Rc::new(Api { registry, backend });
    let configured_address = std::env::var("APPCALL_RUST_LISTEN")
        .or_else(|_| std::env::var("APPCALL_HTTP_ADDR"))
        .ok();
    let address = application_listen(configured_address.as_deref());
    runtime.block_on(tokio::task::LocalSet::new().run_until(async {
        let listener = tokio::net::TcpListener::bind(&address).await?;
        api.backend.start();
        eprintln!("{}",serde_json::json!({"event":"rust_api_started","mode":"application","routeParity":"incomplete"}));
        appcall_api::serve_with_rate(listener,api.clone(),async {
            shutdown_signal().await;
            api.backend.stop();
        },rate).await
    }))?;
    Ok(())
}

async fn shutdown_signal() {
    #[cfg(unix)]
    {
        if let Ok(mut terminate) =
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
        {
            tokio::select! { _=tokio::signal::ctrl_c()=>{}, _=terminate.recv()=>{} }
            return;
        }
    }
    let _ = tokio::signal::ctrl_c().await;
}

fn local_database(value: &str) -> Result<postgres::Config, Box<dyn std::error::Error>> {
    let mut config: postgres::Config = value.parse()?;
    if config.get_hosts().is_empty() || config.get_hostaddrs().iter().any(|ip| !ip.is_loopback()) {
        return Err("qualification database must be loopback".into());
    }
    let hosts = config
        .get_hosts()
        .iter()
        .map(|host| match host {
            postgres::config::Host::Tcp(name) if name == "localhost" => {
                Ok(std::net::IpAddr::V4(std::net::Ipv4Addr::LOCALHOST))
            }
            postgres::config::Host::Tcp(name) => name
                .parse::<std::net::IpAddr>()
                .ok()
                .filter(|ip| ip.is_loopback())
                .ok_or("qualification database must be loopback"),
            _ => Err("qualification database must be loopback"),
        })
        .collect::<Result<Vec<_>, _>>()?;
    // Pin localhost too: validation covers effective routing and bypasses DNS.
    if config.get_hostaddrs().is_empty() {
        for host in hosts {
            config.hostaddr(host);
        }
    }
    config.connect_timeout(Duration::from_secs(3));
    Ok(config)
}

fn validate_runner_url(value: &str) -> Result<(), Box<dyn std::error::Error>> {
    let url = url::Url::parse(value)?;
    let loopback = match url.host() {
        Some(url::Host::Ipv4(ip)) => ip.is_loopback(),
        Some(url::Host::Ipv6(ip)) => ip.is_loopback(),
        _ => false,
    };
    if url.scheme() != "https" && !(url.scheme() == "http" && loopback) {
        return Err("runner requires HTTPS or numeric loopback".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    #[test]
    fn application_listener_preserves_go_colon_port_and_public_default() {
        assert_eq!(super::application_listen(None), "0.0.0.0:5080");
        assert_eq!(super::application_listen(Some(":5089")), "0.0.0.0:5089");
        assert_eq!(
            super::application_listen(Some("127.0.0.1:1234")),
            "127.0.0.1:1234"
        );
        assert_eq!(super::application_listen(Some("[::1]:1234")), "[::1]:1234");
    }
    #[test]
    fn qualification_requires_tls_for_remote_runner_credentials() {
        assert!(super::validate_runner_url("http://runner.example/rpc").is_err());
        assert!(super::validate_runner_url("https://runner.example/rpc").is_ok());
        assert!(super::validate_runner_url("http://127.0.0.1:8081/rpc").is_ok());
    }
    #[test]
    fn qualification_rejects_postgres_query_host_overrides() {
        assert!(
            super::local_database("postgres://user@127.0.0.1/db?hostaddr=203.0.113.10").is_err()
        );
        assert!(super::local_database("postgres://user@127.0.0.1/db?host=remote.invalid").is_err());
        assert!(super::local_database(
            "postgres://user@127.0.0.1/db?hostaddr=127.0.0.1,203.0.113.10"
        )
        .is_err());
        assert!(
            super::local_database("postgres://user@127.0.0.1/db?options=-csearch_path%3Dtest")
                .is_ok()
        );
    }
}
