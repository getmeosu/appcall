use appcall_web::*;
#[test]
fn session_encryption_rejects_tampering_and_cross_purpose() {
    let c = SessionCodec::new("synthetic secret", true).unwrap();
    let s = Session {
        access_token: "private bearer".into(),
        refresh_token: "private refresh".into(),
        user_id: "u".into(),
        email: "e".into(),
        tenant_id: "t".into(),
        tenant_name: "T".into(),
    };
    let token = c.seal_session(&s).unwrap();
    assert!(!token.contains("private"));
    assert_eq!(c.open_session(&token).unwrap(), s);
    assert!(SessionCodec::new("wrong", true)
        .unwrap()
        .open_session(&token)
        .is_err());
    assert!(c.open_transaction(&token, 100).is_err());
    let mut bad = token.into_bytes();
    bad[15] = if bad[15] == b'A' { b'B' } else { b'A' };
    assert!(c.open_session(std::str::from_utf8(&bad).unwrap()).is_err());
    assert!(c
        .session_cookie(&s)
        .unwrap()
        .contains("HttpOnly; SameSite=Lax; Secure"));
}
#[test]
fn transaction_expiration_and_redirects_fail_closed() {
    let c = SessionCodec::new("secret", false).unwrap();
    let tx = OAuthTransaction::new(100, "//evil.example").unwrap();
    assert_eq!(tx.next, "/app");
    let raw = c.seal_transaction(&tx).unwrap();
    assert!(c.open_transaction(&raw, 699).is_ok());
    assert!(c.open_transaction(&raw, 700).is_err());
    assert!(c.open_transaction(&raw, 0).is_err());
    assert!(c.open_session(&raw).is_err());
    for path in [
        "https://evil",
        "//evil",
        "/app/\\evil",
        "/app/../other",
        "/app/%2e%2e/evil",
        "/apple",
    ] {
        assert_eq!(safe_next(path), "/app");
    }
    assert_eq!(safe_next("/app/logs?page=2"), "/app/logs?page=2");
    assert_eq!(
        safe_next("/app/logs?cursor=a%2Bb"),
        "/app/logs?cursor=a%2Bb"
    );
}
#[test]
fn duplicate_cookies_and_csrf_rejected() {
    assert!(cookie("appcall_session=a; appcall_session=b", "appcall_session").is_err());
    assert!(verify_csrf("https://app.example", Some("https://evil.example"), None).is_err());
    assert!(verify_csrf("https://app.example", None, None).is_err());
    assert!(verify_csrf("https://app.example", Some("https://app.example"), None).is_ok());
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
async fn identity_routes_reject_cross_origin_and_legacy_callback() {
    let codec = SessionCodec::new("test", false).unwrap();
    let jwt = appcall_auth::JwtVerifier::new("test", Default::default()).unwrap();
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
    let mut request = Request {
        method: "POST",
        path: "/app/login",
        cookies: "",
        origin: Some("https://evil.example"),
        referer: None,
        fields: Default::default(),
        now: 100,
    };
    assert_eq!(browser.handle(&request).await.unwrap().status, 403);
    request.origin = Some("https://app.example");
    request.path = "/auth/callback";
    let result = browser.handle(&request).await.unwrap();
    assert_eq!(result.status, 400);
    assert!(result
        .headers
        .iter()
        .any(|(k, v)| k == "Set-Cookie" && v.contains("Max-Age=0")));
    request.method = "GET";
    request.path = "/app/login/password";
    assert!(browser
        .handle(&request)
        .await
        .unwrap()
        .body
        .contains("type=\"password\""));
    request.path = "/app/oauth/unknown";
    assert_eq!(browser.handle(&request).await.unwrap().status, 400);
}
#[tokio::test]
async fn broker_does_not_follow_redirect_or_return_provider_secrets() {
    use tokio::{
        io::{AsyncReadExt, AsyncWriteExt},
        net::TcpListener,
    };
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let server = tokio::spawn(async move {
        let (mut stream, _) = listener.accept().await.unwrap();
        let mut b = [0; 4096];
        let _ = stream.read(&mut b).await.unwrap();
        stream.write_all(b"HTTP/1.1 302 Found\r\nLocation: http://127.0.0.1:1/stolen\r\nContent-Length: 6\r\nConnection: close\r\n\r\nsecret").await.unwrap();
    });
    let broker = Broker::new(&format!("http://{address}"), "appcall").unwrap();
    assert!(matches!(
        broker
            .auth(
                "/api/auth/login",
                serde_json::json!({"password":"synthetic"})
            )
            .await,
        Err(Error::Unavailable)
    ));
    server.await.unwrap();
}
#[test]
fn broker_configuration_rejects_credentials_and_insecure_remote() {
    for base in [
        "http://identity.example",
        "https://user:pass@identity.example",
        "https://identity.example?foo=bar",
    ] {
        assert!(Broker::new(base, "appcall").is_err());
    }
}
#[test]
fn encrypted_session_cannot_override_token_user_or_membership() {
    let f: serde_json::Value =
        serde_json::from_str(include_str!("../../appcall-auth/tests/go_golden.json")).unwrap();
    let jwt = appcall_auth::JwtVerifier::new(f["jwt_secret"].as_str().unwrap(), Default::default())
        .unwrap();
    let broker = Broker::new("http://127.0.0.1:1", "appcall").unwrap();
    let identity = Identity {
        jwt: &jwt,
        memberships: &Deny,
        broker: &broker,
    };
    let mut session = Session {
        access_token: f["jwt"].as_str().unwrap().into(),
        refresh_token: "synthetic-refresh".into(),
        user_id: "forged-user".into(),
        tenant_id: "tenant-a".into(),
        email: String::new(),
        tenant_name: String::new(),
    };
    assert!(matches!(
        identity.authorize(&session, 1800000000),
        Err(Error::Unauthorized)
    ));
    session.user_id = "11111111-1111-1111-1111-111111111111".into();
    assert!(identity.authorize(&session, 1800000000).is_err());
    let pending = AuthResult {
        mfa_required: true,
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        ..Default::default()
    };
    assert!(matches!(
        identity.establish(pending, 1800000000),
        Err(Error::Unauthorized)
    ));
}
#[tokio::test]
async fn administration_requires_session_before_broker_dispatch() {
    let codec = SessionCodec::new("test", false).unwrap();
    let jwt = appcall_auth::JwtVerifier::new("test", Default::default()).unwrap();
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
    for path in [
        "/app/settings/team",
        "/app/sessions",
        "/app/settings/account",
        "/app/settings/organization",
        "/app/settings/billing",
    ] {
        let request = Request {
            method: "GET",
            path,
            cookies: "",
            origin: None,
            referer: None,
            fields: Default::default(),
            now: 100,
        };
        let response = browser
            .handle(&request)
            .await
            .expect("admin route is handled");
        assert_eq!(response.status, 302);
        assert!(response
            .headers
            .iter()
            .any(|(k, v)| k == "Location" && v == "/app/login"));
    }
}
struct Allow;
impl appcall_auth::MembershipVerifier for Allow {
    fn verify_membership(
        &self,
        c: &appcall_auth::AccessClaims,
        t: &str,
        hash: &str,
    ) -> Result<Option<appcall_auth::Membership>, appcall_auth::AuthError> {
        assert!(!hash.is_empty());
        Ok(
            (t == "tenant-a" && c.user_id == "11111111-1111-1111-1111-111111111111").then(|| {
                appcall_auth::Membership {
                    tenant_id: t.into(),
                    allowed_brands: appcall_auth::Grant::All,
                    scopes: appcall_auth::Grant::All,
                }
            }),
        )
    }
}
#[tokio::test]
async fn members_page_uses_verified_tenant_and_escapes_broker_data() {
    use tokio::{
        io::{AsyncReadExt, AsyncWriteExt},
        net::TcpListener,
    };
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let server = tokio::spawn(async move {
        let (mut stream, _) = listener.accept().await.unwrap();
        let mut raw = vec![0; 8192];
        let n = stream.read(&mut raw).await.unwrap();
        let request = String::from_utf8_lossy(&raw[..n]).to_lowercase();
        assert!(request.starts_with("get /api/tenant/members "));
        assert!(request.contains("x-tenant-id: tenant-a"));
        assert!(request.contains("authorization: bearer "));
        let body = r#"{"members":[{"userId":"owner-id","displayName":"<script>alert(1)</script>","email":"safe@example.invalid","role":"owner"}]}"#;
        let response=format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",body.len());
        stream.write_all(response.as_bytes()).await.unwrap();
    });
    let f: serde_json::Value =
        serde_json::from_str(include_str!("../../appcall-auth/tests/go_golden.json")).unwrap();
    let codec = SessionCodec::new("test", false).unwrap();
    let jwt = appcall_auth::JwtVerifier::new(f["jwt_secret"].as_str().unwrap(), Default::default())
        .unwrap();
    let broker = Broker::new(&format!("http://{address}"), "appcall").unwrap();
    let browser = Browser {
        codec: &codec,
        identity: Identity {
            jwt: &jwt,
            memberships: &Allow,
            broker: &broker,
        },
        public_origin: "https://app.example",
    };
    let session = Session {
        access_token: f["jwt"].as_str().unwrap().into(),
        refresh_token: "refresh".into(),
        user_id: "11111111-1111-1111-1111-111111111111".into(),
        tenant_id: "tenant-a".into(),
        tenant_name: "A".into(),
        email: "safe@example.invalid".into(),
    };
    let cookies = format!("appcall_session={}", codec.seal_session(&session).unwrap());
    let request = Request {
        method: "GET",
        path: "/app/settings/team",
        cookies: &cookies,
        origin: None,
        referer: None,
        fields: Default::default(),
        now: 1800000000,
    };
    let response = browser.handle(&request).await.unwrap();
    assert_eq!(response.status, 200);
    assert!(response.body.contains("&lt;script&gt;"));
    assert!(!response.body.contains("<script>"));
    assert!(!response.body.contains("/owner-id/remove"));
    server.await.unwrap();
}
struct DashboardFixture;
#[tokio::test]
async fn signal_canonical_revoke_success_and_error_recover_to_account_once() {
    use tokio::{
        io::{AsyncReadExt, AsyncWriteExt},
        net::TcpListener,
    };
    for (status, query) in [(200, "revoked=1"), (503, "error=revoke")] {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.unwrap();
            let mut raw = [0; 8192];
            let count = stream.read(&mut raw).await.unwrap();
            let request = String::from_utf8_lossy(&raw[..count]).to_lowercase();
            assert!(
                request.starts_with("delete /api/auth/sessions/session-one "),
                "{request}"
            );
            assert!(request.contains("x-tenant-id: tenant-a"));
            assert!(request.contains("authorization: bearer "));
            let body = "{}";
            stream.write_all(format!("HTTP/1.1 {status} Result\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()).as_bytes()).await.unwrap();
            assert!(
                tokio::time::timeout(std::time::Duration::from_millis(100), listener.accept())
                    .await
                    .is_err(),
                "revoke was dispatched twice"
            );
        });
        let f: serde_json::Value =
            serde_json::from_str(include_str!("../../appcall-auth/tests/go_golden.json")).unwrap();
        let codec = SessionCodec::new("test", false).unwrap();
        let jwt =
            appcall_auth::JwtVerifier::new(f["jwt_secret"].as_str().unwrap(), Default::default())
                .unwrap();
        let broker = Broker::new(&format!("http://{address}"), "appcall").unwrap();
        let browser = Browser {
            codec: &codec,
            identity: Identity {
                jwt: &jwt,
                memberships: &Allow,
                broker: &broker,
            },
            public_origin: "https://app.example",
        };
        let session = Session {
            access_token: f["jwt"].as_str().unwrap().into(),
            refresh_token: "refresh".into(),
            user_id: "11111111-1111-1111-1111-111111111111".into(),
            tenant_id: "tenant-a".into(),
            tenant_name: "A".into(),
            email: "safe@example.invalid".into(),
        };
        let cookies = format!("appcall_session={}", codec.seal_session(&session).unwrap());
        let request = Request {
            method: "POST",
            path: "/app/settings/account/sessions/session-one/revoke",
            cookies: &cookies,
            origin: Some("https://app.example"),
            referer: None,
            fields: Default::default(),
            now: 1800000000,
        };
        let response =
            tokio::time::timeout(std::time::Duration::from_secs(3), browser.handle(&request))
                .await
                .unwrap()
                .unwrap();
        assert_eq!(response.status, 302);
        let location = response
            .headers
            .iter()
            .find(|(key, _)| key.eq_ignore_ascii_case("location"))
            .map(|(_, value)| value.as_str());
        assert!(
            location == Some(format!("/app/settings/account?{query}#account-sessions").as_str()),
            "status={}, Location={location:?}",
            response.status
        );
        server.await.unwrap();
    }
}
impl DashboardData for DashboardFixture {
    fn execute(
        &self,
        request: DashboardRequest,
    ) -> std::pin::Pin<
        Box<dyn std::future::Future<Output = Result<serde_json::Value, Error>> + Send + '_>,
    > {
        assert_eq!(request.principal.project_id, "proj_tenant-a");
        assert_eq!(
            request.principal.user_id.as_deref(),
            Some("11111111-1111-1111-1111-111111111111")
        );
        Box::pin(async move {
            match request.operation {
                DashboardOperation::Catalog => Ok(
                    serde_json::json!({"connectors":[{"key":"safe","name":"<script>bad</script>","operations":[]}]}),
                ),
                DashboardOperation::TestForm => Ok(
                    serde_json::json!({"inputSchema":{"type":"object","properties":{"query":{"type":"string","description":"<script>"},"actor":{"type":"string","x-dynamic-options":{"source":"actors.options","detailSource":"actors.input_schema"}}}}}),
                ),
                _ => Err(Error::Invalid),
            }
        })
    }
}
#[tokio::test]
async fn dashboard_embeds_assets_and_never_trusts_form_project() {
    let f: serde_json::Value =
        serde_json::from_str(include_str!("../../appcall-auth/tests/go_golden.json")).unwrap();
    let codec = SessionCodec::new("test", false).unwrap();
    let jwt = appcall_auth::JwtVerifier::new(f["jwt_secret"].as_str().unwrap(), Default::default())
        .unwrap();
    let broker = Broker::new("http://127.0.0.1:1", "appcall").unwrap();
    let browser = Browser {
        codec: &codec,
        identity: Identity {
            jwt: &jwt,
            memberships: &Allow,
            broker: &broker,
        },
        public_origin: "https://app.example",
    };
    let dashboard = Dashboard {
        browser: &browser,
        data: &DashboardFixture,
    };
    let session = Session {
        access_token: f["jwt"].as_str().unwrap().into(),
        refresh_token: "refresh".into(),
        user_id: "11111111-1111-1111-1111-111111111111".into(),
        tenant_id: "tenant-a".into(),
        tenant_name: "A".into(),
        email: "safe@example.invalid".into(),
    };
    let cookies = format!("appcall_session={}", codec.seal_session(&session).unwrap());
    let mut request = Request {
        method: "GET",
        path: "/app/connectors",
        cookies: &cookies,
        origin: None,
        referer: None,
        fields: Default::default(),
        now: 1800000000,
    };
    request
        .fields
        .insert("projectId".into(), vec!["forged".into()]);
    let result = dashboard.handle(&request).await.unwrap();
    assert_eq!(result.status, 200);
    assert!(result.body.contains("&lt;script&gt;bad"));
    assert!(result.body.contains("/static/app.css"));
    assert!(result.body.contains("/app/connectors/safe"));
    request.path = "/app/connectors/safe/test-form";
    let fragment = dashboard.handle(&request).await.unwrap();
    assert_eq!(fragment.status, 200);
    assert!(fragment
        .body
        .starts_with("event: datastar-patch-elements\n"));
    assert!(fragment.body.contains("id=\"tk-test-fields\""));
    assert!(fragment.body.contains("name=\"f.query\""));
    assert!(fragment.body.contains("actors.options"));
    assert!(fragment.body.contains("&lt;script&gt;"));
    request.path = "/static/../Cargo.toml";
    assert_eq!(dashboard.handle(&request).await.unwrap().status, 404);
    request.path = "/static/app.css";
    let result = dashboard.handle(&request).await.unwrap();
    assert_eq!(result.status, 200);
    assert_eq!(result.body, include_str!("../static/app.css"));
}
#[tokio::test]
async fn callback_requires_echoed_binding_before_issuing_cookie() {
    use tokio::{
        io::{AsyncReadExt, AsyncWriteExt},
        net::TcpListener,
    };
    let f: serde_json::Value =
        serde_json::from_str(include_str!("../../appcall-auth/tests/go_golden.json")).unwrap();
    let tx = OAuthTransaction::new(1800000000, "/app/logs").unwrap();
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let token = f["jwt"].as_str().unwrap().to_owned();
    let state = tx.state.clone();
    let challenge = tx.challenge();
    let server = tokio::spawn(async move {
        for n in 0..2 {
            let (mut stream, _) = listener.accept().await.unwrap();
            let mut bytes = [0; 8192];
            let count = stream.read(&mut bytes).await.unwrap();
            let request = String::from_utf8_lossy(&bytes[..count]);
            let body=if n==0{assert!(request.starts_with("POST /api/auth/exchange-code "));serde_json::json!({"accessToken":token,"refreshToken":"rotated","clientState":state,"codeChallenge":challenge})}else{assert!(request.starts_with("GET /api/auth/me "));serde_json::json!({"memberships":[{"tenantId":"tenant-a","tenantName":"A","isRoot":true}]})}.to_string();
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
        }
    });
    let codec = SessionCodec::new("test", false).unwrap();
    let jwt = appcall_auth::JwtVerifier::new(f["jwt_secret"].as_str().unwrap(), Default::default())
        .unwrap();
    let broker = Broker::new(&format!("http://{address}"), "appcall").unwrap();
    let browser = Browser {
        codec: &codec,
        identity: Identity {
            jwt: &jwt,
            memberships: &Allow,
            broker: &broker,
        },
        public_origin: "https://app.example",
    };
    let cookies = format!(
        "appcall_oauth_login={}",
        codec.seal_transaction(&tx).unwrap()
    );
    let mut fields = std::collections::BTreeMap::new();
    fields.insert("client_state".into(), vec![tx.state]);
    fields.insert("code".into(), vec!["one-time".into()]);
    let request = Request {
        method: "GET",
        path: "/auth/callback",
        cookies: &cookies,
        origin: None,
        referer: None,
        fields,
        now: 1800000000,
    };
    let result = browser.handle(&request).await.unwrap();
    assert_eq!(result.status, 302);
    assert!(result
        .headers
        .iter()
        .any(|(k, v)| k == "Location" && v == "/app/logs"));
    assert!(result
        .headers
        .iter()
        .any(|(k, v)| k == "Set-Cookie" && v.starts_with("appcall_session=")));
    assert!(result.headers.iter().any(|(k, v)| k == "Set-Cookie"
        && v.starts_with("appcall_oauth_login=")
        && v.contains("Max-Age=0")));
    server.await.unwrap();
}
#[tokio::test]
async fn simultaneous_refreshes_exchange_single_use_token_once() {
    use tokio::{
        io::{AsyncReadExt, AsyncWriteExt},
        net::TcpListener,
    };
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let server = tokio::spawn(async move {
        let (mut stream, _) = listener.accept().await.unwrap();
        let mut bytes = [0; 8192];
        let n = stream.read(&mut bytes).await.unwrap();
        assert!(String::from_utf8_lossy(&bytes[..n]).starts_with("POST /api/auth/refresh "));
        tokio::time::sleep(std::time::Duration::from_millis(30)).await;
        let body = r#"{"accessToken":"new-access","refreshToken":"new-refresh"}"#;
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
    let broker = Broker::new(&format!("http://{address}"), "appcall").unwrap();
    let (first, second) = tokio::join!(
        broker.refresh_tokens("old-single-use"),
        broker.refresh_tokens("old-single-use")
    );
    assert_eq!(first.unwrap(), ("new-access".into(), "new-refresh".into()));
    assert_eq!(second.unwrap(), ("new-access".into(), "new-refresh".into()));
    server.await.unwrap();
}

#[tokio::test]
async fn mfa_qr_uses_broker_url_and_admin_errors_redirect_without_secrets() {
    use tokio::{
        io::{AsyncReadExt, AsyncWriteExt},
        net::TcpListener,
    };
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let server = tokio::spawn(async move {
        for (expected, status, body) in [
            (
                "POST /api/auth/mfa/setup ",
                200,
                r#"{"url":"otpauth://totp/Appcall:test?secret=JBSWY3DPEHPK3PXP&issuer=Appcall","secret":"JBSWY3DPEHPK3PXP"}"#,
            ),
            (
                "POST /api/tenant/members/invite ",
                403,
                r#"{"error":"private broker diagnostic"}"#,
            ),
            ("GET /api/tenant/members ", 200, r#"{"members":[]}"#),
        ] {
            let (mut stream, _) = listener.accept().await.unwrap();
            let mut bytes = [0; 8192];
            let n = stream.read(&mut bytes).await.unwrap();
            let request = String::from_utf8_lossy(&bytes[..n]);
            assert!(request.starts_with(expected));
            let response=format!("HTTP/1.1 {status} Response\r\nContent-Length: {}\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n{body}",body.len());
            stream.write_all(response.as_bytes()).await.unwrap();
        }
    });
    let fixture: serde_json::Value =
        serde_json::from_str(include_str!("../../appcall-auth/tests/go_golden.json")).unwrap();
    let codec = SessionCodec::new("synthetic", false).unwrap();
    let jwt =
        appcall_auth::JwtVerifier::new(fixture["jwt_secret"].as_str().unwrap(), Default::default())
            .unwrap();
    let broker = Broker::new(&format!("http://{address}"), "appcall").unwrap();
    let browser = Browser {
        codec: &codec,
        identity: Identity {
            jwt: &jwt,
            memberships: &Allow,
            broker: &broker,
        },
        public_origin: "https://app.example",
    };
    let session = Session {
        access_token: fixture["jwt"].as_str().unwrap().into(),
        refresh_token: "refresh".into(),
        user_id: "11111111-1111-1111-1111-111111111111".into(),
        tenant_id: "tenant-a".into(),
        tenant_name: "A".into(),
        email: "safe@example.invalid".into(),
    };
    let cookies = format!("appcall_session={}", codec.seal_session(&session).unwrap());
    let mut request = Request {
        method: "POST",
        path: "/app/settings/account/mfa/setup",
        cookies: &cookies,
        origin: Some("https://app.example"),
        referer: None,
        fields: Default::default(),
        now: 1800000000,
    };
    let response = browser.handle(&request).await.unwrap();
    assert_eq!(response.status, 200);
    assert!(response.body.contains("<svg role=\"img\""));
    assert!(response
        .headers
        .contains(&("Cache-Control".into(), "no-store".into())));
    request.path = "/app/settings/team/invite";
    request
        .fields
        .insert("email".into(), vec!["member@example.invalid".into()]);
    let response = browser.handle(&request).await.unwrap();
    assert_eq!(response.status, 302);
    assert!(response
        .headers
        .contains(&("Location".into(), "/app/settings/team?error=invite".into())));
    assert!(!response.body.contains("private broker"));
    request.method = "GET";
    request.path = "/app/settings/team";
    request.fields.insert("error".into(), vec!["invite".into()]);
    let response = browser.handle(&request).await.unwrap();
    assert!(response
        .body
        .contains("Check the members list before sending another invitation."));
    assert!(response.body.contains("role=\"alert\""));
    server.await.unwrap();
}

#[tokio::test]
async fn replacement_identity_keeps_shared_refresh_and_rechecks_new_membership() {
    use std::sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    };
    use tokio::{
        io::{AsyncReadExt, AsyncWriteExt},
        net::TcpListener,
    };
    struct Generation {
        checks: AtomicUsize,
        healthy: bool,
    }
    impl appcall_auth::MembershipVerifier for Generation {
        fn verify_membership(
            &self,
            claims: &appcall_auth::AccessClaims,
            tenant: &str,
            hash: &str,
        ) -> Result<Option<appcall_auth::Membership>, appcall_auth::AuthError> {
            self.checks.fetch_add(1, Ordering::SeqCst);
            if !self.healthy {
                return Err(appcall_auth::AuthError::Unavailable);
            }
            Allow.verify_membership(claims, tenant, hash)
        }
    }
    let fixture: serde_json::Value =
        serde_json::from_str(include_str!("../../appcall-auth/tests/go_golden.json")).unwrap();
    let expired: serde_json::Value =
        serde_json::from_str(include_str!("refresh_generation.json")).unwrap();
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let exchanges = Arc::new(AtomicUsize::new(0));
    let count = exchanges.clone();
    let token = fixture["jwt"].as_str().unwrap().to_owned();
    let server = tokio::spawn(async move {
        while let Ok(Ok((mut stream, _))) =
            tokio::time::timeout(std::time::Duration::from_millis(150), listener.accept()).await
        {
            let n = count.fetch_add(1, Ordering::SeqCst);
            let mut bytes = [0; 8192];
            let read = stream.read(&mut bytes).await.unwrap();
            assert!(String::from_utf8_lossy(&bytes[..read]).starts_with("POST /api/auth/refresh "));
            tokio::time::sleep(std::time::Duration::from_millis(25)).await;
            let (status, body) = if n == 0 {
                (
                    200,
                    serde_json::json!({"accessToken":token,"refreshToken":"rotated-once"})
                        .to_string(),
                )
            } else {
                (401, "{}".into())
            };
            stream.write_all(format!("HTTP/1.1 {status} Response\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",body.len()).as_bytes()).await.unwrap();
        }
    });
    let shared = Broker::shared(&format!("http://{address}"), "appcall").unwrap();
    let replacement = Arc::new(shared.as_ref().clone());
    let jwt =
        appcall_auth::JwtVerifier::new(fixture["jwt_secret"].as_str().unwrap(), Default::default())
            .unwrap();
    let old_members = Generation {
        checks: AtomicUsize::new(0),
        healthy: false,
    };
    let new_members = Generation {
        checks: AtomicUsize::new(0),
        healthy: true,
    };
    let old = Identity {
        jwt: &jwt,
        memberships: &old_members,
        broker: shared.as_ref(),
    };
    let new = Identity {
        jwt: &jwt,
        memberships: &new_members,
        broker: replacement.as_ref(),
    };
    let session = Session {
        access_token: expired["expired_access_token"].as_str().unwrap().into(),
        refresh_token: "single-use-old-cookie".into(),
        user_id: "11111111-1111-1111-1111-111111111111".into(),
        tenant_id: "tenant-a".into(),
        tenant_name: "Preserved tenant".into(),
        email: "preserved@example.invalid".into(),
    };
    let (old_result, new_result) = tokio::join!(
        old.refresh(&session, 1800000000),
        new.refresh(&session, 1800000000)
    );
    assert!(matches!(old_result, Err(Error::Unavailable)));
    let (refreshed, principal) = new_result.unwrap();
    assert_eq!(refreshed.refresh_token, "rotated-once");
    assert_eq!(refreshed.tenant_name, session.tenant_name);
    assert_eq!(refreshed.email, session.email);
    assert_eq!(principal.project_id, "proj_tenant-a");
    assert_eq!(old_members.checks.load(Ordering::SeqCst), 1);
    assert_eq!(new_members.checks.load(Ordering::SeqCst), 1);
    server.await.unwrap();
    assert_eq!(exchanges.load(Ordering::SeqCst), 1);
}
