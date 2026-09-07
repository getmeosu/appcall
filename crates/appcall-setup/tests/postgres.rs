use appcall_connectors::{Connector, OAuthConfig, Registry};
use appcall_oauth::*;
use appcall_store::{
    AuthType, Connection, CredentialOwner, LocalProvider, Scope, Status, Store, TestStatus,
};
use postgres::{Client, NoTls};
use std::{
    collections::BTreeMap,
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc, Mutex,
    },
};
struct Provider {
    calls: AtomicUsize,
    fail: bool,
}
impl TokenProvider for Provider {
    fn refresh(&self, _: &OAuthConfig, _: &AppCredentials, _: &str, _: i64) -> Result<TokenSet> {
        self.calls.fetch_add(1, Ordering::SeqCst);
        if self.fail {
            return Err(Error::OutcomeUnknown);
        }
        TokenSet::decode(br#"{"accessToken":"fresh","refreshToken":"rotated","expiresAt":"2030-01-01T00:00:00Z"}"#)
    }
    fn exchange(
        &self,
        spec: &OAuthConfig,
        app: &AppCredentials,
        _: &str,
        _: &str,
        now: i64,
    ) -> Result<TokenSet> {
        self.refresh(spec, app, "", now)
    }
}
fn registry() -> Arc<Registry> {
    Arc::new(
        Registry::from_connectors([
            Connector::from_bytes(include_bytes!(
                "../../../runner/connectors/brevo/manifest.json"
            ))
            .unwrap(),
            Connector::from_bytes(include_bytes!(
                "../../../runner/connectors/google-workspace/manifest.json"
            ))
            .unwrap(),
        ])
        .unwrap(),
    )
}
static NEXT: AtomicUsize = AtomicUsize::new(0);
struct Database {
    admin: Client,
    schema: String,
    store: Arc<Mutex<Store>>,
}
impl Database {
    fn new() -> Self {
        let url = std::env::var("APPCALL_ENGINE_POSTGRES_URL").expect("explicit local test URL");
        let mut admin = Client::connect(&url, NoTls).unwrap();
        let schema = format!(
            "oauth_test_{}_{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::SeqCst)
        );
        admin
            .batch_execute(&format!("CREATE SCHEMA {schema}"))
            .unwrap();
        let mut client = Client::connect(&url, NoTls).unwrap();
        client
            .batch_execute(&format!(
                "SET search_path TO {schema};SET statement_timeout='5s'"
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
            .batch_execute("INSERT INTO projects(id,name) VALUES('p','test')")
            .unwrap();
        let mut store = Store::new(client, LocalProvider::new(&[7; 32]).unwrap());
        let scope = Scope::new("p", None).unwrap();
        store
            .create(
                &scope,
                &Connection {
                    id: "c".into(),
                    project_id: "p".into(),
                    connector: "google-workspace".into(),
                    auth_type: AuthType::OAuth2,
                    status: Status::Active,
                    secret_ref_id: "".into(),
                    last_test_status: TestStatus::Unknown,
                    external_account_id: "".into(),
                    credential_owner: CredentialOwner::Platform,
                },
            )
            .unwrap();
        store.store_secret("p","old","oauth_tokens_c",br#"{"accessToken":"expired","refreshToken":"rotating-old","expiresAt":"2020-01-01T00:00:00Z"}"#).unwrap();
        store
            .replace_credentials(&scope, "c", "old", AuthType::OAuth2)
            .unwrap();
        Self {
            admin,
            schema,
            store: Arc::new(Mutex::new(store)),
        }
    }
    fn service(&self, provider: Arc<dyn TokenProvider>) -> Lifecycle {
        Lifecycle::new(
            self.store.clone(),
            registry(),
            BTreeMap::from([(
                "google-workspace".into(),
                AppCredentials {
                    client_id: "client".into(),
                    client_secret: "secret".into(),
                    redirect_uri: "https://app.test/callback".into(),
                },
            )]),
            StateSigner::new(&[1; 32]).unwrap(),
            provider,
        )
        .with_clock(Arc::new(|| 1_800_000_000))
    }
}
impl Drop for Database {
    fn drop(&mut self) {
        let _ = self
            .admin
            .batch_execute(&format!("DROP SCHEMA {} CASCADE", self.schema));
    }
}

struct Validate;
impl appcall_setup::Validator for Validate {
    fn validate(
        &self,
        _: &str,
        _: &str,
        fields: &appcall_setup::Credentials,
    ) -> appcall_setup::Result<()> {
        if fields.fields().get("apiKey").map(String::as_str) == Some("rejected") {
            Err(appcall_setup::Error::ValidationFailed)
        } else {
            Ok(())
        }
    }
}
fn setup(db: &Database) -> appcall_setup::Service {
    appcall_setup::Service::new(
        db.store.clone(),
        registry(),
        Arc::new(db.service(Arc::new(Provider {
            calls: AtomicUsize::new(0),
            fail: false,
        }))),
        Arc::new(Validate),
    )
}
#[test]
#[ignore = "explicit PostgreSQL isolated schema"]
fn atomic_replacement_ownership_and_validation() {
    let db = Database::new();
    let service = setup(&db);
    let platform = appcall_setup::SetupScope::new("p", None).unwrap();
    let brand = appcall_setup::SetupScope::new("p", Some("brand")).unwrap();
    let fields = |value: &str| BTreeMap::from([("apiKey".into(), value.into())]);
    let pooled = service
        .submit(&platform, "brevo", "", &fields("old"))
        .unwrap();
    let own = service
        .submit(&brand, "brevo", "", &fields("brand-key"))
        .unwrap();
    assert_ne!(pooled.id, own.id);
    assert_eq!(service.get(&brand, &pooled.id).unwrap().id, pooled.id);
    assert!(matches!(
        service.disconnect(&brand, &pooled.id),
        Err(appcall_setup::Error::NotFound)
    ));
    service.disconnect(&brand, &own.id).unwrap();
    assert_eq!(
        service.get(&brand, &own.id).unwrap().status,
        Status::Disconnected
    );
    assert_eq!(service.list(&brand).unwrap().len(), 3);
    assert!(matches!(
        service.update(&brand, &pooled.id, "brevo", "", &fields("attack")),
        Err(appcall_setup::Error::NotFound)
    ));
    assert!(matches!(
        service.submit(&platform, "brevo", "", &fields("rejected")),
        Err(appcall_setup::Error::ValidationFailed)
    ));
    let updated = service
        .submit(&platform, "brevo", "", &fields("new"))
        .unwrap();
    assert_eq!(updated.id, pooled.id);
    assert_ne!(updated.secret_ref_id, pooled.secret_ref_id);
    assert_eq!(updated.last_test_status, TestStatus::Unknown);
    db.store.lock().unwrap().transaction(|tx|{tx.client().batch_execute("CREATE FUNCTION reject_setup() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected'; END $$; CREATE TRIGGER reject_setup BEFORE UPDATE ON connections FOR EACH ROW EXECUTE FUNCTION reject_setup()")?;Ok(())}).unwrap();
    let count = |db: &Database| {
        db.store
            .lock()
            .unwrap()
            .transaction(|tx| {
                Ok(tx
                    .client()
                    .query_one("SELECT count(*) FROM secret_envelopes", &[])?
                    .get::<_, i64>(0))
            })
            .unwrap()
    };
    let before = count(&db);
    assert!(matches!(
        service.submit(&platform, "brevo", "", &fields("rollback")),
        Err(appcall_setup::Error::Persistence)
    ));
    assert_eq!(count(&db), before);
    assert_eq!(
        db.store
            .lock()
            .unwrap()
            .get(&Scope::new("p", None).unwrap(), &pooled.id)
            .unwrap()
            .secret_ref_id,
        updated.secret_ref_id
    );
}
#[test]
#[ignore = "explicit PostgreSQL isolated schema"]
fn setup_composes_oauth_callback_and_brand_reconnect() {
    let db = Database::new();
    let service = setup(&db);
    let brand = appcall_setup::SetupScope::new("p", Some("brand")).unwrap();
    let result = service.start(&brand, "google-workspace", None).unwrap();
    assert_eq!(result.connection.status, Status::Authorizing);
    assert_eq!(result.connection.external_account_id, "brand");
    let state = result
        .authorization_url
        .split("state=")
        .nth(1)
        .unwrap()
        .split('&')
        .next()
        .unwrap();
    assert!(service
        .callback("google-workspace", Some("other"), "code", state)
        .is_err());
    assert!(service
        .callback("google-workspace", None, "code", state)
        .is_ok());
    assert!(service
        .start(
            &appcall_setup::SetupScope::new("p", Some("other")).unwrap(),
            "google-workspace",
            Some(&result.connection.id)
        )
        .is_err());
    assert_eq!(
        service
            .start(&brand, "google-workspace", Some(&result.connection.id))
            .unwrap()
            .connection
            .id,
        result.connection.id
    );
}

#[test]
#[ignore = "explicit PostgreSQL isolated schema"]
fn provider_disconnect_is_local_and_preserves_scope() {
    let db = Database::new();
    db.store
        .lock()
        .unwrap()
        .transaction(|tx| {
            tx.client().execute(
                "UPDATE connections SET connector='unipile' WHERE id='c'",
                &[],
            )?;
            Ok(())
        })
        .unwrap();
    let service = setup(&db);
    assert!(matches!(
        service.disconnect(
            &appcall_setup::SetupScope::new("p", Some("brand")).unwrap(),
            "c"
        ),
        Err(appcall_setup::Error::NotFound)
    ));
    let disconnected = service
        .disconnect(&appcall_setup::SetupScope::new("p", None).unwrap(), "c")
        .unwrap();
    assert_eq!(disconnected.status, Status::Disconnected);
    assert_eq!(disconnected.connector, "unipile");
}

#[test]
#[ignore = "explicit PostgreSQL isolated schema"]
fn cancelled_setup_waiting_for_store_never_creates_connection_or_authorization() {
    use std::sync::atomic::AtomicBool;
    for oauth in [false, true] {
        let db = Database::new();
        let service = Arc::new(setup(&db));
        let held = db.store.lock().unwrap();
        let cancelled = Arc::new(AtomicBool::new(false));
        let worker_cancelled = cancelled.clone();
        let (entered_tx, entered_rx) = std::sync::mpsc::channel();
        let worker = std::thread::spawn(move || {
            let active = || {
                let active = !worker_cancelled.load(Ordering::Acquire);
                let _ = entered_tx.send(());
                active
            };
            let scope = appcall_setup::SetupScope::new("p", Some("brand")).unwrap();
            if oauth {
                service
                    .start_checked(&scope, "google-workspace", None, &active)
                    .map(|_| ())
            } else {
                service
                    .submit_checked(
                        &scope,
                        "brevo",
                        "",
                        &BTreeMap::from([("apiKey".into(), "credential".into())]),
                        &active,
                    )
                    .map(|_| ())
            }
        });
        entered_rx
            .recv_timeout(std::time::Duration::from_secs(2))
            .unwrap();
        std::thread::sleep(std::time::Duration::from_millis(20));
        assert!(
            !worker.is_finished(),
            "store contention must hold setup work"
        );
        cancelled.store(true, Ordering::Release);
        drop(held);
        assert!(worker.join().unwrap().is_err());
        let rows = db
            .store
            .lock()
            .unwrap()
            .list(&Scope::new("p", None).unwrap())
            .unwrap();
        assert_eq!(rows.len(), 1, "cancelled setup must not create a row");
        assert_eq!(rows[0].status, Status::Active);
    }
}
