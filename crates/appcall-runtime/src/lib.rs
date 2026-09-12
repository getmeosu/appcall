//! Shared host configuration. Secrets never implement Debug or appear in errors.
mod recovery;
pub use recovery::{SessionHealth, SessionTracker};
mod migrations;
use appcall_connectors::Registry;
use appcall_oauth::{AppCredentials, EndpointPolicy, Lifecycle, StateSigner, TokenClient};
use appcall_runner_client::{ClientOptions, RunnerClient};
use appcall_store::{LocalProvider, Store};
pub use migrations::{find_migrations_dir, MigrationError, SqlxMigration};
use std::{
    collections::BTreeMap,
    sync::{Arc, Mutex},
    time::Duration,
};
use zeroize::Zeroizing;
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Error {
    Configuration,
    Database,
    Registry,
    Credentials,
    Runner,
    Migration,
}
impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "runtime {:?}", self)
    }
}
impl std::error::Error for Error {}
pub type Result<T> = std::result::Result<T, Error>;
#[derive(Clone)]
pub struct Config {
    tracker: Option<Arc<SessionTracker>>,
    generation_deadline: Option<std::time::Instant>,
    policy: appcall_actions::PolicyConfig,
    unipile_limit: i64,
    database: String,
    migrations_dir: std::path::PathBuf,
    vault_key: Zeroizing<Vec<u8>>,
    state_key: Zeroizing<Vec<u8>>,
    apps: BTreeMap<String, AppCredentials>,
    mcp_allowed_origins: Vec<String>,
    secret_retention_days: u64,
    secret_cleanup_batch: usize,
    pub connector_dir: String,
    pub runner_url: String,
    runner_token: Zeroizing<String>,
    pub production: bool,
}
impl Config {
    pub fn from_env() -> Result<Self> {
        Self::from_map(&std::env::vars().collect())
    }
    pub fn from_map(e: &BTreeMap<String, String>) -> Result<Self> {
        let value = |k: &str| e.get(k).map(|v| v.trim()).unwrap_or("");
        let production = matches!(
            value("APPCALL_ENV").to_ascii_lowercase().as_str(),
            "production" | "prod"
        );
        let database = value("APPCALL_DATABASE_URL").to_owned();
        let runner_url = value("APPCALL_RUNNER_URL").to_owned();
        if database.is_empty() || runner_url.is_empty() {
            return Err(Error::Configuration);
        }
        let vault = aliased_key(e, "APPCALL_SECRET_KEY", "APPCALL_VAULT_MASTER_KEY", false)?;
        let state = if !production
            && value("APPCALL_OAUTH_STATE_SECRET").is_empty()
            && value("APPCALL_OAUTH_STATE_KEY").is_empty()
        {
            let mut key = vec![0; 32];
            getrandom::fill(&mut key).map_err(|_| Error::Credentials)?;
            key
        } else {
            aliased_key(
                e,
                "APPCALL_OAUTH_STATE_SECRET",
                "APPCALL_OAUTH_STATE_KEY",
                true,
            )?
        };
        let token = value("APPCALL_RUNNER_TOKEN").to_owned();
        if production && token.is_empty() {
            return Err(Error::Configuration);
        }
        let apps = oauth_apps_from_map(e);
        let c = Self {
            tracker: None,
            generation_deadline: None,
            policy: policy_from_map(e)?,
            unipile_limit: unipile_limit_from_map(e)?,
            database,
            migrations_dir: std::env::current_dir()
                .map(|dir| find_migrations_dir(&dir))
                .unwrap_or_else(|_| "migrations".into()),
            vault_key: Zeroizing::new(vault),
            state_key: Zeroizing::new(state),
            apps,
            mcp_allowed_origins: mcp_allowed_origins_from_map(e)?,
            secret_retention_days: positive_bounded(e, "APPCALL_SECRET_RETENTION_DAYS", 7, 3650)?,
            secret_cleanup_batch: positive_bounded(
                e,
                "APPCALL_SECRET_CLEANUP_BATCH",
                100,
                appcall_store::MAX_SECRET_CLEANUP_BATCH,
            )? as usize,
            connector_dir: if value("APPCALL_CONNECTOR_DIR").is_empty() {
                "runner/connectors".into()
            } else {
                value("APPCALL_CONNECTOR_DIR").into()
            },
            runner_url,
            runner_token: Zeroizing::new(token),
            production,
        };
        c.runner()?;
        Ok(c)
    }
    pub fn migrate(&self) -> Result<()> {
        self.migrate_with_timeout(Duration::from_secs(60))
    }
    pub fn migrate_with_timeout(&self, timeout: Duration) -> Result<()> {
        self.migrate_cancellable(timeout, || false)
    }
    pub fn migrate_cancellable(
        &self,
        timeout: Duration,
        cancelled: impl Fn() -> bool,
    ) -> Result<()> {
        SqlxMigration::new(&self.migrations_dir, &self.database, timeout)
            .and_then(|migration| {
                migration
                    .production(self.production)
                    .apply_cancellable(cancelled)
            })
            .map_err(|_| Error::Migration)
    }
    pub fn policy_config(&self) -> appcall_actions::PolicyConfig {
        self.policy.clone()
    }
    pub fn unipile_max_accounts(&self) -> i64 {
        self.unipile_limit
    }
    pub fn vault_key(&self) -> &[u8] {
        &self.vault_key
    }
    pub fn oauth_apps(&self) -> &BTreeMap<String, AppCredentials> {
        &self.apps
    }
    pub fn mcp_allowed_origins(&self) -> &[String] {
        &self.mcp_allowed_origins
    }
    pub fn secret_retention_days(&self) -> u64 {
        self.secret_retention_days
    }
    pub fn secret_cleanup_batch(&self) -> usize {
        self.secret_cleanup_batch
    }
    pub fn registry(&self) -> Result<Registry> {
        Registry::load(&self.connector_dir).map_err(|_| Error::Registry)
    }
    pub fn runner(&self) -> Result<RunnerClient> {
        self.runner_with_options(ClientOptions::default())
    }
    pub fn runner_with_options(&self, options: ClientOptions) -> Result<RunnerClient> {
        RunnerClient::new(&self.runner_url, &self.runner_token, options).map_err(|_| Error::Runner)
    }
    /// Fork immutable validated configuration with a fresh physical-session inventory.
    /// Hosts use this only to construct a bounded service generation.
    pub fn generation(&self) -> (Self, Arc<SessionTracker>) {
        let tracker = Arc::new(SessionTracker::default());
        let next = Self {
            tracker: Some(tracker.clone()),
            generation_deadline: Some(std::time::Instant::now() + Duration::from_secs(30)),
            ..self.clone()
        };
        (next, tracker)
    }
    pub fn connect(&self) -> Result<postgres::Client> {
        self.connect_auxiliary(&self.database)
    }
    pub fn connect_auxiliary(&self, database: &str) -> Result<postgres::Client> {
        recovery::check_deadline(self.generation_deadline)?;
        let mut client = connect_database_url(database, self.production)?;
        if let Some(tracker) = &self.tracker {
            tracker.register(database, self.production, &mut client)?;
        }
        Ok(client)
    }

