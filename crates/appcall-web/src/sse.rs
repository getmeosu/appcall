use crate::{http::escape, Error, Response};
use serde_json::Value;
fn patch(html: &str, selector: Option<&str>, prepend: bool) -> String {
    let mut frame = String::from("event: datastar-patch-elements\n");
    if let Some(selector) = selector {
        frame.push_str(&format!("data: selector {selector}\n"));
    }
    if prepend {
        frame.push_str("data: mode prepend\n");
    }
    for line in html.lines() {
        frame.push_str("data: elements ");
        frame.push_str(line);
        frame.push('\n');
    }
    frame.push('\n');
    frame
}
pub(crate) fn response(html: &str) -> Response {
    let mut response = Response::new(200, patch(html, None, false));
    response.headers.retain(|(k, _)| k != "Content-Type");
    response
        .headers
        .push(("Content-Type".into(), "text/event-stream".into()));
    response
}
/// Source-compatible Datastar prepend frame for the host's persistent event
/// subscription. Recheck tenant/session authorization during long subscriptions.
pub fn render_trigger_patch(event: &Value) -> Result<String, Error> {
    let id = event
        .get("id")
        .and_then(Value::as_str)
        .ok_or(Error::Invalid)?;
    if id.is_empty()
        || id.len() > 256
        || !id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_'))
    {
        return Err(Error::Invalid);
    }
    let text = |key| escape(event.get(key).and_then(Value::as_str).unwrap_or(""));
    let row=format!("<tr class=\"hover:bg-space-indigo-900/40 transition-colors\"><td class=\"px-4 py-3 text-sm text-dusk-blue-100\">{}</td><td class=\"px-4 py-3 text-sm text-dusk-blue-100\">{}</td><td class=\"px-4 py-3 text-sm\"><span class=\"font-mono text-xs text-dusk-blue-300\">{}</span></td><td class=\"px-4 py-3 text-sm text-dusk-blue-300\">{}</td><td class=\"px-4 py-3 text-sm\"><form method=\"post\" action=\"/app/triggers/{id}/replay\"><button type=\"submit\" class=\"inline-flex items-center gap-1.5 rounded-md border border-space-indigo-700 bg-space-indigo-900 px-2.5 py-1 text-xs font-medium text-dusk-blue-200\">Replay</button></form></td></tr>",text("connector"),text("operation"),text("connectionId"),text("createdAt"));
    Ok(patch(&row, Some("#trigger-rows"), true))
}
