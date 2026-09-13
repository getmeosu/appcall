use appcall_connectors::{ErrorCode, Operation};
use serde_json::json;

fn operation(schema: serde_json::Value) -> Operation {
    Operation {
        input_schema: Some(schema),
        ..Default::default()
    }
}

#[test]
fn numeric_bounds_are_inclusive_for_integers_and_decimals() {
    let op = operation(json!({"type":"number","minimum":-1.5,"maximum":9007199254740993_u64}));
    for value in [json!(-1.5), json!(0), json!(9007199254740993_u64)] {
        assert!(op.validate_input(&value).is_ok(), "{value}");
    }
    for value in [json!(-1.5001), json!(9007199254740994_u64)] {
        assert_eq!(
            op.validate_input(&value).unwrap_err().code(),
            ErrorCode::InvalidInput
        );
    }
}

#[test]
fn numeric_bounds_compare_neighboring_large_integers_exactly() {
    let op = operation(
        json!({"type":"integer","minimum":9007199254740993_u64,"maximum":9007199254740994_u64}),
    );
    assert!(op.validate_input(&json!(9007199254740993_u64)).is_ok());
    assert!(op.validate_input(&json!(9007199254740994_u64)).is_ok());
    assert!(op.validate_input(&json!(9007199254740992_u64)).is_err());
}

#[test]
fn malformed_numeric_bounds_are_unsupported() {
    for keyword in ["minimum", "maximum"] {
        let schema = json!({"type":"number", keyword:"not-a-number"});
        let op = operation(schema);
        assert_eq!(
            op.validate_input(&json!(1)).unwrap_err().code(),
            ErrorCode::UnsupportedSchema
        );
    }
}

#[test]
fn bounds_apply_only_to_numbers_and_preserve_optional_null() {
    let op = operation(json!({"type":["null","number"],"minimum":10,"maximum":20}));
    assert!(op.validate_input(&json!(null)).is_ok());
    assert!(op.validate_input(&json!(15)).is_ok());
    assert!(op.validate_input(&json!(9)).is_err());
}

#[test]
fn numeric_bounds_order_zero_and_tiny_values_correctly() {
    let minimum_zero = operation(json!({"type":"number","minimum":0}));
    assert!(minimum_zero.validate_input(&json!(0)).is_ok());
    assert!(minimum_zero.validate_input(&json!(0.1)).is_ok());
    assert!(minimum_zero
        .validate_input(&serde_json::from_str("1e-100").unwrap())
        .is_ok());
    assert!(minimum_zero.validate_input(&json!(-0.1)).is_err());

    let maximum_zero = operation(json!({"type":"number","maximum":0}));
    assert!(maximum_zero.validate_input(&json!(0)).is_ok());
    assert!(maximum_zero.validate_input(&json!(-0.1)).is_ok());
    assert!(maximum_zero.validate_input(&json!(0.1)).is_err());

    let minimum_tiny = operation(json!({"type":"number","minimum":0.1}));
    assert!(minimum_tiny.validate_input(&json!(0)).is_err());
    assert!(minimum_tiny.validate_input(&json!(-0.1)).is_err());
    assert!(minimum_tiny.validate_input(&json!(0.1)).is_ok());
}
