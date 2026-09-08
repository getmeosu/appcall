//! Fixed synthetic queue evidence; never a worker, persisted operator grant,
//! or memory sync store.
use super::*;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};

const RUN_STATUSES: &[&str] = &[
    "pending",
    "running",
    "backingoff",
    "dead",
    "failed",
    "cancelled",
    "succeeded",
];

pub fn runs_fixture(scenario: Scenario, request: &DashboardRequest) -> Result<Value, Error> {
    if matches!(scenario, Scenario::RunsUnavailable | Scenario::Unavailable) {
        return Ok(json!({"synthetic":true,"unavailable":true}));
    }
    if scenario == Scenario::RunsMalformed {
        return Ok(
            json!({"synthetic":true,"runs":[{"id":"synthetic-invalid"}],"deadRuns":1,"records24h":340,"pagination":{"hasMore":false}}),
        );
    }
    if !matches!(
        scenario,
        Scenario::Runs
            | Scenario::RunsOperator
            | Scenario::RunsEmpty
            | Scenario::Empty
            | Scenario::RunHistory
            | Scenario::RunHistoryOperator
    ) {
        return Ok(json!({"synthetic":true,"unavailable":true}));
    }
    let empty = matches!(scenario, Scenario::RunsEmpty | Scenario::Empty);
    let operator_controls_available = matches!(
        scenario,
        Scenario::RunsOperator | Scenario::RunHistoryOperator
    );
    let mut rows = Vec::new();
    if !empty {
        for (index, health) in ["pending", "running", "backingoff", "dead", "succeeded"]
            .into_iter()
            .enumerate()
        {
            let spent = if health == "dead" { 10 } else { index as u64 };
            let run_now_eligible = matches!(health, "pending" | "backingoff");
            let reset_eligible = matches!(health, "pending" | "backingoff" | "dead");
            let cancel_eligible = matches!(health, "pending" | "running" | "backingoff");
            let status = match health {
                "backingoff" => "pending",
                "dead" => "failed",
                other => other,
            };
            rows.push(json!({
                "id":format!("synthetic-run-{index}-{}", "long-identifier-".repeat(9)),
                "connectionId":"synthetic-connection", "connector":"synthetic-mail", "tool":"messages.sync", "accountId":"synthetic-account",
                "status":status,"health":health,"attemptsSpent":spent,"maxAttempts":10,"attemptsRemaining":10-spent,
                "wakeAt":"2026-09-08T10:02:00Z", "leaseUntil":if health == "running" { "2026-09-08T10:01:00Z" } else { "" },
                "leaseRemainingSeconds":if health == "running" { 60 } else { 0 },
                "createdAt":"2026-09-08T09:00:00Z", "updatedAt":format!("2026-09-08T10:00:0{}Z", 4-index),
                "currentCursor":format!("synthetic-cursor-{}", "opaque-page-token-".repeat(12)),
                "lastError":if health == "dead" { "Synthetic terminal failure; no provider request was made." } else { "" },
                "runNowEligible":run_now_eligible,
                "resetEligible":reset_eligible,
                "cancelEligible":cancel_eligible,
                "runNowAllowed":operator_controls_available && run_now_eligible,
                "resetAllowed":operator_controls_available && reset_eligible,
                "cancelAllowed":operator_controls_available && cancel_eligible
            }));
        }
        if scenario == Scenario::RunHistory {
            rows.push(json!({
                "id":"synthetic-history-run",
                "connectionId":"synthetic-history-connection",
                "connector":"synthetic-mail",
                "tool":"messages.sync",
                "accountId":"synthetic-account",
                "status":"succeeded",
                "health":"succeeded",
                "attemptsSpent":1,
                "maxAttempts":8,
                "attemptsRemaining":7,
                "wakeAt":"2026-09-09T09:00:07.000000Z",
                "leaseUntil":"",
                "leaseRemainingSeconds":0,
                "createdAt":"2026-09-09T09:00:00.000000Z",
                "updatedAt":"2026-09-09T09:00:07.000000Z",
                "currentCursor":"",
                "lastError":"",
                "runNowEligible":false,
                "resetEligible":false,
                "cancelEligible":false,
                "runNowAllowed":false,
                "resetAllowed":false,
                "cancelAllowed":false,
            }));
        }
        if scenario == Scenario::RunHistoryOperator {
            rows.clear();
            rows.push(json!({
                "id":"synthetic-history-run",
                "connectionId":"synthetic-history-connection",
                "connector":"synthetic-mail",
                "tool":"messages.sync",
                "accountId":"synthetic-account",
                "status":"pending",
                "health":"backingoff",
                "attemptsSpent":1,
                "maxAttempts":8,
                "attemptsRemaining":7,
                "wakeAt":"2026-09-09T09:00:04.000000Z",
                "leaseUntil":"",
                "leaseRemainingSeconds":0,
                "createdAt":"2026-09-09T09:00:00.000000Z",
                "updatedAt":"2026-09-09T09:00:04.000000Z",
                "currentCursor":"cursor-history-next",
                "lastError":"Synthetic retry scheduled; no provider request was made.",
                "runNowEligible":true,
                "resetEligible":true,
                "cancelEligible":true,
                "runNowAllowed":true,
                "resetAllowed":true,
                "cancelAllowed":true,
            }));
        }
    }
    let field = |key: &str| request.fields.get(key).map(String::as_str).unwrap_or("");
    let status_filter = field("status");
    if !status_filter.is_empty() && !RUN_STATUSES.contains(&status_filter) {
        return Err(Error::Invalid);
    }
    let account_filter = if field("accountId").is_empty() {
        field("externalAccountId")
    } else {
        field("accountId")
    };
    rows.retain(|row| {
        [("connector", "connector"), ("tool", "tool")]
            .iter()
            .all(|(input, key)| field(input).is_empty() || row[*key].as_str() == Some(field(input)))
            && (status_filter.is_empty()
                || row["health"].as_str() == Some(status_filter)
                || matches!(status_filter, "failed" | "cancelled")
                    && row["status"].as_str() == Some(status_filter))
            && (account_filter.is_empty() || row["accountId"].as_str() == Some(account_filter))
    });
    let count_health = |health: &str| {
        rows.iter()
            .filter(|row| row["health"].as_str() == Some(health))
            .count()
    };
    let pending_runs = count_health("pending");
    let running_runs = count_health("running");
    let backingoff_runs = count_health("backingoff");
    let dead_runs = count_health("dead");
    // The preview has one fixed synthetic usage stream. Keep its records
    // metric scoped like the API query, while leaving it independent of the
    // queue status filter and page cursor.
    let records_scope_matches = [("connector", "synthetic-mail"), ("tool", "messages.sync")]
        .iter()
        .all(|(key, expected)| field(key).is_empty() || field(key) == *expected)
        && (account_filter.is_empty() || account_filter == "synthetic-account");
    let records_24h = usize::from(!empty && records_scope_matches) * 340;
    let cursor = |row: &Value| {
        URL_SAFE_NO_PAD.encode(format!(
            "{}|{}",
            row["updatedAt"].as_str().unwrap(),
            row["id"].as_str().unwrap()
        ))
    };
    let start = if field("cursor").is_empty() {
        0
    } else {
        rows.iter()
            .position(|row| cursor(row) == field("cursor"))
            .ok_or(Error::Invalid)?
            + 1
    };
    let limit = if field("limit").is_empty() {
        50
    } else {
        field("limit")
            .parse::<i32>()
            .map_err(|_| Error::Invalid)
            .and_then(|value| {
                if value < 0 {
                    Err(Error::Invalid)
                } else if value == 0 {
                    Ok(50)
                } else {
                    Ok(value.min(100) as usize)
                }
            })?
    };
    let selected = rows
        .iter()
        .skip(start)
        .take(limit)
        .cloned()
        .collect::<Vec<_>>();
    let more = start + selected.len() < rows.len();
    let mut pagination = json!({"hasMore":more});
    if more {
        pagination["nextCursor"] = cursor(selected.last().ok_or(Error::Invalid)?).into();
    }
    let mut result = json!({"synthetic":true,"runs":selected,"pagination":pagination,"pendingRuns":pending_runs,"runningRuns":running_runs,"backingoffRuns":backingoff_runs,"deadRuns":dead_runs,"records24h":records_24h,"workerHeartbeatUnavailable":true,"operatorControlsUnavailable":!operator_controls_available});
    if operator_controls_available {
        result["operatorAuthorized"] = true.into();
    }
    Ok(result)
}
