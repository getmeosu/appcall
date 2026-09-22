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
        ("GET", "/app/logs") => "/app/calls",
        ("GET", "/app/runs") => "/app/syncs",
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
        ("GET", ["", "app", "logs", key]) if id(key) => Some(format!("/app/calls/{key}")),
        ("POST", ["", "app", "logs", key, "replay"]) if id(key) => {
            Some(format!("/app/calls/{key}/replay"))
        }
        ("GET", ["", "app", "runs", key]) if id(key) => Some(format!("/app/syncs/{key}")),
        ("POST", ["", "app", "runs", key, suffix @ ("run-now" | "reset" | "cancel")])
            if id(key) =>
        {
            Some(format!("/app/syncs/{key}/{suffix}"))
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn logs_and_runs_rename_to_calls_and_syncs() {
        assert_eq!(
            canonical_browser_path("GET", "/app/logs"),
            Some("/app/calls".into())
        );
        assert_eq!(
            canonical_browser_path("GET", "/app/logs/req_1"),
            Some("/app/calls/req_1".into())
        );
        assert_eq!(
            canonical_browser_path("POST", "/app/logs/req_1/replay"),
            Some("/app/calls/req_1/replay".into())
        );
        assert_eq!(
            canonical_browser_path("GET", "/app/runs"),
            Some("/app/syncs".into())
        );
        assert_eq!(
            canonical_browser_path("GET", "/app/runs/run_1"),
            Some("/app/syncs/run_1".into())
        );
        assert_eq!(
            canonical_browser_path("POST", "/app/runs/run_1/reset"),
            Some("/app/syncs/run_1/reset".into())
        );
        assert_eq!(
            legacy_browser_location("GET", "/app/logs?status=failed"),
            Some("/app/calls?status=failed".into())
        );
        assert!(canonical_browser_path("GET", "/app/calls").is_none());
        assert!(canonical_browser_path("GET", "/app/syncs").is_none());
        assert!(canonical_browser_path("GET", "/app/workflows/runs").is_none());
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
