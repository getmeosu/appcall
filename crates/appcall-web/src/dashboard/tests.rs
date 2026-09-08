use super::*;
use serde_json::json;
use std::sync::Mutex;

#[path = "tests/logs_filter_tests.rs"]
mod logs_filter_tests;

#[path = "tests/trace_tests.rs"]
mod trace_tests;

struct DetailedFailureFixture {
    failure: crate::DashboardFailure,
    detailed_calls: std::sync::atomic::AtomicUsize,
    legacy_calls: std::sync::atomic::AtomicUsize,
}
impl DashboardData for DetailedFailureFixture {
    fn execute(
        &self,
        _: DashboardRequest,
    ) -> Pin<Box<dyn Future<Output = Result<Value, Error>> + Send + '_>> {
        self.legacy_calls
            .fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        Box::pin(async { Err(Error::Unavailable) })
    }
    fn execute_detailed(
        &self,
        _: DashboardRequest,
    ) -> Pin<Box<dyn Future<Output = Result<Value, crate::DashboardFailure>> + Send + '_>> {
        self.detailed_calls
            .fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        Box::pin(async { Err(self.failure.clone()) })
    }
}

#[tokio::test]
async fn copy_direct_failures_render_specific_recovery() {
    use crate::{
        DashboardFailure, DeclaredSetupField, FailureBytes, FailureCause as Cause, FailureUsage,
        JsonPosition,
    };
    use std::sync::atomic::{AtomicUsize, Ordering};
    let cases = [
        (
            Cause::InvalidJson,
            "The JSON input is not valid.",
            "/app/connectors/mail",
        ),
        (
            Cause::InvalidActionInput,
            "The input does not match this tool",
            "/app/connectors/mail",
        ),
        (Cause::MissingSetupField, "Add", "/app/connectors/mail"),
        (
            Cause::CredentialsUnavailable,
            "Appcall could not obtain credentials",
            "/app/connections",
        ),
        (
            Cause::ConnectionDisconnected,
            "This connection is disconnected.",
            "/app/connections",
        ),
        (Cause::Timeout, "This request timed out.", "/app/logs"),
        (
            Cause::RateLimited,
            "The connector reported a rate limit.",
            "/app/logs",
        ),
        (
            Cause::UsageLimited,
            "Appcall reported a usage limit",
            "/app/usage",
        ),
        (Cause::ResponseTooLarge, "Narrow", "/app/logs"),
        (Cause::InputTooLarge, "Reduce", "/app/connectors/mail"),
        (
            Cause::VerificationFailed,
            "Appcall could not verify this connection.",
            "/app/connections",
        ),
    ];
    for (cause, copy, recovery) in cases {
        for metadata in [false, true] {
            for request_id in ["current-request", "<script>private-request</script>"] {
                let mut failure =
                    DashboardFailure::new(Error::Unavailable, cause).with_request_id(request_id);
                if metadata {
                    failure = failure
                        .with_json_position(JsonPosition::new(2, 12))
                        .with_retry_after_seconds(Some(17))
                        .with_bytes(FailureBytes::new(2049, 1024))
                        .with_usage(FailureUsage::new(10, 11, 8, 0))
                        .with_setup_field(DeclaredSetupField::from_authorized_manifest(
                            "apiKey", "API key",
                        ));
                }
                let data = DetailedFailureFixture {
                    failure,
                    detailed_calls: AtomicUsize::new(0),
                    legacy_calls: AtomicUsize::new(0),
                };
                let mut r = request("/app/connectors/mail/test");
                for key in ["input_raw", "callerToken", "password"] {
                    r.fields
                        .insert(key.into(), vec!["private-submitted-value".into()]);
                }
                let response = render(&data, &r, Some(DashboardOperation::Test))
                    .await
                    .unwrap();
                assert_eq!(
                    data.detailed_calls.load(Ordering::SeqCst),
                    1,
                    "renderer must call detailed execution once"
                );
                assert_eq!(data.legacy_calls.load(Ordering::SeqCst), 0);
                assert_eq!(response.status, 200);
                assert!(response.body.contains("id=\"tk-test-result\""));
                assert!(response.body.contains("role=\"alert\""));
                assert!(response.body.contains(copy), "{cause:?}: {}", response.body);
                assert!(
                    response.body.contains(recovery),
                    "{cause:?}: missing recovery"
                );
                assert_eq!(
                    response.body.contains("/app/logs/current-request"),
                    request_id == "current-request"
                );
                for secret in [
                    "private-submitted-value",
                    "private-request",
                    "<script>",
                    "callerToken",
                    "password",
                ] {
                    assert!(!response.body.contains(secret), "leaked {secret}");
                }
                assert_eq!(
                    response.body.contains(
                        "Line <span class=\"mono\">2</span>, column <span class=\"mono\">12</span>"
                    ),
                    metadata && cause == Cause::InvalidJson
                );
                assert_eq!(
                    response
                        .body
                        .contains("retry delay of <span class=\"mono\">17</span> seconds"),
                    metadata && cause == Cause::RateLimited
                );
                assert_eq!(response.body.contains("Size: <span class=\"mono\">2049</span> bytes. Limit: <span class=\"mono\">1024</span> bytes"), metadata && matches!(cause, Cause::ResponseTooLarge | Cause::InputTooLarge));
                assert_eq!(response.body.contains("Current usage: <span class=\"mono\">10</span>. Projected usage: <span class=\"mono\">11</span>. Soft limit: <span class=\"mono\">8</span>. Hard limit: <span class=\"mono\">unlimited</span>"), metadata && cause == Cause::UsageLimited);
            }
        }
    }
    for (operation, path, original) in [
        (
            DashboardOperation::Setup,
            "/app/connectors/mail/setup",
            false,
        ),
        (
            DashboardOperation::TestConnection,
            "/app/connections/connection/test",
            false,
        ),
        (
            DashboardOperation::ReplayTrace,
            "/app/logs/original-request/replay",
            true,
        ),
    ] {
        let data = DetailedFailureFixture {
            failure: DashboardFailure::new(Error::Invalid, Cause::MissingSetupField)
                .with_setup_field(DeclaredSetupField::from_authorized_manifest(
                    "key",
                    "<script>private-label</script>",
                )),
            detailed_calls: AtomicUsize::new(0),
            legacy_calls: AtomicUsize::new(0),
        };
        let response = render(&data, &request(path), Some(operation))
            .await
            .expect("direct failure must render in the shell");
        assert_eq!(response.status, 400);
        assert!(response
            .headers
            .iter()
            .any(|(key, value)| key == "Cache-Control" && value == "no-store"));
        assert!(response
            .headers
            .iter()
            .any(|(key, value)| key == "Referrer-Policy" && value == "no-referrer"));
        assert!(response.body.contains("role=\"alert\""));
        assert!(
            response.body.contains("<!DOCTYPE html>") || response.body.contains("<!doctype html>")
        );
        assert!(!response.headers.iter().any(|(key, _)| key == "Location"));
        assert!(!response.body.contains("private-label"));
        if operation == DashboardOperation::Setup {
            assert!(response
                .body
                .contains("href=\"/app/connectors/mail?tab=settings\""));
        }
        assert_eq!(data.detailed_calls.load(Ordering::SeqCst), 1);
        assert_eq!(data.legacy_calls.load(Ordering::SeqCst), 0);
        if original {
            assert!(response.body.contains("/app/logs/original-request"));
            assert!(response.body.contains("original request"));
            assert!(!response.body.contains("replayed=1"));
        }
    }
}

