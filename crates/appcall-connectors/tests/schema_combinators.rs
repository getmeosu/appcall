//! SCHEMA-COMB-1: bounded anyOf/allOf/oneOf in the control-plane validator.
//!
//! The shared accept/reject cases in schema_parity.json are also run through
//! the runner's validator (runner/bun/test/schema_parity.test.ts), so the two
//! validators cannot drift.
use appcall_connectors::{ErrorCode, Operation, Registry};
use serde_json::{json, Value};

fn parity() -> Value {
    serde_json::from_str(include_str!("schema_parity.json")).unwrap()
}

fn registry() -> Registry {
    Registry::load(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../runner/connectors"
    ))
    .unwrap()
}

fn operation(schema: Value) -> Operation {
    Operation {
        input_schema: Some(schema),
        ..Default::default()
    }
}

/// Mirrors the generator in runner/bun/test/schema_parity.test.ts.
fn generated(kind: &str) -> Value {
    match kind {
        "wideAnyOf" => {
            json!({ "anyOf": (0..65).map(|i| json!({ "required": [format!("k{i}")] })).collect::<Vec<_>>() })
        }
        "deepAnyOf" => {
            let mut schema = json!({ "type": "string" });
            for _ in 0..80 {
                schema = json!({ "anyOf": [schema] });
            }
            schema
        }
        other => panic!("unknown generator {other}"),
    }
}

#[test]
fn github_combinator_operations_validate_through_the_control_plane_path() {
    let registry = registry();
    let cases = parity();
    let operations = cases["operations"].as_array().unwrap();
    assert_eq!(
        operations.len(),
        9,
        "all nine combinator operations are covered"
    );
    for case in operations {
        let connector = case["connector"].as_str().unwrap();
        let name = case["operation"].as_str().unwrap();
        let op = registry.operation(connector, name).unwrap();
        for input in case["accept"].as_array().unwrap() {
            assert!(
                op.validate_input(input).is_ok(),
                "{connector}.{name} must accept {input}: {:?}",
                op.validate_input(input).err().map(|e| e.code())
            );
        }
        for input in case["reject"].as_array().unwrap() {
            assert_eq!(
                op.validate_input(input).map_err(|e| e.code()),
                Err(ErrorCode::InvalidInput),
                "{connector}.{name} must reject {input} as invalid input (not an unsupported schema)"
            );
        }
    }
}

#[test]
fn inline_parity_cases_match_the_runner_validator() {
    for case in parity()["schemas"].as_array().unwrap() {
        let name = case["name"].as_str().unwrap();
        let op = operation(case["schema"].clone());
        for input in case["accept"].as_array().unwrap() {
            assert!(
                op.validate_input(input).is_ok(),
                "{name}: must accept {input}"
            );
        }
        for input in case["reject"].as_array().unwrap() {
            assert_eq!(
                op.validate_input(input).map_err(|e| e.code()),
                Err(ErrorCode::InvalidInput),
                "{name}: must reject {input}"
            );
        }
    }
}

#[test]
fn hostile_or_unsupported_combinator_schemas_are_refused() {
    for case in parity()["unsupported"].as_array().unwrap() {
        let name = case["name"].as_str().unwrap();
        let schema = match case.get("generate").and_then(Value::as_str) {
            Some(kind) => generated(kind),
            None => case["schema"].clone(),
        };
        for input in [json!({}), json!("s"), json!(1)] {
            assert_eq!(
                operation(schema.clone())
                    .validate_input(&input)
                    .map_err(|e| e.code()),
                Err(ErrorCode::UnsupportedSchema),
                "{name}"
            );
        }
    }
}

#[test]
fn branch_limit_is_inclusive_and_wide_but_shallow_schemas_stay_cheap() {
    let at_limit = json!({ "anyOf": (0..64).map(|i| json!({ "required": [format!("k{i}")] })).collect::<Vec<_>>() });
    let op = operation(at_limit);
    assert!(op.validate_input(&json!({ "k63": 1 })).is_ok());
    assert_eq!(
        op.validate_input(&json!({ "nope": 1 }))
            .map_err(|e| e.code()),
        Err(ErrorCode::InvalidInput)
    );
}

#[test]
fn total_schema_nodes_are_bounded() {
    // 64 branches x 64 properties = 4160 nodes > 4096.
    let branch = json!({ "properties": (0..64).map(|i| (format!("p{i}"), json!({ "type": "string" }))).collect::<serde_json::Map<_, _>>() });
    let schema = json!({ "anyOf": (0..64).map(|_| branch.clone()).collect::<Vec<_>>() });
    assert_eq!(
        operation(schema)
            .validate_input(&json!({}))
            .map_err(|e| e.code()),
        Err(ErrorCode::UnsupportedSchema)
    );
}
