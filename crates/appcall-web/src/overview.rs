//! Signal Overview presentation.
//!
//! The page intentionally consumes a small, project-scoped JSON read model
//! assembled by the API adapters. It never invents values for unavailable
//! telemetry (for example, latency when action durations are not persisted).

use crate::{http::escape, ui, Error};
use serde_json::Value;

const MAX_RUN_ID_BYTES: usize = 256;

pub(crate) fn render(value: &Value) -> Result<String, Error> {
    let toolkit_count = required_count(value, &["toolkitCount", "toolkits"])?;
    let connection_count = required_count(value, &["connectionCount", "connectionsCount"])
        .or_else(|_| {
            value
                .get("connections")
                .and_then(Value::as_array)
                .map(|rows| rows.len() as u64)
                .ok_or(Error::Unavailable)
        })?;
    let active_connection_count =
        required_count(value, &["activeConnectionCount", "activeConnectionsCount"])?;
    let action_calls = required_count(value, &["actionCalls", "toolCalls"])?;
    let successful_calls = optional_count(value, &["successfulCalls", "succeededCalls"])?;
    let failed_calls = optional_count(value, &["failedCalls", "failureCount"])?;
    let success_rate = success_rate(value, action_calls, successful_calls, failed_calls)?;
    let activity = required_array(value, &["activity", "callsByHour"])?;
    let failure_activity = required_array(value, &["failureActivity", "failuresByHour"])?;
    let attention = required_array(value, &["attention", "needsAttention"])?;
    let dead_runs = optional_array(value, &["deadRuns", "dead_runs"])?;
    let run_health_unavailable = match value.get("deadRunsUnavailable") {
        None => false,
        Some(Value::Bool(true)) if dead_runs.is_none() => true,
        _ => return Err(Error::Unavailable),
    };
    if dead_runs.is_none() && !run_health_unavailable {
        return Err(Error::Unavailable);
    }
    for row in dead_runs.unwrap_or(&[]) {
        dead_run_item(row)?;
    }
    let activity = activity_points(activity)?;
    let failure_activity = failure_points(failure_activity)?;

    // A project with no configured connection or recorded call is still in its
    // activation phase. Do not turn that state into an empty KPI dashboard.
    if connection_count == 0 && action_calls == 0 && dead_runs.is_none_or(|rows| rows.is_empty()) {
        return Ok(activation()
            + if run_health_unavailable {
                "<p role=\"status\">Run health unavailable.</p>"
            } else {
                ""
            });
    }
    if (action_calls > 0 && activity.is_empty())
        || (action_calls == 0 && (!activity.is_empty() || !failure_activity.is_empty()))
    {
        return Err(Error::Unavailable);
    }
    let mut html = String::from(
        "<div id=\"overview\" class=\"overview-page\" aria-labelledby=\"overview-title\">",
    );
    html.push_str(
        "<header class=\"overview-header\"><div><p class=\"overview-label\">PROJECT HEALTH</p><h1 id=\"overview-title\">Overview</h1><p class=\"overview-subtitle\">A current read on this project’s connections and tool activity.</p></div><p class=\"overview-period\">LAST 24H</p></header>",
    );
    html.push_str("<section aria-labelledby=\"overview-kpis-title\"><h2 id=\"overview-kpis-title\" class=\"overview-section-label\">At a glance</h2><div class=\"overview-kpis\">");
    html.push_str(&kpi(
        "toolkits",
        "Available connectors",
        &count_text(toolkit_count),
        "",
    ));
    html.push_str(&kpi(
        "connections",
        "Connected accounts",
        &count_text(active_connection_count),
        "",
    ));
    html.push_str(&kpi("calls", "Tool calls", &count_text(action_calls), ""));
    html.push_str(&kpi(
        "success-rate",
        "Success rate",
        &success_rate_text(success_rate),
        if success_rate.is_none() {
            "No completed calls"
        } else {
            ""
        },
    ));
    html.push_str("</div></section>");

    html.push_str("<section class=\"overview-charts\" aria-labelledby=\"overview-charts-title\"><h2 id=\"overview-charts-title\" class=\"overview-section-label\">Activity</h2><div class=\"overview-chart-grid\">");
    html.push_str(&activity_chart(&activity)?);
    html.push_str(&failure_chart(&failure_activity)?);
    html.push_str("</div></section>");

    html.push_str(&attention_section(
        attention,
        dead_runs.unwrap_or(&[]),
        run_health_unavailable,
    )?);
    html.push_str("</div>");
    Ok(html)
}

