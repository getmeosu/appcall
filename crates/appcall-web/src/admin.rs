use crate::{http::escape, *};
use reqwest::Method;
use serde_json::{json, Value};
pub(crate) fn route(p: &str) -> bool {
    matches!(
        p,
        "/app/users"
            | "/app/users/invite"
            | "/app/sessions"
            | "/app/settings"
            | "/app/settings/account"
            | "/app/settings/organization"
            | "/app/settings/billing"
    ) || p.starts_with("/app/users/")
        || p.starts_with("/app/sessions/")
        || p.starts_with("/app/settings/account/")
        || p.starts_with("/app/settings/billing/")
}
impl Browser<'_> {
    pub(crate) async fn administration(&self, r: &Request<'_>) -> Response {
        if r.method == "POST" && verify_csrf(self.public_origin, r.origin, r.referer).is_err() {
            return Response::new(403, "Access denied".into());
        }
        let session = match cookie(r.cookies, "appcall_session")
            .ok()
            .flatten()
            .and_then(|raw| self.codec.open_session(raw).ok())
        {
            Some(s) => s,
            None => return Response::redirect("/app/login").cookie(self.codec.clear_session()),
        };
        let (session, principal) = match self.identity.refresh(&session, r.now).await {
            Ok(pair) => pair,
            Err(Error::Unavailable) => {
                return Response::new(503, "Identity service unavailable".into())
            }
            Err(_) => return Response::redirect("/app/login").cookie(self.codec.clear_session()),
        };
        let result = self.admin_dispatch(r, &session, &principal).await;
        let response = match result {
            Ok(mut response) => {
                if response.status == 200 {
                    response.body = crate::shell::layout(
                        match r.path {
                            "/app/users" => "Users",
                            "/app/sessions" => "Sessions",
                            "/app/settings/account" => "Account",
                            "/app/settings/account/mfa/setup" => "Enable MFA",
                            "/app/settings/account/mfa/verify" => "MFA Enabled",
                            "/app/settings/organization" => "Organization",
                            "/app/settings/billing" => "Billing",
                            _ => "Settings",
                        },
                        &session,
                        &(crate::admin_ui::flash(r).unwrap_or_default() + &response.body),
                        r.path,
                    );
                }
                response
            }
            Err(_) if r.method == "POST" && r.path == "/app/settings/organization" => {
                let mut url = reqwest::Url::parse(
                    "https://local.invalid/app/settings/organization?error=org",
                )
                .expect("fixed URL");
                url.query_pairs_mut()
                    .append_pair("name", r.field("name").unwrap_or(""));
                Response::redirect(&format!("{}?{}", url.path(), url.query().unwrap_or("")))
            }
            Err(_) if r.method == "POST" && crate::admin_ui::failure_target(r.path).is_some() => {
                Response::redirect(crate::admin_ui::failure_target(r.path).unwrap())
            }
            Err(_) if r.method == "GET" => Response::new(
                200,
                crate::shell::layout(
                    "Settings",
                    &session,
                    &crate::admin_ui::banner(
                        match r.path {
                            "/app/users" => "Could not load members.",
                            "/app/sessions" => "Could not load sessions.",
                            "/app/settings/account" => "Could not load account details.",
                            _ => "Could not load settings. Please refresh.",
                        },
                        false,
                    ),
                    r.path,
                ),
            ),
            Err(e) => Response::new(
                match e {
                    Error::Invalid => 400,
                    Error::Forbidden => 403,
                    Error::Unauthorized => 401,
                    _ => 503,
                },
                escape(&e.to_string()),
            ),
        };
        match self.codec.session_cookie(&session) {
            Ok(c) => response.cookie(c),
            Err(_) => Response::new(503, "Session unavailable".into()),
        }
    }
    async fn admin_dispatch(
        &self,
        r: &Request<'_>,
        s: &Session,
        principal: &appcall_auth::Principal,
    ) -> Result<Response, Error> {
        if r.method == "GET" {
            return self.admin_page(r, s, principal).await;
        }
        if r.method != "POST" {
            return Ok(Response::new(405, "Method not allowed".into()));
        }
        if matches!(
            r.path,
            "/app/settings/billing/checkout" | "/app/settings/billing/portal"
        ) {
            let checkout = r.path.ends_with("/checkout");
            let endpoint = if checkout {
                "/api/billing/checkout"
            } else {
                "/api/billing/portal"
            };
            let body = if checkout {
                let plan = r.field("planId")?;
                if plan.is_empty() {
                    return Err(Error::Invalid);
                }
                json!({"planId":plan})
            } else {
                json!({})
            };
            let value = self
                .identity
                .broker
                .call(Method::POST, endpoint, Some(s), Some(body))
                .await?;
            let target = value
                .get(if checkout { "checkoutUrl" } else { "portalUrl" })
                .and_then(Value::as_str)
                .ok_or(Error::Unavailable)?;
            let url = reqwest::Url::parse(target).map_err(|_| Error::Unavailable)?;
            if url.scheme() != "https" || !url.username().is_empty() || url.password().is_some() {
                return Err(Error::Unavailable);
            }
            return Ok(Response::redirect(target));
        }
        let role = if r.field("role")? == "admin" {
            "admin"
        } else {
            "user"
        };
        let (method, path, body, target) = match r.path {
            "/app/users/invite" => (
                Method::POST,
                "/api/tenant/members/invite".into(),
                json!({"email":r.field("email")?,"role":role}),
                "/app/users?invited=1",
            ),
            "/app/settings/organization" => (
                Method::PATCH,
                "/api/tenant/settings".into(),
                json!({"name":r.field("name")?}),
                "/app/settings/organization",
            ),
            "/app/settings/account/change-password" => (
                Method::POST,
                "/api/auth/change-password".into(),
                json!({"currentPassword":r.field("currentPassword")?,"newPassword":r.field("newPassword")?}),
                "/app/settings/account?password=changed",
            ),
            "/app/settings/account/mfa/disable" => (
                Method::POST,
                "/api/auth/mfa/disable".into(),
                json!({"code":r.field("code")?}),
                "/app/settings/account",
            ),
            "/app/settings/account/mfa/setup" => {
                let result = self
                    .identity
                    .broker
                    .call(
                        Method::POST,
                        "/api/auth/mfa/setup",
                        Some(s),
                        Some(json!({})),
                    )
                    .await?;
                let qr = crate::admin_ui::mfa_qr(
                    result
                        .get("url")
                        .or_else(|| result.get("otpauthUrl"))
                        .or_else(|| result.get("otpauthURL"))
                        .and_then(Value::as_str)
                        .unwrap_or(""),
                )
                .unwrap_or_default();
                let content = format!(
                    "<p class=\"mb-4 text-sm text-dusk-blue-400\">Scan this QR code with your authenticator app, or enter the secret manually.</p><div class=\"overflow-hidden rounded-lg\">{qr}</div><p class=\"mt-4\">Manual setup secret: <code>{}</code></p>{}",
                    text(&result, "secret"),
                    form(
                        "/app/settings/account/mfa/verify",
                        &[("code", "Verification code", "text", "")]
                    )
                );
                return Ok(page("Enable MFA", content));
            }
            "/app/settings/account/mfa/verify" => {
                let result = self
                    .identity
                    .broker
                    .call(
                        Method::POST,
                        "/api/auth/mfa/verify-setup",
                        Some(s),
                        Some(json!({"code":r.field("code")?})),
                    )
                    .await?;
                let codes = result
                    .get("recoveryCodes")
                    .and_then(Value::as_array)
                    .ok_or(Error::Unavailable)?;
                return Ok(page(
                    "MFA enabled",
                    format!(
                        "<p>Save these recovery codes securely.</p><ul>{}</ul>",
                        codes
                            .iter()
                            .filter_map(Value::as_str)
                            .map(|v| format!("<li><code>{}</code></li>", escape(v)))
                            .collect::<String>()
                    ),
                ));
            }
            path => {
                let parts: Vec<_> = path.trim_start_matches('/').split('/').collect();
                if parts.len() != 4 || !identifier(parts[2]) {
                    return Err(Error::Invalid);
                }
                match (parts[1], parts[3]) {
                    ("users", "remove") => (
                        Method::DELETE,
                        format!("/api/tenant/members/{}", parts[2]),
                        Value::Null,
                        "/app/users?removed=1",
                    ),
                    ("users", "role") => (
                        Method::PATCH,
                        format!("/api/tenant/members/{}/role", parts[2]),
                        json!({"role":role}),
                        "/app/users?role=updated",
                    ),
                    ("sessions", "revoke") => (
                        Method::DELETE,
                        format!("/api/auth/sessions/{}", parts[2]),
                        Value::Null,
                        "/app/sessions?revoked=1",
                    ),
                    _ => return Err(Error::Invalid),
                }
            }
        };
        self.identity
            .broker
            .call(
                method,
                &path,
                Some(s),
                if body.is_null() { None } else { Some(body) },
            )
            .await?;
        if r.path == "/app/settings/organization" {
            let mut url = reqwest::Url::parse("https://local.invalid/app/settings/organization")
                .map_err(|_| Error::Configuration)?;
            url.query_pairs_mut()
                .append_pair("saved", "1")
                .append_pair("name", r.field("name")?);
            return Ok(Response::redirect(&format!(
                "{}?{}",
                url.path(),
                url.query().unwrap_or("")
            )));
        }
        Ok(Response::redirect(target))
    }
    async fn admin_page(
        &self,
        r: &Request<'_>,
        s: &Session,
        principal: &appcall_auth::Principal,
    ) -> Result<Response, Error> {
        let path = r.path;
        let content = match path {
            "/app/settings" => {
                return Ok(page(
                    "Settings",
                    crate::admin_ui::settings(
                        &principal.project_id,
                        &s.tenant_name,
                        &s.tenant_name,
                    ),
                ))
            }
            "/app/users" => {
                let value = self
                    .identity
                    .broker
                    .call(Method::GET, "/api/tenant/members", Some(s), None)
                    .await?;
                let members = value
                    .get("members")
                    .and_then(Value::as_array)
                    .ok_or(Error::Unavailable)?;
                let mut content = form(
                    "/app/users/invite",
                    &[
                        ("email", "Email", "email", ""),
                        ("role", "Role (user or admin)", "text", "user"),
                    ],
                );
                content.push_str("<div class=\"overflow-x-auto rounded-xl border border-space-indigo-800\"><table class=\"admin-table w-full\"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th><th>Manage</th></tr></thead><tbody>");
                for member in members {
                    let id = member
                        .get("userId")
                        .and_then(Value::as_str)
                        .filter(|v| identifier(v))
                        .ok_or(Error::Unavailable)?;
                    let controls = if member.get("role").and_then(Value::as_str) == Some("owner") {
                        String::new()
                    } else {
                        format!(
                            "{}{}",
                            form(
                                &format!("/app/users/{id}/role"),
                                &[(
                                    "role",
                                    "Role",
                                    "text",
                                    member["role"].as_str().unwrap_or("user")
                                )]
                            ),
                            form(&format!("/app/users/{id}/remove"), &[])
                        )
                    };
                    content.push_str(&format!(
                        "<tr><td>{}</td><td>{}</td><td>{}</td><td>{}</td><td>{controls}</td></tr>",
                        escape(
                            member["displayName"]
                                .as_str()
                                .filter(|v| !v.is_empty())
                                .unwrap_or(member["email"].as_str().unwrap_or(""))
                        ),
                        text(member, "email"),
                        text(member, "role"),
                        crate::admin_ui::display_date(
                            member["joinedAt"].as_str().unwrap_or(""),
                            false
                        )
                    ));
                }
                content.push_str("</tbody></table></div>");
                content
            }
            "/app/sessions" => {
                let value = self
                    .identity
                    .broker
                    .call(Method::GET, "/api/auth/sessions", Some(s), None)
                    .await?;
                let sessions = value
                    .get("sessions")
                    .and_then(Value::as_array)
                    .ok_or(Error::Unavailable)?;
                let mut content = String::from("<div class=\"overflow-x-auto rounded-xl border border-space-indigo-800\"><table class=\"admin-table w-full\"><thead><tr><th>Device</th><th>IP Address</th><th>Created</th><th>Expires</th><th>Manage</th></tr></thead><tbody>");
                for item in sessions {
                    let id = item
                        .get("id")
                        .and_then(Value::as_str)
                        .filter(|v| identifier(v))
                        .ok_or(Error::Unavailable)?;
                    let agent = item["userAgent"].as_str().unwrap_or("");
                    let agent = format!(
                        "{}{}",
                        agent.chars().take(60).collect::<String>(),
                        if agent.chars().count() > 60 {
                            "…"
                        } else {
                            ""
                        }
                    );
                    let manage = if item["current"].as_bool() == Some(true) {
                        "<span class=\"text-xs text-neon-ice-400\">Current session</span>".into()
                    } else {
                        form(&format!("/app/sessions/{id}/revoke"), &[])
                    };
                    content.push_str(&format!(
                        "<tr><td>{}</td><td>{}</td><td>{}</td><td>{}</td><td>{manage}</td></tr>",
                        escape(&agent),
                        text(item, "ipAddress"),
                        crate::admin_ui::display_date(
                            item["createdAt"].as_str().unwrap_or(""),
                            true
                        ),
                        crate::admin_ui::display_date(
                            item["expiresAt"].as_str().unwrap_or(""),
                            true
                        )
                    ));
                }
                content.push_str("</tbody></table></div>");
                content.push_str(session_empty_state(sessions.is_empty()));
                content
            }
            "/app/settings/organization" => form(
                "/app/settings/organization",
                &[(
                    "name",
                    "Organization name",
                    "text",
                    if r.field("name")?.is_empty() {
                        &s.tenant_name
                    } else {
                        r.field("name")?
                    },
                )],
            ),
            "/app/settings/account" => {
                let value = self
                    .identity
                    .broker
                    .call(Method::GET, "/api/auth/me", Some(s), None)
                    .await?;
                let user = value.get("user").ok_or(Error::Unavailable)?;
                let mfa = if user.get("totpEnabled").and_then(Value::as_bool) == Some(true) {
                    form(
                        "/app/settings/account/mfa/disable",
                        &[("code", "Disable MFA with verification code", "text", "")],
                    )
                } else {
                    form("/app/settings/account/mfa/setup", &[])
                };
                format!(
                    "<p class=\"text-lg font-semibold\">{}</p><p class=\"text-sm text-dusk-blue-400\">{}</p><h3 class=\"mt-6 text-base font-semibold\">Two-factor authentication</h3><p>{}</p>{mfa}<h3 class=\"mt-6 text-base font-semibold\">Change password</h3>{}",
                    text(user, "displayName"), text(user, "email"),if user["totpEnabled"].as_bool()==Some(true) {"MFA is enabled."} else {"Add an extra layer of security to your account."},
                    form(
                        "/app/settings/account/change-password",
                        &[
                            ("currentPassword", "Current password", "password", ""),
                            ("newPassword", "New password", "password", "")
                        ]
                    )
                )
            }
            "/app/settings/billing" => {
                let status = self
                    .identity
                    .broker
                    .call(Method::GET, "/api/billing/status", Some(s), None)
                    .await;
                let plans = self
                    .identity
                    .broker
                    .call(Method::GET, "/api/plans", Some(s), None)
                    .await;
                crate::admin_ui::billing(status, plans)
            }
            _ => return Ok(Response::new(405, "Method not allowed".into())),
        };
        Ok(page(
            match path {
                "/app/users" => "Users",
                "/app/sessions" => "Sessions",
                "/app/settings/account" => "Account",
                "/app/settings/billing" => "Billing",
                _ => "Organization",
            },
            content,
        ))
    }
}
pub(crate) fn identifier(v: &str) -> bool {
    !v.is_empty()
        && v.len() <= 256
        && v.bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}
