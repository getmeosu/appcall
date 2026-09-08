//! Bounded, project/account-scoped history for one durable sync run.
//!
//! The reader consumes only the append-only event metadata persisted by the
//! sync repository.  It deliberately does not reconstruct a timeline from the
//! current queue row, attempts, cursor, or worker state.  Run and event reads
//! plus the aggregate/policy snapshot are selected by one PostgreSQL statement
//! so a concurrent lifecycle transition cannot produce a mixed response.

use super::first_query_values;
use crate::{ApiError, Identity, Result};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use postgres::GenericClient;
use serde_json::{json, Map, Value};

const DEFAULT_LIMIT: i64 = 50;
const MAX_LIMIT: i64 = 100;
const MAX_ID_BYTES: usize = 512;
const MAX_RUN_ID_BYTES: usize = 256;
const MAX_REASON_BYTES: usize = 96;
const MAX_CODE_BYTES: usize = 96;
const MAX_LEASE_DURATION_MS: u64 = 3_600_000;
const MAX_RETRY_DELAY_MS: u64 = 86_400_000;
const MAX_RETRY_BASE_DIGITS: usize = 128;
const MAX_RECORDS_PER_PAGE: u64 = 10_000;

#[derive(Debug, Default, PartialEq, Eq)]
pub struct RunHistoryQuery {
    pub limit: i64,
    pub after_seq: Option<i64>,
    pub account_id: String,
}

impl RunHistoryQuery {
    /// History is a new surface with the same path-safe ID contract as the
    /// console. Broader engine/list/control API identity limits are unchanged.
    pub fn validate_run_id(id: &str) -> Result<()> {
        if id.is_empty()
            || id.len() > MAX_RUN_ID_BYTES
            || matches!(id, "." | "..")
            || !id
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
        {
            return Err(ApiError::new("INVALID_REQUEST"));
        }
        Ok(())
    }

    pub fn parse(url: &url::Url) -> Result<Self> {
        let filters = first_query_values(url);
        for key in ["accountId", "externalAccountId"] {
            if filters.get(key).is_some_and(|value| {
                value.len() > MAX_ID_BYTES || value.bytes().any(|byte| byte.is_ascii_control())
            }) {
                return Err(ApiError::new("INVALID_RUN_FILTER"));
            }
        }
        let account_id = filters
            .get("accountId")
            .filter(|value| !value.is_empty())
            .or_else(|| filters.get("externalAccountId"))
            .cloned()
            .unwrap_or_default();
        let limit = match filters.get("limit").map(String::as_str).unwrap_or("") {
            "" => DEFAULT_LIMIT,
            raw => {
                let parsed = raw
                    .parse::<i64>()
                    .map_err(|_| ApiError::new("INVALID_LIMIT"))?;
                if parsed < 0 {
                    return Err(ApiError::new("INVALID_LIMIT"));
                }
                if parsed == 0 {
                    DEFAULT_LIMIT
                } else {
                    parsed.min(MAX_LIMIT)
                }
            }
        };
        let after_seq = match filters.get("cursor").filter(|cursor| !cursor.is_empty()) {
            None => None,
            Some(raw) => {
                if raw.len() > 4096 {
                    return Err(ApiError::new("INVALID_CURSOR"));
                }
                let decoded = URL_SAFE_NO_PAD
                    .decode(raw)
                    .map_err(|_| ApiError::new("INVALID_CURSOR"))?;
                let text =
                    String::from_utf8(decoded).map_err(|_| ApiError::new("INVALID_CURSOR"))?;
                let seq = text
                    .parse::<i64>()
                    .map_err(|_| ApiError::new("INVALID_CURSOR"))?;
                if !(1..=i32::MAX as i64).contains(&seq) {
                    return Err(ApiError::new("INVALID_CURSOR"));
                }
                Some(seq)
            }
        };
        Ok(Self {
            limit,
            after_seq,
            account_id,
        })
    }
}

