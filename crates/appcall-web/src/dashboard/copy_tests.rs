use super::*;
use serde_json::json;
use std::sync::Mutex;

struct Fixture(Value, Mutex<Vec<DashboardRequest>>);
impl DashboardData for Fixture {
    fn execute(
        &self,
        request: DashboardRequest,
    ) -> Pin<Box<dyn Future<Output = Result<Value, Error>> + Send + '_>> {
        self.1.lock().unwrap().push(request);
        Box::pin(async { Ok(self.0.clone()) })
    }
}
async fn response(
    value: Value,
    path: &str,
    fields: &[(&str, &str)],
) -> (Response, Vec<DashboardRequest>) {
    let data = Fixture(value, Mutex::new(Vec::new()));
    let response = DevelopmentDashboard {
        public_origin: "http://127.0.0.1:5080",
        data: &data,
    }
    .handle(&Request {
        method: if path.ends_with("/request") {
            "POST"
        } else {
            "GET"
        },
        path,
        cookies: "",
        origin: Some("http://127.0.0.1:5080"),
        referer: None,
        fields: fields
            .iter()
            .map(|(k, v)| ((*k).into(), vec![(*v).into()]))
            .collect(),
        now: 100,
    })
    .await
    .unwrap();
    (response, data.1.into_inner().unwrap())
}

struct OverviewRunsNavigationFixture(Mutex<Vec<(String, BTreeMap<String, String>)>>);
impl DashboardData for OverviewRunsNavigationFixture {
    fn execute(
        &self,
        request: DashboardRequest,
    ) -> Pin<Box<dyn Future<Output = Result<Value, Error>> + Send + '_>> {
        let operation = format!("{:?}", request.operation);
        self.0
            .lock()
            .unwrap()
            .push((operation.clone(), request.fields));
        let value = if operation == "Overview" {
            json!({
                "toolkitCount": 1,
                "connectionCount": 1,
                "activeConnectionCount": 1,
                "actionCalls": 1,
                "successfulCalls": 1,
                "failedCalls": 0,
                "activity": [{"label":"10:00","calls":1,"succeeded":1,"failed":0}],
                "failureActivity": [{"label":"10:00","failures":0}],
                "attention": [{"kind":"failure","title":"Sync run failed","body":"Open the dead run.","href":"/app/runs?status=dead"}],
                "deadRuns": [{"runId":"run_dead","kind":"dead_run","state":"dead","title":"Sync run failed","body":"Review the terminal run.","href":"/app/runs?status=dead"}]
            })
        } else {
            json!({
                "runs": [{
                    "id":"run_dead",
                    "connectionId":"connection-1",
                    "connector":"synthetic-mail",
                    "tool":"messages.sync",
                    "accountId":"synthetic-account",
                    "status":"failed",
                    "health":"dead",
                    "attemptsSpent":10,
                    "attemptsRemaining":0,
                    "maxAttempts":10,
                    "wakeAt":"2026-09-08T10:02:00Z",
                    "leaseUntil":"",
                    "leaseRemainingSeconds":0,
                    "createdAt":"2026-09-08T09:00:00Z",
                    "updatedAt":"2026-09-08T10:00:00Z",
                    "currentCursor":"synthetic-cursor",
                    "lastError":"Synthetic terminal failure.",
                    "runNowEligible":false,
                    "resetEligible":true,
                    "cancelEligible":false,
                    "runNowAllowed":false,
                    "resetAllowed":false,
                    "cancelAllowed":false
                }],
                "pagination":{"hasMore":false},
                "pendingRuns":0,
                "runningRuns":0,
                "backingoffRuns":0,
                "deadRuns":1,
                "records24h":1,
                "workerHeartbeatUnavailable":true,
                "operatorControlsUnavailable":true
            })
        };
        Box::pin(async move { Ok(value) })
    }
}

#[tokio::test]
async fn overview_dead_run_link_reaches_the_runs_route() {
    let data = OverviewRunsNavigationFixture(Mutex::new(Vec::new()));
    let dashboard = DevelopmentDashboard {
        public_origin: "http://127.0.0.1:5080",
        data: &data,
    };
    let overview = dashboard
        .handle(&Request {
            method: "GET",
            path: "/app",
            cookies: "",
            origin: None,
            referer: None,
            fields: BTreeMap::new(),
            now: 100,
        })
        .await
        .expect("Overview route must be registered");
    assert_eq!(overview.status, 200);
    assert!(overview.body.contains("href=\"/app/runs?status=dead\""));

    let runs = dashboard
        .handle(&Request {
            method: "GET",
            path: "/app/runs",
            cookies: "",
            origin: None,
            referer: None,
            fields: BTreeMap::from([("status".into(), vec!["dead".into()])]),
            now: 100,
        })
        .await
        .expect("Overview dead-run link must reach the Runs route");
    assert_eq!(runs.status, 200);
    assert!(runs.body.contains("id=\"runs-page\""));

    let requests = data.0.lock().unwrap();
    assert_eq!(requests.len(), 2);
    assert_eq!(requests[0].0, "Overview");
    assert_eq!(requests[1].0, "Runs");
    assert_eq!(
        requests[1].1.get("status").map(String::as_str),
        Some("dead")
    );
}