fn activation() -> String {
    let cta = ui::Button {
        target: ui::ButtonTarget::Link(
            ui::LocalPath::new("/app/connectors").expect("static activation path"),
        ),
        ..ui::Button::new("Browse connectors")
    }
    .render();
    format!(
        "<section id=\"overview-activation\" class=\"overview-activation\" aria-labelledby=\"overview-activation-title\"><p class=\"overview-label\">PROJECT ACTIVATION</p><h1 id=\"overview-activation-title\">Activate this project</h1><p>Connect an account to start recording tool activity and provider health.</p><ol class=\"overview-activation-steps\"><li><span class=\"overview-step-number\" aria-hidden=\"true\">01</span><div><a href=\"/app/connectors\">Connect your first account</a><p>Authorize one connector for this project.</p></div></li><li><span class=\"overview-step-number\" aria-hidden=\"true\">02</span><div><a href=\"/app/connectors\">Run a tool call</a><p>Choose a tool and inspect its recorded result.</p></div></li><li><span class=\"overview-step-number\" aria-hidden=\"true\">03</span><div><a href=\"/app/events\">Receive an event</a><p>Watch provider events arrive in the project log.</p></div></li></ol>{cta}</section>",
        cta = cta
    )
}

pub(crate) fn unavailable() -> String {
    let retry = ui::Button {
        target: ui::ButtonTarget::Link(ui::LocalPath::new("/app").expect("static overview path")),
        ..ui::Button::new("Reload Overview")
    }
    .render();
    format!(
        "<section class=\"ui-empty-state overview-unavailable\" role=\"alert\" aria-labelledby=\"overview-unavailable-title\"><h3 id=\"overview-unavailable-title\">Overview temporarily unavailable</h3><p>Current project health could not be loaded.</p>{retry}</section>"
    )
}

fn kpi(key: &str, label: &str, value: &str, note: &str) -> String {
    format!(
        "<article class=\"overview-kpi\" data-overview-kpi=\"{}\"><p class=\"overview-kpi-label\">{}</p><p class=\"overview-kpi-value\">{}</p>{}</article>",
        escape(key),
        escape(label),
        escape(value),
        if note.is_empty() {
            String::new()
        } else {
            format!("<p class=\"overview-kpi-note\">{}</p>", escape(note))
        }
    )
}

fn activity_chart(rows: &[Value]) -> Result<String, Error> {
    let points = rows
        .iter()
        .map(chart_point)
        .collect::<Result<Vec<_>, _>>()?;
    let max = points
        .iter()
        .map(|(_, value, _, _)| *value)
        .max()
        .unwrap_or(0);
    let mut html = String::from(
        "<figure class=\"overview-chart\" aria-labelledby=\"overview-activity-title\"><figcaption><h3 id=\"overview-activity-title\">Calls per hour</h3><p>Recorded calls each hour</p></figcaption>",
    );
    if points.is_empty() {
        html.push_str("<p class=\"overview-chart-empty\" role=\"status\">No calls recorded in this period.</p>");
    } else {
        html.push_str("<ol class=\"overview-bars\" aria-label=\"Recorded calls per hour\">");
        for (label, value, _, _) in points {
            html.push_str(&bar_row(&label, value, max, "calls"));
        }
        html.push_str("</ol>");
    }
    html.push_str("</figure>");
    Ok(html)
}

