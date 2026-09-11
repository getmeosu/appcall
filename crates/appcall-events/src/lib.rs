//! Durable provider event acceptance/outbox and tenant-scoped replay on existing PG.
mod cursor;
mod input;
mod store;
mod types;
pub use cursor::{
    decode as decode_cursor, history_cursor, stream_cursor, stream_cursor_at, Cursor,
};
pub use input::{is_sync_operation, sync_input, validate_parsed};
pub use store::*;
pub use types::*;
pub type Result<T> = std::result::Result<T, Error>;
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Error {
    Invalid,
    TooLarge,
    Signature,
    Forbidden,
    NotFound,
    Conflict,
    ConfigurationRequired,
    Storage,
    Dispatch,
}
impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            Self::Invalid => "invalid webhook request",
            Self::TooLarge => "webhook payload too large",
            Self::Signature => "webhook verification failed",
            Self::Forbidden => "webhook access denied",
            Self::NotFound => "webhook event or connection not found",
            Self::Conflict => "webhook identity conflict",
            Self::ConfigurationRequired => "webhook sync requires provider configuration",
            Self::Storage => "webhook storage unavailable",
            Self::Dispatch => "webhook dispatch unavailable",
        })
    }
}
impl std::error::Error for Error {}