#[tokio::test]
async fn copy_direct_failures_keep_access_fields_and_replay_context() {
    use crate::{DashboardFailure, ExecutionOutcome, FailureCause as Cause};
    use std::sync::atomic::{AtomicUsize, Ordering};
    let fixture = |failure| DetailedFailureFixture {
        failure,
        detailed_calls: AtomicUsize::new(0),
        legacy_calls: AtomicUsize::new(0),
    };
    for (cause, primary) in [
        (Cause::UsageLimited, "/app/usage"),
        (Cause::CredentialsUnavailable, "/app/connections"),
        (Cause::ConnectionDisconnected, "/app/connections"),
        (Cause::InvalidActionInput, "/app/logs/original"),
        (Cause::InputTooLarge, "/app/logs/original"),
        (Cause::Unknown, "/app/logs/original"),
    ] {
        let data =
            fixture(DashboardFailure::new(Error::Unavailable, cause).with_request_id("current"));
        let response = render(
            &data,
            &request("/app/logs/original/replay"),
            Some(DashboardOperation::ReplayTrace),
        )
        .await
        .unwrap();
        assert!(response.body.contains(&format!(
            "class=\"ui-button ui-button-secondary ui-button-sm\" href=\"{primary}\""
        )));
        assert_eq!(
            response.body.matches("href=\"/app/logs/original\"").count(),
            1
        );
        assert_eq!(response.body.matches("ui-button-secondary").count(), 1);
        assert!(response.body.contains(
            "class=\"ui-button ui-button-quiet ui-button-sm\" href=\"/app/logs/current\""
        ));
        if primary != "/app/logs/original" {
            assert!(response.body.contains(
                "class=\"ui-button ui-button-quiet ui-button-sm\" href=\"/app/logs/original\""
            ));
        }
    }
    for classification in [Error::Unauthorized, Error::Forbidden] {
        for (operation, path) in [
            (DashboardOperation::Setup, "/app/connectors/mail/setup"),
            (
                DashboardOperation::TestConnection,
                "/app/connections/connection/test",
            ),
            (DashboardOperation::ReplayTrace, "/app/logs/original/replay"),
        ] {
            let data = fixture(DashboardFailure::new(classification, Cause::Timeout));
            assert!(
                matches!(render(&data, &request(path), Some(operation)).await, Err(e) if e == classification)
            );
            assert_eq!(data.detailed_calls.load(Ordering::SeqCst), 1);
        }
        let data = fixture(
            DashboardFailure::new(classification, Cause::Timeout).with_request_id("private-id"),
        );
        let response = render(
            &data,
            &request("/app/connectors/mail/test"),
            Some(DashboardOperation::Test),
        )
        .await
        .unwrap();
        let expected = if classification == Error::Unauthorized {
            "Sign in again"
        } else {
            "Check project access"
        };
        assert!(response.body.contains(expected));
        assert!(!response.body.contains("private-id"));
        assert!(!response.body.contains("timed out"));
    }
    for outcome in [
        ExecutionOutcome::Unknown,
        ExecutionOutcome::ResponseReceived,
        ExecutionOutcome::NotDispatched,
    ] {
        let data = fixture(
            DashboardFailure::new(Error::Unavailable, Cause::Timeout)
                .with_outcome(outcome)
                .with_request_id("current"),
        );
        let response = render(
            &data,
            &request("/app/connectors/mail/test-form"),
            Some(DashboardOperation::TestForm),
        )
        .await
        .unwrap();
        assert!(response.body.contains("id=\"tk-test-fields\""));
        assert!(response.body.contains("data-fields-valid=\"false\""));
        assert!(!response.body.contains("name=\"f."));
        assert!(!response.body.contains("tool may have run"));
        assert!(!response.body.contains("/app/logs/current"));
        assert!(response.body.contains("could not load the fields"));
        let response = render(
            &data,
            &request("/app/logs/original/replay"),
            Some(DashboardOperation::ReplayTrace),
        )
        .await
        .unwrap();
        assert_eq!(response.status, 503);
        assert!(response
            .headers
            .iter()
            .any(|(key, value)| key == "Cache-Control" && value == "no-store"));
        assert!(response
            .headers
            .iter()
            .any(|(key, value)| key == "Referrer-Policy" && value == "no-referrer"));
        assert!(response.body.contains("timed out"));
        assert!(!response.body.contains("did not receive a response"));
        assert!(response.body.contains("/app/logs/current"));
        assert!(response.body.contains("/app/logs/original"));
        assert!(response.body.contains(
            "class=\"ui-button ui-button-secondary ui-button-sm\" href=\"/app/logs/original\""
        ));
        assert!(response.body.contains(
            "class=\"ui-button ui-button-quiet ui-button-sm\" href=\"/app/logs/current\""
        ));
        assert_eq!(response.body.matches("ui-button-secondary").count(), 1);
        assert!(!response.body.contains(
            "class=\"ui-button ui-button-secondary ui-button-sm\" href=\"/app/connections\""
        ));
        assert_eq!(
            response.body.contains("The tool may have run."),
            outcome != ExecutionOutcome::NotDispatched
        );
        assert!(!response.headers.iter().any(|(k, _)| k == "Location"));
    }
    let data = fixture(DashboardFailure::new(Error::Unavailable, Cause::Timeout));
    let response = render(
        &data,
        &request("/app/connections/connection/test"),
        Some(DashboardOperation::TestConnection),
    )
    .await
    .unwrap();
    assert_eq!(response.status, 503);
    assert!(response.body.contains("timed out"));
    assert!(!response.body.contains("tool may have run"));
    let data = fixture(DashboardFailure::new(Error::Configuration, Cause::Unknown));
    let response = render(
        &data,
        &request("/app/connectors/mail/test"),
        Some(DashboardOperation::Test),
    )
    .await
    .unwrap();
    assert!(response
        .body
        .contains("Ask the operator to check server configuration"));
}

