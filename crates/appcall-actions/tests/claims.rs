use appcall_actions::claims::{
    inspect_action_claim, reconcile_action_claim, ActionClaimReconciliation, ActionClaimScope,
    ClaimErrorCode, ClaimResolution,
};
use postgres::{Client, NoTls};
use uuid::Uuid;

fn scope(account: &str, request_id: &str) -> ActionClaimScope {
    ActionClaimScope::new("project-a", account, "claim-key", request_id).unwrap()
}

fn proven(scope: ActionClaimScope) -> ActionClaimReconciliation {
    ActionClaimReconciliation::new(
        scope,
        "operator-1",
        "ticket://claims/123",
        ClaimResolution::ProvenNotDispatched,
    )
    .unwrap()
}

#[test]
fn claim_scope_and_evidence_are_bounded_and_reject_controls() {
    assert_eq!(
        ActionClaimScope::new("", "brand-a", "key", "req-1")
            .unwrap_err()
            .code,
        ClaimErrorCode::InvalidInput
    );
    assert_eq!(
        ActionClaimScope::new("project-a", "brand-a", "key\n", "req-1")
            .unwrap_err()
            .code,
        ClaimErrorCode::InvalidInput
    );
    assert_eq!(
        ActionClaimReconciliation::new(
            scope("brand-a", "req-1"),
            "operator\n1",
            "ticket://claims/123",
            ClaimResolution::ProvenNotDispatched,
        )
        .unwrap_err()
        .code,
        ClaimErrorCode::InvalidInput
    );
    assert_eq!(
        ActionClaimReconciliation::new(
            scope("brand-a", "req-1"),
            "operator-1",
            "x".repeat(257),
            ClaimResolution::ProvenNotDispatched,
        )
        .unwrap_err()
        .code,
        ClaimErrorCode::InvalidInput
    );
}

#[test]
#[ignore = "requires APPCALL_TEST_DATABASE_URL or APPCALL_ENGINE_POSTGRES_URL"]
fn inspection_is_scoped_to_immutable_claim_metadata_without_current_connection_lookup() {
    with_database(|client| {
        seed_claim(client, "brand-a", "req-1", true, true);
        seed_reservation(client, "reservation-1", "dispatched", "brand-a", "2026-09");
        client
            .execute(
                "UPDATE connections SET external_account_id='retargeted-account' WHERE id=$1",
                &[&"connection-original"],
            )
            .unwrap();
        let inspection = inspect_action_claim(client, &scope("brand-a", "req-1")).unwrap();
        assert_eq!(inspection.project_id, "project-a");
        assert_eq!(inspection.idempotency_key, "claim-key");
        assert_eq!(inspection.request_id, "req-1");
        assert_eq!(inspection.connection_id, "connection-original");
        assert_eq!(inspection.external_account_id.as_deref(), Some("brand-a"));
        assert_eq!(inspection.connector, "fixture");
        assert_eq!(inspection.action, "messages.send");
        assert_eq!(inspection.input_hash, "hash-original");
        assert!(inspection.dispatched);
        assert!(inspection.lease_expired);
        assert!(inspection.reconciliation_allowed);
        assert!(inspection.reservation.is_some());
    });
}

#[test]
#[ignore = "requires APPCALL_TEST_DATABASE_URL or APPCALL_ENGINE_POSTGRES_URL"]
fn wrong_request_id_never_reconciles_the_claim() {
    with_database(|client| {
        seed_claim(client, "brand-a", "req-1", true, true);
        let command = proven(scope("brand-a", "wrong-request"));
        let mut tx = client.transaction().unwrap();
        let error = reconcile_action_claim(&mut tx, &command).unwrap_err();
        assert_eq!(error.code, ClaimErrorCode::RequestMismatch);
        tx.rollback().unwrap();
        assert_eq!(count(client, "action_idempotency_claims"), 1);
        assert_eq!(count(client, "action_claim_reconciliation_audits"), 0);
    });
}

#[test]
#[ignore = "requires APPCALL_TEST_DATABASE_URL or APPCALL_ENGINE_POSTGRES_URL"]
fn foreign_account_with_wrong_request_does_not_reveal_claim_existence() {
    with_database(|client| {
        seed_claim(client, "brand-a", "req-1", true, true);
        let command = proven(
            ActionClaimScope::new("project-a", "foreign-account", "claim-key", "wrong-request")
                .unwrap(),
        );
        let mut tx = client.transaction().unwrap();
        let error = reconcile_action_claim(&mut tx, &command).unwrap_err();
        assert_eq!(error.code, ClaimErrorCode::NotFound);
        tx.rollback().unwrap();
        assert_eq!(count(client, "action_idempotency_claims"), 1);
        assert_eq!(count(client, "action_claim_reconciliation_audits"), 0);
    });
}

