use crate::{http::escape, Error, Request};
use serde_json::Value;
pub(crate) fn banner(message: &str, success: bool) -> String {
    format!(
        "<div role=\"{}\" aria-live=\"{}\" class=\"remaining-notice\">{}</div>",
        if success { "status" } else { "alert" },
        if success { "polite" } else { "assertive" },
        crate::ui::state(
            if success {
                crate::ui::Tone::Ok
            } else {
                crate::ui::Tone::Warn
            },
            message
        )
    )
}
pub(crate) fn failure_target(path: &str) -> Option<&'static str> {
    Some(match path {
        "/app/settings/team/invite" => "/app/settings/team?error=invite",
        "/app/settings/organization" => "/app/settings/organization?error=org",
        "/app/settings/account/mfa/setup" => "/app/settings/account?error=setup",
        "/app/settings/account/mfa/verify" => "/app/settings/account?error=verify",
        "/app/settings/account/mfa/disable" => "/app/settings/account?error=disable",
        "/app/settings/account/change-password" => "/app/settings/account?error=password",
        "/app/settings/billing/checkout" => "/app/settings/billing?error=checkout",
        "/app/settings/billing/portal" => "/app/settings/billing?error=portal",
        p if p.starts_with("/app/settings/team/") && p.ends_with("/remove") => {
            "/app/settings/team?error=remove"
        }
        p if p.starts_with("/app/settings/team/") && p.ends_with("/role") => {
            "/app/settings/team?error=role"
        }
        p if p.starts_with("/app/settings/account/sessions/") && p.ends_with("/revoke") => {
            "/app/settings/account?error=revoke#account-sessions"
        }
        _ => return None,
    })
}
pub(crate) fn flash(r: &Request<'_>) -> Result<String, Error> {
    let hint = |message: &str, success| {
        let mut html = banner(message, success);
        if r.path == "/app/settings/organization" {
            html.push_str(
                &crate::ui::Button {
                    variant: crate::ui::ButtonVariant::Quiet,
                    target: crate::ui::ButtonTarget::Link(
                        crate::ui::LocalPath::new("/app/settings/organization")
                            .expect("fixed local path"),
                    ),
                    ..crate::ui::Button::new("Review organisation settings")
                }
                .render(),
            );
        }
        html
    };
    let err = r.field("error")?;
    let message = match (r.path, err) {
        ("/app/settings/team", "invite") => {
            "Check the members list before sending another invitation."
        }
        ("/app/settings/team", "remove") => "Review the members list before repeating a removal.",
        ("/app/settings/team", "role") => {
            "Review the member's current role before making another change."
        }
        ("/app/sessions" | "/app/settings/account", "revoke") => {
            "Review the sessions list before repeating a revocation."
        }
        ("/app/settings/organization", "org") => {
            "Check the current organisation name before making another change."
        }
        ("/app/settings/account", "setup" | "verify" | "disable" | "password") => {
            "Review your account security settings before making another change."
        }
        ("/app/settings/billing", "checkout") => {
            "Check your billing status before starting another checkout."
        }
        ("/app/settings/billing", "portal") => "Open Support for help accessing billing settings.",
        _ => "",
    };
    if !message.is_empty() {
        return Ok(hint(message, false));
    }
    let success = match r.path {
        "/app/settings/team" if r.field("invited")? == "1" => {
            "Check the members list before sending another invitation."
        }
        "/app/settings/team" if r.field("removed")? == "1" => {
            "Review the members list before repeating a removal."
        }
        "/app/settings/team" if r.field("role")? == "updated" => {
            "Review the member's current role before making another change."
        }
        "/app/sessions" | "/app/settings/account" if r.field("revoked")? == "1" => {
            "Review the sessions list before repeating a revocation."
        }
        "/app/settings/account" if r.field("password")? == "changed" => {
            "Review your account security settings before making another change."
        }
        "/app/settings/organization" if r.field("saved")? == "1" => {
            "Check the current organisation name before making another change."
        }
        _ => "",
    };
    Ok(if success.is_empty() {
        String::new()
    } else {
        hint(success, true)
    })
}
pub(crate) fn billing(status: Result<Value, Error>, plans: Result<Value, Error>) -> String {
    let mut body = String::from("<div class=\"space-y-8\"><section><h3 class=\"mb-3 text-sm font-semibold uppercase tracking-wider text-ink-300\">Current Plan</h3>");
    let status = match status {
        Ok(v) if v.is_object() => v,
        _ => {
            body.push_str(&banner(
                "Could not load your subscription status. Please refresh.",
                false,
            ));
            Value::Null
        }
    };
    let raw_status = status["billingStatus"]
        .as_str()
        .unwrap_or("")
        .to_ascii_lowercase();
    let (label, tone) = match raw_status.as_str() {
        "active" => ("Active", crate::ui::Tone::Ok),
        "past_due" => ("Past due", crate::ui::Tone::Warn),
        "canceled" => ("Canceled", crate::ui::Tone::Idle),
        _ => ("Subscription status unavailable", crate::ui::Tone::Idle),
    };
    let state = crate::ui::state(tone, label);
    let plan = status["plan"]["name"]
        .as_str()
        .filter(|v| !v.trim().is_empty())
        .unwrap_or("Plan unavailable");
    let credits = status["subscriptionCredits"]
        .as_i64()
        .zip(status["purchasedCredits"].as_i64())
        .and_then(|(subscription, purchased)| subscription.checked_add(purchased));
    let grouped = credits
        .map(group_credits)
        .unwrap_or_else(|| "Credits unavailable".into());
    body.push_str(&format!("<div class=\"rounded-panel border border-line bg-panel p-5\"><div class=\"flex flex-wrap items-start justify-between gap-4\"><div class=\"space-y-3\"><p class=\"text-base font-semibold text-ink-50\">{} {state}</p><p class=\"text-xs uppercase text-ink-300\">Credits</p><p class=\"text-lg font-semibold\">{grouped}</p>",escape(plan)));
    if let Some(date) = status["currentPeriodEnd"].as_str().and_then(billing_date) {
        body.push_str(&format!(
            "<p>Current period ends <time>{}</time></p>",
            escape(&date)
        ));
    }
    body.push_str("</div>");
    if raw_status == "active" && status["plan"].is_object() {
        body.push_str(&crate::admin::form("/app/settings/billing/portal", &[]));
    }
    body.push_str("</div></div></section><section><h3 class=\"mb-3 text-sm font-semibold uppercase tracking-wider text-ink-300\">Available Plans</h3>");
    match plans {
        Ok(v)
            if v["plans"]
                .as_array()
                .is_some_and(|plans| plans.iter().all(Value::is_object)) =>
        {
            let plans = v["plans"].as_array().unwrap();
            if plans.is_empty() {
                body.push_str("<p>No plans are available.</p>");
                body.push_str(
                    &crate::ui::Button {
                        target: crate::ui::ButtonTarget::Link(
                            crate::ui::LocalPath::new("/app/support").expect("fixed local path"),
                        ),
                        ..crate::ui::Button::new("Contact support")
                    }
                    .render(),
                );
            }
            body.push_str("<div class=\"grid gap-4 sm:grid-cols-2 lg:grid-cols-3\">");
            for plan in plans {
                let str = |key: &str| plan[key].as_str().unwrap_or("");
                let checkout = if crate::admin::identifier(str("id")) {
                    crate::admin::form(
                        "/app/settings/billing/checkout",
                        &[("planId", "", "hidden", str("id"))],
                    )
                } else {
                    "<p>Plan selection unavailable.</p>".into()
                };
                body.push_str(&format!("<article class=\"flex flex-col rounded-panel border border-line bg-panel p-5\"><h3 class=\"text-base font-semibold\">{}</h3><p class=\"text-2xl font-bold text-ink-50\">{}</p><p class=\"text-sm text-ink-300\">{}</p>{checkout}</article>",escape(str("name")),escape(&billing_price(plan)),escape(str("description"))));
            }
            body.push_str("</div>");
        }
        _ => body.push_str(&banner(
            "Could not load plans. Refresh this page to try again.",
            false,
        )),
    }
    body.push_str("</section></div>");
    body
}

