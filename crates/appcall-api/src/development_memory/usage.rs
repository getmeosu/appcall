//! Atomic success-only usage accounting. In-flight dispatches reserve quota;
//! abandoned unknown dispatches retain it until process reset, never auto-retry.
use super::state::{MemoryData, UsageEvent, UsageReservation};
use appcall_actions::{ActionError, Attempt, Result, UsageSnapshot};
use chrono::Utc;
fn unavailable() -> ActionError {
    ActionError::new("CONNECTOR_UNAVAILABLE")
}
fn count(
    data: &MemoryData,
    project: &str,
    brand: Option<&str>,
    month: &str,
    kind: &str,
) -> Result<i64> {
    data.usage_monthly
        .iter()
        .filter(|((p, b, m, k), _)| {
            p == project && brand.is_none_or(|a| a == b) && m == month && k == kind
        })
        .try_fold(0_i64, |sum, (_, n)| {
            sum.checked_add(*n).ok_or_else(unavailable)
        })
}
pub(crate) fn usage_snapshot(
    data: &MemoryData,
    project: &str,
    quantity: i64,
    reservations: bool,
) -> Result<UsageSnapshot> {
    let month = Utc::now().format("%Y-%m").to_string();
    let committed = count(data, project, None, &month, "action_call")?;
    let reserved = if reservations {
        data.usage_reserved
            .values()
            .filter(|r| r.project == project && r.month == month)
            .count() as i64
    } else {
        0
    };
    let current = committed.checked_add(reserved).ok_or_else(unavailable)?;
    Ok(UsageSnapshot {
        month,
        current,
        projected: current.checked_add(quantity).ok_or_else(unavailable)?,
        soft_limit: data.action_limits.action_calls_soft,
        hard_limit: data.action_limits.action_calls_hard,
    })
}
pub(crate) fn reserve_usage(data: &mut MemoryData, attempt: &Attempt) -> Result<()> {
    if data.usage_reserved.contains_key(&attempt.request_id)
        || data
            .usage_events
            .contains_key(&format!("usage_{}", attempt.request_id))
    {
        return Err(unavailable());
    }
    let usage = usage_snapshot(data, &attempt.project_id, 1, true)?;
    if data
        .projects
        .get(&attempt.project_id)
        .is_some_and(|p| p.disabled)
    {
        return Err(ActionError::new("PROJECT_DISABLED"));
    }
    if usage.hard_limit > 0 && usage.projected > usage.hard_limit {
        let mut error = ActionError::new("USAGE_LIMIT_EXCEEDED");
        error.usage = Some(usage);
        return Err(error);
    }
    data.usage_reserved.insert(
        attempt.request_id.clone(),
        UsageReservation {
            project: attempt.project_id.clone(),
            brand: attempt.external_account_id.clone(),
            month: usage.month,
        },
    );
    Ok(())
}
pub(crate) fn complete_usage(
    data: &mut MemoryData,
    attempt: &Attempt,
    success: bool,
) -> Result<()> {
    let reservation = data
        .usage_reserved
        .get(&attempt.request_id)
        .ok_or_else(unavailable)?;
    if reservation.project != attempt.project_id || reservation.brand != attempt.external_account_id
    {
        return Err(unavailable());
    }
    if success {
        let key = (
            reservation.project.clone(),
            reservation.brand.clone(),
            reservation.month.clone(),
            "action_call".into(),
        );
        let total = data
            .usage_monthly
            .get(&key)
            .copied()
            .unwrap_or(0)
            .checked_add(1)
            .ok_or_else(unavailable)?;
        data.usage_monthly.insert(key, total);
        let id = format!("usage_{}", attempt.request_id);
        data.usage_events.insert(
            id.clone(),
            UsageEvent {
                id,
                project_id: attempt.project_id.clone(),
                connection_id: attempt.connection_id.clone(),
                external_account_id: attempt.external_account_id.clone(),
                connector: attempt.connector.clone(),
                action: attempt.action.clone(),
                kind: "action_call".into(),
                quantity: 1,
                occurred_at: Utc::now(),
            },
        );
    }
    data.usage_reserved.remove(&attempt.request_id);
    Ok(())
}

