//! Scoped process-local connector setup; provider calls never hold the state mutex.
use super::{oauth::MemoryOAuth, MemoryError, MemoryRepository};
use appcall_setup::{
    collect_fields, Credentials, Error, Result, RunnerValidator, SetupDescription, StartResult,
};
use appcall_store::{AuthType, Connection, CredentialOwner, Status, TestStatus};
use std::{collections::BTreeMap, sync::Arc};
use zeroize::Zeroizing;

#[derive(Clone)]
pub struct MemorySetup {
    pub(crate) repository: MemoryRepository,
    validator: Option<Arc<RunnerValidator>>,
    oauth: Arc<MemoryOAuth>,
}
pub(crate) fn memory_error(error: MemoryError) -> Error {
    match error {
        MemoryError::NotFound | MemoryError::Forbidden => Error::NotFound,
        MemoryError::Conflict => Error::Conflict,
        MemoryError::Invalid => Error::InvalidInput,
        MemoryError::Capacity | MemoryError::Unavailable => Error::Persistence,
    }
}
pub(crate) fn active(check: &dyn Fn() -> bool) -> Result<()> {
    if check() {
        Ok(())
    } else {
        Err(Error::Cancelled)
    }
}
fn credential_resolution_error(error: Error) -> Error {
    match error {
        Error::OAuth(cause) => appcall_setup::CredentialResolutionFailure::from_oauth_error(cause)
            .map(Error::CredentialResolutionFailed)
            .unwrap_or(Error::OAuth(cause)),
        other => other,
    }
}
pub(crate) fn scope(project: &str, account: Option<&str>) -> Result<()> {
    if project.is_empty()
        || project.len() > 128
        || project.chars().any(char::is_control)
        || account.is_some_and(|a| a.len() > 128 || a.chars().any(char::is_control))
    {
        Err(Error::InvalidInput)
    } else {
        Ok(())
    }
}
pub(crate) fn new_connection(
    project: &str,
    account: Option<&str>,
    connector: &str,
    auth: AuthType,
) -> Connection {
    let account = account.unwrap_or_default();
    Connection {
        id: format!("conn_{}", uuid::Uuid::new_v4().simple()),
        project_id: project.into(),
        connector: connector.into(),
        auth_type: auth,
        status: Status::Active,
        secret_ref_id: String::new(),
        last_test_status: TestStatus::Unknown,
        external_account_id: account.into(),
        credential_owner: if account.is_empty() {
            CredentialOwner::Platform
        } else {
            CredentialOwner::Brand
        },
    }
}
impl MemorySetup {
    pub fn new(
        repository: MemoryRepository,
        validator: Option<Arc<RunnerValidator>>,
        oauth: Arc<MemoryOAuth>,
    ) -> Self {
        Self {
            repository,
            validator,
            oauth,
        }
    }
    pub fn oauth(&self) -> &Arc<MemoryOAuth> {
        &self.oauth
    }
    pub fn describe(&self, connector: &str) -> Result<SetupDescription> {
        let manifest = self
            .repository
            .state
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
    pub fn get(&self, project: &str, account: Option<&str>, id: &str) -> Result<Connection> {
        scope(project, account)?;
        self.repository
            .get_connection(project, account, id)
            .map(|(c, _)| c)
            .map_err(memory_error)
    }
    pub fn list(&self, project: &str, account: Option<&str>) -> Result<Vec<Connection>> {
        scope(project, account)?;
        self.repository
            .list_connections(project, account)
            .map_err(memory_error)
    }
    pub fn submit_checked(
        &self,
        project: &str,
        account: Option<&str>,
        connector: &str,
        route: &str,
        fields: &BTreeMap<String, String>,
        check: &dyn Fn() -> bool,
    ) -> Result<Connection> {
        self.save(
            project, account, None, true, connector, route, fields, check,
        )
    }
    #[allow(clippy::too_many_arguments)]
    pub fn submit_new_checked(
        &self,
        project: &str,
        account: Option<&str>,
        connector: &str,
        route: &str,
        fields: &BTreeMap<String, String>,
        check: &dyn Fn() -> bool,
    ) -> Result<Connection> {
        self.save(
            project, account, None, false, connector, route, fields, check,
        )
    }
    #[allow(clippy::too_many_arguments)]
    pub fn update_checked(
        &self,
        project: &str,
        account: Option<&str>,
        id: &str,
        connector: &str,
        route: &str,
        fields: &BTreeMap<String, String>,
        check: &dyn Fn() -> bool,
    ) -> Result<Connection> {
        self.save(
            project,
            account,
            Some(id),
            false,
            connector,
            route,
            fields,
            check,
        )
    }
    #[allow(clippy::too_many_arguments)]
    fn save(
        &self,
        project: &str,
        account: Option<&str>,
        existing: Option<&str>,
        reuse_existing: bool,
        connector: &str,
        route: &str,
        fields: &BTreeMap<String, String>,
        check: &dyn Fn() -> bool,
    ) -> Result<Connection> {
        active(check)?;
        scope(project, account)?;
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
            if !route.is_empty() || !fields.is_empty() {
                return Err(Error::InvalidInput);
            }
            Credentials::from_fields(BTreeMap::new())?
        };
        let selected = match existing {
            Some(id) => Some(
                self.repository
                    .get_connection(project, account, id)
                    .map_err(memory_error)?,
            ),
            None if reuse_existing => self
                .list(project, account)?
                .into_iter()
                .find(|c| {
                    c.connector == connector && c.external_account_id == account.unwrap_or_default()
                })
                .map(|c| {
                    self.repository
                        .get_connection(project, account, &c.id)
                        .map_err(memory_error)
                })
                .transpose()?,
            None => None,
        };
        if selected.as_ref().is_some_and(|(c, _)| {
            c.connector != connector || c.external_account_id != account.unwrap_or_default()
        }) {
            return Err(Error::NotFound);
        }
        // A save must not replace credentials owned by an in-flight authorization.
        if selected
            .as_ref()
            .is_some_and(|(c, _)| c.status == Status::Authorizing)
        {
            return Err(Error::Conflict);
        }
        active(check)?;
        if credentialed {
            if let Some(validator) = &self.validator {
                let _effect = self.repository.effect_guard(check).map_err(memory_error)?;
                validator.check_checked(project, connector, &credentials, check)?;
            }
        }
        active(check)?;
        let encoded = Zeroizing::new(
            serde_json::to_vec(credentials.fields()).map_err(|_| Error::InvalidInput)?,
        );
        let secret = credentialed.then_some(("connector_setup_bundle", encoded.as_slice()));
        let result = if let Some((mut c, revision)) = selected {
            c.auth_type = auth;
            c.status = Status::Active;
            c.last_test_status = TestStatus::Unknown;
            self.repository
                .replace_connection_checked(project, account, revision, c, secret, check)
        } else if reuse_existing {
            self.repository.create_or_reuse_connection_checked(
                new_connection(project, account, connector, auth),
                secret,
                check,
            )
        } else {
            self.repository.create_connection_checked(
                new_connection(project, account, connector, auth),
                secret,
                check,
            )
        };
        result.map_err(|e| {
            if check() {
                memory_error(e)
            } else {
                Error::Cancelled
            }
        })
    }
    pub fn disconnect_checked(
        &self,
        project: &str,
        account: Option<&str>,
        id: &str,
        check: &dyn Fn() -> bool,
    ) -> Result<Connection> {
        active(check)?;
        scope(project, account)?;
        let (mut c, revision) = self
            .repository
            .get_connection(project, account, id)
            .map_err(memory_error)?;
        c.status = Status::Disconnected;
        self.repository
            .replace_connection_checked(project, account, revision, c, None, check)
            .map_err(|e| {
                if check() {
                    memory_error(e)
                } else {
                    Error::Cancelled
                }
            })
    }
    pub fn test_checked(
        &self,
        project: &str,
        account: Option<&str>,
        id: &str,
        check: &dyn Fn() -> bool,
    ) -> Result<Connection> {
        active(check)?;
        scope(project, account)?;
        let Some(validator) = &self.validator else {
            return self.get(project, account, id);
        };
        let (mut c, revision, credentials) = self
            .oauth
            .resolve_checked_versioned(project, account, id, check)
            .map_err(credential_resolution_error)?;
        if c.status == Status::Disconnected || c.status == Status::Authorizing {
            return Err(Error::Conflict);
        }
        let outcome = {
            let _effect = self.repository.effect_guard(check).map_err(memory_error)?;
            validator.health_checked(&c.connector, &credentials, check)
        };
        active(check)?;
        match &outcome {
            Ok(result) if result.status == "ok" && result.source == "provider" => {
                c.last_test_status = TestStatus::Passed
            }
            Ok(result) if result.status == "ok" => c.last_test_status = TestStatus::Unknown,
            Ok(_) => {
                c.last_test_status = TestStatus::Failed;
                c.status = Status::Degraded;
            }
            Err(_) => c.status = Status::Degraded,
        }
        // The checked compare-and-replace fences reconnect during provider validation.
        let saved = self
            .repository
            .replace_connection_checked(project, account, revision, c, None, check)
            .map_err(memory_error)?;
        outcome?;
        Ok(saved)
    }

    pub fn start_checked(
        &self,
        project: &str,
        account: Option<&str>,
        connector: &str,
        existing: Option<&str>,
        check: &dyn Fn() -> bool,
    ) -> Result<StartResult> {
        active(check)?;
        scope(project, account)?;
        if self.describe(connector)?.setup.mode != "oauth2" {
            return Err(Error::Unsupported);
        }
        self.oauth
            .start_checked(project, account, connector, existing, check)
    }
    pub fn callback_checked(
        &self,
        connector: &str,
        project: Option<&str>,
        code: &str,
        state: &str,
        check: &dyn Fn() -> bool,
    ) -> Result<Connection> {
        self.oauth
            .callback_checked(connector, project, code, state, check)
    }
    pub fn local_callback_checked(
        &self,
        connector: &str,
        id: &str,
        check: &dyn Fn() -> bool,
    ) -> Result<Connection> {
        self.oauth.local_callback_checked(connector, id, check)
    }
}
