//! Logs presentation: filter values come from the browser request, never a DTO.
use crate::{http::escape, ui, Error, Request};
use serde_json::Value;
use std::collections::BTreeMap;

pub(crate) const FILTER_KEYS: &[&str] = &[
    "status",
    "connector",
    "action",
    "connectionId",
    "requestId",
    "errorCode",
    "createdFrom",
    "createdBefore",
    "limit",
];

#[derive(Default)]
pub(crate) struct Filters(BTreeMap<String, String>);
impl Filters {
    pub(crate) fn from_request(request: &Request<'_>) -> Result<Self, Error> {
        FILTER_KEYS
            .iter()
            .map(|key| Ok(((*key).into(), request.field(key)?.into())))
            .collect::<Result<BTreeMap<_, _>, _>>()
            .map(Self)
    }
    fn get(&self, key: &str) -> &str {
        self.0.get(key).map(String::as_str).unwrap_or("")
    }
    pub(crate) fn active(&self) -> bool {
        FILTER_KEYS
            .iter()
            .filter(|key| **key != "limit")
            .any(|key| !self.get(key).is_empty())
    }
}

fn link(label: &str, href: &str) -> Result<String, Error> {
    Ok(ui::Button {
        variant: ui::ButtonVariant::Quiet,
        size: ui::ButtonSize::Sm,
        target: ui::ButtonTarget::Link(ui::LocalPath::new(href).ok_or(Error::Unavailable)?),
        ..ui::Button::new(label)
    }
    .render())
}

fn select(filters: &Filters, key: &str, label: &str, allowed: &[&str]) -> String {
    let value = filters.get(key);
    let mut options: Vec<_> = allowed
        .iter()
        .map(|v| ui::SelectOption {
            value: v,
            label: if v.is_empty() { "All" } else { v },
            disabled: false,
        })
        .collect();
    // Invalid submitted values remain visible on the recovery page.
    if !allowed.contains(&value) {
        options.push(ui::SelectOption {
            value,
            label: value,
            disabled: false,
        });
    }
    ui::Field {
        value,
        ..ui::Field::new(
            &format!("logs-{key}"),
            key,
            label,
            ui::Control::Select(&options),
        )
    }
    .render()
}

fn form(filters: &Filters) -> String {
    let mut body = String::from("<form method=\"get\" action=\"/app/logs\" class=\"logs-filters\" aria-label=\"Filter tool runs\">");
    for (key, label, help) in [
        ("connector", "Connector", ""),
        ("action", "Tool", ""),
        ("connectionId", "Connection ID", ""),
        ("requestId", "Request ID", ""),
        ("createdFrom", "Created from (inclusive)", "RFC3339 timestamp in UTC (Z) or with an explicit offset; up to 9 fractional digits. Example: 2026-09-07T10:00:00Z. Includes this instant."),
        ("createdBefore", "Created before (exclusive)", "RFC3339 timestamp in UTC (Z) or with an explicit offset; up to 9 fractional digits. Example: 2026-09-08T00:00:00+05:30. Excludes this instant."),
    ] {
        body.push_str(&ui::Field {
            value: filters.get(key), help,
            ..ui::Field::new(&format!("logs-{key}"), key, label, ui::Control::Input(ui::InputType::Text))
        }.render());
    }
    body.push_str(&select(
        filters,
        "status",
        "Status",
        &["", "succeeded", "failed"],
    ));
    body.push_str(&select(
        filters,
        "errorCode",
        "Error code",
        &[
            "",
            "ACTION_FAILED",
            "ACTION_INPUT_TOO_LARGE",
            "ACTION_RESPONSE_INVALID",
            "ACTION_RESPONSE_TOO_LARGE",
            "ACTION_TIMEOUT",
            "CONNECTION_DISCONNECTED",
            "CONNECTOR_RATE_LIMITED",
            "CONNECTOR_UNAVAILABLE",
            "IDEMPOTENCY_CONFLICT",
            "IDEMPOTENCY_IN_PROGRESS",
            "UNKNOWN_ACTION",
            "USAGE_LIMIT_EXCEEDED",
            "MISSING_CREDENTIAL",
            "MISSING_SUBACCOUNT",
        ],
    ));
    if !filters.get("limit").is_empty() {
        body.push_str(
            &ui::Field {
                value: filters.get("limit"),
                ..ui::Field::new(
                    "logs-limit",
                    "limit",
                    "",
                    ui::Control::Input(ui::InputType::Hidden),
                )
            }
            .render(),
        );
    }
    let apply = ui::Button {
        variant: ui::ButtonVariant::Secondary,
        target: ui::ButtonTarget::Button {
            kind: ui::ButtonType::Submit,
            form: None,
            action: None,
        },
        ..ui::Button::new("Apply filters")
    }
    .render();
    let clear = link("Clear filters", "/app/logs").expect("static local Logs route");
    body.push_str(&format!(
        "<div class=\"logs-filter-actions\">{apply}{clear}</div></form>"
    ));
    body
}

