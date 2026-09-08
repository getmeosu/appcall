use appcall_api::{
    browser_host::public_path,
    development_browser::{DevelopmentBrowserConfig, DevelopmentBrowserHost},
    Request,
};
use appcall_web::{DashboardData, DashboardRequest, Error};
use std::{
    future::Future,
    pin::Pin,
    sync::{Arc, Mutex},
};

#[derive(Default)]
struct Data(Mutex<Vec<DashboardRequest>>);
impl DashboardData for Data {
    fn execute(
        &self,
        request: DashboardRequest,
    ) -> Pin<Box<dyn Future<Output = Result<serde_json::Value, Error>> + Send + '_>> {
        self.0.lock().unwrap().push(request);
        Box::pin(async { Ok(serde_json::json!({"connectors":[],"synthetic":true})) })
    }
}
fn host(data: Arc<Data>) -> DevelopmentBrowserHost {
    DevelopmentBrowserHost::new(
        DevelopmentBrowserConfig::new(false, "127.0.0.1:5080", "http://127.0.0.1:5080").unwrap(),
        data,
    )
}
fn request(method: &str, uri: &str, body: &str, origin: &str) -> Request {
    Request {
        method: method.into(),
        uri: uri.into(),
        body: body.as_bytes().to_vec(),
        headers: vec![
            ("Host".into(), "127.0.0.1:5080".into()),
            ("Origin".into(), origin.into()),
            (
                "Content-Type".into(),
                "application/x-www-form-urlencoded".into(),
            ),
        ],
    }
}

#[test]
fn signal_canonical_routes_are_exact_host_routes() {
    for path in [
        "/app/connectors",
        "/app/connectors/slack",
        "/app/connectors/slack/test-form",
        "/app/connectors/slack/options",
        "/app/connectors/slack/runinput-fields",
        "/app/connections",
        "/app/events",
        "/app/events/stream",
        "/app/usage",
        "/app/certification",
        "/app/settings/team",
    ] {
        assert!(public_path("GET", path), "{path}");
    }
    for path in [
        "/app/connectors/request",
        "/app/connectors/slack/setup",
        "/app/connectors/slack/test",
        "/app/connections/conn/test",
        "/app/connections/conn/disconnect",
        "/app/events/event/replay",
        "/app/settings/team/invite",
        "/app/settings/team/member/role",
        "/app/settings/team/member/remove",
        "/app/settings/account/sessions/session/revoke",
    ] {
        assert!(public_path("POST", path), "{path}");
    }
    for path in [
        "/app/connectors/slack/unknown",
        "/app/settings/team/member/remove/extra",
        "/app/events/../stream",
        "/app/connectors/%2Fbad",
        "/app/connectors-evil",
    ] {
        assert!(!public_path("GET", path), "{path}");
        assert!(!public_path("POST", path), "{path}");
    }
}

#[tokio::test]
async fn signal_legacy_get_redirects_preserve_raw_query_without_fetching_data() {
    let data = Arc::new(Data::default());
    let host = host(data.clone());
    for (old, new) in [
        ("/app/toolkits", "/app/connectors"),
        (
            "/app/toolkits/slack/options",
            "/app/connectors/slack/options",
        ),
        ("/app/auth-configs", "/app/connections"),
        ("/app/triggers/stream", "/app/events/stream"),
        ("/app/settings/usage", "/app/usage"),
        ("/app/qa", "/app/certification"),
        ("/app/users", "/app/settings/team"),
        ("/app/sessions", "/app/settings/account"),
    ] {
        let query = "q=a%20b&q=a+b&source=x%2Fy";
        let response = host
            .handle(&request(
                "GET",
                &format!("{old}?{query}"),
                "",
                "http://127.0.0.1:5080",
            ))
            .await
            .unwrap()
            .unwrap();
        assert_eq!(response.status, 301, "{old}");
        let fragment = if old == "/app/sessions" {
            "#account-sessions"
        } else {
            ""
        };
        assert!(
            response
                .headers
                .iter()
                .any(|(k, v)| k.eq_ignore_ascii_case("location")
                    && v == &format!("{new}?{query}{fragment}")),
            "{old}"
        );
    }
    assert!(data.0.lock().unwrap().is_empty());
}

#[tokio::test]
async fn signal_legacy_get_redirects_before_repeated_query_limit_and_preserves_raw_escapes() {
    let data = Arc::new(Data::default());
    let host = host(data.clone());
    let query = "q=a%20b&q=a+b&q=c%2Fd&q=e%26f&q=g%2Bh&q=i%25j&q=k%3Dl&q=m%2Fn&q=o%3Fp";
    let response = host
        .handle(&request(
            "GET",
            &format!("/app/toolkits?{query}"),
            "",
            "http://127.0.0.1:5080",
        ))
        .await
        .expect("legacy GET should be redirectable")
        .expect("legacy GET should be handled");
    assert_eq!(response.status, 301);
    assert!(response.headers.iter().any(|(key, value)| {
        key.eq_ignore_ascii_case("location") && value == &format!("/app/connectors?{query}")
    }));
    assert!(data.0.lock().unwrap().is_empty());
}

#[tokio::test]
async fn signal_legacy_get_redirects_before_unique_query_limit() {
    let data = Arc::new(Data::default());
    let host = host(data.clone());
    let query = (0..65)
        .map(|index| format!("key{index:02}=value%2F{index:02}"))
        .collect::<Vec<_>>()
        .join("&");
    let response = host
        .handle(&request(
            "GET",
            &format!("/app/toolkits?{query}"),
            "",
            "http://127.0.0.1:5080",
        ))
        .await
        .expect("legacy GET should be redirectable")
        .expect("legacy GET should be handled");
    assert_eq!(response.status, 301);
    assert!(response.headers.iter().any(|(key, value)| {
        key.eq_ignore_ascii_case("location") && value == &format!("/app/connectors?{query}")
    }));
    assert!(data.0.lock().unwrap().is_empty());
}

#[tokio::test]
async fn signal_canonical_get_dispatches() {
    let data = Arc::new(Data::default());
    let host = host(data.clone());
    assert_eq!(
        host.handle(&request(
            "GET",
            "/app/connectors",
            "",
            "http://127.0.0.1:5080"
        ))
        .await
        .unwrap()
        .unwrap()
        .status,
        200
    );
}

#[tokio::test]
async fn signal_legacy_post_keeps_csrf_repeated_fields_and_single_execution() {
    let data = Arc::new(Data::default());
    let host = host(data.clone());
    let bad = host
        .handle(&request(
            "POST",
            "/app/toolkits/request",
            "name=Example",
            "https://evil.invalid",
        ))
        .await
        .unwrap()
        .unwrap();
    assert_eq!(bad.status, 403);
    assert!(data.0.lock().unwrap().is_empty());
    let response = host
        .handle(&request(
            "POST",
            "/app/toolkits/request",
            "name=Example&f.map.key=one&f.map.key=two&f.map.val=A&f.map.val=B",
            "http://127.0.0.1:5080",
        ))
        .await
        .unwrap()
        .unwrap();
    assert_eq!(response.status, 200);
    assert!(!response
        .headers
        .iter()
        .any(|(key, _)| key.eq_ignore_ascii_case("location")));
    let calls = data.0.lock().unwrap();
    assert_eq!(calls.len(), 1);
    assert_eq!(
        calls[0].form_values.get("f.map.key").unwrap(),
        &["one", "two"]
    );
    assert_eq!(calls[0].form_values.get("f.map.val").unwrap(), &["A", "B"]);
    assert_eq!(
        calls[0].fields.get("name").map(String::as_str),
        Some("Example")
    );
}
