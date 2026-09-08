//! Project-scoped Overview read model.
//!
//! Counts and chart points come from the action log and connection rows that
//! are already authoritative for the dashboard. This module deliberately does
//! not expose a latency KPI: the log schema has no action duration.

use super::db_error;
use crate::{ApiError, Identity, Result};
use chrono::{DateTime, Duration, NaiveDate, Utc};
use postgres::GenericClient;
use serde_json::{json, Value};
use std::collections::BTreeMap;

pub(crate) const WINDOW_HOURS: i64 = 24;

const MAX_RUN_ID_BYTES: usize = 256;

const OVERVIEW_SQL: &str = r#"
WITH snapshot AS (
    SELECT CURRENT_TIMESTAMP AS captured_at
),
visible_connections AS MATERIALIZED (
    SELECT c.id, c.connector, c.status, c.last_test_status
    FROM connections c
    CROSS JOIN snapshot s
    WHERE c.project_id = $1
      AND ($2 = '' OR c.external_account_id = $2 OR c.credential_owner = 'platform')
),
visible_actions AS MATERIALIZED (
    SELECT l.id, l.request_id, l.connector, l.action, l.status, l.error_code, l.created_at
    FROM action_logs l
    CROSS JOIN snapshot s
    WHERE l.project_id = $1
      AND ($2 = '' OR l.external_account_id = $2)
      AND EXISTS (
          SELECT 1
          FROM connections c
          WHERE c.id = l.connection_id
            AND c.project_id = l.project_id
            AND ($2 = '' OR c.external_account_id = $2 OR c.credential_owner = 'platform')
      )
      AND l.created_at >= s.captured_at - interval '24 hours'
      AND l.created_at <= s.captured_at
),
connection_attention AS (
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', c.id,
                'connector', c.connector,
                'status', c.status,
                'lastTestStatus', c.last_test_status
            ) ORDER BY c.connector, c.id
        ),
        '[]'::jsonb
    ) AS value
    FROM (
        SELECT *
        FROM visible_connections
        WHERE status <> 'active' OR last_test_status = 'failed'
        ORDER BY connector, id
        LIMIT 5
    ) c
),
failure_attention AS (
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'requestId', l.request_id,
                'connector', l.connector,
                'action', l.action,
                'errorCode', l.error_code
            ) ORDER BY l.created_at DESC, l.id DESC
        ),
        '[]'::jsonb
    ) AS value
    FROM (
        SELECT *
        FROM visible_actions
        WHERE status = 'failed'
        ORDER BY created_at DESC, id DESC
        LIMIT 5
    ) l
),
dead_run_attention AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'runId', r.id, 'kind', 'dead_run', 'state', 'dead',
        'title', 'Sync run stopped', 'body', 'Review this terminal run.'
    ) ORDER BY r.updated_at DESC, r.id DESC), '[]'::jsonb) AS value
    FROM (
        SELECT j.id, j.updated_at
        FROM sync_jobs j
        JOIN connections c ON c.id = j.connection_id AND c.project_id = j.project_id
        WHERE j.project_id = $1
          AND ($2 = '' OR (c.external_account_id = $2 AND c.credential_owner <> 'platform'))
          AND j.status IN ('failed', 'cancelled')
        ORDER BY j.updated_at DESC, j.id DESC
        LIMIT 5
    ) r
),
activity AS (
    SELECT
        date_trunc('hour', created_at AT TIME ZONE 'UTC') AS hour,
        count(*)::bigint AS calls,
        count(*) FILTER (WHERE status = 'succeeded')::bigint AS succeeded,
        count(*) FILTER (WHERE status = 'failed')::bigint AS failed
    FROM visible_actions
    GROUP BY 1
)
SELECT
    $3::bigint AS toolkit_count,
    (SELECT count(*)::bigint FROM visible_connections) AS connection_count,
    (SELECT count(*) FILTER (WHERE status = 'active')::bigint FROM visible_connections) AS active_connection_count,
    (SELECT count(*)::bigint FROM visible_actions) AS action_calls,
    (SELECT count(*) FILTER (WHERE status = 'succeeded')::bigint FROM visible_actions) AS successful_calls,
    (SELECT count(*) FILTER (WHERE status = 'failed')::bigint FROM visible_actions) AS failed_calls,
    COALESCE(
        (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'date', to_char(hour, 'YYYY-MM-DD"T"HH24:00:00"Z"'),
                    'calls', calls,
                    'succeeded', succeeded,
                    'failed', failed
                ) ORDER BY hour
            )::text
            FROM activity
        ),
        '[]'
    ) AS activity,
    (SELECT value::text FROM failure_attention) AS failures,
    (SELECT value::text FROM connection_attention) AS connections,
    (SELECT value::text FROM dead_run_attention) AS dead_runs
