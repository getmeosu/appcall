//! Local visual fixture server, never a production host. All identities/data
//! and tool executions are synthetic; no provider is called or state retained.
//! Run with `cargo run -p appcall-web --example preview`.
use appcall_web::*;
use serde_json::{json, Value};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
};
struct Members;
impl appcall_auth::MembershipVerifier for Members {
    fn verify_membership(
        &self,
        _: &appcall_auth::AccessClaims,
        t: &str,
        _: &str,
    ) -> Result<Option<appcall_auth::Membership>, appcall_auth::AuthError> {
        Ok((t == "preview").then(|| appcall_auth::Membership {
            tenant_id: t.into(),
            allowed_brands: appcall_auth::Grant::All,
            scopes: appcall_auth::Grant::All,
        }))
    }
}
struct Data;
async fn read_preview_request(
    stream: &mut (impl tokio::io::AsyncRead + Unpin),
) -> std::io::Result<Vec<u8>> {
    let mut raw = Vec::new();
    loop {
        if let Some(size) = preview_request_size(&raw)? {
            if raw.len() >= size {
                raw.truncate(size);
                std::str::from_utf8(&raw).map_err(|_| std::io::ErrorKind::InvalidData)?;
                return Ok(raw);
            }
        }
        if raw.len() >= 65536 {
            return Err(std::io::ErrorKind::InvalidData.into());
        }
        let mut chunk = [0; 4096];
        let count = stream.read(&mut chunk).await?;
        if count == 0 {
            return Err(std::io::ErrorKind::UnexpectedEof.into());
        }
        raw.extend_from_slice(&chunk[..count]);
    }
}
fn preview_request_size(raw: &[u8]) -> std::io::Result<Option<usize>> {
    let invalid = || std::io::Error::from(std::io::ErrorKind::InvalidData);
    let Some(boundary) = raw.windows(4).position(|s| s == b"\r\n\r\n") else {
        return if raw.len() > 16384 {
            Err(invalid())
        } else {
            Ok(None)
        };
    };
    if boundary > 16384 {
        return Err(invalid());
    }
    let head = std::str::from_utf8(&raw[..boundary]).map_err(|_| invalid())?;
    let mut length = None;
    for line in head.lines().skip(1) {
        let (key, value) = line.split_once(':').ok_or_else(invalid)?;
        if key.eq_ignore_ascii_case("transfer-encoding") {
            return Err(invalid());
        }
        if key.eq_ignore_ascii_case("content-length") {
            if length.is_some() {
                return Err(invalid());
            }
            length = Some(value.trim().parse::<usize>().map_err(|_| invalid())?);
        }
    }
    let total = (boundary + 4)
        .checked_add(length.unwrap_or(0))
        .ok_or_else(invalid)?;
    if total > 65536 {
        return Err(invalid());
    }
    Ok(Some(total))
}
fn preview_fields(
    target: &str,
    body: &[u8],
) -> Result<std::collections::BTreeMap<String, Vec<String>>, Error> {
    let parsed =
        reqwest::Url::parse(&format!("http://localhost{target}")).map_err(|_| Error::Invalid)?;
    let mut form = reqwest::Url::parse("http://localhost/").map_err(|_| Error::Invalid)?;
    form.set_query(Some(std::str::from_utf8(body).map_err(|_| Error::Invalid)?));
    Ok(parsed.query_pairs().chain(form.query_pairs()).fold(
        std::collections::BTreeMap::new(),
        |mut map, (k, v)| {
            map.entry(k.into()).or_insert_with(Vec::new).push(v.into());
            map
        },
    ))
}
fn connector_fixture(r: &DashboardRequest) -> Result<Value, Error> {
    let key = r.resource.as_deref().ok_or(Error::Invalid)?;
    if key
        .strip_prefix("connector-")
        .and_then(|n| n.parse::<u8>().ok())
        .is_none_or(|n| n >= 24)
    {
        return Err(Error::Invalid);
    }
    let schema = json!({"type":"object","properties":{
        "query":{"type":"string","title":"Search query","description":"Synthetic search text; no provider receives it."},
        "metadata":{"type":"object","title":"Metadata"}
    }});
    let operations = if key == "connector-3" {
        json!([{
            "name":"actors.run","title":"Inspect a synthetic actor","kind":"action","readOnly":true,
            "description":"Search synthetic actors and inspect their additional inputs. No provider is called.",
            "inputSchema":{"type":"object","required":["actorId"],"properties":{
                "actorId":{"type":"string","title":"Actor","description":"Type alpha or beta to choose a synthetic actor.",
                    "x-dynamic-options":{"source":"actors.options","detailSource":"actors.input_schema"}}
            }},"outputSchema":{"type":"object"}
        }])
    } else {
        json!([
        {"name":"messages.delete","title":"Simulate a destructive tool","kind":"action","readOnly":false,"destructive":true,
         "description":"Exercise the confirmation dialog with a synthetic result. No data is deleted.",
         "inputSchema":{"type":"object"},"outputSchema":{"type":"object"}},
        {"name":"messages.list","title":"List messages","kind":"action","readOnly":true,
         "description":"Inspect a synthetic message result. No provider is called.",
         "inputSchema":schema,"outputSchema":{"type":"object"}},
        {"name":"messages.send","title":"Send a synthetic message","kind":"action","readOnly":false,
         "description":"Preview a write-shaped tool without sending a message.",
         "inputSchema":{"type":"object","required":["subject","body"],"properties":{
           "subject":{"type":"string","title":"Subject"},
           "body":{"type":"string","title":"Message body","format":"textarea"}}},
         "outputSchema":{"type":"object"}},
        {"name":"messages.simulated_failure","title":"Simulate a service failure","kind":"action","readOnly":true,
         "description":"Return a synthetic service error to inspect recovery feedback.","inputSchema":schema},
        {"name":"messages.received","title":"Message received","kind":"webhook","readOnly":false,
         "description":"A declared synthetic webhook. This is not a delivered event."},
        {"name":"status","title":"Read synthetic status","kind":"action","readOnly":true,
         "inputSchema":{"type":"object"},"outputSchema":{"type":"object"}}
        ])
    };
    let selected = r
        .fields
        .get("action")
        .filter(|s| !s.is_empty())
        .map(String::as_str)
        .unwrap_or(if key == "connector-3" {
            "actors.run"
        } else {
            "messages.list"
        });
    let operation = operations
        .as_array()
        .unwrap()
        .iter()
        .find(|op| op["name"] == selected && op["kind"] == "action")
        .ok_or(Error::Invalid)?;
    let inactive = json!({"id":"preview_inactive","connector":key,"authType":"api_key","status":"disconnected","lastTest":null});
    let connections = match key {
        "connector-1" => json!([]),
        "connector-2" => json!([inactive]),
        _ => json!([
            {"id":"preview_active_1","connector":key,"authType":"api_key","status":"active","lastTest":"ok"},
            {"id":"preview_active_2","connector":key,"authType":"api_key","status":"active","lastTest":null},inactive
        ]),
    };
    Ok(
        json!({"key":key,"name":"Synthetic Mail — connector console preview",
            "description":"Synthetic preview. No provider is called and no credential is stored.",
            "operations":operations,"action":selected,"inputSchema":operation["inputSchema"],
            "sample":{},"connections":connections,"connectionId":r.fields.get("connectionId"),
            "setup":{"mode":"none","help":"This local fixture does not store credentials. Use the empty and inactive fixtures to inspect unavailable run states."}
        }),
    )
}