#[tokio::test]
async fn copy_empty_filter_state_comes_from_request() {
    for value in [
        json!([]),
        json!({"data":[]}),
        json!({"logs":[],"hasFilters":true}),
        json!({"logs":[],"hasFilters":false}),
        json!({"data":{"items":[],"hasFilters":true}}),
    ] {
        for (key, val, filtered) in [
            ("status", "failed", true),
            ("connector", "mail", true),
            ("action", "send", true),
            ("connectionId", "c1", true),
            ("status", "", false),
            ("cursor", "next", false),
            ("limit", "50", false),
            ("unknown", "secret-query", false),
        ] {
            let (result, calls) = response(value.clone(), "/app/logs", &[(key, val)]).await;
            let expected = if filtered {
                "No tool runs match these filters."
            } else {
                "No tool runs to show."
            };
            assert!(result.body.contains(expected), "{key}: {}", result.body);
            if filtered {
                assert!(result
                    .body
                    .contains("Clear the filters to view recorded runs."));
                assert!(result.body.contains("Clear filters</span>"));
            }
            assert_eq!(calls.len(), 1);
            assert_eq!(calls[0].fields.get(key).map(String::as_str), Some(val));
            assert!(!result.body.contains("secret-query"));
        }
    }
    for value in [
        json!([]),
        json!({"data":[]}),
        json!({"connectors":[],"hasFilters":true}),
        json!({"items":[],"hasFilters":false}),
        json!({"data":{"cards":[],"hasFilters":true}}),
    ] {
        for selected in ["", "unknown"] {
            let (result, _) =
                response(value.clone(), "/app/connectors", &[("category", selected)]).await;
            assert!(result.body.contains(if selected.is_empty() {
                "No connectors are available in this catalog."
            } else {
                "No connectors match this category."
            }));
            if !selected.is_empty() {
                assert!(result
                    .body
                    .contains("Choose another category or view the full catalog."));
                assert!(result.body.contains("View all connectors</span>"));
            }
        }
    }
}

#[tokio::test]
async fn copy_event_stream_initializes_once_with_a_polite_result_target() {
    for events in [
        json!([]),
        json!([{"id":"event-one","connector":"mail","operation":"received","connectionId":"connection-one","createdAt":"2026-09-08"}]),
    ] {
        let (result, _) = response(json!({"events":events}), "/app/events", &[]).await;
        assert_eq!(
            result
                .body
                .matches("data-init=\"@get('/app/events/stream')\"")
                .count(),
            1,
            "the bundled Datastar init plugin must start the event stream"
        );
        assert_eq!(result.body.matches("@get('/app/events/stream')").count(), 1);
        assert_eq!(result.body.matches("id=\"trigger-rows\"").count(), 1);
        let target = result
            .body
            .split("<tbody id=\"trigger-rows\"")
            .nth(1)
            .unwrap()
            .split('>')
            .next()
            .unwrap();
        assert!(target.contains("aria-live=\"polite\""));
    }
}

#[tokio::test]
async fn copy_request_receipt_and_navigation_are_truthful() {
    let (result, calls) = response(
        json!({}),
        "/app/connectors/request",
        &[
            ("name", "Needed"),
            ("email", "a@example.test"),
            ("notes", "details"),
        ],
    )
    .await;
    assert!(result.body.contains("Connector request received."));
    assert!(result.body.contains("id=\"toolkit-request-result\""));
    assert!(result.body.contains("data-request-state=\"success\""));
    assert_eq!(calls.len(), 1);
    assert_eq!(calls[0].operation, DashboardOperation::RequestConnector);
    for path in ["/app/logs", "/app/events"] {
        let value = if path.ends_with("logs") {
            json!({"logs":[],"pagination":{"nextCursor":"a/b &?"}})
        } else {
            json!({"events":[],"pagination":{"nextCursor":"a/b &?"}})
        };
        let (result, _) =
            response(value, path, &[("status", "failed"), ("connector", "a&b")]).await;
        assert!(result.body.contains("Next page</span>"));
        assert!(result
            .body
            .contains("status=failed&amp;connector=a%26b&amp;cursor=a%2Fb+%26%3F"));
        assert!(!result.body.contains("Load more"));
    }
}

