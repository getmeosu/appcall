use super::*;
use crate::tests::dashboard_request;

#[tokio::test]
async fn runs_preview_fixed_scenarios_are_truthful_and_dto_shaped() {
    let data = ScenarioData::new(Scenario::parse("runs").unwrap());
    let value = data
        .execute(dashboard_request(DashboardOperation::Runs))
        .await
        .unwrap();
    assert_eq!(value["synthetic"], true);
    assert_eq!(value["operatorControlsUnavailable"], true);
    assert_eq!(value["records24h"], 340);
    assert_eq!(value["pendingRuns"], 1);
    assert_eq!(value["runningRuns"], 1);
    assert_eq!(value["backingoffRuns"], 1);
    assert_eq!(value["deadRuns"], 1);
    assert_eq!(value["workerHeartbeatUnavailable"], true);
    assert_eq!(value["pagination"]["hasMore"], false);
    assert!(value["pagination"].get("nextCursor").is_none());
    let rows = value["runs"].as_array().unwrap();
    assert_eq!(
        rows.iter()
            .map(|r| r["health"].as_str().unwrap())
            .collect::<Vec<_>>(),
        ["pending", "running", "backingoff", "dead", "succeeded"]
    );
    for row in rows {
        let spent = row["attemptsSpent"].as_u64().unwrap();
        let max = row["maxAttempts"].as_u64().unwrap();
        assert_eq!(
            row["attemptsRemaining"].as_u64().unwrap(),
            max.saturating_sub(spent)
        );
        assert!(max > 0);
        for key in ["runNowAllowed", "resetAllowed", "cancelAllowed"] {
            assert_eq!(row[key], false);
        }
        assert!(row.get("heartbeat").is_none());
        assert!(row.get("attemptHistory").is_none());
    }
    assert!(rows.iter().any(|r| r["id"].as_str().unwrap().len() > 100));
    assert!(rows
        .iter()
        .any(|r| r["currentCursor"].as_str().unwrap().len() > 100));
    let unavailable_message = Error::Unavailable.to_string();
    for (name, expected_status, marker) in [
        ("runs", 200, "Operator controls unavailable"),
        ("runs-empty", 200, "No durable runs to show."),
        ("runs-unavailable", 200, "Runs status unavailable"),
        ("runs-malformed", 503, unavailable_message.as_str()),
    ] {
        let data = ScenarioData::new(Scenario::parse(name).unwrap());
        let dashboard = DevelopmentDashboard {
            public_origin: "http://127.0.0.1:55589",
            data: &data,
        };
        let request = Request {
            method: "GET",
            path: "/app/runs",
            cookies: "",
            origin: None,
            referer: None,
            fields: Default::default(),
            now: 0,
        };
        let response = dashboard.handle(&request).await.unwrap();
        assert_eq!(response.status, expected_status, "{name}");
        assert!(
            response
                .body
                .to_lowercase()
                .contains(&marker.to_lowercase()),
            "{name}"
        );
        assert!(
            !response.body.contains("action=\"/app/runs/"),
            "no synthetic operator authority"
        );
        if name == "runs" {
            assert!(response
                .body
                .contains("aria-label=\"Durable sync runs\" tabindex=\"0\""));
        }
    }
}

