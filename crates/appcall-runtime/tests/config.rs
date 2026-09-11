use appcall_runtime::*;
use std::collections::BTreeMap;
fn env() -> BTreeMap<String, String> {
    BTreeMap::from([
        (
            "APPCALL_DATABASE_URL".into(),
            "postgres://localhost/appcall?sslmode=disable".into(),
        ),
        ("APPCALL_SECRET_KEY".into(), "ab".repeat(32)),
        ("APPCALL_OAUTH_STATE_SECRET".into(), "cd".repeat(32)),
        ("APPCALL_RUNNER_URL".into(), "http://127.0.0.1:5081".into()),
    ])
}
#[test]
fn go_configuration_and_google_alias_are_preserved() {
    let mut e = env();
    e.insert("APPCALL_GOOGLE_OAUTH_CLIENT_ID".into(), "google-id".into());
    e.insert("APPCALL_GOOGLE_OAUTH_CLIENT_SECRET".into(), "secret".into());
    e.insert(
        "APPCALL_GOOGLE_OAUTH_REDIRECT_URI".into(),
        "https://example.com/callback".into(),
    );
    let c = Config::from_map(&e).unwrap();
    assert_eq!(c.oauth_apps()["google-workspace"].client_id, "google-id");
    assert_eq!(c.vault_key(), &[0xab; 32]);
}
#[test]
fn production_configuration_fails_closed_without_disclosing_values() {
    let mut e = env();
    e.insert("APPCALL_ENV".into(), "production".into());
    assert!(Config::from_map(&e).is_err());
    e.insert("APPCALL_RUNNER_TOKEN".into(), "runner-secret".into());
    assert!(Config::from_map(&e).is_ok());
    e.insert("APPCALL_SECRET_KEY".into(), "invalid-secret".into());
    let error = Config::from_map(&e).err().unwrap();
    assert!(!error.to_string().contains("invalid-secret"));
}
#[test]
fn key_alias_conflicts_are_rejected() {
    let mut e = env();
    e.insert("APPCALL_VAULT_MASTER_KEY".into(), "ef".repeat(32));
    assert!(Config::from_map(&e).is_err());
}
#[test]
fn canonical_google_prefix_wins_and_unconfigured_apps_stay_absent() {
    let mut e = env();
    e.insert("APPCALL_GOOGLE_OAUTH_CLIENT_ID".into(), "legacy".into());
    e.insert(
        "APPCALL_GOOGLE_WORKSPACE_OAUTH_CLIENT_ID".into(),
        "canonical".into(),
    );
    let c = Config::from_map(&e).unwrap();
    assert_eq!(c.oauth_apps().len(), 1);
    assert_eq!(c.oauth_apps()["google-workspace"].client_id, "canonical");
}
#[test]
fn development_state_is_ephemeral_but_production_requires_shared_state() {
    let mut e = env();
    e.remove("APPCALL_OAUTH_STATE_SECRET");
    assert!(Config::from_map(&e).is_ok());
    e.insert("APPCALL_ENV".into(), "production".into());
    e.insert("APPCALL_RUNNER_TOKEN".into(), "fixture".into());
    assert!(Config::from_map(&e).is_err());
}

