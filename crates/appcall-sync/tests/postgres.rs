use appcall_sync::*;
use postgres::{Client, NoTls};
use serde_json::json;
use std::{
    sync::{Arc, Barrier},
    time::Duration,
};
fn connect() -> Client {
    Client::connect(
        &std::env::var("APPCALL_ENGINE_POSTGRES_URL")
            .expect("explicit PostgreSQL test URL required"),
        NoTls,
    )
    .unwrap()
}
static FIXTURE_ID: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
fn fixture_with_generation_migration(apply_generation_migration: bool) -> (Client, String) {
    let mut c = connect();
    let schema = format!(
        "sync_test_{}_{}_{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos(),
        FIXTURE_ID.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
    );
    c.batch_execute(&format!(
        "CREATE SCHEMA {schema}; SET search_path TO {schema}"
    ))
    .unwrap();
    c.batch_execute("CREATE TABLE connections(id text primary key,project_id text,connector text,external_account_id text,credential_owner text NOT NULL DEFAULT 'brand',connection_generation bigint NOT NULL DEFAULT 1);CREATE TABLE sync_jobs(id text primary key,project_id text,connection_id text,operation text,status text,worker_id text NOT NULL DEFAULT '',attempts integer NOT NULL DEFAULT 0,run_after timestamptz,leased_until timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz DEFAULT now(),last_error text NOT NULL DEFAULT '',dedup_key text,input jsonb,UNIQUE(project_id,dedup_key));CREATE TABLE sync_job_checkpoints(job_id text primary key,cursor text);CREATE TABLE sync_job_cursor_visits(job_id text,cursor text,primary key(job_id,cursor));CREATE TABLE synced_messages(id text,project_id text,connection_id text,provider text,provider_message_id text,channel_id text,sender_id text,text text,model_version text,raw jsonb,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz DEFAULT now(),PRIMARY KEY(project_id,connection_id,id));CREATE TABLE usage_events(id text primary key,project_id text,connection_id text,connector text,action text,kind text,occurred_at timestamptz,external_account_id text,quantity bigint);CREATE TABLE usage_monthly_rollups(project_id text,external_account_id text,month text,kind text,quantity bigint,updated_at timestamptz DEFAULT now(),PRIMARY KEY(project_id,external_account_id,month,kind));INSERT INTO connections(id,project_id,connector,external_account_id) VALUES('c','p','slack','brand')").unwrap();
    c.batch_execute(include_str!(
        "../../../migrations/202609090001_sync_job_history.sql"
    ))
    .unwrap();
    if apply_generation_migration {
        c.batch_execute(include_str!(
            "../../../migrations/202609120005_sync_generation.sql"
        ))
        .unwrap();
    }
    (c, schema)
}
fn fixture() -> (Client, String) {
    fixture_with_generation_migration(true)
}
fn legacy_generation_fixture() -> (Client, String) {
    fixture_with_generation_migration(false)
}
fn request(id: &str) -> ScheduleRequest {
    ScheduleRequest {
        id: id.into(),
        project_id: "p".into(),
        connection_id: "c".into(),
        operation: "messages.list".into(),
        dedup_key: id.into(),
        input: json!({"channelId":"C123"}),
    }
}

fn history(client: &mut Client, job_id: &str) -> Vec<(i32, String, serde_json::Value)> {
    client
        .query(
            "SELECT seq,kind,detail FROM sync_job_events WHERE job_id=$1 ORDER BY seq",
            &[&job_id],
        )
        .unwrap()
        .into_iter()
        .map(|r| (r.get(0), r.get(1), r.get(2)))
        .collect()
}

#[test]
#[ignore = "requires explicit local PostgreSQL"]
fn history_enqueue_is_atomic_and_dedup_does_not_duplicate_initial_schedule() {
    let (db, schema) = fixture();
    let mut repo = Repository::new(db);
    repo.enqueue(&request("history-dedup")).unwrap();
    let mut client = repo.into_client();
    assert_eq!(
        history(&mut client, "history-dedup"),
        vec![(1, "scheduled".into(), json!({"reason":"new_job"}))]
    );

    let mut repo = Repository::new(client);
    repo.enqueue(&request("history-dedup")).unwrap();
    let mut client = repo.into_client();
    assert_eq!(history(&mut client, "history-dedup").len(), 1);

    client
        .batch_execute("ALTER TABLE sync_job_events ADD CONSTRAINT reject_scheduled CHECK(kind <> 'scheduled') NOT VALID")
        .unwrap();
    let mut repo = Repository::new(client);
    assert_eq!(
        repo.enqueue(&request("history-rollback")).unwrap_err(),
        Error::Storage
    );
    let mut client = repo.into_client();
    assert_eq!(
        client
            .query_one(
                "SELECT count(*) FROM sync_jobs WHERE id='history-rollback'",
                &[]
            )
            .unwrap()
            .get::<_, i64>(0),
        0
    );
    client
        .batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
        .unwrap();
}