"#;

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct ConnectionRow {
    pub id: String,
    pub connector: String,
    pub status: String,
    pub last_test_status: String,
}

#[derive(Clone, Debug)]
pub(crate) struct ActionRow {
    pub request_id: String,
    pub connector: String,
    pub action: String,
    pub status: String,
    pub error_code: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Clone, Debug)]
pub(crate) struct FailureRow {
    pub request_id: String,
    pub connector: String,
    pub action: String,
    pub error_code: String,
}

#[derive(Clone, Debug)]
pub(crate) struct ActivityRow {
    pub date: String,
    pub calls: u64,
    pub succeeded: u64,
    pub failed: u64,
}

#[derive(Default)]
struct HourCounts {
    calls: u64,
    succeeded: u64,
    failed: u64,
}

/// Read the Overview model from PostgreSQL using the same project/account
/// ownership boundary as the Logs and Auth Configs views.
pub(crate) fn read(
    client: &mut impl GenericClient,
    identity: &Identity,
    toolkit_count: usize,
) -> Result<Value> {
    if identity.project_id.is_empty() {
        return Err(ApiError::new("UNAUTHORIZED"));
    }

    let toolkit_count =
        i64::try_from(toolkit_count).map_err(|_| ApiError::new("STORAGE_UNAVAILABLE"))?;
    let row = client
        .query_one(
            OVERVIEW_SQL,
            &[&identity.project_id, &identity.account_id, &toolkit_count],
        )
        .map_err(db_error)?;
    let toolkit_count = count_value(row.get(0))? as usize;
    let connection_count = count_value(row.get(1))?;
    let active_connection_count = count_value(row.get(2))?;
    let action_calls = count_value(row.get(3))?;
    let successful_calls = count_value(row.get(4))?;
    let failed_calls = count_value(row.get(5))?;
    let activity = parse_activity_rows(row.get(6))?;
    let failures = parse_failure_rows(row.get(7))?;
    let connection_rows = parse_connection_rows(row.get(8))?;

    let mut dead_runs: Value = serde_json::from_str(&row.get::<_, String>(9))
        .map_err(|_| ApiError::new("STORAGE_UNAVAILABLE"))?;
    if !dead_runs.as_array().is_some_and(|rows| {
        rows.len() <= 5
            && rows.iter().all(|row| {
                row.get("runId")
                    .and_then(Value::as_str)
                    .is_some_and(|id| !id.is_empty())
                    && row.get("kind").and_then(Value::as_str) == Some("dead_run")
                    && row.get("state").and_then(Value::as_str) == Some("dead")
            })
    }) {
        return Err(ApiError::new("STORAGE_UNAVAILABLE"));
    }
    project_dead_run_links(&mut dead_runs)?;
    let mut value = from_database_parts(
        toolkit_count,
        connection_count,
        active_connection_count,
        action_calls,
        successful_calls,
        failed_calls,
        &activity,
        &failures,
        &connection_rows,
    );
    value
        .as_object_mut()
        .expect("Overview object")
        .remove("deadRunsUnavailable");
    value["deadRuns"] = dead_runs;
    Ok(value)
}

