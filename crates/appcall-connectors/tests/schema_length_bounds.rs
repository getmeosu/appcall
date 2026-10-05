use appcall_connectors::{ErrorCode, Operation};
use serde_json::json;

fn operation(schema: serde_json::Value) -> Operation {
    Operation {
        input_schema: Some(schema),
        ..Default::default()
    }
}

#[test]
fn max_length_counts_unicode_scalar_values() {
    let op = operation(json!({"type":"string","minLength":1,"maxLength":3}));
    assert!(op.validate_input(&json!("ab")).is_ok());
    assert!(op.validate_input(&json!("😀😀😀")).is_ok());
    assert_eq!(
        op.validate_input(&json!("abcd")).unwrap_err().code(),
        ErrorCode::InvalidInput
    );
    assert_eq!(
        op.validate_input(&json!("😀😀😀😀")).unwrap_err().code(),
        ErrorCode::InvalidInput
    );
}

#[test]
fn max_items_unique_items_and_property_bounds() {
    let items = operation(
        json!({"type":"array","minItems":1,"maxItems":2,"uniqueItems":true,"items":{"type":"string"}}),
    );
    assert!(items.validate_input(&json!(["a"])).is_ok());
    assert_eq!(
        items
            .validate_input(&json!(["a", "b", "c"]))
            .unwrap_err()
            .code(),
        ErrorCode::InvalidInput
    );
    assert_eq!(
        items.validate_input(&json!(["a", "a"])).unwrap_err().code(),
        ErrorCode::InvalidInput
    );

    let props = operation(json!({"type":"object","minProperties":1,"maxProperties":2}));
    assert!(props.validate_input(&json!({"a":1})).is_ok());
    assert_eq!(
        props.validate_input(&json!({})).unwrap_err().code(),
        ErrorCode::InvalidInput
    );
    assert_eq!(
        props
            .validate_input(&json!({"a":1,"b":2,"c":3}))
            .unwrap_err()
            .code(),
        ErrorCode::InvalidInput
    );
}

#[test]
fn exclusive_bounds_and_const() {
    let op = operation(json!({"type":"number","exclusiveMinimum":0,"exclusiveMaximum":10}));
    assert!(op.validate_input(&json!(5)).is_ok());
    assert_eq!(
        op.validate_input(&json!(0)).unwrap_err().code(),
        ErrorCode::InvalidInput
    );
    assert_eq!(
        op.validate_input(&json!(10)).unwrap_err().code(),
        ErrorCode::InvalidInput
    );

    let constant = operation(json!({"const":"alpha"}));
    assert!(constant.validate_input(&json!("alpha")).is_ok());
    assert_eq!(
        constant.validate_input(&json!("beta")).unwrap_err().code(),
        ErrorCode::InvalidInput
    );
}

#[test]
fn malformed_sibling_bounds_are_unsupported() {
    for (keyword, value) in [
        ("maxLength", json!(-1)),
        ("maxItems", json!(1.5)),
        ("minProperties", json!("nope")),
        ("uniqueItems", json!("yes")),
        ("exclusiveMinimum", json!("x")),
    ] {
        let schema = json!({keyword: value});
        let op = operation(schema);
        assert_eq!(
            op.validate_input(&json!(null)).unwrap_err().code(),
            ErrorCode::UnsupportedSchema,
            "{keyword}"
        );
    }
}

#[test]
fn format_is_annotation_only_and_pattern_stays_unsupported() {
    let format = operation(json!({"type":"string","format":"email"}));
    assert!(format.validate_input(&json!("not-an-email")).is_ok());

    let pattern = operation(json!({"type":"string","pattern":"^a+$"}));
    assert_eq!(
        pattern.validate_input(&json!("a")).unwrap_err().code(),
        ErrorCode::UnsupportedSchema
    );
}
