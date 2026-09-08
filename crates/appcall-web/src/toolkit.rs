//! Connector detail presentation. Values come from the scoped dashboard DTO.
use crate::{http::escape, ui, Error};
use serde_json::{json, Value};
use std::collections::BTreeMap;

const TABS: [(&str, &str); 5] = [
    ("tools", "Tools"),
    ("accounts", "Accounts"),
    ("events", "Events"),
    ("code", "Code"),
    ("settings", "Settings"),
];
pub(crate) fn selected_tab(value: &str) -> &'static str {
    TABS.iter()
        .find(|(key, _)| *key == value)
        .map(|(key, _)| *key)
        .unwrap_or("tools")
}
fn text<'a>(v: &'a Value, key: &str) -> &'a str {
    v.get(key).and_then(Value::as_str).unwrap_or("")
}
fn operation_title(operation: &Value) -> &str {
    let title = text(operation, "title");
    if title.is_empty() {
        text(operation, "name")
    } else {
        title
    }
}
fn array<'a>(v: &'a Value, key: &str) -> &'a [Value] {
    v.get(key)
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or(&[])
}
fn valid_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 256
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.'))
}
fn link(label: &str, href: &str) -> String {
    styled_link(label, href, ui::ButtonVariant::Quiet)
}
fn styled_link(label: &str, href: &str, variant: ui::ButtonVariant) -> String {
    ui::Button {
        target: ui::ButtonTarget::Link(ui::LocalPath::new(href).expect("owned local route")),
        variant,
        ..ui::Button::new(label)
    }
    .render()
}
fn submit(label: &str, disabled: bool) -> String {
    styled_submit(label, disabled, ui::ButtonVariant::Primary)
}
fn styled_submit(label: &str, disabled: bool, variant: ui::ButtonVariant) -> String {
    ui::Button {
        target: ui::ButtonTarget::Button {
            kind: ui::ButtonType::Submit,
            form: None,
            action: None,
        },
        disabled,
        variant,
        working_label: Some("Working…"),
        ..ui::Button::new(label)
    }
    .render()
}
fn decorate_link(mut html: String, id: Option<&str>, current: bool) -> String {
    let mut attributes = String::new();
    if let Some(id) = id {
        attributes.push_str(&format!(" id=\"{}\"", escape(id)));
    }
    if current {
        attributes.push_str(" aria-current=\"page\"");
    }
    if !attributes.is_empty() {
        html = html.replacen("<a ", &format!("<a{attributes} "), 1);
    }
    html
}
fn hidden(id: &str, name: &str, value: &str) -> String {
    ui::Field {
        value,
        ..ui::Field::new(id, name, "", ui::Control::Input(ui::InputType::Hidden))
    }
    .render()
}
fn pretty(v: &Value) -> String {
    escape(&serde_json::to_string_pretty(v).unwrap_or_default())
}
fn destination(key: &str, pairs: &[(&str, &str)]) -> String {
    let mut url = reqwest::Url::parse(&format!("https://local.invalid/app/toolkits/{key}"))
        .expect("validated connector key");
    for (name, value) in pairs.iter().filter(|(_, value)| !value.is_empty()) {
        url.query_pairs_mut().append_pair(name, value);
    }
    format!(
        "{}{}",
        url.path(),
        url.query().map(|q| format!("?{q}")).unwrap_or_default()
    )
}
fn account_rows<'a>(v: &'a Value, key: &str) -> Vec<&'a Value> {
    array(v, "connections")
        .iter()
        .filter(|c| text(c, "connector") == key)
        .collect()
}
fn eligible<'a>(accounts: &[&'a Value]) -> Vec<&'a Value> {
    accounts
        .iter()
        .copied()
        .filter(|c| text(c, "status") == "active" && valid_id(text(c, "id")))
        .collect()
}
fn requested_account<'a>(v: &Value, accounts: &[&'a Value]) -> Result<Option<&'a Value>, Error> {
    let requested = text(v, "connectionId");
    if requested.is_empty() {
        return Ok(None);
    }
    if !valid_id(requested) {
        return Err(Error::Unavailable);
    }
    accounts
        .iter()
        .copied()
        .find(|c| text(c, "id") == requested)
        .map(Some)
        .ok_or(Error::Unavailable)
}
fn supported_setup(v: &Value) -> bool {
    matches!(text(v, "mode"), "api_key" | "oauth2" | "external_bearer")
}

