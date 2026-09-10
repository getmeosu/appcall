use appcall_actions::*;
use postgres::{Client, NoTls};
use serde_json::json;
fn database() -> Option<Client> {
    let url = std::env::var("APPCALL_TEST_DATABASE_URL").ok()?;
    let mut c = Client::connect(&url, NoTls).unwrap();
    c.batch_execute("CREATE TEMP TABLE projects(id text primary key,disabled_at timestamptz);CREATE TEMP TABLE connections(id text primary key,project_id text,connector text,status text,auth_type text,external_account_id text,secret_ref_id text);CREATE TEMP TABLE action_idempotency_claims(project_id text,idempotency_key text,connection_id text,action text,input_hash text,request_id text,leased_until timestamptz,dispatched_at timestamptz,primary key(project_id,idempotency_key));CREATE TEMP TABLE action_idempotency_records(project_id text,idempotency_key text,connection_id text,action text,input_hash text,output jsonb,primary key(project_id,idempotency_key));CREATE TEMP TABLE action_logs(id text primary key,request_id text,project_id text,connection_id text,connector text,action text,status text,error_code text,external_account_id text);CREATE TEMP TABLE action_replay_logs(id text primary key,project_id text,connection_id text,connector text,action text,request_id text,sanitized_input jsonb,external_account_id text);CREATE TEMP TABLE usage_events(id text primary key,project_id text,connection_id text,connector text,action text,kind text,occurred_at timestamptz,external_account_id text,quantity bigint,metering_event_key text,unique(project_id,metering_event_key));CREATE TEMP TABLE usage_monthly_rollups(project_id text,external_account_id text,month text,kind text,quantity bigint,updated_at timestamptz default now(),primary key(project_id,external_account_id,month,kind));CREATE TEMP TABLE action_usage_reservations(id text primary key,project_id text,month text,connection_id text,connector text,action text,external_account_id text default '',state text,expires_at timestamptz,created_at timestamptz default now(),dispatched_at timestamptz,settled_at timestamptz,released_at timestamptz);INSERT INTO projects VALUES('p',NULL);INSERT INTO connections VALUES('c','p','test','active','api_key','brand',NULL);").unwrap();
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

fn quota_request(key: &str) -> ExecuteRequest {
    ExecuteRequest {
        project_id: "p".into(),
        connection_id: "c".into(),
        external_account_id: "brand".into(),
        admin_scope: false,
        action: "send".into(),
        idempotency_key: key.into(),
        input: json!({}),
        caller_credential: String::new(),
    }
}

fn quota_connection() -> Connection {
    Connection {
        id: "c".into(),
        project_id: "p".into(),
        external_account_id: "brand".into(),
        connector: "test".into(),
        status: "active".into(),
        auth_type: "none".into(),
        secret_ref_id: None,
    }
}

fn quota_operation() -> Operation {
    Operation {
        read_only: true,
        timeout_ms: 1_000,
        max_input_bytes: 1_024,
        max_response_bytes: 1_024,
        credential_fields: vec![],
    }
}

fn quota_policy(repo: PgActionRepository, hard: i64) -> PgPolicy {
    PgPolicy::new(
        repo,
        PolicyConfig {
            defaults: Entitlements {
                action_calls_soft: hard,
                action_calls_hard: hard,
                ..Default::default()
            },
            ..Default::default()
        },
    )
    .unwrap()
}

fn create_project_plans(client: &mut Client) {
    client
        .batch_execute(
            "CREATE TEMP TABLE project_plans(project_id text primary key,plan_key text,status text,overrides jsonb)",
        )
        .unwrap();
}

#[test]
#[ignore = "requires APPCALL_TEST_DATABASE_URL"]
fn usage_snapshot_counts_only_active_reservations() {
    let Some(mut client) = database() else { return };
    let month: String = client
        .query_one("SELECT to_char(now() AT TIME ZONE 'UTC','YYYY-MM')", &[])
        .unwrap()
        .get(0);
    client
        .execute(
            "INSERT INTO usage_monthly_rollups(project_id,external_account_id,month,kind,quantity)
             VALUES('p','brand',$1,'action_call',3)",
            &[&month],
        )
        .unwrap();
    for (id, state) in [
        ("pending-active", "pending"),
        ("dispatched-active", "dispatched"),
    ] {
        client
            .execute(
                "INSERT INTO action_usage_reservations(
                     id,project_id,month,connection_id,connector,action,state,expires_at
                 ) VALUES($1,'p',$2,'c','test','send',$3,now()+interval '1 hour')",
                &[&id, &month, &state],
            )
            .unwrap();
    }
    for (id, state) in [
        ("pending-expired", "pending"),
        ("dispatched-expired", "dispatched"),
    ] {
        client
            .execute(
                "INSERT INTO action_usage_reservations(
                     id,project_id,month,connection_id,connector,action,state,expires_at
                 ) VALUES($1,'p',$2,'c','test','send',$3,now()-interval '1 hour')",
                &[&id, &month, &state],
            )
            .unwrap();
    }
    let prior_month: String = client
        .query_one(
            "SELECT to_char((now() AT TIME ZONE 'UTC' - interval '1 month'),'YYYY-MM')",
            &[],
        )
        .unwrap()
        .get(0);
    for (id, project, reservation_month) in [
        ("other-project-active", "other", month.as_str()),
        ("prior-month-active", "p", prior_month.as_str()),
    ] {
        client
            .execute(
                "INSERT INTO action_usage_reservations(
                     id,project_id,month,connection_id,connector,action,state,expires_at
                 ) VALUES($1,$2,$3,'c','test','send','pending',now()+interval '1 hour')",
                &[&id, &project, &reservation_month],
            )
            .unwrap();
    }
    for (id, state) in [("settled", "settled"), ("released", "released")] {
        client
            .execute(
                "INSERT INTO action_usage_reservations(
                     id,project_id,month,connection_id,connector,action,state,expires_at
                 ) VALUES($1,'p',$2,'c','test','send',$3,now()+interval '1 hour')",
                &[&id, &month, &state],
            )
            .unwrap();
    }
    let entitlements = Entitlements {
        action_calls_soft: 10,
        action_calls_hard: 10,
        ..Default::default()
    };
    let active = usage_snapshot(&mut client, "p", &month, 1, &entitlements).unwrap();
    assert_eq!((active.current, active.projected), (3, 6));

    client
        .batch_execute(
            "UPDATE action_usage_reservations
                SET state=CASE state
                    WHEN 'pending' THEN 'settled'
                    WHEN 'dispatched' THEN 'released'
                    ELSE state
                END
              WHERE id IN ('pending-active','dispatched-active')",
        )
        .unwrap();
    let settled = usage_snapshot(&mut client, "p", &month, 1, &entitlements).unwrap();
    assert_eq!((settled.current, settled.projected), (3, 4));
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
    let cleanup_repo = PgActionRepository::with_shared_client(shared.clone());
    let mut cleanup_attempt = attempt();
    cleanup_attempt.key.clear();
    rt.block_on(cleanup_repo.release_pending_with_reservation(&cleanup_attempt, &reservation))
        .unwrap();
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
    let spend_reservation = rt
        .block_on(spend.reserve(&r, &plain, &o, &json!({})))
        .unwrap();
    rt.block_on(
        cleanup_repo.release_pending_with_reservation(&cleanup_attempt, &spend_reservation),
    )
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
    assert_eq!(denied.usage.unwrap().projected, 4);
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
        let mut quota_attempt = attempt();
        quota_attempt.request_id = "quota-r2".into();
        quota_attempt.key = "quota-k2".into();
        quota_attempt.input_hash = "quota-h2".into();
        repo.acquire(&quota_attempt).await.unwrap();
        repo.mark_dispatched_checked_with_reservation(&quota_attempt, &c, &reservation)
            .await
            .unwrap();
        repo.finish_with_reservation(
            &quota_attempt,
            &reservation,
            Some(&json!({"ok":true})),
            None,
        )
        .await
        .unwrap();
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

