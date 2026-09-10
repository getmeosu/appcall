use super::*;
use appcall_actions::{Acquisition, ActionRepository, Attempt};
use appcall_connectors::Registry;
use appcall_store::{AuthType, Connection, CredentialOwner, Status, TestStatus};
use std::sync::Arc;
fn repository(limits: MemoryLimits) -> MemoryRepository {
    let manifest = serde_json::json!({"key":"test","name":"Test","version":"1","runtime":"bun","models":["item"],"auth":{"type":"none"},"network":{"egress":"none"},"operations":{"write":{"kind":"action","timeoutMs":100,"maxInputBytes":128,"maxResponseBytes":128,"sideEffect":"write"}}});
    let registry = Registry::from_connectors([appcall_connectors::Connector::from_bytes(
        &serde_json::to_vec(&manifest).unwrap(),
    )
    .unwrap()]);
    MemoryRepository::new(
        DevelopmentPermit::validate(false, None).unwrap(),
        Arc::new(registry.unwrap()),
        limits,
    )
    .unwrap()
}
fn connection(id: &str, project: &str, brand: &str) -> Connection {
    Connection {
        id: id.into(),
        project_id: project.into(),
        connector: "test".into(),
        auth_type: AuthType::ApiKey,
        status: Status::Active,
        secret_ref_id: String::new(),
        last_test_status: TestStatus::Unknown,
        external_account_id: brand.into(),
        credential_owner: CredentialOwner::Brand,
    }
}
fn attempt(id: &str, key: &str) -> Attempt {
    Attempt {
        request_id: id.into(),
        project_id: "proj_dev".into(),
        connection_id: "c".into(),
        connector: "test".into(),
        external_account_id: "brand".into(),
        action: "write".into(),
        key: key.into(),
        input_hash: "hash".into(),
        lease_ms: 10000,
    }
}
#[test]
fn permits_only_absent_database_development() {
    assert!(DevelopmentPermit::validate(true, None).is_err());
    assert!(DevelopmentPermit::validate(false, Some(" ")).is_err());
    assert!(DevelopmentPermit::validate(false, Some("invalid database")).is_err());
    assert!(DevelopmentPermit::validate(false, None).is_ok());
}

