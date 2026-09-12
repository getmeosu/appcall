use appcall_auth::{Grant, Principal, WebhookVerifier};
use appcall_events::*;
use postgres::{Client, NoTls, Transaction};
use serde_json::json;

struct Db {
    client: Client,
    schema: String,
}
impl Db {
    fn new() -> Self {
        let mut client = Client::connect(
            &std::env::var("APPCALL_ENGINE_POSTGRES_URL").unwrap(),
            NoTls,
        )
        .unwrap();
        let schema = format!("events_test_{}", uuid::Uuid::new_v4().simple());
        client
            .batch_execute(&format!(
                "CREATE SCHEMA {schema}; SET search_path TO {schema}"
            ))
            .unwrap();
        for migration in [
            include_str!("../../../migrations/202605140001_init.sql"),
            include_str!("../../../migrations/202605290001_connections_ownership.sql"),
            include_str!("../../../migrations/202605290003_usage_brand_dim.sql"),
            include_str!("../../../migrations/202605290004_connections_owner_check.sql"),
            include_str!("../../../migrations/202609070001_event_outbox.sql"),
            include_str!("../../../migrations/202609110001_event_connection_dedup.sql"),
            include_str!("../../../migrations/202609120001_connection_revision.sql"),
        ] {
            client.batch_execute(migration).unwrap();
        }
        client.batch_execute("INSERT INTO projects(id,name) VALUES('p','p'),('q','q'); INSERT INTO connections(id,project_id,connector,auth_type,status,credential_owner,external_account_id) VALUES('a','p','slack','api_key','active','brand','brand-a'),('b','p','slack','api_key','active','brand','brand-b'),('apollo','p','apollo','api_key','active','brand','brand-a'),('rb2b','p','rb2b','api_key','active','brand','brand-a'),('other','q','slack','api_key','active','brand','brand-a')").unwrap();
        Self { client, schema }
    }
}
impl Drop for Db {
    fn drop(&mut self) {
        let _ = self
            .client
            .batch_execute(&format!("DROP SCHEMA {} CASCADE", self.schema));
    }
}
fn claims(connection: &str) -> appcall_auth::WebhookClaims {
    claims_for(connection, "slack")
}
fn claims_for(connection: &str, connector: &str) -> appcall_auth::WebhookClaims {
    appcall_auth::WebhookClaims {
        project_id: "p".into(),
        connection_id: connection.into(),
        connector: connector.into(),
    }
}
fn parsed(id: &str) -> ParsedWebhook {
    ParsedWebhook {
        idempotency_key: id.into(),
        operation: "messages.list".into(),
        sanitized: json!({"channel":"C123","safe":true}),
    }
}

fn install_review_persistence_columns(db: &mut Db) {
    db.client
        .batch_execute(include_str!(
            "../../../migrations/202609120002_connection_generation.sql"
        ))
        .unwrap();
}

fn install_review_dead_letter_columns(db: &mut Db) {
    db.client
        .batch_execute(include_str!(
            "../../../migrations/202609120003_webhook_outbox_dead_letter.sql"
        ))
        .unwrap();
}

fn brand(name: &str) -> Principal {
    let mut p = Principal::project("p").unwrap();
    p.brand_id = Some(name.into());
    p
}
struct Sink {
    fail: bool,
    fail_event: Option<String>,
}
impl Sink {
    fn new(fail: bool) -> Self {
        Self {
            fail,
            fail_event: None,
        }
    }
}
impl DispatchSink for Sink {
    fn schedule(&mut self, tx: &mut Transaction<'_>, job: &SyncJob) -> Result<()> {
        if self.fail
            && self
                .fail_event
                .as_deref()
                .is_some_and(|event_id| event_id == job.event_id)
        {
            return Err(Error::Dispatch);
        }
        tx.execute("INSERT INTO scheduled(project_id,dedup_key,input) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",&[&job.project_id,&job.dedup_key,&job.input]).map_err(|_|Error::Storage)?;
        Ok(())
    }
}
#[test]
#[ignore = "requires isolated APPCALL_ENGINE_POSTGRES_URL"]
fn acceptance_outbox_and_brand_replay_are_atomic() {
    let mut db = Db::new();
    db.client
        .batch_execute("ALTER TABLE webhook_outbox ADD CONSTRAINT reject_test CHECK(false)")
        .unwrap();
    assert!(PgEvents::new(&mut db.client)
        .accept(&claims("a"), &parsed("event"))
        .is_err());
    assert_eq!(
        db.client
            .query_one("SELECT count(*) FROM webhook_events", &[])
            .unwrap()
            .get::<_, i64>(0),
        0
    );
    db.client
        .batch_execute("ALTER TABLE webhook_outbox DROP CONSTRAINT reject_test")
        .unwrap();
    let mut store = PgEvents::new(&mut db.client);
    let a_event = store.accept(&claims("a"), &parsed("event")).unwrap();
    assert!(!a_event.duplicate);
    assert!(a_event.event_id.starts_with("wh_"));
    assert_ne!(a_event.event_id, "event");
    assert_eq!(
        store.accept(&claims("a"), &parsed("event")).unwrap(),
        IngestResult {
            event_id: a_event.event_id.clone(),
            duplicate: true,
        }
    );
    let b_event = store.accept(&claims("b"), &parsed("event")).unwrap();
    assert!(!b_event.duplicate);
    assert!(b_event.event_id.starts_with("wh_"));
    assert_ne!(b_event.event_id, "event");
    assert_ne!(a_event.event_id, b_event.event_id);
    assert_eq!(
        store.accept(&claims("b"), &parsed("event")).unwrap(),
        IngestResult {
            event_id: b_event.event_id.clone(),
            duplicate: true,
        }
    );
    assert_eq!(
        store.get(&brand("brand-b"), "event").unwrap_err(),
        Error::NotFound
    );
    let event = store.get(&brand("brand-a"), &a_event.event_id).unwrap();
    assert_eq!(event.external_account_id, "brand-a");
    let event = store.get(&brand("brand-b"), &b_event.event_id).unwrap();
    assert_eq!(event.external_account_id, "brand-b");
    let mut limited = Principal::project("p").unwrap();
    limited.allowed_brands = Grant::Only(["brand-a".into()].into());
    assert_eq!(
        store.list(&limited, &ListRequest::default()).unwrap_err(),
        Error::Forbidden
    );
    assert_eq!(
        store
            .accept(&claims("other"), &parsed("foreign"))
            .unwrap_err(),
        Error::NotFound
    );
}

