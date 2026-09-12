//! Actual application-process qualification for the browser action-claim
//! inspection and reconciliation surface.
//!
//! These tests deliberately stay ignored: they need an isolated PostgreSQL
//! server, a loopback broker, and the real application binary. The browser
//! host refreshes Anusa membership on every request and the migration set is
//! applied by `Schemas::new`; no ad-hoc claim tables are created here.
use super::{
    cookie, request, request_with_headers, request_with_origin, start_host,
    start_host_with_operator_grants, Broker, Process, Schemas, OPERATOR_GRANTS,
};
use serde_json::Value;
use std::net::{SocketAddr, TcpListener};

const CLAIM_KEY: &str = "browser-action-claim";
const CLAIM_REQUEST_ID: &str = "browser-request-1";
const CLAIM_ACCOUNT: &str = "brand-a";
const CLAIM_CONNECTION: &str = "application-browser-connection";

fn fixture() -> Value {
    serde_json::from_str(include_str!("../../../appcall-auth/tests/auth_golden.json")).unwrap()
}

fn launch(
    schemas: &Schemas,
    database: &str,
    operator_grants: Option<&str>,
) -> (Process, Broker, SocketAddr) {
    let fixture = fixture();
    let broker = Broker::new(&fixture);
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    drop(listener);
    let (app_url, anusa_url) = schemas.urls(database);
    let process = if operator_grants == Some(OPERATOR_GRANTS) {
        start_host_with_operator_grants(address, &app_url, &anusa_url, &broker, &fixture)
    } else {
        start_host(address, &app_url, &anusa_url, &broker, &fixture)
    };
    (process, broker, address)
}

fn login(address: SocketAddr) -> String {
    let wire = request(
        address,
        "POST",
        "/app/login",
        "",
        "email=fixture%40example.invalid&password=synthetic",
    );
    assert!(wire.starts_with("HTTP/1.1 302"), "{wire}");
    cookie(&wire)
}

fn status(wire: &str) -> u16 {
    wire.split_whitespace()
        .nth(1)
        .and_then(|value| value.parse().ok())
        .unwrap_or_else(|| panic!("response has no HTTP status: {wire}"))
}

fn body(wire: &str) -> &str {
    wire.split_once("\r\n\r\n")
        .map(|(_, body)| body)
        .unwrap_or("")
}

fn seed_claim(schemas: &mut Schemas, key: &str, request_id: &str, account: &str, live: bool) {
    let lease = if live {
        "now()+interval '1 hour'"
    } else {
        "now()-interval '1 second'"
    };
    schemas
        .admin
        .execute(
            &format!(
                "INSERT INTO action_idempotency_claims(project_id,idempotency_key,connection_id,action,input_hash,request_id,external_account_id,connector,leased_until,dispatched_at) VALUES('proj_tenant-a',$1,$2,'messages.send','browser-input-hash',$3,$4,'slack',{lease},now()-interval '2 seconds')"
            ),
            &[&key, &CLAIM_CONNECTION, &request_id, &account],
        )
        .unwrap();
}

fn seed_other_project_claim(schemas: &mut Schemas, key: &str) {
    schemas
        .admin
        .execute(
            "INSERT INTO action_idempotency_claims(project_id,idempotency_key,connection_id,action,input_hash,request_id,external_account_id,connector,leased_until,dispatched_at) VALUES('other',$1,'other-project-secret-connection','other.secret','other-input-hash','other-request','brand-a','other-connector',now()-interval '1 second',now()-interval '2 seconds')",
            &[&key],
        )
        .unwrap();
}

fn seed_reservation(schemas: &mut Schemas, key: &str, request_id: &str) {
    schemas
        .admin
        .execute(
            "INSERT INTO action_usage_reservations(id,project_id,month,connection_id,connector,action,external_account_id,idempotency_key,request_id,input_hash,state,expires_at,dispatched_at) VALUES($1,'proj_tenant-a','2026-09',$2,'slack','messages.send',$3,$4,$5,'browser-input-hash','dispatched',now()+interval '1 day',now())",
            &[
                &format!("reservation-{key}"),
                &CLAIM_CONNECTION,
                &CLAIM_ACCOUNT,
                &key,
                &request_id,
            ],
        )
        .unwrap();
    schemas
        .admin
        .execute(
            "INSERT INTO action_usage_reservation_charges(reservation_id,charge_kind,window_kind,window_key,quantity,spend_micros) VALUES($1,'send','day','2026-09-12',1,25)",
            &[&format!("reservation-{key}")],
        )
        .unwrap();
    schemas
        .admin
        .execute(
            "INSERT INTO action_send_caps(project_id,external_account_id,window_key,send_count,spend_micros) VALUES('proj_tenant-a',$1,'2026-09-12',1,25)",
            &[&CLAIM_ACCOUNT],
        )
        .unwrap();
}

