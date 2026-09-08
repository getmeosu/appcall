//! Actual HTTP qualification for the persisted sync-run history surface.
//!
//! These cases deliberately use the spawned application and isolated schemas;
//! no browser renderer or data-route mock can stand in for the two identity
//! boundaries exercised here.

use super::*;
use base64::{
    engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD},
    Engine,
};
use serde_json::Value as JsonValue;
use sha2::{Digest, Sha256};

const RUN_ID: &str = "application-browser-history-run";
const FOREIGN_ACCOUNT_RUN_ID: &str = "application-browser-foreign-account-run";
const FOREIGN_PROJECT_RUN_ID: &str = "application-browser-foreign-project-run";
const HISTORY_ACCOUNT: &str = "brand-a";

/// Seed one complete history plus rows that must remain indistinguishable from
/// a missing run at the authenticated browser boundary. The sentinel values
/// are retained only in storage so the response can prove projection safety.
fn seed_history(db: &mut postgres::Client) {
    db.batch_execute(
        r#"
        INSERT INTO connections(
            id, project_id, connector, auth_type, status,
            external_account_id, credential_owner
        ) VALUES
            (
                'application-browser-history-connection',
                'proj_tenant-a', 'slack', 'api_key', 'active',
                'brand-a', 'brand'
            ),
            (
                'application-browser-foreign-account-connection',
                'proj_tenant-a', 'slack', 'api_key', 'active',
                'brand-b', 'brand'
            );

        INSERT INTO sync_jobs(
            id, project_id, connection_id, operation, status, attempts,
            run_after, created_at, updated_at, dedup_key, input, last_error
        ) VALUES
            (
                'application-browser-history-run',
                'proj_tenant-a', 'application-browser-history-connection',
                'messages.sync', 'succeeded', 0,
                '2026-09-09T09:00:00Z',
                '2026-09-09T09:00:00Z',
                '2026-09-09T09:05:00Z',
                'application-browser-history-run',
                '{"providerToken":"browser-history-input-secret"}',
                'browser-history-error-secret'
            ),
            (
                'application-browser-foreign-account-run',
                'proj_tenant-a', 'application-browser-foreign-account-connection',
                'messages.sync', 'succeeded', 1,
                '2026-09-09T09:00:00Z',
                '2026-09-09T09:00:00Z',
                '2026-09-09T09:05:00Z',
                'application-browser-foreign-account-run',
                '{}', ''
            ),
            (
                'application-browser-foreign-project-run',
                'other', 'other-project-secret-connection',
                'messages.sync', 'succeeded', 1,
                '2026-09-09T09:00:00Z',
                '2026-09-09T09:00:00Z',
                '2026-09-09T09:05:00Z',
                'application-browser-foreign-project-run',
                '{"providerToken":"foreign-project-secret"}',
                'foreign-project-error-secret'
            );

        INSERT INTO sync_job_checkpoints(job_id, cursor)
        VALUES ('application-browser-history-run', '');

        INSERT INTO sync_job_events(job_id, seq, kind, at, detail) VALUES
            (
                'application-browser-history-run', 1, 'scheduled',
                '2026-09-09T09:00:00Z', '{"reason":"new_job"}'
            ),
            (
                'application-browser-history-run', 2, 'claimed',
                '2026-09-09T09:00:01Z',
                '{"policy":{"source":"service_config","maxAttempts":8,"leaseDurationMs":30000,"retryBaseMs":"1000","maxRetryDelayMs":60000}}'
            ),
            (
                'application-browser-history-run', 3, 'page',
                '2026-09-09T09:03:00Z',
                '{"recordsWritten":5,"hasMore":false}'
            ),
            (
                'application-browser-history-run', 4, 'succeeded',
                '2026-09-09T09:05:00Z', '{}'
            );
        "#,
    )
    .unwrap();
}

fn response_status(wire: &str) -> u16 {
    wire.split_once("\r\n\r\n")
        .expect("HTTP response must contain headers and body")
        .0
        .split_whitespace()
        .nth(1)
        .expect("HTTP response must contain status")
        .parse()
        .expect("HTTP status must be numeric")
}

fn response_body(wire: &str) -> &str {
    wire.split_once("\r\n\r\n")
        .expect("HTTP response must contain headers and body")
        .1
}

fn api_get(address: SocketAddr, path: &str, token: &str, account: &str) -> String {
    let mut socket = TcpStream::connect(address).unwrap();
    socket
        .set_read_timeout(Some(Duration::from_secs(5)))
        .unwrap();
    write!(
        socket,
        "GET {path} HTTP/1.1\r\nHost: {address}\r\nAuthorization: Bearer {token}\r\nX-Tenant-ID: tenant-a\r\nX-External-Account-Id: {account}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
    )
    .unwrap();
    let mut wire = String::new();
    socket.read_to_string(&mut wire).unwrap_or_else(|error| {
        panic!("GET {path} response read failed: {error}; received: {wire}")
    });
    wire
}

fn revoke_token(schemas: &mut Schemas, token: &str) {
    let token_hash = STANDARD.encode(Sha256::digest(token.as_bytes()));
    schemas
        .admin
        .execute(
            &format!(
                "INSERT INTO {}.revoked_tokens(token_hash) VALUES($1)",
                schemas.anusa
            ),
            &[&token_hash],
        )
        .unwrap();
}

