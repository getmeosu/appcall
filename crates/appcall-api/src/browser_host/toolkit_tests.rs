use super::{catalog_item, selected_action};
use appcall_connectors::{Manifest, Operation, OperationKind};
use serde_json::json;

fn manifest() -> Manifest {
    Manifest {
        operations: [
            ("a_sync", OperationKind::Sync, "read"),
            ("b_write", OperationKind::Action, "write"),
            ("c_read", OperationKind::Action, "read"),
            ("d_delete", OperationKind::Action, "destructive"),
            ("e_missing", OperationKind::Action, ""),
        ]
        .into_iter()
        .map(|(key, kind, side_effect)| {
            (
                key.into(),
                Operation {
                    kind,
                    side_effect: side_effect.into(),
                    input_schema: Some(json!({"type":"object","properties":{"query":{"type":"string"}},"required":["query"]})),
                    output_schema: Some(
                        json!({"type":"object","properties":{"result":{"type":"string"}}}),
                    ),
                    ..Default::default()
                },
            )
        })
        .collect(),
        ..Default::default()
    }
}

fn assert_read_only(key: &str, expected: bool) {
    let item = catalog_item(&manifest());
    let op = item["operations"]
        .as_array()
        .unwrap()
        .iter()
        .find(|op| op["key"] == key)
        .unwrap();
    assert_eq!(op["readOnly"], expected, "{key}");
    assert!(op.get("safeDefault").is_none());
    assert!(item.get("safeDefault").is_none());
}

#[test]
fn toolkit_catalog_read_is_read_only() {
    assert_read_only("c_read", true);
}
#[test]
fn toolkit_catalog_write_is_not_read_only() {
    assert_read_only("b_write", false);
}
#[test]
fn toolkit_catalog_destructive_is_not_read_only() {
    assert_read_only("d_delete", false);
}
#[test]
fn toolkit_catalog_missing_side_effect_is_not_read_only() {
    assert_read_only("e_missing", false);
}

#[test]
fn toolkit_catalog_destructive_marker_uses_existing_policy() {
    let manifest = manifest();
    let item = catalog_item(&manifest);
    for operation in item["operations"].as_array().unwrap() {
        let key = operation["key"].as_str().unwrap();
        assert_eq!(
            operation["destructive"],
            manifest.operations[key].is_destructive(),
            "{key}"
        );
    }
}

#[test]
fn toolkit_catalog_exposes_actual_input_and_output_schemas() {
    let manifest = manifest();
    let item = catalog_item(&manifest);
    for op in item["operations"].as_array().unwrap() {
        assert_eq!(
            op["inputSchema"],
            manifest.operations[op["key"].as_str().unwrap()]
                .input_schema
                .clone()
                .unwrap()
        );
        assert_eq!(
            op["outputSchema"],
            manifest.operations[op["key"].as_str().unwrap()]
                .output_schema
                .clone()
                .unwrap()
        );
    }
}

#[test]
fn toolkit_selection_preserves_explicit_action_and_alphabetical_default() {
    let manifest = manifest();
    assert_eq!(
        selected_action(&manifest, "c_read").unwrap().unwrap().0,
        "c_read"
    );
    let (name, op) = selected_action(&manifest, "").unwrap().unwrap();
    assert_eq!(name, "b_write");
    assert!(!op.is_read_only());
    assert!(selected_action(&Manifest::default(), "").unwrap().is_none());
}

#[test]
fn toolkit_selection_rejects_unknown_explicit_action() {
    assert!(matches!(
        selected_action(&manifest(), "unknown"),
        Err(appcall_web::Error::Invalid)
    ));
}

#[test]
fn toolkit_selection_rejects_explicit_non_action() {
    assert!(matches!(
        selected_action(&manifest(), "a_sync"),
        Err(appcall_web::Error::Invalid)
    ));
}