#[tokio::test]
async fn runs_preview_summary_counts_are_filtered_beyond_page_rows() {
    let data = ScenarioData::new(Scenario::parse("runs").unwrap());

    let mut request = dashboard_request(DashboardOperation::Runs);
    request.fields.insert("limit".into(), "1".into());
    let paged = data.execute(request).await.unwrap();
    assert_eq!(paged["runs"].as_array().unwrap().len(), 1);
    for key in ["pendingRuns", "runningRuns", "backingoffRuns", "deadRuns"] {
        assert_eq!(paged[key], 1, "summary must ignore pagination for {key}");
    }
    assert_eq!(paged["records24h"], 340);

    let mut request = dashboard_request(DashboardOperation::Runs);
    request.fields.insert("status".into(), "dead".into());
    let dead = data.execute(request).await.unwrap();
    assert_eq!(dead["pendingRuns"], 0);
    assert_eq!(dead["runningRuns"], 0);
    assert_eq!(dead["backingoffRuns"], 0);
    assert_eq!(dead["deadRuns"], 1);
    assert_eq!(dead["records24h"], 340, "records are not status counts");

    for (key, filter) in [
        ("connector", "other-connector"),
        ("tool", "other.tool"),
        ("accountId", "other-account"),
        ("externalAccountId", "other-account"),
    ] {
        let mut request = dashboard_request(DashboardOperation::Runs);
        request.fields.insert(key.into(), filter.into());
        let filtered = data.execute(request).await.unwrap();
        assert!(filtered["runs"].as_array().unwrap().is_empty());
        for summary_key in ["pendingRuns", "runningRuns", "backingoffRuns", "deadRuns"] {
            assert_eq!(
                filtered[summary_key], 0,
                "filtered summary must be empty for {key}"
            );
        }
        assert_eq!(filtered["records24h"], 0);
    }

    let empty = ScenarioData::new(Scenario::RunsEmpty)
        .execute(dashboard_request(DashboardOperation::Runs))
        .await
        .unwrap();
    for key in ["pendingRuns", "runningRuns", "backingoffRuns", "deadRuns"] {
        assert_eq!(empty[key], 0);
    }
    assert_eq!(empty["records24h"], 0);
    assert_eq!(empty["workerHeartbeatUnavailable"], true);
}

#[tokio::test]
async fn runs_preview_filters_and_cursor_pages_use_only_fixed_rows() {
    let data = ScenarioData::new(Scenario::parse("runs").unwrap());
    let mut request = dashboard_request(DashboardOperation::Runs);
    request.fields.insert("limit".into(), "2".into());
    let first = data.execute(request).await.unwrap();
    assert_eq!(first["runs"].as_array().unwrap().len(), 2);
    assert_eq!(first["pagination"]["hasMore"], true);
    let mut request = dashboard_request(DashboardOperation::Runs);
    request.fields.insert("limit".into(), "2".into());
    request.fields.insert(
        "cursor".into(),
        first["pagination"]["nextCursor"].as_str().unwrap().into(),
    );
    let second = data.execute(request).await.unwrap();
    assert_eq!(second["runs"][0]["health"], "backingoff");
    let mut request = dashboard_request(DashboardOperation::Runs);
    request.fields.insert("status".into(), "dead".into());
    let dead = data.execute(request).await.unwrap();
    assert_eq!(dead["runs"].as_array().unwrap().len(), 1);
    assert_eq!(dead["runs"][0]["health"], "dead");
    for (key, value) in [
        ("limit", "-1"),
        ("limit", "not-a-number"),
        ("cursor", "invented"),
    ] {
        let mut request = dashboard_request(DashboardOperation::Runs);
        request.fields.insert(key.into(), value.into());
        assert!(data.execute(request).await.is_err());
    }
}

#[tokio::test]
async fn runs_preview_matches_api_status_validation() {
    let data = ScenarioData::new(Scenario::parse("runs").unwrap());
    for status in [
        "pending",
        "running",
        "backingoff",
        "dead",
        "failed",
        "cancelled",
        "succeeded",
    ] {
        let mut request = dashboard_request(DashboardOperation::Runs);
        request.fields.insert("status".into(), status.into());
        assert!(
            data.execute(request).await.is_ok(),
            "API allowlisted status must remain valid: {status}"
        );
    }

    let mut request = dashboard_request(DashboardOperation::Runs);
    request.fields.insert("status".into(), "unknown".into());
    assert_eq!(data.execute(request).await, Err(Error::Invalid));
}