#[test]
#[ignore = "requires APPCALL_TEST_DATABASE_URL"]
fn concurrent_quota_reservation_admits_only_one_final_slot() {
    let url = std::env::var("APPCALL_TEST_DATABASE_URL")
        .expect("APPCALL_TEST_DATABASE_URL is required for PostgreSQL quota tests");
    let schema = format!("action_quota_race_{}", uuid::Uuid::new_v4().simple());
    let mut owner = Client::connect(&url, NoTls).unwrap();
    owner
        .batch_execute(&format!(
            "CREATE SCHEMA {schema}; SET search_path TO {schema};
             CREATE TABLE projects(id text primary key, disabled_at timestamptz);
             CREATE TABLE project_plans(project_id text primary key, plan_key text, status text, overrides jsonb);
             CREATE TABLE usage_monthly_rollups(project_id text, external_account_id text, month text, kind text, quantity bigint, updated_at timestamptz default now(), primary key(project_id, external_account_id, month, kind));
             CREATE TABLE action_usage_reservations(id text primary key, project_id text not null, month text not null, connection_id text not null, connector text not null, action text not null, external_account_id text not null default '', state text not null, expires_at timestamptz not null, created_at timestamptz not null default now(), dispatched_at timestamptz, settled_at timestamptz, released_at timestamptz);
             INSERT INTO projects VALUES ('p', NULL);"
        ))
        .unwrap();

    let barrier = std::sync::Arc::new(std::sync::Barrier::new(2));
    let contenders = (0..2)
        .map(|index| {
            let url = url.clone();
            let schema = schema.clone();
            let barrier = barrier.clone();
            std::thread::spawn(move || {
                let mut client = Client::connect(&url, NoTls).unwrap();
                client
                    .batch_execute(&format!("SET search_path TO {schema}"))
                    .unwrap();
                let repository = PgActionRepository::new(client);
                let policy = PgPolicy::new(
                    repository,
                    PolicyConfig {
                        defaults: Entitlements {
                            action_calls_soft: 1,
                            action_calls_hard: 1,
                            ..Default::default()
                        },
                        ..Default::default()
                    },
                )
                .unwrap();
                let request = ExecuteRequest {
                    project_id: "p".into(),
                    connection_id: "c".into(),
                    external_account_id: "brand".into(),
                    admin_scope: false,
                    action: "send".into(),
                    idempotency_key: format!("race-{index}"),
                    input: json!({}),
                    caller_credential: String::new(),
                };
                let connection = Connection {
                    id: "c".into(),
                    project_id: "p".into(),
                    external_account_id: "brand".into(),
                    connector: "test".into(),
                    status: "active".into(),
                    auth_type: "none".into(),
                    secret_ref_id: None,
                };
                let operation = Operation {
                    read_only: true,
                    timeout_ms: 1_000,
                    max_input_bytes: 1_024,
                    max_response_bytes: 1_024,
                    credential_fields: vec![],
                };
                barrier.wait();
                tokio::runtime::Runtime::new()
                    .unwrap()
                    .block_on(policy.reserve(&request, &connection, &operation, &json!({})))
                    .map(|reservation| reservation.usage)
            })
        })
        .collect::<Vec<_>>();
    let outcomes = contenders
        .into_iter()
        .map(|handle| handle.join().unwrap())
        .collect::<Vec<_>>();
    assert_eq!(
        outcomes.iter().filter(|outcome| outcome.is_ok()).count(),
        1,
        "exactly one independent PostgreSQL connection may reserve the final slot: {outcomes:?}"
    );
    assert_eq!(
        outcomes
            .iter()
            .filter_map(|outcome| outcome.as_ref().err())
            .map(|error| error.code.as_str())
            .collect::<Vec<_>>(),
        vec!["USAGE_LIMIT_EXCEEDED"]
    );

    let month: String = owner
        .query_one("SELECT to_char(now() AT TIME ZONE 'UTC','YYYY-MM')", &[])
        .unwrap()
        .get(0);
    let snapshot = usage_snapshot(
        &mut owner,
        "p",
        &month,
        1,
        &Entitlements {
            action_calls_soft: 1,
            action_calls_hard: 1,
            ..Default::default()
        },
    )
    .unwrap();
    assert_eq!((snapshot.current, snapshot.projected), (0, 2));

    let active = owner
        .query_one(
            "SELECT count(*) FROM action_usage_reservations WHERE state IN ('pending','dispatched')",
            &[],
        )
        .unwrap()
        .get::<_, i64>(0);
    assert_eq!(active, 1);
    owner
        .batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
        .unwrap();
}