fn fixture_dynamic(r: &DashboardRequest) -> Result<Value, Error> {
    let field = |name: &str| r.fields.get(name).map(String::as_str).unwrap_or("");
    if r.resource.as_deref() != Some("connector-3")
        || !matches!(
            field("connectionId"),
            "preview_active_1" | "preview_active_2"
        )
    {
        return Err(Error::Invalid);
    }
    match r.operation {
        DashboardOperation::Options => {
            if field("source") != "actors.options"
                || field("fieldName") != "f.actorId"
                || field("detailSource") != "actors.input_schema"
                || field("q").len() > 256
            {
                return Err(Error::Invalid);
            }
            let search = field("q").to_lowercase();
            let options: Vec<_> = [
                ("preview_actor_alpha", "Synthetic Alpha actor"),
                ("preview_actor_beta", "Synthetic Beta actor"),
            ]
            .into_iter()
            .filter(|(_, label)| label.to_lowercase().contains(&search))
            .map(|(value, label)| json!({"value":value,"label":label}))
            .collect();
            Ok(json!({"options":options}))
        }
        DashboardOperation::RunInputFields => {
            if field("source") != "actors.input_schema" {
                return Err(Error::Invalid);
            }
            let schema = match field("actorId") {
                "preview_actor_alpha" => {
                    json!({"type":"object","required":["message"],"properties":{
                        "message":{"type":"string","title":"Alpha message","description":"Synthetic additional input for Alpha; no message is sent."}
                    }})
                }
                "preview_actor_beta" => json!({"type":"object","required":["count"],"properties":{
                    "count":{"type":"integer","title":"Beta count","description":"Synthetic additional input for Beta; no provider is called."}
                }}),
                _ => return Err(Error::Invalid),
            };
            Ok(json!({"actorId":field("actorId"),"inputSchema":schema,"schema":schema}))
        }
        _ => Err(Error::Invalid),
    }
}

