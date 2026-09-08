//! Focused contract tests for the persisted sync-run history reader.
//!
//! The PostgreSQL cases are intentionally ignored unless the caller supplies
//! an isolated `APPCALL_ENGINE_POSTGRES_URL`.  They are real transaction/store
//! fixtures rather than mock rows so ownership, pagination, and migration
//! boundaries are exercised against PostgreSQL's JSONB/timestamp behavior.

use appcall_api::data_routes::{run_history_read, RunHistoryQuery};
use appcall_api::Identity;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use serde_json::{json, Value};

fn query(raw: &str) -> RunHistoryQuery {
    RunHistoryQuery::parse(
        &url::Url::parse(&format!(
            "http://appcall.invalid/v1/sync-runs/run-a/history{raw}"
        ))
        .unwrap(),
    )
    .unwrap()
}

#[test]
fn run_history_id_uses_the_browser_run_bound() {
    assert!(RunHistoryQuery::validate_run_id(&"r".repeat(256)).is_ok());
    assert!(RunHistoryQuery::validate_run_id(&"r".repeat(257)).is_err());

    for id in [".", "..", "run/42", "run?cursor=1", "run\\42", "run\n42"] {
        assert!(
            RunHistoryQuery::validate_run_id(id).is_err(),
            "unsafe run ID must be rejected: {id:?}"
        );
    }
}

#[test]
#[ignore = "requires isolated APPCALL_ENGINE_POSTGRES_URL"]
fn history_reader_rechecks_run_id_bound_before_sql() {
    let (mut client, schema) = fixture();
    let identity = identity("p", "brand-a");
    for id in [
        "r".repeat(257),
        ".".into(),
        "..".into(),
        "run/42".into(),
        "run?cursor=1".into(),
        "run\\42".into(),
    ] {
        assert_eq!(
            run_history_read(&mut client, &identity, &id, &query(""))
                .unwrap_err()
                .code,
            "INVALID_REQUEST",
            "invalid run ID must be rejected before SQL: {id:?}"
        );
    }
    cleanup(client, schema);
}

#[test]
fn history_query_has_bounded_limit_and_sequence_cursor() {
    let cursor = URL_SAFE_NO_PAD.encode("3");
    let parsed = query(&format!("?limit=7&cursor={cursor}"));
    assert_eq!(parsed.limit, 7);
    assert_eq!(parsed.after_seq, Some(3));

    assert_eq!(query("").limit, 50);
    assert_eq!(query("?limit=0").limit, 50);
    assert_eq!(query("?limit=999").limit, 100);

    let canonical = query("?accountId=brand-a&externalAccountId=brand-b");
    assert_eq!(canonical.account_id, "brand-a");
    let alias = query("?externalAccountId=brand-b");
    assert_eq!(alias.account_id, "brand-b");

    for raw in [
        "?limit=-1",
        "?limit=not-a-number",
        "?cursor=broken",
        "?accountId=%0A",
    ] {
        assert!(
            RunHistoryQuery::parse(
                &url::Url::parse(&format!(
                    "http://appcall.invalid/v1/sync-runs/run-a/history{raw}"
                ))
                .unwrap()
            )
            .is_err(),
            "history query should reject {raw}"
        );
    }
    let oversized = format!("?externalAccountId={}", "a".repeat(513));
    assert_eq!(
        RunHistoryQuery::parse(
            &url::Url::parse(&format!(
                "http://appcall.invalid/v1/sync-runs/run-a/history{oversized}"
            ))
            .unwrap()
        )
        .unwrap_err()
        .code,
        "INVALID_RUN_FILTER"
    );
}

