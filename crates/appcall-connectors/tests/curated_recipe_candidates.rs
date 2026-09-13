use appcall_connectors::Connector;
use serde_json::Value;
use std::fs;
use std::path::PathBuf;

fn recipes() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../scripts/connector-gen/openconnector/recipes")
}

#[test]
fn every_recipe_is_rust_valid_and_ids_are_coherent() {
    let root = recipes();
    let mut seen = Vec::new();
    for entry in fs::read_dir(root).unwrap() {
        let path = entry.unwrap().path().join("recipe.json");
        if !path.is_file() {
            continue;
        }
        let raw = fs::read(&path).unwrap();
        let recipe: Value = serde_json::from_slice(&raw).unwrap();
        let provider = recipe["providerId"].as_str().expect("providerId");
        let appcall = recipe["appcallId"].as_str().expect("appcallId");
        assert!(!provider.is_empty());
        let manifest = serde_json::to_vec(&recipe["manifest"]).unwrap();
        let connector =
            Connector::from_bytes(&manifest).unwrap_or_else(|e| panic!("{}: {e}", path.display()));
        assert_eq!(connector.manifest().key, appcall);
        assert!(
            !connector.manifest().models.is_empty(),
            "{} has empty models",
            path.display()
        );
        seen.push(path);
    }
    assert!(!seen.is_empty(), "no recipe manifests found");
}

#[test]
fn rust_rejects_empty_models_negative_control() {
    let invalid = br#"{"schemaVersion":1,"key":"bad","name":"Bad","version":"0.1.0","runtime":"bun","models":[],"categories":[],"auth":{"type":"api_key","setup":{"fields":[]}},"network":{"allowedHosts":["example.com"]},"operations":{}}"#;
    assert!(Connector::from_bytes(invalid).is_err());
}
