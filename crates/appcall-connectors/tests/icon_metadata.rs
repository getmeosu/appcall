use appcall_connectors::Registry;
use std::path::Path;

#[test]
fn api_host_favicons_use_curated_provider_brand_icons() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../runner/connectors");
    let registry = Registry::load(root).expect("connector registry loads");

    for (key, expected_icon, guessed_api_favicon) in [
        (
            "ably",
            "https://ably.com/favicon.svg",
            "https://main.realtime.ably.net/favicon.ico",
        ),
        (
            "adyen",
            "https://www.adyen.com/icon.svg",
            "https://management-test.adyen.com/favicon.ico",
        ),
    ] {
        let connector = registry
            .public_list()
            .find(|connector| connector.manifest().key == key)
            .unwrap_or_else(|| panic!("public connector {key} exists"));
        let manifest = connector.manifest();
        assert_ne!(
            manifest.resolved_icon_url().as_deref(),
            Some(guessed_api_favicon),
            "{key} must not use its failed API-host favicon"
        );
        assert_eq!(
            manifest.resolved_icon_url().as_deref(),
            Some(expected_icon),
            "{key} must resolve to its curated provider brand icon"
        );
    }
}
