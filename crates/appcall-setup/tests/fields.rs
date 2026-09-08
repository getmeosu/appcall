use appcall_connectors::{DeriveField, SetupConfig, SetupField, SetupRoute};
use appcall_setup::*;
use std::collections::BTreeMap;
#[test]
fn missing_declared_field_retains_only_selected_key_and_validation_order() {
    let setup = SetupConfig {
        fields: vec![SetupField {
            key: "baseIgnored".into(),
            required: true,
            ..Default::default()
        }],
        routes: vec![SetupRoute {
            id: "selected".into(),
            fields: vec![
                SetupField {
                    key: "email".into(),
                    required: true,
                    ..Default::default()
                },
                SetupField {
                    key: "token".into(),
                    required: true,
                    ..Default::default()
                },
            ],
            ..Default::default()
        }],
        ..Default::default()
    };
    let input = BTreeMap::from([("email".into(), "submitted-secret".into())]);
    assert_eq!(
        collect_fields(&setup, "unknown", &input).unwrap_err(),
        Error::UnknownRoute
    );
    let mut unknown = input.clone();
    unknown.insert("untrusted".into(), "secret".into());
    assert_eq!(
        collect_fields(&setup, "selected", &unknown).unwrap_err(),
        Error::InvalidInput
    );
    let error = collect_fields(&setup, "selected", &input).unwrap_err();
    let evidence = format!("{error:?}");
    assert!(!evidence.contains("submitted-secret"));
    assert_eq!(
        error,
        Error::MissingDeclaredField(DeclaredFieldKey::new("token").unwrap())
    );
    if let Error::MissingDeclaredField(key) = error {
        assert_eq!(key.as_str(), "token");
    }
}
#[test]
fn declaration_key_bounds_do_not_claim_authorization() {
    for key in [
        "",
        "<script>",
        "a\nb",
        "api key",
        "https://private.example",
        &"x".repeat(129),
    ] {
        assert!(DeclaredFieldKey::new(key).is_none());
    }
    assert_eq!(
        DeclaredFieldKey::new("undeclared.token-1")
            .unwrap()
            .as_str(),
        "undeclared.token-1"
    );
    let setup = SetupConfig {
        fields: vec![SetupField {
            key: "<script>".into(),
            required: true,
            ..Default::default()
        }],
        ..Default::default()
    };
    assert_eq!(
        collect_fields(&setup, "", &BTreeMap::new()).unwrap_err(),
        Error::MissingField
    );
}
#[test]
fn required_route_derived_and_untrusted_fields_are_validated() {
    let field = |key: &str| SetupField {
        key: key.into(),
        required: true,
        ..Default::default()
    };
    let setup = SetupConfig {
        mode: "api_key".into(),
        routes: vec![SetupRoute {
            id: "basic".into(),
            fields: vec![field("email"), field("token")],
            ..Default::default()
        }],
        derive: vec![DeriveField {
            field: "basicAuth".into(),
            kind: "basic".into(),
            from: vec!["email".into(), "token".into()],
        }],
        ..Default::default()
    };
    assert!(collect_fields(&setup, "bad", &BTreeMap::new()).is_err());
    assert!(collect_fields(&setup, "basic", &BTreeMap::new()).is_err());
    let input = BTreeMap::from([
        ("email".into(), " user ".into()),
        ("token".into(), "secret".into()),
    ]);
    let result = collect_fields(&setup, "basic", &input).unwrap();
    assert_eq!(result.fields()["basicAuth"], "dXNlcjpzZWNyZXQ=");
    assert!(!format!("{result:?}").contains("secret"));
    let mut forged = input;
    forged.insert("basicAuth".into(), "forged".into());
    assert!(collect_fields(&setup, "basic", &forged).is_err());
}
