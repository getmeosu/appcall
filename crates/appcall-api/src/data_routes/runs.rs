//! Project/account-scoped durable sync queue projection.
//!
//! The projection is intentionally limited to columns already persisted by the
//! Rust sync engine. It does not infer worker heartbeats, attempt history, or
//! per-run record counts.
use super::first_query_values;
use crate::{ApiError, Identity, Result};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use chrono::DateTime;
use postgres::GenericClient;
use serde_json::{json, Value};
use std::collections::BTreeMap;

const STATUSES: &[&str] = &[
    "pending",
    "running",
    "backingoff",
    "dead",
    "failed",
    "cancelled",
    "succeeded",
];

#[derive(Debug, Default)]
pub struct RunQuery {
    pub limit: i64,
    pub filters: BTreeMap<String, String>,
    time: String,
    id: String,
}

impl RunQuery {
    pub fn parse(url: &url::Url) -> Result<Self> {
        let filters = first_query_values(url);
        let raw_limit = filters.get("limit").map(String::as_str).unwrap_or("");
        let limit = if raw_limit.is_empty() {
            50
        } else {
            let parsed = raw_limit
                .parse::<i32>()
                .map_err(|_| ApiError::new("INVALID_LIMIT"))?;
            if parsed < 0 {
                return Err(ApiError::new("INVALID_LIMIT"));
            }
            if parsed == 0 {
                50
            } else {
                parsed.min(100) as i64
            }
        };
        if filters
            .get("status")
            .is_some_and(|status| !status.is_empty() && !STATUSES.contains(&status.as_str()))
        {
            return Err(ApiError::new("INVALID_RUN_STATUS"));
        }
        for key in ["connector", "tool", "accountId", "externalAccountId"] {
            if filters.get(key).is_some_and(|value| {
                value.len() > 512 || value.bytes().any(|b| b.is_ascii_control())
            }) {
                return Err(ApiError::new("INVALID_RUN_FILTER"));
            }
        }
        let (time, id) = match filters.get("cursor").filter(|value| !value.is_empty()) {
            None => (String::new(), String::new()),
            Some(raw) => {
                if raw.len() > 4096 {
                    return Err(ApiError::new("INVALID_CURSOR"));
                }
                let bytes = URL_SAFE_NO_PAD
                    .decode(raw)
                    .map_err(|_| ApiError::new("INVALID_CURSOR"))?;
                let text = String::from_utf8(bytes).map_err(|_| ApiError::new("INVALID_CURSOR"))?;
                let (time, id) = text
                    .split_once('|')
                    .ok_or_else(|| ApiError::new("INVALID_CURSOR"))?;
                if id.is_empty() || id.len() > 512 || DateTime::parse_from_rfc3339(time).is_err() {
                    return Err(ApiError::new("INVALID_CURSOR"));
                }
                (time.to_owned(), id.to_owned())
            }
        };
        Ok(Self {
            limit,
            filters,
            time,
            id,
        })
    }

    pub fn cursor_boundary(&self) -> (&str, &str) {
        (&self.time, &self.id)
    }

    pub fn get(&self, key: &str) -> &str {
        self.filters.get(key).map(String::as_str).unwrap_or("")
    }

    fn account(&self) -> &str {
        let account = self.get("accountId");
        if account.is_empty() {
            self.get("externalAccountId")
        } else {
            account
        }
    }
}

// Keep the row health projection and the aggregate strip on one timestamped
// definition.  `$5` is captured once by `list`; using it for both lease and
// wake comparisons prevents a boundary run from being counted in a different
// state than the row the page displays.
const RUN_PROJECTION_CTE: &str = r#"
WITH base AS (
    SELECT
        j.id,
        j.project_id,
        j.connection_id,
        j.operation,
        j.status,
        j.attempts,
        j.run_after,
        j.leased_until,
        j.created_at,
        j.updated_at,
        COALESCE(j.last_error, '') AS last_error,
        COALESCE(cp.cursor, '') AS current_cursor,
        COALESCE(c.connector, '') AS connector,
        COALESCE(c.external_account_id, '') AS account_id,
        COALESCE(
            j.status = 'running' AND j.leased_until > $5::timestamptz,
            false
        ) AS active_lease
    FROM sync_jobs j
    JOIN connections c
        ON c.id = j.connection_id
       AND c.project_id = j.project_id
    LEFT JOIN sync_job_checkpoints cp ON cp.job_id = j.id
    WHERE j.project_id = $1
      AND (
          $2 = ''
          OR (c.external_account_id = $2 AND c.credential_owner <> 'platform')
      )
      AND ($3 = '' OR c.connector = $3)
      AND ($4 = '' OR j.operation = $4)
), projected AS (
    SELECT
        *,
        CASE
            WHEN status IN ('failed', 'cancelled') THEN 'dead'
            WHEN status = 'running' AND active_lease THEN 'running'
            WHEN status = 'running' THEN 'pending'
            WHEN status = 'pending' AND run_after > $5::timestamptz THEN 'backingoff'
            WHEN status = 'succeeded' THEN 'succeeded'
            ELSE status
        END AS health
    FROM base
)
"#;