#[tokio::test]
async fn copy_direct_failures_handle_preserves_csrf_identity_and_session_cookie() {
    struct Membership;
    impl appcall_auth::MembershipVerifier for Membership {
        fn verify_membership(
            &self,
            claims: &appcall_auth::AccessClaims,
            tenant: &str,
            hash: &str,
        ) -> Result<Option<appcall_auth::Membership>, appcall_auth::AuthError> {
            assert!(!hash.is_empty());
            Ok(
                (tenant == "tenant-a" && claims.user_id == "11111111-1111-1111-1111-111111111111")
                    .then(|| appcall_auth::Membership {
                        tenant_id: tenant.into(),
                        allowed_brands: appcall_auth::Grant::All,
                        scopes: appcall_auth::Grant::All,
                    }),
            )
        }
    }
    struct Data(Mutex<Vec<Principal>>);
    impl DashboardData for Data {
        fn execute(
            &self,
            _: DashboardRequest,
        ) -> Pin<Box<dyn Future<Output = Result<Value, Error>> + Send + '_>> {
            panic!("rich failure must not call legacy execution")
        }
        fn execute_detailed(
            &self,
            request: DashboardRequest,
        ) -> Pin<Box<dyn Future<Output = Result<Value, crate::DashboardFailure>> + Send + '_>>
        {
            self.0.lock().unwrap().push(request.principal);
            Box::pin(async {
                Err(crate::DashboardFailure::new(
                    Error::Unavailable,
                    crate::FailureCause::VerificationFailed,
                ))
            })
        }
    }
    let golden: Value = serde_json::from_str(include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../appcall-auth/tests/go_golden.json"
    )))
    .unwrap();
    let codec = SessionCodec::new("synthetic-copy-session", false).unwrap();
    let jwt =
        appcall_auth::JwtVerifier::new(golden["jwt_secret"].as_str().unwrap(), Default::default())
            .unwrap();
    let broker = Broker::new("http://127.0.0.1:1", "appcall").unwrap();
    let browser = Browser {
        codec: &codec,
        identity: Identity {
            jwt: &jwt,
            memberships: &Membership,
            broker: &broker,
        },
        public_origin: "https://app.example",
    };
    for (path, status, message) in [
        (
            "/app/connections/connection/test",
            503,
            "Appcall could not verify this connection.",
        ),
        (
            "/app/connectors/request",
            200,
            "Appcall could not confirm receipt of this connector request.",
        ),
    ] {
        let data = Data(Mutex::new(vec![]));
        let dashboard = Dashboard {
            browser: &browser,
            data: &data,
        };
        let session = Session {
            access_token: golden["jwt"].as_str().unwrap().into(),
            refresh_token: "private-refresh".into(),
            user_id: "11111111-1111-1111-1111-111111111111".into(),
            tenant_id: "tenant-a".into(),
            tenant_name: "A".into(),
            email: "safe@example.invalid".into(),
        };
        let cookies = format!("appcall_session={}", codec.seal_session(&session).unwrap());
        let mut request = Request {
            method: "POST",
            path,
            cookies: &cookies,
            origin: Some("https://evil.example"),
            referer: None,
            fields: BTreeMap::from([
                ("projectId".into(), vec!["forged-project".into()]),
                ("userId".into(), vec!["forged-user".into()]),
            ]),
            now: 1800000000,
        };
        assert_eq!(dashboard.handle(&request).await.unwrap().status, 403);
        assert!(data.0.lock().unwrap().is_empty());
        request.origin = Some("https://app.example");
        request.cookies = "";
        assert_eq!(dashboard.handle(&request).await.unwrap().status, 302);
        assert!(data.0.lock().unwrap().is_empty());
        request.cookies = &cookies;
        let response = dashboard.handle(&request).await.unwrap();
        assert_eq!(response.status, status);
        assert!(response.body.contains(message));
        let seen = data.0.lock().unwrap();
        assert_eq!(seen.len(), 1);
        assert_eq!(seen[0].project_id, "proj_tenant-a");
        assert_eq!(seen[0].user_id.as_deref(), Some(session.user_id.as_str()));
        let cookie = &response
            .headers
            .iter()
            .find(|(key, _)| key == "Set-Cookie")
            .unwrap()
            .1;
        let sealed = cookie
            .strip_prefix("appcall_session=")
            .unwrap()
            .split(';')
            .next()
            .unwrap();
        assert_eq!(codec.open_session(sealed).unwrap(), session);
        for private in ["private-refresh", "forged-project", "forged-user"] {
            assert!(!response.body.contains(private));
        }
    }
}