fn failure_chart(rows: &[Value]) -> Result<String, Error> {
    let points = rows
        .iter()
        .map(failure_point)
        .collect::<Result<Vec<_>, _>>()?;
    let max = points.iter().map(|(_, value)| *value).max().unwrap_or(0);
    let mut html = String::from(
        "<figure class=\"overview-chart\" aria-labelledby=\"overview-failures-title\"><figcaption><h3 id=\"overview-failures-title\">Failures per hour</h3><p>Recorded failures each hour</p></figcaption>",
    );
    if points.is_empty() {
        html.push_str("<p class=\"overview-chart-empty\" role=\"status\">No failures recorded in this period.</p>");
    } else {
        html.push_str("<ol class=\"overview-bars overview-failures\" aria-label=\"Recorded failures per hour\">");
        for (label, value) in points {
            html.push_str(&bar_row(&label, value, max, "failures"));
        }
        html.push_str("</ol>");
    }
    html.push_str("</figure>");
    Ok(html)
}

fn bar_row(label: &str, value: u64, max: u64, unit: &str) -> String {
    let percent = if max == 0 {
        0
    } else {
        value.saturating_mul(100).checked_div(max).unwrap_or(0)
    };
    format!(
        "<li><span class=\"overview-bar-label\">{}</span><span class=\"overview-bar-track\"><span class=\"overview-bar-fill\" style=\"--overview-bar-size:{}%\" aria-hidden=\"true\"></span></span><span class=\"overview-bar-value\">{} {}</span></li>",
        escape(label),
        percent,
        value,
        escape(unit)
    )
}

fn attention_section(
    attention: &[Value],
    dead_runs: &[Value],
    run_health_unavailable: bool,
) -> Result<String, Error> {
    let mut html = String::from(
        "<section id=\"overview-attention\" class=\"overview-attention\" aria-labelledby=\"overview-attention-title\"><div class=\"overview-section-heading\"><h2 id=\"overview-attention-title\" class=\"overview-section-label\">Needs attention</h2><p>Only confirmed project issues appear here.</p></div><ul class=\"overview-attention-list\">",
    );
    let mut rendered = 0;
    for item in attention {
        if let Some(row) = attention_item(item)? {
            html.push_str(&row);
            rendered += 1;
        }
    }
    for item in dead_runs {
        if let Some(row) = dead_run_item(item)? {
            html.push_str(&row);
            rendered += 1;
        }
    }
    if run_health_unavailable {
        html.push_str(
            "<li class=\"overview-attention-empty\" role=\"status\">Run health unavailable.</li>",
        );
    } else if rendered == 0 {
        html.push_str("<li class=\"overview-attention-empty\">Nothing needs attention.</li>");
    }
    html.push_str("</ul></section>");
    Ok(html)
}

fn attention_item(item: &Value) -> Result<Option<String>, Error> {
    let Some(href) = text(item, &["href", "link"]) else {
        return Err(Error::Unavailable);
    };
    if ui::LocalPath::new(href).is_none() {
        return Ok(None);
    }
    let title = text(item, &["title", "name"]).unwrap_or("Project issue");
    let body = text(item, &["body", "detail", "message"]).unwrap_or("");
    let kind = text(item, &["kind", "type"]).ok_or(Error::Unavailable)?;
    let state = text(item, &["state"]).unwrap_or(kind);
    let tone = match state {
        "failure" | "failed" | "dead_run" | "dead" => ui::Tone::Dead,
        "connection" | "disconnected" | "degraded" | "authorizing" => ui::Tone::Warn,
        _ => ui::Tone::Idle,
    };
    Ok(Some(format!(
        "<li class=\"overview-attention-item\">{}<div class=\"overview-attention-copy\"><a href=\"{}\">{}</a><p>{}</p></div></li>",
        ui::state(tone, state_word(state)),
        escape(href),
        escape(title),
        escape(body)
    )))
}

fn run_detail_href(run_id: &str) -> Option<String> {
    if run_id.is_empty()
        || run_id.len() > MAX_RUN_ID_BYTES
        || !run_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
    {
        return None;
    }
    let mut url = reqwest::Url::parse("https://local.invalid/app/runs").ok()?;
    url.path_segments_mut().ok()?.push(run_id);
    Some(url.path().to_owned())
}

