use crate::*;
use appcall_auth::Principal;
use serde_json::json;

fn signal(html: &str) {
    for old in [
        "prussian-blue",
        "space-indigo",
        "dusk-blue",
        "neon-ice",
        "tropical-teal",
    ] {
        assert!(!html.contains(old), "remaining legacy palette: {old}");
    }
}

#[test]
fn remaining_events_usage_help_and_branding_use_signal() {
    let events = pages::render(DashboardOperation::Triggers, &json!({"events":[{"id":"event_1","connector":"<connector>","operation":"created","connectionId":"connection_1","createdAt":"2026-09-08T10:00:00Z"}]}), None).unwrap();
    signal(&events);
    assert!(events.contains("id=\"trigger-rows\""));
    assert!(events.contains("aria-live=\"polite\""));
    assert_eq!(events.matches("data-init=").count(), 1);
    assert!(events.contains("<caption class=\"sr-only\">Webhook events</caption>"));
    assert!(events.contains("&lt;connector&gt;"));
    let streamed = sse::render_trigger_patch(&json!({"id":"event_2","connector":"<connector>","operation":"created","connectionId":"connection_1","createdAt":"2026-09-08T10:00:00Z"})).unwrap();
    signal(&streamed);
    assert!(streamed.contains("#trigger-rows"));
    assert!(!streamed.contains("<table"));
    assert!(!streamed.contains("<caption"));
    assert_eq!(streamed.matches("<td>").count(), 5);
    signal(
        &pages::render(
            DashboardOperation::Usage,
            &json!({"month":"2026-09","toolCalls":4,"syncedRecords":5,"webhookEvents":6}),
            None,
        )
        .unwrap(),
    );
    signal(&pages::static_page("/app/support"));
    let branding = branding::render(&json!({}));
    signal(&branding);
    assert!(branding.contains("class=\"ui-field\""));
    assert!(branding.contains("ui-button"));
    assert!(branding.contains("type=\"url\""));
    assert!(branding.contains("type=\"color\""));
}

#[test]
fn remaining_admin_forms_and_settings_use_shared_controls() {
    let form = admin::form(
        "/app/users/invite",
        &[
            ("email", "Email", "email", "<value>"),
            ("role", "Role", "text", "admin"),
        ],
    );
    signal(&form);
    assert!(form.contains("class=\"ui-field\""));
    assert!(form.contains("ui-button"));
    assert!(form.contains("method=\"post\""));
    assert!(form.contains("&lt;value&gt;"));
    let settings = admin_ui::settings("proj_1", "Project", "Organization");
    signal(&settings);
    assert!(settings.contains("/app/users"));
    assert!(settings.contains("/app/settings/account"));
    assert!(!settings.contains("href=\"/app/sessions\""));
    signal(&admin_ui::billing(
        Err(Error::Unavailable),
        Err(Error::Unavailable),
    ));
    signal(&admin_ui::banner("<failure>", false));
    assert_eq!(
        admin_ui::failure_target("/app/sessions/other/revoke"),
        Some("/app/settings/account?error=revoke#account-sessions")
    );
}

#[test]
fn remaining_sessions_current_and_malformed_data_remain_distinct() {
    let current = remaining_pages::sessions(Ok(
        json!({"sessions":[{"id":"current","current":true,"userAgent":"<device>","ipAddress":"<ip>"}]}),
    ));
    assert!(current.contains("Current session"));
    assert!(current.contains("<caption class=\"sr-only\">Account sessions</caption>"));
    assert_eq!(current.matches("<th scope=\"col\">").count(), 5);
    assert!(current.contains("ui-state"));
    assert!(!current.contains("/current/revoke"));
    assert!(current.contains("&lt;device&gt;"));
    for value in [json!({}), json!({"sessions":[{"id":"../other"}]})] {
        let html = remaining_pages::sessions(Ok(value));
        assert!(html.contains("Could not load sessions"));
        assert!(!html.contains("No sessions to show"));
    }
    assert!(remaining_pages::sessions(Ok(json!({"sessions":[]}))).contains("No sessions to show"));
    let form = admin::form("/app/sessions/other/revoke", &[]);
    assert_eq!(form.matches("<form ").count(), 1);
    assert!(form.contains("data-confirm-open"));
    assert!(form.contains("formmethod=\"post\""));
    let ids: Vec<_> = form
        .match_indices(" id=\"")
        .map(|(i, _)| form[i + 5..].split('"').next().unwrap())
        .collect();
    assert_eq!(
        ids.iter().collect::<std::collections::BTreeSet<_>>().len(),
        ids.len()
    );
}

