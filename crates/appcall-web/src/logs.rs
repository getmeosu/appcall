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
    let mut body = String::from("<form method=\"get\" action=\"/app/calls\" class=\"logs-filters\" aria-label=\"Filter tool calls\">");
    body.push_str(
        &ui::Field {
            value: filters.get("action"),
            placeholder: "Search tools…",
            ..ui::Field::new(
                "logs-action",
                "action",
                "Search",
                ui::Control::Input(ui::InputType::Search),
            )
        }
        .render(),
    );
    body.push_str(&select(
        filters,
        "status",
        "Status",
        &["", "succeeded", "failed"],
    ));
    body.push_str("<details class=\"ui-disclosure\"><summary>More filters</summary>");
    for (key, label, help) in [
        ("connector", "Connector", ""),
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
    body.push_str("</details>");
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
    let clear = link("Clear filters", "/app/calls").expect("static local Calls route");
    let status = filters.get("status");
    let segmented = ui::segmented(
        "Filter by status",
        &[
            ui::SegmentedItem {
                href: ui::LocalPath::new("/app/calls").unwrap(),
                label: "All",
                count: None,
                current: status.is_empty(),
            },
            ui::SegmentedItem {
                href: ui::LocalPath::new("/app/calls?status=succeeded").unwrap(),
                label: "Succeeded",
                count: None,
                current: status == "succeeded",
            },
            ui::SegmentedItem {
                href: ui::LocalPath::new("/app/calls?status=failed").unwrap(),
                label: "Failed",
                count: None,
                current: status == "failed",
            },
        ],
    );
    body.push_str(&format!(
        "<div class=\"logs-filter-actions\">{segmented}{apply}{clear}</div></form>"
    ));
    body
}

fn page_header() -> String {
    ui::PageHeader {
        title: "Calls",
        purpose: "Inspect recorded tool executions.",
        action: None,
    }
    .render()
    .replacen("<h1>", "<h1 id=\"logs-heading\" tabindex=\"-1\">", 1)
}

fn surface_status(value: &Value) -> Result<&'static str, Error> {
    // Legacy bare boolean remains accepted during host transition to status.
    if value.get("unavailable").and_then(Value::as_bool) == Some(true) {
        return Ok("unavailable");
    }
    match value.get("status").and_then(Value::as_str) {
        Some("unavailable") => Ok("unavailable"),
        Some("error") => Ok("error"),
        Some("ok") | None => Ok("ok"),
        Some(_) => Err(Error::Unavailable),
    }
}

fn empty_state(
    title: &str,
    body: &str,
    action_label: &str,
    action_href: &str,
    role: ui::EmptyStateRole,
) -> String {
    ui::EmptyState {
        title,
        body,
        action_label,
        action_href: ui::LocalPath::new(action_href).expect("static local empty-state link"),
        role,
    }
    .render()
}

pub(crate) fn invalid(filters: &Filters) -> String {
    format!(
        "<section id=\"logs-page\" class=\"logs-page\" aria-labelledby=\"logs-heading\">{}{}<div class=\"logs-filter-error\" role=\"alert\"><h3>Review the log filters.</h3><p>Use a supported status and error code, a valid page size, and RFC3339 timestamps with UTC or an explicit offset. Created from must be earlier than Created before. Correct the filters and apply them again, or choose Clear filters to start over.</p></div></section>",
        page_header(),
        form(filters)
    )
}

