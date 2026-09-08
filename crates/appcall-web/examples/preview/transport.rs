use super::*;
use std::time::Duration;

pub async fn read_with_deadline(
    stream: &mut (impl tokio::io::AsyncRead + Unpin),
    deadline: Duration,
) -> std::io::Result<Vec<u8>> {
    tokio::time::timeout(deadline, read_preview_request(stream))
        .await
        .map_err(|_| std::io::ErrorKind::TimedOut)?
}
pub async fn serve_broker(
    stream: &mut (impl tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin),
    scenario: Scenario,
) -> std::io::Result<()> {
    let raw = read_with_deadline(stream, Duration::from_secs(5)).await;
    let result = raw.as_ref().ok().and_then(|raw| {
        let (method, target, body) = request_parts(raw).ok()?;
        let parsed = preview_target(target).ok()?;
        if parsed.query().is_some() {
            return None;
        }
        if method == "POST"
            && !body.is_empty()
            && !serde_json::from_slice::<Value>(body).ok()?.is_object()
        {
            return None;
        }
        Some(broker_fixture(scenario, method, parsed.path()))
    });
    let (status, value) =
        result.unwrap_or((400, json!({"error":"Invalid synthetic preview request."})));
    let mut response = plain_response(status, value.to_string());
    response.headers[0].1 = "application/json".into();
    write_response(stream, response).await
}
pub fn plain_response(status: u16, body: String) -> Response {
    Response {
        status,
        body,
        headers: vec![
            ("Content-Type".into(), "text/html; charset=utf-8".into()),
            ("Cache-Control".into(), "no-store".into()),
        ],
        binary_body: None,
    }
}
pub async fn dispatch_preview(
    method: &str,
    target: &str,
    body: &[u8],
    data: &ScenarioData,
) -> Result<Response, Error> {
    let parsed = preview_target(target)?;
    let path = parsed.path();
    let accepted = allowed(method, path) || method == "POST" && path == "/preview/delete";
    if method == "POST" {
        data.record_post(path, accepted);
    }
    if let Some(response) = preview_response(method, path) {
        return Ok(response);
    }
    if method == "GET" && path == "/preview/stats" {
        let mut response = plain_response(200, data.stats().to_string());
        response.headers[0].1 = "application/json".into();
        return Ok(response);
    }
    if !accepted {
        return Ok(plain_response(404, "Not found".into()));
    }
    let fields = preview_fields(target, if method == "POST" { body } else { &[] })?;
    let fixture: Value =
        serde_json::from_str(include_str!("../../../appcall-auth/tests/go_golden.json"))
            .map_err(|_| Error::Configuration)?;
    let codec = SessionCodec::new("synthetic-preview", false)?;
    let jwt = appcall_auth::JwtVerifier::new(
        fixture["jwt_secret"].as_str().ok_or(Error::Configuration)?,
        Default::default(),
    )
    .map_err(|_| Error::Configuration)?;
    let broker = Broker::new("http://127.0.0.1:55590", "appcall")?;
    let browser = Browser {
        codec: &codec,
        identity: Identity {
            jwt: &jwt,
            memberships: &Members,
            broker: &broker,
        },
        public_origin: "http://127.0.0.1:55589",
    };
    let session = Session {
        access_token: fixture["jwt"].as_str().ok_or(Error::Configuration)?.into(),
        refresh_token: "synthetic".into(),
        user_id: "11111111-1111-1111-1111-111111111111".into(),
        tenant_id: "preview".into(),
        tenant_name: "Synthetic Preview Organization".into(),
        email: "long.realistic.preview.email@example.invalid".into(),
    };
    let cookies = if data.scenario.inject_session() {
        format!("appcall_session={}", codec.seal_session(&session)?)
    } else {
        String::new()
    };
    // Preserve the existing local MFA component shortcut; all ordinary routes
    // keep their production methods and render through Browser/Dashboard.
    let request = Request {
        method: if path == "/preview/mfa" {
            "POST"
        } else {
            method
        },
        path: if path == "/preview/mfa" {
            "/app/settings/account/mfa/setup"
        } else {
            path
        },
        cookies: &cookies,
        origin: Some(if data.scenario == Scenario::UntrustedOrigin {
            "http://untrusted.invalid"
        } else {
            browser.public_origin
        }),
        referer: None,
        fields,
        now: 1800000000,
    };
    Ok(Dashboard {
        browser: &browser,
        data,
    }
    .handle(&request)
    .await
    .unwrap_or_else(|| plain_response(404, "Not found".into())))
}
pub fn request_result(
    scenario: Scenario,
    method: &str,
    path: &str,
    mut response: Response,
) -> Option<Response> {
    if method == "POST"
        && path == "/app/toolkits/request"
        && response.status == 200
        && response.body.contains("data-request-state=\"success\"")
    {
        match scenario {
            Scenario::RequestDrop=>return None,
            Scenario::RequestMissingPatch=>response.body="event: datastar-patch-elements\ndata: selector #preview-absent-target\ndata: elements <div id=\"preview-absent-target\">Synthetic receipt delivery fixture</div>\n\n".into(),
            _=>{},
        }
    }
    Some(response)
}
pub async fn write_event_stream(
    stream: &mut (impl tokio::io::AsyncWrite + Unpin),
) -> std::io::Result<()> {
    stream.write_all(b"HTTP/1.1 200 Response\r\nContent-Type: text/event-stream\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n").await?;
    stream.flush().await?;
    for frame in event_frames().map_err(|_| std::io::ErrorKind::InvalidData)? {
        tokio::time::sleep(Duration::from_secs(2)).await;
        stream.write_all(frame.as_bytes()).await?;
        stream.flush().await?;
    }
    Ok(())
}

