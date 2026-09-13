use appcall_connectors::{ErrorCode, Registry};
use serde_json::Value;
use std::path::Path;

#[test]
fn curated_batch_manifests_preserve_pinned_read_only_contracts() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../runner/connectors");
    let registry = Registry::load(root).expect("checked-in connector manifests must load");
    let curated: Vec<_> = registry
        .public_list()
        .filter(|connector| {
            connector.raw_manifest()["provenance"]["source"]["url"]
                == "https://github.com/oomol-lab/open-connector"
        })
        .collect();
    assert!(curated.len() >= 2, "expected curated manifests in registry");
    assert!(curated.iter().any(|c| c.manifest().key == "attio"));
    assert!(curated.iter().any(|c| c.manifest().key == "circleci"));
    let mut operation_count = 0;
    for connector in curated {
        let manifest = connector.manifest();
        assert_eq!(
            connector.raw_manifest()["provenance"]["source"]["revision"],
            "33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a"
        );
        assert!(matches!(
            manifest.auth.setup.mode.as_str(),
            "api_key" | "oauth2"
        ));
        assert_eq!(manifest.runtime, "bun");
        assert!(!manifest.network.allowed_hosts.is_empty());
        for (operation_key, operation) in &manifest.operations {
            operation_count += 1;
            assert_eq!(operation.side_effect, "read");
            assert!(operation.timeout_ms > 0);
            assert!(operation.max_input_bytes > 0);
            assert!(operation.max_response_bytes > 0);
            assert!(operation.max_response_bytes >= operation.max_input_bytes);
            if let Err(error) = operation.validate_input(&Value::Null) {
                assert_ne!(
                    error.code(),
                    ErrorCode::UnsupportedSchema,
                    "{}/{} input: {error}",
                    manifest.key,
                    operation_key
                );
            }
            if let Err(error) = operation.validate_output(&Value::Null) {
                assert_ne!(
                    error.code(),
                    ErrorCode::UnsupportedSchema,
                    "{}/{} output: {error}",
                    manifest.key,
                    operation_key
                );
            }
        }
    }
    assert!(
        operation_count >= 14,
        "curated manifests must expose operations"
    );
}
