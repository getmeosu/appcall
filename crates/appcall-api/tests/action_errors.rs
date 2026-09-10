use appcall_actions::{ExecuteRequest, ExecuteResult};
use appcall_api::*;
use appcall_store::Connection;
use serde_json::json;
struct Failure(&'static str);
impl Backend for Failure {
    async fn authorize(&self, _: &[(String, String)]) -> Result<Identity> {
        Ok(Identity {
            project_id: "p".into(),
            account_id: "brand".into(),
            admin_scope: false,
        })
    }
    async fn ready(&self) -> Result<()> {
        Ok(())
    }
    async fn connections(&self, _: &Identity) -> Result<Vec<Connection>> {
        unreachable!()
    }
    async fn platform_connectors(&self, _: &Identity) -> Result<Vec<String>> {
        unreachable!()
    }
    async fn connection(&self, _: &Identity, _: &str) -> Result<Connection> {
        unreachable!()
    }
    async fn test_connection(&self, _: &Identity, _: &str) -> Result<Connection> {
        unreachable!()
    }
    async fn disconnect(&self, _: &Identity, _: &str) -> Result<()> {
        unreachable!()
    }
    async fn execute(&self, r: ExecuteRequest) -> Result<ExecuteResult> {
        assert_eq!(r.project_id, "p");
        assert_eq!(r.external_account_id, "brand");
        assert!(!r.admin_scope);
        let mut error = appcall_actions::ActionError::new(self.0);
        error.request_id = "req_action".into();
        Err(error.into())
    }
}
#[tokio::test]
async fn routed_action_failure_keeps_safe_identity_and_retry_hint() {
    let registry = appcall_connectors::Registry::load(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../runner/connectors"
    ))
    .unwrap();
    let api = Api {
        registry,
        backend: Failure("IDEMPOTENCY_IN_PROGRESS"),
    };
    let response = api
        .handle(Request {
            method: "POST".into(),
            uri: "/v1/connections/c/actions/send".into(),
            headers: vec![],
            body: serde_json::to_vec(&json!({"input":{}})).unwrap(),
        })
        .await;
    assert_eq!(response.status, 409);
    assert_eq!(
        response.body,
        json!({"error":{"code":"IDEMPOTENCY_IN_PROGRESS","message":"Idempotency key is already being processed.","requestId":"req_action","retryAfterSeconds":2}})
    );
    assert_eq!(response.headers, vec![("Retry-After".into(), "2".into())]);
}

#[tokio::test]
async fn runner_budget_errors_keep_their_public_codes_and_statuses() {
    for (code, status, message) in [
        (
            "INPUT_TOO_LARGE",
            413,
            "Operation input exceeded the configured size limit.",
        ),
        (
            "OUTPUT_TOO_LARGE",
            502,
            "Operation output exceeded the configured size limit.",
        ),
        ("OPERATION_TIMEOUT", 504, "Operation execution timed out."),
        ("OUTBOUND_TIMEOUT", 504, "Outbound request timed out."),
        (
            "OUTBOUND_RESPONSE_TOO_LARGE",
            502,
            "Outbound response exceeded the configured size limit.",
        ),
        (
            "OUTBOUND_REQUEST_TOO_LARGE",
            413,
            "Outbound request exceeded the configured size limit.",
        ),
        (
            "OUTBOUND_UNSUPPORTED_BUDGET",
            400,
            "Outbound operation budget is not supported.",
        ),
        (
            "UNSUPPORTED_OPERATION_BUDGET",
            400,
            "The connector operation budget is not supported.",
        ),
    ] {
        let registry = appcall_connectors::Registry::load(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../runner/connectors"
        ))
        .unwrap();
        let api = Api {
            registry,
            backend: Failure(code),
        };
        let response = api
            .handle(Request {
                method: "POST".into(),
                uri: "/v1/connections/c/actions/send".into(),
                headers: vec![],
                body: serde_json::to_vec(&json!({"input":{}})).unwrap(),
            })
            .await;
        assert_eq!(response.status, status, "{code}: {:?}", response.body);
        assert_eq!(
            response.body,
            json!({
                "error": {
                    "code": code,
                    "message": message,
                    "requestId": "req_action"
                }
            }),
            "{code}"
        );
    }
}