#[test]
fn production_case_does_not_bypass_shared_secret_requirements() {
    let mut e = env();
    e.insert("APPCALL_ENV".into(), "PRODUCTION".into());
    assert!(Config::from_map(&e).is_err());
}
#[test]
fn policy_snapshot_maps_go_limits_and_does_not_reread_environment() {
    let mut e = env();
    for (key, value) in [
        ("APPCALL_ACTION_CALLS_SOFT_LIMIT", "2"),
        ("APPCALL_ACTION_CALLS_HARD_LIMIT", "3"),
        ("APPCALL_SEND_CAP", "4"),
        ("APPCALL_SPEND_CAP_MICROS", "5"),
        ("APPCALL_SEND_COST_MICROS", "6"),
        ("APPCALL_UNIPILE_MAX_ACCOUNTS", "7"),
        ("APPCALL_LINKEDIN_INVITE_DAILY_CAP", "8"),
        ("APPCALL_LINKEDIN_INVITE_WEEKLY_CAP", "9"),
        ("APPCALL_LINKEDIN_MESSAGE_DAILY_CAP", "10"),
        ("APPCALL_LINKEDIN_MESSAGE_WEEKLY_CAP", "11"),
        ("APPCALL_LINKEDIN_PROFILE_VIEW_DAILY_CAP", "12"),
        ("APPCALL_LINKEDIN_INVITE_MIN_SPACING_SECONDS", "13"),
        ("APPCALL_LINKEDIN_MESSAGE_MIN_SPACING_SECONDS", "14"),
        ("APPCALL_LINKEDIN_INVITE_NOTED_MONTHLY_CAP", "15"),
        ("APPCALL_LINKEDIN_WARMUP_DISABLED", " YES "),
        ("APPCALL_PUBLIC_BASE_URL", "https://example.com"),
        ("APPCALL_WEBHOOK_SIGNING_SECRET", "webhook-secret"),
    ] {
        e.insert(key.into(), value.into());
    }
    let c = Config::from_map(&e).unwrap();
    e.clear();
    let p = c.policy_config();
    assert_eq!(
        [
            p.defaults.action_calls_soft,
            p.defaults.action_calls_hard,
            p.defaults.send_cap,
            p.defaults.spend_cap_micros,
            p.send_cost_micros,
            c.unipile_max_accounts(),
            p.linkedin.invite_daily_cap,
            p.linkedin.invite_weekly_cap,
            p.linkedin.message_daily_cap,
            p.linkedin.message_weekly_cap,
            p.linkedin.profile_view_daily_cap,
            p.linkedin.invite_spacing_seconds,
            p.linkedin.message_spacing_seconds,
            p.linkedin.invite_noted_monthly_cap
        ],
        [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
    );
    assert!(!p.linkedin.warmup_enabled);
    assert_eq!(p.public_base_url, "https://example.com");
    assert_eq!(p.webhook_secret, "webhook-secret");
}
#[test]
fn policy_defaults_and_invalid_numbers_match_go() {
    let p = Config::from_map(&env()).unwrap().policy_config();
    assert!(p.linkedin.warmup_enabled);
    assert_eq!(p.defaults.send_cap, 0);
    for key in [
        "APPCALL_ACTION_CALLS_SOFT_LIMIT",
        "APPCALL_ACTION_CALLS_HARD_LIMIT",
        "APPCALL_SEND_CAP",
        "APPCALL_SPEND_CAP_MICROS",
        "APPCALL_SEND_COST_MICROS",
        "APPCALL_UNIPILE_MAX_ACCOUNTS",
        "APPCALL_LINKEDIN_INVITE_DAILY_CAP",
        "APPCALL_LINKEDIN_INVITE_WEEKLY_CAP",
        "APPCALL_LINKEDIN_MESSAGE_DAILY_CAP",
        "APPCALL_LINKEDIN_MESSAGE_WEEKLY_CAP",
        "APPCALL_LINKEDIN_PROFILE_VIEW_DAILY_CAP",
        "APPCALL_LINKEDIN_INVITE_MIN_SPACING_SECONDS",
        "APPCALL_LINKEDIN_MESSAGE_MIN_SPACING_SECONDS",
        "APPCALL_LINKEDIN_INVITE_NOTED_MONTHLY_CAP",
    ] {
        for value in ["-1", "1.5", "invalid", "9223372036854775808"] {
            let mut e = env();
            e.insert(key.into(), value.into());
            assert!(Config::from_map(&e).is_err(), "{key} {value}");
        }
    }
    for value in ["0", "false", "unexpected", ""] {
        let mut e = env();
        e.insert("APPCALL_LINKEDIN_WARMUP_DISABLED".into(), value.into());
        assert!(
            Config::from_map(&e)
                .unwrap()
                .policy_config()
                .linkedin
                .warmup_enabled
        );
    }
}

#[test]
fn mcp_origin_allowlist_is_explicit_and_falls_back_to_public_base_url() {
    let mut e = env();
    e.insert(
        "APPCALL_PUBLIC_BASE_URL".into(),
        "https://dashboard.example/".into(),
    );
    assert_eq!(
        Config::from_map(&e).unwrap().mcp_allowed_origins(),
        &["https://dashboard.example/".to_owned()]
    );

    e.insert(
        "APPCALL_MCP_ALLOWED_ORIGINS".into(),
        "https://one.example, https://two.example".into(),
    );
    assert_eq!(
        Config::from_map(&e).unwrap().mcp_allowed_origins(),
        &[
            "https://one.example".to_owned(),
            "https://two.example".to_owned()
        ]
    );
}

#[test]
fn malformed_mcp_origin_allowlist_fails_closed() {
    let mut e = env();
    e.insert(
        "APPCALL_MCP_ALLOWED_ORIGINS".into(),
        "https://one.example,".into(),
    );
    assert!(Config::from_map(&e).is_err());
}
