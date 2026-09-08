/// A bounded declaration key, never a submitted value or a display label.
/// Construction checks syntax only; callers must resolve it against the
/// authorized connector and selected setup route before presenting a label.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeclaredFieldKey(String);
impl DeclaredFieldKey {
    pub fn new(key: &str) -> Option<Self> {
        (!key.is_empty()
            && key.len() <= 128
            && key
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'_' | b'-' | b'.')))
        .then(|| Self(key.to_owned()))
    }
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ValidationFailure {
    Timeout,
    Transport,
    VerificationFailed,
}

/// Only credential-resolution failures with unambiguous typed OAuth evidence.
/// This does not classify access checks, cancellation, or revision conflicts.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CredentialResolutionFailure {
    Transport,
    InvalidToken,
    OutcomeUnknown,
}
impl CredentialResolutionFailure {
    pub fn from_oauth_error(error: appcall_oauth::Error) -> Option<Self> {
        match error {
            appcall_oauth::Error::Transport => Some(Self::Transport),
            appcall_oauth::Error::InvalidToken => Some(Self::InvalidToken),
            appcall_oauth::Error::OutcomeUnknown => Some(Self::OutcomeUnknown),
            _ => None,
        }
    }
    pub fn oauth_error(self) -> appcall_oauth::Error {
        match self {
            Self::Transport => appcall_oauth::Error::Transport,
            Self::InvalidToken => appcall_oauth::Error::InvalidToken,
            Self::OutcomeUnknown => appcall_oauth::Error::OutcomeUnknown,
        }
    }
}
impl ValidationFailure {
    /// Runner messages, wire codes, URLs, and payloads are intentionally ignored.
    pub fn from_runner_kind(kind: appcall_runner_client::ErrorKind) -> Self {
        match kind {
            appcall_runner_client::ErrorKind::Timeout => Self::Timeout,
            appcall_runner_client::ErrorKind::Transport => Self::Transport,
            _ => Self::VerificationFailed,
        }
    }
}
