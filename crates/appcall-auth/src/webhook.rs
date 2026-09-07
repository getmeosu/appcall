use crate::{principal::valid_id, AuthError};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use hmac::{Hmac, KeyInit, Mac};
use serde::Deserialize;
use sha2::Sha256;

/// Callback identity only: this token does not grant general API access.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct WebhookClaims {
    #[serde(rename = "p")]
    pub project_id: String,
    #[serde(rename = "c")]
    pub connection_id: String,
    #[serde(rename = "k")]
    pub connector: String,
}

pub struct WebhookVerifier {
    secret: Vec<u8>,
}
impl WebhookVerifier {
    pub fn new(secret: impl AsRef<[u8]>) -> Result<Self, AuthError> {
        if secret.as_ref().is_empty() {
            return Err(AuthError::InvalidConfiguration);
        }
        Ok(Self {
            secret: secret.as_ref().to_vec(),
        })
    }

    /// Scope arguments come from the matched callback route. Project identity
    /// comes exclusively from the authenticated token, never an unsigned header.
    pub fn verify_scoped(
        &self,
        token: &str,
        connector: &str,
        connection: &str,
    ) -> Result<WebhookClaims, AuthError> {
        if token.is_empty() || token.len() > 4096 {
            return Err(AuthError::Unauthorized);
        }
        let (segment, signature) = token.split_once('.').ok_or(AuthError::Unauthorized)?;
        let signature = URL_SAFE_NO_PAD
            .decode(signature)
            .map_err(|_| AuthError::Unauthorized)?;
        let mut mac = Hmac::<Sha256>::new_from_slice(&self.secret)
            .map_err(|_| AuthError::InvalidConfiguration)?;
        mac.update(segment.as_bytes());
        mac.verify_slice(&signature)
            .map_err(|_| AuthError::Unauthorized)?;
        let raw = URL_SAFE_NO_PAD
            .decode(segment)
            .map_err(|_| AuthError::Unauthorized)?;
        let claims: WebhookClaims =
            serde_json::from_slice(&raw).map_err(|_| AuthError::Unauthorized)?;
        if !valid_id(&claims.project_id)
            || !valid_id(&claims.connection_id)
            || !valid_id(&claims.connector)
            || claims.connector != connector
            || claims.connection_id != connection
        {
            return Err(AuthError::Unauthorized);
        }
        Ok(claims)
    }

    /// Use when the host already has an authoritative project route binding.
    pub fn verify_project_scoped(
        &self,
        token: &str,
        project: &str,
        connector: &str,
        connection: &str,
    ) -> Result<WebhookClaims, AuthError> {
        let claims = self.verify_scoped(token, connector, connection)?;
        if claims.project_id != project {
            return Err(AuthError::Unauthorized);
        }
        Ok(claims)
    }
}
