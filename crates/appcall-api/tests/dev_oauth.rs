use appcall_api::{dev_oauth::DevOAuth, Identity, Request};
use appcall_store::{LocalProvider, Scope, Status, Store};
use serde_json::json;
use std::{
    collections::BTreeSet,
    sync::{Arc, Mutex},
};
struct Fixture {
    db: postgres::Client,
    schema: String,
    url: String,
}
impl Fixture {
    fn new() -> Self {
        let base = std::env::var("APPCALL_ENGINE_POSTGRES_URL").expect("explicit localPG URL");
        let mut db = postgres::Client::connect(&base, postgres::NoTls).unwrap();
        let schema = format!("devoauth_{}", uuid::Uuid::new_v4().simple());
        db.batch_execute(&format!(
            "CREATE SCHEMA {schema};SET search_path TO {schema}"
        ))
        .unwrap();
        for sql in [
            include_str!("../../../migrations/202605140001_init.sql"),
            include_str!("../../../migrations/202605290001_connections_ownership.sql"),
            include_str!("../../../migrations/202605290004_connections_owner_check.sql"),
        ] {
            db.batch_execute(sql).unwrap();
        }
        db.batch_execute(
            "INSERT INTO projects(id,name) VALUES('proj_dev','Dev'),('other','Other')",
        )
        .unwrap();
        let url = format!(
            "{base}{}options=-csearch_path%3D{schema}",
            if base.contains('?') { "&" } else { "?" }
        );
        Self { db, schema, url }
    }
    fn store(&self) -> Arc<Mutex<Store>> {
        Arc::new(Mutex::new(Store::new(
            postgres::Client::connect(&self.url, postgres::NoTls).unwrap(),
            LocalProvider::new(&[3; 32]).unwrap(),
        )))
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        self.db
            .batch_execute(&format!("DROP SCHEMA {} CASCADE", self.schema))
            .unwrap();
    }
}
fn registry() -> Arc<appcall_connectors::Registry> {
    Arc::new(appcall_connectors::Registry::from_connectors([appcall_connectors::Connector::from_bytes(&serde_json::to_vec(&json!({"key":"test","name":"Test","version":"1","runtime":"bun","models":["item"],"auth":{"type":"oauth2","setup":{"mode":"oauth2"}},"network":{"egress":"none"},"operations":{"healthcheck":{"kind":"action","timeoutMs":100,"maxInputBytes":100,"maxResponseBytes":100,"sideEffect":"read"}}})).unwrap()).unwrap()]).unwrap())
}
fn identity(project: &str) -> Identity {
    Identity {
        project_id: project.into(),
        account_id: "brand".into(),
        admin_scope: false,
    }
}
fn request(uri: &str) -> Request {
    Request {
        method: "GET".into(),
        uri: uri.into(),
        headers: vec![],
        body: vec![],
    }
}
#[test]
#[ignore = "requires isolated local PostgreSQL"]
fn local_start_activates_only_its_empty_secret_authorizing_connection() {
    let mut f = Fixture::new();
    let store = f.store();
    let local = DevOAuth::new(
        false,
        "proj_dev",
        store.clone(),
        registry(),
        BTreeSet::new(),
    )
    .unwrap();
    let started = local
        .start(&identity("proj_dev"), "test", None)
        .unwrap()
        .expect("unconfigured development fallback");
    assert_eq!(started.connection.status, Status::Authorizing);
    assert_eq!(started.connection.external_account_id, "brand");
    let response = local
        .handle(&request(&started.authorization_url))
        .unwrap()
        .unwrap();
    assert_eq!(response.status, 302);
    assert!(response
        .headers
        .contains(&("location".into(), "/app/connectors/test?success=1".into())));
    assert_eq!(
        store
            .lock()
            .unwrap()
            .get(
                &Scope::new("proj_dev", Some("brand")).unwrap(),
                &started.connection.id
            )
            .unwrap()
            .status,
        Status::Active
    );
    assert!(local.handle(&request(&started.authorization_url)).is_err());
    assert!(local.start(&identity("other"), "test", None).is_err());
    let count: i64 =
        f.db.query_one("SELECT count(*) FROM secret_envelopes", &[])
            .unwrap()
            .get(0);
    assert_eq!(count, 0);
}
#[test]
#[ignore = "requires isolated local PostgreSQL"]
fn production_managed_apps_and_malformed_callbacks_never_activate() {
    let f = Fixture::new();
    let store = f.store();
    let prod = DevOAuth::new(true, "proj_dev", store.clone(), registry(), BTreeSet::new()).unwrap();
    assert!(prod
        .start(&identity("proj_dev"), "test", None)
        .unwrap()
        .is_none());
    assert!(prod
        .handle(&request(
            "/oauth/local/authorize?connector=test&connectionId=x"
        ))
        .unwrap()
        .is_none());
    let managed = DevOAuth::new(
        false,
        "proj_dev",
        store.clone(),
        registry(),
        BTreeSet::from(["test".into()]),
    )
    .unwrap();
    assert!(managed
        .start(&identity("proj_dev"), "test", None)
        .unwrap()
        .is_none());
    let local = DevOAuth::new(false, "proj_dev", store, registry(), BTreeSet::new()).unwrap();
    for uri in [
        "/oauth/local/authorize",
        "/oauth/local/authorize?connector=../bad&connectionId=x",
        "/oauth/local/authorize?connector=test&connector=test&connectionId=x",
        "/oauth/local/authorize?connector=test&connectionId=missing",
    ] {
        assert!(local.handle(&request(uri)).is_err(), "{uri}");
    }
}
#[test]
#[ignore = "requires isolated local PostgreSQL"]
fn callback_cannot_activate_cross_project_or_credential_bearing_rows() {
    let mut f = Fixture::new();
    let store = f.store();
    let local = DevOAuth::new(
        false,
        "proj_dev",
        store.clone(),
        registry(),
        BTreeSet::new(),
    )
    .unwrap();
    let scope = Scope::new("proj_dev", Some("brand")).unwrap();
    let started = local
        .start(&identity("proj_dev"), "test", None)
        .unwrap()
        .unwrap();
    store
        .lock()
        .unwrap()
        .store_secret("proj_dev", "secret", "managed_fixture", b"synthetic")
        .unwrap();
    f.db.execute(
        "UPDATE connections SET secret_ref_id='secret' WHERE id=$1",
        &[&started.connection.id],
    )
    .unwrap();
    assert!(local.handle(&request(&started.authorization_url)).is_err());
    assert!(local
        .start(&identity("proj_dev"), "test", Some(&started.connection.id))
        .is_err());
    assert_eq!(
        store
            .lock()
            .unwrap()
            .get(&scope, &started.connection.id)
            .unwrap()
            .status,
        Status::Authorizing
    );
    f.db.batch_execute("INSERT INTO connections(id,project_id,connector,auth_type,status,credential_owner,external_account_id) VALUES('foreign','other','test','oauth2','authorizing','brand','brand'),('wrong_connector','proj_dev','other','oauth2','authorizing','brand','brand')").unwrap();
    for id in ["foreign", "wrong_connector"] {
        assert!(local
            .handle(&request(&format!(
                "/oauth/local/authorize?connector=test&connectionId={id}"
            )))
            .is_err());
    }
    let local_start = local
        .start(&identity("proj_dev"), "test", None)
        .unwrap()
        .unwrap();
    let managed = DevOAuth::new(
        false,
        "proj_dev",
        store.clone(),
        registry(),
        BTreeSet::from(["test".into()]),
    )
    .unwrap();
    assert!(managed
        .handle(&request(&local_start.authorization_url))
        .is_err());
    assert_eq!(
        store
            .lock()
            .unwrap()
            .get(&scope, &local_start.connection.id)
            .unwrap()
            .status,
        Status::Authorizing
    );
}