#[test]
#[ignore = "requires explicit local PostgreSQL"]
fn history_records_transition_kinds_and_progress_does_not_spend_attempts() {
    let (db, schema) = fixture();
    let mut repo = Repository::new(db);
    repo.enqueue(&request("history-transitions")).unwrap();
    let claim = repo
        .claim("worker-1", Duration::from_secs(30))
        .unwrap()
        .unwrap();
    repo.commit_page(&claim, "", &page("next")).unwrap();
    let next = repo
        .claim("worker-2", Duration::from_secs(30))
        .unwrap()
        .unwrap();
    assert_eq!(next.attempts, 0);
    repo.fail(&next, Duration::from_secs(1), false).unwrap();
    let mut client = repo.into_client();
    client
        .execute(
            "UPDATE sync_jobs SET run_after=now()-interval '1 second' WHERE id='history-transitions'",
            &[],
        )
        .unwrap();
    let mut repo = Repository::new(client);
    let retry = repo
        .claim("worker-3", Duration::from_secs(30))
        .unwrap()
        .unwrap();
    repo.commit_page(&retry, "next", &page("")).unwrap();
    let mut client = repo.into_client();
    assert_eq!(
        history(&mut client, "history-transitions"),
        vec![
            (1, "scheduled".into(), json!({"reason":"new_job"})),
            (2, "claimed".into(), json!({})),
            (3, "page".into(), json!({"recordsWritten":1,"hasMore":true})),
            (4, "claimed".into(), json!({})),
            (
                5,
                "retry".into(),
                json!({"retryDelayMs":1000,"code":"SYNC_PROCESSING_FAILED"})
            ),
            (6, "claimed".into(), json!({})),
            (
                7,
                "page".into(),
                json!({"recordsWritten":1,"hasMore":false})
            ),
            (8, "succeeded".into(), json!({})),
        ]
    );
    assert_eq!(
        client
            .query_one(
                "SELECT attempts,status FROM sync_jobs WHERE id='history-transitions'",
                &[]
            )
            .unwrap()
            .get::<_, i32>(0),
        1
    );
    assert_eq!(
        client
            .query_one(
                "SELECT status FROM sync_jobs WHERE id='history-transitions'",
                &[]
            )
            .unwrap()
            .get::<_, String>(0),
        "succeeded"
    );
    client
        .batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
        .unwrap();
}

#[test]
#[ignore = "requires explicit local PostgreSQL"]
fn history_reclaims_expired_lease_and_fences_stale_owner() {
    let (db, schema) = fixture();
    let mut repo = Repository::new(db);
    repo.enqueue(&request("history-lease")).unwrap();
    let stale = repo
        .claim("stale-worker", Duration::from_secs(30))
        .unwrap()
        .unwrap();
    let mut client = repo.into_client();
    client
        .execute(
            "UPDATE sync_jobs SET leased_until=now()-interval '1 second' WHERE id='history-lease'",
            &[],
        )
        .unwrap();
    let mut repo = Repository::new(client);
    let fresh = repo
        .claim("fresh-worker", Duration::from_secs(30))
        .unwrap()
        .unwrap();
    assert_eq!(fresh.worker_id, "fresh-worker");
    assert_eq!(repo.cursor(&stale), Err(Error::LeaseLost));
    assert_eq!(
        repo.commit_page(&stale, "", &page("")),
        Err(Error::LeaseLost)
    );
    assert_eq!(
        repo.fail(&stale, Duration::ZERO, true),
        Err(Error::LeaseLost)
    );
    let mut client = repo.into_client();
    assert_eq!(
        history(&mut client, "history-lease"),
        vec![
            (1, "scheduled".into(), json!({"reason":"new_job"})),
            (2, "claimed".into(), json!({})),
            (3, "lease_expired".into(), json!({})),
            (4, "claimed".into(), json!({})),
        ]
    );
    client
        .batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
        .unwrap();
}

#[test]
#[ignore = "requires explicit local PostgreSQL"]
fn expired_lease_attempts_are_bounded_and_unblock_younger_work() {
    let (db, schema) = fixture();
    let mut repo = Repository::new(db);
    repo.enqueue(&request("abandoned")).unwrap();
    repo.enqueue(&request("younger")).unwrap();
    repo.claim("first-worker", Duration::from_secs(30))
        .unwrap()
        .unwrap();
    let mut client = repo.into_client();
    client
        .execute(
            "UPDATE sync_jobs SET leased_until=now()-interval '1 second' WHERE id='abandoned'",
            &[],
        )
        .unwrap();
    let policy = json!({
        "source":"service_config",
        "maxAttempts":2,
        "leaseDurationMs":30000,
        "retryBaseMs":"1",
        "maxRetryDelayMs":1000
    });
    let mut repo = Repository::new(client);
    let reclaimed = repo
        .claim_with_policy("second-worker", Duration::from_secs(30), Some(&policy))
        .unwrap()
        .unwrap();
    assert_eq!(reclaimed.id, "abandoned");
    assert_eq!(reclaimed.attempts, 1);
    let mut client = repo.into_client();
    client
        .execute(
            "UPDATE sync_jobs SET leased_until=now()-interval '1 second' WHERE id='abandoned'",
            &[],
        )
        .unwrap();
    let mut repo = Repository::new(client);
    let younger = repo
        .claim_with_policy("third-worker", Duration::from_secs(30), Some(&policy))
        .unwrap()
        .unwrap();
    assert_eq!(younger.id, "younger");
    let mut client = repo.into_client();
    let abandoned = client
        .query_one(
            "SELECT status,attempts,last_error FROM sync_jobs WHERE id='abandoned'",
            &[],
        )
        .unwrap();
    assert_eq!(abandoned.get::<_, String>(0), "failed");
    assert_eq!(abandoned.get::<_, i32>(1), 2);
    assert_eq!(abandoned.get::<_, String>(2), "sync lease expired");
    assert_eq!(
        history(&mut client, "abandoned")
            .into_iter()
            .map(|(_, kind, detail)| (kind, detail))
            .collect::<Vec<_>>(),
        vec![
            ("scheduled".into(), json!({"reason":"new_job"})),
            ("claimed".into(), json!({})),
            ("lease_expired".into(), json!({})),
            (
                "claimed".into(),
                json!({"policy": {"source":"service_config","maxAttempts":2,"leaseDurationMs":30000,"retryBaseMs":"1","maxRetryDelayMs":1000}}),
            ),
            ("lease_expired".into(), json!({})),
            ("failed".into(), json!({"code":"LEASE_EXPIRED"})),
        ]
    );
    client
        .batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
        .unwrap();
}

