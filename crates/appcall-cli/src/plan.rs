use chrono::{DateTime, SecondsFormat, Utc};
use postgres::Client;
use serde_json::{json, Value};

pub fn validate(
    project: &str,
    plan: &str,
    status: &str,
    overrides: &Value,
) -> Result<(), &'static str> {
    if project.trim().is_empty() || project.chars().any(char::is_control) {
        return Err("-project is required and must be printable");
    }
    if !matches!(plan, "free" | "starter" | "growth") {
        return Err("unknown plan (want free|starter|growth)");
    }
    if !matches!(status, "active" | "past_due" | "canceled") {
        return Err("unknown status (want active|past_due|canceled)");
    }
    if !overrides.is_object() {
        return Err("-overrides is not a JSON object");
    }
    Ok(())
}

pub fn inspect(client: &mut Client, project: &str) -> Result<String, &'static str> {
    let row = client
        .query_opt(
            "SELECT plan_key,status,overrides,updated_at FROM project_plans WHERE project_id=$1",
            &[&project],
        )
        .map_err(|_| "get plan failed")?;
    Ok(match row {
        None => format!("{project}: no plan row (env-default entitlements)\n"),
        Some(r) => format!(
            "{project}: plan={} status={} overrides={} updated_at={}\n",
            r.get::<_, String>(0),
            r.get::<_, String>(1),
            r.get::<_, Value>(2),
            r.get::<_, DateTime<Utc>>(3)
                .to_rfc3339_opts(SecondsFormat::Secs, true)
        ),
    })
}
/// Retains the Go operator contract: a ledger failure is a warning after a
/// successful assignment, not a misleading assignment failure.
pub fn assign(
    client: &mut Client,
    project: &str,
    plan: &str,
    status: &str,
    overrides: &Value,
) -> Result<(String, Option<&'static str>), &'static str> {
    validate(project, plan, status, overrides)?;
    let row = client.query_one("INSERT INTO project_plans(project_id,plan_key,status,overrides) VALUES($1,$2,$3,$4) ON CONFLICT(project_id) DO UPDATE SET plan_key=EXCLUDED.plan_key,status=EXCLUDED.status,overrides=EXCLUDED.overrides,updated_at=now() RETURNING overrides", &[&project,&plan,&status,&overrides]).map_err(|_| "upsert plan failed")?;
    let id = format!("evt_admin_{}", uuid::Uuid::new_v4().simple());
    let payload = json!({"plan_key":plan,"status":status,"actor":"planctl"});
    let warning = client.execute("INSERT INTO billing_events(id,provider,type,project_id,payload) VALUES($1,'admin','plan.set',$2,$3) ON CONFLICT(id) DO NOTHING", &[&id,&project,&payload]).err().map(|_| "plan applied but ledger write failed");
    Ok((
        format!(
            "ok: {project} -> plan={plan} status={status} overrides={}\n",
            row.get::<_, Value>(0)
        ),
        warning,
    ))
}
/// Bounded newest-first ledger inspection; no provider payload is printed.
pub fn audit(client: &mut Client, project: &str) -> Result<Value, &'static str> {
    let rows = client.query("SELECT id,provider,type,received_at FROM billing_events WHERE project_id=$1 ORDER BY received_at DESC,id DESC LIMIT 1000", &[&project]).map_err(|_| "audit query failed")?;
    Ok(Value::Array(rows.iter().map(|r| json!({"id":r.get::<_,String>(0),"provider":r.get::<_,String>(1),"type":r.get::<_,String>(2),"receivedAt":r.get::<_,DateTime<Utc>>(3)})).collect()))
}
