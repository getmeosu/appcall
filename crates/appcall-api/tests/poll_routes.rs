//! OXIDE-POLL-2 poll subscription routes against PostgreSQL (all migrations)
//! and the shipped connector registry.
use appcall_actions::{CredentialResolver, ExecuteRequest, ExecuteResult};
use appcall_api::*;
use appcall_auth::{Principal, StaticApiKey};
use appcall_runner_client::{ClientOptions, RunnerClient};
use appcall_store::{LocalProvider, Store};
use serde_json::{json, Map, Value};
use std::sync::Arc;

struct NoExecutor;
impl Executor for NoExecutor {
    async fn execute_action(&self, _: ExecuteRequest) -> appcall_api::Result<ExecuteResult> {
        panic!("poll subscription routes never execute actions")
    }
}
struct NoCredentials;
impl CredentialResolver for NoCredentials {
    async fn resolve(
        &self,
        _: &appcall_actions::Connection,
        _: &str,
    ) -> appcall_actions::Result<Map<String, Value>> {
        panic!("poll subscription routes never resolve credentials")
    }
}

/// Project `p` with connections `c` (account `brand`) and `c2` (account
/// `brand-2`), and project `q` with connection `cq`; all GitHub. Returns the
/// API (keyed to project `p`) and a side connection for assertions.
fn fixture() -> (Api<impl Backend>, postgres::Client, String) {
    let url = std::env::var("APPCALL_ENGINE_POSTGRES_URL").unwrap();
    let mut client = postgres::Client::connect(&url, postgres::NoTls).unwrap();
    let schema = format!("poll_routes_test_{}", uuid::Uuid::new_v4().simple());
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
    client
        .batch_execute(
            "INSERT INTO projects(id,name) VALUES('p','p'),('q','q');
             INSERT INTO connections(id,project_id,connector,auth_type,status,external_account_id,credential_owner) VALUES
               ('c','p','github','oauth2','active','brand','brand'),
               ('c2','p','github','oauth2','active','brand-2','brand'),
               ('cq','q','github','oauth2','active','brand','brand');",
        )
        .unwrap();
    let side = postgres::Client::connect(scoped_url.as_str(), postgres::NoTls).unwrap();
    let key = StaticApiKey::from_hash(
        "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
        Principal::project("p").unwrap(),
    )
    .unwrap();
    let api = Api {
        registry: appcall_connectors::Registry::load(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../runner/connectors"
        ))
        .unwrap(),
        backend: Services::new(
            Store::new(client, LocalProvider::new(&[7; 32]).unwrap()),
            Arc::new(key),
            NoExecutor,
            NoCredentials,
            RunnerClient::new("http://127.0.0.1:1", "", ClientOptions::default()).unwrap(),
        ),
    };
    (api, side, schema)
}

fn request(method: &str, path: &str, brand: &str, body: Value) -> Request {
    Request {
        method: method.into(),
        uri: path.into(),
        headers: vec![
            ("X-Api-Key".into(), "hello".into()),
            ("X-External-Account-Id".into(), brand.into()),
        ],
        body: if body.is_null() {
            vec![]
        } else {
            serde_json::to_vec(&body).unwrap()
        },
    }
}

fn subscribe_body(operation: &str, input: Value) -> Value {
    json!({"operation": operation, "input": input})
}

fn drop_schema(schema: &str) {
    let url = std::env::var("APPCALL_ENGINE_POSTGRES_URL").unwrap();
    postgres::Client::connect(&url, postgres::NoTls)
        .unwrap()
        .batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
        .unwrap();
}

fn subscriptions(side: &mut postgres::Client) -> Vec<(String, String, String, Value)> {
    side.query(
        "SELECT project_id,connection_id,operation,input FROM poll_subscriptions ORDER BY 1,2,3",
        &[],
    )
    .unwrap()
    .iter()
    .map(|r| (r.get(0), r.get(1), r.get(2), r.get(3)))
    .collect()
}

const PATH: &str = "/v1/connections/c/poll-subscriptions";

