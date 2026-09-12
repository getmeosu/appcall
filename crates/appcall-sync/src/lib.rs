//! Durable message synchronization with PostgreSQL lease fencing.
mod repository;
mod service;
pub use repository::*;
use serde::{Deserialize, Serialize};
use serde_json::Value;
pub use service::*;
use std::time::{Duration, SystemTime};
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Error {
    InvalidInput,
    InvalidPage,
    UnsupportedModel,
    Unavailable,
    LeaseLost,
    StaleGeneration,
    CursorCycle,
    NotFound,
    Conflict,
    Storage,
    Runner { retry_after_seconds: Option<u64> },
}
impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "sync {:?}", self)
    }
}
impl std::error::Error for Error {}
impl From<postgres::Error> for Error {
    fn from(_: postgres::Error) -> Self {
        Self::Storage
    }
}
pub type Result<T> = std::result::Result<T, Error>;
pub const DEFAULT_MAX_ATTEMPTS: u32 = 10;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum OperatorAction {
    RunNow,
    ResetAttempts,
    Cancel,
}
#[derive(Clone, Debug)]
pub struct ScheduleRequest {
    pub id: String,
    pub project_id: String,
    pub connection_id: String,
    pub operation: String,
    pub dedup_key: String,
    pub input: Value,
}
#[derive(Clone, Debug)]
pub struct Job {
    pub id: String,
    pub project_id: String,
    pub connection_id: String,
    pub operation: String,
    pub input: Value,
    pub status: String,
    pub worker_id: String,
    pub attempts: u32,
    pub leased_until: Option<SystemTime>,
    pub connection_generation: i64,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Message {
    pub id: String,
    pub provider: String,
    pub provider_message_id: String,
    pub channel_id: String,
    pub sender_id: String,
    #[serde(default)]
    pub text: String,
    pub model_version: String,
    pub raw: Value,
}
#[derive(Clone, Debug, PartialEq)]
pub struct Page {
    pub records: Vec<Message>,
    pub next_cursor: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct StoredMessageQuery {
    pub project_id: String,
    /// Trusted account scope supplied by the authenticated caller. An empty
    /// value is reserved for an operator-wide scope.
    pub account_id: String,
    pub connection_id: String,
    pub channel_id: Option<String>,
    pub cursor: String,
    pub limit: usize,
}

impl StoredMessageQuery {
    pub fn validate(&self) -> Result<()> {
        fn valid_identifier(value: &str) -> bool {
            !value.is_empty() && value.len() <= 512 && !value.chars().any(char::is_control)
        }
        if !valid_identifier(&self.project_id)
            || self.account_id.len() > 512
            || self.account_id.chars().any(char::is_control)
            || !valid_identifier(&self.connection_id)
            || self
                .channel_id
                .as_deref()
                .is_some_and(|channel| !valid_identifier(channel))
            || !(1..=100).contains(&self.limit)
            || self.cursor.len() > 4096
        {
            return Err(Error::InvalidInput);
        }
        Ok(())
    }
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredMessagePage {
    pub messages: Vec<Message>,
    pub next_cursor: String,
    pub has_more: bool,
}
impl Page {
    pub fn decode(value: Value) -> Result<Self> {
        #[derive(Deserialize)]
        struct Wire {
            items: Vec<Message>,
            #[serde(default)]
            cursor: Option<String>,
        }
        let wire: Wire = serde_json::from_value(value).map_err(|_| Error::InvalidPage)?;
        let page = Self {
            records: wire.items,
            next_cursor: wire.cursor.unwrap_or_default(),
        };
        page.validate()?;
        Ok(page)
    }
    pub fn validate(&self) -> Result<()> {
        if self.records.len() > 10000 || self.next_cursor.len() > 65536 {
            return Err(Error::InvalidPage);
        }
        for m in &self.records {
            // Providers use an explicit empty string when sender information is absent;
            // serde decoding above still rejects missing or non-string sender identities.
            if [
                &m.id,
                &m.provider,
                &m.provider_message_id,
                &m.channel_id,
                &m.model_version,
            ]
            .iter()
            .any(|s| s.is_empty())
            {
                return Err(Error::InvalidPage);
            }
        }
        if serde_json::to_vec(&self.records)
            .map_err(|_| Error::InvalidPage)?
            .len()
            > 8 * 1024 * 1024
        {
            return Err(Error::InvalidPage);
        }
        Ok(())
    }
}
pub fn validate_input(input: &Value) -> Result<()> {
    let object = input.as_object().ok_or(Error::InvalidInput)?;
    if serde_json::to_vec(input)
        .map_err(|_| Error::InvalidInput)?
        .len()
        > 4096
    {
        return Err(Error::InvalidInput);
    }
    for (k, v) in object {
        let valid = match k.as_str() {
            "channelId" | "query" | "filter" => {
                v.as_str().is_some_and(|s| !s.is_empty() && s.len() <= 256)
            }
            "limit" => v.as_u64().is_some_and(|n| (1..=100).contains(&n)),
            _ => false,
        };
        if !valid {
            return Err(Error::InvalidInput);
        }
    }
    Ok(())
}
#[derive(Clone, Debug)]
pub struct Config {
    pub lease_duration: Duration,
    pub retry_base: Duration,
    pub max_retry_delay: Duration,
    pub max_attempts: u32,
}
impl Default for Config {
    fn default() -> Self {
        Self {
            lease_duration: Duration::from_secs(60),
            retry_base: Duration::from_secs(1),
            max_retry_delay: Duration::from_secs(3600),
            max_attempts: DEFAULT_MAX_ATTEMPTS,
        }
    }
}
impl Config {
    pub fn retry_delay(&self, attempts: u32, hint: Option<u64>) -> Duration {
        self.retry_base
            .saturating_mul(1u32.checked_shl(attempts).unwrap_or(u32::MAX))
            .min(self.max_retry_delay)
            .max(Duration::from_secs(hint.unwrap_or(0).min(86400)))
    }
}
