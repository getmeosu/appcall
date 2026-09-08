//! Explicit development-only OAuth simulation. Managed OAuth never calls this path.
//! Host calls these synchronous methods on its bounded blocking executor. This
//! adapter writes no tokens and cannot activate a connection carrying credentials.
use crate::{ApiError, Identity, RawResponse, Request, Result};
use appcall_connectors::Registry;
use appcall_store::{AuthType, Connection, CredentialOwner, Scope, Status, Store, TestStatus};
use std::{
    collections::{BTreeMap, BTreeSet},
    sync::{Arc, Mutex},
};
pub type LocalStart = appcall_setup::StartResult;
#[derive(Clone)]
pub struct DevOAuth {
    production: bool,
    project: String,
    store: Arc<Mutex<Store>>,
    registry: Arc<Registry>,
    managed: BTreeSet<String>,
}
impl DevOAuth {
    pub fn database_health(&self) -> Option<bool> {
        match self.store.try_lock() {
            Ok(store) => store.database_health(),
            Err(std::sync::TryLockError::WouldBlock) => None,
            Err(std::sync::TryLockError::Poisoned(_)) => Some(false),
        }
    }
    pub fn new(
        production: bool,
        project: &str,
        store: Arc<Mutex<Store>>,
        registry: Arc<Registry>,
        managed: BTreeSet<String>,
    ) -> Result<Self> {
        if project.trim().is_empty() {
            return Err(ApiError::new("INVALID_CONFIGURATION"));
        }
        Ok(Self {
            production,
            project: project.into(),
            store,
            registry,
            managed,
        })
    }
    fn available(&self, connector: &str) -> bool {
        !self.production
            && !self.managed.contains(connector)
            && valid_key(connector)
            && self
                .registry
                .public_connector(connector)
                .is_ok_and(|c| c.manifest().auth.setup.mode == "oauth2")
    }
    /// None delegates to the normal signed OAuth setup; errors never fall back.
    pub fn start(
        &self,
        identity: &Identity,
        connector: &str,
        existing: Option<&str>,
    ) -> Result<Option<LocalStart>> {
        self.start_checked(identity, connector, existing, &|| true)
    }
    pub fn start_checked(
        &self,
        identity: &Identity,
        connector: &str,
        existing: Option<&str>,
        active: &dyn Fn() -> bool,
    ) -> Result<Option<LocalStart>> {
        if !active() {
            return Err(ApiError::new("SERVICE_BUSY"));
        }
        if !self.available(connector) {
            return Ok(None);
        }
        if identity.project_id != self.project {
            return Err(ApiError::new("FORBIDDEN"));
        }
        let scope = Scope::new(
            &self.project,
            (!identity.account_id.is_empty()).then_some(identity.account_id.as_str()),
        )
        .map_err(store_error)?;
        let connection = self
            .store
            .lock()
            .map_err(|_| ApiError::new("STORAGE_UNAVAILABLE"))?
            .transaction(|tx| {
                if !active() {
                    return Err(appcall_store::Error::Invalid);
                }
                if let Some(id) = existing {
                    let c = tx.lock_connection(&scope, id)?;
                    if !active() {
                        return Err(appcall_store::Error::Invalid);
                    }
                    if c.connector != connector
                        || c.auth_type != AuthType::OAuth2
                        || !c.secret_ref_id.is_empty()
                        || c.external_account_id != identity.account_id
                    {
                        return Err(appcall_store::Error::NotFound);
                    }
                    let result = tx.update_status(&scope, id, Status::Authorizing)?;
                    if !active() {
                        return Err(appcall_store::Error::Invalid);
                    }
                    return Ok(result);
                }
                let result = tx.create(
                    &scope,
                    &Connection {
                        id: format!("conn_dev_{}", uuid::Uuid::new_v4().simple()),
                        project_id: self.project.clone(),
                        connector: connector.into(),
                        auth_type: AuthType::OAuth2,
                        status: Status::Authorizing,
                        secret_ref_id: String::new(),
                        last_test_status: TestStatus::Unknown,
                        external_account_id: identity.account_id.clone(),
                        credential_owner: if identity.account_id.is_empty() {
                            CredentialOwner::Platform
                        } else {
                            CredentialOwner::Brand
                        },
                    },
                )?;
                if !active() {
                    return Err(appcall_store::Error::Invalid);
                }
                Ok(result)
            })
            .map_err(store_error)?;
        let query = url::form_urlencoded::Serializer::new(String::new())
            .append_pair("connector", connector)
            .append_pair("connectionId", &connection.id)
            .finish();
        Ok(Some(LocalStart {
            connection,
            authorization_url: format!("/oauth/local/authorize?{query}"),
        }))
    }
    /// Hosts register this exact route only for explicit development operation.
    /// Fixed project binding comes from construction, never from callback query.
    pub fn handle(&self, request: &Request) -> Result<Option<RawResponse>> {
        self.handle_checked(request, &|| true)
    }
    pub fn handle_checked(
        &self,
        request: &Request,
        active: &dyn Fn() -> bool,
    ) -> Result<Option<RawResponse>> {
        if !active() {
            return Err(ApiError::new("SERVICE_BUSY"));
        }
        if self.production
            || request.method != "GET"
            || request.uri.split('?').next() != Some("/oauth/local/authorize")
        {
            return Ok(None);
        }
        if request.uri.len() > 4096 || !request.body.is_empty() {
            return Err(ApiError::new("INVALID_REQUEST"));
        }
        let url = url::Url::parse(&format!("http://local.invalid{}", request.uri))
            .map_err(|_| ApiError::new("INVALID_REQUEST"))?;
        let mut query = BTreeMap::new();
        for (key, value) in url.query_pairs() {
            if !matches!(key.as_ref(), "connector" | "connectionId")
                || query.insert(key.into_owned(), value.into_owned()).is_some()
            {
                return Err(ApiError::new("INVALID_REQUEST"));
            }
        }
        let connector = query
            .get("connector")
            .filter(|s| valid_key(s))
            .ok_or_else(|| ApiError::new("INVALID_REQUEST"))?;
        let id = query
            .get("connectionId")
            .filter(|s| !s.is_empty() && s.len() <= 256 && !s.chars().any(char::is_control))
            .ok_or_else(|| ApiError::new("INVALID_REQUEST"))?;
        if !self.available(connector) {
            return Err(ApiError::new("CONNECTION_NOT_FOUND"));
        }
        let scope = Scope::new(&self.project, None).map_err(store_error)?;
        self.store
            .lock()
            .map_err(|_| ApiError::new("STORAGE_UNAVAILABLE"))?
            .transaction(|tx| {
                let c = tx.lock_connection(&scope, id)?;
                if !active() {
                    return Err(appcall_store::Error::Invalid);
                }
                if c.connector != *connector
                    || c.auth_type != AuthType::OAuth2
                    || c.status != Status::Authorizing
                    || !c.secret_ref_id.is_empty()
                {
                    return Err(appcall_store::Error::NotFound);
                }
                tx.update_status(&scope, id, Status::Active)?;
                if !active() {
                    return Err(appcall_store::Error::Invalid);
                }
                Ok(())
            })
            .map_err(store_error)?;
        Ok(Some(RawResponse {
            status: 302,
            body: vec![],
            headers: vec![
                (
                    "location".into(),
                    format!("/app/connectors/{connector}?success=1"),
                ),
                ("cache-control".into(), "no-store".into()),
            ],
        }))
    }
}
fn valid_key(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 64
        && s.bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}
fn store_error(error: appcall_store::Error) -> ApiError {
    ApiError::new(match error {
        appcall_store::Error::NotFound => "CONNECTION_NOT_FOUND",
        appcall_store::Error::Invalid => "INVALID_REQUEST",
        _ => "STORAGE_UNAVAILABLE",
    })
}