#[tokio::test]
async fn copy_request_result_is_a_polite_live_region() {
    for (value, path) in [
        (json!({"connectors":[]}), "/app/connectors"),
        (json!({}), "/app/connectors/request"),
    ] {
        let (result, _) = response(value, path, &[]).await;
        let target = result
            .body
            .split("id=\"toolkit-request-result\"")
            .nth(1)
            .unwrap()
            .split('>')
            .next()
            .unwrap();
        assert!(target.contains("role=\"status\""));
        assert!(target.contains("aria-live=\"polite\""));
        assert!(target.contains("aria-label=\"Connector request result\""));
    }
}

#[tokio::test]
async fn copy_request_failures_use_exact_sse_target_and_preserve_access_errors() {
    struct FailureFixture(Error, Mutex<Vec<DashboardRequest>>);
    impl DashboardData for FailureFixture {
        fn execute(
            &self,
            _: DashboardRequest,
        ) -> Pin<Box<dyn Future<Output = Result<Value, Error>> + Send + '_>> {
            panic!("request must use the detailed interface exactly once")
        }
        fn execute_detailed(
            &self,
            request: DashboardRequest,
        ) -> Pin<Box<dyn Future<Output = Result<Value, DashboardFailure>> + Send + '_>> {
            self.1.lock().unwrap().push(request);
            Box::pin(async { Err(DashboardFailure::new(self.0, crate::FailureCause::Unknown)) })
        }
    }
    for error in [
        Error::Invalid,
        Error::Unavailable,
        Error::Configuration,
        Error::Unauthorized,
        Error::Forbidden,
    ] {
        let data = FailureFixture(error, Mutex::new(Vec::new()));
        let session = Session {
            access_token: String::new(),
            refresh_token: String::new(),
            user_id: "verified-user".into(),
            email: "private-email".into(),
            tenant_id: "tenant".into(),
            tenant_name: "Tenant".into(),
        };
        let request = Request {
            method: "POST",
            path: "/app/connectors/request",
            cookies: "",
            origin: None,
            referer: None,
            fields: [
                ("name".into(), vec!["private-name".into()]),
                ("email".into(), vec!["private-email".into()]),
                ("notes".into(), vec!["private-notes".into()]),
            ]
            .into(),
            now: 100,
        };
        let result = DashboardRenderer { data: &data }
            .render(
                &request,
                Some(DashboardOperation::RequestConnector),
                &session,
                Principal::project("verified-project").unwrap(),
            )
            .await;
        let calls = data.1.lock().unwrap();
        assert_eq!(calls.len(), 1);
        assert_eq!(
            calls[0].principal,
            Principal::project("verified-project").unwrap()
        );
        assert_eq!(
            calls[0].fields.get("name").map(String::as_str),
            Some("private-name")
        );
        if matches!(error, Error::Unauthorized | Error::Forbidden) {
            assert!(matches!(result, Err(actual) if actual == error));
            continue;
        }
        let response = result.expect("data failures must patch the current receipt region");
        assert_eq!(response.status, 200);
        assert!(response
            .headers
            .iter()
            .any(|(k, v)| k == "Content-Type" && v == "text/event-stream"));
        for expected in [
            "id=\"toolkit-request-result\"",
            "data-request-state=\"error\"",
            "aria-label=\"Connector request result\"",
            "aria-live=\"polite\"",
            "role=\"alert\"",
            "href=\"/app/support\"",
            "could not confirm receipt",
            "before submitting another request",
        ] {
            assert!(
                response.body.contains(expected),
                "missing {expected}: {}",
                response.body
            );
        }
        for secret in [
            "private-name",
            "private-email",
            "private-notes",
            "Connector request received.",
            "not stored",
            "rejected",
        ] {
            assert!(!response.body.contains(secret));
        }
    }
}

#[tokio::test]
async fn copy_request_form_uses_one_attempt_transport_and_shared_working_label() {
    let (response, _) = response(json!({"connectors":[]}), "/app/connectors", &[]).await;
    for expected in [
        "contentType: 'form'",
        "retry:'never'",
        "retryMaxCount:1",
        "requestCancellation:new AbortController()",
        "ui-button-working",
        "<template id=\"toolkit-request-recovery\">",
        "ui-button-quiet",
        "name=\"name\"",
        "name=\"email\"",
        "name=\"notes\"",
    ] {
        assert!(response.body.contains(expected), "missing {expected}");
    }
}
