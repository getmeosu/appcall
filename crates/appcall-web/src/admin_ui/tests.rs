use super::*;
use serde_json::json;
#[test]
fn signal_revoke_recovery_uses_account_anchor_and_renders_honest_feedback() {
    assert_eq!(
        failure_target("/app/settings/account/sessions/session-one/revoke"),
        Some("/app/settings/account?error=revoke#account-sessions")
    );
    for (key, value, role) in [("revoked", "1", "status"), ("error", "revoke", "alert")] {
        let html = hint("/app/settings/account", key, value);
        assert!(
            html.contains("Review the sessions list before repeating a revocation."),
            "{html}"
        );
        assert!(html.contains(&format!("role=\"{role}\"")), "{html}");
        assert!(!html.contains("Session revoked"));
    }
}
fn hint(path: &str, key: &str, value: &str) -> String {
    flash(&Request {
        method: "GET",
        path,
        cookies: "",
        origin: None,
        referer: None,
        fields: [(key.into(), vec![value.into()])].into(),
        now: 100,
    })
    .unwrap()
}
#[test]
fn copy_query_hints_do_not_confirm_mutations() {
    for (path, key, value, message) in [
        (
            "/app/settings/team",
            "invited",
            "1",
            "Check the members list before sending another invitation.",
        ),
        (
            "/app/settings/team",
            "removed",
            "1",
            "Review the members list before repeating a removal.",
        ),
        (
            "/app/settings/team",
            "role",
            "updated",
            "Review the member&#39;s current role before making another change.",
        ),
        (
            "/app/sessions",
            "revoked",
            "1",
            "Review the sessions list before repeating a revocation.",
        ),
        (
            "/app/settings/account",
            "password",
            "changed",
            "Review your account security settings before making another change.",
        ),
        (
            "/app/settings/organization",
            "saved",
            "1",
            "Check the current organisation name before making another change.",
        ),
    ] {
        let html = hint(path, key, value);
        assert!(html.contains(message), "{html}");
        assert!(html.contains("role=\"status\""));
        for receipt in [
            "successfully",
            "settings saved",
            "Password changed",
            "Invitation sent",
            "Member removed",
            "Session revoked",
        ] {
            assert!(!html.contains(receipt));
        }
        assert!(hint(path, key, "unknown").is_empty());
    }
}
#[test]
fn copy_recovery_hints_do_not_invent_causes() {
    for (path, topic, message) in [
        (
            "/app/settings/team",
            "invite",
            "Check the members list before sending another invitation.",
        ),
        (
            "/app/settings/team",
            "remove",
            "Review the members list before repeating a removal.",
        ),
        (
            "/app/settings/team",
            "role",
            "Review the member&#39;s current role before making another change.",
        ),
        (
            "/app/sessions",
            "revoke",
            "Review the sessions list before repeating a revocation.",
        ),
        (
            "/app/settings/organization",
            "org",
            "Check the current organisation name before making another change.",
        ),
        (
            "/app/settings/account",
            "setup",
            "Review your account security settings before making another change.",
        ),
        (
            "/app/settings/account",
            "verify",
            "Review your account security settings before making another change.",
        ),
        (
            "/app/settings/account",
            "disable",
            "Review your account security settings before making another change.",
        ),
        (
            "/app/settings/account",
            "password",
            "Review your account security settings before making another change.",
        ),
        (
            "/app/settings/billing",
            "checkout",
            "Check your billing status before starting another checkout.",
        ),
        (
            "/app/settings/billing",
            "portal",
            "Open Support for help accessing billing settings.",
        ),
    ] {
        let html = hint(path, "error", topic);
        assert!(html.contains(message), "{html}");
        assert!(html.contains("role=\"alert\""));
        for cause in [
            "Failed to",
            "Could not",
            "Check your current password",
            "Check your verification code",
        ] {
            assert!(!html.contains(cause));
        }
        assert!(hint(path, "error", "unknown").is_empty());
    }
}
#[test]
fn copy_admin_controls_name_the_result() {
    let form = crate::admin::form(
        "/app/settings/organization",
        &[("name", "Organization name", "text", "Acme")],
    );
    assert!(form.contains("Rename organisation"));
    assert!(form.contains("method=\"post\""));
    assert!(form.contains("action=\"/app/settings/organization\""));
    assert!(form.contains("name=\"name\""));
    let empty = billing(Err(Error::Unavailable), Ok(json!({"plans":[]})));
    assert!(empty.contains("No plans are available."));
    assert!(empty.contains("href=\"/app/support\""));
    assert!(empty.contains("ui-button"));
}
#[test]
fn copy_sessions_empty_state_never_claims_activity() {
    let sessions = crate::admin::session_empty_state(true);
    assert!(sessions.contains("No sessions to show."));
    assert!(!sessions.contains("href="));
    assert!(crate::admin::session_empty_state(false).is_empty());
}
#[test]
fn copy_organisation_hint_links_to_current_settings_without_query() {
    let hint = flash(&Request {
        method: "GET",
        path: "/app/settings/organization",
        cookies: "",
        origin: None,
        referer: None,
        fields: [
            ("error".into(), vec!["org".into()]),
            ("name".into(), vec!["<attempted>".into()]),
        ]
        .into(),
        now: 100,
    })
    .unwrap();
    assert!(hint.contains("href=\"/app/settings/organization\""));
    assert!(hint.contains("ui-button-quiet"));
    assert!(!hint.contains("?name="));
    assert!(!hint.contains("settings saved"));
    let form = crate::admin::form(
        "/app/settings/organization",
        &[("name", "Organization name", "text", "<attempted>")],
    );
    assert!(form.contains("value=\"&lt;attempted&gt;\""));
}
#[test]
fn copy_plan_prices_require_known_metadata_and_preserve_cents() {
    for plan in [
        json!({"price":2900}),
        json!({"price":2900,"currency":"USD"}),
        json!({"price":2900,"currency":"USD","billingInterval":"mystery"}),
    ] {
        assert!(billing(Ok(json!({})), Ok(json!({"plans":[plan]}))).contains("Price unavailable"));
    }
    assert_eq!(
        crate::admin::plan_price(i64::MAX, "USD", "month"),
        "$92233720368547758.07/mo"
    );
}
#[test]
fn copy_billing_dates_reject_malformed_timestamp_suffixes() {
    for date in [
        "2026-10-01garbage",
        "2026-10-01T25:00:00Z",
        "2026-10-01T01:60:00Z",
        "2026-10-01T01:00:00+25:00",
        "2026-10-01T01:00:00.Z",
    ] {
        assert!(
            !billing(
                Ok(json!({"currentPeriodEnd":date})),
                Ok(json!({"plans":[]}))
            )
            .contains("<time>"),
            "{date}"
        );
    }
    for date in [
        "2026-10-01",
        "2026-10-01T01:00:00Z",
        "2026-10-01T01:00:00.123+05:30",
    ] {
        assert!(billing(
            Ok(json!({"currentPeriodEnd":date})),
            Ok(json!({"plans":[]}))
        )
        .contains("<time>Oct 1, 2026</time>"));
    }
}
#[test]
fn copy_billing_checkout_requires_a_valid_supplied_plan_id() {
    for id in [Value::Null, json!(""), json!("bad/id"), json!(42)] {
        let html = billing(
            Ok(json!({})),
            Ok(
                json!({"plans":[{"id":id,"name":"Recorded plan","price":2900,"currency":"USD","billingInterval":"month"}]}),
            ),
        );
        assert!(html.contains("Recorded plan"));
        assert!(html.contains("$29.00/mo"));
        assert!(!html.contains("action=\"/app/settings/billing/checkout\""));
    }
    let valid = billing(
        Ok(json!({})),
        Ok(json!({"plans":[{"id":"plan_1","name":"Recorded plan"}]})),
    );
    assert!(valid.contains("Price unavailable"));
    assert!(valid.contains("action=\"/app/settings/billing/checkout\""));
    assert!(valid.contains("value=\"plan_1\""));
}
#[test]
fn copy_billing_missing_data_never_invents_state_or_amounts() {
    let plans = json!({"plans":[{"name":"Pro","id":"pro","price":2900,"currency":"USD","billingInterval":"month"}]});
    for status in [
        Err(Error::Unavailable),
        Ok(Value::Null),
        Ok(json!(4)),
        Ok(json!({})),
        Ok(json!({"billingStatus":"mystery"})),
    ] {
        let html = billing(status, Ok(plans.clone()));
        assert!(!html.contains("No subscription"), "{html}");
        assert!(!html.contains("No active plan"));
        assert!(html.contains("Credits unavailable"));
        assert!(html.contains("$29.00/mo"));
        assert!(!html.contains("Manage billing"));
    }
    for value in [
        json!({"subscriptionCredits":10}),
        json!({"purchasedCredits":10}),
        json!({"subscriptionCredits":"0","purchasedCredits":0}),
        json!({"subscriptionCredits":i64::MAX,"purchasedCredits":1}),
    ] {
        assert!(billing(Ok(value), Ok(plans.clone())).contains("Credits unavailable"));
    }
    let zero = billing(
        Ok(
            json!({"billingStatus":"active","plan":{"name":"Known"},"subscriptionCredits":0,"purchasedCredits":0}),
        ),
        Ok(plans.clone()),
    );
    assert!(zero.contains(">0</p>"));
    assert!(zero.contains("Known"));
    assert!(zero.contains("Manage billing"));
    let partial = billing(
        Ok(json!({"plan":{"name":"Recorded"},"subscriptionCredits":7,"purchasedCredits":2})),
        Ok(plans.clone()),
    );
    assert!(partial.contains("Recorded"));
    assert!(partial.contains(">9</p>"));
    assert!(partial.contains("Subscription status unavailable"));
    for (status, eligible) in [
        (json!({"billingStatus":"active","plan":{}}), true),
        (json!({"billingStatus":"ACTIVE","plan":{}}), true),
        (json!({"billingStatus":"active","plan":null}), false),
        (json!({"billingStatus":"active","plan":"Pro"}), false),
        (json!({"billingStatus":"canceled","plan":{}}), false),
    ] {
        assert_eq!(
            billing(Ok(status), Ok(plans.clone())).contains("Manage billing"),
            eligible
        );
    }
    for plans in [
        Err(Error::Unavailable),
        Ok(Value::Null),
        Ok(json!({"plans":[null]})),
        Ok(json!({"plans":{}})),
    ] {
        let html = billing(Ok(json!({"billingStatus":"past_due"})), plans);
        assert!(html.contains("Could not load plans."));
        assert!(!html.contains("No plans are available."));
        assert!(html.contains("Past due"));
    }
    for date in ["2026-10-01T00:00:00Z", "garbage", "2026-02-31T00:00:00Z"] {
        let html = billing(
            Ok(json!({"billingStatus":"canceled","currentPeriodEnd":date})),
            Ok(plans.clone()),
        );
        assert!(!html.contains("Renews"));
        if date != "2026-10-01T00:00:00Z" {
            assert!(!html.contains("<time>"));
        }
    }
    for price in [Value::Null, json!("free"), json!({})] {
        let html = billing(
            Ok(json!({})),
            Ok(json!({"plans":[{"id":"pro","name":"Pro","price":price}]})),
        );
        assert!(html.contains("Price unavailable"));
        assert!(!html.contains("0.00"));
    }
}
#[test]
fn settings_hub_exposes_all_subpages_and_verified_project() {
    let html = settings("proj_verified", "Project", "Organization");
    for path in ["organization", "account", "billing", "white-labeling"] {
        assert!(html.contains(&format!("href=\"/app/settings/{path}\"")));
    }
    assert!(html.contains("proj_verified"));
    assert!(html.contains("href=\"/app/usage\""));
    for path in ["/app/settings/team", "/app/support"] {
        assert!(html.contains(&format!("href=\"{path}\"")), "missing {path}");
    }
    assert!(!html.contains("href=\"/app/sessions\""));
}
#[test]
fn billing_preserves_partial_failures_and_only_active_portal() {
    let active = billing(
        Ok(
            json!({"billingStatus":"active","plan":{"name":"Pro"},"subscriptionCredits":900,"purchasedCredits":120,"currentPeriodEnd":"2026-10-01T00:00:00Z"}),
        ),
        Err(crate::Error::Unavailable),
    );
    assert!(active.contains("1,020"));
    assert!(active.contains("Manage billing"));
    assert!(active.contains("Could not load plans."));
    let inactive = billing(
        Ok(json!({"billingStatus":"past_due"})),
        Ok(json!({"plans":[]})),
    );
    assert!(inactive.contains("Past due"));
    assert!(!inactive.contains("Manage billing"));
    assert!(inactive.contains("No plans are available."));
}
#[test]
fn redirect_errors_are_fixed_and_unknown_paths_fail_closed() {
    assert_eq!(
        failure_target("/app/settings/team/member-1/remove"),
        Some("/app/settings/team?error=remove")
    );
    assert_eq!(
        failure_target("/app/settings/billing/portal"),
        Some("/app/settings/billing?error=portal")
    );
    assert_eq!(failure_target("/app/settings/team/x/unknown"), None);
}
