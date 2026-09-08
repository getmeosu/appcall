use super::*;

fn trace_request(drawer: bool) -> Request<'static> {
    let mut r = request("/app/logs/request-1");
    if drawer {
        r.fields.insert("view".into(), vec!["drawer".into()]);
    }
    r
}

#[tokio::test]
async fn trace_shared_content_is_escaped_and_drawer_has_no_shell() {
    let dto = json!({"requestId":"request-1", "actionLog":{
        "connector":"mail<unsafe>","action":"send", "status":"failed",
        "errorMessage":"<script>alert(1)</script>"}, "replayAvailable":false,
        "replayLog":{"id":"replay-1", "errorMessage":"<private>&\""}});
    for value in [dto.clone(), json!({"data":dto})] {
        let data = fixture(value);
        let full = render(
            &data,
            &trace_request(false),
            Some(DashboardOperation::Trace),
        )
        .await
        .unwrap();
        let drawer = render(&data, &trace_request(true), Some(DashboardOperation::Trace))
            .await
            .unwrap();
        assert!(full.body.contains("<html"));
        assert!(full.body.contains("Back to logs"));
        assert!(drawer.body.starts_with("<section id=\"trace-content\""));
        assert!(drawer.body.contains("data-request-id=\"request-1\""));
        assert!(drawer.body.contains("id=\"trace-title\" tabindex=\"-1\""));
        assert!(
            full.body.contains(&drawer.body),
            "standalone must reuse the exact trace content"
        );
        for absent in [
            "<html",
            "<script",
            "<nav",
            "<main",
            "Back to logs",
            "<private>",
            "mail<unsafe>",
        ] {
            assert!(!drawer.body.contains(absent), "unexpected {absent}");
        }
        for present in [
            "mail&lt;unsafe&gt;",
            "&lt;script&gt;alert(1)&lt;/script&gt;",
            "&lt;private&gt;&amp;",
            "<pre",
            "actionLog",
            "replayLog",
        ] {
            assert!(
                drawer.body.contains(present),
                "missing {present}: {}",
                drawer.body
            );
        }
        for (key, value) in [
            ("Cache-Control", "no-store"),
            ("Referrer-Policy", "no-referrer"),
            ("Content-Type", "text/html; charset=utf-8"),
        ] {
            assert!(drawer.headers.iter().any(|(k, v)| k == key && v == value));
        }
        let seen = data.requests.lock().unwrap();
        assert_eq!(seen.len(), 2);
        for req in seen.iter() {
            assert_eq!(req.operation, DashboardOperation::Trace);
            assert_eq!(req.resource.as_deref(), Some("request-1"));
            assert!(!req.fields.contains_key("view"));
            assert!(!req.form_values.contains_key("view"));
        }
    }
}

#[tokio::test]
async fn trace_replay_requires_explicit_boolean_true() {
    for available in [
        None,
        Some(json!(false)),
        Some(json!("true")),
        Some(json!(true)),
    ] {
        let mut dto = json!({"requestId":"request-1","actionLog":{"status":"succeeded"}});
        if let Some(value) = &available {
            dto["replayAvailable"] = value.clone();
        }
        let enabled = available == Some(json!(true));
        for drawer in [false, true] {
            let response = render(
                &fixture(dto.clone()),
                &trace_request(drawer),
                Some(DashboardOperation::Trace),
            )
            .await
            .unwrap();
            assert_eq!(
                response
                    .body
                    .contains("action=\"/app/logs/request-1/replay\""),
                enabled
            );
            assert_eq!(
                response
                    .body
                    .contains("Replay is not available for this trace."),
                !enabled
            );
            if enabled {
                assert!(response.body.contains("method=\"post\""));
                assert!(response.body.contains("ui-button"));
                assert!(response.body.contains("may repeat changes at the provider"));
            }
        }
    }
}

#[tokio::test]
async fn trace_rejects_malformed_presentation_before_data_dispatch() {
    for values in [
        vec![],
        vec![""],
        vec!["DRAWER"],
        vec![" drawer"],
        vec!["standalone"],
        vec!["drawer", "drawer"],
        vec!["drawer", "other"],
    ] {
        let data = fixture(json!({"requestId":"request-1"}));
        let mut r = trace_request(false);
        r.fields.insert(
            "view".into(),
            values.into_iter().map(str::to_owned).collect(),
        );
        assert!(matches!(
            render(&data, &r, Some(DashboardOperation::Trace)).await,
            Err(Error::Invalid)
        ));
        assert!(data.requests.lock().unwrap().is_empty());
    }
    let data = fixture(json!({}));
    let mut r = trace_request(true);
    r.path = "/app/logs/unsafe<id>";
    assert!(matches!(
        render(&data, &r, Some(DashboardOperation::Trace)).await,
        Err(Error::Invalid)
    ));
    assert!(data.requests.lock().unwrap().is_empty());
}

struct TraceMembership {
    unavailable: bool,
}
impl appcall_auth::MembershipVerifier for TraceMembership {
    fn verify_membership(
        &self,
        claims: &appcall_auth::AccessClaims,
        tenant: &str,
        _: &str,
    ) -> Result<Option<appcall_auth::Membership>, appcall_auth::AuthError> {
        if self.unavailable {
            return Err(appcall_auth::AuthError::Unavailable);
        }
        Ok(
            (tenant == "tenant-a" && claims.user_id == "11111111-1111-1111-1111-111111111111")
                .then(|| appcall_auth::Membership {
                    tenant_id: tenant.into(),
                    allowed_brands: appcall_auth::Grant::All,
                    scopes: appcall_auth::Grant::All,
                }),
        )
    }
}

