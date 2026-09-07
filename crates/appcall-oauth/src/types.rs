use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, fmt};
use zeroize::Zeroize;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Error {
    InvalidInput,
    InvalidToken,
    StateExpired,
    StateBinding,
    InvalidState,
    InvalidKey,
    NotConfigured,
    Unsupported,
    ConnectionUnavailable,
    Persistence,
    OutcomeUnknown,
    Transport,
}
impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "oauth {self:?}")
    }
}
impl std::error::Error for Error {}
pub type Result<T> = std::result::Result<T, Error>;
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenSet {
    pub(crate) access_token: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub(crate) refresh_token: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub(crate) token_type: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub(crate) scope: String,
    #[serde(default = "zero_time")]
    pub(crate) expires_at: String,
}
fn zero_time() -> String {
    "0001-01-01T00:00:00Z".into()
}
impl TokenSet {
    pub fn decode(raw: &[u8]) -> Result<Self> {
        if raw.len() > 1024 * 1024 {
            return Err(Error::InvalidToken);
        }
        let result: Self = serde_json::from_slice(raw).map_err(|_| Error::InvalidToken)?;
        if result.access_token.trim().is_empty()
            || chrono::DateTime::parse_from_rfc3339(&result.expires_at).is_err()
        {
            return Err(Error::InvalidToken);
        }
        Ok(result)
    }
    pub fn encode(&self) -> Result<Vec<u8>> {
        serde_json::to_vec(self).map_err(|_| Error::InvalidToken)
    }
    pub fn access_token(&self) -> &str {
        &self.access_token
    }
    pub fn refresh_token(&self) -> &str {
        &self.refresh_token
    }
    pub fn needs_refresh(&self, now: i64) -> bool {
        self.expires_at != "0001-01-01T00:00:00Z"
            && chrono::DateTime::parse_from_rfc3339(&self.expires_at)
                .map_or(true, |time| time.timestamp() <= now.saturating_add(60))
    }
}
impl fmt::Debug for TokenSet {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("TokenSet([REDACTED])")
    }
}
impl Drop for TokenSet {
    fn drop(&mut self) {
        self.access_token.zeroize();
        self.refresh_token.zeroize();
    }
}
#[derive(Clone)]
pub struct AppCredentials {
    pub client_id: String,
    pub client_secret: String,
    pub redirect_uri: String,
}
impl fmt::Debug for AppCredentials {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("AppCredentials([REDACTED])")
    }
}
impl Drop for AppCredentials {
    fn drop(&mut self) {
        self.client_secret.zeroize();
    }
}
pub struct ResolvedCredentials(pub(crate) BTreeMap<String, String>);
impl ResolvedCredentials {
    pub fn fields(&self) -> &BTreeMap<String, String> {
        &self.0
    }
    pub fn into_fields(mut self) -> serde_json::Map<String, serde_json::Value> {
        std::mem::take(&mut self.0)
            .into_iter()
            .map(|(key, value)| (key, serde_json::Value::String(value)))
            .collect()
    }
}
impl fmt::Debug for ResolvedCredentials {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("ResolvedCredentials([REDACTED])")
    }
}
impl Drop for ResolvedCredentials {
    fn drop(&mut self) {
        for value in self.0.values_mut() {
            value.zeroize();
        }
    }
}