fn assert_reuse_fence(authorizing: bool) {
    let repo = repository(MemoryLimits::default());
    let mut existing = connection("existing", "proj_dev", "brand");
    if authorizing {
        existing.status = Status::Authorizing;
    } else {
        existing.credential_owner = CredentialOwner::Platform;
    }
    let existing = repo
        .create_connection(existing, Some(("api_key", b"original-synthetic")))
        .unwrap();
    let before = repo
        .get_connection("proj_dev", Some("brand"), &existing.id)
        .unwrap();
    let result = repo.create_or_reuse_connection_checked(
        connection("candidate", "proj_dev", "brand"),
        Some(("api_key", b"replacement-synthetic")),
        &|| true,
    );
    assert!(
        matches!(result, Err(MemoryError::Conflict)),
        "reuse fence must reject without mutation"
    );
    assert_eq!(
        repo.get_connection("proj_dev", Some("brand"), &existing.id)
            .unwrap(),
        before
    );
    assert!(repo
        .get_connection("proj_dev", Some("brand"), "candidate")
        .is_err());
    let (_, secret) = repo
        .secret("proj_dev", &existing.id, &existing.secret_ref_id)
        .unwrap();
    assert_eq!(secret.as_bytes(), b"original-synthetic");
}
#[test]
fn atomic_reuse_rejects_authorizing_without_mutation() {
    assert_reuse_fence(true);
}
#[test]
fn atomic_reuse_rejects_mismatched_owner_without_mutation() {
    assert_reuse_fence(false);
}
#[test]
fn scoped_vault_and_connection_revision_are_atomic() {
    let r = repository(MemoryLimits::default());
    let old = r
        .create_connection(
            connection("c", "proj_dev", "brand"),
            Some(("api_key", b"synthetic-secret")),
        )
        .unwrap();
    assert!(r.get_connection("other", None, "c").is_err());
    assert!(r.get_connection("proj_dev", Some("other"), "c").is_err());
    assert!(r.secret("other", "c", &old.secret_ref_id).is_err());
    assert_eq!(
        r.secret("proj_dev", "c", &old.secret_ref_id)
            .unwrap()
            .1
            .as_bytes(),
        b"synthetic-secret"
    );
    let (_, rev) = r.get_connection("proj_dev", Some("brand"), "c").unwrap();
    let new = r
        .replace_connection(
            "proj_dev",
            Some("brand"),
            rev,
            old.clone(),
            Some(("api_key", b"replacement")),
        )
        .unwrap();
    assert_ne!(new.secret_ref_id, old.secret_ref_id);
    assert!(r.secret("proj_dev", "c", &old.secret_ref_id).is_err());
    assert!(r
        .replace_connection("proj_dev", Some("brand"), rev, old, None)
        .is_err());
    assert!(repository(MemoryLimits::default())
        .get_connection("proj_dev", None, "c")
        .is_err());
}
#[tokio::test]
async fn action_claims_fence_stale_owner_and_commit_usage_once() {
    let r = repository(MemoryLimits::default());
    r.create_connection(connection("c", "proj_dev", "brand"), None)
        .unwrap();
    let a = attempt("one", "key");
    assert!(matches!(
        r.acquire(&a).await.unwrap(),
        Acquisition::Acquired
    ));
    assert_eq!(
        r.acquire(&attempt("two", "key")).await.unwrap_err().code,
        "IDEMPOTENCY_IN_PROGRESS"
    );
    let revision = r.connection("proj_dev", "c").await.unwrap();
    r.mark_dispatched_checked(&a, &revision).await.unwrap();
    assert!(r
        .finish(&attempt("two", "key"), Some(&serde_json::json!({})), None)
        .await
        .is_err());
    r.record_replay(&a, &serde_json::json!({"safe":true}))
        .await
        .unwrap();
    r.finish(&a, Some(&serde_json::json!({"id":"ok"})), None)
        .await
        .unwrap();
    assert!(matches!(
        r.acquire(&attempt("three", "key")).await.unwrap(),
        Acquisition::Cached(_)
    ));
    assert!(r
        .finish(&a, Some(&serde_json::json!({})), None)
        .await
        .is_err());
    assert_eq!(
        r.list_usage_events("proj_dev", Some("brand"))
            .unwrap()
            .len(),
        1
    );
    assert!(r.list_usage_events("other", None).unwrap().is_empty());
    assert!(r
        .list_usage_events("proj_dev", Some("other"))
        .unwrap()
        .is_empty());
}

