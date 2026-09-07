use appcall_actions::*;
use postgres::{Client, NoTls};
use serde_json::json;
fn database() -> Option<Client> {
    let url = std::env::var("APPCALL_TEST_DATABASE_URL").ok()?;
    let mut c = Client::connect(&url, NoTls).unwrap();
    c.batch_execute("CREATE TEMP TABLE projects(id text primary key,disabled_at timestamptz);CREATE TEMP TABLE connections(id text primary key,project_id text,connector text,status text,auth_type text,external_account_id text,secret_ref_id text);CREATE TEMP TABLE action_idempotency_claims(project_id text,idempotency_key text,connection_id text,action text,input_hash text,request_id text,leased_until timestamptz,dispatched_at timestamptz,primary key(project_id,idempotency_key));CREATE TEMP TABLE action_idempotency_records(project_id text,idempotency_key text,connection_id text,action text,input_hash text,output jsonb,primary key(project_id,idempotency_key));CREATE TEMP TABLE action_logs(id text primary key,request_id text,project_id text,connection_id text,connector text,action text,status text,error_code text,external_account_id text);CREATE TEMP TABLE action_replay_logs(id text primary key,project_id text,connection_id text,connector text,action text,request_id text,sanitized_input jsonb,external_account_id text);CREATE TEMP TABLE usage_events(id text primary key,project_id text,connection_id text,connector text,action text,kind text,occurred_at timestamptz,external_account_id text,quantity bigint,metering_event_key text,unique(project_id,metering_event_key));CREATE TEMP TABLE usage_monthly_rollups(project_id text,external_account_id text,month text,kind text,quantity bigint,updated_at timestamptz default now(),primary key(project_id,external_account_id,month,kind));INSERT INTO projects VALUES('p',NULL);INSERT INTO connections VALUES('c','p','test','active','api_key','brand',NULL);").unwrap();
    Some(c)
}
fn attempt() -> Attempt {
    Attempt {
        request_id: "r1".into(),
        project_id: "p".into(),
        connection_id: "c".into(),
        connector: "test".into(),
        external_account_id: "brand".into(),
        action: "send".into(),
        key: "k".into(),
        input_hash: "h".into(),
        lease_ms: 60_000,
    }
}
#[test]
fn postgres_claim_dispatch_fence_and_atomic_finish() {
    let Some(client) = database() else { return };
    let rt = tokio::runtime::Runtime::new().unwrap();
    let shared = std::sync::Arc::new(std::sync::Mutex::new(client));
    let repo = PgActionRepository::with_shared_client(shared.clone());
    let a = attempt();
    assert!(matches!(
        rt.block_on(repo.acquire(&a)).unwrap(),
        Acquisition::Acquired
    ));
    let mut stale = a.clone();
    stale.request_id = "stale".into();
    assert_eq!(
        rt.block_on(repo.mark_dispatched(&stale)).unwrap_err().code,
        "IDEMPOTENCY_IN_PROGRESS"
    );
    rt.block_on(repo.mark_dispatched(&a)).unwrap();
    assert_eq!(
        rt.block_on(repo.acquire(&a)).unwrap_err().code,
        "IDEMPOTENCY_IN_PROGRESS"
    );
    shared
        .lock()
        .unwrap()
        .batch_execute(
            "ALTER TABLE usage_monthly_rollups ADD CONSTRAINT reject_test CHECK(quantity<1)",
        )
        .unwrap();
    assert!(rt
        .block_on(repo.finish(&a, Some(&json!({"ok":true})), None))
        .is_err());
    assert_eq!(
        rt.block_on(repo.acquire(&a)).unwrap_err().code,
        "IDEMPOTENCY_IN_PROGRESS"
    );
    assert_eq!(
        shared
            .lock()
            .unwrap()
            .query_one("SELECT count(*) FROM action_logs", &[])
            .unwrap()
            .get::<_, i64>(0),
        0
    );
    shared
        .lock()
        .unwrap()
        .batch_execute("ALTER TABLE usage_monthly_rollups DROP CONSTRAINT reject_test")
        .unwrap();
    rt.block_on(repo.finish(&a, Some(&json!({"ok":true})), None))
        .unwrap();
    assert!(matches!(
        rt.block_on(repo.acquire(&a)).unwrap(),
        Acquisition::Cached(_)
    ));
    let mut c = shared.lock().unwrap();
    assert_eq!(
        c.query_one("SELECT quantity FROM usage_monthly_rollups", &[])
            .unwrap()
            .get::<_, i64>(0),
        1
    );
}
#[test]
fn postgres_expired_pending_owner_cannot_dispatch() {
    let Some(client) = database() else { return };
    let rt = tokio::runtime::Runtime::new().unwrap();
    let shared = std::sync::Arc::new(std::sync::Mutex::new(client));
    let repo = PgActionRepository::with_shared_client(shared.clone());
    let a = attempt();
    rt.block_on(repo.acquire(&a)).unwrap();
    shared
        .lock()
        .unwrap()
        .batch_execute(
            "UPDATE action_idempotency_claims SET leased_until=now()-interval '1 second'",
        )
        .unwrap();
    assert!(rt.block_on(repo.mark_dispatched(&a)).is_err());
    let mut next = a.clone();
    next.request_id = "r2".into();
    rt.block_on(repo.acquire(&next)).unwrap();
    assert!(rt.block_on(repo.mark_dispatched(&a)).is_err());
    rt.block_on(repo.mark_dispatched(&next)).unwrap();
    rt.block_on(repo.release_pending(&next)).unwrap();
    assert!(rt.block_on(repo.acquire(&a)).is_err());
}

