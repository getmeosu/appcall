//! SQLx owns migration checksums, locking and transactional application.
mod legacy;
use sqlx_core::{
    connection::Connection,
    migrate::{Migrate, Migrator},
};
use sqlx_postgres::{PgConnectOptions, PgConnection, PgSslMode};
use std::{
    path::{Path, PathBuf},
    str::FromStr,
    time::Duration,
};
use zeroize::Zeroizing;
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MigrationError {
    Configuration,
    Failed,
    Timeout,
    Cancelled,
}
impl std::fmt::Display for MigrationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            Self::Configuration => "invalid migration configuration",
            Self::Failed => "database migration failed",
            Self::Timeout => "database migration timed out",
            Self::Cancelled => "database migration cancelled",
        })
    }
}
impl std::error::Error for MigrationError {}
/// Resolve once at configuration load, before any host changes working directory.
/// This is the same nearest-ancestor search and relative fallback as Go startup.
pub fn find_migrations_dir(start: &Path) -> PathBuf {
    for ancestor in start.ancestors() {
        let candidate = ancestor.join("migrations");
        if candidate.is_dir() {
            return candidate;
        }
    }
    PathBuf::from("migrations")
}
pub struct SqlxMigration {
    directory: PathBuf,
    database: Zeroizing<String>,
    timeout: Duration,
    production: bool,
}
impl SqlxMigration {
    pub fn new(
        directory: impl AsRef<Path>,
        database: &str,
        timeout: Duration,
    ) -> Result<Self, MigrationError> {
        if directory
            .as_ref()
            .as_os_str()
            .to_string_lossy()
            .trim()
            .is_empty()
            || database.trim().is_empty()
            || timeout.is_zero()
            || timeout > Duration::from_secs(300)
        {
            return Err(MigrationError::Configuration);
        }
        connection_options(database)?;
        Ok(Self {
            directory: directory.as_ref().to_owned(),
            database: Zeroizing::new(database.into()),
            timeout,
            production: false,
        })
    }
    pub(crate) fn production(mut self, production: bool) -> Self {
        self.production = production;
        self
    }
    pub fn apply(&self) -> Result<(), MigrationError> {
        self.apply_cancellable(|| false)
    }
    /// A dedicated session owns the advisory lock and transaction. Cancellation
    /// requests physical-session termination. Cleanup failure returns Failed and
    /// the server statement timeout remains the fallback. No pool is involved.
    pub fn apply_cancellable(&self, cancelled: impl Fn() -> bool) -> Result<(), MigrationError> {
        if cancelled() {
            return Err(MigrationError::Cancelled);
        }
        if tokio::runtime::Handle::try_current().is_ok() {
            return Err(MigrationError::Configuration);
        }
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .map_err(|_| MigrationError::Failed)?;
        let result = runtime.block_on(self.run(cancelled));
        runtime.shutdown_timeout(Duration::from_millis(100));
        result
    }
    async fn run(&self, cancelled: impl Fn() -> bool) -> Result<(), MigrationError> {
        let mut options = connection_options(&self.database)?;
        if self.production
            && matches!(
                options.get_ssl_mode(),
                PgSslMode::Prefer | PgSslMode::Require | PgSslMode::Allow
            )
        {
            options = options.ssl_mode(PgSslMode::VerifyFull);
        }
        options = options.application_name("appcall-migrations");
        let deadline = tokio::time::Instant::now() + self.timeout;
        let mut connection = bounded(PgConnection::connect_with(&options), deadline, &cancelled)
            .await?
            .map_err(|_| MigrationError::Failed)?;
        let pid: i32 = bounded(
            sqlx_core::query_scalar::query_scalar("SELECT pg_backend_pid()")
                .fetch_one(&mut connection),
            deadline,
            &cancelled,
        )
        .await?
        .map_err(|_| MigrationError::Failed)?;
        let work = async {
            sqlx_core::query::query("SELECT set_config('statement_timeout', $1, false)")
                .bind(self.timeout.as_millis().max(1).to_string())
                .execute(&mut connection)
                .await
                .map_err(|_| MigrationError::Failed)?;
            let mut migrator = Migrator::new(self.directory.as_path())
                .await
                .map_err(|_| MigrationError::Failed)?;
            if migrator.iter().next().is_none() {
                return Err(MigrationError::Configuration);
            }
            connection
                .lock()
                .await
                .map_err(|_| MigrationError::Failed)?;
            connection
                .ensure_migrations_table()
                .await
                .map_err(|_| MigrationError::Failed)?;
            legacy::adopt(&mut connection, &migrator, &self.directory).await?;
            migrator.set_locking(false);
            migrator
                .run(&mut connection)
                .await
                .map_err(|_| MigrationError::Failed)?;
            connection
                .unlock()
                .await
                .map_err(|_| MigrationError::Failed)?;
            Ok(())
        };
        let outcome = bounded(work, deadline, &cancelled).await;
        if let Err(error) = outcome {
            // Closing the client socket alone does not interrupt an executing SQL
            // statement. A separate session explicitly terminates the backend.
            let cleanup = async {
                let mut control = PgConnection::connect_with(
                    &options.application_name("appcall-migration-cancel"),
                )
                .await?;
                sqlx_core::query::query("SELECT pg_terminate_backend($1)")
                    .bind(pid)
                    .execute(&mut control)
                    .await?;
                loop {
                    let alive: bool = sqlx_core::query_scalar::query_scalar(
                        "SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE pid=$1)",
                    )
                    .bind(pid)
                    .fetch_one(&mut control)
                    .await?;
                    if !alive {
                        break;
                    }
                    tokio::time::sleep(Duration::from_millis(5)).await;
                }
                control.close().await
            };
            let terminated = matches!(
                tokio::time::timeout(Duration::from_secs(2), cleanup).await,
                Ok(Ok(()))
            );
            drop(connection);
            return Err(if terminated {
                error
            } else {
                MigrationError::Failed
            });
        }
        let result = outcome.unwrap();
        let _ = tokio::time::timeout(Duration::from_secs(1), connection.close()).await;
        result
    }
}
async fn bounded<F: std::future::Future>(
    future: F,
    deadline: tokio::time::Instant,
    cancelled: &impl Fn() -> bool,
) -> Result<F::Output, MigrationError> {
    tokio::pin!(future);
    loop {
        if cancelled() {
            return Err(MigrationError::Cancelled);
        }
        if tokio::time::Instant::now() >= deadline {
            return Err(MigrationError::Timeout);
        }
        tokio::select! {
            biased;
            _ = tokio::time::sleep_until(deadline) => return Err(MigrationError::Timeout),
            result = &mut future => return Ok(result),
            _ = tokio::time::sleep(Duration::from_millis(5)) => {}
        }
    }
}

