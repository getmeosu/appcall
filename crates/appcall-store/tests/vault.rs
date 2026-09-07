use appcall_store::{Envelope, LocalProvider};
#[test]
fn go_envelope_and_rust_roundtrip_authenticate_without_debug_leaks() {
    let key: Vec<u8> = (0..32).collect();
    let provider = LocalProvider::new(&key).unwrap();
    let fixture: serde_json::Value =
        serde_json::from_str(include_str!("fixtures/go-envelope.json")).unwrap();
    let bytes = |name: &str| {
        fixture[name]
            .as_array()
            .unwrap()
            .iter()
            .map(|v| v.as_u64().unwrap() as u8)
            .collect::<Vec<_>>()
    };
    let envelope = Envelope {
        key_id: "local".into(),
        algorithm: "AES-256-GCM".into(),
        nonce: bytes("nonce"),
        ciphertext: bytes("ciphertext"),
    };
    assert_eq!(
        provider.decrypt(&envelope).unwrap().as_bytes(),
        b"synthetic-go-credential"
    );
    let generated = provider.encrypt(b"synthetic-rust-credential").unwrap();
    assert_eq!(
        provider.decrypt(&generated).unwrap().as_bytes(),
        b"synthetic-rust-credential"
    );
    assert!(!format!("{:?}", provider.decrypt(&generated).unwrap()).contains("synthetic"));
    let mut corrupt = envelope.clone();
    corrupt.ciphertext[0] ^= 1;
    assert!(provider.decrypt(&corrupt).is_err());
    corrupt.nonce.clear();
    assert!(provider.decrypt(&corrupt).is_err());
    assert!(LocalProvider::new(&[0; 31]).is_err());
}