#[test]
#[ignore = "requires APPCALL_TEST_DATABASE_URL"]
fn quota_settlement_is_month_stable_and_repeated_finish_is_idempotent() {
    let mut client = database().expect("database fixture requires APPCALL_TEST_DATABASE_URL");
    create_project_plans(&mut client);
    let shared = std::sync::Arc::new(std::sync::Mutex::new(client));
    let repo = PgActionRepository::with_shared_client(shared.clone());
    let policy = quota_policy(repo.clone(), 2);
    let request = quota_request("settle-once");
    let connection = quota_connection();
    let operation = quota_operation();
    let rt = tokio::runtime::Runtime::new().unwrap();
    let reservation = rt
        .block_on(policy.reserve(&request, &connection, &operation, &json!({})))
        .unwrap();
    let a = attempt();
    rt.block_on(repo.acquire(&a)).unwrap();
    let revision = rt.block_on(repo.connection("p", "c")).unwrap();
    rt.block_on(repo.mark_dispatched_checked_with_reservation(&a, &revision, &reservation))
        .unwrap();
    rt.block_on(repo.finish_with_reservation(&a, &reservation, Some(&json!({"ok":true})), None))
        .unwrap();
    rt.block_on(repo.finish_with_reservation(&a, &reservation, Some(&json!({"ok":true})), None))
        .unwrap();

    let mut db = shared.lock().unwrap();
    let rollup = db
        .query_one(
            "SELECT month,quantity FROM usage_monthly_rollups WHERE kind='action_call'",
            &[],
        )
        .unwrap();
    assert_eq!(rollup.get::<_, String>(0), reservation.usage.month);
    assert_eq!(rollup.get::<_, i64>(1), 1);
    assert_eq!(
        db.query_one("SELECT count(*) FROM usage_events", &[])
            .unwrap()
            .get::<_, i64>(0),
        1
    );
    assert_eq!(
        db.query_one(
            "SELECT state FROM action_usage_reservations WHERE state='settled'",
            &[],
        )
        .unwrap()
        .get::<_, String>(0),
        "settled"
    );
}