struct Fixture {
    value: Value,
    requests: Mutex<Vec<DashboardRequest>>,
}
impl DashboardData for Fixture {
    fn execute(
        &self,
        request: DashboardRequest,
    ) -> Pin<Box<dyn Future<Output = Result<Value, Error>> + Send + '_>> {
        self.requests.lock().unwrap().push(request);
        Box::pin(async { Ok(self.value.clone()) })
    }
}
fn fixture(value: Value) -> Fixture {
    Fixture {
        value,
        requests: Mutex::new(Vec::new()),
    }
}
fn request(path: &str) -> Request<'_> {
    Request {
        method: "GET",
        path,
        cookies: "",
        origin: None,
        referer: None,
        fields: BTreeMap::new(),
        now: 100,
    }
}
async fn render(
    data: &dyn DashboardData,
    r: &Request<'_>,
    operation: Option<DashboardOperation>,
) -> Result<Response, Error> {
    let session = Session {
        access_token: String::new(),
        refresh_token: String::new(),
        user_id: "user".into(),
        email: "user@example.test".into(),
        tenant_id: "tenant".into(),
        tenant_name: "Tenant".into(),
    };
    DashboardRenderer { data }
        .render(
            r,
            operation,
            &session,
            Principal::project("project").unwrap(),
        )
        .await
}