#[test]
#[ignore = "requires explicit local PostgreSQL"]
fn stale_recovery_batch_does_not_hold_younger_current_generation_work() {
    let (db, schema) = fixture();
    let mut repo = Repository::new(db);
    for index in 0..40 {
        repo.enqueue(&request(&format!("stale-batch-{index}")))
            .unwrap();
    }
    let mut client = repo.into_client();
    client
        .execute(
            "UPDATE connections SET connection_generation=2 WHERE id='c' AND project_id='p'",
            &[],
        )
        .unwrap();
    let mut repo = Repository::new(client);
    let younger = repo.enqueue(&request("current-generation"));
    assert_eq!(younger.unwrap().connection_generation, 2);
    let claimed = repo
        .claim("bounded-recovery-worker", Duration::from_secs(30))
        .unwrap()
        .unwrap();
    assert_eq!(claimed.id, "current-generation");
    let mut client = repo.into_client();
    assert_eq!(
        client
            .query_one(
                "SELECT count(*) FROM sync_jobs WHERE status='cancelled' AND last_error='connection generation changed'",
                &[],
            )
            .unwrap()
            .get::<_, i64>(0),
        32
    );
    assert_eq!(
        client
            .query_one(
                "SELECT count(*) FROM sync_jobs WHERE id LIKE 'stale-batch-%' AND status='pending'",
                &[],
            )
            .unwrap()
            .get::<_, i64>(0),
        8
    );
    client
        .batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
        .unwrap();
}

#[test]
#[ignore = "requires explicit local PostgreSQL"]
fn connection_generation_cancels_stale_jobs_and_reset_restarts_from_the_beginning() {
    let (db, schema) = fixture();
    let mut repo = Repository::new(db);
    repo.enqueue(&request("stale-generation")).unwrap();
    let claimed = repo
        .claim("old-worker", Duration::from_secs(30))
        .unwrap()
        .unwrap();
    assert_eq!(claimed.connection_generation, 1);
    let mut client = repo.into_client();
    client
        .batch_execute(
            "INSERT INTO sync_job_checkpoints(job_id,cursor,connection_generation) VALUES('stale-generation','old-cursor',1); UPDATE connections SET connection_generation=2 WHERE id='c'",
        )
        .unwrap();
    let mut repo = Repository::new(client);
    assert!(repo
        .claim("new-worker", Duration::from_secs(30))
        .unwrap()
        .is_none());
    let mut client = repo.into_client();
    let row = client
        .query_one(
            "SELECT status,attempts,connection_generation,last_error,worker_id,leased_until FROM sync_jobs WHERE id='stale-generation'",
            &[],
        )
        .unwrap();
    assert_eq!(row.get::<_, String>(0), "cancelled");
    assert_eq!(row.get::<_, i32>(1), 0);
    assert_eq!(row.get::<_, i64>(2), 1);
    assert_eq!(row.get::<_, String>(3), "connection generation changed");
    assert_eq!(row.get::<_, String>(4), "");
    assert!(row.get::<_, Option<std::time::SystemTime>>(5).is_none());
    assert_eq!(
        client
            .query_one(
                "SELECT count(*) FROM sync_job_checkpoints WHERE job_id='stale-generation'",
                &[],
            )
            .unwrap()
            .get::<_, i64>(0),
        0
    );
    let mut repo = Repository::new(client);
    repo.reset_attempts("p", "brand", "stale-generation")
        .unwrap();
    let restarted = repo
        .claim("restart-worker", Duration::from_secs(30))
        .unwrap()
        .unwrap();
    assert_eq!(restarted.connection_generation, 2);
    assert_eq!(restarted.attempts, 0);
    let mut client = repo.into_client();
    assert_eq!(
        history(&mut client, "stale-generation")
            .into_iter()
            .map(|(_, kind, _)| kind)
            .collect::<Vec<_>>(),
        vec![
            String::from("scheduled"),
            String::from("claimed"),
            String::from("cancelled"),
            String::from("scheduled"),
            String::from("claimed"),
        ]
    );
    client
        .batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
        .unwrap();
}

#[test]
#[ignore = "requires explicit local PostgreSQL"]
fn generation_migration_cancels_legacy_checkpoint_after_pre_upgrade_rebind() {
    let (mut db, schema) = legacy_generation_fixture();
    db.batch_execute(
        "INSERT INTO sync_jobs(id,project_id,connection_id,operation,status,run_after,dedup_key,input) VALUES('legacy-cursor','p','c','messages.list','pending',now(),'legacy-cursor','{}'); INSERT INTO sync_job_checkpoints(job_id,cursor) VALUES('legacy-cursor','old-account-cursor'); UPDATE connections SET connection_generation=2 WHERE id='c' AND project_id='p'",
    )
    .unwrap();

    db.batch_execute(include_str!(
        "../../../migrations/202609120005_sync_generation.sql"
    ))
    .unwrap();

    let row = db
        .query_one(
            "SELECT status,connection_generation,last_error FROM sync_jobs WHERE id='legacy-cursor'",
            &[],
        )
        .unwrap();
    assert_eq!(row.get::<_, String>(0), "cancelled");
    assert_eq!(row.get::<_, i64>(1), 2);
    assert_eq!(
        row.get::<_, String>(2),
        "connection generation unknown; restart required"
    );
    assert_eq!(
        db.query_one(
            "SELECT count(*) FROM sync_job_checkpoints WHERE job_id='legacy-cursor'",
            &[],
        )
        .unwrap()
        .get::<_, i64>(0),
        0
    );
    let event = db
        .query_one(
            "SELECT kind,detail FROM sync_job_events WHERE job_id='legacy-cursor' ORDER BY seq DESC LIMIT 1",
            &[],
        )
        .unwrap();
    assert_eq!(event.get::<_, String>(0), "cancelled");
    assert_eq!(
        event.get::<_, serde_json::Value>(1),
        json!({"reason":"connection_generation_unknown"})
    );
    db.batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
        .unwrap();
}

