use super::*;
use appcall_mcp::ConnectionLister;
use appcall_store::{AuthType, Connection, CredentialOwner, Status, TestStatus};
use std::sync::Arc;
fn repository() -> MemoryRepository {
    let registry = appcall_connectors::Registry::from_connectors([]).unwrap();
    MemoryRepository::new(
        DevelopmentPermit::validate(false, None).unwrap(),
        Arc::new(registry),
        MemoryLimits::default(),
    )
    .unwrap()
}
#[tokio::test]
async fn mcp_connection_inventory_is_the_same_scoped_memory_repository() {
    let repository = repository();
    let connection = Connection {
        id: "memory-composition".into(),
        project_id: "proj_dev".into(),
        external_account_id: "brand".into(),
        connector: "slack".into(),
        auth_type: AuthType::ApiKey,
        status: Status::Active,
        secret_ref_id: String::new(),
        last_test_status: TestStatus::Unknown,
        credential_owner: CredentialOwner::Brand,
    };
    repository.create_connection(connection, None).unwrap();
    let lister = MemoryConnectionLister::new(repository.clone());
    assert_eq!(lister.list("proj_dev").await.unwrap().len(), 1);
    assert!(lister.list("other").await.unwrap().is_empty());
    let (mut connection, revision) = repository
        .get_connection("proj_dev", Some("brand"), "memory-composition")
        .unwrap();
    connection.status = Status::Disconnected;
    repository
        .replace_connection("proj_dev", Some("brand"), revision, connection, None)
        .unwrap();
    assert_eq!(
        lister.list("proj_dev").await.unwrap()[0].status,
        "disconnected"
    );
}
#[test]
fn database_only_unipile_paths_are_exact() {
    assert!(memory_unipile_path("/v1/unipile/accounts"));
    assert!(!memory_unipile_path("/v1/connections"));
    assert!(!memory_unipile_path("/v1/unipile-fake"));
}
struct NoTokens;
impl appcall_oauth::TokenProvider for NoTokens {
    fn exchange(
        &self,
        _: &appcall_connectors::OAuthConfig,
        _: &appcall_oauth::AppCredentials,
        _: &str,
        _: &str,
        _: i64,
    ) -> appcall_oauth::Result<appcall_oauth::TokenSet> {
        panic!("unexpected OAuth exchange")
    }
    fn refresh(
        &self,
        _: &appcall_connectors::OAuthConfig,
        _: &appcall_oauth::AppCredentials,
        _: &str,
        _: i64,
    ) -> appcall_oauth::Result<appcall_oauth::TokenSet> {
        panic!("unexpected OAuth refresh")
    }
}
fn composition() -> (MemoryBackend, MemoryDashboard) {
    let manifest = serde_json::json!({"key":"test","name":"Test","version":"1","runtime":"bun","models":["item"],"auth":{"type":"api_key","setup":{"mode":"api_key","fields":[{"key":"apiKey","label":"API key","required":true,"secret":true}]}},"network":{"egress":"none"},"operations":{"write":{"kind":"action","timeoutMs":1000,"maxInputBytes":1024,"maxResponseBytes":1024,"description":"Synthetic write action","sideEffect":"write","inputSchema":{"type":"object"}}}});
    composition_with_manifest(manifest)
}
fn composition_with_manifest(manifest: serde_json::Value) -> (MemoryBackend, MemoryDashboard) {
    let registry =
        appcall_connectors::Registry::from_connectors([appcall_connectors::Connector::from_bytes(
            &serde_json::to_vec(&manifest).unwrap(),
        )
        .unwrap()])
        .unwrap();
    let repo = MemoryRepository::new(
        DevelopmentPermit::validate(false, None).unwrap(),
        Arc::new(registry),
        MemoryLimits::default(),
    )
    .unwrap();
    let oauth =
        Arc::new(MemoryOAuth::new(repo.clone(), Default::default(), Arc::new(NoTokens)).unwrap());
    let setup = Arc::new(MemorySetup::new(repo.clone(), None, oauth.clone()));
    let actions = memory_actions(repo.clone(), None, Default::default(), oauth).unwrap();
    let events = Arc::new(MemoryEvents::new(repo.clone(), None, None));
    let core = Arc::new(MemoryCore::new(repo, actions, setup, events, 0));
    let key = appcall_auth::StaticApiKey::from_hash(
        &appcall_auth::hash_api_key("test-platform-key"),
        appcall_auth::Principal::project("proj_dev").unwrap(),
    )
    .unwrap();
    (
        MemoryBackend::new(core.clone(), Some(Arc::new(key)), None),
        MemoryDashboard::new(core),
    )
}
fn api_request(method: &str, uri: &str, body: serde_json::Value) -> crate::Request {
    crate::Request {
        method: method.into(),
        uri: uri.into(),
        headers: vec![("X-API-Key".into(), "test-platform-key".into())],
        body: serde_json::to_vec(&body).unwrap(),
    }
}
#[tokio::test]
async fn toolkit_selection_memory_routes_validate_explicit_actions() {
    use appcall_web::{DashboardData, DashboardOperation, DashboardRequest, Error};
    let action = |kind, effect| serde_json::json!({"kind":kind,"sideEffect":effect,"timeoutMs":1000,"maxInputBytes":1024,"maxResponseBytes":1024,"description":"Synthetic operation","inputSchema":{"type":"object"}});
    let (_, dashboard) = composition_with_manifest(serde_json::json!({
        "key":"test","name":"Test","version":"1","runtime":"bun","models":["item"],
        "auth":{"type":"api_key"},"network":{"egress":"none"},
        "operations":{"a_sync":action("sync","read"),"b_write":action("action","write"),"c_read":action("action","read")}
    }));
    for operation in [DashboardOperation::Toolkit, DashboardOperation::TestForm] {
        for (action, expected) in [
            (None, Some("b_write")),
            (Some(""), Some("b_write")),
            (Some("c_read"), Some("c_read")),
            (Some("unknown"), None),
            (Some("a_sync"), None),
        ] {
            let request = DashboardRequest {
                principal: appcall_auth::Principal::project("proj_dev").unwrap(),
                operation,
                resource: Some("test".into()),
                account_id: None,
                fields: action
                    .map(|a| std::collections::BTreeMap::from([("action".into(), a.into())]))
                    .unwrap_or_default(),
                form_values: Default::default(),
            };
            let result = dashboard.execute(request).await;
            if let Some(expected) = expected {
                let item = result.unwrap();
                assert_eq!(item["action"], expected);
                assert!(item.get("safeDefault").is_none());
            } else {
                assert!(
                    matches!(result, Err(Error::Invalid)),
                    "{operation:?} action {action:?}: {result:?}"
                );
            }
        }
    }
}
#[tokio::test]
async fn setup_action_dashboard_mcp_logs_and_usage_share_memory() {
    use crate::Backend;
    use appcall_web::{DashboardData, DashboardOperation, DashboardRequest};
    let (backend, dashboard) = composition();
    let identity = backend
        .authorize(&api_request("GET", "/v1/connections", serde_json::Value::Null).headers)
        .await
        .unwrap();
    let setup = backend
        .auxiliary_route(
            &identity,
            &api_request(
                "POST",
                "/v1/connectors/test/setup/api-key",
                serde_json::json!({"fields":{"apiKey":"synthetic-secret"},"projectId":"victim"}),
            ),
        )
        .await
        .unwrap()
        .unwrap();
    assert_eq!(setup.status, 201);
    let connections = backend.connections(&identity).await.unwrap();
    assert_eq!(connections.len(), 1);
    assert_eq!(connections[0].project_id, "proj_dev");
    assert_eq!(setup.body["connection"]["id"], connections[0].id);
    assert!(setup.body.get("id").is_none());
    let result = backend
        .execute(appcall_actions::ExecuteRequest {
            project_id: "proj_dev".into(),
            connection_id: connections[0].id.clone(),
            external_account_id: String::new(),
            admin_scope: true,
            action: "write".into(),
            idempotency_key: "same-key".into(),
            input: serde_json::json!({}),
            caller_credential: String::new(),
        })
        .await
        .unwrap();
    assert_eq!(result.output["mode"], "local");
    let dashboard_request = |operation| DashboardRequest {
        principal: appcall_auth::Principal::project("proj_dev").unwrap(),
        operation,
        resource: None,
        account_id: None,
        fields: Default::default(),
        form_values: Default::default(),
    };
    let inventory = dashboard
        .execute(dashboard_request(DashboardOperation::AuthConfigs))
        .await
        .unwrap();
    assert_eq!(inventory["connections"].as_array().unwrap().len(), 1);
    let usage = dashboard
        .execute(dashboard_request(DashboardOperation::Usage))
        .await
        .unwrap();
    assert_eq!(usage["actionCalls"], 1);
    let logs = dashboard
        .execute(dashboard_request(DashboardOperation::Logs))
        .await
        .unwrap();
    assert!(logs.to_string().contains(&result.request_id));
    assert!(!logs.to_string().contains("synthetic-secret"));
    let qa = dashboard
        .execute(dashboard_request(DashboardOperation::Qa))
        .await
        .unwrap();
    assert_eq!(qa["unavailable"], true);
    let triggers = dashboard
        .execute(dashboard_request(DashboardOperation::Triggers))
        .await
        .unwrap();
    assert!(triggers["events"].as_array().unwrap().is_empty());
    let mcp = backend
        .raw_route(&api_request(
            "POST",
            "/v1/mcp",
            serde_json::json!({"jsonrpc":"2.0","id":1,"method":"tools/list"}),
        ))
        .await
        .unwrap()
        .unwrap();
    let wire = String::from_utf8(mcp.body).unwrap();
    assert!(wire.contains("test__write"), "{wire}");
    assert!(!wire.contains("synthetic-secret"));
    let mut forbidden = dashboard_request(DashboardOperation::AuthConfigs);
    forbidden.principal = appcall_auth::Principal::project("victim").unwrap();
    assert!(dashboard.execute(forbidden).await.is_err());
    assert_eq!(
        backend
            .public_route(&api_request(
                "POST",
                "/v1/connectors/unipile/setup/hosted",
                serde_json::json!({})
            ))
            .await
            .unwrap()
            .unwrap()
            .status,
        404
    );
}
#[test]
fn setup_provider_failures_have_safe_public_error_codes() {
    for error in [
        appcall_oauth::Error::Transport,
        appcall_oauth::Error::InvalidToken,
        appcall_oauth::Error::OutcomeUnknown,
    ] {
        assert_eq!(
            super::backend::setup_error(appcall_setup::Error::OAuth(error)).code,
            "OAUTH_EXCHANGE_FAILED"
        );
    }
}
#[tokio::test]
async fn cancelled_memory_setup_work_cannot_commit_after_the_caller_leaves() {
    let (started_tx, started_rx) = tokio::sync::oneshot::channel();
    let (release_tx, release_rx) = std::sync::mpsc::channel();
    let (finished_tx, finished_rx) = tokio::sync::oneshot::channel();
    let work = tokio::spawn(async move {
        super::backend::memory_work(move || {
            let _ = started_tx.send(());
            release_rx.recv().unwrap();
            let _ = finished_tx.send(super::backend::active());
            Ok(())
        })
        .await
    });
    started_rx.await.unwrap();
    work.abort();
    assert!(work.await.is_err());
    release_tx.send(()).unwrap();
    assert!(!finished_rx.await.unwrap());
}
#[test]
fn setup_errors_preserve_provider_route_status_and_payload() {
    for (error, code, status) in [
        (
            appcall_setup::Error::MissingField,
            "MISSING_SETUP_FIELD",
            400,
        ),
        (
            appcall_setup::Error::Unsupported,
            "UNSUPPORTED_SETUP_MODE",
            400,
        ),
        (
            appcall_setup::Error::ValidationFailed,
            "CONNECTOR_SETUP_VALIDATION_FAILED",
            502,
        ),
        (
            appcall_setup::Error::OAuth(appcall_oauth::Error::InvalidState),
            "INVALID_OAUTH_STATE",
            400,
        ),
        (
            appcall_setup::Error::OAuth(appcall_oauth::Error::NotConfigured),
            "OAUTH_APP_NOT_CONFIGURED",
            503,
        ),
        (
            appcall_setup::Error::OAuth(appcall_oauth::Error::Transport),
            "OAUTH_EXCHANGE_FAILED",
            502,
        ),
    ] {
        let actual = crate::error_response(crate::ApiError::new(code));
        assert_eq!(actual.status, status);
        let expected = crate::provider_routes::setup_error(error, false);
        assert_eq!(actual.body, expected.body);
    }
}
#[tokio::test]
async fn dashboard_requests_obey_shared_payload_capacity() {
    use appcall_web::{DashboardData, DashboardOperation, DashboardRequest};
    let (backend, dashboard) = composition();
    backend.core.repository.lock().unwrap().bytes_used =
        backend.core.repository.limits().payload_bytes;
    let request = DashboardRequest {
        principal: appcall_auth::Principal::project("proj_dev").unwrap(),
        operation: DashboardOperation::RequestToolkit,
        resource: None,
        account_id: None,
        fields: std::collections::BTreeMap::from([("name".into(), "Requested connector".into())]),
        form_values: Default::default(),
    };
    assert!(dashboard.execute(request).await.is_err());
}
#[tokio::test]
async fn memory_usage_invalid_inputs_keep_http_400_errors() {
    use crate::Backend;
    let (backend, _) = composition();
    let identity = crate::Identity {
        project_id: "proj_dev".into(),
        account_id: String::new(),
        admin_scope: false,
    };
    for (path, code) in [
        ("/v1/usage/monthly?month=invalid", "INVALID_MONTH"),
        (
            "/v1/usage/action-calls/decision?quantity=0",
            "INVALID_QUANTITY",
        ),
    ] {
        let error = backend
            .auxiliary_route(
                &identity,
                &api_request("GET", path, serde_json::Value::Null),
            )
            .await
            .unwrap_err();
        assert_eq!(error.code, code);
        assert_eq!(crate::error_response(error).status, 400);
    }
}
#[tokio::test]
async fn replay_dispatches_shared_action_service_and_records_usage() {
    use crate::Backend;
    let (backend, _) = composition();
    let i = crate::Identity {
        project_id: "proj_dev".into(),
        account_id: "brand".into(),
        admin_scope: false,
    };
    backend
        .auxiliary_route(
            &i,
            &api_request(
                "POST",
                "/v1/connectors/test/setup/api-key",
                serde_json::json!({"fields":{"apiKey":"synthetic-secret"}}),
            ),
        )
        .await
        .unwrap()
        .unwrap();
    let connection = backend.connections(&i).await.unwrap().remove(0);
    let initial = backend
        .execute(appcall_actions::ExecuteRequest {
            project_id: i.project_id.clone(),
            external_account_id: i.account_id.clone(),
            connection_id: connection.id,
            admin_scope: false,
            action: "write".into(),
            input: serde_json::json!({}),
            idempotency_key: "initial".into(),
            caller_credential: String::new(),
        })
        .await
        .unwrap();
    let request = api_request(
        "POST",
        &format!("/v1/requests/{}/replay", initial.request_id),
        serde_json::json!({}),
    );
    let replay = backend
        .auxiliary_route(&i, &request)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(replay.status, 200);
    assert_eq!(replay.body["output"]["mode"], "local");
    let usage = backend.core.usage(&i, "").unwrap();
    assert_eq!(usage["actionCalls"], 2);
    let wrong = crate::Identity {
        account_id: "other-brand".into(),
        ..i
    };
    assert!(backend.auxiliary_route(&wrong, &request).await.is_err());
    assert_eq!(backend.core.usage(&wrong, "").unwrap()["actionCalls"], 0);
}
