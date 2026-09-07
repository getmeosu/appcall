use crate::{AuthError, Principal};
use hmac::digest::CtOutput;
use sha2::{Digest, Sha256};

pub trait ApiKeyVerifier: Send + Sync {
    fn verify_api_key(&self, raw: &str) -> Result<Option<Principal>, AuthError>;
}

pub fn hash_api_key(raw: &str) -> String {
    Sha256::digest(raw.as_bytes())
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

/// The same lowercase SHA256 encoding as Go internal/auth.HashAPIKey.
/// No Debug implementation: verifier state must not enter logs.
pub struct StaticApiKey {
    hash: [u8; 32],
    principal: Principal,
}
impl StaticApiKey {
    pub fn from_hash(hash: &str, principal: Principal) -> Result<Self, AuthError> {
        if hash.len() != 64
            || !hash
                .bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        {
            return Err(AuthError::InvalidConfiguration);
        }
        let mut decoded = [0; 32];
        for (index, byte) in decoded.iter_mut().enumerate() {
            *byte = u8::from_str_radix(&hash[index * 2..index * 2 + 2], 16)
                .map_err(|_| AuthError::InvalidConfiguration)?;
        }
        Ok(Self {
            hash: decoded,
            principal,
        })
    }
}
impl ApiKeyVerifier for StaticApiKey {
    fn verify_api_key(&self, raw: &str) -> Result<Option<Principal>, AuthError> {
        Ok(matches_hash(raw, self.hash).then(|| self.principal.clone()))
    }
}

pub(crate) fn matches_hash(raw: &str, expected: [u8; 32]) -> bool {
    if raw.is_empty() || raw.len() > 4096 {
        return false;
    }
    CtOutput::<Sha256>::new(Sha256::digest(raw.as_bytes()))
        == CtOutput::<Sha256>::new(expected.into())
}