#[test]
#[ignore = "requires explicit local PostgreSQL"]
fn generation_rebind_refreshes_existing_message_ordering_timestamp() {
    let (db, schema) = fixture();
    let mut repo = Repository::new(db);
    repo.enqueue(&request("message-generation-one")).unwrap();
    let first = repo
        .claim("message-worker-one", Duration::from_secs(30))
        .unwrap()
        .unwrap();
    repo.commit_page(&first, "", &page("")).unwrap();
    let mut client = repo.into_client();
    let old_created_at: std::time::SystemTime = client
        .query_one("SELECT created_at FROM synced_messages WHERE id='m'", &[])
        .unwrap()
        .get(0);
    client
        .execute(
            "UPDATE connections SET connection_generation=2 WHERE id='c' AND project_id='p'",
            &[],
        )
        .unwrap();
    let mut repo = Repository::new(client);
    repo.enqueue(&request("message-generation-two")).unwrap();
    let second = repo
        .claim("message-worker-two", Duration::from_secs(30))
        .unwrap()
        .unwrap();
    repo.commit_page(&second, "", &page("")).unwrap();
    let mut client = repo.into_client();
    let row = client
        .query_one(
            "SELECT connection_generation,created_at FROM synced_messages WHERE id='m'",
            &[],
        )
        .unwrap();
    assert_eq!(row.get::<_, i64>(0), 2);
    assert!(row.get::<_, std::time::SystemTime>(1) > old_created_at);
    client
        .batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
        .unwrap();
}

#[test]
#[ignore = "requires explicit local PostgreSQL"]
fn history_operator_events_are_truthful_and_reasons_are_bounded() {
    let (db, schema) = fixture();
    let mut repo = Repository::new(db);
    repo.enqueue(&request("history-reset")).unwrap();
    let claim = repo
        .claim("worker", Duration::from_secs(30))
        .unwrap()
        .unwrap();
    repo.fail(&claim, Duration::ZERO, true).unwrap();
    repo.reset_attempts("p", "brand", "history-reset").unwrap();
    repo.enqueue(&request("history-runnow")).unwrap();
    repo.run_now("p", "brand", "history-runnow").unwrap();
    repo.enqueue(&request("history-cancel")).unwrap();
    repo.cancel("p", "brand", "history-cancel").unwrap();
    let mut client = repo.into_client();
    assert_eq!(
        history(&mut client, "history-runnow"),
        vec![
            (1, "scheduled".into(), json!({"reason":"new_job"})),
            (2, "scheduled".into(), json!({"reason":"run_now"})),
        ]
    );
    assert_eq!(
        history(&mut client, "history-reset"),
        vec![
            (1, "scheduled".into(), json!({"reason":"new_job"})),
            (2, "claimed".into(), json!({})),
            (3, "failed".into(), json!({"code":"SYNC_PROCESSING_FAILED"})),
            (4, "scheduled".into(), json!({"reason":"reset_attempts"})),
        ]
    );
    assert_eq!(
        history(&mut client, "history-cancel"),
        vec![
            (1, "scheduled".into(), json!({"reason":"new_job"})),
            (
                2,
                "cancelled".into(),
                json!({"reason":"operator_cancelled"})
            ),
        ]
    );
    assert_eq!(client.query_one("SELECT count(*) FROM sync_job_events WHERE job_id='history-cancel' AND kind='failed'", &[]).unwrap().get::<_, i64>(0), 0);
    assert!(client.execute("INSERT INTO sync_job_events(job_id,seq,kind,detail) VALUES('history-cancel',3,'scheduled',jsonb_build_object('reason',repeat('x',301)))", &[]).is_err());
    client
        .batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
        .unwrap();
}

#[test]
#[ignore = "requires explicit local PostgreSQL"]
fn history_event_failure_rolls_back_page_side_effects() {
    let (db, schema) = fixture();
    let mut repo = Repository::new(db);
    repo.enqueue(&request("history-page-rollback")).unwrap();
    let claim = repo
        .claim("worker", Duration::from_secs(30))
        .unwrap()
        .unwrap();
    let mut client = repo.into_client();
    client
        .batch_execute(
            "ALTER TABLE sync_job_events ADD CONSTRAINT reject_page CHECK(kind <> 'page')",
        )
        .unwrap();
    let mut repo = Repository::new(client);
    assert_eq!(
        repo.commit_page(&claim, "", &page("next")),
        Err(Error::Storage)
    );
    let mut client = repo.into_client();
    for table in [
        "synced_messages",
        "usage_events",
        "sync_job_checkpoints",
        "sync_job_cursor_visits",
    ] {
        assert_eq!(
            client
                .query_one(&format!("SELECT count(*) FROM {table}"), &[])
                .unwrap()
                .get::<_, i64>(0),
            0
        );
    }
    assert_eq!(
        client
            .query_one(
                "SELECT status,attempts FROM sync_jobs WHERE id='history-page-rollback'",
                &[]
            )
            .unwrap()
            .get::<_, String>(0),
        "running"
    );
    assert_eq!(history(&mut client, "history-page-rollback").len(), 2);
    client
        .batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
        .unwrap();
}