#[tokio::test]
async fn proven_not_dispatched_finalizer_releases_memory_admission() {
    let r = repository(MemoryLimits::default());
    r.create_connection(connection("c", "proj_dev", "brand"), None)
        .unwrap();
    let first = attempt("one", "known-busy");
    r.acquire(&first).await.unwrap();
    let revision = r.connection("proj_dev", "c").await.unwrap();
    let reservation = appcall_actions::PolicyReservation::default();
    r.mark_dispatched_checked_with_reservation(&first, &revision, &reservation)
        .await
        .unwrap();

    let (reserved_bytes, reserved_histories) = {
        let data = r.lock().unwrap();
        assert_eq!(data.action_claims.len(), 1);
        assert_eq!(data.pending_actions, 0);
        assert_eq!(data.active_effects, 1);
        assert_eq!(data.usage_reserved.len(), 1);
        assert!(data.bytes_reserved > 0);
        assert_eq!(data.histories_reserved, 3);
        (data.bytes_reserved, data.histories_reserved)
    };

    r.release_pending(&first).await.unwrap();
    r.release_quota_with_reservation(&first, &reservation)
        .await
        .unwrap();
    assert_eq!(r.lock().unwrap().action_claims.len(), 1);

    let mut stale = first.clone();
    stale.request_id = "stale-owner".into();
    assert_eq!(
        r.finish_not_dispatched_with_reservation(&stale, &reservation, "RUNNER_BUSY")
            .await
            .unwrap_err()
            .code,
        "IDEMPOTENCY_IN_PROGRESS"
    );
    {
        let data = r.lock().unwrap();
        assert_eq!(data.action_claims.len(), 1);
        assert_eq!(data.usage_reserved.len(), 1);
        assert!(data.action_logs.is_empty());
    }

    r.finish_not_dispatched_with_reservation(&first, &reservation, "RUNNER_BUSY")
        .await
        .unwrap();
    let data = r.lock().unwrap();
    assert!(data.action_claims.is_empty());
    assert!(data.usage_reserved.is_empty());
    assert_eq!(data.pending_actions, 0);
    assert_eq!(data.active_effects, 0);
    assert_eq!(data.bytes_reserved, 0);
    assert_eq!(data.histories_reserved, 0);
    assert!(reserved_bytes > 0);
    assert_eq!(reserved_histories, 3);
    assert_eq!(data.action_logs.len(), 1);
    assert_eq!(
        data.action_logs.values().next().unwrap().error_code,
        "RUNNER_BUSY"
    );
    drop(data);

    let mut retry = first.clone();
    retry.request_id = "retry-owner".into();
    assert!(matches!(
        r.acquire(&retry).await.unwrap(),
        Acquisition::Acquired
    ));
}
#[tokio::test]
async fn capacity_reserved_before_dispatch_and_unknown_never_retries() {
    let r = repository(MemoryLimits {
        histories: 4,
        concurrent_effects: 1,
        ..MemoryLimits::default()
    });
    r.create_connection(connection("c", "proj_dev", "brand"), None)
        .unwrap();
    let a = attempt("one", "key");
    r.acquire(&a).await.unwrap();
    assert_eq!(
        r.acquire(&attempt("two", "other")).await.unwrap_err().code,
        "MEMORY_CAPACITY_EXCEEDED"
    );
    r.mark_dispatched(&a).await.unwrap();
    r.release_pending(&a).await.unwrap();
    r.finish(&a, None, Some("RUNNER_UNAVAILABLE"))
        .await
        .unwrap();
    assert_eq!(
        r.acquire(&attempt("three", "key")).await.unwrap_err().code,
        "IDEMPOTENCY_IN_PROGRESS"
    );
}
#[tokio::test]
async fn reconnect_before_dispatch_rejects_old_credentials() {
    let r = repository(MemoryLimits::default());
    let c = r
        .create_connection(
            connection("c", "proj_dev", "brand"),
            Some(("api_key", b"old")),
        )
        .unwrap();
    let old = r.connection("proj_dev", "c").await.unwrap();
    let a = attempt("one", "key");
    r.acquire(&a).await.unwrap();
    let (_, rev) = r.get_connection("proj_dev", None, "c").unwrap();
    r.replace_connection("proj_dev", None, rev, c, Some(("api_key", b"new")))
        .unwrap();
    assert_eq!(
        r.mark_dispatched_checked(&a, &old).await.unwrap_err().code,
        "CONNECTION_CHANGED"
    );
    r.release_pending(&a).await.unwrap();
    assert!(matches!(
        r.acquire(&attempt("two", "key")).await.unwrap(),
        Acquisition::Acquired
    ));
}

