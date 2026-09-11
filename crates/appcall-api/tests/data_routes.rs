use appcall_api::data_routes::{sanitize, LogQuery, RunQuery};
use base64::Engine;
use serde_json::json;
#[test]
fn action_created_bounds_validate_and_normalize_first_scalars() {
    let mut url = url::Url::parse("http://x/v1/action-logs").unwrap();
    url.query_pairs_mut()
        .append_pair("createdFrom", "2026-09-07T15:30:00+05:30")
        .append_pair("createdFrom", "invalid")
        .append_pair("createdBefore", "2026-09-07T11:00:00Z");
    let query = LogQuery::parse(&url).unwrap();
    assert_eq!(query.filters["createdFrom"], "2026-09-07T10:00:00+00:00");
    assert_eq!(query.filters["createdBefore"], "2026-09-07T11:00:00+00:00");
    for raw in [
        "createdFrom=bad-private-value",
        "createdBefore=2026-09-07",
        "createdFrom=2026-09-07T11:00:00Z&createdBefore=2026-09-07T10:00:00Z",
        "createdFrom=2026-09-07T10:00:00Z&createdBefore=2026-09-07T10:00:00Z",
        "createdFrom=2026-09-07T15:30:00%2B05:30&createdBefore=2026-09-07T10:00:00Z",
        "createdFrom=2016-12-31T23:59:60Z",
        "createdBefore=2026-09-07T10:00:00.0000000001Z",
        "createdFrom=0000-01-01T00:00:00Z",
        "createdFrom=0001-01-01T00:00:00%2B01:00",
        "createdBefore=9999-12-31T23:00:00-01:00",
        "createdBefore=9999-12-31T23:59:59.999999999Z",
    ] {
        let error =
            LogQuery::parse(&url::Url::parse(&format!("http://x/?{raw}")).unwrap()).unwrap_err();
        assert_eq!(error.code, "INVALID_TIME_RANGE");
    }
    let long = format!(
        "http://x/?createdFrom=2026-09-07T10:00:00.{}Z",
        "0".repeat(100)
    );
    assert_eq!(
        LogQuery::parse(&url::Url::parse(&long).unwrap())
            .unwrap_err()
            .code,
        "INVALID_TIME_RANGE"
    );
    assert!(LogQuery::parse(
        &url::Url::parse("http://x/?createdFrom=&createdFrom=bad&createdBefore=").unwrap()
    )
    .is_ok());
    for kind in [
        appcall_api::data_routes::LogKind::Replay,
        appcall_api::data_routes::LogKind::Webhook,
    ] {
        assert!(LogQuery::parse_for(
            &url::Url::parse("http://x/?createdFrom=bad&createdBefore=bad").unwrap(),
            kind
        )
        .is_ok());
    }
}

#[test]
fn filters_limits_and_redaction_are_contractual() {
    assert_eq!(
        LogQuery::parse(&url::Url::parse("http://x/?limit=0").unwrap())
            .unwrap()
            .limit,
        50
    );
    assert_eq!(
        LogQuery::parse(&url::Url::parse("http://x/?limit=999").unwrap())
            .unwrap()
            .limit,
        100
    );
    for query in [
        "limit=-1",
        "limit=no",
        "status=running",
        "errorCode=secret",
        "cursor=broken",
    ] {
        assert!(LogQuery::parse(&url::Url::parse(&format!("http://x/?{query}")).unwrap()).is_err());
    }
    assert_eq!(
        sanitize(
            &json!({"nested":[{"access_token":"hidden", "text":"prefix secret suffix"}],"ok":3}),
            &["secret"]
        ),
        json!({"nested":[{"access_token":"[REDACTED]", "text":"prefix [REDACTED] suffix"}],"ok":3})
    );
}

#[test]
fn runs_query_parses_operator_filters_and_signed_cursor() {
    let cursor = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .encode("2026-09-08T10:00:00.000000Z|run_1");
    let query = RunQuery::parse(&url::Url::parse(&format!(
        "http://x/?limit=7&status=running&connector=slack&tool=messages.list&accountId=brand-a&cursor={cursor}"
    )).unwrap()).unwrap();
    assert_eq!(query.limit, 7);
    assert_eq!(query.get("status"), "running");
    assert_eq!(query.get("connector"), "slack");
    assert_eq!(query.get("tool"), "messages.list");
    assert_eq!(query.get("accountId"), "brand-a");
    assert_eq!(
        query.cursor_boundary(),
        ("2026-09-08T10:00:00.000000Z", "run_1")
    );
    assert_eq!(
        RunQuery::parse(&url::Url::parse("http://x/?limit=0").unwrap())
            .unwrap()
            .limit,
        50
    );
    for raw in ["status=unknown", "limit=-1", "cursor=broken", "tool=%01"] {
        assert!(
            RunQuery::parse(&url::Url::parse(&format!("http://x/?{raw}")).unwrap()).is_err(),
            "{raw}"
        );
    }
}