    pub fn store(&self) -> Result<Store> {
        Ok(Store::new(
            self.connect()?,
            LocalProvider::new(&self.vault_key).map_err(|_| Error::Credentials)?,
        ))
    }
    pub fn lifecycle(&self, registry: Arc<Registry>) -> Result<Arc<Lifecycle>> {
        let apps = self
            .apps
            .iter()
            .map(|(k, v)| {
                (
                    k.clone(),
                    AppCredentials {
                        client_id: v.client_id.clone(),
                        client_secret: v.client_secret.clone(),
                        redirect_uri: v.redirect_uri.clone(),
                    },
                )
            })
            .collect();
        Ok(Arc::new(Lifecycle::new(
            Arc::new(Mutex::new(self.store()?)),
            registry,
            apps,
            StateSigner::new(&self.state_key).map_err(|_| Error::Credentials)?,
            Arc::new(
                TokenClient::new(Duration::from_secs(10), EndpointPolicy::HttpsOnly)
                    .map_err(|_| Error::Credentials)?,
            ),
        )))
    }
}
/// Standalone bounded PostgreSQL connection for operational CLI commands.
pub fn connect_database_url(url: &str, production: bool) -> Result<postgres::Client> {
    if url.trim().is_empty() {
        return Err(Error::Configuration);
    }
    let mut cfg: postgres::Config = url.parse().map_err(|_| Error::Configuration)?;
    cfg.connect_timeout(Duration::from_secs(5));
    cfg.keepalives_idle(Duration::from_secs(5));
    cfg.keepalives_interval(Duration::from_secs(1));
    cfg.keepalives_retries(3);
    cfg.tcp_user_timeout(Duration::from_secs(10));
    if production && cfg.get_ssl_mode() == postgres::config::SslMode::Prefer {
        cfg.ssl_mode(postgres::config::SslMode::Require);
    }
    let mut client = connect_database(&cfg)?;
    client.batch_execute("SET statement_timeout='5s';SET lock_timeout='1s';SET idle_in_transaction_session_timeout='5s'").map_err(|_|Error::Database)?;
    Ok(client)
}
fn connect_database(config: &postgres::Config) -> Result<postgres::Client> {
    let tls = native_tls::TlsConnector::builder()
        .build()
        .map_err(|_| Error::Database)?;
    config
        .connect(postgres_native_tls::MakeTlsConnector::new(tls))
        .map_err(|_| Error::Database)
}
fn aliased_key(
    e: &BTreeMap<String, String>,
    primary: &str,
    alias: &str,
    raw: bool,
) -> Result<Vec<u8>> {
    let decode = |s: &str| {
        let s = s.trim();
        if raw && s.len() == 32 {
            return Ok(s.as_bytes().to_vec());
        }
        if s.len() != 64 || !s.is_ascii() {
            return Err(Error::Configuration);
        }
        (0..64)
            .step_by(2)
            .map(|i| u8::from_str_radix(&s[i..i + 2], 16).map_err(|_| Error::Configuration))
            .collect::<Result<Vec<_>>>()
    };
    let a = e
        .get(primary)
        .filter(|s| !s.trim().is_empty())
        .map(|s| decode(s))
        .transpose()?;
    let b = e
        .get(alias)
        .filter(|s| !s.trim().is_empty())
        .map(|s| decode(s))
        .transpose()?;
    match (a, b) {
        (Some(a), Some(b)) if a != b => Err(Error::Configuration),
        (Some(a), _) | (_, Some(a)) => Ok(a),
        _ => Err(Error::Configuration),
    }
}