fn run_status_filter_sql(parameter: u8) -> String {
    format!(
        "(${parameter} = '' OR health = ${parameter} OR (${parameter} IN ('failed', 'cancelled') AND status = ${parameter}))"
    )
}

/// List rows and the queue summary consumed by both Runs and Overview.
pub fn list(
    client: &mut impl GenericClient,
    identity: &Identity,
    query: &RunQuery,
) -> Result<Value> {
    let status = query.get("status");
    let connector = query.get("connector");
    let tool = query.get("tool");
    let requested_account = query.account();
    if !identity.account_id.is_empty()
        && !requested_account.is_empty()
        && requested_account != identity.account_id.as_str()
    {
        return Err(ApiError::new("FORBIDDEN"));
    }
    let account = if identity.account_id.is_empty() {
        requested_account
    } else {
        identity.account_id.as_str()
    };
    let captured_at: std::time::SystemTime = client
        .query_one("SELECT statement_timestamp()", &[])
        .map_err(super::db_error)?
        .get(0);
    let (cursor_time, cursor_id) = query.cursor_boundary();
    let rows = client
        .query(
            &format!(
                "{RUN_PROJECTION_CTE} SELECT id,connection_id,connector,operation,account_id,status,health,attempts,to_char(run_after AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS run_after,to_char(leased_until AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS leased_until,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS created_at,to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS updated_at,current_cursor,last_error,COALESCE(FLOOR(EXTRACT(EPOCH FROM (leased_until-$5::timestamptz)))::bigint,0) AS lease_remaining_seconds,CASE WHEN status='pending' OR status='running' AND NOT active_lease THEN true ELSE false END AS run_now_eligible,CASE WHEN status='pending' OR status='failed' OR status='running' AND NOT active_lease THEN true ELSE false END AS reset_eligible,CASE WHEN status='pending' OR status='running' THEN true ELSE false END AS cancel_eligible FROM projected WHERE ($6='' OR (updated_at,id)<(NULLIF($7,'')::timestamptz,$8)) AND {status_filter} ORDER BY updated_at DESC,id DESC LIMIT $10",
                status_filter = run_status_filter_sql(9)
            ),
            &[
                &identity.project_id,
                &account,
                &connector,
                &tool,
                &captured_at,
                &cursor_time,
                &cursor_time,
                &cursor_id,
                &status,
                &(query.limit + 1),
            ],
        )
        .map_err(super::db_error)?;
    let more = rows.len() > query.limit as usize;
    let mut runs = rows.iter().map(run_value).collect::<Result<Vec<_>>>()?;
    runs.truncate(query.limit as usize);
    let mut pagination = json!({"hasMore": more});
    if more {
        if let Some(last) = runs.last() {
            let updated = last
                .get("updatedAt")
                .and_then(Value::as_str)
                .ok_or_else(|| ApiError::new("STORAGE_UNAVAILABLE"))?;
            let id = last
                .get("id")
                .and_then(Value::as_str)
                .ok_or_else(|| ApiError::new("STORAGE_UNAVAILABLE"))?;
            pagination["nextCursor"] = URL_SAFE_NO_PAD.encode(format!("{updated}|{id}")).into();
        }
    }
    let summary = client
        .query_one(
            &format!(
                "{RUN_PROJECTION_CTE} SELECT COUNT(*) FILTER (WHERE health = 'pending'), COUNT(*) FILTER (WHERE health = 'running'), COUNT(*) FILTER (WHERE health = 'backingoff'), COUNT(*) FILTER (WHERE health = 'dead') FROM projected WHERE {status_filter}",
                status_filter = run_status_filter_sql(6)
            ),
            &[
                &identity.project_id,
                &account,
                &connector,
                &tool,
                &captured_at,
                &status,
            ],
        )
        .map_err(super::db_error)?;
    let pending_runs = summary.get::<_, i64>(0);
    let running_runs = summary.get::<_, i64>(1);
    let backingoff_runs = summary.get::<_, i64>(2);
    let dead_runs = summary.get::<_, i64>(3);
    // `quantity` was added by the existing event-outbox migration. Inspect the
    // current schema first so a pre-migration deployment can report the metric
    // as unavailable without aborting a caller-owned transaction on a missing
    // column. We never substitute a count of queue rows for synced records.
    let records_24h = client
        .query_opt(
            "SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='usage_events' AND column_name IN ('connection_id','kind','occurred_at','quantity') GROUP BY table_schema,table_name HAVING count(*)=4",
            &[],
        )
        .ok()
        .flatten()
        .and_then(|_| {
                client
                .query_one(
                    "SELECT COALESCE(SUM(u.quantity),0)::bigint FROM usage_events u JOIN connections c ON c.id=u.connection_id AND c.project_id=u.project_id WHERE u.project_id=$1 AND u.kind='synced_record' AND u.occurred_at>=$3::timestamptz-interval '24 hours' AND u.occurred_at<=$3::timestamptz AND ($2='' OR (c.external_account_id=$2 AND c.credential_owner<>'platform')) AND ($4='' OR c.connector=$4) AND ($5='' OR u.action=$5)",
                    &[&identity.project_id, &account, &captured_at, &connector, &tool],
                )
                .map(|row| row.get::<_, i64>(0))
                .ok()
        });
    let mut result = json!({
        "runs": runs,
        "pagination": pagination,
        "pendingRuns": pending_runs,
        "runningRuns": running_runs,
        "backingoffRuns": backingoff_runs,
        "deadRuns": dead_runs,
        "workerHeartbeatUnavailable": true,
        "operatorControlsUnavailable": true
    });
    if let Some(records_24h) = records_24h {
        result["records24h"] = records_24h.into();
    } else {
        result["records24hUnavailable"] = true.into();
    }
    Ok(result)
}

