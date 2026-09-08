use appcall_actions::*;
use serde_json::{json, Map, Value};
use std::sync::{Arc, Mutex};
#[path = "execution/evidence.rs"]
mod evidence;
#[derive(Default)]
struct State {
    claims: usize,
    releases: usize,
    revision: Option<Connection>,
    marked: bool,
    cached: Option<Value>,
    fail_finish: bool,
    fail_replay: bool,
    replays: Vec<Value>,
}
struct Repo {
    state: Arc<Mutex<State>>,
    brand: String,
}
impl ActionRepository for Repo {
    async fn record_replay(&self, _: &Attempt, input: &Value) -> Result<String> {
        let mut state = self.state.lock().unwrap();
        if state.fail_replay {
            return Err(ActionError::new("STORAGE_UNAVAILABLE"));
        }
        state.replays.push(input.clone());
        Ok("replay_test".into())
    }
    async fn connection(&self, p: &str, id: &str) -> Result<Connection> {
        if let Some(revision) = &self.state.lock().unwrap().revision {
            return Ok(revision.clone());
        }
        Ok(Connection {
            id: id.into(),
            project_id: p.into(),
            external_account_id: self.brand.clone(),
            connector: "test".into(),
            status: "active".into(),
            auth_type: "api_key".into(),
            secret_ref_id: Some("secret".into()),
        })
    }
    async fn acquire(&self, _: &Attempt) -> Result<Acquisition> {
        let mut s = self.state.lock().unwrap();
        if let Some(v) = &s.cached {
            return Ok(Acquisition::Cached(v.clone()));
        };
        if s.marked {
            return Err(ActionError::new("IDEMPOTENCY_IN_PROGRESS"));
        };
        s.claims += 1;
        Ok(Acquisition::Acquired)
    }
    async fn mark_dispatched(&self, _: &Attempt) -> Result<()> {
        self.state.lock().unwrap().marked = true;
        Ok(())
    }
    async fn release_pending(&self, _: &Attempt) -> Result<()> {
        self.state.lock().unwrap().releases += 1;
        Ok(())
    }
    async fn finish(&self, _: &Attempt, v: Option<&Value>, _: Option<&str>) -> Result<()> {
        let mut s = self.state.lock().unwrap();
        if s.fail_finish {
            return Err(ActionError::new("STORAGE_UNAVAILABLE"));
        };
        if let Some(v) = v {
            s.cached = Some(v.clone())
        };
        Ok(())
    }
}
struct Catalog {
    read: bool,
}
impl ActionCatalog for Catalog {
    fn operation(&self, _: &str, _: &str) -> Result<Operation> {
        Ok(Operation {
            read_only: self.read,
            timeout_ms: 1000,
            max_input_bytes: 1024,
            max_response_bytes: 1024,
            credential_fields: vec!["apiKey".into(), "baseUrl".into()],
        })
    }
    fn validate_input(&self, _: &str, _: &str, v: &Value) -> Result<()> {
        if v.is_object() {
            Ok(())
        } else {
            Err(ActionError::new("INVALID_ACTION_INPUT"))
        }
    }
    fn validate_output(&self, _: &str, _: &str, _: &Value) -> Result<()> {
        Ok(())
    }
}
struct Credentials;
impl CredentialResolver for Credentials {
    async fn resolve(&self, _: &Connection, _: &str) -> Result<Map<String, Value>> {
        Ok(json!({"apiKey":"fresh"}).as_object().unwrap().clone())
    }
}
struct Allow;
impl PolicyGate for Allow {
    async fn authorize(&self, _: &ExecuteRequest, _: &Connection, _: &Operation) -> Result<()> {
        Ok(())
    }
}
struct Runner {
    calls: Arc<Mutex<Vec<Value>>>,
    fail: bool,
}
impl ActionRunner for Runner {
    async fn execute(
        &self,
        _: &Attempt,
        v: Value,
        _: u64,
    ) -> std::result::Result<Value, RunnerFailure> {
        self.calls.lock().unwrap().push(v);
        if self.fail {
            Err(RunnerFailure {
                code: "CONNECTOR_UNAVAILABLE".into(),
                transient: true,
                retry_after_ms: 0,
                ..RunnerFailure::default()
            })
        } else {
            Ok(json!({"ok":true}))
        }
    }
}
fn request(brand: &str) -> ExecuteRequest {
    ExecuteRequest {
        project_id: "p".into(),
        connection_id: "c".into(),
        external_account_id: brand.into(),
        admin_scope: false,
        action: "send".into(),
        idempotency_key: "key".into(),
        input: json!({"apiKey":"forged","baseUrl":"https://evil","text":"hi"}),
        caller_credential: String::new(),
    }
}
#[tokio::test]
async fn cross_brand_cache_is_denied_before_repository_claim() {
    let state = Arc::new(Mutex::new(State {
        cached: Some(json!({"private":true})),
        ..Default::default()
    }));
    let calls = Arc::new(Mutex::new(vec![]));
    let svc = Service::new(
        Repo {
            state: state.clone(),
            brand: "owner".into(),
        },
        Catalog { read: true },
        Credentials,
        Runner {
            calls: calls.clone(),
            fail: false,
        },
        Allow,
    );
    assert_eq!(
        svc.execute(request("other")).await.unwrap_err().code,
        "CONNECTION_NOT_FOUND"
    );
    assert_eq!(state.lock().unwrap().claims, 0);
    assert!(calls.lock().unwrap().is_empty());
}
#[tokio::test]
async fn mutations_do_not_retry_and_unknown_outcome_stays_fenced() {
    let state = Arc::new(Mutex::new(State::default()));
    let calls = Arc::new(Mutex::new(vec![]));
    let svc = Service::new(
        Repo {
            state,
            brand: "owner".into(),
        },
        Catalog { read: false },
        Credentials,
        Runner {
            calls: calls.clone(),
            fail: true,
        },
        Allow,
    );
    assert_eq!(
        svc.execute(request("owner")).await.unwrap_err().code,
        "CONNECTOR_UNAVAILABLE"
    );
    assert_eq!(
        svc.execute(request("owner")).await.unwrap_err().code,
        "IDEMPOTENCY_IN_PROGRESS"
    );
    assert_eq!(calls.lock().unwrap().len(), 1);
}
#[tokio::test]
async fn credentials_are_fresh_and_alternate_routes_removed() {
    let state = Arc::new(Mutex::new(State::default()));
    let calls = Arc::new(Mutex::new(vec![]));
    let svc = Service::new(
        Repo {
            state,
            brand: "owner".into(),
        },
        Catalog { read: true },
        Credentials,
        Runner {
            calls: calls.clone(),
            fail: false,
        },
        Allow,
    );
    svc.execute(request("owner")).await.unwrap();
    let calls = calls.lock().unwrap();
    assert_eq!(calls[0]["apiKey"], "fresh");
    assert!(calls[0].get("baseUrl").is_none());
    assert_eq!(calls[0]["text"], "hi");
}
#[tokio::test]
async fn read_only_transient_failures_retry_within_budget() {
    let state = Arc::new(Mutex::new(State::default()));
    let calls = Arc::new(Mutex::new(vec![]));
    let svc = Service::new(
        Repo {
            state,
            brand: "owner".into(),
        },
        Catalog { read: true },
        Credentials,
        Runner {
            calls: calls.clone(),
            fail: true,
        },
        Allow,
    );
    assert!(svc.execute(request("owner")).await.is_err());
    assert_eq!(calls.lock().unwrap().len(), 3);
}
#[tokio::test]
async fn committed_provider_success_without_local_finish_stays_unknown() {
    let state = Arc::new(Mutex::new(State {
        fail_finish: true,
        ..Default::default()
    }));
    let calls = Arc::new(Mutex::new(vec![]));
    let svc = Service::new(
        Repo {
            state,
            brand: "owner".into(),
        },
        Catalog { read: false },
        Credentials,
        Runner {
            calls: calls.clone(),
            fail: false,
        },
        Allow,
    );
    assert_eq!(
        svc.execute(request("owner")).await.unwrap_err().code,
        "STORAGE_UNAVAILABLE"
    );
    assert_eq!(
        svc.execute(request("owner")).await.unwrap_err().code,
        "IDEMPOTENCY_IN_PROGRESS"
    );
    assert_eq!(calls.lock().unwrap().len(), 1);
}
#[tokio::test]
async fn default_policy_explicitly_rejects_unported_mutation_controls() {
    let state = Arc::new(Mutex::new(State::default()));
    let calls = Arc::new(Mutex::new(vec![]));
    let svc = Service::new(
        Repo {
            state: state.clone(),
            brand: "owner".into(),
        },
        Catalog { read: false },
        Credentials,
        Runner {
            calls: calls.clone(),
            fail: false,
        },
        ReadOnlyPolicy,
    );
    assert_eq!(
        svc.execute(request("owner")).await.unwrap_err().code,
        "POLICY_UNSUPPORTED"
    );
    assert_eq!(state.lock().unwrap().claims, 0);
    assert!(calls.lock().unwrap().is_empty());
}