#[test]
#[ignore = "requires isolated APPCALL_ENGINE_POSTGRES_URL"]
fn connection_scoped_identity_keeps_public_delivery_and_usage_keys_consistent() {
    let mut db = Db::new();
    db.client
        .batch_execute(
            "CREATE TABLE scheduled(project_id text,dedup_key text,input jsonb,PRIMARY KEY(project_id,dedup_key))",
        )
        .unwrap();
    let (a, b, a_retry, b_retry) = {
        let mut store = PgEvents::new(&mut db.client);
        let a = store
            .accept(&claims("a"), &parsed("same-provider-key"))
            .unwrap();
        let b = store
            .accept(&claims("b"), &parsed("same-provider-key"))
            .unwrap();
        let a_retry = store
            .accept(&claims("a"), &parsed("same-provider-key"))
            .unwrap();
        let b_retry = store
            .accept(&claims("b"), &parsed("same-provider-key"))
            .unwrap();
        (a, b, a_retry, b_retry)
    };
    assert!(!a.duplicate);
    assert!(!b.duplicate);
    assert_ne!(a.event_id, b.event_id);
    assert_eq!(
        a_retry,
        IngestResult {
            event_id: a.event_id.clone(),
            duplicate: true
        }
    );
    assert_eq!(
        b_retry,
        IngestResult {
            event_id: b.event_id.clone(),
            duplicate: true
        }
    );
    assert_eq!(
        db.client
            .query_one(
                "SELECT count(*) FROM webhook_events WHERE project_id='p'",
                &[]
            )
            .unwrap()
            .get::<_, i64>(0),
        2
    );
    let p = Principal::project("p").unwrap();
    {
        let mut store = PgEvents::new(&mut db.client);
        let page = store.list(&p, &ListRequest::default()).unwrap();
        assert_eq!(
            page.events
                .iter()
                .map(|event| event.id.as_str())
                .collect::<std::collections::BTreeSet<_>>(),
            [a.event_id.as_str(), b.event_id.as_str()]
                .into_iter()
                .collect()
        );
        assert_eq!(
            store
                .get(&brand("brand-a"), &a.event_id)
                .unwrap()
                .connection_id,
            "a"
        );
        assert_eq!(
            store
                .get(&brand("brand-b"), &b.event_id)
                .unwrap()
                .connection_id,
            "b"
        );
        assert_eq!(
            store.get(&brand("brand-a"), &b.event_id).unwrap_err(),
            Error::NotFound
        );
    }

    let q = {
        let mut store = PgEvents::new(&mut db.client);
        let q = store
            .accept(
                &appcall_auth::WebhookClaims {
                    project_id: "q".into(),
                    connection_id: "other".into(),
                    connector: "slack".into(),
                },
                &ParsedWebhook {
                    idempotency_key: "same-provider-key".into(),
                    operation: String::new(),
                    sanitized: json!({"crossProject":true}),
                },
            )
            .unwrap();
        assert!(!q.duplicate);
        assert_eq!(
            store
                .get(&Principal::project("q").unwrap(), &q.event_id)
                .unwrap()
                .project_id,
            "q"
        );
        q
    };

    assert_eq!(
        PgEvents::new(&mut db.client)
            .dispatch_pending(10, &mut Sink::new(false))
            .unwrap(),
        DispatchReport {
            completed: 3,
            failed: 0,
            dead_lettered: 0,
        }
    );
    assert_eq!(
        db.client
            .query_one(
                "SELECT count(*) FROM webhook_outbox WHERE dispatched_at IS NULL",
                &[]
            )
            .unwrap()
            .get::<_, i64>(0),
        0
    );
    assert_eq!(
        db.client
            .query_one("SELECT count(*) FROM usage_events", &[])
            .unwrap()
            .get::<_, i64>(0),
        3
    );
    assert_eq!(
        db.client
            .query_one(
                "SELECT sum(quantity)::bigint FROM usage_monthly_rollups WHERE kind='webhook_event'",
                &[],
            )
            .unwrap()
            .get::<_, i64>(0),
        3
    );
    let mut sink = Sink::new(false);
    {
        let mut store = PgEvents::new(&mut db.client);
        store
            .replay(&brand("brand-a"), &a.event_id, &mut sink)
            .unwrap();
        store
            .replay(&brand("brand-b"), &b.event_id, &mut sink)
            .unwrap();
        assert_eq!(
            store
                .stream(&p, &ListRequest::default())
                .unwrap()
                .events
                .len(),
            2
        );
    }
    assert_eq!(
        db.client
            .query_one("SELECT count(*) FROM scheduled", &[])
            .unwrap()
            .get::<_, i64>(0),
        4
    );
    assert_eq!(
        PgEvents::new(&mut db.client)
            .get(&Principal::project("q").unwrap(), &q.event_id)
            .unwrap()
            .project_id,
        "q"
    );
}

#[test]
#[ignore = "requires isolated APPCALL_ENGINE_POSTGRES_URL"]
fn provider_dedup_is_scoped_to_connection_revision() {
    let mut db = Db::new();
    let first = PgEvents::new(&mut db.client)
        .accept(&claims("a"), &parsed("generation-key"))
        .unwrap();
    assert!(!first.duplicate);
    db.client
        .batch_execute(
            "UPDATE connections SET status='disconnected' WHERE project_id='p' AND id='a'; UPDATE connections SET status='active' WHERE project_id='p' AND id='a';",
        )
        .unwrap();
    assert_eq!(
        db.client
            .query_one(
                "SELECT connection_revision FROM connections WHERE project_id='p' AND id='a'",
                &[],
            )
            .unwrap()
            .get::<_, i64>(0),
        3
    );
    let second = PgEvents::new(&mut db.client)
        .accept(&claims("a"), &parsed("generation-key"))
        .unwrap();
    assert!(!second.duplicate);
    assert_ne!(first.event_id, second.event_id);
    assert_eq!(
        db.client
            .query_one(
                "SELECT count(*) FROM webhook_events WHERE project_id='p' AND connection_id='a'",
                &[],
            )
            .unwrap()
            .get::<_, i64>(0),
        2
    );
}

