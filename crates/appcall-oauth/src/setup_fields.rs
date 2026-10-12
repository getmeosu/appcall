//! HEALTH-RT-1/1b: non-secret connection metadata that may reach healthcheck
//! input. Two sources, both allowlisted and never secret:
//! - declared setup fields with `secret: false` submitted at authorization start;
//! - provider metadata returned with the token (`api_domain`, `instance_url`),
//!   kept only when it is a plain https origin on the manifest's allowed hosts.
use crate::{Error, Result, TokenSet};
use appcall_connectors::Manifest;
use std::collections::BTreeMap;

/// Token-response keys that may be captured. Anything else is discarded.
pub const PROVIDER_METADATA_KEYS: [&str; 2] = ["api_domain", "instance_url"];

fn setup_keys(manifest: &Manifest, secret: bool) -> Vec<&str> {
    let setup = &manifest.auth.setup;
    setup
        .fields
        .iter()
        .chain(setup.routes.iter().flat_map(|route| route.fields.iter()))
        .filter(|field| field.secret == secret)
        .map(|field| field.key.as_str())
        .collect()
}

/// Validate setup values submitted at authorization start. Every key must be a
/// declared NON-secret setup field; undeclared or secret keys are rejected.
pub fn validate_setup_fields(
    manifest: &Manifest,
    setup: &BTreeMap<String, String>,
) -> Result<BTreeMap<String, String>> {
    let allowed = setup_keys(manifest, false);
    if setup.len() > 16 {
        return Err(Error::InvalidInput);
    }
    let mut out = BTreeMap::new();
    for (key, value) in setup {
        if !allowed.contains(&key.as_str())
            || value.len() > 512
            || value.chars().any(char::is_control)
        {
            return Err(Error::InvalidInput);
        }
        let value = value.trim();
        if !value.is_empty() {
            out.insert(key.clone(), value.to_owned());
        }
    }
    Ok(out)
}

/// Shape-check provider metadata at capture time: https origin only (no
/// userinfo, query or fragment), bounded length. Host policy is applied on read.
pub(crate) fn capture_provider_metadata(raw: &serde_json::Value) -> BTreeMap<String, String> {
    let mut out = BTreeMap::new();
    for key in PROVIDER_METADATA_KEYS {
        if let Some(value) = raw.get(key).and_then(serde_json::Value::as_str) {
            if origin_host(value).is_some() {
                out.insert(key.to_owned(), value.trim_end_matches('/').to_owned());
            }
        }
    }
    out
}

fn origin_host(value: &str) -> Option<String> {
    if value.len() > 512 || value.chars().any(char::is_control) {
        return None;
    }
    let url = reqwest::Url::parse(value).ok()?;
    if url.scheme() != "https"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || url.port().is_some()
        || !matches!(url.path(), "" | "/")
    {
        return None;
    }
    url.host_str().map(str::to_ascii_lowercase)
}

fn host_allowed(manifest: &Manifest, host: &str) -> bool {
    manifest.network.allowed_hosts.iter().any(|pattern| {
        let pattern = pattern.to_ascii_lowercase();
        match pattern.strip_prefix("*.") {
            Some(suffix) => host.len() > suffix.len() + 1 && host.ends_with(&format!(".{suffix}")),
            None => host == pattern,
        }
    })
}

