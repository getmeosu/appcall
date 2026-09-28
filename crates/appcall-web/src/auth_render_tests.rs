use super::*;

fn signal(html: &str) {
    assert!(html.starts_with("<!DOCTYPE html>"));
    for retired in [
        "dusk-blue",
        "space-indigo",
        "prussian-blue",
        "neon-ice",
        "rounded-2xl",
    ] {
        assert!(
            !html.contains(retired),
            "retired auth presentation: {retired}"
        );
    }
}

fn assert_referrer_policy(response: &Response, expected: &str) {
    assert_eq!(
        response
            .headers
            .iter()
            .find(|(key, _)| key == "Referrer-Policy")
            .map(|(_, value)| value.as_str()),
        Some(expected)
    );
}

#[derive(Debug, PartialEq, Eq)]
enum MockHttpRequestError {
    DeadlineExpired,
    ClosedBeforeRequestLine,
    ClosedBeforeHeaderEnd,
}

async fn accept_mock_http_request(
    listener: &tokio::net::TcpListener,
    deadline: std::time::Duration,
) -> Result<(tokio::io::BufReader<tokio::net::TcpStream>, String), MockHttpRequestError> {
    use tokio::io::AsyncBufReadExt;

    match tokio::time::timeout(deadline, async {
        let (stream, _) = listener.accept().await.unwrap();
        let mut stream = tokio::io::BufReader::new(stream);
        let mut request_line = String::new();
        if stream.read_line(&mut request_line).await.unwrap() == 0 {
            return Err(MockHttpRequestError::ClosedBeforeRequestLine);
        }
        loop {
            let mut line = String::new();
            if stream.read_line(&mut line).await.unwrap() == 0 {
                return Err(MockHttpRequestError::ClosedBeforeHeaderEnd);
            }
            if line == "\r\n" {
                break;
            }
        }
        Ok((stream, request_line))
    })
    .await
    {
        Ok(result) => result,
        Err(_) => Err(MockHttpRequestError::DeadlineExpired),
    }
}

#[tokio::test]
async fn signal_auth_mock_server_bounds_missing_requests() {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let result = tokio::time::timeout(
        std::time::Duration::from_secs(1),
        accept_mock_http_request(&listener, std::time::Duration::from_millis(20)),
    )
    .await
    .expect("mock request deadline must be shorter than the test deadline");

    assert!(matches!(result, Err(MockHttpRequestError::DeadlineExpired)));
}

#[tokio::test]
async fn signal_auth_mock_server_rejects_closed_incomplete_headers() {
    use tokio::io::AsyncWriteExt;

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let accepting = tokio::spawn(async move {
        accept_mock_http_request(&listener, std::time::Duration::from_secs(1)).await
    });
    let mut client = tokio::net::TcpStream::connect(address).await.unwrap();
    client
        .write_all(b"GET /test HTTP/1.1\r\nHost: localhost\r\n")
        .await
        .unwrap();
    client.shutdown().await.unwrap();

    assert!(matches!(
        accepting.await.unwrap(),
        Err(MockHttpRequestError::ClosedBeforeHeaderEnd)
    ));
}

#[test]
fn signal_auth_forms_use_native_shared_controls() {
    for path in [
        "/app/login",
        "/app/login/password",
        "/app/signup",
        "/app/otp",
        "/app/forgot-password",
        "/reset-password",
        "/app/magic-link",
    ] {
        let html = form(
            path,
            "/app/calls?limit=2&cursor=x",
            "token\"><script>",
            "invite\"><script>",
        );
        signal(&html);
        assert!(html.contains("class=\"ui-field\""), "{path}");
        assert!(html.contains("class=\"ui-control\""));
        assert_eq!(html.matches("ui-button-primary").count(), 1);
        assert!(html.contains("type=\"submit\""));
        assert!(html.contains("method=\"post\""));
        assert!(html.contains("value=\"/app/calls?limit=2&amp;cursor=x\""));
        assert!(!html.contains("<script>"));
    }
}

#[test]
fn signal_auth_challenges_preserve_native_security_fields() {
    for (action, key) in [("/app/otp/verify", "email"), ("/app/login/mfa", "mfaToken")] {
        let html = challenge_form(
            action,
            "Verify",
            key,
            "challenge\"><script>",
            "//evil.example",
        );
        signal(&html);
        assert!(html.contains("class=\"ui-field\""));
        assert!(html.contains("autocomplete=\"one-time-code\""));
        assert!(html.contains(" required"));
        assert!(html.contains(&format!("action=\"{action}\"")));
        assert!(html.contains(&format!("name=\"{key}\"")));
        assert!(html.contains("challenge&quot;&gt;&lt;script&gt;"));
        assert!(!html.contains("evil.example"));
        assert_eq!(html.matches("ui-button-primary").count(), 1);
    }
}