#[test]
#[ignore = "requires isolated APPCALL_ENGINE_POSTGRES_URL"]
fn history_reader_paginates_ascending_and_aggregates_full_observed_pages() {
    let (mut client, schema) = fixture();
    insert_job(&mut client, "run-a", "p", "c-a", "succeeded");
    insert_events(
        &mut client,
        "run-a",
        [
            (1, "scheduled", json!({"reason":"new_job"})),
            (
                2,
                "claimed",
                json!({"policy":{"source":"service_config","maxAttempts":3,"leaseDurationMs":1200,"retryBaseMs":"250","maxRetryDelayMs":23000}}),
            ),
            (
                3,
                "page",
                json!({"recordsWritten":5,"hasMore":true,"code":"PROVIDER_ERROR"}),
            ),
            (
                4,
                "retry",
                json!({"reason":"rate_limited","retryDelayMs":250}),
            ),
            (5, "page", json!({"recordsWritten":7,"hasMore":false})),
            (6, "succeeded", json!({})),
        ],
    );
    let identity = identity("p", "brand-a");

    let first = run_history_read(&mut client, &identity, "run-a", &query("?limit=2")).unwrap();
    assert_eq!(first["run"]["id"], "run-a");
    assert_eq!(first["run"]["connectionId"], "c-a");
    assert_eq!(first["run"]["connector"], "slack");
    assert_eq!(first["run"]["tool"], "messages.list");
    assert_eq!(first["history"]["events"].as_array().unwrap().len(), 2);
    assert_eq!(first["history"]["events"][0]["seq"], 1);
    assert_eq!(first["history"]["events"][1]["seq"], 2);
    assert_eq!(first["pagination"]["hasMore"], true);
    assert_eq!(first["recordsObserved"], 12);
    assert_eq!(first["history"]["complete"], true);
    assert_eq!(first["recordsPartial"], false);
    assert!(first["history"].get("notice").is_none());
    assert_eq!(first["policy"]["maxAttempts"], 3);
    assert_eq!(first["policy"]["leaseDurationMs"], 1200);
    assert_eq!(first["policy"]["retryBaseMs"], "250");
    assert_eq!(first["policy"]["maxRetryDelayMs"], 23000);
    assert_eq!(first["policyEventSeq"], 2);
    assert!(first["policyRecordedAt"].as_str().is_some());

    // Event detail is an allowlisted metadata projection, never a pass-through
    // of input, provider credentials, raw errors, or other JSONB keys.
    assert_eq!(first["history"]["events"][0]["detail"]["reason"], "new_job");
    assert!(first["history"]["events"][0]["detail"]
        .get("input")
        .is_none());
    assert!(first["history"]["events"][1]["detail"]
        .get("credentials")
        .is_none());
    assert!(first["run"].get("input").is_none());
    assert!(first["run"].get("lastError").is_none());
    let serialized = serde_json::to_string(&first).unwrap();
    for sentinel in [
        "credential-sentinel",
        "input-sentinel",
        "raw-error-sentinel",
    ] {
        assert!(
            !serialized.contains(sentinel),
            "history projection leaked seeded sentinel {sentinel}"
        );
    }

    let next_cursor = first["pagination"]["nextCursor"].as_str().unwrap();
    let second = run_history_read(
        &mut client,
        &identity,
        "run-a",
        &query(&format!("?limit=2&cursor={next_cursor}")),
    )
    .unwrap();
    assert_eq!(
        second["history"]["events"]
            .as_array()
            .unwrap()
            .iter()
            .map(|event| event["seq"].as_i64().unwrap())
            .collect::<Vec<_>>(),
        vec![3, 4]
    );
    assert_eq!(
        second["history"]["events"][0]["detail"]["code"],
        "PROVIDER_ERROR"
    );
    assert!(second["history"]["events"][0]["detail"]
        .get("error")
        .is_none());
    assert_eq!(second["pagination"]["hasMore"], true);
    // This remains a full-history aggregate rather than the current page's
    // records or the sync_jobs lifetime counter.
    assert_eq!(second["recordsObserved"], 12);

    let last_cursor = second["pagination"]["nextCursor"].as_str().unwrap();
    let third = run_history_read(
        &mut client,
        &identity,
        "run-a",
        &query(&format!("?limit=2&cursor={last_cursor}")),
    )
    .unwrap();
    assert_eq!(
        third["history"]["events"]
            .as_array()
            .unwrap()
            .iter()
            .map(|event| event["seq"].as_i64().unwrap())
            .collect::<Vec<_>>(),
        vec![5, 6]
    );
    assert_eq!(third["pagination"]["hasMore"], false);
    assert_eq!(third["recordsObserved"], 12);

    cleanup(client, schema);
}

