use crate::*;
use appcall_connectors::{Registry, SetupConfig};
use appcall_oauth::{Lifecycle, ResolvedCredentials};
use appcall_store::{AuthType, Connection, CredentialOwner, Scope, Status, Store, TestStatus};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use std::{
    collections::BTreeMap,
    sync::{Arc, Mutex},
};
use zeroize::Zeroizing;
#[derive(Clone)]
pub struct SetupScope {
    project: String,
    account: String,
    scope: Scope,
}
impl SetupScope {
    pub fn new(project: &str, account: Option<&str>) -> Result<Self> {
        if project.len() > 128 || account.is_some_and(|s| s.len() > 128) {
            return Err(Error::InvalidInput);
        }
        Ok(Self {
            project: project.into(),
            account: account.unwrap_or("").into(),
            scope: Scope::new(project, account)?,
        })
    }
}
pub trait Validator: Send + Sync {
    fn validate(&self, project: &str, connector: &str, credentials: &Credentials) -> Result<()>;
    fn validate_checked(
        &self,
        project: &str,
        connector: &str,
        credentials: &Credentials,
        active: &dyn Fn() -> bool,
    ) -> Result<()> {
        check_active(active)?;
        self.validate(project, connector, credentials)?;
        check_active(active)
    }
}
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetupDescription {
    pub connector: String,
    pub auth_type: String,
    #[serde(flatten)]
    pub setup: SetupConfig,
}
pub struct StartResult {
    pub connection: Connection,
    pub authorization_url: String,
}
pub struct Service {
    store: Arc<Mutex<Store>>,
    registry: Arc<Registry>,
    oauth: Arc<Lifecycle>,
    validator: Arc<dyn Validator>,
}
#[derive(Clone, Copy)]
enum SaveTarget<'a> {
    Existing(&'a str),
    ReuseExisting,
    New,
}
fn id(prefix: &str) -> Result<String> {
    let mut bytes = [0; 24];
    getrandom::fill(&mut bytes).map_err(|_| Error::Persistence)?;
    Ok(format!("{prefix}_{}", URL_SAFE_NO_PAD.encode(bytes)))
}
fn check_active(active: &dyn Fn() -> bool) -> Result<()> {
    if active() {
        Ok(())
    } else {
        Err(Error::Cancelled)
    }
}
fn check_store_active(active: &dyn Fn() -> bool) -> std::result::Result<(), appcall_store::Error> {
    if active() {
        Ok(())
    } else {
        Err(appcall_store::Error::Conflict)
    }
}
impl Service {
    pub fn database_health(&self) -> Option<bool> {
        let store = match self.store.try_lock() {
            Ok(store) => store.database_health(),
            Err(std::sync::TryLockError::WouldBlock) => None,
            Err(std::sync::TryLockError::Poisoned(_)) => Some(false),
        };
        let states = [store, self.oauth.database_health()];
        if states.contains(&Some(false)) {
            Some(false)
        } else if states.contains(&None) {
            None
        } else {
            Some(true)
        }
    }
    pub fn get(&self, scope: &SetupScope, id: &str) -> Result<Connection> {
        self.store
            .lock()
            .map_err(|_| Error::Persistence)?
            .get(&scope.scope, id)
            .map_err(Into::into)
    }
    pub fn list(&self, scope: &SetupScope) -> Result<Vec<Connection>> {
        self.store
            .lock()
            .map_err(|_| Error::Persistence)?
            .list(&scope.scope)
            .map_err(Into::into)
    }
    pub fn disconnect(&self, scope: &SetupScope, id: &str) -> Result<Connection> {
        self.store
            .lock()
            .map_err(|_| Error::Persistence)?
            .transaction(|tx| {
                tx.lock_connection(&scope.scope, id)?;
                tx.update_status(&scope.scope, id, Status::Disconnected)
            })
            .map_err(Error::from)
    }