#[test]
fn concurrent_completion_is_visible_before_new_claim() {
    let Ok(url) = std::env::var("APPCALL_TEST_DATABASE_URL") else {
        return;
    };
    let schema = format!("action_test_{}", uuid::Uuid::new_v4().simple());
    let mut owner = Client::connect(&url, NoTls).unwrap();
    owner.batch_execute(&format!("CREATE SCHEMA {schema}; SET search_path TO {schema}; CREATE TABLE projects(id text primary key,disabled_at timestamptz); INSERT INTO projects VALUES('p',NULL); CREATE TABLE action_idempotency_claims(project_id text,idempotency_key text,connection_id text,action text,input_hash text,request_id text,leased_until timestamptz,dispatched_at timestamptz,primary key(project_id,idempotency_key)); CREATE TABLE action_idempotency_records(project_id text,idempotency_key text,connection_id text,action text,input_hash text,output jsonb,primary key(project_id,idempotency_key));")).unwrap();
    let mut contender = Client::connect(&url, NoTls).unwrap();
    contender
        .batch_execute(&format!("SET search_path TO {schema}"))
        .unwrap();
    let mut tx = owner.transaction().unwrap();
    tx.query_one(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        &[&"[\"p\",\"k\"]"],
    )
    .unwrap();
    let (sent, received) = std::sync::mpsc::channel();
    let handle = std::thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().unwrap();
        let repo = PgActionRepository::new(contender);
        sent.send(rt.block_on(repo.acquire(&attempt()))).unwrap();
    });
    std::thread::sleep(std::time::Duration::from_millis(100));
    let premature = received.try_recv().ok();
    tx.execute(
        "INSERT INTO action_idempotency_records VALUES('p','k','c','send','h',$1)",
        &[&json!({"ok":true})],
    )
    .unwrap();
    tx.commit().unwrap();
    let outcome = match premature {
        Some(value) => value,
        None => received
            .recv_timeout(std::time::Duration::from_secs(5))
            .unwrap(),
    };
    handle.join().unwrap();
    owner
        .batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
        .unwrap();
    assert!(
        matches!(outcome.unwrap(), Acquisition::Cached(_)),
        "a completed response must win over a new claim"
    );
}

