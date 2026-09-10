use super::*;
use appcall_actions::{resolve_entitlements, usage_snapshot, Entitlements};
/// Defaults must be the same instance of host policy configuration used by actions.
#[derive(Clone, Default)]
pub struct UsageDefaults {
    pub limits: Entitlements,
    pub unipile_max_accounts: i64,
}
/// Read current project usage and entitlements. The action-call decision reads
/// completed rollups plus active pending/dispatched reservations; it is
/// advisory, does not reserve capacity, and may become stale before
/// authoritative admission.
pub fn usage_read(
    client: &mut impl GenericClient,
    identity: &Identity,
    url: &url::Url,
    defaults: &UsageDefaults,
) -> Result<Option<Response>> {
    let path = url.path();
    if ![
        "/v1/usage/monthly",
        "/v1/usage/action-calls/decision",
        "/v1/entitlements",
    ]
    .contains(&path)
    {
        return Ok(None);
    }
    if identity.project_id.is_empty() {
        return Err(ApiError::new("UNAUTHORIZED"));
    }
    let query = first_query_values(url);
    let now = chrono::Utc::now().format("%Y-%m").to_string();
    let month = if path == "/v1/usage/monthly" {
        query.get("month").filter(|s| !s.is_empty()).unwrap_or(&now)
    } else {
        &now
    };
    if month.len() != 7
        || chrono::NaiveDate::parse_from_str(&format!("{month}-01"), "%Y-%m-%d").is_err()
    {
        return Err(ApiError::new("INVALID_MONTH"));
    }
    let quantity = match query
        .get("quantity")
        .filter(|s| path == "/v1/usage/action-calls/decision" && !s.is_empty())
    {
        None => 1,
        Some(s) => s
            .parse::<i64>()
            .ok()
            .filter(|n| *n > 0 && *n <= 1000)
            .ok_or_else(|| ApiError::new("INVALID_QUANTITY"))?,
    };
    let row = client
        .query_opt(
            "SELECT plan_key,status,overrides::text FROM project_plans WHERE project_id=$1",
            &[&identity.project_id],
        )
        .map_err(db_error)?;
    let (plan, status, limits, accounts) = match row {
        None => (
            "default".to_owned(),
            "active".to_owned(),
            resolve_entitlements(None, &defaults.limits).map_err(ApiError::from)?,
            defaults.unipile_max_accounts,
        ),
        Some(row) => {
            let plan: String = row.get(0);
            let status: String = row.get(1);
            let overrides: Value = serde_json::from_str(&row.get::<_, String>(2))
                .map_err(|_| ApiError::new("ENTITLEMENTS_FAILED"))?;
            let limits =
                resolve_entitlements(Some((&plan, &status, overrides.clone())), &defaults.limits)
                    .map_err(|_| ApiError::new("ENTITLEMENTS_FAILED"))?;
            let accounts = match (plan.as_str(), status.as_str()) {
                ("growth", "active") => 3,
                ("starter", "active") => 1,
                _ => 0,
            };
            let accounts = if status == "active" {
                match overrides
                    .get("unipile_max_accounts")
                    .filter(|v| !v.is_null())
                {
                    Some(v) => v
                        .as_i64()
                        .filter(|n| *n >= 0)
                        .ok_or_else(|| ApiError::new("ENTITLEMENTS_FAILED"))?,
                    None => accounts,
                }
            } else {
                accounts
            };
            (plan, status, limits, accounts)
        }
    };
    // Go rollups are project-wide aggregates; account rows must not be counted twice.
    let mut entitlements = json!({"plan":{"key":plan,"status":status},"limits":{"unipileMaxAccounts":accounts,"actionCallsSoft":limits.action_calls_soft,"actionCallsHard":limits.action_calls_hard,"dailySendCap":limits.send_cap,"dailySpendCapMicros":limits.spend_cap_micros}});
    const ROLLUP: &str = "SELECT kind,COALESCE(sum(quantity),0)::bigint FROM usage_monthly_rollups WHERE project_id=$1 AND month=$2 GROUP BY kind";
    let rows = if path == "/v1/entitlements" {
        // Services already owns a transaction. A nested savepoint keeps an
        // optional rollup error from poisoning the surrounding read/commit.
        let mut optional = client.transaction().map_err(db_error)?;
        match optional.query(ROLLUP, &[&identity.project_id, &month]) {
            Ok(rows) => {
                optional.commit().map_err(db_error)?;
                rows
            }
            Err(_) => {
                optional.rollback().map_err(db_error)?;
                return Ok(Some(Response {
                    status: 200,
                    body: entitlements,
                    headers: vec![],
                }));
            }
        }
    } else {
        client
            .query(ROLLUP, &[&identity.project_id, &month])
            .map_err(db_error)?
    };
    let counts: BTreeMap<String, i64> = rows.into_iter().map(|r| (r.get(0), r.get(1))).collect();
    let count = |kind: &str| *counts.get(kind).unwrap_or(&0);
    let current = count("action_call");
    let usage = json!({"month":month,"actionCalls":current,"syncedRecords":count("synced_record"),"webhookEvents":count("webhook_event")});
    let body = match path {
        "/v1/entitlements" => {
            entitlements["usage"] = usage;
            entitlements
        }
        "/v1/usage/monthly" => {
            let mut value = usage;
            value["actionCallsSoftLimit"] = limits.action_calls_soft.into();
            value["actionCallsHardLimit"] = limits.action_calls_hard.into();
            value
        }
        _ => {
            let disabled: bool = client
                .query_opt(
                    "SELECT disabled_at IS NOT NULL FROM projects WHERE id=$1",
                    &[&identity.project_id],
                )
                .map_err(db_error)?
                .ok_or_else(|| ApiError::new("UNAUTHORIZED"))?
                .get(0);
            let (current, projected) = if disabled {
                let projected = 0_i64
                    .checked_add(quantity)
                    .ok_or_else(|| ApiError::new("USAGE_DECISION_FAILED"))?;
                (0, projected)
            } else {
                let snapshot =
                    usage_snapshot(client, &identity.project_id, month, quantity, &limits)
                        .map_err(db_error)?;
                (snapshot.current, snapshot.projected)
            };
            let exceeded = limits.action_calls_hard > 0 && projected > limits.action_calls_hard;
            let mut value = json!({"kind":"action_call","quantity":quantity,"allowed":!disabled&&!exceeded,"warning":!disabled&&!exceeded&&limits.action_calls_soft>0&&projected>limits.action_calls_soft,"month":month,"current":current,"projected":projected,"softLimit":limits.action_calls_soft,"hardLimit":limits.action_calls_hard});
            if disabled {
                value["reason"] = "PROJECT_DISABLED".into()
            } else if exceeded {
                value["reason"] = "USAGE_LIMIT_EXCEEDED".into()
            }
            value
        }
    };
    Ok(Some(Response {
        status: 200,
        body,
        headers: vec![],
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    #[ignore = "requires isolated local PostgreSQL"]
    fn entitlements_rollup_failure_preserves_limits_and_outer_transaction() {
        let mut db = postgres::Client::connect(
            &std::env::var("APPCALL_ENGINE_POSTGRES_URL").unwrap(),
            postgres::NoTls,
        )
        .unwrap();
        db.batch_execute("CREATE TEMP TABLE project_plans(project_id text, plan_key text,status text,overrides jsonb); INSERT INTO project_plans VALUES('p','starter','active','{}'); CREATE TEMP VIEW usage_monthly_rollups AS SELECT 'p'::text AS project_id,to_char(now() AT TIME ZONE 'UTC','YYYY-MM') AS month,'action_call'::text AS kind,(1/0)::bigint AS quantity").unwrap();
        let identity = Identity {
            project_id: "p".into(),
            account_id: String::new(),
            admin_scope: false,
        };
        let mut outer = db.transaction().unwrap();
        let response = usage_read(
            &mut outer,
            &identity,
            &url::Url::parse("http://x/v1/entitlements").unwrap(),
            &UsageDefaults::default(),
        )
        .unwrap()
        .unwrap();
        assert_eq!(response.status, 200);
        assert_eq!(response.body["plan"]["key"], "starter");
        assert_eq!(response.body["limits"]["unipileMaxAccounts"], 1);
        assert!(
            response.body.get("usage").is_none(),
            "failed optional usage must be omitted, never fabricated zero"
        );
        outer.simple_query("SELECT 1").unwrap();
        outer.commit().unwrap();
        for path in ["/v1/usage/monthly", "/v1/usage/action-calls/decision"] {
            assert!(usage_read(
                &mut db,
                &identity,
                &url::Url::parse(&format!("http://x{path}")).unwrap(),
                &UsageDefaults::default()
            )
            .is_err());
        }
    }
}
