use crate::{http::escape, DashboardOperation as Op, Error};
use serde_json::Value;
pub(crate) fn title(op: Op) -> &'static str {
    match op {
        Op::Overview => "Getting Started",
        Op::Catalog | Op::Toolkit | Op::Setup => "Toolkits",
        Op::AuthConfigs => "Auth Configs",
        Op::Triggers => "Triggers",
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
fn card(body: &str) -> String {
    format!("<div class=\"rounded-xl border border-space-indigo-800 bg-space-indigo-950 p-5\">{body}</div>")
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
    format!("<div><label class=\"mb-1.5 block text-xs font-medium text-dusk-blue-300\">{}<input name=\"{}\" type=\"{}\" value=\"{}\" class=\"w-full rounded-lg border border-space-indigo-700 bg-prussian-blue-950 px-3 py-2 text-sm text-dusk-blue-100 focus:border-neon-ice-500 focus:outline-none focus:ring-1 focus:ring-neon-ice-500\"></label></div>",escape(label),escape(name),escape(kind),escape(value))
}
fn form(action: &str, content: &str, label: &str) -> String {
    let datastar = if action.ends_with("/test") || action == "/app/toolkits/request" {
        format!(
            " data-on:submit=\"@post('{}', {{contentType: 'form'}})\"",
            escape(action)
        )
    } else {
        String::new()
    };
    let button = crate::ui::Button {
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
fn json(v: &Value) -> String {
    format!("<pre class=\"overflow-x-auto rounded-xl border border-space-indigo-800 bg-space-indigo-950 p-5 text-xs\">{}</pre>",escape(&serde_json::to_string_pretty(v).unwrap_or_default()))
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
   let mut body=header("Toolkits","Connect your apps and explore their tools.");
   body.push_str("<div class=\"mb-4 flex flex-wrap gap-2\"><a href=\"/app/toolkits\">All</a>");
   if let Some(categories)=v.get("categories").and_then(Value::as_array){for category in categories.iter().filter_map(Value::as_str){let mut url=reqwest::Url::parse("https://local.invalid/app/toolkits").map_err(|_|Error::Invalid)?;url.query_pairs_mut().append_pair("category",category);body.push_str(&format!("<a class=\"rounded-full border border-space-indigo-700 px-3 py-1 text-xs\" href=\"/app/toolkits?{}\">{}</a>",escape(url.query().unwrap_or("")),escape(category)));}}
   body.push_str("</div><div class=\"grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3\">");
   for item in rows(v,&["connectors","items","cards"])?{let key=id(item,&["key"])?;let name=string(item,&["name"]);let count=item.get("operations").and_then(Value::as_array).map(Vec::len).or_else(||item.get("actionCount").and_then(Value::as_u64).map(|v|v as usize)).unwrap_or(0);body.push_str(&format!("<a href=\"/app/toolkits/{key}\" class=\"group flex flex-col gap-3 rounded-xl border border-space-indigo-800 bg-space-indigo-950 p-5 transition hover:border-space-indigo-700\"><div class=\"flex items-center gap-3\"><span class=\"truncate text-sm font-semibold text-dusk-blue-50 group-hover:text-neon-ice-400\">{}</span></div><p class=\"text-xs text-dusk-blue-500\">{count} tools</p></a>",escape(name)));}
   body.push_str("</div><div id=\"toolkit-request-result\"></div>");body.push_str(&card(&format!("<h3 class=\"text-base font-semibold text-dusk-blue-50\">Request a toolkit</h3><p class=\"mt-1 text-sm text-dusk-blue-400\">Tell us which integration you need and we'll prioritise it.</p>{}",form("/app/toolkits/request",&format!("{}{}{}",input("name","Toolkit name","","text"),input("email","Your email","","email"),input("notes","Notes (optional)","","text")),"Request toolkit"))));body
  },
  Op::Toolkit=>{
   let key=resource.ok_or(Error::Invalid)?;let mut body=header(string(v,&["name"]),string(v,&["description"]));
   let operations=rows(v,&["operations"])?;body.push_str(&table(operations,&[("Title","title"),("Name","name"),("Kind","kind"),("Description","description")],None)?);
   if let Some(setup)=v.get("setup") {
    body.push_str(&format!("<p class=\"mt-4 text-sm text-dusk-blue-400\">{}</p>",escape(string(setup,&["help"]))));
    if string(setup,&["mode"])!="none" {
     let base=setup_controls(setup.get("fields").and_then(Value::as_array).map(Vec::as_slice).unwrap_or(&[]))?;
     if let Some(routes)=setup.get("routes").and_then(Value::as_array).filter(|r|!r.is_empty()) {
      for route in routes {let route_id=id(route,&["id"])?;let controls=format!("{base}{}{}",input("route","",&route_id,"hidden"),setup_controls(route.get("fields").and_then(Value::as_array).map(Vec::as_slice).unwrap_or(&[]))?);body.push_str(&form(&format!("/app/toolkits/{key}/setup"),&controls,string(route,&["label"])));}
     }else{body.push_str(&form(&format!("/app/toolkits/{key}/setup"),&base,"Connect"));}
    }
   }
   body.push_str(&test_form(key,v)?);body
  },
  Op::TestForm=>test_fields(v,resource.unwrap_or(""))?,
  Op::Options=>{
    let field=string(v,&["fieldName"]);if field.is_empty() || field.len()>256 || !field.bytes().all(|b|b.is_ascii_alphanumeric() || matches!(b,b'.'|b'_'|b'-')){return Err(Error::Invalid)}
    let mut body=format!("<div id=\"tk-opts-{}\" class=\"tk-opts\">",escape(field));
    let click=escape("document.getElementById(el.dataset.field).value=el.dataset.value; if(el.dataset.detail){@get('/app/toolkits/' + encodeURIComponent(el.dataset.key) + '/runinput-fields?connectionId=' + encodeURIComponent(document.getElementById('tk-connection').value) + '&actorId=' + encodeURIComponent(el.dataset.value) + '&source=' + encodeURIComponent(el.dataset.detail))}");
    for item in rows(v,&["options","items"])?{body.push_str(&format!("<button type=\"button\" class=\"block w-full px-3 py-2 text-left text-sm hover:bg-space-indigo-900\" data-field=\"{}\" data-value=\"{}\" data-key=\"{}\" data-detail=\"{}\" data-on:click=\"{click}\">{}</button>",escape(field),escape(string(item,&["value","id"])),escape(string(v,&["key"])),escape(string(v,&["detailSource"])),escape(string(item,&["label","name"]))));}body.push_str("</div>");body
  },
  Op::RunInputFields=>{let schema=v.get("inputSchema").or_else(||v.get("schema")).unwrap_or(v);format!("<div id=\"tk-runinput\"><input type=\"hidden\" name=\"runInputSchema\" value=\"{}\">{}</div>",escape(&schema.to_string()),crate::forms::render_guided_fields(schema,&Value::Null,"f.runInput",resource)?)},
  Op::AuthConfigs=>header("Auth Configs","An auth config is a blueprint that defines how authentication works for a toolkit across all your users.")+&table(rows(v,&["connections","rows","items"] )?,&[("Connector","connector"),("Auth Type","authType"),("Status","status"),("Last Test","lastTest")],Some(("/app/auth-configs","id",&["test","disconnect"])))?,
  Op::Logs=>header("Logs","Tool executions show up here as they happen.")+"<div class=\"flex items-center gap-2\"><a href=\"/app/logs\">All</a><a href=\"/app/logs?status=succeeded\">Succeeded</a><a href=\"/app/logs?status=failed\">Failed</a></div>"+&table(rows(v,&["logs","items","rows"] )?,&[("Time","createdAt"),("Connector","connector"),("Action","action"),("Status","status"),("Error Code","errorCode"),("Request ID","requestId")],Some(("/app/logs","requestId",&[])))?,
  Op::Triggers=>header("Triggers","Receive and replay provider webhook events.")+&table(rows(v,&["events","items","rows"] )?,&[("Connector","connector"),("Operation","operation"),("Connection","connectionId"),("Received","createdAt")],Some(("/app/triggers","id",&["replay"])))?.replace("<tbody class=", "<tbody id=\"trigger-rows\" class=").replace("<table class=", "<table data-on:load=\"@get('/app/triggers/stream')\" class="),
  Op::Trace=>header("Request Trace",resource.unwrap_or(""))+&json(v)+&form(&format!("/app/logs/{}/replay",resource.ok_or(Error::Invalid)?),"","Replay"),
  Op::Qa if v.get("unavailable").and_then(Value::as_bool)==Some(true)=>header("QA","Connector certification and manifest fingerprint drift.")+&card("<p>QA status unavailable</p><p class=\"text-sm text-dusk-blue-400\">Configure PostgreSQL and run connector QA to view certification results.</p>"),
  Op::Qa=>header("QA","Connector certification and manifest fingerprint drift.")+&table(rows(v,&["certifications","rows","items"] )?,&[("Connector","connector"),("Status","status"),("Total","total"),("Passed","passed"),("Failed","failed"),("Not certified","notCertified"),("Manifest drift","drifted"),("Manifest fingerprint","manifestFingerprint"),("Last run","certifiedAt")],None)?,
  Op::Usage=>{let mut body=header("Usage",string(v,&["month"]));body.push_str("<div class=\"grid grid-cols-1 gap-4 sm:grid-cols-3\">");for (label,key) in [("Tool calls","toolCalls"),("Synced records","syncedRecords"),("Webhook events","webhookEvents")]{body.push_str(&stat(label,v.get(key).ok_or(Error::Unavailable)?));}body.push_str("</div>");body},
  Op::Branding=>crate::branding::render(v),
  Op::Test=>format!("<div id=\"tk-test-result\">{}</div>",json(v)),
  Op::Setup=>json(v),
  Op::RequestToolkit=>"<div id=\"toolkit-request-result\" class=\"rounded-lg border border-space-indigo-800 p-4\">Toolkit request received.</div>".into(),
  _=>return Err(Error::Invalid)
 };
    Ok(body)
}
fn setup_controls(fields: &[Value]) -> Result<String, Error> {
    let mut controls = String::new();
    for field in fields {
        let mut control = input(
            &id(field, &["key", "name"])?,
            string(field, &["label", "name"]),
            "",
            if field.get("secret").and_then(Value::as_bool) == Some(true) {
                "password"
            } else {
                "text"
            },
        );
        if field.get("required").and_then(Value::as_bool) == Some(true) {
            control = control.replace("<input ", "<input required ");
        }
        controls.push_str(&control);
    }
    Ok(controls)
}
fn test_fields(v: &Value, key: &str) -> Result<String, Error> {
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
    Ok(format!("<div id=\"tk-test-fields\" class=\"flex flex-col gap-4\">{guided}{}<details class=\"rounded-lg border border-space-indigo-800 bg-prussian-blue-950/40\"><summary class=\"cursor-pointer px-3 py-2 text-xs font-medium text-dusk-blue-400\">Advanced (raw JSON)</summary><p class=\"px-3 text-xs text-dusk-blue-500\">Optional. JSON here overrides the fields above.</p><textarea name=\"input_raw\" rows=\"6\" spellcheck=\"false\" class=\"w-full rounded-lg border border-space-indigo-700 bg-prussian-blue-950 px-3 py-2 font-mono text-xs\"></textarea></details><div id=\"tk-runinput\"></div></div>",input("callerToken","Caller credential (if required)","","password")))
}
fn test_form(key: &str, v: &Value) -> Result<String, Error> {
    let class="w-full rounded-lg border border-space-indigo-700 bg-prussian-blue-950 px-3 py-2 text-sm text-dusk-blue-100";
    let mut controls = if let Some(connections) = v.get("connections").and_then(Value::as_array) {
        let mut options = String::new();
        for connection in connections {
            let connection_id = id(connection, &["id"])?;
            let label = string(connection, &["displayName", "name", "id"]);
            options.push_str(&format!(
                "<option value=\"{connection_id}\" {}>{}</option>",
                if connection_id == string(v, &["connectionId"]) {
                    "selected"
                } else {
                    ""
                },
                escape(label)
            ));
        }
        format!("<label class=\"block text-sm\">Connected account<select id=\"tk-connection\" name=\"connectionId\" class=\"{class}\">{options}</select></label>")
    } else {
        input(
            "connectionId",
            "Connected account",
            string(v, &["connectionId"]),
            "text",
        )
        .replace(
            "name=\"connectionId\"",
            "id=\"tk-connection\" name=\"connectionId\"",
        )
    };
    let mut options = String::new();
    for operation in rows(v, &["operations"]).unwrap_or(&Vec::new()) {
        if string(operation, &["kind"]) != "action" {
            continue;
        }
        let name = id(operation, &["name", "key"])?;
        options.push_str(&format!(
            "<option value=\"{name}\" {}>{}</option>",
            if name == string(v, &["action"]) {
                "selected"
            } else {
                ""
            },
            escape(string(operation, &["title", "name"]))
        ));
    }
    controls.push_str(&format!("<label class=\"block text-sm\">Action<select id=\"tk-action\" name=\"action\" class=\"{class}\" data-on:change=\"@get('/app/toolkits/{key}/test-form?action=' + encodeURIComponent(evt.target.value))\">{options}</select></label>"));
    controls.push_str(&test_fields(v, key)?);
    Ok(format!(
        "{}<div id=\"tk-test-result\"></div>",
        form(&format!("/app/toolkits/{key}/test"), &controls, "Run tool")
    ))
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
                body.push_str(&form(&format!("{prefix}/{id}/{action}"), "", action));
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
        return header("Support","Get help with appcall — integrations, the API, and your account.")+&card("<p class=\"text-sm font-medium text-dusk-blue-100\">Email support</p><p class=\"mt-1 text-sm text-dusk-blue-500\">Reach the team directly — we typically reply within one business day.</p><a href=\"mailto:info@manavritti.com\" class=\"mt-3 inline-flex items-center gap-2 rounded-lg bg-neon-ice-500 px-3.5 py-2 text-sm font-semibold text-prussian-blue-950\">info@manavritti.com</a>");
    }
    let mut content = header(
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
        content.push_str(&format!("<a href=\"{href}\" class=\"flex items-center justify-between rounded-xl border border-space-indigo-800 bg-space-indigo-950 p-4 transition hover:border-space-indigo-700\"><span><span class=\"block text-sm font-medium text-dusk-blue-100\">{title}</span><span class=\"mt-0.5 block text-sm text-dusk-blue-500\">{body}</span></span><span class=\"text-dusk-blue-500\">→</span></a>"));
    }
    content
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
            .contains("data-on:submit=\"@post('/app/toolkits/request', {contentType: 'form'})\""));
    }
    #[test]
    fn missing_qa_storage_is_unavailable_not_empty_certification() {
        let html = super::render(
            super::Op::Qa,
            &serde_json::json!({"unavailable":true,"certifications":[]}),
            None,
        )
        .unwrap();
        assert!(html.contains("QA status unavailable"));
        assert!(!html.contains("<table"));
        let persisted = super::render(
            super::Op::Qa,
            &serde_json::json!({"certifications":[]}),
            None,
        )
        .unwrap();
        assert!(!persisted.contains("QA status unavailable"));
    }
}
