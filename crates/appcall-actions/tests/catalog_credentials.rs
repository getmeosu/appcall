use appcall_actions::ActionCatalog;
use appcall_connectors::Registry;
use serde_json::json;

#[test]
fn canonical_telegram_accepts_injected_credentials_but_rejects_unknown_user_fields() {
    let registry = Registry::load(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../runner/connectors"
    ))
    .unwrap();
    ActionCatalog::validate_input(
        &registry,
        "telegram",
        "bot.getMe",
        &json!({"botToken":"synthetic-stored-token"}),
    )
    .unwrap();
    let error = ActionCatalog::validate_input(
        &registry,
        "telegram",
        "bot.getMe",
        &json!({"botToken":"synthetic-stored-token", "unexpected":true}),
    )
    .unwrap_err();
    assert_eq!(error.code, "INVALID_ACTION_INPUT");
    assert!(ActionCatalog::validate_input(
        &registry,
        "telegram",
        "bot.getMe",
        &json!({"botToken":"synthetic-stored-token", "refreshToken":"caller-value"})
    )
    .is_err());
}

#[test]
fn unipile_internal_account_binding_does_not_relax_public_profile_arguments() {
    let registry = Registry::load(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../runner/connectors"
    ))
    .unwrap();
    ActionCatalog::validate_input(&registry, "unipile", "linkedin.profile.get", &json!({"identifier":"profile", "account_id":"server-bound", "apiKey":"synthetic", "dsn":"https://example.test"})).unwrap();
    assert!(ActionCatalog::validate_input(
        &registry,
        "unipile",
        "linkedin.profile.get",
        &json!({"account_id":"server-bound"})
    )
    .is_err());
    assert!(ActionCatalog::validate_input(
        &registry,
        "unipile",
        "linkedin.profile.get",
        &json!({"identifier":"profile", "unexpected":true, "account_id":"server-bound"})
    )
    .is_err());
}

#[test]
fn explicitly_declared_credential_constraints_are_still_enforced() {
    let mut manifest: serde_json::Value = serde_json::from_str(include_str!(
        "../../../runner/connectors/telegram/manifest.json"
    ))
    .unwrap();
    manifest["operations"]["credentials.validate"]["inputSchema"]["properties"]["botToken"] =
        json!({"type":"string","minLength":1});
    manifest["operations"]["credentials.validate"]["inputSchema"]["required"] = json!(["botToken"]);
    let connector =
        appcall_connectors::Connector::from_bytes(&serde_json::to_vec(&manifest).unwrap()).unwrap();
    let registry = Registry::from_connectors([connector]).unwrap();
    assert!(ActionCatalog::validate_input(
        &registry,
        "telegram",
        "credentials.validate",
        &json!({"botToken":"synthetic-stored-token"})
    )
    .is_ok());
    assert!(ActionCatalog::validate_input(
        &registry,
        "telegram",
        "credentials.validate",
        &json!({"botToken":17})
    )
    .is_err());
}