#[test]
#[ignore = "requires isolated APPCALL_ENGINE_POSTGRES_URL"]
fn provider_dedup_survives_incidental_updates_and_refresh_but_resets_on_reconnect() {
    let mut db = Db::new();
    db.client
        .batch_execute(
            "CREATE TABLE scheduled(project_id text,dedup_key text,input jsonb,PRIMARY KEY(project_id,dedup_key));",
        )
        .unwrap();
    db.client
        .batch_execute(include_str!(
            "../../../migrations/202609070004_oauth_refresh_intents.sql"
        ))
        .unwrap();
    db.client
        .batch_execute(
            "INSERT INTO secret_envelopes(id,project_id,kind,key_id,algorithm,nonce,ciphertext)
               VALUES('refresh-old','p','oauth_tokens_a','test','fixture',decode('00','hex'),decode('00','hex'));
             UPDATE connections SET secret_ref_id='refresh-old' WHERE id='a';",
        )
        .unwrap();
    install_review_persistence_columns(&mut db);

    let first = PgEvents::new(&mut db.client)
        .accept(&claims("a"), &parsed("stable-provider-key"))
        .unwrap();
    db.client
        .batch_execute("UPDATE connections SET last_test_status='passed' WHERE id='a'")
        .unwrap();
    assert_eq!(
        PgEvents::new(&mut db.client)
            .accept(&claims("a"), &parsed("stable-provider-key"))
            .unwrap(),
        IngestResult {
            event_id: first.event_id.clone(),
            duplicate: true,
        }
    );

    db.client
        .batch_execute(
            "INSERT INTO oauth_refresh_intents(project_id,connection_id,attempt_id,secret_ref_id,operation,state)
             VALUES('p','a','refresh-attempt','refresh-old','refresh','dispatched');
             UPDATE connections SET status='degraded' WHERE id='a';
             INSERT INTO secret_envelopes(id,project_id,kind,key_id,algorithm,nonce,ciphertext)
               VALUES('refresh-new','p','oauth_tokens_a','test','fixture',decode('01','hex'),decode('01','hex'));
             SELECT set_config('appcall.oauth_refresh_generation',json_build_object('project_id','p','connection_id','a','attempt_id','refresh-attempt','old_secret_ref_id','refresh-old','new_secret_ref_id','refresh-new')::text,true);
             UPDATE connections SET secret_ref_id='refresh-new',status='active' WHERE id='a';",
        )
        .unwrap();
    assert_eq!(
        db.client
            .query_one(
                "SELECT connection_generation FROM connections WHERE id='a'",
                &[],
            )
            .unwrap()
            .get::<_, i64>(0),
        1
    );
    assert_eq!(
        PgEvents::new(&mut db.client)
            .accept(&claims("a"), &parsed("stable-provider-key"))
            .unwrap(),
        IngestResult {
            event_id: first.event_id.clone(),
            duplicate: true,
        }
    );

    db.client
        .batch_execute(
            "UPDATE oauth_refresh_intents SET state='completed' WHERE connection_id='a';
             UPDATE connections SET status='disconnected' WHERE id='a';
             UPDATE connections SET status='active' WHERE id='a';",
        )
        .unwrap();
    assert_eq!(
        db.client
            .query_one(
                "SELECT connection_generation FROM connections WHERE id='a'",
                &[],
            )
            .unwrap()
            .get::<_, i64>(0),
        2
    );
    let second = PgEvents::new(&mut db.client)
        .accept(&claims("a"), &parsed("stable-provider-key"))
        .unwrap();
    assert!(!second.duplicate);
    assert_ne!(first.event_id, second.event_id);

    db.client
        .batch_execute(
            "INSERT INTO secret_envelopes(id,project_id,kind,key_id,algorithm,nonce,ciphertext)
               VALUES('manual-new','p','oauth_tokens_a','test','fixture',decode('02','hex'),decode('02','hex'));
             UPDATE connections SET secret_ref_id='manual-new' WHERE id='a';",
        )
        .unwrap();
    assert_eq!(
        db.client
            .query_one(
                "SELECT connection_generation FROM connections WHERE id='a'",
                &[],
            )
            .unwrap()
            .get::<_, i64>(0),
        3
    );
    let third = PgEvents::new(&mut db.client)
        .accept(&claims("a"), &parsed("stable-provider-key"))
        .unwrap();
    assert!(!third.duplicate);
    assert_ne!(second.event_id, third.event_id);
}

#[test]
#[ignore = "requires isolated APPCALL_ENGINE_POSTGRES_URL"]
fn generation_migration_prefers_current_connection_scope_for_historical_duplicates() {
    let mut db = Db::new();
    let old = PgEvents::new(&mut db.client)
        .accept(&claims("a"), &parsed("historical-reassignment-key"))
        .unwrap();
    let old_only = PgEvents::new(&mut db.client)
        .accept(&claims("a"), &parsed("historical-old-only-key"))
        .unwrap();
    db.client
        .batch_execute(
            "UPDATE connections
                SET external_account_id='brand-new'
              WHERE project_id='p' AND id='a';",
        )
        .unwrap();
    let current = PgEvents::new(&mut db.client)
        .accept(&claims("a"), &parsed("historical-reassignment-key"))
        .unwrap();
    assert_ne!(old.event_id, current.event_id);

    install_review_persistence_columns(&mut db);
    let redelivery = PgEvents::new(&mut db.client)
        .accept(&claims("a"), &parsed("historical-reassignment-key"))
        .unwrap();
    assert_eq!(
        redelivery,
        IngestResult {
            event_id: current.event_id,
            duplicate: true,
        }
    );
    let current_after_upgrade = PgEvents::new(&mut db.client)
        .accept(&claims("a"), &parsed("historical-old-only-key"))
        .unwrap();
    assert!(!current_after_upgrade.duplicate);
    assert_ne!(current_after_upgrade.event_id, old_only.event_id);
    assert_eq!(
        db.client
            .query_one(
                "SELECT count(*) FROM webhook_events
                  WHERE project_id='p' AND connection_id='a'
                    AND connection_generation IS NOT NULL",
                &[],
            )
            .unwrap()
            .get::<_, i64>(0),
        2
    );
    assert!(db
        .client
        .query_one(
            "SELECT connection_generation IS NULL FROM webhook_events WHERE project_id='p' AND id=$1",
            &[&old.event_id],
        )
        .unwrap()
        .get::<_, bool>(0));
    assert!(db
        .client
        .query_one(
            "SELECT connection_generation IS NULL FROM webhook_events WHERE project_id='p' AND id=$1",
            &[&old_only.event_id],
        )
        .unwrap()
        .get::<_, bool>(0));
}

