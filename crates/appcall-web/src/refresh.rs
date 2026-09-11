use crate::{Broker, Error};
use sha2::{Digest, Sha256};
#[cfg(test)]
use std::future::Future;
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
const HANDOFF_TTL: Duration = Duration::from_secs(30);

#[cfg(test)]
tokio::task_local! {
    static TEST_NOW: Instant;
}

fn current_now() -> Instant {
    #[cfg(test)]
    if let Ok(now) = TEST_NOW.try_with(|now| *now) {
        return now;
    }
    Instant::now()
}

#[cfg(test)]
pub(crate) async fn with_test_now<F, T>(now: Instant, future: F) -> T
where
    F: Future<Output = T>,
{
    TEST_NOW.scope(now, future).await
}

struct Entry {
    created: Instant,
    result: tokio::sync::Mutex<Option<Result<(String, String), Error>>>,
}
/// Short-lived handoff cache collapses simultaneous browser requests carrying
/// the same pre-rotation cookie. Successful rotations and unavailable refresh
/// outcomes are retained for the handoff window, so recovery cannot retry a
/// consumed token. Bounded and keyed only by a one-way token hash.
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
        self.rotate_at(broker, token, current_now()).await
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
                    created: now,
                    result: tokio::sync::Mutex::new(None),
                });
                entries.insert(key, entry.clone());
                entry
            }
        };
        let mut cached = entry.result.lock().await;
        if let Some(result) = cached.as_ref() {
            return result.clone();
        }
        let result = broker
            .auth(
                "/api/auth/refresh",
                serde_json::json!({"refreshToken":token}),
            )
            .await
            .and_then(|result| {
                if result.mfa_required
                    || result.access_token.is_empty()
                    || result.refresh_token.is_empty()
                {
                    return Err(Error::Unauthorized);
                }
                Ok((result.access_token, result.refresh_token))
            });
        if matches!(&result, Ok(_) | Err(Error::Unavailable)) {
            *cached = Some(result.clone());
        }
        result
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
        sync::{mpsc, oneshot, Barrier},
    };

    #[tokio::test]
    async fn concurrent_refresh_callers_share_one_successful_rotation() {
        const CALLERS: usize = 8;
        const OLD_REFRESH_TOKEN: &str = "concurrent-old-single-use";
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let calls = Arc::new(AtomicUsize::new(0));
        let server_calls = calls.clone();
        let (first_call_tx, first_call_rx) = oneshot::channel();
        let (release_tx, mut release_rx) = oneshot::channel();
        let (done_tx, mut done_rx) = oneshot::channel();
        let server = tokio::spawn(async move {
            let (mut first_stream, _) = listener.accept().await.unwrap();
            let mut bytes = [0; 8192];
            let count = first_stream.read(&mut bytes).await.unwrap();
            let request = String::from_utf8_lossy(&bytes[..count]);
            assert!(request.starts_with("POST /api/auth/refresh "));
            assert!(request.contains(OLD_REFRESH_TOKEN));
            assert_eq!(server_calls.fetch_add(1, Ordering::SeqCst), 0);
            first_call_tx.send(()).unwrap();

            let mut first_response_sent = false;
            let mut first_stream = Some(first_stream);
            loop {
                tokio::select! {
                    _ = &mut release_rx, if !first_response_sent => {
                        let body = r#"{"accessToken":"concurrent-access","refreshToken":"concurrent-refresh"}"#;
                        first_stream
                            .take()
                            .unwrap()
                            .write_all(
                                format!(
                                    "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                                    body.len()
                                )
                                .as_bytes(),
                            )
                            .await
                            .unwrap();
                        first_response_sent = true;
                    }
                    accepted = listener.accept() => {
                        let (mut stream, _) = accepted.unwrap();
                        let mut bytes = [0; 8192];
                        let count = stream.read(&mut bytes).await.unwrap();
                        let request = String::from_utf8_lossy(&bytes[..count]);
                        assert!(request.starts_with("POST /api/auth/refresh "));
                        server_calls.fetch_add(1, Ordering::SeqCst);
                        stream
                            .write_all(
                                b"HTTP/1.1 500 Internal Server Error\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}",
                            )
                            .await
                            .unwrap();
                    }
                    _ = &mut done_rx, if first_response_sent => break,
                }
            }
        });

        let broker = Broker::new(&format!("http://{address}"), "appcall").unwrap();
        let cache = Arc::new(RefreshCache::default());
        let start = Arc::new(Barrier::new(CALLERS + 1));
        let (ready_tx, mut ready_rx) = mpsc::unbounded_channel();
        let mut callers = Vec::with_capacity(CALLERS);
        for _ in 0..CALLERS {
            let broker = broker.clone();
            let cache = cache.clone();
            let ready_tx = ready_tx.clone();
            let start = start.clone();
            callers.push(tokio::spawn(async move {
                start.wait().await;
                ready_tx.send(()).unwrap();
                cache.rotate(&broker, OLD_REFRESH_TOKEN).await
            }));
        }
        drop(ready_tx);
        start.wait().await;
        for _ in 0..CALLERS {
            ready_rx.recv().await.unwrap();
        }
        first_call_rx.await.unwrap();
        release_tx.send(()).unwrap();

        let expected = Ok((
            "concurrent-access".to_owned(),
            "concurrent-refresh".to_owned(),
        ));
        for caller in callers {
            assert_eq!(caller.await.unwrap(), expected);
        }
        done_tx.send(()).unwrap();
        server.await.unwrap();
        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }

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

    #[tokio::test]
    async fn unavailable_refresh_is_not_retried_inside_the_handoff_window() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.unwrap();
            let mut bytes = [0; 8192];
            let count = stream.read(&mut bytes).await.unwrap();
            assert!(String::from_utf8_lossy(&bytes[..count]).starts_with("POST /api/auth/refresh "));
            stream
                .write_all(
                    b"HTTP/1.1 503 Service Unavailable\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}",
                )
                .await
                .unwrap();

            assert!(
                tokio::time::timeout(Duration::from_millis(100), listener.accept())
                    .await
                    .is_err(),
                "a cached refresh failure must not retry the broker"
            );
        });
        let broker = Broker::new(&format!("http://{address}"), "appcall").unwrap();
        let cache = RefreshCache::default();
        let first = Instant::now();
        assert_eq!(
            cache
                .rotate_at(&broker, "unavailable-single-use", first)
                .await,
            Err(Error::Unavailable)
        );
        assert_eq!(
            cache
                .rotate_at(
                    &broker,
                    "unavailable-single-use",
                    first + Duration::from_secs(1)
                )
                .await,
            Err(Error::Unavailable)
        );
        server.await.unwrap();
    }
}
