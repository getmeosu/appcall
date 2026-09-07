//! Read-only visual fixture server, never a production host. All identities/data
//! are synthetic. Run with `cargo run -p appcall-web --example preview`.
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
impl DashboardData for Data {
    fn execute(
        &self,
        r: DashboardRequest,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<Value, Error>> + Send + '_>>
    {
        Box::pin(async move {
            match r.operation {
                DashboardOperation::Catalog => Ok(
                    json!({"connectors":(0..24).map(|i|json!({"key":format!("connector-{i}"),"name":if i==0{"Google Workspace — long integration name for realistic layout inspection".to_owned()}else{format!("Integration {}",i+1)},"operations":[{"name":"list"},{"name":"create"}]})).collect::<Vec<_>>()}),
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
            let mut raw = [0; 16384];
            let count = stream.read(&mut raw).await.unwrap_or(0);
            let head = String::from_utf8_lossy(&raw[..count]);
            let mut parts = head.lines().next().unwrap_or("").split_whitespace();
            let method = parts.next().unwrap_or("");
            let target = parts.next().unwrap_or("/");
            let parsed = reqwest::Url::parse(&format!("http://localhost{target}")).unwrap();
            let path = if parsed.path() == "/preview/mfa" {
                "/app/settings/account/mfa/setup"
            } else {
                parsed.path()
            };
            let fields = parsed.query_pairs().fold(
                std::collections::BTreeMap::<String, Vec<String>>::new(),
                |mut map, (k, v)| {
                    map.entry(k.into()).or_default().push(v.into());
                    map
                },
            );
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
            let response = if method == "GET" && parsed.path() == "/preview/components" {
                let revision = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos();
                Some(Response { status: 200, headers: vec![("Content-Type".into(), "text/html; charset=utf-8".into())], body: format!("<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>Signal component sheet</title><link rel=\"stylesheet\" href=\"/static/app.css?preview={revision}\"><script defer src=\"/static/dashboard.js?preview={revision}\"></script></head><body>{}</body></html>",ui::component_sheet()), binary_body: None })
            } else if method == "GET" {
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
