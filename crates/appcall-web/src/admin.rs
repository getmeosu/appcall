use crate::{http::escape, *};
use reqwest::Method;
use serde_json::{json, Value};
pub(crate) fn route(p: &str) -> bool {
    matches!(
        p,
        "/app/settings/team"
            | "/app/settings/team/invite"
            | "/app/sessions"
            | "/app/settings"
            | "/app/settings/account"
            | "/app/settings/organization"
            | "/app/settings/billing"
    ) || p.starts_with("/app/settings/team/")
        || p.starts_with("/app/settings/account/sessions/")
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
                            "/app/settings/team" => "Team",
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
                            "/app/settings/team" => "Could not load members.",
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
            "/app/settings/team/invite" => (
                Method::POST,
                "/api/tenant/members/invite".into(),
                json!({"email":r.field("email")?,"role":role}),
                "/app/settings/team?invited=1",
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
                    "<p class=\"mb-4 text-sm text-ink-300\">Scan this QR code with your authenticator app, or enter the secret manually.</p><div class=\"overflow-hidden rounded-lg\">{qr}</div><p class=\"mt-4\">Manual setup secret: <code>{}</code></p>{}",
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
                let (kind, id, action) = match parts.as_slice() {
                    ["app", "settings", "team", id, action] => ("team", *id, *action),
                    ["app", "settings", "account", "sessions", id, "revoke"] => {
                        ("sessions", *id, "revoke")
                    }
                    _ => return Err(Error::Invalid),
                };
                if !identifier(id) {
                    return Err(Error::Invalid);
                }
                match (kind, action) {
                    ("team", "remove") => (
                        Method::DELETE,
                        format!("/api/tenant/members/{id}"),
                        Value::Null,
                        "/app/settings/team?removed=1",
                    ),
                    ("team", "role") => (
                        Method::PATCH,
                        format!("/api/tenant/members/{id}/role"),
                        json!({"role":role}),
                        "/app/settings/team?role=updated",
                    ),
                    ("sessions", "revoke") => (
                        Method::DELETE,
                        format!("/api/auth/sessions/{id}"),
                        Value::Null,
                        "/app/settings/account?revoked=1#account-sessions",
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
            "/app/settings/team" => {
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
                    "/app/settings/team/invite",
                    &[
                        ("email", "Email", "email", ""),
                        ("role", "Role (user or admin)", "text", "user"),
                    ],
                );
                content.push_str("<div class=\"remaining-table-scroll\" role=\"region\" aria-label=\"Team members\" tabindex=\"0\"><table class=\"remaining-table\"><caption class=\"sr-only\">Team members</caption><thead><tr><th scope=\"col\">Name</th><th scope=\"col\">Email</th><th scope=\"col\">Role</th><th scope=\"col\">Joined</th><th scope=\"col\">Manage</th></tr></thead><tbody>");
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
                                &format!("/app/settings/team/{id}/role"),
                                &[(
                                    "role",
                                    "Role",
                                    "text",
                                    member["role"].as_str().unwrap_or("user")
                                )]
                            ),
                            form(&format!("/app/settings/team/{id}/remove"), &[])
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
            "/app/sessions" => crate::remaining_pages::sessions(
                self.identity
                    .broker
                    .call(Method::GET, "/api/auth/sessions", Some(s), None)
                    .await,
            ),
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
                let security = crate::remaining_pages::account_security(
                    self.identity
                        .broker
                        .call(Method::GET, "/api/auth/me", Some(s), None)
                        .await,
                );
                security
                    + &crate::remaining_pages::sessions(
                        self.identity
                            .broker
                            .call(Method::GET, "/api/auth/sessions", Some(s), None)
                            .await,
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
                "/app/settings/team" => "Team",
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
        "<p class=\"mt-4 text-sm text-ink-300\">No sessions to show.</p>"
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
        "/app/settings/team/invite" => "Send invitation",
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
    use crate::ui::{
        Button, ButtonTarget, ButtonType, Control, Field, InputType, LocalPath, SelectOption,
    };
    let Ok(prefix) = crate::ui::document_id() else {
        return crate::admin_ui::banner("Form unavailable. Refresh this page to try again.", false);
    };
    let options = [
        SelectOption {
            value: "user",
            label: "User",
            disabled: false,
        },
        SelectOption {
            value: "admin",
            label: "Admin",
            disabled: false,
        },
    ];
    let controls = fields
        .iter()
        .enumerate()
        .map(|(index, (name, label, kind, value))| {
            let id = format!("{prefix}-{index}");
            let control = if *name == "role" {
                Control::Select(&options)
            } else {
                Control::Input(match *kind {
                    "hidden" => InputType::Hidden,
                    "email" => InputType::Email,
                    "password" => InputType::Password,
                    _ => InputType::Text,
                })
            };
            Field {
                value,
                ..Field::new(&id, name, label, control)
            }
            .render()
        })
        .collect::<String>();
    let submit = if action.ends_with("/remove") || action.ends_with("/revoke") {
        crate::ui::ConfirmButton {
            id: &format!("{prefix}-dialog"),
            trigger: label,
            heading: label,
            body: if action.ends_with("/remove") {
                "Remove this member from the organization?"
            } else {
                "Revoke this session? The device will need to sign in again."
            },
            confirm: label,
            action: LocalPath::new(action).expect("internal admin route"),
            form: Some(&prefix),
        }
        .render()
    } else {
        Button {
            variant: match action {
                "/app/settings/account/mfa/setup" => crate::ui::ButtonVariant::Secondary,
                "/app/settings/account/mfa/disable" => crate::ui::ButtonVariant::Danger,
                "/app/settings/billing/checkout" => crate::ui::ButtonVariant::Secondary,
                path if path.ends_with("/role") => crate::ui::ButtonVariant::Secondary,
                _ => crate::ui::ButtonVariant::Primary,
            },
            target: ButtonTarget::Button {
                kind: ButtonType::Submit,
                form: None,
                action: None,
            },
            ..Button::new(label)
        }
        .render()
    };
    format!("<form id=\"{prefix}\" class=\"remaining-form\" method=\"post\" action=\"{}\">{controls}{submit}</form>",escape(action))
}

fn page(title: &str, content: String) -> Response {
    Response::new(
        200,
        format!(
            "<div class=\"remaining-page\">{}{content}</div>",
            crate::remaining_pages::heading(title, "")
        ),
    )
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