    pub fn new(
        store: Arc<Mutex<Store>>,
        registry: Arc<Registry>,
        oauth: Arc<Lifecycle>,
        validator: Arc<dyn Validator>,
    ) -> Self {
        Self {
            store,
            registry,
            oauth,
            validator,
        }
    }
    pub fn describe(&self, connector: &str) -> Result<SetupDescription> {
        let manifest = self
            .registry
            .public_connector(connector)
            .map_err(|_| Error::NotFound)?
            .manifest();
        Ok(SetupDescription {
            connector: manifest.key.clone(),
            auth_type: manifest.auth.type_.clone(),
            setup: manifest.auth.setup.clone(),
        })
    }
    pub fn submit(
        &self,
        scope: &SetupScope,
        connector: &str,
        route: &str,
        fields: &BTreeMap<String, String>,
    ) -> Result<Connection> {
        self.submit_checked(scope, connector, route, fields, &|| true)
    }
    pub fn submit_checked(
        &self,
        scope: &SetupScope,
        connector: &str,
        route: &str,
        fields: &BTreeMap<String, String>,
        active: &dyn Fn() -> bool,
    ) -> Result<Connection> {
        self.save(
            scope,
            SaveTarget::ReuseExisting,
            connector,
            route,
            fields,
            active,
        )
    }
    pub fn submit_new(
        &self,
        scope: &SetupScope,
        connector: &str,
        route: &str,
        fields: &BTreeMap<String, String>,
    ) -> Result<Connection> {
        self.submit_new_checked(scope, connector, route, fields, &|| true)
    }
    /// Create a new connection even when the same connector/account already
    /// exists. Browser setup uses this when no connection id was selected;
    /// replacement requires an explicit id via `update_checked`.
    pub fn submit_new_checked(
        &self,
        scope: &SetupScope,
        connector: &str,
        route: &str,
        fields: &BTreeMap<String, String>,
        active: &dyn Fn() -> bool,
    ) -> Result<Connection> {
        self.save(scope, SaveTarget::New, connector, route, fields, active)
    }
    pub fn update(
        &self,
        scope: &SetupScope,
        id: &str,
        connector: &str,
        route: &str,
        fields: &BTreeMap<String, String>,
    ) -> Result<Connection> {
        self.update_checked(scope, id, connector, route, fields, &|| true)
    }
    pub fn update_checked(
        &self,
        scope: &SetupScope,
        id: &str,
        connector: &str,
        route: &str,
        fields: &BTreeMap<String, String>,
        active: &dyn Fn() -> bool,
    ) -> Result<Connection> {
        self.save(
            scope,
            SaveTarget::Existing(id),
            connector,
            route,
            fields,
            active,
        )
    }
    fn save(
        &self,
        scope: &SetupScope,
        target: SaveTarget<'_>,
        connector: &str,
        route: &str,
        fields: &BTreeMap<String, String>,
        active: &dyn Fn() -> bool,
    ) -> Result<Connection> {
        check_active(active)?;
        let description = self.describe(connector)?;
        let credentialed = description.setup.mode == "api_key";
        let auth = if credentialed || description.auth_type == "none" {
            AuthType::ApiKey
        } else if description.setup.mode == "external_bearer" {
            AuthType::ExternalBearer
        } else {
            return Err(Error::Unsupported);
        };
        let credentials = if credentialed {
            collect_fields(&description.setup, route, fields)?
        } else {
            if !fields.is_empty() || !route.is_empty() {
                return Err(Error::InvalidInput);
            }
            Credentials(BTreeMap::new())
        };
        // Scope validation precedes external validation; persistence repeats under lock.
        if let SaveTarget::Existing(existing) = target {
            self.store
                .lock()
                .map_err(|_| Error::Persistence)?
                .transaction(|tx| {
                    check_store_active(active)?;
                    let current = tx.lock_connection(&scope.scope, existing)?;
                    check_store_active(active)?;
                    if current.connector != connector {
                        return Err(appcall_store::Error::NotFound);
                    }
                    Ok(())
                })?;
        }
        check_active(active)?;
        if credentialed {
            self.validator
                .validate_checked(&scope.project, connector, &credentials, active)?;
        }
        check_active(active)?;
        let secret = if credentials.0.is_empty() {
            String::new()
        } else {
            id("sec")?
        };
        let encoded =
            Zeroizing::new(serde_json::to_vec(&credentials.0).map_err(|_| Error::InvalidInput)?);
        let new_id = id("conn")?;
        self.store.lock().map_err(|_|Error::Persistence)?.transaction(|tx|{
   check_store_active(active)?;
   // A missing row cannot be locked. Serialize creation by owner identity, too.
   let identity=serde_json::to_string(&(&scope.project,connector,&scope.account)).map_err(|_|appcall_store::Error::Invalid)?;
   tx.client().query_one("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",&[&identity])?;
   check_store_active(active)?;
   let target=match target{SaveTarget::Existing(id)=>Some(id.to_owned()),SaveTarget::ReuseExisting=>tx.client().query_opt("SELECT id FROM connections WHERE project_id=$1 AND connector=$2 AND COALESCE(external_account_id,'')=$3 ORDER BY created_at DESC,id LIMIT 1 FOR UPDATE",&[&scope.project,&connector,&scope.account])?.map(|r|r.get::<_,String>(0)),SaveTarget::New=>None};
   if let Some(target)=&target{let current=tx.lock_connection(&scope.scope,target)?;if current.connector!=connector{return Err(appcall_store::Error::NotFound)}}
   check_store_active(active)?;
   if !secret.is_empty(){tx.store_secret(&scope.project,&secret,"connector_setup_bundle",&encoded)?;}
   let saved = match target{Some(target)=>tx.replace_credentials(&scope.scope,&target,&secret,auth),None=>tx.create(&scope.scope,&Connection{id:new_id.clone(),project_id:scope.project.clone(),connector:connector.into(),auth_type:auth,status:Status::Active,secret_ref_id:secret.clone(),last_test_status:TestStatus::Unknown,external_account_id:scope.account.clone(),credential_owner:if scope.account.is_empty(){CredentialOwner::Platform}else{CredentialOwner::Brand}})}?;
   check_store_active(active)?;
   Ok(saved)
  }).map_err(|error| if active() {error.into()} else {Error::Cancelled})
    }
    pub fn start(
        &self,
        scope: &SetupScope,
        connector: &str,
        existing: Option<&str>,
    ) -> Result<StartResult> {
        self.start_checked(scope, connector, existing, &|| true)
    }
    pub fn start_checked(
        &self,
        scope: &SetupScope,
        connector: &str,
        existing: Option<&str>,
        active: &dyn Fn() -> bool,
    ) -> Result<StartResult> {
        check_active(active)?;
        if self.describe(connector)?.setup.mode != "oauth2" {
            return Err(Error::Unsupported);
        }
        let connection = match existing {
            Some(id) => self
                .store
                .lock()
                .map_err(|_| Error::Persistence)?
                .transaction(|tx| {
                    check_store_active(active)?;
                    let c = tx.lock_connection(&scope.scope, id)?;
                    check_store_active(active)?;
                    if c.connector != connector {
                        return Err(appcall_store::Error::NotFound);
                    }
                    Ok(c)
                })?,
            None => {
                let c = Connection {
                    id: id("conn")?,
                    project_id: scope.project.clone(),
                    connector: connector.into(),
                    auth_type: AuthType::OAuth2,
                    status: Status::Disconnected,
                    secret_ref_id: String::new(),
                    last_test_status: TestStatus::Unknown,
                    external_account_id: scope.account.clone(),
                    credential_owner: if scope.account.is_empty() {
                        CredentialOwner::Platform
                    } else {
                        CredentialOwner::Brand
                    },
                };
                self.store
                    .lock()
                    .map_err(|_| Error::Persistence)?
                    .transaction(|tx| {
                        check_store_active(active)?;
                        let c = tx.create(&scope.scope, &c)?;
                        check_store_active(active)?;
                        Ok(c)
                    })?
            }
        };
        check_active(active)?;
        let result = self
            .oauth
            .start_checked(&scope.scope, &connection.id, connector, active)
            .map_err(Error::OAuth)?;
        let connection = self
            .store
            .lock()
            .map_err(|_| Error::Persistence)?
            .get(&scope.scope, &connection.id)?;
        Ok(StartResult {
            connection,
            authorization_url: result.authorization_url,
        })
    }
    pub fn callback(
        &self,
        connector: &str,
        project: Option<&str>,
        code: &str,
        state: &str,
    ) -> Result<ResolvedCredentials> {
        self.callback_checked(connector, project, code, state, &|| true)
    }
    pub fn callback_checked(
        &self,
        connector: &str,
        project: Option<&str>,
        code: &str,
        state: &str,
        active: &dyn Fn() -> bool,
    ) -> Result<ResolvedCredentials> {
        self.oauth
            .callback_checked(connector, project, code, state, active)
            .map_err(Error::OAuth)
    }
}
