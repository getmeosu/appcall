#![cfg(feature = "postgres-store")]
use appcall_auth::*;
use postgres::{Client, NoTls};
use std::time::{SystemTime, UNIX_EPOCH};
#[test]
#[ignore = "requires APPCALL_ENGINE_POSTGRES_URL; creates an isolated temporary schema"]
fn postgres_api_keys_respect_disabled_keys_and_projects() {
    let url = std::env::var("APPCALL_ENGINE_POSTGRES_URL").expect("isolated test database URL");
    let schema = format!(
        "auth_{}_{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    );
    let mut admin = Client::connect(&url, NoTls).unwrap();
    admin
        .batch_execute(&format!("CREATE SCHEMA {schema}"))
        .unwrap();
    struct Cleanup {
        client: Client,
        schema: String,
    }
    impl Drop for Cleanup {
        fn drop(&mut self) {
            let _ = self
                .client
                .batch_execute(&format!("DROP SCHEMA {} CASCADE", self.schema));
        }
    }
    let mut cleanup = Cleanup {
        client: admin,
        schema: schema.clone(),
    };
    cleanup.client.batch_execute(&format!("SET search_path TO {schema}; CREATE TABLE projects(id text PRIMARY KEY,name text,disabled_at timestamptz); CREATE TABLE api_keys(id text PRIMARY KEY,project_id text,key_hash text,disabled_at timestamptz); INSERT INTO projects VALUES('p','Project',NULL)")).unwrap();
    let hash = hash_api_key("synthetic-key");
    cleanup
        .client
        .execute("INSERT INTO api_keys VALUES('key','p',$1,NULL)", &[&hash])
        .unwrap();
    let mut client = Client::connect(&url, NoTls).unwrap();
    client
        .batch_execute(&format!("SET search_path TO {schema}"))
        .unwrap();
    let verifier = PostgresApiKeys::new(client);
    assert_eq!(
        verifier
            .verify_api_key("synthetic-key")
            .unwrap()
            .unwrap()
            .project_id,
        "p"
    );
    assert!(verifier.verify_api_key("wrong").unwrap().is_none());
    assert_lock_timeout(&mut cleanup.client, "api_keys", || {
        verifier.verify_api_key("synthetic-key")
    });
    assert!(verifier.verify_api_key("synthetic-key").unwrap().is_some());
    cleanup
        .client
        .execute("UPDATE api_keys SET disabled_at=now()", &[])
        .unwrap();
    assert!(verifier.verify_api_key("synthetic-key").unwrap().is_none());
    cleanup
        .client
        .execute("UPDATE api_keys SET disabled_at=NULL", &[])
        .unwrap();
    cleanup
        .client
        .execute("UPDATE projects SET disabled_at=now()", &[])
        .unwrap();
    assert!(verifier.verify_api_key("synthetic-key").unwrap().is_none());
    cleanup.client.batch_execute("UPDATE projects SET disabled_at=NULL; ALTER TABLE api_keys RENAME TO api_keys_rows; CREATE FUNCTION slow_auth() RETURNS boolean LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(1.5); RETURN true; END $$; CREATE VIEW api_keys AS SELECT * FROM api_keys_rows WHERE slow_auth()").unwrap();
    assert_eq!(
        verifier.verify_api_key("synthetic-key"),
        Err(AuthError::Unavailable)
    );
    cleanup
        .client
        .batch_execute("DROP VIEW api_keys; ALTER TABLE api_keys_rows RENAME TO api_keys")
        .unwrap();
    assert!(verifier.verify_api_key("synthetic-key").unwrap().is_some());
    cleanup.client.batch_execute("DROP TABLE api_keys").unwrap();
    assert_eq!(
        verifier.verify_api_key("synthetic-key"),
        Err(AuthError::Unavailable)
    );
}

#[test]
#[ignore = "requires APPCALL_ENGINE_POSTGRES_URL; creates an isolated temporary schema"]
fn postgres_membership_checks_tenant_user_and_revocation() {
    let url = std::env::var("APPCALL_ENGINE_POSTGRES_URL").unwrap();
    let schema = format!(
        "auth_member_{}_{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    );
    let mut admin = Client::connect(&url, NoTls).unwrap();
    admin.batch_execute(&format!("CREATE SCHEMA {schema}; SET search_path TO {schema}; CREATE TABLE users(id text PRIMARY KEY,is_active boolean); CREATE TABLE tenants(id text PRIMARY KEY,is_active boolean); CREATE TABLE tenant_memberships(user_id text,tenant_id text,role text); CREATE TABLE revoked_tokens(token_hash text,expires_at timestamptz); INSERT INTO users VALUES('u',true); INSERT INTO tenants VALUES('t',true); INSERT INTO tenant_memberships VALUES('u','t','member')")).unwrap();
    struct Cleanup {
        client: Client,
        schema: String,
    }
    impl Drop for Cleanup {
        fn drop(&mut self) {
            let _ = self
                .client
                .batch_execute(&format!("DROP SCHEMA {} CASCADE", self.schema));
        }
    }
    let mut cleanup = Cleanup {
        client: admin,
        schema: schema.clone(),
    };
    let mut client = Client::connect(&url, NoTls).unwrap();
    client
        .batch_execute(&format!("SET search_path TO {schema}"))
        .unwrap();
    let verifier = PostgresMemberships::new(client);
    let claims: AccessClaims =
        serde_json::from_value(serde_json::json!({"userId":"u","tokenType":"access"})).unwrap();
    assert_eq!(
        verifier
            .verify_membership(&claims, "t", "hash")
            .unwrap()
            .unwrap()
            .tenant_id,
        "t"
    );
    assert_lock_timeout(&mut cleanup.client, "tenant_memberships", || {
        verifier.verify_membership(&claims, "t", "hash")
    });
    assert!(verifier
        .verify_membership(&claims, "t", "hash")
        .unwrap()
        .is_some());
    assert!(verifier
        .verify_membership(&claims, "foreign", "hash")
        .unwrap()
        .is_none());
    cleanup
        .client
        .execute("UPDATE tenants SET is_active=false", &[])
        .unwrap();
    assert!(verifier
        .verify_membership(&claims, "t", "hash")
        .unwrap()
        .is_none());
    cleanup
        .client
        .execute("UPDATE tenants SET is_active=true", &[])
        .unwrap();
    cleanup
        .client
        .execute("UPDATE users SET is_active=false", &[])
        .unwrap();
    assert!(verifier
        .verify_membership(&claims, "t", "hash")
        .unwrap()
        .is_none());
    cleanup
        .client
        .execute("UPDATE users SET is_active=true", &[])
        .unwrap();
    cleanup
        .client
        .execute(
            "INSERT INTO revoked_tokens VALUES('hash',now()-interval '1 day')",
            &[],
        )
        .unwrap();
    assert!(verifier
        .verify_membership(&claims, "t", "hash")
        .unwrap()
        .is_none());
    cleanup
        .client
        .batch_execute("DROP TABLE revoked_tokens")
        .unwrap();
    assert!(matches!(
        verifier.verify_membership(&claims, "t", "different-hash"),
        Err(AuthError::Unavailable)
    ));
}

fn assert_lock_timeout<T: std::fmt::Debug>(
    admin: &mut Client,
    table: &str,
    verify: impl FnOnce() -> Result<T, AuthError>,
) {
    admin
        .batch_execute(&format!(
            "BEGIN; LOCK TABLE {table} IN ACCESS EXCLUSIVE MODE"
        ))
        .unwrap();
    let result = std::thread::scope(|scope| {
        scope.spawn(|| {
            std::thread::sleep(std::time::Duration::from_millis(1500));
            admin.batch_execute("ROLLBACK").unwrap();
        });
        verify()
    });
    assert!(
        matches!(result, Err(AuthError::Unavailable)),
        "blocked query must fail closed: {result:?}"
    );
}
