//! Connections presentation. Provider identity and health causes are not
//! persisted yet, so this page names those absences instead of guessing.
use crate::{http::escape, ui, Error};
use serde_json::Value;

fn text<'a>(value: &'a Value, key: &str) -> &'a str {
    value.get(key).and_then(Value::as_str).unwrap_or("")
}

fn rows(value: &Value) -> Result<&[Value], Error> {
    value
        .as_array()
        .map(Vec::as_slice)
        .or_else(|| {
            ["connections", "rows", "items"]
                .iter()
                .find_map(|key| value.get(*key).and_then(Value::as_array))
                .map(Vec::as_slice)
        })
        .ok_or(Error::Unavailable)
}

fn valid_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 256
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
}

fn status_label(status: &str) -> &'static str {
    match status {
        "authorizing" => "Authorizing",
        "active" => "Active",
        "degraded" => "Degraded",
        "disconnected" => "Disconnected",
        _ => "Not recorded",
    }
}

fn status_note(status: &str) -> &'static str {
    match status {
        "authorizing" => "Authorization is in progress.",
        "active" => "Ready for provider-backed calls.",
        "degraded" => "Provider access needs recovery.",
        "disconnected" => "Reconnect before running tools.",
        _ => "The connection status is not recorded.",
    }
}

fn status_state(status: &str) -> String {
    let tone = match status {
        "authorizing" => ui::Tone::Running,
        "active" => ui::Tone::Ok,
        "degraded" => ui::Tone::Warn,
        "disconnected" => ui::Tone::Dead,
        _ => ui::Tone::Idle,
    };
    ui::state(tone, status_label(status))
}

fn auth_label(auth_type: &str) -> &'static str {
    match auth_type {
        "oauth2" => "OAuth 2.0",
        "api_key" => "API key",
        "external_bearer" => "External bearer",
        _ => "Not recorded",
    }
}

fn test_state(value: &Value) -> String {
    let status = if text(value, "lastTest").is_empty() {
        text(value, "lastTestStatus")
    } else {
        text(value, "lastTest")
    };
    match status {
        "passed" => ui::state(ui::Tone::Ok, "Passed"),
        "failed" => ui::state(ui::Tone::Dead, "Failed"),
        _ => ui::state(ui::Tone::Idle, "Not recorded"),
    }
}

fn creation_age(value: &Value) -> String {
    let Some(seconds) = value.get("createdAgeSeconds").and_then(Value::as_i64) else {
        return "Not recorded".into();
    };
    let seconds = seconds.max(0) as u64;
    if seconds < 60 {
        "Less than a minute".into()
    } else if seconds < 60 * 60 {
        format!(
            "{} minute{}",
            seconds / 60,
            if seconds / 60 == 1 { "" } else { "s" }
        )
    } else if seconds < 24 * 60 * 60 {
        format!(
            "{} hour{}",
            seconds / (60 * 60),
            if seconds / (60 * 60) == 1 { "" } else { "s" }
        )
    } else {
        format!(
            "{} day{}",
            seconds / (24 * 60 * 60),
            if seconds / (24 * 60 * 60) == 1 {
                ""
            } else {
                "s"
            }
        )
    }
}

fn authorization_age(value: &Value) -> Option<String> {
    (text(value, "status") == "authorizing")
        .then(|| value.get("authorizationAgeSeconds").and_then(Value::as_i64))
        .flatten()
        .map(|seconds| {
            let seconds = seconds.max(0) as u64;
            if seconds < 60 {
                "less than a minute".into()
            } else if seconds < 60 * 60 {
                format!(
                    "{} minute{}",
                    seconds / 60,
                    if seconds / 60 == 1 { "" } else { "s" }
                )
            } else {
                format!(
                    "{} hour{}",
                    seconds / (60 * 60),
                    if seconds / (60 * 60) == 1 { "" } else { "s" }
                )
            }
        })
}

fn reconnect_href(connector: &str, id: &str) -> Option<String> {
    (valid_id(connector) && valid_id(id))
        .then(|| format!("/app/connectors/{connector}?tab=settings&connectionId={id}#tk-setup"))
}

