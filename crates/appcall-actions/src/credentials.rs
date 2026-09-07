use crate::*;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};

/// The service authorizes a connection before invoking this adapter. Platform
/// connections therefore resolve with project authority, owned ones with brand scope.
pub struct LifecycleCredentialResolver(pub Arc<appcall_oauth::Lifecycle>);
impl CredentialResolver for LifecycleCredentialResolver {
    fn database_health(&self) -> Option<bool> {
        self.0.database_health()
    }
    async fn resolve(&self, c: &Connection, caller: &str) -> Result<Map<String, Value>> {
        Ok(self.resolve_tracked(c, caller).await?.fields)
    }
    async fn resolve_tracked(
        &self,
        c: &Connection,
        caller: &str,
    ) -> Result<ResolvedActionCredentials> {
        if c.auth_type == "external_bearer" {
            return Ok(ResolvedActionCredentials {
                connection: c.clone(),
                fields: external_fields(caller)?,
            });
        }
        self.resolve_lifecycle(c, false).await
    }
    async fn resolve_health_tracked(&self, c: &Connection) -> Result<ResolvedActionCredentials> {
        if c.auth_type == "external_bearer" {
            return Ok(ResolvedActionCredentials {
                connection: c.clone(),
                fields: Map::new(),
            });
        }
        self.resolve_lifecycle(c, true).await
    }
}
impl LifecycleCredentialResolver {
    async fn resolve_lifecycle(
        &self,
        c: &Connection,
        health: bool,
    ) -> Result<ResolvedActionCredentials> {
        let lifecycle = self.0.clone();
        let connection = c.clone();
        let cancelled = Arc::new(AtomicBool::new(false));
        let _cancel_on_drop = CancelResolution(cancelled.clone());
        tokio::task::spawn_blocking(move || {
            let brand = (!connection.external_account_id.is_empty())
                .then_some(connection.external_account_id.as_str());
            let scope = appcall_store::Scope::new(&connection.project_id, brand)
                .map_err(|_| ActionError::new("CONNECTION_NOT_FOUND"))?;
            let (revision, credentials) = lifecycle
                .resolve_checked_fenced(
                    &scope,
                    &connection.id,
                    &connection.connector,
                    Some((&connection.external_account_id, &connection.auth_type)),
                    health,
                    &|| !cancelled.load(Ordering::Acquire),
                )
                .map_err(|_| ActionError::new("MISSING_CREDENTIAL"))?;
            let snapshot = Connection {
                id: revision.id,
                project_id: revision.project_id,
                external_account_id: revision.external_account_id,
                connector: revision.connector,
                status: revision.status.as_str().into(),
                auth_type: revision.auth_type.as_str().into(),
                secret_ref_id: (!revision.secret_ref_id.is_empty())
                    .then_some(revision.secret_ref_id),
            };
            Ok(ResolvedActionCredentials {
                connection: snapshot,
                fields: credentials.into_fields(),
            })
        })
        .await
        .map_err(|_| ActionError::new("MISSING_CREDENTIAL"))?
    }
}
struct CancelResolution(Arc<AtomicBool>);
impl Drop for CancelResolution {
    fn drop(&mut self) {
        self.0.store(true, Ordering::Release);
    }
}
fn external_fields(caller: &str) -> Result<Map<String, Value>> {
    let token = caller.trim();
    if token.is_empty() || token.len() > 64 * 1024 || token.chars().any(char::is_control) {
        return Err(ActionError::new("MISSING_CREDENTIAL"));
    }
    Ok(serde_json::json!({"accessToken":token})
        .as_object()
        .expect("object")
        .clone())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn external_bearer_never_falls_back_to_input_or_stored_token() {
        assert_eq!(external_fields("").unwrap_err().code, "MISSING_CREDENTIAL");
        assert!(external_fields("token\r\ninjected").is_err());
        assert_eq!(external_fields(" fresh ").unwrap()["accessToken"], "fresh");
    }
}