#[test]
#[ignore = "requires isolated APPCALL_ENGINE_POSTGRES_URL"]
fn data_route_dispatches_sync_run_history_subresource() {
    let (mut client, schema) = fixture();
    insert_job(&mut client, "run-a", "p", "c-a", "succeeded");
    insert_events(
        &mut client,
        "run-a",
        [(1, "scheduled", json!({"reason":"new_job"}))],
    );
    let response = appcall_api::data_routes::read(
        &mut client,
        &identity("p", "brand-a"),
        &url::Url::parse("http://appcall.invalid/v1/sync-runs/run-a/history?limit=1").unwrap(),
    )
    .unwrap()
    .expect("history path should be handled by the data route adapter");
    assert_eq!(response.status, 200);
    assert_eq!(response.body["history"]["events"][0]["seq"], 1);
    cleanup(client, schema);
}

#[test]
#[ignore = "requires isolated APPCALL_ENGINE_POSTGRES_URL"]
fn history_reader_marks_pre_migration_jobs_partial_without_fabricating_events() {
    let (mut client, schema) = fixture();
    insert_job(&mut client, "run-old", "p", "c-a", "succeeded");
    // A pre-migration run may receive new events after the history table is
    // introduced.  Starting at seq 4 and lacking the original `new_job`
    // schedule event must remain visibly partial forever.
    insert_events(
        &mut client,
        "run-old",
        [
            (4, "page", json!({"recordsWritten":3,"hasMore":false})),
            (5, "succeeded", json!({})),
            (6, "scheduled", json!({"reason":"run_now"})),
        ],
    );
    let value = run_history_read(
        &mut client,
        &identity("p", "brand-a"),
        "run-old",
        &query("?limit=100"),
    )
    .unwrap();
    assert_eq!(
        value["history"]["events"]
            .as_array()
            .unwrap()
            .iter()
            .map(|event| event["seq"].as_i64().unwrap())
            .collect::<Vec<_>>(),
        vec![4, 5, 6]
    );
    assert_eq!(value["recordsObserved"], 3);
    assert_eq!(value["history"]["complete"], false);
    assert_eq!(value["recordsPartial"], true);
    let notice = value["history"]["notice"].as_str().unwrap();
    assert!(notice.to_lowercase().contains("before"), "{notice}");
    assert!(notice.to_lowercase().contains("history"), "{notice}");
    cleanup(client, schema);
}

#[test]
#[ignore = "requires isolated APPCALL_ENGINE_POSTGRES_URL"]
fn history_reader_has_no_cross_account_or_cross_project_oracle() {
    let (mut client, schema) = fixture();
    insert_job(&mut client, "run-a", "p", "c-a", "succeeded");
    insert_job(&mut client, "run-b", "p", "c-b", "failed");
    insert_job(&mut client, "run-q", "q", "c-q", "succeeded");
    insert_events(
        &mut client,
        "run-a",
        [(1, "scheduled", json!({"reason":"new_job"}))],
    );
    insert_events(
        &mut client,
        "run-b",
        [(1, "scheduled", json!({"reason":"new_job"}))],
    );
    insert_events(
        &mut client,
        "run-q",
        [(1, "scheduled", json!({"reason":"new_job"}))],
    );
    let identity = identity("p", "brand-a");

    let foreign = run_history_read(&mut client, &identity, "run-b", &query(""));
    let missing = run_history_read(&mut client, &identity, "missing", &query(""));
    let other_project = run_history_read(&mut client, &identity, "run-q", &query(""));
    assert_eq!(foreign.as_ref().unwrap_err().code, "RUN_NOT_FOUND");
    assert_eq!(missing.as_ref().unwrap_err().code, "RUN_NOT_FOUND");
    assert_eq!(other_project.as_ref().unwrap_err().code, "RUN_NOT_FOUND");

    cleanup(client, schema);
}