#[test]
fn remaining_account_has_one_primary_and_session_table_stays_readable() {
    let html = remaining_pages::account_security(Ok(
        json!({"user":{"displayName":"Name","email":"mail@example.invalid","totpEnabled":false}}),
    ));
    assert!(html.matches("ui-button-primary").count() <= 1);
    let sessions =
        remaining_pages::sessions(Ok(json!({"sessions":[{"id":"other","current":false}]})));
    assert!(sessions.contains("remaining-sessions-table"));
    let css = include_str!("../styles/app.css");
    assert!(css.contains(".remaining-sessions-table { min-width: 720px; }"));
    assert!(sessions.contains("remaining-table-scroll"));
}

#[test]
fn remaining_billing_has_one_primary_with_multiple_plans() {
    let html = admin_ui::billing(
        Ok(
            json!({"billingStatus":"active","plan":{"name":"Current"},"subscriptionCredits":1,"purchasedCredits":2}),
        ),
        Ok(json!({"plans":[{"id":"plan-one","name":"One"},{"id":"plan-two","name":"Two"}]})),
    );
    assert!(html.contains("/app/settings/billing/portal"));
    assert_eq!(
        html.matches("action=\"/app/settings/billing/checkout\"")
            .count(),
        2
    );
    assert!(html.matches("ui-button-primary").count() <= 1);
}

#[test]
fn remaining_branding_has_one_primary_including_preview() {
    let html = branding::render(&json!({}));
    assert!(html.contains("Save"));
    assert!(html.contains("Continue"));
    assert!(html.matches("ui-button-primary").count() <= 1);
}

struct Member;
#[derive(Default)]
struct CertificationData(std::sync::atomic::AtomicUsize);
impl DashboardData for CertificationData {
    fn execute(
        &self,
        _: DashboardRequest,
    ) -> std::pin::Pin<
        Box<dyn std::future::Future<Output = Result<serde_json::Value, Error>> + Send + '_>,
    > {
        self.0.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        Box::pin(async {
            Ok(
                json!({"certifications":[{"connector":"global-secret-connector","manifestFingerprint":"global-secret-fingerprint"}]}),
            )
        })
    }
}

struct FlashData;
impl DashboardData for FlashData {
    fn execute(
        &self,
        _: DashboardRequest,
    ) -> std::pin::Pin<
        Box<dyn std::future::Future<Output = Result<serde_json::Value, Error>> + Send + '_>,
    > {
        Box::pin(async {
            Ok(json!({
                "connections": [{
                    "id": "connection_1",
                    "connector": "mail",
                    "status": "active"
                }]
            }))
        })
    }
}

#[tokio::test]
async fn remaining_connection_flash_uses_a_live_shared_notice() {
    let data = FlashData;
    let session = Session {
        access_token: String::new(),
        refresh_token: String::new(),
        user_id: "user".into(),
        email: "user@example.test".into(),
        tenant_id: "tenant".into(),
        tenant_name: "Tenant".into(),
    };
    let mut fields = std::collections::BTreeMap::new();
    fields.insert("success".into(), vec!["test-passed".into()]);
    let request = Request {
        method: "GET",
        path: "/app/auth-configs",
        cookies: "",
        origin: None,
        referer: None,
        fields,
        now: 100,
    };
    let response = DashboardRenderer { data: &data }
        .render(
            &request,
            Some(DashboardOperation::AuthConfigs),
            &session,
            Principal::project("project").unwrap(),
        )
        .await
        .unwrap();
    let notice = admin_ui::banner("Review the connection's recorded check result below.", true);
    assert!(response.body.contains(&notice));
    assert!(notice.contains("aria-live=\"polite\""));
    assert!(!notice.contains("border-space-indigo"));
}

