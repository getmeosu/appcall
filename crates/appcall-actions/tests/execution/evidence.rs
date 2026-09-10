use super::*;
use std::collections::VecDeque;
use ActionDispatchOutcome::{NotDispatched, ResponseReceived, Unknown};

struct Scripted(Mutex<VecDeque<std::result::Result<Value, RunnerFailure>>>);
impl ActionRunner for Scripted {
    async fn execute(
        &self,
        _: &Attempt,
        _: Value,
        _: u64,
    ) -> std::result::Result<Value, RunnerFailure> {
        self.0
            .lock()
            .unwrap()
            .pop_front()
            .expect("unexpected runner retry")
    }
}
fn failure(
    outcome: ActionDispatchOutcome,
    hint: Option<u64>,
    transient: bool,
) -> std::result::Result<Value, RunnerFailure> {
    Err(RunnerFailure {
        code: "CONNECTOR_UNAVAILABLE".into(),
        outcome,
        retry_after_seconds: hint,
        transient,
        ..Default::default()
    })
}
fn busy_failure() -> std::result::Result<Value, RunnerFailure> {
    Err(RunnerFailure {
        code: "RUNNER_BUSY".into(),
        outcome: NotDispatched,
        transient: true,
        retry_after_ms: 0,
        ..Default::default()
    })
}
async fn run(steps: Vec<std::result::Result<Value, RunnerFailure>>, state: State) -> ActionError {
    Service::new(
        Repo {
            state: Arc::new(Mutex::new(state)),
            brand: "owner".into(),
        },
        Catalog { read: true },
        Credentials,
        Scripted(Mutex::new(steps.into())),
        Allow,
    )
    .execute(request("owner"))
    .await
    .unwrap_err()
}

struct RejectingCatalog;
impl ActionCatalog for RejectingCatalog {
    fn operation(&self, c: &str, a: &str) -> Result<Operation> {
        Catalog { read: true }.operation(c, a)
    }
    fn validate_input(&self, _: &str, _: &str, _: &Value) -> Result<()> {
        Err(ActionError::new("INVALID_ACTION_INPUT"))
    }
    fn validate_output(&self, _: &str, _: &str, _: &Value) -> Result<()> {
        Ok(())
    }
}
#[tokio::test]
async fn evidence_schema_rejection_is_local_validation_before_rpc() {
    let error = Service::new(
        Repo {
            state: Arc::new(Mutex::new(State::default())),
            brand: "owner".into(),
        },
        RejectingCatalog,
        Credentials,
        Scripted(Mutex::new(VecDeque::new())),
        Allow,
    )
    .execute(request("owner"))
    .await
    .unwrap_err();
    assert_eq!(error.code, "INVALID_ACTION_INPUT");
    assert_eq!(error.evidence.outcome, NotDispatched);
    assert_eq!(error.evidence.origin, ActionFailureOrigin::LocalValidation);
    assert_eq!(error.evidence.retry_after_seconds, None);
}
#[tokio::test]
async fn evidence_acquire_failure_does_not_deny_prior_dispatch() {
    let error = run(
        vec![],
        State {
            marked: true,
            ..Default::default()
        },
    )
    .await;
    assert_eq!(error.code, "IDEMPOTENCY_IN_PROGRESS");
    assert_eq!(error.evidence.outcome, Unknown);
    assert_eq!(error.evidence.origin, ActionFailureOrigin::Unknown);
    assert_eq!(error.evidence.retry_after_seconds, None);
}

#[tokio::test]
async fn evidence_all_attempts_and_only_final_retry_hint_survive() {
    for (first, expected) in [
        (Unknown, Unknown),
        (ResponseReceived, ResponseReceived),
        (NotDispatched, NotDispatched),
    ] {
        for final_hint in [None, Some(0), Some(7)] {
            let error = run(
                vec![
                    failure(first, Some(99), true),
                    failure(NotDispatched, final_hint, false),
                ],
                State::default(),
            )
            .await;
            assert_eq!(error.evidence.outcome, expected);
            assert_eq!(error.evidence.origin, ActionFailureOrigin::Runner);
    assert_eq!(error.evidence.retry_after_seconds, final_hint);
        }
    }
}