pub(crate) fn render(v: &Value, key: &str) -> Result<String, Error> {
    if !valid_id(key) {
        return Err(Error::Invalid);
    }
    let operations: Vec<Value> = v
        .get("operations")
        .and_then(Value::as_array)
        .ok_or(Error::Unavailable)?
        .iter()
        .filter(|operation| !text(operation, "name").is_empty())
        .cloned()
        .collect();
    let accounts = account_rows(v, key);
    let active = eligible(&accounts);
    let requested = requested_account(v, &accounts)?;
    // Explicit reconnects stay attached to their requested row for settings
    // and navigation, even when that row is degraded/disconnected. Execution
    // still falls back to an active account because non-active rows cannot run.
    let setup_connection = requested.map(|c| text(c, "id")).unwrap_or("");
    let connection = requested
        .filter(|c| text(c, "status") == "active" && valid_id(text(c, "id")))
        .map(|c| text(c, "id"))
        .or_else(|| active.first().map(|c| text(c, "id")))
        .unwrap_or("");
    // Preserve an omitted id across navigation too; adding the first active
    // row to a settings link would turn a new setup into an implicit update.
    let navigation_connection = setup_connection;
    let action = operations.iter().find(|o| {
        !text(v, "action").is_empty()
            && text(o, "kind") == "action"
            && text(o, "name") == text(v, "action")
    });
    let action_name = action.map(|o| text(o, "name")).unwrap_or("");
    let tab = selected_tab(text(v, "tab"));
    let setup_url = format!(
        "{}#tk-setup",
        destination(
            key,
            &[
                ("tab", "settings"),
                ("action", action_name),
                ("connectionId", navigation_connection)
            ]
        )
    );
    let mut html=format!("<div id=\"tk-detail\" data-toolkit-key=\"{}\">{}<header class=\"tk-header\"><div><h1>{}</h1><p>{}</p></div>",escape(key),ui::back_link("Toolkits",ui::LocalPath::new("/app/toolkits").unwrap()),escape(text(v,"name")),escape(text(v,"description")));
    if active.is_empty() && v.get("setup").is_some_and(supported_setup) {
        html.push_str(&styled_link(
            "Connect",
            &setup_url,
            ui::ButtonVariant::Primary,
        ));
    }
    html.push_str("</header><nav id=\"tk-tabs\" aria-label=\"Connector sections\">");
    for (id, label) in TABS {
        let url = destination(
            key,
            &[
                ("tab", id),
                ("action", action_name),
                ("connectionId", navigation_connection),
            ],
        );
        html.push_str(&format!(
            "<span id=\"tk-tab-{id}\" data-tab=\"{id}\" data-selected=\"{}\">{}</span>",
            id == tab,
            decorate_link(
                link(label, &url),
                Some(&format!("tk-tab-{id}-link")),
                id == tab,
            )
        ));
    }
    html.push_str("</nav>");
    let panels = [
        tools(v, key, &operations, &active, connection, action)?,
        accounts_panel(&accounts),
        events(key, &operations),
        code(v, connection, action_name),
        settings(v, key, setup_connection)?,
    ];
    for ((id, label), content) in TABS.into_iter().zip(panels) {
        html.push_str(&format!("<section id=\"tk-panel-{id}\" class=\"tk-panel\" aria-label=\"{label}\"{}>{content}</section>",if id==tab{""}else{" hidden"}));
    }
    html.push_str(
        "<p id=\"tk-status\" role=\"status\" aria-live=\"polite\" aria-atomic=\"true\"></p></div>",
    );
    Ok(html)
}