fn claim_count(schemas: &mut Schemas, key: &str) -> i64 {
    schemas
        .admin
        .query_one(
            "SELECT count(*) FROM action_idempotency_claims WHERE project_id='proj_tenant-a' AND idempotency_key=$1",
            &[&key],
        )
        .unwrap()
        .get(0)
}

fn audit_count(schemas: &mut Schemas) -> i64 {
    schemas
        .admin
        .query_one(
            "SELECT count(*) FROM action_claim_reconciliation_audits WHERE project_id='proj_tenant-a'",
            &[],
        )
        .unwrap()
        .get(0)
}

fn inspect_path(key: &str, request_id: &str, account: &str) -> String {
    format!(
        "/app/action-claims?externalAccountId={account}&idempotencyKey={key}&expectedRequestId={request_id}"
    )
}

fn reconcile_body(key: &str, request_id: &str, account: &str, resolution: Option<&str>) -> String {
    let mut body = url::form_urlencoded::Serializer::new(String::new())
        .append_pair("externalAccountId", account)
        .append_pair("idempotencyKey", key)
        .append_pair("expectedRequestId", request_id)
        .append_pair("evidenceRef", "ticket://browser/action-claim")
        .append_pair("actorId", "forged-actor-must-be-ignored")
        .finish();
    if let Some(resolution) = resolution {
        body.push_str("&resolution=");
        body.push_str(
            &url::form_urlencoded::byte_serialize(resolution.as_bytes()).collect::<String>(),
        );
    }
    body
}

#[test]
#[ignore = "requires local PostgreSQL, local broker and spawned application process"]
fn granted_browser_operator_can_inspect_and_reconcile_claim_atomically() {
    let database = std::env::var("APPCALL_ENGINE_POSTGRES_URL").unwrap();
    let mut schemas = Schemas::new(&database);
    seed_claim(
        &mut schemas,
        CLAIM_KEY,
        CLAIM_REQUEST_ID,
        CLAIM_ACCOUNT,
        false,
    );
    seed_reservation(&mut schemas, CLAIM_KEY, CLAIM_REQUEST_ID);
    let (process, broker, address) = launch(&schemas, &database, Some(OPERATOR_GRANTS));
    let session = login(address);

    let detail = request(
        address,
        "GET",
        &inspect_path(CLAIM_KEY, CLAIM_REQUEST_ID, CLAIM_ACCOUNT),
        &session,
        "",
    );
    assert_eq!(status(&detail), 200, "{detail}");
    assert!(body(&detail).contains("browser-action-claim"));
    assert!(body(&detail).contains("messages.send"));
    assert!(!body(&detail).contains("browser-input-hash"));
    assert!(!body(&detail).contains("name=\"actorId\""));
    assert!(body(&detail).contains("provenNotDispatched"));
    assert!(body(&detail).contains("providerOutcomeKnown"));

    let resolution = request(
        address,
        "POST",
        "/app/action-claims/reconcile",
        &session,
        &reconcile_body(
            CLAIM_KEY,
            CLAIM_REQUEST_ID,
            CLAIM_ACCOUNT,
            Some("provenNotDispatched"),
        ),
    );
    assert_eq!(status(&resolution), 200, "{resolution}");
    assert!(body(&resolution).contains("Reconciliation recorded"));
    assert!(body(&resolution).contains("Charges refunded"));
    assert_eq!(claim_count(&mut schemas, CLAIM_KEY), 0);
    assert_eq!(audit_count(&mut schemas), 1);
    let actor: String = schemas
        .admin
        .query_one(
            "SELECT actor_id FROM action_claim_reconciliation_audits WHERE project_id='proj_tenant-a'",
            &[],
        )
        .unwrap()
        .get(0);
    assert_eq!(actor, "11111111-1111-1111-1111-111111111111");
    assert_eq!(
        schemas
            .admin
            .query_one(
                "SELECT count(*) FROM usage_events WHERE project_id='proj_tenant-a'",
                &[]
            )
            .unwrap()
            .get::<_, i64>(0),
        0
    );

    drop(process);
    drop(broker);
}