#[test]
#[ignore = "requires isolated APPCALL_ENGINE_POSTGRES_URL"]
fn sync_runs_projection_is_scoped_and_uses_persisted_queue_evidence() {
    use appcall_api::data_routes::{dead_runs_projection, runs_list as list_runs, RunQuery};
    use appcall_api::Identity;
    let url = std::env::var("APPCALL_ENGINE_POSTGRES_URL").unwrap();
    let mut client = postgres::Client::connect(&url, postgres::NoTls).unwrap();
    let schema = format!("runs_projection_test_{}", uuid::Uuid::new_v4().simple());
    client
        .batch_execute(&format!(
            "CREATE SCHEMA {schema}; SET search_path TO {schema}"
        ))
        .unwrap();
    for sql in [
        include_str!("../../../migrations/202605140001_init.sql"),
        include_str!("../../../migrations/202605290001_connections_ownership.sql"),
        include_str!("../../../migrations/202605290003_usage_brand_dim.sql"),
        include_str!("../../../migrations/202609070001_event_outbox.sql"),
        include_str!("../../../migrations/202609110001_event_connection_dedup.sql"),
        include_str!("../../../migrations/202609070002_sync_recovery.sql"),
        include_str!("../../../migrations/202609040001_sync_job_terminal_failure.sql"),
    ] {
        client.batch_execute(sql).unwrap();
    }
    client
        .batch_execute(
            "INSERT INTO projects(id,name) VALUES('p','p'); INSERT INTO connections(id,project_id,connector,auth_type,status,external_account_id,credential_owner) VALUES('c','p','slack','api_key','active','brand-a','brand'),('other-c','p','mail','api_key','active','brand-b','brand'); INSERT INTO sync_jobs(id,project_id,connection_id,operation,status,run_after,leased_until,attempts,last_error,dedup_key,input) VALUES ('pending-run','p','c','messages.list','pending',now(),NULL,1,'','pending-run','{}'),('backoff-run','p','c','messages.list','pending',now()+interval '1 hour',NULL,2,'','backoff-run','{}'),('running-run','p','c','messages.list','running',now(),now()+interval '1 hour',3,'','running-run','{}'),('expired-run','p','c','messages.list','running',now(),now()-interval '1 second',4,'','expired-run','{}'),('failed-run','p','c','messages.list','failed',now(),NULL,10,'provider timeout','failed-run','{}'),('cancelled-run','p','c','messages.list','cancelled',now(),NULL,2,'cancelled by operator','cancelled-run','{}'),('success-run','p','c','messages.list','succeeded',now(),NULL,1,'','success-run','{}'),('other-run','p','other-c','messages.list','failed',now(),NULL,1,'secret','other-run','{}'); INSERT INTO sync_job_checkpoints(job_id,cursor) VALUES('pending-run','cursor-1'); INSERT INTO usage_events(id,project_id,connection_id,connector,action,kind,occurred_at,external_account_id,quantity) VALUES('u1','p','c','slack','messages.list','synced_record',now()-interval '1 hour','brand-a',5),('u2','p','other-c','mail','messages.list','synced_record',now()-interval '1 hour','brand-b',99)",
        )
        .unwrap();
    // Capture one database timestamp so the fixture has deterministic rows on
    // either side of the exact 24-hour window and its future upper bound.
    let captured_at: std::time::SystemTime = client
        .query_one("SELECT clock_timestamp()", &[])
        .unwrap()
        .get(0);
    let past = captured_at - std::time::Duration::from_secs(25 * 60 * 60);
    let in_window = captured_at - std::time::Duration::from_secs(60 * 60);
    let future = captured_at + std::time::Duration::from_secs(60 * 60);
    for (id, occurred_at, quantity) in [
        ("u-past", past, 11_i64),
        ("u-window", in_window, 7_i64),
        ("u-future", future, 13_i64),
    ] {
        client
            .execute(
                "INSERT INTO usage_events(id,project_id,connection_id,connector,action,kind,occurred_at,external_account_id,quantity) VALUES($1,'p','c','slack','messages.list','synced_record',$2,'brand-a',$3)",
                &[&id, &occurred_at, &quantity],
            )
            .unwrap();
    }
    let identity = Identity {
        project_id: "p".into(),
        account_id: "brand-a".into(),
        admin_scope: false,
    };
    let value = list_runs(
        &mut client,
        &identity,
        &RunQuery::parse(&url::Url::parse("http://x/?limit=20").unwrap()).unwrap(),
    )
    .unwrap();
    assert_eq!(value["runs"].as_array().unwrap().len(), 7);
    assert_eq!(value["deadRuns"], 2);
    assert_eq!(value["records24h"], 12);
    // Health counts are an aggregate over the scoped queue, not a count of
    // rows returned on this page.  Expired leases use the same captured
    // status boundary as the row projection: two pending, one actively
    // leased running, one scheduled backoff, and two terminal dead runs.
    assert_eq!(value["pendingRuns"], 2);
    assert_eq!(value["runningRuns"], 1);
    assert_eq!(value["backingoffRuns"], 1);
    assert_eq!(value["workerHeartbeatUnavailable"], true);
    assert_eq!(value["operatorControlsUnavailable"], true);
    let rows = value["runs"].as_array().unwrap();
    let find = |id: &str| rows.iter().find(|row| row["id"] == id).unwrap();
    assert!(rows.iter().all(|row| {
        !row["runNowAllowed"].as_bool().unwrap_or(true)
            && !row["resetAllowed"].as_bool().unwrap_or(true)
            && !row["cancelAllowed"].as_bool().unwrap_or(true)
    }));
    assert_eq!(find("running-run")["health"], "running");
    assert_eq!(find("running-run")["cancelEligible"], true);
    assert_eq!(find("backoff-run")["health"], "backingoff");
    assert_eq!(find("backoff-run")["runNowEligible"], true);
    assert_eq!(find("expired-run")["health"], "pending");
    assert_eq!(find("expired-run")["resetEligible"], true);
    assert_eq!(find("failed-run")["health"], "dead");
    assert_eq!(find("failed-run")["resetEligible"], true);
    assert_eq!(find("failed-run")["lastError"], "provider timeout");
    assert_eq!(find("pending-run")["currentCursor"], "cursor-1");
    assert_eq!(find("pending-run")["attemptsRemaining"], 9);
    assert!(find("pending-run").get("input").is_none());
    assert!(find("pending-run").get("workerId").is_none());
    assert!(rows.iter().all(|row| row["id"] != "other-run"));
    let dead_runs = dead_runs_projection(&mut client, &identity).unwrap();
    assert_eq!(dead_runs.len(), 2);
    assert!(dead_runs.iter().all(|row| {
        row["kind"] == "dead_run"
            && row["state"] == "dead"
            && row["href"] == "/app/runs?status=dead"
            && row.get("runId").is_some()
    }));
    assert!(dead_runs
        .iter()
        .any(|row| row["body"].as_str().unwrap().contains("provider timeout")));

    // Pagination must not change the aggregate health strip.
    let paged = list_runs(
        &mut client,
        &identity,
        &RunQuery::parse(&url::Url::parse("http://x/?limit=1").unwrap()).unwrap(),
    )
    .unwrap();
    assert_eq!(paged["runs"].as_array().unwrap().len(), 1);
    assert_eq!(paged["pagination"]["hasMore"], true);
    for (field, expected) in [
        ("pendingRuns", 2),
        ("runningRuns", 1),
        ("backingoffRuns", 1),
        ("deadRuns", 2),
    ] {
        assert_eq!(paged[field], expected, "pagination changed {field}");
    }

    // Connector, tool, and account filters all constrain the same aggregate
    // scope as the row list.  The account-less identity permits exercising a
    // project-level account filter without widening the production boundary.
    let project_identity = Identity {
        account_id: String::new(),
        ..identity.clone()
    };
    let scoped = list_runs(
        &mut client,
        &project_identity,
        &RunQuery::parse(
            &url::Url::parse(
                "http://x/?limit=1&connector=slack&tool=messages.list&accountId=brand-a",
            )
            .unwrap(),
        )
        .unwrap(),
    )
    .unwrap();
    assert_eq!(scoped["runs"].as_array().unwrap().len(), 1);
    assert_eq!(scoped["pendingRuns"], 2);
    assert_eq!(scoped["runningRuns"], 1);
    assert_eq!(scoped["backingoffRuns"], 1);
    assert_eq!(scoped["deadRuns"], 2);

    let connector_scoped = list_runs(
        &mut client,
        &project_identity,
        &RunQuery::parse(&url::Url::parse("http://x/?connector=mail").unwrap()).unwrap(),
    )
    .unwrap();
    assert_eq!(connector_scoped["runs"].as_array().unwrap().len(), 1);
    assert_eq!(connector_scoped["deadRuns"], 1);
    assert_eq!(connector_scoped["records24h"], 99);
    assert_eq!(connector_scoped["pendingRuns"], 0);
    assert_eq!(connector_scoped["runningRuns"], 0);
    assert_eq!(connector_scoped["backingoffRuns"], 0);

    let account_scoped = list_runs(
        &mut client,
        &project_identity,
        &RunQuery::parse(&url::Url::parse("http://x/?accountId=brand-b").unwrap()).unwrap(),
    )
    .unwrap();
    assert_eq!(account_scoped["runs"].as_array().unwrap().len(), 1);
    assert_eq!(account_scoped["deadRuns"], 1);
    assert_eq!(account_scoped["records24h"], 99);

    let tool_scoped = list_runs(
        &mut client,
        &project_identity,
        &RunQuery::parse(&url::Url::parse("http://x/?tool=missing").unwrap()).unwrap(),
    )
    .unwrap();
    assert!(tool_scoped["runs"].as_array().unwrap().is_empty());
    assert_eq!(tool_scoped["pendingRuns"], 0);
    assert_eq!(tool_scoped["runningRuns"], 0);
    assert_eq!(tool_scoped["backingoffRuns"], 0);
    assert_eq!(tool_scoped["deadRuns"], 0);
    assert_eq!(tool_scoped["records24h"], 0);

    // The status filter is applied to the derived health value (so an
    // expired running lease is pending, not running), while records/24h
    // remains the scoped storage total rather than a queue-row count.
    let running_scoped = list_runs(
        &mut client,
        &identity,
        &RunQuery::parse(&url::Url::parse("http://x/?status=running").unwrap()).unwrap(),
    )
    .unwrap();
    assert_eq!(running_scoped["runs"].as_array().unwrap().len(), 1);
    assert_eq!(running_scoped["pendingRuns"], 0);
    assert_eq!(running_scoped["runningRuns"], 1);
    assert_eq!(running_scoped["backingoffRuns"], 0);
    assert_eq!(running_scoped["deadRuns"], 0);
    assert_eq!(running_scoped["records24h"], 12);
    let other_account =
        RunQuery::parse(&url::Url::parse("http://x/?accountId=brand-b").unwrap()).unwrap();
    assert_eq!(
        list_runs(&mut client, &identity, &other_account)
            .unwrap_err()
            .code,
        "FORBIDDEN"
    );
    client
        .batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
        .unwrap();
}

