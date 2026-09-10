use appcall_connectors::{Connector, ErrorCode, Operation, Registry};
use serde_json::{json, Value};
fn manifest() -> Value {
    json!({"key":"validate","name":"Test","version":"1","runtime":"bun","auth":{"type":"api_key","setup":{"mode":"api_key","fields":[{"key":"user","label":"User","required":true},{"key":"password","label":"Password","required":true,"secret":true}],"derive":[{"field":"basicAuth","kind":"basic","from":["user","password"]}]}},"network":{"allowedHosts":["{{ user }}","*.example.com"]},"models":["item"],"operations":{"read":{"kind":"action","timeoutMs":10,"maxInputBytes":1000,"maxResponseBytes":1000}}})
}
fn parse(v: &Value) -> Result<Connector, appcall_connectors::Error> {
    Connector::from_bytes(&serde_json::to_vec(v).unwrap())
}
#[test]
fn setup_and_visibility_match_go_policy() {
    let mut v = manifest();
    v["visibility"] = json!("internal");
    let c = parse(&v).unwrap();
    let registry = Registry::from_connectors([c]).unwrap();
    assert!(registry.public_list().next().is_none());
    assert_eq!(
        registry.public_connector("validate").unwrap_err().code(),
        ErrorCode::UnknownConnector
    );
    assert_eq!(
        registry.credential_fields("validate").unwrap(),
        vec!["basicAuth", "password", "user"]
    );
    for (target, replacement) in [
        ("from", json!(["user", "unknown"])),
        ("kind", json!("shell")),
        ("field", json!("user")),
    ] {
        let mut bad = v.clone();
        bad["auth"]["setup"]["derive"][0][target] = replacement;
        assert_eq!(parse(&bad).unwrap_err().code(), ErrorCode::InvalidManifest);
    }
    let mut no_mode = v.clone();
    no_mode["auth"]["setup"]["mode"] = json!("");
    assert!(parse(&no_mode).is_err());
    let mut no_fields = v.clone();
    no_fields["auth"]["setup"] = json!({"mode":"api_key"});
    assert!(parse(&no_fields).is_err());
    let mut routes = v.clone();
    routes["auth"]["setup"] = json!({"mode":"api_key","routes":[{"id":"same","label":"A","fields":[{"key":"a","label":"A"}]},{"id":"same","label":"B","fields":[{"key":"b","label":"B"}]}]});
    assert!(parse(&routes).is_err());
}
#[test]
fn network_and_oauth_urls_cannot_broaden_egress() {
    for host in [
        "*.com",
        "*",
        "https://example.com",
        "example.com:443",
        "{{sub}}.example.com",
        "a..com",
        "-a.com",
    ] {
        let mut v = manifest();
        v["network"]["allowedHosts"] = json!([host]);
        assert!(parse(&v).is_err(), "{host}");
    }
    let mut v = manifest();
    v["network"] = json!({"allowedHosts":["provider.example"]});
    v["auth"]["oauth"] = json!({"authorizeUrl":"https://provider.example/authorize","tokenUrl":"https://provider.example/token","clientAuth":"basic","supportsRefresh":true});
    assert!(parse(&v).is_ok());
    for url in [
        "http://provider.example/token",
        "https://evil.example/token",
    ] {
        v["auth"]["oauth"]["tokenUrl"] = json!(url);
        assert!(parse(&v).is_err());
    }
    let mut v = manifest();
    v["auth"]["setup"]["docsUrl"] = json!("javascript:SECRET");
    assert!(parse(&v).is_err());
}
#[test]
fn operation_validation_enforces_current_schema_contract() {
    let schema = json!({"type":"object","required":["rows"],"additionalProperties":false,"properties":{"rows":{"type":"array","minItems":1,"items":{"type":"object","required":["name"],"properties":{"name":{"type":"string","minLength":2},"kind":{"enum":["a","b"]}},"additionalProperties":false}}}});
    let op = Operation {
        input_schema: Some(schema.clone()),
        output_schema: Some(schema),
        ..Default::default()
    };
    assert!(op
        .validate_input(&json!({"rows":[{"name":"é日","kind":"a"}]}))
        .is_ok());
    for input in [
        json!(null),
        json!({}),
        json!({"rows":[]}),
        json!({"rows":[{"name":"a"}]}),
        json!({"rows":[{"name":"good","kind":"invalid"}]}),
        json!({"rows":[{"name":"good"}],"apiKey":"smuggled"}),
    ] {
        assert_eq!(
            op.validate_input(&input).unwrap_err().code(),
            ErrorCode::InvalidInput
        );
        assert_eq!(
            op.validate_output(&input).unwrap_err().code(),
            ErrorCode::InvalidOutput
        );
    }
    let op = Operation {
        input_schema: Some(json!({"$ref":"https://evil.example/schema"})),
        ..Default::default()
    };
    assert_eq!(
        op.validate_input(&json!({})).unwrap_err().code(),
        ErrorCode::UnsupportedSchema
    );
}

#[test]
fn operation_budgets_above_the_runner_contract_are_rejected() {
    for (field, value) in [
        ("timeoutMs", json!(300_001)),
        ("maxInputBytes", json!(26_214_401)),
        ("maxResponseBytes", json!(52_428_801)),
    ] {
        let mut unsupported = manifest();
        unsupported["operations"]["read"][field] = value;
        assert_eq!(
            parse(&unsupported).unwrap_err().code(),
            ErrorCode::InvalidManifest,
            "{field} must not be accepted above the supported contract"
        );
    }
}

#[test]
fn api_docker_build_context_copies_the_canonical_budget_contract() {
    let dockerfile = include_str!("../../../Dockerfile.api");
    assert!(
        dockerfile.lines().any(|line| {
            line.trim() == "COPY runner/budget-contract.json ./runner/budget-contract.json"
        }),
        "Dockerfile.api must copy the contract at the path used by include_str!"
    );
}

#[test]
fn unsupported_nested_schema_is_never_silently_ignored() {
    let op = Operation {
        input_schema: Some(json!({"type":"object","properties":{"optional":{"pattern":"SECRET"}}})),
        ..Default::default()
    };
    assert_eq!(
        op.validate_input(&json!({})).unwrap_err().code(),
        ErrorCode::UnsupportedSchema
    );
}

#[test]
fn numeric_enums_match_javascript_without_losing_large_integer_precision() {
    let op = Operation {
        input_schema: Some(json!({"type":"integer","enum":[1,2,3,4]})),
        ..Default::default()
    };
    assert!(op.validate_input(&json!(1.0)).is_ok());
    let op = Operation {
        input_schema: Some(json!({"enum":[9007199254740993_u64]})),
        ..Default::default()
    };
    assert!(op.validate_input(&json!(9007199254740992.0_f64)).is_err());
    for (allowed, input) in [
        (json!(0), json!(-0.0)),
        (json!(1000), serde_json::from_str("1e3").unwrap()),
        (json!({"items":[1,2]}), json!({"items":[1.0,2.0]})),
        (
            json!(1e-20),
            serde_json::from_str("0.00000000000000000001").unwrap(),
        ),
    ] {
        let op = Operation {
            input_schema: Some(json!({"enum":[allowed]})),
            ..Default::default()
        };
        assert!(op.validate_input(&input).is_ok());
    }
}