#[test]
#[ignore = "requires local PostgreSQL, local broker and spawned application process"]
fn application_run_history_is_project_account_scoped_and_revocable() {
    let database = std::env::var("APPCALL_ENGINE_POSTGRES_URL").unwrap();
    let mut schemas = Schemas::new(&database);
    seed_history(&mut schemas.admin);
    let (app_url, anusa_url) = schemas.urls(&database);
    let fixture: JsonValue =
        serde_json::from_str(include_str!("../../../appcall-auth/tests/go_golden.json")).unwrap();
    let broker = Broker::new(&fixture);
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    drop(listener);
    let _process = start_host(address, &app_url, &anusa_url, &broker, &fixture);

    let login = request(
        address,
        "POST",
        "/app/login",
        "",
        "email=fixture%40example.invalid&password=synthetic",
    );
    assert_eq!(response_status(&login), 302, "{login}");
    let session_cookie = cookie(&login);

    let detail = request(
        address,
        "GET",
        &format!("/app/runs/{RUN_ID}?accountId={HISTORY_ACCOUNT}&limit=2"),
        &session_cookie,
        "",
    );
    assert_eq!(response_status(&detail), 200, "{detail}");
    let body = response_body(&detail);
    for expected in [
        "id=\"run-detail\"",
        "Persisted history",
        "Records observed",
        "Recorded policy",
        "service_config",
        "Maximum attempts",
        ">8</dd>",
        "Next page",
    ] {
        assert!(body.contains(expected), "missing {expected}: {body}");
    }

    let second_page = request(
        address,
        "GET",
        &format!(
            "/app/runs/{RUN_ID}?accountId={HISTORY_ACCOUNT}&limit=2&cursor={}",
            URL_SAFE_NO_PAD.encode("2")
        ),
        &session_cookie,
        "",
    );
    assert_eq!(response_status(&second_page), 200, "{second_page}");
    let second_body = response_body(&second_page);
    assert!(second_body.contains("5 records committed"), "{second_body}");
    assert!(second_body.contains("Succeeded"), "{second_body}");
    for secret in [
        "browser-history-input-secret",
        "browser-history-error-secret",
        "foreign-project-secret",
        "foreign-project-error-secret",
    ] {
        assert!(
            !body.contains(secret),
            "history response leaked {secret}: {body}"
        );
        assert!(
            !second_body.contains(secret),
            "history response leaked {secret}: {second_body}"
        );
    }

    let mut not_found_bodies = Vec::new();
    for id in [
        "application-browser-missing-run",
        FOREIGN_ACCOUNT_RUN_ID,
        FOREIGN_PROJECT_RUN_ID,
    ] {
        let wire = request(
            address,
            "GET",
            &format!("/app/runs/{id}?accountId={HISTORY_ACCOUNT}"),
            &session_cookie,
            "",
        );
        assert_eq!(response_status(&wire), 404, "{id}: {wire}");
        not_found_bodies.push(response_body(&wire).to_owned());
    }
    assert_eq!(not_found_bodies[0], not_found_bodies[1]);
    assert_eq!(not_found_bodies[1], not_found_bodies[2]);

    let token = fixture["jwt"].as_str().unwrap();
    let api_history = api_get(
        address,
        &format!("/v1/sync-runs/{RUN_ID}/history?limit=2"),
        token,
        HISTORY_ACCOUNT,
    );
    assert_eq!(response_status(&api_history), 200, "{api_history}");
    let api_body: JsonValue = serde_json::from_str(response_body(&api_history)).unwrap();
    assert_eq!(api_body["run"]["id"], RUN_ID);
    assert_eq!(api_body["history"]["events"].as_array().unwrap().len(), 2);

    let api_second_page = api_get(
        address,
        &format!(
            "/v1/sync-runs/{RUN_ID}/history?limit=2&cursor={}",
            URL_SAFE_NO_PAD.encode("2")
        ),
        token,
        HISTORY_ACCOUNT,
    );
    assert_eq!(response_status(&api_second_page), 200, "{api_second_page}");
    let api_second_body: JsonValue = serde_json::from_str(response_body(&api_second_page)).unwrap();
    assert_eq!(
        api_second_body["history"]["events"][0]["detail"]["recordsWritten"],
        5
    );
    assert_eq!(api_second_body["policy"]["maxAttempts"], 8);
    for secret in [
        "browser-history-input-secret",
        "browser-history-error-secret",
    ] {
        assert!(!response_body(&api_history).contains(secret));
        assert!(!response_body(&api_second_page).contains(secret));
    }

    // A bearer identity bound to brand-a must not be widened by an account
    // selector supplied as a history query parameter.
    let spoofed = api_get(
        address,
        &format!("/v1/sync-runs/{RUN_ID}/history?accountId=brand-b"),
        token,
        HISTORY_ACCOUNT,
    );
    assert_eq!(response_status(&spoofed), 403, "{spoofed}");

    revoke_token(&mut schemas, token);
    let revoked = request(
        address,
        "GET",
        &format!("/app/runs/{RUN_ID}?accountId={HISTORY_ACCOUNT}"),
        &session_cookie,
        "",
    );
    assert_eq!(response_status(&revoked), 302, "{revoked}");
    let revoked_api = api_get(
        address,
        &format!("/v1/sync-runs/{RUN_ID}/history"),
        token,
        HISTORY_ACCOUNT,
    );
    assert_eq!(response_status(&revoked_api), 403, "{revoked_api}");
}
