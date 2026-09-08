//! Signal presentation for the remaining read surfaces. URLs remain native routes.
use crate::{http::escape, ui, Error};
use serde_json::Value;

pub(crate) fn heading(title: &str, description: &str) -> String {
    format!(
        "<header class=\"remaining-heading\"><h2>{}</h2><p>{}</p></header>",
        escape(title),
        escape(description)
    )
}

pub(crate) fn panel(content: &str) -> String {
    format!("<section class=\"remaining-panel\">{content}</section>")
}

pub(crate) fn event_row(event: &Value) -> Result<String, Error> {
    let id = event
        .get("id")
        .and_then(Value::as_str)
        .ok_or(Error::Invalid)?;
    if id.is_empty() || id.len() > 1024 || id.chars().any(char::is_control) {
        return Err(Error::Invalid);
    }
    let replay = if crate::admin::identifier(id) {
        crate::pages::event_replay(id)?
    } else {
        ui::state(ui::Tone::Idle, "Replay unavailable")
    };
    let text = |key| escape(event.get(key).and_then(Value::as_str).unwrap_or(""));
    Ok(format!(
        "<tr><td>{}</td><td>{}</td><td><code>{}</code></td><td>{}</td><td class=\"remaining-table-actions\">{}</td></tr>",
        text("connector"),
        text("operation"),
        text("connectionId"),
        text("createdAt"),
        replay
    ))
}

pub(crate) fn events(value: &Value) -> Result<String, Error> {
    let rows = value
        .as_array()
        .or_else(|| {
            ["events", "items", "rows"]
                .iter()
                .find_map(|key| value.get(*key).and_then(Value::as_array))
        })
        .ok_or(Error::Unavailable)?;
    let mut body = heading("Events", "Receive and replay provider webhook events.");
    body.push_str("<div class=\"remaining-table-scroll\" role=\"region\" aria-label=\"Webhook events\" tabindex=\"0\"><table class=\"remaining-table remaining-events-table\" data-init=\"@get('/app/events/stream')\"><caption class=\"sr-only\">Webhook events</caption><thead><tr><th scope=\"col\">Connector</th><th scope=\"col\">Tool</th><th scope=\"col\">Connection</th><th scope=\"col\">Received</th><th scope=\"col\">Actions</th></tr></thead><tbody id=\"trigger-rows\" aria-live=\"polite\">");
    for row in rows {
        body.push_str(&event_row(row)?);
    }
    if rows.is_empty() {
        body.push_str(&format!(
            "<tr id=\"trigger-empty-state\"><td colspan=\"5\">{}</td></tr>",
            ui::EmptyState {
                title: "No webhook events to show.",
                body: "Browse connectors to inspect their declared events.",
                action_label: "Browse connectors",
                action_href: ui::LocalPath::new("/app/connectors").unwrap()
            }
            .render()
        ));
    }
    body.push_str("</tbody></table></div>");
    Ok(body)
}

pub(crate) fn usage(value: &Value) -> Result<String, Error> {
    let mut body = heading(
        "Usage",
        value.get("month").and_then(Value::as_str).unwrap_or(""),
    );
    body.push_str("<dl class=\"remaining-grid\">");
    for (label, key) in [
        ("Tool calls", "toolCalls"),
        ("Synced records", "syncedRecords"),
        ("Webhook events", "webhookEvents"),
    ] {
        let count = value
            .get(key)
            .filter(|v| v.is_number())
            .ok_or(Error::Unavailable)?;
        body.push_str(&format!("<div class=\"remaining-panel\"><dt>{label}</dt><dd class=\"remaining-metric\">{}</dd></div>",escape(&count.to_string())));
    }
    body.push_str("</dl>");
    Ok(body)
}

pub(crate) fn account_security(value: Result<Value, Error>) -> String {
    let unavailable = || {
        crate::admin_ui::banner(
            "Could not load account security. Refresh this page to try again.",
            false,
        )
    };
    let Ok(value) = value else {
        return unavailable();
    };
    let Some(user) = value.get("user").filter(|user| user.is_object()) else {
        return unavailable();
    };
    let text = |key| escape(user.get(key).and_then(Value::as_str).unwrap_or(""));
    let mfa = if user.get("totpEnabled").and_then(Value::as_bool) == Some(true) {
        crate::admin::form(
            "/app/settings/account/mfa/disable",
            &[("code", "Disable MFA with verification code", "text", "")],
        )
    } else {
        crate::admin::form("/app/settings/account/mfa/setup", &[])
    };
    format!(
                    "<p class=\"text-lg font-semibold\">{}</p><p class=\"text-sm text-ink-300\">{}</p><h3 class=\"mt-6 text-base font-semibold\">Two-factor authentication</h3><p>{}</p>{mfa}<h3 class=\"mt-6 text-base font-semibold\">Change password</h3>{}",
                    text( "displayName"), text( "email"),if user["totpEnabled"].as_bool()==Some(true) {"MFA is enabled."} else {"Add an extra layer of security to your account."},
                    crate::admin::form(
                        "/app/settings/account/change-password",
                        &[
                            ("currentPassword", "Current password", "password", ""),
                            ("newPassword", "New password", "password", "")
                        ]
                    )
                )
}

pub(crate) fn sessions(value: Result<Value, Error>) -> String {
    let mut body=String::from("<section id=\"account-sessions\" class=\"remaining-section\" aria-labelledby=\"account-sessions-heading\"><h3 id=\"account-sessions-heading\">Sessions</h3>");
    match value.and_then(|v| sessions_table(&v)) {
        Ok(table) => body.push_str(&table),
        Err(_) => body.push_str(&crate::admin_ui::banner(
            "Could not load sessions. Refresh this page to try again.",
            false,
        )),
    }
    body.push_str("</section>");
    body
}

fn sessions_table(value: &Value) -> Result<String, Error> {
    let rows = value
        .get("sessions")
        .and_then(Value::as_array)
        .ok_or(Error::Unavailable)?;
    if rows.is_empty() {
        return Ok(crate::admin::session_empty_state(true).into());
    }
    let mut body=String::from("<div class=\"remaining-table-scroll\" role=\"region\" aria-label=\"Account sessions\" tabindex=\"0\"><table class=\"remaining-table remaining-sessions-table\"><caption class=\"sr-only\">Account sessions</caption><thead><tr><th scope=\"col\">Device</th><th scope=\"col\">IP address</th><th scope=\"col\">Created</th><th scope=\"col\">Expires</th><th scope=\"col\">Manage</th></tr></thead><tbody>");
    for row in rows {
        let id = row
            .get("id")
            .and_then(Value::as_str)
            .filter(|v| crate::admin::identifier(v))
            .ok_or(Error::Unavailable)?;
        let text = |key| escape(row.get(key).and_then(Value::as_str).unwrap_or(""));
        let manage = if row["current"].as_bool() == Some(true) {
            ui::state(ui::Tone::Ok, "Current session")
        } else {
            crate::admin::form(&format!("/app/settings/account/sessions/{id}/revoke"), &[])
        };
        body.push_str(&format!(
            "<tr><td>{}</td><td>{}</td><td>{}</td><td>{}</td><td>{manage}</td></tr>",
            text("userAgent"),
            text("ipAddress"),
            crate::admin_ui::display_date(row["createdAt"].as_str().unwrap_or(""), true),
            crate::admin_ui::display_date(row["expiresAt"].as_str().unwrap_or(""), true)
        ));
    }
    body.push_str("</tbody></table></div>");
    Ok(body)
}