#[test]
#[ignore = "requires APPCALL_TEST_DATABASE_URL"]
fn proven_not_dispatched_release_fences_late_success_and_reuses_slot() {
    let mut client = database().expect("database fixture requires APPCALL_TEST_DATABASE_URL");
    create_project_plans(&mut client);
    let shared = std::sync::Arc::new(std::sync::Mutex::new(client));
    let repo = PgActionRepository::with_shared_client(shared.clone());
    let policy = quota_policy(repo.clone(), 2);
    let request = quota_request("release-slot");
    let connection = quota_connection();
    let operation = quota_operation();
    let rt = tokio::runtime::Runtime::new().unwrap();
    let reservation = rt
        .block_on(policy.reserve(&request, &connection, &operation, &json!({})))
        .unwrap();
    let a = attempt();
    rt.block_on(repo.acquire(&a)).unwrap();
    let revision = rt.block_on(repo.connection("p", "c")).unwrap();
    rt.block_on(repo.mark_dispatched_checked_with_reservation(&a, &revision, &reservation))
        .unwrap();
    rt.block_on(repo.release_not_dispatched_with_reservation(&a, &reservation))
        .unwrap();
    assert_eq!(
        rt.block_on(repo.finish_with_reservation(
            &a,
            &reservation,
            Some(&json!({"late":true})),
            None,
        ))
        .unwrap_err()
        .code,
        "USAGE_RESERVATION_INVALID"
    );

    let next = rt
        .block_on(policy.reserve(
            &quota_request("release-slot-next"),
            &connection,
            &operation,
            &json!({}),
        ))
        .unwrap();
    assert_eq!(next.usage.current, 0);
    assert_eq!(next.usage.projected, 1);
    let mut db = shared.lock().unwrap();
    assert_eq!(
        db.query_one("SELECT count(*) FROM usage_events", &[])
            .unwrap()
            .get::<_, i64>(0),
        0
    );
}

#[test]
#[ignore = "requires APPCALL_TEST_DATABASE_URL"]
fn empty_reservation_not_dispatched_finalizer_requires_owned_claim() {
    let Some(client) = database() else { return };
    let shared = std::sync::Arc::new(std::sync::Mutex::new(client));
    let repo = PgActionRepository::with_shared_client(shared.clone());
    let rt = tokio::runtime::Runtime::new().unwrap();
    let reservation = PolicyReservation::default();
    let first = attempt();
    rt.block_on(repo.acquire(&first)).unwrap();
    rt.block_on(repo.mark_dispatched(&first)).unwrap();
    rt.block_on(repo.release_pending(&first)).unwrap();
    assert_eq!(
        shared
            .lock()
            .unwrap()
            .query_one("SELECT count(*) FROM action_idempotency_claims", &[])
            .unwrap()
            .get::<_, i64>(0),
        1
    );

    let mut stale = first.clone();
    stale.request_id = "stale-owner".into();
    assert_eq!(
        rt.block_on(repo.finish_not_dispatched_with_reservation(
            &stale,
            &reservation,
            "RUNNER_BUSY",
        ))
        .unwrap_err()
        .code,
        "IDEMPOTENCY_IN_PROGRESS"
    );
    assert_eq!(
        shared
            .lock()
            .unwrap()
            .query_one("SELECT count(*) FROM action_idempotency_claims", &[])
            .unwrap()
            .get::<_, i64>(0),
        1
    );

    rt.block_on(repo.finish_not_dispatched_with_reservation(&first, &reservation, "RUNNER_BUSY"))
        .unwrap();
    assert_eq!(
        shared
            .lock()
            .unwrap()
            .query_one("SELECT count(*) FROM action_idempotency_claims", &[])
            .unwrap()
            .get::<_, i64>(0),
        0
    );
    assert_eq!(
        shared
            .lock()
            .unwrap()
            .query_one("SELECT error_code FROM action_logs", &[])
            .unwrap()
            .get::<_, String>(0),
        "RUNNER_BUSY"
    );
    let mut retry = first.clone();
    retry.request_id = "retry-owner".into();
    assert!(matches!(
        rt.block_on(repo.acquire(&retry)).unwrap(),
        Acquisition::Acquired
    ));
    rt.block_on(repo.mark_dispatched(&retry)).unwrap();
    rt.block_on(repo.finish_not_dispatched_with_reservation(&retry, &reservation, "RUNNER_BUSY"))
        .unwrap();
    assert_eq!(
        shared
            .lock()
            .unwrap()
            .query_one("SELECT count(*) FROM action_logs", &[])
            .unwrap()
            .get::<_, i64>(0),
        2
    );
}

