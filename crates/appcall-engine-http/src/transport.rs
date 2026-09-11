use crate::{is_authorized, ApiResponse, EngineClient};
use bytes::Bytes;
use http_body_util::{BodyExt, Full};
use hyper::{body::Incoming, server::conn::http1, service::service_fn, Request, Response};
use hyper_util::rt::{TokioIo, TokioTimer};
use std::{convert::Infallible, future::Future, io, sync::Arc, time::Duration};
use tokio::{net::TcpListener, sync::Semaphore, task::JoinSet};
#[derive(Clone, Copy, Debug)]
pub struct TransportLimits {
    pub max_connections: usize,
    pub requests_per_second: u32,
    pub header_timeout: Duration,
    pub read_timeout: Duration,
    pub body_timeout: Duration,
    pub write_timeout: Duration,
    pub request_timeout: Duration,
    pub connection_timeout: Duration,
}
impl Default for TransportLimits {
    fn default() -> Self {
        Self {
            max_connections: 64,
            requests_per_second: 100,
            header_timeout: Duration::from_secs(2),
            read_timeout: Duration::from_secs(2),
            body_timeout: Duration::from_secs(5),
            write_timeout: Duration::from_secs(2),
            request_timeout: Duration::from_secs(5),
            connection_timeout: Duration::from_secs(15),
        }
    }
}
impl TransportLimits {
    fn validate(&self) -> io::Result<()> {
        if self.max_connections == 0
            || self.max_connections > 256
            || self.requests_per_second == 0
            || self.requests_per_second > 100000
            || [
                self.header_timeout,
                self.read_timeout,
                self.body_timeout,
                self.write_timeout,
                self.request_timeout,
                self.connection_timeout,
            ]
            .iter()
            .any(|d| d.is_zero() || *d > Duration::from_secs(300))
        {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "invalid transport limits",
            ));
        }
        Ok(())
    }
}
/// Runs on the caller's Tokio runtime. Admission is capped before a connection
/// task is spawned. HTTP/1 keepalive is disabled, and all client errors are
/// contained to their connection. TLS may terminate at a trusted private proxy.
pub async fn serve(
    listener: TcpListener,
    client: EngineClient,
    token: String,
    limits: TransportLimits,
    shutdown: impl Future<Output = ()>,
) -> io::Result<()> {
    limits.validate()?;
    if token.len() < 32 || token.len() > 256 || !token.is_ascii() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "invalid service token",
        ));
    }
    let token = Arc::new(token);
    let rate = Arc::new(std::sync::Mutex::new(RateBuckets::new(
        std::time::Instant::now(),
    )));
    let slots = Arc::new(Semaphore::new(limits.max_connections));
    let mut connections = JoinSet::new();
    tokio::pin!(shutdown);
    loop {
        tokio::select! {
            _=&mut shutdown=>break,
            Some(_)=connections.join_next(),if !connections.is_empty()=>{},
            accepted=listener.accept()=>{
                let (stream,_)=accepted?;
                let Ok(permit)=slots.clone().try_acquire_owned() else {drop(stream);continue;};
                let client=client.clone();let token=token.clone();let rate=rate.clone();
                connections.spawn(async move {
                    let _permit=permit;
                    let io=TokioIo::new(crate::deadline_io::DeadlineIo::new(stream,limits.read_timeout,limits.write_timeout));
                    let service=service_fn(move|request|handle(request,client.clone(),token.clone(),limits,rate.clone()));
                    let mut builder=http1::Builder::new();builder.keep_alive(false).max_headers(64).max_buf_size(16384).timer(TokioTimer::new()).header_read_timeout(limits.header_timeout);
                    let _=tokio::time::timeout(limits.connection_timeout,builder.serve_connection(io,service)).await;
                });
            }
        }
    }
    connections.abort_all();
    while connections.join_next().await.is_some() {}
    Ok(())
}
fn response(status: u16, code: &str) -> ApiResponse {
    crate::response(status, serde_json::json!({"success":false,"error":code}))
}
fn wire(value: ApiResponse) -> Response<Full<Bytes>> {
    Response::builder()
        .status(value.status)
        .header("Content-Type", "application/json")
        .header("Connection", "close")
        .header("Cache-Control", "no-store")
        .body(Full::new(Bytes::from(value.body)))
        .expect("constant valid response headers")
}
async fn handle(
    request: Request<Incoming>,
    client: EngineClient,
    token: Arc<String>,
    limits: TransportLimits,
    rate: Arc<std::sync::Mutex<RateBuckets>>,
) -> Result<Response<Full<Bytes>>, Infallible> {
    let auth: Vec<_> = request
        .headers()
        .get_all(hyper::header::AUTHORIZATION)
        .iter()
        .collect();
    let authorization = if auth.len() == 1 {
        auth[0].to_str().unwrap_or("").to_owned()
    } else {
        String::new()
    };
    let authorized = is_authorized(token.as_bytes(), &authorization);
    if !rate
        .lock()
        .map(|mut buckets| {
            buckets.admit(
                authorized,
                limits.requests_per_second,
                std::time::Instant::now(),
            )
        })
        .unwrap_or(false)
    {
        return Ok(wire(response(429, "rate_limit")));
    }
    if !authorized {
        return Ok(wire(response(401, "unauthorized")));
    }
    if request.method() == hyper::Method::GET && request.uri().path() == "/ready" {
        return Ok(wire(if client.is_alive() {
            crate::response(
                200,
                serde_json::json!({"success":true,"data":{"ready":true}}),
            )
        } else {
            response(503, "owner_unavailable")
        }));
    }
    if request.uri().query().is_some() || request.uri().path().len() > 4096 {
        return Ok(wire(response(400, "invalid_path")));
    }
    if request
        .headers()
        .get(hyper::header::CONTENT_LENGTH)
        .and_then(|h| h.to_str().ok())
        .and_then(|s| s.parse::<u64>().ok())
        .is_some_and(|n| n > 65536)
    {
        return Ok(wire(response(413, "request_too_large")));
    }
    let method = request.method().as_str().to_owned();
    let path = request.uri().path().to_owned();
    let mut incoming = request.into_body();
    let read = async {
        let mut bytes = Vec::new();
        while let Some(frame) = incoming.frame().await {
            let frame = frame.map_err(|_| response(400, "invalid_body"))?;
            if let Some(data) = frame.data_ref() {
                if data.len() > 65536 - bytes.len() {
                    return Err(response(413, "request_too_large"));
                }
                bytes.extend_from_slice(data);
            } else {
                return Err(response(400, "unexpected_trailers"));
            }
        }
        Ok(bytes)
    };
    let body = match tokio::time::timeout(limits.body_timeout, read).await {
        Ok(Ok(bytes)) => bytes,
        Ok(Err(response)) => return Ok(wire(response)),
        Err(_) => return Ok(wire(response(408, "body_timeout"))),
    };
    Ok(wire(
        client
            .request(method, path, authorization, body, limits.request_timeout)
            .await,
    ))
}
struct RateWindow {
    started: std::time::Instant,
    used: u32,
}
impl RateWindow {
    fn admit(&mut self, limit: u32, now: std::time::Instant) -> bool {
        if now.duration_since(self.started) >= Duration::from_secs(1) {
            self.started = now;
            self.used = 0;
        }
        if self.used >= limit {
            return false;
        }
        self.used += 1;
        true
    }
}
struct RateBuckets {
    anonymous: RateWindow,
    authenticated: RateWindow,
}
impl RateBuckets {
    fn new(now: std::time::Instant) -> Self {
        Self {
            anonymous: RateWindow {
                started: now,
                used: 0,
            },
            authenticated: RateWindow {
                started: now,
                used: 0,
            },
        }
    }
    fn admit(&mut self, authenticated: bool, limit: u32, now: std::time::Instant) -> bool {
        let window = if authenticated {
            &mut self.authenticated
        } else {
            &mut self.anonymous
        };
        window.admit(limit, now)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn request_rate_window_is_bounded_and_recovers() {
        let now = std::time::Instant::now();
        let mut window = RateWindow {
            started: now,
            used: 0,
        };
        assert!(window.admit(1, now));
        assert!(!window.admit(1, now));
        assert!(window.admit(1, now + Duration::from_secs(2)));
    }

    #[test]
    fn rate_buckets_keep_anonymous_admission_independent_from_authenticated() {
        let now = std::time::Instant::now();
        let mut buckets = RateBuckets::new(now);

        assert!(buckets.admit(false, 1, now));
        assert!(!buckets.admit(false, 1, now));
        assert!(buckets.admit(true, 1, now));
        assert!(!buckets.admit(true, 1, now));
    }

    #[test]
    fn malformed_authorization_uses_bounded_anonymous_bucket() {
        let token = b"transport-test-token-at-least-thirty-two-bytes";
        let now = std::time::Instant::now();
        let mut buckets = RateBuckets::new(now);

        for authorization in ["", "Bearer wrong"] {
            assert!(!is_authorized(token, authorization));
            assert!(buckets.admit(is_authorized(token, authorization), 2, now));
        }
        assert!(!is_authorized(token, "Basic credentials"));
        assert!(!buckets.admit(false, 2, now));
        assert!(buckets.admit(true, 1, now));
    }
}
