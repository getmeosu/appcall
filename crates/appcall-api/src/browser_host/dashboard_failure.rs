//! Drops arbitrary provider detail at the browser boundary.
use crate::ApiError;
use appcall_web::{DashboardFailure, FailureBytes, FailureCause, FailureUsage};

/// Maps only allowlisted evidence; a code provides no execution provenance.
pub fn map_api_error(error: ApiError) -> DashboardFailure {
    let classification = super::api_error(ApiError::new(error.code));
    map_classified(error, classification)
}

pub(crate) fn map_classified(
    error: ApiError,
    classification: appcall_web::Error,
) -> DashboardFailure {
    use crate::{
        ApiFailureEvidence as Evidence, ConnectionCheckFailure as Check,
        SetupFailureEvidence as Setup,
    };
    use appcall_web::ExecutionOutcome;
    let mut cause = match error.code {
        "INVALID_JSON" => FailureCause::InvalidJson,
        "INVALID_ACTION_INPUT" => FailureCause::InvalidActionInput,
        "MISSING_SETUP_FIELD" => FailureCause::MissingSetupField,
        "MISSING_CREDENTIAL" => FailureCause::CredentialsUnavailable,
        "CONNECTION_DISCONNECTED" => FailureCause::ConnectionDisconnected,
        "ACTION_TIMEOUT" => FailureCause::Timeout,
        "CONNECTOR_RATE_LIMITED" => FailureCause::RateLimited,
        "USAGE_LIMIT_EXCEEDED" => FailureCause::UsageLimited,
        "ACTION_RESPONSE_TOO_LARGE" => FailureCause::ResponseTooLarge,
        "ACTION_INPUT_TOO_LARGE" => FailureCause::InputTooLarge,
        _ => FailureCause::Unknown,
    };
    let mut outcome = ExecutionOutcome::Unknown;
    let mut local_usage_blocked = false;
    let mut retry = None;
    match error.evidence.as_deref() {
        Some(Evidence::Action(e)) => {
            outcome = match e.outcome {
                appcall_actions::ActionDispatchOutcome::NotDispatched => {
                    ExecutionOutcome::NotDispatched
                }
                appcall_actions::ActionDispatchOutcome::ResponseReceived => {
                    ExecutionOutcome::ResponseReceived
                }
                appcall_actions::ActionDispatchOutcome::Unknown => ExecutionOutcome::Unknown,
            };
            local_usage_blocked = e.origin == appcall_actions::ActionFailureOrigin::LocalAdmission
                && outcome == ExecutionOutcome::NotDispatched;
            retry = e.retry_after_seconds;
        }
        Some(Evidence::Setup(Setup::MissingField(_))) => {
            cause = FailureCause::MissingSetupField;
            outcome = ExecutionOutcome::NotDispatched;
        }
        Some(Evidence::Setup(Setup::Validation(validation))) => {
            cause = match validation {
                appcall_setup::ValidationFailure::Timeout => FailureCause::Timeout,
                appcall_setup::ValidationFailure::Transport => FailureCause::ServiceUnavailable,
                appcall_setup::ValidationFailure::VerificationFailed => {
                    FailureCause::VerificationFailed
                }
            }
        }
        Some(Evidence::ConnectionCheck(check)) => {
            cause = match check {
                Check::CredentialsUnavailable => FailureCause::CredentialsUnavailable,
                Check::Timeout => FailureCause::Timeout,
                Check::Transport => FailureCause::ServiceUnavailable,
                Check::VerificationFailed => FailureCause::VerificationFailed,
            }
        }
        None => {}
    }
    let usage = error
        .usage
        .and_then(|u| FailureUsage::new(u.current, u.projected, u.soft_limit, u.hard_limit));
    // This upstream field describes response bytes only. It cannot establish
    // an input size even if paired with an input-size error code.
    let bytes = error
        .detail
        .and_then(|d| d.response_size)
        .filter(|_| cause == FailureCause::ResponseTooLarge)
        .and_then(|s| FailureBytes::new(s.actual_bytes, s.limit_bytes));
    DashboardFailure::new(classification, cause)
        .with_request_id(&error.request_id)
        .with_retry_after_seconds(retry)
        .with_usage(usage)
        .with_bytes(bytes)
        .with_outcome(outcome)
        .with_local_usage_blocked(local_usage_blocked)
}

