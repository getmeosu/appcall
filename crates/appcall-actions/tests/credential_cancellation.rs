use appcall_actions::{Attempt, Connection, CredentialResolver, LifecycleCredentialResolver};
use appcall_connectors::{Connector, OAuthConfig, Registry};
use appcall_oauth::{AppCredentials, Lifecycle, StateSigner, TokenProvider, TokenSet};
use appcall_store::{AuthType, CredentialOwner, LocalProvider, Scope, Status, Store, TestStatus};
use postgres::{Client, NoTls};
use std::{
    collections::BTreeMap,
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};
struct Provider(AtomicUsize);
impl TokenProvider for Provider {
    fn refresh(
        &self,
        _: &OAuthConfig,
        _: &AppCredentials,
        _: &str,
        _: i64,
    ) -> appcall_oauth::Result<TokenSet> {
        self.0.fetch_add(1, Ordering::SeqCst);
        Err(appcall_oauth::Error::OutcomeUnknown)
    }
    fn exchange(
        &self,
        _: &OAuthConfig,
        _: &AppCredentials,
        _: &str,
        _: &str,
        _: i64,
    ) -> appcall_oauth::Result<TokenSet> {
        panic!("unexpected exchange")
    }
}
#[test]
#[ignore = "requires isolated APPCALL_TEST_DATABASE_URL"]
fn dropping_action_resolution_while_store_is_locked_never_rotates_token() {
    let url = std::env::var("APPCALL_TEST_DATABASE_URL").unwrap();
    let mut client = Client::connect(&url, NoTls).unwrap();
    let schema = format!("credential_cancel_{}", uuid::Uuid::new_v4().simple());
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
    ] {
        client.batch_execute(sql).unwrap();
    }
    client
        .batch_execute("INSERT INTO projects(id,name) VALUES('p','fixture')")
        .unwrap();
    let mut store = Store::new(client, LocalProvider::new(&[7; 32]).unwrap());
    let scope = Scope::new("p", None).unwrap();
    store
        .create(
            &scope,
            &appcall_store::Connection {
                id: "c".into(),
                project_id: "p".into(),
                connector: "google-workspace".into(),
                auth_type: AuthType::OAuth2,
                status: Status::Active,
                secret_ref_id: String::new(),
                last_test_status: TestStatus::Unknown,
                external_account_id: String::new(),
                credential_owner: CredentialOwner::Platform,
            },
        )
        .unwrap();
    store.store_secret("p","old","oauth_tokens_c",br#"{"accessToken":"expired","refreshToken":"rotating-old","expiresAt":"2020-01-01T00:00:00Z"}"#).unwrap();
    store
        .replace_credentials(&scope, "c", "old", AuthType::OAuth2)
        .unwrap();
    let store = Arc::new(Mutex::new(store));
    let registry = Arc::new(
        Registry::from_connectors([Connector::from_bytes(include_bytes!(
            "../../../runner/connectors/google-workspace/manifest.json"
        ))
        .unwrap()])
        .unwrap(),
    );
    let provider = Arc::new(Provider(AtomicUsize::new(0)));
    let lifecycle = Arc::new(Lifecycle::new(
        store.clone(),
        registry,
        BTreeMap::from([(
            "google-workspace".into(),
            AppCredentials {
                client_id: "client".into(),
                client_secret: "secret".into(),
                redirect_uri: "https://app.test/callback".into(),
            },
        )]),
        StateSigner::new(&[1; 32]).unwrap(),
        provider.clone(),
    ));
    let resolver = LifecycleCredentialResolver(lifecycle.clone());
    let connection = Connection {
        id: "c".into(),
        project_id: "p".into(),
        external_account_id: String::new(),
        connector: "google-workspace".into(),
        status: "active".into(),
        auth_type: "oauth2".into(),
        secret_ref_id: Some("old".into()),
    };
    let held = store.lock().unwrap();
    let runtime = tokio::runtime::Runtime::new().unwrap();
    runtime.block_on(async {
        let attempt = Attempt {
            request_id: "request".into(),
            project_id: "p".into(),
            connection_id: "c".into(),
            connector: "google-workspace".into(),
            external_account_id: String::new(),
            action: "healthcheck".into(),
            key: "key".into(),
            input_hash: "hash".into(),
            lease_ms: 1_000,
        };
        let pending = resolver.resolve_for_attempt(&attempt, &connection, "");
        tokio::pin!(pending);
        tokio::select! {biased; _=tokio::time::sleep(Duration::from_millis(25))=>{}, _=&mut pending=>panic!("resolution escaped held mutex")}
    });
    drop(held);
    let deadline = std::time::Instant::now() + Duration::from_secs(2);
    while Arc::strong_count(&lifecycle) > 2 && std::time::Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(5));
    }
    assert_eq!(
        Arc::strong_count(&lifecycle),
        2,
        "blocking resolver did not drain"
    );
    assert_eq!(provider.0.load(Ordering::SeqCst), 0);
    assert_eq!(
        store
            .lock()
            .unwrap()
            .get(&scope, "c")
            .unwrap()
            .secret_ref_id,
        "old"
    );
    drop(resolver);
    drop(lifecycle);
    drop(store);
    drop(runtime);
    Client::connect(&url, NoTls)
        .unwrap()
        .batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
        .unwrap();
}