fn group_credits(credits: i64) -> String {
    let digits = credits.unsigned_abs().to_string();
    let grouped = digits
        .chars()
        .enumerate()
        .map(|(i, c)| {
            format!(
                "{}{c}",
                if i > 0 && (digits.len() - i).is_multiple_of(3) {
                    ","
                } else {
                    ""
                }
            )
        })
        .collect::<String>();
    format!("{}{grouped}", if credits < 0 { "-" } else { "" })
}

fn billing_price(plan: &Value) -> String {
    let supplied = plan["price"]
        .as_i64()
        .zip(plan["currency"].as_str())
        .zip(plan["billingInterval"].as_str());
    match supplied {
        Some(((cents, currency), interval))
            if currency.len() == 3
                && currency.bytes().all(|v| v.is_ascii_alphabetic())
                && matches!(
                    interval.to_ascii_lowercase().as_str(),
                    "month" | "monthly" | "year" | "yearly" | "annual"
                ) =>
        {
            crate::admin::plan_price(cents, currency, interval)
        }
        _ => "Price unavailable".into(),
    }
}

fn billing_date(value: &str) -> Option<String> {
    let date = value.get(..10)?;
    if !date.bytes().enumerate().all(|(i, b)| {
        if i == 4 || i == 7 {
            b == b'-'
        } else {
            b.is_ascii_digit()
        }
    }) || !valid_billing_time(value.get(10..)?)
    {
        return None;
    }
    let formatted = display_date(value, false);
    if formatted.is_empty() {
        return None;
    }
    let year = value.get(..4)?.parse::<u32>().ok()?;
    let month = value.get(5..7)?.parse::<usize>().ok()?;
    let day = value.get(8..10)?.parse::<u8>().ok()?;
    let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    let days = [
        31,
        if leap { 29 } else { 28 },
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
    ];
    (year > 0 && day <= days[month - 1]).then_some(formatted)
}

