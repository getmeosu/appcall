use super::actions::*;
use appcall_actions::{ActionRunner, Attempt};
use serde_json::json;
use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Arc,
};
use std::time::Duration;
fn attempt() -> Attempt {
    Attempt {
        request_id: "request".into(),
        project_id: "proj_dev".into(),
        connection_id: "c".into(),
        connector: "test".into(),
        external_account_id: "brand".into(),
        action: "write".into(),
        key: "key".into(),
        input_hash: "hash".into(),
        lease_ms: 1000,
    }
}
#[tokio::test]
async fn local_action_is_explicit_simulation_without_input_or_credential_echo() {
    let runner = DevelopmentRunner::new(None);
    let result = runner
        .execute(
            &attempt(),
            json!({"accessToken":"private", "payload":"private"}),
            u64::MAX,
        )
        .await
        .unwrap();
    assert_eq!(
        result,
        json!({"connector":"test", "action":"write", "mode":"local"})
    );
}
#[test]
fn caller_bearer_requires_bounded_nonempty_single_line_and_remains_transient() {
    assert_eq!(
        caller_fields(" bearer ").unwrap(),
        json!({"accessToken":"bearer"}).as_object().unwrap().clone()
    );
    for token in ["", " ", "x\r\nsecret", "x\0"] {
        assert!(caller_fields(token).is_err());
    }
    assert!(caller_fields(&"x".repeat(65537)).is_err());
}

#[test]
fn usage_reservations_enforce_hard_cap_across_brands_and_charge_only_success() {
    use super::{state::MemoryData, usage::*};
    let mut data = MemoryData {
        action_limits: appcall_actions::Entitlements {
            action_calls_soft: 1,
            action_calls_hard: 2,
            ..Default::default()
        },
        ..Default::default()
    };
    let a = attempt();
    let mut b = attempt();
    b.request_id = "two".into();
    b.external_account_id = "other".into();
    let mut c = attempt();
    c.request_id = "three".into();
    reserve_usage(&mut data, &a).unwrap();
    reserve_usage(&mut data, &b).unwrap();
    assert_eq!(
        reserve_usage(&mut data, &c).unwrap_err().code,
        "USAGE_LIMIT_EXCEEDED"
    );
    complete_usage(&mut data, &a, true).unwrap();
    complete_usage(&mut data, &b, false).unwrap();
    reserve_usage(&mut data, &c).unwrap();
    complete_usage(&mut data, &c, true).unwrap();
    assert_eq!(data.usage_events.len(), 2);
    assert_eq!(data.usage_monthly.values().sum::<i64>(), 2);
    assert!(data.usage_reserved.is_empty());
    assert!(reserve_usage(&mut data, &b).is_err());
    assert!(complete_usage(&mut data, &c, true).is_err());
}

#[test]
fn usage_read_models_preserve_go_shapes_and_reject_invalid_dates_or_quantities() {
    let repo = repository();
    repo.configure_usage(appcall_actions::Entitlements {
        action_calls_soft: 2,
        action_calls_hard: 3,
        ..Default::default()
    })
    .unwrap();
    assert_eq!(
        repo.usage_monthly("proj_dev", None, "2026-09").unwrap(),
        json!({"month":"2026-09","actionCalls":0,"actionCallsSoftLimit":2,"actionCallsHardLimit":3,"syncedRecords":0,"webhookEvents":0})
    );
    assert_eq!(
        repo.usage_decision("proj_dev", 4).unwrap()["reason"],
        "USAGE_LIMIT_EXCEEDED"
    );
    assert!(repo.usage_decision("proj_dev", 0).is_err());
    assert!(repo.usage_decision("proj_dev", 1001).is_err());
    assert!(repo.usage_monthly("proj_dev", None, "2026-13").is_err());
    assert!(repo.usage_monthly("proj_dev", None, "2026-9").is_err());
    assert!(repo.usage_monthly("missing", None, "").is_err());
    assert_eq!(
        repo.usage_entitlements("proj_dev", 4).unwrap()["plan"],
        json!({"key":"default","status":"active"})
    );
}
fn repository() -> super::MemoryRepository {
    let manifest = json!({"key":"test","name":"Test","version":"1","runtime":"bun","models":["item"],"auth":{"type":"none"},"network":{"egress":"none"},"operations":{"read":{"kind":"action","timeoutMs":50,"maxInputBytes":1024,"maxResponseBytes":1024,"sideEffect":"read"},"write":{"kind":"action","timeoutMs":1000,"maxInputBytes":1024,"maxResponseBytes":1024,"sideEffect":"write"},"normalized.post.create":{"kind":"action","timeoutMs":1000,"maxInputBytes":1024,"maxResponseBytes":1024,"sideEffect":"write"}}});
    let registry =
        appcall_connectors::Registry::from_connectors([appcall_connectors::Connector::from_bytes(
            &serde_json::to_vec(&manifest).unwrap(),
        )
        .unwrap()])
        .unwrap();
    super::MemoryRepository::new(
        super::DevelopmentPermit::validate(false, None).unwrap(),
        std::sync::Arc::new(registry),
        super::MemoryLimits::default(),
    )
    .unwrap()
}