fn check_form(id: &str) -> String {
    let button = ui::Button {
        size: ui::ButtonSize::Sm,
        variant: ui::ButtonVariant::Secondary,
        working_label: Some("Checking…"),
        target: ui::ButtonTarget::Button {
            kind: ui::ButtonType::Submit,
            form: None,
            action: None,
        },
        ..ui::Button::new("Check connection")
    }
    .render();
    format!(
        "<form class=\"connection-action\" method=\"post\" action=\"/app/connections/{id}/test\">{button}</form>"
    )
}

fn reconnect_link(connector: &str, id: &str) -> String {
    let Some(href) = reconnect_href(connector, id) else {
        return String::new();
    };
    ui::Button {
        size: ui::ButtonSize::Sm,
        variant: ui::ButtonVariant::Secondary,
        target: ui::ButtonTarget::Link(ui::LocalPath::new(&href).expect("validated local route")),
        ..ui::Button::new("Reconnect")
    }
    .render()
}

fn disconnect_button(connector: &str, id: &str) -> Result<String, Error> {
    let document_id = ui::document_id()?;
    let action = format!("/app/connections/{id}/disconnect");
    let connector_name = if connector.is_empty() {
        "Connector not recorded"
    } else {
        connector
    };
    let heading = format!("Disconnect {connector_name} connection {id}?");
    let body =
        format!("Tool runs for {connector_name} connection {id} will stop until you reconnect it.");
    Ok(ui::ConfirmButton {
        id: &document_id,
        trigger: "Disconnect",
        heading: &heading,
        body: &body,
        confirm: "Disconnect",
        action: ui::LocalPath::new(&action).expect("validated local route"),
        form: None,
    }
    .render())
}

fn actions(status: &str, connector: &str, id: &str) -> Result<String, Error> {
    let mut html =
        String::from("<div class=\"connection-actions\" aria-label=\"Connection actions\">");
    if matches!(status, "active" | "degraded" | "authorizing") {
        html.push_str(&check_form(id));
    }
    html.push_str(&reconnect_link(connector, id));
    if status != "disconnected" {
        html.push_str(&disconnect_button(connector, id)?);
    }
    html.push_str("</div>");
    Ok(html)
}

fn connection_row(value: &Value) -> Result<String, Error> {
    let id = text(value, "id");
    if !valid_id(id) {
        return Err(Error::Unavailable);
    }
    let connector = text(value, "connector");
    let status = text(value, "status");
    let connector_name = if connector.is_empty() {
        "Connector not recorded"
    } else {
        connector
    };
    let identity = "Provider identity not recorded";
    let authorization_elapsed = authorization_age(value)
        .map(|age| {
            format!("<p class=\"connection-elapsed\"><span>Authorization elapsed</span> {age}</p>")
        })
        .unwrap_or_default();
    Ok(format!(
        "<tr class=\"connection-row\" data-connection-id=\"{}\" data-connection-status=\"{}\"><th scope=\"row\" data-label=\"Account\"><div class=\"connection-account\"><strong>{}</strong><code>{}</code><span class=\"connection-identity\">{}</span></div></th><td data-label=\"Auth\">{}</td><td data-label=\"Status\"><div class=\"connection-status\">{}</div><p class=\"connection-note\">{}</p>{}</td><td data-label=\"Last provider check\"><div class=\"connection-check\">{}</div><p class=\"connection-cause\"><span>Cause</span> Not recorded</p><p class=\"connection-age\"><span>Created</span> {}</p></td><td data-label=\"Actions\">{}</td></tr>",
        escape(id),
        escape(status),
        escape(connector_name),
        escape(id),
        escape(identity),
        escape(auth_label(text(value, "authType"))),
        status_state(status),
        escape(status_note(status)),
        authorization_elapsed,
        test_state(value),
        escape(&creation_age(value)),
        actions(status, connector, id)?
    ))
}