async fn fixture_run(r: &DashboardRequest) -> Result<Value, Error> {
    let item = connector_fixture(r)?;
    let connection = r.fields.get("connectionId").ok_or(Error::Invalid)?;
    if !item["connections"]
        .as_array()
        .unwrap()
        .iter()
        .any(|c| c["id"] == *connection && c["status"] == "active")
    {
        return Err(Error::Invalid);
    }
    let input = if let Some(raw) = r.fields.get("input_raw").filter(|s| !s.is_empty()) {
        let value: Value = serde_json::from_str(raw).map_err(|_| Error::Invalid)?;
        if !value.is_object() {
            return Err(Error::Invalid);
        }
        value
    } else {
        assemble_guided_input(&item["inputSchema"], &r.form_values)?
    };
    tokio::time::sleep(std::time::Duration::from_millis(250)).await;
    if item["action"] == "messages.simulated_failure" {
        return Err(Error::Unavailable);
    }
    static REQUESTS: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let sequence = REQUESTS.fetch_add(1, std::sync::atomic::Ordering::Relaxed) + 1;
    // Only declared sample output is reflected, never callerToken or arbitrary
    // request fields. This is fixture transport evidence, not provider success.
    Ok(
        json!({"requestId":format!("preview_request_{sequence}"),"output":{
            "synthetic":true,"action":item["action"],"account":connection,"query":input.get("query"),
            "metadata":input.get("metadata"),"message":"Synthetic result; no provider was called."
        }}),
    )
}
fn preview_response(method: &str, path: &str) -> Option<Response> {
    // This synthetic fixture only acknowledges the dialog; it never deletes data.
    if method == "POST" && path == "/preview/delete" {
        return Some(Response {
            status: 200,
            headers: vec![("Content-Type".into(), "text/html; charset=utf-8".into())],
            body: concat!(
                "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">",
                "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
                "<title>Preview confirmation</title>",
                "<link rel=\"stylesheet\" href=\"/static/app.css\"></head><body><main>",
                "<h1>Preview confirmation received</h1>",
                "<p>This is a synthetic component preview. No data was deleted.</p>",
                "<a href=\"/preview/components\">Back to component sheet</a>",
                "</main></body></html>"
            )
            .into(),
            binary_body: None,
        });
    }
    if method != "GET" || path != "/preview/components" {
        return None;
    }
    let revision = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    Some(Response { status: 200, headers: vec![("Content-Type".into(), "text/html; charset=utf-8".into())], body: format!("<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>Signal component sheet</title><link rel=\"stylesheet\" href=\"/static/app.css?preview={revision}\"><script defer src=\"/static/dashboard.js?preview={revision}\"></script></head><body>{}</body></html>",ui::component_sheet()), binary_body: None })
}