#[test]
#[ignore = "requires isolated APPCALL_ENGINE_POSTGRES_URL"]
fn history_reader_enforces_identity_and_project_account_filters() {
    let (mut client, schema) = fixture();
    insert_job(&mut client, "run-a", "p", "c-a", "succeeded");
    insert_job(&mut client, "run-b", "p", "c-b", "succeeded");
    client
        .execute(
            "INSERT INTO connections(id,project_id,connector,auth_type,status,external_account_id,credential_owner) VALUES ('c-platform','p','slack','api_key','active',NULL,'platform')",
            &[],
        )
        .unwrap();
    insert_job(&mut client, "run-platform", "p", "c-platform", "succeeded");
    insert_events(
        &mut client,
        "run-a",
        [(1, "scheduled", json!({"reason":"new_job"}))],
    );
    insert_events(
        &mut client,
        "run-b",
        [(1, "scheduled", json!({"reason":"new_job"}))],
    );
    insert_events(
        &mut client,
        "run-platform",
        [(1, "scheduled", json!({"reason":"new_job"}))],
    );

    let account_a = identity("p", "brand-a");
    let other_account = query("?accountId=brand-b");
    assert_eq!(
        run_history_read(&mut client, &account_a, "run-a", &other_account)
            .unwrap_err()
            .code,
        "FORBIDDEN"
    );
    let other_account_alias = query("?externalAccountId=brand-b");
    assert_eq!(
        run_history_read(&mut client, &account_a, "run-a", &other_account_alias)
            .unwrap_err()
            .code,
        "FORBIDDEN"
    );

    // accountId is canonical when both selectors are present.
    let conflicting_alias = query("?accountId=brand-b&externalAccountId=brand-a");
    assert_eq!(
        run_history_read(&mut client, &account_a, "run-a", &conflicting_alias)
            .unwrap_err()
            .code,
        "FORBIDDEN"
    );

    let project_identity = identity("p", "");
    let scoped = run_history_read(&mut client, &project_identity, "run-b", &other_account).unwrap();
    assert_eq!(scoped["run"]["accountId"], "brand-b");
    assert_eq!(scoped["history"]["events"][0]["seq"], 1);

    // The project-level selector still applies the non-platform fence.
    let platform = run_history_read(
        &mut client,
        &project_identity,
        "run-platform",
        &query("?accountId=brand-a"),
    );
    assert_eq!(platform.unwrap_err().code, "RUN_NOT_FOUND");
    cleanup(client, schema);
}

#[test]
#[ignore = "requires isolated APPCALL_ENGINE_POSTGRES_URL"]
fn history_reader_does_not_invent_default_policy() {
    let (mut client, schema) = fixture();
    insert_job(&mut client, "run-no-policy", "p", "c-a", "succeeded");
    insert_events(
        &mut client,
        "run-no-policy",
        [(1, "scheduled", json!({"reason":"new_job"}))],
    );
    let value = run_history_read(
        &mut client,
        &identity("p", "brand-a"),
        "run-no-policy",
        &query(""),
    )
    .unwrap();
    assert!(value.get("policy").is_none());
    assert!(value.get("maxAttempts").is_none());
    assert!(value.get("leaseDurationMs").is_none());
    assert!(value.get("policyEventSeq").is_none());
    assert!(value.get("policyRecordedAt").is_none());
    cleanup(client, schema);
}

#[test]
#[ignore = "requires isolated APPCALL_ENGINE_POSTGRES_URL"]
fn history_reader_latest_policy_missing_is_unknown_after_valid_claim() {
    let (mut client, schema) = fixture();
    insert_job(&mut client, "run-policy-gap", "p", "c-a", "succeeded");
    insert_events(
        &mut client,
        "run-policy-gap",
        [
            (1, "scheduled", json!({"reason":"new_job"})),
            (
                2,
                "claimed",
                json!({"policy":{"source":"service_config","maxAttempts":3,"leaseDurationMs":1200,"retryBaseMs":"250","maxRetryDelayMs":23000}}),
            ),
            // The latest claim has no policy evidence.  It must not inherit
            // the older claim's policy, even when that older event is valid.
            (3, "claimed", json!({})),
            (4, "succeeded", json!({})),
        ],
    );
    let value = run_history_read(
        &mut client,
        &identity("p", "brand-a"),
        "run-policy-gap",
        &query("?limit=1"),
    )
    .unwrap();
    assert_eq!(value["history"]["events"][0]["seq"], 1);
    assert_eq!(value["pagination"]["hasMore"], true);
    assert!(value.get("policy").is_none());
    assert!(value.get("policyEventSeq").is_none());
    assert!(value.get("policyRecordedAt").is_none());
    assert!(value["run"].get("maxAttempts").is_none());
    assert!(value["run"].get("attemptsRemaining").is_none());
    cleanup(client, schema);
}

