use crate::*;
use serde_json::{json, Value};
use std::collections::BTreeMap;
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
pub struct Response {
    pub status: u16,
    pub headers: Vec<(String, String)>,
    pub body: String,
}
impl Response {
    pub(crate) fn new(status: u16, body: String) -> Self {
        Self {
            status,
            body,
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
                escape(&e.to_string()),
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
                "Email verified. <a href=\"/app/login\">Sign in</a>".into(),
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
                        links.push_str(&format!("<a class=\"mt-3 block rounded-lg border border-space-indigo-700 px-3 py-2 text-center text-sm\" href=\"{}?{}\">{label}</a>",target.path(),escape(target.query().unwrap_or(""))));
                    }
                    body = body.replacen("</form>", &format!("</form>{links}"), 1);
                }
            }
            return Ok(Response::new(200, body));
        }
        if r.method != "POST" {
            return Ok(Response::new(405, "Method not allowed".into()));
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
            _ => return Ok(Response::new(405, "Method not allowed".into())),
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
        self.identity
            .broker
            .call(
                reqwest::Method::POST,
                endpoint,
                None,
                Some(Value::Object(payload)),
            )
            .await?;
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
            "Request accepted. Check your email for the next step.".into(),
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
                    "Provider sign-in could not be completed. Please start again.".into(),
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
    let controls = fields.iter().map(|(name,label,kind,value)| format!("<label class=\"block\"><span class=\"mb-1.5 block text-sm font-medium text-dusk-blue-200\">{label}</span><input type=\"{kind}\" name=\"{name}\" value=\"{}\" autocomplete=\"off\" class=\"w-full rounded-lg border border-space-indigo-700 bg-prussian-blue-950 px-3 py-2 text-sm text-dusk-blue-100 placeholder:text-dusk-blue-600 focus:border-neon-ice-500 focus:outline-none focus:ring-1 focus:ring-neon-ice-500\"></label>",escape(value))).collect::<String>();
    let body = format!("<div class=\"rounded-2xl border border-space-indigo-800 bg-space-indigo-950 p-7\"><h1 class=\"text-lg font-semibold text-dusk-blue-50\">{title}</h1><p class=\"mt-1 text-sm text-dusk-blue-400\">{subtitle}</p><form method=\"post\" action=\"{action}\" class=\"mt-6 space-y-4\"><input type=\"hidden\" name=\"next\" value=\"{}\">{controls}<button type=\"submit\" class=\"w-full rounded-lg bg-neon-ice-500 px-3.5 py-2.5 text-sm font-semibold text-prussian-blue-950 transition hover:bg-neon-ice-400\">Continue</button></form><p class=\"mt-5 text-center text-sm text-dusk-blue-500\"><a href=\"/app/login/password\">Sign in with password instead</a> · <a href=\"/app/forgot-password\">Forgot password?</a></p></div><p class=\"mt-5 text-center text-sm text-dusk-blue-500\"><a href=\"/app/signup\">Create an account</a> · <a href=\"/app/login\">Sign in</a></p>",escape(safe_next(next)));
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
        html = html.replace(
            &format!("name=\"{field}\" value=\"\""),
            &format!("name=\"{field}\" value=\"{}\"", escape(r.field(field)?)),
        );
    }
    Ok(html.replacen("<form ", "<p role=\"alert\" class=\"mt-4 text-sm text-red-400\">Unable to sign in. Check your details and try again.</p><form ",1))
}

fn challenge_form(action: &str, title: &str, token_name: &str, token: &str, next: &str) -> String {
    auth_layout(
        title,
        &format!(
            r#"<div class="rounded-2xl border border-space-indigo-800 bg-space-indigo-950 p-7"><h1 class="text-lg font-semibold text-dusk-blue-50">{}</h1><p class="mt-1 text-sm text-dusk-blue-400">Enter your verification code to continue.</p><form method="post" action="{}" class="mt-6 space-y-4"><input type="hidden" name="{}" value="{}"><input type="hidden" name="next" value="{}"><label class="block"><span class="mb-1.5 block text-sm font-medium text-dusk-blue-200">Verification code</span><input name="code" required autocomplete="one-time-code" class="w-full rounded-lg border border-space-indigo-700 bg-prussian-blue-950 px-3 py-2 text-sm text-dusk-blue-100"></label><button class="w-full rounded-lg bg-neon-ice-500 px-3.5 py-2.5 text-sm font-semibold text-prussian-blue-950">Verify</button></form></div>"#,
            escape(title),
            escape(action),
            escape(token_name),
            escape(token),
            escape(safe_next(next))
        ),
    )
}

pub(crate) fn auth_layout(title: &str, body: &str) -> String {
    format!("<!DOCTYPE html><html lang=\"en\" class=\"dark\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>{} · appcall</title><link rel=\"icon\" type=\"image/svg+xml\" href=\"/static/favicon.svg\"><link rel=\"stylesheet\" href=\"/static/app.css\"><script type=\"module\" src=\"/static/datastar.js\"></script></head><body class=\"flex min-h-screen items-center justify-center bg-surface px-4 text-dusk-blue-100 antialiased\"><div class=\"w-full max-w-sm\"><div class=\"mb-8 flex items-center justify-center gap-2.5\"><div class=\"flex size-8 items-center justify-center rounded-md bg-neon-ice-500 font-semibold text-prussian-blue-950\">a</div><span class=\"text-lg font-semibold tracking-tight text-dusk-blue-50\">appcall</span></div>{body}</div></body></html>",escape(title))
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