#[test]
#[ignore = "requires isolated APPCALL_ENGINE_POSTGRES_URL"]
fn disconnected_outbox_dead_letters_after_bounded_failures_and_replay_remains_available() {
    let mut db = Db::new();
    db.client
        .batch_execute(
            "CREATE TABLE scheduled(project_id text,dedup_key text,input jsonb,PRIMARY KEY(project_id,dedup_key));",
        )
        .unwrap();
    install_review_dead_letter_columns(&mut db);
    let event = PgEvents::new(&mut db.client)
        .accept(&claims("a"), &parsed("dead-letter-provider-key"))
        .unwrap();
    db.client
        .batch_execute("UPDATE connections SET status='disconnected' WHERE id='a'")
        .unwrap();
    db.client
        .execute(
            "UPDATE webhook_outbox SET attempts=9,next_attempt_at=now() WHERE event_id=$1",
            &[&event.event_id],
        )
        .unwrap();
    let mut sink = Sink::new(false);
    let report = PgEvents::new(&mut db.client)
        .dispatch_pending(1, &mut sink)
        .unwrap();
    assert_eq!(report.failed, 1);
    assert_eq!(report.dead_lettered, 1);
    let row = db
        .client
        .query_one(
            "SELECT status,last_error_code,dead_lettered_at FROM webhook_outbox WHERE event_id=$1",
            &[&event.event_id],
        )
        .unwrap();
    assert_eq!(row.get::<_, String>(0), "dead_letter");
    assert_eq!(row.get::<_, String>(1), "CONNECTION_UNAVAILABLE");
    assert!(row
        .get::<_, Option<chrono::DateTime<chrono::Utc>>>(2)
        .is_some());
    assert_eq!(
        PgEvents::new(&mut db.client)
            .dispatch_pending(1, &mut sink)
            .unwrap(),
        DispatchReport::default()
    );

    db.client
        .batch_execute("UPDATE connections SET status='active' WHERE id='a'")
        .unwrap();
    PgEvents::new(&mut db.client)
        .replay(&brand("brand-a"), &event.event_id, &mut sink)
        .unwrap();
    assert_eq!(
        db.client
            .query_one("SELECT count(*) FROM scheduled", &[])
            .unwrap()
            .get::<_, i64>(0),
        1
    );
    assert_eq!(
        db.client
            .query_one(
                "SELECT status FROM webhook_outbox WHERE event_id=$1",
                &[&event.event_id],
            )
            .unwrap()
            .get::<_, String>(0),
        "dead_letter"
    );
}

#[test]
#[ignore = "requires isolated APPCALL_ENGINE_POSTGRES_URL"]
fn migrated_outbox_marks_successful_dispatch_as_dispatched_atomically() {
    let mut db = Db::new();
    db.client
        .batch_execute(
            "CREATE TABLE scheduled(project_id text,dedup_key text,input jsonb,PRIMARY KEY(project_id,dedup_key));",
        )
        .unwrap();
    install_review_dead_letter_columns(&mut db);
    let event = PgEvents::new(&mut db.client)
        .accept(&claims("a"), &parsed("successful-dead-letter-schema"))
        .unwrap();
    let report = PgEvents::new(&mut db.client)
        .dispatch_pending(1, &mut Sink::new(false))
        .unwrap();
    assert_eq!(report.completed, 1);
    assert_eq!(report.failed, 0);
    assert_eq!(report.dead_lettered, 0);
    let row = db
        .client
        .query_one(
            "SELECT status,last_error_code,dispatched_at,dead_lettered_at
               FROM webhook_outbox WHERE event_id=$1",
            &[&event.event_id],
        )
        .unwrap();
    assert_eq!(row.get::<_, String>(0), "dispatched");
    assert_eq!(row.get::<_, String>(1), "");
    assert!(row
        .get::<_, Option<chrono::DateTime<chrono::Utc>>>(2)
        .is_some());
    assert!(row
        .get::<_, Option<chrono::DateTime<chrono::Utc>>>(3)
        .is_none());
}

#[test]
#[ignore = "requires isolated APPCALL_ENGINE_POSTGRES_URL"]
fn dead_letter_migration_terminalizes_legacy_exhausted_pending_rows() {
    let mut db = Db::new();
    let exhausted = PgEvents::new(&mut db.client)
        .accept(&claims("a"), &parsed("legacy-exhausted"))
        .unwrap();
    let dispatched = PgEvents::new(&mut db.client)
        .accept(&claims("a"), &parsed("legacy-dispatched"))
        .unwrap();
    db.client
        .execute(
            "UPDATE webhook_outbox
                SET attempts=10,next_attempt_at=now()
              WHERE event_id=$1",
            &[&exhausted.event_id],
        )
        .unwrap();
    db.client
        .execute(
            "UPDATE webhook_outbox
                SET attempts=10,dispatched_at=now()
              WHERE event_id=$1",
            &[&dispatched.event_id],
        )
        .unwrap();

    install_review_dead_letter_columns(&mut db);

    let exhausted_row = db
        .client
        .query_one(
            "SELECT status,last_error_code,dispatched_at,dead_lettered_at
               FROM webhook_outbox WHERE event_id=$1",
            &[&exhausted.event_id],
        )
        .unwrap();
    assert_eq!(exhausted_row.get::<_, String>(0), "dead_letter");
    assert_eq!(exhausted_row.get::<_, String>(1), "RETRY_EXHAUSTED");
    assert!(exhausted_row
        .get::<_, Option<chrono::DateTime<chrono::Utc>>>(2)
        .is_none());
    assert!(exhausted_row
        .get::<_, Option<chrono::DateTime<chrono::Utc>>>(3)
        .is_some());

    let dispatched_row = db
        .client
        .query_one(
            "SELECT status,dispatched_at,dead_lettered_at
               FROM webhook_outbox WHERE event_id=$1",
            &[&dispatched.event_id],
        )
        .unwrap();
    assert_eq!(dispatched_row.get::<_, String>(0), "dispatched");
    assert!(dispatched_row
        .get::<_, Option<chrono::DateTime<chrono::Utc>>>(1)
        .is_some());
    assert!(dispatched_row
        .get::<_, Option<chrono::DateTime<chrono::Utc>>>(2)
        .is_none());

    assert_eq!(
        db.client
            .query_one("SELECT count(*) FROM webhook_events", &[])
            .unwrap()
            .get::<_, i64>(0),
        2
    );
    assert_eq!(
        db.client
            .query_one("SELECT count(*) FROM webhook_outbox", &[])
            .unwrap()
            .get::<_, i64>(0),
        2
    );
}