#[test]
#[ignore = "requires isolated APPCALL_ENGINE_POSTGRES_URL"]
fn postgres_history_is_owned_bounded_and_replay_input_is_redacted() {
    use appcall_api::{data_routes::*, Identity};
    let url = std::env::var("APPCALL_ENGINE_POSTGRES_URL").unwrap();
    let mut client = postgres::Client::connect(&url, postgres::NoTls).unwrap();
    let schema = format!("history_test_{}", uuid::Uuid::new_v4().simple());
    client
        .batch_execute(&format!(
            "CREATE SCHEMA {schema}; SET search_path TO {schema}"
        ))
        .unwrap();
    for sql in [
        include_str!("../../../migrations/202605140001_init.sql"),
        include_str!("../../../migrations/202609070005_action_history_ownership.sql"),
        include_str!("../../../migrations/202605140003_action_log_request_id.sql"),
        include_str!("../../../migrations/202605290001_connections_ownership.sql"),
    ] {
        client.batch_execute(sql).unwrap()
    }
    client.batch_execute("INSERT INTO projects(id,name) VALUES('p','p'),('q','q'); INSERT INTO connections(id,project_id,connector,auth_type,status,external_account_id,credential_owner) VALUES('a','p','slack','api_key','active','brand-a','brand'),('b','p','slack','api_key','active','brand-b','brand'),('q','q','slack','api_key','active','brand-a','brand'); INSERT INTO action_logs(id,project_id,connection_id,connector,action,status,request_id,created_at) VALUES('a1','p','a','slack','send','succeeded','ra1','2026-09-07T10:00:00Z'),('a2','p','a','slack','send','failed','ra2','2026-09-07T10:00:00Z'),('b1','p','b','slack','send','succeeded','rb','2026-09-07T10:00:00Z'),('q1','q','q','slack','send','succeeded','rq','2026-09-07T10:00:00Z')").unwrap();
    client.batch_execute("UPDATE action_logs l SET external_account_id=c.external_account_id FROM connections c WHERE c.id=l.connection_id").unwrap();
    let identity = Identity {
        project_id: "p".into(),
        account_id: "brand-a".into(),
        admin_scope: false,
    };
    let first = list(
        &mut client,
        &identity,
        LogKind::Action,
        &LogQuery::parse(&url::Url::parse("http://x/?limit=1").unwrap()).unwrap(),
    )
    .unwrap();
    assert_eq!(first["logs"][0]["id"], "a2");
    assert_eq!(first["pagination"]["hasMore"], true);
    let second = list(
        &mut client,
        &identity,
        LogKind::Action,
        &LogQuery::parse(
            &url::Url::parse(&format!(
                "http://x/?limit=1&cursor={}",
                first["pagination"]["nextCursor"].as_str().unwrap()
            ))
            .unwrap(),
        )
        .unwrap(),
    )
    .unwrap();
    assert_eq!(second["logs"][0]["id"], "a1");
    assert_eq!(second["pagination"]["hasMore"], false);
    client.batch_execute("INSERT INTO action_logs(id,project_id,connection_id,connector,action,status,request_id,created_at,external_account_id) VALUES('old','p','a','slack','send','failed','old','2026-09-07T09:59:59Z','brand-a'),('end','p','a','slack','send','failed','end','2026-09-07T11:00:00Z','brand-a'); UPDATE action_logs SET error_code='ACTION_TIMEOUT' WHERE id='a2'").unwrap();
    let bounds = "createdFrom=2026-09-07T15:30:00%2B05:30&createdBefore=2026-09-07T11:00:00Z";
    let mut bounded = |query: &str| {
        list(
            &mut client,
            &identity,
            LogKind::Action,
            &LogQuery::parse(&url::Url::parse(&format!("http://x/?{query}")).unwrap()).unwrap(),
        )
        .unwrap()
    };
    let page = bounded(&format!("{bounds}&limit=1"));
    assert_eq!(page["logs"][0]["id"], "a2");
    assert_eq!(page["pagination"]["hasMore"], true);
    let next = bounded(&format!(
        "{bounds}&limit=1&cursor={}",
        page["pagination"]["nextCursor"].as_str().unwrap()
    ));
    assert_eq!(next["logs"][0]["id"], "a1");
    assert_eq!(next["pagination"]["hasMore"], false);
    let filtered = bounded(&format!("{bounds}&connectionId=a&connector=slack&action=send&requestId=ra2&status=failed&errorCode=ACTION_TIMEOUT"));
    assert_eq!(filtered["logs"].as_array().unwrap().len(), 1);
    assert_eq!(filtered["logs"][0]["id"], "a2");
    for filter in [
        "connectionId=missing",
        "connector=missing",
        "action=missing",
        "requestId=missing",
        "errorCode=ACTION_FAILED",
    ] {
        assert_eq!(bounded(&format!("{bounds}&{filter}"))["logs"], json!([]));
    }
    assert_eq!(
        bounded("createdBefore=2026-09-07T10:00:00Z")["logs"][0]["id"],
        "old"
    );
    assert_eq!(
        bounded("createdFrom=2026-09-07T11:00:00Z")["logs"][0]["id"],
        "end"
    );
    let after_nano = bounded("createdFrom=2026-09-07T10:00:00.0000001Z");
    assert_eq!(after_nano["logs"].as_array().unwrap().len(), 1);
    assert_eq!(after_nano["logs"][0]["id"], "end");
    assert_eq!(
        bounded("createdBefore=2026-09-07T10:00:00.0000001Z")["logs"]
            .as_array()
            .unwrap()
            .len(),
        3
    );
    assert_eq!(
        bounded("createdFrom=2026-09-07T09:59:59.9999999Z")["logs"]
            .as_array()
            .unwrap()
            .len(),
        3
    );
    let before_rollover = bounded("createdBefore=2026-09-07T09:59:59.9999999Z");
    assert_eq!(before_rollover["logs"].as_array().unwrap().len(), 1);
    assert_eq!(before_rollover["logs"][0]["id"], "old");
    assert_eq!(
        bounded(
            "createdFrom=2026-09-07T10:00:00.0000001Z&createdBefore=2026-09-07T10:00:00.0000002Z"
        )["logs"],
        json!([])
    );
    for request in ["rb", "rq"] {
        assert_eq!(
            detail(&mut client, &identity, LogKind::Action, request, true)
                .unwrap_err()
                .code,
            "ACTION_LOG_NOT_FOUND"
        )
    }
    assert_eq!(
        trace(&mut client, &identity, "ra1").unwrap()["replayUnavailableReason"],
        "no_replay_log"
    );
    client.batch_execute("INSERT INTO connections(id,project_id,connector,auth_type,status,credential_owner) VALUES('platform','p','slack','api_key','active','platform');INSERT INTO action_logs(id,project_id,connection_id,connector,action,status,request_id,external_account_id) VALUES('pa','p','platform','slack','send','succeeded','rpa','brand-a'),('pb','p','platform','slack','send','succeeded','rpb','brand-b'),('legacy','p','platform','slack','send','succeeded','legacy','')").unwrap();
    let platform = list(
        &mut client,
        &identity,
        LogKind::Action,
        &LogQuery::parse(&url::Url::parse("http://x/?connectionId=platform").unwrap()).unwrap(),
    )
    .unwrap();
    assert_eq!(platform["logs"].as_array().unwrap().len(), 1);
    assert_eq!(platform["logs"][0]["requestId"], "rpa");
    assert!(detail(&mut client, &identity, LogKind::Action, "legacy", true).is_err());
    let req = appcall_actions::ExecuteRequest {
        project_id: "p".into(),
        connection_id: "a".into(),
        external_account_id: "brand-a".into(),
        action: "send".into(),
        input: json!({"password":"secret","text":"value secret"}),
        admin_scope: false,
        idempotency_key: "original".into(),
        caller_credential: "secret".into(),
    };
    let id = record(&mut client, &req, "slack", "ra1", &["secret"]).unwrap();
    let (replay_id, replay) = replay_request(&mut client, &identity, &id, false).unwrap();
    assert_eq!(replay_id, id);
    assert_eq!(replay.external_account_id, "brand-a");
    assert!(replay.idempotency_key.is_empty());
    assert!(replay.caller_credential.is_empty());
    assert!(!replay.input.to_string().contains("secret"));
    assert_eq!(
        trace(&mut client, &identity, "ra1").unwrap()["replayAvailable"],
        true
    );
    let other = Identity {
        account_id: "brand-b".into(),
        ..identity.clone()
    };
    assert!(replay_request(&mut client, &other, &id, false).is_err());
    client
        .batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
        .unwrap();
}
#[test]
fn normalized_posts_reject_invalid_body_and_provider_output() {
    use appcall_api::{data_routes::*, Identity};
    let identity = Identity {
        project_id: "p".into(),
        account_id: "brand".into(),
        admin_scope: false,
    };
    for body in [
        r#"{"connectionId":"c","input":[],"admin":true}"#,
        r#"{"connectionId":"","input":{}}"#,
        r#"{"connectionId":"c","input":{}} {}"#,
    ] {
        assert!(unified_request(&identity, body.as_bytes(), &[]).is_err())
    }
    let request = unified_request(
        &identity,
        br#"{"connectionId":"c","input":{"text":"hello"}}"#,
        &[
            ("Idempotency-Key".into(), "key".into()),
            ("X-Connector-Token".into(), "Bearer token".into()),
        ],
    )
    .unwrap();
    assert_eq!(request.action, "normalized.post.create");
    assert_eq!(request.external_account_id, "brand");
    assert_eq!(request.caller_credential, "token");
    let mut result = appcall_actions::ExecuteResult {
        request_id: "r".into(),
        output: json!({}),
        replay_log_id: String::new(),
        usage_warning: false,
        usage: Default::default(),
    };
    assert!(unified_response(result.clone()).is_err());
    result.output = json!({"id":"p","provider":"x","providerPostId":"1","text":"hello","modelVersion":"2026-09-05","raw":{}});
    let response = unified_response(result).unwrap();
    assert_eq!(response.body["success"], true);
    assert_eq!(response.body["model"], "post");
    assert_eq!(response.body["data"][0]["text"], "hello");
}
#[test]
#[ignore = "requires isolated APPCALL_ENGINE_POSTGRES_URL"]
fn usage_uses_plan_rollups_and_validates_public_queries() {
    use appcall_api::{data_routes::*, Identity};
    let url = std::env::var("APPCALL_ENGINE_POSTGRES_URL").unwrap();
    let mut client = postgres::Client::connect(&url, postgres::NoTls).unwrap();
    let schema = format!("usage_test_{}", uuid::Uuid::new_v4().simple());
    client
        .batch_execute(&format!(
            "CREATE SCHEMA {schema}; SET search_path TO {schema}"
        ))
        .unwrap();
    for sql in [
        include_str!("../../../migrations/202605140001_init.sql"),
        include_str!("../../../migrations/202609070005_action_history_ownership.sql"),
        include_str!("../../../migrations/202605290003_usage_brand_dim.sql"),
        include_str!("../../../migrations/202606100002_project_plans.sql"),
        include_str!("../../../migrations/202609100001_action_usage_reservations.sql"),
    ] {
        client.batch_execute(sql).unwrap()
    }
    client.batch_execute("INSERT INTO projects(id,name) VALUES('p','p'),('q','q');INSERT INTO project_plans(project_id,plan_key,status,overrides) VALUES('p','starter','active','{\"action_calls_hard\":10,\"action_calls_soft\":5}');INSERT INTO usage_monthly_rollups(project_id,external_account_id,month,kind,quantity) VALUES('p','a',to_char(now() AT TIME ZONE 'UTC','YYYY-MM'),'action_call',4),('p','b',to_char(now() AT TIME ZONE 'UTC','YYYY-MM'),'action_call',3),('q','a',to_char(now() AT TIME ZONE 'UTC','YYYY-MM'),'action_call',100)").unwrap();
    let identity = Identity {
        project_id: "p".into(),
        account_id: "a".into(),
        admin_scope: false,
    };
    let defaults = UsageDefaults::default();
    let mut get = |uri: &str| {
        usage_read(
            &mut client,
            &identity,
            &url::Url::parse(&format!("http://x{uri}")).unwrap(),
            &defaults,
        )
    };
    assert_eq!(
        get("/v1/usage/monthly").unwrap().unwrap().body["actionCalls"],
        7
    );
    let decision = get("/v1/usage/action-calls/decision?quantity=4")
        .unwrap()
        .unwrap()
        .body;
    assert_eq!(decision["allowed"], false);
    assert_eq!(decision["reason"], "USAGE_LIMIT_EXCEEDED");
    let warning = get("/v1/usage/action-calls/decision")
        .unwrap()
        .unwrap()
        .body;
    assert_eq!(warning["allowed"], true);
    assert_eq!(warning["warning"], true);
    assert_eq!(
        get("/v1/entitlements").unwrap().unwrap().body["limits"]["unipileMaxAccounts"],
        1
    );
    for uri in [
        "/v1/usage/monthly?month=2026-13",
        "/v1/usage/monthly?month=2026-1",
        "/v1/usage/action-calls/decision?quantity=0",
        "/v1/usage/action-calls/decision?quantity=1001",
    ] {
        assert!(get(uri).is_err())
    }
    client
        .batch_execute("UPDATE project_plans SET status='past_due' WHERE project_id='p'")
        .unwrap();
    let response = usage_read(
        &mut client,
        &identity,
        &url::Url::parse("http://x/v1/entitlements").unwrap(),
        &defaults,
    )
    .unwrap()
    .unwrap();
    assert_eq!(response.body["plan"]["key"], "starter");
    assert_eq!(response.body["limits"]["actionCallsHard"], 300);
    assert_eq!(response.body["limits"]["unipileMaxAccounts"], 0);
    client
        .batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
        .unwrap();
}

