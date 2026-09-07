//! Standalone AppCall workflow engine HTTP daemon.
use appcall_engine::*;
use appcall_engine_http::*;
use std::sync::Arc;
fn host<S: Store + Send + 'static>(
    mut engine: Engine<S>,
    token: &str,
    scope: &str,
) -> Result<EngineHost> {
    engine.register_workflow("wait-for-signal", "v1", |c| c.signal("complete"))?;
    EngineHost::spawn(
        HttpAdapter::with_scope(engine, token, scope)?,
        Arc::new(MissingPayloads),
    )
}
fn main() -> std::result::Result<(), Box<dyn std::error::Error>> {
    let token = std::env::var("APPCALL_ENGINE_TOKEN")?;
    let scope = std::env::var("APPCALL_ENGINE_SCOPE")?;
    let backend = std::env::var("APPCALL_ENGINE_BACKEND").unwrap_or_else(|_| "sqlite".into());
    let engine = match backend.as_str() {
        "sqlite" => host(
            Engine::open(std::env::var("APPCALL_ENGINE_DB")?)?,
            &token,
            &scope,
        )?,
        #[cfg(feature = "postgres-backend")]
        "postgres" => {
            if std::env::var("APPCALL_ENGINE_POSTGRES_ALLOW_PLAINTEXT").as_deref() != Ok("true") {
                return Err("use a host-configured TLS Client, or explicitly enable plaintext on a trusted private database network".into());
            }
            let config = std::env::var("APPCALL_ENGINE_POSTGRES_URL")?
                .parse::<postgres::Config>()
                .map_err(|_| Error::Invalid("postgres configuration"))?;
            let mut client = config
                .connect(postgres::NoTls)
                .map_err(|_| Error::Unavailable)?;
            client
                .batch_execute("SET statement_timeout='5s'; SET lock_timeout='5s'")
                .map_err(|_| Error::Unavailable)?;
            host(
                Engine::with_store(appcall_engine_postgres::PostgresStore::from_client(client)?),
                &token,
                &scope,
            )?
        }
        _ => {
            return Err("unsupported backend (PostgreSQL requires postgres-backend feature)".into())
        }
    };
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(2)
        .enable_all()
        .build()?;
    let result = runtime.block_on(async {
        let address =
            std::env::var("APPCALL_ENGINE_LISTEN").unwrap_or_else(|_| "127.0.0.1:8789".into());
        let listener = tokio::net::TcpListener::bind(address).await?;
        serve(
            listener,
            engine.client(),
            token,
            TransportLimits::default(),
            async {
                let _ = tokio::signal::ctrl_c().await;
            },
        )
        .await
    });
    engine.shutdown()?;
    result?;
    Ok(())
}