struct BoundaryRunner {
    output: Value,
    delay_ms: u64,
}
impl ActionRunner for BoundaryRunner {
    async fn execute(
        &self,
        _: &Attempt,
        _: Value,
        _: u64,
    ) -> std::result::Result<Value, RunnerFailure> {
        tokio::time::sleep(std::time::Duration::from_millis(self.delay_ms)).await;
        Ok(self.output.clone())
    }
}
#[tokio::test]
async fn oversized_output_is_not_cached_and_dispatch_remains_fenced() {
    let state = Arc::new(Mutex::new(State::default()));
    let svc = Service::new(
        Repo {
            state: state.clone(),
            brand: "owner".into(),
        },
        Catalog { read: false },
        Credentials,
        BoundaryRunner {
            output: json!({"data":"x".repeat(1024)}),
            delay_ms: 0,
        },
        Allow,
    );
    assert_eq!(
        svc.execute(request("owner")).await.unwrap_err().code,
        "ACTION_RESPONSE_TOO_LARGE"
    );
    assert!(state.lock().unwrap().cached.is_none());
    assert_eq!(
        svc.execute(request("owner")).await.unwrap_err().code,
        "IDEMPOTENCY_IN_PROGRESS"
    );
}
#[tokio::test]
async fn timeout_after_dispatch_does_not_allow_mutation_replay() {
    let state = Arc::new(Mutex::new(State::default()));
    let svc = Service::new(
        Repo {
            state: state.clone(),
            brand: "owner".into(),
        },
        Catalog { read: false },
        Credentials,
        BoundaryRunner {
            output: json!({"ok":true}),
            delay_ms: 2000,
        },
        Allow,
    );
    assert_eq!(
        svc.execute(request("owner")).await.unwrap_err().code,
        "ACTION_TIMEOUT"
    );
    assert!(state.lock().unwrap().cached.is_none());
    assert_eq!(
        svc.execute(request("owner")).await.unwrap_err().code,
        "IDEMPOTENCY_IN_PROGRESS"
    );
}
#[tokio::test]
async fn oversized_caller_input_is_rejected_before_claim() {
    let state = Arc::new(Mutex::new(State::default()));
    let svc = Service::new(
        Repo {
            state: state.clone(),
            brand: "owner".into(),
        },
        Catalog { read: false },
        Credentials,
        BoundaryRunner {
            output: json!({"ok":true}),
            delay_ms: 0,
        },
        Allow,
    );
    let mut req = request("owner");
    req.input = json!({"text":"x".repeat(1024)});
    assert_eq!(
        svc.execute(req).await.unwrap_err().code,
        "ACTION_INPUT_TOO_LARGE"
    );
    assert_eq!(state.lock().unwrap().claims, 0);
}
#[tokio::test]
async fn idempotency_key_preserves_go_ascii_and_length_contract() {
    let state = Arc::new(Mutex::new(State::default()));
    let svc = Service::new(
        Repo {
            state: state.clone(),
            brand: "owner".into(),
        },
        Catalog { read: true },
        Credentials,
        BoundaryRunner {
            output: json!({}),
            delay_ms: 0,
        },
        Allow,
    );
    for key in [
        "a".repeat(129),
        "contains space".into(),
        "\n".into(),
        "é".into(),
    ] {
        let mut req = request("owner");
        req.idempotency_key = key;
        assert_eq!(
            svc.execute(req).await.unwrap_err().code,
            "INVALID_ACTION_INPUT"
        );
    }
    assert_eq!(state.lock().unwrap().claims, 0);
}

