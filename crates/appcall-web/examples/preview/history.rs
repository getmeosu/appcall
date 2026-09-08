//! Persisted sync-run history fixtures for browser inspection.
//!
//! These values mirror the API reader's public DTO and represent committed
//! append-only observations only. They never call a provider or perform a
//! mutation; the operator variant displays trusted-looking controls while
//! keeping every preview POST unavailable.
use super::*;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};

const RUN_ID: &str = "synthetic-history-run";
const DEFAULT_LIMIT: usize = 50;
const MAX_LIMIT: usize = 100;

pub fn run_history_fixture(scenario: Scenario, request: &DashboardRequest) -> Result<Value, Error> {
    if !matches!(
        scenario,
        Scenario::RunHistory | Scenario::RunHistoryOperator
    ) {
        return Ok(json!({"synthetic":true,"unavailable":true}));
    }
    let operator = scenario == Scenario::RunHistoryOperator;

    let id = request.resource.as_deref().ok_or(Error::Invalid)?;
    if id != RUN_ID {
        // Keep the browser preview's ownership/not-found behavior opaque just
        // like the API reader: a foreign or unknown run has no distinguishable
        // fixture response.
        return Err(Error::NotFound);
    }
    let account = request
        .fields
        .get("accountId")
        .filter(|value| !value.is_empty())
        .or_else(|| {
            request
                .fields
                .get("externalAccountId")
                .filter(|value| !value.is_empty())
        });
    if account.is_some_and(|value| value.as_str() != "synthetic-account") {
        return Err(Error::NotFound);
    }
    let history_account_scope = account.cloned().unwrap_or_default();

    let limit = parse_limit(request.fields.get("limit").map(String::as_str))?;
    let after_seq = parse_cursor(request.fields.get("cursor").map(String::as_str))?;
    let mut events = persisted_events();
    if operator {
        // This is the exact persisted prefix through the retry event. The
        // final page/success events remain available only in run-history.
        events.truncate(5);
        events[2]["detail"]["recordsWritten"] = 3.into();
    }
    let start = after_seq.unwrap_or(0);
    let selected = events
        .iter()
        .filter(|event| event["seq"].as_i64().is_some_and(|seq| seq > start))
        .take(limit + 1)
        .cloned()
        .collect::<Vec<_>>();
    let has_more = selected.len() > limit;
    let mut page = selected;
    if has_more {
        page.pop();
    }
    let mut pagination = json!({"hasMore":has_more});
    if has_more {
        let seq = page
            .last()
            .and_then(|event| event["seq"].as_i64())
            .ok_or(Error::Unavailable)?;
        pagination["nextCursor"] = URL_SAFE_NO_PAD.encode(seq.to_string()).into();
    }

    let mut result = json!({
        "synthetic": true,
        "run": run_projection(operator),
        "history": {"complete": true, "events": page},
        "historyAccountScope": history_account_scope,
        "recordsObserved": if operator { 3 } else { 12 },
        "recordsPartial": false,
        "pagination": pagination,
        "policy": policy_projection(),
        "policyEventSeq": if operator { 4 } else { 6 },
        "policyRecordedAt": if operator {
            "2026-09-09T09:00:03.000000Z"
        } else {
            "2026-09-09T09:00:05.000000Z"
        },
    });
    if operator {
        result["operatorAuthorized"] = true.into();
        result["operatorControlsUnavailable"] = false.into();
    }
    Ok(result)
}

fn parse_limit(raw: Option<&str>) -> Result<usize, Error> {
    let Some(raw) = raw.filter(|raw| !raw.is_empty()) else {
        return Ok(DEFAULT_LIMIT);
    };
    let value = raw.parse::<i64>().map_err(|_| Error::Invalid)?;
    if value < 0 {
        return Err(Error::Invalid);
    }
    if value == 0 {
        return Ok(DEFAULT_LIMIT);
    }
    Ok(value.min(MAX_LIMIT as i64) as usize)
}