fn heading(filters: &Filters) -> String {
    format!("<section class=\"logs-page\" aria-labelledby=\"logs-heading\"><header class=\"logs-heading\"><h2 id=\"logs-heading\" tabindex=\"-1\">Logs</h2><p>Inspect recorded tool executions.</p></header>{}", form(filters))
}

pub(crate) fn invalid(filters: &Filters) -> String {
    heading(filters) + "<div class=\"logs-filter-error\" role=\"alert\"><h3>Review the log filters.</h3><p>Use a supported status and error code, a valid page size, and RFC3339 timestamps with UTC or an explicit offset. Created from must be earlier than Created before. Correct the filters and apply them again, or choose Clear filters to start over.</p></div></section>"
}

pub(crate) fn render(raw: &Value, filters: &Filters, filtered: bool) -> Result<String, Error> {
    let data = raw.get("data").unwrap_or(raw);
    let items = data
        .as_array()
        .or_else(|| {
            ["logs", "items", "rows"]
                .iter()
                .find_map(|key| data.get(key).and_then(Value::as_array))
        })
        .ok_or(Error::Unavailable)?;
    let mut body = heading(filters);
    if items.is_empty() {
        let empty = if filtered {
            ui::EmptyState {
                title: "No tool runs match these filters.",
                body: "Clear the filters to view recorded runs.",
                action_label: "Clear filters",
                action_href: ui::LocalPath::new("/app/logs").unwrap(),
            }
        } else {
            ui::EmptyState {
                title: "No tool runs to show.",
                body: "Browse connectors to choose a tool to run.",
                action_label: "Browse connectors",
                action_href: ui::LocalPath::new("/app/connectors").unwrap(),
            }
        };
        body.push_str(&empty.render());
    } else {
        body.push_str(&format!(
            "<div class=\"logs-workspace\">{}{}</div>",
            table(items)?,
            inspector()?
        ));
    }
    body.push_str("</section>");
    Ok(body)
}

fn cell(item: &Value, key: &str) -> String {
    match item.get(key) {
        Some(Value::String(text)) => escape(text),
        Some(Value::Null) | None => String::new(),
        Some(value) => escape(&value.to_string()),
    }
}

fn inspector() -> Result<String, Error> {
    let close = ui::Button {
        variant: ui::ButtonVariant::Quiet,
        aria_label: Some("Close trace inspector"),
        target: ui::ButtonTarget::Button {
            kind: ui::ButtonType::Submit,
            form: None,
            action: None,
        },
        ..ui::Button::new("Close")
    }
    .render();
    let full = link("Open full trace", "/app/logs")?;
    let login = link("Sign in again", "/app/login")?;
    Ok(format!("<dialog id=\"logs-inspector\" aria-labelledby=\"logs-inspector-title\"><header class=\"logs-inspector-heading\"><h2 id=\"logs-inspector-title\">Trace inspector</h2><form id=\"logs-inspector-close\" method=\"dialog\">{close}</form></header><div class=\"logs-inspector-actions\"><span id=\"logs-inspector-full\">{full}</span><span id=\"logs-inspector-login\" hidden>{login}</span></div><div id=\"logs-inspector-result\" aria-live=\"polite\" aria-busy=\"false\"></div></dialog>"))
}

fn table(items: &[Value]) -> Result<String, Error> {
    let mut body = String::from("<div class=\"logs-table-scroll\" role=\"region\" aria-label=\"Tool execution logs\" tabindex=\"0\"><table class=\"logs-table\"><caption class=\"sr-only\">Recorded tool executions</caption><thead><tr>");
    for label in [
        "Time",
        "Connector",
        "Tool",
        "Status",
        "Error code",
        "Request ID",
        "Details",
    ] {
        body.push_str(&format!("<th scope=\"col\">{label}</th>"));
    }
    body.push_str("</tr></thead><tbody>");
    for item in items {
        let request_id = item
            .get("requestId")
            .and_then(Value::as_str)
            .ok_or(Error::Unavailable)?;
        if request_id.is_empty()
            || request_id.len() > 256
            || !request_id
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.'))
        {
            return Err(Error::Unavailable);
        }
        body.push_str("<tr data-log-row>");
        for key in [
            "createdAt",
            "connector",
            "action",
            "status",
            "errorCode",
            "requestId",
        ] {
            let value = if key == "status" {
                let label = item.get(key).and_then(Value::as_str).unwrap_or("Unknown");
                ui::state(
                    match label {
                        "succeeded" => ui::Tone::Ok,
                        "failed" => ui::Tone::Dead,
                        "running" => ui::Tone::Running,
                        _ => ui::Tone::Idle,
                    },
                    label,
                )
            } else {
                cell(item, key)
            };
            let class = if matches!(key, "createdAt" | "errorCode" | "requestId") {
                " class=\"mono\""
            } else {
                ""
            };
            body.push_str(&format!("<td{class}>{value}</td>"));
        }
        body.push_str(&format!(
            "<td>{}</td></tr>",
            link("Inspect", &format!("/app/logs/{request_id}"))?
        ));
    }
    body.push_str("</tbody></table></div>");
    Ok(body)
}