/// Build the same model from the in-process development store. Keeping this
/// aggregation shared with the SQL adapter prevents preview and development
/// mode from quietly acquiring different KPI semantics.
pub(crate) fn from_rows(
    toolkit_count: usize,
    connections: &[ConnectionRow],
    actions: &[ActionRow],
    now: DateTime<Utc>,
) -> Value {
    let cutoff = now - Duration::hours(WINDOW_HOURS);
    let mut recent = actions
        .iter()
        .filter(|row| row.created_at >= cutoff && row.created_at <= now)
        .collect::<Vec<_>>();
    recent.sort_by(|left, right| {
        (right.created_at, &right.request_id).cmp(&(left.created_at, &left.request_id))
    });
    let mut hours = BTreeMap::<String, HourCounts>::new();
    let mut successful_calls = 0;
    let mut failed_calls = 0;
    for row in &recent {
        let hour = row.created_at.format("%Y-%m-%dT%H:00:00Z").to_string();
        let counts = hours.entry(hour).or_default();
        counts.calls += 1;
        match row.status.as_str() {
            "succeeded" => {
                counts.succeeded += 1;
                successful_calls += 1;
            }
            "failed" => {
                counts.failed += 1;
                failed_calls += 1;
            }
            _ => {}
        }
    }
    let activity = hours
        .into_iter()
        .map(|(date, counts)| ActivityRow {
            date,
            calls: counts.calls,
            succeeded: counts.succeeded,
            failed: counts.failed,
        })
        .collect::<Vec<_>>();
    let failures = recent
        .iter()
        .filter(|row| row.status == "failed")
        .take(5)
        .map(|row| FailureRow {
            request_id: row.request_id.clone(),
            connector: row.connector.clone(),
            action: row.action.clone(),
            error_code: row.error_code.clone(),
        })
        .collect::<Vec<_>>();
    let active_connection_count = connections
        .iter()
        .filter(|row| row.status == "active")
        .count() as u64;
    let connection_attention = connections
        .iter()
        .filter(|row| row.status != "active" || row.last_test_status == "failed")
        .take(5)
        .cloned()
        .collect::<Vec<_>>();

    from_database_parts(
        toolkit_count,
        connections.len() as u64,
        active_connection_count,
        recent.len() as u64,
        successful_calls,
        failed_calls,
        &activity,
        &failures,
        &connection_attention,
    )
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn from_database_parts(
    toolkit_count: usize,
    connection_count: u64,
    active_connection_count: u64,
    action_calls: u64,
    successful_calls: u64,
    failed_calls: u64,
    activity: &[ActivityRow],
    failures: &[FailureRow],
    connection_attention: &[ConnectionRow],
) -> Value {
    let completed_calls = successful_calls.saturating_add(failed_calls);
    let success_rate = if completed_calls == 0 {
        Value::Null
    } else {
        json!(successful_calls as f64 * 100.0 / completed_calls as f64)
    };
    let activity = activity.iter().map(activity_value).collect::<Vec<_>>();
    let failure_activity = activity
        .iter()
        .map(|row| {
            json!({
                "date": row["date"].clone(),
                "label": row["label"].clone(),
                "failures": row["failed"].clone(),
            })
        })
        .collect::<Vec<_>>();
    let outcomes = if completed_calls == 0 {
        Vec::new()
    } else {
        vec![
            json!({"label":"Succeeded","value":successful_calls}),
            json!({"label":"Failed","value":failed_calls}),
        ]
    };
    let mut attention = failures.iter().map(failure_value).collect::<Vec<_>>();
    attention.extend(connection_attention.iter().map(connection_value));

    json!({
        "toolkitCount": toolkit_count,
        "connectionCount": connection_count,
        "activeConnectionCount": active_connection_count,
        "actionCalls": action_calls,
        "successfulCalls": successful_calls,
        "failedCalls": failed_calls,
        "successRate": success_rate,
        "activity": activity,
        "failureActivity": failure_activity,
        "outcomes": outcomes,
        "attention": attention,
        // The shared memory aggregation has no durable sync store. SQL read replaces this.
        "deadRunsUnavailable": true,
    })
}

fn activity_value(row: &ActivityRow) -> Value {
    let label = DateTime::parse_from_rfc3339(&row.date)
        .map(|date| date.format("%H:%M").to_string())
        .or_else(|_| {
            NaiveDate::parse_from_str(&row.date, "%Y-%m-%d")
                .map(|date| date.format("%b %d").to_string())
        })
        .unwrap_or_else(|_| row.date.clone());
    json!({
        "date": row.date,
        "label": label,
        "calls": row.calls,
        "succeeded": row.succeeded,
        "failed": row.failed,
    })
}

fn failure_value(row: &FailureRow) -> Value {
    let body = if row.error_code.is_empty() {
        "Recorded failure in the action log.".to_owned()
    } else {
        format!("Error code: {}.", row.error_code)
    };
    json!({
        "kind": "failure",
        "title": format!("{} / {} failed", row.connector, row.action),
        "body": body,
        "href": failure_href(row),
    })
}

fn connection_value(row: &ConnectionRow) -> Value {
    let status = if row.status.is_empty() {
        "unknown"
    } else {
        row.status.as_str()
    };
    let body = if row.last_test_status.is_empty() || row.last_test_status == "unknown" {
        format!("Provider status: {status}.")
    } else {
        format!(
            "Provider status: {status}. Last test: {}.",
            row.last_test_status
        )
    };
    let state = if row.last_test_status == "failed" {
        "failed"
    } else {
        status
    };
    let title = if row.last_test_status == "failed" && status == "active" {
        format!("{} connection test failed", row.connector)
    } else {
        format!("{} connection is {status}", row.connector)
    };
    json!({
        "kind": "connection",
        "state": state,
        "title": title,
        "body": body,
        "href": "/app/connections",
    })
}

fn failure_href(row: &FailureRow) -> String {
    let mut query = url::form_urlencoded::Serializer::new(String::from("/app/logs?status=failed"));
    query.append_pair("connector", &row.connector);
    if !row.request_id.is_empty() {
        query.append_pair("requestId", &row.request_id);
    }
    query.finish()
}

fn dead_run_href(run_id: &str) -> Option<String> {
    if run_id.is_empty()
        || run_id.len() > MAX_RUN_ID_BYTES
        || !run_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
    {
        return None;
    }
    let mut url = url::Url::parse("https://local.invalid/app/runs").ok()?;
    {
        let mut segments = url.path_segments_mut().ok()?;
        segments.push(run_id);
    }
    Some(url.path().to_owned())
}

fn project_dead_run_links(dead_runs: &mut Value) -> Result<()> {
    let rows = dead_runs
        .as_array_mut()
        .ok_or_else(|| ApiError::new("STORAGE_UNAVAILABLE"))?;
    rows.retain_mut(|row| {
        let Some(object) = row.as_object_mut() else {
            return false;
        };
        let Some(run_id) = object
            .get("runId")
            .and_then(Value::as_str)
            .map(str::to_owned)
        else {
            return false;
        };
        let Some(href) = dead_run_href(&run_id) else {
            return false;
        };
        object.insert("href".to_owned(), Value::String(href));
        true
    });
    Ok(())
}

fn parse_activity_rows(raw: String) -> Result<Vec<ActivityRow>> {
    let rows = serde_json::from_str::<Vec<Value>>(&raw)
        .map_err(|_| ApiError::new("STORAGE_UNAVAILABLE"))?;
    rows.into_iter()
        .map(|row| {
            Ok(ActivityRow {
                date: row
                    .get("date")
                    .and_then(Value::as_str)
                    .ok_or_else(|| ApiError::new("STORAGE_UNAVAILABLE"))?
                    .to_owned(),
                calls: json_count(row.get("calls"))?,
                succeeded: json_count(row.get("succeeded"))?,
                failed: json_count(row.get("failed"))?,
            })
        })
        .collect()
}

fn parse_failure_rows(raw: String) -> Result<Vec<FailureRow>> {
    let rows = serde_json::from_str::<Vec<Value>>(&raw)
        .map_err(|_| ApiError::new("STORAGE_UNAVAILABLE"))?;
    rows.into_iter()
        .map(|row| {
            Ok(FailureRow {
                request_id: row
                    .get("requestId")
                    .and_then(Value::as_str)
                    .ok_or_else(|| ApiError::new("STORAGE_UNAVAILABLE"))?
                    .to_owned(),
                connector: row
                    .get("connector")
                    .and_then(Value::as_str)
                    .ok_or_else(|| ApiError::new("STORAGE_UNAVAILABLE"))?
                    .to_owned(),
                action: row
                    .get("action")
                    .and_then(Value::as_str)
                    .ok_or_else(|| ApiError::new("STORAGE_UNAVAILABLE"))?
                    .to_owned(),
                error_code: row
                    .get("errorCode")
                    .and_then(Value::as_str)
                    .ok_or_else(|| ApiError::new("STORAGE_UNAVAILABLE"))?
                    .to_owned(),
            })
        })
        .collect()
}

fn parse_connection_rows(raw: String) -> Result<Vec<ConnectionRow>> {
    let rows = serde_json::from_str::<Vec<Value>>(&raw)
        .map_err(|_| ApiError::new("STORAGE_UNAVAILABLE"))?;
    rows.into_iter()
        .map(|row| {
            Ok(ConnectionRow {
                id: row
                    .get("id")
                    .and_then(Value::as_str)
                    .ok_or_else(|| ApiError::new("STORAGE_UNAVAILABLE"))?
                    .to_owned(),
                connector: row
                    .get("connector")
                    .and_then(Value::as_str)
                    .ok_or_else(|| ApiError::new("STORAGE_UNAVAILABLE"))?
                    .to_owned(),
                status: row
                    .get("status")
                    .and_then(Value::as_str)
                    .ok_or_else(|| ApiError::new("STORAGE_UNAVAILABLE"))?
                    .to_owned(),
                last_test_status: row
                    .get("lastTestStatus")
                    .and_then(Value::as_str)
                    .ok_or_else(|| ApiError::new("STORAGE_UNAVAILABLE"))?
                    .to_owned(),
            })
        })
        .collect()
}

fn json_count(value: Option<&Value>) -> Result<u64> {
    value
        .and_then(Value::as_u64)
        .ok_or_else(|| ApiError::new("STORAGE_UNAVAILABLE"))
}

fn count_value(value: i64) -> Result<u64> {
    u64::try_from(value).map_err(|_| ApiError::new("STORAGE_UNAVAILABLE"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{Duration, TimeZone, Utc};

    #[test]
    fn aggregation_uses_only_the_recent_window_and_preserves_status_counts() {
        let now = Utc.with_ymd_and_hms(2026, 9, 8, 12, 0, 0).unwrap();
        let connections = vec![
            ConnectionRow {
                id: "conn_slack".into(),
                connector: "slack".into(),
                status: "active".into(),
                last_test_status: "passed".into(),
            },
            ConnectionRow {
                id: "conn_notion".into(),
                connector: "notion".into(),
                status: "disconnected".into(),
                last_test_status: "failed".into(),
            },
            ConnectionRow {
                id: "conn_linear".into(),
                connector: "linear".into(),
                status: "active".into(),
                last_test_status: "passed".into(),
            },
        ];
        let actions = vec![
            ActionRow {
                request_id: "req_failed".into(),
                connector: "slack".into(),
                action: "send_message".into(),
                status: "failed".into(),
                error_code: "CONNECTOR_UNAVAILABLE".into(),
                created_at: now - Duration::hours(2),
            },
            ActionRow {
                request_id: "req_success".into(),
                connector: "slack".into(),
                action: "send_message".into(),
                status: "succeeded".into(),
                error_code: String::new(),
                created_at: now - Duration::days(1),
            },
            ActionRow {
                request_id: "req_old".into(),
                connector: "slack".into(),
                action: "send_message".into(),
                status: "failed".into(),
                error_code: "OLD_FAILURE".into(),
                created_at: now - Duration::hours(WINDOW_HOURS + 1),
            },
        ];

        let value = from_rows(7, &connections, &actions, now);

        assert_eq!(value["toolkitCount"], 7);
        assert_eq!(value["connectionCount"], 3);
        assert_eq!(value["activeConnectionCount"], 2);
        assert_eq!(value["actionCalls"], 2);
        assert_eq!(value["successfulCalls"], 1);
        assert_eq!(value["failedCalls"], 1);
        assert_eq!(value["successRate"], 50.0);
        assert_eq!(value["activity"].as_array().unwrap().len(), 2);
        assert_eq!(value["outcomes"].as_array().unwrap().len(), 2);
        assert_eq!(value["attention"].as_array().unwrap().len(), 2);
        assert_eq!(
            value["attention"][0]["href"],
            "/app/logs?status=failed&connector=slack&requestId=req_failed"
        );
        assert_eq!(value["attention"][1]["href"], "/app/connections");
        assert!(!value.to_string().contains("OLD_FAILURE"));
    }

    #[test]
    fn empty_snapshot_keeps_empty_states_explicit() {
        let now = Utc.with_ymd_and_hms(2026, 9, 8, 12, 0, 0).unwrap();
        let value = from_rows(4, &[], &[], now);

        assert_eq!(value["connectionCount"], 0);
        assert_eq!(value["actionCalls"], 0);
        assert!(value["successRate"].is_null());
        assert_eq!(value["activity"], serde_json::json!([]));
        assert_eq!(value["outcomes"], serde_json::json!([]));
        assert_eq!(value["attention"], serde_json::json!([]));
        assert_eq!(value["deadRunsUnavailable"], true);
        assert!(value.get("deadRuns").is_none());
    }

    #[test]
    fn dead_run_href_uses_bounded_detail_route_and_rejects_unsafe_ids() {
        assert_eq!(dead_run_href("run_42"), Some("/app/runs/run_42".to_owned()));
        for run_id in ["", "run/42", "run?cursor=1", "<script>", "run\\42"] {
            assert_eq!(
                dead_run_href(run_id),
                None,
                "unsafe run ID must not become a browser href: {run_id:?}"
            );
        }
        assert!(dead_run_href(&"r".repeat(257)).is_none());
    }

    #[test]
    fn dead_run_link_projection_replaces_supplied_href_and_skips_unsafe_ids() {
        let mut rows = serde_json::json!([
            {
                "runId": "run_42",
                "kind": "dead_run",
                "state": "dead",
                "href": "https://untrusted.example/runs"
            },
            {
                "runId": "run/43",
                "kind": "dead_run",
                "state": "dead",
                "href": "/app/runs?status=dead"
            }
        ]);

        project_dead_run_links(&mut rows).unwrap();

        assert_eq!(rows.as_array().unwrap().len(), 1);
        assert_eq!(rows[0]["href"], "/app/runs/run_42");
    }

    #[test]
    fn aggregation_includes_exact_24_hour_boundary_but_not_old_or_future_rows() {
        let now = Utc.with_ymd_and_hms(2026, 9, 8, 12, 0, 0).unwrap();
        let actions = vec![
            ActionRow {
                request_id: "req_boundary".into(),
                connector: "slack".into(),
                action: "send_message".into(),
                status: "succeeded".into(),
                error_code: String::new(),
                created_at: now - Duration::hours(24),
            },
            ActionRow {
                request_id: "req_old".into(),
                connector: "slack".into(),
                action: "send_message".into(),
                status: "failed".into(),
                error_code: "OLD".into(),
                created_at: now - Duration::hours(24) - Duration::seconds(1),
            },
            ActionRow {
                request_id: "req_unknown".into(),
                connector: "slack".into(),
                action: "send_message".into(),
                status: "running".into(),
                error_code: String::new(),
                created_at: now,
            },
            ActionRow {
                request_id: "req_future".into(),
                connector: "slack".into(),
                action: "send_message".into(),
                status: "failed".into(),
                error_code: "FUTURE".into(),
                created_at: now + Duration::seconds(1),
            },
        ];

        let value = from_rows(1, &[], &actions, now);

        assert_eq!(value["actionCalls"], 2);
        assert_eq!(value["successfulCalls"], 1);
        assert_eq!(value["failedCalls"], 0);
        assert_eq!(value["successRate"], 100.0);
        assert!(!value.to_string().contains("OLD"));
        assert!(!value.to_string().contains("FUTURE"));
    }

    #[test]
    #[ignore = "requires isolated APPCALL_ENGINE_POSTGRES_URL"]
    fn postgres_read_enforces_project_account_and_platform_boundaries() {
        let url = std::env::var("APPCALL_ENGINE_POSTGRES_URL").unwrap();
        let mut admin = postgres::Client::connect(&url, postgres::NoTls).unwrap();
        let schema = format!("overview_scope_test_{}", uuid::Uuid::new_v4().simple());
        admin
            .batch_execute(&format!(
                "CREATE SCHEMA {schema}; SET search_path TO {schema}"
            ))
            .unwrap();
        let mut scoped_url = url::Url::parse(&url).unwrap();
        scoped_url
            .query_pairs_mut()
            .append_pair("options", &format!("-csearch_path={schema}"));
        appcall_runtime::SqlxMigration::new(
            concat!(env!("CARGO_MANIFEST_DIR"), "/../../migrations"),
            scoped_url.as_str(),
            std::time::Duration::from_secs(30),
        )
        .unwrap()
        .apply()
        .unwrap();

        let mut client = postgres::Client::connect(scoped_url.as_str(), postgres::NoTls).unwrap();
        client
            .batch_execute(
                "INSERT INTO projects(id,name) VALUES
                    ('p','project p'),('q','project q');
                 INSERT INTO connections(id,project_id,connector,auth_type,status,last_test_status,external_account_id,credential_owner) VALUES
                    ('owned','p','slack','api_key','active','passed','brand-a','brand'),
                    ('degraded','p','notion','api_key','degraded','failed','brand-a','brand'),
                    ('unknown','p','linear','api_key','mystery','unknown','brand-a','brand'),
                    ('other-account','p','github','api_key','active','passed','brand-b','brand'),
                    ('shared','p','google','api_key','active','passed',NULL,'platform'),
                    ('other-project','q','slack','api_key','active','passed','brand-a','brand');
                 INSERT INTO action_logs(id,project_id,connection_id,connector,action,status,error_code,request_id,external_account_id,created_at) VALUES
                    ('recent-ok','p','owned','slack','send','succeeded','','req-recent-ok','brand-a',now() - interval '1 hour'),
                    ('recent-fail','p','degraded','notion','sync','failed','PROVIDER_DOWN','req-recent-fail','brand-a',now() - interval '2 hours'),
                    ('shared-ok','p','shared','google','list','succeeded','','req-shared-ok','brand-a',now() - interval '3 hours'),
                    ('other-account','p','other-account','github','list','failed','WRONG_ACCOUNT','req-other-account','brand-b',now() - interval '4 hours'),
                    ('other-project','q','other-project','slack','send','succeeded','','req-other-project','brand-a',now() - interval '5 hours'),
                    ('inside-window','p','owned','slack','send','succeeded','','req-inside-window','brand-a',now() - interval '23 hours'),
                    ('old','p','owned','slack','send','failed','OLD','req-old','brand-a',now() - interval '25 hours'),
                    ('future','p','owned','slack','send','failed','FUTURE','req-future','brand-a',now() + interval '1 hour')",
            )
            .unwrap();

        let value = read(
            &mut client,
            &Identity {
                project_id: "p".into(),
                account_id: "brand-a".into(),
                admin_scope: false,
            },
            9,
        )
        .unwrap();

        assert_eq!(value["deadRuns"], json!([]));
        client.batch_execute("INSERT INTO sync_jobs(id,project_id,connection_id,operation,status,dedup_key,updated_at) VALUES
            ('dead-a','p','owned','sync','failed','dead-a',now()-interval '2 days'),
            ('dead-b','p','owned','sync','cancelled','dead-b',now()-interval '2 days'),
            ('wrong-brand','p','other-account','sync','failed','wrong-brand',now()),
            ('platform-run','p','shared','sync','failed','platform-run',now()),
            ('wrong-project','q','other-project','sync','failed','wrong-project',now()),
            ('pending-run','p','owned','sync','pending','pending-run',now()),
            ('running-run','p','owned','sync','running','running-run',now()),
            ('successful-run','p','owned','sync','succeeded','successful-run',now())").unwrap();
        let scoped = Identity {
            project_id: "p".into(),
            account_id: "brand-a".into(),
            admin_scope: false,
        };
        let runs = read(&mut client, &scoped, 9).unwrap();
        assert_eq!(
            runs["deadRuns"]
                .as_array()
                .unwrap()
                .iter()
                .map(|v| v["runId"].as_str().unwrap())
                .collect::<Vec<_>>(),
            ["dead-b", "dead-a"]
        );
        assert_eq!(runs["deadRuns"][0]["kind"], "dead_run");
        assert_eq!(runs["deadRuns"][0]["state"], "dead");
        assert_eq!(runs["deadRuns"][0]["href"], "/app/runs/dead-b");
        let project = read(
            &mut client,
            &Identity {
                project_id: "p".into(),
                account_id: String::new(),
                admin_scope: false,
            },
            9,
        )
        .unwrap();
        assert_eq!(project["deadRuns"].as_array().unwrap().len(), 4);
        assert!(!project["deadRuns"].to_string().contains("wrong-project"));
        client.batch_execute("INSERT INTO sync_jobs(id,project_id,connection_id,operation,status,dedup_key,updated_at) SELECT 'bounded-'||n,'p','owned','sync','failed','bounded-'||n,now() FROM generate_series(1,7) n").unwrap();
        let bounded = read(&mut client, &scoped, 9).unwrap();
        assert_eq!(bounded["deadRuns"].as_array().unwrap().len(), 5);
        assert_eq!(bounded["deadRuns"][0]["runId"], "bounded-7");
        assert_eq!(bounded["deadRuns"][4]["runId"], "bounded-3");
        client
            .batch_execute("ALTER TABLE sync_jobs RENAME TO sync_jobs_unavailable")
            .unwrap();
        assert!(
            read(&mut client, &scoped, 9).is_err(),
            "missing sync storage must not become healthy empty"
        );

        assert_eq!(value["connectionCount"], 4);
        assert_eq!(value["activeConnectionCount"], 2);
        assert_eq!(value["actionCalls"], 4);
        assert_eq!(value["successfulCalls"], 3);
        assert_eq!(value["failedCalls"], 1);
        assert_eq!(value["successRate"], 75.0);
        assert_eq!(value["activity"].as_array().unwrap().len(), 4);
        assert_eq!(value["failureActivity"].as_array().unwrap().len(), 4);
        let encoded = value.to_string();
        assert!(encoded.contains("recent-fail"));
        assert!(encoded.contains("mystery"));
        assert!(!encoded.contains("WRONG_ACCOUNT"));
        assert!(!encoded.contains("OLD"));
        assert!(!encoded.contains("FUTURE"));
        assert!(!encoded.contains("other-project"));

        drop(client);
        admin
            .batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
            .unwrap();
    }
}