fn identity(project_id: &str, account_id: &str) -> Identity {
    Identity {
        project_id: project_id.into(),
        account_id: account_id.into(),
        admin_scope: false,
    }
}

fn fixture() -> (postgres::Client, String) {
    let url = std::env::var("APPCALL_ENGINE_POSTGRES_URL").unwrap();
    let mut client = postgres::Client::connect(&url, postgres::NoTls).unwrap();
    let schema = format!("run_history_test_{}", uuid::Uuid::new_v4().simple());
    client
        .batch_execute(&format!(
            "CREATE SCHEMA {schema}; SET search_path TO {schema}"
        ))
        .unwrap();
    for migration in [
        include_str!("../../../migrations/202605140001_init.sql"),
        include_str!("../../../migrations/202605290001_connections_ownership.sql"),
        include_str!("../../../migrations/202605290004_connections_owner_check.sql"),
        include_str!("../../../migrations/202609070002_sync_recovery.sql"),
        include_str!("../../../migrations/202609040001_sync_job_terminal_failure.sql"),
        include_str!("../../../migrations/202609090001_sync_job_history.sql"),
    ] {
        client.batch_execute(migration).unwrap();
    }
    client
        .batch_execute(
            "INSERT INTO projects(id,name) VALUES ('p','Project P'),('q','Project Q');
             INSERT INTO connections(id,project_id,connector,auth_type,status,external_account_id,credential_owner)
             VALUES ('c-a','p','slack','api_key','active','brand-a','brand'),
                    ('c-b','p','slack','api_key','active','brand-b','brand'),
                    ('c-q','q','slack','api_key','active','brand-a','brand');
             INSERT INTO secret_envelopes(id,project_id,kind,key_id,algorithm,nonce,ciphertext)
             VALUES ('secret-a','p','credential','test-key','test',decode('00','hex'),convert_to('credential-sentinel','UTF8'));
             UPDATE connections SET secret_ref_id='secret-a' WHERE id='c-a';",
        )
        .unwrap();
    (client, schema)
}

fn insert_job(
    client: &mut postgres::Client,
    id: &str,
    project_id: &str,
    connection_id: &str,
    status: &str,
) {
    client
        .execute(
            "INSERT INTO sync_jobs(id,project_id,connection_id,operation,status,dedup_key) VALUES($1,$2,$3,'messages.list',$4,$1)",
            &[&id, &project_id, &connection_id, &status],
        )
        .unwrap();
    client
        .execute(
            "UPDATE sync_jobs SET input=$2::jsonb,last_error=$3 WHERE id=$1",
            &[
                &id,
                &json!({
                    "accessToken": "credential-sentinel",
                    "rawInput": "input-sentinel"
                }),
                &"raw-error-sentinel",
            ],
        )
        .unwrap();
}

fn insert_events<const N: usize>(
    client: &mut postgres::Client,
    job_id: &str,
    events: [(i32, &str, Value); N],
) {
    for (seq, kind, detail) in events {
        client
            .execute(
                "INSERT INTO sync_job_events(job_id,seq,kind,\"at\",detail) VALUES($1,$2,$3,clock_timestamp(),$4::jsonb)",
                &[&job_id, &seq, &kind, &detail],
            )
            .unwrap();
    }
}

fn cleanup(mut client: postgres::Client, schema: String) {
    client
        .batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
        .unwrap();
}