#[tokio::test]
async fn expired_pending_attempt_is_replaced_but_late_owner_cannot_dispatch() {
    let r = repository(MemoryLimits::default());
    r.create_connection(connection("c", "proj_dev", "brand"), None)
        .unwrap();
    let a = attempt("one", "key");
    r.acquire(&a).await.unwrap();
    r.lock()
        .unwrap()
        .action_claims
        .values_mut()
        .next()
        .unwrap()
        .expires_at = std::time::Instant::now() - std::time::Duration::from_secs(1);
    let b = attempt("two", "key");
    r.acquire(&b).await.unwrap();
    assert!(r.mark_dispatched(&a).await.is_err());
    r.release_pending(&a).await.unwrap();
    r.mark_dispatched(&b).await.unwrap();
    assert_eq!(r.lock().unwrap().active_effects, 1);
}
#[tokio::test]
async fn concurrent_same_idempotency_key_admits_exactly_one_request() {
    let r = repository(MemoryLimits::default());
    r.create_connection(connection("c", "proj_dev", "brand"), None)
        .unwrap();
    let barrier = Arc::new(std::sync::Barrier::new(2));
    let handles: Vec<_> = ["one", "two"]
        .into_iter()
        .map(|id| {
            let r = r.clone();
            let barrier = barrier.clone();
            std::thread::spawn(move || {
                let runtime = tokio::runtime::Builder::new_current_thread()
                    .build()
                    .unwrap();
                barrier.wait();
                runtime.block_on(r.acquire(&attempt(id, "key")))
            })
        })
        .collect();
    let admitted = handles
        .into_iter()
        .map(|h| h.join().unwrap().is_ok())
        .filter(|v| *v)
        .count();
    assert_eq!(admitted, 1);
    assert_eq!(r.lock().unwrap().action_claims.len(), 1);
}
#[tokio::test]
async fn action_completion_uses_reserved_capacity_even_when_store_is_full() {
    let r = repository(MemoryLimits::default());
    r.create_connection(connection("c", "proj_dev", "brand"), None)
        .unwrap();
    let a = attempt("one", "key");
    r.acquire(&a).await.unwrap();
    r.mark_dispatched(&a).await.unwrap();
    {
        let mut d = r.lock().unwrap();
        d.bytes_used = r.limits().payload_bytes - d.bytes_reserved;
    }
    r.record_replay(&a, &serde_json::json!({"safe":"x"}))
        .await
        .unwrap();
    r.finish(&a, Some(&serde_json::json!({"id":"ok"})), None)
        .await
        .unwrap();
    let d = r.lock().unwrap();
    assert!(d.bytes_used <= r.limits().payload_bytes);
    assert_eq!(d.bytes_reserved, 0);
    assert_eq!(d.histories_reserved, 0);
}
#[test]
fn byte_connection_and_cancelled_creation_limits_leave_state_unchanged() {
    let r = repository(MemoryLimits {
        connections: 1,
        ..MemoryLimits::default()
    });
    assert!(r
        .create_connection_checked(
            connection("c", "proj_dev", "brand"),
            Some(("api_key", b"secret")),
            &|| false
        )
        .is_err());
    assert_eq!(r.list_connections("proj_dev", None).unwrap().len(), 0);
    r.create_connection(connection("c", "proj_dev", "brand"), None)
        .unwrap();
    assert!(matches!(
        r.create_connection(connection("d", "proj_dev", "other"), None),
        Err(MemoryError::Capacity)
    ));
    let small = repository(MemoryLimits {
        payload_bytes: 32,
        ..MemoryLimits::default()
    });
    assert!(small
        .create_connection(
            connection("c", "proj_dev", "brand"),
            Some(("api_key", b"secret"))
        )
        .is_err());
    let d = small.lock().unwrap();
    assert!(d.connections.is_empty());
    assert!(d.secrets.is_empty());
    assert_eq!(d.bytes_used, 0);
}
#[tokio::test]
async fn request_id_collision_cannot_overwrite_other_action_history() {
    let r = repository(MemoryLimits::default());
    r.create_connection(connection("c", "proj_dev", "brand"), None)
        .unwrap();
    r.acquire(&attempt("same", "one")).await.unwrap();
    assert!(r.acquire(&attempt("same", "two")).await.is_err());
}

#[test]
fn ciphertext_is_process_keyed_and_cancellation_after_lock_does_not_insert() {
    let r = repository(MemoryLimits::default());
    let calls = std::sync::atomic::AtomicUsize::new(0);
    assert!(r
        .create_connection_checked(
            connection("c", "proj_dev", "brand"),
            Some(("api_key", b"private-provider-token")),
            &|| calls.fetch_add(1, std::sync::atomic::Ordering::SeqCst) == 0
        )
        .is_err());
    assert!(r.lock().unwrap().secrets.is_empty());
    let c = r
        .create_connection(
            connection("c", "proj_dev", "brand"),
            Some(("api_key", b"private-provider-token")),
        )
        .unwrap();
    let other = repository(MemoryLimits::default());
    let d = r.lock().unwrap();
    let e = &d.secrets[&c.secret_ref_id].envelope;
    assert!(!e
        .ciphertext
        .windows(b"private-provider-token".len())
        .any(|b| b == b"private-provider-token"));
    assert!(other.state.vault.decrypt(e).is_err());
}
#[tokio::test]
async fn status_aba_cannot_dispatch_old_connection_revision() {
    let r = repository(MemoryLimits::default());
    let mut c = r
        .create_connection(connection("c", "proj_dev", "brand"), None)
        .unwrap();
    let expected = r.connection("proj_dev", "c").await.unwrap();
    let a = attempt("one", "key");
    r.acquire(&a).await.unwrap();
    c.status = Status::Disconnected;
    let mut c = r.replace_connection("proj_dev", None, 1, c, None).unwrap();
    c.status = Status::Active;
    r.replace_connection("proj_dev", None, 2, c, None).unwrap();
    assert_eq!(
        r.mark_dispatched_checked(&a, &expected)
            .await
            .unwrap_err()
            .code,
        "CONNECTION_CHANGED"
    );
}