#[test]
fn policies_reserve_all_windows_atomically_and_quarantine_exact_brand() {
    let Some(mut client) = database() else { return };
    client.batch_execute("CREATE TEMP TABLE project_plans(project_id text primary key,plan_key text,status text,overrides jsonb);CREATE TEMP TABLE provider_subaccounts(project_id text,external_account_id text,connector text,channel text,provider_account_id text,status text,created_at timestamptz default now(),updated_at timestamptz default now());CREATE TEMP TABLE action_send_caps(project_id text,external_account_id text,window_key text,send_count bigint,spend_micros bigint,updated_at timestamptz,primary key(project_id,external_account_id,window_key));CREATE TEMP TABLE linkedin_action_counters(project_id text,external_account_id text,action_class text,window_kind text,window_key text,count bigint,last_sent_at timestamptz,updated_at timestamptz,primary key(project_id,external_account_id,action_class,window_kind,window_key));INSERT INTO provider_subaccounts(project_id,external_account_id,connector,channel,provider_account_id,status) VALUES('p','brand','unipile','LINKEDIN','trusted','connected'),('p','other','unipile','LINKEDIN','other-account','connected');").unwrap();
    let rt = tokio::runtime::Runtime::new().unwrap();
    let shared = std::sync::Arc::new(std::sync::Mutex::new(client));
    let repo = PgActionRepository::with_shared_client(shared.clone());
    let policy = PgPolicy::new(
        repo,
        PolicyConfig {
            defaults: Entitlements {
                send_cap: 1,
                ..Default::default()
            },
            ..Default::default()
        },
    )
    .unwrap();
    let r = ExecuteRequest {
        project_id: "p".into(),
        connection_id: "c".into(),
        external_account_id: "brand".into(),
        admin_scope: false,
        action: "linkedin.invitation.send".into(),
        idempotency_key: "k".into(),
        input: json!({"message":"hello"}),
        caller_credential: String::new(),
    };
    let c = Connection {
        id: "c".into(),
        project_id: "p".into(),
        external_account_id: String::new(),
        connector: "unipile".into(),
        status: "active".into(),
        auth_type: "api_key".into(),
        secret_ref_id: None,
    };
    let o = Operation {
        read_only: false,
        timeout_ms: 1000,
        max_input_bytes: 1024,
        max_response_bytes: 1024,
        credential_fields: vec![],
    };
    let routed = rt
        .block_on(policy.prepare_input(&r, &c, json!({"account_id":"forged"})))
        .unwrap();
    assert_eq!(routed["account_id"], "trusted");
    let reservation = rt.block_on(policy.reserve(&r, &c, &o, &routed)).unwrap();
    assert_eq!(
        rt.block_on(policy.reserve(&r, &c, &o, &routed))
            .err()
            .unwrap()
            .code,
        "LINKEDIN_ACTION_TOO_FAST"
    );
    shared.lock().unwrap().batch_execute("UPDATE linkedin_action_counters SET last_sent_at=now()-interval '1 hour' WHERE window_kind='spacing'").unwrap();
    assert_eq!(
        rt.block_on(policy.reserve(&r, &c, &o, &routed))
            .err()
            .unwrap()
            .code,
        "SEND_CAP_EXCEEDED"
    );
    assert_eq!(
        shared
            .lock()
            .unwrap()
            .query_one(
                "SELECT count FROM linkedin_action_counters WHERE window_kind='day'",
                &[]
            )
            .unwrap()
            .get::<_, i64>(0),
        1
    );
    rt.block_on(policy.observe_failure(&r, &c, &reservation, "NOTE_TOO_LONG"))
        .unwrap();
    assert_eq!(
        shared
            .lock()
            .unwrap()
            .query_one(
                "SELECT count FROM linkedin_action_counters WHERE window_kind='month'",
                &[]
            )
            .unwrap()
            .get::<_, i64>(0),
        0
    );
    shared.lock().unwrap().batch_execute("UPDATE provider_subaccounts SET provider_account_id='replacement' WHERE external_account_id='brand'").unwrap();
    rt.block_on(policy.observe_failure(&r, &c, &reservation, "CONNECTOR_ACCOUNT_RESTRICTED"))
        .unwrap();
    assert!(
        rt.block_on(policy.prepare_input(&r, &c, json!({}))).is_ok(),
        "old account restriction must not quarantine replacement"
    );
    shared.lock().unwrap().batch_execute("UPDATE provider_subaccounts SET provider_account_id='trusted' WHERE external_account_id='brand'").unwrap();
    rt.block_on(policy.observe_failure(&r, &c, &reservation, "CONNECTOR_ACCOUNT_RESTRICTED"))
        .unwrap();
    assert_eq!(
        rt.block_on(policy.prepare_input(&r, &c, json!({})))
            .unwrap_err()
            .code,
        "CONNECTION_RESTRICTED"
    );
    assert_eq!(
        shared
            .lock()
            .unwrap()
            .query_one(
                "SELECT status FROM provider_subaccounts WHERE external_account_id='other'",
                &[]
            )
            .unwrap()
            .get::<_, String>(0),
        "connected"
    );
    let plain = Connection {
        connector: "test".into(),
        ..c.clone()
    };
    let spend = PgPolicy::new(
        PgActionRepository::with_shared_client(shared.clone()),
        PolicyConfig {
            defaults: Entitlements {
                spend_cap_micros: 5,
                ..Default::default()
            },
            send_cost_micros: 3,
            ..Default::default()
        },
    )
    .unwrap();
    rt.block_on(spend.reserve(&r, &plain, &o, &json!({})))
        .unwrap();
    assert_eq!(
        rt.block_on(spend.reserve(&r, &plain, &o, &json!({})))
            .err()
            .unwrap()
            .code,
        "SPEND_CAP_EXCEEDED"
    );
    let totals = shared
        .lock()
        .unwrap()
        .query_one("SELECT send_count,spend_micros FROM action_send_caps", &[])
        .unwrap();
    assert_eq!((totals.get::<_, i64>(0), totals.get::<_, i64>(1)), (2, 3));
    let first_send_too_costly = PgPolicy::new(
        PgActionRepository::with_shared_client(shared.clone()),
        PolicyConfig {
            defaults: Entitlements {
                spend_cap_micros: 1,
                ..Default::default()
            },
            send_cost_micros: 2,
            ..Default::default()
        },
    )
    .unwrap();
    let other = ExecuteRequest {
        external_account_id: "newbrand".into(),
        project_id: "p".into(),
        connection_id: "c".into(),
        action: "send".into(),
        admin_scope: false,
        idempotency_key: String::new(),
        input: json!({}),
        caller_credential: String::new(),
    };
    assert_eq!(
        rt.block_on(first_send_too_costly.reserve(&other, &plain, &o, &json!({})))
            .err()
            .unwrap()
            .code,
        "SPEND_CAP_EXCEEDED"
    );
    assert_eq!(
        shared
            .lock()
            .unwrap()
            .query_one(
                "SELECT count(*) FROM action_send_caps WHERE external_account_id='newbrand'",
                &[]
            )
            .unwrap()
            .get::<_, i64>(0),
        0
    );
    shared.lock().unwrap().batch_execute("INSERT INTO usage_monthly_rollups(project_id,external_account_id,month,kind,quantity) VALUES('p','brand',to_char(now() AT TIME ZONE 'UTC','YYYY-MM'),'action_call',1)").unwrap();
    let quota = PgPolicy::new(
        PgActionRepository::with_shared_client(shared.clone()),
        PolicyConfig {
            defaults: Entitlements {
                action_calls_soft: 1,
                action_calls_hard: 2,
                ..Default::default()
            },
            ..Default::default()
        },
    )
    .unwrap();
    let snapshot = rt
        .block_on(quota.reserve(&r, &plain, &o, &json!({})))
        .unwrap()
        .usage;
    assert_eq!(
        (
            snapshot.current,
            snapshot.projected,
            snapshot.soft_limit,
            snapshot.hard_limit
        ),
        (1, 2, 1, 2)
    );
    shared
        .lock()
        .unwrap()
        .batch_execute("UPDATE usage_monthly_rollups SET quantity=2")
        .unwrap();
    rt.block_on(quota.authorize(&r, &plain, &o)).unwrap(); // Completed-key replay is not a new quota reservation.
    let denied = rt
        .block_on(quota.reserve(&r, &plain, &o, &json!({})))
        .err()
        .unwrap();
    assert_eq!(denied.code, "USAGE_LIMIT_EXCEEDED");
    assert_eq!(denied.usage.unwrap().projected, 3);
}