fn nonnegative(e: &BTreeMap<String, String>, key: &str) -> Result<i64> {
    let raw = e.get(key).map(|v| v.trim()).unwrap_or("");
    if raw.is_empty() {
        return Ok(0);
    }
    let n = raw.parse::<i64>().map_err(|_| Error::Configuration)?;
    if n < 0 {
        return Err(Error::Configuration);
    }
    Ok(n)
}

fn positive_bounded(
    e: &BTreeMap<String, String>,
    key: &str,
    default: u64,
    max: usize,
) -> Result<u64> {
    let raw = e.get(key).map(|v| v.trim()).unwrap_or("");
    let value = if raw.is_empty() {
        default
    } else {
        raw.parse::<u64>().map_err(|_| Error::Configuration)?
    };
    if value == 0 || value > max as u64 {
        return Err(Error::Configuration);
    }
    Ok(value)
}
pub fn policy_from_map(e: &BTreeMap<String, String>) -> Result<appcall_actions::PolicyConfig> {
    let text = |key: &str| e.get(key).map(|s| s.trim().to_owned()).unwrap_or_default();
    Ok(appcall_actions::PolicyConfig {
        defaults: appcall_actions::Entitlements {
            action_calls_soft: nonnegative(e, "APPCALL_ACTION_CALLS_SOFT_LIMIT")?,
            action_calls_hard: nonnegative(e, "APPCALL_ACTION_CALLS_HARD_LIMIT")?,
            send_cap: nonnegative(e, "APPCALL_SEND_CAP")?,
            spend_cap_micros: nonnegative(e, "APPCALL_SPEND_CAP_MICROS")?,
        },
        send_cost_micros: nonnegative(e, "APPCALL_SEND_COST_MICROS")?,
        public_base_url: text("APPCALL_PUBLIC_BASE_URL")
            .trim_end_matches('/')
            .to_owned(),
        webhook_secret: text("APPCALL_WEBHOOK_SIGNING_SECRET"),
        linkedin: appcall_actions::LinkedInLimits {
            warmup_enabled: !matches!(
                text("APPCALL_LINKEDIN_WARMUP_DISABLED")
                    .to_ascii_lowercase()
                    .as_str(),
                "1" | "true" | "yes" | "on"
            ),
            invite_daily_cap: nonnegative(e, "APPCALL_LINKEDIN_INVITE_DAILY_CAP")?,
            invite_weekly_cap: nonnegative(e, "APPCALL_LINKEDIN_INVITE_WEEKLY_CAP")?,
            message_daily_cap: nonnegative(e, "APPCALL_LINKEDIN_MESSAGE_DAILY_CAP")?,
            message_weekly_cap: nonnegative(e, "APPCALL_LINKEDIN_MESSAGE_WEEKLY_CAP")?,
            profile_view_daily_cap: nonnegative(e, "APPCALL_LINKEDIN_PROFILE_VIEW_DAILY_CAP")?,
            invite_spacing_seconds: nonnegative(e, "APPCALL_LINKEDIN_INVITE_MIN_SPACING_SECONDS")?,
            message_spacing_seconds: nonnegative(
                e,
                "APPCALL_LINKEDIN_MESSAGE_MIN_SPACING_SECONDS",
            )?,
            invite_noted_monthly_cap: nonnegative(e, "APPCALL_LINKEDIN_INVITE_NOTED_MONTHLY_CAP")?,
        },
    })
}