#[tokio::test]
async fn replay_expansion_capacity_is_rejected_before_provider_effect() {
    struct Credentials;
    impl appcall_actions::CredentialResolver for Credentials {
        async fn resolve(
            &self,
            _: &appcall_actions::Connection,
            _: &str,
        ) -> appcall_actions::Result<serde_json::Map<String, serde_json::Value>> {
            Ok(serde_json::json!({"apiKey":"x"})
                .as_object()
                .unwrap()
                .clone())
        }
    }
    struct Runner(Arc<std::sync::atomic::AtomicUsize>);
    impl appcall_actions::ActionRunner for Runner {
        async fn execute(
            &self,
            _: &Attempt,
            _: serde_json::Value,
            _: u64,
        ) -> std::result::Result<serde_json::Value, appcall_actions::RunnerFailure> {
            self.0.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            Ok(serde_json::json!({"id":"ok"}))
        }
    }
    let manifest = serde_json::json!({"key":"test","name":"Test","version":"1","runtime":"bun","models":["item"],"auth":{"type":"none"},"network":{"egress":"none"},"operations":{"write":{"kind":"action","timeoutMs":1000,"maxInputBytes":4096,"maxResponseBytes":128,"sideEffect":"write"}}});
    let registry = Registry::from_connectors([appcall_connectors::Connector::from_bytes(
        &serde_json::to_vec(&manifest).unwrap(),
    )
    .unwrap()])
    .unwrap();
    for payload_bytes in [30000, 64000] {
        let r = MemoryRepository::new(
            DevelopmentPermit::validate(false, None).unwrap(),
            Arc::new(registry.clone()),
            MemoryLimits {
                payload_bytes,
                ..MemoryLimits::default()
            },
        )
        .unwrap();
        r.create_connection(connection("c", "proj_dev", "brand"), None)
            .unwrap();
        let called = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let policy = super::policy::DevelopmentPolicy::new(
            r.clone(),
            appcall_actions::PolicyConfig::default(),
        )
        .unwrap();
        let service = appcall_actions::Service::new(
            r.clone(),
            registry.clone(),
            Credentials,
            Runner(called.clone()),
            policy,
        );
        let result = service
            .execute(appcall_actions::ExecuteRequest {
                project_id: "proj_dev".into(),
                connection_id: "c".into(),
                external_account_id: "brand".into(),
                admin_scope: false,
                action: "write".into(),
                idempotency_key: "key".into(),
                input: serde_json::json!({"text":"x".repeat(3500)}),
                caller_credential: String::new(),
            })
            .await;
        if payload_bytes == 30000 {
            assert_eq!(result.unwrap_err().code, "MEMORY_CAPACITY_EXCEEDED");
            assert_eq!(called.load(std::sync::atomic::Ordering::SeqCst), 0);
            assert!(r.lock().unwrap().action_claims.is_empty());
        } else {
            assert_eq!(result.unwrap().output, serde_json::json!({"id":"ok"}));
            assert_eq!(called.load(std::sync::atomic::Ordering::SeqCst), 1);
            let d = r.lock().unwrap();
            assert_eq!(d.replay_logs.len(), 1);
            assert_eq!(d.usage_events.len(), 1);
            assert_eq!(d.bytes_reserved, 0);
        }
    }
}

#[tokio::test]
async fn pending_storage_admission_and_actual_effect_slots_are_separate_and_bounded() {
    let r = repository(MemoryLimits {
        concurrent_effects: 1,
        ..MemoryLimits::default()
    });
    r.create_connection(connection("c", "proj_dev", "brand"), None)
        .unwrap();
    let first = attempt("one", "first");
    let second = attempt("two", "second");
    r.acquire(&first).await.unwrap();
    assert_eq!(r.lock().unwrap().active_effects, 0);
    assert!(
        r.acquire(&second).await.is_err(),
        "pending queue itself remains bounded"
    );
    r.mark_dispatched(&first).await.unwrap();
    r.acquire(&second).await.unwrap();
    assert_eq!(
        r.mark_dispatched(&second).await.unwrap_err().code,
        "MEMORY_CAPACITY_EXCEEDED"
    );
    assert_eq!(r.lock().unwrap().active_effects, 1);
    assert_eq!(r.lock().unwrap().usage_reserved.len(), 1);
    r.release_pending(&second).await.unwrap();
    assert_eq!(
        r.lock().unwrap().active_effects,
        1,
        "pending cancellation cannot free another effect"
    );
    r.acquire(&second).await.unwrap();
    r.release_pending(&first).await.unwrap();
    assert!(
        r.mark_dispatched(&second).await.is_err(),
        "unknown dispatched work retains its effect slot"
    );
    r.finish(&first, None, Some("RUNNER_UNAVAILABLE"))
        .await
        .unwrap();
    r.mark_dispatched(&second).await.unwrap();
    assert!(r
        .finish(&first, None, Some("RUNNER_UNAVAILABLE"))
        .await
        .is_err());
    assert_eq!(
        r.lock().unwrap().active_effects,
        1,
        "late duplicate completion cannot release second effect"
    );
    r.finish(&second, Some(&serde_json::json!({"ok":true})), None)
        .await
        .unwrap();
    assert_eq!(r.lock().unwrap().active_effects, 0);
    assert_eq!(r.list_usage_events("proj_dev", None).unwrap().len(), 1);
}