#[test]
#[ignore = "requires APPCALL_TEST_DATABASE_URL"]
fn provider_response_releases_quota_but_keeps_mutation_claim_fenced() {
    let mut client = database().expect("database fixture requires APPCALL_TEST_DATABASE_URL");
    create_project_plans(&mut client);
    let shared = std::sync::Arc::new(std::sync::Mutex::new(client));
    let repo = PgActionRepository::with_shared_client(shared.clone());
    let policy = quota_policy(repo.clone(), 1);
    let request = quota_request("response-failure");
    let connection = quota_connection();
    let operation = quota_operation();
    let rt = tokio::runtime::Runtime::new().unwrap();
    let reservation = rt
        .block_on(policy.reserve(&request, &connection, &operation, &json!({})))
        .unwrap();
    let reservation_id = shared
        .lock()
        .unwrap()
        .query_one(
            "SELECT id FROM action_usage_reservations WHERE state='pending'",
            &[],
        )
        .unwrap()
        .get::<_, String>(0);
    let mut a = attempt();
    a.key = "response-failure".into();
    a.request_id = "response-request".into();
    rt.block_on(repo.acquire(&a)).unwrap();
    let revision = rt.block_on(repo.connection("p", "c")).unwrap();
    rt.block_on(repo.mark_dispatched_checked_with_reservation(&a, &revision, &reservation))
        .unwrap();
    rt.block_on(repo.release_quota_with_reservation(&a, &reservation))
        .unwrap();
    rt.block_on(repo.finish_with_reservation(
        &a,
        &reservation,
        None,
        Some("CONNECTOR_UNAVAILABLE"),
    ))
    .unwrap();

    let next = rt
        .block_on(policy.reserve(
            &quota_request("response-failure-next"),
            &connection,
            &operation,
            &json!({}),
        ))
        .unwrap();
    assert_eq!(next.usage.current, 0);
    assert_eq!(next.usage.projected, 1);
    let mut retry = a.clone();
    retry.request_id = "response-retry".into();
    assert_eq!(
        rt.block_on(repo.acquire(&retry)).unwrap_err().code,
        "IDEMPOTENCY_IN_PROGRESS"
    );
    let mut db = shared.lock().unwrap();
    assert_eq!(
        db.query_one(
            "SELECT state FROM action_usage_reservations WHERE id=$1",
            &[&reservation_id],
        )
        .unwrap()
        .get::<_, String>(0),
        "released"
    );
    assert_eq!(
        db.query_one(
            "SELECT count(*) FROM action_idempotency_claims WHERE project_id='p' AND idempotency_key='response-failure'",
            &[],
        )
        .unwrap()
        .get::<_, i64>(0),
        1
    );
}

