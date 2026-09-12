use appcall_store::*;
use postgres::{Client, NoTls};
use std::{sync::mpsc, thread, time::Duration};
#[test]
#[ignore = "requires isolated local APPCALL_ENGINE_POSTGRES_URL"]
fn existing_schema_scopes_and_credential_transactions_are_atomic() {
    let url = std::env::var("APPCALL_ENGINE_POSTGRES_URL").unwrap();
    let mut client = Client::connect(&url, NoTls).unwrap();
    let schema = format!("store_test_{}", std::process::id());
    client
        .batch_execute(&format!(
            "CREATE SCHEMA {schema}; SET search_path TO {schema}"
        ))
        .unwrap();
    client
        .batch_execute(include_str!("../../../migrations/202605140001_init.sql"))
        .unwrap();
    client
        .batch_execute(include_str!(
            "../../../migrations/202605290001_connections_ownership.sql"
        ))
        .unwrap();
    client
        .batch_execute(include_str!(
            "../../../migrations/202605290004_connections_owner_check.sql"
        ))
        .unwrap();
    client
        .batch_execute(include_str!(
            "../../../migrations/202609070004_oauth_refresh_intents.sql"
        ))
        .unwrap();
    client
        .batch_execute("INSERT INTO projects(id,name) VALUES ('p','test'),('q','other')")
        .unwrap();
    let mut store = Store::new(client, LocalProvider::new(&[7; 32]).unwrap());
    let scope = Scope::new("p", Some("brand-a")).unwrap();
    let platform = Scope::new("p", None).unwrap();
    let connection = Connection {
        id: "conn".into(),
        project_id: "p".into(),
        connector: "mock".into(),
        auth_type: AuthType::ApiKey,
        status: Status::Active,
        secret_ref_id: String::new(),
        last_test_status: TestStatus::Unknown,
        external_account_id: "brand-a".into(),
        credential_owner: CredentialOwner::Brand,
    };
    store.create(&scope, &connection).unwrap();
    assert!(store.get(&Scope::new("q", None).unwrap(), "conn").is_err());
    assert!(store
        .get(&Scope::new("p", Some("brand-b")).unwrap(), "conn")
        .is_err());
    let rollback: Result<(), Error> = store.transaction(|tx| {
        tx.lock_connection(&scope, "conn")?;
        tx.store_secret("p", "secret", "oauth_tokens_conn", b"synthetic")?;
        tx.replace_credentials(&scope, "conn", "secret", AuthType::OAuth2)?;
        Err(Error::Invalid)
    });
    assert!(rollback.is_err());
    assert!(store.load_secret("p", "secret").is_err());
    assert_eq!(
        store.get(&scope, "conn").unwrap().auth_type,
        AuthType::ApiKey
    );
    store
        .transaction(|tx| {
            tx.lock_connection(&scope, "conn")?;
            tx.store_secret("p", "secret", "oauth_tokens_conn", b"synthetic")?;
            tx.replace_credentials(&scope, "conn", "secret", AuthType::OAuth2)
        })
        .unwrap();
    assert_eq!(
        store.load_secret("p", "secret").unwrap().as_bytes(),
        b"synthetic"
    );
    assert!(store.load_secret("q", "secret").is_err());
    let pooled = Connection {
        id: "pooled".into(),
        external_account_id: String::new(),
        credential_owner: CredentialOwner::Platform,
        ..connection
    };
    store.create(&platform, &pooled).unwrap();
    assert!(store.get(&scope, "pooled").is_ok());
    assert!(store
        .update_status(&scope, "pooled", Status::Disconnected)
        .is_err());
    assert_eq!(store.list(&scope).unwrap().len(), 2);
    assert_eq!(
        store.get_platform_connection("p", "mock").unwrap().id,
        "pooled"
    );
    assert_eq!(
        store
            .get_brand_connection("p", "mock", "brand-a")
            .unwrap()
            .id,
        "conn"
    );
    store
        .update_status(&scope, "conn", Status::Authorizing)
        .unwrap();
    assert_eq!(
        store
            .expire_stale_authorizing(
                "p",
                std::time::SystemTime::now() + std::time::Duration::from_secs(1)
            )
            .unwrap(),
        1
    );
    store.set_secret_ref(&scope, "conn", "secret").unwrap();
    assert!(store
        .replace_credentials(
            &Scope::new("q", None).unwrap(),
            "conn",
            "secret",
            AuthType::ApiKey
        )
        .is_err());
    store
        .transaction(|tx| {
            tx.lock_connection(&scope, "conn")?;
            let mut contender = Client::connect(&url, NoTls).unwrap();
            contender
                .batch_execute(&format!(
                    "SET search_path TO {schema}; SET lock_timeout='30ms'"
                ))
                .unwrap();
            assert!(contender
                .execute(
                    "UPDATE connections SET status='disconnected' WHERE id='conn'",
                    &[]
                )
                .is_err());
            assert_eq!(tx.secret_kind("p", "secret")?, "oauth_tokens_conn");
            Ok(())
        })
        .unwrap();
    store
        .store_secret("q", "other-secret", "api_key", b"other synthetic")
        .unwrap();
    assert!(store
        .replace_credentials(&scope, "conn", "other-secret", AuthType::ApiKey)
        .is_err());
    store
        .update_test_status(&scope, "conn", TestStatus::Passed)
        .unwrap();
    assert_eq!(
        store
            .update_status(&scope, "conn", Status::Disconnected)
            .unwrap()
            .status,
        Status::Disconnected
    );
    let mut client = store.into_client();
    client
        .batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
        .unwrap();
}