fn dead_run_item(item: &Value) -> Result<Option<String>, Error> {
    let Some(kind) = text(item, &["kind"]) else {
        return Err(Error::Unavailable);
    };
    let Some(state) = text(item, &["state"]) else {
        return Err(Error::Unavailable);
    };
    let Some(run_id) = item
        .get("runId")
        .or_else(|| item.get("run_id"))
        .and_then(Value::as_str)
    else {
        return Err(Error::Unavailable);
    };
    let Some(title) = text(item, &["title", "name"]) else {
        return Err(Error::Unavailable);
    };
    let Some(body) = text(item, &["body", "detail", "message"]) else {
        return Err(Error::Unavailable);
    };
    if kind != "dead_run" || state != "dead" {
        return Err(Error::Unavailable);
    }
    let Some(href) = run_detail_href(run_id) else {
        return Ok(None);
    };
    Ok(Some(format!(
        "<li class=\"overview-attention-item\" data-run-id=\"{}\">{}<div class=\"overview-attention-copy\"><a href=\"{}\">{}</a><p>{}</p></div></li>",
        escape(run_id),
        ui::state(ui::Tone::Dead, "Dead"),
        escape(&href),
        escape(title),
        escape(body)
    )))
}

fn state_word(kind: &str) -> &'static str {
    match kind {
        "failure" | "failed" => "Failed",
        "dead_run" | "dead" => "Dead",
        "connection" => "Connection",
        "disconnected" => "Disconnected",
        "degraded" => "Degraded",
        "authorizing" => "Authorizing",
        _ => "Review",
    }
}

fn chart_point(row: &Value) -> Result<(String, u64, u64, u64), Error> {
    let label = text(row, &["label", "hour", "date", "day"])
        .ok_or(Error::Unavailable)?
        .to_owned();
    let total = count(row, &["calls", "total", "value"]).ok_or(Error::Unavailable)?;
    let succeeded = optional_row_count(row, &["succeeded", "successful"])?;
    let failed = optional_row_count(row, &["failed", "failures"])?;
    Ok((label, total, succeeded.unwrap_or(0), failed.unwrap_or(0)))
}

fn failure_point(row: &Value) -> Result<(String, u64), Error> {
    let label = text(row, &["label", "hour", "date", "day"])
        .ok_or(Error::Unavailable)?
        .to_owned();
    let failures =
        count(row, &["failures", "failed", "value", "calls"]).ok_or(Error::Unavailable)?;
    Ok((label, failures))
}

fn success_rate(
    value: &Value,
    action_calls: u64,
    successful_calls: Option<u64>,
    failed_calls: Option<u64>,
) -> Result<Option<f64>, Error> {
    if let Some(raw) = value.get("successRate") {
        if raw.is_null() {
            return Ok(None);
        }
        let rate = raw.as_f64().ok_or(Error::Unavailable)?;
        return if rate.is_finite() && (0.0..=100.0).contains(&rate) {
            Ok(Some(rate))
        } else {
            Err(Error::Unavailable)
        };
    }
    match (successful_calls, failed_calls) {
        (Some(succeeded), Some(failed)) => {
            let completed = succeeded.saturating_add(failed);
            if completed == 0 || action_calls == 0 {
                Ok(None)
            } else {
                Ok(Some(succeeded as f64 * 100.0 / completed as f64))
            }
        }
        _ => Ok(None),
    }
}

fn success_rate_text(rate: Option<f64>) -> String {
    rate.map(|rate| {
        if (rate - rate.round()).abs() < f64::EPSILON {
            format!("{}%", rate as u64)
        } else {
            format!("{rate:.1}%")
        }
    })
    .unwrap_or_else(|| "—".into())
}

fn count_text(value: u64) -> String {
    value.to_string()
}

fn required_count(value: &Value, keys: &[&str]) -> Result<u64, Error> {
    keys.iter()
        .find_map(|key| value.get(*key))
        .ok_or(Error::Unavailable)
        .and_then(|value| count_value(value).ok_or(Error::Unavailable))
}