struct Failing(Error);
impl DashboardData for Failing {
    fn execute(
        &self,
        _: DashboardRequest,
    ) -> Pin<Box<dyn Future<Output = Result<Value, Error>> + Send + '_>> {
        Box::pin(async { Err(self.0) })
    }
}

#[tokio::test]
async fn toolkit_operation_failures_replace_their_live_region_without_fake_results() {
    for error in [
        Error::Invalid,
        Error::Unauthorized,
        Error::Forbidden,
        Error::Unavailable,
        Error::Configuration,
    ] {
        for (operation, path, target, label) in [
            (
                DashboardOperation::Test,
                "/app/connectors/mail/test",
                "tk-test-result",
                "tk-result-label",
            ),
            (
                DashboardOperation::TestForm,
                "/app/connectors/mail/test-form",
                "tk-test-fields",
                "tk-fields-label",
            ),
        ] {
            let response = render(&Failing(error), &request(path), Some(operation))
                .await
                .expect("operation failures need an accessible fragment, not a lost HTTP error");
            assert_eq!(response.status, 200);
            assert!(response
                .headers
                .iter()
                .any(|(k, v)| k == "Content-Type" && v == "text/event-stream"));
            for expected in [
                format!("id=\"{target}\""),
                format!("aria-labelledby=\"{label}\""),
                "aria-live=\"polite\"".into(),
                "aria-busy=\"false\"".into(),
                "role=\"alert\"".into(),
            ] {
                assert!(
                    response.body.contains(&expected),
                    "{operation:?} {error:?}: {expected}"
                );
            }
            assert!(!response.body.contains("Succeeded"));
            assert!(!response.body.contains("/app/logs/"));
            if operation == DashboardOperation::TestForm {
                assert!(response.body.contains("data-fields-valid=\"false\""));
                assert!(!response.body.contains("name=\"f."));
                assert!(
                    !response.body.contains("tool may have run"),
                    "loading a schema cannot execute the tool"
                );
            }
        }
    }
    assert!(matches!(
        render(
            &Failing(Error::Forbidden),
            &request("/app/logs"),
            Some(DashboardOperation::Logs)
        )
        .await,
        Err(Error::Forbidden)
    ));
}
fn location(response: &Response) -> Option<&str> {
    response
        .headers
        .iter()
        .find(|(k, _)| k == "Location")
        .map(|(_, v)| v.as_str())
}

