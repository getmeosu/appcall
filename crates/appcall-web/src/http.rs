use crate::*;
use serde_json::{json, Value};
use std::collections::BTreeMap;
#[cfg(test)]
#[path = "auth_render_tests.rs"]
mod auth_render_tests;
pub struct Request<'a> {
    pub method: &'a str,
    pub path: &'a str,
    pub cookies: &'a str,
    pub origin: Option<&'a str>,
    pub referer: Option<&'a str>,
    /// Preserve duplicate values for callback validation.
    pub fields: BTreeMap<String, Vec<String>>,
    pub now: i64,
}
impl Request<'_> {
    pub(crate) fn field(&self, key: &str) -> Result<&str, Error> {
        match self.fields.get(key) {
            None => Ok(""),
            Some(v) if v.len() == 1 && v[0].len() <= 16384 => Ok(&v[0]),
            _ => Err(Error::Invalid),
        }
    }
}
/// Framework-independent response whose body is encoded by the hosting adapter.
pub struct Response {
    pub status: u16,
    pub headers: Vec<(String, String)>,
    pub body: String,
    /// Takes precedence over `body` when present. Hosts must send these bytes
    /// unchanged; otherwise they encode `body` as UTF-8.
    pub binary_body: Option<&'static [u8]>,
}
impl Response {
    pub(crate) fn new(status: u16, body: String) -> Self {
        Self {
            status,
            body,
            binary_body: None,
            headers: vec![
                ("Cache-Control".into(), "no-store".into()),
                ("Referrer-Policy".into(), "no-referrer".into()),
                ("Content-Type".into(), "text/html; charset=utf-8".into()),
            ],
        }
    }
    pub(crate) fn redirect(target: &str) -> Self {
        let mut r = Self::new(302, String::new());
        r.headers.push(("Location".into(), target.into()));
        r
    }
    pub(crate) fn cookie(mut self, c: String) -> Self {
        self.headers.push(("Set-Cookie".into(), c));
        self
    }
}
pub struct Browser<'a> {
    pub codec: &'a SessionCodec,
    pub identity: Identity<'a>,
    pub public_origin: &'a str,
}
impl Browser<'_> {
    /// Returns None only for routes outside this identity surface. Host supplies
    /// parsed bounded form/query fields and must preserve duplicates.
    pub async fn handle(&self, r: &Request<'_>) -> Option<Response> {
        if crate::admin::route(r.path) {
            return Some(self.administration(r).await);
        }
        if !identity_route(r.path) {
            return None;
        }
        let result = self.dispatch(r).await;
        Some(match result {
            Ok(v) => v,
            Err(e) => Response::new(
                match e {
                    Error::Invalid => 400,
                    Error::Forbidden => 403,
                    Error::Unauthorized => 401,
                    _ => 503,
                },
                auth_notice("Request unavailable", &e.to_string(), true),
            ),
        })
    }
    async fn dispatch(&self, r: &Request<'_>) -> Result<Response, Error> {
        if r.fields.len() > 64 {
            return Err(Error::Invalid);
        }
        if r.method == "POST" {
            verify_csrf(self.public_origin, r.origin, r.referer)?
        }
        if r.path == "/auth/callback" {
            return Ok(self.callback(r).await);
        }
        if r.method == "GET" && r.path.starts_with("/app/oauth/") {
            let tx = OAuthTransaction::new(r.now, r.field("next")?)?;
            return Ok(Response::redirect(
                &self
                    .identity
                    .broker
                    .oauth_url(r.path.trim_start_matches("/app/oauth/"), &tx)?,
            )
            .cookie(self.codec.transaction_cookie(&tx)?));
        }
        if r.method == "GET" && r.path == "/app/logout" {
            if let Ok(Some(raw)) = cookie(r.cookies, "appcall_session") {
                if let Ok(s) = self.codec.open_session(raw) {
                    let _ = self.identity.logout(&s).await;
                }
            }
            return Ok(Response::redirect("/app/login").cookie(self.codec.clear_session()));
        }
        if r.method == "GET" && r.path == "/auth/magic-link" {
            let result = self
                .identity
                .broker
                .auth(
                    "/api/auth/magic-link/verify",
                    json!({"token":r.field("token")?}),
                )
                .await?;
            return self.complete(result, r);
        }
        if r.method == "GET" && r.path == "/verify-email" {
            self.identity
                .broker
                .call(
                    reqwest::Method::POST,
                    "/api/auth/verify-email",
                    None,
                    Some(json!({"token":r.field("token")?})),
                )
                .await?;
            return Ok(Response::new(
                200,
                auth_notice(
                    "Email verified",
                    "Email verified. You can now sign in.",
                    false,
                ),
            ));
        }
        if r.method == "GET" && r.path == "/auth/login" {
            return Ok(Response::redirect("/app/login?error=oauth_failed"));
        }
        if r.method == "GET" && r.path == "/signup" {
            let mut target = reqwest::Url::parse("https://local.invalid/app/signup")
                .map_err(|_| Error::Configuration)?;
            let invitation = r.field("invitation")?;
            if !invitation.is_empty() {
                target
                    .query_pairs_mut()
                    .append_pair("invitation", invitation);
            }
            return Ok(Response::redirect(&format!(
                "{}{}",
                target.path(),
                target.query().map(|q| format!("?{q}")).unwrap_or_default()
            )));
        }
        if r.method == "GET" {
            let mut body = form(
                r.path,
                r.field("next")?,
                r.field("token")?,
                r.field("invitation")?,
            );
            if matches!(r.path, "/app/login/password" | "/app/signup") {
                if let Ok(providers) = self
                    .identity
                    .broker
                    .call(reqwest::Method::GET, "/api/auth/providers", None, None)
                    .await
                {
                    let mut links = String::new();
                    for (key, label, path) in [
                        ("google", "Continue with Google", "/app/oauth/google"),
                        ("github", "Continue with GitHub", "/app/oauth/github"),
                        (
                            "microsoft",
                            "Continue with Microsoft",
                            "/app/oauth/microsoft",
                        ),
                        ("magicLink", "Email me a sign-in link", "/app/magic-link"),
                        ("otp", "Email me a code", "/app/otp"),
                    ] {
                        if providers.get(key).and_then(Value::as_bool) != Some(true) {
                            continue;
                        }
                        let mut target =
                            reqwest::Url::parse(&format!("https://local.invalid{path}"))
                                .map_err(|_| Error::Configuration)?;
                        target
                            .query_pairs_mut()
                            .append_pair("next", safe_next(r.field("next")?));
                        let href = format!("{}?{}", target.path(), target.query().unwrap_or(""));
                        links.push_str(&auth_link(label, &href));
                    }
                    body = body.replacen(
                        "</form>",
                        &format!("</form><div class=\"mt-4 flex flex-col gap-3\">{links}</div>"),
                        1,
                    );
                }
            }
            return Ok(Response::new(200, body));
        }
        if r.method != "POST" {
            return Ok(Response::new(
                405,
                auth_notice("Method not allowed", "Method not allowed", true),
            ));
        }
        let (endpoint, keys, auth): (&str, &[&str], bool) = match r.path {
            "/app/login" => ("/api/auth/login", &["email", "password"], true),
            "/app/login/mfa" => ("/api/auth/mfa/challenge", &["mfaToken", "code"], true),
            "/app/signup" => (
                "/api/auth/register",
                &["email", "password", "displayName", "invitationToken"],
                true,
            ),
            "/app/otp/verify" => ("/api/auth/otp/verify", &["email", "code"], true),
            "/app/otp" => ("/api/auth/otp/request", &["email"], false),
            "/app/forgot-password" => ("/api/auth/forgot-password", &["email"], false),
            "/reset-password" => ("/api/auth/reset-password", &["token", "newPassword"], false),
            "/resend-verification" => ("/api/auth/resend-verification", &["email"], false),
            "/app/magic-link" => ("/api/auth/magic-link", &["email"], false),
            _ => {
                return Ok(Response::new(
                    405,
                    auth_notice("Method not allowed", "Method not allowed", true),
                ))
            }
        };
        let mut payload = serde_json::Map::new();
        for key in keys {
            payload.insert(
                (*key).into(),
                Value::String(
                    r.field(if *key == "invitationToken" {
                        "invitation"
                    } else {
                        key
                    })?
                    .into(),
                ),
            );
        }
        if r.path == "/app/otp" {
            payload.insert("appSlug".into(), json!(self.identity.broker.product_slug));
        }
        if auth {
            let result = self
                .identity
                .broker
                .auth(endpoint, Value::Object(payload))
                .await;
            return match result {
                Ok(result) => self.complete(result, r),
                Err(Error::Invalid | Error::Unauthorized) => {
                    Ok(Response::new(200, auth_failure(r)?))
                }
                Err(error) => Err(error),
            };
        }
        let result = self
            .identity
            .broker
            .call(
                reqwest::Method::POST,
                endpoint,
                None,
                Some(Value::Object(payload)),
            )
            .await;
        match result {
            Err(error @ (Error::Invalid | Error::Unauthorized))
                if matches!(
                    r.path,
                    "/app/otp" | "/app/magic-link" | "/app/forgot-password"
                ) =>
            {
                let status = if matches!(error, Error::Unauthorized) {
                    401
                } else {
                    400
                };
                return Ok(Response::new(status, auth_failure(r)?));
            }
            Err(error) => return Err(error),
            Ok(_) => {}
        }
        if r.path == "/app/otp" {
            return Ok(Response::new(
                200,
                challenge_form(
                    "/app/otp/verify",
                    "Check your email",
                    "email",
                    r.field("email")?,
                    r.field("next")?,
                ),
            ));
        }
        Ok(Response::new(
            200,
            auth_notice(
                "Request received",
                "Request received. Check your email for the next step.",
                false,
            ),
        ))
    }
    fn complete(&self, result: AuthResult, r: &Request<'_>) -> Result<Response, Error> {
        if result.mfa_required {
            if result.mfa_token.is_empty() {
                return Err(Error::Unauthorized);
            }
            return Ok(Response::new(
                200,
                challenge_form(
                    "/app/login/mfa",
                    "Verify your identity",
                    "mfaToken",
                    &result.mfa_token,
                    r.field("next")?,
                ),
            ));
        }
        let s = self.identity.establish(result, r.now)?;
        Ok(Response::redirect(safe_next(r.field("next")?)).cookie(self.codec.session_cookie(&s)?))
    }
    async fn callback(&self, r: &Request<'_>) -> Response {
        let result = async {
            if r.method != "GET" {
                return Err(Error::Unauthorized);
            }
            let raw = cookie(r.cookies, "appcall_oauth_login")?.ok_or(Error::Unauthorized)?;
            let tx = self.codec.open_transaction(raw, r.now)?;
            if !crate::session::binding_eq(r.field("client_state")?, &tx.state) {
                return Err(Error::Unauthorized);
            }
            let mut result = self.identity.broker.exchange(r.field("code")?, &tx).await?;
            self.identity
                .jwt
                .verify(&result.access_token, r.now)
                .map_err(|_| Error::Unauthorized)?;
            let temporary = Session {
                access_token: result.access_token.clone(),
                refresh_token: String::new(),
                user_id: String::new(),
                email: String::new(),
                tenant_id: String::new(),
                tenant_name: String::new(),
            };
            let me = self
                .identity
                .broker
                .call(reqwest::Method::GET, "/api/auth/me", Some(&temporary), None)
                .await?;
            result.memberships =
                serde_json::from_value(me.get("memberships").cloned().ok_or(Error::Unauthorized)?)
                    .map_err(|_| Error::Unauthorized)?;
            let session = self.identity.establish(result, r.now)?;
            Ok::<_, Error>(
                Response::redirect(safe_next(&tx.next))
                    .cookie(self.codec.session_cookie(&session)?),
            )
        }
        .await;
        result
            .unwrap_or_else(|_| {
                Response::new(
                    400,
                    auth_notice(
                        "Sign-in unavailable",
                        "Provider sign-in could not be completed. Please start again.",
                        true,
                    ),
                )
            })
            .cookie(self.codec.clear_transaction())
    }
}
fn identity_route(p: &str) -> bool {
    matches!(
        p,
        "/app/login"
            | "/app/login/password"
            | "/app/login/mfa"
            | "/app/logout"
            | "/app/otp"
            | "/app/otp/verify"
            | "/app/signup"
            | "/signup"
            | "/app/forgot-password"
            | "/reset-password"
            | "/app/magic-link"
            | "/auth/magic-link"
            | "/auth/callback"
            | "/auth/login"
            | "/verify-email"
            | "/resend-verification"
    ) || p.starts_with("/app/oauth/")
}
type AuthFormDefinition<'a> = (
    &'a str,
    &'a str,
    &'a str,
    &'a [(&'a str, &'a str, &'a str, &'a str)],
);
fn form(path: &str, next: &str, token: &str, invitation: &str) -> String {
    let (action, title, subtitle, fields): AuthFormDefinition<'_> = match path {
        "/app/signup" => (
            "/app/signup",
            "Create your account",
            "Start building with appcall.",
            &[
                ("displayName", "Name", "text", ""),
                ("email", "Email", "email", ""),
                ("password", "Password", "password", ""),
                ("invitation", "", "hidden", invitation),
            ],
        ),
        "/app/login" | "/app/otp" => (
            "/app/otp",
            "Sign in",
            "We'll email you a 6-digit code.",
            &[("email", "Email", "email", "")],
        ),
        "/app/forgot-password" => (
            "/app/forgot-password",
            "Reset password",
            "We'll email you a password reset link.",
            &[("email", "Email", "email", "")],
        ),
        "/reset-password" => (
            "/reset-password",
            "Set a new password",
            "Choose a new password for your account.",
            &[
                ("token", "", "hidden", token),
                ("newPassword", "New password", "password", ""),
            ],
        ),
        "/app/magic-link" => (
            "/app/magic-link",
            "Email sign-in link",
            "We'll email you a link to sign in.",
            &[("email", "Email", "email", "")],
        ),
        _ => (
            "/app/login",
            "Sign in",
            "Access your appcall dashboard.",
            &[
                ("email", "Email", "email", ""),
                ("password", "Password", "password", ""),
            ],
        ),
    };
    let controls = fields
        .iter()
        .map(|(name, label, kind, value)| auth_field(name, label, kind, value))
        .collect::<String>();
    let body = format!("<section class=\"rounded-panel border border-line bg-panel p-6\"><h1 class=\"text-lg font-semibold text-ink-50\">{title}</h1><p class=\"mt-1 text-sm text-ink-300\">{subtitle}</p><form method=\"post\" action=\"{action}\" class=\"mt-6 flex flex-col gap-4\">{}{controls}{}</form><nav aria-label=\"Other sign-in options\" class=\"mt-5 flex flex-col gap-3\">{}{}</nav></section><nav aria-label=\"Account access\" class=\"mt-5 flex flex-wrap justify-center gap-3\">{}{}</nav>",auth_field("next","","hidden",safe_next(next)),auth_submit("Continue"),crate::ui::back_link("Sign in with password instead",crate::ui::LocalPath::new("/app/login/password").unwrap()),crate::ui::back_link("Forgot password?",crate::ui::LocalPath::new("/app/forgot-password").unwrap()),crate::ui::back_link("Create an account",crate::ui::LocalPath::new("/app/signup").unwrap()),crate::ui::back_link("Sign in",crate::ui::LocalPath::new("/app/login").unwrap()));
    auth_layout(title, &body)
}
fn auth_failure(r: &Request<'_>) -> Result<String, Error> {
    let mut html = match r.path {
        "/app/login/mfa" => challenge_form(
            r.path,
            "Verify your identity",
            "mfaToken",
            r.field("mfaToken")?,
            r.field("next")?,
        ),
        "/app/otp/verify" => challenge_form(
            r.path,
            "Check your email",
            "email",
            r.field("email")?,
            r.field("next")?,
        ),
        _ => form(
            if r.path == "/app/login" {
                "/app/login/password"
            } else {
                r.path
            },
            r.field("next")?,
            r.field("token")?,
            r.field("invitation")?,
        ),
    };
    for field in ["email", "displayName"] {
        let kind = if field == "email" { "email" } else { "text" };
        html = html.replace(
            &format!("name=\"{field}\" type=\"{kind}\" value=\"\""),
            &format!(
                "name=\"{field}\" type=\"{kind}\" value=\"{}\"",
                escape(r.field(field)?)
            ),
        );
    }
    let message = match r.path {
        "/app/login" => "Sign-in did not complete. Check your email and password.",
        "/app/login/mfa" | "/app/otp/verify" => {
            "Verification did not complete. Check the code you entered."
        }
        "/app/signup" => "Account creation did not complete. Review your registration details.",
        "/app/otp" => "Appcall could not accept the sign-in code request. Check your email address and try again.",
        "/app/magic-link" => "Appcall could not accept the sign-in link request. Check your email address and try again.",
        "/app/forgot-password" => "Appcall could not accept the password reset request. Check your email address and try again.",
        _ => "Appcall could not accept this request. Review the submitted details.",
    };
    Ok(html.replacen(
        "<form ",
        &format!("<p role=\"alert\" aria-live=\"assertive\" class=\"mt-4 text-sm text-rose-400\">{message}</p><form "),
        1,
    ))
}