#[test]
#[ignore = "requires isolated APPCALL_ENGINE_POSTGRES_URL"]
fn concurrent_same_connection_redelivery_inserts_one_public_event() {
    let mut db = Db::new();
    install_review_persistence_columns(&mut db);
    let workers = 8;
    let barrier = std::sync::Arc::new(std::sync::Barrier::new(workers));
    let handles = (0..workers)
        .map(|_| {
            let barrier = barrier.clone();
            let url = std::env::var("APPCALL_ENGINE_POSTGRES_URL").unwrap();
            let schema = db.schema.clone();
            std::thread::spawn(move || {
                let mut client = Client::connect(&url, NoTls).unwrap();
                client
                    .batch_execute(&format!("SET search_path TO {schema}"))
                    .unwrap();
                barrier.wait();
                PgEvents::new(&mut client)
                    .accept(&claims("a"), &parsed("concurrent-provider-key"))
                    .unwrap()
            })
        })
        .collect::<Vec<_>>();
    let results = handles
        .into_iter()
        .map(|handle| handle.join().unwrap())
        .collect::<Vec<IngestResult>>();
    assert_eq!(results.iter().filter(|result| !result.duplicate).count(), 1);
    assert!(results
        .iter()
        .all(|result| result.event_id == results[0].event_id));
    assert_eq!(
        db.client
            .query_one("SELECT count(*) FROM webhook_events", &[])
            .unwrap()
            .get::<_, i64>(0),
        1
    );
    assert_eq!(
        db.client
            .query_one("SELECT count(*) FROM webhook_outbox", &[])
            .unwrap()
            .get::<_, i64>(0),
        1
    );
}

#[test]
#[ignore = "requires isolated APPCALL_ENGINE_POSTGRES_URL"]
fn event_dedup_migration_rolls_back_atomically_and_preserves_legacy_reads() {
    let mut client = Client::connect(
        &std::env::var("APPCALL_ENGINE_POSTGRES_URL").unwrap(),
        NoTls,
    )
    .unwrap();
    let schema = format!("events_legacy_{}", uuid::Uuid::new_v4().simple());
    client
        .batch_execute(&format!(
            "CREATE SCHEMA {schema}; SET search_path TO {schema}"
        ))
        .unwrap();
    for migration in [
        include_str!("../../../migrations/202605140001_init.sql"),
        include_str!("../../../migrations/202605290001_connections_ownership.sql"),
        include_str!("../../../migrations/202605290003_usage_brand_dim.sql"),
        include_str!("../../../migrations/202605290004_connections_owner_check.sql"),
        include_str!("../../../migrations/202609070001_event_outbox.sql"),
    ] {
        client.batch_execute(migration).unwrap();
    }
    client
        .batch_execute(
            "INSERT INTO projects(id,name) VALUES('p','p'); INSERT INTO connections(id,project_id,connector,auth_type,status,external_account_id,credential_owner) VALUES('a','p','slack','api_key','active','brand-a','brand'); INSERT INTO webhook_events(id,project_id,connection_id,connector,operation,payload,external_account_id) VALUES('wh_0123456789abcdef0123456789abcdef','p','a','slack','','{}','brand-a'),('legacy-provider-key','p','a','slack','','{}','brand-a'); INSERT INTO webhook_outbox(project_id,event_id) VALUES('p','wh_0123456789abcdef0123456789abcdef'),('p','legacy-provider-key')",
        )
        .unwrap();
    let mut tx = client.transaction().unwrap();
    let failed_migration = format!(
        "{}\nSELECT 1 / 0;",
        include_str!("../../../migrations/202609110001_event_connection_dedup.sql")
    );
    assert!(tx.batch_execute(&failed_migration).is_err());
    tx.rollback().unwrap();
    assert!(!client
        .query_one(
            "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='webhook_events' AND column_name='provider_event_key')",
            &[],
        )
        .unwrap()
        .get::<_, bool>(0));
    for id in ["wh_0123456789abcdef0123456789abcdef", "legacy-provider-key"] {
        assert_eq!(
            PgEvents::new(&mut client)
                .get(&Principal::project("p").unwrap(), id)
                .unwrap()
                .id,
            id
        );
    }

    client
        .batch_execute(include_str!(
            "../../../migrations/202609110001_event_connection_dedup.sql"
        ))
        .unwrap();
    for id in ["wh_0123456789abcdef0123456789abcdef", "legacy-provider-key"] {
        assert!(client
            .query_one(
                "SELECT provider_event_key IS NULL FROM webhook_events WHERE project_id='p' AND id=$1",
                &[&id],
            )
            .unwrap()
            .get::<_, bool>(0));
        let mut store = PgEvents::new(&mut client);
        assert_eq!(
            store
                .replay(&brand("brand-a"), id, &mut Sink::new(false))
                .unwrap(),
            id
        );
        assert_eq!(
            store
                .accept(
                    &claims("a"),
                    &ParsedWebhook {
                        idempotency_key: id.into(),
                        operation: String::new(),
                        sanitized: json!({}),
                    },
                )
                .unwrap_err(),
            Error::Conflict
        );
    }
    assert_eq!(
        client
            .query_one("SELECT count(*) FROM webhook_events", &[])
            .unwrap()
            .get::<_, i64>(0),
        2
    );
    assert_eq!(
        client
            .query_one("SELECT count(*) FROM webhook_outbox", &[])
            .unwrap()
            .get::<_, i64>(0),
        2
    );
    client
        .batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
        .unwrap();
}