pub(crate) fn render(value: &Value) -> Result<String, Error> {
    let items = rows(value)?;
    let browse = ui::Button {
        variant: if items.is_empty() {
            ui::ButtonVariant::Secondary
        } else {
            ui::ButtonVariant::Primary
        },
        target: ui::ButtonTarget::Link(
            ui::LocalPath::new("/app/connectors").expect("static local route"),
        ),
        ..ui::Button::new("Browse connectors")
    }
    .render();
    let mut html = format!(
        "<section id=\"connections-page\" aria-labelledby=\"connections-heading\"><header class=\"connections-header\"><div><h2 id=\"connections-heading\">Connections</h2><p>Connections authorize accounts for use with connectors.</p><p>Review status, verification, and recovery actions below.</p></div>{browse}</header><div id=\"connections-result\" class=\"connections-result\" role=\"status\" aria-live=\"polite\" aria-atomic=\"true\" data-result-state=\"idle\"></div>"
    );
    if items.is_empty() {
        html.push_str(
            &ui::EmptyState {
                title: "No connections to show.",
                body: "Browse connectors to configure a connection.",
                action_label: "Browse connectors",
                action_href: ui::LocalPath::new("/app/connectors")
                    .expect("static local empty-state link"),
            }
            .render(),
        );
    } else {
        html.push_str("<section class=\"connections-table-shell\" aria-labelledby=\"connections-list-heading\"><h3 id=\"connections-list-heading\" class=\"sr-only\">Saved connections</h3><table class=\"connections-table\"><caption class=\"sr-only\">Saved connections</caption><thead><tr><th scope=\"col\">Account</th><th scope=\"col\">Auth</th><th scope=\"col\">Status</th><th scope=\"col\">Last provider check</th><th scope=\"col\">Actions</th></tr></thead><tbody>");
        for item in items {
            html.push_str(&connection_row(item)?);
        }
        html.push_str("</tbody></table></section>");
    }
    html.push_str("</section>");
    Ok(html)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn connection_status_is_rule_and_word_with_truthful_missing_fields() {
        let html = render(&json!({
            "connections": [{
                "id": "conn_1",
                "connector": "slack",
                "authType": "oauth2",
                "status": "degraded",
                "lastTest": "passed",
                "identityStatus": "not_recorded",
                "createdAgeSeconds": 3661
            }]
        }))
        .unwrap();
        assert!(html.contains("ui-state-rule"));
        assert!(html.contains("Degraded"));
        assert!(html.contains("Provider identity not recorded"));
        assert!(html.contains("<span>Cause</span> Not recorded"));
        assert!(html.contains("1 hour"));
        assert!(
            html.contains("/app/connectors/slack?tab=settings&amp;connectionId=conn_1#tk-setup")
        );
        assert!(!html.contains("external_account_id"));
    }

    #[test]
    fn authorizing_elapsed_uses_only_the_current_authorization_projection() {
        let html = render(&json!({
            "connections": [{
                "id": "conn_1",
                "connector": "slack",
                "authType": "oauth2",
                "status": "authorizing",
                "createdAgeSeconds": 86400,
                "authorizationAgeSeconds": 42
            }]
        }))
        .unwrap();
        assert!(html.contains("Authorization elapsed</span> less than a minute"));
        assert!(html.contains("<span>Created</span> 1 day"));
    }

    #[test]
    fn disconnected_connections_offer_reconnect_without_a_check_or_disconnect() {
        let html = render(&json!({
            "connections": [{
                "id": "conn_1",
                "connector": "slack",
                "status": "disconnected"
            }]
        }))
        .unwrap();
        assert!(html.contains("Reconnect"));
        assert!(!html.contains("Check connection"));
        assert!(!html.contains("data-confirm-open"));
        assert!(!html.contains("/disconnect"));
    }

    #[test]
    fn disconnect_confirmation_names_escaped_target_and_consequence() {
        let html = render(&json!({
            "connections": [{
                "id": "conn_1",
                "connector": "slack&<team>\"primary",
                "status": "active"
            }]
        }))
        .unwrap();
        assert!(html.contains("Disconnect slack&amp;&lt;team&gt;&quot;primary connection conn_1?"));
        assert!(html.contains(
            "Tool runs for slack&amp;&lt;team&gt;&quot;primary connection conn_1 will stop until you reconnect it."
        ));
        assert!(!html.contains("Disconnect slack&<team>\"primary connection conn_1?"));
    }

    #[test]
    fn malformed_connection_ids_fail_closed() {
        assert_eq!(
            render(&json!({"connections": [{"id": "bad/id"}]})),
            Err(Error::Unavailable)
        );
    }

    #[test]
    fn empty_connections_offer_one_primary_next_step() {
        let html = render(&json!({"connections": []})).unwrap();
        assert_eq!(html.matches("ui-button-primary").count(), 1);
    }
}
