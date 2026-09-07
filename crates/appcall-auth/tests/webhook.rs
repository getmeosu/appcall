use appcall_auth::{AuthError, WebhookVerifier};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use hmac::{Hmac, KeyInit, Mac};
use sha2::Sha256;

const GOLDEN: &str = "eyJwIjoicHJval9hIiwiYyI6ImNvbm5fYSIsImsiOiJhcG9sbG8ifQ.zLVza2QvURiBAvdV9gyYoLi1cGI6w4EN_YRUcmNwjK4";
fn signed(payload: &[u8]) -> String {
    let segment = URL_SAFE_NO_PAD.encode(payload);
    let mut mac = Hmac::<Sha256>::new_from_slice(b"whsec_fixture").unwrap();
    mac.update(segment.as_bytes());
    format!(
        "{segment}.{}",
        URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes())
    )
}
#[test]
fn go_format_token_authenticates_only_its_callback_scope() {
    let v = WebhookVerifier::new("whsec_fixture").unwrap();
    let claims = v.verify_scoped(GOLDEN, "apollo", "conn_a").unwrap();
    assert_eq!(claims.project_id, "proj_a");
    assert_eq!(claims.connection_id, "conn_a");
    assert_eq!(claims.connector, "apollo");
    assert!(v
        .verify_project_scoped(GOLDEN, "proj_a", "apollo", "conn_a")
        .is_ok());
    for (connector, connection) in [("other", "conn_a"), ("apollo", "conn_b"), ("", "conn_a")] {
        assert_eq!(
            v.verify_scoped(GOLDEN, connector, connection),
            Err(AuthError::Unauthorized)
        );
    }
    assert_eq!(
        v.verify_project_scoped(GOLDEN, "proj_b", "apollo", "conn_a"),
        Err(AuthError::Unauthorized)
    );
}
#[test]
fn malformed_tampered_and_unconfigured_tokens_fail_closed() {
    assert!(WebhookVerifier::new("").is_err());
    let v = WebhookVerifier::new("whsec_fixture").unwrap();
    for token in [
        String::new(),
        "missing".into(),
        format!("{GOLDEN}.extra"),
        format!("{GOLDEN}="),
        GOLDEN.replacen("eyJ", "eyK", 1),
        "a".repeat(4097),
    ] {
        assert_eq!(
            v.verify_scoped(&token, "apollo", "conn_a"),
            Err(AuthError::Unauthorized)
        );
    }
    assert_eq!(
        WebhookVerifier::new("wrong")
            .unwrap()
            .verify_scoped(GOLDEN, "apollo", "conn_a"),
        Err(AuthError::Unauthorized)
    );
}
#[test]
fn signed_invalid_or_ambiguous_claims_cannot_authorize() {
    let v = WebhookVerifier::new("whsec_fixture").unwrap();
    for payload in [
        r#"{"p":"","c":"conn_a","k":"apollo"}"#,
        r#"{"p":"proj_a","p":"proj_b","c":"conn_a","k":"apollo"}"#,
        r#"{"p":"proj_a","c":"conn_a"}"#,
        r#"{"p":"proj a","c":"conn_a","k":"apollo"}"#,
        "null",
        "not json",
    ] {
        assert_eq!(
            v.verify_scoped(&signed(payload.as_bytes()), "apollo", "conn_a"),
            Err(AuthError::Unauthorized)
        );
    }
}