#[test]
#[ignore = "requires APPCALL_TEST_DATABASE_URL or APPCALL_ENGINE_POSTGRES_URL"]
fn live_or_pending_claims_are_not_quiescent_reconciliation_targets() {
    with_database(|client| {
        seed_claim(client, "brand-a", "live-request", true, false);
        let mut tx = client.transaction().unwrap();
        let error =
            reconcile_action_claim(&mut tx, &proven(scope("brand-a", "live-request"))).unwrap_err();
        assert_eq!(error.code, ClaimErrorCode::ClaimLive);
        tx.rollback().unwrap();

        client
            .execute(
                "UPDATE action_idempotency_claims SET dispatched_at=NULL, leased_until=now()-interval '1 second' WHERE project_id=$1 AND idempotency_key=$2",
                &[&"project-a", &"claim-key"],
            )
            .unwrap();
        let mut tx = client.transaction().unwrap();
        let error = reconcile_action_claim(
            &mut tx,
            &proven(
                ActionClaimScope::new("project-a", "brand-a", "claim-key", "live-request").unwrap(),
            ),
        )
        .unwrap_err();
        assert_eq!(error.code, ClaimErrorCode::NotDispatched);
        tx.rollback().unwrap();
        assert_eq!(count(client, "action_idempotency_claims"), 1);
        assert_eq!(count(client, "action_claim_reconciliation_audits"), 0);
    });
}

#[test]
#[ignore = "requires APPCALL_TEST_DATABASE_URL or APPCALL_ENGINE_POSTGRES_URL"]
fn nullable_legacy_ownership_is_not_exposed_or_reconciled() {
    with_database(|client| {
        seed_claim(client, "brand-a", "legacy-request", true, true);
        client
            .execute(
                "UPDATE action_idempotency_claims SET external_account_id=NULL WHERE project_id=$1 AND idempotency_key=$2",
                &[&"project-a", &"claim-key"],
            )
            .unwrap();
        let error = inspect_action_claim(client, &scope("brand-a", "legacy-request")).unwrap_err();
        assert_eq!(error.code, ClaimErrorCode::OwnershipUnknown);
        let mut tx = client.transaction().unwrap();
        let error = reconcile_action_claim(&mut tx, &proven(scope("brand-a", "legacy-request")))
            .unwrap_err();
        assert_eq!(error.code, ClaimErrorCode::OwnershipUnknown);
        tx.rollback().unwrap();
        assert_eq!(count(client, "action_idempotency_claims"), 1);
        assert_eq!(count(client, "action_claim_reconciliation_audits"), 0);
    });
}

#[test]
#[ignore = "requires APPCALL_TEST_DATABASE_URL or APPCALL_ENGINE_POSTGRES_URL"]
fn proven_nondispatch_audits_refunds_original_windows_once_and_removes_claim() {
    with_database(|client| {
        seed_claim(client, "brand-a", "req-1", true, true);
        seed_reservation(client, "reservation-1", "dispatched", "brand-a", "2026-09");
        let command = proven(scope("brand-a", "req-1"));
        let result = {
            let mut tx = client.transaction().unwrap();
            let result = reconcile_action_claim(&mut tx, &command).unwrap();
            tx.commit().unwrap();
            result
        };
        assert_eq!(result.resolution, ClaimResolution::ProvenNotDispatched);
        assert!(result.charges_refunded);
        assert_eq!(result.reservation_state.as_deref(), Some("released"));
        assert_eq!(count(client, "action_idempotency_claims"), 0);
        assert_eq!(count(client, "action_claim_reconciliation_audits"), 1);
        assert_eq!(
            scalar_i64(client, "SELECT send_count FROM action_send_caps"),
            0
        );
        assert_eq!(
            scalar_i64(client, "SELECT spend_micros FROM action_send_caps"),
            0
        );
        assert_eq!(scalar_i64(client, "SELECT count(*) FROM action_usage_reservation_charges WHERE refunded_at IS NOT NULL"), 1);
        assert_eq!(scalar_i64(client, "SELECT count(*) FROM usage_events"), 0);

        let mut tx = client.transaction().unwrap();
        let error = reconcile_action_claim(&mut tx, &command).unwrap_err();
        assert_eq!(error.code, ClaimErrorCode::NotFound);
        tx.rollback().unwrap();
        assert_eq!(count(client, "action_claim_reconciliation_audits"), 1);
        assert_eq!(
            scalar_i64(client, "SELECT send_count FROM action_send_caps"),
            0
        );
    });
}

