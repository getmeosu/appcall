use appcall_store::*;
use postgres::{Client, NoTls};
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
