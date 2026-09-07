use crate::{Broker, Error};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
struct Entry {
    created: Instant,
    tokens: tokio::sync::Mutex<Option<(String, String)>>,
}
/// Short-lived handoff cache collapses simultaneous browser requests carrying
/// the same pre-rotation cookie. Bounded and keyed only by a one-way token hash.
#[derive(Default)]
pub(crate) struct RefreshCache {
    entries: Mutex<HashMap<[u8; 32], Arc<Entry>>>,
}
impl RefreshCache {
    pub(crate) async fn rotate(
        &self,
        broker: &Broker,
        token: &str,
    ) -> Result<(String, String), Error> {
        if token.is_empty() || token.len() > 16384 {
            return Err(Error::Unauthorized);
        }
        let key: [u8; 32] = Sha256::digest(token.as_bytes()).into();
        let entry = {
            let mut entries = self.entries.lock().map_err(|_| Error::Unavailable)?;
            entries.retain(|_, e| {
                e.created.elapsed() < Duration::from_secs(30) || Arc::strong_count(e) > 1
            });
            if let Some(entry) = entries.get(&key) {
                entry.clone()
            } else {
                if entries.len() >= 1024 {
                    return Err(Error::Unavailable);
                }
                let entry = Arc::new(Entry {
                    created: Instant::now(),
                    tokens: tokio::sync::Mutex::new(None),
                });
                entries.insert(key, entry.clone());
                entry
            }
        };
        let mut cached = entry.tokens.lock().await;
        if let Some(tokens) = cached.as_ref() {
            return Ok(tokens.clone());
        }
        let result = broker
            .auth(
                "/api/auth/refresh",
                serde_json::json!({"refreshToken":token}),
            )
            .await?;
        if result.mfa_required || result.access_token.is_empty() || result.refresh_token.is_empty()
        {
            return Err(Error::Unauthorized);
        }
        let tokens = (result.access_token, result.refresh_token);
        *cached = Some(tokens.clone());
        Ok(tokens)
    }
}
