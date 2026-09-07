//! Authentication primitives. Callers must supply trusted verifier instances;
//! request headers can select a tenant or brand but never grant membership.
mod api_key;
mod authorize;
mod jwt;
#[cfg(feature = "postgres-store")]
mod postgres_store;
mod principal;
mod webhook;
pub use api_key::*;
pub use authorize::*;
pub use jwt::*;
#[cfg(feature = "postgres-store")]
pub use postgres_store::*;
pub use principal::*;
pub use webhook::*;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AuthError {
    Unauthorized,
    Forbidden,
    Expired,
    InvalidHeaders,
    InvalidConfiguration,
    Unavailable,
}
impl std::fmt::Display for AuthError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            Self::Unauthorized => "authentication failed",
            Self::Forbidden => "access denied",
            Self::Expired => "token expired",
            Self::InvalidHeaders => "invalid authentication headers",
            Self::InvalidConfiguration => "authentication is not configured",
            Self::Unavailable => "authentication is unavailable",
        })
    }
}
impl std::error::Error for AuthError {}