#[test]
#[ignore = "requires explicit local PostgreSQL"]
fn operator_controls_are_scoped_atomic_and_fence_stale_workers() {
    let (db, schema) = fixture();
    let mut repo = Repository::new(db);
    repo.enqueue(&request("reset-me")).unwrap();
    let mut client = repo.into_client();
    client
        .batch_execute(
            "INSERT INTO sync_job_checkpoints(job_id,cursor) VALUES('reset-me','resume'); UPDATE sync_jobs SET attempts=3,last_error='provider timeout' WHERE id='reset-me'",
        )
        .unwrap();
    let control = |client: &mut Client, action| {
        let mut tx = client.transaction().unwrap();
        let result = control_in_transaction(&mut tx, "p", "brand", "reset-me", action);
        if result.is_ok() {
            tx.commit().unwrap();
        }
        result
    };
    control(&mut client, OperatorAction::RunNow).unwrap();
    let row = client
        .query_one(
            "SELECT status,attempts,last_error,worker_id,leased_until FROM sync_jobs WHERE id='reset-me'",
            &[],
        )
        .unwrap();
    assert_eq!(row.get::<_, String>(0), "pending");
    assert_eq!(row.get::<_, i32>(1), 3);
    assert_eq!(row.get::<_, String>(2), "provider timeout");
    assert_eq!(row.get::<_, String>(3), "");
    assert!(row.get::<_, Option<std::time::SystemTime>>(4).is_none());
    assert_eq!(
        client
            .query_one(
                "SELECT cursor FROM sync_job_checkpoints WHERE job_id='reset-me'",
                &[]
            )
            .unwrap()
            .get::<_, String>(0),
        "resume"
    );

    client
        .execute(
            "UPDATE sync_jobs SET status='failed',attempts=7,last_error='terminal provider timeout' WHERE id='reset-me'",
            &[],
        )
        .unwrap();
    control(&mut client, OperatorAction::ResetAttempts).unwrap();
    let row = client
        .query_one(
            "SELECT status,attempts,last_error FROM sync_jobs WHERE id='reset-me'",
            &[],
        )
        .unwrap();
    assert_eq!(row.get::<_, String>(0), "pending");
    assert_eq!(row.get::<_, i32>(1), 0);
    assert_eq!(row.get::<_, String>(2), "");

    let mut repo = Repository::new(client);
    repo.claim("stale-worker", Duration::from_secs(30))
        .unwrap()
        .unwrap();
    let mut client = repo.into_client();
    assert_eq!(
        control(&mut client, OperatorAction::RunNow).unwrap_err(),
        Error::Conflict
    );
    client
        .execute(
            "UPDATE sync_jobs SET leased_until=now()-interval '1 second' WHERE id='reset-me'",
            &[],
        )
        .unwrap();
    control(&mut client, OperatorAction::ResetAttempts).unwrap();
    let row = client
        .query_one(
            "SELECT status,attempts FROM sync_jobs WHERE id='reset-me'",
            &[],
        )
        .unwrap();
    assert_eq!(row.get::<_, String>(0), "pending");
    assert_eq!(row.get::<_, i32>(1), 0);
    assert_eq!(
        client
            .query_one(
                "SELECT cursor FROM sync_job_checkpoints WHERE job_id='reset-me'",
                &[]
            )
            .unwrap()
            .get::<_, String>(0),
        "resume"
    );

    let mut repo = Repository::new(client);
    let claim = repo
        .claim("worker-to-cancel", Duration::from_secs(30))
        .unwrap()
        .unwrap();
    let mut client = repo.into_client();
    control(&mut client, OperatorAction::Cancel).unwrap();
    let mut stale = Repository::new(client);
    assert_eq!(
        stale.commit_page(&claim, "resume", &page("")),
        Err(Error::LeaseLost)
    );
    assert_eq!(
        stale.fail(&claim, Duration::ZERO, true),
        Err(Error::LeaseLost)
    );
    let mut client = stale.into_client();
    let row = client
        .query_one(
            "SELECT status,attempts,last_error FROM sync_jobs WHERE id='reset-me'",
            &[],
        )
        .unwrap();
    assert_eq!(row.get::<_, String>(0), "cancelled");
    assert_eq!(row.get::<_, i32>(1), 0);
    assert_eq!(row.get::<_, String>(2), "cancelled by operator");

    client
        .batch_execute(
            "INSERT INTO connections(id,project_id,connector,external_account_id) VALUES('other','p','slack','other'); INSERT INTO sync_jobs(id,project_id,connection_id,operation,status,run_after,dedup_key,input) VALUES('other-job','p','other','messages.list','pending',now(),'other-job','{}')",
        )
        .unwrap();
    assert_eq!(
        {
            let mut tx = client.transaction().unwrap();
            let result =
                control_in_transaction(&mut tx, "p", "brand", "other-job", OperatorAction::Cancel);
            drop(tx);
            result
        }
        .unwrap_err(),
        Error::NotFound
    );
    client
        .batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
        .unwrap();
}

#[test]
#[ignore = "requires explicit local PostgreSQL"]
fn concurrent_control_and_worker_claim_cannot_claim_a_locked_cancelled_job() {
    let (db, schema) = fixture();
    let mut repo = Repository::new(db);
    repo.enqueue(&request("race-cancel")).unwrap();
    let mut client = repo.into_client();
    let mut tx = client.transaction().unwrap();
    control_in_transaction(&mut tx, "p", "brand", "race-cancel", OperatorAction::Cancel).unwrap();

    let (started_tx, started_rx) = std::sync::mpsc::channel();
    let worker_schema = schema.clone();
    let worker = std::thread::spawn(move || {
        let mut worker_client = connect();
        worker_client
            .batch_execute(&format!("SET search_path TO {worker_schema}"))
            .unwrap();
        started_tx.send(()).unwrap();
        Repository::new(worker_client)
            .claim("racing-worker", Duration::from_secs(30))
            .unwrap()
    });
    started_rx.recv().unwrap();
    // The operator transaction owns the row lock and has already changed the
    // state. SKIP LOCKED must make the overlapping worker claim return no job;
    // committing only happens after that observation.
    assert!(worker.join().unwrap().is_none());
    tx.commit().unwrap();

    assert_eq!(
        client
            .query_one("SELECT status FROM sync_jobs WHERE id='race-cancel'", &[])
            .unwrap()
            .get::<_, String>(0),
        "cancelled"
    );
    client
        .batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
        .unwrap();
}
fn page(cursor: &str) -> Page {
    Page::decode(json!({"items":[{"id":"m","provider":"slack","providerMessageId":"1","channelId":"C123","senderId":"U1","text":"hello","modelVersion":"2026-05-14","raw":{}}],"cursor":cursor})).unwrap()
}

fn mixed_sender_page() -> Page {
    Page::decode(json!({
        "items":[
            {"id":"gmail:1","provider":"google-workspace","providerMessageId":"1","channelId":"gmail-thread","senderId":"sender@example.com","text":"hello","modelVersion":"2026-05-16","raw":{}},
            {"id":"outlook:2","provider":"microsoft-365","providerMessageId":"2","channelId":"outlook-thread","senderId":"","text":"automated notice","modelVersion":"2026-05-16","raw":{}}
        ]
    }))
    .unwrap()
}