pub fn mcp_allowed_origins_from_map(e: &BTreeMap<String, String>) -> Result<Vec<String>> {
    let configured = e
        .get("APPCALL_MCP_ALLOWED_ORIGINS")
        .map(|value| value.trim())
        .filter(|value| !value.is_empty());
    let raw = configured.or_else(|| {
        e.get("APPCALL_PUBLIC_BASE_URL")
            .map(|value| value.trim())
            .filter(|value| !value.is_empty())
    });
    let Some(raw) = raw else {
        return Ok(Vec::new());
    };
    let origins = raw.split(',').map(str::trim).collect::<Vec<_>>();
    if origins.iter().any(|origin| origin.is_empty()) {
        return Err(Error::Configuration);
    }
    Ok(origins.into_iter().map(str::to_owned).collect())
}

/// Parse connector OAuth app settings independently of the storage backend.
pub fn oauth_apps_from_map(e: &BTreeMap<String, String>) -> BTreeMap<String, AppCredentials> {
    let value = |k: &str| e.get(k).map(|v| v.trim()).unwrap_or("");
    let mut apps = BTreeMap::new();
    for (name, id) in e {
        let Some(prefix) = name
            .strip_prefix("APPCALL_")
            .and_then(|s| s.strip_suffix("_OAUTH_CLIENT_ID"))
        else {
            continue;
        };
        if id.trim().is_empty() {
            continue;
        }
        let key = if prefix == "GOOGLE" {
            "google-workspace".to_owned()
        } else {
            prefix.to_lowercase().replace('_', "-")
        };
        if prefix == "GOOGLE" && !value("APPCALL_GOOGLE_WORKSPACE_OAUTH_CLIENT_ID").is_empty() {
            continue;
        }
        apps.insert(
            key,
            AppCredentials {
                client_id: id.trim().into(),
                client_secret: value(&format!("APPCALL_{prefix}_OAUTH_CLIENT_SECRET")).into(),
                redirect_uri: value(&format!("APPCALL_{prefix}_OAUTH_REDIRECT_URI")).into(),
            },
        );
    }
    apps
}

/// Zero means unlimited, matching the persisted host configuration.
pub fn unipile_limit_from_map(e: &BTreeMap<String, String>) -> Result<i64> {
    nonnegative(e, "APPCALL_UNIPILE_MAX_ACCOUNTS")
}
