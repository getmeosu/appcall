use super::*;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Scenario {
    Preview,
    Populated,
    Connections,
    ConnectionsMalformed,
    Logs,
    Logs401,
    Logs403,
    Logs503,
    LogsMalformed,
    Empty,
    Unavailable,
    Runs,
    RunsEmpty,
    RunsUnavailable,
    RunsMalformed,
    BillingPartial,
    BillingMissing,
    BillingStatusUnavailable,
    BillingPlansUnavailable,
    BillingEmptyPlans,
    AuthRejected,
    AuthAccepted,
    AuthUnavailable,
    NoSession,
    UntrustedOrigin,
    EventsStream,
    RequestSuccess,
    RequestDelayed,
    RequestInvalid,
    RequestUnavailable,
    RequestMissingPatch,
    RequestDrop,
    Failure(FailureFixture),
}
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FailureFixture {
    InvalidJson,
    InvalidInput,
    MissingField,
    Credentials,
    Disconnected,
    TimeoutNotDispatched,
    TimeoutUnknown,
    RateKnown,
    RateUnknown,
    UsageKnown,
    UsageUnknown,
    ResponseSize,
    InputSize,
    Verification,
    Unavailable,
    Unknown,
}
pub const INVALID_JSON: &str = "{\n \"query\": }";
pub const SETUP_LABEL: &str = "Workspace & \"region\"";
impl Scenario {
    pub fn parse(name: &str) -> Result<Self, Error> {
        Ok(match name {
            "preview" => Self::Preview,
            "populated" => Self::Populated,
            "connections" => Self::Connections,
            "connections-malformed" => Self::ConnectionsMalformed,
            "logs" => Self::Logs,
            "logs-401" => Self::Logs401,
            "logs-403" => Self::Logs403,
            "logs-503" => Self::Logs503,
            "logs-malformed" => Self::LogsMalformed,
            "empty" => Self::Empty,
            "unavailable" => Self::Unavailable,
            "runs" => Self::Runs,
            "runs-empty" => Self::RunsEmpty,
            "runs-unavailable" => Self::RunsUnavailable,
            "runs-malformed" => Self::RunsMalformed,
            "billing-partial" => Self::BillingPartial,
            "billing-missing" => Self::BillingMissing,
            "billing-status-unavailable" => Self::BillingStatusUnavailable,
            "billing-plans-unavailable" => Self::BillingPlansUnavailable,
            "billing-empty-plans" => Self::BillingEmptyPlans,
            "auth-rejected" => Self::AuthRejected,
            "auth-accepted" => Self::AuthAccepted,
            "auth-unavailable" => Self::AuthUnavailable,
            "no-session" => Self::NoSession,
            "untrusted-origin" => Self::UntrustedOrigin,
            "events-stream" => Self::EventsStream,
            "request-success" => Self::RequestSuccess,
            "request-delayed" => Self::RequestDelayed,
            "request-invalid" => Self::RequestInvalid,
            "request-unavailable" => Self::RequestUnavailable,
            "request-missing-patch" => Self::RequestMissingPatch,
            "request-drop" => Self::RequestDrop,
            name => Self::Failure(FailureFixture::parse(name)?),
        })
    }
    pub fn failure(self) -> Option<DashboardFailure> {
        match self {
            Self::Failure(failure) => Some(failure.evidence()),
            _ => None,
        }
    }
    pub fn delay(self) -> std::time::Duration {
        std::time::Duration::from_secs(
            u64::from(matches!(
                self,
                Self::RequestDelayed
                    | Self::RequestInvalid
                    | Self::RequestUnavailable
                    | Self::RequestMissingPatch
                    | Self::RequestDrop
            )) * 2,
        )
    }
    pub fn inject_session(self) -> bool {
        !matches!(
            self,
            Self::NoSession | Self::AuthRejected | Self::AuthAccepted | Self::AuthUnavailable
        )
    }
}
impl FailureFixture {
    fn parse(name: &str) -> Result<Self, Error> {
        Ok(match name {
            "error-invalid-json" => Self::InvalidJson,
            "error-invalid-input" => Self::InvalidInput,
            "error-missing-field" => Self::MissingField,
            "error-credentials" => Self::Credentials,
            "error-disconnected" => Self::Disconnected,
            "error-timeout-not-dispatched" => Self::TimeoutNotDispatched,
            "error-timeout-unknown" => Self::TimeoutUnknown,
            "error-rate-known" => Self::RateKnown,
            "error-rate-unknown" => Self::RateUnknown,
            "error-usage-known" => Self::UsageKnown,
            "error-usage-unknown" => Self::UsageUnknown,
            "error-response-size" => Self::ResponseSize,
            "error-input-size" => Self::InputSize,
            "error-verification" => Self::Verification,
            "error-unavailable" => Self::Unavailable,
            "error-unknown" => Self::Unknown,
            _ => return Err(Error::Configuration),
        })
    }
    fn evidence(self) -> DashboardFailure {
        use FailureCause as Cause;
        let cause = match self {
            Self::InvalidJson => Cause::InvalidJson,
            Self::InvalidInput => Cause::InvalidActionInput,
            Self::MissingField => Cause::MissingSetupField,
            Self::Credentials => Cause::CredentialsUnavailable,
            Self::Disconnected => Cause::ConnectionDisconnected,
            Self::TimeoutNotDispatched | Self::TimeoutUnknown => Cause::Timeout,
            Self::RateKnown | Self::RateUnknown => Cause::RateLimited,
            Self::UsageKnown | Self::UsageUnknown => Cause::UsageLimited,
            Self::ResponseSize => Cause::ResponseTooLarge,
            Self::InputSize => Cause::InputTooLarge,
            Self::Verification => Cause::VerificationFailed,
            Self::Unavailable => Cause::ServiceUnavailable,
            Self::Unknown => Cause::Unknown,
        };
        let classification = if matches!(
            self,
            Self::InvalidJson | Self::InvalidInput | Self::MissingField | Self::InputSize
        ) {
            Error::Invalid
        } else {
            Error::Unavailable
        };
        let base = DashboardFailure::new(classification, cause).with_request_id("preview_current");
        match self {
            Self::InvalidJson => invalid_json_failure(INVALID_JSON),
            Self::MissingField => base
                .with_setup_field(DeclaredSetupField::from_authorized_manifest(
                    "workspace",
                    SETUP_LABEL,
                ))
                .with_outcome(ExecutionOutcome::NotDispatched),
            Self::TimeoutNotDispatched => base.with_outcome(ExecutionOutcome::NotDispatched),
            Self::RateKnown => base.with_retry_after_seconds(Some(30)),
            Self::UsageKnown => base
                .with_usage(FailureUsage::new(12, 13, 10, 12))
                .with_outcome(ExecutionOutcome::NotDispatched)
                .with_local_usage_blocked(true),
            Self::ResponseSize => base
                .with_bytes(FailureBytes::new(2049, 2048))
                .with_outcome(ExecutionOutcome::ResponseReceived),
            Self::InputSize => base
                .with_bytes(FailureBytes::new(1025, 1024))
                .with_outcome(ExecutionOutcome::NotDispatched),
            _ => base,
        }
    }
}
pub fn invalid_json_failure(raw: &str) -> DashboardFailure {
    let position = serde_json::from_str::<Value>(raw)
        .err()
        .and_then(|e| JsonPosition::new(e.line(), e.column()));
    DashboardFailure::new(Error::Invalid, FailureCause::InvalidJson)
        .with_request_id("preview_current")
        .with_json_position(position)
        .with_outcome(ExecutionOutcome::NotDispatched)
}
