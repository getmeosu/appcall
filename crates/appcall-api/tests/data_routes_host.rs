use appcall_actions::{CredentialResolver, ExecuteRequest, ExecuteResult};
use appcall_api::*;
use appcall_auth::{Principal, StaticApiKey};
use appcall_runner_client::{ClientOptions, RunnerClient};
use appcall_store::{LocalProvider, Store};
use serde_json::{json, Map, Value};
use std::sync::{Arc, Mutex};
struct ExecutorSpy(Arc<Mutex<Vec<ExecuteRequest>>>);
impl Executor for ExecutorSpy {
    async fn execute_action(&self, request: ExecuteRequest) -> appcall_api::Result<ExecuteResult> {
        let post = request.action == "normalized.post.create";
        let fail = request.action == "fail";
        self.0.lock().unwrap().push(request);
        if fail {
            return Err(ApiError::new("ACTION_FAILED"));
        }
        Ok(ExecuteResult {
            request_id: "new-request".into(),
            replay_log_id: "new-replay".into(),
            usage_warning: false,
            usage: Default::default(),
            output: if post {
                json!({"id":"post","provider":"slack","providerPostId":"provider-post","text":"hello","raw":{},"modelVersion":"2026-09-05"})
            } else {
                json!({"sent":true})
            },
        })
    }
}
struct NoCredentials;
impl CredentialResolver for NoCredentials {
    async fn resolve(
        &self,
        _: &appcall_actions::Connection,
        _: &str,
    ) -> appcall_actions::Result<Map<String, Value>> {
        panic!("history read accessed credentials")
    }
}
#[test]
#[ignore = "requires isolated APPCALL_ENGINE_POSTGRES_URL"]
fn data_routes_dispatch_with_authenticated_scope_and_replay_once() {
    let url = std::env::var("APPCALL_ENGINE_POSTGRES_URL").unwrap();
    let mut client = postgres::Client::connect(&url, postgres::NoTls).unwrap();
    let schema = format!("data_host_test_{}", uuid::Uuid::new_v4().simple());
    client
        .batch_execute(&format!(
            "CREATE SCHEMA {schema}; SET search_path TO {schema}"
        ))
        .unwrap();
    let mut scoped_url = url::Url::parse(&url).unwrap();
    scoped_url
        .query_pairs_mut()
        .append_pair("options", &format!("-csearch_path={schema}"));
    appcall_runtime::SqlxMigration::new(
        concat!(env!("CARGO_MANIFEST_DIR"), "/../../migrations"),
        scoped_url.as_str(),
        std::time::Duration::from_secs(30),
    )
    .unwrap()
    .apply()
    .unwrap();
    client.batch_execute("INSERT INTO projects(id,name) VALUES('p','p');INSERT INTO connections(id,project_id,connector,auth_type,status,external_account_id,credential_owner) VALUES('c','p','slack','api_key','active','brand','brand');INSERT INTO action_logs(id,project_id,connection_id,connector,action,status,request_id) VALUES('a','p','c','slack','send','succeeded','original-request');INSERT INTO action_replay_logs(id,project_id,connection_id,connector,action,request_id,sanitized_input) VALUES('r','p','c','slack','send','original-request','{\"text\":\"hello\"}')").unwrap();
    client.batch_execute("UPDATE action_logs SET external_account_id='brand'; UPDATE action_replay_logs SET external_account_id='brand'; INSERT INTO action_replay_logs(id,project_id,connection_id,connector,action,request_id,sanitized_input,external_account_id) VALUES('rf','p','c','slack','fail','failed-original','{}','brand')").unwrap();
    let key = StaticApiKey::from_hash(
        "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
        Principal::project("p").unwrap(),
    )
    .unwrap();
    let calls = Arc::new(Mutex::new(vec![]));
    let api = Api {
        registry: appcall_connectors::Registry::load(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../runner/connectors"
        ))
        .unwrap(),
        backend: Services::new(
            Store::new(client, LocalProvider::new(&[7; 32]).unwrap()),
            Arc::new(key),
            ExecutorSpy(calls.clone()),
            NoCredentials,
            RunnerClient::new("http://127.0.0.1:1", "", ClientOptions::default()).unwrap(),
        ),
    };
    let rt = tokio::runtime::Runtime::new().unwrap();
    rt.block_on(async {
        let request = |method: &str, path: &str, brand: &str, body: Value| Request {
            method: method.into(),
            uri: path.into(),
            headers: vec![
                ("X-Api-Key".into(), "hello".into()),
                ("X-External-Account-Id".into(), brand.into()),
            ],
            body: serde_json::to_vec(&body).unwrap(),
        };
        assert_eq!(
            api.handle(request("GET", "/v1/action-logs", "brand", Value::Null))
                .await
                .status,
            200
        );
        assert_eq!(
            api.handle(request(
                "GET",
                "/v1/action-logs?limit=-1",
                "brand",
                Value::Null
            ))
            .await
            .status,
            400
        );
        assert_eq!(
            api.handle(request(
                "GET",
                "/v1/requests/original-request",
                "other",
                Value::Null
            ))
            .await
            .status,
            404
        );
        assert_eq!(
            api.handle(request(
                "POST",
                "/v1/replay-logs/r/replay",
                "other",
                Value::Null
            ))
            .await
            .status,
            404
        );
        assert!(calls.lock().unwrap().is_empty());
        let replay = api
            .handle(request(
                "POST",
                "/v1/requests/original-request/replay",
                "brand",
                Value::Null,
            ))
            .await;
        assert_eq!(replay.status, 200);
        assert_eq!(
            replay.body,
            json!({"requestId":"original-request","replayLogId":"r","output":{"sent":true}})
        );
        assert_eq!(calls.lock().unwrap().len(), 1);
        assert_eq!(calls.lock().unwrap()[0].external_account_id, "brand");
        let failed = api
            .handle(request(
                "POST",
                "/v1/replay-logs/rf/replay",
                "brand",
                Value::Null,
            ))
            .await;
        assert_eq!(failed.status, 502);
        assert_eq!(failed.body["error"]["code"], "CONNECTOR_FAILED");
        assert_eq!(failed.body["error"]["requestId"], "failed-original");
        assert_eq!(failed.body["error"]["replayLogId"], "rf");
        let post = api
            .handle(request(
                "POST",
                "/v1/unified/posts",
                "brand",
                json!({"connectionId":"c","input":{"text":"hello"}}),
            ))
            .await;
        assert_eq!(post.status, 200);
        assert_eq!(post.body["model"], "post");
        assert_eq!(calls.lock().unwrap().len(), 3);
    });
    drop(api);
    drop(rt);
    let mut admin = postgres::Client::connect(&url, postgres::NoTls).unwrap();
    admin
        .batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
        .unwrap();
}