/// Read the persisted history and current safe run projection for one run.
///
/// The caller supplies an already-authenticated identity.  Ownership is
/// repeated in the SQL predicate, including the non-platform account fence,
/// so an account-scoped caller gets the same not-found response for a missing,
/// cross-account, or cross-project run.
pub fn read(
    client: &mut impl GenericClient,
    identity: &Identity,
    id: &str,
    query: &RunHistoryQuery,
) -> Result<Value> {
    if identity.project_id.is_empty() {
        return Err(ApiError::new("UNAUTHORIZED"));
    }
    RunHistoryQuery::validate_run_id(id)?;
    validate_query(query)?;
    let requested_account = query.account_id.as_str();
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
    // One statement gives PostgreSQL one MVCC snapshot for the run row, its
    // event page, the all-history aggregate, and the latest policy evidence.
    // Event detail is projected again in Rust below, because historical rows
    // may predate current validation and must never become a JSON passthrough.
    let row = client
        .query_opt(
            HISTORY_SQL,
            &[
                &identity.project_id,
                &account,
                &id,
                &query.after_seq.unwrap_or(0),
                &(query.limit + 1),
            ],
        )
        .map_err(super::db_error)?
        .ok_or_else(|| ApiError::new("RUN_NOT_FOUND"))?;

    let run_text = row
        .get::<_, Option<String>>(0)
        .ok_or_else(|| ApiError::new("RUN_NOT_FOUND"))?;
    let mut run: Value =
        serde_json::from_str(&run_text).map_err(|_| ApiError::new("STORAGE_UNAVAILABLE"))?;
    let raw_events: String = row.get(1);
    let raw_events: Value =
        serde_json::from_str(&raw_events).map_err(|_| ApiError::new("STORAGE_UNAVAILABLE"))?;
    let mut events = raw_events
        .as_array()
        .ok_or_else(|| ApiError::new("STORAGE_UNAVAILABLE"))?
        .iter()
        .map(project_event)
        .collect::<Result<Vec<_>>>()?;
    let has_more = events.len() > query.limit as usize;
    events.truncate(query.limit as usize);

    let first_seq = row.get::<_, Option<i32>>(2);
    let first_kind = row.get::<_, Option<String>>(3);
    let first_reason = row.get::<_, Option<String>>(4);
    let complete = first_seq == Some(1)
        && first_kind.as_deref() == Some("scheduled")
        && first_reason.as_deref() == Some("new_job");
    let records_observed = row.get::<_, i64>(5).max(0);

    let mut history = json!({
        "complete": complete,
        "events": events,
    });
    if !complete {
        history["notice"] = "History before the first recorded event is unavailable.".into();
    }
    let mut pagination = json!({"hasMore": has_more});
    if has_more {
        if let Some(last) = history["events"].as_array().and_then(|items| items.last()) {
            let seq = last
                .get("seq")
                .and_then(Value::as_i64)
                .ok_or_else(|| ApiError::new("STORAGE_UNAVAILABLE"))?;
            pagination["nextCursor"] = URL_SAFE_NO_PAD.encode(seq.to_string()).into();
        }
    }

    let mut result = json!({
        "run": run.clone(),
        "history": history,
        "recordsObserved": records_observed,
        "recordsPartial": !complete,
        "pagination": pagination,
    });

    // The latest claimed event is selected globally by sequence, independent
    // of the displayed page. An absent or malformed policy stays unknown and
    // never falls back to DEFAULT_MAX_ATTEMPTS or another local default.
    if let Some(raw_policy) = row
        .get::<_, Option<String>>(6)
        .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
    {
        if let Some(policy) = project_policy(&raw_policy) {
            if let Some(run_object) = run.as_object_mut() {
                if let Some(max_attempts) = policy.get("maxAttempts").and_then(Value::as_u64) {
                    let attempts_spent = run_object
                        .get("attemptsSpent")
                        .and_then(Value::as_u64)
                        .unwrap_or(0);
                    run_object.insert("maxAttempts".into(), max_attempts.into());
                    run_object.insert(
                        "attemptsRemaining".into(),
                        max_attempts.saturating_sub(attempts_spent).into(),
                    );
                }
            }
            result["run"] = run;
            result["policy"] = policy;
            if let Some(policy_seq) = row.get::<_, Option<i32>>(7) {
                result["policyEventSeq"] = policy_seq.into();
            }
            if let Some(policy_at) = row.get::<_, Option<String>>(8) {
                result["policyRecordedAt"] = policy_at.into();
            }
        }
    }
    Ok(result)
}

