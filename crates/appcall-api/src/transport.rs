//! Bounded HTTP/1 adapter driven by the host Tokio LocalSet.
use crate::{Api, ApiError, Backend, Request};
use bytes::Bytes;
use http_body_util::{BodyExt, Full, Limited};
use hyper::{body::Incoming, server::conn::http1, service::service_fn};
use hyper_util::rt::{TokioIo, TokioTimer};
use std::{
    cell::Cell,
    convert::Infallible,
    future::Future,
    rc::Rc,
    time::{Duration, Instant},
};

/// Run inside a host LocalSet. At most 64 connections and bounded per-peer
/// token buckets. Ordinary connections close after one request or the supported
/// operation budget plus a small connection grace; live event streams remain
/// open until disconnection or shutdown. Shutdown uses the same bounded grace.
pub async fn serve<B: Backend + 'static>(
    listener: tokio::net::TcpListener,
    api: Rc<Api<B>>,
    shutdown: impl Future<Output = ()>,
) -> std::io::Result<()> {
    serve_with_rate(
        listener,
        api,
        shutdown,
        crate::rate_limit::RateConfig::default(),
    )
    .await
}
pub async fn serve_with_rate<B: Backend + 'static>(
    listener: tokio::net::TcpListener,
    api: Rc<Api<B>>,
    shutdown: impl Future<Output = ()>,
    rate_config: crate::rate_limit::RateConfig,
) -> std::io::Result<()> {
    let mut tasks = tokio::task::JoinSet::new();
    let rate = Rc::new(crate::rate_limit::PeerLimiter::new(rate_config));
    tokio::pin!(shutdown);
    loop {
        tokio::select! {
            _=&mut shutdown=>break,
            _=tasks.join_next(),if !tasks.is_empty()=>{},
            accepted=listener.accept()=>{
                let (socket,peer)=accepted?;
                if tasks.len()>=64 {drop(socket);continue;}
                let api=api.clone();let rate=rate.clone();
                tasks.spawn_local(async move {
                    let streaming=Rc::new(Cell::new(false));
                    let active_stream=streaming.clone();
                    let service=service_fn(move|request|handle(request,api.clone(),rate.clone(),peer.ip(),streaming.clone()));
                    let mut builder=http1::Builder::new();
                    builder.keep_alive(false).max_headers(64).max_buf_size(16384).timer(TokioTimer::new()).header_read_timeout(Duration::from_secs(5));
                    let connection=builder.serve_connection(TokioIo::new(socket),service);
                    tokio::pin!(connection);
                    if tokio::time::timeout(appcall_connectors::budget::connection_timeout(),&mut connection).await.is_err() && active_stream.get() {
                        let _=connection.await;
                    }
                });
            }
        }
    }
    if tokio::time::timeout(appcall_connectors::budget::connection_timeout(), async {
        while tasks.join_next().await.is_some() {}
    })
    .await
    .is_err()
    {
        tasks.abort_all();
    }
    Ok(())
}
type WireResponse = hyper::Response<crate::streaming::WireBody>;
async fn handle<B: Backend>(
    request: hyper::Request<Incoming>,
    api: Rc<Api<B>>,
    rate: Rc<crate::rate_limit::PeerLimiter>,
    peer: std::net::IpAddr,
    streaming: Rc<Cell<bool>>,
) -> std::result::Result<WireResponse, Infallible> {
    if !rate.allow(peer, Instant::now()) {
        return Ok(failure("RATE_LIMITED"));
    }
    let api = match api.backend.pin_request() {
        Ok(Some(backend)) => Rc::new(Api {
            registry: api.registry.clone(),
            backend,
        }),
        Ok(None) => api,
        Err(error) => return Ok(wire(crate::error_response(error))),
    };
    let (parts, body) = request.into_parts();
    let headers = parts
        .headers
        .iter()
        .map(|(k, v)| v.to_str().map(|v| (k.as_str().to_owned(), v.to_owned())))
        .collect::<std::result::Result<Vec<_>, _>>();
    let Ok(headers) = headers else {
        return Ok(failure("INVALID_REQUEST"));
    };
    if let Err(e) = crate::validate_headers(&headers) {
        return Ok(wire(crate::error_response(e)));
    }
    if let Err(error) = crate::validate_request_uri(&parts.uri.to_string()) {
        return Ok(wire(crate::error_response(error)));
    }
    if !(parts.method == hyper::Method::GET && matches!(parts.uri.path(), "/healthz" | "/readyz"))
        && api
            .backend
            .requires_api_auth(parts.method.as_str(), parts.uri.path())
    {
        match tokio::time::timeout(Duration::from_secs(2), api.backend.authorize(&headers)).await {
            Ok(Ok(_)) => {}
            Ok(Err(e)) => return Ok(wire(crate::error_response(e))),
            Err(_) => return Ok(failure("SERVICE_BUSY")),
        }
    }
    let body = match tokio::time::timeout(
        Duration::from_secs(5),
        Limited::new(body, 2 * 1024 * 1024).collect(),
    )
    .await
    {
        Ok(Ok(body)) => body.to_bytes().to_vec(),
        Ok(Err(_)) => return Ok(failure("REQUEST_TOO_LARGE")),
        Err(_) => return Ok(failure("REQUEST_TIMEOUT")),
    };
    let request = Request {
        method: parts.method.to_string(),
        uri: parts.uri.to_string(),
        headers,
        body,
    };
    match tokio::time::timeout(Duration::from_secs(5), api.backend.event_stream(&request)).await {
        Ok(Ok(Some(stream))) => {
            let mut response = crate::streaming::response(stream.receiver);
            for (name, value) in stream.headers {
                let (Ok(name), Ok(value)) = (
                    hyper::header::HeaderName::from_bytes(name.as_bytes()),
                    hyper::header::HeaderValue::from_str(&value),
                ) else {
                    return Ok(failure("INVALID_RESPONSE"));
                };
                response.headers_mut().append(name, value);
            }
            streaming.set(true);
            return Ok(response);
        }
        Ok(Ok(None)) => {}
        Ok(Err(error)) => return Ok(wire(crate::error_response(error))),
        Err(_) => return Ok(failure("REQUEST_TIMEOUT")),
    }
    let raw = tokio::time::timeout(
        appcall_connectors::budget::max_operation_timeout(),
        api.backend.raw_route(&request),
    )
    .await;
    match raw {
        Ok(Ok(Some(response))) => return Ok(wire_raw(response)),
        Ok(Ok(None)) => {}
        Ok(Err(e)) => return Ok(wire(crate::error_response(e))),
        Err(_) => return Ok(failure("REQUEST_TIMEOUT")),
    }
    let response = match tokio::time::timeout(
        appcall_connectors::budget::max_operation_timeout(),
        api.handle(request),
    )
    .await
    {
        Ok(r) => r,
        Err(_) => crate::error_response(ApiError::new("REQUEST_TIMEOUT")),
    };
    Ok(wire(response))
}
fn failure(code: &'static str) -> WireResponse {
    wire(crate::error_response(ApiError::new(code)))
}
fn wire_raw(response: crate::RawResponse) -> WireResponse {
    let Ok(status) = hyper::StatusCode::from_u16(response.status) else {
        return failure("INVALID_RESPONSE");
    };
    let mut wire = hyper::Response::new(crate::streaming::WireBody::Full(Full::new(Bytes::from(
        response.body,
    ))));
    *wire.status_mut() = status;
    for (name, value) in response.headers {
        let (Ok(name), Ok(value)) = (
            hyper::header::HeaderName::from_bytes(name.as_bytes()),
            hyper::header::HeaderValue::from_str(&value),
        ) else {
            return failure("INVALID_RESPONSE");
        };
        wire.headers_mut().append(name, value);
    }
    wire.headers_mut().insert(
        "cache-control",
        hyper::header::HeaderValue::from_static("no-store"),
    );
    wire
}
fn wire(response: crate::Response) -> WireResponse {
    let status = response.status;
    let headers = response.headers;
    let bytes = if response.status == 204 {
        Vec::new()
    } else {
        serde_json::to_vec(&response.body).unwrap_or_default()
    };
    let mut response = hyper::Response::new(crate::streaming::WireBody::Full(Full::new(
        Bytes::from(bytes),
    )));
    // Status originates exclusively from the static application error map.
    *response.status_mut() =
        hyper::StatusCode::from_u16(status).unwrap_or(hyper::StatusCode::INTERNAL_SERVER_ERROR);
    for (name, value) in headers {
        let (Ok(name), Ok(value)) = (
            hyper::header::HeaderName::from_bytes(name.as_bytes()),
            hyper::header::HeaderValue::from_str(&value),
        ) else {
            return failure("INVALID_RESPONSE");
        };
        response.headers_mut().insert(name, value);
    }
    response.headers_mut().insert(
        "content-type",
        hyper::header::HeaderValue::from_static("application/json"),
    );
    response.headers_mut().insert(
        "cache-control",
        hyper::header::HeaderValue::from_static("no-store"),
    );
    response
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn host_transport_budget_matches_runner_contract() {
        assert_eq!(
            appcall_connectors::budget::max_operation_timeout(),
            Duration::from_secs(300)
        );
        assert_eq!(
            appcall_connectors::budget::connection_timeout(),
            Duration::from_secs(305)
        );
    }
    #[test]
    fn browser_security_headers_cannot_be_ambiguous() {
        for header in [
            "Cookie",
            "Origin",
            "Referer",
            "X-Tenant-ID",
            "Last-Event-ID",
        ] {
            assert!(
                crate::validate_headers(&[
                    (header.into(), "one".into()),
                    (header.to_lowercase(), "two".into())
                ])
                .is_err(),
                "{header}"
            );
        }
    }
    #[test]
    fn browser_wire_preserves_html_and_multiple_cookie_headers() {
        let response = wire_raw(crate::RawResponse {
            status: 302,
            body: b"<main>Signed in</main>".to_vec(),
            headers: vec![
                ("content-type".into(), "text/html; charset=utf-8".into()),
                ("set-cookie".into(), "session=one; HttpOnly".into()),
                ("set-cookie".into(), "transaction=; Max-Age=0".into()),
                ("location".into(), "/app".into()),
            ],
        });
        assert_eq!(response.status(), 302);
        assert_eq!(response.headers().get_all("set-cookie").iter().count(), 2);
        assert_eq!(
            response.headers()["content-type"],
            "text/html; charset=utf-8"
        );
        assert_eq!(response.headers()["location"], "/app");
    }
    #[test]
    fn retry_hint_reaches_wire_and_invalid_headers_fail_closed() {
        let mut action = appcall_actions::ActionError::new("IDEMPOTENCY_IN_PROGRESS");
        action.request_id = "req_fixture".into();
        let response = wire(crate::error_response(action.into()));
        assert_eq!(response.status(), hyper::StatusCode::CONFLICT);
        assert_eq!(response.headers()["retry-after"], "2");
        assert_eq!(response.headers()["cache-control"], "no-store");
        let response = wire(crate::Response {
            status: 200,
            body: serde_json::json!({"private":"must not escape"}),
            headers: vec![("x-test".into(), "value\r\ninjected: yes".into())],
        });
        assert_eq!(response.status(), hyper::StatusCode::INTERNAL_SERVER_ERROR);
        assert!(response.headers().get("x-test").is_none());
    }
}