#[tokio::test]
async fn runner_busy_retries_read_only_within_bound_and_releases_claim() {
    let state = Arc::new(Mutex::new(State::default()));
    let steps = (0..6).map(|_| busy_failure()).collect();
    let service = Service::new(
        Repo {
            state: state.clone(),
            brand: "owner".into(),
        },
        Catalog { read: true },
        Credentials,
        Scripted(Mutex::new(steps)),
        Allow,
    );

    for _ in 0..2 {
        let error = service.execute(request("owner")).await.unwrap_err();
        assert_eq!(error.code, "RUNNER_BUSY");
        assert_eq!(error.evidence.outcome, NotDispatched);
        assert_eq!(error.evidence.origin, ActionFailureOrigin::Runner);
        assert_eq!(error.evidence.retry_after_seconds, None);
    }

    let state = state.lock().unwrap();
    assert_eq!(state.claims, 2, "released idempotency claim can be acquired again");
    assert_eq!(state.releases, 2);
    assert_eq!(state.not_dispatched_releases, 2);
    assert!(!state.marked, "known pre-dispatch failure clears the dispatched marker");
}

#[tokio::test]
async fn response_received_failure_releases_quota_but_unknown_retains_it() {
    for (outcome, expected_releases) in [(ResponseReceived, 1), (Unknown, 0)] {
        let state = Arc::new(Mutex::new(State::default()));
        let error = Service::new(
            Repo {
                state: state.clone(),
                brand: "owner".into(),
            },
            Catalog { read: true },
            Credentials,
            Scripted(Mutex::new(vec![failure(outcome, None, false)].into())),
            Allow,
        )
        .execute(request("owner"))
        .await
        .unwrap_err();
        assert_eq!(error.evidence.outcome, outcome);
        assert_eq!(state.lock().unwrap().releases, expected_releases);
    }
}

#[tokio::test]
async fn evidence_success_then_storage_failure_keeps_response_received() {
    for state in [
        State {
            fail_finish: true,
            ..Default::default()
        },
        State {
            fail_replay: true,
            ..Default::default()
        },
    ] {
        let error = run(vec![Ok(json!({"ok":true}))], state).await;
        assert_eq!(error.code, "STORAGE_UNAVAILABLE");
        assert_eq!(error.evidence.outcome, ResponseReceived);
    }
}

#[tokio::test]
async fn evidence_post_response_validation_and_failed_finish_preserve_context() {
    let error = run(
        vec![Ok(json!({"large": "x".repeat(2048)}))],
        State::default(),
    )
    .await;
    assert_eq!(error.code, "ACTION_RESPONSE_TOO_LARGE");
    assert_eq!(error.evidence.outcome, ResponseReceived);
    assert!(error.detail.as_ref().unwrap().response_size.is_some());
    let error = run(
        vec![failure(NotDispatched, Some(0), false)],
        State {
            fail_finish: true,
            ..Default::default()
        },
    )
    .await;
    assert_eq!(error.code, "STORAGE_UNAVAILABLE");
    assert_eq!(error.evidence.outcome, NotDispatched);
    assert_eq!(error.evidence.origin, ActionFailureOrigin::Runner);
    assert_eq!(error.evidence.retry_after_seconds, Some(0));
}

struct ReserveRejected;
impl PolicyGate for ReserveRejected {
    async fn authorize(&self, _: &ExecuteRequest, _: &Connection, _: &Operation) -> Result<()> {
        Ok(())
    }
    async fn reserve(
        &self,
        _: &ExecuteRequest,
        _: &Connection,
        _: &Operation,
        _: &Value,
    ) -> Result<PolicyReservation> {
        Err(ActionError::new("USAGE_LIMIT_EXCEEDED"))
    }
}

#[tokio::test]
async fn evidence_reservation_rejection_releases_claim_without_dispatch() {
    let state = Arc::new(Mutex::new(State::default()));
    let calls = Arc::new(Mutex::new(vec![]));
    let error = Service::new(
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
        ReserveRejected,
    )
    .execute(request("owner"))
    .await
    .unwrap_err();
    assert_eq!(error.code, "USAGE_LIMIT_EXCEEDED");
    assert_eq!(error.evidence.origin, ActionFailureOrigin::LocalAdmission);
    assert_eq!(error.evidence.outcome, NotDispatched);
    assert_eq!(error.evidence.retry_after_seconds, None);
    assert!(calls.lock().unwrap().is_empty());
    let state = state.lock().unwrap();
    assert_eq!(state.claims, 1);
    assert_eq!(state.releases, 1);
    assert!(!state.marked);
    assert_eq!(state.cached, None);
}

