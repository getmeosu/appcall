use crate::AuthError;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use hmac::{Hmac, KeyInit, Mac};
use serde::Deserialize;
use sha2::Sha256;

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccessClaims {
    pub user_id: String,
    #[serde(default)]
    pub email: String,
    #[serde(default)]
    pub display_name: String,
    #[serde(default)]
    pub token_type: String,
    #[serde(default)]
    pub mfa_pending: bool,
    #[serde(default)]
    pub impersonated_by: String,
    #[serde(default)]
    pub exp: Option<f64>,
    #[serde(default)]
    pub nbf: Option<f64>,
    #[serde(default)]
    pub iat: Option<f64>,
    #[serde(default)]
    pub iss: Option<String>,
    #[serde(default)]
    pub aud: Option<Audience>,
}
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(untagged)]
pub enum Audience {
    One(String),
    Many(Vec<String>),
}

/// Go's current contract has no issuer/audience requirement and permits missing
/// exp. Set these explicitly when the issuer contract is tightened.
#[derive(Debug, Clone, Default)]
pub struct JwtPolicy {
    pub issuer: Option<String>,
    pub audience: Option<String>,
    pub require_expiry: bool,
}
pub struct JwtVerifier {
    secret: Vec<u8>,
    policy: JwtPolicy,
}
impl JwtVerifier {
    pub fn new(secret: impl AsRef<[u8]>, policy: JwtPolicy) -> Result<Self, AuthError> {
        if secret.as_ref().is_empty() {
            return Err(AuthError::InvalidConfiguration);
        }
        Ok(Self {
            secret: secret.as_ref().to_vec(),
            policy,
        })
    }
    pub fn verify(&self, token: &str, now_unix: i64) -> Result<AccessClaims, AuthError> {
        if token.is_empty() || token.len() > 16384 {
            return Err(AuthError::Unauthorized);
        }
        let parts: Vec<_> = token.split('.').collect();
        if parts.len() != 3 || parts.iter().any(|p| p.is_empty()) {
            return Err(AuthError::Unauthorized);
        }
        let header_raw = URL_SAFE_NO_PAD
            .decode(parts[0])
            .map_err(|_| AuthError::Unauthorized)?;
        #[derive(Deserialize)]
        struct JwtHeader {
            alg: String,
            #[serde(default)]
            crit: Vec<String>,
        }
        let header: JwtHeader =
            serde_json::from_slice(&header_raw).map_err(|_| AuthError::Unauthorized)?;
        if header.alg != "HS256" || !header.crit.is_empty() {
            return Err(AuthError::Unauthorized);
        }
        let signature = URL_SAFE_NO_PAD
            .decode(parts[2])
            .map_err(|_| AuthError::Unauthorized)?;
        let mut mac = Hmac::<Sha256>::new_from_slice(&self.secret)
            .map_err(|_| AuthError::InvalidConfiguration)?;
        mac.update(parts[0].as_bytes());
        mac.update(b".");
        mac.update(parts[1].as_bytes());
        mac.verify_slice(&signature)
            .map_err(|_| AuthError::Unauthorized)?;
        let raw = URL_SAFE_NO_PAD
            .decode(parts[1])
            .map_err(|_| AuthError::Unauthorized)?;
        let claims: AccessClaims =
            serde_json::from_slice(&raw).map_err(|_| AuthError::Unauthorized)?;
        if !crate::principal::valid_id(&claims.user_id)
            || claims.mfa_pending
            || claims.token_type != "access"
        {
            return Err(AuthError::Unauthorized);
        }
        // golang-jwt NumericDate defaults to second precision. iat is parsed but
        // not validated by the pinned SDK; exp and nbf apply with zero leeway.
        if claims
            .exp
            .is_some_and(|exp| (now_unix as f64) >= exp.floor())
        {
            return Err(AuthError::Expired);
        }
        if self.policy.require_expiry && claims.exp.is_none() {
            return Err(AuthError::Unauthorized);
        }
        if claims
            .nbf
            .is_some_and(|nbf| (now_unix as f64) < nbf.floor())
        {
            return Err(AuthError::Unauthorized);
        }
        if let Some(issuer) = &self.policy.issuer {
            if claims.iss.as_ref() != Some(issuer) {
                return Err(AuthError::Forbidden);
            }
        }
        if let Some(audience) = &self.policy.audience {
            let matches = match &claims.aud {
                Some(Audience::One(v)) => v == audience,
                Some(Audience::Many(v)) => v.contains(audience),
                None => false,
            };
            if !matches {
                return Err(AuthError::Forbidden);
            }
        }
        Ok(claims)
    }
}