fn optional_count(value: &Value, keys: &[&str]) -> Result<Option<u64>, Error> {
    let Some(raw) = keys.iter().find_map(|key| value.get(*key)) else {
        return Ok(None);
    };
    if raw.is_null() {
        Ok(None)
    } else {
        count_value(raw).map(Some).ok_or(Error::Unavailable)
    }
}

fn count(row: &Value, keys: &[&str]) -> Option<u64> {
    keys.iter()
        .find_map(|key| row.get(*key))
        .and_then(count_value)
}

fn optional_row_count(row: &Value, keys: &[&str]) -> Result<Option<u64>, Error> {
    let Some(raw) = keys.iter().find_map(|key| row.get(*key)) else {
        return Ok(None);
    };
    count_value(raw).map(Some).ok_or(Error::Unavailable)
}

fn count_value(value: &Value) -> Option<u64> {
    value.as_u64().or_else(|| {
        value
            .as_i64()
            .filter(|value| *value >= 0)
            .map(|value| value as u64)
    })
}

fn required_array<'a>(value: &'a Value, keys: &[&str]) -> Result<&'a [Value], Error> {
    let raw = keys
        .iter()
        .find_map(|key| value.get(*key))
        .ok_or(Error::Unavailable)?;
    raw.as_array().map(Vec::as_slice).ok_or(Error::Unavailable)
}

fn optional_array<'a>(value: &'a Value, keys: &[&str]) -> Result<Option<&'a [Value]>, Error> {
    let Some(raw) = keys.iter().find_map(|key| value.get(*key)) else {
        return Ok(None);
    };
    raw.as_array()
        .map(Vec::as_slice)
        .map(Some)
        .ok_or(Error::Unavailable)
}

fn activity_points(rows: &[Value]) -> Result<Vec<Value>, Error> {
    rows.iter()
        .map(chart_point)
        .map(|point| {
            point.map(|(label, calls, succeeded, failed)| {
                serde_json::json!({
                    "label": label,
                    "calls": calls,
                    "succeeded": succeeded,
                    "failed": failed,
                })
            })
        })
        .collect()
}

fn failure_points(rows: &[Value]) -> Result<Vec<Value>, Error> {
    rows.iter()
        .map(failure_point)
        .map(|point| {
            point.map(|(label, failures)| serde_json::json!({"label": label, "failures": failures}))
        })
        .collect()
}

fn text<'a>(value: &'a Value, keys: &[&str]) -> Option<&'a str> {
    keys.iter()
        .find_map(|key| value.get(*key).and_then(Value::as_str))
        .filter(|text| !text.is_empty())
}

#[cfg(test)]
mod tests {
    #[test]
    fn overview_dead_run_health_is_explicit_and_malformed_rows_fail() {
        let base = serde_json::json!({"toolkitCount":4,"connectionCount":1,"activeConnectionCount":1,"actionCalls":0,"successfulCalls":0,"failedCalls":0,"activity":[],"failureActivity":[],"attention":[]});
        assert!(
            super::render(&base).is_err(),
            "missing run health is not healthy empty"
        );
        let mut memory = base.clone();
        memory["deadRunsUnavailable"] = serde_json::json!(true);
        let html = super::render(&memory).unwrap();
        assert!(html.contains("Run health unavailable"));
        assert!(!html.contains("Nothing needs attention"));
        assert_eq!(html.matches("data-overview-kpi=").count(), 4);
        let mut empty = base.clone();
        empty["deadRuns"] = serde_json::json!([]);
        assert!(super::render(&empty)
            .unwrap()
            .contains("Nothing needs attention"));
        for malformed in [serde_json::json!([{}]), serde_json::json!("unavailable")] {
            let mut value = base.clone();
            value["deadRuns"] = malformed;
            assert!(super::render(&value).is_err());
        }
        memory["deadRuns"] = serde_json::json!([]);
        assert!(
            super::render(&memory).is_err(),
            "contradictory run health must fail"
        );
    }
    use super::*;
    use serde_json::json;