use super::MemoryRepository;
use appcall_actions::Entitlements;
use serde_json::Value;
impl MemoryRepository {
    pub fn configure_usage(&self, limits: Entitlements) -> Result<()> {
        let limits = appcall_actions::resolve_entitlements(None, &limits)?;
        let mut data = self.lock().map_err(|_| unavailable())?;
        if !data.action_claims.is_empty() || !data.usage_reserved.is_empty() {
            return Err(unavailable());
        }
        data.action_limits = limits;
        Ok(())
    }
    pub fn usage_monthly(&self, project: &str, brand: Option<&str>, month: &str) -> Result<Value> {
        let month = month_key(month)?;
        let data = self.lock().map_err(|_| unavailable())?;
        require_project(&data, project)?;
        monthly(&data, project, brand, &month)
    }
    pub fn usage_decision(&self, project: &str, quantity: i64) -> Result<Value> {
        if !(1..=1000).contains(&quantity) {
            return Err(ActionError::new("INVALID_QUANTITY"));
        }
        let data = self.lock().map_err(|_| unavailable())?;
        require_project(&data, project)?;
        let s = usage_snapshot(&data, project, quantity, false)?;
        let disabled = data.projects.get(project).is_some_and(|p| p.disabled);
        let exceeded = s.hard_limit > 0 && s.projected > s.hard_limit;
        let mut value = serde_json::json!({"kind":"action_call","quantity":quantity,"allowed":!disabled && !exceeded,"warning":!disabled && !exceeded && s.soft_limit>0 && s.projected>s.soft_limit,"month":s.month,"current":s.current,"projected":s.projected,"softLimit":s.soft_limit,"hardLimit":s.hard_limit});
        if disabled || exceeded {
            value["reason"] = Value::String(
                if disabled {
                    "PROJECT_DISABLED"
                } else {
                    "USAGE_LIMIT_EXCEEDED"
                }
                .into(),
            );
        }
        Ok(value)
    }
    pub fn usage_entitlements(&self, project: &str, unipile_max_accounts: i64) -> Result<Value> {
        if unipile_max_accounts < 0 {
            return Err(unavailable());
        }
        let data = self.lock().map_err(|_| unavailable())?;
        require_project(&data, project)?;
        let month = month_key("")?;
        let mut usage = monthly(&data, project, None, &month)?;
        let fields = usage.as_object_mut().expect("monthly object");
        fields.remove("actionCallsSoftLimit");
        fields.remove("actionCallsHardLimit");
        let e = &data.action_limits;
        Ok(
            serde_json::json!({"plan":{"key":"default","status":"active"},"limits":{"unipileMaxAccounts":unipile_max_accounts,"actionCallsSoft":e.action_calls_soft,"actionCallsHard":e.action_calls_hard,"dailySendCap":e.send_cap,"dailySpendCapMicros":e.spend_cap_micros},"usage":usage}),
        )
    }
}
fn require_project(data: &MemoryData, project: &str) -> Result<()> {
    if data.projects.contains_key(project) {
        Ok(())
    } else {
        Err(ActionError::new("CONNECTION_NOT_FOUND"))
    }
}
fn month_key(raw: &str) -> Result<String> {
    if raw.is_empty() {
        return Ok(Utc::now().format("%Y-%m").to_string());
    }
    if raw.len() != 7
        || raw.as_bytes()[4] != b'-'
        || chrono::NaiveDate::parse_from_str(&format!("{raw}-01"), "%Y-%m-%d").is_err()
    {
        return Err(ActionError::new("INVALID_MONTH"));
    }
    Ok(raw.into())
}
fn monthly(data: &MemoryData, project: &str, brand: Option<&str>, month: &str) -> Result<Value> {
    Ok(
        serde_json::json!({"month":month,"actionCalls":count(data,project,brand,month,"action_call")?,"actionCallsSoftLimit":data.action_limits.action_calls_soft,"actionCallsHardLimit":data.action_limits.action_calls_hard,"syncedRecords":count(data,project,brand,month,"synced_record")?,"webhookEvents":count(data,project,brand,month,"webhook_event")?}),
    )
}
