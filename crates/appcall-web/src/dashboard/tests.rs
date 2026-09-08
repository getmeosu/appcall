use super::*;
use serde_json::json;
use std::sync::Mutex;

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
    data: &Fixture,
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
fn location(response: &Response) -> Option<&str> {
    response
        .headers
        .iter()
        .find(|(k, _)| k == "Location")
        .map(|(_, v)| v.as_str())
}

#[tokio::test]
async fn catalog_filter_keeps_category_navigation_and_forwards_account_identity() {
    let data = fixture(json!({"data":{"connectors":[
        {"key":"mail","name":"Mail only","categories":["Messaging","Productivity"]},
        {"key":"drive","name":"Drive only","categories":["Files","Productivity"]}
    ]}}));
    let mut r = request("/app/toolkits");
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
        let mut r = request("/app/toolkits/mail/test");
        r.fields = fields;
        assert!(matches!(
            render(&data, &r, Some(DashboardOperation::Test)).await,
            Err(Error::Invalid)
        ));
    }
    for path in [
        "/app/toolkits/",
        "/app/toolkits/bad%2Fid",
        "/app/toolkits/<evil>",
    ] {
        assert!(matches!(
            render(&data, &request(path), Some(DashboardOperation::Toolkit)).await,
            Err(Error::Invalid)
        ));
    }
    assert!(data.requests.lock().unwrap().is_empty());
}

#[tokio::test]
async fn repeated_guided_pairs_are_preserved_without_scalar_ambiguity() {
    let data = fixture(json!({"ok":true}));
    let mut r = request("/app/toolkits/mail/test");
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
            "/app/auth-configs/c/test",
            json!({"data":{"lastTestStatus":"passed"}}),
            "/app/auth-configs?success=test-passed",
        ),
        (
            TestConnection,
            "/app/auth-configs/c/test",
            json!({"last_test_status":"passed"}),
            "/app/auth-configs?success=test-passed",
        ),
        (
            TestConnection,
            "/app/auth-configs/c/test",
            json!({"lastTest":"passed"}),
            "/app/auth-configs?success=test-passed",
        ),
        (
            TestConnection,
            "/app/auth-configs/c/test",
            json!({}),
            "/app/auth-configs?success=test-unverified",
        ),
        (
            DisconnectConnection,
            "/app/auth-configs/c/disconnect",
            json!({}),
            "/app/auth-configs?success=disconnected",
        ),
        (
            ReplayEvent,
            "/app/triggers/e/replay",
            json!({}),
            "/app/triggers?replayed=1",
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
            "/app/toolkits/mail/setup",
            json!({}),
            "/app/toolkits/mail?success=1",
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
    let path = request("/app/toolkits/mail/setup");
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
        (DashboardOperation::Triggers, "/app/triggers", "events"),
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
        assert!(response.body.contains("Load more"));
    }
}

#[tokio::test]
async fn fragment_and_stream_responses_have_correct_targets_and_content_type() {
    let mut r = request("/app/toolkits/mail/options");
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
        &request("/app/triggers/stream"),
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
            &request("/app/triggers/stream"),
            Some(DashboardOperation::Stream)
        )
        .await,
        Err(Error::Unavailable)
    ));
}

#[tokio::test]
async fn static_routes_skip_data_and_connection_banners_explain_outcome() {
    let data = fixture(json!({"connections":[]}));
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
            "Connection test passed successfully.",
        ),
        (
            "success",
            "test-unverified",
            "connection could not be verified",
        ),
        (
            "success",
            "disconnected",
            "Account disconnected successfully.",
        ),
        ("error", "test-failed", "Connection test failed."),
        (
            "error",
            "disconnect-failed",
            "Failed to disconnect the account.",
        ),
    ] {
        let mut r = request("/app/auth-configs");
        r.fields.insert(key.into(), vec![value.into()]);
        let response = render(&data, &r, Some(DashboardOperation::AuthConfigs))
            .await
            .unwrap();
        assert!(response.body.contains(message), "{message}");
        assert!(response.body.contains("role=\"status\""));
    }
}
