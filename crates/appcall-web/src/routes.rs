//! One-release browser URL compatibility. This never rewrites external API vocabulary.
/// Resolve only exact legacy browser routes, before dispatch or redirect construction.
pub fn canonical_browser_path(method: &str, path: &str) -> Option<String> {
    let parts = path.split('/').collect::<Vec<_>>();
    let id = |value: &str| {
        !value.is_empty()
            && value.len() <= 256
            && value
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.'))
    };
    let direct = match (method, path) {
        ("GET", "/app/toolkits") => "/app/connectors",
        ("POST", "/app/toolkits/request") => "/app/connectors/request",
        ("GET", "/app/auth-configs") => "/app/connections",
        ("GET", "/app/triggers") => "/app/events",
        ("GET", "/app/triggers/stream") => "/app/events/stream",
        ("GET", "/app/settings/usage") => "/app/usage",
        ("GET", "/app/qa") => "/app/certification",
        ("GET", "/app/users") => "/app/settings/team",
        ("POST", "/app/users/invite") => "/app/settings/team/invite",
        ("GET", "/app/sessions") => "/app/settings/account",
        _ => "",
    };
    if !direct.is_empty() {
        return Some(direct.into());
    }
    match (method, parts.as_slice()) {
        ("GET", ["", "app", "toolkits", key]) if id(key) => Some(format!("/app/connectors/{key}")),
        (
            "GET",
            ["", "app", "toolkits", key, suffix @ ("test-form" | "options" | "runinput-fields")],
        )
        | ("POST", ["", "app", "toolkits", key, suffix @ ("setup" | "test")])
            if id(key) =>
        {
            Some(format!("/app/connectors/{key}/{suffix}"))
        }
        ("POST", ["", "app", "auth-configs", key, suffix @ ("test" | "disconnect")]) if id(key) => {
            Some(format!("/app/connections/{key}/{suffix}"))
        }
        ("POST", ["", "app", "triggers", key, "replay"]) if id(key) => {
            Some(format!("/app/events/{key}/replay"))
        }
        ("POST", ["", "app", "users", key, suffix @ ("role" | "remove")]) if id(key) => {
            Some(format!("/app/settings/team/{key}/{suffix}"))
        }
        ("POST", ["", "app", "sessions", key, "revoke"]) if id(key) => {
            Some(format!("/app/settings/account/sessions/{key}/revoke"))
        }
        _ => None,
    }
}

/// Hosts call this only after normal request validation. Raw query bytes remain intact.
pub fn legacy_browser_location(method: &str, target: &str) -> Option<String> {
    if method != "GET" || target.contains(['#', '\r', '\n']) {
        return None;
    }
    let (path, query) = target
        .split_once('?')
        .map_or((target, None), |(p, q)| (p, Some(q)));
    let mut location = canonical_browser_path(method, path)?;
    if let Some(query) = query {
        location.push('?');
        location.push_str(query);
    }
    if path == "/app/sessions" {
        location.push_str("#account-sessions");
    }
    Some(location)
}