#[tokio::test]
async fn remaining_certification_is_denied_before_data_even_for_all_grants() {
    let fixture: serde_json::Value =
        serde_json::from_str(include_str!("../../appcall-auth/tests/go_golden.json")).unwrap();
    let codec = SessionCodec::new("test", false).unwrap();
    let jwt =
        appcall_auth::JwtVerifier::new(fixture["jwt_secret"].as_str().unwrap(), Default::default())
            .unwrap();
    let broker = Broker::new("http://127.0.0.1:1", "appcall").unwrap();
    let browser = Browser {
        codec: &codec,
        identity: Identity {
            jwt: &jwt,
            memberships: &Member,
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
        email: "mail@example.invalid".into(),
    };
    let cookies = format!("appcall_session={}", codec.seal_session(&session).unwrap());
    let data = CertificationData::default();
    let dashboard = Dashboard {
        browser: &browser,
        data: &data,
    };
    for cookie in ["", cookies.as_str()] {
        let request = Request {
            method: "GET",
            path: "/app/qa",
            cookies: cookie,
            origin: None,
            referer: None,
            fields: Default::default(),
            now: 1800000000,
        };
        let response = dashboard.handle(&request).await.unwrap();
        if cookie.is_empty() {
            assert_eq!(response.status, 302);
            assert!(response
                .headers
                .contains(&("Location".into(), "/app/login".into())));
        } else {
            assert_eq!(response.status, 403);
        }
        assert!(!response.body.contains("global-secret"));
        assert_eq!(data.0.load(std::sync::atomic::Ordering::SeqCst), 0);
    }
    let request = Request {
        method: "GET",
        path: "/app/qa",
        cookies: "",
        origin: None,
        referer: None,
        fields: Default::default(),
        now: 1800000000,
    };
    let response = DevelopmentDashboard {
        public_origin: "http://127.0.0.1:5080",
        data: &data,
    }
    .handle(&request)
    .await
    .unwrap();
    assert_eq!(response.status, 403);
    assert!(!response.body.contains("global-secret"));
    assert_eq!(data.0.load(std::sync::atomic::Ordering::SeqCst), 0);
}

impl appcall_auth::MembershipVerifier for Member {
    fn verify_membership(
        &self,
        _: &appcall_auth::AccessClaims,
        tenant: &str,
        _: &str,
    ) -> Result<Option<appcall_auth::Membership>, appcall_auth::AuthError> {
        Ok(Some(appcall_auth::Membership {
            tenant_id: tenant.into(),
            allowed_brands: appcall_auth::Grant::All,
            scopes: appcall_auth::Grant::All,
        }))
    }
}

#[tokio::test]
async fn remaining_account_absorbs_sessions_and_preserves_security_on_session_failure() {
    use tokio::{
        io::{AsyncReadExt, AsyncWriteExt},
        net::TcpListener,
    };
    // Security and sessions are independent reads after identity authorization.
    // 1 = unavailable me; 2/3/4 = malformed or absent user DTO.
    for (failed, me_state) in [
        (false, 0),
        (true, 0),
        (false, 1),
        (false, 2),
        (false, 3),
        (false, 4),
    ] {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            for endpoint in ["/api/auth/me", "/api/auth/sessions"] {
                let (mut stream, _) = listener.accept().await.unwrap();
                let mut raw = [0; 8192];
                let n = stream.read(&mut raw).await.unwrap();
                assert!(String::from_utf8_lossy(&raw[..n]).starts_with(&format!("GET {endpoint} ")));
                let (status, value) = if endpoint.ends_with("/me") {
                    match me_state {
                        1 => (503, json!({"error":"unavailable"})),
                        2 => (200, json!({})),
                        3 => (200, json!({"user":null})),
                        4 => (200, json!({"user":"malformed"})),
                        _ => (
                            200,
                            json!({"user":{"displayName":"Name","email":"mail@example.invalid","totpEnabled":false}}),
                        ),
                    }
                } else if failed {
                    (503, json!({"error":"unavailable"}))
                } else {
                    (
                        200,
                        json!({"sessions":[{"id":"other","userAgent":"<device>","current":false}]}),
                    )
                };
                let body = value.to_string();
                stream.write_all(format!("HTTP/1.1 {status} Response\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",body.len()).as_bytes()).await.unwrap();
            }
        });
        let fixture: serde_json::Value =
            serde_json::from_str(include_str!("../../appcall-auth/tests/go_golden.json")).unwrap();
        let codec = SessionCodec::new("test", false).unwrap();
        let jwt = appcall_auth::JwtVerifier::new(
            fixture["jwt_secret"].as_str().unwrap(),
            Default::default(),
        )
        .unwrap();
        let broker = Broker::new(&format!("http://{address}"), "appcall").unwrap();
        let browser = Browser {
            codec: &codec,
            identity: Identity {
                jwt: &jwt,
                memberships: &Member,
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
            email: "mail@example.invalid".into(),
        };
        let cookies = format!("appcall_session={}", codec.seal_session(&session).unwrap());
        let request = Request {
            method: "GET",
            path: "/app/settings/account",
            cookies: &cookies,
            origin: None,
            referer: None,
            fields: Default::default(),
            now: 1800000000,
        };
        let response = browser.handle(&request).await.unwrap();
        assert_eq!(response.status, 200);
        assert!(response.body.contains("id=\"account-sessions\""));
        if me_state == 0 {
            assert!(response.body.contains("Change password"));
        } else {
            assert!(response.body.contains("Could not load account security"));
            assert!(response.body.contains("role=\"alert\""));
            assert!(!response.body.contains("/app/settings/account/mfa/setup"));
            assert!(!response
                .body
                .contains("/app/settings/account/change-password"));
        }
        if failed {
            assert!(response.body.contains("Could not load sessions"));
        } else {
            assert!(response.body.contains("/app/sessions/other/revoke"));
            assert!(response.body.contains("&lt;device&gt;"));
        }
        server.await.unwrap();
    }
}
