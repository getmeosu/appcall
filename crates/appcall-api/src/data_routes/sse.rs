use super::*;
/// Returns the Go SSE wire envelope from a serialized appcall-events Event.
/// The id is a durable cursor, never a provider-controlled text field.
pub fn sse_frame(event: &Value) -> Result<String> {
    let id = event
        .get("id")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| ApiError::new("EVENT_STREAM_BACKFILL_FAILED"))?;
    let position = event
        .get("streamPosition")
        .and_then(Value::as_i64)
        .filter(|n| *n > 0)
        .ok_or_else(|| ApiError::new("EVENT_STREAM_BACKFILL_FAILED"))?;
    let cursor = URL_SAFE_NO_PAD.encode(format!("v2|{position}|{id}"));
    let mut body = json!({"id":id,"type":"webhook_event","createdAt":event["createdAt"]});
    for (source, target) in [
        ("connectionId", "connectionId"),
        ("externalAccountId", "accountId"),
        ("connector", "connector"),
        ("operation", "operation"),
    ] {
        if event
            .get(source)
            .and_then(Value::as_str)
            .is_some_and(|s| !s.is_empty())
        {
            body[target] = event[source].clone()
        }
    }
    if let Some(payload) = event.get("payload") {
        body["payload"] = payload.clone()
    }
    Ok(format!(
        "id: {cursor}\nevent: webhook_event\ndata: {body}\n\n"
    ))
}
pub fn sse_cursor(url: &url::Url, headers: &[(String, String)]) -> String {
    url.query_pairs()
        .find(|(k, v)| k == "since" && !v.is_empty())
        .map(|(_, v)| v.into_owned())
        .unwrap_or_else(|| crate::header(headers, "Last-Event-ID").into())
}
