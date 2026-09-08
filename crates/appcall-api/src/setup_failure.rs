//! Internal setup and connection-check evidence; never serialized into HTTP DTOs.
use crate::{ApiError, ApiFailureEvidence};
use appcall_setup::{DeclaredFieldKey, Error as E, ValidationFailure};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SetupFailureEvidence {
    MissingField(Option<DeclaredFieldKey>),
    Validation(ValidationFailure),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ConnectionCheckFailure {
    CredentialsUnavailable,
    Timeout,
    Transport,
    VerificationFailed,
}
impl From<ValidationFailure> for ConnectionCheckFailure {
    fn from(cause: ValidationFailure) -> Self {
        match cause {
            ValidationFailure::Timeout => Self::Timeout,
            ValidationFailure::Transport => Self::Transport,
            ValidationFailure::VerificationFailed => Self::VerificationFailed,
        }
    }
}

impl From<appcall_setup::Error> for ApiError {
    fn from(error: appcall_setup::Error) -> Self {
        if let E::CredentialResolutionFailed(cause) = &error {
            let mut api = Self::from(E::OAuth(cause.oauth_error()));
            api.evidence = Some(Box::new(ApiFailureEvidence::ConnectionCheck(
                ConnectionCheckFailure::CredentialsUnavailable,
            )));
            return api;
        }
        let code = match &error {
            E::MissingField | E::MissingDeclaredField(_) => "MISSING_SETUP_FIELD",
            E::InvalidInput | E::UnknownRoute => "INVALID_REQUEST",
            E::NotFound => "CONNECTION_NOT_FOUND",
            E::Conflict => "CONNECTION_CHANGED",
            E::Unsupported => "UNSUPPORTED_SETUP_MODE",
            E::ValidationFailed | E::Validation(_) => "CONNECTOR_SETUP_VALIDATION_FAILED",
            E::OAuth(
                appcall_oauth::Error::InvalidState
                | appcall_oauth::Error::StateExpired
                | appcall_oauth::Error::StateBinding,
            ) => "INVALID_OAUTH_STATE",
            E::OAuth(appcall_oauth::Error::NotConfigured) => "OAUTH_APP_NOT_CONFIGURED",
            E::OAuth(
                appcall_oauth::Error::Transport
                | appcall_oauth::Error::InvalidToken
                | appcall_oauth::Error::OutcomeUnknown,
            ) => "OAUTH_EXCHANGE_FAILED",
            _ => "STORAGE_UNAVAILABLE",
        };
        let evidence = match error {
            E::MissingField => Some(SetupFailureEvidence::MissingField(None)),
            E::MissingDeclaredField(key) => Some(SetupFailureEvidence::MissingField(Some(key))),
            E::ValidationFailed => Some(SetupFailureEvidence::Validation(
                ValidationFailure::VerificationFailed,
            )),
            E::Validation(cause) => Some(SetupFailureEvidence::Validation(cause)),
            _ => None,
        };
        let mut api = Self::new(code);
        api.evidence = evidence.map(|e| Box::new(ApiFailureEvidence::Setup(e)));
        api
    }
}

pub(crate) fn connection_check_error(cause: ConnectionCheckFailure) -> ApiError {
    let mut api = ApiError::new("INTERNAL_ERROR");
    api.evidence = Some(Box::new(ApiFailureEvidence::ConnectionCheck(cause)));
    api
}

pub(crate) fn memory_connection_check_error(error: appcall_setup::Error) -> ApiError {
    let mut api = ApiError::from(error);
    if let Some(ApiFailureEvidence::Setup(SetupFailureEvidence::Validation(cause))) =
        api.evidence.as_deref()
    {
        api.evidence = Some(Box::new(ApiFailureEvidence::ConnectionCheck(
            (*cause).into(),
        )));
    }
    api
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn credential_resolution_evidence_preserves_original_oauth_http_contract() {
        use appcall_setup::CredentialResolutionFailure as C;
        for cause in [C::Transport, C::InvalidToken, C::OutcomeUnknown] {
            let original = cause.oauth_error();
            assert_eq!(C::from_oauth_error(original), Some(cause));
            let api = ApiError::from(E::CredentialResolutionFailed(cause));
            assert_eq!(api.code, ApiError::from(E::OAuth(original)).code);
            assert!(api.detail.is_none());
            assert!(matches!(
                api.evidence.as_deref(),
                Some(ApiFailureEvidence::ConnectionCheck(
                    ConnectionCheckFailure::CredentialsUnavailable
                ))
            ));
            let actual = crate::error_response(api);
            let expected = crate::provider_routes::setup_error(E::OAuth(original), false);
            assert_eq!(actual.status, expected.status);
            assert_eq!(actual.body, expected.body);
            assert_eq!(
                crate::provider_routes::setup_error(E::CredentialResolutionFailed(cause), false)
                    .body,
                expected.body
            );
        }
        for error in [
            appcall_oauth::Error::InvalidState,
            appcall_oauth::Error::StateExpired,
            appcall_oauth::Error::StateBinding,
            appcall_oauth::Error::NotConfigured,
            appcall_oauth::Error::Unsupported,
        ] {
            assert_eq!(C::from_oauth_error(error), None);
        }
    }
    #[test]
    fn setup_validation_evidence_varies_without_changing_public_http_contract() {
        for cause in [
            ValidationFailure::Timeout,
            ValidationFailure::Transport,
            ValidationFailure::VerificationFailed,
        ] {
            let api = ApiError::from(E::Validation(cause));
            assert_eq!(api.code, "CONNECTOR_SETUP_VALIDATION_FAILED");
            assert!(api.detail.is_none());
            assert!(
                matches!(api.evidence.as_deref(), Some(ApiFailureEvidence::Setup(SetupFailureEvidence::Validation(actual))) if *actual == cause)
            );
            let actual = crate::error_response(api);
            let expected = crate::provider_routes::setup_error(E::ValidationFailed, false);
            assert_eq!(actual.status, 502);
            assert_eq!(actual.body, expected.body);
            assert!(actual.body["error"].get("evidence").is_none());
        }
        let generic = ApiError::from(E::ValidationFailed);
        assert!(matches!(
            generic.evidence.as_deref(),
            Some(ApiFailureEvidence::Setup(SetupFailureEvidence::Validation(
                ValidationFailure::VerificationFailed
            )))
        ));
        let missing = ApiError::from(E::MissingField);
        assert!(matches!(
            missing.evidence.as_deref(),
            Some(ApiFailureEvidence::Setup(
                SetupFailureEvidence::MissingField(None)
            ))
        ));
    }
}