/// Return the small presentation adapter consumed by Overview's
/// `deadRuns` attention section. Every row is backed by a persisted terminal
/// sync job; the link intentionally lands on the Runs dead filter because the
/// bounded Runs surface has no unverified per-run detail route.
pub fn dead_runs_projection(
    client: &mut impl GenericClient,
    identity: &Identity,
) -> Result<Vec<Value>> {
    client
        .query(
            "SELECT j.id,c.connector,j.operation,COALESCE(j.last_error,'') FROM sync_jobs j JOIN connections c ON c.id=j.connection_id AND c.project_id=j.project_id WHERE j.project_id=$1 AND ($2='' OR (c.external_account_id=$2 AND c.credential_owner<>'platform')) AND j.status IN ('failed','cancelled') ORDER BY j.updated_at DESC,j.id DESC LIMIT 5",
            &[&identity.project_id, &identity.account_id],
        )
        .map_err(super::db_error)
        .map(|rows| {
            rows.iter()
                .map(|row| {
                    let id: String = row.get(0);
                    let connector: String = row.get(1);
                    let operation: String = row.get(2);
                    let last_error: String = row.get(3);
                    let detail = if last_error.is_empty() {
                        format!("Run {id} is terminal.")
                    } else {
                        format!("Run {id}: {last_error}")
                    };
                    json!({
                        "runId": id,
                        "kind": "dead_run",
                        "state": "dead",
                        "title": format!("{connector} / {operation} dead run"),
                        "body": detail,
                        "href": "/app/runs?status=dead",
                    })
                })
                .collect()
        })
}

fn run_value(row: &postgres::Row) -> Result<Value> {
    let updated_at = row.get::<_, Option<String>>(11).unwrap_or_default();
    Ok(json!({
        "id": row.get::<_, String>(0),
        "connectionId": row.get::<_, String>(1),
        "connector": row.get::<_, String>(2),
        "tool": row.get::<_, String>(3),
        "accountId": row.get::<_, String>(4),
        "status": row.get::<_, String>(5),
        "health": row.get::<_, String>(6),
        "attemptsSpent": row.get::<_, i32>(7).max(0),
        "attemptsRemaining": (appcall_sync::DEFAULT_MAX_ATTEMPTS as i32 - row.get::<_, i32>(7).max(0)).max(0),
        "maxAttempts": appcall_sync::DEFAULT_MAX_ATTEMPTS,
        "wakeAt": row.get::<_, Option<String>>(8).unwrap_or_default(),
        "leaseUntil": row.get::<_, Option<String>>(9).unwrap_or_default(),
        "leaseRemainingSeconds": row.get::<_, i64>(14).max(0),
        "createdAt": row.get::<_, Option<String>>(10).unwrap_or_default(),
        "updatedAt": updated_at,
        "currentCursor": row.get::<_, String>(12),
        "lastError": row.get::<_, String>(13),
        // Queue eligibility is state evidence only. Authorization is exposed
        // separately at the list level; current API principals have no
        // trusted operator capability, so the mutation-facing flags stay off.
        "runNowEligible": row.get::<_, bool>(15),
        "resetEligible": row.get::<_, bool>(16),
        "cancelEligible": row.get::<_, bool>(17),
        "runNowAllowed": false,
        "resetAllowed": false,
        "cancelAllowed": false,
    }))
}
