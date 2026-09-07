use aes_gcm::{
    aead::{rand_core::RngCore, Aead, KeyInit, OsRng, Payload},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Error {
    Invalid,
    Unauthorized,
    Forbidden,
    Unavailable,
    Configuration,
}
impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            Self::Invalid => "invalid browser request",
            Self::Unauthorized => "sign-in required",
            Self::Forbidden => "access denied",
            Self::Unavailable => "identity service unavailable",
            Self::Configuration => "invalid identity configuration",
        })
    }
}
impl std::error::Error for Error {}
#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Session {
    #[serde(rename = "a")]
    pub access_token: String,
    #[serde(rename = "r")]
    pub refresh_token: String,
    #[serde(rename = "u")]
    pub user_id: String,
    #[serde(rename = "e")]
    pub email: String,
    #[serde(rename = "t")]
    pub tenant_id: String,
    #[serde(rename = "n")]
    pub tenant_name: String,
}
// Redacted even when a test assertion prints a failed comparison.
impl std::fmt::Debug for Session {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("Session([redacted])")
    }
}
pub struct SessionCodec {
    cipher: Aes256Gcm,
    secure: bool,
}
const PURPOSE: &[u8] = b"appcall:dashboard:oauth-login:v1";
impl SessionCodec {
    pub fn new(secret: &str, secure: bool) -> Result<Self, Error> {
        if secret.is_empty() {
            return Err(Error::Configuration);
        }
        Ok(Self {
            cipher: Aes256Gcm::new_from_slice(&Sha256::digest(secret.as_bytes()))
                .map_err(|_| Error::Configuration)?,
            secure,
        })
    }
    fn seal<T: Serialize>(&self, value: &T, aad: &[u8]) -> Result<String, Error> {
        let body = serde_json::to_vec(value).map_err(|_| Error::Invalid)?;
        let mut nonce = [0; 12];
        OsRng
            .try_fill_bytes(&mut nonce)
            .map_err(|_| Error::Unavailable)?;
        let encrypted = self
            .cipher
            .encrypt(Nonce::from_slice(&nonce), Payload { msg: &body, aad })
            .map_err(|_| Error::Unavailable)?;
        let mut raw = nonce.to_vec();
        raw.extend(encrypted);
        Ok(URL_SAFE_NO_PAD.encode(raw))
    }
    fn open<T: serde::de::DeserializeOwned>(
        &self,
        raw: &str,
        aad: &[u8],
        limit: usize,
    ) -> Result<T, Error> {
        if raw.len() > limit {
            return Err(Error::Invalid);
        }
        let bytes = URL_SAFE_NO_PAD.decode(raw).map_err(|_| Error::Invalid)?;
        if bytes.len() < 28 {
            return Err(Error::Invalid);
        }
        let body = self
            .cipher
            .decrypt(
                Nonce::from_slice(&bytes[..12]),
                Payload {
                    msg: &bytes[12..],
                    aad,
                },
            )
            .map_err(|_| Error::Invalid)?;
        serde_json::from_slice(&body).map_err(|_| Error::Invalid)
    }
    pub fn seal_session(&self, s: &Session) -> Result<String, Error> {
        self.seal(s, b"")
    }
    pub fn open_session(&self, s: &str) -> Result<Session, Error> {
        self.open(s, b"", 16384)
    }
    pub fn seal_transaction(&self, t: &OAuthTransaction) -> Result<String, Error> {
        self.seal(t, PURPOSE)
    }
    pub fn open_transaction(&self, s: &str, now: i64) -> Result<OAuthTransaction, Error> {
        let tx: OAuthTransaction = self.open(s, PURPOSE, 2048)?;
        if tx.expires <= now
            || tx.expires > now.saturating_add(601)
            || tx.state.len() != 43
            || tx.verifier.len() != 43
        {
            return Err(Error::Invalid);
        }
        Ok(tx)
    }
    pub fn session_cookie(&self, s: &Session) -> Result<String, Error> {
        Ok(self.header("appcall_session", &self.seal_session(s)?, "/", 2592000))
    }
    pub fn clear_session(&self) -> String {
        self.header("appcall_session", "", "/", 0)
    }
    pub fn transaction_cookie(&self, t: &OAuthTransaction) -> Result<String, Error> {
        Ok(self.header(
            "appcall_oauth_login",
            &self.seal_transaction(t)?,
            "/auth/callback",
            600,
        ))
    }
    pub fn clear_transaction(&self) -> String {
        self.header("appcall_oauth_login", "", "/auth/callback", 0)
    }
    fn header(&self, name: &str, value: &str, path: &str, age: i64) -> String {
        format!(
            "{name}={value}; Path={path}; Max-Age={age}; HttpOnly; SameSite=Lax{}",
            if self.secure { "; Secure" } else { "" }
        )
    }
}
#[derive(Clone, Serialize, Deserialize)]
pub struct OAuthTransaction {
    pub state: String,
    pub verifier: String,
    pub expires: i64,
    pub next: String,
}
impl OAuthTransaction {
    pub fn new(now: i64, next: &str) -> Result<Self, Error> {
        Ok(Self {
            state: random()?,
            verifier: random()?,
            expires: now.checked_add(600).ok_or(Error::Invalid)?,
            next: safe_next(next).into(),
        })
    }
    pub fn challenge(&self) -> String {
        URL_SAFE_NO_PAD.encode(Sha256::digest(self.verifier.as_bytes()))
    }
}
fn random() -> Result<String, Error> {
    let mut bytes = [0; 32];
    OsRng
        .try_fill_bytes(&mut bytes)
        .map_err(|_| Error::Unavailable)?;
    Ok(URL_SAFE_NO_PAD.encode(bytes))
}
pub fn safe_next(path: &str) -> &str {
    if path.len() > 1024
        || !(path == "/app" || path.starts_with("/app/"))
        || path.chars().any(|c| c.is_control() || c == '\\')
        || path.split(['?', '#']).next().unwrap_or("").contains('%')
        || path
            .split(['?', '#'])
            .next()
            .unwrap_or("")
            .split('/')
            .any(|p| p == ".." || p == ".")
    {
        "/app"
    } else {
        path
    }
}
pub fn cookie<'a>(header: &'a str, name: &str) -> Result<Option<&'a str>, Error> {
    if header.len() > 32768 {
        return Err(Error::Invalid);
    }
    let mut result = None;
    for part in header.split(';') {
        if let Some((key, value)) = part.trim().split_once('=') {
            if key == name {
                if result.is_some() {
                    return Err(Error::Invalid);
                }
                result = Some(value)
            }
        }
    }
    Ok(result)
}
/// Call on every browser mutation before parsing or dispatch. Origin comes from
/// a configured public URL, never the untrusted Host/Forwarded request headers.
pub fn verify_csrf(
    origin: &str,
    supplied: Option<&str>,
    referer: Option<&str>,
) -> Result<(), Error> {
    let expected = reqwest::Url::parse(origin).map_err(|_| Error::Configuration)?;
    let raw = supplied.or(referer).ok_or(Error::Forbidden)?;
    let actual = reqwest::Url::parse(raw).map_err(|_| Error::Forbidden)?;
    if expected.origin() != actual.origin()
        || !actual.username().is_empty()
        || actual.password().is_some()
    {
        return Err(Error::Forbidden);
    }
    Ok(())
}

/// Compare fixed-size random binding values without early byte exits.
pub(crate) fn binding_eq(a: &str, b: &str) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.as_bytes()
        .iter()
        .zip(b.as_bytes())
        .fold(0u8, |acc, (a, b)| acc | (a ^ b))
        == 0
}
