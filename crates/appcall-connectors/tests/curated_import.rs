use appcall_connectors::{Connector, ErrorCode, Registry};
use serde_json::{json, Value};
use std::path::Path;

fn registry() -> Registry {
    Registry::load(Path::new(env!("CARGO_MANIFEST_DIR")).join("../../runner/connectors"))
        .expect("all checked-in connector manifests must load through the Rust registry")
}

#[test]
fn curated_manifests_are_public_and_have_auth_categories_models_and_operations() {
    let registry = registry();
    for (key, name, categories, auth_type, models) in [
        (
            "coda",
            "Coda",
            &["productivity"],
            "api_key",
            &["doc", "page", "row"] as &[&str],
        ),
        (
            "helpscout",
            "Help Scout",
            &["crm"],
            "oauth2",
            &["conversation", "thread", "user"] as &[&str],
        ),
    ] {
        let connector = registry.public_connector(key).unwrap();
        assert_eq!(connector.manifest().name, name);
        assert_eq!(connector.manifest().auth.type_, auth_type);
        assert!(!connector.manifest().categories.is_empty());
        for category in categories {
            assert!(connector.manifest().has_category(category));
        }
        for model in models {
            assert!(
                connector.manifest().models.iter().any(|m| m == model),
                "missing model {model}"
            );
        }
        assert!(!connector.manifest().operations.is_empty());
        assert!(connector
            .manifest()
            .operations
            .values()
            .all(|op| op.has_tool_schema()));
    }
}

#[test]
fn curated_operations_enforce_required_null_empty_and_valid_inputs() {
    let registry = registry();
    for (key, operation, valid, malformed) in [
        (
            "coda",
            "docs.get",
            json!({"docId":"doc-1"}),
            vec![json!({}), json!({"docId":null}), json!({"docId":""})],
        ),
        (
            "helpscout",
            "conversations.get",
            json!({"conversationId":42}),
            vec![
                json!({}),
                json!({"conversationId":null}),
                json!({"conversationId":"42"}),
                json!({"conversationId":0}),
            ],
        ),
        (
            "coda",
            "docs.list",
            json!({"limit":100}),
            vec![json!({"limit":101}), json!({"limit":null})],
        ),
        (
            "helpscout",
            "users.list",
            json!({"page":1}),
            vec![json!({"page":0}), json!({"page":null})],
        ),
    ] {
        let op = registry.operation(key, operation).unwrap();
        op.validate_input(&valid).unwrap();
        for input in malformed {
            assert_eq!(
                op.validate_input(&input).unwrap_err().code(),
                ErrorCode::InvalidInput,
                "{key}/{operation}: {input}"
            );
        }
    }
}

#[test]
fn every_curated_operation_accepts_a_representative_valid_input() {
    let registry = registry();
    for (connector, operation, input) in [
        ("coda", "healthcheck", json!({})),
        ("coda", "docs.list", json!({})),
        ("coda", "docs.get", json!({"docId":"doc-1"})),
        ("coda", "pages.list", json!({"docId":"doc-1"})),
        ("coda", "tables.list", json!({"docId":"doc-1"})),
        (
            "coda",
            "columns.list",
            json!({"docId":"doc-1","tableIdOrName":"table-1"}),
        ),
        (
            "coda",
            "rows.list",
            json!({"docId":"doc-1","tableIdOrName":"table-1"}),
        ),
        ("helpscout", "healthcheck", json!({})),
        ("helpscout", "users.list", json!({})),
        ("helpscout", "inboxes.list", json!({})),
        ("helpscout", "tags.list", json!({})),
        ("helpscout", "conversations.list", json!({})),
        (
            "helpscout",
            "conversations.get",
            json!({"conversationId":42}),
        ),
        ("helpscout", "threads.list", json!({"conversationId":42})),
    ] {
        registry
            .operation(connector, operation)
            .unwrap()
            .validate_input(&input)
            .unwrap();
    }
}

#[test]
fn bun_fixture_outputs_validate_in_rust_with_absent_final_page_metadata() {
    let registry = registry();
    let coda = registry.operation("coda", "docs.list").unwrap();
    let docs: Value = serde_json::from_str(include_str!(
        "../../../runner/connectors/coda/fixtures/docs_list.json"
    ))
    .unwrap();
    coda.validate_output(&docs).unwrap();
    let empty: Value = serde_json::from_str(include_str!(
        "../../../runner/connectors/coda/fixtures/empty_page.json"
    ))
    .unwrap();
    coda.validate_output(&empty).unwrap();
    coda.validate_output(&json!({"items":[]})).unwrap();
}

#[test]
fn public_inventory_keeps_existing_connectors_and_excludes_fake() {
    let registry = registry();
    assert!(registry.connector("fake").is_ok());
    assert!(registry.public_connector("fake").is_err());
    for key in ["coda", "helpscout"] {
        assert!(registry.public_connector(key).is_ok());
    }
    let baseline: Value = serde_json::from_str(include_str!("connector_contract.json")).unwrap();
    for key in baseline
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|v| v.get("key").and_then(Value::as_str))
        .filter(|key| *key != "fake")
    {
        assert!(
            registry.public_connector(key).is_ok(),
            "baseline connector removed: {key}"
        );
    }
    assert!(registry.public_list().count() >= 75);
}

#[test]
fn curated_manifests_are_immutable_after_import() {
    let raw = std::fs::read(
        Path::new(env!("CARGO_MANIFEST_DIR")).join("../../runner/connectors/coda/manifest.json"),
    )
    .unwrap();
    let connector = Connector::from_bytes(&raw).unwrap();
    assert_eq!(connector.raw_bytes(), raw.as_slice());
    assert_eq!(connector.raw_manifest()["key"], "coda");
}