#[test]
#[ignore = "requires isolated APPCALL_ENGINE_POSTGRES_URL"]
fn usage_decision_denies_when_dispatched_reservation_consumes_final_slot() {
    use appcall_actions::PolicyGate;
    use appcall_api::{data_routes::*, Identity};
    let url = std::env::var("APPCALL_ENGINE_POSTGRES_URL")
        .expect("APPCALL_ENGINE_POSTGRES_URL is required for PostgreSQL usage tests");
    let mut client = postgres::Client::connect(&url, postgres::NoTls).unwrap();
    let schema = format!(
        "usage_decision_reservation_{}",
        uuid::Uuid::new_v4().simple()
    );
    client
        .batch_execute(&format!(
            "CREATE SCHEMA {schema}; SET search_path TO {schema}"
        ))
        .unwrap();
    for sql in [
        include_str!("../../../migrations/202605140001_init.sql"),
        include_str!("../../../migrations/202605290003_usage_brand_dim.sql"),
        include_str!("../../../migrations/202606100002_project_plans.sql"),
        include_str!("../../../migrations/202609100001_action_usage_reservations.sql"),
    ] {
        client.batch_execute(sql).unwrap();
    }
    client
        .batch_execute(
            "INSERT INTO projects(id,name) VALUES('p','p');
             INSERT INTO project_plans(project_id,plan_key,status,overrides)
             VALUES('p','starter','active','{\"action_calls_hard\":1,\"action_calls_soft\":1}');
             INSERT INTO action_usage_reservations(
                 id,project_id,month,connection_id,connector,action,state,expires_at,dispatched_at
             ) VALUES(
                 'reservation-1','p',to_char(now() AT TIME ZONE 'UTC','YYYY-MM'),
                 'c','test','send','dispatched',now()+interval '1 hour',now()
             );",
        )
        .unwrap();
    let identity = Identity {
        project_id: "p".into(),
        account_id: "a".into(),
        admin_scope: false,
    };
    let response = usage_read(
        &mut client,
        &identity,
        &url::Url::parse("http://x/v1/usage/action-calls/decision?quantity=1").unwrap(),
        &UsageDefaults::default(),
    )
    .unwrap()
    .unwrap();
    assert_eq!(response.body["allowed"], false);
    assert_eq!(response.body["reason"], "USAGE_LIMIT_EXCEEDED");
    assert_eq!(response.body["current"], 0);
    assert_eq!(response.body["projected"], 2);
    assert_eq!(
        client
            .query_one(
                "SELECT count(*)::bigint
                   FROM action_usage_reservations
                  WHERE project_id=$1
                    AND month=to_char(now() AT TIME ZONE 'UTC','YYYY-MM')",
                &[&identity.project_id],
            )
            .unwrap()
            .get::<_, i64>(0),
        1,
        "advisory usage decisions must not create reservations"
    );

    let mut admission_client = postgres::Client::connect(&url, postgres::NoTls).unwrap();
    admission_client
        .batch_execute(&format!("SET search_path TO {schema}"))
        .unwrap();
    let policy = appcall_actions::PgPolicy::new(
        appcall_actions::PgActionRepository::new(admission_client),
        appcall_actions::PolicyConfig::default(),
    )
    .unwrap();
    let request = appcall_actions::ExecuteRequest {
        project_id: "p".into(),
        connection_id: "c".into(),
        external_account_id: "".into(),
        admin_scope: false,
        action: "send".into(),
        idempotency_key: "admission-1".into(),
        input: json!({}),
        caller_credential: String::new(),
    };
    let connection = appcall_actions::Connection {
        id: "c".into(),
        project_id: "p".into(),
        external_account_id: String::new(),
        connector: "test".into(),
        status: "active".into(),
        auth_type: "none".into(),
        secret_ref_id: None,
    };
    let operation = appcall_actions::Operation {
        read_only: true,
        timeout_ms: 1_000,
        max_input_bytes: 1_024,
        max_response_bytes: 1_024,
        credential_fields: vec![],
    };
    let admission_error = match tokio::runtime::Runtime::new()
        .unwrap()
        .block_on(policy.reserve(&request, &connection, &operation, &json!({})))
    {
        Ok(_) => panic!("authoritative admission unexpectedly allowed the reserved slot"),
        Err(error) => error,
    };
    assert_eq!(admission_error.code, "USAGE_LIMIT_EXCEEDED");
    let admission_usage = admission_error.usage.unwrap();
    assert_eq!(
        admission_usage,
        appcall_actions::UsageSnapshot {
            month: response.body["month"].as_str().unwrap().to_owned(),
            current: 0,
            projected: 2,
            soft_limit: 1,
            hard_limit: 1,
        }
    );
    assert_eq!(response.body["current"], admission_usage.current);
    assert_eq!(response.body["projected"], admission_usage.projected);
    client
        .batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
        .unwrap();
}

