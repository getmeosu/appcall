use crate::{Error, Event, ParsedWebhook, Result};
use serde_json::{json, Value};
pub fn sync_input(connector: &str, operation: &str, payload: &Value) -> Result<Value> {
    if connector != "slack" || operation != "messages.list" {
        return Ok(json!({}));
    }
    let mut channel = None;
    for value in [
        payload.get("channel"),
        payload.get("channelId"),
        payload.get("event").and_then(|e| e.get("channel")),
    ]
    .into_iter()
    .flatten()
    {
        if value.is_null() {
            continue;
        }
        let candidate = value.as_str().ok_or(Error::ConfigurationRequired)?;
        if candidate.is_empty() {
            continue;
        }
        let bytes = candidate.as_bytes();
        if !(2..=255).contains(&bytes.len())
            || !b"CDG".contains(&bytes[0])
            || !bytes[1..]
                .iter()
                .all(|c| c.is_ascii_uppercase() || c.is_ascii_digit())
            || channel.is_some_and(|prior| prior != candidate)
        {
            return Err(Error::ConfigurationRequired);
        }
        channel = Some(candidate);
    }
    Ok(json!({"channelId":channel.ok_or(Error::ConfigurationRequired)?}))
}
pub fn validate_parsed(connector: &str, p: &ParsedWebhook) -> Result<()> {
    if (!p.idempotency_key.is_empty() && !valid_id(&p.idempotency_key))
        || p.operation.len() > 256
        || !p.sanitized.is_object()
    {
        return Err(Error::Invalid);
    }
    if serde_json::to_vec(&p.sanitized)
        .map_err(|_| Error::Invalid)?
        .len()
        > 1024 * 1024
    {
        return Err(Error::TooLarge);
    }
    sync_input(connector, &p.operation, &p.sanitized)?;
    Ok(())
}
pub(super) fn event_job(e: &Event, dedup_key: String) -> Result<crate::SyncJob> {
    Ok(crate::SyncJob {
        event_id: e.id.clone(),
        project_id: e.project_id.clone(),
        connection_id: e.connection_id.clone(),
        operation: e.operation.clone(),
        dedup_key,
        input: sync_input(&e.connector, &e.operation, &e.payload)?,
    })
}
pub(super) fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 1024 && !id.chars().any(char::is_control)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn channel_configuration_is_narrow_and_consistent() {
        for payload in [
            json!({"channel":"C123","token":"secret"}),
            json!({"event":{"channel":"C123"}}),
            json!({"channel":"C123","channelId":"C123"}),
        ] {
            assert_eq!(
                sync_input("slack", "messages.list", &payload).unwrap(),
                json!({"channelId":"C123"})
            );
        }
        for payload in [
            json!({}),
            json!({"channel":"C123","channelId":"G456"}),
            json!({"channel":true}),
            json!({"channel":"C_123"}),
            json!({"channel":"https://example.org"}),
        ] {
            assert_eq!(
                sync_input("slack", "messages.list", &payload),
                Err(Error::ConfigurationRequired)
            );
        }
        assert_eq!(
            sync_input("other", "messages.list", &json!({"token":"secret"})).unwrap(),
            json!({})
        );
    }
    #[test]
    fn parsed_payload_bounds_and_object_requirement() {
        let p = |payload| ParsedWebhook {
            idempotency_key: "id".into(),
            operation: "".into(),
            sanitized: payload,
        };
        assert_eq!(validate_parsed("other", &p(json!([]))), Err(Error::Invalid));
        assert_eq!(
            validate_parsed("other", &p(json!({"x":"x".repeat(1024*1024)}))),
            Err(Error::TooLarge)
        );
        assert!(validate_parsed("other", &p(json!({}))).is_ok());
    }
}