fn parse_cursor(raw: Option<&str>) -> Result<Option<i64>, Error> {
    let Some(raw) = raw.filter(|raw| !raw.is_empty()) else {
        return Ok(None);
    };
    if raw.len() > 4096 {
        return Err(Error::Invalid);
    }
    let decoded = URL_SAFE_NO_PAD.decode(raw).map_err(|_| Error::Invalid)?;
    let text = String::from_utf8(decoded).map_err(|_| Error::Invalid)?;
    let seq = text.parse::<i64>().map_err(|_| Error::Invalid)?;
    if !(1..=i32::MAX as i64).contains(&seq) {
        return Err(Error::Invalid);
    }
    Ok(Some(seq))
}

fn run_projection(operator: bool) -> Value {
    let mut run = json!({
        "id": RUN_ID,
        "connectionId": "synthetic-history-connection",
        "connector": "synthetic-mail",
        "tool": "messages.sync",
        "accountId": "synthetic-account",
        "status": "succeeded",
        "health": "succeeded",
        "attemptsSpent": 1,
        "maxAttempts": 8,
        "attemptsRemaining": 7,
        "wakeAt": "2026-09-09T09:00:07.000000Z",
        "leaseUntil": "",
        "leaseRemainingSeconds": 0,
        "createdAt": "2026-09-09T09:00:00.000000Z",
        "updatedAt": "2026-09-09T09:00:07.000000Z",
        "currentCursor": "",
        "runNowEligible": false,
        "resetEligible": false,
        "cancelEligible": false,
        "runNowAllowed": false,
        "resetAllowed": false,
        "cancelAllowed": false,
    });
    if operator {
        run["status"] = "pending".into();
        run["health"] = "backingoff".into();
        run["wakeAt"] = "2026-09-09T09:00:04.000000Z".into();
        run["updatedAt"] = "2026-09-09T09:00:04.000000Z".into();
        run["currentCursor"] = "cursor-history-next".into();
        run["runNowEligible"] = true.into();
        run["resetEligible"] = true.into();
        run["cancelEligible"] = true.into();
        run["runNowAllowed"] = true.into();
        run["resetAllowed"] = true.into();
        run["cancelAllowed"] = true.into();
    }
    run
}

fn policy_projection() -> Value {
    json!({
        "source": "service_config",
        "maxAttempts": 8,
        "leaseDurationMs": 30000,
        "retryBaseMs": "1000",
        "maxRetryDelayMs": 60000,
    })
}

fn persisted_events() -> Vec<Value> {
    [
        json!({
            "seq": 1,
            "kind": "scheduled",
            "at": "2026-09-09T09:00:00.000000Z",
            "detail": {"reason": "new_job"},
        }),
        json!({
            "seq": 2,
            "kind": "claimed",
            "at": "2026-09-09T09:00:01.000000Z",
            "detail": {"policy": policy_projection()},
        }),
        json!({
            "seq": 3,
            "kind": "page",
            "at": "2026-09-09T09:00:02.000000Z",
            "detail": {"recordsWritten": 5, "hasMore": true},
        }),
        json!({
            "seq": 4,
            "kind": "claimed",
            "at": "2026-09-09T09:00:03.000000Z",
            "detail": {"policy": policy_projection()},
        }),
        json!({
            "seq": 5,
            "kind": "retry",
            "at": "2026-09-09T09:00:04.000000Z",
            "detail": {"retryDelayMs": 250, "code": "SYNC_PROCESSING_FAILED"},
        }),
        json!({
            "seq": 6,
            "kind": "claimed",
            "at": "2026-09-09T09:00:05.000000Z",
            "detail": {"policy": policy_projection()},
        }),
        json!({
            "seq": 7,
            "kind": "page",
            "at": "2026-09-09T09:00:06.000000Z",
            "detail": {"recordsWritten": 7, "hasMore": false},
        }),
        json!({
            "seq": 8,
            "kind": "succeeded",
            "at": "2026-09-09T09:00:07.000000Z",
            "detail": {},
        }),
    ]
    .into_iter()
    .collect()
}