    #[test]
    fn empty_project_shows_activation_state_instead_of_legacy_checklist() {
        let html = render(&json!({
            "toolkitCount": 24,
            "connectionCount": 0,
            "activeConnectionCount": 0,
            "actionCalls": 0,
            "successfulCalls": 0,
            "failedCalls": 0,
            "activity": [],
            "failureActivity": [],
            "attention": [],
            "deadRuns": []
        }))
        .unwrap();

        assert!(html.contains("id=\"overview-activation\""));
        assert!(html.contains("Activate this project"));
        assert!(html.contains("Connect your first account"));
        assert!(html.contains("href=\"/app/connectors\""));
        assert!(html.contains("href=\"/app/events\""));
        assert!(!html.contains("Getting Started"));
        assert!(!html.contains("Setup checklist"));
        assert!(!html.contains("overview-kpis"));
    }

    #[test]
    fn populated_project_shows_four_kpis_two_charts_and_attention_links() {
        let html = render(&json!({
            "toolkitCount": 24,
            "connectionCount": 3,
            "activeConnectionCount": 2,
            "actionCalls": 5,
            "successfulCalls": 4,
            "failedCalls": 1,
            "successRate": 80.0,
            "activity": [
                {"label":"14:00","calls":2,"succeeded":2,"failed":0},
                {"label":"15:00","calls":3,"succeeded":2,"failed":1}
            ],
            "failureActivity": [
                {"label":"14:00","failures":0},
                {"label":"15:00","failures":1}
            ],
            "attention": [
                {"kind":"failure","title":"Slack failed","body":"Open the failed log.","href":"/app/logs?status=failed&connector=slack"},
                {"kind":"connection","title":"Notion disconnected","body":"Reconnect this account.","href":"/app/connections/conn_notion"}
            ],
            "deadRuns": [
                {"runId":"run_sync_stopped","kind":"dead_run","state":"dead","title":"Sync run stopped","body":"Review the terminal run.","href":"/app/runs?status=dead"}
            ]
        }))
        .unwrap();

        assert!(html.contains("id=\"overview\""));
        assert_eq!(html.matches("data-overview-kpi=").count(), 4);
        for label in [
            "Available connectors",
            "Connected accounts",
            "Tool calls",
            "Success rate",
        ] {
            assert!(html.contains(label), "missing KPI label: {label}");
        }
        assert_eq!(html.matches("class=\"overview-chart\"").count(), 2);
        assert!(html.contains("Calls per hour"));
        assert!(html.contains("Failures per hour"));
        assert!(html.contains("LAST 24H"));
        assert!(html.contains("Needs attention"));
        assert!(html.contains("/app/logs?status=failed&amp;connector=slack"));
        assert!(html.contains("/app/connections/conn_notion"));
        assert!(html.contains("/app/runs/run_sync_stopped"));
        assert!(!html.contains("/app/runs?status=dead"));
        assert!(!html.to_ascii_lowercase().contains("latency"));
        assert!(!html.to_ascii_lowercase().contains("p95"));
    }

    #[test]
    fn dead_run_detail_link_rejects_unsafe_ids_instead_of_trusting_supplied_href() {
        let payload = || {
            json!({
                "toolkitCount": 1,
                "connectionCount": 1,
                "activeConnectionCount": 1,
                "actionCalls": 1,
                "successfulCalls": 1,
                "failedCalls": 0,
                "activity": [{"label":"10:00","calls":1}],
                "failureActivity": [{"label":"10:00","failures":0}],
                "attention": [],
                "deadRuns": [{
                    "runId": "run_1",
                    "kind": "dead_run",
                    "state": "dead",
                    "title": "Sync run stopped",
                    "body": "Review the terminal run.",
                    "href": "https://untrusted.example/runs"
                }]
            })
        };

        let html = render(&payload()).expect("safe run ID should render");
        assert!(html.contains("href=\"/app/runs/run_1\""));
        assert!(!html.contains("untrusted.example"));

        for run_id in ["run/1", "run?cursor=1", "<script>", ""] {
            let mut value = payload();
            value["deadRuns"][0]["runId"] = json!(run_id);
            let html = render(&value)
                .expect("an unsupported run ID should not take down the Overview page");
            assert!(!html.contains("untrusted.example"));
            assert!(!html.contains("href=\"/app/runs/"));
            if !run_id.is_empty() {
                assert!(!html.contains(run_id));
            }
        }
    }

