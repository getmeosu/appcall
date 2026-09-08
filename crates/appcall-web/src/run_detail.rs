//! Focused renderer contract for the persisted sync-run detail view.
//!
//! The API reader owns the DTO shape. This renderer consumes only persisted
//! observations; the route and data-reader wiring remain separate concerns.

use crate::{http::escape, ui, Error};
use serde_json::{Map, Value};

const MAX_ID_BYTES: usize = 256;
const MAX_CURSOR_BYTES: usize = 4096;
const MAX_EVENT_COUNT: usize = 128;
const MAX_EVENT_TEXT_BYTES: usize = 512;
const MAX_POLICY_TEXT_BYTES: usize = 128;

/// Renders one bounded, server-owned run detail document.
///
/// The reader supplies only persisted observations.  This renderer deliberately
/// does not derive a timeline from attempt counters. Operator confirmations
/// reuse the Runs controls and require the trusted browser authorization DTO.
pub(crate) fn standalone(value: &Value, run_id: &str) -> Result<String, Error> {
    if !valid_identifier(run_id) {
        return Err(Error::Invalid);
    }
    let data = value.get("data").unwrap_or(value);
    let run = data
        .get("run")
        .and_then(Value::as_object)
        .ok_or(Error::Unavailable)?;
    let dto_id = required_identifier(run, "id")?;
    if dto_id != run_id {
        return Err(Error::Unavailable);
    }
    let history = data
        .get("history")
        .and_then(Value::as_object)
        .ok_or(Error::Unavailable)?;
    let events = history
        .get("events")
        .and_then(Value::as_array)
        .ok_or(Error::Unavailable)?;
    if events.len() > MAX_EVENT_COUNT {
        return Err(Error::Unavailable);
    }

    let account_id = bounded_text(run.get("accountId"), MAX_ID_BYTES).unwrap_or("");
    let mut html = ui::back_link(
        "Back to Runs",
        ui::LocalPath::new("/app/runs").ok_or(Error::Invalid)?,
    );
    html.push_str(&render_run_header(run, account_id));
    html.push_str(&crate::pages::runs_feedback()?);
    let account_scope = history_account_scope(data);
    let unavailable = account_scope.is_none()
        || data.get("operatorAuthorized").and_then(Value::as_bool) != Some(true)
        || data
            .get("operatorControlsUnavailable")
            .and_then(Value::as_bool)
            != Some(false);
    let mut controls = String::new();
    for action in ["run-now", "reset", "cancel"] {
        controls.push_str(&crate::pages::run_control(
            action,
            run_id,
            &data["run"],
            unavailable,
            account_scope.unwrap_or(""),
        )?);
    }
    if !controls.is_empty() {
        html.push_str(&format!("<div class=\"run-detail-controls\" role=\"group\" aria-label=\"Run operator controls\">{controls}</div>"));
    } else if unavailable {
        html.push_str("<p class=\"run-detail-operator-notice\">Operator controls unavailable. A trusted operator grant is required.</p>");
    }
    html.push_str(&render_summary(run, data, history));
    html.push_str(&render_policy(data));
    html.push_str(&render_history(history, events));
    html.push_str(&render_pagination(data, run_id)?);
    html.push_str("</section>");
    Ok(html)
}

fn valid_identifier(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= MAX_ID_BYTES
        && !matches!(value, "." | "..")
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
}

fn required_identifier(run: &Map<String, Value>, key: &str) -> Result<String, Error> {
    let value = bounded_text(run.get(key), MAX_ID_BYTES).ok_or(Error::Unavailable)?;
    if !valid_identifier(value) {
        return Err(Error::Unavailable);
    }
    Ok(value.to_owned())
}

fn bounded_text(value: Option<&Value>, max: usize) -> Option<&str> {
    value
        .and_then(Value::as_str)
        .filter(|text| !text.is_empty() && text.len() <= max)
        .filter(|text| !text.chars().any(|character| character.is_control()))
}

fn optional_text(value: Option<&Value>, max: usize) -> Option<&str> {
    value.and_then(Value::as_str).filter(|text| {
        text.is_empty()
            || (text.len() <= max && !text.chars().any(|character| character.is_control()))
    })
}

fn nonnegative(value: Option<&Value>) -> Option<u64> {
    value.and_then(|value| {
        value.as_u64().or_else(|| {
            value
                .as_i64()
                .filter(|value| *value >= 0)
                .map(|value| value as u64)
        })
    })
}

fn unavailable(label: &str) -> String {
    format!(
        "<span class=\"runs-telemetry-unavailable\" aria-label=\"{} unavailable\">Unavailable</span>",
        escape(label)
    )
}