#[test]
#[ignore = "requires isolated APPCALL_ENGINE_POSTGRES_URL"]
fn usage_decision_and_admission_share_postgres_utc_month() {
    use appcall_actions::PolicyGate;
    use appcall_api::{data_routes::*, Identity};
    let url = std::env::var("APPCALL_ENGINE_POSTGRES_URL")
        .expect("APPCALL_ENGINE_POSTGRES_URL is required for PostgreSQL usage tests");
    let mut client = postgres::Client::connect(&url, postgres::NoTls).unwrap();
    let schema = format!("usage_decision_utc_month_{}", uuid::Uuid::new_v4().simple());
    client
        .batch_execute(&format!(
            "CREATE SCHEMA {schema}; SET search_path TO {schema}"
        ))
        .unwrap();
    for sql in [
        include_str!("../../../migrations/202605140001_init.sql"),
        include_str!("../../../migrations/202605290003_usage_brand_dim.sql"),
        include_str!("../../../migrations/202606100002_project_plans.sql"),
        include_str!("../../../migrations/202609100001_action_usage_reservations.sql"),
    ] {
        client.batch_execute(sql).unwrap();
    }
    let database_month: String = client
        .query_one("SELECT to_char(now() AT TIME ZONE 'UTC','YYYY-MM')", &[])
        .unwrap()
        .get(0);
    client
        .batch_execute(&format!(
            "INSERT INTO projects(id,name) VALUES('p','p');
             INSERT INTO project_plans(project_id,plan_key,status,overrides)
             VALUES('p','starter','active','{{\"action_calls_hard\":1,\"action_calls_soft\":1}}');
             INSERT INTO action_usage_reservations(
                 id,project_id,month,connection_id,connector,action,state,expires_at,dispatched_at
             ) VALUES(
                 'reservation-rollover','p','{database_month}','c','test','send','dispatched',
                 now() + interval '1 hour',
                 now()
             );"
        ))
        .unwrap();
    let identity = Identity {
        project_id: "p".into(),
        account_id: "a".into(),
        admin_scope: false,
    };
    let response = usage_read(
        &mut client,
        &identity,
        &url::Url::parse("http://x/v1/usage/action-calls/decision?quantity=1").unwrap(),
        &UsageDefaults::default(),
    )
    .unwrap()
    .unwrap();
    assert_eq!(response.body["month"], database_month);
    assert_eq!(response.body["allowed"], false);
    assert_eq!(response.body["reason"], "USAGE_LIMIT_EXCEEDED");
    assert_eq!(response.body["projected"], 2);

    let mut admission_client = postgres::Client::connect(&url, postgres::NoTls).unwrap();
    admission_client
        .batch_execute(&format!("SET search_path TO {schema}"))
        .unwrap();
    let policy = appcall_actions::PgPolicy::new(
        appcall_actions::PgActionRepository::new(admission_client),
        appcall_actions::PolicyConfig::default(),
    )
    .unwrap();
    let request = appcall_actions::ExecuteRequest {
        project_id: "p".into(),
        connection_id: "c".into(),
        external_account_id: String::new(),
        admin_scope: false,
        action: "send".into(),
        idempotency_key: "rollover-admission".into(),
        input: json!({}),
        caller_credential: String::new(),
    };
    let connection = appcall_actions::Connection {
        id: "c".into(),
        project_id: "p".into(),
        external_account_id: String::new(),
        connector: "test".into(),
        status: "active".into(),
        auth_type: "none".into(),
        secret_ref_id: None,
    };
    let operation = appcall_actions::Operation {
        read_only: true,
        timeout_ms: 1_000,
        max_input_bytes: 1_024,
        max_response_bytes: 1_024,
        credential_fields: vec![],
    };
    let admission_error = match tokio::runtime::Runtime::new()
        .unwrap()
        .block_on(policy.reserve(&request, &connection, &operation, &json!({})))
    {
        Ok(_) => {
            panic!("authoritative admission unexpectedly allowed with an active reservation")
        }
        Err(error) => error,
    };
    assert_eq!(admission_error.code, "USAGE_LIMIT_EXCEEDED");
    let admission_usage = admission_error.usage.unwrap();
    assert_eq!(admission_usage.month, database_month);
    assert_eq!(admission_usage.projected, 2);
    assert_eq!(response.body["month"], admission_usage.month);
    assert_eq!(response.body["projected"], admission_usage.projected);
    client
        .batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
        .unwrap();
}