#[tokio::test]
async fn runs_preview_matches_api_limit_normalization() {
    let data = ScenarioData::new(Scenario::parse("runs").unwrap());
    let mut request = dashboard_request(DashboardOperation::Runs);
    request.fields.insert("limit".into(), "0".into());
    let zero = data.execute(request).await.unwrap();
    assert_eq!(zero["runs"].as_array().unwrap().len(), 5);
    assert_eq!(zero["pagination"]["hasMore"], false);

    for raw_limit in ["101", "999"] {
        let mut request = dashboard_request(DashboardOperation::Runs);
        request.fields.insert("limit".into(), raw_limit.into());
        let capped = data.execute(request).await.unwrap();
        assert_eq!(capped["runs"].as_array().unwrap().len(), 5);
        assert_eq!(capped["pagination"]["hasMore"], false);
    }
}

#[tokio::test]
async fn runs_preview_status_filter_uses_projected_health() {
    let data = ScenarioData::new(Scenario::parse("runs").unwrap());
    let mut request = dashboard_request(DashboardOperation::Runs);
    request.fields.insert("status".into(), "pending".into());
    let pending = data.execute(request).await.unwrap();
    let rows = pending["runs"].as_array().unwrap();
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0]["health"], "pending");
    assert_eq!(pending["pendingRuns"], 1);
    assert_eq!(pending["runningRuns"], 0);
    assert_eq!(pending["backingoffRuns"], 0);
    assert_eq!(pending["deadRuns"], 0);
}

#[tokio::test]
async fn usage_preview_has_explicit_synthetic_metrics_and_distinct_empty_failure_states() {
    for scenario in [Scenario::Preview, Scenario::Populated, Scenario::Empty] {
        let value = ScenarioData::new(scenario)
            .execute(dashboard_request(DashboardOperation::Usage))
            .await
            .unwrap();
        assert_eq!(value["synthetic"], true);
        assert_eq!(value["month"], "2026-09 (synthetic preview)");
        for key in ["toolCalls", "syncedRecords", "webhookEvents"] {
            let count = value[key].as_u64().expect("actual Usage numeric field");
            if scenario == Scenario::Empty {
                assert_eq!(count, 0);
            } else {
                assert!(count > 0);
            }
        }
    }
    assert_eq!(
        ScenarioData::new(Scenario::Unavailable)
            .execute(dashboard_request(DashboardOperation::Usage))
            .await
            .unwrap_err(),
        Error::Unavailable
    );
}

#[test]
fn startup_scenarios_are_fixed_and_unknown_values_are_rejected() {
    for (name, expected) in [
        ("preview", Scenario::Preview),
        ("populated", Scenario::Populated),
        ("empty", Scenario::Empty),
        ("unavailable", Scenario::Unavailable),
        ("billing-partial", Scenario::BillingPartial),
        ("billing-missing", Scenario::BillingMissing),
        (
            "billing-status-unavailable",
            Scenario::BillingStatusUnavailable,
        ),
        (
            "billing-plans-unavailable",
            Scenario::BillingPlansUnavailable,
        ),
        ("billing-empty-plans", Scenario::BillingEmptyPlans),
        ("auth-rejected", Scenario::AuthRejected),
        ("auth-accepted", Scenario::AuthAccepted),
        ("auth-unavailable", Scenario::AuthUnavailable),
        ("no-session", Scenario::NoSession),
        ("untrusted-origin", Scenario::UntrustedOrigin),
        ("events-stream", Scenario::EventsStream),
        ("request-success", Scenario::RequestSuccess),
        ("request-delayed", Scenario::RequestDelayed),
        ("request-invalid", Scenario::RequestInvalid),
        ("request-unavailable", Scenario::RequestUnavailable),
        ("request-missing-patch", Scenario::RequestMissingPatch),
        ("request-drop", Scenario::RequestDrop),
    ] {
        assert_eq!(Scenario::parse(name).unwrap(), expected);
    }
    for unknown in [
        "",
        "EMPTY",
        "empty?mode=accepted",
        "secret-input",
        "../empty",
    ] {
        assert!(Scenario::parse(unknown).is_err());
    }
}

