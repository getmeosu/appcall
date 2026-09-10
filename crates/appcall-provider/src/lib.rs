mod gate;
pub use gate::PgAccountGate;
mod client;
mod persistence;
mod service;
pub use client::{Account, Client};
use serde_json::{json, Value};
pub use service::*;
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Error {
    pub status: u16,
    pub code: &'static str,
    pub message: &'static str,
    pub limit: Option<i64>,
    pub used: Option<i64>,
}
impl Error {
    pub fn new(status: u16, code: &'static str, message: &'static str) -> Self {
        Self {
            status,
            code,
            message,
            limit: None,
            used: None,
        }
    }
    pub fn body(&self) -> Value {
        let mut v = json!({"error":{"code":self.code,"message":self.message}});
        if let Some(l) = self.limit {
            v["error"]["limit"] = json!(l);
            v["error"]["used"] = json!(self.used.unwrap_or(0));
        }
        v
    }
    pub(crate) fn database() -> Self {
        Self::new(
            503,
            "UNIPILE_BINDING_UNAVAILABLE",
            "The provider binding could not be read or saved.",
        )
    }
    pub(crate) fn unauthorized() -> Self {
        Self::new(401, "UNAUTHORIZED", "Authentication is required.")
    }
    pub(crate) fn denied(limit: i64, used: i64) -> Self {
        Self {
            status: if limit > 0 { 409 } else { 402 },
            code: if limit > 0 {
                "QUOTA_EXCEEDED"
            } else {
                "NOT_ENTITLED"
            },
            message: "Account linking is not permitted for this project right now.",
            limit: Some(limit),
            used: Some(used),
        }
    }
}
impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.code)
    }
}
impl std::error::Error for Error {}
impl From<postgres::Error> for Error {
    fn from(_: postgres::Error) -> Self {
        Self::database()
    }
}
pub type Result<T> = std::result::Result<T, Error>;

// `string` accepts identifiers up to 4096 UTF-8 bytes. A cursor contains two
// such identifiers; JSON can expand each control byte to six bytes. Account
// for the fixed JSON fields, then apply the URL-safe base64 upper bound. Keep
// this derived limit shared by request validation and cursor decoding so a
// server-generated cursor is always accepted by the request path.
pub(crate) const INPUT_STRING_MAX_BYTES: usize = 4096;
const ACCEPTED_CURSOR_JSON_OVERHEAD: usize = 512;
pub(crate) const ACCEPTED_CURSOR_MAX_LEN: usize =
    3 + 4 * (2 * INPUT_STRING_MAX_BYTES * 6 + ACCEPTED_CURSOR_JSON_OVERHEAD).div_ceil(3);

pub(crate) fn random_id() -> Result<String> {
    use base64::Engine;
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).map_err(|_| Error::database())?;
    Ok(base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes))
}
pub fn channel(provider: &str) -> Option<&'static str> {
    match provider {
        "LINKEDIN" => Some("LINKEDIN"),
        "GOOGLE" | "OUTLOOK" | "MAIL" | "IMAP" => Some("MAIL"),
        "WHATSAPP" | "INSTAGRAM" | "MESSENGER" | "TELEGRAM" => Some("MESSAGING"),
        _ => None,
    }
}