/// Non-secret fields to add to HEALTHCHECK input only. Stored setup values are
/// re-filtered against the current manifest; provider metadata must be on the
/// manifest's allowed hosts and must not collide with a secret setup field.
/// Existing keys (the credential) are never overwritten.
pub fn merge_health_fields(
    manifest: &Manifest,
    tokens: &TokenSet,
    fields: &mut BTreeMap<String, String>,
) {
    let non_secret = setup_keys(manifest, false);
    let secret = setup_keys(manifest, true);
    for (key, value) in &tokens.setup_fields {
        if non_secret.contains(&key.as_str()) && !fields.contains_key(key) {
            fields.insert(key.clone(), value.clone());
        }
    }
    for (key, value) in &tokens.provider_fields {
        if !PROVIDER_METADATA_KEYS.contains(&key.as_str())
            || secret.contains(&key.as_str())
            || fields.contains_key(key)
        {
            continue;
        }
        if origin_host(value).is_some_and(|host| host_allowed(manifest, &host)) {
            fields.insert(key.clone(), value.clone());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn manifest() -> Manifest {
        serde_json::from_value(serde_json::json!({
            "key": "x",
            "auth": {"type": "oauth2", "setup": {"mode": "oauth2", "fields": [
                {"key": "instance_host", "label": "Host", "required": false, "secret": false},
                {"key": "api_domain", "label": "Shadow", "required": false, "secret": true}
            ]}},
            "network": {"allowedHosts": ["*.my.salesforce.com", "recruit.zoho.eu"]}
        }))
        .unwrap()
    }
    #[test]
    fn capture_keeps_only_allowlisted_https_origins() {
        let captured = capture_provider_metadata(&serde_json::json!({
            "instance_url": "https://acme.my.salesforce.com/",
            "api_domain": "https://user:pw@recruit.zoho.eu",
            "id_token": "https://acme.my.salesforce.com",
            "refresh_token": "secret"
        }));
        assert_eq!(
            captured,
            BTreeMap::from([(
                "instance_url".into(),
                "https://acme.my.salesforce.com".into()
            )])
        );
        for bad in [
            "http://acme.my.salesforce.com",
            "https://acme.my.salesforce.com/path",
            "https://acme.my.salesforce.com?q=1",
            "https://acme.my.salesforce.com:8443",
            "not a url",
        ] {
            assert!(
                capture_provider_metadata(&serde_json::json!({ "instance_url": bad })).is_empty()
            );
        }
    }
    #[test]
    fn health_merge_applies_host_allowlist_and_never_shadows_secrets_or_credentials() {
        let tokens = TokenSet::decode(br#"{"accessToken":"t","expiresAt":"2999-01-01T00:00:00Z","setupFields":{"instance_host":"acme.my.salesforce.com","gone":"x"},"providerFields":{"instance_url":"https://evil.example.com","api_domain":"https://recruit.zoho.eu"}}"#).unwrap();
        let mut fields = BTreeMap::from([("accessToken".to_string(), "t".to_string())]);
        merge_health_fields(&manifest(), &tokens, &mut fields);
        // instance_url host not allowed; api_domain collides with a secret field.
        assert_eq!(
            fields.keys().map(String::as_str).collect::<Vec<_>>(),
            vec!["accessToken", "instance_host"]
        );
        let ok = TokenSet::decode(br#"{"accessToken":"t","expiresAt":"2999-01-01T00:00:00Z","providerFields":{"instance_url":"https://acme.my.salesforce.com","accessToken":"https://acme.my.salesforce.com"}}"#).unwrap();
        let mut fields = BTreeMap::from([("accessToken".to_string(), "t".to_string())]);
        merge_health_fields(&manifest(), &ok, &mut fields);
        assert_eq!(fields["accessToken"], "t");
        assert_eq!(fields["instance_url"], "https://acme.my.salesforce.com");
    }
    #[test]
    fn refresh_inherits_metadata_unless_the_response_supplies_new_values() {
        let old = TokenSet::decode(br#"{"accessToken":"a","expiresAt":"2999-01-01T00:00:00Z","setupFields":{"instance_host":"h"},"providerFields":{"instance_url":"https://a.my.salesforce.com","api_domain":"https://recruit.zoho.eu"}}"#).unwrap();
        let new = TokenSet::decode(br#"{"accessToken":"b","expiresAt":"2999-01-01T00:00:00Z","providerFields":{"instance_url":"https://b.my.salesforce.com"}}"#).unwrap();
        let merged = new.inherit_metadata(&old);
        assert_eq!(merged.setup_fields()["instance_host"], "h");
        assert_eq!(
            merged.provider_fields()["instance_url"],
            "https://b.my.salesforce.com"
        );
        assert_eq!(
            merged.provider_fields()["api_domain"],
            "https://recruit.zoho.eu"
        );
    }
}