struct ManifestRepo(Repo, &'static str);
impl ActionRepository for ManifestRepo {
    async fn record_replay(&self, _: &Attempt, _: &Value) -> Result<String> {
        Ok("replay_manifest".into())
    }
    async fn connection(&self, p: &str, id: &str) -> Result<Connection> {
        let mut c = self.0.connection(p, id).await?;
        c.connector = self.1.into();
        Ok(c)
    }
    async fn acquire(&self, a: &Attempt) -> Result<Acquisition> {
        self.0.acquire(a).await
    }
    async fn mark_dispatched(&self, a: &Attempt) -> Result<()> {
        self.0.mark_dispatched(a).await
    }
    async fn release_pending(&self, a: &Attempt) -> Result<()> {
        self.0.release_pending(a).await
    }
    async fn finish(&self, a: &Attempt, o: Option<&Value>, e: Option<&str>) -> Result<()> {
        self.0.finish(a, o, e).await
    }
}
struct EmptyCredentials;
impl CredentialResolver for EmptyCredentials {
    async fn resolve(&self, _: &Connection, _: &str) -> Result<Map<String, Value>> {
        Ok(Map::new())
    }
}
#[tokio::test]
async fn real_manifest_controls_credential_requirement_with_legacy_stored_auth_type() {
    for connector in ["ashby", "greenhouse", "lever", "csv", "slack"] {
        let registry = appcall_connectors::Registry::load(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../runner/connectors"
        ))
        .unwrap();
        let repo = ManifestRepo(
            Repo {
                state: Arc::new(Mutex::new(State::default())),
                brand: "owner".into(),
            },
            connector,
        );
        let service = Service::new(
            repo,
            registry,
            EmptyCredentials,
            BoundaryRunner {
                output: json!({"status":"ok"}),
                delay_ms: 0,
            },
            Allow,
        );
        let mut req = request("owner");
        req.action = "healthcheck".into();
        req.input = json!({});
        let result = service.execute(req).await;
        if connector == "slack" {
            assert_eq!(result.unwrap_err().code, "MISSING_CREDENTIAL");
        } else {
            assert!(result.is_ok(), "{connector}: {result:?}");
        }
    }
}

