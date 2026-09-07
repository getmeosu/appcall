use appcall_auth::*;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use hmac::{Hmac, KeyInit, Mac};
use serde_json::{json, Value};
use sha2::Sha256;
fn fixture() -> Value {
    serde_json::from_str(include_str!("go_golden.json")).unwrap()
}
fn token(header: Value, claims: Value) -> String {
    let h = URL_SAFE_NO_PAD.encode(serde_json::to_vec(&header).unwrap());
    let c = URL_SAFE_NO_PAD.encode(serde_json::to_vec(&claims).unwrap());
    let input = format!("{h}.{c}");
    let mut mac = Hmac::<Sha256>::new_from_slice(b"fixture-anusa-access-secret").unwrap();
    mac.update(input.as_bytes());
    format!(
        "{input}.{}",
        URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes())
    )
}
struct Members;
impl MembershipVerifier for Members {
    fn verify_membership(
        &self,
        c: &AccessClaims,
        tenant: &str,
        _: &str,
    ) -> Result<Option<Membership>, AuthError> {
        Ok(
            (c.user_id == "11111111-1111-1111-1111-111111111111" && tenant == "tenant-a").then(
                || Membership {
                    tenant_id: tenant.into(),
                    allowed_brands: Grant::All,
                    scopes: Grant::All,
                },
            ),
        )
    }
}
#[test]
fn go_api_key_golden_authenticates_exactly() {
    let f = fixture();
    let verifier = StaticApiKey::from_hash(
        f["api_key_sha256"].as_str().unwrap(),
        Principal::project("proj_dev").unwrap(),
    )
    .unwrap();
    assert!(verifier
        .verify_api_key(f["api_key"].as_str().unwrap())
        .unwrap()
        .is_some());
    assert!(verifier.verify_api_key("wrong").unwrap().is_none());
    assert!(verifier.verify_api_key("").unwrap().is_none());
}
#[test]
fn go_jwt_golden_verifies_and_maps_only_verified_tenant() {
    let f = fixture();
    let jwt = JwtVerifier::new(f["jwt_secret"].as_str().unwrap(), JwtPolicy::default()).unwrap();
    let claims = jwt.verify(f["jwt"].as_str().unwrap(), 1800000000).unwrap();
    assert_eq!(claims.user_id, "11111111-1111-1111-1111-111111111111");
    let auth = Authenticator::production(None, Some(&jwt), Some(&Members)).unwrap();
    let bearer = format!("Bearer {}", f["jwt"].as_str().unwrap());
    let result = auth
        .authorize(
            &[
                Header::new("Authorization", &bearer),
                Header::new("X-Tenant-ID", "tenant-a"),
            ],
            &RequestContext {
                now_unix: 1800000000,
                ..Default::default()
            },
        )
        .unwrap();
    assert_eq!(result.project_id, "proj_tenant-a");
    assert!(auth
        .authorize(
            &[
                Header::new("Authorization", &bearer),
                Header::new("X-Tenant-ID", "foreign")
            ],
            &RequestContext {
                now_unix: 1800000000,
                ..Default::default()
            }
        )
        .is_err());
}
#[test]
fn jwt_rejects_expiry_algorithm_and_step_up_tokens() {
    let jwt = JwtVerifier::new("fixture-anusa-access-secret", JwtPolicy::default()).unwrap();
    for (header, claims) in [
        (
            json!({"alg":"HS512"}),
            json!({"userId":"u","exp":2000000000}),
        ),
        (json!({"alg":"none"}), json!({"userId":"u"})),
        (
            json!({"alg":"HS256"}),
            json!({"userId":"u","exp":1800000000}),
        ),
        (
            json!({"alg":"HS256"}),
            json!({"userId":"u","nbf":1900000000}),
        ),
        (
            json!({"alg":"HS256"}),
            json!({"userId":"u","tokenType":"mfa","mfaPending":true}),
        ),
    ] {
        assert!(jwt.verify(&token(header, claims), 1800000000).is_err());
    }
}
#[test]
fn duplicate_auth_headers_and_wrong_scope_are_rejected() {
    let f = fixture();
    let key = f["api_key"].as_str().unwrap();
    let mut p = Principal::project("project-a").unwrap();
    p.allowed_brands = Grant::Only(["brand-a".into()].into());
    p.scopes = Grant::Only(["read".into()].into());
    let verifier = StaticApiKey::from_hash(f["api_key_sha256"].as_str().unwrap(), p).unwrap();
    let auth = Authenticator::production(Some(&verifier), None, None).unwrap();
    let context = RequestContext {
        require_brand: true,
        required_scope: Some("read"),
        ..Default::default()
    };
    let headers = [
        Header::new("X-API-Key", key),
        Header::new("X-External-Account-Id", "brand-a"),
    ];
    assert!(auth.authorize(&headers, &context).is_ok());
    assert!(auth
        .authorize(
            &[Header::new("X-API-Key", key), Header::new("x-api-key", key)],
            &RequestContext::default()
        )
        .is_err());
    assert!(auth
        .authorize(
            &headers,
            &RequestContext {
                expected_project: Some("foreign"),
                ..Default::default()
            }
        )
        .is_err());
    assert!(auth
        .authorize(
            &headers,
            &RequestContext {
                required_scope: Some("write"),
                ..Default::default()
            }
        )
        .is_err());
    assert!(auth
        .authorize(
            &[
                Header::new("X-API-Key", key),
                Header::new("X-External-Account-Id", "brand-b")
            ],
            &context
        )
        .is_err());
}
#[test]
fn no_implicit_production_dev_fallback() {
    assert!(Authenticator::production(None, None, None).is_err());
    let auth = Authenticator::for_development(Principal::project("proj_dev").unwrap());
    assert_eq!(
        auth.authorize(&[], &RequestContext::default())
            .unwrap()
            .project_id,
        "proj_dev"
    );
}