    #[test]
    fn generic_connection_attention_state_does_not_claim_disconnected() {
        let mut value = json!({
            "toolkitCount": 1,
            "connectionCount": 1,
            "activeConnectionCount": 1,
            "actionCalls": 1,
            "successfulCalls": 1,
            "failedCalls": 0,
            "activity": [{"label":"15:00","calls":1}],
            "failureActivity": [{"label":"15:00","failures":0}],
            "attention": [{
                "kind":"connection",
                "title":"Notion connection is degraded",
                "body":"Reconnect this account.",
                "href":"/app/connections/conn_notion"
            }],
            "deadRuns": []
        });

        let html = render(&value).unwrap();
        assert!(html.contains(">Connection</span>"));
        assert!(!html.contains(">Disconnected</span>"));

        for (state, expected) in [("degraded", "Degraded"), ("disconnected", "Disconnected")] {
            value["attention"][0]["state"] = json!(state);
            let html = render(&value).unwrap();
            assert!(html.contains(&format!(">{expected}</span>")));
        }
    }

    #[test]
    fn connected_accounts_kpi_reports_active_connections_not_total_rows() {
        let html = render(&json!({
            "toolkitCount": 1,
            "connectionCount": 3,
            "activeConnectionCount": 1,
            "actionCalls": 1,
            "successfulCalls": 1,
            "failedCalls": 0,
            "activity": [{"label":"Sep 08","calls":1,"succeeded":1,"failed":0}],
            "failureActivity": [{"label":"Sep 08","failures":0}],
            "attention": [],
            "deadRuns": []
        }))
        .unwrap();

        let connections_kpi = html
            .split("data-overview-kpi=\"connections\"")
            .nth(1)
            .expect("connected accounts KPI");
        assert!(connections_kpi.contains("overview-kpi-value\">1</p>"));
        assert!(!connections_kpi.contains("overview-kpi-value\">3</p>"));
    }

    #[test]
    fn missing_overview_arrays_are_unavailable_instead_of_healthy_empty() {
        assert_eq!(
            render(&json!({
                "toolkitCount": 1,
                "connectionCount": 1,
                "activeConnectionCount": 1,
                "actionCalls": 10
            })),
            Err(Error::Unavailable)
        );
    }

    #[test]
    fn malformed_overview_arrays_and_rows_are_unavailable() {
        let base = json!({
            "toolkitCount": 1,
            "connectionCount": 1,
            "activeConnectionCount": 1,
            "actionCalls": 1,
            "successfulCalls": 1,
            "failedCalls": 0,
            "activity": [{"label":"15:00","calls":1}],
            "failureActivity": [{"label":"15:00","failures":0}],
            "attention": [],
            "deadRuns": []
        });
        for (name, patch) in [
            ("activity type", json!({"activity": {}})),
            ("activity row", json!({"activity": [{}]})),
            (
                "failure activity type",
                json!({"failureActivity": "not-an-array"}),
            ),
            ("failure activity row", json!({"failureActivity": [{}]})),
            ("attention type", json!({"attention": false})),
            (
                "attention row",
                json!({"attention": [{"title": "missing href"}]}),
            ),
        ] {
            let mut value = base.clone();
            for (key, replacement) in patch.as_object().unwrap() {
                value[key] = replacement.clone();
            }
            assert_eq!(render(&value), Err(Error::Unavailable), "invalid {name}");
        }
    }

