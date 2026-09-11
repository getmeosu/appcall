use serde::{Deserialize, Serialize};
use std::fmt;

#[derive(Debug)]
pub enum Error {
    Storage(String),
    Invalid(&'static str),
    NotFound,
    Conflict,
    Nondeterminism,
    Limit,
    Unavailable,
}
impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{self:?}")
    }
}
impl std::error::Error for Error {}
pub type Result<T> = std::result::Result<T, Error>;
impl From<rusqlite::Error> for Error {
    fn from(e: rusqlite::Error) -> Self {
        Self::Storage(format!(
            "sqlite operation failed: {:?}",
            e.sqlite_error_code()
        ))
    }
}

/// Opaque host key only. Never put credentials or content in this identifier.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(try_from = "UncheckedPayloadRef")]
pub struct PayloadRef {
    key: String,
    ephemeral: bool,
}
#[derive(Deserialize)]
struct UncheckedPayloadRef {
    key: String,
    ephemeral: bool,
}
impl TryFrom<UncheckedPayloadRef> for PayloadRef {
    type Error = Error;
    fn try_from(p: UncheckedPayloadRef) -> Result<Self> {
        Self::new(&p.key, p.ephemeral)
    }
}
impl PayloadRef {
    pub fn durable(key: &str) -> Result<Self> {
        Self::new(key, false)
    }
    pub fn ephemeral(key: &str) -> Result<Self> {
        Self::new(key, true)
    }
    fn new(key: &str, ephemeral: bool) -> Result<Self> {
        validate(key)?;
        Ok(Self {
            key: key.into(),
            ephemeral,
        })
    }
    pub fn key(&self) -> &str {
        &self.key
    }
    pub fn is_ephemeral(&self) -> bool {
        self.ephemeral
    }
}
pub(crate) fn validate(s: &str) -> Result<()> {
    if s.is_empty()
        || s.len() > 128
        || !s
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"_-.:/".contains(&b))
    {
        return Err(Error::Invalid("invalid opaque identifier"));
    }
    Ok(())
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum RunState {
    Running,
    CancelRequested,
    Cancelled,
    Completed,
    NeedsInput,
    NeedsImplementation,
    OutcomeUnknown,
    Nondeterminism,
    Failed,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum RunFailure {
    InvalidCommand,
    ResourceLimit,
    MissingActivityImplementation,
    PayloadUnavailable,
    RetryExhausted,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum EffectPolicy {
    Read,
    Idempotent,
    Reconcile,
    Unknown,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(try_from = "UncheckedRetryPolicy")]
pub struct RetryPolicy {
    pub max_attempts: u64,
    pub max_elapsed_ms: i64,
    pub base_delay_ms: i64,
    pub max_delay_ms: i64,
}
#[derive(Deserialize)]
struct UncheckedRetryPolicy {
    max_attempts: u64,
    max_elapsed_ms: i64,
    base_delay_ms: i64,
    max_delay_ms: i64,
}
impl RetryPolicy {
    pub fn new(
        max_attempts: u64,
        max_elapsed_ms: i64,
        base_delay_ms: i64,
        max_delay_ms: i64,
    ) -> Result<Self> {
        let policy = Self {
            max_attempts,
            max_elapsed_ms,
            base_delay_ms,
            max_delay_ms,
        };
        policy.validate()?;
        Ok(policy)
    }
    pub(crate) fn validate(&self) -> Result<()> {
        if self.max_attempts == 0
            || self.max_attempts > 1024
            || self.max_elapsed_ms <= 0
            || self.max_elapsed_ms > 86_400_000
            || self.base_delay_ms <= 0
            || self.base_delay_ms > 86_400_000
            || self.max_delay_ms < self.base_delay_ms
            || self.max_delay_ms > 86_400_000
        {
            return Err(Error::Invalid("invalid retry policy"));
        }
        Ok(())
    }
}
impl TryFrom<UncheckedRetryPolicy> for RetryPolicy {
    type Error = Error;
    fn try_from(policy: UncheckedRetryPolicy) -> Result<Self> {
        Self::new(
            policy.max_attempts,
            policy.max_elapsed_ms,
            policy.base_delay_ms,
            policy.max_delay_ms,
        )
    }
}
impl Default for RetryPolicy {
    fn default() -> Self {
        Self {
            max_attempts: 5,
            max_elapsed_ms: 60_000,
            base_delay_ms: 1_000,
            max_delay_ms: 30_000,
        }
    }
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ActivityHandle(pub String);
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ChildHandle(pub String);
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum WaitSource {
    Timer(i64),
    Signal(String),
    Child(ChildHandle),
    Activity(ActivityHandle),
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Selection {
    pub index: usize,
    pub value: Option<PayloadRef>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum Command {
    Activity {
        name: String,
        version: String,
        input: PayloadRef,
        policy: EffectPolicy,
        detached_wait: bool,
    },
    Timer(i64),
    Signal(String),
    Child {
        name: String,
        version: String,
        input: PayloadRef,
    },
    Select(Vec<WaitSource>),
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum CommandValue {
    Payload(PayloadRef),
    Unit,
    Activity(ActivityHandle),
    Child(ChildHandle),
    Selected(Selection),
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct HistoryEvent {
    pub command: Command,
    pub value: Option<CommandValue>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ActivityAttempt {
    pub run_id: String,
    pub effect_id: String,
    pub attempt: u64,
    pub owner_epoch: u64,
    pub name: String,
    pub version: String,
    pub input: PayloadRef,
    pub policy: EffectPolicy,
    #[serde(default)]
    pub started_at_ms: i64,
    #[serde(default)]
    pub retry_started_at_ms: i64,
    #[serde(default)]
    pub retry_policy: Option<RetryPolicy>,
}
#[derive(Clone, Debug)]
pub enum DriveOutcome {
    Activity(ActivityAttempt),
    Waiting,
    Progressed,
    Completed(PayloadRef),
    Suspended(RunState),
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum TaskState {
    Ready,
    InFlight,
    Invoking,
    Done(PayloadRef),
    Uncertain,
    Retrying(RetryState),
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct RetryState {
    pub next_attempt_at_ms: i64,
    pub retry_started_at_ms: i64,
    pub policy: RetryPolicy,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ActivityTask {
    pub attempt: ActivityAttempt,
    pub state: TaskState,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SignalEvent {
    pub name: String,
    pub value: PayloadRef,
    pub consumed: bool,
}
/// A transaction unit. Backends must atomically compare revision and write the
/// complete run plus inserted children. Implementations must enforce one owner.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RunRecord {
    pub id: String,
    pub parent: Option<String>,
    pub workflow: String,
    pub version: String,
    pub input: PayloadRef,
    pub state: RunState,
    #[serde(default)]
    pub failure_reason: Option<RunFailure>,
    pub revision: u64,
    pub history: Vec<HistoryEvent>,
    pub tasks: Vec<ActivityTask>,
    pub signals: Vec<SignalEvent>,
    pub children: Vec<String>,
    pub output: Option<PayloadRef>,
    pub wakeup: Option<i64>,
}
/// Host-owned payload storage. Returned bytes are never written to engine storage.
pub trait PayloadResolver {
    fn resolve(&self, reference: &PayloadRef) -> Result<Option<Vec<u8>>>;
}
pub struct MissingPayloads;
impl PayloadResolver for MissingPayloads {
    fn resolve(&self, _: &PayloadRef) -> Result<Option<Vec<u8>>> {
        Ok(None)
    }
}
#[derive(Clone, Debug)]
pub enum ActivityFailure {
    Retryable,
    OutcomeUnknown,
}
