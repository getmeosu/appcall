use super::*;
use appcall_actions::{ActionRepository, Attempt};

#[test]
fn acquired_oauth_revision_rejects_pre_resolution_aba_without_token_dispatch() {
    let provider = Arc::new(Expired {
        exchanges: AtomicUsize::new(0),
        refreshes: AtomicUsize::new(0),
    });
    let (repo, setup) = fixture(apps(), provider.clone());
    let started = setup
        .start_checked("proj_dev", Some("a"), "oauth", None, &|| true)
        .unwrap();
    let connection = setup
        .callback_checked("oauth", None, "code", &state_from(&started), &|| true)
        .unwrap();
    let expected = super::super::repository::action_connection(&connection);
    let attempt = Attempt {
        request_id: "oauth-aba".into(),
        project_id: "proj_dev".into(),
        connection_id: connection.id.clone(),
        connector: "oauth".into(),
        external_account_id: "a".into(),
        action: "read".into(),
        key: "oauth-aba".into(),
        input_hash: "hash".into(),
        lease_ms: 10000,
    };
    let runtime = tokio::runtime::Runtime::new().unwrap();
    runtime.block_on(repo.acquire(&attempt)).unwrap();
    let (_, revision) = repo
        .get_connection("proj_dev", Some("a"), &connection.id)
        .unwrap();
    let mut changed = connection.clone();
    changed.status = Status::Disconnected;
    repo.replace_connection("proj_dev", Some("a"), revision, changed, None)
        .unwrap();
    repo.replace_connection(
        "proj_dev",
        Some("a"),
        revision + 1,
        connection.clone(),
        None,
    )
    .unwrap();
    assert_eq!(
        repo.get_connection("proj_dev", Some("a"), &connection.id)
            .unwrap()
            .0,
        connection
    );
    assert!(setup
        .oauth()
        .resolve_tracked_for_attempt(&attempt, &expected, &|| true)
        .is_err());
    assert_eq!(provider.refreshes.load(Ordering::SeqCst), 0);
    assert_eq!(provider.exchanges.load(Ordering::SeqCst), 1);
    runtime.block_on(repo.release_pending(&attempt)).unwrap();
    let state = repo.lock().unwrap();
    assert_eq!(state.active_effects, 0);
    assert!(state.action_logs.is_empty());
    assert!(state.replay_logs.is_empty());
}

#[test]
fn actual_managed_credentials_refresh_then_aba_never_dispatches_action() {
    use appcall_actions::{ActionRunner, PolicyGate};
    use serde_json::{json, Value};
    struct AbaPolicy(MemoryRepository);
    impl PolicyGate for AbaPolicy {
        async fn authorize(
            &self,
            _: &appcall_actions::ExecuteRequest,
            _: &appcall_actions::Connection,
            _: &appcall_actions::Operation,
        ) -> appcall_actions::Result<()> {
            Ok(())
        }
        async fn reserve(
            &self,
            _: &appcall_actions::ExecuteRequest,
            c: &appcall_actions::Connection,
            _: &appcall_actions::Operation,
            _: &Value,
        ) -> appcall_actions::Result<appcall_actions::PolicyReservation> {
            let (mut current, revision) =
                self.0.get_connection(&c.project_id, None, &c.id).unwrap();
            current.status = Status::Disconnected;
            let mut current = self
                .0
                .replace_connection(&c.project_id, None, revision, current, None)
                .unwrap();
            current.status = Status::Active;
            self.0
                .replace_connection(&c.project_id, None, revision + 1, current, None)
                .unwrap();
            Ok(appcall_actions::PolicyReservation::default())
        }
    }
    struct Runner(Arc<AtomicUsize>);
    impl ActionRunner for Runner {
        async fn execute(
            &self,
            _: &Attempt,
            _: Value,
            _: u64,
        ) -> std::result::Result<Value, appcall_actions::RunnerFailure> {
            self.0.fetch_add(1, Ordering::SeqCst);
            Ok(json!({"ok":true}))
        }
    }
    let provider = Arc::new(Rotating {
        entered: Arc::new(std::sync::Barrier::new(1)),
        release: Arc::new(std::sync::Barrier::new(1)),
        refreshes: AtomicUsize::new(0),
    });
    let (repo, setup) = fixture(apps(), provider.clone());
    let start = setup
        .start_checked("proj_dev", Some("a"), "oauth", None, &|| true)
        .unwrap();
    let old = setup
        .callback_checked("oauth", None, "code", &state_from(&start), &|| true)
        .unwrap();
    let calls = Arc::new(AtomicUsize::new(0));
    let service = appcall_actions::Service::new(
        repo.clone(),
        (**repo.registry()).clone(),
        super::super::MemoryCredentials::new(repo.clone(), setup.oauth().clone()),
        Runner(calls.clone()),
        AbaPolicy(repo.clone()),
    );
    let runtime = tokio::runtime::Runtime::new().unwrap();
    let result = runtime.block_on(service.execute(appcall_actions::ExecuteRequest {
        project_id: "proj_dev".into(),
        connection_id: old.id.clone(),
        external_account_id: "a".into(),
        admin_scope: false,
        action: "read".into(),
        idempotency_key: "managed-aba".into(),
        input: json!({}),
        caller_credential: String::new(),
    }));
    assert_eq!(result.unwrap_err().code, "CONNECTION_CHANGED");
    assert_eq!(provider.refreshes.load(Ordering::SeqCst), 1);
    assert_eq!(calls.load(Ordering::SeqCst), 0);
    assert_ne!(
        repo.get_connection("proj_dev", Some("a"), &old.id)
            .unwrap()
            .0
            .secret_ref_id,
        old.secret_ref_id
    );
    let state = repo.lock().unwrap();
    assert!(state.action_claims.is_empty());
    assert!(state.action_logs.is_empty());
    assert!(state.replay_logs.is_empty());
    assert_eq!(state.active_effects, 0);
}
