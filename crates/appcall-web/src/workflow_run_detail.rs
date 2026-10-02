//! Focused renderer for one durable workflow-engine run.
//!
//! Consumes only fields the engine GET /runs/{id} wire actually returns:
//! id, state, failure_reason, reconciliation_audit. Missing fields render
//! Unavailable; OutcomeUnknown is Reconcile, never success.

use crate::{http::escape, ui, Error};
use serde_json::{Map, Value};

const MAX_ID_BYTES: usize = 256;
const MAX_TEXT_BYTES: usize = 512;

/// Renders one server-owned workflow run detail document.
pub(crate) fn standalone(value: &Value, run_id: &str) -> Result<String, Error> {
    if !valid_identifier(run_id) {
        return Err(Error::Invalid);
    }
    let mut html = ui::back_link(
        "Back to Runs",
        ui::LocalPath::new("/app/workflows/runs").ok_or(Error::Invalid)?,
    );
    match status(value) {
        "unavailable" => {
            html.push_str(&detail_shell(
                run_id,
                empty_alert(
                    "Workflow engine is not connected to this console.",
                    "The engine has its own transport. Until it is configured for this console, this page does not invent run state or history.",
                    "Start here",
                    "/app/start",
                )?,
            ));
            Ok(html)
        }
        "error" => {
            let reload = format!("/app/workflows/runs/{run_id}");
            html.push_str(&detail_shell(
                run_id,
                empty_alert(
                    "Workflow engine unreachable",
                    "The console is configured to talk to the engine, but the read failed. Nothing here is invented.",
                    "Reload",
                    &reload,
                )?,
            ));
            Ok(html)
        }
        "ok" => {
            let data = value.get("data").unwrap_or(value);
            let dto_id = bounded_text(data.get("id"), MAX_ID_BYTES).ok_or(Error::Unavailable)?;
            if dto_id != run_id || !valid_identifier(dto_id) {
                return Err(Error::Unavailable);
            }
            let state_label = bounded_text(data.get("state"), MAX_TEXT_BYTES)
                .ok_or(Error::Unavailable)?;
            let mut body = String::new();
            body.push_str(&render_header(dto_id, state_label)?);
            body.push_str(&render_summary(data, state_label)?);
            body.push_str(&render_history(data)?);
            html.push_str(&detail_shell(run_id, body));
            Ok(html)
        }
        _ => Err(Error::Unavailable),
    }
}

fn status(value: &Value) -> &str {
    value.get("status").and_then(Value::as_str).unwrap_or("")
}

fn detail_shell(run_id: &str, body: String) -> String {
    format!(
        "<div id=\"workflow-run-detail-page\" data-workflow-run-id=\"{}\">{body}</div>",
        escape(run_id)
    )
}

fn empty_alert(title: &str, body: &str, action: &str, href: &str) -> Result<String, Error> {
    Ok(ui::EmptyState {
        title,
        body,
        action_label: action,
        action_href: ui::LocalPath::new(href).ok_or(Error::Invalid)?,
        role: ui::EmptyStateRole::Alert,
    }
    .render())
}

fn valid_identifier(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= MAX_ID_BYTES
        && !matches!(value, "." | "..")
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
}

fn bounded_text(value: Option<&Value>, max: usize) -> Option<&str> {
    value
        .and_then(Value::as_str)
        .filter(|text| !text.is_empty() && text.len() <= max)
        .filter(|text| !text.chars().any(|character| character.is_control()))
}

fn unavailable(label: &str) -> String {
    format!(
        "<span class=\"runs-telemetry-unavailable\" aria-label=\"{} unavailable\">Unavailable</span>",
        escape(label)
    )
}

fn failure_reason_label(value: Option<&Value>) -> String {
    match value {
        None | Some(Value::Null) => unavailable("Failure reason"),
        Some(Value::String(text))
            if !text.is_empty()
                && text.len() <= MAX_TEXT_BYTES
                && !text.chars().any(char::is_control) =>
        {
            match text.as_str() {
                "InvalidCommand" => "Invalid command".into(),
                "ResourceLimit" => "Resource limit".into(),
                "MissingActivityImplementation" => "Missing activity implementation".into(),
                "PayloadUnavailable" => "Payload unavailable".into(),
                "RetryExhausted" => "Retry exhausted".into(),
                // Unknown engine reason stays literal rather than invented copy.
                other => escape(other),
            }
        }
        _ => unavailable("Failure reason"),
    }
}