pub fn request_parts(raw: &[u8]) -> Result<(&str, &str, &[u8]), Error> {
    let raw = std::str::from_utf8(raw).map_err(|_| Error::Invalid)?;
    let (head, body) = raw.split_once("\r\n\r\n").ok_or(Error::Invalid)?;
    let line = head.lines().next().ok_or(Error::Invalid)?;
    let parts: Vec<_> = line.split(' ').collect();
    if parts.len() != 3
        || !matches!(parts[2], "HTTP/1.1" | "HTTP/1.0")
        || !matches!(
            parts[0],
            "GET" | "POST" | "DELETE" | "PUT" | "PATCH" | "HEAD" | "OPTIONS"
        )
    {
        return Err(Error::Invalid);
    }
    preview_target(parts[1])?;
    Ok((parts[0], parts[1], body.as_bytes()))
}
pub async fn write_response(
    stream: &mut (impl tokio::io::AsyncWrite + Unpin),
    response: Response,
) -> std::io::Result<()> {
    let body = response
        .binary_body
        .map_or_else(|| response.body.into_bytes(), |b| b.to_vec());
    let mut headers = format!(
        "HTTP/1.1 {} Response\r\nContent-Length: {}\r\nConnection: close\r\n",
        response.status,
        body.len()
    );
    for (key, value) in response.headers {
        headers.push_str(&format!("{key}: {value}\r\n"));
    }
    headers.push_str("\r\n");
    tokio::time::timeout(Duration::from_secs(5), async {
        stream.write_all(headers.as_bytes()).await?;
        stream.write_all(&body).await?;
        stream.flush().await
    })
    .await
    .map_err(|_| std::io::ErrorKind::TimedOut)?
}
pub async fn serve_ui(
    stream: &mut (impl tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin),
    data: &ScenarioData,
) -> std::io::Result<()> {
    let raw = read_with_deadline(stream, Duration::from_secs(5)).await;
    let parsed = raw.as_ref().ok().and_then(|raw| request_parts(raw).ok());
    let Some((method, target, body)) = parsed else {
        return write_response(
            stream,
            plain_response(400, "Invalid synthetic preview request.".into()),
        )
        .await;
    };
    let response = dispatch_preview(method, target, body, data)
        .await
        .unwrap_or_else(|_| plain_response(400, "Invalid synthetic preview request.".into()));
    let path = target.split('?').next().unwrap_or("");
    if data.scenario == Scenario::EventsStream
        && method == "GET"
        && path == "/app/triggers/stream"
        && response.status == 200
    {
        return tokio::time::timeout(Duration::from_secs(5), write_event_stream(stream))
            .await
            .map_err(|_| std::io::ErrorKind::TimedOut)?;
    }
    if let Some(response) = request_result(data.scenario, method, path, response) {
        write_response(stream, response).await?;
    }
    Ok(())
}

#[cfg(test)]
#[path = "transport_tests.rs"]
mod tests;