#[test]
#[ignore = "requires isolated APPCALL_ENGINE_POSTGRES_URL"]
fn subscribe_is_idempotent_and_list_get_unsubscribe_round_trip() {
    let (api, mut side, schema) = fixture();
    let rt = tokio::runtime::Runtime::new().unwrap();
    rt.block_on(async {
        let input = json!({"owner":"o","repo":"r"});
        let first = api
            .handle(request(
                "POST",
                PATH,
                "brand",
                subscribe_body("actions.workflows.sync", input.clone()),
            ))
            .await;
        assert_eq!(first.status, 201, "{}", first.body);
        assert_eq!(first.body["created"], true);
        let view = &first.body["subscription"];
        assert_eq!(view["connectionId"], "c");
        assert_eq!(view["operation"], "actions.workflows.sync");
        assert_eq!(view["input"], input);
        assert_eq!(view["status"], "active");
        assert_eq!(view["seeded"], false);
        assert!(view["lastError"].is_null());
        assert!(view["nextRunAt"].as_str().unwrap().ends_with('Z'));

        // Same request again: no new row, no reset.
        let again = api
            .handle(request(
                "POST",
                PATH,
                "brand",
                subscribe_body("actions.workflows.sync", input.clone()),
            ))
            .await;
        assert_eq!(again.status, 200, "{}", again.body);
        assert_eq!(again.body["created"], false);
        assert_eq!(again.body["subscription"]["createdAt"], view["createdAt"]);

        let deployments = api
            .handle(request(
                "POST",
                PATH,
                "brand",
                subscribe_body("deployments.sync", json!({"owner":"o","repo":"r"})),
            ))
            .await;
        assert_eq!(deployments.status, 201, "{}", deployments.body);

        let list = api.handle(request("GET", PATH, "brand", Value::Null)).await;
        assert_eq!(list.status, 200, "{}", list.body);
        let operations: Vec<_> = list.body["subscriptions"]
            .as_array()
            .unwrap()
            .iter()
            .map(|s| s["operation"].as_str().unwrap().to_owned())
            .collect();
        assert_eq!(operations, ["actions.workflows.sync", "deployments.sync"]);

        let one = api
            .handle(request(
                "GET",
                &format!("{PATH}/actions.workflows.sync"),
                "brand",
                Value::Null,
            ))
            .await;
        assert_eq!(one.status, 200, "{}", one.body);
        assert_eq!(one.body["subscription"]["input"], input);
        let none = api
            .handle(request(
                "GET",
                &format!("{PATH}/user.followers.sync"),
                "brand",
                Value::Null,
            ))
            .await;
        assert_eq!(none.status, 404);
        assert_eq!(none.body["error"]["code"], "POLL_SUBSCRIPTION_NOT_FOUND");

        let removed = api
            .handle(request(
                "DELETE",
                &format!("{PATH}/actions.workflows.sync"),
                "brand",
                Value::Null,
            ))
            .await;
        assert_eq!(
            (removed.status, &removed.body),
            (200, &json!({"removed": true}))
        );
        let again = api
            .handle(request(
                "DELETE",
                &format!("{PATH}/actions.workflows.sync"),
                "brand",
                Value::Null,
            ))
            .await;
        assert_eq!(
            (again.status, &again.body),
            (200, &json!({"removed": false}))
        );
    });
    assert_eq!(
        subscriptions(&mut side),
        vec![(
            "p".to_owned(),
            "c".to_owned(),
            "deployments.sync".to_owned(),
            json!({"owner":"o","repo":"r"})
        )]
    );
    drop(side);
    drop(api);
    drop_schema(&schema);
}

