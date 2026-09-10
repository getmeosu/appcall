//! Actual application-process authorization checks for the Runs operator surface.
//!
//! These tests deliberately stay ignored: they need an isolated PostgreSQL
//! server, a loopback broker, and the real application binary.  The broker is
//! local and synthetic; no provider or external authentication request is made.
use super::{
    cookie, request, request_with_headers, request_with_origin, start_host, start_host_with_grants,
    start_host_with_operator_grants, Broker, Process, Schemas, OPERATOR_GRANTS,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    net::{SocketAddr, TcpListener},
    time::SystemTime,
};

const ORDINARY_API_KEY: &str = "ordinary-browser-api-key";

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
    let process = match operator_grants {
        None => start_host(address, &app_url, &anusa_url, &broker, &fixture),
        Some(grants) if grants == OPERATOR_GRANTS => {
            start_host_with_operator_grants(address, &app_url, &anusa_url, &broker, &fixture)
        }
        Some(grants) => {
            start_host_with_grants(address, &app_url, &anusa_url, &broker, &fixture, grants)
        }
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

fn rendered_hidden_value<'a>(html: &'a str, name: &str) -> &'a str {
    let marker = format!("name=\"{name}\" type=\"hidden\" value=\"");
    let start = html
        .find(&marker)
        .unwrap_or_else(|| panic!("rendered form omitted hidden field {name}: {html}"))
        + marker.len();
    let end = html[start..]
        .find('"')
        .unwrap_or_else(|| panic!("rendered hidden field {name} has no closing quote: {html}"));
    &html[start..start + end]
}

fn assert_denied(wire: &str, label: &str) {
    let response_status = status(wire);
    assert!(
        matches!(response_status, 302 | 401 | 403 | 404),
        "{label} was not denied: {wire}"
    );
    if response_status == 302 {
        assert!(
            wire.to_ascii_lowercase().contains("location: /app/login"),
            "{label} returned an unexpected redirect: {wire}"
        );
    }
    assert!(
        !wire
            .to_ascii_lowercase()
            .contains("location: /app/runs?success="),
        "{label} returned a success redirect: {wire}"
    );
}