#[tokio::test]
async fn toolkit_tab_request_is_allowlisted_for_wrapped_and_unwrapped_dtos() {
    for wrapped in [false, true] {
        for (requested, selected) in [
            ("tools", "tools"),
            ("accounts", "accounts"),
            ("events", "events"),
            ("code", "code"),
            ("settings", "settings"),
            ("<unknown>", "tools"),
            ("", "tools"),
        ] {
            let dto = json!({"name":"Provider","operations":[],"tab":"settings"});
            let data = fixture(if wrapped { json!({"data":dto}) } else { dto });
            let mut r = request("/app/connectors/provider");
            r.fields.insert("tab".into(), vec![requested.into()]);
            let response = render(&data, &r, Some(DashboardOperation::Connector))
                .await
                .unwrap();
            assert_eq!(response.status, 200);
            for (tab, label) in [
                ("tools", "Tools"),
                ("accounts", "Accounts"),
                ("events", "Events"),
                ("code", "Code"),
                ("settings", "Settings"),
            ] {
                let expected = format!(
                    "id=\"tk-panel-{tab}\" class=\"tk-panel\" aria-label=\"{label}\"{}>",
                    if tab == selected { "" } else { " hidden" }
                );
                assert!(
                    response.body.contains(&expected),
                    "wrapped={wrapped}, requested={requested}: {expected}"
                );
            }
            let calls = data.requests.lock().unwrap();
            assert_eq!(calls.len(), 1);
            assert_eq!(calls[0].operation, DashboardOperation::Connector);
            assert_eq!(calls[0].resource.as_deref(), Some("provider"));
        }
    }
}

#[tokio::test]
async fn catalog_filter_keeps_category_navigation_and_forwards_account_identity() {
    let data = fixture(json!({"data":{"connectors":[
        {"key":"mail","name":"Mail only","categories":["Messaging","Productivity"]},
        {"key":"drive","name":"Drive only","categories":["Files","Productivity"]}
    ]}}));
    let mut r = request("/app/connectors");
    r.fields.insert("category".into(), vec!["Messaging".into()]);
    r.fields
        .insert("externalAccountId".into(), vec!["customer-1".into()]);
    let response = render(&data, &r, Some(DashboardOperation::Catalog))
        .await
        .unwrap();
    assert_eq!(response.status, 200);
    assert!(response.body.contains("Mail only"));
    assert!(!response.body.contains("Drive only"));
    assert!(response.body.contains("category=Files"));
    let calls = data.requests.lock().unwrap();
    assert_eq!(calls.len(), 1);
    assert_eq!(calls[0].account_id.as_deref(), Some("customer-1"));
    assert_eq!(calls[0].principal.project_id, "project");
    assert_eq!(calls[0].resource, None);
    assert_eq!(calls[0].fields["category"], "Messaging");
}

#[tokio::test]
async fn invalid_fields_and_resource_ids_fail_before_data_execution() {
    let data = fixture(json!({}));
    for fields in [
        BTreeMap::from([("action".into(), vec!["a".into(), "b".into()])]),
        BTreeMap::from([("f.headers.key".into(), vec!["a".into(); 65])]),
        BTreeMap::from([("f.headers.val".into(), vec!["x".repeat(16385), "b".into()])]),
        (0..65)
            .map(|i| (format!("field{i}"), vec!["v".into()]))
            .collect(),
    ] {
        let mut r = request("/app/connectors/mail/test");
        r.fields = fields;
        assert!(matches!(
            render(&data, &r, Some(DashboardOperation::Test)).await,
            Err(Error::Invalid)
        ));
    }
    for path in [
        "/app/connectors/",
        "/app/connectors/bad%2Fid",
        "/app/connectors/<evil>",
    ] {
        assert!(matches!(
            render(&data, &request(path), Some(DashboardOperation::Connector)).await,
            Err(Error::Invalid)
        ));
    }
    assert!(data.requests.lock().unwrap().is_empty());
}

