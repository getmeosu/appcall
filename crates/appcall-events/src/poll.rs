//! Durable events emitted by the sync poller (OXIDE-POLL-1).
use crate::{input::valid_id, Error, Result};
use postgres::Transaction;
use serde_json::Value;

/// Upper bounds mirrored from the manifest `poll` contract.
const MAX_TRIGGERS: usize = 16;
const MAX_TRIGGER_LEN: usize = 128;
const MAX_PAYLOAD_BYTES: usize = 1024 * 1024;

/// A poll observation to store as a durable event.
///
/// Produced only by the sync poller after a lease-fenced diff, never from
/// caller input. `dedup_key` is stored as the scoped provider event key, so
/// replaying the same observation can never create a second event.
#[derive(Debug, Clone, PartialEq)]
pub struct PolledEvent {
    pub project_id: String,
    pub connection_id: String,
    pub connector: String,
    pub operation: String,
    pub dedup_key: String,
    pub payload: Value,
    /// Trigger names this event satisfies, stored in the non-null
    /// `webhook_events.triggers text[]` column (OXIDE-WH-1's definition).
    /// Empty when the event carries no trigger tagging.
    pub triggers: Vec<String>,
}

impl PolledEvent {
    fn validate(&self) -> Result<()> {
        let ids_valid = [
            &self.project_id,
            &self.connection_id,
            &self.connector,
            &self.operation,
            &self.dedup_key,
        ]
        .into_iter()
        .all(|id| valid_id(id));
        let triggers_valid = self.triggers.len() <= MAX_TRIGGERS
            && self.triggers.iter().all(|t| {
                !t.is_empty() && t.len() <= MAX_TRIGGER_LEN && !t.chars().any(char::is_control)
            });
        if !ids_valid || self.operation.len() > 256 || !triggers_valid || !self.payload.is_object()
        {
            return Err(Error::Invalid);
        }
        if serde_json::to_vec(&self.payload)
            .map_err(|_| Error::Invalid)?
            .len()
            > MAX_PAYLOAD_BYTES
        {
            return Err(Error::TooLarge);
        }
        Ok(())
    }
}

/// Append a polled event and its outbox row inside the caller's transaction.
///
/// Returns `Ok(Some(id))` when a new event was stored and `Ok(None)` when an
/// event with the same scoped dedup key already exists. The caller commits;
/// a rollback undoes the event, the outbox row and the caller's own state.
/// Requires the current schema (connection revision/generation, provider
/// event keys and the `triggers` column).
pub fn append_polled(tx: &mut Transaction<'_>, event: &PolledEvent) -> Result<Option<String>> {
    event.validate()?;
    // Same per-project serialization as webhook acceptance so stream
    // positions become visible in commit order.
    tx.query_one(
        "SELECT pg_advisory_xact_lock(hashtextextended($1::text,741))",
        &[&event.project_id],
    )
    .map_err(|_| Error::Storage)?;
    let connection = tx
        .query_opt(
            "SELECT coalesce(external_account_id,''),connection_revision,connection_generation FROM connections WHERE project_id=$1 AND id=$2 AND connector=$3 AND status='active' FOR SHARE",
            &[&event.project_id, &event.connection_id, &event.connector],
        )
        .map_err(|_| Error::Storage)?
        .ok_or(Error::NotFound)?;
    let brand: String = connection.get(0);
    let revision: i64 = connection.get(1);
    let generation: i64 = connection.get(2);
    let id = crate::store::fresh_public_id(tx, &event.project_id)?;
    let created = tx
        .execute(
            "INSERT INTO webhook_events(id,project_id,connection_id,connector,operation,payload,external_account_id,connection_revision,connection_generation,provider_event_key,triggers) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT DO NOTHING",
            &[
                &id,
                &event.project_id,
                &event.connection_id,
                &event.connector,
                &event.operation,
                &event.payload,
                &brand,
                &revision,
                &generation,
                &event.dedup_key,
                &event.triggers,
            ],
        )
        .map_err(|_| Error::Storage)?
        == 1;
    if !created {
        return Ok(None);
    }
    tx.execute(
        "INSERT INTO webhook_outbox(project_id,event_id) VALUES($1,$2)",
        &[&event.project_id, &id],
    )
    .map_err(|_| Error::Storage)?;
    Ok(Some(id))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn event() -> PolledEvent {
        PolledEvent {
            project_id: "p".into(),
            connection_id: "c".into(),
            connector: "github".into(),
            operation: "issues.list".into(),
            dedup_key: "poll:abc".into(),
            payload: json!({"change":"new"}),
            triggers: vec!["issue.opened".into()],
        }
    }

    #[test]
    fn validation_bounds_ids_triggers_and_payload() {
        assert!(event().validate().is_ok());
        assert!(PolledEvent {
            triggers: vec![],
            ..event()
        }
        .validate()
        .is_ok());
        for bad in [
            PolledEvent {
                dedup_key: String::new(),
                ..event()
            },
            PolledEvent {
                payload: json!([]),
                ..event()
            },
            PolledEvent {
                triggers: vec![String::new()],
                ..event()
            },
            PolledEvent {
                triggers: vec!["a\nb".into()],
                ..event()
            },
            PolledEvent {
                triggers: vec!["t".repeat(129)],
                ..event()
            },
            PolledEvent {
                triggers: (0..17).map(|i| format!("t{i}")).collect(),
                ..event()
            },
        ] {
            assert_eq!(bad.validate(), Err(Error::Invalid), "{bad:?}");
        }
        let large = PolledEvent {
            payload: json!({"x":"x".repeat(MAX_PAYLOAD_BYTES)}),
            ..event()
        };
        assert_eq!(large.validate(), Err(Error::TooLarge));
    }
}
