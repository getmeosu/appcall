use crate::{Error, Event, ParsedWebhook, Result};
use serde_json::{json, Value};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum DispatchKind {
    Sync,
    EventOnly,
}

/// Classify against the sync operations the worker can execute. This mirrors
/// the current `appcall_sync::Service::fetch` contract: messages.list for
/// these four connectors. Webhook operations remain durable events even when
/// they have no sync equivalent.
pub(super) fn classify_dispatch(connector: &str, operation: &str) -> DispatchKind {
    if operation == "messages.list"
        && matches!(
            connector,
            "slack" | "telegram" | "google-workspace" | "microsoft-365"
        )
    {
        DispatchKind::Sync
    } else {
        DispatchKind::EventOnly
    }
}

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
    if classify_dispatch(connector, &p.operation) == DispatchKind::Sync {
        sync_input(connector, &p.operation, &p.sanitized)?;
    }
    Ok(())
}
pub(super) fn event_job(e: &Event, dedup_key: String) -> Result<Option<crate::SyncJob>> {
    if classify_dispatch(&e.connector, &e.operation) == DispatchKind::EventOnly {
        return Ok(None);
    }
    Ok(Some(crate::SyncJob {
        event_id: e.id.clone(),
        project_id: e.project_id.clone(),
        connection_id: e.connection_id.clone(),
        operation: e.operation.clone(),
        dedup_key,
        input: sync_input(&e.connector, &e.operation, &e.payload)?,
    }))
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

    #[test]
    fn classifies_only_worker_supported_syncs() {
        for connector in ["slack", "telegram", "google-workspace", "microsoft-365"] {
            assert_eq!(
                classify_dispatch(connector, "messages.list"),
                DispatchKind::Sync
            );
        }
        for (connector, operation) in [
            ("apollo", "webhook.phone_revealed"),
            ("rb2b", "webhook.visitor_identified"),
            ("slack", "webhook.message_received"),
            ("other", "messages.list"),
        ] {
            assert_eq!(
                classify_dispatch(connector, operation),
                DispatchKind::EventOnly
            );
        }
    }

    #[test]
    fn event_job_is_optional_for_event_only_webhooks() {
        let event = |connector: &str, operation: &str, payload| Event {
            id: "event".into(),
            project_id: "project".into(),
            connection_id: "connection".into(),
            external_account_id: "account".into(),
            connector: connector.into(),
            operation: operation.into(),
            payload,
            created_at: chrono::Utc::now(),
            stream_position: 1,
        };

        assert!(event_job(
            &event(
                "apollo",
                "webhook.phone_revealed",
                json!({"personId":"person","phone":"+15550001111"})
            ),
            "webhook:event".into()
        )
        .unwrap()
        .is_none());
        assert!(event_job(
            &event("slack", "messages.list", json!({"channel":"C123"})),
            "webhook:event".into()
        )
        .unwrap()
        .is_some());
    }
}