#[test]
fn production_migrations_support_action_finish_and_policy() {
    let Ok(url) = std::env::var("APPCALL_TEST_DATABASE_URL") else {
        return;
    };
    let mut client = Client::connect(&url, NoTls).unwrap();
    let schema = format!("actions_migrations_{}", uuid::Uuid::new_v4().simple());
    client
        .batch_execute(&format!(
            "CREATE SCHEMA {schema};SET search_path TO {schema}"
        ))
        .unwrap();
    let mut migrations =
        std::fs::read_dir(concat!(env!("CARGO_MANIFEST_DIR"), "/../../migrations"))
            .unwrap()
            .map(|p| p.unwrap().path())
            .filter(|p| p.extension().is_some_and(|v| v == "sql"))
            .collect::<Vec<_>>();
    migrations.sort();
    for migration in migrations {
        client
            .batch_execute(&std::fs::read_to_string(migration).unwrap())
            .unwrap();
    }
    client.batch_execute("INSERT INTO projects(id,name) VALUES('p','test'); INSERT INTO connections(id,project_id,connector,status,auth_type,external_account_id,credential_owner) VALUES('c','p','test','active','none','brand','brand')").unwrap();
    let rt = tokio::runtime::Runtime::new().unwrap();
    let repo = PgActionRepository::new(client);
    let policy = PgPolicy::new(repo.clone(), PolicyConfig::default()).unwrap();
    let a = attempt();
    rt.block_on(async {
        repo.acquire(&a).await.unwrap();
        repo.mark_dispatched(&a).await.unwrap();
        assert!(!repo
            .record_replay(&a, &json!({"text":"safe"}))
            .await
            .unwrap()
            .is_empty());
        repo.finish(&a, Some(&json!({"ok":true})), None)
            .await
            .unwrap();
        assert!(matches!(
            repo.acquire(&a).await.unwrap(),
            Acquisition::Cached(_)
        ));
        let r = ExecuteRequest {
            project_id: "p".into(),
            connection_id: "c".into(),
            external_account_id: "brand".into(),
            admin_scope: false,
            action: "send".into(),
            idempotency_key: String::new(),
            input: json!({}),
            caller_credential: String::new(),
        };
        let c = repo.connection("p", "c").await.unwrap();
        let o = Operation {
            read_only: false,
            timeout_ms: 1000,
            max_input_bytes: 1024,
            max_response_bytes: 1024,
            credential_fields: vec![],
        };
        policy.authorize(&r, &c, &o).await.unwrap();
        let reservation = policy.reserve(&r, &c, &o, &json!({})).await.unwrap();
        assert_eq!(reservation.usage.current, 1);
    });
    drop(policy);
    drop(repo);
    drop(rt);
    let barrier = std::sync::Arc::new(std::sync::Barrier::new(2));
    let contenders = (0..2)
        .map(|_| {
            let (url, schema, barrier) = (url.clone(), schema.clone(), barrier.clone());
            std::thread::spawn(move || {
                let mut client = Client::connect(&url, NoTls).unwrap();
                client
                    .batch_execute(&format!("SET search_path TO {schema}"))
                    .unwrap();
                let repo = PgActionRepository::new(client);
                let policy = PgPolicy::new(
                    repo,
                    PolicyConfig {
                        defaults: Entitlements {
                            send_cap: 1,
                            ..Default::default()
                        },
                        ..Default::default()
                    },
                )
                .unwrap();
                let r = ExecuteRequest {
                    project_id: "p".into(),
                    connection_id: "c".into(),
                    external_account_id: "race".into(),
                    admin_scope: false,
                    action: "send".into(),
                    idempotency_key: String::new(),
                    input: json!({}),
                    caller_credential: String::new(),
                };
                let c = Connection {
                    id: "c".into(),
                    project_id: "p".into(),
                    external_account_id: String::new(),
                    connector: "test".into(),
                    status: "active".into(),
                    auth_type: "none".into(),
                    secret_ref_id: None,
                };
                let o = Operation {
                    read_only: false,
                    timeout_ms: 1000,
                    max_input_bytes: 1024,
                    max_response_bytes: 1024,
                    credential_fields: vec![],
                };
                let rt = tokio::runtime::Runtime::new().unwrap();
                barrier.wait();
                rt.block_on(policy.reserve(&r, &c, &o, &json!({}))).is_ok()
            })
        })
        .collect::<Vec<_>>();
    assert_eq!(
        contenders
            .into_iter()
            .map(|h| usize::from(h.join().unwrap()))
            .sum::<usize>(),
        1
    );
    let mut admin = Client::connect(&url, NoTls).unwrap();
    admin
        .batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
        .unwrap();
}

