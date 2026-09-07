//! Development-only policy: environment usage limits apply. SQL-only send/spend
//! and LinkedIn counters are deliberately absent, matching Go memory mode.
use super::{usage::usage_snapshot, MemoryRepository};
use appcall_actions::*;
use serde_json::Value;
#[derive(Clone)]
pub struct DevelopmentPolicy {
    repository: MemoryRepository,
    config: PolicyConfig,
}
impl DevelopmentPolicy {
    pub fn new(repository: MemoryRepository, config: PolicyConfig) -> Result<Self> {
        if config.send_cost_micros < 0 {
            return Err(ActionError::new("CONNECTOR_UNAVAILABLE"));
        }
        resolve_entitlements(None, &config.defaults)?;
        repository.configure_usage(config.defaults.clone())?;
        Ok(Self { repository, config })
    }
}
impl PolicyGate for DevelopmentPolicy {
    async fn authorize(&self, r: &ExecuteRequest, c: &Connection, _: &Operation) -> Result<()> {
        if c.project_id != r.project_id {
            return Err(ActionError::new("CONNECTION_NOT_FOUND"));
        }
        let data = self
            .repository
            .lock()
            .map_err(|_| ActionError::new("CONNECTOR_UNAVAILABLE"))?;
        let project = data
            .projects
            .get(&r.project_id)
            .ok_or_else(|| ActionError::new("CONNECTION_NOT_FOUND"))?;
        if project.disabled {
            return Err(ActionError::new("PROJECT_DISABLED"));
        }
        Ok(())
    }
    async fn prepare_input(
        &self,
        r: &ExecuteRequest,
        c: &Connection,
        input: Value,
    ) -> Result<Value> {
        if c.connector == "apollo" {
            return apollo_input(&self.config, &r.action, &r.project_id, &c.id, input);
        }
        if c.connector != "unipile" {
            return Ok(input);
        }
        let mut fields = input
            .as_object()
            .cloned()
            .ok_or_else(|| ActionError::new("INVALID_ACTION_INPUT"))?;
        fields.remove("account_id");
        if !appcall_actions::channel(&r.action).is_empty() {
            return Err(ActionError::new("MISSING_SUBACCOUNT"));
        }
        Ok(Value::Object(fields))
    }
    async fn reserve(
        &self,
        r: &ExecuteRequest,
        _: &Connection,
        _: &Operation,
        _: &Value,
    ) -> Result<PolicyReservation> {
        let data = self
            .repository
            .lock()
            .map_err(|_| ActionError::new("CONNECTOR_UNAVAILABLE"))?;
        let usage = usage_snapshot(&data, &r.project_id, 1, true)?;
        if usage.hard_limit > 0 && usage.projected > usage.hard_limit {
            let mut error = ActionError::new("USAGE_LIMIT_EXCEEDED");
            error.usage = Some(usage);
            return Err(error);
        }
        let mut reservation = PolicyReservation::default();
        reservation.usage = usage;
        Ok(reservation)
    }
}
