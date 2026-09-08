mod evidence;
mod fields;
mod service;
pub use evidence::{CredentialResolutionFailure, DeclaredFieldKey, ValidationFailure};
pub use fields::*;
pub use service::*;
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Error {
    InvalidInput,
    Cancelled,
    MissingField,
    MissingDeclaredField(DeclaredFieldKey),
    UnknownRoute,
    Unsupported,
    ValidationFailed,
    Validation(ValidationFailure),
    CredentialResolutionFailed(CredentialResolutionFailure),
    NotFound,
    Conflict,
    Persistence,
    OAuth(appcall_oauth::Error),
}
impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "setup {:?}", self)
    }
}
impl std::error::Error for Error {}
pub type Result<T> = std::result::Result<T, Error>;
impl From<appcall_store::Error> for Error {
    fn from(error: appcall_store::Error) -> Self {
        match error {
            appcall_store::Error::NotFound => Self::NotFound,
            appcall_store::Error::Conflict => Self::Conflict,
            appcall_store::Error::Invalid => Self::InvalidInput,
            _ => Self::Persistence,
        }
    }
}
mod runner;
pub use runner::{RunnerValidator, ValidationEvidence};
