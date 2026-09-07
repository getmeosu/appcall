use crate::{AccountGate, Error, Result};
use std::sync::Mutex;

pub struct PgAccountGate {
    db: Mutex<postgres::Client>,
    default_limit: i64,
}
impl PgAccountGate {
    pub fn new(mut db: postgres::Client, default_limit: i64) -> Result<Self> {
        db.batch_execute("SET statement_timeout='5s'; SET lock_timeout='2s'")?;
        Ok(Self {
            db: Mutex::new(db),
            default_limit: default_limit.max(0),
        })
    }
}
impl AccountGate for PgAccountGate {
    fn database_health(&self) -> Option<bool> {
        crate::service::database_health(&self.db)
    }
    fn limit(&self, project: &str) -> Result<i64> {
        if project.trim().is_empty() {
            return Err(Error::denied(0, 0));
        }
        let row = self.db.lock().map_err(|_| Error::database())?.query_opt(
            "SELECT plan_key,status,overrides::text FROM project_plans WHERE project_id=$1",
            &[&project],
        )?;
        match row {
            None => Ok(self.default_limit),
            Some(row) => resolve(row.get(0), row.get(1), row.get(2)),
        }
    }
}
fn resolve(plan: &str, status: &str, overrides: &str) -> Result<i64> {
    if status != "active" {
        return Ok(0);
    }
    let base = match plan {
        "starter" => 1,
        "growth" => 3,
        _ => 0,
    };
    let value: serde_json::Value =
        serde_json::from_str(overrides).map_err(|_| Error::denied(0, 0))?;
    if value.is_null() {
        return Ok(base);
    }
    let map = value.as_object().ok_or_else(|| Error::denied(0, 0))?;
    // Go decodes every known override field before using the account dimension.
    for field in [
        "unipile_max_accounts",
        "action_calls_soft",
        "action_calls_hard",
        "send_cap",
        "spend_cap_micros",
    ] {
        if map
            .get(field)
            .is_some_and(|v| !v.is_null() && v.as_i64().is_none())
        {
            return Err(Error::denied(0, 0));
        }
    }
    Ok(map
        .get("unipile_max_accounts")
        .and_then(serde_json::Value::as_i64)
        .unwrap_or(base))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    #[ignore = "requires local PostgreSQL"]
    fn database_health_distinguishes_live_busy_and_poisoned() {
        let url = std::env::var("APPCALL_ENGINE_POSTGRES_URL").unwrap();
        let gate = PgAccountGate::new(postgres::Client::connect(&url, postgres::NoTls).unwrap(), 1)
            .unwrap();
        assert_eq!(gate.database_health(), Some(true));
        let held = gate.db.lock().unwrap();
        assert_eq!(gate.database_health(), None);
        drop(held);
        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let _held = gate.db.lock().unwrap();
            panic!("synthetic mutex poison");
        }));
        assert_eq!(gate.database_health(), Some(false));
        let mut db = postgres::Client::connect(&url, postgres::NoTls).unwrap();
        let pid: i32 = db.query_one("SELECT pg_backend_pid()", &[]).unwrap().get(0);
        let closed = PgAccountGate::new(db, 1).unwrap();
        let mut admin = postgres::Client::connect(&url, postgres::NoTls).unwrap();
        admin
            .query_one("SELECT pg_terminate_backend($1)", &[&pid])
            .unwrap();
        // postgres drives its private reactor during operations. The health
        // accessor reports an observed broken socket without issuing a query.
        assert!(closed.db.lock().unwrap().simple_query("SELECT 1").is_err());
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(2);
        while closed.database_health() != Some(false) {
            // A fatal server response can precede EOF; drive that EOF in the
            // fixture before asking the non-querying probe to classify it.
            assert!(closed.db.lock().unwrap().simple_query("SELECT 1").is_err());
            assert!(
                std::time::Instant::now() < deadline,
                "terminated client stayed healthy"
            );
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
    }
    #[test]
    fn plan_capacity_overrides_and_lapsed_status() {
        assert_eq!(resolve("starter", "active", "{}").unwrap(), 1);
        assert_eq!(resolve("growth", "active", "{}").unwrap(), 3);
        assert_eq!(
            resolve("growth", "active", r#"{"unipile_max_accounts":7}"#).unwrap(),
            7
        );
        assert_eq!(
            resolve("growth", "past_due", r#"{"unipile_max_accounts":7}"#).unwrap(),
            0
        );
        assert_eq!(resolve("unknown", "active", "{}").unwrap(), 0);
        assert!(resolve("growth", "active", r#"{"unipile_max_accounts":"bad"}"#).is_err());
        assert!(resolve("growth", "active", r#"{"action_calls_soft":"bad"}"#).is_err());
    }
}