#[tokio::test]
async fn trace_handle_preserves_authorization_and_drawer_session_errors() {
    let golden: Value = serde_json::from_str(include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../appcall-auth/tests/go_golden.json"
    )))
    .unwrap();
    let codec = SessionCodec::new("synthetic-trace-session", false).unwrap();
    let jwt =
        appcall_auth::JwtVerifier::new(golden["jwt_secret"].as_str().unwrap(), Default::default())
            .unwrap();
    let broker = Broker::new("http://127.0.0.1:1", "appcall").unwrap();
    for unavailable in [false, true] {
        let membership = TraceMembership { unavailable };
        let browser = Browser {
            codec: &codec,
            identity: Identity {
                jwt: &jwt,
                memberships: &membership,
                broker: &broker,
            },
            public_origin: "https://app.example",
        };
        for (method, path) in [("GET", "/app/logs"), ("POST", "/app/logs/request-1/replay")] {
            let data = fixture(json!({}));
            let mut r = trace_request(true);
            r.method = method;
            r.path = path;
            r.origin = Some("https://app.example");
            let response = Dashboard {
                browser: &browser,
                data: &data,
            }
            .handle(&r)
            .await
            .unwrap();
            assert_eq!(
                response.status, 302,
                "view must not change other routes' session handling"
            );
            assert!(!response.body.contains("trace-content"));
            assert!(data.requests.lock().unwrap().is_empty());
        }
        for state in [
            "missing",
            "corrupt",
            "invalid-token",
            "expired",
            "wrong-tenant",
            "valid",
        ] {
            let session = Session {
                access_token: if state == "invalid-token" {
                    "invalid-token".into()
                } else {
                    golden["jwt"].as_str().unwrap().into()
                },
                refresh_token: "private-refresh".into(),
                user_id: "11111111-1111-1111-1111-111111111111".into(),
                email: "safe@example.invalid".into(),
                tenant_id: if state == "wrong-tenant" {
                    "other".into()
                } else {
                    "tenant-a".into()
                },
                tenant_name: "A".into(),
            };
            let session = if state == "expired" {
                Session {
                    refresh_token: String::new(),
                    ..session
                }
            } else {
                session
            };
            let cookies = match state {
                "missing" => String::new(),
                "corrupt" => "appcall_session=corrupt".into(),
                _ => format!("appcall_session={}", codec.seal_session(&session).unwrap()),
            };
            for drawer in [false, true] {
                let data = fixture(
                    json!({"requestId":"request-1", "actionLog":{}, "replayAvailable":false}),
                );
                let dashboard = Dashboard {
                    browser: &browser,
                    data: &data,
                };
                let mut r = trace_request(drawer);
                r.cookies = &cookies;
                r.now = 1800000000;
                if state == "expired" {
                    r.now = 4102444800;
                }
                let response = dashboard.handle(&r).await.unwrap();
                let identity_unavailable = unavailable && matches!(state, "wrong-tenant" | "valid");
                let authorized = !unavailable && state == "valid";
                let expected = if identity_unavailable {
                    503
                } else if authorized {
                    200
                } else if drawer {
                    401
                } else {
                    302
                };
                assert_eq!(
                    response.status, expected,
                    "{state}, drawer={drawer}, unavailable={unavailable}"
                );
                let seen = data.requests.lock().unwrap();
                assert_eq!(seen.len(), usize::from(authorized));
                if authorized {
                    assert_eq!(seen[0].principal.project_id, "proj_tenant-a");
                    assert!(!seen[0].fields.contains_key("view"));
                    assert!(!seen[0].form_values.contains_key("view"));
                } else if !identity_unavailable {
                    assert!(response
                        .headers
                        .iter()
                        .any(|(k, v)| k == "Set-Cookie" && v.contains("Max-Age=0")));
                    assert_eq!(
                        response
                            .headers
                            .iter()
                            .any(|(k, v)| k == "Location" && v == "/app/login"),
                        !drawer
                    );
                }
                assert!(!response.body.contains("private-refresh"));
            }
        }
        if !unavailable {
            let session = Session {
                access_token: golden["jwt"].as_str().unwrap().into(),
                refresh_token: String::new(),
                user_id: "11111111-1111-1111-1111-111111111111".into(),
                email: "safe@example.invalid".into(),
                tenant_id: "tenant-a".into(),
                tenant_name: "A".into(),
            };
            let cookies = format!("appcall_session={}", codec.seal_session(&session).unwrap());
            for (error, status) in [
                (Error::Unauthorized, 401),
                (Error::Forbidden, 403),
                (Error::Unavailable, 503),
                (Error::Invalid, 400),
            ] {
                let data = DetailedFailureFixture {
                    failure: DashboardFailure::from(error),
                    detailed_calls: std::sync::atomic::AtomicUsize::new(0),
                    legacy_calls: std::sync::atomic::AtomicUsize::new(0),
                };
                let mut r = trace_request(true);
                r.cookies = &cookies;
                r.now = 1800000000;
                let response = Dashboard {
                    browser: &browser,
                    data: &data,
                }
                .handle(&r)
                .await
                .unwrap();
                assert_eq!(response.status, status);
                assert!(!response.body.contains("trace-content"));
                assert!(!response.body.contains("<html"));
                assert!(!response.headers.iter().any(|(k, _)| k == "Location"));
                assert_eq!(
                    data.detailed_calls
                        .load(std::sync::atomic::Ordering::SeqCst),
                    1
                );
            }
        }
    }
}
