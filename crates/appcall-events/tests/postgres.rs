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
        ] {
            client.batch_execute(migration).unwrap();
        }
        client.batch_execute("INSERT INTO projects(id,name) VALUES('p','p'),('q','q'); INSERT INTO connections(id,project_id,connector,auth_type,status,credential_owner,external_account_id) VALUES('a','p','slack','api_key','active','brand','brand-a'),('b','p','slack','api_key','active','brand','brand-b'),('other','q','slack','api_key','active','brand','brand-a')").unwrap();
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
    appcall_auth::WebhookClaims {
        project_id: "p".into(),
        connection_id: connection.into(),
        connector: "slack".into(),
    }
}
fn parsed(id: &str) -> ParsedWebhook {
    ParsedWebhook {
        idempotency_key: id.into(),
        operation: "messages.list".into(),
        sanitized: json!({"channel":"C123","safe":true}),
    }
}
fn brand(name: &str) -> Principal {
    let mut p = Principal::project("p").unwrap();
    p.brand_id = Some(name.into());
    p
}
struct Sink {
    fail: bool,
}
impl DispatchSink for Sink {
    fn schedule(&mut self, tx: &mut Transaction<'_>, job: &SyncJob) -> Result<()> {
        if self.fail && job.event_id == "poison" {
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
        .batch_execute(
            "ALTER TABLE webhook_outbox ADD CONSTRAINT reject_test CHECK(event_id <> 'event')",
        )
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
    assert!(
        !store
            .accept(&claims("a"), &parsed("event"))
            .unwrap()
            .duplicate
    );
    assert!(
        store
            .accept(&claims("a"), &parsed("event"))
            .unwrap()
            .duplicate
    );
    assert_eq!(
        store.accept(&claims("b"), &parsed("event")).unwrap_err(),
        Error::Conflict
    );
    assert_eq!(
        store.get(&brand("brand-b"), "event").unwrap_err(),
        Error::NotFound
    );
    let event = store.get(&brand("brand-a"), "event").unwrap();
    assert_eq!(event.external_account_id, "brand-a");
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
fn poisoned_outbox_does_not_starve_and_replays_do_not_double_meter() {
    let mut db = Db::new();
    db.client.batch_execute("CREATE TABLE scheduled(project_id text,dedup_key text,input jsonb,PRIMARY KEY(project_id,dedup_key))").unwrap();
    let mut store = PgEvents::new(&mut db.client);
    store.accept(&claims("a"), &parsed("poison")).unwrap();
    store.accept(&claims("a"), &parsed("healthy")).unwrap();
    let mut sink = Sink { fail: true };
    assert_eq!(
        store.dispatch_pending(1, &mut sink).unwrap(),
        DispatchReport {
            completed: 0,
            failed: 1
        }
    );
    assert_eq!(
        store.dispatch_pending(1, &mut sink).unwrap(),
        DispatchReport {
            completed: 1,
            failed: 0
        }
    );
    db.client
        .execute(
            "UPDATE webhook_outbox SET next_attempt_at=now() WHERE event_id='poison'",
            &[],
        )
        .unwrap();
    sink.fail = false;
    let mut store = PgEvents::new(&mut db.client);
    assert_eq!(store.dispatch_pending(10, &mut sink).unwrap().completed, 1);
    assert_eq!(store.dispatch_pending(10, &mut sink).unwrap().completed, 0);
    assert_eq!(
        store
            .replay(&brand("brand-b"), "healthy", &mut sink)
            .unwrap_err(),
        Error::NotFound
    );
    store
        .replay(&brand("brand-a"), "healthy", &mut sink)
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
    for i in 0..5 {
        store
            .accept(
                &claims(if i % 2 == 0 { "a" } else { "b" }),
                &parsed(&format!("e{i}")),
            )
            .unwrap();
    }
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
    assert_eq!(ids, vec!["e0", "e2", "e4"]);
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
    store.ingest(&verifier, &request, &Parser).unwrap();
    let event = store.get(&brand("brand-a"), "verified").unwrap();
    assert!(event.payload.get("accessToken").is_none());
    assert!(event.payload.get("text").is_none());
    let mut denied = brand("brand-a");
    denied.scopes = Grant::Only(["unrelated".into()].into());
    assert_eq!(
        store.get(&denied, "verified").unwrap_err(),
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
        store
            .dispatch_pending(1, &mut Sink { fail: false })
            .unwrap(),
        DispatchReport {
            completed: 0,
            failed: 1
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
            .dispatch_pending(1, &mut Sink { fail: false })
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
    received
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
        vec!["first", "second"]
    );
}

#[test]
#[ignore = "requires explicit isolated PostgreSQL"]
fn acceptance_fences_connection_identity_verified_before_provider_rpc() {
    let mut db = Db::new();
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
            &snapshot
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
            &snapshot
        ),
        Err(Error::Conflict)
    );
    snapshot.secret_ref_id = String::new();
    assert!(PgEvents::new(&mut db.client)
        .accept_for_connection(&claims("a"), &parsed("fresh"), &snapshot)
        .is_ok());
}
