use appcall_api::data_routes::{sanitize, LogQuery};
use serde_json::json;
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
        "query"
    );
}
#[test]
#[ignore = "requires isolated APPCALL_ENGINE_POSTGRES_URL"]
fn webhook_replay_preserves_scope_and_rolls_back_failed_scheduling() {
    use appcall_api::data_routes::*;
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
    client
        .batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
        .unwrap();
}