#[test]
#[ignore = "requires isolated APPCALL_ENGINE_POSTGRES_URL"]
fn provider_keys_fail_closed_until_dedup_column_exists() {
    let mut client = Client::connect(
        &std::env::var("APPCALL_ENGINE_POSTGRES_URL").unwrap(),
        NoTls,
    )
    .unwrap();
    let schema = format!("events_no_dedup_column_{}", uuid::Uuid::new_v4().simple());
    client
        .batch_execute(&format!(
            "CREATE SCHEMA {schema}; SET search_path TO {schema}"
        ))
        .unwrap();
    for migration in [
        include_str!("../../../migrations/202605140001_init.sql"),
        include_str!("../../../migrations/202605290001_connections_ownership.sql"),
        include_str!("../../../migrations/202605290003_usage_brand_dim.sql"),
        include_str!("../../../migrations/202605290004_connections_owner_check.sql"),
        include_str!("../../../migrations/202609070001_event_outbox.sql"),
    ] {
        client.batch_execute(migration).unwrap();
    }
    client
        .batch_execute(
            "INSERT INTO projects(id,name) VALUES('p','p'); INSERT INTO connections(id,project_id,connector,auth_type,status,external_account_id,credential_owner) VALUES('a','p','slack','api_key','active','brand-a','brand')",
        )
        .unwrap();
    assert_eq!(
        PgEvents::new(&mut client)
            .accept(&claims("a"), &parsed("provider-before-migration"))
            .unwrap_err(),
        Error::Storage
    );
    assert_eq!(
        client
            .query_one("SELECT count(*) FROM webhook_events", &[])
            .unwrap()
            .get::<_, i64>(0),
        0
    );
    assert_eq!(
        client
            .query_one("SELECT count(*) FROM webhook_outbox", &[])
            .unwrap()
            .get::<_, i64>(0),
        0
    );
    let empty = PgEvents::new(&mut client)
        .accept(
            &claims("a"),
            &ParsedWebhook {
                idempotency_key: String::new(),
                operation: String::new(),
                sanitized: json!({}),
            },
        )
        .unwrap();
    assert!(!empty.duplicate);
    assert!(empty.event_id.starts_with("wh_"));
    client
        .batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
        .unwrap();
}

#[test]
#[ignore = "requires isolated APPCALL_ENGINE_POSTGRES_URL"]
fn event_only_webhooks_retain_usage_and_replay_without_sync_jobs() {
    let mut db = Db::new();
    db.client
        .batch_execute(
            "CREATE TABLE scheduled(project_id text,dedup_key text,input jsonb,PRIMARY KEY(project_id,dedup_key))",
        )
        .unwrap();
    let cases = [
        (
            "apollo",
            "apollo-event",
            "webhook.phone_revealed",
            json!({"personId":"person-1","phone":"+15550001111"}),
        ),
        (
            "rb2b",
            "rb2b-event",
            "webhook.visitor_identified",
            json!({"provider":"rb2b","id":"visitor-1"}),
        ),
    ];
    let mut accepted_ids = Vec::with_capacity(cases.len());
    {
        let mut store = PgEvents::new(&mut db.client);
        for (connection, event_id, operation, payload) in &cases {
            let accepted = store
                .accept(
                    &claims_for(connection, connection),
                    &ParsedWebhook {
                        idempotency_key: (*event_id).into(),
                        operation: (*operation).into(),
                        sanitized: payload.clone(),
                    },
                )
                .unwrap();
            assert!(!accepted.duplicate);
            assert!(accepted.event_id.starts_with("wh_"));
            assert_ne!(accepted.event_id, *event_id);
            accepted_ids.push(accepted.event_id);
        }
    }
    db.client
        .batch_execute("UPDATE connections SET status='disconnected' WHERE id IN ('apollo','rb2b')")
        .unwrap();
    {
        let mut store = PgEvents::new(&mut db.client);
        assert_eq!(
            store.dispatch_pending(2, &mut Sink::new(false)).unwrap(),
            DispatchReport {
                completed: 2,
                failed: 0,
                dead_lettered: 0,
            }
        );
    }
    assert_eq!(
        db.client
            .query_one("SELECT count(*) FROM scheduled", &[])
            .unwrap()
            .get::<_, i64>(0),
        0
    );
    assert_eq!(
        db.client
            .query_one(
                "SELECT count(*) FROM webhook_outbox WHERE dispatched_at IS NULL",
                &[],
            )
            .unwrap()
            .get::<_, i64>(0),
        0
    );
    assert_eq!(
        db.client
            .query_one("SELECT count(*) FROM usage_events", &[])
            .unwrap()
            .get::<_, i64>(0),
        2
    );
    let stored_provider_identities = db
        .client
        .query(
            "SELECT provider_event_key,id FROM webhook_events WHERE project_id='p' ORDER BY provider_event_key",
            &[],
        )
        .unwrap()
        .into_iter()
        .map(|row| {
            (
                row.get::<_, Option<String>>(0),
                row.get::<_, String>(1),
            )
        })
        .collect::<Vec<_>>();
    let expected_provider_identities = cases
        .iter()
        .zip(&accepted_ids)
        .map(|((_, provider_event_key, _, _), event_id)| {
            (Some((*provider_event_key).to_owned()), event_id.clone())
        })
        .collect::<Vec<_>>();
    assert_eq!(stored_provider_identities, expected_provider_identities);
    assert!(expected_provider_identities
        .iter()
        .all(
            |(provider_event_key, event_id)| provider_event_key.as_deref()
                != Some(event_id.as_str())
        ));
    assert_eq!(
        db.client
            .query_one(
                "SELECT sum(quantity)::bigint FROM usage_monthly_rollups WHERE kind='webhook_event'",
                &[],
            )
            .unwrap()
            .get::<_, i64>(0),
        2
    );
    {
        let mut store = PgEvents::new(&mut db.client);
        for ((connection, _, operation, _), event_id) in cases.iter().zip(&accepted_ids) {
            let event = store.get(&brand("brand-a"), event_id).unwrap();
            assert_eq!(event.connector, *connection);
            assert_eq!(event.operation, *operation);
            store
                .replay(&brand("brand-a"), event_id, &mut Sink::new(false))
                .unwrap();
        }
    }
    assert_eq!(
        db.client
            .query_one("SELECT count(*) FROM scheduled", &[])
            .unwrap()
            .get::<_, i64>(0),
        0
    );
    assert_eq!(
        db.client
            .query_one("SELECT count(*) FROM usage_events", &[])
            .unwrap()
            .get::<_, i64>(0),
        2
    );
    assert_eq!(
        db.client
            .query_one(
                "SELECT sum(quantity)::bigint FROM usage_monthly_rollups WHERE kind='webhook_event'",
                &[],
            )
            .unwrap()
            .get::<_, i64>(0),
        2
    );
    assert_eq!(
        db.client
            .query_one("SELECT count(*) FROM webhook_outbox", &[])
            .unwrap()
            .get::<_, i64>(0),
        2
    );
    assert_eq!(
        db.client
            .query_one(
                "SELECT count(*) FROM webhook_outbox WHERE dispatched_at IS NULL",
                &[],
            )
            .unwrap()
            .get::<_, i64>(0),
        0
    );
}