#[test]
#[ignore = "requires isolated APPCALL_ENGINE_POSTGRES_URL"]
fn other_projects_and_other_accounts_connections_are_not_found() {
    let (api, mut side, schema) = fixture();
    let rt = tokio::runtime::Runtime::new().unwrap();
    rt.block_on(async {
        let body = subscribe_body("actions.workflows.sync", json!({"owner":"o","repo":"r"}));
        // cq belongs to project q; c2 to account brand-2 of project p.
        for connection in ["cq", "c2", "missing"] {
            let path = format!("/v1/connections/{connection}/poll-subscriptions");
            for (method, path, body) in [
                ("POST", path.clone(), body.clone()),
                ("GET", path.clone(), Value::Null),
                ("GET", format!("{path}/actions.workflows.sync"), Value::Null),
                (
                    "DELETE",
                    format!("{path}/actions.workflows.sync"),
                    Value::Null,
                ),
            ] {
                let response = api.handle(request(method, &path, "brand", body)).await;
                assert_eq!(response.status, 404, "{method} {path}: {}", response.body);
                assert_eq!(
                    response.body["error"]["code"], "CONNECTION_NOT_FOUND",
                    "{method} {path}"
                );
            }
        }
        // Account brand-2 sees its own connection but not brand's.
        let own = api
            .handle(request(
                "POST",
                "/v1/connections/c2/poll-subscriptions",
                "brand-2",
                body.clone(),
            ))
            .await;
        assert_eq!(own.status, 201, "{}", own.body);
        let other = api
            .handle(request(
                "DELETE",
                "/v1/connections/c2/poll-subscriptions/actions.workflows.sync",
                "brand",
                Value::Null,
            ))
            .await;
        assert_eq!(other.status, 404);
    });
    // Nothing was written outside the caller's scope; brand-2's row survives.
    assert_eq!(
        subscriptions(&mut side)
            .into_iter()
            .map(|(p, c, o, _)| (p, c, o))
            .collect::<Vec<_>>(),
        vec![(
            "p".to_owned(),
            "c2".to_owned(),
            "actions.workflows.sync".to_owned()
        )]
    );
    drop(side);
    drop(api);
    drop_schema(&schema);
}

#[test]
#[ignore = "requires isolated APPCALL_ENGINE_POSTGRES_URL"]
fn only_pollable_sync_operations_with_valid_input_subscribe() {
    let (api, mut side, schema) = fixture();
    let rt = tokio::runtime::Runtime::new().unwrap();
    rt.block_on(async {
        let input = json!({"owner":"o","repo":"r"});
        for (operation, input, status, code) in [
            // A sync without a poll block, and an action.
            ("issues.list", input.clone(), 422, "OPERATION_NOT_POLLABLE"),
            ("repos.get", input.clone(), 422, "OPERATION_NOT_POLLABLE"),
            ("no.such.op", input.clone(), 404, "UNKNOWN_OPERATION"),
            // The manifest input schema is enforced; cursor is runtime-owned.
            (
                "actions.workflows.sync",
                json!({"owner":"o"}),
                400,
                "INVALID_SUBSCRIPTION_INPUT",
            ),
            (
                "actions.workflows.sync",
                json!({"owner":"o","repo":7}),
                400,
                "INVALID_SUBSCRIPTION_INPUT",
            ),
            (
                "actions.workflows.sync",
                json!({"owner":"o","repo":"r","cursor":"2"}),
                400,
                "INVALID_SUBSCRIPTION_INPUT",
            ),
            (
                "actions.workflows.sync",
                json!([1]),
                400,
                "INVALID_SUBSCRIPTION_INPUT",
            ),
        ] {
            let response = api
                .handle(request(
                    "POST",
                    PATH,
                    "brand",
                    subscribe_body(operation, input),
                ))
                .await;
            assert_eq!(response.status, status, "{operation}: {}", response.body);
            assert_eq!(response.body["error"]["code"], code, "{operation}");
        }
        let malformed = api
            .handle(request(
                "POST",
                PATH,
                "brand",
                json!({"operation":"actions.workflows.sync","extra":1}),
            ))
            .await;
        assert_eq!(malformed.status, 400);
        assert_eq!(malformed.body["error"]["code"], "INVALID_REQUEST");
    });
    assert!(subscriptions(&mut side).is_empty());
    drop(side);
    drop(api);
    drop_schema(&schema);
}
