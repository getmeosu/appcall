use appcall_connectors::SetupConfig;
use appcall_setup::{collect_fields, DeclaredFieldKey, Error};
use serde_json::Value;

fn setup(provider: &str) -> SetupConfig {
    let source = match provider {
        "checkly" => {
            include_str!("../../../scripts/connector-gen/openconnector/recipes/checkly/recipe.json")
        }
        "anydb" => {
            include_str!("../../../scripts/connector-gen/openconnector/recipes/anydb/recipe.json")
        }
        "algolia" => {
            include_str!("../../../scripts/connector-gen/openconnector/recipes/algolia/recipe.json")
        }
        _ => panic!("unknown curated provider"),
    };
    let manifest: Value = serde_json::from_str(source).expect("canonical recipe JSON");
    serde_json::from_value(manifest["manifest"]["auth"]["setup"].clone())
        .expect("canonical setup manifest")
}

fn missing(provider: &str, input: &[(&str, &str)]) -> Error {
    collect_fields(
        &setup(provider),
        "",
        &input
            .iter()
            .map(|(k, v)| ((*k).into(), (*v).into()))
            .collect(),
    )
    .expect_err("incomplete curated credentials")
}

#[test]
fn checkly_requires_account_id_even_when_api_key_is_present() {
    for account_id in ["", "   "] {
        let error = missing(
            "checkly",
            &[("apiKey", "checkly-secret"), ("accountId", account_id)],
        );
        assert_eq!(
            error,
            Error::MissingDeclaredField(DeclaredFieldKey::new("accountId").unwrap())
        );
        assert!(!format!("{error:?}").contains("checkly-secret"));
    }
    assert_eq!(
        missing("checkly", &[("accountId", "acct_123")]),
        Error::MissingDeclaredField(DeclaredFieldKey::new("apiKey").unwrap())
    );
}

#[test]
fn anydb_requires_user_email_even_when_api_key_is_present() {
    let error = missing("anydb", &[("apiKey", "anydb-secret")]);
    assert_eq!(
        error,
        Error::MissingDeclaredField(DeclaredFieldKey::new("userEmail").unwrap())
    );
    assert!(!format!("{error:?}").contains("anydb-secret"));
}

#[test]
fn curated_setup_accepts_complete_checkly_anydb_and_algolia_bundles() {
    let cases = [
        (
            "checkly",
            [("apiKey", "checkly-secret"), ("accountId", "acct_123")].as_slice(),
        ),
        (
            "anydb",
            [
                ("apiKey", "anydb-secret"),
                ("userEmail", "user@example.com"),
            ]
            .as_slice(),
        ),
        (
            "algolia",
            [("apiKey", "algolia-secret"), ("applicationId", "APP123")].as_slice(),
        ),
    ];
    for (provider, fields) in cases {
        let credentials = collect_fields(
            &setup(provider),
            "",
            &fields
                .iter()
                .map(|(k, v)| ((*k).into(), (*v).into()))
                .collect(),
        )
        .expect("complete curated credentials");
        assert!(!format!("{credentials:?}").contains("secret"));
    }
}

#[test]
fn canonical_required_flags_guard_against_silent_manifest_regression() {
    for (provider, key) in [
        ("checkly", "accountId"),
        ("anydb", "userEmail"),
        ("algolia", "applicationId"),
    ] {
        let config = setup(provider);
        assert!(config
            .fields
            .iter()
            .any(|field| field.key == key && field.required));
    }
}