fn challenge_form(action: &str, title: &str, token_name: &str, token: &str, next: &str) -> String {
    let code = crate::ui::Field {
        required: true,
        autocomplete: Some("one-time-code"),
        ..crate::ui::Field::new(
            "auth-code",
            "code",
            "Verification code",
            crate::ui::Control::Input(crate::ui::InputType::Text),
        )
    }
    .render();
    auth_layout(
        title,
        &format!(
            r#"<section class="rounded-panel border border-line bg-panel p-6"><h1 class="text-lg font-semibold text-ink-50">{}</h1><p class="mt-1 text-sm text-ink-300">Enter your verification code to continue.</p><form method="post" action="{}" class="mt-6 flex flex-col gap-4">{}{}{code}{}</form></section>"#,
            escape(title),
            escape(action),
            auth_field(token_name, "", "hidden", token),
            auth_field("next", "", "hidden", safe_next(next)),
            auth_submit("Verify")
        ),
    )
}

fn auth_field(name: &str, label: &str, kind: &str, value: &str) -> String {
    let kind = match kind {
        "hidden" => crate::ui::InputType::Hidden,
        "email" => crate::ui::InputType::Email,
        "password" => crate::ui::InputType::Password,
        _ => crate::ui::InputType::Text,
    };
    crate::ui::Field {
        value,
        autocomplete: Some("off"),
        ..crate::ui::Field::new(
            &format!("auth-{name}"),
            name,
            label,
            crate::ui::Control::Input(kind),
        )
    }
    .render()
}