#[test]
#[ignore = "requires isolated APPCALL_ENGINE_POSTGRES_URL"]
fn poisoned_outbox_does_not_starve_and_replays_do_not_double_meter() {
    let mut db = Db::new();
    db.client.batch_execute("CREATE TABLE scheduled(project_id text,dedup_key text,input jsonb,PRIMARY KEY(project_id,dedup_key))").unwrap();
    let mut store = PgEvents::new(&mut db.client);
    let poison = store.accept(&claims("a"), &parsed("poison")).unwrap();
    let healthy = store.accept(&claims("a"), &parsed("healthy")).unwrap();
    let mut sink = Sink::new(true);
    sink.fail_event = Some(poison.event_id.clone());
    assert_eq!(
        store.dispatch_pending(1, &mut sink).unwrap(),
        DispatchReport {
            completed: 0,
            failed: 1,
            dead_lettered: 0,
        }
    );
    assert_eq!(
        store.dispatch_pending(1, &mut sink).unwrap(),
        DispatchReport {
            completed: 1,
            failed: 0,
            dead_lettered: 0,
        }
    );
    db.client
        .execute(
            "UPDATE webhook_outbox SET next_attempt_at=now() WHERE event_id=$1",
            &[&poison.event_id],
        )
        .unwrap();
    sink.fail = false;
    let mut store = PgEvents::new(&mut db.client);
    assert_eq!(store.dispatch_pending(10, &mut sink).unwrap().completed, 1);
    assert_eq!(store.dispatch_pending(10, &mut sink).unwrap().completed, 0);
    assert_eq!(
        store
            .replay(&brand("brand-b"), &healthy.event_id, &mut sink)
            .unwrap_err(),
        Error::NotFound
    );
    store
        .replay(&brand("brand-a"), &healthy.event_id, &mut sink)
        .unwrap();
    assert_eq!(
        db.client
            .query_one(
                "SELECT sum(quantity)::bigint FROM usage_monthly_rollups",
                &[]
            )
            .unwrap()
            .get::<_, i64>(0),
        2
    );
    assert_eq!(
        db.client
            .query_one("SELECT count(*) FROM scheduled", &[])
            .unwrap()
            .get::<_, i64>(0),
        3
    );
}
#[test]
#[ignore = "requires isolated APPCALL_ENGINE_POSTGRES_URL"]
fn stream_cursor_pages_and_scope_are_durable() {
    let mut db = Db::new();
    let mut store = PgEvents::new(&mut db.client);
    let accepted = (0..5)
        .map(|i| {
            store
                .accept(
                    &claims(if i % 2 == 0 { "a" } else { "b" }),
                    &parsed(&format!("e{i}")),
                )
                .unwrap()
        })
        .collect::<Vec<_>>();
    let p = brand("brand-a");
    let mut cursor = String::new();
    let mut ids = Vec::new();
    loop {
        let page = store
            .stream(
                &p,
                &ListRequest {
                    cursor,
                    limit: 1,
                    ..Default::default()
                },
            )
            .unwrap();
        ids.extend(page.events.iter().map(|e| e.id.clone()));
        cursor = page.next_cursor;
        if !page.has_more {
            break;
        }
    }
    assert_eq!(
        ids,
        vec![
            accepted[0].event_id.clone(),
            accepted[2].event_id.clone(),
            accepted[4].event_id.clone(),
        ]
    );
    assert!(store
        .stream(
            &p,
            &ListRequest {
                cursor,
                limit: 1,
                ..Default::default()
            }
        )
        .unwrap()
        .events
        .is_empty());
    assert_eq!(
        store
            .stream(
                &p,
                &ListRequest {
                    cursor: "malformed".into(),
                    ..Default::default()
                }
            )
            .unwrap_err(),
        Error::Invalid
    );
}

#[test]
#[ignore = "requires isolated APPCALL_ENGINE_POSTGRES_URL"]
fn history_snapshot_cursor_covers_the_stream_gap_and_filters_delivery() {
    let mut db = Db::new();
    let mut store = PgEvents::new(&mut db.client);
    store.accept(&claims("a"), &parsed("before")).unwrap();
    let history = store
        .list(
            &brand("brand-a"),
            &ListRequest {
                connector: "slack".into(),
                connection_id: "a".into(),
                operation: "messages.list".into(),
                limit: 1,
                ..Default::default()
            },
        )
        .unwrap();
    assert_eq!(history.events.len(), 1);
    assert!(!history.snapshot_cursor.is_empty());
    let between = store.accept(&claims("a"), &parsed("between")).unwrap();
    store.accept(&claims("b"), &parsed("other-brand")).unwrap();
    let streamed = store
        .stream(
            &brand("brand-a"),
            &ListRequest {
                cursor: history.snapshot_cursor,
                connection_id: "a".into(),
                connector: "slack".into(),
                operation: "messages.list".into(),
                ..Default::default()
            },
        )
        .unwrap();
    assert_eq!(
        streamed
            .events
            .iter()
            .map(|event| event.id.as_str())
            .collect::<Vec<_>>(),
        [between.event_id.as_str()]
    );
}