#[test]
fn signal_auth_form_responses_use_origin_only_referrers() {
    assert_referrer_policy(&Response::new(200, String::new()), "no-referrer");
    for path in [
        "/app/login",
        "/app/login/password",
        "/app/signup",
        "/app/otp",
        "/app/forgot-password",
        "/reset-password",
        "/app/magic-link",
    ] {
        let response = Response::auth_form(
            200,
            form(path, "/app/calls", "synthetic-reset-token", "invite"),
        );
        assert!(response.body.contains("<form method=\"post\""), "{path}");
        assert_referrer_policy(&response, "strict-origin");
    }

    for (action, token_name) in [("/app/otp/verify", "email"), ("/app/login/mfa", "mfaToken")] {
        let response = Response::auth_form(
            200,
            challenge_form(action, "Verify", token_name, "synthetic-challenge", "/app"),
        );
        assert!(response.body.contains("<form method=\"post\""), "{action}");
        assert_referrer_policy(&response, "strict-origin");
    }
}

#[test]
fn signal_browser_mutations_still_reject_missing_null_and_cross_origin_evidence() {
    for (origin, referer) in [
        (None, None),
        (Some("null"), None),
        (Some("https://evil.example"), None),
        (None, Some("https://evil.example/app/login")),
    ] {
        assert!(matches!(
            crate::session::verify_csrf("https://app.example", origin, referer),
            Err(Error::Forbidden)
        ));
    }
    assert!(
        crate::session::verify_csrf("https://app.example", Some("https://app.example"), None)
            .is_ok()
    );
}

struct Deny;
impl appcall_auth::MembershipVerifier for Deny {
    fn verify_membership(
        &self,
        _: &appcall_auth::AccessClaims,
        _: &str,
        _: &str,
    ) -> Result<Option<appcall_auth::Membership>, appcall_auth::AuthError> {
        Ok(None)
    }
}