#[test]
fn sse_uses_durable_cursor_and_go_account_projection() {
    use appcall_api::data_routes::*;
    let frame=sse_frame(&json!({"id":"evt\ninject", "streamPosition":12,"projectId":"private","connectionId":"c","externalAccountId":"brand","connector":"slack","operation":"sync","payload":{"text":"x\ny"},"createdAt":"2026-09-07T12:00:00Z"})).unwrap();
    assert_eq!(frame.lines().count(), 4);
    assert!(frame.contains("\"accountId\":\"brand\""));
    assert!(!frame.contains("projectId"));
    assert!(!frame.contains("streamPosition"));
    assert_eq!(
        sse_cursor(
            &url::Url::parse("http://x/v1/events?since=query").unwrap(),
            &[("Last-Event-ID".into(), "header".into())]
        ),
        "header"
    );
}
#[test]
fn sse_filters_use_the_first_bounded_query_values() {
    use appcall_api::data_routes::*;
    let filters = sse_filters(
        &url::Url::parse(
            "http://x/v1/events?connector=slack&connector=ignored&connectionId=c%26d&operation=messages.list",
        )
        .unwrap(),
    )
    .unwrap();
    assert_eq!(filters.connector, "slack");
    assert_eq!(filters.connection_id, "c&d");
    assert_eq!(filters.operation, "messages.list");
    assert_eq!(
        sse_cursor(
            &url::Url::parse("http://x/v1/events?since=query").unwrap(),
            &[("Last-Event-ID".into(), String::new())]
        ),
        ""
    );
    assert_eq!(
        sse_filters(&url::Url::parse("http://x/v1/events?operation=%0A").unwrap())
            .unwrap_err()
            .code,
        "INVALID_REQUEST"
    );
}
#[test]
#[ignore = "requires isolated APPCALL_ENGINE_POSTGRES_URL"]
fn webhook_replay_preserves_scope_and_rolls_back_failed_scheduling() {
    use appcall_api::{data_routes::*, Identity};
    struct Sink(bool);
    impl appcall_events::DispatchSink for Sink {
        fn schedule(
            &mut self,
            tx: &mut postgres::Transaction<'_>,
            job: &appcall_events::SyncJob,
        ) -> appcall_events::Result<()> {
            tx.execute(
                "INSERT INTO scheduled(project_id,input) VALUES($1,$2::text::jsonb)",
                &[&job.project_id, &job.input.to_string()],
            )
            .map_err(|_| appcall_events::Error::Storage)?;
            if self.0 {
                Err(appcall_events::Error::Dispatch)
            } else {
                Ok(())
            }
        }
    }
    let url = std::env::var("APPCALL_ENGINE_POSTGRES_URL").unwrap();
    let mut client = postgres::Client::connect(&url, postgres::NoTls).unwrap();
    let schema = format!("webhook_route_test_{}", uuid::Uuid::new_v4().simple());
    client
        .batch_execute(&format!(
            "CREATE SCHEMA {schema}; SET search_path TO {schema}"
        ))
        .unwrap();
    for sql in [
        include_str!("../../../migrations/202605140001_init.sql"),
        include_str!("../../../migrations/202609070005_action_history_ownership.sql"),
        include_str!("../../../migrations/202605290001_connections_ownership.sql"),
        include_str!("../../../migrations/202609070001_event_outbox.sql"),
        include_str!("../../../migrations/202609110001_event_connection_dedup.sql"),
    ] {
        client.batch_execute(sql).unwrap()
    }
    client.batch_execute("INSERT INTO projects(id,name) VALUES('p','p');INSERT INTO connections(id,project_id,connector,auth_type,status,external_account_id,credential_owner) VALUES('a','p','slack','api_key','active','brand-a','brand');INSERT INTO webhook_events(id,project_id,connection_id,connector,operation,payload,external_account_id) VALUES('e','p','a','slack','messages.list','{\"channel\":\"C123\",\"token\":\"redacted\"}','brand-a');CREATE TABLE scheduled(project_id text,input jsonb)").unwrap();
    let mut principal = appcall_auth::Principal::project("p").unwrap();
    principal.brand_id = Some("brand-a".into());
    assert!(webhook_replay(&mut client, &principal, "e", &mut Sink(true)).is_err());
    assert_eq!(
        client
            .query_one("SELECT count(*) FROM scheduled", &[])
            .unwrap()
            .get::<_, i64>(0),
        0
    );
    let response = webhook_replay(&mut client, &principal, "e", &mut Sink(false)).unwrap();
    assert_eq!(response.body, json!({"eventId":"e","replayed":true}));
    assert_eq!(
        client
            .query_one("SELECT input::text FROM scheduled", &[])
            .unwrap()
            .get::<_, String>(0),
        "{\"channelId\": \"C123\"}"
    );
    principal.brand_id = Some("brand-b".into());
    assert_eq!(
        webhook_replay(&mut client, &principal, "e", &mut Sink(false))
            .unwrap_err()
            .code,
        "WEBHOOK_EVENT_NOT_FOUND"
    );
    principal.brand_id = Some("brand-a".into());
    principal.scopes = appcall_auth::Grant::Only(["events:read".into()].into_iter().collect());
    assert_eq!(
        webhook_replay(&mut client, &principal, "e", &mut Sink(false))
            .unwrap_err()
            .code,
        "FORBIDDEN"
    );
    let page = webhook_read(
        &mut client,
        &principal,
        &url::Url::parse("http://x/v1/webhook-events").unwrap(),
    )
    .unwrap()
    .unwrap();
    assert_eq!(page.body["events"].as_array().unwrap().len(), 1);
    assert!(page.body["events"][0].get("externalAccountId").is_none());
    assert!(page.body["events"][0].get("projectId").is_none());
    let stream_cursor = page.body["streamCursor"].as_str().unwrap().to_owned();
    let generic = list(
        &mut client,
        &Identity {
            project_id: "p".into(),
            account_id: "brand-a".into(),
            admin_scope: false,
        },
        LogKind::Webhook,
        &LogQuery::parse_for(
            &url::Url::parse("http://x/v1/webhook-events?connector=slack").unwrap(),
            LogKind::Webhook,
        )
        .unwrap(),
    )
    .unwrap();
    assert!(generic["streamCursor"]
        .as_str()
        .is_some_and(|cursor| !cursor.is_empty()));
    client
        .batch_execute("INSERT INTO webhook_events(id,project_id,connection_id,connector,operation,payload,external_account_id) VALUES('e2','p','a','slack','messages.list','{}','brand-a'),('e3','p','a','slack','messages.send','{}','brand-a')")
        .unwrap();
    let streamed = appcall_events::PgEvents::new(&mut client)
        .stream(
            &principal,
            &appcall_events::ListRequest {
                cursor: stream_cursor,
                limit: 16,
                connection_id: "a".into(),
                connector: "slack".into(),
                operation: "messages.list".into(),
            },
        )
        .unwrap();
    assert_eq!(
        streamed
            .events
            .iter()
            .map(|event| event.id.as_str())
            .collect::<Vec<_>>(),
        ["e2"]
    );
    client
        .batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
        .unwrap();
}