#[test]
#[ignore = "requires APPCALL_TEST_DATABASE_URL"]
fn prior_month_dispatched_recovery_uses_stored_month_once() {
    let mut client = database().expect("database fixture requires APPCALL_TEST_DATABASE_URL");
    create_project_plans(&mut client);
    let shared = std::sync::Arc::new(std::sync::Mutex::new(client));
    let repo = PgActionRepository::with_shared_client(shared.clone());
    let policy = quota_policy(repo.clone(), 3);
    let connection = quota_connection();
    let operation = quota_operation();
    let rt = tokio::runtime::Runtime::new().unwrap();
    let reservation = rt
        .block_on(policy.reserve(
            &quota_request("prior-month-recovery"),
            &connection,
            &operation,
            &json!({}),
        ))
        .unwrap();
    let mut dispatched_attempt = attempt();
    dispatched_attempt.key = "prior-month-recovery".into();
    dispatched_attempt.request_id = "prior-month-request".into();
    rt.block_on(repo.acquire(&dispatched_attempt)).unwrap();
    let revision = rt.block_on(repo.connection("p", "c")).unwrap();
    rt.block_on(repo.mark_dispatched_checked_with_reservation(
        &dispatched_attempt,
        &revision,
        &reservation,
    ))
    .unwrap();

    let (reservation_id, prior_month) = {
        let mut db = shared.lock().unwrap();
        let id = db
            .query_one(
                "SELECT id FROM action_usage_reservations WHERE state='dispatched'",
                &[],
            )
            .unwrap()
            .get::<_, String>(0);
        let prior = db
            .query_one(
                "SELECT to_char((now() AT TIME ZONE 'UTC' - interval '1 month'),'YYYY-MM')",
                &[],
            )
            .unwrap()
            .get::<_, String>(0);
        db.execute(
            "UPDATE action_usage_reservations
                SET month=$1, created_at=now()-interval '1 month',
                    expires_at=now()-interval '1 second'
              WHERE id=$2",
            &[&prior, &id],
        )
        .unwrap();
        (id, prior)
    };

    let first = rt
        .block_on(policy.reserve(
            &quota_request("prior-month-next"),
            &connection,
            &operation,
            &json!({}),
        ))
        .unwrap();
    let second = rt
        .block_on(policy.reserve(
            &quota_request("prior-month-next-2"),
            &connection,
            &operation,
            &json!({}),
        ))
        .unwrap();
    let mut db = shared.lock().unwrap();
    assert_eq!(
        db.query_one(
            "SELECT state FROM action_usage_reservations WHERE id=$1",
            &[&reservation_id],
        )
        .unwrap()
        .get::<_, String>(0),
        "settled"
    );
    let rollup = db
        .query_one(
            "SELECT month,quantity FROM usage_monthly_rollups WHERE kind='action_call'",
            &[],
        )
        .unwrap();
    assert_eq!(rollup.get::<_, String>(0), prior_month);
    assert_eq!(rollup.get::<_, i64>(1), 1);
    assert_eq!(
        db.query_one(
            "SELECT to_char(occurred_at AT TIME ZONE 'UTC','YYYY-MM') FROM usage_events",
            &[],
        )
        .unwrap()
        .get::<_, String>(0),
        prior_month
    );
    assert_eq!(
        db.query_one("SELECT count(*) FROM usage_events", &[])
            .unwrap()
            .get::<_, i64>(0),
        1
    );
    drop(db);
    let mut release = attempt();
    release.key.clear();
    rt.block_on(repo.release_pending_with_reservation(&release, &first))
        .unwrap();
    rt.block_on(repo.release_pending_with_reservation(&release, &second))
        .unwrap();
    assert_eq!(
        shared
            .lock()
            .unwrap()
            .query_one("SELECT count(*) FROM usage_events", &[])
            .unwrap()
            .get::<_, i64>(0),
        1
    );
}