pub(crate) fn render(raw: &Value, filters: &Filters, filtered: bool) -> Result<String, Error> {
    let data = raw.get("data").unwrap_or(raw);
    let surface = surface_status(data)?;
    match surface {
        "unavailable" => {
            return Ok(format!(
                "<section id=\"logs-page\" class=\"logs-page\" aria-labelledby=\"logs-heading\">{}{}</section>",
                page_header(),
                empty_state(
                    "Calls unavailable",
                    "The console could not load recorded calls. This page does not invent call rows or statuses.",
                    "Reload",
                    "/app/calls",
                    ui::EmptyStateRole::Alert,
                ),
            ));
        }
        "error" => {
            return Ok(format!(
                "<section id=\"logs-page\" class=\"logs-page\" aria-labelledby=\"logs-heading\">{}{}</section>",
                page_header(),
                empty_state(
                    "Calls unreachable",
                    "The console is configured to list calls, but the read failed. Nothing here is invented.",
                    "Reload",
                    "/app/calls",
                    ui::EmptyStateRole::Alert,
                ),
            ));
        }
        "ok" => {}
        _ => return Err(Error::Unavailable),
    }
    let items = data
        .as_array()
        .or_else(|| {
            ["logs", "items", "rows"]
                .iter()
                .find_map(|key| data.get(key).and_then(Value::as_array))
        })
        .ok_or(Error::Unavailable)?;
    let filtered = filtered
        || data.get("hasFilters").and_then(Value::as_bool) == Some(true)
        || data.get("filtered").and_then(Value::as_bool) == Some(true);
    let mut body = format!(
        "<section id=\"logs-page\" class=\"logs-page\" aria-labelledby=\"logs-heading\">{}{}",
        page_header(),
        form(filters)
    );
    if items.is_empty() {
        let empty = if filtered {
            empty_state(
                "No calls match these filters.",
                "Clear the filters to view recorded calls.",
                "Clear filters",
                "/app/calls",
                ui::EmptyStateRole::Status,
            )
        } else {
            empty_state(
                "No calls to show.",
                "Browse connectors to choose a tool to run.",
                "Browse connectors",
                "/app/connectors",
                ui::EmptyStateRole::Status,
            )
        };
        body.push_str(&empty);
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
    let full = link("Open full trace", "/app/calls")?;
    let login = link("Sign in again", "/app/login")?;
    Ok(format!("<dialog id=\"logs-inspector\" aria-labelledby=\"logs-inspector-title\"><header class=\"logs-inspector-heading\"><h2 id=\"logs-inspector-title\">Trace inspector</h2><form id=\"logs-inspector-close\" method=\"dialog\">{close}</form></header><div class=\"logs-inspector-actions\"><span id=\"logs-inspector-full\">{full}</span><span id=\"logs-inspector-login\" hidden>{login}</span></div><div id=\"logs-inspector-result\" aria-live=\"polite\" aria-busy=\"false\"></div></dialog>"))
}

fn row_status(item: &Value) -> Result<String, Error> {
    // Uncertain statuses stay fail-closed — never paint Unknown as success/idle.
    match item.get("status").and_then(Value::as_str) {
        Some("succeeded") => Ok(ui::state(ui::Tone::Ok, "succeeded")),
        Some("failed") => Ok(ui::state(ui::Tone::Dead, "failed")),
        Some("running") => Ok(ui::state(ui::Tone::Running, "running")),
        _ => Err(Error::Unavailable),
    }
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
                row_status(item)?
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
            link("Inspect", &format!("/app/calls/{request_id}"))?
        ));
    }
    body.push_str("</tbody></table></div>");
    Ok(body)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn calls_triad_empty_states_and_page_id() {
        let unavailable =
            render(&json!({"status": "unavailable"}), &Filters::default(), false).unwrap();
        assert!(unavailable.contains("id=\"logs-page\""));
        assert!(unavailable.contains("Calls unavailable"));
        assert!(unavailable.contains("does not invent call rows or statuses"));
        assert!(unavailable.contains("role=\"alert\""));
        assert!(unavailable.contains("href=\"/app/calls\""));
        assert!(!unavailable.contains("No calls to show."));
        assert!(!unavailable.contains("logs-filters"));
        assert!(!unavailable.contains("logs-table"));

        let legacy = render(&json!({"unavailable": true}), &Filters::default(), false).unwrap();
        assert!(legacy.contains("Calls unavailable"));
        assert!(legacy.contains("role=\"alert\""));
        assert!(!legacy.contains("logs-filters"));

        let error = render(&json!({"status": "error"}), &Filters::default(), false).unwrap();
        assert!(error.contains("Calls unreachable"));
        assert!(error.contains("role=\"alert\""));
        assert!(error.contains("href=\"/app/calls\""));
        assert!(!error.contains("No calls to show."));
        assert!(!error.contains("logs-filters"));

        let empty = render(&json!({"logs": []}), &Filters::default(), false).unwrap();
        assert!(empty.contains("No calls to show."));
        assert!(empty.contains("role=\"status\""));
        assert!(empty.contains("href=\"/app/connectors\""));
        assert!(empty.contains("logs-filters"));
        assert!(!empty.contains("Calls unavailable"));
        assert!(!empty.contains("match these filters"));

        let filtered =
            render(&json!({"logs": [], "hasFilters": true}), &Filters::default(), false).unwrap();
        assert!(filtered.contains("No calls match these filters."));
        assert!(filtered.contains("role=\"status\""));
        assert!(filtered.contains("href=\"/app/calls\""));
        assert!(!filtered.contains("No calls to show."));
        assert!(!filtered.contains("Calls unavailable"));

        let filtered_arg = render(&json!({"logs": []}), &Filters::default(), true).unwrap();
        assert!(filtered_arg.contains("No calls match these filters."));

        assert_eq!(
            render(&json!({"status": "mystery"}), &Filters::default(), false),
            Err(Error::Unavailable),
            "unknown status stays fail-closed"
        );
        assert_eq!(
            render(&json!({}), &Filters::default(), false),
            Err(Error::Unavailable),
            "missing list without unavailable marker stays fail-closed"
        );

        let populated = render(
            &json!({"status":"ok","logs":[{
                "requestId":"req_1",
                "status":"succeeded",
                "connector":"mail",
                "action":"send",
                "createdAt":"2026-09-07T10:00:00Z",
                "errorCode":""
            }]}),
            &Filters::default(),
            false,
        )
        .unwrap();
        assert!(populated.contains("id=\"logs-page\""));
        assert!(populated.contains("req_1"));
        assert!(populated.contains("logs-table"));
        assert!(populated.contains("logs-filters"));
        assert!(!populated.contains("Calls unavailable"));
        assert!(!populated.contains("Calls unreachable"));
    }

    #[test]
    fn uncertain_row_status_fails_closed() {
        assert_eq!(
            render(
                &json!({"logs":[{"requestId":"req_1","status":"mystery"}]}),
                &Filters::default(),
                false,
            ),
            Err(Error::Unavailable),
            "unknown row status must not paint as success"
        );
        assert_eq!(
            render(
                &json!({"logs":[{"requestId":"req_1"}]}),
                &Filters::default(),
                false,
            ),
            Err(Error::Unavailable),
            "missing row status must not paint Unknown as idle"
        );
    }
}
