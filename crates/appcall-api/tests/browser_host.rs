use appcall_api::browser_host::{parse_request, public_path};
use appcall_api::Request;
#[path = "browser_host/failure_cases.rs"]
mod copy_failure_cases;
#[test]
fn browser_classifier_and_parser_do_not_create_an_api_auth_bypass() {
    assert!(public_path("GET", "/app/login"));
    assert!(public_path("POST", "/app/users/u/remove"));
    assert!(public_path("GET", "/static/app.css"));
    assert!(public_path("GET", "/static/logs.js"));
    assert!(!public_path("POST", "/static/logs.js"));
    assert!(!public_path("GET", "/static/logs.js/extra"));
    for path in [
        "/v1/actions",
        "/app/../v1/actions",
        "/app/users/u/arbitrary",
        "/app/toolkits/x%2Fy",
        "/static/../../secret",
        "/app/oauth/unknown",
    ] {
        assert!(!public_path("GET", path), "{path}")
    }
    let r = Request {
        method: "POST".into(),
        uri: "/app/login?email=first".into(),
        headers: vec![
            (
                "Content-Type".into(),
                "application/x-www-form-urlencoded".into(),
            ),
            ("Cookie".into(), "a=1".into()),
            ("cookie".into(), "b=2".into()),
        ],
        body: b"email=second&password=secret".to_vec(),
    };
    let parsed = parse_request(&r).unwrap();
    assert_eq!(parsed.fields["email"], vec!["first", "second"]);
    assert_eq!(parsed.cookies, "a=1; b=2");
    let bad = Request {
        headers: vec![
            ("Origin".into(), "https://good.example".into()),
            ("origin".into(), "https://evil.example".into()),
        ],
        ..r
    };
    assert!(parse_request(&bad).is_err());
}
#[test]
#[ignore = "requires isolated local PostgreSQL and broker socket"]
fn browser_host_runs_cookie_membership_and_broker_on_current_thread_runtime() {
    use appcall_api::browser_host::{BrowserConfig, BrowserHost};
    use serde_json::{json, Value};
    use std::{
        io::{Read, Write},
        sync::{Arc, Mutex},
    };
    struct Data(Arc<Mutex<Vec<String>>>);
    impl appcall_web::DashboardData for Data {
        fn execute(
            &self,
            r: appcall_web::DashboardRequest,
        ) -> std::pin::Pin<
            Box<dyn std::future::Future<Output = Result<Value, appcall_web::Error>> + Send + '_>,
        > {
            Box::pin(async move {
                self.0.lock().unwrap().push(r.principal.project_id);
                Ok(json!({
                    "toolkitCount":1,
                    "connectionCount":2,
                    "activeConnectionCount":2,
                    "toolCalls":3,
                    "successfulCalls":3,
                    "failedCalls":0,
                    "activity":[{"label":"Sep 08","calls":3}],
                    "failureActivity":[{"label":"Sep 08","failures":0}],
                    "attention":[],
                    "deadRunsUnavailable":true
                }))
            })
        }
    }
    let url = std::env::var("APPCALL_ENGINE_POSTGRES_URL").unwrap();
    let mut admin = postgres::Client::connect(&url, postgres::NoTls).unwrap();
    let schema = format!("browser_host_test_{}", uuid::Uuid::new_v4().simple());
    admin.batch_execute(&format!("CREATE SCHEMA {schema}; SET search_path TO {schema}; CREATE TABLE users(id text PRIMARY KEY,is_active boolean);CREATE TABLE tenants(id text PRIMARY KEY,is_active boolean);CREATE TABLE tenant_memberships(user_id text,tenant_id text);CREATE TABLE revoked_tokens(token_hash text);INSERT INTO users VALUES('11111111-1111-1111-1111-111111111111',true);INSERT INTO tenants VALUES('tenant-a',true);INSERT INTO tenant_memberships VALUES('11111111-1111-1111-1111-111111111111','tenant-a')")).unwrap();
    let mut client = postgres::Client::connect(&url, postgres::NoTls).unwrap();
    client
        .batch_execute(&format!("SET search_path TO {schema}"))
        .unwrap();
    let fixture: Value =
        serde_json::from_str(include_str!("../../appcall-auth/tests/go_golden.json")).unwrap();
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let payload=json!({"accessToken":fixture["jwt"],"refreshToken":"synthetic-refresh","memberships":[{"tenantId":"tenant-a","tenantName":"Tenant A","isRoot":true}]}).to_string();
    let broker = std::thread::spawn(move || {
        let (mut socket, _) = listener.accept().unwrap();
        socket
            .set_read_timeout(Some(std::time::Duration::from_secs(5)))
            .unwrap();
        let mut bytes = vec![0; 65536];
        let n = socket.read(&mut bytes).unwrap();
        assert!(String::from_utf8_lossy(&bytes[..n]).starts_with("POST /api/auth/login "));
        write!(socket,"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",payload.len(),payload).unwrap();
    });
    let seen = Arc::new(Mutex::new(vec![]));
    let host = BrowserHost::new(
        BrowserConfig {
            public_origin: "http://127.0.0.1:8088".into(),
            broker_url: format!("http://{address}"),
            session_secret: "synthetic-session".into(),
            jwt_secret: fixture["jwt_secret"].as_str().unwrap().into(),
            cookie_secure: false,
            product_slug: "appcall".into(),
        },
        client,
        Arc::new(Data(seen.clone())),
    )
    .unwrap();
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .max_blocking_threads(16)
        .build()
        .unwrap();
    runtime.block_on(async {
        let login = host
            .handle(&Request {
                method: "POST".into(),
                uri: "/app/login".into(),
                headers: vec![
                    ("Origin".into(), "http://127.0.0.1:8088".into()),
                    (
                        "Content-Type".into(),
                        "application/x-www-form-urlencoded".into(),
                    ),
                ],
                body: b"email=fixture%40example.invalid&password=synthetic".to_vec(),
            })
            .await
            .unwrap()
            .unwrap();
        assert_eq!(login.status, 302);
        let cookie = login
            .headers
            .iter()
            .find(|(k, _)| k == "Set-Cookie")
            .unwrap()
            .1
            .split(';')
            .next()
            .unwrap()
            .to_owned();
        assert!(!cookie.contains("synthetic-refresh"));
        let request = Request {
            method: "GET".into(),
            uri: "/app".into(),
            headers: vec![("Cookie".into(), cookie.clone())],
            body: vec![],
        };
        let page = host.handle(&request).await.unwrap().unwrap();
        assert_eq!(page.status, 200);
        assert!(String::from_utf8(page.body).unwrap().contains("Overview"));
        assert_eq!(seen.lock().unwrap().as_slice(), ["proj_tenant-a"]);
        let principal = host
            .authorize_headers(&[
                (
                    "Authorization".into(),
                    format!("Bearer {}", fixture["jwt"].as_str().unwrap()),
                ),
                ("X-Tenant-ID".into(), "tenant-a".into()),
            ])
            .await
            .unwrap();
        assert_eq!(principal.project_id, "proj_tenant-a");
        let duplicate = Request {
            headers: vec![("Cookie".into(), format!("{cookie}; {cookie}"))],
            ..request
        };
        assert_eq!(host.handle(&duplicate).await.unwrap().unwrap().status, 302);
    });
    broker.join().unwrap();
    drop(host);
    drop(runtime);
    admin
        .batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
        .unwrap();
}
#[test]
fn guided_input_preserves_types_and_restricts_actor_schema_scope() {
    use appcall_api::browser_host::guided_action_input;
    use serde_json::json;
    let fields = [
        ("f.enabled".into(), vec!["on".into()]),
        ("f.count".into(), vec!["2".into()]),
        ("f.runInput.city".into(), vec!["Pune".into()]),
    ]
    .into_iter()
    .collect();
    let schema = json!({"type":"object","properties":{"enabled":{"type":"boolean"},"count":{"type":"integer"},"runInput":{"type":"object"}}});
    let actor = r#"{"type":"object","properties":{"city":{"type":"string"}}}"#;
    assert_eq!(
        guided_action_input(&schema, &fields, actor).unwrap(),
        json!({"enabled":true,"count":2.0,"runInput":{"city":"Pune"}})
    );
    assert!(guided_action_input(&json!({"type":"object"}), &fields, actor).is_err());
}
#[test]
#[ignore = "requires isolated local PostgreSQL"]
fn copy_dashboard_failures_have_backend_parity_production_and_verified_project() {
    use appcall_api::browser_host::*;
    use serde_json::Value;
    use std::{
        collections::BTreeMap,
        sync::{Arc, Mutex},
    };
    let url = std::env::var("APPCALL_ENGINE_POSTGRES_URL").unwrap();
    let mut admin = postgres::Client::connect(&url, postgres::NoTls).unwrap();
    let schema = format!("browser_data_test_{}", uuid::Uuid::new_v4().simple());
    admin
        .batch_execute(&format!(
            "CREATE SCHEMA {schema}; SET search_path TO {schema}"
        ))
        .unwrap();
    let mut scoped_url = url::Url::parse(&url).unwrap();
    scoped_url
        .query_pairs_mut()
        .append_pair("options", &format!("-csearch_path={schema}"));
    appcall_runtime::SqlxMigration::new(
        concat!(env!("CARGO_MANIFEST_DIR"), "/../../migrations"),
        scoped_url.as_str(),
        std::time::Duration::from_secs(30),
    )
    .unwrap()
    .apply()
    .unwrap();
    admin.batch_execute("CREATE TABLE users(id text PRIMARY KEY,is_active boolean);CREATE TABLE tenants(id text PRIMARY KEY,is_active boolean);CREATE TABLE tenant_memberships(user_id text,tenant_id text);CREATE TABLE revoked_tokens(token_hash text);INSERT INTO users VALUES('11111111-1111-1111-1111-111111111111',true);INSERT INTO tenants VALUES('tenant-a',true);INSERT INTO tenant_memberships VALUES('11111111-1111-1111-1111-111111111111','tenant-a')").unwrap();
    let connect = || {
        let mut c = postgres::Client::connect(&url, postgres::NoTls).unwrap();
        c.batch_execute(&format!("SET search_path TO {schema}"))
            .unwrap();
        c
    };
    let store = || {
        appcall_store::Store::new(
            connect(),
            appcall_store::LocalProvider::new(&[7; 32]).unwrap(),
        )
    };
    let registry = appcall_connectors::Registry::from_connectors(
        std::iter::once(copy_failure_cases::manifest())
            .chain(copy_failure_cases::extra_manifests())
            .map(|manifest| {
                appcall_connectors::Connector::from_bytes(&serde_json::to_vec(&manifest).unwrap())
                    .unwrap()
            }),
    )
    .unwrap();
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .max_blocking_threads(16)
        .build()
        .unwrap();
    let lifecycle = Arc::new(appcall_oauth::Lifecycle::new(
        Arc::new(Mutex::new(store())),
        Arc::new(registry.clone()),
        BTreeMap::new(),
        appcall_oauth::StateSigner::new(&[8; 32]).unwrap(),
        Arc::new(
            appcall_oauth::TokenClient::new(
                std::time::Duration::from_secs(1),
                appcall_oauth::EndpointPolicy::HttpsOnly,
            )
            .unwrap(),
        ),
    ));
    let transport = copy_failure_cases::TransportServer::new();
    let runner =
        appcall_runner_client::RunnerClient::new(&transport.endpoint, "", Default::default())
            .unwrap();
    let repository = appcall_actions::PgActionRepository::new(connect());
    let policy = appcall_actions::PgPolicy::new(repository.clone(), Default::default()).unwrap();
    let actions = Arc::new(appcall_actions::Service::new(
        repository,
        registry.clone(),
        appcall_actions::LifecycleCredentialResolver(lifecycle.clone()),
        runner.clone(),
        policy,
    ));
    let core = Arc::new(appcall_api::Services::new(
        store(),
        Arc::new(appcall_auth::PostgresApiKeys::new(connect())),
        actions,
        appcall_actions::LifecycleCredentialResolver(lifecycle.clone()),
        runner.clone(),
    ));
    let setup = Arc::new(appcall_setup::Service::new(
        Arc::new(Mutex::new(store())),
        Arc::new(registry.clone()),
        lifecycle,
        Arc::new(appcall_setup::RunnerValidator::new(
            Arc::new(runner),
            Arc::new(registry.clone()),
            runtime.handle().clone(),
        )),
    ));
    let data = Arc::new(ApiDashboard::new(
        registry,
        core,
        connect(),
        setup,
        Default::default(),
    ));
    admin.batch_execute("INSERT INTO projects(id,name) VALUES('proj_copy-test','fixture'); INSERT INTO connections(id,project_id,connector,auth_type,status,external_account_id,credential_owner) VALUES('copy-connection','proj_copy-test','test','api_key','active','brand','brand')").unwrap();
    store()
        .store_secret(
            "proj_copy-test",
            "copy-secret",
            "api_key",
            br#"{"apiKey":"synthetic-copy-key"}"#,
        )
        .unwrap();
    admin.batch_execute("INSERT INTO connections(id,project_id,connector,auth_type,status,external_account_id,credential_owner,secret_ref_id) VALUES('copy-check','proj_copy-test','copy-check-toolkit','api_key','active','brand','brand','copy-secret'); INSERT INTO action_replay_logs(id,project_id,connection_id,connector,action,request_id,sanitized_input,external_account_id) VALUES('copy-replay','proj_copy-test','copy-connection','test','write','original-copy-request','[]','brand')").unwrap();
    for (id, at) in [
        ("filter-old", "2026-09-07T09:59:59Z"),
        ("filter-start", "2026-09-07T10:00:00Z"),
        ("filter-end", "2026-09-07T11:00:00Z"),
    ] {
        admin.execute("INSERT INTO action_logs(id,project_id,connection_id,connector,action,status,error_code,request_id,external_account_id,created_at) VALUES($1,'proj_copy-test','copy-connection','test','write','failed','ACTION_TIMEOUT','filter-request','brand',$2::text::timestamptz)", &[&id,&at]).unwrap();
    }
    let mut principal = appcall_auth::Principal::project("proj_copy-test").unwrap();
    principal.user_id = Some("11111111-1111-1111-1111-111111111111".into());
    let copy_data = data.clone();
    // The global QA table is deliberately unavailable: the service must reject
    // this operation without attempting its SELECT, even for Grant::All.
    admin
        .batch_execute("ALTER TABLE qa_connector_status RENAME TO qa_connector_status_unreadable")
        .unwrap();
    let runner_calls = transport.calls.clone();
    runtime.block_on(async move {
        tokio::task::spawn_blocking(move || {
            // Poll outside Tokio's async executor, as BrowserHost does, while
            // retaining its reactor handle for the actual service futures.
            struct Signal(std::thread::Thread);
            impl std::task::Wake for Signal {
                fn wake(self: Arc<Self>) {
                    self.0.unpark();
                }
                fn wake_by_ref(self: &Arc<Self>) {
                    self.0.unpark();
                }
            }
            let waker = std::task::Waker::from(Arc::new(Signal(std::thread::current())));
            let mut context = std::task::Context::from_waker(&waker);
            let mut future = std::pin::pin!(async {
                assert_eq!(
                    appcall_web::DashboardData::execute(
                        copy_data.as_ref(),
                        appcall_web::DashboardRequest {
                            principal: principal.clone(),
                            operation: appcall_web::DashboardOperation::Qa,
                            resource: None,
                            account_id: None,
                            fields: Default::default(),
                            form_values: Default::default()
                        }
                    )
                    .await
                    .unwrap_err(),
                    appcall_web::Error::Forbidden
                );
                log_filter_cases::assert_log_filters(copy_data.as_ref(), principal.clone()).await;
                log_filter_cases::assert_invalid_filters(copy_data.as_ref(), principal.clone())
                    .await;
                copy_failure_cases::assert_failures(copy_data.as_ref(), principal.clone()).await;
                copy_failure_cases::assert_service_failures(
                    copy_data.as_ref(),
                    principal,
                    appcall_web::Error::Invalid,
                    false,
                    &runner_calls,
                )
                .await;
            });
            let deadline = std::time::Instant::now() + std::time::Duration::from_secs(20);
            loop {
                assert!(
                    std::time::Instant::now() < deadline,
                    "production dashboard fixture timed out"
                );
                match std::future::Future::poll(future.as_mut(), &mut context) {
                    std::task::Poll::Ready(()) => break,
                    std::task::Poll::Pending => {
                        std::thread::park_timeout(std::time::Duration::from_millis(50))
                    }
                }
            }
        })
        .await
        .unwrap();
    });
    let fixture: Value =
        serde_json::from_str(include_str!("../../appcall-auth/tests/go_golden.json")).unwrap();
    let host = BrowserHost::new(
        BrowserConfig {
            public_origin: "http://127.0.0.1:8088".into(),
            broker_url: "http://127.0.0.1:1".into(),
            session_secret: "synthetic".into(),
            jwt_secret: fixture["jwt_secret"].as_str().unwrap().into(),
            cookie_secure: false,
            product_slug: "appcall".into(),
        },
        connect(),
        data,
    )
    .unwrap();
    let codec = appcall_web::SessionCodec::new("synthetic", false).unwrap();
    let session = appcall_web::Session {
        access_token: fixture["jwt"].as_str().unwrap().into(),
        refresh_token: "refresh".into(),
        user_id: "11111111-1111-1111-1111-111111111111".into(),
        email: "fixture@example.invalid".into(),
        tenant_id: "tenant-a".into(),
        tenant_name: "A".into(),
    };
    let cookie = format!("appcall_session={}", codec.seal_session(&session).unwrap());
    runtime.block_on(async {
        for path in [
            "/app?projectId=forged",
            "/app/toolkits",
            "/app/auth-configs",
            "/app/settings/usage?month=2026-01",
            "/app/qa",
        ] {
            let response = host
                .handle(&Request {
                    method: "GET".into(),
                    uri: path.into(),
                    headers: vec![("Cookie".into(), cookie.clone())],
                    body: vec![],
                })
                .await
                .unwrap()
                .unwrap();
            assert_eq!(
                response.status,
                if path == "/app/qa" { 403 } else { 200 },
                "{path}: {}",
                String::from_utf8_lossy(&response.body)
            );
        }
    });
    assert_eq!(
        admin
            .query_one(
                "SELECT count(*) FROM projects WHERE id='proj_tenant-a'",
                &[]
            )
            .unwrap()
            .get::<_, i64>(0),
        1
    );
    assert_eq!(
        admin
            .query_one("SELECT count(*) FROM projects WHERE id='forged'", &[])
            .unwrap()
            .get::<_, i64>(0),
        0
    );
    drop(host);
    drop(runtime);
    admin
        .batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
        .unwrap();
}

#[path = "browser_host/log_filter_cases.rs"]
mod log_filter_cases;
