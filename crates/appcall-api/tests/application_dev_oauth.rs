#[path = "../src/application.rs"]
mod application;
use appcall_api::{Backend, Identity, Request};
use std::collections::BTreeMap;
#[test]
#[ignore = "requires isolated local PostgreSQL"]
fn assembled_application_routes_local_oauth_without_provider_calls() {
    let base = std::env::var("APPCALL_ENGINE_POSTGRES_URL").unwrap();
    let mut admin = postgres::Client::connect(&base, postgres::NoTls).unwrap();
    let schema = format!("app_dev_oauth_{}", uuid::Uuid::new_v4().simple());
    admin
        .batch_execute(&format!(
            "CREATE SCHEMA {schema}; SET search_path TO {schema}"
        ))
        .unwrap();
    let mut files = std::fs::read_dir(concat!(env!("CARGO_MANIFEST_DIR"), "/../../migrations"))
        .unwrap()
        .map(|x| x.unwrap().path())
        .filter(|x| x.extension().is_some_and(|e| e == "sql"))
        .collect::<Vec<_>>();
    files.sort();
    for path in files {
        admin
            .batch_execute(&std::fs::read_to_string(path).unwrap())
            .unwrap();
    }
    admin
        .batch_execute("INSERT INTO projects(id,name)VALUES('proj_dev','Dev')")
        .unwrap();
    let mut url = url::Url::parse(&base).unwrap();
    url.query_pairs_mut()
        .append_pair("options", &format!("-csearch_path={schema}"));
    let mut settings = BTreeMap::from([
        ("APPCALL_DATABASE_URL".into(), url.to_string()),
        ("APPCALL_RUNNER_URL".into(), "http://127.0.0.1:9/rpc".into()),
        ("APPCALL_SECRET_KEY".into(), "03".repeat(32)),
    ]);
    let config = appcall_runtime::Config::from_map(&settings).unwrap();
    let registry = appcall_connectors::Registry::load(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../runner/connectors"
    ))
    .unwrap();
    let runtime = tokio::runtime::Runtime::new().unwrap();
    let app =
        application::Application::new(&config, registry.clone(), runtime.handle().clone()).unwrap();
    let shared = app.shared_state();
    appcall_mcp::UsageRecorder::record(
        &*shared.mcp_usage,
        "proj_dev",
        "",
        "google-workspace",
        "probe",
    )
    .unwrap();
    for _ in 0..5 {
        shared
            .circuit
            .admit("provider".into())
            .unwrap()
            .resolve(true);
    }
    let (generation, tracker) = config.generation();
    let rebuilt = application::Application::new_with_state(
        &generation,
        registry.clone(),
        runtime.handle().clone(),
        shared,
    )
    .unwrap();
    assert_eq!(rebuilt.database_health(), Some(true));
    assert_eq!(
        tracker.session_count(),
        13,
        "every physical application database client is tracked"
    );
    assert!(rebuilt
        .shared_state()
        .circuit
        .admit("provider".into())
        .is_err());
    runtime.block_on(async {
        let request = Request {
            method: "GET".into(),
            uri: "/v1/usage/tools".into(),
            headers: vec![],
            body: vec![],
        };
        let identity = Identity {
            project_id: "proj_dev".into(),
            account_id: String::new(),
            admin_scope: false,
        };
        let response = rebuilt
            .auxiliary_route(&identity, &request)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(response.body["total"], 1);
    });
    rebuilt.stop();
    drop(rebuilt);
    let app = std::rc::Rc::new(appcall_api::Api {
        registry: registry.clone(),
        backend: app,
    });
    runtime.block_on(tokio::task::LocalSet::new().run_until(async {
        let request = Request {
            method: "POST".into(),
            uri: "/v1/connectors/google-workspace/setup/oauth".into(),
            headers: vec![],
            body: b"{}".to_vec(),
        };
        let identity = Identity {
            project_id: "proj_dev".into(),
            account_id: String::new(),
            admin_scope: false,
        };
        let start = app
            .backend
            .auxiliary_route(&identity, &request)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(start.status, 201, "{:?}", start.body);
        let callback = Request {
            method: "GET".into(),
            uri: start.body["authorizationUrl"].as_str().unwrap().into(),
            headers: vec![],
            body: vec![],
        };
        assert!(!app
            .backend
            .requires_api_auth("GET", "/oauth/local/authorize"));
        let invalid = Request {
            headers: vec![("X-API-Key".into(), "invalid".into())],
            method: callback.method.clone(),
            uri: callback.uri.clone(),
            body: vec![],
        };
        assert!(app.backend.raw_route(&invalid).await.is_err());
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let (stop, stopped) = tokio::sync::oneshot::channel();
        let server_app = app.clone();
        let server = tokio::task::spawn_local(async move {
            appcall_api::serve(listener, server_app, async {
                let _ = stopped.await;
            })
            .await
            .unwrap();
        });
        let uri = callback.uri.clone();
        let response = tokio::task::spawn_blocking(move || {
            use std::io::{Read, Write};
            let mut socket = std::net::TcpStream::connect(address).unwrap();
            socket
                .set_read_timeout(Some(std::time::Duration::from_secs(3)))
                .unwrap();
            write!(
                socket,
                "GET {uri} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n"
            )
            .unwrap();
            let mut response = String::new();
            socket.read_to_string(&mut response).unwrap();
            response
        })
        .await
        .unwrap();
        assert!(response.starts_with("HTTP/1.1 302"), "{response}");
        stop.send(()).unwrap();
        server.await.unwrap();
        assert!(app.backend.raw_route(&callback).await.is_err());
    }));
    app.backend.stop();
    drop(app);
    settings.insert(
        "APPCALL_GOOGLE_OAUTH_CLIENT_ID".into(),
        "synthetic-client".into(),
    );
    // Intentionally incomplete managed app: its failure must never select local fallback.
    let managed_config = appcall_runtime::Config::from_map(&settings).unwrap();
    let managed =
        application::Application::new(&managed_config, registry, runtime.handle().clone()).unwrap();
    runtime.block_on(async {
        let request = Request {
            method: "POST".into(),
            uri: "/v1/connectors/google-workspace/setup/oauth".into(),
            headers: vec![],
            body: b"{}".to_vec(),
        };
        let identity = Identity {
            project_id: "proj_dev".into(),
            account_id: String::new(),
            admin_scope: false,
        };
        let result = managed
            .auxiliary_route(&identity, &request)
            .await
            .unwrap()
            .unwrap();
        assert_ne!(result.status, 201);
        assert!(result.body.get("authorizationUrl").is_none());
    });
    managed.stop();
    drop(managed);
    drop(runtime);
    admin
        .batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
        .unwrap();
}