// SQLx reads libpq environment defaults even when parsing a complete URL. The
// hosts use URL-only postgres configuration: reject competing configuration.
fn connection_options(database: &str) -> Result<PgConnectOptions, MigrationError> {
    const LIBPQ_ENV: &[&str] = &[
        "PGPORT",
        "PGHOSTADDR",
        "PGHOST",
        "PGUSER",
        "PGDATABASE",
        "PGPASSWORD",
        "PGSSLROOTCERT",
        "PGSSLCERT",
        "PGSSLKEY",
        "PGSSLMODE",
        "PGAPPNAME",
        "PGOPTIONS",
        "PGPASSFILE",
    ];
    if LIBPQ_ENV.iter().any(|key| std::env::var_os(key).is_some()) {
        return Err(MigrationError::Configuration);
    }
    let mut url = sqlx_core::Url::parse(database).map_err(|_| MigrationError::Configuration)?;
    // SQLx warns with both key and value for unknown parameters. Reject them
    // first so a misspelled secret parameter cannot reach a tracing sink.
    const QUERY_KEYS: &[&str] = &[
        "sslmode",
        "ssl-mode",
        "sslrootcert",
        "ssl-root-cert",
        "ssl-ca",
        "sslcert",
        "ssl-cert",
        "sslkey",
        "ssl-key",
        "statement-cache-capacity",
        "host",
        "hostaddr",
        "port",
        "dbname",
        "user",
        "password",
        "application_name",
        "options",
    ];
    if url.query_pairs().any(|(key, _)| {
        !(QUERY_KEYS.contains(&key.as_ref()) || key.starts_with("options[") && key.ends_with(']'))
    }) {
        return Err(MigrationError::Configuration);
    }
    // An explicit empty password prevents SQLx's implicit ~/.pgpass fallback.
    if url.password().is_none() && !url.query_pairs().any(|(key, _)| key == "password") {
        url.query_pairs_mut().append_pair("password", "");
    }
    PgConnectOptions::from_str(url.as_str()).map_err(|_| MigrationError::Configuration)
}