#[test]
#[ignore = "requires APPCALL_TEST_DATABASE_URL"]
fn quota_denial_commits_prior_month_recovery_cleanup() {
    let mut client = database().expect("database fixture requires APPCALL_TEST_DATABASE_URL");
    create_project_plans(&mut client);
    let shared = std::sync::Arc::new(std::sync::Mutex::new(client));
    let repo = PgActionRepository::with_shared_client(shared.clone());
    let policy = quota_policy(repo, 1);
    let connection = quota_connection();
    let operation = quota_operation();
    let (current_month, prior_month) = {
        let mut db = shared.lock().unwrap();
        let months = db
            .query_one(
                "SELECT to_char(now() AT TIME ZONE 'UTC','YYYY-MM'),
                        to_char((now() AT TIME ZONE 'UTC' - interval '1 month'),'YYYY-MM')",
                &[],
            )
            .unwrap();
        let current = months.get::<_, String>(0);
        let prior = months.get::<_, String>(1);
        db.execute(
            "INSERT INTO usage_monthly_rollups(project_id,external_account_id,month,kind,quantity)
             VALUES('p','brand',$1,'action_call',1)",
            &[&current],
        )
        .unwrap();
        db.execute(
            "INSERT INTO action_usage_reservations(
                 id,project_id,month,connection_id,connector,action,external_account_id,
                 state,expires_at,created_at
             ) VALUES('denied-old','p',$1,'c','test','send','brand','dispatched',
                      now()-interval '1 second',now()-interval '1 month')",
            &[&prior],
        )
        .unwrap();
        (current, prior)
    };
    let rt = tokio::runtime::Runtime::new().unwrap();
    let error = rt
        .block_on(policy.reserve(
            &quota_request("denied-current"),
            &connection,
            &operation,
            &json!({}),
        ))
        .err()
        .expect("full current-month quota must deny admission");
    assert_eq!(error.code, "USAGE_LIMIT_EXCEEDED");
    assert_eq!(
        shared
            .lock()
            .unwrap()
            .query_one(
                "SELECT state FROM action_usage_reservations WHERE id='denied-old'",
                &[],
            )
            .unwrap()
            .get::<_, String>(0),
        "settled"
    );
    let mut db = shared.lock().unwrap();
    assert_eq!(
        db.query_one(
            "SELECT to_char(occurred_at AT TIME ZONE 'UTC','YYYY-MM') FROM usage_events",
            &[],
        )
        .unwrap()
        .get::<_, String>(0),
        prior_month
    );
    assert_eq!(
        db.query_one(
            "SELECT count(*) FROM action_usage_reservations WHERE month=$1",
            &[&current_month],
        )
        .unwrap()
        .get::<_, i64>(0),
        0
    );
    assert_eq!(
        db.query_one("SELECT count(*) FROM usage_events", &[])
            .unwrap()
            .get::<_, i64>(0),
        1
    );
    drop(db);
    let second = rt.block_on(policy.reserve(
        &quota_request("denied-current-again"),
        &connection,
        &operation,
        &json!({}),
    ));
    assert_eq!(
        second
            .err()
            .expect("repeated full current-month quota must remain denied")
            .code,
        "USAGE_LIMIT_EXCEEDED"
    );
    assert_eq!(
        shared
            .lock()
            .unwrap()
            .query_one("SELECT count(*) FROM usage_events", &[])
            .unwrap()
            .get::<_, i64>(0),
        1
    );
}

#[test]
#[ignore = "requires APPCALL_TEST_DATABASE_URL"]
fn malformed_success_keeps_dispatch_for_bounded_recovery() {
    let mut client = database().expect("database fixture requires APPCALL_TEST_DATABASE_URL");
    create_project_plans(&mut client);
    let shared = std::sync::Arc::new(std::sync::Mutex::new(client));
    let repo = PgActionRepository::with_shared_client(shared.clone());
    let policy = quota_policy(repo.clone(), 2);
    let connection = quota_connection();
    let operation = quota_operation();
    let rt = tokio::runtime::Runtime::new().unwrap();
    let reservation = rt
        .block_on(policy.reserve(
            &quota_request("malformed-success"),
            &connection,
            &operation,
            &json!({}),
        ))
        .unwrap();
    let mut dispatched_attempt = attempt();
    dispatched_attempt.key = "malformed-success".into();
    dispatched_attempt.request_id = "malformed-request".into();
    rt.block_on(repo.acquire(&dispatched_attempt)).unwrap();
    let revision = rt.block_on(repo.connection("p", "c")).unwrap();
    rt.block_on(repo.mark_dispatched_checked_with_reservation(
        &dispatched_attempt,
        &revision,
        &reservation,
    ))
    .unwrap();
    rt.block_on(repo.finish_with_reservation(
        &dispatched_attempt,
        &reservation,
        None,
        Some("INVALID_ACTION_INPUT"),
    ))
    .unwrap();
    let mut retry = dispatched_attempt.clone();
    retry.request_id = "malformed-retry".into();
    assert_eq!(
        rt.block_on(repo.acquire(&retry)).unwrap_err().code,
        "IDEMPOTENCY_IN_PROGRESS"
    );
    let reservation_id = shared
        .lock()
        .unwrap()
        .query_one(
            "SELECT id FROM action_usage_reservations WHERE state='dispatched'",
            &[],
        )
        .unwrap()
        .get::<_, String>(0);
    shared
        .lock()
        .unwrap()
        .execute(
            "UPDATE action_usage_reservations SET expires_at=now()-interval '1 second' WHERE id=$1",
            &[&reservation_id],
        )
        .unwrap();
    let next = rt
        .block_on(policy.reserve(
            &quota_request("malformed-next"),
            &connection,
            &operation,
            &json!({}),
        ))
        .unwrap();
    assert_eq!(next.usage.current, 1);
    rt.block_on(repo.finish_with_reservation(
        &dispatched_attempt,
        &reservation,
        Some(&json!({"late":true})),
        None,
    ))
    .unwrap();
    let mut db = shared.lock().unwrap();
    assert_eq!(
        db.query_one("SELECT count(*) FROM usage_events", &[])
            .unwrap()
            .get::<_, i64>(0),
        1
    );
    assert_eq!(
        db.query_one(
            "SELECT quantity FROM usage_monthly_rollups WHERE kind='action_call'",
            &[],
        )
        .unwrap()
        .get::<_, i64>(0),
        1
    );
    drop(db);
    let mut release = attempt();
    release.key.clear();
    rt.block_on(repo.release_pending_with_reservation(&release, &next))
        .unwrap();
}