fn field(run: &Map<String, Value>, key: &str, label: &str) -> String {
    bounded_text(run.get(key), MAX_EVENT_TEXT_BYTES)
        .map(escape)
        .unwrap_or_else(|| unavailable(label))
}

fn health(value: Option<&Value>) -> (&'static str, ui::Tone) {
    match value.and_then(Value::as_str) {
        Some("pending") => ("Pending", ui::Tone::Idle),
        Some("running") => ("Running", ui::Tone::Running),
        Some("backingoff") => ("Backing off", ui::Tone::Warn),
        Some("dead" | "failed") => ("Dead", ui::Tone::Dead),
        Some("cancelled") => ("Cancelled", ui::Tone::Idle),
        Some("succeeded") => ("Succeeded", ui::Tone::Ok),
        _ => ("Unknown", ui::Tone::Warn),
    }
}

fn render_run_header(run: &Map<String, Value>, account_id: &str) -> String {
    let (health_label, tone) = health(run.get("health"));
    format!(
        "<section id=\"run-detail\" data-runs-page aria-labelledby=\"run-detail-heading\"><header class=\"runs-header\"><h2 id=\"run-detail-heading\">Run <code class=\"runs-code\">{}</code></h2><p>{}</p></header><p class=\"runs-secondary\">{} / {} · account {}</p>",
        field(run, "id", "Run ID"),
        ui::state(tone, health_label),
        field(run, "connector", "Connector"),
        field(run, "tool", "Tool"),
        if account_id.is_empty() {
            unavailable("Account")
        } else {
            escape(account_id)
        },
    )
}

fn render_summary(run: &Map<String, Value>, data: &Value, history: &Map<String, Value>) -> String {
    let complete = history.get("complete").and_then(Value::as_bool) == Some(true);
    let records_partial = match data.get("recordsPartial") {
        None => false,
        Some(value) => value.as_bool() != Some(false),
    } || !complete;
    let records_label = if records_partial {
        "Records observed (partial)"
    } else {
        "Records observed"
    };
    let records = nonnegative(data.get("recordsObserved"))
        .map(|value| value.to_string())
        .unwrap_or_else(|| unavailable("Records observed"));
    let cursor = match optional_text(run.get("currentCursor"), MAX_CURSOR_BYTES) {
        Some("") | None => unavailable("Cursor"),
        Some(value) => format!("<code class=\"runs-code\">{}</code>", escape(value)),
    };
    let attempts = match (
        nonnegative(run.get("attemptsSpent")),
        nonnegative(run.get("attemptsRemaining")),
    ) {
        (Some(spent), Some(remaining)) => format!("{spent} spent · {remaining} remaining"),
        _ => unavailable("Attempts"),
    };
    format!(
        "<dl class=\"runs-stats run-detail-summary\"><div><dt>Connector</dt><dd>{}</dd></div><div><dt>Tool</dt><dd>{}</dd></div><div><dt>Account</dt><dd>{}</dd></div><div><dt>Attempts</dt><dd>{attempts}</dd></div><div id=\"run-detail-cursor\"><dt>Cursor</dt><dd>{cursor}</dd></div><div><dt>{records_label}</dt><dd>{records}</dd></div></dl>",
        field(run, "connector", "Connector"),
        field(run, "tool", "Tool"),
        field(run, "accountId", "Account"),
    )
}

fn decimal_text(value: Option<&Value>) -> Option<&str> {
    bounded_text(value, MAX_POLICY_TEXT_BYTES)
        .filter(|text| text.bytes().all(|byte| byte.is_ascii_digit()))
}