#[test]
#[ignore = "requires isolated APPCALL_ENGINE_POSTGRES_URL"]
fn webhook_public_ids_and_routes_are_connection_scoped_and_project_owned() {
    use appcall_api::{data_routes::*, Identity};
    struct Sink;
    impl appcall_events::DispatchSink for Sink {
        fn schedule(
            &mut self,
            tx: &mut postgres::Transaction<'_>,
            job: &appcall_events::SyncJob,
        ) -> appcall_events::Result<()> {
            tx.execute(
                "INSERT INTO scheduled(project_id,dedup_key,input) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
                &[&job.project_id, &job.dedup_key, &job.input],
            )
            .map_err(|_| appcall_events::Error::Storage)?;
            Ok(())
        }
    }
    let url = std::env::var("APPCALL_ENGINE_POSTGRES_URL").unwrap();
    let mut client = postgres::Client::connect(&url, postgres::NoTls).unwrap();
    let schema = format!("webhook_public_id_test_{}", uuid::Uuid::new_v4().simple());
    client
        .batch_execute(&format!(
            "CREATE SCHEMA {schema}; SET search_path TO {schema}"
        ))
        .unwrap();
    for sql in [
        include_str!("../../../migrations/202605140001_init.sql"),
        include_str!("../../../migrations/202605290001_connections_ownership.sql"),
        include_str!("../../../migrations/202605290003_usage_brand_dim.sql"),
        include_str!("../../../migrations/202605290004_connections_owner_check.sql"),
        include_str!("../../../migrations/202609070001_event_outbox.sql"),
        include_str!("../../../migrations/202609110001_event_connection_dedup.sql"),
    ] {
        client.batch_execute(sql).unwrap();
    }
    client
        .batch_execute(
            "INSERT INTO projects(id,name) VALUES('p','p'),('q','q'); INSERT INTO connections(id,project_id,connector,auth_type,status,external_account_id,credential_owner) VALUES('a','p','slack','api_key','active','brand-a','brand'),('b','p','slack','api_key','active','brand-b','brand'),('q-c','q','slack','api_key','active','brand-a','brand'); CREATE TABLE scheduled(project_id text,dedup_key text,input jsonb,PRIMARY KEY(project_id,dedup_key))",
        )
        .unwrap();
    let (a, b) = {
        let mut events = appcall_events::PgEvents::new(&mut client);
        let a = events
            .accept(
                &appcall_auth::WebhookClaims {
                    project_id: "p".into(),
                    connection_id: "a".into(),
                    connector: "slack".into(),
                },
                &appcall_events::ParsedWebhook {
                    idempotency_key: "same-provider-key".into(),
                    operation: "messages.list".into(),
                    sanitized: json!({"channel":"C123"}),
                },
            )
            .unwrap();
        let b = events
            .accept(
                &appcall_auth::WebhookClaims {
                    project_id: "p".into(),
                    connection_id: "b".into(),
                    connector: "slack".into(),
                },
                &appcall_events::ParsedWebhook {
                    idempotency_key: "same-provider-key".into(),
                    operation: "messages.list".into(),
                    sanitized: json!({"channel":"C123"}),
                },
            )
            .unwrap();
        (a, b)
    };
    assert_ne!(a.event_id, b.event_id);
    assert!(a.event_id.starts_with("wh_"));
    assert!(b.event_id.starts_with("wh_"));
    assert_ne!(a.event_id, "same-provider-key");
    assert_ne!(b.event_id, "same-provider-key");
    let mut p = appcall_auth::Principal::project("p").unwrap();
    p.brand_id = Some("brand-a".into());
    let page = webhook_read(
        &mut client,
        &appcall_auth::Principal::project("p").unwrap(),
        &url::Url::parse("http://x/v1/webhook-events").unwrap(),
    )
    .unwrap()
    .unwrap();
    let ids = page.body["events"]
        .as_array()
        .unwrap()
        .iter()
        .map(|event| event["id"].as_str().unwrap())
        .collect::<std::collections::BTreeSet<_>>();
    assert_eq!(
        ids,
        [a.event_id.as_str(), b.event_id.as_str()]
            .into_iter()
            .collect()
    );
    let generic = list(
        &mut client,
        &Identity {
            project_id: "p".into(),
            account_id: String::new(),
            admin_scope: false,
        },
        LogKind::Webhook,
        &LogQuery::parse_for(
            &url::Url::parse("http://x/v1/webhook-events").unwrap(),
            LogKind::Webhook,
        )
        .unwrap(),
    )
    .unwrap();
    assert_eq!(generic["events"].as_array().unwrap().len(), 2);
    let detail = webhook_read(
        &mut client,
        &p,
        &url::Url::parse(&format!("http://x/v1/webhook-events/{}", a.event_id)).unwrap(),
    )
    .unwrap()
    .unwrap();
    assert_eq!(detail.body["id"], a.event_id);
    assert_eq!(
        webhook_read(
            &mut client,
            &p,
            &url::Url::parse(&format!("http://x/v1/webhook-events/{}", b.event_id)).unwrap(),
        )
        .unwrap_err()
        .code,
        "WEBHOOK_EVENT_NOT_FOUND"
    );
    let q = appcall_events::PgEvents::new(&mut client)
        .accept(
            &appcall_auth::WebhookClaims {
                project_id: "q".into(),
                connection_id: "q-c".into(),
                connector: "slack".into(),
            },
            &appcall_events::ParsedWebhook {
                idempotency_key: "same-provider-key".into(),
                operation: String::new(),
                sanitized: json!({}),
            },
        )
        .unwrap();
    let q_page = webhook_read(
        &mut client,
        &appcall_auth::Principal::project("q").unwrap(),
        &url::Url::parse("http://x/v1/webhook-events").unwrap(),
    )
    .unwrap()
    .unwrap();
    assert_eq!(q_page.body["events"].as_array().unwrap().len(), 1);
    assert_eq!(q_page.body["events"][0]["id"], q.event_id);

    let mut sink = Sink;
    let a_replay = webhook_replay(&mut client, &p, &a.event_id, &mut sink).unwrap();
    let mut p_b = appcall_auth::Principal::project("p").unwrap();
    p_b.brand_id = Some("brand-b".into());
    let b_replay = webhook_replay(&mut client, &p_b, &b.event_id, &mut sink).unwrap();
    assert_eq!(a_replay.body, json!({"eventId":a.event_id,"replayed":true}));
    assert_eq!(b_replay.body, json!({"eventId":b.event_id,"replayed":true}));
    assert_eq!(
        client
            .query_one("SELECT count(*) FROM scheduled", &[])
            .unwrap()
            .get::<_, i64>(0),
        2
    );
    client
        .batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
        .unwrap();
}
