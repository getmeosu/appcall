//! In-process, allowlisted failure evidence for the browser boundary.
use crate::Error;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FailureCause {
    InvalidJson,
    InvalidActionInput,
    MissingSetupField,
    CredentialsUnavailable,
    ConnectionDisconnected,
    Timeout,
    RateLimited,
    UsageLimited,
    ResponseTooLarge,
    InputTooLarge,
    VerificationFailed,
    ServiceUnavailable,
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExecutionOutcome {
    NotDispatched,
    ResponseReceived,
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct JsonPosition {
    line: usize,
    column: usize,
}
impl JsonPosition {
    pub fn new(line: usize, column: usize) -> Option<Self> {
        (line > 0 && column > 0).then_some(Self { line, column })
    }
    pub fn line(self) -> usize {
        self.line
    }
    pub fn column(self) -> usize {
        self.column
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct FailureUsage {
    current: u64,
    projected: u64,
    soft_limit: u64,
    hard_limit: Option<u64>,
}
impl FailureUsage {
    pub fn new(current: i64, projected: i64, soft_limit: i64, hard_limit: i64) -> Option<Self> {
        Some(Self {
            current: current.try_into().ok()?,
            projected: projected.try_into().ok()?,
            soft_limit: soft_limit.try_into().ok()?,
            hard_limit: match u64::try_from(hard_limit).ok()? {
                0 => None,
                limit => Some(limit),
            },
        })
    }
    pub fn current(self) -> u64 {
        self.current
    }
    pub fn projected(self) -> u64 {
        self.projected
    }
    pub fn soft_limit(self) -> u64 {
        self.soft_limit
    }
    /// None is an explicitly unlimited hard limit, not an absent snapshot.
    pub fn hard_limit(self) -> Option<u64> {
        self.hard_limit
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct FailureBytes {
    actual: usize,
    limit: usize,
}
impl FailureBytes {
    pub fn new(actual: usize, limit: usize) -> Option<Self> {
        (limit > 0 && actual > limit).then_some(Self { actual, limit })
    }
    pub fn actual(self) -> usize {
        self.actual
    }
    pub fn limit(self) -> usize {
        self.limit
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeclaredSetupField {
    key: String,
    label: String,
}
impl DeclaredSetupField {
    /// The caller must first authorize the manifest and select a declared field.
    /// Both arguments must come from that declaration, never request values or
    /// provider messages. Validation here bounds display text, not authority.
    pub fn from_authorized_manifest(key: &str, label: &str) -> Option<Self> {
        (valid_id(key)
            && !label.trim().is_empty()
            && label.len() <= 256
            && !label
                .chars()
                .any(|c| c.is_control() || matches!(c, '<' | '>')))
        .then(|| Self {
            key: key.to_owned(),
            label: label.to_owned(),
        })
    }
    pub fn key(&self) -> &str {
        &self.key
    }
    pub fn label(&self) -> &str {
        &self.label
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DashboardFailure {
    classification: Error,
    cause: FailureCause,
    request_id: Option<String>,
    json_position: Option<JsonPosition>,
    retry_after_seconds: Option<u64>,
    usage: Option<Box<FailureUsage>>,
    bytes: Option<FailureBytes>,
    outcome: ExecutionOutcome,
    setup_field: Option<Box<DeclaredSetupField>>,
    local_usage_blocked: bool,
}
impl DashboardFailure {
    pub fn new(classification: Error, cause: FailureCause) -> Self {
        Self {
            classification,
            cause: if matches!(classification, Error::Unauthorized | Error::Forbidden) {
                FailureCause::Unknown
            } else {
                cause
            },
            request_id: None,
            json_position: None,
            retry_after_seconds: None,
            usage: None,
            bytes: None,
            outcome: ExecutionOutcome::Unknown,
            setup_field: None,
            local_usage_blocked: false,
        }
    }
    pub fn classification(&self) -> Error {
        self.classification
    }
    pub fn cause(&self) -> FailureCause {
        self.cause
    }
    pub fn request_id(&self) -> Option<&str> {
        self.request_id.as_deref()
    }
    pub fn json_position(&self) -> Option<JsonPosition> {
        self.json_position
    }
    pub fn retry_after_seconds(&self) -> Option<u64> {
        self.retry_after_seconds
    }
    pub fn usage(&self) -> Option<FailureUsage> {
        self.usage.as_deref().copied()
    }
    pub fn bytes(&self) -> Option<FailureBytes> {
        self.bytes
    }
    pub fn outcome(&self) -> ExecutionOutcome {
        self.outcome
    }
    pub fn setup_field(&self) -> Option<&DeclaredSetupField> {
        self.setup_field.as_deref()
    }
    pub fn with_outcome(self, outcome: ExecutionOutcome) -> Self {
        Self {
            outcome,
            local_usage_blocked: self.local_usage_blocked
                && outcome == ExecutionOutcome::NotDispatched,
            ..self
        }
    }
    pub fn with_local_usage_blocked(self, blocked: bool) -> Self {
        Self {
            local_usage_blocked: blocked
                && self.cause == FailureCause::UsageLimited
                && self.outcome == ExecutionOutcome::NotDispatched,
            ..self
        }
    }
    pub fn local_usage_blocked(&self) -> bool {
        self.local_usage_blocked
    }
    pub fn with_setup_field(self, field: Option<DeclaredSetupField>) -> Self {
        Self {
            setup_field: field
                .filter(|_| self.cause == FailureCause::MissingSetupField)
                .map(Box::new),
            ..self
        }
    }
    pub fn with_request_id(self, request_id: &str) -> Self {
        Self {
            request_id: valid_id(request_id).then(|| request_id.to_owned()),
            ..self
        }
    }
    pub fn with_json_position(self, position: Option<JsonPosition>) -> Self {
        Self {
            json_position: position.filter(|_| self.cause == FailureCause::InvalidJson),
            ..self
        }
    }
    pub fn with_retry_after_seconds(self, seconds: Option<u64>) -> Self {
        Self {
            retry_after_seconds: seconds.filter(|_| self.cause == FailureCause::RateLimited),
            ..self
        }
    }
    pub fn with_usage(self, usage: Option<FailureUsage>) -> Self {
        Self {
            usage: usage
                .filter(|_| self.cause == FailureCause::UsageLimited)
                .map(Box::new),
            ..self
        }
    }
    pub fn with_bytes(self, bytes: Option<FailureBytes>) -> Self {
        Self {
            bytes: bytes.filter(|_| {
                matches!(
                    self.cause,
                    FailureCause::ResponseTooLarge | FailureCause::InputTooLarge
                )
            }),
            ..self
        }
    }
}
fn valid_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 256
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.'))
}
impl From<Error> for DashboardFailure {
    fn from(error: Error) -> Self {
        Self::new(error, FailureCause::Unknown)
    }
}

pub(crate) fn recovery(
    operation: crate::DashboardOperation,
    resource: Option<&str>,
    failure: &DashboardFailure,
) -> String {
    use crate::{http::escape, DashboardOperation as Op};
    use FailureCause::*;
    let fields = operation == Op::TestForm;
    let message: String = match failure.classification() {
        Error::Unauthorized => "Appcall could not authorize this request. Sign in again before running the tool.".into(),
        Error::Forbidden => "Appcall denied this request. Check project access and select an account available to this project.".into(),
        Error::Configuration => "Appcall could not complete this request because a required service is not configured. Ask the operator to check server configuration.".into(),
        _ if fields => "Appcall could not load the fields for this tool. Select the tool again before running it.".into(),
        _ => match failure.cause() {
            InvalidJson => "The JSON input is not valid. Correct its syntax, or clear Edit as JSON to use the fields above.".into(),
            InvalidActionInput => "The input does not match this tool’s schema. Review its required fields and input types.".into(),
            MissingSetupField => failure.setup_field().map(|f| format!("Add {}.", f.label())).unwrap_or_else(|| "Add the required setup field.".into()),
            CredentialsUnavailable => "Appcall could not obtain credentials for this connection. Review its connection setup.".into(),
            ConnectionDisconnected => "This connection is disconnected. Select an active connection before running the tool.".into(),
            Timeout => "This request timed out.".into(),
            RateLimited => "The connector reported a rate limit. Review the provider’s limits before another run.".into(),
            UsageLimited if failure.local_usage_blocked() => "Appcall blocked this run before dispatch because of a usage limit. Review usage before another run.".into(),
            UsageLimited => "Appcall reported a usage limit for this run. Review usage before another run.".into(),
            ResponseTooLarge => "The response exceeded the allowed size. Narrow the requested result before another run.".into(),
            InputTooLarge => "The input exceeded the allowed size. Reduce the submitted input before another run.".into(),
            VerificationFailed => "Appcall could not verify this connection. Review its setup details.".into(),
            ServiceUnavailable | Unknown => match operation {
                Op::Setup => "Appcall could not complete this connection setup. Review its setup details.".into(),
                Op::TestConnection => "Appcall could not complete this connection check. Review its setup details.".into(),
                Op::ReplayTrace => "Appcall could not complete this replay. Review the original request and execution logs.".into(),
                _ => "Appcall could not complete this request. Review execution logs, or ask the operator to check the request.".into(),
            },
        },
    };
    let mut html = format!("<p role=\"alert\">{}</p>", escape(&message));
    if matches!(
        failure.classification(),
        Error::Unauthorized | Error::Forbidden
    ) {
        return html;
    }
    if !fields {
        if let Some(position) = failure.json_position() {
            html.push_str(&format!("<p>Line <span class=\"mono\">{}</span>, column <span class=\"mono\">{}</span>.</p>", position.line(), position.column()));
        }
        if let Some(seconds) = failure.retry_after_seconds() {
            html.push_str(&format!("<p>The connector reported a retry delay of <span class=\"mono\">{seconds}</span> seconds.</p>"));
        }
        if let Some(bytes) = failure.bytes() {
            html.push_str(&format!("<p>Size: <span class=\"mono\">{}</span> bytes. Limit: <span class=\"mono\">{}</span> bytes.</p>", bytes.actual(), bytes.limit()));
        }
        if let Some(usage) = failure.usage() {
            let hard = usage
                .hard_limit()
                .map(|n| n.to_string())
                .unwrap_or_else(|| "unlimited".into());
            html.push_str(&format!("<p>Current usage: <span class=\"mono\">{}</span>. Projected usage: <span class=\"mono\">{}</span>. Soft limit: <span class=\"mono\">{}</span>. Hard limit: <span class=\"mono\">{hard}</span>.</p>", usage.current(), usage.projected(), usage.soft_limit()));
        }
        if matches!(operation, Op::Test | Op::ReplayTrace)
            && failure.outcome() != ExecutionOutcome::NotDispatched
        {
            html.push_str("<p>The tool may have run. Check execution logs and provider activity before running again.</p>");
        }
    }
    let toolkit = resource
        .filter(|_| matches!(operation, Op::Test | Op::TestForm | Op::Setup))
        .map(|id| format!("/app/connectors/{id}"));
    let settings = toolkit.as_ref().map(|path| format!("{path}?tab=settings"));
    let original = resource
        .filter(|_| operation == Op::ReplayTrace)
        .map(|id| format!("/app/logs/{id}"));
    let (link, label) = match failure.cause() {
        _ if fields => (
            toolkit.as_deref().unwrap_or("/app/connectors"),
            "Select the tool again",
        ),
        _ if operation == Op::Setup => (
            settings.as_deref().unwrap_or("/app/connections"),
            "Review connection setup",
        ),
        _ if operation == Op::TestConnection => ("/app/connections", "Review connections"),
        UsageLimited => ("/app/usage", "Review usage"),
        CredentialsUnavailable | ConnectionDisconnected | VerificationFailed => {
            ("/app/connections", "Review connections")
        }
        _ if operation == Op::ReplayTrace => (
            original.as_deref().unwrap_or("/app/logs"),
            "Review the original request",
        ),
        InvalidJson | InvalidActionInput | MissingSetupField | InputTooLarge => (
            toolkit.as_deref().unwrap_or("/app/connections"),
            "Review setup and input",
        ),
        _ => ("/app/logs", "Review execution logs"),
    };
    html.push_str(&recovery_link(link, label, false));
    if !fields {
        if let Some(id) = failure.request_id() {
            html.push_str(&format!(
                "<p>Request: <span class=\"mono\">{}</span>.</p>",
                escape(id)
            ));
            html.push_str(&recovery_link(
                &format!("/app/logs/{id}"),
                "Review this request",
                true,
            ));
        }
    }
    if let Some(original) = original.as_deref().filter(|original| *original != link) {
        html.push_str(&recovery_link(
            original,
            "Review the original request",
            true,
        ));
    }
    html
}

fn recovery_link(path: &str, label: &str, quiet: bool) -> String {
    use crate::ui::{Button, ButtonSize, ButtonTarget, ButtonVariant, LocalPath};
    let Some(path) = LocalPath::new(path) else {
        return String::new();
    };
    Button {
        target: ButtonTarget::Link(path),
        variant: if quiet {
            ButtonVariant::Quiet
        } else {
            ButtonVariant::Secondary
        },
        size: ButtonSize::Sm,
        ..Button::new(label)
    }
    .render()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn copy_direct_failures_local_usage_requires_current_nondispatch_evidence() {
        use crate::DashboardOperation as Op;

        let blocked = DashboardFailure::new(Error::Unavailable, FailureCause::UsageLimited)
            .with_outcome(ExecutionOutcome::NotDispatched)
            .with_local_usage_blocked(true);
        assert!(blocked.local_usage_blocked());
        let html = recovery(Op::Test, Some("mail"), &blocked);
        assert!(html.contains("Appcall blocked this run before dispatch because of a usage limit."));
        assert!(!html.contains("The tool may have run."));
        for outcome in [
            ExecutionOutcome::Unknown,
            ExecutionOutcome::ResponseReceived,
        ] {
            let failure = blocked.clone().with_outcome(outcome);
            assert!(!failure.local_usage_blocked());
            let html = recovery(Op::Test, Some("mail"), &failure);
            assert!(!html.contains("blocked this run before dispatch"));
            assert!(html.contains("Appcall reported a usage limit for this run."));
            assert!(html.contains("The tool may have run."));
        }
        let unmarked = DashboardFailure::new(Error::Unavailable, FailureCause::UsageLimited)
            .with_outcome(ExecutionOutcome::NotDispatched);
        assert!(!unmarked.local_usage_blocked());
        let html = recovery(Op::Test, Some("mail"), &unmarked);
        assert!(html.contains("Appcall reported a usage limit for this run."));
        assert!(!html.contains("blocked this run before dispatch"));
        assert!(!html.contains("The tool may have run."));
    }

    #[test]
    fn dashboard_failure_declared_setup_field_requires_bounded_manifest_evidence() {
        let field = DeclaredSetupField::from_authorized_manifest("api_key", "API key");
        assert_eq!(
            field.as_ref().map(|f| (f.key(), f.label())),
            Some(("api_key", "API key"))
        );
        let failure = DashboardFailure::new(Error::Invalid, FailureCause::MissingSetupField)
            .with_setup_field(field.clone());
        assert_eq!(failure.setup_field(), field.as_ref());
        for cause in [
            FailureCause::Unknown,
            FailureCause::Timeout,
            FailureCause::InvalidActionInput,
        ] {
            assert!(DashboardFailure::new(Error::Invalid, cause)
                .with_setup_field(field.clone())
                .setup_field()
                .is_none());
        }
        for (key, label) in [
            ("", "API key"),
            ("api/key", "API key"),
            ("api_key", ""),
            ("api_key", "<script>"),
            ("api_key", "Key\nsecret"),
        ] {
            assert!(DeclaredSetupField::from_authorized_manifest(key, label).is_none());
        }
        assert!(DeclaredSetupField::from_authorized_manifest(&"k".repeat(257), "Key").is_none());
        assert!(DeclaredSetupField::from_authorized_manifest("key", &"k".repeat(257)).is_none());
    }

    #[tokio::test]
    async fn dashboard_failure_legacy_execute_is_called_once_and_conservative() {
        use crate::{DashboardData, DashboardOperation, DashboardRequest};
        use std::sync::atomic::{AtomicUsize, Ordering};
        struct Legacy {
            calls: AtomicUsize,
            error: Error,
        }
        impl DashboardData for Legacy {
            fn execute(
                &self,
                _: DashboardRequest,
            ) -> std::pin::Pin<
                Box<dyn std::future::Future<Output = Result<serde_json::Value, Error>> + Send + '_>,
            > {
                self.calls.fetch_add(1, Ordering::SeqCst);
                Box::pin(async move { Err(self.error) })
            }
        }
        for error in [
            Error::Invalid,
            Error::Unauthorized,
            Error::Forbidden,
            Error::Unavailable,
            Error::Configuration,
        ] {
            let legacy = Legacy {
                calls: AtomicUsize::new(0),
                error,
            };
            let failure = legacy
                .execute_detailed(DashboardRequest {
                    principal: appcall_auth::Principal::project("project-test").unwrap(),
                    operation: DashboardOperation::Test,
                    resource: None,
                    account_id: None,
                    fields: Default::default(),
                    form_values: Default::default(),
                })
                .await
                .unwrap_err();
            assert_eq!(legacy.calls.load(Ordering::SeqCst), 1);
            assert_eq!(failure.classification(), error);
            assert_eq!(failure.cause(), FailureCause::Unknown);
            assert_eq!(failure.outcome(), ExecutionOutcome::Unknown);
            assert_eq!(failure.request_id(), None);
        }
    }

    #[test]
    fn dashboard_failure_numeric_metadata_is_validated_and_cause_specific() {
        assert_eq!(
            JsonPosition::new(1, 2).map(|p| (p.line(), p.column())),
            Some((1, 2))
        );
        assert_eq!(JsonPosition::new(0, 2), None);
        assert_eq!(JsonPosition::new(1, 0), None);
        assert_eq!(
            FailureBytes::new(11, 10).map(|b| (b.actual(), b.limit())),
            Some((11, 10))
        );
        for (actual, limit) in [(0, 0), (1, 0), (10, 10), (9, 10)] {
            assert_eq!(FailureBytes::new(actual, limit), None);
        }
        for values in [(-1, 1, 1, 1), (0, -1, 1, 1), (0, 1, -1, 1), (0, 1, 1, -1)] {
            assert_eq!(
                FailureUsage::new(values.0, values.1, values.2, values.3),
                None
            );
        }
        let unlimited = FailureUsage::new(0, 1, 20, 0).unwrap();
        assert_eq!(unlimited.hard_limit(), None);
        assert_eq!(unlimited.current(), 0);
        assert!(FailureUsage::new(1, 2, 20, 10).is_some());
        let failure = DashboardFailure::new(Error::Unavailable, FailureCause::Unknown)
            .with_json_position(JsonPosition::new(1, 2))
            .with_retry_after_seconds(Some(0))
            .with_usage(Some(unlimited))
            .with_bytes(FailureBytes::new(11, 10));
        assert_eq!(failure.json_position(), None);
        assert_eq!(failure.retry_after_seconds(), None);
        assert_eq!(failure.usage(), None);
        assert_eq!(failure.bytes(), None);
    }
}
