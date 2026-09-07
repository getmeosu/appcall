use appcall_runtime::{oauth_apps_from_map, policy_from_map, unipile_limit_from_map};
use std::collections::BTreeMap;

#[test]
fn settings_are_available_without_storage_or_runner_configuration() {
    let env = BTreeMap::from([
        ("APPCALL_ACTION_CALLS_HARD_LIMIT".into(), " 7 ".into()),
        ("APPCALL_UNIPILE_MAX_ACCOUNTS".into(), "3".into()),
        ("APPCALL_GOOGLE_OAUTH_CLIENT_ID".into(), "legacy".into()),
        (
            "APPCALL_GOOGLE_WORKSPACE_OAUTH_CLIENT_ID".into(),
            " canonical ".into(),
        ),
        (
            "APPCALL_GOOGLE_WORKSPACE_OAUTH_CLIENT_SECRET".into(),
            " synthetic-secret ".into(),
        ),
        (
            "APPCALL_GOOGLE_WORKSPACE_OAUTH_REDIRECT_URI".into(),
            " https://example.test/callback ".into(),
        ),
    ]);
    assert_eq!(policy_from_map(&env).unwrap().defaults.action_calls_hard, 7);
    assert_eq!(unipile_limit_from_map(&env).unwrap(), 3);
    let apps = oauth_apps_from_map(&env);
    assert_eq!(apps.len(), 1);
    let google = &apps["google-workspace"];
    assert_eq!(google.client_id, "canonical");
    assert_eq!(google.client_secret, "synthetic-secret");
    assert_eq!(google.redirect_uri, "https://example.test/callback");
}

#[test]
fn storage_independent_limits_reject_invalid_or_negative_values() {
    for value in ["-1", "invalid", "9223372036854775808"] {
        let env = BTreeMap::from([
            ("APPCALL_SEND_CAP".into(), value.into()),
            ("APPCALL_UNIPILE_MAX_ACCOUNTS".into(), value.into()),
        ]);
        assert!(policy_from_map(&env).is_err());
        assert!(unipile_limit_from_map(&env).is_err());
    }
    assert_eq!(unipile_limit_from_map(&BTreeMap::new()).unwrap(), 0);
}