#[tokio::test]
async fn repeated_guided_pairs_are_preserved_without_scalar_ambiguity() {
    let data = fixture(json!({"ok":true}));
    let mut r = request("/app/connectors/mail/test");
    r.fields = BTreeMap::from([
        (
            "f.headers.key".into(),
            vec!["first".into(), "second".into()],
        ),
        ("f.headers.val".into(), vec!["one".into(), "two".into()]),
    ]);
    let response = render(&data, &r, Some(DashboardOperation::Test))
        .await
        .unwrap();
    assert!(response.body.contains("event: datastar-patch-elements"));
    assert!(response.body.contains("tk-test-result"));
    let calls = data.requests.lock().unwrap();
    assert_eq!(calls[0].form_values, r.fields);
    assert!(calls[0].fields.is_empty());
    assert_eq!(calls[0].resource.as_deref(), Some("mail"));
}

#[tokio::test]
async fn action_redirects_distinguish_verified_and_unverified_connections() {
    use DashboardOperation::*;
    for (op, path, value, target) in [
        (
            TestConnection,
            "/app/connections/c/test",
            json!({"data":{"lastTestStatus":"passed"}}),
            "/app/connections?success=test-passed",
        ),
        (
            TestConnection,
            "/app/connections/c/test",
            json!({"last_test_status":"passed"}),
            "/app/connections?success=test-passed",
        ),
        (
            TestConnection,
            "/app/connections/c/test",
            json!({"lastTest":"passed"}),
            "/app/connections?success=test-passed",
        ),
        (
            TestConnection,
            "/app/connections/c/test",
            json!({}),
            "/app/connections?success=test-unverified",
        ),
        (
            DisconnectConnection,
            "/app/connections/c/disconnect",
            json!({}),
            "/app/connections?success=disconnected",
        ),
        (
            ReplayEvent,
            "/app/events/e/replay",
            json!({}),
            "/app/events?replayed=1",
        ),
        (
            ReplayTrace,
            "/app/logs/r/replay",
            json!({}),
            "/app/logs/r?replayed=1",
        ),
        (
            SaveBranding,
            "/app/settings/white-labeling",
            json!({}),
            "/app/settings/white-labeling?saved=1",
        ),
        (
            Setup,
            "/app/connectors/mail/setup",
            json!({}),
            "/app/connectors/mail?success=1",
        ),
    ] {
        let response = render(&fixture(value), &request(path), Some(op))
            .await
            .unwrap();
        assert_eq!(response.status, 302);
        assert_eq!(location(&response), Some(target));
    }
}

#[tokio::test]
async fn setup_redirect_rejects_credentials_and_untrusted_local_urls() {
    let path = request("/app/connectors/mail/setup");
    for url in [
        "http://provider.test/oauth",
        "https://user:pass@provider.test/oauth",
        "/oauth/local/authorize?connector=mail&connectionId=c",
        "javascript:alert(1)",
    ] {
        assert!(
            matches!(
                render(
                    &fixture(json!({"redirectUrl":url})),
                    &path,
                    Some(DashboardOperation::Setup)
                )
                .await,
                Err(Error::Invalid)
            ),
            "{url}"
        );
    }
    for value in [
        json!({"redirectUrl":"https://provider.test/oauth?state=nonce"}),
        json!({"developmentOAuth":true,"redirectUrl":"/oauth/local/authorize?connector=mail&connectionId=c"}),
    ] {
        let response = render(
            &fixture(value.clone()),
            &path,
            Some(DashboardOperation::Setup),
        )
        .await
        .unwrap();
        assert_eq!(location(&response), value["redirectUrl"].as_str());
    }
}

#[tokio::test]
async fn pagination_retains_supported_filters_and_encodes_cursor() {
    for (op, path, key) in [
        (DashboardOperation::Logs, "/app/logs", "logs"),
        (DashboardOperation::Events, "/app/events", "events"),
    ] {
        let data = fixture(json!({"data":{key:[],"pagination":{"nextCursor":"a+b&c"}}}));
        let mut r = request(path);
        for (key, value) in [
            ("status", "failed"),
            ("connector", "mail"),
            ("action", "send"),
            ("connectionId", "c"),
        ] {
            r.fields.insert(key.into(), vec![value.into()]);
        }
        let response = render(&data, &r, Some(op)).await.unwrap();
        assert!(response.body.contains("status=failed&amp;connector=mail&amp;action=send&amp;connectionId=c&amp;cursor=a%2Bb%26c"));
        assert!(response.body.contains("Next page"));
    }
}