fn render_policy(data: &Value) -> String {
    let Some(policy) = data.get("policy").and_then(Value::as_object) else {
        return policy_unavailable();
    };
    let valid = policy.get("source").and_then(Value::as_str) == Some("service_config")
        && policy
            .get("maxAttempts")
            .and_then(Value::as_u64)
            .is_some_and(|value| value > 0 && value <= u32::MAX as u64)
        && policy
            .get("leaseDurationMs")
            .and_then(Value::as_u64)
            .is_some()
        && decimal_text(policy.get("retryBaseMs")).is_some()
        && policy
            .get("maxRetryDelayMs")
            .and_then(Value::as_u64)
            .is_some()
        && data
            .get("policyEventSeq")
            .and_then(Value::as_u64)
            .is_some_and(|value| value > 0)
        && bounded_text(data.get("policyRecordedAt"), MAX_EVENT_TEXT_BYTES).is_some();
    if !valid {
        return policy_unavailable();
    }
    let max_attempts = policy
        .get("maxAttempts")
        .and_then(Value::as_u64)
        .expect("validated policy max attempts");
    let lease_ms = policy
        .get("leaseDurationMs")
        .and_then(Value::as_u64)
        .expect("validated policy lease duration");
    let retry_ms = decimal_text(policy.get("retryBaseMs")).expect("validated policy retry base");
    let max_retry_ms = policy
        .get("maxRetryDelayMs")
        .and_then(Value::as_u64)
        .expect("validated policy max retry delay");
    let event_seq = data
        .get("policyEventSeq")
        .and_then(Value::as_u64)
        .expect("validated policy event sequence");
    let recorded_at = bounded_text(data.get("policyRecordedAt"), MAX_EVENT_TEXT_BYTES)
        .expect("validated policy timestamp");
    format!(
        "<section id=\"run-detail-policy\" class=\"runs-card\" aria-labelledby=\"run-detail-policy-heading\"><h3 id=\"run-detail-policy-heading\">Recorded policy</h3><dl><div><dt>Source</dt><dd data-policy-source=\"service_config\">service_config</dd></div><div><dt>Maximum attempts</dt><dd>{max_attempts}</dd></div><div><dt>Lease duration (ms)</dt><dd>{lease_ms}</dd></div><div><dt>Retry base (ms)</dt><dd>{}</dd></div><div><dt>Maximum retry delay (ms)</dt><dd>{max_retry_ms}</dd></div></dl><p class=\"runs-secondary\">Recorded at event <code class=\"runs-code\">{event_seq}</code> at <time datetime=\"{}\">{}</time></p></section>",
        escape(retry_ms),
        escape(recorded_at),
        escape(recorded_at),
    )
}

fn policy_unavailable() -> String {
    "<section id=\"run-detail-policy\" class=\"runs-card\" aria-labelledby=\"run-detail-policy-heading\"><h3 id=\"run-detail-policy-heading\">Policy</h3><p>Policy unavailable.</p></section>".to_owned()
}

fn reason_label(reason: &str) -> Option<&'static str> {
    match reason {
        "new_job" => Some("New job"),
        "run_now" => Some("Run now"),
        "reset_attempts" => Some("Reset attempts"),
        "operator_cancelled" => Some("Operator cancelled"),
        "rate_limited" => Some("Rate limited"),
        "lease_expired" => Some("Lease expired"),
        "sync_processing_failed" => Some("Sync processing failed"),
        _ => None,
    }
}

fn code_label(code: &str) -> Option<&'static str> {
    match code {
        "INVALID_INPUT" => Some("Invalid input"),
        "INVALID_PAGE" => Some("Invalid page"),
        "UNSUPPORTED_MODEL" => Some("Unsupported model"),
        "UNAVAILABLE" => Some("Unavailable"),
        "CURSOR_CYCLE" => Some("Cursor cycle"),
        "RUNNER_ERROR" => Some("Runner error"),
        "PROVIDER_ERROR" => Some("Provider error"),
        "RATE_LIMITED" => Some("Rate limited"),
        "NOT_FOUND" => Some("Not found"),
        "CONFLICT" => Some("Conflict"),
        "SYNC_PROCESSING_FAILED" => Some("Sync processing failed"),
        "LEASE_LOST" => Some("Lease lost"),
        _ => None,
    }
}

fn event_kind(kind: &str) -> (&'static str, ui::Tone) {
    match kind {
        "scheduled" => ("Scheduled", ui::Tone::Idle),
        "claimed" => ("Claimed", ui::Tone::Running),
        "page" => ("Page progress", ui::Tone::Running),
        "retry" => ("Retry scheduled", ui::Tone::Warn),
        "lease_expired" => ("Lease expired", ui::Tone::Warn),
        "succeeded" => ("Succeeded", ui::Tone::Ok),
        "failed" => ("Failed", ui::Tone::Dead),
        "cancelled" => ("Cancelled", ui::Tone::Idle),
        _ => ("Unknown event", ui::Tone::Warn),
    }
}

fn render_detail(kind: &str, detail: Option<&Value>) -> String {
    let Some(detail) = detail.and_then(Value::as_object) else {
        return String::new();
    };
    let mut html = String::new();
    if let Some(reason) =
        bounded_text(detail.get("reason"), MAX_EVENT_TEXT_BYTES).and_then(reason_label)
    {
        html.push_str(&format!(
            "<span class=\"run-detail-reason\">{reason}</span>"
        ));
    }
    match kind {
        "page" => {
            if let Some(records) =
                nonnegative(detail.get("recordsWritten")).filter(|value| *value <= 10_000)
            {
                html.push_str(&format!(
                    "<span class=\"run-detail-progress\">{records} records committed</span>"
                ));
            }
            if detail.get("hasMore").and_then(Value::as_bool) == Some(true) {
                html.push_str("<span class=\"run-detail-progress\">More pages remain</span>");
            }
        }
        "retry" => {
            if let Some(delay) =
                nonnegative(detail.get("retryDelayMs")).filter(|value| *value <= 86_400_000)
            {
                html.push_str(&format!(
                    "<span class=\"run-detail-progress\">Retry after {delay} ms</span>"
                ));
            }
        }
        "failed" => {
            if let Some(code) =
                bounded_text(detail.get("code"), MAX_EVENT_TEXT_BYTES).and_then(code_label)
            {
                html.push_str(&format!("<span class=\"run-detail-reason\">{code}</span>"));
            }
        }
        _ => {}
    }
    if html.is_empty() {
        String::new()
    } else {
        format!("<p class=\"run-detail-event-detail\">{html}</p>")
    }
}

