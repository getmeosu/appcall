use super::*;
use crate::{Identity, Request};
use appcall_actions::{ActionRepository, Attempt};
use appcall_store::{AuthType, Connection, CredentialOwner, Status, TestStatus};
use std::sync::Arc;
pub(super) fn fixture() -> MemoryRepository {
    let registry = appcall_connectors::Registry::load("../../runner/connectors").unwrap();
    let repo = MemoryRepository::new(
        DevelopmentPermit::validate(false, None).unwrap(),
        Arc::new(registry),
        MemoryLimits::default(),
    )
    .unwrap();
    repo.create_connection(
        Connection {
            id: "c".into(),
            project_id: "proj_dev".into(),
            connector: "slack".into(),
            auth_type: AuthType::ApiKey,
            status: Status::Active,
            secret_ref_id: String::new(),
            last_test_status: TestStatus::Unknown,
            external_account_id: "brand".into(),
            credential_owner: CredentialOwner::Brand,
        },
        None,
    )
    .unwrap();
    repo
}
pub(super) fn identity(brand: &str) -> Identity {
    Identity {
        project_id: "proj_dev".into(),
        account_id: brand.into(),
        admin_scope: false,
    }
}
#[tokio::test]
async fn history_scopes_orders_cursors_and_redacts_replay() {
    let repo = fixture();
    for n in 0..2 {
        let a = Attempt {
            request_id: format!("r{n}"),
            project_id: "proj_dev".into(),
            connection_id: "c".into(),
            connector: "slack".into(),
            external_account_id: "brand".into(),
            action: "messages.send".into(),
            key: format!("key{n}"),
            input_hash: "hash".into(),
            lease_ms: 1000,
        };
        repo.acquire(&a).await.unwrap();
        repo.mark_dispatched(&a).await.unwrap();
        repo.record_replay(
            &a,
            &serde_json::json!({"text":"safe","apiKey":"must-not-appear"}),
        )
        .await
        .unwrap();
        repo.finish(&a, Some(&serde_json::json!({"ok":true})), None)
            .await
            .unwrap();
    }
    let h = MemoryHistory::new(repo);
    let first = h
        .read(
            &identity("brand"),
            &url::Url::parse("http://x/v1/action-logs?limit=1&limit=bad").unwrap(),
        )
        .unwrap()
        .unwrap();
    assert_eq!(first.body["logs"].as_array().unwrap().len(), 1);
    assert_eq!(first.body["pagination"]["hasMore"], true);
    let next = first.body["pagination"]["nextCursor"].as_str().unwrap();
    let second = h
        .read(
            &identity("brand"),
            &url::Url::parse(&format!("http://x/v1/action-logs?limit=1&cursor={next}")).unwrap(),
        )
        .unwrap()
        .unwrap();
    assert_ne!(
        first.body["logs"][0]["requestId"],
        second.body["logs"][0]["requestId"]
    );
    assert_eq!(
        h.read(
            &identity("other"),
            &url::Url::parse("http://x/v1/action-logs").unwrap()
        )
        .unwrap()
        .unwrap()
        .body["logs"],
        serde_json::json!([])
    );
    let detail = h
        .read(
            &identity("brand"),
            &url::Url::parse("http://x/v1/replay-logs/by-request/r0").unwrap(),
        )
        .unwrap()
        .unwrap();
    assert!(!detail.body.to_string().contains("must-not-appear"));
    let id = detail.body["id"].as_str().unwrap();
    let req = Request {
        method: "POST".into(),
        uri: String::new(),
        headers: vec![],
        body: vec![],
    };
    let replay = h.prepare_replay(&identity("brand"), id, &req).unwrap();
    assert_eq!(replay.external_account_id, "brand");
    assert!(!replay.admin_scope);
    assert_eq!(replay.project_id, "proj_dev");
    assert!(h.prepare_replay(&identity("other"), id, &req).is_err());
    let by_request = Request {
        method: "POST".into(),
        uri: "/v1/requests/r0/replay".into(),
        headers: vec![(
            "X-Connector-Token".into(),
            "Bearer transient-provider-token".into(),
        )],
        body: vec![],
    };
    let command = h
        .prepare_replay(&identity("brand"), "r0", &by_request)
        .unwrap();
    assert_eq!(command.caller_credential, "transient-provider-token");
    let trace = h
        .read(
            &identity("brand"),
            &url::Url::parse("http://x/v1/requests/r0").unwrap(),
        )
        .unwrap()
        .unwrap();
    assert_eq!(trace.body["replayAvailable"], true);
    assert!(trace.body["replayLog"].get("sanitizedInput").is_none());
    assert_eq!(
        h.read(
            &identity("brand"),
            &url::Url::parse("http://x/v1/action-logs?status=unknown").unwrap()
        )
        .unwrap_err()
        .code,
        "INVALID_STATUS"
    );
    assert_eq!(
        h.read(
            &identity("brand"),
            &url::Url::parse("http://x/v1/action-logs?cursor=bad").unwrap()
        )
        .unwrap_err()
        .code,
        "INVALID_CURSOR"
    );
}