#[test]
#[ignore = "requires isolated local APPCALL_ENGINE_POSTGRES_URL"]
fn connection_revision_advances_for_all_stale_snapshot_mutations() {
    let url = std::env::var("APPCALL_ENGINE_POSTGRES_URL").unwrap();
    let mut client = Client::connect(&url, NoTls).unwrap();
    let schema = format!(
        "store_connection_revision_{}_{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    );
    client
        .batch_execute(&format!(
            "CREATE SCHEMA {schema}; SET search_path TO {schema}"
        ))
        .unwrap();
    for sql in [
        include_str!("../../../migrations/202605140001_init.sql"),
        include_str!("../../../migrations/202605290001_connections_ownership.sql"),
        include_str!("../../../migrations/202605290004_connections_owner_check.sql"),
        include_str!("../../../migrations/202609110001_event_connection_dedup.sql"),
        include_str!("../../../migrations/202609070004_oauth_refresh_intents.sql"),
        include_str!("../../../migrations/202609120001_connection_revision.sql"),
    ] {
        client.batch_execute(sql).unwrap();
    }
    client
        .batch_execute("INSERT INTO projects(id,name) VALUES ('p','test');")
        .unwrap();
    let mut store = Store::new(client, LocalProvider::new(&[7; 32]).unwrap());
    let scope = Scope::new("p", None).unwrap();
    let connection = Connection {
        id: "conn".into(),
        project_id: "p".into(),
        connector: "mock".into(),
        auth_type: AuthType::ApiKey,
        status: Status::Active,
        secret_ref_id: String::new(),
        last_test_status: TestStatus::Unknown,
        external_account_id: "brand".into(),
        credential_owner: CredentialOwner::Brand,
    };
    store.create(&scope, &connection).unwrap();
    let revision = |store: &mut Store| store.get_with_revision(&scope, "conn").unwrap().1;
    let initial = revision(&mut store);
    assert_eq!(initial, 1);
    store
        .update_status(&scope, "conn", Status::Disconnected)
        .unwrap();
    let after_disconnect = revision(&mut store);
    assert_eq!(after_disconnect, initial + 1);
    store.update_status(&scope, "conn", Status::Active).unwrap();
    let after_reactivate = revision(&mut store);
    assert_eq!(after_reactivate, after_disconnect + 1);
    store
        .update_test_status(&scope, "conn", TestStatus::Passed)
        .unwrap();
    let after_test = revision(&mut store);
    assert_eq!(after_test, after_reactivate + 1);
    store
        .store_secret("p", "secret", "api_key", b"synthetic")
        .unwrap();
    store.set_secret_ref(&scope, "conn", "secret").unwrap();
    let after_secret = revision(&mut store);
    assert_eq!(after_secret, after_test + 1);
    store
        .replace_credentials(&scope, "conn", "secret", AuthType::OAuth2)
        .unwrap();
    let after_credentials = revision(&mut store);
    assert_eq!(after_credentials, after_secret + 1);
    store
        .update_status(&scope, "conn", Status::Authorizing)
        .unwrap();
    let before_cleanup = revision(&mut store);
    assert_eq!(before_cleanup, after_credentials + 1);
    assert_eq!(
        store
            .expire_stale_authorizing(
                "p",
                std::time::SystemTime::now() + std::time::Duration::from_secs(1),
            )
            .unwrap(),
        1
    );
    assert_eq!(revision(&mut store), before_cleanup + 1);
    let mut client = store.into_client();
    client
        .batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
        .unwrap();
}

#[test]
#[ignore = "requires isolated local APPCALL_ENGINE_POSTGRES_URL"]
fn stale_authorization_cleanup_skips_locked_connection_and_rechecks_intent() {
    let url = std::env::var("APPCALL_ENGINE_POSTGRES_URL").unwrap();
    let schema = format!(
        "store_expiry_race_{}_{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    );
    let mut admin = Client::connect(&url, NoTls).unwrap();
    admin
        .batch_execute(&format!(
            "CREATE SCHEMA {schema}; SET search_path TO {schema}"
        ))
        .unwrap();
    for sql in [
        include_str!("../../../migrations/202605140001_init.sql"),
        include_str!("../../../migrations/202605290001_connections_ownership.sql"),
        include_str!("../../../migrations/202605290004_connections_owner_check.sql"),
        include_str!("../../../migrations/202609070004_oauth_refresh_intents.sql"),
    ] {
        admin.batch_execute(sql).unwrap();
    }
    admin
        .batch_execute("INSERT INTO projects(id,name) VALUES('p','race'); INSERT INTO connections(id,project_id,connector,auth_type,status,external_account_id,credential_owner,created_at,updated_at) VALUES('conn','p','slack','oauth2','authorizing','brand','brand',now()-interval '1 day',now()-interval '1 day'),('stale','p','slack','oauth2','authorizing','brand','brand',now()-interval '1 day',now()-interval '1 day'); INSERT INTO oauth_refresh_intents(project_id,connection_id,attempt_id,secret_ref_id,operation,state,created_at,updated_at) VALUES('p','conn','old-attempt','old-secret','authorization','authorizing',now()-interval '31 minutes',now()-interval '31 minutes')")
        .unwrap();
    let scoped = format!(
        "{url}{}options=-csearch_path%3D{schema}",
        if url.contains('?') { '&' } else { '?' }
    );
    let mut authorizer = Client::connect(&scoped, NoTls).unwrap();
    authorizer.batch_execute("BEGIN").unwrap();
    authorizer
        .query_one("SELECT id FROM connections WHERE id='conn' FOR UPDATE", &[])
        .unwrap();
    let cleanup_client = Client::connect(&scoped, NoTls).unwrap();
    let (done_tx, done_rx) = mpsc::channel();
    let cleanup = thread::spawn(move || {
        let mut store = Store::new(cleanup_client, LocalProvider::new(&[7; 32]).unwrap());
        let result = store.expire_stale_authorizing(
            "p",
            std::time::SystemTime::now() - std::time::Duration::from_secs(30 * 60),
        );
        done_tx.send(result).unwrap();
        result
    });
    let observed = done_rx.recv_timeout(Duration::from_millis(250));
    authorizer
        .execute(
            "UPDATE oauth_refresh_intents SET attempt_id='new-attempt',created_at=now(),updated_at=now() WHERE project_id='p' AND connection_id='conn'",
            &[],
        )
        .unwrap();
    authorizer.batch_execute("COMMIT").unwrap();
    let cleanup_result = cleanup.join().unwrap();
    let conn_status = authorizer
        .query_one("SELECT status FROM connections WHERE id='conn'", &[])
        .ok()
        .map(|row| row.get::<_, String>(0));
    let stale_status = authorizer
        .query_one("SELECT status FROM connections WHERE id='stale'", &[])
        .ok()
        .map(|row| row.get::<_, String>(0));
    let _ = admin.batch_execute(&format!("DROP SCHEMA {schema} CASCADE"));
    assert!(
        matches!(&observed, Ok(Ok(1))),
        "cleanup must skip the locked connection without waiting: observed={observed:?}, final={cleanup_result:?}"
    );
    assert_eq!(cleanup_result, Ok(1));
    assert_eq!(conn_status.as_deref(), Some("authorizing"));
    assert_eq!(stale_status.as_deref(), Some("disconnected"));
}

#[test]
#[ignore = "requires isolated local APPCALL_ENGINE_POSTGRES_URL"]
fn secret_cleanup_keeps_current_intent_pkce_and_provider_references() {
    let url = std::env::var("APPCALL_ENGINE_POSTGRES_URL").unwrap();
    let mut client = Client::connect(&url, NoTls).unwrap();
    let schema = format!(
        "store_secret_gc_{}_{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    );
    client
        .batch_execute(&format!(
            "CREATE SCHEMA {schema}; SET search_path TO {schema}"
        ))
        .unwrap();
    for sql in [
        include_str!("../../../migrations/202605140001_init.sql"),
        include_str!("../../../migrations/202605290001_connections_ownership.sql"),
        include_str!("../../../migrations/202605290004_connections_owner_check.sql"),
        include_str!("../../../migrations/202609070004_oauth_refresh_intents.sql"),
        include_str!("../../../migrations/202605290002_provider_subaccounts.sql"),
        include_str!("../../../migrations/202609120004_secret_retention.sql"),
    ] {
        client.batch_execute(sql).unwrap();
    }
    client
        .batch_execute(
            "INSERT INTO projects(id,name) VALUES('p','test');
             INSERT INTO connections(id,project_id,connector,auth_type,status,secret_ref_id,external_account_id,credential_owner)
               VALUES('c','p','google-workspace','oauth2','active',NULL,'brand','brand'),
                     ('other','p','google-workspace','oauth2','degraded',NULL,'other-brand','brand'),
                     ('legacy','p','google-workspace','oauth2','disconnected',NULL,'legacy-brand','brand');
             INSERT INTO provider_subaccounts(id,project_id,external_account_id,connector,provider_account_id,status,secret_ref_id)
               VALUES('sub','p','brand','unipile','provider','connected',NULL);",
        )
        .unwrap();
    let mut store = Store::new(client, LocalProvider::new(&[7; 32]).unwrap());
    for (id, kind) in [
        ("current", "oauth_tokens_c"),
        ("provider", "provider_token"),
        ("intent", "oauth_tokens_c"),
        ("unknown", "oauth_tokens_c"),
        ("pkce", "oauth_pkce_c"),
        ("legacy-pkce", "oauth_pkce_legacy"),
        ("orphan", "oauth_tokens_c"),
    ] {
        store.store_secret("p", id, kind, b"synthetic").unwrap();
    }
    store
        .transaction(|tx| {
            tx.client().batch_execute(
                "UPDATE connections SET secret_ref_id='current' WHERE id='c';
                 UPDATE provider_subaccounts SET secret_ref_id='provider' WHERE id='sub';
                 INSERT INTO oauth_refresh_intents(project_id,connection_id,attempt_id,secret_ref_id,operation,state,pkce_secret_ref_id)
                   VALUES('p','c','attempt','intent','authorization','dispatched','pkce');
                 INSERT INTO oauth_refresh_intents(project_id,connection_id,attempt_id,secret_ref_id,operation,state,pkce_secret_ref_id)
                   VALUES('p','legacy','legacy-attempt','','authorization','unknown',NULL);
                 UPDATE secret_envelopes SET created_at=now()-interval '8 days';
                 UPDATE oauth_refresh_intents SET secret_ref_id='intent',pkce_secret_ref_id='pkce',state='dispatched',operation='authorization' WHERE project_id='p' AND connection_id='c';
                 INSERT INTO oauth_refresh_intents(project_id,connection_id,attempt_id,secret_ref_id,operation,state)
                   VALUES('p','other','attempt','unknown','refresh','unknown');",
            )?;
            Ok(())
        })
        .unwrap();
    let deleted = store
        .cleanup_expired_secrets(
            std::time::SystemTime::now() - std::time::Duration::from_secs(7 * 24 * 3600),
            1,
        )
        .unwrap();
    assert_eq!(deleted, 1);
    let mut remaining = |id: &str| store.load_secret("p", id).is_ok();
    assert!(remaining("current"));
    assert!(remaining("provider"));
    assert!(remaining("intent"));
    assert!(remaining("unknown"));
    assert!(remaining("pkce"));
    assert!(remaining("legacy-pkce"));
    assert!(!remaining("orphan"));
    let mut client = store.into_client();
    client
        .batch_execute(&format!(
            "UPDATE oauth_refresh_intents SET state='completed' WHERE project_id='p' AND connection_id='c';
             UPDATE provider_subaccounts SET secret_ref_id=NULL WHERE id='sub';
             UPDATE connections SET secret_ref_id=NULL WHERE id='c';
             DROP SCHEMA {schema} CASCADE"
        ))
        .unwrap();
}

#[test]
#[ignore = "requires isolated local APPCALL_ENGINE_POSTGRES_URL"]
fn secret_cleanup_uses_global_age_order_and_respects_batch_bound() {
    let url = std::env::var("APPCALL_ENGINE_POSTGRES_URL").unwrap();
    let mut client = Client::connect(&url, NoTls).unwrap();
    let schema = format!(
        "store_secret_gc_fair_{}_{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    );
    client
        .batch_execute(&format!(
            "CREATE SCHEMA {schema}; SET search_path TO {schema}"
        ))
        .unwrap();
    for sql in [
        include_str!("../../../migrations/202605140001_init.sql"),
        include_str!("../../../migrations/202605290001_connections_ownership.sql"),
        include_str!("../../../migrations/202605290004_connections_owner_check.sql"),
        include_str!("../../../migrations/202609070004_oauth_refresh_intents.sql"),
        include_str!("../../../migrations/202605290002_provider_subaccounts.sql"),
        include_str!("../../../migrations/202609120004_secret_retention.sql"),
    ] {
        client.batch_execute(sql).unwrap();
    }
    let mut store = Store::new(client, LocalProvider::new(&[7; 32]).unwrap());
    for (project, id) in [
        ("p1", "p1-old"),
        ("p1", "p1-new"),
        ("p2", "p2-old"),
        ("p2", "p2-new"),
    ] {
        store
            .transaction(|tx| {
                tx.client().execute(
                    "INSERT INTO projects(id,name) VALUES($1,$1) ON CONFLICT DO NOTHING",
                    &[&project],
                )?;
                tx.store_secret(project, id, "api_key", b"synthetic")
            })
            .unwrap();
    }
    store
        .transaction(|tx| {
            tx.client().batch_execute(
                "UPDATE secret_envelopes SET created_at=CASE id
                   WHEN 'p1-old' THEN now()-interval '8 days'
                   WHEN 'p1-new' THEN now()-interval '8 days'
                   WHEN 'p2-old' THEN now()-interval '10 days'
                   WHEN 'p2-new' THEN now()-interval '10 days'
                 END",
            )?;
            Ok(())
        })
        .unwrap();
    assert_eq!(
        store
            .cleanup_expired_secrets(
                std::time::SystemTime::now() - std::time::Duration::from_secs(7 * 24 * 3600),
                3,
            )
            .unwrap(),
        3
    );
    assert!(store.load_secret("p1", "p1-old").is_ok());
    assert!(store.load_secret("p1", "p1-new").is_err());
    assert!(store.load_secret("p2", "p2-old").is_err());
    assert!(store.load_secret("p2", "p2-new").is_err());
    let mut client = store.into_client();
    client
        .batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
        .unwrap();
}

#[test]
#[ignore = "requires isolated local APPCALL_ENGINE_POSTGRES_URL"]
fn secret_cleanup_advances_past_a_protected_scan_budget() {
    let url = std::env::var("APPCALL_ENGINE_POSTGRES_URL").unwrap();
    let mut client = Client::connect(&url, NoTls).unwrap();
    let schema = format!(
        "store_secret_gc_cursor_{}_{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    );
    client
        .batch_execute(&format!(
            "CREATE SCHEMA {schema}; SET search_path TO {schema}"
        ))
        .unwrap();
    for sql in [
        include_str!("../../../migrations/202605140001_init.sql"),
        include_str!("../../../migrations/202605290001_connections_ownership.sql"),
        include_str!("../../../migrations/202605290004_connections_owner_check.sql"),
        include_str!("../../../migrations/202609070004_oauth_refresh_intents.sql"),
        include_str!("../../../migrations/202605290002_provider_subaccounts.sql"),
        include_str!("../../../migrations/202609120004_secret_retention.sql"),
    ] {
        client.batch_execute(sql).unwrap();
    }
    client
        .batch_execute(
            "INSERT INTO projects(id,name) VALUES('p','test');
             INSERT INTO secret_envelopes(id,project_id,kind,key_id,algorithm,nonce,ciphertext,created_at)
               SELECT 'protected-' || n,'p','api_key','key','aes-256-gcm',decode(repeat('00',12),'hex'),decode(repeat('00',32),'hex'),now()-interval '10 days'
               FROM generate_series(1,1001) AS numbers(n);
             INSERT INTO provider_subaccounts(id,project_id,external_account_id,connector,provider_account_id,status,secret_ref_id)
               SELECT 'sub-' || n,'p','brand','unipile','provider-' || n,'connected','protected-' || n
               FROM generate_series(1,1001) AS numbers(n);
             INSERT INTO secret_envelopes(id,project_id,kind,key_id,algorithm,nonce,ciphertext,created_at)
               VALUES('orphan','p','api_key','key','aes-256-gcm',decode(repeat('00',12),'hex'),decode(repeat('00',32),'hex'),now()-interval '8 days');",
        )
        .unwrap();
    let mut store = Store::new(client, LocalProvider::new(&[7; 32]).unwrap());
    let cutoff = std::time::SystemTime::now() - std::time::Duration::from_secs(7 * 24 * 3600);
    assert_eq!(store.cleanup_expired_secrets(cutoff, 1).unwrap(), 0);
    assert_eq!(store.cleanup_expired_secrets(cutoff, 1).unwrap(), 1);
    assert!(store.load_secret("p", "orphan").is_err());
    let mut client = store.into_client();
    client
        .batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
        .unwrap();
}

#[test]
#[ignore = "requires isolated local APPCALL_ENGINE_POSTGRES_URL"]
fn secret_cleanup_skips_when_reference_writer_holds_table_lock() {
    let url = std::env::var("APPCALL_ENGINE_POSTGRES_URL").unwrap();
    let mut admin = Client::connect(&url, NoTls).unwrap();
    let schema = format!("store_secret_gc_race_{}", std::process::id());
    admin
        .batch_execute(&format!(
            "CREATE SCHEMA {schema}; SET search_path TO {schema}"
        ))
        .unwrap();
    for sql in [
        include_str!("../../../migrations/202605140001_init.sql"),
        include_str!("../../../migrations/202605290001_connections_ownership.sql"),
        include_str!("../../../migrations/202605290004_connections_owner_check.sql"),
        include_str!("../../../migrations/202609070004_oauth_refresh_intents.sql"),
        include_str!("../../../migrations/202605290002_provider_subaccounts.sql"),
        include_str!("../../../migrations/202609120004_secret_retention.sql"),
    ] {
        admin.batch_execute(sql).unwrap();
    }
    admin
        .batch_execute(
            "INSERT INTO projects(id,name) VALUES('p','test');
             INSERT INTO connections(id,project_id,connector,auth_type,status,external_account_id,credential_owner)
               VALUES('c','p','slack','api_key','active','brand','brand');",
        )
        .unwrap();
    let mut store = Store::new(admin, LocalProvider::new(&[7; 32]).unwrap());
    store
        .store_secret("p", "old", "api_key", b"synthetic")
        .unwrap();
    store
        .transaction(|tx| {
            tx.client()
                .batch_execute("UPDATE secret_envelopes SET created_at=now()-interval '8 days'")?;
            Ok(())
        })
        .unwrap();
    let mut writer = Client::connect(&url, NoTls).unwrap();
    writer
        .batch_execute(&format!(
            "SET search_path TO {schema}; BEGIN; SELECT id FROM secret_envelopes WHERE id='old' FOR KEY SHARE"
        ))
        .unwrap();
    assert_eq!(
        store
            .cleanup_expired_secrets(
                std::time::SystemTime::now() - std::time::Duration::from_secs(7 * 24 * 3600),
                100,
            )
            .unwrap(),
        0
    );
    writer
        .execute(
            "UPDATE connections SET secret_ref_id='old' WHERE id='c'",
            &[],
        )
        .unwrap();
    writer.batch_execute("COMMIT").unwrap();
    assert_eq!(
        store
            .transaction(|tx| Ok(tx
                .client()
                .query_one("SELECT secret_ref_id FROM connections WHERE id='c'", &[])
                .unwrap()
                .get::<_, Option<String>>(0)))
            .unwrap()
            .as_deref(),
        Some("old")
    );
    let mut client = store.into_client();
    client
        .batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
        .unwrap();
}

#[test]
fn connection_wire_format_matches_go() {
    let json = r#"{"ID":"c","ProjectID":"p","Connector":"mock","AuthType":"api_key","Status":"active","SecretRefID":"","LastTestStatus":"unknown","ExternalAccountID":"a","CredentialOwner":"brand"}"#;
    let c: Connection = serde_json::from_str(json).unwrap();
    assert_eq!(
        serde_json::to_value(c).unwrap(),
        serde_json::from_str::<serde_json::Value>(json).unwrap()
    );
}

#[test]
#[ignore = "requires isolated local APPCALL_ENGINE_POSTGRES_URL"]
fn physical_health_reports_closed_connection_without_replaying_sql() {
    let url = std::env::var("APPCALL_ENGINE_POSTGRES_URL").unwrap();
    let mut client = Client::connect(&url, NoTls).unwrap();
    let pid: i32 = client
        .query_one("SELECT pg_backend_pid()", &[])
        .unwrap()
        .get(0);
    let mut store = Store::new(client, LocalProvider::new(&[7; 32]).unwrap());
    assert_eq!(store.database_health(), Some(true));
    Client::connect(&url, NoTls)
        .unwrap()
        .execute("SELECT pg_terminate_backend($1)", &[&pid])
        .unwrap();
    assert!(store
        .transaction(|tx| {
            tx.client().simple_query("SELECT 1")?;
            Ok(())
        })
        .is_err());
    assert_eq!(store.database_health(), Some(false));
}