fn auth_submit(label: &str) -> String {
    crate::ui::Button {
        target: crate::ui::ButtonTarget::Button {
            kind: crate::ui::ButtonType::Submit,
            form: None,
            action: None,
        },
        ..crate::ui::Button::new(label)
    }
    .render()
}

fn auth_link(label: &str, href: &str) -> String {
    let Some(href) = crate::ui::LocalPath::new(href) else {
        return String::new();
    };
    crate::ui::Button {
        variant: crate::ui::ButtonVariant::Secondary,
        target: crate::ui::ButtonTarget::Link(href),
        ..crate::ui::Button::new(label)
    }
    .render()
}

pub(crate) fn auth_notice(title: &str, message: &str, error: bool) -> String {
    auth_layout(title, &format!("<section class=\"rounded-panel border border-line bg-panel p-6\"><h1 class=\"text-lg font-semibold text-ink-50\">{}</h1><p role=\"{}\" class=\"mt-4 mb-5 text-ink-300\">{}</p>{}</section>",escape(title),if error {"alert"} else {"status"},escape(message),auth_link("Sign in","/app/login")))
}

pub(crate) fn auth_layout(title: &str, body: &str) -> String {
    format!("<!DOCTYPE html><html lang=\"en\" class=\"dark\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>{} · appcall</title><link rel=\"icon\" type=\"image/svg+xml\" href=\"/static/favicon.svg\"><link rel=\"stylesheet\" href=\"/static/app.css\"><script type=\"module\" src=\"/static/datastar.js\"></script></head><body class=\"flex min-h-screen items-center justify-center bg-ground px-4 py-8 text-ink-100 antialiased\"><main class=\"w-full max-w-sm\"><div class=\"mb-8 flex items-center justify-center gap-3\"><div class=\"flex size-8 items-center justify-center rounded-ctl bg-iris-500 font-semibold text-ink-50\" aria-hidden=\"true\">a</div><span class=\"text-lg font-semibold tracking-tight text-ink-50\">appcall</span></div>{body}</main></body></html>",escape(title))
}
pub(crate) fn escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