#[test]
fn posts_are_exact_native_routes_without_test_form_alias() {
    for path in [
        "/app/toolkits/connector-0/setup",
        "/app/toolkits/connector-0/test",
        "/app/toolkits/connector-3/test",
        "/app/auth-configs/preview_connection/test",
        "/app/auth-configs/preview_connection/disconnect",
        "/app/logs/preview_original/replay",
        "/app/triggers/preview_event/replay",
        "/app/toolkits/request",
        "/app/login",
        "/app/login/mfa",
        "/app/signup",
        "/app/otp/verify",
        "/app/forgot-password",
        "/app/magic-link",
    ] {
        assert!(allowed("POST", path), "{path}");
    }
    for path in [
        "/app/toolkits/other/test",
        "/app/toolkits/connector-0/test-form",
        "/app/auth-configs/other/disconnect",
        "/api/auth/login",
        "/app/users/remove",
        "/app/toolkits/connector-0/setup/extra",
    ] {
        assert!(!allowed("POST", path), "{path}");
    }
    assert!(allowed("GET", "/app/toolkits/connector-0/test-form"));
    assert!(!allowed(
        "DELETE",
        "/app/auth-configs/preview_connection/disconnect"
    ));
}

#[tokio::test]
async fn empty_and_unavailable_collections_are_distinct() {
    for (op, key) in [
        (DashboardOperation::Catalog, "connectors"),
        (DashboardOperation::AuthConfigs, "connections"),
        (DashboardOperation::Logs, "logs"),
        (DashboardOperation::Triggers, "events"),
        (DashboardOperation::Qa, "certifications"),
    ] {
        let result = ScenarioData::new(Scenario::Empty)
            .execute(dashboard_request(op))
            .await;
        assert!(result.is_ok(), "{op:?}");
        assert_eq!(result.unwrap()[key], json!([]));
        assert_eq!(
            ScenarioData::new(Scenario::Unavailable)
                .execute(dashboard_request(op))
                .await,
            Err(Error::Unavailable)
        );
    }
}

#[tokio::test]
async fn real_filters_produce_real_empty_copy() {
    let data = ScenarioData::new(Scenario::Populated);
    let dashboard = DevelopmentDashboard {
        public_origin: "http://127.0.0.1:55589",
        data: &data,
    };
    for (target, message) in [
        (
            "/app/toolkits?category=unmatched",
            "No connectors match this category.",
        ),
        (
            "/app/logs?status=failed",
            "No tool runs match these filters.",
        ),
    ] {
        let request = Request {
            method: "GET",
            path: target.split('?').next().unwrap(),
            cookies: "",
            origin: None,
            referer: None,
            fields: preview_fields(target, b"").unwrap(),
            now: 0,
        };
        let response = dashboard.handle(&request).await.unwrap();
        assert_eq!(response.status, 200);
        assert!(response.body.contains(message), "{target}");
    }
}

#[tokio::test]
async fn fixture_counters_count_one_execution_without_retaining_fields() {
    let data = ScenarioData::new(Scenario::RequestSuccess);
    let mut request = dashboard_request(DashboardOperation::RequestToolkit);
    request.fields.insert("name".into(), "PRIVATE-NAME".into());
    request
        .form_values
        .insert("notes".into(), vec!["PRIVATE-NOTES".into()]);
    data.execute(request).await.unwrap();
    assert_eq!(data.stats()["operations"]["request"], 1);
    data.execute_detailed(dashboard_request(DashboardOperation::RequestToolkit))
        .await
        .unwrap();
    assert_eq!(data.stats()["operations"]["request"], 2);
    assert!(!data.stats().to_string().contains("PRIVATE"));
    for (scenario, expected) in [
        (Scenario::RequestInvalid, Error::Invalid),
        (Scenario::RequestUnavailable, Error::Unavailable),
    ] {
        let data = ScenarioData::new(scenario);
        assert_eq!(
            data.execute(dashboard_request(DashboardOperation::RequestToolkit))
                .await,
            Err(expected)
        );
        assert_eq!(data.stats()["operations"]["request"], 1);
    }
    for scenario in [
        Scenario::RequestDelayed,
        Scenario::RequestMissingPatch,
        Scenario::RequestDrop,
    ] {
        assert_eq!(scenario.delay(), std::time::Duration::from_secs(2));
    }
}

