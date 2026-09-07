use crate::*;
use appcall_actions::{
    ActionCatalog, ActionRepository, ActionRunner, CredentialResolver, PolicyGate,
};
use std::sync::{Arc, Mutex};
impl<
        R: ActionRepository,
        C: ActionCatalog,
        V: CredentialResolver,
        D: ActionRunner,
        P: PolicyGate,
    > ActionExecutor for appcall_actions::Service<R, C, V, D, P>
{
    async fn execute(
        &self,
        request: appcall_actions::ExecuteRequest,
    ) -> appcall_actions::Result<appcall_actions::ExecuteResult> {
        appcall_actions::Service::execute(self, request).await
    }
}
/// Shares the host's PostgreSQL client; does not load any credential columns.
pub struct PgConnections {
    client: Arc<Mutex<postgres::Client>>,
}
impl PgConnections {
    pub fn database_health(&self) -> Option<bool> {
        match self.client.try_lock() {
            Ok(client) => Some(!client.is_closed()),
            Err(std::sync::TryLockError::WouldBlock) => None,
            Err(std::sync::TryLockError::Poisoned(_)) => Some(false),
        }
    }
    pub fn new(client: Arc<Mutex<postgres::Client>>) -> Self {
        Self { client }
    }
}
impl ConnectionLister for PgConnections {
    fn database_health(&self) -> Option<bool> {
        PgConnections::database_health(self)
    }
    async fn list(&self, project: &str) -> Result<Vec<Connection>, InfrastructureError> {
        let client = self.client.clone();
        let project = project.to_owned();
        tokio::task::spawn_blocking(move || {
        client.lock().map_err(|_|InfrastructureError)?
            .query("SELECT id, project_id, COALESCE(external_account_id,''), connector, status FROM connections WHERE project_id=$1 ORDER BY id", &[&project])
            .map_err(|_|InfrastructureError)?.into_iter().map(|r|{
                Ok(Connection{id:r.try_get(0).map_err(|_|InfrastructureError)?,project_id:r.try_get(1).map_err(|_|InfrastructureError)?,external_account_id:r.try_get(2).map_err(|_|InfrastructureError)?,connector:r.try_get(3).map_err(|_|InfrastructureError)?,status:r.try_get(4).map_err(|_|InfrastructureError)?})
            }).collect()
        }).await.map_err(|_|InfrastructureError)?
    }
}
impl<T: ActionExecutor> ActionExecutor for Arc<T> {
    async fn execute(
        &self,
        r: appcall_actions::ExecuteRequest,
    ) -> appcall_actions::Result<appcall_actions::ExecuteResult> {
        self.as_ref().execute(r).await
    }
}
impl<T: ConnectionLister> ConnectionLister for Arc<T> {
    fn database_health(&self) -> Option<bool> {
        (**self).database_health()
    }
    async fn list(&self, p: &str) -> Result<Vec<Connection>, InfrastructureError> {
        self.as_ref().list(p).await
    }
}
impl<T: UsageRecorder> UsageRecorder for Arc<T> {
    fn record(&self, p: &str, a: &str, c: &str, t: &str) -> Result<(), InfrastructureError> {
        self.as_ref().record(p, a, c, t)
    }
}