fn tools(
    v: &Value,
    key: &str,
    operations: &[Value],
    active: &[&Value],
    connection: &str,
    action: Option<&Value>,
) -> Result<String, Error> {
    let actions: Vec<_> = operations
        .iter()
        .filter(|o| text(o, "kind") == "action")
        .collect();
    let action_name = action.map(|o| text(o, "name")).unwrap_or("");
    let mut groups: BTreeMap<&str, Vec<&Value>> = BTreeMap::new();
    for op in &actions {
        groups
            .entry(
                text(op, "name")
                    .split_once('.')
                    .map(|(prefix, _)| prefix)
                    .unwrap_or("General"),
            )
            .or_default()
            .push(op);
    }
    let filter = ui::Field::new(
        "tk-tool-filter",
        "toolFilter",
        "Filter tools",
        ui::Control::Input(ui::InputType::Search),
    )
    .render()
    .replacen(
        "<input class=\"ui-control\"",
        "<input aria-controls=\"tk-tool-list\" class=\"ui-control\"",
        1,
    );
    let mut html=String::from("<div class=\"tk-tools-layout\"><aside id=\"tk-tool-list\" class=\"tk-tool-list\" aria-label=\"Available tools\">");
    html.push_str(&filter);
    for (group, mut ops) in groups {
        ops.sort_by_key(|o| text(o, "name"));
        html.push_str(&format!(
            "<section class=\"tk-tool-group\"><h3>{}</h3>",
            escape(group)
        ));
        for op in ops {
            let name = text(op, "name");
            let title = operation_title(op);
            html.push_str(&format!(
                "<div class=\"tk-tool-item\" data-selected=\"{}\">{}<code>{}</code>{}</div>",
                name == action_name,
                decorate_link(
                    link(
                        title,
                        &destination(key, &[("action", name), ("connectionId", connection)]),
                    ),
                    None,
                    name == action_name,
                ),
                escape(name),
                if op.get("readOnly").and_then(Value::as_bool) == Some(true) {
                    ui::tag("Read only")
                } else {
                    String::new()
                }
            ));
        }
        html.push_str("</section>");
    }
    html.push_str("</aside><div class=\"tk-tool-workspace\">");
    let options: Vec<_> = actions
        .iter()
        .map(|o| ui::SelectOption {
            value: text(o, "name"),
            label: operation_title(o),
            disabled: false,
        })
        .collect();
    let selector = ui::Field {
        value: action_name,
        disabled: actions.is_empty(),
        ..ui::Field::new("tk-action", "action", "Tool", ui::Control::Select(&options))
    }
    .render();
    html.push_str(&format!("<form id=\"tk-tool-selector\" method=\"get\" action=\"/app/toolkits/{key}\" class=\"tk-mobile-selector\">{selector}{}{}</form>",hidden("tk-selection-connection","connectionId",connection),styled_submit("Select tool",actions.is_empty(),ui::ButtonVariant::Quiet)));
    if let Some(op) = action {
        html.push_str(&format!("<header class=\"tk-selected-tool\"><h2>{}</h2><code>{}</code><p>{}</p></header><details class=\"tk-schema\"><summary>Schema</summary><h3>Input schema</h3><pre aria-live=\"off\">{}</pre><h3>Output schema</h3><pre aria-live=\"off\">{}</pre></details>",escape(operation_title(op)),escape(action_name),escape(text(op,"description")),pretty(op.get("inputSchema").unwrap_or(&Value::Null)),pretty(op.get("outputSchema").unwrap_or(&Value::Null))));
    } else {
        html.push_str(
            &ui::EmptyState {
                title: "No tool selected",
                body: "Select an available tool to inspect its inputs.",
                action_label: "Browse toolkits",
                action_href: ui::LocalPath::new("/app/toolkits").unwrap(),
            }
            .render(),
        );
    }
    let options: Vec<_> = active
        .iter()
        .map(|c| ui::SelectOption {
            value: text(c, "id"),
            label: text(c, "id"),
            disabled: false,
        })
        .collect();
    let account = ui::Field {
        value: connection,
        disabled: active.is_empty(),
        help: "Active connection ID used to execute this tool.",
        ..ui::Field::new(
            "tk-connection",
            "connectionId",
            "Run as",
            ui::Control::Select(&options),
        )
    }
    .render();
    let post=format!("@post('/app/toolkits/{key}/test', {{contentType:'form', retry:'never', retryMaxCount:1, openWhenHidden:true, requestCancellation:new AbortController()}})");
    let run = if !active.is_empty()
        && action.is_some_and(|op| op.get("destructive").and_then(Value::as_bool) == Some(true))
    {
        ui::ConfirmButton {
            id: "tk-run-confirm",
            trigger: "Run tool",
            heading: "Confirm destructive operation",
            body: &format!("Run {action_name} as {connection}? This operation is marked destructive and may permanently change data."),
            confirm: "Confirm and run",
            action: ui::LocalPath::new(&format!("/app/toolkits/{key}/test")).unwrap(),
            form: Some("tk-run-form"),
        }.render()
    } else {
        submit("Run tool", active.is_empty() || action.is_none())
    };
    html.push_str(&format!("<div class=\"tk-run-layout\"><form id=\"tk-run-form\" class=\"tk-input-pane\" method=\"post\" action=\"/app/toolkits/{key}/test\" data-on:submit=\"{}\">{account}{}{}<div id=\"tk-run-control\">{run}</div></form>{}</div></div></div>",escape(&post),hidden("tk-selected-action","action",action_name),test_fields(v,key)?,result(None)));
    Ok(html)
}