#[test]
fn unavailable_auth_includes_mfa_setup_without_expanding_the_route_allowlist() {
    let (status, body) = broker_fixture(Scenario::AuthUnavailable, "POST", "/api/auth/mfa/setup");
    assert_eq!(status, 503);
    assert!(body["error"].is_string());
    assert!(body.get("secret").is_none());
    assert!(body.get("url").is_none());

    let (status, body) = broker_fixture(Scenario::Preview, "POST", "/api/auth/mfa/setup");
    assert_eq!(status, 200);
    assert_eq!(body["secret"], "JBSWY3DPEHPK3PXP");
    assert_eq!(
        body["url"],
        "otpauth://totp/Appcall:preview?secret=JBSWY3DPEHPK3PXP&issuer=Appcall"
    );

    for scenario in [Scenario::Preview, Scenario::AuthUnavailable] {
        for path in ["/unknown", "/api/auth/mfa/setup/extra", "/api/auth/unknown"] {
            assert_eq!(broker_fixture(scenario, "POST", path).0, 404);
        }
    }
}

#[test]
fn billing_and_auth_broker_contracts_are_independent() {
    assert_eq!(
        broker_fixture(Scenario::Preview, "GET", "/api/auth/providers"),
        (
            200,
            json!({"google":false,"github":false,"microsoft":false,"magicLink":true,"otp":true})
        )
    );
    let call = |scenario, path| broker_fixture(scenario, "GET", path);
    let (_, partial) = call(Scenario::BillingPartial, "/api/billing/status");
    assert_eq!(partial["billingStatus"], "active");
    assert!(partial.get("subscriptionCredits").is_none());
    assert_eq!(
        call(Scenario::BillingMissing, "/api/billing/status"),
        (200, json!({}))
    );
    assert_eq!(
        call(Scenario::BillingStatusUnavailable, "/api/billing/status").0,
        503
    );
    assert_eq!(
        call(Scenario::BillingStatusUnavailable, "/api/plans").0,
        200
    );
    assert_eq!(
        call(Scenario::BillingPlansUnavailable, "/api/billing/status").0,
        200
    );
    assert_eq!(call(Scenario::BillingPlansUnavailable, "/api/plans").0, 503);
    assert_eq!(
        call(Scenario::BillingEmptyPlans, "/api/plans").1["plans"],
        json!([])
    );
    for (endpoint, status) in [
        ("/api/auth/login", 401),
        ("/api/auth/mfa/challenge", 401),
        ("/api/auth/register", 400),
        ("/api/auth/otp/verify", 401),
    ] {
        let result = broker_fixture(Scenario::AuthRejected, "POST", endpoint);
        assert_eq!(result.0, status);
        assert!(result.1["error"].is_string());
    }
    for endpoint in ["/api/auth/forgot-password", "/api/auth/magic-link"] {
        assert_eq!(
            broker_fixture(Scenario::AuthAccepted, "POST", endpoint).0,
            200
        );
        assert_eq!(
            broker_fixture(Scenario::AuthUnavailable, "POST", endpoint).0,
            503
        );
    }
    assert_eq!(broker_fixture(Scenario::Preview, "POST", "/unknown").0, 404);
}

