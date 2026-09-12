use appcall_sync::*;
use postgres::{Client, NoTls};
use serde_json::{json, Map};
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

fn fixture() -> (Client, String) {
    let mut client = connect();
    let schema = format!(
        "sync_history_atomicity_{}_{}_{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos(),
        FIXTURE_ID.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
    );
    client
        .batch_execute(&format!(
            "CREATE SCHEMA {schema}; SET search_path TO {schema}"
        ))
        .unwrap();
    client
        .batch_execute(
            "CREATE TABLE connections(id text primary key,project_id text,connector text,external_account_id text,credential_owner text NOT NULL DEFAULT 'brand',connection_generation bigint NOT NULL DEFAULT 1);CREATE TABLE sync_jobs(id text primary key,project_id text,connection_id text,operation text,status text,worker_id text NOT NULL DEFAULT '',attempts integer NOT NULL DEFAULT 0,run_after timestamptz,leased_until timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz DEFAULT now(),last_error text NOT NULL DEFAULT '',dedup_key text,input jsonb,connection_generation bigint NOT NULL DEFAULT 1,UNIQUE(project_id,dedup_key));INSERT INTO connections(id,project_id,connector,external_account_id) VALUES('c','p','slack','brand')",
        )
        .unwrap();
    client
        .batch_execute(include_str!(
            "../../../migrations/202609090001_sync_job_history.sql"
        ))
        .unwrap();
    (client, schema)
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

fn page(cursor: &str) -> Page {
    Page::decode(json!({
        "items":[{"id":"m","provider":"slack","providerMessageId":"1","channelId":"C123","senderId":"U1","text":"hello","modelVersion":"2026-05-14","raw":{}}],
        "cursor":cursor,
    }))
    .unwrap()
}

fn drop_schema(client: &mut Client, schema: &str) {
    client
        .batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
        .unwrap();
}

#[test]
#[ignore = "requires explicit local PostgreSQL"]
fn bare_generic_control_event_failure_rolls_back_run_now_reset_and_cancel() {
    let (db, schema) = fixture();
    let mut repo = Repository::new(db);
    repo.enqueue(&request("bare-runnow")).unwrap();
    repo.enqueue(&request("bare-reset")).unwrap();
    repo.enqueue(&request("bare-cancel")).unwrap();
    let mut client = repo.into_client();
    client
        .batch_execute(
            "UPDATE sync_jobs SET run_after=now()+interval '1 hour' WHERE id='bare-runnow';UPDATE sync_jobs SET status='failed',attempts=7,last_error='keep me' WHERE id='bare-reset';ALTER TABLE sync_job_events ADD CONSTRAINT reject_scheduled CHECK(kind <> 'scheduled') NOT VALID;ALTER TABLE sync_job_events ADD CONSTRAINT reject_cancelled CHECK(kind <> 'cancelled') NOT VALID",
        )
        .unwrap();
    let run_now_before: Option<std::time::SystemTime> = client
        .query_one(
            "SELECT run_after FROM sync_jobs WHERE id='bare-runnow'",
            &[],
        )
        .unwrap()
        .get(0);

    assert_eq!(
        control_in_transaction(
            &mut client,
            "p",
            "brand",
            "bare-runnow",
            OperatorAction::RunNow
        ),
        Err(Error::Storage)
    );
    assert_eq!(
        control_in_transaction(
            &mut client,
            "p",
            "brand",
            "bare-reset",
            OperatorAction::ResetAttempts
        ),
        Err(Error::Storage)
    );
    assert_eq!(
        control_in_transaction(
            &mut client,
            "p",
            "brand",
            "bare-cancel",
            OperatorAction::Cancel
        ),
        Err(Error::Storage)
    );

    let row = client
        .query_one(
            "SELECT id,status,attempts,last_error FROM sync_jobs WHERE id='bare-cancel'",
            &[],
        )
        .unwrap();
    assert_eq!(row.get::<_, String>(0), "bare-cancel");
    assert_eq!(row.get::<_, String>(1), "pending");
    assert_eq!(row.get::<_, i32>(2), 0);
    assert_eq!(row.get::<_, String>(3), "");
    let row = client
        .query_one(
            "SELECT status,attempts,last_error FROM sync_jobs WHERE id='bare-reset'",
            &[],
        )
        .unwrap();
    assert_eq!(row.get::<_, String>(0), "failed");
    assert_eq!(row.get::<_, i32>(1), 7);
    assert_eq!(row.get::<_, String>(2), "keep me");
    assert_eq!(
        client
            .query_one(
                "SELECT status,run_after FROM sync_jobs WHERE id='bare-runnow'",
                &[]
            )
            .unwrap()
            .get::<_, String>(0),
        "pending"
    );
    let run_now_after: Option<std::time::SystemTime> = client
        .query_one(
            "SELECT run_after FROM sync_jobs WHERE id='bare-runnow'",
            &[],
        )
        .unwrap()
        .get(0);
    assert_eq!(run_now_after, run_now_before);
    assert_eq!(
        client
            .query_one("SELECT count(*) FROM sync_job_events WHERE job_id IN ('bare-runnow','bare-reset','bare-cancel')", &[])
            .unwrap()
            .get::<_, i64>(0),
        3
    );
    drop_schema(&mut client, &schema);
}

#[test]
#[ignore = "requires explicit local PostgreSQL"]
fn caller_owned_control_transaction_can_continue_after_event_rollback() {
    let (db, schema) = fixture();
    let mut repo = Repository::new(db);
    repo.enqueue(&request("outer-control")).unwrap();
    let mut client = repo.into_client();
    client
        .batch_execute(
            "UPDATE sync_jobs SET status='failed',attempts=7 WHERE id='outer-control';ALTER TABLE sync_job_events ADD CONSTRAINT reject_scheduled CHECK(kind <> 'scheduled') NOT VALID",
        )
        .unwrap();
    let mut tx = client.transaction().unwrap();
    assert_eq!(
        control_in_transaction(
            &mut tx,
            "p",
            "brand",
            "outer-control",
            OperatorAction::ResetAttempts
        ),
        Err(Error::Storage)
    );
    let row = tx
        .query_one(
            "SELECT status,attempts FROM sync_jobs WHERE id='outer-control'",
            &[],
        )
        .unwrap();
    assert_eq!(row.get::<_, String>(0), "failed");
    assert_eq!(row.get::<_, i32>(1), 7);
    tx.commit().unwrap();
    drop_schema(&mut client, &schema);
}

#[test]
#[ignore = "requires explicit local PostgreSQL"]
fn concurrent_deduplicated_enqueue_writes_one_job_and_one_schedule() {
    let (db, schema) = fixture();
    let mut client = db;
    let barrier = Arc::new(Barrier::new(3));
    let mut handles = Vec::new();
    for _ in 0..2 {
        let barrier = barrier.clone();
        let schema = schema.clone();
        handles.push(std::thread::spawn(move || {
            let mut client = connect();
            client
                .batch_execute(&format!("SET search_path TO {schema}"))
                .unwrap();
            let mut repo = Repository::new(client);
            barrier.wait();
            repo.enqueue(&request("concurrent-dedup")).map(|job| job.id)
        }));
    }
    barrier.wait();
    let ids: Vec<String> = handles
        .into_iter()
        .map(|handle| handle.join().unwrap().unwrap())
        .collect();
    assert_eq!(ids, vec!["concurrent-dedup", "concurrent-dedup"]);
    assert_eq!(
        client
            .query_one(
                "SELECT count(*) FROM sync_jobs WHERE id='concurrent-dedup'",
                &[]
            )
            .unwrap()
            .get::<_, i64>(0),
        1
    );
    assert_eq!(
        client
            .query_one(
                "SELECT count(*) FROM sync_job_events WHERE job_id='concurrent-dedup'",
                &[]
            )
            .unwrap()
            .get::<_, i64>(0),
        1
    );
    drop_schema(&mut client, &schema);
}

#[test]
#[ignore = "requires explicit local PostgreSQL"]
fn claim_skips_an_externally_locked_job_then_claims_after_release() {
    let (db, schema) = fixture();
    let mut repo = Repository::new(db);
    repo.enqueue(&request("claim-lock")).unwrap();
    let mut observer = repo.into_client();

    let mut holder = connect();
    holder
        .batch_execute(&format!("SET search_path TO {schema}"))
        .unwrap();
    let mut held = holder.transaction().unwrap();
    held.query_one(
        "SELECT id FROM sync_jobs WHERE id='claim-lock' FOR UPDATE",
        &[],
    )
    .unwrap();

    let mut claimant_client = connect();
    claimant_client
        .batch_execute(&format!(
            "SET search_path TO {schema}; SET statement_timeout='250ms'"
        ))
        .unwrap();
    let mut claimant = Repository::new(claimant_client);
    assert!(claimant
        .claim("locked-worker", Duration::from_secs(30))
        .unwrap()
        .is_none());

    held.commit().unwrap();
    let claimed = claimant
        .claim("released-worker", Duration::from_secs(30))
        .unwrap()
        .unwrap();
    assert_eq!(claimed.id, "claim-lock");
    assert_eq!(claimed.status, "running");

    let mut claimant_client = claimant.into_client();
    let kinds: Vec<String> = claimant_client
        .query(
            "SELECT kind FROM sync_job_events WHERE job_id='claim-lock' ORDER BY seq",
            &[],
        )
        .unwrap()
        .into_iter()
        .map(|row| row.get(0))
        .collect();
    assert_eq!(kinds, vec!["scheduled".to_owned(), "claimed".to_owned()]);
    drop_schema(&mut observer, &schema);
}

#[test]
#[ignore = "requires explicit local PostgreSQL"]
fn sequence_overflow_rolls_back_the_control_mutation() {
    let (db, schema) = fixture();
    let mut repo = Repository::new(db);
    repo.enqueue(&request("seq-overflow")).unwrap();
    let mut client = repo.into_client();
    client
        .execute(
            "INSERT INTO sync_job_events(job_id,seq,kind,detail) VALUES('seq-overflow',2147483647,'succeeded','{}')",
            &[],
        )
        .unwrap();
    let mut repo = Repository::new(client);
    assert_eq!(
        repo.cancel("p", "brand", "seq-overflow"),
        Err(Error::Storage)
    );
    let mut client = repo.into_client();
    assert_eq!(
        client
            .query_one("SELECT status FROM sync_jobs WHERE id='seq-overflow'", &[])
            .unwrap()
            .get::<_, String>(0),
        "pending"
    );
    assert_eq!(
        client
            .query_one("SELECT count(*) FROM sync_job_events WHERE job_id='seq-overflow' AND kind='cancelled'", &[])
            .unwrap()
            .get::<_, i64>(0),
        0
    );
    drop_schema(&mut client, &schema);
}

#[test]
#[ignore = "requires explicit local PostgreSQL"]
fn cancelled_and_reset_jobs_fence_their_old_claims() {
    let (db, schema) = fixture();
    let mut repo = Repository::new(db);
    repo.enqueue(&request("cancel-fence")).unwrap();
    let cancel_claim = repo
        .claim("cancel-worker", Duration::from_secs(30))
        .unwrap()
        .unwrap();
    repo.cancel("p", "brand", "cancel-fence").unwrap();
    assert_eq!(
        repo.commit_page(&cancel_claim, "", &page("")),
        Err(Error::LeaseLost)
    );
    assert_eq!(
        repo.fail(&cancel_claim, Duration::ZERO, true),
        Err(Error::LeaseLost)
    );

    repo.enqueue(&request("reset-fence")).unwrap();
    let reset_claim = repo
        .claim("reset-worker", Duration::from_secs(30))
        .unwrap()
        .unwrap();
    let mut client = repo.into_client();
    client
        .execute(
            "UPDATE sync_jobs SET leased_until=now()-interval '1 second' WHERE id='reset-fence'",
            &[],
        )
        .unwrap();
    let mut repo = Repository::new(client);
    repo.reset_attempts("p", "brand", "reset-fence").unwrap();
    assert_eq!(
        repo.commit_page(&reset_claim, "", &page("")),
        Err(Error::LeaseLost)
    );
    assert_eq!(
        repo.fail(&reset_claim, Duration::ZERO, true),
        Err(Error::LeaseLost)
    );
    let mut client = repo.into_client();
    drop_schema(&mut client, &schema);
}

#[test]
#[ignore = "requires explicit local PostgreSQL"]
fn history_detail_rejects_missing_terminal_fields_and_unknown_keys() {
    let (mut client, schema) = fixture();
    let mut repo = Repository::new(client);
    repo.enqueue(&request("detail-bounds")).unwrap();
    client = repo.into_client();
    assert!(client.execute("INSERT INTO sync_job_events(job_id,seq,kind,detail) VALUES('detail-bounds',2,'cancelled','{}')", &[]).is_err());
    assert!(client.execute("INSERT INTO sync_job_events(job_id,seq,kind,detail) VALUES('detail-bounds',2,'failed','{}')", &[]).is_err());
    assert!(client.execute("INSERT INTO sync_job_events(job_id,seq,kind,detail) VALUES('detail-bounds',2,'claimed','{\"policy\":{}}')", &[]).is_err());
    assert!(client.execute("INSERT INTO sync_job_events(job_id,seq,kind,detail) VALUES('detail-bounds',2,'succeeded','{\"secret\":\"leak\"}')", &[]).is_err());
    drop_schema(&mut client, &schema);
}

struct NoopCredentials;
impl CredentialResolver for NoopCredentials {
    async fn resolve(&self, connection: appcall_store::Connection) -> Result<ResolvedCredentials> {
        Ok(ResolvedCredentials {
            connection,
            fields: Map::new(),
        })
    }
}

#[test]
#[ignore = "requires explicit local PostgreSQL"]
fn service_claim_records_nondefault_policy_without_truncating_retry_base() {
    let (db, schema) = fixture();
    let mut connection_db = connect();
    connection_db
        .batch_execute(&format!("SET search_path TO {schema}"))
        .unwrap();
    let service = Service::new(
        Repository::new(db),
        appcall_store::Store::new(
            connection_db,
            appcall_store::LocalProvider::new(&[7; 32]).unwrap(),
        ),
        appcall_connectors::Registry::load(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../runner/connectors"
        ))
        .unwrap(),
        appcall_runner_client::RunnerClient::new(
            "http://127.0.0.1:1",
            "fixture",
            Default::default(),
        )
        .unwrap(),
        NoopCredentials,
        Config {
            max_attempts: 7,
            lease_duration: Duration::from_secs(17),
            retry_base: Duration::from_millis(1500),
            max_retry_delay: Duration::from_secs(42),
        },
    )
    .unwrap();
    let runtime = tokio::runtime::Runtime::new().unwrap();
    runtime.block_on(async {
        service.schedule(request("policy-claim")).await.unwrap();
        service.claim("policy-worker").await.unwrap().unwrap();
    });
    drop(service);
    drop(runtime);
    let mut client = connect();
    client
        .batch_execute(&format!("SET search_path TO {schema}"))
        .unwrap();
    let detail: serde_json::Value = client
        .query_one(
            "SELECT detail FROM sync_job_events WHERE job_id='policy-claim' AND kind='claimed'",
            &[],
        )
        .unwrap()
        .get(0);
    assert_eq!(
        detail,
        json!({"policy":{"source":"service_config","maxAttempts":7,"leaseDurationMs":17000,"retryBaseMs":"1500","maxRetryDelayMs":42000}})
    );
    drop_schema(&mut client, &schema);
}
