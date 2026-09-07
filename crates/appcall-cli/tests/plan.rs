use appcall_cli::plan::validate;
use serde_json::json;
#[test]
fn validates_plan_assignment_before_database_effects() {
    assert!(validate("p", "starter", "active", &json!({"send_cap":75})).is_ok());
    assert!(validate("", "starter", "active", &json!({})).is_err());
    assert!(validate("p", "unknown", "active", &json!({})).is_err());
    assert!(validate("p", "free", "unknown", &json!({})).is_err());
    assert!(validate("p", "free", "active", &json!(null)).is_err());
    assert!(validate("p", "free", "active", &json!([])).is_err());
}