struct UnknownFailureRunner;
impl ActionRunner for UnknownFailureRunner {
    async fn execute(
        &self,
        _: &Attempt,
        _: Value,
        _: u64,
    ) -> std::result::Result<Value, RunnerFailure> {
        Err(RunnerFailure {
            code: "upstream-secret-response".into(),
            transient: false,
            retry_after_ms: 0,
            ..RunnerFailure::default()
        })
    }
}
#[tokio::test]
async fn unknown_provider_failure_is_redacted_without_clearing_mutation_fence() {
    let state = Arc::new(Mutex::new(State::default()));
    let service = Service::new(
        Repo {
            state: state.clone(),
            brand: "owner".into(),
        },
        Catalog { read: false },
        Credentials,
        UnknownFailureRunner,
        Allow,
    );
    let error = service.execute(request("owner")).await.unwrap_err();
    assert_eq!(error.code, "ACTION_FAILED");
    assert!(!error.request_id.is_empty());
    assert!(!error.to_string().contains("upstream-secret-response"));
    assert!(state.lock().unwrap().cached.is_none());
    assert_eq!(
        service.execute(request("owner")).await.unwrap_err().code,
        "IDEMPOTENCY_IN_PROGRESS"
    );
}

#[tokio::test]
async fn successful_action_returns_replay_history_id() {
    let state = Arc::new(Mutex::new(State::default()));
    let service = Service::new(
        Repo {
            state,
            brand: "brand".into(),
        },
        Catalog { read: false },
        Credentials,
        Runner {
            calls: Arc::new(Mutex::new(Vec::new())),
            fail: false,
        },
        Allow,
    );
    let result = service.execute(request("brand")).await.unwrap();
    assert!(!result.replay_log_id.is_empty());
}