fn seed_runs(schemas: &mut Schemas) {
    schemas
        .admin
        .execute(
            "INSERT INTO api_keys(id,project_id,key_hash) VALUES('ordinary-browser-key','proj_tenant-a',$1)",
            &[&appcall_auth::hash_api_key(ORDINARY_API_KEY)],
        )
        .unwrap();
    schemas
        .admin
        .batch_execute(
            "INSERT INTO connections(id,project_id,connector,auth_type,status,external_account_id,credential_owner)
             VALUES
             ('operator-brand-a','proj_tenant-a','slack','api_key','active','brand-a','brand'),
             ('operator-brand-b','proj_tenant-a','slack','api_key','active','brand-b','brand')
             ;
             INSERT INTO sync_jobs(id,project_id,connection_id,operation,status,worker_id,attempts,run_after,leased_until,last_error,dedup_key,input)
             VALUES
             ('operator-run-now','proj_tenant-a','application-browser-connection','messages.list','pending','stale-worker',2,now()+interval '1 hour',NULL,'previous provider error','operator-run-now','{}'),
             ('operator-reset','proj_tenant-a','operator-brand-a','messages.list','failed','',7,now()+interval '1 hour',NULL,'terminal provider error','operator-reset','{}'),
             ('operator-cancel','proj_tenant-a','operator-brand-b','messages.list','running','active-worker',4,now(),now()+interval '1 hour','provider still in flight','operator-cancel','{}'),
             ('same-account-run','proj_tenant-a','operator-brand-a','messages.list','pending','',1,now(),NULL,'','same-account-run','{}'),
             ('cross-account-run','proj_tenant-a','operator-brand-a','messages.list','pending','',3,now(),NULL,'','cross-account-run','{}'),
             ('cross-project-run','other','other-project-secret-connection','messages.list','pending','',1,now(),NULL,'','cross-project-run','{}');
             INSERT INTO sync_job_checkpoints(job_id,cursor)
             VALUES
             ('operator-run-now','cursor-run-now'),
             ('operator-reset','cursor-reset'),
             ('operator-cancel','cursor-cancel'),
             ('same-account-run','cursor-same-account'),
             ('cross-account-run','cursor-account'),
             ('cross-project-run','cursor-project');",
        )
        .unwrap();
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct JobState {
    status: String,
    attempts: i32,
    worker_id: String,
    run_after: SystemTime,
    leased_until: Option<SystemTime>,
    last_error: String,
    cursor: String,
}

fn job_state(schemas: &mut Schemas, id: &str) -> JobState {
    let row = schemas
        .admin
        .query_one(
            "SELECT j.status,j.attempts,j.worker_id,j.run_after,j.leased_until,COALESCE(j.last_error,''),COALESCE(c.cursor,'')
             FROM sync_jobs j LEFT JOIN sync_job_checkpoints c ON c.job_id=j.id WHERE j.id=$1",
            &[&id],
        )
        .unwrap();
    JobState {
        status: row.get(0),
        attempts: row.get(1),
        worker_id: row.get(2),
        run_after: row.get(3),
        leased_until: row.get(4),
        last_error: row.get(5),
        cursor: row.get(6),
    }
}

fn assert_job_state(
    state: &JobState,
    status: &str,
    attempts: i32,
    worker_id: &str,
    last_error: &str,
    cursor: &str,
) {
    assert_eq!(state.status, status);
    assert_eq!(state.attempts, attempts);
    assert_eq!(state.worker_id, worker_id);
    assert_eq!(state.last_error, last_error);
    assert_eq!(state.cursor, cursor);
}

fn run_is_due(schemas: &mut Schemas, id: &str) -> bool {
    schemas
        .admin
        .query_one(
            "SELECT run_after <= clock_timestamp() FROM sync_jobs WHERE id=$1",
            &[&id],
        )
        .unwrap()
        .get(0)
}

#[test]
#[ignore = "requires local PostgreSQL, local broker and spawned application process"]
fn operator_grant_authenticates_runs_controls_and_preserves_cursors() {
    let database = std::env::var("APPCALL_ENGINE_POSTGRES_URL").unwrap();
    let mut schemas = Schemas::new(&database);
    seed_runs(&mut schemas);
    let (process, broker, address) = launch(&schemas, &database, Some(OPERATOR_GRANTS));
    let session = login(address);

    let page = request(address, "GET", "/app/runs", &session, "");
    assert_eq!(status(&page), 200, "{page}");
    assert!(!page.contains("id=\"runs-operator-controls-unavailable\""));
    for (id, action) in [
        ("operator-run-now", "run-now"),
        ("operator-reset", "reset"),
        ("operator-cancel", "cancel"),
    ] {
        assert!(
            page.contains(&format!(
                "formaction=\"/app/runs/{id}/{action}\" formmethod=\"post\""
            )),
            "granted Runs page omitted {action}: {page}"
        );
        let detail = request(address, "GET", &format!("/app/runs/{id}"), &session, "");
        assert_eq!(status(&detail), 200, "{detail}");
        assert!(
            detail.contains(&format!(
                "formaction=\"/app/runs/{id}/{action}\" formmethod=\"post\""
            )),
            "detail omitted trusted {action}"
        );
        assert!(detail.contains("id=\"runs-live-status\""));
        assert!(detail.contains("History partial"));
    }

    let run_now_before = job_state(&mut schemas, "operator-run-now");
    assert_job_state(
        &run_now_before,
        "pending",
        2,
        "stale-worker",
        "previous provider error",
        "cursor-run-now",
    );
    assert!(run_now_before.leased_until.is_none());
    assert!(!run_is_due(&mut schemas, "operator-run-now"));
    let run_now = request(
        address,
        "POST",
        "/app/runs/operator-run-now/run-now",
        &session,
        "",
    );
    assert_eq!(status(&run_now), 302, "{run_now}");
    assert!(run_now
        .to_ascii_lowercase()
        .contains("location: /app/runs?success=run-now"));
    assert!(run_is_due(&mut schemas, "operator-run-now"));
    let run_now_after = job_state(&mut schemas, "operator-run-now");
    assert_job_state(
        &run_now_after,
        "pending",
        2,
        "",
        "previous provider error",
        "cursor-run-now",
    );
    assert!(run_now_after.leased_until.is_none());
    assert!(run_now_after.run_after < run_now_before.run_after);

    let reset_before = job_state(&mut schemas, "operator-reset");
    assert_job_state(
        &reset_before,
        "failed",
        7,
        "",
        "terminal provider error",
        "cursor-reset",
    );
    assert!(reset_before.leased_until.is_none());
    assert!(!run_is_due(&mut schemas, "operator-reset"));
    let reset = request(
        address,
        "POST",
        "/app/runs/operator-reset/reset",
        &session,
        "",
    );
    assert_eq!(status(&reset), 302, "{reset}");
    assert!(reset
        .to_ascii_lowercase()
        .contains("location: /app/runs?success=reset"));
    assert!(run_is_due(&mut schemas, "operator-reset"));
    let reset_after = job_state(&mut schemas, "operator-reset");
    assert_job_state(&reset_after, "pending", 0, "", "", "cursor-reset");
    assert!(reset_after.leased_until.is_none());
    assert!(reset_after.run_after < reset_before.run_after);

    let cancel_before = job_state(&mut schemas, "operator-cancel");
    assert_job_state(
        &cancel_before,
        "running",
        4,
        "active-worker",
        "provider still in flight",
        "cursor-cancel",
    );
    assert!(cancel_before.leased_until.is_some());
    let cancel = request(
        address,
        "POST",
        "/app/runs/operator-cancel/cancel",
        &session,
        "",
    );
    assert_eq!(status(&cancel), 302, "{cancel}");
    assert!(cancel
        .to_ascii_lowercase()
        .contains("location: /app/runs?success=cancelled"));
    let cancel_after = job_state(&mut schemas, "operator-cancel");
    assert_job_state(
        &cancel_after,
        "cancelled",
        4,
        "",
        "cancelled by operator",
        "cursor-cancel",
    );
    assert!(cancel_after.leased_until.is_none());
    assert!(cancel_after.run_after > cancel_before.run_after);

    drop(process);
    drop(broker);
}

#[test]
#[ignore = "requires local PostgreSQL, local broker and spawned application process"]
fn detail_operator_form_uses_rendered_scope_and_rejects_mismatch() {
    let database = std::env::var("APPCALL_ENGINE_POSTGRES_URL").unwrap();
    let mut schemas = Schemas::new(&database);
    seed_runs(&mut schemas);
    let (process, broker, address) = launch(&schemas, &database, Some(OPERATOR_GRANTS));
    let session = login(address);

    let detail = request(
        address,
        "GET",
        "/app/runs/operator-reset?accountId=brand-a",
        &session,
        "",
    );
    assert_eq!(status(&detail), 200, "{detail}");
    assert!(detail.contains("formaction=\"/app/runs/operator-reset/reset\" formmethod=\"post\""));
    let rendered_scope = rendered_hidden_value(&detail, "externalAccountId");
    assert_eq!(rendered_scope, "brand-a");

    let before = job_state(&mut schemas, "operator-reset");
    assert_job_state(
        &before,
        "failed",
        7,
        "",
        "terminal provider error",
        "cursor-reset",
    );
    let encoded_body = url::form_urlencoded::Serializer::new(String::new())
        .append_pair("externalAccountId", rendered_scope)
        .finish();
    let reset = request(
        address,
        "POST",
        "/app/runs/operator-reset/reset",
        &session,
        &encoded_body,
    );
    assert_eq!(status(&reset), 302, "{reset}");
    assert!(reset
        .to_ascii_lowercase()
        .contains("location: /app/runs?success=reset"));
    let after = job_state(&mut schemas, "operator-reset");
    assert_job_state(&after, "pending", 0, "", "", "cursor-reset");
    assert!(after.leased_until.is_none());
    assert!(after.run_after < before.run_after);

    let mismatch_before = after.clone();
    let mismatched_body = url::form_urlencoded::Serializer::new(String::new())
        .append_pair("externalAccountId", "brand-b")
        .finish();
    let mismatch = request(
        address,
        "POST",
        "/app/runs/operator-reset/reset",
        &session,
        &mismatched_body,
    );
    assert_denied(&mismatch, "mismatched external account reset");
    assert_eq!(job_state(&mut schemas, "operator-reset"), mismatch_before);

    drop(process);
    drop(broker);
}

#[test]
#[ignore = "requires local PostgreSQL, local broker and spawned application process"]
fn absent_wrong_project_user_grants_and_forged_fields_cannot_control_runs() {
    let database = std::env::var("APPCALL_ENGINE_POSTGRES_URL").unwrap();
    let cases = [
        ("absent grant", None, ""),
        (
            "wrong project grant",
            Some(r#"[{"projectId":"proj_other","userId":"11111111-1111-1111-1111-111111111111"}]"#),
            "",
        ),
        (
            "wrong user grant",
            Some(
                r#"[{"projectId":"proj_tenant-a","userId":"22222222-2222-2222-2222-222222222222"}]"#,
            ),
            "",
        ),
        (
            "forged fields",
            None,
            "projectId=proj_tenant-a&userId=11111111-1111-1111-1111-111111111111",
        ),
    ];
    for (label, grants, body) in cases {
        let mut schemas = Schemas::new(&database);
        seed_runs(&mut schemas);
        let (process, broker, address) = launch(&schemas, &database, grants);
        let session = login(address);
        let page = request(address, "GET", "/app/runs", &session, "");
        assert_eq!(status(&page), 200, "{label}: {page}");
        assert!(
            page.contains("Operator controls unavailable"),
            "{label} exposed operator controls: {page}"
        );
        for (id, action) in [
            ("operator-run-now", "run-now"),
            ("operator-reset", "reset"),
            ("operator-cancel", "cancel"),
        ] {
            assert!(
                !page.contains(&format!(
                    "formaction=\"/app/runs/{id}/{action}\" formmethod=\"post\""
                )),
                "{label} exposed {action}: {page}"
            );
        }
        for (id, action) in [
            ("operator-run-now", "run-now"),
            ("operator-reset", "reset"),
            ("operator-cancel", "cancel"),
        ] {
            let before = job_state(&mut schemas, id);
            let wire = request(
                address,
                "POST",
                &format!("/app/runs/{id}/{action}"),
                &session,
                body,
            );
            assert_eq!(
                status(&wire),
                403,
                "{label} {action} was not rejected: {wire}"
            );
            assert_denied(&wire, &format!("{label} {action}"));
            assert_eq!(job_state(&mut schemas, id), before, "{label} {action}");
        }
        drop(process);
        drop(broker);
    }
}

#[test]
#[ignore = "requires local PostgreSQL, local broker and spawned application process"]
fn operator_scope_rejects_cross_project_account_api_key_csrf_and_revoked_membership() {
    let database = std::env::var("APPCALL_ENGINE_POSTGRES_URL").unwrap();
    let mut schemas = Schemas::new(&database);
    seed_runs(&mut schemas);
    let (process, broker, address) = launch(&schemas, &database, Some(OPERATOR_GRANTS));
    let session = login(address);

    let same_account_before = job_state(&mut schemas, "same-account-run");
    let same_account = request(
        address,
        "POST",
        "/app/runs/same-account-run/cancel",
        &session,
        "externalAccountId=brand-a",
    );
    assert_eq!(status(&same_account), 302, "{same_account}");
    assert!(same_account
        .to_ascii_lowercase()
        .contains("location: /app/runs?success=cancelled"));
    let same_account_after = job_state(&mut schemas, "same-account-run");
    assert_job_state(
        &same_account_after,
        "cancelled",
        1,
        "",
        "cancelled by operator",
        "cursor-same-account",
    );
    assert!(same_account_after.leased_until.is_none());
    assert!(same_account_after.run_after > same_account_before.run_after);

    let cross_project_before = job_state(&mut schemas, "cross-project-run");
    let cross_project = request(
        address,
        "POST",
        "/app/runs/cross-project-run/cancel",
        &session,
        "",
    );
    assert_denied(&cross_project, "cross-project control");
    assert_eq!(
        job_state(&mut schemas, "cross-project-run"),
        cross_project_before
    );

    let cross_account_before = job_state(&mut schemas, "cross-account-run");
    let cross_account = request(
        address,
        "POST",
        "/app/runs/cross-account-run/cancel",
        &session,
        "externalAccountId=brand-b",
    );
    assert_denied(&cross_account, "cross-account control");
    assert_eq!(
        job_state(&mut schemas, "cross-account-run"),
        cross_account_before
    );

    let ordinary_list = request_with_headers(
        address,
        "GET",
        "/v1/sync-runs",
        "",
        "",
        &[
            ("X-API-Key", ORDINARY_API_KEY),
            ("X-External-Account-Id", "brand-a"),
        ],
    );
    assert_eq!(status(&ordinary_list), 200, "{ordinary_list}");
    assert!(ordinary_list.contains("\"operatorControlsUnavailable\":true"));
    let ordinary_before = job_state(&mut schemas, "operator-reset");
    let ordinary_control = request_with_headers(
        address,
        "POST",
        "/v1/sync-runs/operator-reset/reset",
        "",
        "",
        &[
            ("X-API-Key", ORDINARY_API_KEY),
            ("X-External-Account-Id", "brand-a"),
        ],
    );
    assert_eq!(status(&ordinary_control), 403, "{ordinary_control}");
    assert_denied(&ordinary_control, "ordinary API key control");
    assert_eq!(job_state(&mut schemas, "operator-reset"), ordinary_before);

    let csrf_before = job_state(&mut schemas, "operator-run-now");
    let csrf = request_with_origin(
        address,
        "POST",
        "/app/runs/operator-run-now/run-now",
        &session,
        "",
        "http://evil.example",
    );
    assert_eq!(status(&csrf), 403, "{csrf}");
    assert_denied(&csrf, "bad-origin CSRF control");
    assert!(csrf.contains("Access denied"), "{csrf}");
    assert_eq!(job_state(&mut schemas, "operator-run-now"), csrf_before);

    schemas.revoke();
    let revoked_before = job_state(&mut schemas, "operator-cancel");
    let revoked = request(
        address,
        "POST",
        "/app/runs/operator-cancel/cancel",
        &session,
        "",
    );
    assert_denied(&revoked, "revoked membership control");
    assert_eq!(job_state(&mut schemas, "operator-cancel"), revoked_before);

    drop(process);
    drop(broker);
}

#[test]
#[ignore = "requires local PostgreSQL, local broker and spawned application process"]
fn revoked_access_token_with_active_membership_cannot_control_runs() {
    let database = std::env::var("APPCALL_ENGINE_POSTGRES_URL").unwrap();
    let mut schemas = Schemas::new(&database);
    seed_runs(&mut schemas);
    let (process, broker, address) = launch(&schemas, &database, Some(OPERATOR_GRANTS));
    let session = login(address);
    let fixture = fixture();
    let token = fixture["jwt"].as_str().unwrap();
    let token_hash = STANDARD.encode(Sha256::digest(token.as_bytes()));

    let membership_count: i64 = schemas
        .admin
        .query_one(
            &format!(
                "SELECT count(*) FROM {}.tenant_memberships WHERE user_id=$1 AND tenant_id=$2",
                schemas.anusa
            ),
            &[&"11111111-1111-1111-1111-111111111111", &"tenant-a"],
        )
        .unwrap()
        .get(0);
    assert_eq!(membership_count, 1);
    schemas.revoke_token(&token_hash);
    let membership_count_after: i64 = schemas
        .admin
        .query_one(
            &format!(
                "SELECT count(*) FROM {}.tenant_memberships WHERE user_id=$1 AND tenant_id=$2",
                schemas.anusa
            ),
            &[&"11111111-1111-1111-1111-111111111111", &"tenant-a"],
        )
        .unwrap()
        .get(0);
    assert_eq!(membership_count_after, 1);

    let before = job_state(&mut schemas, "operator-cancel");
    let wire = request(
        address,
        "POST",
        "/app/runs/operator-cancel/cancel",
        &session,
        "",
    );
    assert_denied(&wire, "revoked access token control");
    assert_eq!(job_state(&mut schemas, "operator-cancel"), before);

    drop(process);
    drop(broker);
}
