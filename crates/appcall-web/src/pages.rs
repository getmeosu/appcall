use crate::{http::escape, DashboardOperation as Op, Error};
use serde_json::Value;
pub(crate) fn title(op: Op) -> &'static str {
    match op {
        Op::Overview => "Getting Started",
        Op::Catalog | Op::Toolkit | Op::Setup => "Toolkits",
        Op::AuthConfigs => "Auth Configs",
        Op::Triggers => "Events",
        Op::Logs | Op::Trace => "Logs",
        Op::Runs | Op::RunNow | Op::ResetRun | Op::CancelRun => "Runs",
        Op::Qa => "QA",
        Op::Usage => "Usage",
        Op::Branding => "White Labeling",
        _ => "Result",
    }
}
fn header(title: &str, subtitle: &str) -> String {
    format!("<div class=\"mb-6\"><h2 class=\"text-xl font-semibold tracking-tight text-dusk-blue-50\">{}</h2><p class=\"mt-1 text-sm text-dusk-blue-400\">{}</p></div>",escape(title),escape(subtitle))
}
fn catalog_header(title: &str, subtitle: &str) -> String {
    format!(
        "<header class=\"catalog-header\"><h2>{}</h2><p>{}</p></header>",
        escape(title),
        escape(subtitle)
    )
}
fn card(body: &str) -> String {
    format!("<div class=\"rounded-xl border border-space-indigo-800 bg-space-indigo-950 p-5\">{body}</div>")
}
fn catalog_card(body: &str) -> String {
    format!("<section class=\"catalog-request-panel\">{body}</section>")
}
fn empty(title: &str, body: &str, action: &str, href: &str) -> String {
    crate::ui::EmptyState {
        title,
        body,
        action_label: action,
        action_href: crate::ui::LocalPath::new(href).expect("static local empty-state link"),
    }
    .render()
}
fn stat(label: &str, value: &Value) -> String {
    card(&format!("<p class=\"text-xs font-medium uppercase tracking-wider text-dusk-blue-500\">{}</p><p class=\"mt-2 text-2xl font-semibold text-dusk-blue-50\">{}</p>",escape(label),escape(&value.to_string())))
}
fn string<'a>(v: &'a Value, keys: &[&str]) -> &'a str {
    keys.iter()
        .find_map(|k| v.get(*k).and_then(Value::as_str))
        .unwrap_or("")
}
fn rows<'a>(v: &'a Value, keys: &[&str]) -> Result<&'a Vec<Value>, Error> {
    v.as_array()
        .or_else(|| {
            keys.iter()
                .find_map(|k| v.get(*k).and_then(Value::as_array))
        })
        .ok_or(Error::Unavailable)
}
fn id(v: &Value, keys: &[&str]) -> Result<String, Error> {
    let value = string(v, keys);
    if value.is_empty()
        || value.len() > 256
        || !value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.'))
    {
        return Err(Error::Unavailable);
    }
    Ok(value.into())
}
fn input(name: &str, label: &str, value: &str, kind: &str) -> String {
    let control = match kind {
        "email" => crate::ui::InputType::Email,
        "password" => crate::ui::InputType::Password,
        "number" => crate::ui::InputType::Number,
        "search" => crate::ui::InputType::Search,
        _ => crate::ui::InputType::Text,
    };
    crate::ui::Field {
        value,
        ..crate::ui::Field::new(name, name, label, crate::ui::Control::Input(control))
    }
    .render()
}
fn form(action: &str, content: &str, label: &str) -> String {
    form_with_variant(action, content, label, crate::ui::ButtonVariant::Primary)
}
fn form_with_variant(
    action: &str,
    content: &str,
    label: &str,
    variant: crate::ui::ButtonVariant,
) -> String {
    let datastar = if action == "/app/toolkits/request" {
        " data-on:submit=\"@post('/app/toolkits/request', {contentType: 'form', retry:'never', retryMaxCount:1, openWhenHidden:true, requestCancellation:new AbortController()})\"".to_owned()
    } else {
        String::new()
    };
    let button = crate::ui::Button {
        variant,
        working_label: (action == "/app/toolkits/request").then_some("Submitting…"),
        target: crate::ui::ButtonTarget::Button {
            kind: crate::ui::ButtonType::Submit,
            form: None,
            action: None,
        },
        ..crate::ui::Button::new(label)
    }
    .render();
    format!("<form method=\"post\" action=\"{}\" class=\"mt-5 space-y-4\"{datastar}>{content}{button}</form>",escape(action))
}
// Shared by data failures and the catalog's inert transport-recovery template.
fn request_recovery() -> String {
    let support = crate::ui::Button {
        target: crate::ui::ButtonTarget::Link(
            crate::ui::LocalPath::new("/app/support").expect("static local path"),
        ),
        variant: crate::ui::ButtonVariant::Quiet,
        size: crate::ui::ButtonSize::Sm,
        ..crate::ui::Button::new("Open Support")
    }
    .render();
    format!("<p role=\"alert\">Appcall could not confirm receipt of this connector request. Open Support to check whether it was received before submitting another request.</p>{support}")
}
pub(crate) fn request_failure() -> String {
    format!("<div id=\"toolkit-request-result\" role=\"status\" aria-label=\"Connector request result\" aria-live=\"polite\" aria-busy=\"false\" data-request-state=\"error\" class=\"catalog-request-result\">{}</div>", request_recovery())
}
fn json(v: &Value) -> String {
    format!("<pre class=\"overflow-x-auto rounded-panel border border-line bg-ground text-ink-100 p-5 text-xs\">{}</pre>",escape(&serde_json::to_string_pretty(v).unwrap_or_default()))
}
fn confirmation(action: &str, label: &str, heading: &str, body: &str) -> Result<String, Error> {
    Ok(crate::ui::ConfirmButton {
        id: &crate::ui::document_id()?,
        trigger: label,
        heading,
        body,
        confirm: label,
        action: crate::ui::LocalPath::new(action).ok_or(Error::Invalid)?,
        form: None,
    }
    .render())
}
fn catalog_query_url(category: &str, search: &str) -> String {
    let mut url =
        reqwest::Url::parse("https://local.invalid/app/toolkits").expect("static catalog route");
    if !category.is_empty() {
        url.query_pairs_mut().append_pair("category", category);
    }
    if !search.trim().is_empty() {
        url.query_pairs_mut().append_pair("search", search);
    }
    format!(
        "{}{}",
        url.path(),
        url.query()
            .map(|query| format!("?{query}"))
            .unwrap_or_default()
    )
}
fn catalog_filter_link(label: &str, href: &str, current: bool) -> Result<String, Error> {
    let path = crate::ui::LocalPath::new(href).ok_or(Error::Invalid)?;
    let link = crate::ui::Button {
        size: crate::ui::ButtonSize::Sm,
        variant: crate::ui::ButtonVariant::Secondary,
        target: crate::ui::ButtonTarget::Link(path),
        ..crate::ui::Button::new(label)
    }
    .render();
    Ok(if current {
        link.replacen(" href=", " aria-current=\"page\" href=", 1)
    } else {
        link
    })
}
pub(crate) fn event_replay(id: &str) -> Result<String, Error> {
    confirmation(
        &format!("/app/triggers/{id}/replay"),
        "Run this again",
        "Dispatch this event again?",
        &format!("Dispatch event {id} again? Consumers may process the event again."),
    )
}
fn value_text(value: &Value, key: &str) -> String {
    value
        .get(key)
        .filter(|value| !value.is_null())
        .map(|value| {
            value
                .as_str()
                .map(str::to_owned)
                .unwrap_or_else(|| value.to_string())
        })
        .unwrap_or_default()
}
fn value_bool(value: &Value, key: &str) -> bool {
    value.get(key).and_then(Value::as_bool).unwrap_or(false)
}
fn run_health(value: &Value) -> Result<(&'static str, crate::ui::Tone), Error> {
    match value.get("health").and_then(Value::as_str) {
        Some("pending") => Ok(("Pending", crate::ui::Tone::Idle)),
        Some("running") => Ok(("Running", crate::ui::Tone::Running)),
        Some("backingoff") => Ok(("Backing off", crate::ui::Tone::Warn)),
        Some("dead" | "failed" | "cancelled") => Ok(("Dead", crate::ui::Tone::Dead)),
        Some("succeeded") => Ok(("Succeeded", crate::ui::Tone::Ok)),
        _ => Err(Error::Unavailable),
    }
}
fn required_nonnegative(value: &Value, key: &str) -> Result<String, Error> {
    value
        .get(key)
        .and_then(nonnegative_number)
        .map(|value| value.to_string())
        .ok_or(Error::Unavailable)
}
fn required_nonnegative_value(value: &Value) -> Result<String, Error> {
    nonnegative_number(value)
        .map(|value| value.to_string())
        .ok_or(Error::Unavailable)
}
fn nonnegative_number(value: &Value) -> Option<u64> {
    value.as_u64().or_else(|| {
        value
            .as_i64()
            .filter(|value| *value >= 0)
            .map(|value| value as u64)
    })
}
fn unavailable_telemetry(label: &str) -> String {
    format!(
        "<span class=\"runs-telemetry-unavailable\" aria-label=\"{} unavailable\">Unavailable</span>",
        escape(label)
    )
}
fn optional_text(value: &Value, key: &str, label: &str, empty: &str) -> String {
    match value.get(key).and_then(Value::as_str) {
        Some(text) if !text.is_empty() => escape(text),
        Some(_) => escape(empty),
        None => unavailable_telemetry(label),
    }
}
fn run_control(
    _action: &str,
    _id: &str,
    _value: &Value,
    _operator_controls_unavailable: bool,
) -> Result<String, Error> {
    // No trusted operator capability exists in the current auth contract.
    // Queue eligibility is still rendered as read-only state evidence, but no
    // request payload may turn it into a write confirmation.
    Ok(String::new())
}
fn runs_header() -> String {
    "<header class=\"runs-header\"><h2 id=\"runs-heading\">Runs</h2><p>Monitor durable message sync work and recover queue state.</p></header>".to_owned()
}
fn runs_card(body: &str) -> String {
    format!("<div class=\"runs-card\">{body}</div>")
}
fn runs_stat(label: &str, value: &str) -> String {
    format!(
        "<div class=\"runs-card runs-stat\"><p class=\"runs-stat-label\">{}</p><p class=\"runs-stat-value\">{}</p></div>",
        escape(label),
        escape(value)
    )
}
fn runs_filter_field(id: &str, name: &str, label: &str, value: &str) -> String {
    let mut field = crate::ui::Field::new(
        id,
        name,
        label,
        crate::ui::Control::Input(crate::ui::InputType::Search),
    );
    field.value = value;
    field.autocomplete = Some("off");
    field.render()
}
fn runs_status_field(value: &str) -> String {
    let options = [
        crate::ui::SelectOption {
            value: "",
            label: "All statuses",
            disabled: false,
        },
        crate::ui::SelectOption {
            value: "pending",
            label: "Pending",
            disabled: false,
        },
        crate::ui::SelectOption {
            value: "running",
            label: "Running",
            disabled: false,
        },
        crate::ui::SelectOption {
            value: "backingoff",
            label: "Backing off",
            disabled: false,
        },
        crate::ui::SelectOption {
            value: "dead",
            label: "Dead",
            disabled: false,
        },
        crate::ui::SelectOption {
            value: "succeeded",
            label: "Succeeded",
            disabled: false,
        },
    ];
    let mut field = crate::ui::Field::new(
        "runs-status-filter",
        "status",
        "Status",
        crate::ui::Control::Select(&options),
    );
    field.value = value;
    field.render()
}
fn runs_submit_button() -> String {
    let mut button = crate::ui::Button::new("Filter runs");
    button.size = crate::ui::ButtonSize::Sm;
    button.working_label = Some("Filtering…");
    button.target = crate::ui::ButtonTarget::Button {
        kind: crate::ui::ButtonType::Submit,
        form: None,
        action: None,
    };
    button.render()
}
fn runs_link_button(
    label: &str,
    variant: crate::ui::ButtonVariant,
    href: &str,
) -> Result<String, Error> {
    let mut button = crate::ui::Button::new(label);
    button.variant = variant;
    button.size = crate::ui::ButtonSize::Sm;
    button.target =
        crate::ui::ButtonTarget::Link(crate::ui::LocalPath::new(href).ok_or(Error::Invalid)?);
    Ok(button.render())
}
fn runs(v: &Value) -> Result<String, Error> {
    if value_bool(v, "unavailable") {
        return Ok(format!(
            "<section id=\"runs-page\" data-runs-page aria-labelledby=\"runs-heading\">{}{}</section>",
            runs_header(),
            runs_card(
                "<h3>Runs status unavailable</h3><p>Configure PostgreSQL and the Rust sync queue to inspect durable runs.</p>",
            )
            .replacen(
                "class=\"runs-card\"",
                "class=\"runs-card runs-unavailable-card\"",
                1,
            )
        ));
    }
    let items = rows(v, &["runs", "items", "rows"])?;
    let records_24h = match v.get("records24h") {
        Some(value) => Some(required_nonnegative_value(value)?),
        None if value_bool(v, "records24hUnavailable") => None,
        None => return Err(Error::Unavailable),
    };
    let pending_runs = required_nonnegative(v, "pendingRuns")?;
    let running_runs = required_nonnegative(v, "runningRuns")?;
    let backingoff_runs = required_nonnegative(v, "backingoffRuns")?;
    let dead_runs = required_nonnegative(v, "deadRuns")?;
    if !value_bool(v, "workerHeartbeatUnavailable") {
        return Err(Error::Unavailable);
    }
    let mut body =
        String::from("<section id=\"runs-page\" data-runs-page aria-labelledby=\"runs-heading\">");
    body.push_str(&runs_header());
    body.push_str("<p id=\"runs-live-status\" class=\"sr-only\" role=\"status\" aria-live=\"polite\" aria-busy=\"false\"></p>");
    let reload = runs_link_button(
        "Reload Runs status",
        crate::ui::ButtonVariant::Quiet,
        "/app/runs",
    )?
    .replacen("<a ", "<a id=\"runs-reload\" ", 1);
    body.push_str(&format!(
        "<div id=\"runs-recovery\" class=\"runs-card runs-recovery\" hidden><p id=\"runs-recovery-message\">Run control outcome is unknown. Reload Runs status before trying again.</p>{reload}</div>"
    ));
    body.push_str("<div id=\"runs-operator-controls-unavailable\" role=\"note\" class=\"runs-card runs-operator-notice\"><h3>Operator controls unavailable</h3><p>Run, reset, and cancel require a trusted operator principal. Queue state remains available as read-only evidence.</p></div>");
    body.push_str(
        "<form id=\"runs-filters\" class=\"runs-card runs-filters\" method=\"get\" action=\"/app/runs\" role=\"search\" aria-label=\"Filter runs\"><div class=\"runs-filter-grid\">",
    );
    let status = value_text(v, "selectedStatus");
    body.push_str(&runs_status_field(&status));
    for (id, key, label, selected_key) in [
        (
            "runs-connector-filter",
            "connector",
            "Connector",
            "selectedConnector",
        ),
        ("runs-tool-filter", "tool", "Tool", "selectedTool"),
        (
            "runs-account-filter",
            "accountId",
            "Account",
            "selectedAccountId",
        ),
    ] {
        let selected = value_text(v, selected_key);
        body.push_str(&runs_filter_field(id, key, label, &selected));
    }
    let clear_filters = runs_link_button(
        "Clear filters",
        crate::ui::ButtonVariant::Quiet,
        "/app/runs",
    )?;
    body.push_str(&format!(
        "</div><div class=\"runs-filter-actions\">{}{clear_filters}</div></form>",
        runs_submit_button()
    ));
    let mut stats = String::new();
    // Keep the presentation fail-closed even if an older or malformed data
    // producer omits the explicit flag or supplies stale `*Allowed` values.
    // The API emits this same fact; the renderer must not trust payload flags
    // as a substitute for the unresolved trusted-operator authorization.
    let operator_controls_unavailable = true;
    stats.push_str(&runs_stat("Pending", &pending_runs));
    stats.push_str(&runs_stat("Running", &running_runs));
    stats.push_str(&runs_stat("Backing off", &backingoff_runs));
    stats.push_str(&runs_stat("Dead", &dead_runs));
    if let Some(records) = records_24h {
        stats.push_str(&runs_stat("Records / 24h", &records));
    } else {
        stats.push_str(
            "<div class=\"runs-card runs-stat\"><p class=\"runs-stat-label\">Records / 24h</p><p class=\"runs-stat-value runs-stat-unavailable\">Unavailable in the configured storage.</p></div>",
        );
    }
    stats.push_str(&runs_stat(
        "Worker heartbeat",
        "Unavailable in the configured storage.",
    ));
    if !stats.is_empty() {
        body.push_str(&format!(
            "<div class=\"runs-stats\" aria-describedby=\"runs-summary-scope\">{stats}</div><p id=\"runs-summary-scope\" class=\"runs-summary-note\">Status filter narrows rows and health counts; Records / 24h remains a scoped storage total.</p>"
        ));
    }
    if items.is_empty() {
        let filtered = value_bool(v, "hasFilters");
        body.push_str(&if filtered {
            empty(
                "No durable runs match these filters.",
                "Clear the filters to view project runs.",
                "Clear filters",
                "/app/runs",
            )
        } else {
            empty(
                "No durable runs to show.",
                "Queued message synchronization runs will appear here.",
                "Browse connectors",
                "/app/toolkits",
            )
        });
        body.push_str("</section>");
        return Ok(body);
    }
    body.push_str("<div class=\"runs-card runs-table\"><div class=\"runs-table-scroll\" role=\"region\" aria-label=\"Durable sync runs\" tabindex=\"0\"><table><caption class=\"sr-only\">Durable sync runs</caption><thead><tr>");
    for label in [
        "Health",
        "Run ID",
        "Connector",
        "Tool",
        "Account",
        "Attempts",
        "Wake",
        "Lease",
        "Cursor",
        "Last error",
        "Actions",
    ] {
        body.push_str(&format!("<th scope=\"col\">{label}</th>"));
    }
    body.push_str("</tr></thead><tbody aria-live=\"polite\">");
    for item in items {
        let id = id(item, &["id"])?;
        let (health_label, tone) = run_health(item)?;
        let health = item
            .get("health")
            .and_then(Value::as_str)
            .ok_or(Error::Unavailable)?;
        let attempts = required_nonnegative(item, "attemptsSpent")?;
        let max_attempts = required_nonnegative(item, "maxAttempts")?;
        let remaining = required_nonnegative(item, "attemptsRemaining")?;
        let wake = optional_text(item, "wakeAt", "Wake", "—");
        let lease_until = item.get("leaseUntil").and_then(Value::as_str);
        let lease = match lease_until {
            None => unavailable_telemetry("Lease"),
            Some("") => "—".to_owned(),
            Some(lease) => {
                let remaining = match item
                    .get("leaseRemainingSeconds")
                    .and_then(nonnegative_number)
                {
                    Some(0) => String::new(),
                    Some(seconds) => format!(" ({seconds}s remaining)"),
                    None => format!(" ({})", unavailable_telemetry("Lease remaining")),
                };
                format!("{}{remaining}", escape(lease))
            }
        };
        let cursor = optional_text(item, "currentCursor", "Cursor", "—");
        let error = match item.get("lastError").and_then(Value::as_str) {
            None => unavailable_telemetry("Last error"),
            Some("") => "<span class=\"runs-muted\">None recorded</span>".to_owned(),
            Some(error) => escape(error),
        };
        body.push_str(&format!(
            "<tr data-run-id=\"{}\" data-run-health=\"{}\"><td>{}</td><td><code class=\"runs-code\">{}</code></td><td>{}</td><td><code class=\"runs-code\">{}</code></td><td>{}</td><td><code class=\"runs-code\">{} / {}</code><span class=\"runs-secondary\">{} remaining</span></td><td><code class=\"runs-code\">{}</code></td><td><code class=\"runs-code\">{}</code></td><td><code class=\"runs-code\">{}</code></td><td>{}</td><td class=\"runs-actions\">{}{}{}{}</td></tr>",
            escape(&id),
            escape(health),
            crate::ui::state(tone, health_label),
            escape(&id),
            escape(&value_text(item, "connector")),
            escape(&value_text(item, "tool")),
            escape(&value_text(item, "accountId")),
            escape(&attempts),
            escape(&max_attempts),
            escape(&remaining),
            wake,
            lease,
            cursor,
            error,
            run_control("run-now", &id, item, operator_controls_unavailable)?,
            run_control("reset", &id, item, operator_controls_unavailable)?,
            run_control("cancel", &id, item, operator_controls_unavailable)?,
            if operator_controls_unavailable {
                "<span class=\"runs-muted\">Operator controls unavailable</span>".to_owned()
            } else if !value_bool(item, "runNowAllowed")
                && !value_bool(item, "resetAllowed")
                && !value_bool(item, "cancelAllowed")
            {
                "<span class=\"runs-muted\">No actions</span>".to_owned()
            } else {
                String::new()
            },
        ));
    }
    body.push_str("</tbody></table></div></div></section>");
    Ok(body)
}
pub(crate) fn render(op: Op, raw: &Value, resource: Option<&str>) -> Result<String, Error> {
    let v = raw.get("data").unwrap_or(raw);
    let body=match op{
  Op::Overview=>{
   let mut body=header("Getting Started","Connect a toolkit, run your first tool call, and wire up triggers.");body.push_str("<div class=\"grid grid-cols-1 gap-4 sm:grid-cols-3\">");
   for (label,key) in [("Toolkits available","toolkitCount"),("Connected accounts","connectionCount"),("Tool calls this month","toolCalls")]{body.push_str(&stat(label,v.get(key).ok_or(Error::Unavailable)?))}body.push_str("</div>");
   body.push_str(&card("<h3 class=\"text-sm font-semibold text-dusk-blue-100\">Setup checklist</h3><ul class=\"mt-4 space-y-3\"><li><a href=\"/app/toolkits\">Browse the toolkit catalog</a></li><li><a href=\"/app/toolkits\">Connect an account</a></li><li><a href=\"/app/toolkits\">Run a tool call</a></li><li><a href=\"/app/triggers\">Add a trigger</a></li></ul>"));body
  },
  Op::Catalog=>{
   let items=rows(v,&["connectors","items","cards"])?;
   let search=string(v,&["search"]);
   let category=string(v,&["category"]);
   let mut body=catalog_header("Toolkits","Connect your apps and explore their tools.");
   body.push_str(&format!("<form id=\"toolkit-catalog-search\" method=\"get\" action=\"/app/toolkits\" role=\"search\" aria-label=\"Search connector catalog\" class=\"mb-5 flex flex-wrap items-end gap-2\">{}{}{} </form>",
       crate::ui::Field{value:search,placeholder:"Search connectors, categories, and tools…",..crate::ui::Field::new("toolkit-search","search","Search connectors",crate::ui::Control::Input(crate::ui::InputType::Search))}.render(),
       if category.is_empty(){String::new()}else{format!("<input type=\"hidden\" name=\"category\" value=\"{}\">",escape(category))},
       crate::ui::Button{size:crate::ui::ButtonSize::Sm,variant:crate::ui::ButtonVariant::Secondary,target:crate::ui::ButtonTarget::Button{kind:crate::ui::ButtonType::Submit,form:None,action:None},..crate::ui::Button::new("Search")}.render()));
   body.push_str("<nav id=\"toolkit-catalog-filters\" class=\"mb-4 flex flex-wrap gap-2\" aria-label=\"Filter connectors by category\">");
   body.push_str(&catalog_filter_link("All", &catalog_query_url("", search), category.is_empty())?);
   if let Some(categories)=v.get("categories").and_then(Value::as_array){for value in categories.iter().filter_map(Value::as_str){body.push_str(&catalog_filter_link(value, &catalog_query_url(value, search), value.eq_ignore_ascii_case(category))?);}}
   body.push_str("</nav>");
   let result_label=if items.len()==1{"1 connector shown.".to_owned()}else{format!("{} connectors shown.",items.len())};
   let clear_search_url=catalog_query_url(category, "");
   body.push_str(&format!("<div id=\"toolkit-catalog-results\" aria-live=\"polite\" aria-atomic=\"true\" aria-labelledby=\"toolkit-catalog-results-heading\"><h3 id=\"toolkit-catalog-results-heading\" class=\"sr-only\">Connector results</h3><p id=\"toolkit-catalog-status\" role=\"status\" aria-live=\"polite\">{result_label}</p><div class=\"grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3\">"));
   for item in items{let key=id(item,&["key"])?;let name=string(item,&["name"]);let count=item.get("operations").and_then(Value::as_array).map(|operations|operations.iter().filter(|operation|operation.get("kind").and_then(Value::as_str)==Some("action")).count()).or_else(||item.get("actionCount").and_then(Value::as_u64).map(|v|v as usize)).unwrap_or(0);body.push_str(&format!("<a href=\"/app/toolkits/{key}\" aria-label=\"Open {} toolkit\" class=\"toolkit-catalog-card flex min-w-0 flex-col gap-3 p-5 transition\"><div class=\"flex min-w-0 items-center gap-3\"><span class=\"text-sm font-semibold\">{}</span></div><p class=\"text-xs\">{count} tools</p></a>",escape(name),escape(name)));}
   body.push_str("</div>");
   if items.is_empty(){body.push_str(&if !search.trim().is_empty(){empty("No connectors match this search.","Try a different connector, category, or tool title.","Clear search",&clear_search_url)}else if v.get("hasFilters").and_then(Value::as_bool)==Some(true){empty("No connectors match this category.","Choose another category or view the full catalog.","View all connectors","/app/toolkits")}else{empty("No connectors are available in this catalog.","Use the request form below to name the connector you need.","Request this connector","/app/toolkits#toolkit-request-form")});}
   body.push_str("</div>");
   body.push_str("<div id=\"toolkit-request-result\" role=\"status\" aria-label=\"Connector request result\" aria-live=\"polite\" aria-atomic=\"true\" aria-busy=\"false\" class=\"catalog-request-result\"></div>");body.push_str(&format!("<template id=\"toolkit-request-recovery\">{}</template>",request_recovery()));body.push_str(&catalog_card(&format!("<h3>Request a connector</h3><p>Tell us which connector you need.</p>{}",form_with_variant("/app/toolkits/request",&format!("{}{}{}",input("name","Connector name","","text"),input("email","Your email","","email"),input("notes","Notes (optional)","","text")),"Request this connector",if items.is_empty(){crate::ui::ButtonVariant::Secondary}else{crate::ui::ButtonVariant::Primary}).replacen("<form ","<form id=\"toolkit-request-form\" ",1))));body
  },
  Op::Toolkit=>crate::toolkit::render(v,resource.ok_or(Error::Invalid)?)?,
  Op::TestForm=>crate::toolkit::test_fields(v,resource.unwrap_or(""))?,
  Op::Options=>{
    let field=string(v,&["fieldName"]);if field.is_empty() || field.len()>256 || !field.bytes().all(|b|b.is_ascii_alphanumeric() || matches!(b,b'.'|b'_'|b'-')){return Err(Error::Invalid)}
    let list_id=format!("tk-opts-{field}");
    let search_id=crate::forms::presentation_id("search",field);
    let status_id=format!("{list_id}-status");
    let mut body=format!("<div id=\"{}\" class=\"tk-opts\" role=\"listbox\" aria-label=\"Options for {}\" aria-live=\"polite\" aria-atomic=\"true\" aria-busy=\"false\" data-input-id=\"{}\" data-value-id=\"{}\" data-status-id=\"{}\">",escape(&list_id),escape(field),escape(&search_id),escape(field),escape(&status_id));
    let click=escape("document.getElementById(el.dataset.field).value=el.dataset.value; if(el.dataset.detail){@get('/app/toolkits/' + encodeURIComponent(el.dataset.key) + '/runinput-fields?connectionId=' + encodeURIComponent(document.getElementById('tk-connection').value) + '&actorId=' + encodeURIComponent(el.dataset.value) + '&source=' + encodeURIComponent(el.dataset.detail))}");
    for (index, item) in rows(v, &["options", "items"])?.iter().enumerate() {
        let value = string(item, &["value", "id"]);
        let label = string(item, &["label", "name"]);
        let option = crate::ui::Button {
            size: crate::ui::ButtonSize::Md,
            variant: crate::ui::ButtonVariant::Quiet,
            target: crate::ui::ButtonTarget::Button {
                kind: crate::ui::ButtonType::Button,
                form: None,
                action: None,
            },
            ..crate::ui::Button::new(label)
        }
        .render()
        .replacen(
            "<button ",
            &format!(
                "<button id=\"{}-{}\" role=\"option\" aria-selected=\"false\" tabindex=\"-1\" data-label=\"{}\" data-field=\"{}\" data-value=\"{}\" data-key=\"{}\" data-detail=\"{}\" data-on:click=\"{click}\" ",
                escape(&list_id),
                index,
                escape(label),
                escape(field),
                escape(value),
                escape(string(v, &["key"])),
                escape(string(v, &["detailSource"])),
            ),
            1,
        )
        .replacen(
            "class=\"ui-button ui-button-quiet ui-button-md\"",
            "class=\"ui-button ui-button-quiet ui-button-md tk-option\"",
            1,
        );
        body.push_str(&option);
    }
    body.push_str("</div>");
    body
  },
  Op::RunInputFields=>{let schema=v.get("inputSchema").or_else(||v.get("schema")).unwrap_or(v);format!("<div id=\"tk-runinput\" aria-live=\"polite\"><input type=\"hidden\" name=\"runInputSchema\" value=\"{}\">{}</div>",escape(&schema.to_string()),crate::forms::render_guided_fields(schema,&Value::Null,"f.runInput",resource)?)},
  Op::AuthConfigs=>{
   let items=rows(v,&["connections","rows","items"])?;
   header("Auth Configs","Connections authorize accounts for use with connectors.")+&if items.is_empty(){empty("No connections to show.","Browse connectors to configure a connection.","Browse connectors","/app/toolkits")}else{table(items,&[("Connector","connector"),("Auth Type","authType"),("Status","status"),("Last Test","lastTest")],Some(("/app/auth-configs","id",&["test","disconnect"])))?}
  },
  Op::Runs=>runs(v)?,
  Op::Logs=>crate::logs::render(v, &crate::logs::Filters::default(), v.get("hasFilters").and_then(Value::as_bool)==Some(true))?,
  Op::Triggers=>crate::remaining_pages::events(v)?,
  Op::Trace=>crate::trace::standalone(v, resource.ok_or(Error::Invalid)?)?,
  Op::Qa=>return Err(Error::Forbidden),
  Op::Usage=>crate::remaining_pages::usage(v)?,
  Op::Branding=>crate::branding::render(v),
  Op::Test=>crate::toolkit::result(Some(v)),
  Op::Setup=>json(v),
  Op::RequestToolkit=>"<div id=\"toolkit-request-result\" role=\"status\" aria-label=\"Connector request result\" aria-live=\"polite\" aria-atomic=\"true\" aria-busy=\"false\" data-request-state=\"success\" class=\"catalog-request-result\">Connector request received.</div>".into(),
  _=>return Err(Error::Invalid)
 };
    Ok(body)
}
fn table(
    items: &[Value],
    columns: &[(&str, &str)],
    actions: Option<(&str, &str, &[&str])>,
) -> Result<String, Error> {
    let mut body=String::from("<div class=\"rounded-xl border border-space-indigo-800 bg-space-indigo-950\"><div class=\"overflow-x-auto\"><table class=\"w-full\"><thead><tr class=\"border-b border-space-indigo-800\">");
    for (label, _) in columns {
        body.push_str(&format!("<th class=\"px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-dusk-blue-500\">{label}</th>"));
    }
    if actions.is_some() {
        body.push_str("<th>Actions</th>")
    }
    body.push_str("</tr></thead><tbody class=\"divide-y divide-space-indigo-800\">");
    for item in items {
        body.push_str("<tr>");
        for (_, key) in columns {
            body.push_str(&format!(
                "<td class=\"px-4 py-3 text-sm text-dusk-blue-300\">{}</td>",
                escape(
                    &item
                        .get(*key)
                        .filter(|v| !v.is_null())
                        .map(|v| v
                            .as_str()
                            .map(str::to_owned)
                            .unwrap_or_else(|| v.to_string()))
                        .unwrap_or_default()
                )
            ));
        }
        if let Some((prefix, key, actions)) = actions {
            let id = id(item, &[key])?;
            body.push_str("<td>");
            if actions.is_empty() {
                body.push_str(&format!("<a href=\"{prefix}/{id}\">Inspect</a>"))
            }
            for action in actions {
                let route = format!("{prefix}/{id}/{action}");
                body.push_str(&match *action {
                    "test" => form_with_variant(
                        &route,
                        "",
                        "Check connection",
                        crate::ui::ButtonVariant::Secondary,
                    ),
                    "disconnect" => confirmation(
                        &route,
                        "Disconnect",
                        "Disconnect this connection?",
                        &format!(
                            "Disconnect connection {id}? Tool runs require an active connection."
                        ),
                    )?,
                    "replay" => event_replay(&id)?,
                    _ => form(&route, "", action),
                });
            }
            body.push_str("</td>");
        }
        body.push_str("</tr>");
    }
    body.push_str("</tbody></table></div></div>");
    Ok(body)
}
pub(crate) fn static_page(path: &str) -> String {
    if path == "/app/support" {
        return crate::remaining_pages::heading("Help","Contact the team for help with connectors, the API, or your account.")+&crate::remaining_pages::panel("<p class=\"text-sm font-medium text-ink-100\">Email support</p><a href=\"mailto:info@manavritti.com\" class=\"remaining-contact-link\">info@manavritti.com</a>");
    }
    let mut content = crate::remaining_pages::heading(
        "Documentation",
        "Guides and API reference for building on appcall.",
    );
    for (title, body, href) in [
        (
            "Quickstart",
            "Connect your first toolkit and test an action from its detail page.",
            "/app/toolkits",
        ),
        (
            "Toolkits & connectors",
            "Browse the connector catalog, configure auth, and test actions live.",
            "/app/toolkits",
        ),
        (
            "Triggers & webhooks",
            "Receive and replay provider webhook events.",
            "/app/triggers",
        ),
        (
            "Logs",
            "Inspect action calls and trace individual requests.",
            "/app/logs",
        ),
    ] {
        content.push_str(&format!("<a href=\"{href}\" class=\"flex items-center justify-between rounded-panel border border-line bg-panel p-4 transition hover:border-iris-400\"><span><span class=\"block text-sm font-medium text-ink-100\">{title}</span><span class=\"mt-0.5 block text-sm text-ink-300\">{body}</span></span><span class=\"text-ink-300\">→</span></a>"));
    }
    content
}
#[cfg(test)]
mod rendering_contract_tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn runs_list_exposes_truthful_health_and_fenced_controls() {
        let html = render(
            Op::Runs,
            &json!({
                "runs": [{
                    "id": "run_1",
                    "connector": "slack",
                    "tool": "messages.list",
                    "accountId": "brand-a",
                    "health": "running",
                    "attemptsSpent": 2,
                    "attemptsRemaining": 8,
                    "maxAttempts": 10,
                    "wakeAt": "2026-09-08T10:00:00Z",
                    "leaseUntil": "2026-09-08T10:01:00Z",
                    "currentCursor": "cursor-1",
                    "lastError": "",
                    "runNowAllowed": false,
                    "resetAllowed": false,
                    "cancelAllowed": true
                }],
                "pendingRuns": 0,
                "runningRuns": 1,
                "backingoffRuns": 0,
                "records24h": 4,
                "deadRuns": 1,
                "workerHeartbeatUnavailable": true
            }),
            None,
        )
        .unwrap();
        for expected in [
            "id=\"runs-page\"",
            "Runs",
            "Monitor durable message sync work",
            "name=\"status\"",
            "name=\"connector\"",
            "name=\"tool\"",
            "name=\"accountId\"",
            "<caption class=\"sr-only\">Durable sync runs</caption>",
            "<th scope=\"col\"",
            "ui-state-running",
            "messages.list",
            "2 / 10",
            "8 remaining",
            "cursor-1",
            "Records / 24h",
            "Operator controls unavailable",
        ] {
            assert!(html.contains(expected), "missing {expected}: {html}");
        }
        assert!(!html.contains("/app/runs/run_1/cancel"));
        assert!(!html.contains("data-confirm-open="));
        assert!(!html.contains("workerHeartbeat"));
        assert!(!html.contains("attemptTimeline"));
    }

    #[test]
    fn ordinary_runs_payload_hides_mutations_but_preserves_queue_eligibility() {
        let html = render(
            Op::Runs,
            &json!({
                "operatorControlsUnavailable": true,
                "runs": [{
                    "id": "run_1",
                    "connector": "slack",
                    "tool": "messages.list",
                    "accountId": "brand-a",
                    "health": "running",
                    "attemptsSpent": 2,
                    "attemptsRemaining": 8,
                    "maxAttempts": 10,
                    "wakeAt": "2026-09-08T10:00:00Z",
                    "leaseUntil": "2026-09-08T10:01:00Z",
                    "leaseRemainingSeconds": 42,
                    "currentCursor": "cursor-1",
                    "lastError": "provider timeout",
                    "runNowEligible": false,
                    "resetEligible": false,
                    "cancelEligible": true,
                    "runNowAllowed": false,
                    "resetAllowed": false,
                    "cancelAllowed": false
                }],
                "pendingRuns": 0,
                "runningRuns": 1,
                "backingoffRuns": 0,
                "records24hUnavailable": true,
                "deadRuns": 1,
                "workerHeartbeatUnavailable": true
            }),
            None,
        )
        .unwrap();
        assert!(html.contains("Operator controls unavailable"));
        assert!(html.contains("Reload Runs status"));
        assert!(html.contains("href=\"/app/runs\""));
        for action in ["/run-now", "/reset", "/cancel"] {
            assert!(!html.contains(action), "ordinary runs rendered {action}");
        }
    }

    #[test]
    fn runs_renderer_defaults_to_unavailable_controls_without_trusted_capability() {
        let html = render(
            Op::Runs,
            &json!({
                "runs": [{
                    "id": "run_1",
                    "connector": "slack",
                    "tool": "messages.list",
                    "accountId": "brand-a",
                    "health": "pending",
                    "attemptsSpent": 0,
                    "attemptsRemaining": 10,
                    "maxAttempts": 10,
                    "wakeAt": "",
                    "leaseUntil": "",
                    "leaseRemainingSeconds": 0,
                    "currentCursor": "",
                    "lastError": "",
                    "runNowAllowed": true,
                    "resetAllowed": true,
                    "cancelAllowed": true,
                    "runNowEligible": true,
                    "resetEligible": true,
                    "cancelEligible": true
                }],
                "pendingRuns": 1,
                "runningRuns": 0,
                "backingoffRuns": 0,
                "records24hUnavailable": true,
                "deadRuns": 0,
                "workerHeartbeatUnavailable": true
            }),
            None,
        )
        .unwrap();
        assert!(html.contains("Operator controls unavailable"));
        for action in ["/run-now", "/reset", "/cancel"] {
            assert!(
                !html.contains(action),
                "renderer trusted an unverified operator capability: {action}"
            );
        }
    }

    #[test]
    fn empty_ordinary_runs_page_still_names_unavailable_controls() {
        let html = render(
            Op::Runs,
            &json!({
                "runs": [],
                "pendingRuns": 0,
                "runningRuns": 0,
                "backingoffRuns": 0,
                "records24hUnavailable": true,
                "deadRuns": 0,
                "workerHeartbeatUnavailable": true
            }),
            None,
        )
        .unwrap();
        assert!(html.contains("id=\"runs-operator-controls-unavailable\""));
        assert!(html.contains("Operator controls unavailable"));
        for action in ["/run-now", "/reset", "/cancel"] {
            assert!(!html.contains(action));
        }
    }

    #[test]
    fn runs_list_uses_signal_primitives_without_legacy_controls() {
        let html = render(
            Op::Runs,
            &json!({
                "runs": [{
                    "id": "run_1",
                    "connector": "slack",
                    "tool": "messages.list",
                    "accountId": "brand-a",
                    "health": "running",
                    "attemptsSpent": 2,
                    "attemptsRemaining": 8,
                    "maxAttempts": 10,
                    "wakeAt": "2026-09-08T10:00:00Z",
                    "leaseUntil": "2026-09-08T10:01:00Z",
                    "leaseRemainingSeconds": 42,
                    "currentCursor": "cursor-1",
                    "lastError": "provider timeout",
                    "runNowAllowed": false,
                    "resetAllowed": false,
                    "cancelAllowed": false
                }],
                "pendingRuns": 0,
                "runningRuns": 1,
                "backingoffRuns": 0,
                "records24h": 4,
                "deadRuns": 1,
                "workerHeartbeatUnavailable": true
            }),
            None,
        )
        .unwrap();

        for expected in [
            "runs-card",
            "runs-stat",
            "ui-field",
            "ui-control",
            "ui-button",
            "ui-state-running",
            "2 / 10",
            "8 remaining",
            "2026-09-08T10:00:00Z",
            "2026-09-08T10:01:00Z (42s remaining)",
            "cursor-1",
            "provider timeout",
            "Records / 24h",
            "Dead",
        ] {
            assert!(html.contains(expected), "missing {expected}: {html}");
        }
        for legacy in [
            "rounded-",
            "border-space-indigo",
            "bg-space-indigo",
            "text-dusk-blue",
            "text-neon-ice",
            "focus:ring",
            "focus:border",
        ] {
            assert!(
                !html.contains(legacy),
                "Runs rendered legacy token {legacy}"
            );
        }
        assert!(!html.contains("<input name=\""));
        assert!(!html.contains("<select id=\"runs-status-filter\""));
        assert!(!html.contains("workerHeartbeat"));
        assert!(!html.contains("attemptTimeline"));
        assert!(!html.contains("/app/runs/run_1/cancel"));
    }

    #[test]
    fn runs_health_strip_shows_scoped_states_and_explicit_heartbeat_unavailable() {
        let html = render(
            Op::Runs,
            &json!({
                "runs": [],
                "pendingRuns": 2,
                "runningRuns": 1,
                "backingoffRuns": 1,
                "deadRuns": 2,
                "records24h": 12,
                "workerHeartbeatUnavailable": true,
                "selectedStatus": "running",
                "selectedConnector": "slack",
                "selectedTool": "messages.list",
                "selectedAccountId": "brand-a"
            }),
            None,
        )
        .unwrap();
        for expected in [
            "Pending",
            "Running",
            "Backing off",
            "Dead",
            "Records / 24h",
            "Worker heartbeat",
            "2",
            "1",
            "12",
            "Unavailable",
            "Status filter narrows rows and health counts",
        ] {
            assert!(html.contains(expected), "missing {expected}: {html}");
        }
        assert!(html.contains("No durable runs to show."));
        assert!(!html.contains("worker heartbeat active"));
    }

    #[test]
    fn runs_health_strip_requires_explicit_heartbeat_availability_fact() {
        let value = json!({
            "runs": [],
            "pendingRuns": 0,
            "runningRuns": 0,
            "backingoffRuns": 0,
            "deadRuns": 0,
            "records24hUnavailable": true
        });
        assert_eq!(
            render(Op::Runs, &value, None),
            Err(Error::Unavailable),
            "missing heartbeat provenance must not become a healthy-looking strip"
        );
    }

    #[test]
    fn runs_renderer_rejects_missing_required_health_counters_and_metrics() {
        let payload = || {
            json!({
                "runs": [{
                    "id": "run_1",
                    "connector": "slack",
                    "tool": "messages.list",
                    "accountId": "brand-a",
                    "health": "running",
                    "attemptsSpent": 2,
                    "attemptsRemaining": 8,
                    "maxAttempts": 10,
                    "wakeAt": "2026-09-08T10:00:00Z",
                    "leaseUntil": "2026-09-08T10:01:00Z",
                    "leaseRemainingSeconds": 42,
                    "currentCursor": "cursor-1",
                    "lastError": "provider timeout"
                }],
                "pendingRuns": 0,
                "runningRuns": 1,
                "backingoffRuns": 0,
                "records24h": 4,
                "deadRuns": 1,
                "workerHeartbeatUnavailable": true
            })
        };

        for field in [
            "health",
            "attemptsSpent",
            "attemptsRemaining",
            "maxAttempts",
        ] {
            let mut value = payload();
            value["runs"][0]
                .as_object_mut()
                .expect("run object")
                .remove(field);
            assert_eq!(
                render(Op::Runs, &value, None),
                Err(Error::Unavailable),
                "missing required run field {field} rendered as healthy state"
            );
        }

        let mut unknown_health = payload();
        unknown_health["runs"][0]["health"] = json!("mystery");
        assert_eq!(
            render(Op::Runs, &unknown_health, None),
            Err(Error::Unavailable),
            "unknown health must not become Pending"
        );

        for field in ["records24h", "deadRuns"] {
            let mut value = payload();
            value
                .as_object_mut()
                .expect("runs payload object")
                .remove(field);
            assert_eq!(
                render(Op::Runs, &value, None),
                Err(Error::Unavailable),
                "missing required metric {field} rendered without evidence"
            );
        }

        for (path, invalid) in [
            (("runs", 0, "attemptsSpent"), json!("2")),
            (("runs", 0, "attemptsRemaining"), json!({"value": 8})),
            (("runs", 0, "maxAttempts"), json!(null)),
            (("top", 0, "records24h"), json!({"value": 4})),
            (("top", 0, "deadRuns"), json!("1")),
        ] {
            let mut value = payload();
            if path.0 == "top" {
                value[path.2] = invalid;
            } else {
                value[path.0][path.1][path.2] = invalid;
            }
            assert_eq!(
                render(Op::Runs, &value, None),
                Err(Error::Unavailable),
                "invalid required field {} must fail closed",
                path.2
            );
        }
    }

    #[test]
    fn runs_renderer_marks_missing_telemetry_as_unavailable() {
        let payload = || {
            json!({
                "runs": [{
                    "id": "run_1",
                    "connector": "slack",
                    "tool": "messages.list",
                    "accountId": "brand-a",
                    "health": "running",
                    "attemptsSpent": 2,
                    "attemptsRemaining": 8,
                    "maxAttempts": 10,
                    "wakeAt": "2026-09-08T10:00:00Z",
                    "leaseUntil": "2026-09-08T10:01:00Z",
                    "leaseRemainingSeconds": 42,
                    "currentCursor": "cursor-1",
                    "lastError": "provider timeout"
                }],
                "pendingRuns": 0,
                "runningRuns": 1,
                "backingoffRuns": 0,
                "records24h": 4,
                "deadRuns": 1,
                "workerHeartbeatUnavailable": true
            })
        };
        for (field, label) in [
            ("wakeAt", "Wake"),
            ("leaseUntil", "Lease"),
            ("leaseRemainingSeconds", "Lease remaining"),
            ("currentCursor", "Cursor"),
            ("lastError", "Last error"),
        ] {
            let mut value = payload();
            value["runs"][0]
                .as_object_mut()
                .expect("run object")
                .remove(field);
            let html = render(Op::Runs, &value, None).expect("optional telemetry is renderable");
            assert!(
                html.contains(&format!("aria-label=\"{label} unavailable\"")),
                "missing {field} lacks explicit unavailable evidence: {html}"
            );
            if field == "lastError" {
                assert!(!html.contains("None recorded"));
            }
        }

        let mut records_unavailable = payload();
        records_unavailable
            .as_object_mut()
            .expect("runs payload object")
            .remove("records24h");
        records_unavailable["records24hUnavailable"] = json!(true);
        let html = render(Op::Runs, &records_unavailable, None)
            .expect("explicitly unavailable records metric is renderable");
        assert!(html.contains("Records / 24h"));
        assert!(html.contains("Unavailable in the configured storage"));
    }

    #[test]
    fn runs_table_scroll_is_a_named_keyboard_focusable_region() {
        let html = render(
            Op::Runs,
            &json!({
                "runs": [{
                    "id": "run_1",
                    "connector": "slack",
                    "tool": "messages.list",
                    "accountId": "brand-a",
                    "health": "running",
                    "attemptsSpent": 2,
                    "attemptsRemaining": 8,
                    "maxAttempts": 10,
                    "wakeAt": "2026-09-08T10:00:00Z",
                    "leaseUntil": "2026-09-08T10:01:00Z",
                    "leaseRemainingSeconds": 42,
                    "currentCursor": "cursor-1",
                    "lastError": "provider timeout"
                }],
                "records24h": 4,
                "deadRuns": 1,
                "workerHeartbeatUnavailable": true,
                "pendingRuns": 0,
                "runningRuns": 1,
                "backingoffRuns": 0
            }),
            None,
        )
        .unwrap();
        assert!(html.contains(
            "class=\"runs-table-scroll\" role=\"region\" aria-label=\"Durable sync runs\" tabindex=\"0\""
        ));
    }

    #[test]
    fn copy_empty_catalog_has_one_primary_action() {
        for filtered in [false, true] {
            let html = render(
                Op::Catalog,
                &json!({"connectors":[],"hasFilters":filtered}),
                None,
            )
            .unwrap();
            assert_eq!(html.matches("ui-button-primary").count(), 1);
            assert!(html.contains(if filtered {
                "View all connectors"
            } else {
                "Request this connector"
            }));
            let request_form = html
                .split("<form id=\"toolkit-request-form\"")
                .nth(1)
                .unwrap()
                .split("</form>")
                .next()
                .unwrap();
            assert!(request_form.contains("ui-button-secondary"));
            assert!(request_form.contains("Request this connector"));
            assert!(request_form.contains("method=\"post\" action=\"/app/toolkits/request\""));
            assert!(request_form.contains(
                "data-on:submit=\"@post('/app/toolkits/request', {contentType: 'form', retry:'never', retryMaxCount:1, openWhenHidden:true, requestCancellation:new AbortController()})\""
            ));
        }
        let populated = render(
            Op::Catalog,
            &json!({"connectors":[{"key":"mail","name":"Mail"}]}),
            None,
        )
        .unwrap();
        let populated_search = populated
            .split("<form id=\"toolkit-catalog-search\"")
            .nth(1)
            .unwrap()
            .split("</form>")
            .next()
            .unwrap();
        let populated_request = populated
            .split("<form id=\"toolkit-request-form\"")
            .nth(1)
            .unwrap()
            .split("</form>")
            .next()
            .unwrap();
        assert_eq!(populated_search.matches("ui-button-secondary").count(), 1);
        assert_eq!(populated_search.matches("ui-button-primary").count(), 0);
        assert_eq!(populated_request.matches("ui-button-primary").count(), 1);
        assert!(!populated_request.contains("ui-button-secondary"));
    }

    #[test]
    fn copy_empty_lists_are_distinct_from_unavailable() {
        for (op, keys, heading, body, action) in [
            (
                Op::Catalog,
                vec!["connectors", "items", "cards"],
                "No connectors are available in this catalog.",
                "Use the request form below to name the connector you need.",
                "Request this connector",
            ),
            (
                Op::AuthConfigs,
                vec!["connections", "rows", "items"],
                "No connections to show.",
                "Browse connectors to configure a connection.",
                "Browse connectors",
            ),
            (
                Op::Logs,
                vec!["logs", "items", "rows"],
                "No tool runs to show.",
                "Browse connectors to choose a tool to run.",
                "Browse connectors",
            ),
            (
                Op::Triggers,
                vec!["events", "items", "rows"],
                "No webhook events to show.",
                "Browse connectors to inspect their declared events.",
                "Browse connectors",
            ),
        ] {
            let mut values = vec![json!([])];
            for key in &keys {
                values.push(json!({(*key):[]}));
            }
            for value in values {
                for dto in [value.clone(), json!({"data":value})] {
                    let html = render(op, &dto, None).unwrap();
                    assert!(html.contains(heading), "{op:?}: {html}");
                    assert!(html.contains(body));
                    if action.is_empty() {
                        assert!(!html.contains("<a "));
                        assert!(!html.contains("<button"));
                        assert!(html.contains("aria-labelledby="));
                    } else {
                        assert!(html.contains("ui-empty-state"));
                        assert!(html.contains(action));
                    }
                }
            }
            for bad in [json!({}), json!({(keys[0]):null}), json!({(keys[0]):{}})] {
                assert_eq!(render(op, &bad, None), Err(Error::Unavailable));
                assert_eq!(
                    render(op, &json!({"data":bad}), None),
                    Err(Error::Unavailable)
                );
            }
        }
    }

    #[test]
    fn copy_request_form_and_support_are_truthful() {
        let html = render(Op::Catalog, &json!({"connectors":[]}), None).unwrap();
        for text in [
            "Request a connector",
            "Tell us which connector you need.",
            "Request this connector",
            "href=\"/app/toolkits#toolkit-request-form\"",
            "method=\"post\" action=\"/app/toolkits/request\"",
            "data-on:submit=\"@post('/app/toolkits/request', {contentType: 'form', retry:'never', retryMaxCount:1, openWhenHidden:true, requestCancellation:new AbortController()})\"",
            "name=\"name\"",
            "name=\"email\"",
            "name=\"notes\"",
        ] {
            assert!(html.contains(text), "{text}");
        }
        assert_eq!(html.matches("id=\"toolkit-request-form\"").count(), 1);
        assert!(!html.contains("prioritise"));
        let support = static_page("/app/support");
        assert!(support
            .contains("Contact the team for help with connectors, the API, or your account."));
        assert!(support.contains("mailto:info@manavritti.com"));
        assert!(!support.contains("business day"));
        assert!(render(Op::Logs, &json!([]), None)
            .unwrap()
            .contains("Inspect recorded tool executions."));
        assert!(render(Op::AuthConfigs, &json!([]), None)
            .unwrap()
            .contains("Connections authorize accounts for use with connectors."));
    }

    #[test]
    fn catalog_counts_only_explicit_actions_and_preserves_count_fallback() {
        let html = render(
            Op::Catalog,
            &json!({"connectors":[
                {"key":"mixed","name":"Mixed","actionCount":99,"operations":[
                    {"name":"run","kind":"action"},{"name":"pull","kind":"sync"},
                    {"name":"received","kind":"webhook"},{"name":"unknown"}
                ]},
                {"key":"empty","name":"Empty","actionCount":99,"operations":[]},
                {"key":"fallback","name":"Fallback","actionCount":7}
            ]}),
            None,
        )
        .unwrap();
        for (key, count) in [("mixed", 1), ("empty", 0), ("fallback", 7)] {
            let card = html
                .split(&format!("href=\"/app/toolkits/{key}\""))
                .nth(1)
                .unwrap()
                .split("</a>")
                .next()
                .unwrap();
            assert!(
                card.contains(&format!(">{count} tools</p>")),
                "{key}: {card}"
            );
        }
        assert!(!html.contains("99 tools"));
    }

    #[test]
    fn catalog_escapes_provider_names_and_encodes_category_links() {
        let html = render(
            Op::Catalog,
            &json!({"data": {"categories": ["a&b <script>"], "connectors": [
                {"key":"one","name":"<script>alert(1)</script>","operations":[{"name":"list","kind":"action"},{"name":"create","kind":"action"}]},
                {"key":"two","name":"Second","actionCount":3},
                {"key":"three","name":"Third"}
            ]}}),
            None,
        )
        .unwrap();
        assert!(html.contains("&lt;script&gt;alert(1)&lt;/script&gt;"));
        assert!(!html.contains("<script>alert"));
        assert!(html.contains("category=a%26b+%3Cscript%3E"));
        for expected in [
            "2 tools",
            "3 tools",
            "0 tools",
            "/app/toolkits/one",
            "name=\"email\"",
        ] {
            assert!(html.contains(expected), "{expected}");
        }
    }

    #[test]
    fn catalog_search_has_a_named_get_control_and_live_results() {
        let html = render(
            Op::Catalog,
            &json!({
                "search": "Mail",
                "category": "Messaging",
                "categories": ["Messaging", "Files"],
                "connectors": [{
                    "key": "mail",
                    "name": "Mail",
                    "categories": ["Messaging"],
                    "operations": [{"name": "send", "title": "Send message", "kind": "action"}]
                }]
            }),
            None,
        )
        .unwrap();
        assert!(html.contains("<form id=\"toolkit-catalog-search\""));
        assert!(html.contains("method=\"get\" action=\"/app/toolkits\" role=\"search\""));
        assert!(html.contains("id=\"toolkit-search\""));
        assert!(html.contains("name=\"search\""));
        assert!(html.contains("value=\"Mail\""));
        assert!(html.contains("name=\"category\""));
        assert!(html.contains("id=\"toolkit-catalog-results\""));
        assert!(html.contains("aria-live=\"polite\" aria-atomic=\"true\""));
        assert!(html.contains("aria-label=\"Open Mail toolkit\""));
        assert!(html.contains("class=\"catalog-header\""));
        assert!(html.contains("class=\"catalog-request-panel\""));
        assert!(!html.contains("dusk-blue"));
        assert!(!html.contains("space-indigo"));
        assert!(!html.contains("rounded-full"));
        assert!(!html.contains("rounded-xl"));
        assert!(html.contains("aria-current=\"page\""));
    }

    #[test]
    fn toolkit_preserves_setup_routes_secrets_selection_and_action_only_picker() {
        let html = render(Op::Toolkit, &json!({
            "name":"<Provider>","description":"Use <token>",
            "setup":{"mode":"api_key","help":"Keep <secret>","fields":[{"key":"api_key","label":"API <key>","secret":true,"required":true}],
                "routes":[{"id":"oauth","label":"Use OAuth","fields":[{"name":"region","label":"Region"}]}]},
            "connections":[{"id":"conn_1","connector":"provider","status":"active","displayName":"<Admin>"},{"id":"conn_2","connector":"provider","status":"inactive","name":"Other"}],"connectionId":"conn_1",
            "operations":[{"name":"send","title":"Send <message>","kind":"action"},{"name":"received","kind":"trigger"}],
            "action":"send","inputSchema":{"type":"object","properties":{"message":{"type":"string"}}}
        }), Some("provider")).unwrap();
        for expected in [
            "&lt;Provider&gt;",
            "Keep &lt;secret&gt;",
            "name=\"api_key\" type=\"password\" value=\"\" autocomplete=\"off\" required",
            "name=\"route\" type=\"hidden\" value=\"oauth\"",
            "name=\"region\"",
            "value=\"conn_1\" selected",
            ">conn_1</option>",
            "value=\"send\" selected",
            "/app/toolkits/provider/setup",
            "/app/toolkits/provider/test",
            "name=\"input_raw\"",
            "name=\"callerToken\"",
        ] {
            assert!(html.contains(expected), "{expected}");
        }
        assert!(!html.contains("<option value=\"received\""));
        let run_form = html
            .split("<form id=\"tk-run-form\"")
            .nth(1)
            .expect("toolkit run form")
            .split("</form>")
            .next()
            .unwrap();
        assert!(run_form.contains("method=\"post\" action=\"/app/toolkits/provider/test\""));
        assert!(run_form.contains("data-on:submit="));
        assert!(run_form.contains("@post(&#39;/app/toolkits/provider/test&#39;"));
        let fallback = render(
            Op::Toolkit,
            &json!({"operations":[],"setup":{"mode":"api_key","fields":[]},"connectionId":"manual"}),
            Some("provider"),
        )
        .unwrap();
        assert!(fallback.contains("id=\"tk-connection\" name=\"connectionId\""));
        assert!(!fallback.contains("value=\"manual\""));
        assert!(fallback.contains("/app/toolkits/provider/setup"));
        let no_auth = render(
            Op::Toolkit,
            &json!({"operations":[],"setup":{"mode":"none"}}),
            Some("provider"),
        )
        .unwrap();
        assert!(!no_auth.contains("/app/toolkits/provider/setup"));
    }

    #[test]
    fn option_fragments_escape_every_provider_attribute_and_reject_invalid_field_ids() {
        let html = render(Op::Options, &json!({"fieldName":"f.actor","key":"<key>","detailSource":"\"<detail>","options":[{"id":"\" onclick=\"bad","name":"<img src=x>"}]}), None).unwrap();
        for expected in [
            "id=\"tk-opts-f.actor\"",
            "&lt;key&gt;",
            "&lt;detail&gt;",
            "&lt;img src=x&gt;",
        ] {
            assert!(html.contains(expected), "{expected}");
        }
        assert!(!html.contains("<img src=x>"));
        assert!(!html.contains("data-value=\"\" onclick="));
        for field in ["", "f.x\"", "f/x"] {
            assert_eq!(
                render(Op::Options, &json!({"fieldName":field,"options":[]}), None),
                Err(Error::Invalid)
            );
        }
    }

    #[test]
    fn tables_link_only_valid_ids_and_render_non_string_cells_without_html() {
        for (op, data, expected) in [
            (
                Op::AuthConfigs,
                json!({"connections":[{"id":"conn_1","connector":"<evil>","lastTest":null}]}),
                "/app/auth-configs/conn_1/disconnect",
            ),
            (
                Op::Logs,
                json!({"logs":[{"requestId":"req_1","connector":"<evil>","errorCode":42}]}),
                "/app/logs/req_1\"",
            ),
            (
                Op::Triggers,
                json!({"events":[{"id":"evt_1","connector":"<evil>"}]}),
                "/app/triggers/evt_1/replay",
            ),
        ] {
            let html = render(op, &data, None).unwrap();
            assert!(html.contains(expected), "{expected}");
            assert!(html.contains("&lt;evil&gt;"));
            assert!(!html.contains("<evil>"));
        }
        for bad in ["", "../escape", "a\"onclick", "a/b"] {
            assert_eq!(
                render(Op::Logs, &json!({"logs":[{"requestId":bad}]}), None),
                Err(Error::Unavailable)
            );
        }
        assert_eq!(
            render(Op::Catalog, &json!({}), None),
            Err(Error::Unavailable)
        );
        assert_eq!(
            render(Op::Toolkit, &json!({"operations":[]}), None),
            Err(Error::Invalid)
        );
    }

    #[test]
    fn overview_usage_trace_and_fragments_require_data_and_escape_results() {
        for (op, data, expected) in [
            (
                Op::Overview,
                json!({"toolkitCount":2,"connectionCount":3,"toolCalls":4}),
                ">4</p>",
            ),
            (
                Op::Usage,
                json!({"month":"<September>","toolCalls":2,"syncedRecords":3,"webhookEvents":4}),
                "&lt;September&gt;",
            ),
            (Op::Trace, json!({"input":"<script>"}), "&lt;script&gt;"),
            (
                Op::Test,
                json!({"result":"<script>"}),
                "id=\"tk-test-result\"",
            ),
            (Op::Setup, json!({"result":"<script>"}), "&lt;script&gt;"),
            (Op::RequestToolkit, json!({}), "Connector request received."),
            (
                Op::RunInputFields,
                json!({"schema":{"type":"object","properties":{"x":{"type":"string"}}}}),
                "name=\"runInputSchema\"",
            ),
        ] {
            let html = render(op, &data, Some("req_1")).unwrap();
            assert!(html.contains(expected), "{expected}");
            assert!(!html.contains("<script>"));
        }
        for op in [Op::Overview, Op::Usage] {
            assert_eq!(render(op, &json!({}), None), Err(Error::Unavailable));
        }
        assert_eq!(render(Op::Stream, &json!({}), None), Err(Error::Invalid));
        let docs = static_page("/app/docs");
        for target in ["/app/toolkits", "/app/triggers", "/app/logs"] {
            assert!(docs.contains(&format!("href=\"{target}\"")));
        }
        assert!(static_page("/app/support").contains("mailto:info@manavritti.com"));
    }
}

#[cfg(test)]
mod memory_qa_tests {
    #[test]
    fn form_uses_shared_submit_without_losing_native_or_datastar_action() {
        let html = super::form(
            "/app/toolkits/request",
            "<input name=\"name\">",
            "Request toolkit",
        );
        assert!(html.contains("ui-button-primary"));
        assert!(html.contains("type=\"submit\""));
        assert!(html.contains("method=\"post\" action=\"/app/toolkits/request\""));
        assert!(html
            .contains("data-on:submit=\"@post('/app/toolkits/request', {contentType: 'form', retry:'never', retryMaxCount:1, openWhenHidden:true, requestCancellation:new AbortController()})\""));
    }
    #[test]
    fn direct_qa_page_is_forbidden_for_every_payload() {
        for payload in [
            serde_json::json!({"unavailable": true}),
            serde_json::json!({"certifications": []}),
            serde_json::json!({
                "certifications": [{"connector": "mail", "status": "passed"}]
            }),
        ] {
            assert_eq!(
                super::render(super::Op::Qa, &payload, None),
                Err(super::Error::Forbidden)
            );
        }
    }
}
