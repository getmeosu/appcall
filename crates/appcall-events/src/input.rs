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

pub fn is_sync_operation(connector: &str, operation: &str) -> bool {
    classify_dispatch(connector, operation) == DispatchKind::Sync
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
        || !valid_triggers(&p.triggers)
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
pub const MAX_TRIGGERS: usize = 16;
pub const MAX_TRIGGER_LEN: usize = 128;
/// Trigger names are bounded, non-empty, unique and free of control
/// characters so they are safe to store, filter and echo in streams.
pub fn valid_triggers(triggers: &[String]) -> bool {
    triggers.len() <= MAX_TRIGGERS
        && triggers.iter().enumerate().all(|(index, trigger)| {
            !trigger.is_empty()
                && trigger.len() <= MAX_TRIGGER_LEN
                && !trigger.chars().any(char::is_control)
                && !triggers[..index].contains(trigger)
        })
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
    fn triggers_are_bounded_unique_and_printable() {
        let many: Vec<String> = (0..=MAX_TRIGGERS).map(|i| format!("t{i}")).collect();
        assert!(valid_triggers(&[]));
        assert!(valid_triggers(&["issues.opened".into(), "issues".into()]));
        assert!(valid_triggers(&many[..MAX_TRIGGERS]));
        assert!(!valid_triggers(&many));
        assert!(!valid_triggers(&["".into()]));
        assert!(!valid_triggers(&["a".repeat(MAX_TRIGGER_LEN + 1)]));
        assert!(!valid_triggers(&["issues\nopened".into()]));
        assert!(!valid_triggers(&["issues".into(), "issues".into()]));
    }
    #[test]
    fn serialized_events_without_triggers_still_load() {
        let legacy = json!({
            "id":"wh_1","projectId":"p","connectionId":"c","externalAccountId":"b",
            "connector":"github","operation":"webhook.issues","payload":{},
            "createdAt":"2026-10-12T00:00:00Z","streamPosition":1
        });
        let event: Event = serde_json::from_value(legacy.clone()).unwrap();
        assert!(event.triggers.is_empty());
        // Untriggered events keep their exact pre-existing wire shape.
        assert_eq!(serde_json::to_value(&event).unwrap(), legacy);
        let tagged = Event {
            triggers: vec!["issues.opened".into()],
            ..event
        };
        let wire = serde_json::to_value(&tagged).unwrap();
        assert_eq!(wire["triggers"], json!(["issues.opened"]));
        assert_eq!(serde_json::from_value::<Event>(wire).unwrap(), tagged);
    }
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
            triggers: Vec::new(),
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
            triggers: Vec::new(),
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