#[test]
#[ignore = "requires local PostgreSQL, local broker and spawned application process"]
fn claim_operator_surface_rejects_wrong_scope_missing_resolution_csrf_and_live_claims() {
    let database = std::env::var("APPCALL_ENGINE_POSTGRES_URL").unwrap();

    // The same authenticated user without the exact grant cannot even inspect
    // the operator page, while an ordinary API key cannot establish a browser
    // session for it.
    let mut schemas = Schemas::new(&database);
    seed_claim(
        &mut schemas,
        CLAIM_KEY,
        CLAIM_REQUEST_ID,
        CLAIM_ACCOUNT,
        false,
    );
    let (process, broker, address) = launch(&schemas, &database, None);
    let session = login(address);
    let denied = request(
        address,
        "GET",
        &inspect_path(CLAIM_KEY, CLAIM_REQUEST_ID, CLAIM_ACCOUNT),
        &session,
        "",
    );
    assert_eq!(status(&denied), 403, "{denied}");
    let api_key = request_with_headers(
        address,
        "GET",
        &inspect_path(CLAIM_KEY, CLAIM_REQUEST_ID, CLAIM_ACCOUNT),
        "",
        "",
        &[("X-API-Key", "ordinary-browser-api-key")],
    );
    assert_eq!(status(&api_key), 302, "{api_key}");
    assert!(api_key
        .to_ascii_lowercase()
        .contains("location: /app/login"));
    drop(process);
    drop(broker);

    // The granted session is bound to brand-a and proj_tenant-a. Cross-account
    // requests fail before claim metadata is read; a foreign project key is
    // also indistinguishable from a missing key.
    let mut schemas = Schemas::new(&database);
    seed_claim(
        &mut schemas,
        CLAIM_KEY,
        CLAIM_REQUEST_ID,
        CLAIM_ACCOUNT,
        false,
    );
    seed_other_project_claim(&mut schemas, "foreign-project-claim");
    let (process, broker, address) = launch(&schemas, &database, Some(OPERATOR_GRANTS));
    let session = login(address);
    let wrong_account = request(
        address,
        "GET",
        &inspect_path(CLAIM_KEY, CLAIM_REQUEST_ID, "brand-b"),
        &session,
        "",
    );
    assert!(
        matches!(status(&wrong_account), 403 | 404),
        "{wrong_account}"
    );
    assert!(!body(&wrong_account).contains("messages.send"));
    let wrong_project = request(
        address,
        "GET",
        &inspect_path("foreign-project-claim", "other-request", CLAIM_ACCOUNT),
        &session,
        "",
    );
    assert_eq!(status(&wrong_project), 404, "{wrong_project}");
    assert!(!body(&wrong_project).contains("other.secret"));

    let missing_resolution = request(
        address,
        "POST",
        "/app/action-claims/reconcile",
        &session,
        &reconcile_body(CLAIM_KEY, CLAIM_REQUEST_ID, CLAIM_ACCOUNT, None),
    );
    assert_eq!(status(&missing_resolution), 400, "{missing_resolution}");
    assert_eq!(claim_count(&mut schemas, CLAIM_KEY), 1);
    assert_eq!(audit_count(&mut schemas), 0);

    let csrf = request_with_origin(
        address,
        "POST",
        "/app/action-claims/reconcile",
        &session,
        &reconcile_body(
            CLAIM_KEY,
            CLAIM_REQUEST_ID,
            CLAIM_ACCOUNT,
            Some("provenNotDispatched"),
        ),
        "http://evil.example",
    );
    assert_eq!(status(&csrf), 403, "{csrf}");
    assert!(body(&csrf).contains("Access denied"));
    assert_eq!(claim_count(&mut schemas, CLAIM_KEY), 1);
    assert_eq!(audit_count(&mut schemas), 0);
    drop(process);
    drop(broker);

    let mut schemas = Schemas::new(&database);
    seed_claim(
        &mut schemas,
        CLAIM_KEY,
        CLAIM_REQUEST_ID,
        CLAIM_ACCOUNT,
        true,
    );
    let (process, broker, address) = launch(&schemas, &database, Some(OPERATOR_GRANTS));
    let session = login(address);
    let live = request(
        address,
        "GET",
        &inspect_path(CLAIM_KEY, CLAIM_REQUEST_ID, CLAIM_ACCOUNT),
        &session,
        "",
    );
    assert_eq!(status(&live), 200, "{live}");
    assert!(!body(&live).contains("action-claims-reconcile"));
    let live_reconcile = request(
        address,
        "POST",
        "/app/action-claims/reconcile",
        &session,
        &reconcile_body(
            CLAIM_KEY,
            CLAIM_REQUEST_ID,
            CLAIM_ACCOUNT,
            Some("provenNotDispatched"),
        ),
    );
    assert_eq!(status(&live_reconcile), 409, "{live_reconcile}");
    assert_eq!(claim_count(&mut schemas, CLAIM_KEY), 1);
    assert_eq!(audit_count(&mut schemas), 0);
    drop(process);
    drop(broker);
}
