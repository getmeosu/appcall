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