#[test]
#[ignore = "requires APPCALL_TEST_DATABASE_URL or APPCALL_ENGINE_POSTGRES_URL"]
fn proven_nondispatch_allows_a_new_request_identity_to_retry() {
    with_database(|client| {
        seed_claim(client, "brand-a", "req-1", true, true);
        seed_reservation(client, "reservation-1", "dispatched", "brand-a", "2026-09");
        let first = proven(scope("brand-a", "req-1"));
        let mut tx = client.transaction().unwrap();
        reconcile_action_claim(&mut tx, &first).unwrap();
        tx.commit().unwrap();

        // The old released reservation shares the key but has a different
        // request identity; it must not block the new attempt's claim fence.
        seed_claim(client, "brand-a", "req-2", true, true);
        let second = proven(scope("brand-a", "req-2"));
        let mut tx = client.transaction().unwrap();
        reconcile_action_claim(&mut tx, &second).unwrap();
        tx.commit().unwrap();

        assert_eq!(count(client, "action_idempotency_claims"), 0);
        assert_eq!(count(client, "action_claim_reconciliation_audits"), 2);
    });
}

#[test]
#[ignore = "requires APPCALL_TEST_DATABASE_URL or APPCALL_ENGINE_POSTGRES_URL"]
fn known_success_settles_and_meters_once_without_refunding() {
    with_database(|client| {
        seed_claim(client, "brand-a", "req-1", true, true);
        seed_reservation(client, "reservation-1", "dispatched", "brand-a", "2026-09");
        let command = ActionClaimReconciliation::new(
            scope("brand-a", "req-1"),
            "operator-1",
            "ticket://claims/known-success",
            ClaimResolution::ProviderOutcomeKnown {
                provider_succeeded: true,
            },
        )
        .unwrap();
        let result = {
            let mut tx = client.transaction().unwrap();
            let result = reconcile_action_claim(&mut tx, &command).unwrap();
            tx.commit().unwrap();
            result
        };
        assert_eq!(result.resolution, command.resolution);
        assert!(!result.charges_refunded);
        assert_eq!(result.reservation_state.as_deref(), Some("settled"));
        // A known provider success stays fenced by the claim plus its audit
        // tombstone; only proven non-dispatch may clear an idempotency key.
        assert_eq!(count(client, "action_idempotency_claims"), 1);
        assert_eq!(scalar_i64(client, "SELECT count(*) FROM usage_events"), 1);
        assert_eq!(
            scalar_i64(client, "SELECT quantity FROM usage_monthly_rollups"),
            1
        );
        assert_eq!(scalar_i64(client, "SELECT count(*) FROM action_usage_reservation_charges WHERE refunded_at IS NOT NULL"), 0);

        let inspection = inspect_action_claim(client, &scope("brand-a", "req-1")).unwrap();
        assert!(!inspection.reconciliation_allowed);

        let mut tx = client.transaction().unwrap();
        let error = reconcile_action_claim(&mut tx, &command).unwrap_err();
        assert_eq!(error.code, ClaimErrorCode::AlreadyCompleted);
        tx.rollback().unwrap();
        assert_eq!(count(client, "action_claim_reconciliation_audits"), 1);
    });
}

#[test]
#[ignore = "requires APPCALL_TEST_DATABASE_URL or APPCALL_ENGINE_POSTGRES_URL"]
fn known_failure_releases_capacity_without_proven_nondispatch_refund() {
    with_database(|client| {
        seed_claim(client, "brand-a", "req-1", true, true);
        seed_reservation(client, "reservation-1", "dispatched", "brand-a", "2026-09");
        let command = ActionClaimReconciliation::new(
            scope("brand-a", "req-1"),
            "operator-1",
            "ticket://claims/known-failure",
            ClaimResolution::ProviderOutcomeKnown {
                provider_succeeded: false,
            },
        )
        .unwrap();
        let result = {
            let mut tx = client.transaction().unwrap();
            let result = reconcile_action_claim(&mut tx, &command).unwrap();
            tx.commit().unwrap();
            result
        };
        assert_eq!(result.resolution, command.resolution);
        assert!(!result.charges_refunded);
        assert_eq!(result.reservation_state.as_deref(), Some("released"));
        assert_eq!(
            scalar_i64(client, "SELECT send_count FROM action_send_caps"),
            1
        );
        assert_eq!(scalar_i64(client, "SELECT count(*) FROM usage_events"), 0);
        // A known provider failure is still an outcome-known terminal fence;
        // releasing capacity does not make the mutation retryable.
        assert_eq!(count(client, "action_idempotency_claims"), 1);
        assert_eq!(count(client, "action_claim_reconciliation_audits"), 1);

        let mut tx = client.transaction().unwrap();
        let error = reconcile_action_claim(&mut tx, &command).unwrap_err();
        assert_eq!(error.code, ClaimErrorCode::AlreadyCompleted);
        tx.rollback().unwrap();
        assert_eq!(count(client, "action_claim_reconciliation_audits"), 1);
    });
}