fn render_header(run_id: &str, state_label: &str) -> Result<String, Error> {
    Ok(format!(
        "<header class=\"runs-header\"><h2 id=\"workflow-run-detail-heading\">Run <code class=\"runs-code\">{}</code></h2><p>{}</p></header>",
        escape(run_id),
        crate::pages::workflow_run_state(state_label)?,
    ))
}

fn render_summary(data: &Value, state_label: &str) -> Result<String, Error> {
    let id = bounded_text(data.get("id"), MAX_ID_BYTES)
        .map(escape)
        .unwrap_or_else(|| unavailable("Run ID"));
    let state = crate::pages::workflow_run_state(state_label)?;
    let failure = failure_reason_label(data.get("failure_reason"));
    let audit = match data.get("reconciliation_audit") {
        Some(Value::Array(events)) => events.len().to_string(),
        _ => unavailable("Reconciliation events"),
    };
    Ok(format!(
        "<dl class=\"runs-stats run-detail-summary\"><div><dt>Id</dt><dd class=\"tabular\">{id}</dd></div><div><dt>State</dt><dd>{state}</dd></div><div><dt>Failure reason</dt><dd>{failure}</dd></div><div><dt>Reconciliation events</dt><dd class=\"tabular\">{audit}</dd></div></dl>"
    ))
}

fn render_history(data: &Value) -> Result<String, Error> {
    let mut html = String::from(
        "<section id=\"workflow-run-detail-history\" aria-labelledby=\"workflow-run-detail-history-heading\"><h3 id=\"workflow-run-detail-history-heading\">Reconciliation history</h3>",
    );
    match data.get("reconciliation_audit") {
        None => {
            html.push_str(&format!(
                "<p>{}</p>",
                unavailable("Reconciliation history")
            ));
        }
        Some(Value::Array(events)) if events.is_empty() => {
            html.push_str("<div id=\"workflow-run-detail-history-empty\" role=\"status\" aria-live=\"polite\" aria-atomic=\"true\"><p>No reconciliation events recorded.</p></div>");
        }
        Some(Value::Array(events)) => {
            html.push_str("<ol class=\"run-detail-event-list\" aria-live=\"polite\">");
            for event in events {
                html.push_str(&render_audit_event(event)?);
            }
            html.push_str("</ol>");
        }
        Some(_) => {
            html.push_str(&format!(
                "<p>{}</p>",
                unavailable("Reconciliation history")
            ));
        }
    }
    html.push_str("</section>");
    Ok(html)
}

fn render_audit_event(event: &Value) -> Result<String, Error> {
    let Some(event) = event.as_object() else {
        return Err(Error::Unavailable);
    };
    let effect_id = field(event, "effect_id", "Effect");
    let evidence = field(event, "evidence_ref", "Evidence");
    let attempt = nonnegative(event.get("attempt"))
        .map(|v| v.to_string())
        .unwrap_or_else(|| unavailable("Attempt"));
    let owner_epoch = nonnegative(event.get("owner_epoch"))
        .map(|v| v.to_string())
        .unwrap_or_else(|| unavailable("Owner epoch"));
    let recorded = match event.get("recorded_at_ms") {
        Some(Value::Number(n)) if n.as_i64().is_some() || n.as_u64().is_some() => {
            format!("<span class=\"tabular\">{}</span>", escape(&n.to_string()))
        }
        _ => unavailable("Recorded at"),
    };
    let observed = match event.get("observed").and_then(Value::as_bool) {
        Some(true) => "Observed".to_owned(),
        Some(false) => "Not observed".to_owned(),
        None => unavailable("Observed"),
    };
    Ok(format!(
        "<li><div class=\"run-detail-event-heading\"><code class=\"runs-code\">{effect_id}</code><span>{observed}</span></div><p class=\"run-detail-event-detail\"><span class=\"run-detail-progress\">Attempt {attempt}</span><span class=\"run-detail-progress\">Owner epoch {owner_epoch}</span><span class=\"run-detail-reason\">Evidence {evidence}</span><span class=\"run-detail-progress\">Recorded at {recorded}</span></p></li>"
    ))
}

fn field(event: &Map<String, Value>, key: &str, label: &str) -> String {
    bounded_text(event.get(key), MAX_TEXT_BYTES)
        .map(escape)
        .unwrap_or_else(|| unavailable(label))
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

#[cfg(test)]
#[path = "workflow_run_detail/tests.rs"]
mod tests;
