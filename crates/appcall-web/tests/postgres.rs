use appcall_auth::{JwtVerifier, PostgresMemberships};
use appcall_web::*;
use base64::{engine::general_purpose::STANDARD, Engine};
use postgres::{Client, NoTls};
use sha2::{Digest, Sha256};
#[test]
#[ignore = "requires APPCALL_ENGINE_POSTGRES_URL; isolated temporary schema"]
fn browser_cookie_requires_current_database_membership_and_unrevoked_token() {
    let url = std::env::var("APPCALL_ENGINE_POSTGRES_URL").unwrap();
    let schema = format!(
        "web_identity_{}_{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    );
    struct Cleanup {
        client: Client,
        schema: String,
    }
    impl Drop for Cleanup {
        fn drop(&mut self) {
            self.client
                .batch_execute(&format!("DROP SCHEMA {} CASCADE", self.schema))
                .unwrap();
        }
    }
    let mut admin = Client::connect(&url, NoTls).unwrap();
    admin.batch_execute(&format!("CREATE SCHEMA {schema}; SET search_path TO {schema}; CREATE TABLE users(id text PRIMARY KEY,is_active boolean); CREATE TABLE tenants(id text PRIMARY KEY,is_active boolean); CREATE TABLE tenant_memberships(user_id text,tenant_id text,role text); CREATE TABLE revoked_tokens(token_hash text,expires_at timestamptz); INSERT INTO users VALUES('11111111-1111-1111-1111-111111111111',true); INSERT INTO tenants VALUES('tenant-a',true); INSERT INTO tenant_memberships VALUES('11111111-1111-1111-1111-111111111111','tenant-a','member')")).unwrap();
    let mut cleanup = Cleanup {
        client: admin,
        schema: schema.clone(),
    };
    let mut client = Client::connect(&url, NoTls).unwrap();
    client
        .batch_execute(&format!("SET search_path TO {schema}"))
        .unwrap();
    let memberships = PostgresMemberships::new(client);
    let f: serde_json::Value =
        serde_json::from_str(include_str!("../../appcall-auth/tests/auth_golden.json")).unwrap();
    let jwt = JwtVerifier::new(f["jwt_secret"].as_str().unwrap(), Default::default()).unwrap();
    let broker = Broker::new("http://127.0.0.1:1", "appcall").unwrap();
    let identity = Identity {
        jwt: &jwt,
        memberships: &memberships,
        broker: &broker,
    };
    let codec = SessionCodec::new("synthetic-secret", false).unwrap();
    let session = Session {
        access_token: f["jwt"].as_str().unwrap().into(),
        refresh_token: "synthetic-refresh".into(),
        user_id: "11111111-1111-1111-1111-111111111111".into(),
        tenant_id: "tenant-a".into(),
        tenant_name: "A".into(),
        email: String::new(),
    };
    let session = codec
        .open_session(&codec.seal_session(&session).unwrap())
        .unwrap();
    assert_eq!(
        identity.authorize(&session, 1800000000).unwrap().project_id,
        "proj_tenant-a"
    );
    let foreign = Session {
        tenant_id: "tenant-b".into(),
        ..session.clone()
    };
    assert!(identity.authorize(&foreign, 1800000000).is_err());
    cleanup
        .client
        .execute("UPDATE users SET is_active=false", &[])
        .unwrap();
    assert!(identity.authorize(&session, 1800000000).is_err());
    cleanup
        .client
        .execute("UPDATE users SET is_active=true", &[])
        .unwrap();
    let hash = STANDARD.encode(Sha256::digest(session.access_token.as_bytes()));
    cleanup
        .client
        .execute(
            "INSERT INTO revoked_tokens VALUES($1,now()+interval '1 hour')",
            &[&hash],
        )
        .unwrap();
    assert!(identity.authorize(&session, 1800000000).is_err());
}
