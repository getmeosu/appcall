use crate::{Broker, Error};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
const HANDOFF_TTL: Duration = Duration::from_secs(30);
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
        self.rotate_at(broker, token, Instant::now()).await
    }
    async fn rotate_at(
        &self,
        broker: &Broker,
        token: &str,
        now: Instant,
    ) -> Result<(String, String), Error> {
        if token.is_empty() || token.len() > 16384 {
            return Err(Error::Unauthorized);
        }
        let key: [u8; 32] = Sha256::digest(token.as_bytes()).into();
        let entry = {
            let mut entries = self.entries.lock().map_err(|_| Error::Unavailable)?;
            entries.retain(|_, e| {
                now.saturating_duration_since(e.created) < HANDOFF_TTL || Arc::strong_count(e) > 1
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    };
    use tokio::{
        io::{AsyncReadExt, AsyncWriteExt},
        net::TcpListener,
    };

    #[tokio::test]
    async fn post_handoff_expiry_calls_the_single_use_broker_again() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let calls = Arc::new(AtomicUsize::new(0));
        let server_calls = calls.clone();
        let server = tokio::spawn(async move {
            for (status, body) in [
                (
                    "200 OK",
                    r#"{"accessToken":"new-access","refreshToken":"new-refresh"}"#,
                ),
                ("401 Unauthorized", "{}"),
            ] {
                let (mut stream, _) = listener.accept().await.unwrap();
                let mut bytes = [0; 8192];
                let count = stream.read(&mut bytes).await.unwrap();
                assert!(
                    String::from_utf8_lossy(&bytes[..count]).starts_with("POST /api/auth/refresh ")
                );
                server_calls.fetch_add(1, Ordering::SeqCst);
                stream
                    .write_all(
                        format!(
                            "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                            body.len()
                        )
                        .as_bytes(),
                    )
                    .await
                    .unwrap();
            }
        });
        let broker = Broker::new(&format!("http://{address}"), "appcall").unwrap();
        let cache = RefreshCache::default();
        let first = Instant::now();
        assert_eq!(
            cache
                .rotate_at(&broker, "old-single-use", first)
                .await
                .unwrap(),
            ("new-access".into(), "new-refresh".into())
        );
        assert_eq!(
            cache
                .rotate_at(&broker, "old-single-use", first + Duration::from_secs(31))
                .await,
            Err(Error::Unauthorized)
        );
        server.await.unwrap();
        assert_eq!(calls.load(Ordering::SeqCst), 2);
    }
}