pub(crate) fn setup_failure(
    error: appcall_setup::Error,
    classification: appcall_web::Error,
    setup: &appcall_connectors::SetupConfig,
    route: &str,
) -> DashboardFailure {
    let api = ApiError::from(error);
    let declared = match api.evidence.as_deref() {
        Some(crate::ApiFailureEvidence::Setup(crate::SetupFailureEvidence::MissingField(
            Some(key),
        ))) => {
            let fields = if setup.routes.is_empty() {
                route.is_empty().then_some(&setup.fields)
            } else {
                setup
                    .routes
                    .iter()
                    .find(|r| r.id == route || route.is_empty())
                    .map(|r| &r.fields)
            };
            fields
                .and_then(|fields| fields.iter().find(|f| f.required && f.key == key.as_str()))
                .and_then(|f| {
                    appcall_web::DeclaredSetupField::from_authorized_manifest(&f.key, &f.label)
                })
        }
        _ => None,
    };
    map_classified(api, classification).with_setup_field(declared)
}

pub(crate) fn invalid_json(error: serde_json::Error) -> DashboardFailure {
    DashboardFailure::new(appcall_web::Error::Invalid, FailureCause::InvalidJson)
        .with_json_position(appcall_web::JsonPosition::new(error.line(), error.column()))
        .with_outcome(appcall_web::ExecutionOutcome::NotDispatched)
}

#[cfg(test)]
mod tests {
    use super::*;
    use appcall_actions::{FailureDetail, ResponseSize, UsageSnapshot};
    use appcall_web::{Error, ExecutionOutcome};

    #[test]
    fn copy_dashboard_failures_usage_and_retry_require_actual_provenance() {
        use appcall_actions::{
            ActionDispatchOutcome as Outcome, ActionFailureEvidence, ActionFailureOrigin as Origin,
        };
        for origin in [
            Origin::Unknown,
            Origin::Runner,
            Origin::LocalValidation,
            Origin::LocalAdmission,
        ] {
            for outcome in [
                Outcome::Unknown,
                Outcome::ResponseReceived,
                Outcome::NotDispatched,
            ] {
                let evidence = ActionFailureEvidence {
                    origin,
                    outcome,
                    retry_after_seconds: Some(17),
                };
                let usage = map_api_error(ApiError {
                    evidence: Some(Box::new(crate::ApiFailureEvidence::Action(
                        evidence.clone(),
                    ))),
                    ..detailed("USAGE_LIMIT_EXCEEDED")
                });
                assert_eq!(
                    usage.local_usage_blocked(),
                    origin == Origin::LocalAdmission && outcome == Outcome::NotDispatched
                );
                assert!(usage.retry_after_seconds().is_none());
                let rate = map_api_error(ApiError {
                    retry_after_seconds: Some(2),
                    evidence: Some(Box::new(crate::ApiFailureEvidence::Action(evidence))),
                    ..detailed("CONNECTOR_RATE_LIMITED")
                });
                assert_eq!(rate.retry_after_seconds(), Some(17));
                assert!(!rate.local_usage_blocked());
                assert_eq!(
                    rate.outcome(),
                    match outcome {
                        Outcome::Unknown => ExecutionOutcome::Unknown,
                        Outcome::ResponseReceived => ExecutionOutcome::ResponseReceived,
                        Outcome::NotDispatched => ExecutionOutcome::NotDispatched,
                    }
                );
            }
        }
        let bare = map_api_error(detailed("USAGE_LIMIT_EXCEEDED"));
        assert!(!bare.local_usage_blocked());
        assert_eq!(bare.outcome(), ExecutionOutcome::Unknown);
        assert_eq!(
            map_api_error(detailed("CONNECTOR_RATE_LIMITED")).retry_after_seconds(),
            None
        );
    }

