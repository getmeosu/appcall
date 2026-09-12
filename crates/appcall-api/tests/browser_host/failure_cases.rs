use appcall_web::{DashboardData, DashboardOperation as Op, DashboardRequest, Error, FailureCause};
use serde_json::{json, Value};

pub struct TransportServer {
    pub endpoint: String,
    stop: std::sync::Arc<std::sync::atomic::AtomicBool>,
    thread: Option<std::thread::JoinHandle<()>>,
    pub calls: std::sync::Arc<std::sync::atomic::AtomicUsize>,
}
impl TransportServer {
    pub fn new() -> Self {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let endpoint = format!("http://{}", listener.local_addr().unwrap());
        listener.set_nonblocking(true).unwrap();
        let stop = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let stopped = stop.clone();
        let calls = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let called = calls.clone();
        let thread = std::thread::spawn(move || {
            let deadline = std::time::Instant::now() + std::time::Duration::from_secs(30);
            while !stopped.load(std::sync::atomic::Ordering::SeqCst)
                && std::time::Instant::now() < deadline
            {
                match listener.accept() {
                    Ok((stream, _)) => {
                        called.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                        drop(stream);
                    }
                    Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                        std::thread::sleep(std::time::Duration::from_millis(5))
                    }
                    Err(e) => panic!("transport fixture: {e}"),
                }
            }
        });
        Self {
            endpoint,
            stop,
            thread: Some(thread),
            calls,
        }
    }
}
impl Drop for TransportServer {
    fn drop(&mut self) {
        self.stop.store(true, std::sync::atomic::Ordering::SeqCst);
        if let Some(thread) = self.thread.take() {
            thread.join().unwrap();
        }
    }
}

pub fn manifest() -> Value {
    json!({"key":"test","name":"Test","version":"1","runtime":"bun","models":["item"],
        "auth":{"type":"api_key","setup":{"mode":"api_key","fields":[{"key":"apiKey","label":"API key","required":true,"secret":true}]}},
        "network":{"egress":"none"},"operations":{"write":{"kind":"action","timeoutMs":1000,"maxInputBytes":1024,"maxResponseBytes":1024,"description":"Synthetic write","sideEffect":"write","inputSchema":{"type":"object","required":["count"],"properties":{"count":{"type":"integer"}}}}}})
}

pub fn extra_manifests() -> Vec<Value> {
    let mut routed = manifest();
    routed["key"] = json!("routed");
    routed["auth"]["setup"] = json!({"mode":"api_key","fields":[{"key":"routeKey","label":"Base label must not appear","required":true}],"routes":[
        {"id":"first","label":"First","fields":[{"key":"routeKey","label":"First API key","required":true,"secret":true}]},
        {"id":"second","label":"Second","fields":[{"key":"routeKey","label":"Second API key","required":true,"secret":true}]},
        {"id":"html","label":"HTML","fields":[{"key":"routeKey","label":"<script>private-declaration</script>","required":true,"secret":true}]}
    ]});
    let mut oauth = manifest();
    oauth["key"] = json!("copy-oauth");
    oauth["auth"] = json!({"type":"oauth2","setup":{"mode":"oauth2","fields":[]},"oauth":{"authorizeUrl":"https://example.invalid/authorize","tokenUrl":"https://example.invalid/token","pkce":false,"supportsRefresh":false}});
    oauth["network"] = json!({"allowedHosts":["example.invalid"]});
    let mut check = manifest();
    check["key"] = json!("copy-check-toolkit");
    vec![routed, oauth, check]
}

// Both callers construct actual backend services; only the expectations are shared.
pub async fn assert_failures(data: &dyn DashboardData, principal: appcall_auth::Principal) {
    assert_setup_failure(data, principal.clone()).await;
    assert_input_failures(data, principal).await;
}

pub async fn assert_setup_failure(data: &dyn DashboardData, principal: appcall_auth::Principal) {
    let request = |operation, fields: &[(&str, &str)]| DashboardRequest {
        principal: principal.clone(),
        operation,
        resource: Some("test".into()),
        account_id: Some("brand".into()),
        fields: fields
            .iter()
            .map(|(k, v)| ((*k).into(), (*v).into()))
            .collect(),
        form_values: Default::default(),
    };
    let missing = data
        .execute_detailed(request(Op::Setup, &[]))
        .await
        .unwrap_err();
    assert_eq!(missing.classification(), Error::Invalid);
    assert_eq!(
        missing.cause(),
        FailureCause::MissingSetupField,
        "direct setup must retain the missing-field cause"
    );
    assert_eq!(
        missing.setup_field().map(|f| (f.key(), f.label())),
        Some(("apiKey", "API key"))
    );
    assert_eq!(
        data.execute(request(Op::Setup, &[])).await.unwrap_err(),
        Error::Invalid
    );
}

