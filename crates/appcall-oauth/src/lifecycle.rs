use crate::*;
use appcall_connectors::{OAuthConfig, Registry};
use appcall_store::{AuthType, Connection, Scope, Status, Store, StoreTransaction};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD as BASE64, Engine as _};
use std::{
    collections::BTreeMap,
    sync::{Arc, Mutex},
};
use zeroize::Zeroizing;

pub struct Lifecycle {
    pub(crate) store: Arc<Mutex<Store>>,
    pub(crate) registry: Arc<Registry>,
    pub(crate) apps: BTreeMap<String, AppCredentials>,
    pub(crate) signer: StateSigner,
    pub(crate) provider: Arc<dyn TokenProvider>,
    pub(crate) now: Arc<dyn Fn() -> i64 + Send + Sync>,
}
pub(crate) struct Pending {
    pub connection: Connection,
    pub attempt: String,
    pub spec: OAuthConfig,
    pub tokens: Option<TokenSet>,
}
enum Prepared {
    Fresh(Connection, ResolvedCredentials),
    Refresh(Box<Pending>),
}
pub(crate) fn persistence(error: appcall_store::Error) -> Error {
    if error == appcall_store::Error::NotFound {
        Error::ConnectionUnavailable
    } else {
        Error::Persistence
    }
}
pub(crate) fn random_id(prefix: &str) -> Result<String> {
    let mut bytes = [0; 32];
    getrandom::fill(&mut bytes).map_err(|_| Error::Persistence)?;
    Ok(format!("{prefix}{}", BASE64.encode(bytes)))
}
impl Lifecycle {
    pub fn database_health(&self) -> Option<bool> {
        match self.store.try_lock() {
            Ok(store) => store.database_health(),
            Err(std::sync::TryLockError::WouldBlock) => None,
            Err(std::sync::TryLockError::Poisoned(_)) => Some(false),
        }
    }
    pub fn new(
        store: Arc<Mutex<Store>>,
        registry: Arc<Registry>,
        apps: BTreeMap<String, AppCredentials>,
        signer: StateSigner,
        provider: Arc<dyn TokenProvider>,
    ) -> Self {
        Self {
            store,
            registry,
            apps,
            signer,
            provider,
            now: Arc::new(|| chrono::Utc::now().timestamp()),
        }
    }
    pub fn with_clock(mut self, clock: Arc<dyn Fn() -> i64 + Send + Sync>) -> Self {
        self.now = clock;
        self
    }
    pub(crate) fn spec(&self, connector: &str) -> Result<OAuthConfig> {
        self.registry
            .connector(connector)
            .map_err(|_| Error::Unsupported)?
            .manifest()
            .auth
            .oauth
            .clone()
            .filter(|spec| spec.version.is_empty() || spec.version == "2.0")
            .ok_or(Error::Unsupported)
    }
    pub fn resolve(
        &self,
        scope: &Scope,
        id: &str,
        expected_connector: &str,
    ) -> Result<ResolvedCredentials> {
        self.resolve_fenced(scope, id, expected_connector)
            .map(|(_, fields)| fields)
    }
    pub fn resolve_fenced(
        &self,
        scope: &Scope,
        id: &str,
        expected_connector: &str,
    ) -> Result<(Connection, ResolvedCredentials)> {
        self.resolve_checked_fenced(scope, id, expected_connector, None, false, &|| true)
    }
    /// Health diagnostics may inspect a degraded connection. Rotation intents
    /// and credential revision fences remain identical to action resolution.
    pub fn resolve_health_fenced(
        &self,
        scope: &Scope,
        id: &str,
        expected_connector: &str,
    ) -> Result<(Connection, ResolvedCredentials)> {
        self.resolve_checked_fenced(scope, id, expected_connector, None, true, &|| true)
    }
    /// Check the selecting caller's owner/auth identity after lock contention,
    /// before loading or rotating credentials. Empty owner means platform-owned.
    pub fn resolve_checked_fenced(
        &self,
        scope: &Scope,
        id: &str,
        expected_connector: &str,
        expected_identity: Option<(&str, &str)>,
        health: bool,
        active: &dyn Fn() -> bool,
    ) -> Result<(Connection, ResolvedCredentials)> {
        if !active() {
            return Err(Error::ConnectionUnavailable);
        }
        let policy = ResolutionPolicy {
            expected_identity,
            health,
            active,
        };
        let prepared = self
            .store
            .lock()
            .map_err(|_| Error::Persistence)?
            .transaction(|tx| self.prepare_refresh(tx, scope, id, expected_connector, &policy))
            .map_err(persistence)??;
        match prepared {
            Prepared::Fresh(connection, fields) => Ok((connection, fields)),
            Prepared::Refresh(pending) => {
                let app = self
                    .apps
                    .get(expected_connector)
                    .ok_or(Error::NotConfigured)?;
                let tokens = pending.tokens.as_ref().ok_or(Error::InvalidToken)?;
                // A committed dispatch intent must always be reconciled. If
                // cancellation won before the RPC, retain an unknown fence.
                let result = if active() {
                    self.provider
                        .refresh(&pending.spec, app, &tokens.refresh_token, (self.now)())
                } else {
                    Err(Error::OutcomeUnknown)
                };
                self.finish_fenced(scope, *pending, result)
            }
        }
    }
    fn prepare_refresh(
        &self,
        tx: &mut StoreTransaction<'_>,
        scope: &Scope,
        id: &str,
        expected: &str,
        policy: &ResolutionPolicy<'_>,
    ) -> std::result::Result<Result<Prepared>, appcall_store::Error> {
        if !(policy.active)() {
            return Ok(Err(Error::ConnectionUnavailable));
        }
        let connection = tx.lock_connection(scope, id)?;
        if !(policy.active)()
            || policy.expected_identity.is_some_and(|(owner, auth)| {
                connection.external_account_id != owner || connection.auth_type.as_str() != auth
            })
        {
            return Ok(Err(Error::ConnectionUnavailable));
        }
        if connection.connector != expected {
            return Ok(Err(Error::ConnectionUnavailable));
        }
        let intent=tx.client().query_opt("SELECT secret_ref_id,state FROM oauth_refresh_intents WHERE project_id=$1 AND connection_id=$2",&[&connection.project_id,&id])?;
        if intent.is_some_and(|row| {
            row.get::<_, String>("secret_ref_id") == connection.secret_ref_id
                && matches!(
                    row.get::<_, String>("state").as_str(),
                    "dispatched" | "unknown"
                )
        }) {
            return Ok(Err(Error::OutcomeUnknown));
        }
        if connection.status == Status::Disconnected
            || (!policy.health && connection.status != Status::Active)
        {
            return Ok(Err(Error::ConnectionUnavailable));
        }
        if connection.secret_ref_id.is_empty() {
            return Ok(Ok(Prepared::Fresh(
                connection,
                ResolvedCredentials(BTreeMap::new()),
            )));
        }
        let kind = tx.secret_kind(&connection.project_id, &connection.secret_ref_id)?;
        let raw = tx.load_secret(&connection.project_id, &connection.secret_ref_id)?;
        if kind != format!("oauth_tokens_{}", connection.id) {
            if kind.starts_with("oauth_tokens_") {
                return Ok(Err(Error::InvalidToken));
            }
            return Ok(
                serde_json::from_slice::<BTreeMap<String, String>>(raw.as_bytes())
                    .map(|fields| Prepared::Fresh(connection, ResolvedCredentials(fields)))
                    .map_err(|_| Error::InvalidToken),
            );
        }
        if connection.auth_type != AuthType::OAuth2 {
            return Ok(Err(Error::InvalidToken));
        }
        let tokens = match TokenSet::decode(raw.as_bytes()) {
            Ok(tokens) => tokens,
            Err(error) => return Ok(Err(error)),
        };
        if !tokens.needs_refresh((self.now)()) {
            return Ok(Ok(Prepared::Fresh(
                connection,
                ResolvedCredentials(BTreeMap::from([(
                    "accessToken".into(),
                    tokens.access_token.clone(),
                )])),
            )));
        }
        let spec = match self.spec(expected) {
            Ok(spec) if spec.supports_refresh => spec,
            Ok(_) => return Ok(Err(Error::Unsupported)),
            Err(error) => return Ok(Err(error)),
        };
        if !self.apps.contains_key(expected) {
            return Ok(Err(Error::NotConfigured));
        }
        if tokens.refresh_token.trim().is_empty() {
            return Ok(Err(Error::InvalidToken));
        }
        let attempt = match random_id("refresh_") {
            Ok(id) => id,
            Err(error) => return Ok(Err(error)),
        };
        if !(policy.active)() {
            return Ok(Err(Error::ConnectionUnavailable));
        }
        tx.client().execute("INSERT INTO oauth_refresh_intents(project_id,connection_id,attempt_id,secret_ref_id,operation,state) VALUES($1,$2,$3,$4,'refresh','dispatched') ON CONFLICT(project_id,connection_id) DO UPDATE SET attempt_id=EXCLUDED.attempt_id,secret_ref_id=EXCLUDED.secret_ref_id,operation='refresh',state='dispatched',state_digest='',created_at=now(),updated_at=now()",&[&connection.project_id,&id,&attempt,&connection.secret_ref_id])?;
        // Existing Go resolvers reject degraded too; no runtime may automatically
        // re-enable a connection with an outstanding dispatched/unknown intent.
        tx.update_status(scope, id, Status::Degraded)?;
        if !(policy.active)() {
            return Err(appcall_store::Error::Conflict);
        }
        Ok(Ok(Prepared::Refresh(Box::new(Pending {
            connection,
            attempt,
            spec,
            tokens: Some(tokens),
        }))))
    }
    pub(crate) fn finish(
        &self,
        scope: &Scope,
        pending: Pending,
        result: Result<TokenSet>,
    ) -> Result<ResolvedCredentials> {
        self.finish_fenced(scope, pending, result)
            .map(|(_, fields)| fields)
    }
    fn finish_fenced(
        &self,
        scope: &Scope,
        pending: Pending,
        result: Result<TokenSet>,
    ) -> Result<(Connection, ResolvedCredentials)> {
        let tokens = match result {
            Ok(tokens) => tokens,
            Err(_) => {
                self.store.lock().map_err(|_|Error::Persistence)?.transaction(|tx|{
    tx.lock_connection(scope,&pending.connection.id)?;
    tx.client().execute("UPDATE oauth_refresh_intents SET state='unknown',updated_at=now() WHERE project_id=$1 AND connection_id=$2 AND attempt_id=$3 AND state='dispatched'",&[&pending.connection.project_id,&pending.connection.id,&pending.attempt])?;Ok(())
   }).map_err(persistence)?;
                return Err(Error::OutcomeUnknown);
            }
        };
        let encoded = Zeroizing::new(tokens.encode()?);
        let secret = random_id("sec_")?;
        let connection=self.store.lock().map_err(|_|Error::Persistence)?.transaction(|tx|{
   let current=tx.lock_connection(scope,&pending.connection.id)?;
   let intent=tx.client().query_opt("SELECT attempt_id,secret_ref_id,state FROM oauth_refresh_intents WHERE project_id=$1 AND connection_id=$2 FOR UPDATE",&[&current.project_id,&current.id])?;
   let valid=intent.is_some_and(|row|row.get::<_,String>("attempt_id")==pending.attempt&&row.get::<_,String>("secret_ref_id")==pending.connection.secret_ref_id&&row.get::<_,String>("state")=="dispatched");
   if !valid||current.connector!=pending.connection.connector||current.external_account_id!=pending.connection.external_account_id||current.auth_type!=pending.connection.auth_type||current.secret_ref_id!=pending.connection.secret_ref_id||current.status!=Status::Degraded{return Ok(Err(Error::ConnectionUnavailable))}
   tx.store_secret(&current.project_id,&secret,&format!("oauth_tokens_{}",current.id),&encoded)?;
   let activated=tx.replace_credentials(scope,&current.id,&secret,AuthType::OAuth2)?;
   tx.client().execute("UPDATE oauth_refresh_intents SET state='completed',updated_at=now() WHERE project_id=$1 AND connection_id=$2 AND attempt_id=$3",&[&current.project_id,&current.id,&pending.attempt])?;
   Ok(Ok(activated))
  }).map_err(persistence)??;
        Ok((
            connection,
            ResolvedCredentials(BTreeMap::from([(
                "accessToken".into(),
                tokens.access_token.clone(),
            )])),
        ))
    }
}

struct ResolutionPolicy<'a> {
    expected_identity: Option<(&'a str, &'a str)>,
    health: bool,
    active: &'a dyn Fn() -> bool,
}
