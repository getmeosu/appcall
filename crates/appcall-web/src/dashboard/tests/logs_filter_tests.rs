use super::*;

#[tokio::test]
async fn logs_states_have_at_most_one_primary_action() {
    let populated = fixture(json!({"logs":[{"requestId":"request-1","status":"succeeded"}]}));
    let paginated = fixture(
        json!({"logs":[{"requestId":"request-1","status":"succeeded"}],"pagination":{"nextCursor":"next-page"}}),
    );
    let empty = fixture(json!({"logs":[]}));
    let invalid = Failing(Error::Invalid);
    for (name, data, r) in [
        ("empty", &empty as &dyn DashboardData, request("/app/logs")),
        (
            "filtered empty",
            &empty as &dyn DashboardData,
            filtered_request(),
        ),
        (
            "invalid",
            &invalid as &dyn DashboardData,
            filtered_request(),
        ),
        (
            "populated",
            &populated as &dyn DashboardData,
            request("/app/logs"),
        ),
        (
            "paginated",
            &paginated as &dyn DashboardData,
            request("/app/logs"),
        ),
    ] {
        let response = render(data, &r, Some(DashboardOperation::Logs))
            .await
            .unwrap();
        let page = response
            .body
            .split("<main id=\"main-content\" tabindex=\"-1\">")
            .nth(1)
            .unwrap()
            .split("</main>")
            .next()
            .unwrap();
        if name == "paginated" {
            assert!(page.contains("Next page"));
            assert!(page.contains("cursor=next-page"));
        }
        assert!(
            page.matches("ui-button-primary").count() <= 1,
            "{name} has competing primary actions"
        );
    }
}

fn filtered_request() -> Request<'static> {
    let mut r = request("/app/logs");
    for (key, value) in [
        ("connector", "mail\"<unsafe>&"),
        ("action", "messages.send"),
        ("errorCode", "ACTION_TIMEOUT"),
        ("connectionId", "connection-1"),
        ("requestId", "request-1"),
        ("status", "failed"),
        ("limit", "17"),
        ("createdFrom", "2026-09-07T15:30:00.123456789+05:30"),
        ("createdBefore", "2026-09-08T00:00:00Z"),
        ("cursor", "old-cursor"),
    ] {
        r.fields.insert(key.into(), vec![value.into()]);
    }
    r
}

#[tokio::test]
async fn logs_filter_form_uses_trusted_escaped_values_and_resets_cursor() {
    let data =
        fixture(json!({"logs":[],"filters":{"connector":"dto-override"},"hasFilters":false}));
    let r = filtered_request();
    let response = render(&data, &r, Some(DashboardOperation::Logs))
        .await
        .unwrap();
    let form = response
        .body
        .split("<form")
        .find(|part| part.contains("action=\"/app/logs\""))
        .expect("native Logs filter form")
        .split("</form>")
        .next()
        .unwrap();
    assert!(form.contains("method=\"get\""));
    assert!(!form.contains("name=\"cursor\""));
    assert!(!form.contains("dto-override"));
    for (key, value) in &r.fields {
        if key != "cursor" {
            assert!(form.contains(&format!("name=\"{key}\"")), "missing {key}");
            assert!(form.contains(&crate::escape(&value[0])), "lost {key}");
        }
    }
    assert!(!form.contains("mail\"<unsafe>"));
    assert!(form.contains("ui-control"));
    assert!(form.contains("ui-button"));
    for help in ["RFC3339", "inclusive", "exclusive", "UTC", "offset", "9"] {
        assert!(form.contains(help), "missing time guidance: {help}");
    }
    assert!(!form.contains("datetime-local"));
    assert!(response.body.contains("Clear filters"));
    assert!(response.body.contains("No tool runs match these filters."));
}

#[tokio::test]
async fn logs_next_page_preserves_every_filter_and_explicit_limit() {
    let data = fixture(json!({"logs":[],"pagination":{"nextCursor":"new+cursor&value"}}));
    let r = filtered_request();
    let response = render(&data, &r, Some(DashboardOperation::Logs))
        .await
        .unwrap();
    let raw_href = response
        .body
        .split("href=\"")
        .filter_map(|part| part.split('"').next())
        .find(|href| href.contains("cursor="))
        .expect("next page link");
    let url = reqwest::Url::parse(&format!(
        "https://local.invalid{}",
        raw_href.replace("&amp;", "&")
    ))
    .unwrap();
    let query: BTreeMap<_, _> = url
        .query_pairs()
        .map(|(k, v)| (k.into_owned(), v.into_owned()))
        .collect();
    for (key, value) in &r.fields {
        assert_eq!(
            query.get(key).map(String::as_str),
            Some(if key == "cursor" {
                "new+cursor&value"
            } else {
                &value[0]
            }),
            "lost {key}"
        );
    }
}