#[test]
fn replay_history_and_logs_preserve_calling_brand_for_shared_platform_connection() {
    let Some(mut client) = database() else { return };
    client
        .execute(
            "UPDATE connections SET external_account_id='' WHERE id='c'",
            &[],
        )
        .unwrap();
    let shared = std::sync::Arc::new(std::sync::Mutex::new(client));
    let repo = PgActionRepository::with_shared_client(shared.clone());
    let rt = tokio::runtime::Runtime::new().unwrap();
    let a = attempt();
    rt.block_on(repo.acquire(&a)).unwrap();
    rt.block_on(repo.mark_dispatched(&a)).unwrap();
    let input = json!({"apiKey":"[REDACTED]","text":"hello"});
    let replay = rt.block_on(repo.record_replay(&a, &input)).unwrap();
    assert!(!replay.is_empty());
    rt.block_on(repo.finish(&a, Some(&json!({"ok":true})), None))
        .unwrap();
    let mut db = shared.lock().unwrap();
    let row = db
        .query_one(
            "SELECT external_account_id,sanitized_input FROM action_replay_logs WHERE id=$1",
            &[&replay],
        )
        .unwrap();
    assert_eq!(row.get::<_, String>(0), "brand");
    assert_eq!(row.get::<_, serde_json::Value>(1), input);
    assert_eq!(
        db.query_one("SELECT external_account_id FROM action_logs", &[])
            .unwrap()
            .get::<_, String>(0),
        "brand"
    );
    drop(db);
    let mut forged = a.clone();
    forged.project_id = "other-project".into();
    forged.request_id = "forged".into();
    assert_eq!(
        rt.block_on(repo.record_replay(&forged, &input))
            .unwrap_err()
            .code,
        "CONNECTION_NOT_FOUND"
    );
    shared
        .lock()
        .unwrap()
        .execute(
            "UPDATE connections SET external_account_id='other-brand' WHERE id='c'",
            &[],
        )
        .unwrap();
    forged.project_id = "p".into();
    assert_eq!(
        rt.block_on(repo.record_replay(&forged, &input))
            .unwrap_err()
            .code,
        "CONNECTION_NOT_FOUND"
    );
}