fn valid_billing_time(suffix: &str) -> bool {
    if suffix.is_empty() {
        return true;
    }
    let bytes = suffix.as_bytes();
    if bytes.len() < 10 || !matches!(bytes[0], b'T' | b't') || bytes[3] != b':' || bytes[6] != b':'
    {
        return false;
    }
    let number = |start: usize, end: usize, maximum: u8| {
        suffix
            .get(start..end)
            .filter(|v| v.bytes().all(|b| b.is_ascii_digit()))
            .and_then(|v| v.parse::<u8>().ok())
            .is_some_and(|v| v <= maximum)
    };
    if !number(1, 3, 23) || !number(4, 6, 59) || !number(7, 9, 59) {
        return false;
    }
    let mut zone = &suffix[9..];
    if let Some(fraction) = zone.strip_prefix('.') {
        let digits = fraction.bytes().take_while(u8::is_ascii_digit).count();
        if digits == 0 {
            return false;
        }
        zone = &fraction[digits..];
    }
    if matches!(zone, "Z" | "z") {
        return true;
    }
    let bytes = zone.as_bytes();
    if bytes.len() != 6 || !matches!(bytes[0], b'+' | b'-') || bytes[3] != b':' {
        return false;
    }
    let part = |start, end, max| {
        zone.get(start..end)
            .filter(|v| v.bytes().all(|b| b.is_ascii_digit()))
            .and_then(|v| v.parse::<u8>().ok())
            .is_some_and(|v| v <= max)
    };
    part(1, 3, 23) && part(4, 6, 59)
}

/// The QR matrix is encoded locally and rendered as inert SVG rectangles. Neither
/// the provisioning URL nor the shared secret is sent to an image service.
pub(crate) fn mfa_qr(value: &str) -> Result<String, Error> {
    let url = reqwest::Url::parse(value).map_err(|_| Error::Invalid)?;
    if value.len() > 2048
        || url.scheme() != "otpauth"
        || url.host_str() != Some("totp")
        || !url.username().is_empty()
        || url.password().is_some()
        || !url
            .query_pairs()
            .any(|(k, v)| k == "secret" && !v.is_empty())
    {
        return Err(Error::Invalid);
    }
    let qr = qrcode::QrCode::with_error_correction_level(value.as_bytes(), qrcode::EcLevel::M)
        .map_err(|_| Error::Invalid)?;
    let width = qr.width();
    let mut svg = format!("<svg role=\"img\" aria-label=\"Authenticator setup QR code\" width=\"256\" height=\"256\" viewBox=\"0 0 {} {}\" shape-rendering=\"crispEdges\"><rect width=\"100%\" height=\"100%\" fill=\"white\"/><g fill=\"black\">",width+8,width+8);
    for y in 0..width {
        for x in 0..width {
            if qr[(x, y)] == qrcode::Color::Dark {
                svg.push_str(&format!(
                    "<rect x=\"{}\" y=\"{}\" width=\"1\" height=\"1\"/>",
                    x + 4,
                    y + 4
                ));
            }
        }
    }
    svg.push_str("</g></svg>");
    Ok(svg)
}