pub(crate) fn test_fields(v: &Value, key: &str) -> Result<String, Error> {
    let schema = v
        .get("inputSchema")
        .or_else(|| v.get("schema"))
        .unwrap_or(v);
    let guided = crate::forms::render_guided_fields(
        schema,
        v.get("sample").unwrap_or(&Value::Null),
        "f",
        Some(key),
    )?;
    let credential = ui::Field {
        autocomplete: Some("off"),
        ..ui::Field::new(
            "tk-caller-token",
            "callerToken",
            "Caller credential (if required)",
            ui::Control::Input(ui::InputType::Password),
        )
    }
    .render();
    let raw = ui::Field {
        help: "Replaces the fields above when nonempty. Closing this editor preserves its input.",
        ..ui::Field::new(
            "tk-input-raw",
            "input_raw",
            "Raw JSON input",
            ui::Control::Textarea,
        )
    }
    .render();
    Ok(format!("<div id=\"tk-test-fields\" aria-live=\"polite\" aria-busy=\"false\" aria-labelledby=\"tk-fields-label\" data-fields-valid=\"true\"><h3 id=\"tk-fields-label\">Tool input</h3>{guided}{credential}<details class=\"tk-raw-input\"><summary>Edit as JSON</summary>{raw}</details><div id=\"tk-runinput\"></div></div>"))
}

pub(crate) fn result(v: Option<&Value>) -> String {
    let mut html=format!("<section id=\"tk-test-result\" class=\"tk-result-pane\" aria-live=\"polite\" aria-busy=\"false\" aria-labelledby=\"tk-result-label\" data-result-state=\"{}\"><h3 id=\"tk-result-label\">Result</h3>",if v.is_some(){"success"}else{"idle"});
    if let Some(v) = v {
        html.push_str(&ui::state(ui::Tone::Ok, "Succeeded"));
        let request = text(v, "requestId");
        if valid_id(request) {
            html.push_str(&link("View trace", &format!("/app/logs/{request}")));
        }
        html.push_str(&format!("<div id=\"tk-copy-json\">{}</div><pre id=\"tk-output-json\" aria-live=\"off\">{}</pre>",ui::Button{variant:ui::ButtonVariant::Quiet,..ui::Button::new("Copy JSON")}.render(),pretty(v.get("output").unwrap_or(&Value::Null))));
    } else {
        html.push_str(&ui::state(ui::Tone::Idle, "Ready to run"));
        html.push_str(
            "<p>Select a tool and an active account, review its input, then choose Run tool.</p>",
        );
    }
    html.push_str("</section>");
    html
}