#[test]
#[ignore = "requires isolated local PostgreSQL"]
fn cancelled_local_start_does_not_create_a_connection() {
    let mut fixture = Fixture::new();
    let local = DevOAuth::new(
        false,
        "proj_dev",
        fixture.store(),
        registry(),
        BTreeSet::new(),
    )
    .unwrap();
    assert!(local
        .start_checked(&identity("proj_dev"), "test", None, &|| false)
        .is_err());
    assert_eq!(
        fixture
            .db
            .query_one("SELECT count(*) FROM connections", &[])
            .unwrap()
            .get::<_, i64>(0),
        0
    );
}

#[test]
#[ignore = "requires isolated local PostgreSQL"]
fn cancellation_after_local_insert_rolls_back_before_commit() {
    let mut fixture = Fixture::new();
    let local = DevOAuth::new(
        false,
        "proj_dev",
        fixture.store(),
        registry(),
        BTreeSet::new(),
    )
    .unwrap();
    let checkpoints = std::cell::Cell::new(0);
    assert!(local
        .start_checked(&identity("proj_dev"), "test", None, &|| {
            let previous = checkpoints.get();
            checkpoints.set(previous + 1);
            previous < 2
        })
        .is_err());
    assert_eq!(
        fixture
            .db
            .query_one("SELECT count(*) FROM connections", &[])
            .unwrap()
            .get::<_, i64>(0),
        0
    );
}
