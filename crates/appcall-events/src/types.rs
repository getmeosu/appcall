use crate::Result;
use chrono::{DateTime, Utc};
use postgres::Transaction;
use serde::Serialize;
use serde_json::Value;

/// Produced only by a trusted provider parser after signature verification.
/// Raw provider payloads and credentials must never be copied here wholesale.
#[derive(Clone)]
pub struct ParsedWebhook {
    pub idempotency_key: String,
    pub operation: String,
    pub sanitized: Value,
}
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Event {
    pub id: String,
    pub project_id: String,
    pub connection_id: String,
    pub external_account_id: String,
    pub connector: String,
    pub operation: String,
    pub payload: Value,
    pub created_at: DateTime<Utc>,
    pub stream_position: i64,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IngestResult {
    pub event_id: String,
    pub duplicate: bool,
}
#[derive(Debug, Clone, Default)]
pub struct ListRequest {
    pub cursor: String,
    pub limit: usize,
    pub connection_id: String,
    pub connector: String,
    pub operation: String,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EventPage {
    pub events: Vec<Event>,
    pub next_cursor: String,
    pub has_more: bool,
    #[serde(rename = "streamCursor", skip_serializing_if = "String::is_empty")]
    pub snapshot_cursor: String,
}
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct DispatchReport {
    pub completed: usize,
    pub failed: usize,
}
#[derive(Debug, Clone)]
pub struct SyncJob {
    pub event_id: String,
    pub project_id: String,
    pub connection_id: String,
    pub operation: String,
    pub dedup_key: String,
    pub input: Value,
}

/// Schedule durable local work using the supplied transaction. Implementations
/// must not perform provider effects; rollback must undo every mutation.
pub trait DispatchSink {
    fn schedule(&mut self, tx: &mut Transaction<'_>, job: &SyncJob) -> Result<()>;
}

pub trait WebhookParser {
    fn verify_and_parse(
        &self,
        connector: &str,
        headers: &[(String, String)],
        raw: &[u8],
    ) -> Result<ParsedWebhook>;
}

pub struct IngestRequest<'a> {
    pub token: &'a str,
    pub connector: &'a str,
    pub connection_id: &'a str,
    pub headers: &'a [(String, String)],
    pub raw: &'a [u8],
}