pub async fn assert_input_failures(data: &dyn DashboardData, principal: appcall_auth::Principal) {
    let request = |operation, fields: &[(&str, &str)]| DashboardRequest {
        principal: principal.clone(),
        operation,
        resource: Some("test".into()),
        account_id: Some("brand".into()),
        fields: fields
            .iter()
            .map(|(k, v)| ((*k).into(), (*v).into()))
            .collect(),
        form_values: Default::default(),
    };
    let malformed = "{\n  \"count\": ]}";
    let parser = serde_json::from_str::<Value>(malformed).unwrap_err();
    assert!(parser.line() > 0 && parser.column() > 0);
    for input in ["input", "input_raw"] {
        let fields = [
            ("connectionId", "copy-connection"),
            ("action", "write"),
            (input, malformed),
        ];
        let failure = data
            .execute_detailed(request(Op::Test, &fields))
            .await
            .unwrap_err();
        assert_eq!(failure.classification(), Error::Invalid);
        assert_eq!(failure.cause(), FailureCause::InvalidJson);
        assert_eq!(
            failure.json_position().map(|p| (p.line(), p.column())),
            Some((parser.line(), parser.column()))
        );
        assert!(!format!("{failure:?}").contains(malformed));
        assert_eq!(
            data.execute(request(Op::Test, &fields)).await.unwrap_err(),
            Error::Invalid
        );
    }
    let fields = [
        ("connectionId", "copy-connection"),
        ("action", "write"),
        ("input", "{}"),
        ("input_raw", malformed),
    ];
    assert_eq!(
        data.execute_detailed(request(Op::Test, &fields))
            .await
            .unwrap_err()
            .cause(),
        FailureCause::InvalidJson
    );
    let mut guided = request(
        Op::Test,
        &[("connectionId", "copy-connection"), ("action", "write")],
    );
    guided.form_values.insert(
        "f.count".into(),
        vec!["1".into(), "private-duplicate-value".into()],
    );
    let failure = data.execute_detailed(guided).await.unwrap_err();
    assert_eq!(failure.classification(), Error::Invalid);
    assert_eq!(failure.cause(), FailureCause::InvalidActionInput);
    assert!(failure.json_position().is_none());
    assert!(!format!("{failure:?}").contains("private-duplicate-value"));
    let invalid_schema = request(
        Op::Test,
        &[
            ("connectionId", "copy-connection"),
            ("action", "write"),
            ("runInputSchema", "{private-schema"),
        ],
    );
    let failure = data.execute_detailed(invalid_schema).await.unwrap_err();
    assert_eq!(failure.classification(), Error::Invalid);
    assert_eq!(failure.cause(), FailureCause::InvalidActionInput);
    assert!(
        failure.json_position().is_none(),
        "invalid schema is not malformed tool JSON"
    );
    let mut omitted_number = request(
        Op::Test,
        &[("connectionId", "copy-connection"), ("action", "write")],
    );
    omitted_number
        .form_values
        .insert("f.count".into(), vec!["private-invalid-integer".into()]);
    let failure = data.execute_detailed(omitted_number).await.unwrap_err();
    assert_eq!(
        failure.classification(),
        Error::Invalid,
        "malformed nonempty numeric input is rejected before backend dispatch: {failure:?}"
    );
    assert_eq!(failure.cause(), FailureCause::InvalidActionInput);
    assert_eq!(
        failure.outcome(),
        appcall_web::ExecutionOutcome::NotDispatched,
        "input validation must fence the runner before any provider effect: {failure:?}"
    );
    let non_object = request(
        Op::Test,
        &[
            ("connectionId", "copy-connection"),
            ("action", "write"),
            ("input_raw", "[]"),
        ],
    );
    let failure = data.execute_detailed(non_object).await.unwrap_err();
    assert_eq!(failure.classification(), Error::Unavailable);
    assert_eq!(failure.cause(), FailureCause::InvalidActionInput);
    let mut forbidden = request(Op::Test, &fields);
    forbidden.account_id = Some("other-brand".into());
    let failure = data.execute_detailed(forbidden).await.unwrap_err();
    assert_eq!(failure.classification(), Error::Forbidden);
    assert_eq!(failure.cause(), FailureCause::Unknown);
    assert!(failure.json_position().is_none());
}