#[tokio::test]
async fn logs_request_error_and_time_filters_produce_filtered_empty_copy() {
    for (key, value) in [
        ("requestId", "request"),
        ("errorCode", "ACTION_TIMEOUT"),
        ("createdFrom", "2026-09-07T00:00:00Z"),
        ("createdBefore", "2026-09-08T00:00:00Z"),
    ] {
        let mut r = request("/app/logs");
        r.fields.insert(key.into(), vec![value.into()]);
        let response = render(
            &fixture(json!({"logs":[],"hasFilters":false})),
            &r,
            Some(DashboardOperation::Logs),
        )
        .await
        .unwrap();
        assert!(
            response.body.contains("No tool runs match these filters."),
            "{key}"
        );
        assert!(!response.body.contains("No tool runs to show."));
    }
}

#[tokio::test]
async fn logs_invalid_filter_keeps_form_and_live_recovery_without_fake_results() {
    let mut r = filtered_request();
    r.fields
        .insert("createdFrom".into(), vec!["invalid\"<time>".into()]);
    let response = render(&Failing(Error::Invalid), &r, Some(DashboardOperation::Logs))
        .await
        .expect("recoverable filter error page");
    assert_eq!(response.status, 400);
    assert!(response.body.contains("action=\"/app/logs\""));
    assert!(response.body.contains("invalid&quot;&lt;time&gt;"));
    assert!(response.body.contains("role=\"alert\""));
    assert!(response.body.contains("Clear filters"));
    assert!(response.body.contains("RFC3339"));
    assert!(!response.body.contains("No tool runs"));
    assert!(!response.body.contains("<table"));
    for error in [Error::Unauthorized, Error::Forbidden] {
        assert!(
            matches!(render(&Failing(error), &r, Some(DashboardOperation::Logs)).await, Err(e) if e == error)
        );
    }
    assert!(matches!(
        render(
            &Failing(Error::Invalid),
            &request("/app/triggers"),
            Some(DashboardOperation::Triggers)
        )
        .await,
        Err(Error::Invalid)
    ));
}

#[tokio::test]
async fn logs_table_has_scoped_headers_caption_state_and_native_inspect() {
    let response = render(&fixture(json!({"logs":[{"createdAt":"2026-09-07T10:00:00Z","connector":"mail","action":"send","status":"failed","errorCode":"ACTION_TIMEOUT","requestId":"request-1"}]})), &request("/app/logs"), Some(DashboardOperation::Logs)).await.unwrap();
    assert!(response
        .body
        .contains("<caption class=\"sr-only\">Recorded tool executions</caption>"));
    assert!(response.body.contains("scope=\"col\""));
    assert!(response.body.contains(">Tool</th>"));
    assert!(!response.body.contains(">Action</th>"));
    assert!(response.body.contains("ui-state-dead"));
    assert!(response.body.contains("href=\"/app/logs/request-1\""));
    assert!(response.body.contains("Inspect"));
    assert!(response.body.contains("logs-table-scroll"));
}

#[tokio::test]
async fn logs_inspector_has_native_fallback_accessible_result_and_shared_controls() {
    let response = render(
        &fixture(json!({"logs":[{"requestId":"request-1","status":"succeeded"}]})),
        &request("/app/logs"),
        Some(DashboardOperation::Logs),
    )
    .await
    .unwrap();
    for expected in [
        "data-log-row",
        "id=\"logs-heading\" tabindex=\"-1\"",
        "<dialog id=\"logs-inspector\"",
        "aria-labelledby=\"logs-inspector-title\"",
        "id=\"logs-inspector-result\"",
        "aria-live=\"polite\"",
        "aria-busy=\"false\"",
        "id=\"logs-inspector-close\"",
        "method=\"dialog\"",
        "id=\"logs-inspector-full\"",
        "id=\"logs-inspector-login\"",
        "Open full trace",
        "Close",
        "/static/logs.js?v=",
    ] {
        assert!(
            response.body.contains(expected),
            "missing inspector contract: {expected}"
        );
    }
    let inspector = response
        .body
        .split("<dialog id=\"logs-inspector\"")
        .nth(1)
        .unwrap()
        .split("</dialog>")
        .next()
        .unwrap();
    assert!(inspector.contains("ui-button"));
    assert!(!inspector.contains("aria-modal=\"true\""));
    assert!(!response.body.contains("aria-selected="));
    assert!(response.body.contains("href=\"/app/logs/request-1\""));
}
