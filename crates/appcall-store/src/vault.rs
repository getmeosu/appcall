use crate::Error;
use aes_gcm::{
    aead::{Aead, AeadCore, OsRng},
    Aes256Gcm, KeyInit, Nonce,
};
use zeroize::Zeroizing;
#[derive(Clone)]
pub struct Envelope {
    pub key_id: String,
    pub algorithm: String,
    pub nonce: Vec<u8>,
    pub ciphertext: Vec<u8>,
}
pub struct SecretBytes(Zeroizing<Vec<u8>>);
impl SecretBytes {
    pub fn as_bytes(&self) -> &[u8] {
        &self.0
    }
}
impl std::fmt::Debug for SecretBytes {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("SecretBytes([REDACTED])")
    }
}
pub struct LocalProvider {
    key: Zeroizing<Vec<u8>>,
}
impl LocalProvider {
    pub fn new(key: &[u8]) -> Result<Self, Error> {
        if key.len() != 32 {
            return Err(Error::InvalidKey);
        }
        Ok(Self {
            key: Zeroizing::new(key.to_vec()),
        })
    }
    pub fn encrypt(&self, plaintext: &[u8]) -> Result<Envelope, Error> {
        let cipher = Aes256Gcm::new_from_slice(&self.key).map_err(|_| Error::InvalidKey)?;
        let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
        let ciphertext = cipher
            .encrypt(&nonce, plaintext)
            .map_err(|_| Error::Crypto)?;
        Ok(Envelope {
            key_id: "local".into(),
            algorithm: "AES-256-GCM".into(),
            nonce: nonce.to_vec(),
            ciphertext,
        })
    }
    pub fn decrypt(&self, e: &Envelope) -> Result<SecretBytes, Error> {
        if e.algorithm != "AES-256-GCM" || e.nonce.len() != 12 {
            return Err(Error::Crypto);
        }
        let cipher = Aes256Gcm::new_from_slice(&self.key).map_err(|_| Error::InvalidKey)?;
        let plain = cipher
            .decrypt(Nonce::from_slice(&e.nonce), e.ciphertext.as_slice())
            .map_err(|_| Error::Crypto)?;
        Ok(SecretBytes(Zeroizing::new(plain)))
    }
}