#[test]
fn typed_failures_use_fixed_bounded_evidence_and_distinct_current_id() {
    for (name, kind, cause) in [
        (
            "invalid-json",
            FailureFixture::InvalidJson,
            FailureCause::InvalidJson,
        ),
        (
            "invalid-input",
            FailureFixture::InvalidInput,
            FailureCause::InvalidActionInput,
        ),
        (
            "missing-field",
            FailureFixture::MissingField,
            FailureCause::MissingSetupField,
        ),
        (
            "credentials",
            FailureFixture::Credentials,
            FailureCause::CredentialsUnavailable,
        ),
        (
            "disconnected",
            FailureFixture::Disconnected,
            FailureCause::ConnectionDisconnected,
        ),
        (
            "timeout-not-dispatched",
            FailureFixture::TimeoutNotDispatched,
            FailureCause::Timeout,
        ),
        (
            "timeout-unknown",
            FailureFixture::TimeoutUnknown,
            FailureCause::Timeout,
        ),
        (
            "rate-known",
            FailureFixture::RateKnown,
            FailureCause::RateLimited,
        ),
        (
            "rate-unknown",
            FailureFixture::RateUnknown,
            FailureCause::RateLimited,
        ),
        (
            "usage-known",
            FailureFixture::UsageKnown,
            FailureCause::UsageLimited,
        ),
        (
            "usage-unknown",
            FailureFixture::UsageUnknown,
            FailureCause::UsageLimited,
        ),
        (
            "response-size",
            FailureFixture::ResponseSize,
            FailureCause::ResponseTooLarge,
        ),
        (
            "input-size",
            FailureFixture::InputSize,
            FailureCause::InputTooLarge,
        ),
        (
            "verification",
            FailureFixture::Verification,
            FailureCause::VerificationFailed,
        ),
        (
            "unavailable",
            FailureFixture::Unavailable,
            FailureCause::ServiceUnavailable,
        ),
        ("unknown", FailureFixture::Unknown, FailureCause::Unknown),
    ] {
        let scenario = Scenario::parse(&format!("error-{name}")).unwrap();
        assert_eq!(scenario, Scenario::Failure(kind));
        let failure = scenario.failure().unwrap();
        assert_eq!(failure.cause(), cause);
        assert_eq!(failure.request_id(), Some("preview_current"));
    }
    let failure = |kind| Scenario::Failure(kind).failure().unwrap();
    assert_eq!(
        failure(FailureFixture::TimeoutNotDispatched).outcome(),
        ExecutionOutcome::NotDispatched
    );
    assert_eq!(
        failure(FailureFixture::TimeoutUnknown).outcome(),
        ExecutionOutcome::Unknown
    );
    assert_eq!(
        failure(FailureFixture::RateKnown).retry_after_seconds(),
        Some(30)
    );
    assert_eq!(
        failure(FailureFixture::RateUnknown).retry_after_seconds(),
        None
    );
    assert!(failure(FailureFixture::UsageKnown).usage().is_some());
    assert!(failure(FailureFixture::UsageUnknown).usage().is_none());
    assert_eq!(
        failure(FailureFixture::MissingField)
            .setup_field()
            .unwrap()
            .label(),
        "Workspace & \"region\""
    );
    let p = failure(FailureFixture::InvalidJson)
        .json_position()
        .unwrap();
    assert_eq!((p.line(), p.column()), (2, 11));
}

#[tokio::test]
async fn empty_events_stream_has_one_binding_and_two_independent_delayed_rows() {
    let data = ScenarioData::new(Scenario::EventsStream);
    let dashboard = DevelopmentDashboard {
        public_origin: "http://127.0.0.1:55589",
        data: &data,
    };
    let request = Request {
        method: "GET",
        path: "/app/triggers",
        cookies: "",
        origin: None,
        referer: None,
        fields: Default::default(),
        now: 0,
    };
    let response = dashboard.handle(&request).await.unwrap();
    assert!(response.body.contains("trigger-empty-state"));
    assert_eq!(
        response
            .body
            .matches("data-init=\"@get('/app/triggers/stream')\"")
            .count(),
        1
    );
    let frames = event_frames().unwrap();
    assert_eq!(frames.len(), 2);
    let dialog = |frame: &str| {
        frame
            .split("<dialog id=\"")
            .nth(1)
            .unwrap()
            .split('"')
            .next()
            .unwrap()
            .to_owned()
    };
    assert_ne!(dialog(&frames[0]), dialog(&frames[1]));
    for frame in frames {
        assert!(frame.contains("selector #trigger-rows\ndata: mode prepend"));
        assert!(frame.contains("selector #trigger-empty-state\ndata: mode remove"));
        assert!(frame.contains("/app/triggers/preview_event/replay"));
    }
}
