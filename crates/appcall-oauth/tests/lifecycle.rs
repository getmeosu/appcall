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
        Registry::from_connectors([Connector::from_bytes(include_bytes!(
            "../../../runner/connectors/google-workspace/manifest.json"
        ))
        .unwrap()])
        .unwrap(),
    )
}
static NEXT: AtomicUsize = AtomicUsize::new(0);
struct Database {
    admin: Client,
    schema: String,
    url: String,
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
            .batch_execute(include_str!(
                "../../../migrations/202609070001_event_outbox.sql"
            ))
            .unwrap();
        client
            .batch_execute(include_str!(
                "../../../migrations/202609110001_event_connection_dedup.sql"
            ))
            .unwrap();
        client
            .batch_execute(include_str!(
                "../../../migrations/202609120001_connection_revision.sql"
            ))
            .unwrap();
        client
            .batch_execute(include_str!(
                "../../../migrations/202609120002_connection_generation.sql"
            ))
            .unwrap();
        client
            .batch_execute(include_str!(
                "../../../migrations/202605290002_provider_subaccounts.sql"
            ))
            .unwrap();
        client
            .batch_execute(include_str!(
                "../../../migrations/202609120004_secret_retention.sql"
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
            url,
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
#[test]
#[ignore = "uses explicit local PostgreSQL private schema"]
fn refresh_and_unknown_commit_failure_never_reuse_old_rotating_token() {
    for fail_persist in [false, true] {
        let db = Database::new();
        let provider = Arc::new(Provider {
            calls: AtomicUsize::new(0),
            fail: false,
        });
        let service = db.service(provider.clone());
        let scope = Scope::new("p", None).unwrap();
        if fail_persist {
            db.store.lock().unwrap().transaction(|tx|{tx.client().batch_execute("CREATE FUNCTION reject_activate() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status='active' THEN RAISE EXCEPTION 'injected failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_activate BEFORE UPDATE ON connections FOR EACH ROW EXECUTE FUNCTION reject_activate()")?;Ok(())}).unwrap();
        }
        let result = service.resolve(&scope, "c", "google-workspace");
        if fail_persist {
            assert!(matches!(result, Err(Error::Persistence)));
            assert!(matches!(
                service.resolve(&scope, "c", "google-workspace"),
                Err(Error::OutcomeUnknown)
            ));
            assert_eq!(provider.calls.load(Ordering::SeqCst), 1);
            assert_eq!(
                db.store.lock().unwrap().get(&scope, "c").unwrap().status,
                Status::Degraded
            );
        } else {
            let fields = result.unwrap().into_fields();
            assert_eq!(fields.len(), 1);
            assert_eq!(fields["accessToken"], "fresh");
            assert!(service.resolve(&scope, "c", "google-workspace").is_ok());
            assert_eq!(provider.calls.load(Ordering::SeqCst), 1);
        }
    }
}
#[test]
#[ignore = "uses explicit local PostgreSQL private schema"]
fn authorization_is_bound_single_use_and_reconnect_supersedes_state() {
    let db = Database::new();
    let provider = Arc::new(Provider {
        calls: AtomicUsize::new(0),
        fail: false,
    });
    let service = db.service(provider.clone());
    let scope = Scope::new("p", None).unwrap();
    let first = service.start(&scope, "c", "google-workspace").unwrap();
    let state = |url: String| {
        reqwest::Url::parse(&url)
            .unwrap()
            .query_pairs()
            .find(|(k, _)| k == "state")
            .unwrap()
            .1
            .into_owned()
    };
    let old = state(first.authorization_url);
    let current = state(
        service
            .start(&scope, "c", "google-workspace")
            .unwrap()
            .authorization_url,
    );
    assert!(service
        .callback("google-workspace", Some("other"), "code", &current)
        .is_err());
    assert!(service
        .callback("google-workspace", Some("p"), "code", &old)
        .is_err());
    assert_eq!(provider.calls.load(Ordering::SeqCst), 0);
    assert_eq!(
        service
            .callback("google-workspace", None, "code", &current)
            .unwrap()
            .into_fields()["accessToken"],
        "fresh"
    );
    assert!(service
        .callback("google-workspace", None, "code", &current)
        .is_err());
    assert_eq!(provider.calls.load(Ordering::SeqCst), 1);
}

#[test]
#[ignore = "uses explicit local PostgreSQL private schema"]
fn authorization_persists_pkce_reference_for_retention_gc() {
    let db = Database::new();
    let service = db.service(Arc::new(Provider {
        calls: AtomicUsize::new(0),
        fail: false,
    }));
    service
        .start(&Scope::new("p", None).unwrap(), "c", "google-workspace")
        .unwrap();
    let (pkce_ref, kind, state) = db
        .store
        .lock()
        .unwrap()
        .transaction(|tx| {
            let intent = tx.client().query_one(
                "SELECT pkce_secret_ref_id,state FROM oauth_refresh_intents WHERE project_id='p' AND connection_id='c'",
                &[],
            )?;
            let pkce_ref = intent
                .get::<_, Option<String>>("pkce_secret_ref_id")
                .ok_or(appcall_store::Error::Invalid)?;
            let kind = tx
                .client()
                .query_one(
                    "SELECT kind FROM secret_envelopes WHERE id=$1",
                    &[&pkce_ref],
                )?
                .get::<_, String>(0);
            Ok((Some(pkce_ref), kind, intent.get::<_, String>("state")))
        })
        .unwrap();
    assert!(pkce_ref.is_some());
    assert_eq!(kind, "oauth_pkce_c");
    assert_eq!(state, "authorizing");
}

#[test]
#[ignore = "uses explicit local PostgreSQL private schema"]
fn authorization_accepts_legacy_signed_pkce_state_without_persisted_reference() {
    let db = Database::new();
    let provider = Arc::new(Provider {
        calls: AtomicUsize::new(0),
        fail: false,
    });
    let service = db.service(provider.clone());
    let start = service
        .start(&Scope::new("p", None).unwrap(), "c", "google-workspace")
        .unwrap();
    let state = reqwest::Url::parse(&start.authorization_url)
        .unwrap()
        .query_pairs()
        .find(|(key, _)| key == "state")
        .unwrap()
        .1
        .into_owned();
    db.store
        .lock()
        .unwrap()
        .transaction(|tx| {
            tx.client().execute(
                "UPDATE oauth_refresh_intents SET pkce_secret_ref_id=NULL WHERE project_id='p' AND connection_id='c'",
                &[],
            )?;
            Ok(())
        })
        .unwrap();
    assert!(service
        .callback("google-workspace", Some("p"), "code", &state)
        .is_ok());
    assert_eq!(provider.calls.load(Ordering::SeqCst), 1);
}

#[test]
#[ignore = "uses explicit local PostgreSQL private schema"]
fn completed_authorization_releases_pkce_for_conservative_cleanup() {
    let db = Database::new();
    let provider = Arc::new(Provider {
        calls: AtomicUsize::new(0),
        fail: false,
    });
    let service = db.service(provider);
    let start = service
        .start(&Scope::new("p", None).unwrap(), "c", "google-workspace")
        .unwrap();
    let state = reqwest::Url::parse(&start.authorization_url)
        .unwrap()
        .query_pairs()
        .find(|(key, _)| key == "state")
        .unwrap()
        .1
        .into_owned();
    let pkce_ref = db
        .store
        .lock()
        .unwrap()
        .transaction(|tx| {
            Ok(tx
                .client()
                .query_one(
                    "SELECT pkce_secret_ref_id FROM oauth_refresh_intents WHERE project_id='p' AND connection_id='c'",
                    &[],
                )?
                .get::<_, String>(0))
        })
        .unwrap();
    service
        .callback("google-workspace", Some("p"), "code", &state)
        .unwrap();
    db.store
        .lock()
        .unwrap()
        .transaction(|tx| {
            let intent = tx.client().query_one(
                "SELECT state,pkce_secret_ref_id FROM oauth_refresh_intents WHERE project_id='p' AND connection_id='c'",
                &[],
            )?;
            assert_eq!(intent.get::<_, String>(0), "completed");
            assert_eq!(intent.get::<_, Option<String>>(1), None);
            tx.client().execute(
                "UPDATE secret_envelopes SET created_at=now()-interval '8 days' WHERE id=$1",
                &[&pkce_ref],
            )?;
            Ok(())
        })
        .unwrap();
    assert_eq!(
        db.store
            .lock()
            .unwrap()
            .cleanup_expired_secrets(
                std::time::SystemTime::now() - std::time::Duration::from_secs(7 * 24 * 3600),
                100,
            )
            .unwrap(),
        1
    );
    assert!(db
        .store
        .lock()
        .unwrap()
        .load_secret("p", &pkce_ref)
        .is_err());
}

struct Gated {
    calls: AtomicUsize,
    entered: std::sync::mpsc::Sender<()>,
    release: Mutex<std::sync::mpsc::Receiver<()>>,
}
impl TokenProvider for Gated {
    fn refresh(&self, _: &OAuthConfig, _: &AppCredentials, _: &str, _: i64) -> Result<TokenSet> {
        self.calls.fetch_add(1, Ordering::SeqCst);
        self.entered.send(()).unwrap();
        self.release
            .lock()
            .unwrap()
            .recv_timeout(std::time::Duration::from_secs(5))
            .unwrap();
        TokenSet::decode(br#"{"accessToken":"fresh","expiresAt":"2030-01-01T00:00:00Z"}"#)
    }
    fn exchange(
        &self,
        _: &OAuthConfig,
        _: &AppCredentials,
        _: &str,
        _: &str,
        _: i64,
    ) -> Result<TokenSet> {
        panic!("unexpected exchange")
    }
}
#[test]
#[ignore = "uses explicit local PostgreSQL private schema"]
fn independent_resolvers_never_double_refresh_and_reconnect_fences_old_result() {
    for reconnect in [false, true] {
        let db = Database::new();
        let (entered_tx, entered_rx) = std::sync::mpsc::channel();
        let (release_tx, release_rx) = std::sync::mpsc::channel();
        let provider = Arc::new(Gated {
            calls: AtomicUsize::new(0),
            entered: entered_tx,
            release: Mutex::new(release_rx),
        });
        let first = db.service(provider.clone());
        let mut client = Client::connect(&db.url, NoTls).unwrap();
        client
            .batch_execute(&format!(
                "SET search_path TO {};SET statement_timeout='5s'",
                db.schema
            ))
            .unwrap();
        let second = Lifecycle::new(
            Arc::new(Mutex::new(Store::new(
                client,
                LocalProvider::new(&[7; 32]).unwrap(),
            ))),
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
            provider.clone(),
        )
        .with_clock(Arc::new(|| 1_800_000_000));
        let thread = std::thread::spawn(move || {
            first.resolve(&Scope::new("p", None).unwrap(), "c", "google-workspace")
        });
        entered_rx
            .recv_timeout(std::time::Duration::from_secs(5))
            .unwrap();
        let scope = Scope::new("p", None).unwrap();
        assert!(matches!(
            second.resolve(&scope, "c", "google-workspace"),
            Err(Error::OutcomeUnknown)
        ));
        if reconnect {
            second.start(&scope, "c", "google-workspace").unwrap();
        }
        release_tx.send(()).unwrap();
        let result = thread.join().unwrap();
        if reconnect {
            assert!(matches!(result, Err(Error::ConnectionUnavailable)));
            assert_eq!(
                db.store.lock().unwrap().get(&scope, "c").unwrap().status,
                Status::Authorizing
            );
        } else {
            assert!(result.is_ok());
        }
        assert_eq!(provider.calls.load(Ordering::SeqCst), 1);
    }
}

#[test]
#[ignore = "uses explicit local PostgreSQL private schema"]
fn managed_refresh_preserves_generation_but_manual_inflight_replacement_wins() {
    fn generation(db: &Database) -> i64 {
        db.store
            .lock()
            .unwrap()
            .transaction(|tx| {
                Ok(tx
                    .client()
                    .query_one(
                        "SELECT connection_generation FROM connections WHERE project_id='p' AND id='c'",
                        &[],
                    )?
                    .get(0))
            })
            .unwrap()
    }

    let db = Database::new();
    let before = generation(&db);
    let provider = Arc::new(Provider {
        calls: AtomicUsize::new(0),
        fail: false,
    });
    let service = db.service(provider.clone());
    let scope = Scope::new("p", None).unwrap();
    assert_eq!(
        service
            .resolve(&scope, "c", "google-workspace")
            .unwrap()
            .into_fields()["accessToken"],
        "fresh"
    );
    assert_eq!(generation(&db), before);

    let db = Database::new();
    let before = generation(&db);
    let (entered_tx, entered_rx) = std::sync::mpsc::channel();
    let (release_tx, release_rx) = std::sync::mpsc::channel();
    let provider = Arc::new(Gated {
        calls: AtomicUsize::new(0),
        entered: entered_tx,
        release: Mutex::new(release_rx),
    });
    let service = db.service(provider.clone());
    let refresh_scope = scope.clone();
    let refresh =
        std::thread::spawn(move || service.resolve(&refresh_scope, "c", "google-workspace"));
    entered_rx
        .recv_timeout(std::time::Duration::from_secs(5))
        .unwrap();

    db.store
        .lock()
        .unwrap()
        .store_secret("p", "manual", "oauth_tokens_c", br#"manual"#)
        .unwrap();
    db.store
        .lock()
        .unwrap()
        .replace_credentials(&scope, "c", "manual", AuthType::OAuth2)
        .unwrap();
    assert_eq!(generation(&db), before + 1);

    release_tx.send(()).unwrap();
    assert!(matches!(
        refresh.join().unwrap(),
        Err(Error::ConnectionUnavailable)
    ));
    let final_connection = db.store.lock().unwrap().get(&scope, "c").unwrap();
    assert_eq!(final_connection.secret_ref_id, "manual");
    assert_eq!(final_connection.status, Status::Active);
    assert_eq!(generation(&db), before + 1);
}

#[test]
#[ignore = "uses explicit local PostgreSQL private schema"]
fn ambiguous_provider_failure_stays_blocked() {
    let db = Database::new();
    let provider = Arc::new(Provider {
        calls: AtomicUsize::new(0),
        fail: true,
    });
    let service = db.service(provider.clone());
    let scope = Scope::new("p", None).unwrap();
    for _ in 0..2 {
        assert!(matches!(
            service.resolve(&scope, "c", "google-workspace"),
            Err(Error::OutcomeUnknown)
        ));
    }
    assert_eq!(provider.calls.load(Ordering::SeqCst), 1);
}

#[test]
#[ignore = "uses explicit local PostgreSQL private schema"]
fn non_pkce_starts_have_distinct_state_at_same_instant() {
    let db = Database::new();
    let provider = Arc::new(Provider {
        calls: AtomicUsize::new(0),
        fail: false,
    });
    let mut manifest: serde_json::Value = serde_json::from_slice(include_bytes!(
        "../../../runner/connectors/google-workspace/manifest.json"
    ))
    .unwrap();
    manifest["auth"]["oauth"]["pkce"] = false.into();
    let registry = Arc::new(
        Registry::from_connectors([
            Connector::from_bytes(&serde_json::to_vec(&manifest).unwrap()).unwrap(),
        ])
        .unwrap(),
    );
    let service = Lifecycle::new(
        db.store.clone(),
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
    )
    .with_clock(Arc::new(|| 1_800_000_000));
    let scope = Scope::new("p", None).unwrap();
    let state = |url: String| {
        reqwest::Url::parse(&url)
            .unwrap()
            .query_pairs()
            .find(|(k, _)| k == "state")
            .unwrap()
            .1
            .into_owned()
    };
    let old = state(
        service
            .start(&scope, "c", "google-workspace")
            .unwrap()
            .authorization_url,
    );
    let new = state(
        service
            .start(&scope, "c", "google-workspace")
            .unwrap()
            .authorization_url,
    );
    assert_ne!(old, new);
    assert!(service
        .callback("google-workspace", None, "code", &old)
        .is_err());
    assert_eq!(provider.calls.load(Ordering::SeqCst), 0);
    assert!(service
        .callback("google-workspace", None, "code", &new)
        .is_ok());
}
#[test]
#[ignore = "uses explicit local PostgreSQL private schema"]
fn refreshed_credentials_carry_the_exact_committed_connection() {
    let db = Database::new();
    let provider = Arc::new(Provider {
        calls: AtomicUsize::new(0),
        fail: false,
    });
    let service = db.service(provider);
    let scope = Scope::new("p", None).unwrap();
    let (connection, credentials) = service
        .resolve_fenced(&scope, "c", "google-workspace")
        .unwrap();
    assert_ne!(connection.secret_ref_id, "old");
    assert_eq!(connection.status, Status::Active);
    assert_eq!(credentials.into_fields()["accessToken"], "fresh");
    let (current, _) = service
        .resolve_fenced(&scope, "c", "google-workspace")
        .unwrap();
    assert_eq!(connection, current);
}

#[test]
#[ignore = "requires isolated APPCALL_ENGINE_POSTGRES_URL"]
fn health_mode_allows_degraded_credentials_but_never_retries_unknown_rotation() {
    let db = Database::new();
    let scope = Scope::new("p", None).unwrap();
    let provider = Arc::new(Provider {
        calls: AtomicUsize::new(0),
        fail: false,
    });
    let service = db.service(provider.clone());
    {
        let mut store = db.store.lock().unwrap();
        store
            .store_secret("p", "static", "api_key", br#"{"apiKey":"credential"}"#)
            .unwrap();
        store
            .replace_credentials(&scope, "c", "static", AuthType::ApiKey)
            .unwrap();
        store.update_status(&scope, "c", Status::Degraded).unwrap();
    }
    assert!(matches!(
        service.resolve_fenced(&scope, "c", "google-workspace"),
        Err(Error::ConnectionUnavailable)
    ));
    let (revision, _) = service
        .resolve_health_fenced(&scope, "c", "google-workspace")
        .unwrap();
    assert_eq!(revision.status, Status::Degraded);
    {
        let mut store = db.store.lock().unwrap();
        store
            .replace_credentials(&scope, "c", "old", AuthType::OAuth2)
            .unwrap();
        store.update_status(&scope, "c", Status::Degraded).unwrap();
        store.transaction(|tx| {tx.client().execute("INSERT INTO oauth_refresh_intents(project_id,connection_id,attempt_id,secret_ref_id,operation,state) VALUES('p','c','ambiguous','old','refresh','unknown')",&[])?;Ok(())}).unwrap();
    }
    assert!(matches!(
        service.resolve_health_fenced(&scope, "c", "google-workspace"),
        Err(Error::OutcomeUnknown)
    ));
    assert_eq!(provider.calls.load(Ordering::SeqCst), 0);
    db.store
        .lock()
        .unwrap()
        .update_status(&scope, "c", Status::Disconnected)
        .unwrap();
    assert!(service
        .resolve_health_fenced(&scope, "c", "google-workspace")
        .is_err());
}

#[test]
#[ignore = "uses explicit local PostgreSQL private schema"]
fn queued_resolution_cancellation_or_rebinding_never_contacts_provider() {
    use std::sync::atomic::AtomicBool;
    for rebind in [false, true] {
        let db = Database::new();
        let provider = Arc::new(Provider {
            calls: AtomicUsize::new(0),
            fail: false,
        });
        let service = db.service(provider.clone());
        let mut held = db.store.lock().unwrap();
        let cancelled = Arc::new(AtomicBool::new(false));
        let token = cancelled.clone();
        let (entered_tx, entered_rx) = std::sync::mpsc::channel();
        let worker = std::thread::spawn(move || {
            let active = || {
                let value = !token.load(Ordering::Acquire);
                let _ = entered_tx.send(());
                value
            };
            service
                .resolve_checked_fenced(
                    &Scope::new("p", None).unwrap(),
                    "c",
                    "google-workspace",
                    Some(("", "oauth2")),
                    false,
                    &active,
                )
                .map(|_| ())
        });
        entered_rx
            .recv_timeout(std::time::Duration::from_secs(2))
            .unwrap();
        std::thread::sleep(std::time::Duration::from_millis(20));
        assert!(!worker.is_finished());
        if rebind {
            held.transaction(|tx|{tx.client().execute("UPDATE connections SET external_account_id='other-brand',credential_owner='brand' WHERE id='c'",&[])?;Ok(())}).unwrap();
        } else {
            cancelled.store(true, Ordering::Release);
        }
        drop(held);
        assert!(worker.join().unwrap().is_err());
        assert_eq!(provider.calls.load(Ordering::SeqCst), 0);
        assert_eq!(
            db.store
                .lock()
                .unwrap()
                .get(&Scope::new("p", None).unwrap(), "c")
                .unwrap()
                .secret_ref_id,
            "old"
        );
    }
}
#[test]
#[ignore = "uses explicit local PostgreSQL private schema"]
fn queued_callback_cancellation_never_exchanges_authorization_code() {
    use std::sync::atomic::AtomicBool;
    let db = Database::new();
    let provider = Arc::new(Provider {
        calls: AtomicUsize::new(0),
        fail: false,
    });
    let service = db.service(provider.clone());
    let start = service
        .start(&Scope::new("p", None).unwrap(), "c", "google-workspace")
        .unwrap();
    let state = reqwest::Url::parse(&start.authorization_url)
        .unwrap()
        .query_pairs()
        .find(|(k, _)| k == "state")
        .unwrap()
        .1
        .into_owned();
    let held = db.store.lock().unwrap();
    let cancelled = Arc::new(AtomicBool::new(false));
    let token = cancelled.clone();
    let (entered_tx, entered_rx) = std::sync::mpsc::channel();
    let worker = std::thread::spawn(move || {
        let active = || {
            let value = !token.load(Ordering::Acquire);
            let _ = entered_tx.send(());
            value
        };
        service
            .callback_checked("google-workspace", Some("p"), "code", &state, &active)
            .map(|_| ())
    });
    entered_rx
        .recv_timeout(std::time::Duration::from_secs(2))
        .unwrap();
    std::thread::sleep(std::time::Duration::from_millis(20));
    assert!(!worker.is_finished());
    cancelled.store(true, Ordering::Release);
    drop(held);
    assert!(worker.join().unwrap().is_err());
    assert_eq!(provider.calls.load(Ordering::SeqCst), 0);
    assert_eq!(
        db.store
            .lock()
            .unwrap()
            .get(&Scope::new("p", None).unwrap(), "c")
            .unwrap()
            .status,
        Status::Authorizing
    );
}

struct CancelAfterDispatch {
    cancelled: Arc<std::sync::atomic::AtomicBool>,
    fail: bool,
}
impl TokenProvider for CancelAfterDispatch {
    fn refresh(&self, _: &OAuthConfig, _: &AppCredentials, _: &str, _: i64) -> Result<TokenSet> {
        self.cancelled.store(true, Ordering::Release);
        if self.fail {
            Err(Error::OutcomeUnknown)
        } else {
            TokenSet::decode(br#"{"accessToken":"committed","refreshToken":"rotated","expiresAt":"2030-01-01T00:00:00Z"}"#)
        }
    }
    fn exchange(
        &self,
        s: &OAuthConfig,
        a: &AppCredentials,
        _: &str,
        _: &str,
        now: i64,
    ) -> Result<TokenSet> {
        self.refresh(s, a, "", now)
    }
}
#[test]
#[ignore = "uses explicit local PostgreSQL private schema"]
fn cancellation_after_refresh_or_exchange_reconciles_provider_outcome() {
    use std::sync::atomic::AtomicBool;
    for callback in [false, true] {
        for fail in [false, true] {
            let db = Database::new();
            let cancelled = Arc::new(AtomicBool::new(false));
            let service = db.service(Arc::new(CancelAfterDispatch {
                cancelled: cancelled.clone(),
                fail,
            }));
            let scope = Scope::new("p", None).unwrap();
            let active = || !cancelled.load(Ordering::Acquire);
            let result = if callback {
                let start = service.start(&scope, "c", "google-workspace").unwrap();
                let state = reqwest::Url::parse(&start.authorization_url)
                    .unwrap()
                    .query_pairs()
                    .find(|(k, _)| k == "state")
                    .unwrap()
                    .1
                    .into_owned();
                service
                    .callback_checked("google-workspace", Some("p"), "code", &state, &active)
                    .map(|_| ())
            } else {
                service
                    .resolve_checked_fenced(
                        &scope,
                        "c",
                        "google-workspace",
                        Some(("", "oauth2")),
                        false,
                        &active,
                    )
                    .map(|_| ())
            };
            let connection = db.store.lock().unwrap().get(&scope, "c").unwrap();
            assert!(cancelled.load(Ordering::Acquire));
            if fail {
                assert!(matches!(result, Err(Error::OutcomeUnknown)));
                assert_eq!(connection.secret_ref_id, "old");
                assert_eq!(connection.status, Status::Degraded);
            } else {
                result.unwrap();
                assert_ne!(connection.secret_ref_id, "old");
                assert_eq!(connection.status, Status::Active);
            }
        }
    }
}