#[test]
#[ignore = "requires isolated APPCALL_ENGINE_POSTGRES_URL"]
fn parser_signature_and_token_scope_precede_persistence() {
    use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
    use hmac::{Hmac, KeyInit, Mac};
    use sha2::Sha256;
    struct Parser;
    impl WebhookParser for Parser {
        fn verify_and_parse(
            &self,
            connector: &str,
            headers: &[(String, String)],
            _raw: &[u8],
        ) -> Result<ParsedWebhook> {
            assert_eq!(connector, "slack");
            if !headers
                .iter()
                .any(|(k, v)| k == "verified-fixture" && v == "yes")
            {
                return Err(Error::Signature);
            }
            Ok(parsed("verified"))
        }
    }
    let mut db = Db::new();
    let verifier = WebhookVerifier::new("fixture-secret").unwrap();
    let segment = URL_SAFE_NO_PAD.encode(br#"{"p":"p","c":"a","k":"slack"}"#);
    let mut mac = Hmac::<Sha256>::new_from_slice(b"fixture-secret").unwrap();
    mac.update(segment.as_bytes());
    let token = format!(
        "{segment}.{}",
        URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes())
    );
    let raw = br#"{"accessToken":"raw-secret","text":"private content"}"#;
    let mut store = PgEvents::new(&mut db.client);
    let mut request = IngestRequest {
        token: &token,
        connector: "slack",
        connection_id: "b",
        headers: &[],
        raw,
    };
    assert_eq!(
        store.ingest(&verifier, &request, &Parser).unwrap_err(),
        Error::Signature
    );
    request.connection_id = "a";
    assert_eq!(
        store.ingest(&verifier, &request, &Parser).unwrap_err(),
        Error::Signature
    );
    let headers = [("verified-fixture".into(), "yes".into())];
    request.headers = &headers;
    let accepted = store.ingest(&verifier, &request, &Parser).unwrap();
    let event = store.get(&brand("brand-a"), &accepted.event_id).unwrap();
    assert!(event.payload.get("accessToken").is_none());
    assert!(event.payload.get("text").is_none());
    let mut denied = brand("brand-a");
    denied.scopes = Grant::Only(["unrelated".into()].into());
    assert_eq!(
        store.get(&denied, &accepted.event_id).unwrap_err(),
        Error::Forbidden
    );
}

#[test]
#[ignore = "requires isolated APPCALL_ENGINE_POSTGRES_URL"]
fn dispatch_sql_failure_rolls_back_sink_and_metering() {
    let mut db = Db::new();
    db.client.batch_execute("CREATE TABLE scheduled(project_id text,dedup_key text,input jsonb,PRIMARY KEY(project_id,dedup_key)); ALTER TABLE webhook_outbox ADD CONSTRAINT no_dispatch CHECK(dispatched_at IS NULL)").unwrap();
    let mut store = PgEvents::new(&mut db.client);
    store.accept(&claims("a"), &parsed("e")).unwrap();
    assert_eq!(
        store.dispatch_pending(1, &mut Sink::new(false)).unwrap(),
        DispatchReport {
            completed: 0,
            failed: 1,
            dead_lettered: 0,
        }
    );
    assert_eq!(
        db.client
            .query_one("SELECT count(*) FROM scheduled", &[])
            .unwrap()
            .get::<_, i64>(0),
        0
    );
    assert_eq!(
        db.client
            .query_one("SELECT count(*) FROM usage_events", &[])
            .unwrap()
            .get::<_, i64>(0),
        0
    );
    db.client.batch_execute("ALTER TABLE webhook_outbox DROP CONSTRAINT no_dispatch; UPDATE webhook_outbox SET next_attempt_at=now()").unwrap();
    assert_eq!(
        PgEvents::new(&mut db.client)
            .dispatch_pending(1, &mut Sink::new(false))
            .unwrap()
            .completed,
        1
    );
}

#[test]
#[ignore = "requires isolated APPCALL_ENGINE_POSTGRES_URL"]
fn acceptance_commit_order_prevents_stream_gaps() {
    let mut db = Db::new();
    let schema = db.schema.clone();
    let (sent, received) = std::sync::mpsc::channel();
    let mut tx = db.client.transaction().unwrap();
    tx.query_one(
        "SELECT pg_advisory_xact_lock(hashtextextended('p',741))",
        &[],
    )
    .unwrap();
    tx.execute("INSERT INTO webhook_events(id,project_id,connection_id,connector,payload,external_account_id) VALUES('first','p','a','slack','{}','brand-a')",&[]).unwrap();
    let thread = std::thread::spawn(move || {
        let mut second = Client::connect(
            &std::env::var("APPCALL_ENGINE_POSTGRES_URL").unwrap(),
            NoTls,
        )
        .unwrap();
        second
            .batch_execute(&format!("SET search_path TO {schema}"))
            .unwrap();
        sent.send(PgEvents::new(&mut second).accept(&claims("a"), &parsed("second")))
            .unwrap();
    });
    assert!(received
        .recv_timeout(std::time::Duration::from_millis(40))
        .is_err());
    tx.commit().unwrap();
    let accepted = received
        .recv_timeout(std::time::Duration::from_secs(5))
        .unwrap()
        .unwrap();
    thread.join().unwrap();
    let page = PgEvents::new(&mut db.client)
        .stream(&brand("brand-a"), &ListRequest::default())
        .unwrap();
    assert_eq!(
        page.events
            .iter()
            .map(|e| e.id.as_str())
            .collect::<Vec<_>>(),
        vec!["first", accepted.event_id.as_str()]
    );
}

#[test]
#[ignore = "requires explicit isolated PostgreSQL"]
fn acceptance_fences_connection_identity_verified_before_provider_rpc() {
    let mut db = Db::new();
    let revision = db
        .client
        .query_one(
            "SELECT connection_revision FROM connections WHERE project_id='p' AND id='a'",
            &[],
        )
        .unwrap()
        .get::<_, i64>(0);
    let mut snapshot = appcall_store::Connection {
        id: "a".into(),
        project_id: "p".into(),
        connector: "slack".into(),
        auth_type: appcall_store::AuthType::ApiKey,
        status: appcall_store::Status::Active,
        secret_ref_id: String::new(),
        last_test_status: appcall_store::TestStatus::Unknown,
        external_account_id: "brand-a".into(),
        credential_owner: appcall_store::CredentialOwner::Brand,
    };
    snapshot.external_account_id = "prior-brand".into();
    assert_eq!(
        PgEvents::new(&mut db.client).accept_for_connection(
            &claims("a"),
            &parsed("late"),
            &snapshot,
            revision,
        ),
        Err(Error::Conflict)
    );
    assert_eq!(
        db.client
            .query_one("SELECT count(*) FROM webhook_events", &[])
            .unwrap()
            .get::<_, i64>(0),
        0
    );
    snapshot.external_account_id = "brand-a".into();
    snapshot.secret_ref_id = "retired-secret".into();
    assert_eq!(
        PgEvents::new(&mut db.client).accept_for_connection(
            &claims("a"),
            &parsed("late-secret"),
            &snapshot,
            revision,
        ),
        Err(Error::Conflict)
    );
    snapshot.secret_ref_id = String::new();
    assert!(PgEvents::new(&mut db.client)
        .accept_for_connection(&claims("a"), &parsed("fresh"), &snapshot, revision)
        .is_ok());
}