impl DashboardData for Data {
    fn execute(
        &self,
        r: DashboardRequest,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<Value, Error>> + Send + '_>>
    {
        Box::pin(async move {
            match r.operation {
                DashboardOperation::Toolkit | DashboardOperation::TestForm => connector_fixture(&r),
                DashboardOperation::Test => fixture_run(&r).await,
                DashboardOperation::Options | DashboardOperation::RunInputFields => {
                    fixture_dynamic(&r)
                }
                DashboardOperation::Catalog => Ok(
                    json!({"connectors":(0..24).map(|i|json!({"key":format!("connector-{i}"),"name":if i==0{"Google Workspace — long integration name for realistic layout inspection".to_owned()}else{format!("Integration {}",i+1)},"operations":[{"name":"list","kind":"action"},{"name":"create","kind":"action"}]})).collect::<Vec<_>>()}),
                ),
                DashboardOperation::Branding => {
                    Ok(json!({"appName":"Sample App","tagColor":"#67e8f9"}))
                }
                DashboardOperation::Overview => {
                    Ok(json!({"toolkitCount":24,"connectionCount":3,"toolCalls":1205}))
                }
                _ => Err(Error::Invalid),
            }
        })
    }
}
#[tokio::main(flavor = "current_thread")]
async fn main() {
    tokio::spawn(async {
        let broker = TcpListener::bind("127.0.0.1:55590").await.unwrap();
        loop {
            let (mut socket, _) = broker.accept().await.unwrap();
            tokio::spawn(async move {
                let mut bytes = [0; 8192];
                let n = socket.read(&mut bytes).await.unwrap_or(0);
                let raw = String::from_utf8_lossy(&bytes[..n]);
                let path = raw
                    .lines()
                    .next()
                    .unwrap_or("")
                    .split_whitespace()
                    .nth(1)
                    .unwrap_or("");
                let value = match path {
                    "/api/auth/me" => {
                        json!({"user":{"email":"preview@example.invalid","displayName":"Preview User","totpEnabled":false}})
                    }
                    "/api/auth/mfa/setup" => {
                        json!({"url":"otpauth://totp/Appcall:preview?secret=JBSWY3DPEHPK3PXP&issuer=Appcall","secret":"JBSWY3DPEHPK3PXP"})
                    }
                    "/api/billing/status" => {
                        json!({"billingStatus":"active","plan":{"name":"Pro"},"subscriptionCredits":900,"purchasedCredits":120,"currentPeriodEnd":"2026-10-01T00:00:00Z"})
                    }
                    "/api/plans" => {
                        json!({"plans":[{"id":"starter","name":"Starter","description":"For your first integrations","price":2900,"currency":"USD","billingInterval":"month"},{"id":"pro","name":"Pro","description":"For growing integration traffic","price":29900,"currency":"USD","billingInterval":"annual"}]})
                    }
                    "/api/tenant/members" => {
                        json!({"members":[{"userId":"owner","displayName":"Preview Owner","email":"owner@example.invalid","role":"owner"},{"userId":"member","displayName":"Preview Member","email":"member@example.invalid","role":"user"}]})
                    }
                    "/api/auth/sessions" => {
                        json!({"sessions":[{"id":"current","userAgent":"Preview Browser","ipAddress":"127.0.0.1","current":true,"createdAt":"2026-09-07T10:00:00Z","expiresAt":"2026-10-07T10:00:00Z"}]})
                    }
                    _ => json!({}),
                };
                let body = value.to_string();
                let response=format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",body.len());
                let _ = socket.write_all(response.as_bytes()).await;
            });
        }
    });
    let listener = TcpListener::bind("127.0.0.1:55589").await.unwrap();
    println!("Read-only synthetic dashboard preview: http://127.0.0.1:55589/app/toolkits");
    loop {
        let (mut stream, _) = listener.accept().await.unwrap();
        tokio::spawn(async move {
            let Ok(Ok(raw)) = tokio::time::timeout(
                std::time::Duration::from_secs(5),
                read_preview_request(&mut stream),
            )
            .await
            else {
                return;
            };
            let Ok(head) = std::str::from_utf8(&raw) else {
                return;
            };
            let mut parts = head.lines().next().unwrap_or("").split_whitespace();
            let method = parts.next().unwrap_or("");
            let target = parts.next().unwrap_or("/");
            let parsed = reqwest::Url::parse(&format!("http://localhost{target}")).unwrap();
            let path = if parsed.path() == "/preview/mfa" {
                "/app/settings/account/mfa/setup"
            } else {
                parsed.path()
            };
            let body = head
                .split_once("\r\n\r\n")
                .map(|(_, body)| body.as_bytes())
                .unwrap_or(&[]);
            let fields = preview_fields(target, if method == "POST" { body } else { &[] }).unwrap();
            let f: Value =
                serde_json::from_str(include_str!("../../appcall-auth/tests/go_golden.json"))
                    .unwrap();
            let codec = SessionCodec::new("synthetic-preview", false).unwrap();
            let jwt = appcall_auth::JwtVerifier::new(
                f["jwt_secret"].as_str().unwrap(),
                Default::default(),
            )
            .unwrap();
            let broker = Broker::new("http://127.0.0.1:55590", "appcall").unwrap();
            let browser = Browser {
                codec: &codec,
                identity: Identity {
                    jwt: &jwt,
                    memberships: &Members,
                    broker: &broker,
                },
                public_origin: "http://127.0.0.1:55589",
            };
            let dashboard = Dashboard {
                browser: &browser,
                data: &Data,
            };
            let session = Session {
                access_token: f["jwt"].as_str().unwrap().into(),
                refresh_token: "synthetic".into(),
                user_id: "11111111-1111-1111-1111-111111111111".into(),
                tenant_id: "preview".into(),
                tenant_name: "Synthetic Preview Organization".into(),
                email: "long.realistic.preview.email@example.invalid".into(),
            };
            let cookies = format!("appcall_session={}", codec.seal_session(&session).unwrap());
            let request = Request {
                method: if parsed.path() == "/preview/mfa" {
                    "POST"
                } else {
                    method
                },
                path,
                cookies: &cookies,
                origin: Some("http://127.0.0.1:55589"),
                referer: None,
                fields,
                now: 1800000000,
            };
            let response = if let Some(response) = preview_response(method, parsed.path()) {
                Some(response)
            } else if method == "GET"
                || (method == "POST"
                    && path.starts_with("/app/toolkits/")
                    && path.ends_with("/test"))
            {
                dashboard.handle(&request).await
            } else {
                None
            };
            let (status, headers, body) = response
                .map(|r| {
                    (
                        r.status,
                        r.headers,
                        r.binary_body
                            .map_or_else(|| r.body.into_bytes(), |b| b.to_vec()),
                    )
                })
                .unwrap_or((404, vec![], b"Not found".to_vec()));
            let mut output = format!(
                "HTTP/1.1 {status} Response\r\nContent-Length: {}\r\nConnection: close\r\n",
                body.len()
            );
            for (key, value) in headers {
                output.push_str(&format!("{key}: {value}\r\n"));
            }
            output.push_str("\r\n");
            let _ = stream.write_all(output.as_bytes()).await;
            let _ = stream.write_all(&body).await;
        });
    }
}

#[cfg(test)]
#[path = "preview/tests.rs"]
mod tests;
