use appcall_oauth::{Error, ExpectedState, StateSigner, TokenSet};
#[test]
fn go_state_and_token_wire_contracts() {
    let fixture: serde_json::Value =
        serde_json::from_str(include_str!("fixtures/oauth_compatibility.json")).unwrap();
    let signer = StateSigner::new(&(0u8..32).collect::<Vec<_>>()).unwrap();
    let expected = ExpectedState {
        project_id: Some("project"),
        connector: "google-workspace",
        redirect_uri: "https://app.test/callback",
    };
    let claims = signer
        .verify(fixture["state"].as_str().unwrap(), &expected, 1_800_000_000)
        .unwrap();
    assert_eq!(claims.connection_id, "connection");
    assert_eq!(signer.sign(&claims).unwrap(), fixture["state"]);
    assert!(matches!(
        signer.verify(fixture["state"].as_str().unwrap(), &expected, 2_000_000_000),
        Err(Error::StateExpired)
    ));
    let wrong = ExpectedState {
        project_id: Some("other"),
        ..expected
    };
    assert!(matches!(
        signer.verify(fixture["state"].as_str().unwrap(), &wrong, 1_800_000_000),
        Err(Error::StateBinding)
    ));
    let tokens = TokenSet::decode(&serde_json::to_vec(&fixture["tokens"]).unwrap()).unwrap();
    assert_eq!(tokens.access_token(), "synthetic-access");
    assert_eq!(
        serde_json::from_slice::<serde_json::Value>(&tokens.encode().unwrap()).unwrap(),
        fixture["tokens"]
    );
    let zero = TokenSet::decode(&serde_json::to_vec(&fixture["nonexpiring"]).unwrap()).unwrap();
    assert!(!zero.needs_refresh(2_000_000_000));
    assert!(!format!("{tokens:?}").contains("synthetic"));
}