#[cfg(test)]
mod tests {
    #[test]
    fn copy_auth_failures_are_route_specific_and_private() {
        for (path, message, retained) in [
            (
                "/app/login",
                "Sign-in did not complete. Check your email and password.",
                vec!["email"],
            ),
            (
                "/app/login/mfa",
                "Verification did not complete. Check the code you entered.",
                vec!["mfaToken"],
            ),
            (
                "/app/otp/verify",
                "Verification did not complete. Check the code you entered.",
                vec!["email"],
            ),
            (
                "/app/signup",
                "Account creation did not complete. Review your registration details.",
                vec!["email", "displayName", "invitation"],
            ),
        ] {
            let request = super::Request {
                method: "POST",
                path,
                cookies: "",
                origin: None,
                referer: None,
                now: 0,
                fields: [
                    ("email", "email\"><script>"),
                    ("displayName", "name\"><script>"),
                    ("invitation", "invitation\"><script>"),
                    ("mfaToken", "challenge\"><script>"),
                    ("next", "/app/logs?cursor=a&limit=2"),
                    ("password", "synthetic-private-password"),
                    ("newPassword", "synthetic-private-new-password"),
                    ("code", "synthetic-private-code"),
                ]
                .into_iter()
                .map(|(key, value)| (key.into(), vec![value.into()]))
                .collect(),
            };
            let html = super::auth_failure(&request).unwrap();
            assert!(
                html.contains(&format!(">{message}</p>")),
                "wrong copy for {path}"
            );
            assert_eq!(html.matches("role=\"alert\"").count(), 1);
            assert!(html.contains(&format!("action=\"{path}\"")));
            assert!(html.contains(
                "name=\"next\" type=\"hidden\" value=\"/app/logs?cursor=a&amp;limit=2\""
            ));
            for key in retained {
                let value = super::escape(request.field(key).unwrap());
                let kind = match key {
                    "email" if path != "/app/otp/verify" => "email",
                    "displayName" => "text",
                    _ => "hidden",
                };
                assert!(
                    html.contains(&format!("name=\"{key}\" type=\"{kind}\" value=\"{value}\"")),
                    "missing {key} for {path}"
                );
            }
            for secret in [
                "synthetic-private-password",
                "synthetic-private-new-password",
                "synthetic-private-code",
            ] {
                assert!(!html.contains(secret));
            }
            assert!(!html.contains("<script>"));
        }
    }