fn accounts_panel(accounts: &[&Value]) -> String {
    let mut html=String::from("<h2>Accounts</h2><p>Connections available for this connector. Only active connections can run tools.</p>");
    if accounts.is_empty() {
        html.push_str(
            &ui::EmptyState {
                title: "No accounts connected",
                body: "Use Settings to configure a supported connection.",
                action_label: "Manage accounts",
                action_href: ui::LocalPath::new("/app/auth-configs").unwrap(),
            }
            .render(),
        );
    } else {
        html.push_str("<div class=\"tk-account-table\"><table><caption class=\"sr-only\">Connector accounts</caption><thead><tr><th scope=\"col\">Connection ID</th><th scope=\"col\">Auth type</th><th scope=\"col\">Status</th><th scope=\"col\">Last test</th></tr></thead><tbody>");
        for c in accounts {
            html.push_str(&format!(
                "<tr><td><code>{}</code></td><td>{}</td><td>{}</td><td>{}</td></tr>",
                escape(text(c, "id")),
                escape(text(c, "authType")),
                ui::state(
                    if text(c, "status") == "active" {
                        ui::Tone::Ok
                    } else {
                        ui::Tone::Idle
                    },
                    if text(c, "status").is_empty() {
                        "Unknown"
                    } else {
                        text(c, "status")
                    }
                ),
                c.get("lastTest")
                    .filter(|v| !v.is_null())
                    .map(|v| v.as_str().map(escape).unwrap_or_else(|| pretty(v)))
                    .unwrap_or_else(|| "Not recorded".into())
            ));
        }
        html.push_str("</tbody></table></div>");
    }
    html.push_str(&link("Manage accounts", "/app/auth-configs"));
    html
}
fn events(key: &str, operations: &[Value]) -> String {
    let mut html =
        String::from("<h2>Events</h2><p>Declared webhook events supported by this connector.</p>");
    let webhooks: Vec<_> = operations
        .iter()
        .filter(|o| text(o, "kind") == "webhook")
        .collect();
    if webhooks.is_empty() {
        html.push_str("<p>No webhook events are declared for this connector.</p>");
    }
    for op in webhooks {
        html.push_str(&format!(
            "<article class=\"tk-event\"><h3>{}</h3><code>{}</code><p>{}</p></article>",
            escape(operation_title(op)),
            escape(text(op, "name")),
            escape(text(op, "description"))
        ));
    }
    html.push_str(&link(
        "View received events",
        &format!("/app/triggers?connector={key}"),
    ));
    html
}
fn setup_controls(fields: &[Value], prefix: &str) -> Result<String, Error> {
    let mut html = String::new();
    for (index, field) in fields.iter().enumerate() {
        let name = field
            .get("key")
            .or_else(|| field.get("name"))
            .and_then(Value::as_str)
            .unwrap_or("");
        if !valid_id(name) {
            return Err(Error::Unavailable);
        }
        let id = format!("tk-setup-{prefix}-{index}-{name}");
        html.push_str(
            &ui::Field {
                required: field.get("required").and_then(Value::as_bool) == Some(true),
                autocomplete: Some("off"),
                help: text(field, "help"),
                ..ui::Field::new(
                    &id,
                    name,
                    text(field, "label"),
                    ui::Control::Input(
                        if field.get("secret").and_then(Value::as_bool) == Some(true) {
                            ui::InputType::Password
                        } else {
                            ui::InputType::Text
                        },
                    ),
                )
            }
            .render(),
        );
    }
    Ok(html)
}
fn settings(v: &Value, key: &str, connection: &str) -> Result<String, Error> {
    let mut html = String::from("<div id=\"tk-setup\" tabindex=\"-1\"><h2>Settings</h2>");
    if let Some(setup) = v.get("setup") {
        html.push_str(&format!("<p>{}</p>", escape(text(setup, "help"))));
        if supported_setup(setup) {
            html.push_str(&format!(
                "<p>Setup mode: {}</p>",
                escape(text(setup, "mode"))
            ));
            let routes = array(setup, "routes");
            if routes.is_empty() {
                let name = text(v, "name");
                let label = match (text(setup, "mode"), name.is_empty()) {
                    ("api_key", false) => format!("Connect {name}"),
                    ("oauth2", false) => format!("Continue to {name}"),
                    _ => "Connect".to_owned(),
                };
                html.push_str(&format!(
                    "<form method=\"post\" action=\"/app/toolkits/{key}/setup\">{}{}{}</form>",
                    if connection.is_empty() {
                        String::new()
                    } else {
                        hidden("tk-setup-connection", "connectionId", connection)
                    },
                    setup_controls(array(setup, "fields"), "base")?,
                    submit(&label, false)
                ));
            } else {
                for (index, route) in routes.iter().enumerate() {
                    let route_id = text(route, "id");
                    if !valid_id(route_id) {
                        return Err(Error::Unavailable);
                    }
                    html.push_str(&format!("<form method=\"post\" action=\"/app/toolkits/{key}/setup\"><h3>{}</h3><p>{}</p>{}{}{}{}{}</form>",escape(text(route,"label")),escape(text(route,"help")),if connection.is_empty(){String::new()}else{hidden(&format!("tk-setup-connection-{index}"),"connectionId",connection)},setup_controls(array(setup,"fields"),&format!("{index}-base"))?,hidden(&format!("tk-setup-route-{index}"),"route",route_id),setup_controls(array(route,"fields"),&format!("{index}-route"))?,submit(text(route,"label"),false)));
                }
            }
        } else if text(setup, "mode") == "none" {
            html.push_str("<p>No additional configuration is required by this connector.</p>");
        } else {
            html.push_str("<p>This setup mode is not supported by the dashboard.</p>");
        }
    } else {
        html.push_str("<p>No additional configuration is declared for this connector.</p>");
    }
    html.push_str(&link("Manage accounts", "/app/auth-configs"));
    html.push_str("</div>");
    Ok(html)
}

