use crate::*;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD as BASE64, Engine as _};
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use zeroize::Zeroizing;
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct StateClaims {
    pub project_id: String,
    pub connector: String,
    pub connection_id: String,
    pub redirect_uri: String,
    pub expires_at: String,
    pub pkce_ref: String,
}
pub struct ExpectedState<'a> {
    pub project_id: Option<&'a str>,
    pub connector: &'a str,
    pub redirect_uri: &'a str,
}
pub struct StateSigner {
    key: Zeroizing<Vec<u8>>,
}
impl StateSigner {
    pub fn new(key: &[u8]) -> Result<Self> {
        if key.len() != 32 {
            return Err(Error::InvalidKey);
        };
        Ok(Self {
            key: Zeroizing::new(key.to_vec()),
        })
    }
    pub fn sign(&self, claims: &StateClaims) -> Result<String> {
        let raw = serde_json::to_vec(claims).map_err(|_| Error::InvalidState)?;
        if raw.len() > 8192 {
            return Err(Error::InvalidState);
        }
        let payload = BASE64.encode(raw);
        let mut mac = Hmac::<Sha256>::new_from_slice(&self.key).map_err(|_| Error::InvalidKey)?;
        mac.update(payload.as_bytes());
        Ok(format!(
            "{}.{}",
            payload,
            BASE64.encode(mac.finalize().into_bytes())
        ))
    }
    pub fn verify(
        &self,
        state: &str,
        expected: &ExpectedState<'_>,
        now: i64,
    ) -> Result<StateClaims> {
        if state.len() > 16384 {
            return Err(Error::InvalidState);
        }
        let (payload, signature) = state.split_once('.').ok_or(Error::InvalidState)?;
        let signature = BASE64.decode(signature).map_err(|_| Error::InvalidState)?;
        let mut mac = Hmac::<Sha256>::new_from_slice(&self.key).map_err(|_| Error::InvalidKey)?;
        mac.update(payload.as_bytes());
        mac.verify_slice(&signature)
            .map_err(|_| Error::InvalidState)?;
        let claims: StateClaims =
            serde_json::from_slice(&BASE64.decode(payload).map_err(|_| Error::InvalidState)?)
                .map_err(|_| Error::InvalidState)?;
        if chrono::DateTime::parse_from_rfc3339(&claims.expires_at)
            .map_err(|_| Error::InvalidState)?
            .timestamp()
            <= now
        {
            return Err(Error::StateExpired);
        }
        if expected
            .project_id
            .is_some_and(|project| !project.is_empty() && project != claims.project_id)
            || expected.connector != claims.connector
            || expected.redirect_uri != claims.redirect_uri
        {
            return Err(Error::StateBinding);
        }
        Ok(claims)
    }
}