/// Display the calendar component carried by the broker, matching the Go view.
pub(crate) fn display_date(value: &str, with_time: bool) -> String {
    let bytes = value.as_bytes();
    if bytes.len() < 10
        || bytes[4] != b'-'
        || bytes[7] != b'-'
        || !bytes[..4].iter().all(u8::is_ascii_digit)
    {
        return String::new();
    }
    let Some(month) = value
        .get(5..7)
        .and_then(|v| v.parse::<usize>().ok())
        .filter(|m| (1..=12).contains(m))
    else {
        return String::new();
    };
    let Some(day) = value
        .get(8..10)
        .and_then(|v| v.parse::<u8>().ok())
        .filter(|d| (1..=31).contains(d))
    else {
        return String::new();
    };
    let months = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    let mut date = format!("{} {day}, {}", months[month - 1], &value[..4]);
    if with_time {
        if let Some(time) = value.get(11..16).filter(|t| {
            t.as_bytes()[2] == b':' && t.bytes().filter(|b| *b != b':').all(|b| b.is_ascii_digit())
        }) {
            date.push(' ');
            date.push_str(time);
        }
    }
    date
}

pub(crate) fn settings(project_id: &str, project_name: &str, organization: &str) -> String {
    let mut body = format!("<p class=\"mb-6 text-sm text-ink-300\">Manage your project, organization, account, and billing.</p><div class=\"grid grid-cols-1 gap-4 sm:grid-cols-2\"><section class=\"rounded-panel border border-line bg-panel p-5\"><h3 class=\"text-sm font-semibold\">Project</h3><p class=\"mt-4 text-sm\">Name: {}</p><p class=\"mt-3 text-sm\">Project ID: <code>{}</code></p><p class=\"mt-4 text-xs text-ink-300\">API keys for this project are managed via the API.</p></section>",escape(project_name),escape(project_id));
    for (path, title, description) in [
        (
            "organization",
            "Organization",
            "Rename your organization and manage team members.",
        ),
        (
            "account",
            "Account",
            "Password, multi-factor authentication, and account sessions.",
        ),
        (
            "billing",
            "Billing",
            "Plans, subscription, and usage credits.",
        ),
        (
            "usage",
            "Usage",
            "Tool calls, synced records, and webhook events this month.",
        ),
        (
            "white-labeling",
            "White Labeling",
            "Customize your branding on the OAuth consent screen.",
        ),
    ] {
        let href = if path == "usage" {
            "/app/usage".to_owned()
        } else {
            format!("/app/settings/{path}")
        };
        body.push_str(&format!("<a href=\"{href}\" class=\"rounded-panel border border-line bg-panel p-5 transition hover:border-iris-400\"><h3 class=\"text-sm font-semibold\">{title} →</h3><p class=\"mt-2 text-sm text-ink-300\">{description}</p>{}</a>",if path=="organization" {format!("<p class=\"mt-3 text-xs text-ink-300\">{}</p>",escape(organization))} else {String::new()}));
    }
    for (href, label, description) in [
        (
            "/app/settings/team",
            "Team",
            "Manage team members and invitations.",
        ),
        ("/app/support", "Help", "Find support for your project."),
    ] {
        body.push_str(&format!("<a class=\"shell-settings-link\" href=\"{href}\"><h3>{label}</h3><p>{description}</p></a>"));
    }
    body.push_str("</div>");
    body
}
#[cfg(test)]
mod tests;
#[cfg(test)]
mod qr_tests {
    #[test]
    fn mfa_qr_is_local_and_rejects_non_totp_urls() {
        let qr =
            super::mfa_qr("otpauth://totp/Appcall:test?secret=JBSWY3DPEHPK3PXP&issuer=Appcall")
                .unwrap();
        assert!(qr.starts_with("<svg"));
        assert!(qr.contains("shape-rendering=\"crispEdges\""));
        assert!(!qr.contains("JBSWY"));
        assert!(!qr.contains("http://"));
        assert!(super::mfa_qr("javascript:alert(1)").is_err());
        assert!(super::mfa_qr("otpauth://hotp/a?secret=X").is_err());
    }
}
