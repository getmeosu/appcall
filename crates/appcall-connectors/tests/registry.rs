use appcall_connectors::{Connector, ErrorCode, Registry};
use serde_json::{json, Value};
use std::path::Path;

fn minimal() -> Value {
    json!({"key":"test","name":"Test","version":"1","runtime":"bun","auth":{"type":"none"},"network":{"egress":"none"},"models":["item"],"operations":{"read":{"kind":"action","timeoutMs":100,"maxInputBytes":1000,"maxResponseBytes":2000,"description":"Read","inputSchema":{},"sideEffect":"read"}}})
}

#[test]
fn request_registry_clones_share_immutable_connector_storage() {
    let connector = Connector::from_bytes(&serde_json::to_vec(&minimal()).unwrap()).unwrap();
    let registry = Registry::from_connectors([connector]).unwrap();
    let request_registry = registry.clone();
    assert!(
        std::ptr::eq(
            registry.connector("test").unwrap(),
            request_registry.connector("test").unwrap()
        ),
        "request pinning must not copy manifests, raw JSON and source bytes"
    );
    drop(registry);
    assert_eq!(
        request_registry.connector("test").unwrap().manifest().key,
        "test"
    );
}

#[test]
fn exact_bytes_and_runner_only_fields_survive_loading() {
    let mut value = minimal();
    value["http"] = json!({"baseUrl":"https://example.com"});
    value["operations"]["read"]["request"] = json!({"method":"GET","path":"/items"});
    let raw = serde_json::to_vec(&value).unwrap();
    let a = Connector::from_bytes(&raw).unwrap();
    let mut changed = raw.clone();
    changed.push(b'\n');
    let b = Connector::from_bytes(&changed).unwrap();
    assert_eq!(a.raw_bytes(), raw);
    assert_eq!(a.raw_manifest(), b.raw_manifest());
    assert_ne!(a.manifest_digest(), b.manifest_digest());
    assert_eq!(
        a.raw_manifest()["operations"]["read"]["request"]["method"],
        "GET"
    );
    assert!(a.operation("read").unwrap().is_read_only());
    assert!(a.operation("read").unwrap().has_tool_schema());
}

#[test]
fn invalid_metadata_fails_without_echoing_manifest_content() {
    for (field, value) in [
        ("key", json!("<script>SECRET</script>")),
        ("runtime", json!("SECRET")),
        ("operations", json!({})),
    ] {
        let mut m = minimal();
        m[field] = value;
        let err = Connector::from_bytes(&serde_json::to_vec(&m).unwrap()).unwrap_err();
        assert_eq!(err.code(), ErrorCode::InvalidManifest);
        assert!(!err.to_string().contains("SECRET"));
    }
    assert_eq!(
        Connector::from_bytes(b"null").unwrap_err().code(),
        ErrorCode::InvalidManifest
    );
    assert_eq!(
        Connector::from_bytes(b"{").unwrap_err().code(),
        ErrorCode::InvalidManifest
    );
}

#[test]
fn duplicate_json_members_are_rejected_at_every_depth() {
    let mut v = minimal();
    v["operations"]["read"]["request"] = json!({"method":"GET"});
    let raw = serde_json::to_string(&v).unwrap();
    let ambiguous = raw.replace(
        "\"method\":\"GET\"",
        "\"method\":\"GET\",\"method\":\"DELETE\"",
    );
    assert_eq!(
        Connector::from_bytes(ambiguous.as_bytes())
            .unwrap_err()
            .code(),
        ErrorCode::InvalidManifest
    );
}

#[test]
fn duplicate_connector_keys_fail_and_missing_root_never_falls_back() {
    let dir = tempfile::tempdir().unwrap();
    for name in ["a", "b"] {
        std::fs::create_dir(dir.path().join(name)).unwrap();
        std::fs::write(
            dir.path().join(name).join("manifest.json"),
            serde_json::to_vec(&minimal()).unwrap(),
        )
        .unwrap();
    }
    assert_eq!(
        Registry::load(dir.path()).unwrap_err().code(),
        ErrorCode::DuplicateConnector
    );
    assert_eq!(
        Registry::load(dir.path().join("absent"))
            .unwrap_err()
            .code(),
        ErrorCode::Storage
    );
}

#[test]
fn complete_inventory_matches_connector_contract_oracle() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../runner/connectors");
    let registry = Registry::load(root).unwrap();
    let expected: Value = serde_json::from_str(include_str!("connector_contract.json")).unwrap();
    let actual:Vec<Value>=registry.list().map(|c| json!({
        "key":c.manifest().key,"digest":c.manifest_digest(),"public":c.manifest().is_public(),
        "egress":c.manifest().network.makes_outbound_calls(),
        "operations":c.manifest().operations.iter().map(|(key,op)|json!({
            "key":key,"kind":op.kind,"timeoutMs":op.timeout_ms,"maxInputBytes":op.max_input_bytes,"maxResponseBytes":op.max_response_bytes,
            "read":op.is_read_only(),"destructive":op.is_destructive(),"tool":op.has_tool_schema(),
            "inputSchema":op.input_schema,"outputSchema":op.output_schema
        })).collect::<Vec<_>>()
    })).collect();
    assert_eq!(Value::Array(actual), expected);
    assert_eq!(
        registry.connector("absent").unwrap_err().code(),
        ErrorCode::UnknownConnector
    );
    assert_eq!(
        registry.operation("slack", "absent").unwrap_err().code(),
        ErrorCode::UnknownOperation
    );
}