#[tokio::test]
async fn replay_failure_preserves_dispatched_mutation_fence() {
    let state = Arc::new(Mutex::new(State {
        fail_replay: true,
        ..Default::default()
    }));
    let calls = Arc::new(Mutex::new(Vec::new()));
    let service = Service::new(
        Repo {
            state: state.clone(),
            brand: "brand".into(),
        },
        Catalog { read: false },
        Credentials,
        Runner {
            calls: calls.clone(),
            fail: false,
        },
        Allow,
    );
    assert_eq!(
        service.execute(request("brand")).await.unwrap_err().code,
        "STORAGE_UNAVAILABLE"
    );
    assert_eq!(
        service.execute(request("brand")).await.unwrap_err().code,
        "IDEMPOTENCY_IN_PROGRESS"
    );
    assert_eq!(calls.lock().unwrap().len(), 1);
    let state = state.lock().unwrap();
    assert!(state.cached.is_none());
    assert!(state.replays.is_empty());
}
#[tokio::test]
async fn replay_persists_only_sanitized_original_input_once() {
    let state = Arc::new(Mutex::new(State::default()));
    let service = Service::new(
        Repo {
            state: state.clone(),
            brand: "brand".into(),
        },
        Catalog { read: false },
        Credentials,
        Runner {
            calls: Arc::new(Mutex::new(Vec::new())),
            fail: false,
        },
        Allow,
    );
    let mut r = request("brand");
    r.input = json!({"apiKey":"forged","baseUrl":"https://evil","text":"fresh"});
    assert_eq!(
        service.execute(r).await.unwrap().replay_log_id,
        "replay_test"
    );
    let state = state.lock().unwrap();
    assert_eq!(
        state.replays,
        vec![json!({"apiKey":"[REDACTED]","baseUrl":"[REDACTED]","text":"[REDACTED]"})]
    );
}
struct OversizeRunner;
impl ActionRunner for OversizeRunner {
    async fn execute(
        &self,
        _: &Attempt,
        _: Value,
        _: u64,
    ) -> std::result::Result<Value, RunnerFailure> {
        Ok(json!({"text":"x".repeat(2048)}))
    }
}
#[tokio::test]
async fn oversize_response_carries_counts_and_never_records_replay() {
    let state = Arc::new(Mutex::new(State::default()));
    let service = Service::new(
        Repo {
            state: state.clone(),
            brand: "brand".into(),
        },
        Catalog { read: false },
        Credentials,
        OversizeRunner,
        Allow,
    );
    let error = service.execute(request("brand")).await.unwrap_err();
    assert_eq!(error.code, "ACTION_RESPONSE_TOO_LARGE");
    let size = error.detail.unwrap().response_size.unwrap();
    assert_eq!(size.actual_bytes, 2059);
    assert_eq!(size.limit_bytes, 1024);
    assert!(state.lock().unwrap().replays.is_empty());
}