#[test]
fn jwt_policy_matches_current_go_date_and_optional_issuer_contract() {
    let verifier = JwtVerifier::new("fixture-anusa-access-secret", JwtPolicy::default()).unwrap();
    let missing_dates = token(
        json!({"alg":"HS256"}),
        json!({"userId":"user","tokenType":"access","iat":2000000001,"iss":"any-issuer","aud":"any-audience"}),
    );
    assert!(verifier.verify(&missing_dates, 1800000000).is_ok());
    let strict = JwtVerifier::new(
        "fixture-anusa-access-secret",
        JwtPolicy {
            issuer: Some("issuer".into()),
            audience: Some("appcall".into()),
            require_expiry: true,
        },
    )
    .unwrap();
    assert!(strict.verify(&missing_dates, 1800000000).is_err());
    let valid = token(
        json!({"alg":"HS256"}),
        json!({"userId":"user","tokenType":"access","exp":2000000000,"nbf":1800000000,"iss":"issuer","aud":["other","appcall"]}),
    );
    assert!(strict.verify(&valid, 1800000000).is_ok());
    assert_eq!(strict.verify(&valid, 2000000000), Err(AuthError::Expired));
    let wrong_aud = token(
        json!({"alg":"HS256"}),
        json!({"userId":"user","tokenType":"access","exp":2000000000,"iss":"issuer","aud":"foreign"}),
    );
    assert_eq!(
        strict.verify(&wrong_aud, 1800000000),
        Err(AuthError::Forbidden)
    );
    let wrong_secret = JwtVerifier::new("different-secret", JwtPolicy::default()).unwrap();
    assert_eq!(
        wrong_secret.verify(&valid, 1800000000),
        Err(AuthError::Unauthorized)
    );
}

#[test]
fn malformed_and_duplicate_jwt_claims_fail_without_panics() {
    let verifier = JwtVerifier::new("fixture-anusa-access-secret", JwtPolicy::default()).unwrap();
    for raw in [
        "".to_string(),
        "a.b.c.d".into(),
        "a".repeat(16385),
        "e30.e30.".into(),
        "not-a-jwt".into(),
    ] {
        assert!(verifier.verify(&raw, 1800000000).is_err());
    }
    let h = URL_SAFE_NO_PAD.encode(br#"{"alg":"HS256","alg":"HS512"}"#);
    let c = URL_SAFE_NO_PAD.encode(br#"{"userId":"u","tokenType":"access"}"#);
    let input = format!("{h}.{c}");
    let mut mac = Hmac::<Sha256>::new_from_slice(b"fixture-anusa-access-secret").unwrap();
    mac.update(input.as_bytes());
    let signed = format!(
        "{input}.{}",
        URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes())
    );
    assert!(verifier.verify(&signed, 1800000000).is_err());
    for purpose in ["mfa", "impersonation", "refresh", ""] {
        let jwt = token(
            json!({"alg":"HS256"}),
            json!({"userId":"user","tokenType":purpose,"exp":2000000000}),
        );
        assert!(verifier.verify(&jwt, 1800000000).is_err());
    }
}

#[test]
fn trusted_context_cannot_be_widened_and_dev_never_ignores_bad_credentials() {
    let mut principal = Principal::project("p").unwrap();
    principal.brand_id = Some("a".into());
    let auth = Authenticator::for_development(Principal::project("dev").unwrap());
    let context = RequestContext {
        trusted_principal: Some(&principal),
        ..Default::default()
    };
    assert_eq!(auth.authorize(&[], &context).unwrap().project_id, "p");
    assert!(auth
        .authorize(&[Header::new("X-External-Account-Id", "b")], &context)
        .is_err());
    assert!(auth
        .authorize(
            &[Header::new("X-API-Key", "invalid")],
            &RequestContext::default()
        )
        .is_err());
    for name in ["Authorization", "X-Tenant-ID", "X-External-Account-Id"] {
        assert!(auth
            .authorize(
                &[Header::new(name, "a"), Header::new(name, "a")],
                &RequestContext::default()
            )
            .is_err());
    }
    assert!(auth
        .authorize(
            &[
                Header::new("X-API-Key", "a"),
                Header::new("Authorization", "Bearer b")
            ],
            &context
        )
        .is_err());
    assert!(auth
        .authorize(&vec![Header::new("ignored", "value"); 129], &context)
        .is_err());
}
