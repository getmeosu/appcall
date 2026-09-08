use serde_json::{json, Value};

fn event(seq: u64, kind: &str, at: &str, detail: Value) -> Value {
    json!({
        "seq": seq,
        "kind": kind,
        "at": at,
        "detail": detail,
    })
}

fn payload() -> Value {
    json!({
        "run": {
            "id": "run-42",
            "connector": "github",
            "tool": "issues.list",
            "accountId": "acct-7",
            "health": "running",
            "currentCursor": "cursor-42",
            "attemptsSpent": 4,
            "attemptsRemaining": 6,
            // A queue-row maximum must not become a historical policy
            // fallback when the detail reader has no recorded policy.
            "maxAttempts": 999
        },
        "history": {
            "complete": true,
            "events": []
        },
        "historyAccountScope": "acct-7",
        "recordsObserved": 0,
        "recordsPartial": false,
        "pagination": {
            "hasMore": false
        }
    })
}

fn render(value: &Value) -> String {
    super::standalone(value, "run-42").expect("run detail should render")
}

#[test]
fn run_detail_controls_require_trusted_authority_and_preserve_recovery() {
    let mut value = payload();
    value["run"]["runNowAllowed"] = json!(true);
    value["run"]["resetAllowed"] = json!(true);
    value["run"]["cancelAllowed"] = json!(true);
    assert!(!render(&value).contains("data-runs-control"));
    value["operatorAuthorized"] = json!(true);
    value["operatorControlsUnavailable"] = json!(false);
    let html = render(&value);
    for action in ["run-now", "reset", "cancel"] {
        assert!(html.contains(&format!("action=\"/app/runs/run-42/{action}\"")));
    }
    assert!(html.contains("data-runs-page"));
    assert!(html.contains("id=\"runs-live-status\""));
    assert!(html.contains("id=\"runs-recovery\""));
    assert!(html.contains("preserves the current cursor"));
    assert!(html.contains("cannot be recalled"));
    assert_eq!(
        html.matches("name=\"externalAccountId\" type=\"hidden\" value=\"acct-7\"")
            .count(),
        3
    );
    value["historyAccountScope"] = json!("");
    assert!(!render(&value).contains("name=\"externalAccountId\""));
    for bad in [json!(null), json!("true"), json!(false)] {
        value["operatorAuthorized"] = bad;
        assert!(!render(&value).contains("data-runs-control"));
    }
}

#[test]
fn run_detail_renders_persisted_events_without_synthesizing_attempts() {
    let mut value = payload();
    value["run"]["attemptsSpent"] = json!(99);
    value["history"]["events"] = json!([
        event(
            17,
            "scheduled",
            "2026-09-09T12:00:00Z",
            json!({"reason":"run_now"})
        ),
        event(
            18,
            "page",
            "2026-09-09T12:00:03Z",
            json!({
                "recordsWritten":25,
                "hasMore":true
            })
        )
    ]);

    let html = render(&value);
    for expected in [
        "data-event-seq=\"17\"",
        "scheduled",
        "2026-09-09T12:00:00Z",
        "Run now",
        "data-event-seq=\"18\"",
        "page",
        "2026-09-09T12:00:03Z",
        "25",
    ] {
        assert!(html.contains(expected), "missing {expected}: {html}");
    }
    assert!(
        !html.contains("run_now"),
        "raw reason leaked into the UI: {html}"
    );
    assert_eq!(html.matches("data-event-seq=").count(), 2);
    assert!(
        !html.contains("data-event-seq=\"99\""),
        "attempt count must not become a fabricated event: {html}"
    );
}

#[test]
fn run_detail_marks_page_as_progress_not_error() {
    let mut value = payload();
    value["history"]["events"] = json!([event(
        19,
        "page",
        "2026-09-09T12:01:00Z",
        json!({"recordsWritten":25,"hasMore":false})
    )]);

    let html = render(&value);
    assert!(
        html.contains("Page progress"),
        "page is not progress: {html}"
    );
    assert!(
        html.contains("ui-state-running"),
        "missing progress state: {html}"
    );
    assert!(
        !html.contains("ui-state-dead"),
        "page rendered as dead: {html}"
    );
    assert!(!html.contains("Error"), "page rendered as an error: {html}");
}

