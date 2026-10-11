//! SCHEMA-COMB-1: the nine github operations whose inputSchema uses
//! anyOf/allOf/oneOf must pass the control plane's ActionCatalog validation
//! (the exact check ActionService::prepare runs before dispatch) with an
//! injected credential, and still be rejected when no alternative matches.
use appcall_actions::ActionCatalog;
use appcall_connectors::Registry;
use serde_json::json;

#[test]
fn github_combinator_operations_are_dispatchable_through_the_catalog() {
    let registry = Registry::load(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../runner/connectors"
    ))
    .unwrap();
    let cases = [
        ("deployments.create", json!({"owner":"o","repo":"r","ref":"main","payload":{"a":1}}), json!({"owner":"o","repo":"r","ref":"main","payload":5})),
        ("deployments.get", json!({"owner":"o","repo":"r","deploymentId":42}), json!({"owner":"o","repo":"r"})),
        ("discussions.comments.create", json!({"owner":"o","repo":"r","body":"b","discussionId":"D_1"}), json!({"owner":"o","repo":"r","body":"b"})),
        ("discussions.comments.list", json!({"owner":"o","repo":"r","discussionNumber":7}), json!({"owner":"o","repo":"r"})),
        ("discussions.comments.update", json!({"owner":"o","repo":"r","commentId":"C","body":"b","discussionNumber":7}), json!({"owner":"o","repo":"r","commentId":"C","body":"b"})),
        ("discussions.get", json!({"owner":"o","repo":"r","title":"Welcome"}), json!({"owner":"o","repo":"r"})),
        ("discussions.update", json!({"owner":"o","repo":"r","discussionNumber":7,"title":"t"}), json!({"owner":"o","repo":"r","discussionNumber":7})),
        ("environments.get", json!({"owner":"o","repo":"r","name":"prod"}), json!({"owner":"o","repo":"r"})),
        ("releases.assets.get", json!({"owner":"o","repo":"r","releaseId":3,"name":"app.zip"}), json!({"owner":"o","repo":"r","releaseId":3})),
    ];
    for (action, mut valid, mut invalid) in cases {
        valid["accessToken"] = json!("synthetic-stored-token");
        invalid["accessToken"] = json!("synthetic-stored-token");
        assert!(
            ActionCatalog::validate_input(&registry, "github", action, &valid).is_ok(),
            "github.{action} must be dispatchable with valid input"
        );
        assert_eq!(
            ActionCatalog::validate_input(&registry, "github", action, &invalid)
                .unwrap_err()
                .code,
            "INVALID_ACTION_INPUT",
            "github.{action}"
        );
    }
}