#[test]
#[ignore = "requires explicit local PostgreSQL"]
fn commit_page_persists_mixed_senderless_messages() {
    let (c, schema) = fixture();
    let mut repo = Repository::new(c);
    repo.enqueue(&request("senderless")).unwrap();
    let claim = repo
        .claim("worker", Duration::from_secs(30))
        .unwrap()
        .unwrap();

    repo.commit_page(&claim, "", &mixed_sender_page()).unwrap();

    let mut client = repo.into_client();
    let records: Vec<(String, String)> = client
        .query(
            "SELECT provider,sender_id FROM synced_messages ORDER BY id",
            &[],
        )
        .unwrap()
        .into_iter()
        .map(|row| (row.get(0), row.get(1)))
        .collect();
    assert_eq!(
        records,
        vec![
            ("google-workspace".into(), "sender@example.com".into()),
            ("microsoft-365".into(), "".into()),
        ]
    );
    assert_eq!(
        client
            .query_one("SELECT status FROM sync_jobs WHERE id='senderless'", &[])
            .unwrap()
            .get::<_, String>(0),
        "succeeded"
    );
    client
        .batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
        .unwrap();
}

#[test]
#[ignore = "requires explicit local PostgreSQL"]
fn atomic_page_retry_fencing_and_input_scope() {
    let (c, schema) = fixture();
    let mut r = Repository::new(c);
    r.enqueue(&request("j")).unwrap();
    let mut wrong = request("other");
    wrong.project_id = "other".into();
    assert!(r.enqueue(&wrong).is_err());
    let mut conflict = request("j");
    conflict.input = json!({"channelId":"C999"});
    assert_eq!(r.enqueue(&conflict).unwrap_err(), Error::Conflict);
    let claim = r.claim("w", Duration::from_secs(30)).unwrap().unwrap();
    let mut c = r.into_client();
    c.batch_execute(
        "ALTER TABLE usage_monthly_rollups ADD CONSTRAINT reject_usage CHECK(quantity=0)",
    )
    .unwrap();
    let mut r = Repository::new(c);
    assert_eq!(
        r.commit_page(&claim, "", &page("next")),
        Err(Error::Storage)
    );
    let mut c = r.into_client();
    for table in [
        "synced_messages",
        "usage_events",
        "sync_job_checkpoints",
        "sync_job_cursor_visits",
    ] {
        assert_eq!(
            c.query_one(&format!("SELECT count(*) FROM {table}"), &[])
                .unwrap()
                .get::<_, i64>(0),
            0
        )
    }
    c.batch_execute("ALTER TABLE usage_monthly_rollups DROP CONSTRAINT reject_usage")
        .unwrap();
    let mut r = Repository::new(c);
    r.commit_page(&claim, "", &page("next")).unwrap();
    assert_eq!(
        r.commit_page(&claim, "", &page("next")),
        Err(Error::LeaseLost)
    );
    let next = r.claim("w2", Duration::from_secs(30)).unwrap().unwrap();
    assert_eq!(next.attempts, 0);
    assert_eq!(r.cursor(&next).unwrap(), "next");
    r.commit_page(&next, "next", &page("")).unwrap();
    let mut c = r.into_client();
    assert_eq!(
        c.query_one("SELECT quantity FROM usage_monthly_rollups", &[])
            .unwrap()
            .get::<_, i64>(0),
        2
    );
    assert_eq!(
        c.query_one("SELECT status FROM sync_jobs", &[])
            .unwrap()
            .get::<_, String>(0),
        "succeeded"
    );
    c.batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
        .unwrap();
}
#[test]
#[ignore = "requires explicit local PostgreSQL"]
fn concurrent_claim_and_expired_owner_are_fenced() {
    let (c, schema) = fixture();
    let mut r = Repository::new(c);
    r.enqueue(&request("j")).unwrap();
    let barrier = Arc::new(Barrier::new(3));
    let mut handles = Vec::new();
    for worker in ["w1", "w2"] {
        let b = barrier.clone();
        let schema = schema.clone();
        handles.push(std::thread::spawn(move || {
            let mut c = connect();
            c.batch_execute(&format!("SET search_path TO {schema}"))
                .unwrap();
            let mut r = Repository::new(c);
            b.wait();
            r.claim(worker, Duration::from_secs(30)).unwrap()
        }));
    }
    barrier.wait();
    let claims: Vec<Job> = handles
        .into_iter()
        .filter_map(|h| h.join().unwrap())
        .collect();
    assert_eq!(claims.len(), 1);
    let stale = claims[0].clone();
    let mut c = r.into_client();
    c.execute(
        "UPDATE sync_jobs SET leased_until=now()-interval '1 second'",
        &[],
    )
    .unwrap();
    let mut r = Repository::new(c);
    let fresh = r.claim("new", Duration::from_secs(30)).unwrap().unwrap();
    assert_eq!(r.cursor(&stale), Err(Error::LeaseLost));
    assert_eq!(r.commit_page(&stale, "", &page("")), Err(Error::LeaseLost));
    assert_eq!(r.fail(&stale, Duration::ZERO, true), Err(Error::LeaseLost));
    r.fail(&fresh, Duration::from_secs(120), false).unwrap();
    let mut c = r.into_client();
    let row = c
        .query_one(
            "SELECT attempts,run_after>now()+interval '119 seconds' FROM sync_jobs",
            &[],
        )
        .unwrap();
    assert_eq!(row.get::<_, i32>(0), 2);
    assert!(row.get::<_, bool>(1));
    c.batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
        .unwrap();
}
struct FreshCredentials(std::sync::atomic::AtomicUsize);
impl CredentialResolver for FreshCredentials {
    async fn resolve(&self, connection: appcall_store::Connection) -> Result<ResolvedCredentials> {
        let n = self.0.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1;
        Ok(ResolvedCredentials {
            connection,
            fields: json!({"accessToken":format!("fresh-{n}")})
                .as_object()
                .unwrap()
                .clone(),
        })
    }
}
#[test]
#[ignore = "requires explicit local PostgreSQL and local HTTP"]
fn service_fetches_each_page_with_fresh_credentials_and_lease_deadline() {
    use std::io::{Read, Write};
    let (mut db, schema) = fixture();
    db.batch_execute("ALTER TABLE connections ADD status text DEFAULT 'active';ALTER TABLE connections ADD auth_type text DEFAULT 'api_key';ALTER TABLE connections ADD secret_ref_id text;ALTER TABLE connections ADD last_test_status text DEFAULT 'passed';ALTER TABLE connections ADD COLUMN IF NOT EXISTS credential_owner text DEFAULT 'brand';").unwrap();
    let mut connection_db = connect();
    connection_db
        .batch_execute(&format!("SET search_path TO {schema}"))
        .unwrap();
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let server = std::thread::spawn(move || {
        for n in 1..=2 {
            let (mut stream, _) = listener.accept().unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            let mut data = Vec::new();
            let body = loop {
                let mut b = [0; 1024];
                let got = stream.read(&mut b).unwrap();
                assert!(got > 0);
                data.extend_from_slice(&b[..got]);
                if let Some(end) = data.windows(4).position(|p| p == b"\r\n\r\n") {
                    let headers = String::from_utf8_lossy(&data[..end]);
                    let len: usize = headers
                        .lines()
                        .find_map(|l| {
                            l.to_lowercase()
                                .strip_prefix("content-length:")
                                .map(|v| v.trim().parse().unwrap())
                        })
                        .unwrap();
                    if data.len() >= end + 4 + len {
                        break serde_json::from_slice::<serde_json::Value>(
                            &data[end + 4..end + 4 + len],
                        )
                        .unwrap();
                    }
                }
            };
            assert_eq!(body["method"], "connector.sync.list");
            assert_eq!(body["params"]["input"]["accessToken"], format!("fresh-{n}"));
            assert_eq!(body["params"]["input"]["channelId"], "C123");
            if n == 2 {
                assert_eq!(body["params"]["input"]["cursor"], "next")
            };
            let deadline = body["deadlineUnixMs"].as_u64().unwrap();
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as u64;
            assert!(deadline > now && deadline <= now + 30000);
            let mut records = page("").records;
            records[0].id = format!("m-{n}");
            let output = json!({
                "connector": "slack",
                "sync": "messages.list",
                "provider": "slack",
                "operation": "messages.list",
                "items": records,
                "cursor": if n == 1 { json!("next") } else { json!(null) },
            });
            let response =
                json!({"id":body["id"],"ok":true,"result":{"output":output}}).to_string();
            write!(
                stream,
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                response.len(),
                response
            )
            .unwrap();
        }
    });
    let store = appcall_store::Store::new(
        connection_db,
        appcall_store::LocalProvider::new(&[7; 32]).unwrap(),
    );
    let runner =
        appcall_runner_client::RunnerClient::new(&url, "fixture", Default::default()).unwrap();
    let registry = appcall_connectors::Registry::load("../../runner/connectors").unwrap();
    let service = Service::new(
        Repository::new(db),
        store,
        registry,
        runner,
        FreshCredentials(std::sync::atomic::AtomicUsize::new(0)),
        Config {
            lease_duration: Duration::from_secs(30),
            ..Default::default()
        },
    )
    .unwrap();
    let rt = tokio::runtime::Runtime::new().unwrap();
    rt.block_on(async {
        service.schedule(request("j")).await.unwrap();
        for _ in 0..2 {
            let job = service.claim("worker").await.unwrap().unwrap();
            service.process(job).await.unwrap();
        }
        assert!(service.claim("worker").await.unwrap().is_none());
        let mut unsupported = request("unsupported");
        unsupported.operation = "contacts.list".into();
        service.schedule(unsupported).await.unwrap();
        let job = service.claim("worker").await.unwrap().unwrap();
        assert_eq!(service.process(job).await, Err(Error::UnsupportedModel));
        assert!(service.claim("worker").await.unwrap().is_none());
    });
    server.join().unwrap();
    drop(service);
    drop(rt);
    let mut c = connect();
    c.batch_execute(&format!("SET search_path TO {schema}"))
        .unwrap();
    let records: Vec<(String, String, String)> = c
        .query(
            "SELECT id,provider,provider_message_id FROM synced_messages ORDER BY id",
            &[],
        )
        .unwrap()
        .into_iter()
        .map(|row| (row.get(0), row.get(1), row.get(2)))
        .collect();
    assert_eq!(
        records,
        vec![
            ("m-1".into(), "slack".into(), "1".into()),
            ("m-2".into(), "slack".into(), "1".into()),
        ]
    );
    assert_eq!(
        c.query_one(
            "SELECT cursor FROM sync_job_checkpoints WHERE job_id='j'",
            &[],
        )
        .unwrap()
        .get::<_, String>(0),
        ""
    );
    assert_eq!(
        c.query_one(
            "SELECT count(*) FROM usage_events WHERE id LIKE 'usage_sync_j_%'",
            &[],
        )
        .unwrap()
        .get::<_, i64>(0),
        2
    );
    assert_eq!(
        c.query_one(
            "SELECT sum(quantity)::bigint FROM usage_monthly_rollups",
            &[],
        )
        .unwrap()
        .get::<_, Option<i64>>(0),
        Some(2)
    );
    assert_eq!(
        c.query_one("SELECT status FROM sync_jobs WHERE id='j'", &[])
            .unwrap()
            .get::<_, String>(0),
        "succeeded"
    );
    let events = history(&mut c, "j");
    assert_eq!(
        events
            .iter()
            .map(|(_, kind, _)| kind.as_str())
            .collect::<Vec<_>>(),
        vec![
            "scheduled",
            "claimed",
            "page",
            "claimed",
            "page",
            "succeeded"
        ]
    );
    assert_eq!(
        events[4],
        (
            5,
            "page".into(),
            json!({"recordsWritten":1,"hasMore":false})
        )
    );
    assert_eq!(events[5], (6, "succeeded".into(), json!({})));
    c.batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
        .unwrap();
}

