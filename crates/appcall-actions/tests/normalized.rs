use appcall_actions::*;
use appcall_connectors::{Connector, Registry};
use serde_json::{json, Map, Value};
use std::sync::{Arc, Mutex};
fn registry() -> Registry {
    Registry::from_connectors([Connector::from_bytes(&serde_json::to_vec(&json!({"key":"test","name":"Test","version":"1","runtime":"bun","models":["post"],"auth":{"type":"none"},"network":{"egress":"none"},"operations":{"normalized.post.create":{"kind":"action","timeoutMs":1000,"maxInputBytes":1000,"maxResponseBytes":10000,"inputSchema":{"type":"object"},"outputSchema":{"type":"object","required":["schemaRequired"]},"sideEffect":"write"},"native":{"kind":"action","timeoutMs":1000,"maxInputBytes":1000,"maxResponseBytes":10000,"sideEffect":"read"}}})).unwrap()).unwrap()]).unwrap()
}
fn post() -> Value {
    json!({"schemaRequired":true,"id":"p1","provider":"test","providerPostId":"provider-1","modelVersion":"2026-09-05","raw":{},"text":"hello","publishedAt":"2026-09-07T12:00:00Z","media":[{"url":"https://example.com/image","type":"image"}]})
}
#[test]
fn normalized_validation_is_in_catalog_and_preserves_generic_schema_checks() {
    let reg = registry();
    assert!(
        ActionCatalog::validate_output(&reg, "test", "normalized.post.create", &post()).is_ok()
    );
    for (key, value) in [
        ("provider", json!("other")),
        ("id", json!("  ")),
        ("providerPostId", json!(null)),
        ("modelVersion", json!("future")),
        ("publishedAt", json!("invalid")),
        ("raw", json!([])),
        ("media", json!([{"url":" "}])),
        ("media", json!([{"url":"https://example.com","type":8}])),
        ("text", json!(7)),
    ] {
        let mut p = post();
        p[key] = value;
        assert_eq!(
            ActionCatalog::validate_output(&reg, "test", "normalized.post.create", &p)
                .unwrap_err()
                .code,
            "ACTION_RESPONSE_INVALID",
            "{key}"
        );
    }
    let mut p = post();
    p.as_object_mut().unwrap().remove("schemaRequired");
    assert!(ActionCatalog::validate_output(&reg, "test", "normalized.post.create", &p).is_err());
    assert!(
        ActionCatalog::validate_output(&reg, "test", "native", &json!({"provider":"other"}))
            .is_ok()
    );
}
#[derive(Default)]
struct State {
    successes: usize,
    failures: Vec<String>,
    replays: usize,
    cached: Option<Value>,
}
struct Repo(Arc<Mutex<State>>);
impl ActionRepository for Repo {
    async fn connection(&self, p: &str, id: &str) -> Result<Connection> {
        Ok(Connection {
            id: id.into(),
            project_id: p.into(),
            external_account_id: "b".into(),
            connector: "test".into(),
            status: "active".into(),
            auth_type: "none".into(),
            secret_ref_id: None,
        })
    }
    async fn acquire(&self, _: &Attempt) -> Result<Acquisition> {
        Ok(self
            .0
            .lock()
            .unwrap()
            .cached
            .clone()
            .map(Acquisition::Cached)
            .unwrap_or(Acquisition::Acquired))
    }
    async fn mark_dispatched(&self, _: &Attempt) -> Result<()> {
        Ok(())
    }
    async fn release_pending(&self, _: &Attempt) -> Result<()> {
        Ok(())
    }
    async fn record_replay(&self, _: &Attempt, _: &Value) -> Result<String> {
        self.0.lock().unwrap().replays += 1;
        Ok("replay".into())
    }
    async fn finish(&self, _: &Attempt, output: Option<&Value>, error: Option<&str>) -> Result<()> {
        let mut s = self.0.lock().unwrap();
        if let Some(output) = output {
            s.successes += 1;
            s.cached = Some(output.clone());
        }
        if let Some(error) = error {
            s.failures.push(error.into());
        }
        Ok(())
    }
}
struct Credentials;
impl CredentialResolver for Credentials {
    async fn resolve(&self, _: &Connection, _: &str) -> Result<Map<String, Value>> {
        Ok(Map::new())
    }
}
struct Allow;
impl PolicyGate for Allow {
    async fn authorize(&self, _: &ExecuteRequest, _: &Connection, _: &Operation) -> Result<()> {
        Ok(())
    }
}
struct Runner(Value);
impl ActionRunner for Runner {
    async fn execute(
        &self,
        _: &Attempt,
        _: Value,
        _: u64,
    ) -> std::result::Result<Value, RunnerFailure> {
        Ok(self.0.clone())
    }
}
#[tokio::test]
async fn invalid_provider_result_never_becomes_success_cache_or_replay() {
    let state = Arc::new(Mutex::new(State::default()));
    let mut wrong = post();
    wrong["provider"] = json!("other");
    let service = Service::new(
        Repo(state.clone()),
        registry(),
        Credentials,
        Runner(wrong),
        Allow,
    );
    let request = ExecuteRequest {
        project_id: "p".into(),
        connection_id: "c".into(),
        external_account_id: "b".into(),
        admin_scope: false,
        action: "normalized.post.create".into(),
        idempotency_key: "same".into(),
        input: json!({}),
        caller_credential: String::new(),
    };
    assert_eq!(
        service.execute(request).await.unwrap_err().code,
        "ACTION_RESPONSE_INVALID"
    );
    let s = state.lock().unwrap();
    assert_eq!(s.successes, 0);
    assert_eq!(s.replays, 0);
    assert!(s.cached.is_none());
    assert_eq!(s.failures, vec!["ACTION_RESPONSE_INVALID"]);
}
#[test]
fn go_optional_zero_values_media_and_rfc3339_contract() {
    let reg = registry();
    let mut p = post();
    for key in ["text", "authorId", "url", "publishedAt"] {
        p[key] = Value::Null;
    }
    p["media"] = json!([{ "url":"https://example.com","type":null }]);
    assert!(ActionCatalog::validate_output(&reg, "test", "normalized.post.create", &p).is_ok());
    p["media"] = Value::Null;
    assert!(ActionCatalog::validate_output(&reg, "test", "normalized.post.create", &p).is_ok());
    for key in ["text", "authorId", "url", "publishedAt", "media"] {
        p.as_object_mut().unwrap().remove(key);
    }
    assert!(ActionCatalog::validate_output(&reg, "test", "normalized.post.create", &p).is_ok());
    for value in [json!({}), json!([null]), json!([{}]), json!([{"url":null}])] {
        p["media"] = value;
        assert!(
            ActionCatalog::validate_output(&reg, "test", "normalized.post.create", &p).is_err()
        );
    }
    p.as_object_mut().unwrap().remove("media");
    for time in [
        "2026-02-30T00:00:00Z",
        "2026-01-01T00:00:60Z",
        "2026-01-01",
        "private-provider-payload",
    ] {
        p["publishedAt"] = json!(time);
        let error =
            ActionCatalog::validate_output(&reg, "test", "normalized.post.create", &p).unwrap_err();
        assert_eq!(error.to_string(), "ACTION_RESPONSE_INVALID");
    }
    for time in [
        "",
        "2026-09-07T12:34:56.123456789Z",
        "2026-09-07T12:34:56+05:30",
    ] {
        p["publishedAt"] = json!(time);
        assert!(ActionCatalog::validate_output(&reg, "test", "normalized.post.create", &p).is_ok());
    }
}