#[test]
fn run_detail_warns_when_history_is_incomplete() {
    let mut value = payload();
    value["history"]["complete"] = json!(false);
    value["history"]["notice"] = json!("Earlier run history is unavailable.");
    value["history"]["events"] = json!([event(21, "succeeded", "2026-09-09T12:02:00Z", json!({}))]);

    let html = render(&value);
    assert!(
        html.contains("Earlier run history is unavailable"),
        "missing explicit history boundary: {html}"
    );
    assert!(
        html.contains("ui-state-warn"),
        "missing warning state: {html}"
    );
}

#[test]
fn run_detail_renders_live_empty_history_state() {
    let html = render(&payload());
    assert!(html.contains("run-detail-events-empty"));
    assert!(html.contains("role=\"status\""));
    assert!(html.contains("aria-live=\"polite\""));
    assert!(html.contains("No persisted run events recorded."));
}

#[test]
fn run_detail_fails_closed_when_history_completion_flag_missing_or_invalid() {
    for invalid in [None, Some(json!(null)), Some(json!("true")), Some(json!(1))] {
        let mut value = payload();
        if let Some(flag) = invalid {
            value["history"]["complete"] = flag;
        } else {
            value["history"]
                .as_object_mut()
                .expect("history object")
                .remove("complete");
        }

        let html = render(&value);
        assert!(
            html.contains("Earlier run history is unavailable"),
            "missing fail-closed history notice: {html}"
        );
        assert!(
            html.contains("ui-state-warn"),
            "missing warning state: {html}"
        );
    }
}

#[test]
fn run_detail_labels_records_observed_as_partial() {
    let mut value = payload();
    value["recordsObserved"] = json!(25);
    value["recordsPartial"] = json!(true);

    let html = render(&value);
    assert!(
        html.contains("Records observed"),
        "ambiguous records label: {html}"
    );
    assert!(html.contains("25"), "missing observed count: {html}");
    assert!(
        html.to_ascii_lowercase().contains("partial"),
        "missing partial qualifier: {html}"
    );
    assert!(
        !html.to_ascii_lowercase().contains("lifetime"),
        "observed count must not be presented as lifetime total: {html}"
    );
}

#[test]
fn run_detail_renders_latest_recorded_policy_with_provenance_only_when_present() {
    let mut with_policy = payload();
    // Policy is captured by a claimed event, while the reader's latest
    // projection remains renderable even when that event is not on this
    // page.  The renderer must use the projection, not infer policy from
    // a scheduled event or the queue-row maximum.
    with_policy["history"]["events"] = json!([
        event(
            31,
            "scheduled",
            "2026-09-09T12:03:00Z",
            json!({"reason":"new_job"})
        ),
        event(32, "claimed", "2026-09-09T12:03:01Z", json!({}))
    ]);
    with_policy["policy"] = json!({
        "source":"service_config",
        "maxAttempts":17,
        "leaseDurationMs":47000,
        "retryBaseMs":"1300",
        "maxRetryDelayMs":23000,
    });
    with_policy["policyEventSeq"] = json!(32);
    with_policy["policyRecordedAt"] = json!("2026-09-09T12:03:01Z");
    let html = render(&with_policy);
    assert!(
        html.contains("run-detail-policy"),
        "missing policy panel: {html}"
    );
    for expected in [
        "service_config",
        "17",
        "47000",
        "1300",
        "23000",
        "32",
        "2026-09-09T12:03:01Z",
    ] {
        assert!(
            html.contains(expected),
            "missing recorded policy {expected}: {html}"
        );
    }

    let mut page_without_claimed = with_policy.clone();
    page_without_claimed["history"]["events"] = json!([event(
        31,
        "scheduled",
        "2026-09-09T12:03:00Z",
        json!({"reason":"new_job"})
    )]);
    let html_without_claimed = render(&page_without_claimed);
    assert!(
        html_without_claimed.contains("run-detail-policy")
            && html_without_claimed.contains("2026-09-09T12:03:01Z"),
        "policy projection must not depend on the current event page: {html_without_claimed}"
    );

    let html_without_policy = render(&payload());
    assert!(
        html_without_policy.contains("Policy unavailable"),
        "missing explicit policy-unavailable state: {html_without_policy}"
    );
    assert!(
        !html_without_policy.contains("999"),
        "run maxAttempts must not stand in for recorded policy: {html_without_policy}"
    );
    for absent in [
        "service_config",
        "leaseDurationMs",
        "retryBaseMs",
        "maxRetryDelayMs",
        "23000",
    ] {
        assert!(
            !html_without_policy.contains(absent),
            "fabricated policy {absent}"
        );
    }

    let mut unknown_policy = payload();
    unknown_policy["policy"] = json!({
        "source":"unverified_default",
        "maxAttempts":17,
        "leaseDurationMs":47000,
        "retryBaseMs":"1300",
        "maxRetryDelayMs":23000,
    });
    unknown_policy["policyEventSeq"] = json!(32);
    unknown_policy["policyRecordedAt"] = json!("2026-09-09T12:03:01Z");
    let html_unknown_policy = render(&unknown_policy);
    assert!(
        html_unknown_policy.contains("Policy unavailable"),
        "unverified policy must fail closed: {html_unknown_policy}"
    );
    assert!(!html_unknown_policy.contains("unverified_default"));
    assert!(!html_unknown_policy.contains("23000"));
}

