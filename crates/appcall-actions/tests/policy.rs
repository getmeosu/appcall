use appcall_actions::*;
use serde_json::json;
#[test]
fn linked_in_ramp_does_not_disable_hour_or_noted_month_caps() {
    let limits = LinkedInLimits::default();
    assert_eq!(
        limits.ceiling("invitation", 0),
        Ceiling {
            hour: 10,
            day: 5,
            week: 20,
            month: 5,
            spacing_seconds: 30
        }
    );
    assert_eq!(limits.ceiling("invitation", 56).day, 20);
    assert_eq!(limits.ceiling("profile_view", 14).day, 50);
}
#[test]
fn plan_lapse_drops_overrides_and_corrupt_limits_fail_closed() {
    let defaults = Entitlements::default();
    let ent = resolve_entitlements(
        Some(("growth", "past_due", json!({"send_cap":999}))),
        &defaults,
    )
    .unwrap();
    assert_eq!(ent.action_calls_hard, 300);
    assert_eq!(ent.send_cap, 0);
    assert!(resolve_entitlements(
        Some(("starter", "active", json!({"send_cap":-1}))),
        &defaults
    )
    .is_err());
}
#[test]
fn apollo_strips_untrusted_callback_and_disabled_reveal() {
    let config = PolicyConfig::default();
    let input = json!({"reveal_phone_number":true,"webhook_url":"https://evil","email":"a@b.test"});
    let value = apollo_input(&config, "people.match", "p", "c", input).unwrap();
    assert!(value.get("webhook_url").is_none());
    assert!(value.get("reveal_phone_number").is_none());
    assert_eq!(value["email"], "a@b.test");
}

#[test]
fn paid_overrides_are_validated_and_unknown_or_lapsed_plans_cannot_inherit_them() {
    let defaults = Entitlements {
        action_calls_hard: 9,
        ..Default::default()
    };
    assert_eq!(
        resolve_entitlements(None, &defaults)
            .unwrap()
            .action_calls_hard,
        9
    );
    for key in ["starter", "growth", "unknown"] {
        let e=resolve_entitlements(Some((key,"active",json!({"action_calls_soft":1,"action_calls_hard":2,"send_cap":3,"spend_cap_micros":4,"future_key":99}))),&defaults).unwrap();
        assert_eq!(
            (
                e.action_calls_soft,
                e.action_calls_hard,
                e.send_cap,
                e.spend_cap_micros
            ),
            (1, 2, 3, 4)
        );
        let lapsed = resolve_entitlements(
            Some((key, "canceled", json!({"send_cap":10000}))),
            &defaults,
        )
        .unwrap();
        assert_eq!(lapsed.action_calls_hard, 300);
    }
    for patch in [
        json!([]),
        json!({"action_calls_hard":"unlimited"}),
        json!({"spend_cap_micros":-10}),
    ] {
        assert!(resolve_entitlements(Some(("growth", "active", patch)), &defaults).is_err());
    }
}
#[test]
fn configured_linkedin_targets_cannot_cross_hard_caps_and_age_ramp_keeps_spacing() {
    let limits = LinkedInLimits {
        invite_daily_cap: 999,
        invite_weekly_cap: 999,
        invite_noted_monthly_cap: 999,
        invite_spacing_seconds: 45,
        message_daily_cap: 999,
        message_weekly_cap: 999,
        message_spacing_seconds: 35,
        profile_view_daily_cap: 999,
        ..Default::default()
    };
    let aged = limits.ceiling("invitation", 100);
    assert_eq!(
        (aged.day, aged.week, aged.month, aged.spacing_seconds),
        (25, 100, 50, 45)
    );
    let message = limits.ceiling("message", 28);
    assert_eq!(
        (
            message.hour,
            message.day,
            message.week,
            message.spacing_seconds
        ),
        (20, 19, 90, 35)
    );
    assert_eq!(limits.ceiling("profile_view", 100).day, 150);
    assert_eq!(limits.ceiling("search", -1).day, 25);
    assert_eq!(
        LinkedInLimits {
            warmup_enabled: false,
            ..Default::default()
        }
        .ceiling("invitation", 0)
        .day,
        20
    );
    assert_eq!(
        LinkedInLimits::default()
            .ceiling("message", 0)
            .spacing_seconds,
        20
    );
}
#[test]
fn apollo_callback_authenticates_project_connection_and_cannot_be_redirected_by_input() {
    use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
    use hmac::{Hmac, Mac};
    use sha2::Sha256;
    let config = PolicyConfig {
        public_base_url: "https://appcall.test".into(),
        webhook_secret: "test-only-signing-key".into(),
        ..Default::default()
    };
    let output = apollo_input(
        &config,
        "people.bulk_match",
        "project",
        "connection",
        json!({"reveal_phone_number":true,"webhook_url":"https://attacker.test"}),
    )
    .unwrap();
    let callback = url::Url::parse(output["webhook_url"].as_str().unwrap()).unwrap();
    assert_eq!(callback.host_str(), Some("appcall.test"));
    assert_eq!(
        callback.path(),
        "/v1/connections/connection/webhooks/apollo"
    );
    let token = callback
        .query_pairs()
        .find(|(k, _)| k == "token")
        .unwrap()
        .1
        .into_owned();
    let (payload, signature) = token.split_once('.').unwrap();
    let mut verifier = Hmac::<Sha256>::new_from_slice(config.webhook_secret.as_bytes()).unwrap();
    verifier.update(payload.as_bytes());
    verifier
        .verify_slice(&URL_SAFE_NO_PAD.decode(signature).unwrap())
        .unwrap();
    let claims: serde_json::Value =
        serde_json::from_slice(&URL_SAFE_NO_PAD.decode(payload).unwrap()).unwrap();
    assert_eq!(claims, json!({"p":"project","c":"connection","k":"apollo"}));
    let no_reveal = apollo_input(
        &config,
        "people.match",
        "p",
        "c",
        json!({"webhook_url":"https://attacker.test"}),
    )
    .unwrap();
    assert!(no_reveal.get("webhook_url").is_none());
    for base in [
        "http://appcall.test",
        "https://user:password@appcall.test",
        "https://appcall.test?route=evil",
        "https://appcall.test#fragment",
        "invalid",
    ] {
        let bad = PolicyConfig {
            public_base_url: base.into(),
            ..config.clone()
        };
        assert!(apollo_input(
            &bad,
            "people.match",
            "p",
            "c",
            json!({"reveal_phone_number":true})
        )
        .is_err());
    }
}
