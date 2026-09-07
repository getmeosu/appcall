use aes_gcm::{aead::Aead, Aes256Gcm, KeyInit, Nonce};
use appcall_store::{Envelope, LocalProvider};

// Captured from LocalProvider::encrypt and independently decrypted by Go's
// crypto/cipher before retiring the migration oracle; see README provenance.
#[test]
fn frozen_rust_envelope_matches_independently_verified_wire_bytes() {
    let fixture: serde_json::Value =
        serde_json::from_str(include_str!("fixtures/rust-envelope.json")).unwrap();
    let bytes = |name: &str| {
        fixture[name]
            .as_array()
            .unwrap()
            .iter()
            .map(|v| u8::try_from(v.as_u64().unwrap()).unwrap())
            .collect::<Vec<_>>()
    };
    let envelope = Envelope {
        key_id: "local".into(),
        algorithm: "AES-256-GCM".into(),
        nonce: bytes("nonce"),
        ciphertext: bytes("ciphertext"),
    };
    let key: Vec<u8> = (0..32).collect();
    let plaintext = b"synthetic-rust-credential";
    let provider = LocalProvider::new(&key).unwrap();
    assert_eq!(provider.decrypt(&envelope).unwrap().as_bytes(), plaintext);
    let cipher = Aes256Gcm::new_from_slice(&key).unwrap();
    assert_eq!(
        cipher
            .encrypt(Nonce::from_slice(&envelope.nonce), plaintext.as_slice())
            .unwrap(),
        envelope.ciphertext
    );
    let fresh = provider.encrypt(plaintext).unwrap();
    assert_eq!(fresh.algorithm, envelope.algorithm);
    assert_eq!(fresh.key_id, envelope.key_id);
    assert_eq!(fresh.nonce.len(), 12);
    assert_eq!(fresh.ciphertext.len(), plaintext.len() + 16);
    assert_eq!(provider.decrypt(&fresh).unwrap().as_bytes(), plaintext);
    let mut damaged = envelope.clone();
    damaged.ciphertext[0] ^= 1;
    assert!(provider.decrypt(&damaged).is_err());
    let mut wrong_key = key;
    wrong_key[0] ^= 1;
    assert!(LocalProvider::new(&wrong_key)
        .unwrap()
        .decrypt(&envelope)
        .is_err());
}