#[test]
fn dispatch_compares_exact_credential_revision_even_without_idempotency_key() {
    for key in ["k", ""] {
        let Some(client) = database() else { return };
        let shared = std::sync::Arc::new(std::sync::Mutex::new(client));
        let repo = PgActionRepository::with_shared_client(shared.clone());
        let rt = tokio::runtime::Runtime::new().unwrap();
        let mut a = attempt();
        a.key = key.into();
        rt.block_on(repo.acquire(&a)).unwrap();
        let original = rt.block_on(repo.connection("p", "c")).unwrap();
        shared
            .lock()
            .unwrap()
            .execute(
                "UPDATE connections SET secret_ref_id='rotated' WHERE id='c'",
                &[],
            )
            .unwrap();
        assert_eq!(
            rt.block_on(repo.mark_dispatched_checked(&a, &original))
                .unwrap_err()
                .code,
            "CONNECTION_CHANGED"
        );
        assert_eq!(shared.lock().unwrap().query_one("SELECT count(*) FROM action_idempotency_claims WHERE dispatched_at IS NOT NULL",&[]).unwrap().get::<_,i64>(0),0);
        let refreshed = rt.block_on(repo.connection("p", "c")).unwrap();
        rt.block_on(repo.mark_dispatched_checked(&a, &refreshed))
            .unwrap();
        shared
            .lock()
            .unwrap()
            .execute(
                "UPDATE connections SET status='disconnected' WHERE id='c'",
                &[],
            )
            .unwrap();
        assert_eq!(
            rt.block_on(repo.mark_dispatched_checked(&a, &refreshed))
                .unwrap_err()
                .code,
            "CONNECTION_CHANGED"
        );
    }
}

#[test]
fn repository_physical_health_distinguishes_busy_and_poisoned() {
    let Some(client) = database() else { return };
    let shared = std::sync::Arc::new(std::sync::Mutex::new(client));
    let repo = PgActionRepository::with_shared_client(shared.clone());
    assert_eq!(repo.database_health(), Some(true));
    let held = shared.lock().unwrap();
    assert_eq!(repo.database_health(), None);
    drop(held);
    let _ = std::thread::spawn(move || {
        let _held = shared.lock().unwrap();
        panic!("fixture poison");
    })
    .join();
    assert_eq!(repo.database_health(), Some(false));
}