#[tokio::test]
async fn signal_auth_routes_apply_form_referrer_policy_to_rendered_forms() {
    use tokio::io::AsyncWriteExt;

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let server = tokio::spawn(async move {
        for _ in 0..5 {
            let (mut stream, request_line) =
                accept_mock_http_request(&listener, std::time::Duration::from_secs(5))
                    .await
                    .expect("mock server request deadline expired");
            let path = request_line
                .split_whitespace()
                .nth(1)
                .unwrap_or_default()
                .to_owned();
            let (status, body) = match path.as_str() {
                "/api/auth/providers" => (200, r#"{"google":false}"#),
                "/api/auth/otp/request" => (200, "{}"),
                "/api/auth/login" => (200, r#"{"mfaRequired":true,"mfaToken":"synthetic-mfa"}"#),
                "/api/auth/mfa/challenge" => (401, r#"{"code":"UNAUTHORIZED"}"#),
                _ => panic!("unexpected auth request: {path}"),
            };
            let reason = if status == 200 { "OK" } else { "Unauthorized" };
            stream
                .get_mut()
                .write_all(
                    format!(
                        "HTTP/1.1 {status} {reason}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                        body.len()
                    )
                    .as_bytes(),
                )
                .await
                .unwrap();
        }
    });

    let codec = SessionCodec::new("synthetic", false).unwrap();
    let jwt = appcall_auth::JwtVerifier::new("synthetic", Default::default()).unwrap();
    let broker = Broker::new(&format!("http://{address}"), "appcall").unwrap();
    let browser = Browser {
        codec: &codec,
        identity: Identity {
            jwt: &jwt,
            memberships: &Deny,
            broker: &broker,
        },
        public_origin: "https://app.example",
    };

    for (path, action) in [
        ("/app/login", "/app/otp"),
        ("/app/login/password", "/app/login"),
        ("/app/signup", "/app/signup"),
        ("/app/otp", "/app/otp"),
        ("/app/forgot-password", "/app/forgot-password"),
        ("/reset-password", "/reset-password"),
        ("/app/magic-link", "/app/magic-link"),
    ] {
        let request = Request {
            method: "GET",
            path,
            cookies: "",
            origin: None,
            referer: None,
            fields: BTreeMap::from([
                ("next".into(), vec!["/app".into()]),
                ("token".into(), vec!["synthetic-reset-token".into()]),
            ]),
            now: 0,
        };
        let response = browser.handle(&request).await.unwrap();
        assert!(response.body.contains("<form method=\"post\""), "{path}");
        assert!(
            response.body.contains(&format!("action=\"{action}\"")),
            "{path}"
        );
        assert_referrer_policy(&response, "strict-origin");
    }

    for (path, fields, expected_action) in [
        (
            "/app/otp",
            BTreeMap::from([
                ("email".into(), vec!["user@example.invalid".into()]),
                ("next".into(), vec!["/app".into()]),
            ]),
            "/app/otp/verify",
        ),
        (
            "/app/login",
            BTreeMap::from([
                ("email".into(), vec!["user@example.invalid".into()]),
                ("password".into(), vec!["synthetic-password".into()]),
                ("next".into(), vec!["/app".into()]),
            ]),
            "/app/login/mfa",
        ),
        (
            "/app/login/mfa",
            BTreeMap::from([
                ("mfaToken".into(), vec!["synthetic-mfa".into()]),
                ("code".into(), vec!["123456".into()]),
            ]),
            "",
        ),
    ] {
        let request = Request {
            method: "POST",
            path,
            cookies: "",
            origin: Some("https://app.example"),
            referer: None,
            fields,
            now: 0,
        };
        let response = browser.handle(&request).await.unwrap();
        assert!(response.body.contains("<form method=\"post\""), "{path}");
        if !expected_action.is_empty() {
            assert!(
                response
                    .body
                    .contains(&format!("action=\"{expected_action}\"")),
                "{path}"
            );
        }
        assert_referrer_policy(&response, "strict-origin");
    }
    server.await.unwrap();
}

#[tokio::test]
async fn signal_auth_fallback_keeps_status_and_headers() {
    let codec = SessionCodec::new("synthetic", false).unwrap();
    let jwt = appcall_auth::JwtVerifier::new("synthetic", Default::default()).unwrap();
    let broker = Broker::new("http://127.0.0.1:1", "appcall").unwrap();
    let browser = Browser {
        codec: &codec,
        identity: Identity {
            jwt: &jwt,
            memberships: &Deny,
            broker: &broker,
        },
        public_origin: "https://app.example",
    };
    let request = Request {
        method: "POST",
        path: "/app/login",
        cookies: "",
        origin: Some("https://evil.example"),
        referer: None,
        fields: BTreeMap::new(),
        now: 0,
    };
    let response = browser.handle(&request).await.unwrap();
    assert_eq!(response.status, 403);
    signal(&response.body);
    assert!(response.body.contains("role=\"alert\""));
    assert!(response
        .headers
        .contains(&("Cache-Control".into(), "no-store".into())));
    assert!(!response.headers.iter().any(|(key, _)| key == "Set-Cookie"));
}

#[tokio::test]
async fn signal_auth_provider_links_are_secondary_and_preserve_safe_next() {
    use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let server = async {
        let (stream, _) = listener.accept().await.unwrap();
        let mut stream = BufReader::new(stream);
        loop {
            let mut line = String::new();
            stream.read_line(&mut line).await.unwrap();
            if line == "\r\n" {
                break;
            }
        }
        let body = r#"{"google":true,"github":false}"#;
        stream
            .get_mut()
            .write_all(
                format!(
                    "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                )
                .as_bytes(),
            )
            .await
            .unwrap();
    };
    let codec = SessionCodec::new("synthetic", false).unwrap();
    let jwt = appcall_auth::JwtVerifier::new("synthetic", Default::default()).unwrap();
    let broker = Broker::new(&format!("http://{address}"), "appcall").unwrap();
    let browser = Browser {
        codec: &codec,
        identity: Identity {
            jwt: &jwt,
            memberships: &Deny,
            broker: &broker,
        },
        public_origin: "https://app.example",
    };
    let request = Request {
        method: "GET",
        path: "/app/login/password",
        cookies: "",
        origin: None,
        referer: None,
        fields: BTreeMap::from([("next".into(), vec!["/app/calls?limit=2&cursor=x".into()])]),
        now: 0,
    };
    let ((), response) = tokio::join!(server, browser.handle(&request));
    let html = response.unwrap().body;
    signal(&html);
    assert!(html.contains("ui-button-secondary"));
    assert!(html.contains("/app/oauth/google?next=%2Fapp%2Fcalls%3Flimit%3D2%26cursor%3Dx"));
    assert!(!html.contains("/app/oauth/github"));
    assert_eq!(html.matches("ui-button-primary").count(), 1);
}

struct NoData;
impl DashboardData for NoData {
    fn execute(
        &self,
        _: DashboardRequest,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<Value, Error>> + Send + '_>>
    {
        panic!("development admin placeholder must not query data")
    }
}

#[tokio::test]
async fn signal_development_identity_placeholder_is_actionable_without_fake_data() {
    let dashboard = DevelopmentDashboard {
        public_origin: "http://127.0.0.1:5080",
        data: &NoData,
    };
    let request = Request {
        method: "GET",
        path: "/app/settings/account",
        cookies: "",
        origin: None,
        referer: None,
        fields: BTreeMap::new(),
        now: 0,
    };
    let response = dashboard.handle(&request).await.unwrap();
    assert_eq!(response.status, 200);
    let content = response
        .body
        .split("<main ")
        .nth(1)
        .unwrap()
        .split("</main>")
        .next()
        .unwrap();
    assert!(content.contains("ui-empty-state"));
    assert!(content.contains("Configure anusa auth"));
    assert!(!content.contains("space-indigo"));
    assert!(!content.contains("dusk-blue"));
    assert!(!response.headers.iter().any(|(key, _)| key == "Set-Cookie"));
}

#[tokio::test]
async fn signal_dashboard_refresh_identity_rejection_clears_session_without_handoff() {
    use tokio::{
        io::{AsyncReadExt, AsyncWriteExt},
        net::TcpListener,
    };
    let fixture: Value = serde_json::from_str(include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../appcall-auth/tests/auth_golden.json"
    )))
    .unwrap();
    let expired: Value = serde_json::from_str(include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/tests/refresh_generation.json"
    )))
    .unwrap();
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let access_token = fixture["jwt"].as_str().unwrap().to_owned();
    let server = tokio::spawn(async move {
        let (mut stream, _) = listener.accept().await.unwrap();
        let mut bytes = [0; 8192];
        let count = stream.read(&mut bytes).await.unwrap();
        assert!(String::from_utf8_lossy(&bytes[..count]).starts_with("POST /api/auth/refresh "));
        let body = serde_json::json!({
            "accessToken": access_token,
            "refreshToken": "rotated-refresh"
        })
        .to_string();
        stream
            .write_all(
                format!(
                    "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                )
                .as_bytes(),
            )
            .await
            .unwrap();
    });
    let codec = SessionCodec::new("dashboard-rejection", false).unwrap();
    let jwt =
        appcall_auth::JwtVerifier::new(fixture["jwt_secret"].as_str().unwrap(), Default::default())
            .unwrap();
    let broker = Broker::new(&format!("http://{address}"), "appcall").unwrap();
    let browser = Browser {
        codec: &codec,
        identity: Identity {
            jwt: &jwt,
            memberships: &Deny,
            broker: &broker,
        },
        public_origin: "https://app.example",
    };
    let dashboard = Dashboard {
        browser: &browser,
        data: &NoData,
    };
    let session = Session {
        access_token: expired["expired_access_token"].as_str().unwrap().into(),
        refresh_token: "old-single-use".into(),
        user_id: "11111111-1111-1111-1111-111111111111".into(),
        email: "fixture@example.invalid".into(),
        tenant_id: "tenant-a".into(),
        tenant_name: "Tenant".into(),
    };
    let cookies = format!("appcall_session={}", codec.seal_session(&session).unwrap());
    let request = Request {
        method: "GET",
        path: "/app/connectors",
        cookies: &cookies,
        origin: None,
        referer: None,
        fields: BTreeMap::new(),
        now: 1800000000,
    };
    let response = dashboard.handle(&request).await.unwrap();
    assert_eq!(response.status, 302);
    assert!(response
        .headers
        .iter()
        .any(|(key, value)| key == "Location" && value == "/app/login"));
    let session_cookies: Vec<_> = response
        .headers
        .iter()
        .filter(|(key, _)| key == "Set-Cookie")
        .collect();
    assert_eq!(session_cookies.len(), 1);
    assert!(session_cookies[0].1.starts_with("appcall_session="));
    assert!(session_cookies[0].1.contains("Max-Age=0"));
    assert!(!response.body.contains("old-single-use"));
    assert!(!response.body.contains("rotated-refresh"));
    assert!(response
        .headers
        .iter()
        .all(|(_, value)| !value.contains("old-single-use") && !value.contains("rotated-refresh")));
    server.await.unwrap();
}