pub async fn assert_service_failures(
    data: &dyn DashboardData,
    principal: appcall_auth::Principal,
    submit_classification: Error,
    local_oauth: bool,
    runner_calls: &std::sync::atomic::AtomicUsize,
) {
    let request = |operation, resource: &str, fields: &[(&str, &str)]| DashboardRequest {
        principal: principal.clone(),
        operation,
        resource: Some(resource.into()),
        account_id: Some("brand".into()),
        fields: fields
            .iter()
            .map(|(k, v)| ((*k).into(), (*v).into()))
            .collect(),
        form_values: Default::default(),
    };
    for (route, label) in [
        ("", Some("First API key")),
        ("first", Some("First API key")),
        ("second", Some("Second API key")),
        ("html", None),
    ] {
        let failure = data
            .execute_detailed(request(Op::Setup, "routed", &[("route", route)]))
            .await
            .unwrap_err();
        assert_eq!(failure.classification(), Error::Invalid);
        assert_eq!(failure.cause(), FailureCause::MissingSetupField);
        assert_eq!(failure.setup_field().map(|f| f.label()), label);
        let detail = format!("{failure:?}");
        assert!(!detail.contains("Base label"));
        assert!(!detail.contains("private-declaration"));
    }
    for (connector, route) in [("test", "nonempty"), ("routed", "unknown")] {
        let failure = data
            .execute_detailed(request(Op::Setup, connector, &[("route", route)]))
            .await
            .unwrap_err();
        assert_eq!(failure.classification(), Error::Invalid);
        assert_eq!(failure.cause(), FailureCause::Unknown);
        assert!(failure.setup_field().is_none());
    }
    let oauth = data
        .execute_detailed(request(Op::Setup, "copy-oauth", &[]))
        .await;
    if local_oauth {
        let value = oauth.unwrap();
        assert_eq!(value["developmentOAuth"], true);
        assert!(value["redirectUrl"]
            .as_str()
            .unwrap()
            .starts_with("/oauth/local/authorize?"));
    } else {
        let failure = oauth.unwrap_err();
        assert_eq!(failure.classification(), Error::Unavailable);
        assert_eq!(
            failure.cause(),
            FailureCause::Unknown,
            "unconfigured OAuth cannot establish credential rejection"
        );
    }
    let before = runner_calls.load(std::sync::atomic::Ordering::SeqCst);
    let failure = data
        .execute_detailed(request(
            Op::Test,
            "copy-check-toolkit",
            &[
                ("connectionId", "copy-check"),
                ("action", "write"),
                ("input_raw", r#"{"count":"private-wrong-type"}"#),
            ],
        ))
        .await
        .unwrap_err();
    assert_eq!(failure.classification(), Error::Unavailable);
    assert_eq!(
        failure.cause(),
        FailureCause::InvalidActionInput,
        "real manifest validation: {failure:?}"
    );
    assert_eq!(
        failure.outcome(),
        appcall_web::ExecutionOutcome::NotDispatched
    );
    assert_eq!(
        runner_calls.load(std::sync::atomic::Ordering::SeqCst),
        before
    );
    assert!(!format!("{failure:?}").contains("private-wrong-type"));
    // A real RunnerClient receives a transport failure from our owned socket.
    let failure = data
        .execute_detailed(request(
            Op::Setup,
            "test",
            &[("apiKey", "synthetic-copy-key")],
        ))
        .await
        .unwrap_err();
    assert_eq!(failure.classification(), submit_classification);
    assert_eq!(
        failure.cause(),
        FailureCause::ServiceUnavailable,
        "setup transport: {failure:?}"
    );
    assert_eq!(
        data.execute(request(
            Op::Setup,
            "test",
            &[("apiKey", "synthetic-copy-key")]
        ))
        .await
        .unwrap_err(),
        submit_classification
    );
    let failure = data
        .execute_detailed(request(Op::TestConnection, "copy-check", &[]))
        .await
        .unwrap_err();
    assert_eq!(failure.classification(), Error::Unavailable);
    assert_eq!(
        failure.cause(),
        FailureCause::ServiceUnavailable,
        "connection transport: {failure:?}"
    );
    assert!(failure.request_id().is_none());
    let failure = data
        .execute_detailed(request(Op::ReplayTrace, "original-copy-request", &[]))
        .await
        .unwrap_err();
    assert_eq!(failure.classification(), Error::Unavailable);
    assert_eq!(failure.cause(), FailureCause::InvalidActionInput);
    assert!(
        failure.request_id().is_some(),
        "replay execution must retain its new failure request ID"
    );
    assert_ne!(failure.request_id(), Some("original-copy-request"));
    for operation in [Op::TestConnection, Op::ReplayTrace] {
        let failure = data
            .execute_detailed(request(operation, "missing-copy-resource", &[]))
            .await
            .unwrap_err();
        assert_eq!(
            failure.classification(),
            if operation == Op::TestConnection {
                Error::Forbidden
            } else {
                Error::Unavailable
            }
        );
        assert_eq!(failure.cause(), FailureCause::Unknown);
        assert!(failure.request_id().is_none());
        assert_eq!(
            data.execute(request(operation, "missing-copy-resource", &[]))
                .await
                .unwrap_err(),
            failure.classification()
        );
    }
}