#[tokio::test]
async fn fragment_and_stream_responses_have_correct_targets_and_content_type() {
    let mut r = request("/app/connectors/mail/options");
    r.fields.insert("fieldName".into(), vec!["f.actor".into()]);
    r.fields.insert("detailSource".into(), vec!["actor".into()]);
    let options = render(
        &fixture(json!({"data":{"options":[{"id":"one","name":"One"}]}})),
        &r,
        Some(DashboardOperation::Options),
    )
    .await
    .unwrap();
    assert!(options.body.contains("tk-opts-f.actor"));
    assert!(options.body.contains("data-key=\"mail\""));
    assert!(options
        .headers
        .iter()
        .any(|(k, v)| k == "Content-Type" && v == "text/event-stream"));
    let stream = render(
        &fixture(json!({"events":[{"id":"e1","connector":"<evil>"}]})),
        &request("/app/events/stream"),
        Some(DashboardOperation::Stream),
    )
    .await
    .unwrap();
    assert!(stream.body.contains("data: selector #trigger-rows"));
    assert!(stream.body.contains("data: mode prepend"));
    assert!(stream.body.contains("&lt;evil&gt;"));
    assert!(matches!(
        render(
            &fixture(json!({})),
            &request("/app/events/stream"),
            Some(DashboardOperation::Stream)
        )
        .await,
        Err(Error::Unavailable)
    ));
}

#[tokio::test]
async fn copy_query_hints_do_not_confirm_mutations_or_invent_connection_causes() {
    let data = fixture(
        json!({"connections":[{"id":"conn_1","connector":"mail","status":"active","lastTest":"passed"}]}),
    );
    for (path, title) in [("/app/docs", "Documentation"), ("/app/support", "Support")] {
        let response = render(&data, &request(path), None).await.unwrap();
        assert_eq!(response.status, 200);
        assert!(response.body.contains(title));
    }
    assert!(data.requests.lock().unwrap().is_empty());
    for (key, value, message) in [
        (
            "success",
            "test-passed",
            "Review the connection&#39;s recorded check result below.",
        ),
        (
            "success",
            "test-unverified",
            "Review the connection&#39;s recorded check result below.",
        ),
        (
            "success",
            "disconnected",
            "Check the connection&#39;s current status before running another tool.",
        ),
        (
            "error",
            "test-failed",
            "Review the connection setup and its recorded status.",
        ),
        (
            "error",
            "disconnect-failed",
            "Check the connection&#39;s current status before running another tool.",
        ),
    ] {
        let mut r = request("/app/connections");
        r.fields.insert(key.into(), vec![value.into()]);
        let response = render(&data, &r, Some(DashboardOperation::Connections))
            .await
            .unwrap();
        assert!(response.body.contains(message), "{message}");
        for invented in [
            "successfully",
            "credential is supplied per call",
            "Connector is reachable",
            "Check credentials",
            "Failed to disconnect",
            "Connection test failed.",
        ] {
            assert!(!response.body.contains(invented));
        }
        assert!(response.body.contains(if key == "error" {
            "role=\"alert\""
        } else {
            "role=\"status\""
        }));
    }
    let mut r = request("/app/settings/white-labeling");
    r.fields.insert("saved".into(), vec!["1".into()]);
    let response = render(&fixture(json!({})), &r, Some(DashboardOperation::Branding))
        .await
        .unwrap();
    assert!(response
        .body
        .contains("Review the current branding settings below."));
    assert!(!response.body.contains("Branding saved."));
    let mut r = request("/app/connections");
    r.fields
        .insert("success".into(), vec!["test-passed".into()]);
    let response = render(
        &fixture(json!({"connections":[]})),
        &r,
        Some(DashboardOperation::Connections),
    )
    .await
    .unwrap();
    assert!(!response.body.contains("recorded check result below"));
    r.fields.insert("success".into(), vec!["unknown".into()]);
    let response = render(&data, &r, Some(DashboardOperation::Connections))
        .await
        .unwrap();
    assert!(!response.body.contains("recorded check result below"));
}