fn render_event(event: &Value) -> Option<String> {
    let event = event.as_object()?;
    let seq = nonnegative(event.get("seq")).filter(|value| *value > 0)?;
    let kind = bounded_text(event.get("kind"), MAX_EVENT_TEXT_BYTES).unwrap_or("unknown");
    let at = bounded_text(event.get("at"), MAX_EVENT_TEXT_BYTES)?;
    let (label, tone) = event_kind(kind);
    Some(format!(
        "<li data-event-seq=\"{seq}\" data-event-kind=\"{}\"><div class=\"run-detail-event-heading\">{}<time datetime=\"{}\">{}</time></div>{}</li>",
        escape(kind),
        ui::state(tone, label),
        escape(at),
        escape(at),
        render_detail(kind, event.get("detail")),
    ))
}

fn render_history(history: &Map<String, Value>, events: &[Value]) -> String {
    let complete = history.get("complete").and_then(Value::as_bool) == Some(true);
    let mut html = String::new();
    if !complete {
        let notice = bounded_text(history.get("notice"), MAX_EVENT_TEXT_BYTES)
            .unwrap_or("Earlier run history is unavailable.");
        html.push_str(&format!(
            "<div id=\"run-detail-history-notice\" role=\"status\" aria-live=\"polite\" aria-atomic=\"true\">{}<p>{}</p></div>",
            ui::state(ui::Tone::Warn, "History partial"),
            escape(notice)
        ));
    }
    let entries = events.iter().filter_map(render_event).collect::<Vec<_>>();
    html.push_str("<section id=\"run-detail-events\" aria-labelledby=\"run-detail-events-heading\"><h3 id=\"run-detail-events-heading\">Persisted history</h3>");
    if entries.is_empty() {
        html.push_str("<div id=\"run-detail-events-empty\" role=\"status\" aria-live=\"polite\" aria-atomic=\"true\"><p>No persisted run events recorded.</p></div>");
    } else {
        html.push_str("<ol class=\"run-detail-event-list\" aria-live=\"polite\">");
        html.push_str(&entries.join(""));
        html.push_str("</ol>");
    }
    html.push_str("</section>");
    html
}

fn render_pagination(data: &Value, run_id: &str) -> Result<String, Error> {
    let Some(pagination) = data.get("pagination").and_then(Value::as_object) else {
        return Ok(String::new());
    };
    if pagination.get("hasMore").and_then(Value::as_bool) != Some(true) {
        return Ok(String::new());
    }
    let Some(cursor) = bounded_text(pagination.get("nextCursor"), MAX_CURSOR_BYTES) else {
        return Ok(String::new());
    };
    if cursor.is_empty() {
        return Ok(String::new());
    }
    // This is an authenticated request scope supplied by the browser host,
    // not the run's provider account. An explicit empty string means the
    // project-scoped query; missing or malformed scope stays unavailable.
    let Some(account_scope) = history_account_scope(data) else {
        return Ok(String::new());
    };
    let mut url = reqwest::Url::parse(&format!("https://local.invalid/app/runs/{run_id}"))
        .map_err(|_| Error::Invalid)?;
    if !account_scope.is_empty() {
        url.query_pairs_mut()
            .append_pair("accountId", account_scope);
    }
    url.query_pairs_mut().append_pair("cursor", cursor);
    let href = format!("{}?{}", url.path(), url.query().unwrap_or_default());
    let path = ui::LocalPath::new(&href).ok_or(Error::Invalid)?;
    let next = ui::Button {
        target: ui::ButtonTarget::Link(path),
        ..ui::Button::new("Next page")
    }
    .render();
    Ok(format!(
        "<nav class=\"run-detail-pagination\" aria-label=\"Run history pages\">{next}</nav>"
    ))
}

fn history_account_scope(data: &Value) -> Option<&str> {
    data.get("historyAccountScope")
        .and_then(Value::as_str)
        .filter(|scope| scope.len() <= 512 && !scope.chars().any(char::is_control))
}

#[cfg(test)]
#[path = "run_detail/tests.rs"]
mod tests;