#[tokio::test]
async fn refreshed_secret_does_not_excuse_a_later_status_aba() {
    let r = repository(MemoryLimits::default());
    let c = r
        .create_connection(
            connection("c", "proj_dev", "brand"),
            Some(("api_key", b"old")),
        )
        .unwrap();
    let a = attempt("one", "key");
    r.acquire(&a).await.unwrap();
    let mut c = r
        .replace_connection("proj_dev", None, 1, c, Some(("api_key", b"new")))
        .unwrap();
    let resolved = action_connection(&c);
    c.status = Status::Disconnected;
    let mut c = r.replace_connection("proj_dev", None, 2, c, None).unwrap();
    c.status = Status::Active;
    r.replace_connection("proj_dev", None, 3, c, None).unwrap();
    assert_eq!(
        r.mark_dispatched_checked(&a, &resolved)
            .await
            .unwrap_err()
            .code,
        "CONNECTION_CHANGED"
    );
    assert_eq!(r.lock().unwrap().active_effects, 0);
}

#[tokio::test]
async fn refreshed_provenance_then_status_aba_never_reaches_runner() {
    use appcall_actions::{ActionRunner, CredentialResolver, PolicyGate};
    use serde_json::{json, Map, Value};
    struct Credentials(MemoryRepository);
    impl CredentialResolver for Credentials {
        async fn resolve(
            &self,
            _: &appcall_actions::Connection,
            _: &str,
        ) -> appcall_actions::Result<Map<String, Value>> {
            unreachable!()
        }
        async fn resolve_for_attempt(
            &self,
            a: &Attempt,
            c: &appcall_actions::Connection,
            _: &str,
        ) -> appcall_actions::Result<appcall_actions::ResolvedActionCredentials> {
            let (old, revision) = self.0.get_connection(&c.project_id, None, &c.id).unwrap();
            let fresh = self
                .0
                .replace_connection(
                    &c.project_id,
                    None,
                    revision,
                    old,
                    Some(("api_key", b"fresh")),
                )
                .unwrap();
            let fresh = action_connection(&fresh);
            let (revision, _) = self.0.secret_for_connection_versioned(&fresh).unwrap();
            self.0.bind_resolved_revision(a, &fresh, revision)?;
            Ok(appcall_actions::ResolvedActionCredentials {
                connection: fresh,
                fields: Map::new(),
            })
        }
    }
    struct Policy(MemoryRepository);
    impl PolicyGate for Policy {
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
    struct Runner(Arc<std::sync::atomic::AtomicUsize>);
    impl ActionRunner for Runner {
        async fn execute(
            &self,
            _: &Attempt,
            _: Value,
            _: u64,
        ) -> std::result::Result<Value, appcall_actions::RunnerFailure> {
            self.0.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            Ok(json!({"ok":true}))
        }
    }
    let r = repository(MemoryLimits::default());
    r.create_connection(
        connection("c", "proj_dev", "brand"),
        Some(("api_key", b"old")),
    )
    .unwrap();
    let calls = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let service = appcall_actions::Service::new(
        r.clone(),
        (**r.registry()).clone(),
        Credentials(r.clone()),
        Runner(calls.clone()),
        Policy(r.clone()),
    );
    let result = service
        .execute(appcall_actions::ExecuteRequest {
            project_id: "proj_dev".into(),
            connection_id: "c".into(),
            external_account_id: "brand".into(),
            admin_scope: false,
            action: "write".into(),
            idempotency_key: "key".into(),
            input: json!({}),
            caller_credential: String::new(),
        })
        .await;
    assert_eq!(result.unwrap_err().code, "CONNECTION_CHANGED");
    assert_eq!(calls.load(std::sync::atomic::Ordering::SeqCst), 0);
    assert!(r.lock().unwrap().action_claims.is_empty());
}