#[test]
#[ignore = "requires APPCALL_TEST_DATABASE_URL or APPCALL_ENGINE_POSTGRES_URL"]
fn account_scope_uses_original_claim_owner_even_if_connection_is_retargeted() {
    with_database(|client| {
        seed_claim(client, "original-account", "req-1", true, true);
        let mut tx = client.transaction().unwrap();
        let error = reconcile_action_claim(
            &mut tx,
            &proven(
                ActionClaimScope::new("project-a", "retargeted-account", "claim-key", "req-1")
                    .unwrap(),
            ),
        )
        .unwrap_err();
        assert_eq!(error.code, ClaimErrorCode::NotFound);
        tx.rollback().unwrap();
        assert_eq!(count(client, "action_idempotency_claims"), 1);
        assert_eq!(count(client, "action_claim_reconciliation_audits"), 0);
    });
}

fn with_database(test: impl FnOnce(&mut Client)) {
    let url = std::env::var("APPCALL_TEST_DATABASE_URL")
        .or_else(|_| std::env::var("APPCALL_ENGINE_POSTGRES_URL"))
        .expect("database URL is required for ignored PostgreSQL claims tests");
    let mut client = Client::connect(&url, NoTls).unwrap();
    let schema = format!("claims_test_{}", Uuid::new_v4().simple());
    client
        .batch_execute(&format!(
            "CREATE SCHEMA {schema}; SET search_path TO {schema}"
        ))
        .unwrap();
    let mut migrations =
        std::fs::read_dir(concat!(env!("CARGO_MANIFEST_DIR"), "/../../migrations"))
            .unwrap()
            .map(|entry| entry.unwrap().path())
            .filter(|path| path.extension().is_some_and(|extension| extension == "sql"))
            .collect::<Vec<_>>();
    migrations.sort();
    for migration in migrations {
        client
            .batch_execute(&std::fs::read_to_string(migration).unwrap())
            .unwrap();
    }
    client
        .batch_execute(
             "INSERT INTO projects(id,name) VALUES('project-a','claims test');
             INSERT INTO connections(id,project_id,connector,status,auth_type,external_account_id,credential_owner)
             VALUES('connection-original','project-a','fixture','active','none','brand-a','brand');",
        )
        .unwrap();
    test(&mut client);
    client
        .batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
        .unwrap();
}

fn seed_claim(
    client: &mut Client,
    account: &str,
    request_id: &str,
    dispatched: bool,
    expired: bool,
) {
    let lease = if expired {
        "now()-interval '1 second'"
    } else {
        "now()+interval '1 hour'"
    };
    let dispatched_at = if dispatched {
        "now()-interval '2 seconds'"
    } else {
        "NULL"
    };
    client
        .execute(
            &format!(
                "INSERT INTO action_idempotency_claims(project_id,idempotency_key,connection_id,action,input_hash,request_id,external_account_id,connector,leased_until,dispatched_at) VALUES('project-a','claim-key','connection-original','messages.send','hash-original',$1,$2,'fixture',{lease},{dispatched_at})"
            ),
            &[&request_id, &account],
        )
        .unwrap();
}

fn seed_reservation(client: &mut Client, id: &str, state: &str, account: &str, month: &str) {
    client
        .execute(
            "INSERT INTO action_usage_reservations(id,project_id,month,connection_id,connector,action,external_account_id,idempotency_key,request_id,input_hash,state,expires_at,dispatched_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now()+interval '1 day',now())",
            &[
                &id,
                &"project-a",
                &month,
                &"connection-original",
                &"fixture",
                &"messages.send",
                &account,
                &"claim-key",
                &"req-1",
                &"hash-original",
                &state,
            ],
        )
        .unwrap();
    client
        .execute(
            "INSERT INTO action_usage_reservation_charges(reservation_id,charge_kind,window_kind,window_key,quantity,spend_micros) VALUES($1,'send','day','2026-09-12',1,25)",
            &[&id],
        )
        .unwrap();
    client
        .execute(
            "INSERT INTO action_send_caps(project_id,external_account_id,window_key,send_count,spend_micros) VALUES('project-a',$1,'2026-09-12',1,25)",
            &[&account],
        )
        .unwrap();
}

fn count(client: &mut Client, table: &str) -> i64 {
    scalar_i64(client, &format!("SELECT count(*) FROM {table}"))
}

fn scalar_i64(client: &mut Client, sql: &str) -> i64 {
    client.query_one(sql, &[]).unwrap().get(0)
}