    #[test]
    fn copy_dashboard_failures_setup_keys_require_selected_required_declaration() {
        let setup: appcall_connectors::SetupConfig = serde_json::from_value(serde_json::json!({
            "mode":"api_key", "fields":[{"key":"base","label":"Base only","required":true}],
            "routes":[{"id":"first","fields":[{"key":"key","label":"First key","required":true},{"key":"optional","label":"Optional","required":false}]},
                {"id":"second","fields":[{"key":"key","label":"Second key","required":true}]}]
        })).unwrap();
        for (route, key, label) in [
            ("", "key", Some("First key")),
            ("second", "key", Some("Second key")),
            ("first", "optional", None),
            ("first", "unknown", None),
            ("first", "base", None),
            ("unknown", "key", None),
        ] {
            let error = appcall_setup::Error::MissingDeclaredField(
                appcall_setup::DeclaredFieldKey::new(key).unwrap(),
            );
            let failure = setup_failure(error, Error::Invalid, &setup, route);
            assert_eq!(failure.setup_field().map(|field| field.label()), label);
            assert_eq!(failure.cause(), FailureCause::MissingSetupField);
            assert_eq!(failure.classification(), Error::Invalid);
        }
    }

    fn detailed(code: &'static str) -> ApiError {
        ApiError {
            code,
            evidence: None,
            request_id: "request-1.Valid_id".into(),
            usage: Some(Box::new(UsageSnapshot {
                month: "<script>private-month</script>".into(),
                current: 10,
                projected: 11,
                soft_limit: 8,
                hard_limit: 10,
            })),
            retry_after_seconds: Some(17),
            detail: Some(Box::new(FailureDetail {
                safe_message: Some("<script>private-secret-value</script>".into()),
                response_size: Some(ResponseSize {
                    actual_bytes: 11,
                    limit_bytes: 10,
                }),
            })),
        }
    }

    #[test]
    fn dashboard_failure_mapping_preserves_supported_causes() {
        for (code, cause, classification) in [
            ("INVALID_JSON", FailureCause::InvalidJson, Error::Invalid),
            (
                "INVALID_ACTION_INPUT",
                FailureCause::InvalidActionInput,
                Error::Unavailable,
            ),
            (
                "MISSING_SETUP_FIELD",
                FailureCause::MissingSetupField,
                Error::Unavailable,
            ),
            (
                "MISSING_CREDENTIAL",
                FailureCause::CredentialsUnavailable,
                Error::Unavailable,
            ),
            (
                "CONNECTION_DISCONNECTED",
                FailureCause::ConnectionDisconnected,
                Error::Unavailable,
            ),
            ("ACTION_TIMEOUT", FailureCause::Timeout, Error::Unavailable),
            (
                "CONNECTOR_RATE_LIMITED",
                FailureCause::RateLimited,
                Error::Unavailable,
            ),
            (
                "USAGE_LIMIT_EXCEEDED",
                FailureCause::UsageLimited,
                Error::Unavailable,
            ),
            (
                "ACTION_RESPONSE_TOO_LARGE",
                FailureCause::ResponseTooLarge,
                Error::Unavailable,
            ),
            (
                "ACTION_INPUT_TOO_LARGE",
                FailureCause::InputTooLarge,
                Error::Unavailable,
            ),
        ] {
            let failure = map_api_error(detailed(code));
            assert_eq!(
                failure.classification(),
                classification,
                "classification for {code}"
            );
            assert_eq!(failure.cause(), cause, "cause for {code}");
            assert_eq!(failure.request_id(), Some("request-1.Valid_id"));
            assert_eq!(
                failure.outcome(),
                ExecutionOutcome::Unknown,
                "outcome for {code}"
            );
            assert_eq!(failure.retry_after_seconds(), None);
            assert_eq!(
                failure.usage().map(|u| (
                    u.current(),
                    u.projected(),
                    u.soft_limit(),
                    u.hard_limit()
                )),
                (cause == FailureCause::UsageLimited).then_some((10, 11, 8, Some(10)))
            );
            assert_eq!(
                failure.bytes().map(|b| (b.actual(), b.limit())),
                (cause == FailureCause::ResponseTooLarge).then_some((11, 10))
            );
            assert_eq!(failure.json_position(), None);
            let absent = map_api_error(ApiError::new(code));
            assert_eq!(absent.request_id(), None);
            assert_eq!(absent.retry_after_seconds(), None);
            assert_eq!(absent.usage(), None);
            assert_eq!(absent.bytes(), None);
        }
    }

