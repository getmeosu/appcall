use crate::{Credentials, Error, Result, Validator};
use appcall_connectors::Registry;
use appcall_runner_client::{ActionExecuteRequest, RequestContext, RunnerClient};
use std::{
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};
/// Execute validation only from a blocking host executor, using its async runtime.
pub struct RunnerValidator {
    client: Arc<RunnerClient>,
    registry: Arc<Registry>,
    runtime: tokio::runtime::Handle,
}
impl RunnerValidator {
    pub fn new(
        client: Arc<RunnerClient>,
        registry: Arc<Registry>,
        runtime: tokio::runtime::Handle,
    ) -> Self {
        Self {
            client,
            registry,
            runtime,
        }
    }
}
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ValidationEvidence {
    LocalAccepted,
    ProviderVerified,
}
impl Validator for RunnerValidator {
    fn validate(&self, project: &str, connector: &str, credentials: &Credentials) -> Result<()> {
        self.check(project, connector, credentials).map(|_| ())
    }
    fn validate_checked(
        &self,
        project: &str,
        connector: &str,
        credentials: &Credentials,
        active: &dyn Fn() -> bool,
    ) -> Result<()> {
        self.check_checked(project, connector, credentials, active)
            .map(|_| ())
    }
}
impl RunnerValidator {
    /// Diagnostic reachability is distinct from accepting credentials during setup.
    pub fn health_checked(
        &self,
        connector: &str,
        credentials: &Credentials,
        active: &dyn Fn() -> bool,
    ) -> Result<appcall_runner_client::HealthcheckResponse> {
        if !active() {
            return Err(Error::Cancelled);
        }
        self.registry
            .public_connector(connector)
            .map_err(|_| Error::NotFound)?;
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|_| Error::ValidationFailed)?
            .as_millis();
        let context = RequestContext {
            request_id: format!("health_{now}"),
            deadline_unix_ms: Some(
                u64::try_from(now)
                    .map_err(|_| Error::ValidationFailed)?
                    .saturating_add(20000),
            ),
        };
        let input = serde_json::to_value(credentials.fields()).map_err(|_| Error::InvalidInput)?;
        let result = self.runtime.block_on(async {
            if !active() {
                return Err(Error::Cancelled);
            }
            self.client
                .healthcheck(&context, connector, input)
                .await
                .map_err(|_| Error::ValidationFailed)
        });
        if !active() {
            return Err(Error::Cancelled);
        }
        result
    }
    pub fn check(
        &self,
        project: &str,
        connector: &str,
        credentials: &Credentials,
    ) -> Result<ValidationEvidence> {
        self.check_checked(project, connector, credentials, &|| true)
    }
    pub fn check_checked(
        &self,
        _project: &str,
        connector: &str,
        credentials: &Credentials,
        active: &dyn Fn() -> bool,
    ) -> Result<ValidationEvidence> {
        let check = || {
            if active() {
                Ok(())
            } else {
                Err(Error::Cancelled)
            }
        };
        check()?;
        let manifest = self
            .registry
            .connector(connector)
            .map_err(|_| Error::NotFound)?
            .manifest();
        let has_validate = manifest.operations.contains_key("credentials.validate");
        let input = serde_json::to_value(credentials.fields()).map_err(|_| Error::InvalidInput)?;
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|_| Error::ValidationFailed)?
            .as_millis();
        let context = RequestContext {
            request_id: format!("setup_{now}"),
            deadline_unix_ms: Some(
                u64::try_from(now)
                    .map_err(|_| Error::ValidationFailed)?
                    .saturating_add(20000),
            ),
        };
        self.runtime.block_on(async {
            check()?;
            let response = self
                .client
                .healthcheck(&context, connector, input.clone())
                .await
                .map_err(|_| Error::ValidationFailed)?;
            check()?;
            if response.status != "ok" {
                return Err(Error::ValidationFailed);
            }
            if has_validate && !credentials.fields().is_empty() {
                let validation = self
                    .client
                    .action_execute(
                        &context,
                        ActionExecuteRequest {
                            connector_key: connector.into(),
                            action: "credentials.validate".into(),
                            input,
                        },
                    )
                    .await
                    .map_err(|_| Error::ValidationFailed)?;
                check()?;
                let output = validation
                    .output
                    .as_object()
                    .ok_or(Error::ValidationFailed)?;
                let flags = [output.get("valid"), output.get("ok")];
                if flags
                    .iter()
                    .flatten()
                    .any(|value| value.as_bool() != Some(true))
                    || !flags
                        .iter()
                        .flatten()
                        .any(|value| value.as_bool() == Some(true))
                {
                    return Err(Error::ValidationFailed);
                }
            }
            if response.source != "provider" && (!has_validate || credentials.fields().is_empty()) {
                return Err(Error::ValidationFailed);
            }
            Ok(if response.source == "provider" {
                ValidationEvidence::ProviderVerified
            } else {
                ValidationEvidence::LocalAccepted
            })
        })
    }
}