#[test]
fn stored_credentials_are_scoped_revision_checked_and_caller_bearer_is_never_persisted() {
    use appcall_store::{AuthType, Connection, CredentialOwner, Status, TestStatus};
    let repo = repository();
    let conn = Connection {
        id: "c".into(),
        project_id: "proj_dev".into(),
        connector: "test".into(),
        auth_type: AuthType::ApiKey,
        status: Status::Active,
        secret_ref_id: String::new(),
        last_test_status: TestStatus::Unknown,
        external_account_id: "brand".into(),
        credential_owner: CredentialOwner::Brand,
    };
    let conn = repo
        .create_connection(
            conn,
            Some(("connector_setup_bundle", br#"{"apiKey":"stored"}"#)),
        )
        .unwrap();
    let snapshot = super::action_connection(&conn);
    assert_eq!(
        stored_credentials(&repo, &snapshot, "ignored", false)
            .unwrap()
            .fields["apiKey"],
        "stored"
    );
    let mut forged = snapshot.clone();
    forged.external_account_id = "other".into();
    assert!(stored_credentials(&repo, &forged, "", false).is_err());
    let (_, rev) = repo.get_connection("proj_dev", None, "c").unwrap();
    repo.replace_connection(
        "proj_dev",
        None,
        rev,
        conn.clone(),
        Some(("api_key", br#"{"apiKey":"rotated"}"#)),
    )
    .unwrap();
    assert!(stored_credentials(&repo, &snapshot, "", false).is_err());
    let mut external = conn;
    external.id = "external".into();
    external.connector = "external-test".into();
    external.auth_type = AuthType::ExternalBearer;
    external.secret_ref_id.clear();
    let external = repo.create_connection(external, None).unwrap();
    let external = super::action_connection(&external);
    assert_eq!(
        stored_credentials(&repo, &external, "fresh", false)
            .unwrap()
            .fields["accessToken"],
        "fresh"
    );
    assert!(stored_credentials(&repo, &external, "", false).is_err());
    assert!(stored_credentials(&repo, &external, "", true)
        .unwrap()
        .fields
        .is_empty());
}

#[tokio::test]
async fn development_policy_preserves_apollo_callback_security_and_rejects_fake_subaccount() {
    use appcall_actions::{PolicyConfig, PolicyGate};
    let repo = repository();
    let policy = super::DevelopmentPolicy::new(repo, PolicyConfig::default()).unwrap();
    let request = appcall_actions::ExecuteRequest {
        project_id: "proj_dev".into(),
        connection_id: "c".into(),
        external_account_id: "brand".into(),
        admin_scope: false,
        action: "people.match".into(),
        idempotency_key: String::new(),
        input: json!({}),
        caller_credential: String::new(),
    };
    let mut conn = appcall_actions::Connection {
        id: "c".into(),
        project_id: "proj_dev".into(),
        external_account_id: "brand".into(),
        connector: "apollo".into(),
        status: "active".into(),
        auth_type: "api_key".into(),
        secret_ref_id: None,
    };
    let prepared = policy
        .prepare_input(
            &request,
            &conn,
            json!({"webhook_url":"https://attacker.invalid","reveal_phone_number":true}),
        )
        .await
        .unwrap();
    assert!(prepared.get("webhook_url").is_none());
    assert!(prepared.get("reveal_phone_number").is_none());
    conn.connector = "unipile".into();
    let mut request = request;
    request.action = "emails.send".into();
    assert_eq!(
        policy
            .prepare_input(&request, &conn, json!({"account_id":"attacker"}))
            .await
            .unwrap_err()
            .code,
        "MISSING_SUBACCOUNT"
    );
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
        panic!("unexpected token exchange")
    }
    fn refresh(
        &self,
        _: &appcall_connectors::OAuthConfig,
        _: &appcall_oauth::AppCredentials,
        _: &str,
        _: i64,
    ) -> appcall_oauth::Result<appcall_oauth::TokenSet> {
        panic!("unexpected token refresh")
    }
}
fn service(
    repo: super::MemoryRepository,
    runner: Option<appcall_runner_client::RunnerClient>,
) -> std::sync::Arc<MemoryActions> {
    let oauth = std::sync::Arc::new(
        super::MemoryOAuth::new(
            repo.clone(),
            Default::default(),
            std::sync::Arc::new(NoTokens),
        )
        .unwrap(),
    );
    memory_actions(
        repo,
        runner,
        appcall_actions::PolicyConfig::default(),
        oauth,
    )
    .unwrap()
}
fn connect(repo: &super::MemoryRepository) {
    repo.create_connection(
        appcall_store::Connection {
            id: "c".into(),
            project_id: "proj_dev".into(),
            connector: "test".into(),
            auth_type: appcall_store::AuthType::ApiKey,
            status: appcall_store::Status::Active,
            secret_ref_id: String::new(),
            last_test_status: appcall_store::TestStatus::Unknown,
            external_account_id: "brand".into(),
            credential_owner: appcall_store::CredentialOwner::Brand,
        },
        Some(("api_key", br#"{"apiKey":"stored-private-key"}"#)),
    )
    .unwrap();
}
fn request(key: &str) -> appcall_actions::ExecuteRequest {
    appcall_actions::ExecuteRequest {
        project_id: "proj_dev".into(),
        connection_id: "c".into(),
        external_account_id: "brand".into(),
        admin_scope: false,
        action: "write".into(),
        idempotency_key: key.into(),
        input: json!({"apiKey":"attacker-key","message":"hello"}),
        caller_credential: String::new(),
    }
}
fn read_request(key: &str) -> appcall_actions::ExecuteRequest {
    let mut request = request(key);
    request.action = "read".into();
    request
}
#[tokio::test]
async fn shared_action_service_local_simulation_replay_and_counters_are_consistent() {
    let repo = repository();
    connect(&repo);
    let actions = service(repo.clone(), None);
    let first = actions.execute(request("same")).await.unwrap();
    let second = actions.execute(request("same")).await.unwrap();
    assert_eq!(first.output, second.output);
    assert_eq!(first.output["mode"], "local");
    let data = repo.lock().unwrap();
    assert_eq!(data.usage_events.len(), 1);
    assert_eq!(data.action_logs.len(), 1);
    assert_eq!(data.replay_logs.len(), 1);
    let replay = data.replay_logs.values().next().unwrap();
    let text = replay.sanitized_input.to_string();
    assert!(!text.contains("stored-private-key"));
    assert!(!text.contains("attacker-key"));
    assert_eq!(data.usage_monthly.values().sum::<i64>(), 1);
}

struct KnownBusyRunner;
impl ActionRunner for KnownBusyRunner {
    async fn execute(
        &self,
        _: &Attempt,
        _: serde_json::Value,
        _: u64,
    ) -> std::result::Result<serde_json::Value, appcall_actions::RunnerFailure> {
        Err(appcall_actions::RunnerFailure {
            code: "RUNNER_BUSY".into(),
            outcome: appcall_actions::ActionDispatchOutcome::NotDispatched,
            transient: true,
            ..Default::default()
        })
    }
}

struct ReadFailureThenSuccess(Arc<AtomicUsize>);
impl ActionRunner for ReadFailureThenSuccess {
    async fn execute(
        &self,
        _: &Attempt,
        _: serde_json::Value,
        _: u64,
    ) -> std::result::Result<serde_json::Value, appcall_actions::RunnerFailure> {
        if self.0.fetch_add(1, Ordering::SeqCst) == 0 {
            Err(appcall_actions::RunnerFailure {
                code: "READ_FAILED".into(),
                outcome: appcall_actions::ActionDispatchOutcome::ResponseReceived,
                ..Default::default()
            })
        } else {
            Ok(json!({"ok":true}))
        }
    }
}

struct ReadTimeoutThenSuccess(Arc<AtomicUsize>);
impl ActionRunner for ReadTimeoutThenSuccess {
    async fn execute(
        &self,
        _: &Attempt,
        _: serde_json::Value,
        _: u64,
    ) -> std::result::Result<serde_json::Value, appcall_actions::RunnerFailure> {
        if self.0.fetch_add(1, Ordering::SeqCst) == 0 {
            tokio::time::sleep(Duration::from_millis(250)).await;
            Ok(json!({"late":true}))
        } else {
            Ok(json!({"ok":true}))
        }
    }
}

struct UnknownMutationRunner;
impl ActionRunner for UnknownMutationRunner {
    async fn execute(
        &self,
        _: &Attempt,
        _: serde_json::Value,
        _: u64,
    ) -> std::result::Result<serde_json::Value, appcall_actions::RunnerFailure> {
        Err(appcall_actions::RunnerFailure {
            code: "MUTATION_UNKNOWN".into(),
            outcome: appcall_actions::ActionDispatchOutcome::Unknown,
            ..Default::default()
        })
    }
}

fn service_with_runner<D: ActionRunner>(
    repo: super::MemoryRepository,
    runner: D,
) -> appcall_actions::Service<
    super::MemoryRepository,
    appcall_connectors::Registry,
    MemoryCredentials,
    D,
    super::DevelopmentPolicy,
> {
    let oauth = std::sync::Arc::new(
        super::MemoryOAuth::new(
            repo.clone(),
            Default::default(),
            std::sync::Arc::new(NoTokens),
        )
        .unwrap(),
    );
    appcall_actions::Service::new(
        repo.clone(),
        (**repo.registry()).clone(),
        MemoryCredentials::new(repo.clone(), oauth),
        runner,
        super::DevelopmentPolicy::new(repo, Default::default()).unwrap(),
    )
}

#[tokio::test]
async fn read_failure_releases_same_key_and_retains_failure_history() {
    let repo = repository();
    connect(&repo);
    let calls = Arc::new(AtomicUsize::new(0));
    let service = service_with_runner(repo.clone(), ReadFailureThenSuccess(calls.clone()));

    assert_eq!(
        service
            .execute(read_request("read-failure"))
            .await
            .unwrap_err()
            .code,
        "READ_FAILED"
    );
    {
        let data = repo.lock().unwrap();
        assert!(data.action_claims.is_empty());
        assert!(data.usage_reserved.is_empty());
        assert_eq!(data.active_effects, 0);
        assert_eq!(data.action_logs.len(), 1);
        assert_eq!(data.usage_events.len(), 0);
    }
    let retry = service.execute(read_request("read-failure")).await.unwrap();
    assert_eq!(retry.output, json!({"ok":true}));
    assert_eq!(calls.load(Ordering::SeqCst), 2);
    let data = repo.lock().unwrap();
    assert_eq!(data.action_claims.len(), 1);
    assert!(data.usage_reserved.is_empty());
    assert_eq!(data.active_effects, 0);
    assert_eq!(data.action_logs.len(), 2);
    assert_eq!(data.usage_events.len(), 1);
    assert!(data
        .action_logs
        .values()
        .any(|log| log.error_code == "READ_FAILED"));
}

#[tokio::test]
async fn read_timeout_releases_same_key_and_retains_timeout_history() {
    let repo = repository();
    connect(&repo);
    let calls = Arc::new(AtomicUsize::new(0));
    let service = service_with_runner(repo.clone(), ReadTimeoutThenSuccess(calls.clone()));

    assert_eq!(
        service
            .execute(read_request("read-timeout"))
            .await
            .unwrap_err()
            .code,
        "ACTION_TIMEOUT"
    );
    {
        let data = repo.lock().unwrap();
        assert!(data.action_claims.is_empty());
        assert!(data.usage_reserved.is_empty());
        assert_eq!(data.active_effects, 0);
        assert_eq!(data.action_logs.len(), 1);
        assert_eq!(data.usage_events.len(), 1);
    }
    let retry = service.execute(read_request("read-timeout")).await.unwrap();
    assert_eq!(retry.output, json!({"ok":true}));
    assert_eq!(calls.load(Ordering::SeqCst), 2);
    let data = repo.lock().unwrap();
    assert_eq!(data.action_claims.len(), 1);
    assert!(data.usage_reserved.is_empty());
    assert_eq!(data.active_effects, 0);
    assert_eq!(data.action_logs.len(), 2);
    assert_eq!(data.usage_events.len(), 2);
    assert!(data
        .action_logs
        .values()
        .any(|log| log.error_code == "ACTION_TIMEOUT"));
}

#[tokio::test]
async fn unknown_mutation_failure_keeps_same_key_fenced() {
    let repo = repository();
    connect(&repo);
    let service = service_with_runner(repo.clone(), UnknownMutationRunner);

    assert_eq!(
        service
            .execute(request("mutation-unknown"))
            .await
            .unwrap_err()
            .code,
        "MUTATION_UNKNOWN"
    );
    {
        let data = repo.lock().unwrap();
        assert_eq!(data.action_claims.len(), 1);
        assert_eq!(
            data.action_claims.values().next().unwrap().phase,
            super::state::ClaimPhase::OutcomeUnknown
        );
    }
    assert_eq!(
        service
            .execute(request("mutation-unknown"))
            .await
            .unwrap_err()
            .code,
        "IDEMPOTENCY_IN_PROGRESS"
    );
}

#[tokio::test]
async fn real_memory_runner_busy_cleanup_preserves_typed_retryable_failure() {
    let repo = repository();
    connect(&repo);
    let oauth = std::sync::Arc::new(
        super::MemoryOAuth::new(
            repo.clone(),
            Default::default(),
            std::sync::Arc::new(NoTokens),
        )
        .unwrap(),
    );
    let service = appcall_actions::Service::new(
        repo.clone(),
        (**repo.registry()).clone(),
        MemoryCredentials::new(repo.clone(), oauth),
        KnownBusyRunner,
        super::DevelopmentPolicy::new(repo.clone(), Default::default()).unwrap(),
    );

    for _ in 0..2 {
        let error = service.execute(request("known-busy")).await.unwrap_err();
        assert_eq!(error.code, "RUNNER_BUSY");
        assert!(error.evidence.outcome == appcall_actions::ActionDispatchOutcome::NotDispatched);
    }

    let data = repo.lock().unwrap();
    assert!(data.action_claims.is_empty());
    assert!(data.usage_reserved.is_empty());
    assert_eq!(data.pending_actions, 0);
    assert_eq!(data.active_effects, 0);
    assert_eq!(data.bytes_reserved, 0);
    assert_eq!(data.histories_reserved, 0);
    assert_eq!(data.action_logs.len(), 2);
}

#[test]
#[ignore = "opens a local runner socket"]
fn configured_runner_dispatches_real_rpc_and_idempotent_repeat_never_redispatches() {
    use std::io::{Read, Write};
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let server = std::thread::spawn(move || {
        let (mut socket, _) = listener.accept().unwrap();
        socket
            .set_read_timeout(Some(std::time::Duration::from_secs(5)))
            .unwrap();
        let mut bytes = Vec::new();
        let mut chunk = [0; 4096];
        let split = loop {
            let n = socket.read(&mut chunk).unwrap();
            assert!(n > 0);
            bytes.extend_from_slice(&chunk[..n]);
            if let Some(p) = bytes.windows(4).position(|w| w == b"\r\n\r\n") {
                break p + 4;
            }
        };
        let head = std::str::from_utf8(&bytes[..split]).unwrap();
        let length: usize = head
            .lines()
            .find_map(|l| {
                l.to_lowercase()
                    .strip_prefix("content-length:")
                    .map(|n| n.trim().parse().unwrap())
            })
            .unwrap();
        while bytes.len() < split + length {
            let n = socket.read(&mut chunk).unwrap();
            assert!(n > 0);
            bytes.extend_from_slice(&chunk[..n]);
        }
        let rpc: serde_json::Value = serde_json::from_slice(&bytes[split..split + length]).unwrap();
        assert_eq!(rpc["method"], "connector.action.execute");
        assert_eq!(rpc["params"]["input"]["apiKey"], "stored-private-key");
        let body = json!({"id":rpc["id"],"ok":true,"result":{"output":{"sent":true}}}).to_string();
        write!(socket,"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",body.len(),body).unwrap();
    });
    let runner = appcall_runner_client::RunnerClient::new(&url, "", Default::default()).unwrap();
    let rt = tokio::runtime::Runtime::new().unwrap();
    rt.block_on(async {
        let repo = repository();
        connect(&repo);
        let actions = service(repo.clone(), Some(runner));
        let first = actions.execute(request("same")).await.unwrap();
        assert_eq!(first.output, json!({"sent":true}));
        assert_eq!(
            actions.execute(request("same")).await.unwrap().output,
            first.output
        );
        assert_eq!(repo.lock().unwrap().usage_events.len(), 1);
    });
    server.join().unwrap();
}

#[tokio::test]
async fn local_simulation_cannot_fake_a_valid_normalized_post_or_successful_usage() {
    let repo = repository();
    connect(&repo);
    let actions = service(repo.clone(), None);
    let mut r = request("post");
    r.action = "normalized.post.create".into();
    assert_eq!(
        actions.execute(r).await.unwrap_err().code,
        "ACTION_RESPONSE_INVALID"
    );
    let data = repo.lock().unwrap();
    assert!(data.usage_events.is_empty());
    assert!(data.replay_logs.is_empty());
    assert!(data.usage_reserved.is_empty());
    assert_eq!(
        data.action_logs.values().next().unwrap().error_code,
        "ACTION_RESPONSE_INVALID"
    );
}
#[test]
fn concurrent_dispatch_reservation_cannot_exceed_project_hard_limit() {
    use appcall_actions::ActionRepository;
    let repo = repository();
    connect(&repo);
    repo.configure_usage(appcall_actions::Entitlements {
        action_calls_hard: 1,
        ..Default::default()
    })
    .unwrap();
    let barrier = std::sync::Arc::new(std::sync::Barrier::new(2));
    let threads = (0..2)
        .map(|i| {
            let repo = repo.clone();
            let barrier = barrier.clone();
            std::thread::spawn(move || {
                let rt = tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()
                    .unwrap();
                rt.block_on(async {
                    let mut a = attempt();
                    a.request_id = format!("request{i}");
                    a.key = format!("key{i}");
                    repo.acquire(&a).await.unwrap();
                    let revision = repo.connection("proj_dev", "c").await.unwrap();
                    barrier.wait();
                    repo.mark_dispatched_checked(&a, &revision).await
                })
            })
        })
        .collect::<Vec<_>>();
    let results = threads
        .into_iter()
        .map(|t| t.join().unwrap())
        .collect::<Vec<_>>();
    assert_eq!(results.iter().filter(|r| r.is_ok()).count(), 1);
    assert_eq!(
        results.into_iter().find_map(Result::err).unwrap().code,
        "USAGE_LIMIT_EXCEEDED"
    );
    assert_eq!(repo.lock().unwrap().usage_reserved.len(), 1);
}

#[tokio::test]
async fn shared_circuit_stops_new_dispatches_without_success_usage_or_replay() {
    use appcall_actions::{Circuit, PolicyConfig, RunnerFailure, Service};
    use std::sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    };
    struct Failing(Arc<AtomicUsize>);
    impl ActionRunner for Failing {
        async fn execute(
            &self,
            _: &Attempt,
            _: serde_json::Value,
            _: u64,
        ) -> Result<serde_json::Value, RunnerFailure> {
            self.0.fetch_add(1, Ordering::SeqCst);
            Err(RunnerFailure {
                code: "CONNECTOR_UNAVAILABLE".into(),
                transient: true,
                ..Default::default()
            })
        }
    }
    let repo = repository();
    connect(&repo);
    let oauth = Arc::new(
        super::MemoryOAuth::new(repo.clone(), Default::default(), Arc::new(NoTokens)).unwrap(),
    );
    let credentials = MemoryCredentials::new(repo.clone(), oauth);
    let policy = super::DevelopmentPolicy::new(repo.clone(), PolicyConfig::default()).unwrap();
    let calls = Arc::new(AtomicUsize::new(0));
    let service = Arc::new(
        Service::new(
            repo.clone(),
            (**repo.registry()).clone(),
            credentials,
            Failing(calls.clone()),
            policy,
        )
        .with_circuit(Circuit::new(2, std::time::Duration::from_secs(60))),
    );
    for key in ["one", "two"] {
        assert_eq!(
            service.execute(request(key)).await.unwrap_err().code,
            "CONNECTOR_UNAVAILABLE"
        );
    }
    let shared = service.clone();
    assert_eq!(
        shared.execute(request("three")).await.unwrap_err().code,
        "CIRCUIT_OPEN"
    );
    assert_eq!(calls.load(Ordering::SeqCst), 2);
    let data = repo.lock().unwrap();
    assert!(data.usage_events.is_empty());
    assert!(data.replay_logs.is_empty());
    assert!(data.usage_reserved.is_empty());
}

#[tokio::test]
async fn actual_memory_credentials_reject_status_aba_before_resolution() {
    use appcall_actions::{CredentialResolver, ResolvedActionCredentials};
    use std::sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    };
    struct QueuedCredentials {
        repo: super::MemoryRepository,
        inner: MemoryCredentials,
    }
    impl CredentialResolver for QueuedCredentials {
        async fn resolve(
            &self,
            _: &appcall_actions::Connection,
            _: &str,
        ) -> appcall_actions::Result<serde_json::Map<String, serde_json::Value>> {
            unreachable!()
        }
        async fn resolve_for_attempt(
            &self,
            a: &Attempt,
            c: &appcall_actions::Connection,
            caller: &str,
        ) -> appcall_actions::Result<ResolvedActionCredentials> {
            let (mut current, revision) = self
                .repo
                .get_connection(&c.project_id, None, &c.id)
                .unwrap();
            current.status = appcall_store::Status::Disconnected;
            let mut current = self
                .repo
                .replace_connection(&c.project_id, None, revision, current, None)
                .unwrap();
            current.status = appcall_store::Status::Active;
            self.repo
                .replace_connection(&c.project_id, None, revision + 1, current, None)
                .unwrap();
            self.inner.resolve_for_attempt(a, c, caller).await
        }
    }
    struct CountRunner(Arc<AtomicUsize>);
    impl ActionRunner for CountRunner {
        async fn execute(
            &self,
            _: &Attempt,
            _: serde_json::Value,
            _: u64,
        ) -> Result<serde_json::Value, appcall_actions::RunnerFailure> {
            self.0.fetch_add(1, Ordering::SeqCst);
            Ok(json!({"ok":true}))
        }
    }
    let repo = repository();
    repo.create_connection(
        appcall_store::Connection {
            id: "c".into(),
            project_id: "proj_dev".into(),
            connector: "test".into(),
            auth_type: appcall_store::AuthType::ApiKey,
            status: appcall_store::Status::Active,
            secret_ref_id: String::new(),
            last_test_status: appcall_store::TestStatus::Unknown,
            external_account_id: "brand".into(),
            credential_owner: appcall_store::CredentialOwner::Brand,
        },
        None,
    )
    .unwrap();
    let oauth = Arc::new(
        super::MemoryOAuth::new(repo.clone(), Default::default(), Arc::new(NoTokens)).unwrap(),
    );
    let calls = Arc::new(AtomicUsize::new(0));
    let service = appcall_actions::Service::new(
        repo.clone(),
        (**repo.registry()).clone(),
        QueuedCredentials {
            repo: repo.clone(),
            inner: MemoryCredentials::new(repo.clone(), oauth),
        },
        CountRunner(calls.clone()),
        super::DevelopmentPolicy::new(repo.clone(), Default::default()).unwrap(),
    );
    let result = service.execute(request("queued")).await;
    assert_eq!(result.unwrap_err().code, "CONNECTION_CHANGED");
    assert_eq!(calls.load(Ordering::SeqCst), 0);
    assert!(repo.lock().unwrap().action_claims.is_empty());
}