    #[test]
    fn dashboard_failure_mapping_discards_sensitive_and_unknown_detail() {
        for code in [
            "UNKNOWN_PRIVATE_CODE",
            "credential-private-secret-value",
            "ACTION_TIMEOUT",
            "USAGE_LIMIT_EXCEEDED",
        ] {
            for request_id in [
                String::new(),
                "a".repeat(257),
                "<script>secret</script>".into(),
                "id/secret".into(),
                "id\nsecret".into(),
                "é".into(),
            ] {
                let failure = map_api_error(ApiError {
                    request_id,
                    ..detailed(code)
                });
                assert_eq!(failure.request_id(), None);
                let debug = format!("{failure:?}");
                for forbidden in [
                    "private-secret-value",
                    "script",
                    "private-month",
                    "UNKNOWN_PRIVATE_CODE",
                    "credential-private",
                ] {
                    assert!(
                        !debug.contains(forbidden),
                        "arbitrary detail crossed boundary"
                    );
                }
                if code.contains("PRIVATE") || code.starts_with("credential") {
                    assert_eq!(failure.cause(), FailureCause::Unknown);
                    assert_eq!(failure.usage(), None);
                    assert_eq!(failure.retry_after_seconds(), None);
                    assert_eq!(failure.bytes(), None);
                }
                assert_eq!(failure.outcome(), ExecutionOutcome::Unknown);
            }
        }
        for (current, projected, soft_limit, hard_limit) in
            [(-1, 2, 3, 4), (1, -2, 3, 4), (1, 2, -3, 4), (1, 2, 3, -4)]
        {
            let failure = map_api_error(ApiError {
                usage: Some(Box::new(UsageSnapshot {
                    month: "private".into(),
                    current,
                    projected,
                    soft_limit,
                    hard_limit,
                })),
                ..detailed("USAGE_LIMIT_EXCEEDED")
            });
            assert_eq!(failure.usage(), None);
        }
        for (actual_bytes, limit_bytes) in [(0, 0), (1, 0), (10, 10), (9, 10)] {
            let failure = map_api_error(ApiError {
                detail: Some(Box::new(FailureDetail {
                    safe_message: None,
                    response_size: Some(ResponseSize {
                        actual_bytes,
                        limit_bytes,
                    }),
                })),
                ..detailed("ACTION_RESPONSE_TOO_LARGE")
            });
            assert_eq!(failure.bytes(), None);
        }
    }

    #[test]
    fn dashboard_failure_mapping_preserves_access_and_anti_enumeration() {
        for (code, classification) in [
            ("UNAUTHORIZED", Error::Unauthorized),
            ("FORBIDDEN", Error::Forbidden),
            ("CONNECTION_NOT_FOUND", Error::Forbidden),
            ("ACTION_NOT_PERMITTED", Error::Forbidden),
        ] {
            let failure = map_api_error(detailed(code));
            assert_eq!(failure.classification(), classification);
            assert_eq!(failure.cause(), FailureCause::Unknown);
            assert_eq!(failure.usage(), None);
            assert_eq!(failure.bytes(), None);
            assert_eq!(failure.retry_after_seconds(), None);
            assert_eq!(failure.outcome(), ExecutionOutcome::Unknown);
        }
        for code in [
            "INVALID_REQUEST",
            "INVALID_LIMIT",
            "INVALID_CURSOR",
            "UNKNOWN_ACTION",
        ] {
            assert_eq!(
                map_api_error(ApiError::new(code)).classification(),
                Error::Invalid
            );
        }
    }

    #[test]
    fn dashboard_failure_mapping_preserves_zero_retry_and_unlimited_usage() {
        let retry = map_api_error(ApiError {
            retry_after_seconds: Some(0),
            evidence: Some(Box::new(crate::ApiFailureEvidence::Action(
                appcall_actions::ActionFailureEvidence {
                    retry_after_seconds: Some(0),
                    ..Default::default()
                },
            ))),
            ..detailed("CONNECTOR_RATE_LIMITED")
        });
        assert_eq!(retry.retry_after_seconds(), Some(0));
        let usage = map_api_error(ApiError {
            usage: Some(Box::new(UsageSnapshot {
                month: "private".into(),
                current: 0,
                projected: 1,
                soft_limit: 20,
                hard_limit: 0,
            })),
            ..detailed("USAGE_LIMIT_EXCEEDED")
        });
        assert_eq!(
            usage.usage().map(|u| (u.current(), u.hard_limit())),
            Some((0, None))
        );
    }
}