struct ReboundCredentials(&'static str);
impl CredentialResolver for ReboundCredentials {
    async fn resolve(&self, c: &Connection, caller: &str) -> Result<Map<String, Value>> {
        Ok(self.resolve_tracked(c, caller).await?.fields)
    }
    async fn resolve_tracked(&self, c: &Connection, _: &str) -> Result<ResolvedActionCredentials> {
        let mut revision = c.clone();
        match self.0 {
            "owner" => revision.external_account_id = "other-brand".into(),
            "connector" => revision.connector = "other-provider".into(),
            "auth" => revision.auth_type = "oauth2".into(),
            "status" => revision.status = "disconnected".into(),
            "secret" => revision.secret_ref_id = Some("uncommitted-secret".into()),
            _ => unreachable!(),
        }
        Ok(ResolvedActionCredentials {
            connection: revision,
            fields: json!({"apiKey":"other-owner-secret"})
                .as_object()
                .unwrap()
                .clone(),
        })
    }
}
#[tokio::test]
async fn changed_credential_revision_never_reaches_runner() {
    for change in ["owner", "connector", "auth", "status", "secret"] {
        let state = Arc::new(Mutex::new(State::default()));
        let calls = Arc::new(Mutex::new(vec![]));
        let svc = Service::new(
            Repo {
                state: state.clone(),
                brand: String::new(),
            },
            Catalog { read: false },
            ReboundCredentials(change),
            Runner {
                calls: calls.clone(),
                fail: false,
            },
            Allow,
        );
        let result = svc.execute(request("brand")).await;
        assert!(
            result.is_err(),
            "changed {change} revision must not dispatch"
        );
        assert!(
            calls.lock().unwrap().is_empty(),
            "changed {change} reached runner"
        );
        assert!(!state.lock().unwrap().marked);
    }
}

struct RotatingCredentials(Arc<Mutex<State>>);
impl CredentialResolver for RotatingCredentials {
    async fn resolve(&self, c: &Connection, caller: &str) -> Result<Map<String, Value>> {
        Ok(self.resolve_tracked(c, caller).await?.fields)
    }
    async fn resolve_tracked(&self, c: &Connection, _: &str) -> Result<ResolvedActionCredentials> {
        let mut revision = c.clone();
        revision.secret_ref_id = Some("rotated".into());
        self.0.lock().unwrap().revision = Some(revision.clone());
        Ok(ResolvedActionCredentials {
            connection: revision,
            fields: json!({"apiKey":"freshly-rotated"})
                .as_object()
                .unwrap()
                .clone(),
        })
    }
}
struct RevisionPolicy;
impl PolicyGate for RevisionPolicy {
    async fn authorize(&self, _: &ExecuteRequest, _: &Connection, _: &Operation) -> Result<()> {
        Ok(())
    }
    async fn prepare_input(
        &self,
        _: &ExecuteRequest,
        c: &Connection,
        input: Value,
    ) -> Result<Value> {
        assert_eq!(c.secret_ref_id.as_deref(), Some("rotated"));
        Ok(input)
    }
}
#[tokio::test]
async fn committed_rotation_carries_its_revision_into_policy_and_dispatch() {
    let state = Arc::new(Mutex::new(State::default()));
    let calls = Arc::new(Mutex::new(vec![]));
    let svc = Service::new(
        Repo {
            state: state.clone(),
            brand: "brand".into(),
        },
        Catalog { read: false },
        RotatingCredentials(state.clone()),
        Runner {
            calls: calls.clone(),
            fail: false,
        },
        RevisionPolicy,
    );
    svc.execute(request("brand")).await.unwrap();
    assert_eq!(calls.lock().unwrap()[0]["apiKey"], "freshly-rotated");
    assert!(state.lock().unwrap().marked);
}

#[tokio::test]
async fn rebuilt_service_retains_injected_circuit_state() {
    let circuit = Circuit::new(1, std::time::Duration::from_secs(60));
    let calls = Arc::new(Mutex::new(vec![]));
    for first in [true, false] {
        let svc = Service::new(
            Repo {
                state: Arc::new(Mutex::new(State::default())),
                brand: "brand".into(),
            },
            Catalog { read: false },
            Credentials,
            Runner {
                calls: calls.clone(),
                fail: true,
            },
            Allow,
        )
        .with_circuit(circuit.clone());
        let error = svc.execute(request("brand")).await.unwrap_err();
        assert_eq!(
            error.code,
            if first {
                "CONNECTOR_UNAVAILABLE"
            } else {
                "CIRCUIT_OPEN"
            }
        );
    }
    assert_eq!(calls.lock().unwrap().len(), 1);
}
