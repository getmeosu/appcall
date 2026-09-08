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
            "/app/logs?limit=2&cursor=x",
            "token\"><script>",
            "invite\"><script>",
        );
        signal(&html);
        assert!(html.contains("class=\"ui-field\""), "{path}");
        assert!(html.contains("class=\"ui-control\""));
        assert_eq!(html.matches("ui-button-primary").count(), 1);
        assert!(html.contains("type=\"submit\""));
        assert!(html.contains("method=\"post\""));
        assert!(html.contains("value=\"/app/logs?limit=2&amp;cursor=x\""));
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
        fields: BTreeMap::from([("next".into(), vec!["/app/logs?limit=2&cursor=x".into()])]),
        now: 0,
    };
    let ((), response) = tokio::join!(server, browser.handle(&request));
    let html = response.unwrap().body;
    signal(&html);
    assert!(html.contains("ui-button-secondary"));
    assert!(html.contains("/app/oauth/google?next=%2Fapp%2Flogs%3Flimit%3D2%26cursor%3Dx"));
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
