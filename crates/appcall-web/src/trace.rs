//! One authorized trace representation, presented in a page or a drawer.
use crate::{http::escape, ui, DashboardOperation, Error, Request};
use serde_json::Value;

pub(crate) fn drawer_request(
    request: &Request<'_>,
    operation: Option<DashboardOperation>,
) -> Result<bool, Error> {
    if request.method != "GET" || operation != Some(DashboardOperation::Trace) {
        return Ok(false);
    }
    if !request.fields.contains_key("view") {
        return Ok(false);
    }
    match request.field("view")? {
        "drawer" => Ok(true),
        _ => Err(Error::Invalid),
    }
}

pub(crate) fn standalone(value: &Value, request_id: &str) -> Result<String, Error> {
    Ok(ui::back_link(
        "Back to logs",
        ui::LocalPath::new("/app/logs").ok_or(Error::Invalid)?,
    ) + &content(value, request_id)?)
}

pub(crate) fn content(value: &Value, request_id: &str) -> Result<String, Error> {
    let data = value.get("data").unwrap_or(value);
    let pretty = serde_json::to_string_pretty(data).map_err(|_| Error::Unavailable)?;
    let mut html = format!(
        "<section id=\"trace-content\" data-request-id=\"{}\" class=\"trace-content\" aria-labelledby=\"trace-title\"><header><h2 id=\"trace-title\" tabindex=\"-1\">Request Trace</h2><p class=\"trace-request-id\">{}</p></header><h3>Recorded details</h3><pre class=\"trace-json\">{}</pre>",
        escape(request_id), escape(request_id), escape(&pretty)
    );
    if data.get("replayAvailable").and_then(Value::as_bool) == Some(true) {
        let action = format!("/app/logs/{request_id}/replay");
        html.push_str(&ui::ConfirmButton {
            id: &ui::document_id()?,
            trigger: "Run this again",
            heading: "Run this tool again?",
            body: &format!("Run the tool for recorded request {request_id} again using saved input? This creates another tool execution and may repeat changes at the provider."),
            confirm: "Run this again",
            action: ui::LocalPath::new(&action).ok_or(Error::Invalid)?,
            form: None,
        }.render());
    } else {
        html.push_str("<p class=\"trace-replay-note\">Replay is not available for this trace.</p>");
    }
    html.push_str("</section>");
    Ok(html)
}
