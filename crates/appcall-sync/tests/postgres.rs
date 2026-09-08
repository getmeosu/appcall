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
fn fixture() -> (Client, String) {
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
    c.batch_execute("CREATE TABLE connections(id text primary key,project_id text,connector text,external_account_id text,credential_owner text NOT NULL DEFAULT 'brand');CREATE TABLE sync_jobs(id text primary key,project_id text,connection_id text,operation text,status text,worker_id text NOT NULL DEFAULT '',attempts integer NOT NULL DEFAULT 0,run_after timestamptz,leased_until timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz DEFAULT now(),last_error text NOT NULL DEFAULT '',dedup_key text,input jsonb,UNIQUE(project_id,dedup_key));CREATE TABLE sync_job_checkpoints(job_id text primary key,cursor text);CREATE TABLE sync_job_cursor_visits(job_id text,cursor text,primary key(job_id,cursor));CREATE TABLE synced_messages(id text,project_id text,connection_id text,provider text,provider_message_id text,channel_id text,sender_id text,text text,model_version text,raw jsonb,updated_at timestamptz DEFAULT now(),PRIMARY KEY(project_id,connection_id,id));CREATE TABLE usage_events(id text primary key,project_id text,connection_id text,connector text,action text,kind text,occurred_at timestamptz,external_account_id text,quantity bigint);CREATE TABLE usage_monthly_rollups(project_id text,external_account_id text,month text,kind text,quantity bigint,updated_at timestamptz DEFAULT now(),PRIMARY KEY(project_id,external_account_id,month,kind));INSERT INTO connections(id,project_id,connector,external_account_id) VALUES('c','p','slack','brand')").unwrap();
    (c, schema)
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
    assert_eq!(row.get::<_, i32>(0), 1);
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
            let p = page(if n == 1 { "next" } else { "" });
            let output = json!({"items":p.records,"cursor":p.next_cursor});
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
