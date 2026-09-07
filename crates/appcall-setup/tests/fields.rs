use appcall_connectors::{DeriveField, SetupConfig, SetupField, SetupRoute};
use appcall_setup::*;
use std::collections::BTreeMap;
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
