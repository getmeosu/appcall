use postgres::{Client, NoTls};

struct Database {
    admin: Client,
    schema: String,
    client: Client,
}

impl Database {
    fn new() -> Self {
        let url = std::env::var("APPCALL_ENGINE_POSTGRES_URL")
            .expect("explicit local PostgreSQL URL required");
        let mut admin = Client::connect(&url, NoTls).unwrap();
        let schema = format!(
            "store_retention_cascade_{}_{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        );
        admin
            .batch_execute(&format!("CREATE SCHEMA {schema}"))
            .unwrap();
        let mut client = Client::connect(&url, NoTls).unwrap();
        client
            .batch_execute(&format!("SET search_path TO {schema}"))
            .unwrap();
        for migration in [
            include_str!("../../../migrations/202605140001_init.sql"),
            include_str!("../../../migrations/202605290001_connections_ownership.sql"),
            include_str!("../../../migrations/202605290002_provider_subaccounts.sql"),
            include_str!("../../../migrations/202605290004_connections_owner_check.sql"),
            include_str!("../../../migrations/202609070004_oauth_refresh_intents.sql"),
            include_str!("../../../migrations/202609120004_secret_retention.sql"),
        ] {
            client.batch_execute(migration).unwrap();
        }
        Self {
            admin,
            schema,
            client,
        }
    }
}

impl Drop for Database {
    fn drop(&mut self) {
        let _ = self
            .admin
            .batch_execute(&format!("DROP SCHEMA {} CASCADE", self.schema));
    }
}

#[test]
#[ignore = "requires isolated local APPCALL_ENGINE_POSTGRES_URL"]
fn project_delete_cascades_referenced_connection_provider_and_pkce_secrets() {
    let mut db = Database::new();
    db.client
        .batch_execute(
            "INSERT INTO projects(id,name) VALUES ('p','retention'),('q','keep');
             INSERT INTO secret_envelopes(id,project_id,kind,key_id,algorithm,nonce,ciphertext)
               VALUES
                 ('connection-secret','p','oauth_tokens_c','test','fixture',decode('00','hex'),decode('00','hex')),
                 ('provider-secret','p','provider_tokens','test','fixture',decode('01','hex'),decode('01','hex')),
                 ('pkce-secret','p','oauth_pkce_c','test','fixture',decode('02','hex'),decode('02','hex')),
                 ('other-secret','q','oauth_tokens_q','test','fixture',decode('03','hex'),decode('03','hex'));
             INSERT INTO connections(
                 id,project_id,connector,auth_type,status,secret_ref_id,
                 external_account_id,credential_owner
             ) VALUES
                 ('c','p','google-workspace','oauth2','authorizing','connection-secret','brand-a','brand');
             INSERT INTO provider_subaccounts(
                 id,project_id,external_account_id,connector,provider_account_id,status,secret_ref_id
             ) VALUES
                 ('sub','p','brand-a','google-workspace','provider-account','connected','provider-secret');
             INSERT INTO oauth_refresh_intents(
                 project_id,connection_id,attempt_id,secret_ref_id,operation,state,pkce_secret_ref_id
             ) VALUES ('p','c','attempt','connection-secret','authorization','authorizing','pkce-secret');",
        )
        .unwrap();

    db.client
        .execute("DELETE FROM projects WHERE id='p'", &[])
        .unwrap();

    for table in [
        "connections",
        "provider_subaccounts",
        "oauth_refresh_intents",
        "secret_envelopes",
    ] {
        assert_eq!(
            db.client
                .query_one(
                    &format!("SELECT count(*) FROM {table} WHERE project_id='p'"),
                    &[]
                )
                .unwrap()
                .get::<_, i64>(0),
            0,
            "project-owned rows remain in {table}"
        );
    }
    assert_eq!(
        db.client
            .query_one("SELECT count(*) FROM projects WHERE id='q'", &[])
            .unwrap()
            .get::<_, i64>(0),
        1
    );
}