    #[test]
    fn dead_run_rows_without_explicit_kind_and_state_are_unavailable() {
        let result = render(&json!({
            "toolkitCount": 1,
            "connectionCount": 1,
            "activeConnectionCount": 1,
            "actionCalls": 1,
            "successfulCalls": 1,
            "failedCalls": 0,
            "activity": [{"label":"15:00","calls":1}],
            "failureActivity": [{"label":"15:00","failures":0}],
            "attention": [],
            "deadRuns": [
                {"title":"Raw worker row","body":"Do not render this row.","href":"/app/runs"},
                {"runId":"run_adapted","kind":"dead_run","state":"dead","title":"Adapted dead run","body":"Review the run.","href":"/app/runs?status=dead"}
            ]
        }));
        assert_eq!(result, Err(Error::Unavailable));
    }

    #[test]
    fn unavailable_success_rate_and_invalid_attention_do_not_become_fabricated_data() {
        let html = render(&json!({
            "deadRuns": [],
            "toolkitCount": 1,
            "connectionCount": 1,
            "activeConnectionCount": 1,
            "actionCalls": 0,
            "successfulCalls": 0,
            "failedCalls": 0,
            "successRate": null,
            "activity": [],
            "failureActivity": [],
            "attention": [
                {"kind":"failure","title":"Ignore me","body":"Unsafe destination.","href":"javascript:alert(1)"}
            ]
        }))
        .unwrap();

        assert!(html.contains("No completed calls"));
        assert!(!html.contains("javascript:"));
        assert!(!html.contains("Ignore me"));
        assert!(!html.contains(">0%<"));
    }

    #[test]
    fn missing_required_read_model_is_unavailable() {
        assert_eq!(render(&json!({})), Err(Error::Unavailable));
    }

    #[tokio::test]
    async fn unavailable_overview_keeps_shell_alert_and_recovery_action() {
        struct MissingOverview {
            data_error: bool,
        }
        impl crate::DashboardData for MissingOverview {
            fn execute(
                &self,
                _: crate::DashboardRequest,
            ) -> std::pin::Pin<
                Box<dyn std::future::Future<Output = Result<Value, Error>> + Send + '_>,
            > {
                let result = if self.data_error {
                    Err(Error::Unavailable)
                } else {
                    Ok(json!({}))
                };
                Box::pin(async move { result })
            }
        }

        let session = crate::Session {
            access_token: String::new(),
            refresh_token: String::new(),
            user_id: "user".into(),
            email: "user@example.test".into(),
            tenant_id: "tenant".into(),
            tenant_name: "Tenant".into(),
        };
        let request = crate::Request {
            method: "GET",
            path: "/app",
            cookies: "",
            origin: None,
            referer: None,
            fields: Default::default(),
            now: 100,
        };
        for data_error in [false, true] {
            let data = MissingOverview { data_error };
            let response = crate::dashboard::DashboardRenderer { data: &data }
                .render(
                    &request,
                    Some(crate::DashboardOperation::Overview),
                    &session,
                    appcall_auth::Principal::project("project").unwrap(),
                )
                .await
                .expect("overview unavailability needs a rendered recovery page");

            assert_eq!(response.status, 503);
            for expected in [
                "<title>Overview · appcall</title>",
                "role=\"alert\"",
                "Reload Overview",
                "Current project health could not be loaded.",
            ] {
                assert!(response.body.contains(expected), "missing {expected}");
            }
            assert!(!response.body.contains("overview-kpi"));
            assert!(!response.body.contains("Calls per hour"));
            assert!(!response.body.contains("Try again"));
            assert!(response.body.contains("href=\"/app\""));
        }
    }

    #[test]
    fn overview_styles_are_scoped_and_keep_the_signal_visual_language() {
        let css = include_str!("../static/dashboard.css");

        for expected in [
            "#overview",
            ".overview-kpis",
            ".overview-chart-grid",
            ".overview-attention",
            "var(--color-iris-400)",
            "border-radius: 10px",
        ] {
            assert!(css.contains(expected), "missing Overview style: {expected}");
        }
        assert!(!css.contains("linear-gradient"));
    }
}
