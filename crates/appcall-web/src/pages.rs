use crate::{http::escape, DashboardOperation as Op, Error};
use serde_json::Value;
pub(crate) fn title(op: Op) -> &'static str {
    match op {
        Op::Overview => "Getting Started",
        Op::Catalog | Op::Toolkit | Op::Setup => "Toolkits",
        Op::AuthConfigs => "Auth Configs",
        Op::Triggers => "Events",
        Op::Logs | Op::Trace => "Logs",
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
    format!("<pre class=\"overflow-x-auto rounded-xl border border-space-indigo-800 bg-space-indigo-950 p-5 text-xs\">{}</pre>",escape(&serde_json::to_string_pretty(v).unwrap_or_default()))
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
  Op::RunInputFields=>{let schema=v.get("inputSchema").or_else(||v.get("schema")).unwrap_or(v);format!("<div id=\"tk-runinput\"><input type=\"hidden\" name=\"runInputSchema\" value=\"{}\">{}</div>",escape(&schema.to_string()),crate::forms::render_guided_fields(schema,&Value::Null,"f.runInput",resource)?)},
  Op::AuthConfigs=>{
   let items=rows(v,&["connections","rows","items"])?;
   header("Auth Configs","Connections authorize accounts for use with connectors.")+&if items.is_empty(){empty("No connections to show.","Browse connectors to configure a connection.","Browse connectors","/app/toolkits")}else{table(items,&[("Connector","connector"),("Auth Type","authType"),("Status","status"),("Last Test","lastTest")],Some(("/app/auth-configs","id",&["test","disconnect"])))?}
  },
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