    struct Deny;
    impl appcall_auth::MembershipVerifier for Deny {
        fn verify_membership(
            &self,
            _: &appcall_auth::AccessClaims,
            _: &str,
            _: &str,
        ) -> Result<Option<appcall_auth::Membership>, appcall_auth::AuthError> {
            Ok(None)
        }
    }

    #[tokio::test]
    async fn copy_auth_failures_email_acknowledgment_requires_accepted_request() {
        tokio::time::timeout(
            std::time::Duration::from_secs(5),
            accepted_email_request_fixture(),
        )
        .await
        .expect("email request fixture must complete within five seconds");
    }

    async fn accepted_email_request_fixture() {
        use super::*;
        use tokio::{
            io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader},
            net::TcpListener,
        };
        for (path, endpoint) in [
            ("/app/otp", "/api/auth/otp/request"),
            ("/app/forgot-password", "/api/auth/forgot-password"),
            ("/app/magic-link", "/api/auth/magic-link"),
            ("/resend-verification", "/api/auth/resend-verification"),
        ] {
            let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
            let address = listener.local_addr().unwrap();
            let server = async move {
                for status in [
                    "200 OK",
                    "400 Bad Request",
                    "401 Unauthorized",
                    "403 Forbidden",
                    "503 Service Unavailable",
                ] {
                    let (stream, _) = listener.accept().await.unwrap();
                    let mut reader = BufReader::new(stream);
                    let mut request_line = String::new();
                    reader.read_line(&mut request_line).await.unwrap();
                    assert_eq!(request_line, format!("POST {endpoint} HTTP/1.1\r\n"));
                    let mut content_length = 0;
                    loop {
                        let mut header = String::new();
                        assert!(reader.read_line(&mut header).await.unwrap() > 0);
                        if header == "\r\n" {
                            break;
                        }
                        if let Some(length) =
                            header.to_ascii_lowercase().strip_prefix("content-length:")
                        {
                            content_length = length.trim().parse::<usize>().unwrap();
                        }
                    }
                    assert!(content_length <= 4096);
                    let mut body = vec![0; content_length];
                    reader.read_exact(&mut body).await.unwrap();
                    let response_body = if status == "200 OK" {
                        "{}"
                    } else {
                        "{\"error\":\"synthetic-private-provider-detail\"}"
                    };
                    reader.get_mut().write_all(format!("HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{response_body}", response_body.len()).as_bytes()).await.unwrap();
                }
            };
            let codec = SessionCodec::new("synthetic", false).unwrap();
            let jwt = appcall_auth::JwtVerifier::new("synthetic", Default::default()).unwrap();
            let broker = Broker::new(&format!("http://{address}"), "appcall").unwrap();
            let browser = Browser {
                codec: &codec,
                identity: Identity {
                    jwt: &jwt,
                    memberships: &Deny,
                    broker: &broker,
                },
                public_origin: "https://app.example",
            };
            let request = Request {
                method: "POST",
                path,
                cookies: "",
                origin: Some("https://app.example"),
                referer: None,
                now: 0,
                fields: [
                    ("email", "synthetic\"><script>@example.invalid"),
                    ("next", "/app/logs?cursor=a&limit=2"),
                    ("password", "synthetic-private-password"),
                ]
                .into_iter()
                .map(|(key, value)| (key.into(), vec![value.into()]))
                .collect(),
            };
            let client = async {
                let accepted = browser.handle(&request).await.unwrap();
                let mut rejected = Vec::new();
                for _ in 0..4 {
                    rejected.push(browser.handle(&request).await.unwrap());
                }
                (accepted, rejected)
            };
            let ((), (accepted, rejected)) = tokio::join!(server, client);
            assert_eq!(accepted.status, 200);
            if path == "/app/otp" {
                assert!(accepted.body.contains("action=\"/app/otp/verify\""));
            } else {
                assert!(accepted.body.starts_with("<!DOCTYPE html>"));
                assert!(accepted
                    .body
                    .contains("Request received. Check your email for the next step."));
            }
            for (rejected, status) in rejected.iter().zip([400, 401, 403, 503]) {
                assert_eq!(rejected.status, status);
                assert!(!rejected.body.contains("Request received"));
                assert!(!rejected.body.contains("action=\"/app/otp/verify\""));
                assert!(!rejected.body.contains("synthetic-private-provider-detail"));
                assert!(!rejected.body.contains("synthetic-private-password"));
                assert!(!rejected.headers.iter().any(|(key, _)| key == "Set-Cookie"));
                if matches!(status, 400 | 401) && path != "/resend-verification" {
                    let message = match path {
                        "/app/otp" => "Appcall could not accept the sign-in code request. Check your email address and try again.",
                        "/app/magic-link" => "Appcall could not accept the sign-in link request. Check your email address and try again.",
                        _ => "Appcall could not accept the password reset request. Check your email address and try again.",
                    };
                    assert!(
                        rejected.body.contains(message),
                        "missing recovery copy for {path} ({status})"
                    );
                    assert!(rejected.body.contains(&format!("action=\"{path}\"")));
                    assert!(rejected.body.contains("name=\"email\" type=\"email\" value=\"synthetic&quot;&gt;&lt;script&gt;@example.invalid\""));
                    assert!(rejected.body.contains(
                        "name=\"next\" type=\"hidden\" value=\"/app/logs?cursor=a&amp;limit=2\""
                    ));
                    assert_eq!(rejected.body.matches("role=\"alert\"").count(), 1);
                    assert!(!rejected.body.contains("<script>"));
                } else {
                    assert!(!rejected.body.contains("<form"));
                }
            }
            assert!(!accepted.headers.iter().any(|(key, _)| key == "Set-Cookie"));
        }
    }

    #[test]
    fn failed_login_preserves_email_but_never_password() {
        let request = super::Request {
            method: "POST",
            path: "/app/login",
            cookies: "",
            origin: None,
            referer: None,
            now: 0,
            fields: std::collections::BTreeMap::from([
                ("email".into(), vec!["a\"><script>".into()]),
                ("password".into(), vec!["secret-password".into()]),
            ]),
        };
        let html = super::auth_failure(&request).unwrap();
        assert!(html.contains("role=\"alert\""));
        assert!(html.contains("a&quot;&gt;&lt;script&gt;"));
        assert!(!html.contains("secret-password"));
        assert!(html.contains("action=\"/app/login\""));
    }
    #[test]
    fn authentication_challenges_keep_tokens_escaped_and_use_full_layout() {
        let html = super::challenge_form(
            "/app/login/mfa",
            "Verify your identity",
            "mfaToken",
            "\"><script>",
            "/app/logs",
        );
        assert!(html.starts_with("<!DOCTYPE html>"));
        assert!(html.contains("autocomplete=\"one-time-code\""));
        assert!(html.contains("&quot;&gt;&lt;script&gt;"));
        assert!(!html.contains("<script>"));
        assert!(html.contains("value=\"/app/logs\""));
    }
}