/// URI segment encoding is separate from shell quoting and HTML escaping.
fn segment(value: &str) -> String {
    value
        .bytes()
        .map(|b| {
            if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'~') {
                char::from(b).to_string()
            } else {
                format!("%{b:02X}")
            }
        })
        .collect()
}
fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\"'\"'"))
}
fn code(v: &Value, connection: &str, action: &str) -> String {
    let connection = if connection.is_empty() {
        "YOUR_CONNECTION_ID"
    } else {
        connection
    };
    let action = if action.is_empty() {
        "YOUR_ACTION"
    } else {
        action
    };
    let sample = v
        .get("sample")
        .filter(|v| !v.is_null())
        .cloned()
        .unwrap_or_else(|| json!({}));
    let body = json!({"input":sample});
    let path = format!(
        "/v1/connections/{}/actions/{}",
        segment(connection),
        segment(action)
    );
    let example=format!("curl --request POST {} \\\n  --header {} \\\n  --header {} \\\n  --header {} \\\n  --data {}",shell_quote(&format!("https://YOUR_APPCALL_ORIGIN{path}")),shell_quote("X-API-Key: YOUR_API_KEY"),shell_quote("X-External-Account-Id: YOUR_EXTERNAL_ACCOUNT_ID"),shell_quote("Content-Type: application/json"),shell_quote(&body.to_string()));
    let data = json!({"action":action,"body":body});
    let mut html=format!("<h2>Code</h2><p>Sample input from the connector manifest; review it for your request. This is not the current guided input and may require changes.</p><p>Replace YOUR_APPCALL_ORIGIN, YOUR_API_KEY, YOUR_EXTERNAL_ACCOUNT_ID, and any connection or action placeholders. The external account ID is the account scope associated with the connection.</p><pre id=\"tk-code-example\" aria-live=\"off\">{}</pre><template id=\"tk-code-data\">{}</template>",escape(&example),escape(&data.to_string()));
    if v.get("setup")
        .is_some_and(|s| text(s, "mode") == "external_bearer")
    {
        html.push_str("<p>For per-call credentials, include X-Connector-Token with the credential required by this connector.</p>");
    }
    html
}
