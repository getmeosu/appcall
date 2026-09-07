use crate::InfrastructureError;
use serde::Serialize;
use std::{collections::BTreeMap, sync::Mutex};
#[derive(Clone, Debug, Serialize)]
pub struct ToolUsageCount {
    pub connector: String,
    pub tool: String,
    pub count: i64,
}
pub trait UsageRecorder: Send + Sync {
    fn record(
        &self,
        project: &str,
        account: &str,
        connector: &str,
        tool: &str,
    ) -> Result<(), InfrastructureError>;
}
impl UsageRecorder for () {
    fn record(&self, _: &str, _: &str, _: &str, _: &str) -> Result<(), InfrastructureError> {
        Ok(())
    }
}
type UsageKey = (String, String, String, String);
/// Compatibility counter for per-brand visibility; project billing remains durable
/// in the action service. Hosts can inject a persistent UsageRecorder instead.
#[derive(Default)]
pub struct MemoryUsage {
    counts: Mutex<BTreeMap<UsageKey, i64>>,
}
impl MemoryUsage {
    pub fn list(
        &self,
        project: &str,
        account: &str,
    ) -> Result<Vec<ToolUsageCount>, InfrastructureError> {
        Ok(self
            .counts
            .lock()
            .map_err(|_| InfrastructureError)?
            .iter()
            .filter(|((p, a, _, _), _)| p == project && a == account)
            .map(|((_, _, c, t), n)| ToolUsageCount {
                connector: c.clone(),
                tool: t.clone(),
                count: *n,
            })
            .collect())
    }
}
impl UsageRecorder for MemoryUsage {
    fn record(&self, p: &str, a: &str, c: &str, t: &str) -> Result<(), InfrastructureError> {
        let mut counts = self.counts.lock().map_err(|_| InfrastructureError)?;
        let count = counts
            .entry((p.into(), a.into(), c.into(), t.into()))
            .or_default();
        *count = count.saturating_add(1);
        Ok(())
    }
}