#[test]
#[ignore = "requires explicit local PostgreSQL"]
fn dedup_bound_is_separate_and_preserves_exact_key() {
    let (db, schema) = fixture();
    let mut repo = Repository::new(db);
    let mut r = request("bounded");
    r.dedup_key = "d".repeat(2049);
    assert_eq!(repo.enqueue(&r).unwrap_err(), Error::InvalidInput);
    r.dedup_key = "d".repeat(2048);
    repo.enqueue(&r).unwrap();
    let mut oversized_id = request("id");
    oversized_id.id = "x".repeat(513);
    assert_eq!(
        repo.enqueue(&oversized_id).unwrap_err(),
        Error::InvalidInput
    );
    let mut db = repo.into_client();
    assert_eq!(
        db.query_one("SELECT dedup_key FROM sync_jobs WHERE id='bounded'", &[])
            .unwrap()
            .get::<_, String>(0),
        r.dedup_key
    );
    db.batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
        .unwrap();
}

#[test]
#[ignore = "requires explicit local PostgreSQL"]
fn stored_messages_are_project_connection_scoped_and_cursor_paginated() {
    let (mut db, schema) = fixture();
    db.batch_execute(
        "INSERT INTO synced_messages(id,project_id,connection_id,connection_generation,provider,provider_message_id,channel_id,sender_id,text,model_version,raw,created_at) VALUES
         ('m1','p','c',1,'slack','1','C1','U1','one','v1','{}',now()-interval '3 seconds'),
         ('m2','p','c',1,'slack','2','C1','U1','two','v1','{}',now()-interval '2 seconds'),
         ('m3','p','c',1,'slack','3','C2','U1','three','v1','{}',now()-interval '1 second'),
         ('other','other-project','c',1,'slack','4','C1','U1','other','v1','{}',now())",
    )
    .unwrap();
    let first = list_stored_messages(
        &mut db,
        &StoredMessageQuery {
            project_id: "p".into(),
            account_id: "brand".into(),
            connection_id: "c".into(),
            channel_id: None,
            cursor: String::new(),
            limit: 2,
        },
    )
    .unwrap();
    assert_eq!(
        first
            .messages
            .iter()
            .map(|message| message.id.as_str())
            .collect::<Vec<_>>(),
        vec!["m3", "m2"]
    );
    assert!(first.has_more);
    assert!(!first.next_cursor.is_empty());
    assert_eq!(
        list_stored_messages(
            &mut db,
            &StoredMessageQuery {
                project_id: "p".into(),
                account_id: "brand".into(),
                connection_id: "c".into(),
                channel_id: Some("C1".into()),
                cursor: first.next_cursor.clone(),
                limit: 2,
            },
        ),
        Err(Error::InvalidInput)
    );
    let second = list_stored_messages(
        &mut db,
        &StoredMessageQuery {
            project_id: "p".into(),
            account_id: "brand".into(),
            connection_id: "c".into(),
            channel_id: None,
            cursor: first.next_cursor.clone(),
            limit: 2,
        },
    )
    .unwrap();
    assert_eq!(
        second
            .messages
            .iter()
            .map(|message| message.id.as_str())
            .collect::<Vec<_>>(),
        vec!["m1"]
    );
    assert!(!second.has_more);
    assert_eq!(
        list_stored_messages(
            &mut db,
            &StoredMessageQuery {
                project_id: "p".into(),
                account_id: "other-brand".into(),
                connection_id: "c".into(),
                channel_id: None,
                cursor: first.next_cursor.clone(),
                limit: 2,
            },
        ),
        Err(Error::InvalidInput)
    );
    let channel = list_stored_messages(
        &mut db,
        &StoredMessageQuery {
            project_id: "p".into(),
            account_id: "brand".into(),
            connection_id: "c".into(),
            channel_id: Some("C1".into()),
            cursor: String::new(),
            limit: 100,
        },
    )
    .unwrap();
    assert_eq!(
        channel
            .messages
            .iter()
            .map(|message| message.id.as_str())
            .collect::<Vec<_>>(),
        vec!["m2", "m1"]
    );
    let wrong_account = list_stored_messages(
        &mut db,
        &StoredMessageQuery {
            project_id: "p".into(),
            account_id: "other-brand".into(),
            connection_id: "c".into(),
            channel_id: None,
            cursor: String::new(),
            limit: 100,
        },
    );
    assert_eq!(wrong_account, Err(Error::NotFound));

    db.batch_execute(
        "UPDATE connections SET connection_generation=2 WHERE id='c' AND project_id='p'",
    )
    .unwrap();
    assert_eq!(
        list_stored_messages(
            &mut db,
            &StoredMessageQuery {
                project_id: "p".into(),
                account_id: "brand".into(),
                connection_id: "c".into(),
                channel_id: None,
                cursor: first.next_cursor.clone(),
                limit: 2,
            },
        ),
        Err(Error::StaleGeneration)
    );
    db.batch_execute(
        "UPDATE connections SET external_account_id='new-brand' WHERE id='c' AND project_id='p'; INSERT INTO synced_messages(id,project_id,connection_id,connection_generation,provider,provider_message_id,channel_id,sender_id,text,model_version,raw,created_at) VALUES ('m4','p','c',2,'slack','5','C1','U1','new','v1','{}',now())",
    )
    .unwrap();
    let old_account_after_rebind = list_stored_messages(
        &mut db,
        &StoredMessageQuery {
            project_id: "p".into(),
            account_id: "brand".into(),
            connection_id: "c".into(),
            channel_id: None,
            cursor: String::new(),
            limit: 100,
        },
    );
    assert_eq!(old_account_after_rebind, Err(Error::NotFound));
    let new_account = list_stored_messages(
        &mut db,
        &StoredMessageQuery {
            project_id: "p".into(),
            account_id: "new-brand".into(),
            connection_id: "c".into(),
            channel_id: None,
            cursor: String::new(),
            limit: 100,
        },
    )
    .unwrap();
    assert_eq!(
        new_account
            .messages
            .iter()
            .map(|message| message.id.as_str())
            .collect::<Vec<_>>(),
        vec!["m4"]
    );
    let mut invalid = StoredMessageQuery {
        project_id: "p".into(),
        account_id: "brand".into(),
        connection_id: "c".into(),
        channel_id: None,
        cursor: String::new(),
        limit: 0,
    };
    assert_eq!(
        list_stored_messages(&mut db, &invalid),
        Err(Error::InvalidInput)
    );
    invalid.limit = 1;
    invalid.cursor = "%%%".into();
    assert_eq!(
        list_stored_messages(&mut db, &invalid),
        Err(Error::InvalidInput)
    );
    db.batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
        .unwrap();
}