#[test]
fn run_detail_escapes_cursor_and_offers_next_page() {
    let mut value = payload();
    value["run"]["currentCursor"] = json!("cursor<&\"");
    value["pagination"] = json!({
        "hasMore": true,
        "nextCursor": "next<&\""
    });

    let html = render(&value);
    assert!(
        html.contains("cursor&lt;&amp;&quot;"),
        "cursor not escaped: {html}"
    );
    assert!(!html.contains("cursor<&\""), "raw cursor leaked: {html}");
    assert!(
        html.contains("Next page"),
        "missing next-page control: {html}"
    );
    assert!(
        html.contains("accountId=acct-7"),
        "next-page link dropped the account scope: {html}"
    );
    assert!(
        html.contains("cursor=next%3C%26%22"),
        "next cursor is not contained in a local encoded link: {html}"
    );
    assert!(html.contains("/app/runs/run-42"));

    let mut missing_scope = value.clone();
    missing_scope
        .as_object_mut()
        .expect("detail payload object")
        .remove("historyAccountScope");
    let html_without_scope = render(&missing_scope);
    assert!(
        !html_without_scope.contains("Next page"),
        "pagination must not continue without an authenticated request scope: {html_without_scope}"
    );
}

#[test]
fn run_detail_pagination_uses_authenticated_scope_not_run_account() {
    let mut value = payload();
    value["run"]["accountId"] = json!("provider-account");
    value["historyAccountScope"] = json!("effective-scope<&");
    value["pagination"] = json!({
        "hasMore": true,
        "nextCursor": "next-page"
    });

    let html = render(&value);
    assert!(html.contains("accountId=effective-scope%3C%26"));
    assert!(!html.contains("accountId=provider-account"));

    let mut project_scoped = value.clone();
    project_scoped["historyAccountScope"] = json!("");
    project_scoped["run"]["accountId"] = json!("platform-connection-account");
    let project_html = render(&project_scoped);
    assert!(project_html.contains("cursor=next-page"));
    assert!(!project_html.contains("accountId="));

    let mut malformed_scope = value;
    malformed_scope["historyAccountScope"] = json!(123);
    let malformed_html = render(&malformed_scope);
    assert!(!malformed_html.contains("Next page"));
}

#[test]
fn run_detail_keeps_unknown_event_kind_safe() {
    let mut value = payload();
    value["history"]["events"] = json!([event(
        23,
        "future_kind<&",
        "2026-09-09T12:04:00Z",
        json!({"reason":"made_up_reason<&"})
    )]);

    let html = render(&value);
    assert!(
        html.contains("Unknown event"),
        "unknown kind was not neutral: {html}"
    );
    assert!(
        html.contains("future_kind&lt;&amp;"),
        "kind not escaped: {html}"
    );
    assert!(
        !html.contains("made_up_reason"),
        "arbitrary reason leaked: {html}"
    );
    assert!(!html.contains("<script>"));
    assert!(!html.contains("Error"));
}

#[test]
fn run_detail_rejects_invalid_resource_id_before_rendering() {
    assert!(matches!(
        super::standalone(&payload(), "run/42"),
        Err(crate::Error::Invalid)
    ));
}