#[test]
#[ignore = "requires APPCALL_TEST_DATABASE_URL"]
fn pending_expiry_releases_capacity_but_dispatched_recovery_charges_once() {
    let mut client = database().expect("database fixture requires APPCALL_TEST_DATABASE_URL");
    create_project_plans(&mut client);
    let shared = std::sync::Arc::new(std::sync::Mutex::new(client));
    let repo = PgActionRepository::with_shared_client(shared.clone());
    let policy = quota_policy(repo.clone(), 2);
    let request = quota_request("pending-expiry");
    let connection = quota_connection();
    let operation = quota_operation();
    let rt = tokio::runtime::Runtime::new().unwrap();
    let _pending = rt
        .block_on(policy.reserve(&request, &connection, &operation, &json!({})))
        .unwrap();
    let pending_id = shared
        .lock()
        .unwrap()
        .query_one(
            "SELECT id FROM action_usage_reservations WHERE state='pending'",
            &[],
        )
        .unwrap()
        .get::<_, String>(0);
    shared
        .lock()
        .unwrap()
        .execute(
            "UPDATE action_usage_reservations SET expires_at=now()-interval '1 second' WHERE state='pending'",
            &[],
        )
        .unwrap();
    let released = rt
        .block_on(policy.reserve(
            &quota_request("pending-expiry-next"),
            &connection,
            &operation,
            &json!({}),
        ))
        .unwrap();
    assert_eq!(released.usage.current, 0);
    assert_eq!(released.usage.projected, 1);
    let mut release_attempt = attempt();
    release_attempt.key.clear();
    rt.block_on(repo.release_pending_with_reservation(&release_attempt, &released))
        .unwrap();
    assert_eq!(
        shared
            .lock()
            .unwrap()
            .query_one(
                "SELECT state FROM action_usage_reservations WHERE id=$1",
                &[&pending_id],
            )
            .unwrap()
            .get::<_, String>(0),
        "released"
    );

    let dispatch_request = quota_request("dispatch-recovery");
    let dispatched = rt
        .block_on(policy.reserve(&dispatch_request, &connection, &operation, &json!({})))
        .unwrap();
    let mut dispatched_attempt = attempt();
    dispatched_attempt.key = "dispatch-recovery".into();
    dispatched_attempt.request_id = "recovery-request".into();
    rt.block_on(repo.acquire(&dispatched_attempt)).unwrap();
    let revision = rt.block_on(repo.connection("p", "c")).unwrap();
    rt.block_on(repo.mark_dispatched_checked_with_reservation(
        &dispatched_attempt,
        &revision,
        &dispatched,
    ))
    .unwrap();
    shared
        .lock()
        .unwrap()
        .execute(
            "UPDATE action_usage_reservations SET expires_at=now()-interval '1 second' WHERE state='dispatched'",
            &[],
        )
        .unwrap();

    let recovery_policy = quota_policy(repo.clone(), 2);
    let next = rt
        .block_on(recovery_policy.reserve(
            &quota_request("after-recovery"),
            &connection,
            &operation,
            &json!({}),
        ))
        .unwrap();
    assert_eq!(next.usage.current, 1);
    assert_eq!(next.usage.projected, 2);
    rt.block_on(repo.finish_with_reservation(
        &dispatched_attempt,
        &dispatched,
        Some(&json!({"late":true})),
        None,
    ))
    .unwrap();
    let mut db = shared.lock().unwrap();
    assert_eq!(
        db.query_one(
            "SELECT COALESCE(sum(quantity),0)::bigint FROM usage_monthly_rollups",
            &[],
        )
        .unwrap()
        .get::<_, i64>(0),
        1
    );
    assert_eq!(
        db.query_one("SELECT count(*) FROM usage_events", &[])
            .unwrap()
            .get::<_, i64>(0),
        1
    );
}