struct Policy {
    reject: bool,
    fail_observation: bool,
}
impl PolicyGate for Policy {
    async fn authorize(&self, _: &ExecuteRequest, _: &Connection, _: &Operation) -> Result<()> {
        if self.reject {
            Err(ActionError::new("USAGE_LIMIT_EXCEEDED"))
        } else {
            Ok(())
        }
    }
    async fn observe_failure(
        &self,
        _: &ExecuteRequest,
        _: &Connection,
        _: &PolicyReservation,
        _: &str,
    ) -> Result<()> {
        if self.fail_observation {
            Err(ActionError::new("STORAGE_UNAVAILABLE"))
        } else {
            Ok(())
        }
    }
}
#[tokio::test]
async fn evidence_local_quota_and_runner_quota_have_distinct_origins() {
    for local in [true, false] {
        let runner = Scripted(Mutex::new(
            vec![Err(RunnerFailure {
                code: "USAGE_LIMIT_EXCEEDED".into(),
                outcome: ResponseReceived,
                ..Default::default()
            })]
            .into(),
        ));
        let error = Service::new(
            Repo {
                state: Arc::new(Mutex::new(State::default())),
                brand: "owner".into(),
            },
            Catalog { read: true },
            Credentials,
            runner,
            Policy {
                reject: local,
                fail_observation: false,
            },
        )
        .execute(request("owner"))
        .await
        .unwrap_err();
        assert_eq!(error.code, "USAGE_LIMIT_EXCEEDED");
        assert_eq!(
            error.evidence.origin,
            if local {
                ActionFailureOrigin::LocalAdmission
            } else {
                ActionFailureOrigin::Runner
            }
        );
        assert_eq!(
            error.evidence.outcome,
            if local {
                NotDispatched
            } else {
                ResponseReceived
            }
        );
    }
}
#[tokio::test]
async fn evidence_observation_failure_retains_runner_context() {
    let error = Service::new(
        Repo {
            state: Arc::new(Mutex::new(State::default())),
            brand: "owner".into(),
        },
        Catalog { read: true },
        Credentials,
        Scripted(Mutex::new(vec![failure(Unknown, Some(3), false)].into())),
        Policy {
            reject: false,
            fail_observation: true,
        },
    )
    .execute(request("owner"))
    .await
    .unwrap_err();
    assert_eq!(error.code, "STORAGE_UNAVAILABLE");
    assert_eq!(error.evidence.outcome, Unknown);
    assert_eq!(error.evidence.origin, ActionFailureOrigin::Runner);
    assert_eq!(error.evidence.retry_after_seconds, Some(3));
}

struct ShortCatalog;
impl ActionCatalog for ShortCatalog {
    fn operation(&self, c: &str, a: &str) -> Result<Operation> {
        Ok(Operation {
            timeout_ms: 40,
            ..Catalog { read: true }.operation(c, a)?
        })
    }
    fn validate_input(&self, _: &str, _: &str, _: &Value) -> Result<()> {
        Ok(())
    }
    fn validate_output(&self, _: &str, _: &str, _: &Value) -> Result<()> {
        Ok(())
    }
}
struct SlowCredentials(bool);
impl CredentialResolver for SlowCredentials {
    async fn resolve(&self, c: &Connection, s: &str) -> Result<Map<String, Value>> {
        if self.0 {
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        }
        Credentials.resolve(c, s).await
    }
}
struct TimedRunner(bool);
impl ActionRunner for TimedRunner {
    async fn execute(
        &self,
        _: &Attempt,
        _: Value,
        _: u64,
    ) -> std::result::Result<Value, RunnerFailure> {
        if self.0 {
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        }
        Err(RunnerFailure {
            code: "CONNECTOR_UNAVAILABLE".into(),
            transient: true,
            outcome: NotDispatched,
            retry_after_ms: 100,
            retry_after_seconds: Some(0),
            ..Default::default()
        })
    }
}
#[tokio::test]
async fn evidence_timeout_before_rpc_during_rpc_and_retry_sleep() {
    for (before, during, expected, origin) in [
        (true, false, NotDispatched, ActionFailureOrigin::Unknown),
        (false, true, Unknown, ActionFailureOrigin::Runner),
        (false, false, NotDispatched, ActionFailureOrigin::Runner),
    ] {
        let error = Service::new(
            Repo {
                state: Arc::new(Mutex::new(State::default())),
                brand: "owner".into(),
            },
            ShortCatalog,
            SlowCredentials(before),
            TimedRunner(during),
            Allow,
        )
        .execute(request("owner"))
        .await
        .unwrap_err();
        assert_eq!(error.code, "ACTION_TIMEOUT");
        assert_eq!(error.evidence.outcome, expected);
        assert_eq!(error.evidence.origin, origin);
    }
}