fn validate_query(query: &RunHistoryQuery) -> Result<()> {
    if !(1..=MAX_LIMIT).contains(&query.limit) {
        return Err(ApiError::new("INVALID_LIMIT"));
    }
    if query
        .after_seq
        .is_some_and(|seq| !(1..=i32::MAX as i64).contains(&seq))
    {
        return Err(ApiError::new("INVALID_CURSOR"));
    }
    if query.account_id.len() > MAX_ID_BYTES
        || query.account_id.bytes().any(|byte| byte.is_ascii_control())
    {
        return Err(ApiError::new("INVALID_RUN_FILTER"));
    }
    Ok(())
}

// Keep the run projection aligned with Runs while intentionally excluding
// sync_jobs.input, worker_id, and last_error.  The current timestamp is read
// once by `captured` and reused for health/lease fields in the same statement.
const HISTORY_SQL: &str = r#"
WITH captured AS (
    SELECT statement_timestamp() AS at
), scoped_run AS (
    SELECT
        j.id,
        j.connection_id,
        j.operation,
        j.status,
        GREATEST(j.attempts, 0) AS attempts,
        j.run_after,
        j.leased_until,
        j.created_at,
        j.updated_at,
        COALESCE(cp.cursor, '') AS current_cursor,
        COALESCE(c.connector, '') AS connector,
        COALESCE(c.external_account_id, '') AS account_id,
        COALESCE(j.status = 'running' AND j.leased_until > captured.at, false) AS active_lease,
        captured.at AS captured_at
    FROM sync_jobs j
    JOIN connections c
        ON c.id = j.connection_id
       AND c.project_id = j.project_id
    LEFT JOIN sync_job_checkpoints cp ON cp.job_id = j.id
    CROSS JOIN captured
    WHERE j.project_id = $1
      AND (
          $2 = ''
          OR (c.external_account_id = $2 AND c.credential_owner <> 'platform')
      )
      AND j.id = $3
), all_events AS (
    SELECT e.seq, e.kind, e.at, e.detail
    FROM sync_job_events e
    JOIN scoped_run r ON r.id = e.job_id
), page_events AS (
    SELECT seq, kind, at, detail
    FROM all_events
    WHERE seq > $4::bigint
    ORDER BY seq ASC
    LIMIT $5::bigint
), first_event AS (
    SELECT seq, kind, detail
    FROM all_events
    ORDER BY seq ASC
    LIMIT 1
), latest_claimed AS (
    SELECT (detail->'policy')::text AS policy, seq, at
    FROM all_events
    WHERE kind = 'claimed'
    ORDER BY seq DESC
    LIMIT 1
), aggregate AS (
    SELECT COALESCE(SUM(
        CASE
            WHEN kind = 'page'
             AND octet_length(detail->>'recordsWritten') <= 18
             AND (detail->>'recordsWritten') ~ '^[0-9]+$'
            THEN (detail->>'recordsWritten')::bigint
            ELSE 0
        END
    ), 0)::bigint AS records_observed
    FROM all_events
)
SELECT
    (
        SELECT jsonb_build_object(
            'id', r.id,
            'connectionId', r.connection_id,
            'connector', r.connector,
            'tool', r.operation,
            'accountId', r.account_id,
            'status', r.status,
            'health', CASE
                WHEN r.status IN ('failed', 'cancelled') THEN 'dead'
                WHEN r.status = 'running' AND r.active_lease THEN 'running'
                WHEN r.status = 'running' THEN 'pending'
                WHEN r.status = 'pending' AND r.run_after > r.captured_at THEN 'backingoff'
                WHEN r.status = 'succeeded' THEN 'succeeded'
                ELSE r.status
            END,
            'attemptsSpent', r.attempts,
            'wakeAt', COALESCE(to_char(r.run_after AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), ''),
            'leaseUntil', COALESCE(to_char(r.leased_until AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), ''),
            'leaseRemainingSeconds', GREATEST(COALESCE(FLOOR(EXTRACT(EPOCH FROM (r.leased_until-r.captured_at)))::bigint, 0), 0),
            'createdAt', COALESCE(to_char(r.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), ''),
            'updatedAt', COALESCE(to_char(r.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), ''),
            'currentCursor', r.current_cursor,
            'runNowEligible', (r.status = 'pending' OR (r.status = 'running' AND NOT r.active_lease)),
            'resetEligible', (r.status = 'pending' OR r.status = 'failed' OR (r.status = 'running' AND NOT r.active_lease)),
            'cancelEligible', (r.status = 'pending' OR r.status = 'running'),
            'runNowAllowed', false,
            'resetAllowed', false,
            'cancelAllowed', false
        )::text
        FROM scoped_run r
    ) AS run,
    COALESCE(
        (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'seq', e.seq,
                    'kind', e.kind,
                    'at', to_char(e.at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
                    'detail', e.detail
                ) ORDER BY e.seq ASC
            )::text
            FROM page_events e
        ),
        '[]'
    ) AS events,
    (SELECT seq FROM first_event) AS first_seq,
    (SELECT kind FROM first_event) AS first_kind,
    (SELECT detail->>'reason' FROM first_event) AS first_reason,
    (SELECT records_observed FROM aggregate) AS records_observed,
    (SELECT policy FROM latest_claimed) AS latest_policy,
    (SELECT seq FROM latest_claimed) AS policy_seq,
    (SELECT to_char(at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') FROM latest_claimed) AS policy_at
"#;

fn project_event(raw: &Value) -> Result<Value> {
    let object = raw
        .as_object()
        .ok_or_else(|| ApiError::new("STORAGE_UNAVAILABLE"))?;
    let seq = object
        .get("seq")
        .and_then(Value::as_i64)
        .filter(|seq| *seq > 0)
        .ok_or_else(|| ApiError::new("STORAGE_UNAVAILABLE"))?;
    let kind = object
        .get("kind")
        .and_then(Value::as_str)
        .ok_or_else(|| ApiError::new("STORAGE_UNAVAILABLE"))?;
    let at = object
        .get("at")
        .and_then(Value::as_str)
        .ok_or_else(|| ApiError::new("STORAGE_UNAVAILABLE"))?;
    let detail = project_detail(object.get("detail").unwrap_or(&Value::Null));
    Ok(json!({"seq": seq, "kind": kind, "at": at, "detail": detail}))
}

fn project_detail(raw: &Value) -> Value {
    let Some(object) = raw.as_object() else {
        return json!({});
    };
    let mut detail = Map::new();
    if let Some(reason) = object.get("reason").and_then(Value::as_str) {
        if bounded_text(reason, MAX_REASON_BYTES) {
            detail.insert("reason".into(), reason.into());
        }
    }
    if let Some(code) = object.get("code").and_then(Value::as_str) {
        if bounded_text(code, MAX_CODE_BYTES)
            && code.chars().all(|character| {
                character.is_ascii_uppercase() || character.is_ascii_digit() || character == '_'
            })
        {
            detail.insert("code".into(), code.into());
        }
    }
    if let Some(records) = object
        .get("recordsWritten")
        .and_then(Value::as_u64)
        .filter(|records| *records <= MAX_RECORDS_PER_PAGE)
    {
        detail.insert("recordsWritten".into(), records.into());
    }
    if let Some(has_more) = object.get("hasMore").and_then(Value::as_bool) {
        detail.insert("hasMore".into(), has_more.into());
    }
    if let Some(delay) = object
        .get("retryDelayMs")
        .and_then(Value::as_u64)
        .filter(|delay| *delay <= MAX_RETRY_DELAY_MS)
    {
        detail.insert("retryDelayMs".into(), delay.into());
    }
    if let Some(policy) = object.get("policy").and_then(project_policy) {
        detail.insert("policy".into(), policy);
    }
    Value::Object(detail)
}

fn project_policy(raw: &Value) -> Option<Value> {
    let object = raw.as_object()?;
    let source = object.get("source").and_then(Value::as_str)?;
    let max_attempts = object.get("maxAttempts").and_then(Value::as_u64)?;
    let lease_duration_ms = object.get("leaseDurationMs").and_then(Value::as_u64)?;
    let retry_base_ms = object.get("retryBaseMs").and_then(Value::as_str)?;
    let max_retry_delay_ms = object.get("maxRetryDelayMs").and_then(Value::as_u64)?;
    if object.len() != 5
        || source != "service_config"
        || max_attempts == 0
        || max_attempts > u32::MAX as u64
        || lease_duration_ms > MAX_LEASE_DURATION_MS
        || max_retry_delay_ms > MAX_RETRY_DELAY_MS
        || !bounded_decimal(retry_base_ms, MAX_RETRY_BASE_DIGITS)
    {
        return None;
    }
    Some(json!({
        "source": source,
        "maxAttempts": max_attempts,
        "leaseDurationMs": lease_duration_ms,
        "retryBaseMs": retry_base_ms,
        "maxRetryDelayMs": max_retry_delay_ms,
    }))
}

fn bounded_text(value: &str, max_bytes: usize) -> bool {
    value.len() <= max_bytes && !value.chars().any(char::is_control)
}

fn bounded_decimal(value: &str, max_digits: usize) -> bool {
    !value.is_empty()
        && value.len() <= max_digits
        && value.bytes().all(|byte| byte.is_ascii_digit())
}

#[cfg(test)]
mod query_contract_tests {
    use super::*;

    #[test]
    fn manually_constructed_query_values_are_rejected_before_sql() {
        for query in [
            RunHistoryQuery {
                limit: 0,
                after_seq: None,
                account_id: String::new(),
            },
            RunHistoryQuery {
                limit: i64::MAX,
                after_seq: None,
                account_id: String::new(),
            },
        ] {
            assert_eq!(validate_query(&query).unwrap_err().code, "INVALID_LIMIT");
        }
        for after_seq in [Some(0), Some(i32::MAX as i64 + 1)] {
            let query = RunHistoryQuery {
                limit: 50,
                after_seq,
                account_id: String::new(),
            };
            assert_eq!(validate_query(&query).unwrap_err().code, "INVALID_CURSOR");
        }
        for account_id in ["a".repeat(MAX_ID_BYTES + 1), "bad\n".into()] {
            let query = RunHistoryQuery {
                limit: 50,
                after_seq: None,
                account_id,
            };
            assert_eq!(
                validate_query(&query).unwrap_err().code,
                "INVALID_RUN_FILTER"
            );
        }
    }

    #[test]
    fn policy_projection_matches_persisted_policy_bounds() {
        let valid = json!({
            "source": "service_config",
            "maxAttempts": u32::MAX,
            "leaseDurationMs": 3_600_000,
            "retryBaseMs": "9".repeat(128),
            "maxRetryDelayMs": 86_400_000,
        });
        assert!(project_policy(&valid).is_some());

        for invalid in [
            json!({
                "source": "service_config",
                "maxAttempts": 1,
                "leaseDurationMs": 3_600_001,
                "retryBaseMs": "1",
                "maxRetryDelayMs": 1,
            }),
            json!({
                "source": "service_config",
                "maxAttempts": 1,
                "leaseDurationMs": 1,
                "retryBaseMs": "1",
                "maxRetryDelayMs": 86_400_001,
            }),
            json!({
                "source": "service_config",
                "maxAttempts": 1,
                "leaseDurationMs": 1,
                "retryBaseMs": "1".repeat(129),
                "maxRetryDelayMs": 1,
            }),
        ] {
            assert!(project_policy(&invalid).is_none(), "accepted {invalid}");
        }
    }
}
