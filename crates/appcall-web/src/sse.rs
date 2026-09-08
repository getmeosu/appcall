use crate::{Error, Response};
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
pub fn render_event_patch(event: &Value) -> Result<String, Error> {
    let row = crate::remaining_pages::event_row(event)?;
    let mut frames = patch(&row, Some("#trigger-rows"), true);
    frames.push_str("event: datastar-patch-elements\ndata: selector #trigger-empty-state\ndata: mode remove\n\n");
    Ok(frames)
}