fn text(v: &Value, key: &str) -> String {
    escape(v.get(key).and_then(Value::as_str).unwrap_or(""))
}
pub(crate) fn session_empty_state(empty: bool) -> &'static str {
    if empty {
        "<p class=\"mt-4 text-sm text-dusk-blue-400\">No sessions to show.</p>"
    } else {
        ""
    }
}
pub(crate) fn plan_price(cents: i64, currency: &str, interval: &str) -> String {
    let currency = currency.to_ascii_uppercase();
    let symbol = match currency.as_str() {
        "USD" | "" => "$".into(),
        "EUR" => "€".into(),
        "GBP" => "£".into(),
        _ => format!("{currency} "),
    };
    let suffix = match interval.to_ascii_lowercase().as_str() {
        "year" | "yearly" | "annual" => "/yr",
        _ => "/mo",
    };
    format!(
        "{symbol}{}{}.{:02}{suffix}",
        if cents < 0 { "-" } else { "" },
        cents.unsigned_abs() / 100,
        cents.unsigned_abs() % 100
    )
}

pub(crate) fn form(action: &str, fields: &[(&str, &str, &str, &str)]) -> String {
    let label = match action {
        "/app/users/invite" => "Send invitation",
        "/app/settings/organization" => "Rename organisation",
        "/app/settings/account/change-password" => "Change password",
        "/app/settings/account/mfa/setup" => "Enable MFA",
        "/app/settings/account/mfa/verify" => "Verify and enable MFA",
        "/app/settings/account/mfa/disable" => "Disable MFA",
        "/app/settings/billing/portal" => "Manage billing",
        "/app/settings/billing/checkout" => "Subscribe",
        path if path.ends_with("/remove") => "Remove member",
        path if path.ends_with("/role") => "Update role",
        path if path.ends_with("/revoke") => "Revoke session",
        _ => "Save changes",
    };
    format!(
        "<form class=\"mt-5 space-y-4\" method=\"post\" action=\"{}\">{}<button class=\"inline-flex items-center gap-2 rounded-lg bg-neon-ice-500 px-3.5 py-2 text-sm font-semibold text-prussian-blue-950\">{label}</button></form>",
        escape(action),
        fields
            .iter()
            .map(|(name, label, kind, value)| if *kind == "hidden" { format!("<input type=\"hidden\" name=\"{}\" value=\"{}\">",escape(name),escape(value)) } else if *name == "role" { format!("<label class=\"block text-xs text-dusk-blue-300\">{}<select name=\"role\" class=\"w-full rounded-lg border border-space-indigo-700 bg-prussian-blue-950 px-3 py-2 text-sm text-dusk-blue-100\"><option value=\"user\" {}>User</option><option value=\"admin\" {}>Admin</option></select></label>",escape(label),if *value=="admin" {""} else {"selected"},if *value=="admin" {"selected"} else {""}) } else { format!(
                "<label class=\"mb-1.5 block text-xs font-medium text-dusk-blue-300\">{}<input class=\"w-full rounded-lg border border-space-indigo-700 bg-prussian-blue-950 px-3 py-2 text-sm text-dusk-blue-100 focus:ring-1 focus:ring-neon-ice-500\" name=\"{}\" type=\"{}\" value=\"{}\"></label>",
                escape(label),
                escape(name),
                escape(kind),
                escape(value)
            ) })
            .collect::<String>()
    )
}
fn page(title: &str, content: String) -> Response {
    Response::new(200, format!("<div class=\"mb-6\"><h2 class=\"text-xl font-semibold tracking-tight text-dusk-blue-50\">{}</h2></div>{content}", escape(title)))
}

#[cfg(test)]
mod tests {
    #[test]
    fn billing_prices_preserve_cents_currency_and_interval() {
        assert_eq!(super::plan_price(2900, "USD", "month"), "$29.00/mo");
        assert_eq!(super::plan_price(29901, "EUR", "annual"), "€299.01/yr");
        assert_eq!(super::plan_price(999, "inr", "monthly"), "INR 9.99/mo");
    }
}
