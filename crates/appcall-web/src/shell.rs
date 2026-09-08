use crate::{http::escape, Response, Session};
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn signal_navigation_and_accessibility() {
        let s = Session {
            user_id: "u".into(),
            tenant_id: "t".into(),
            tenant_name: "<Tenant>".into(),
            email: "<email>".into(),
            access_token: "a".into(),
            refresh_token: "r".into(),
        };
        let html = layout("<Title>", &s, "<p>Content</p>", "/app");
        for expected in [
            ">BUILD<",
            ">OBSERVE<",
            ">Overview<",
            ">Connectors<",
            ">Connections<",
            ">Events<",
            "id=\"main-content\"",
            "href=\"#main-content\"",
            "aria-label=\"Search pages\"",
            "role=\"combobox\"",
            "aria-controls=\"cmdk-list\"",
            "role=\"listbox\"",
            "role=\"option\"",
            "/static/app.css?v=",
            "&lt;Tenant&gt;",
        ] {
            assert!(html.contains(expected), "missing {expected}");
        }
        for forbidden in [
            "h-screen",
            "href=\"/app/runs\"",
            "href=\"/app/qa\"",
            "fonts.googleapis.com",
        ] {
            assert!(!html.contains(forbidden), "unexpected {forbidden}");
        }
    }
    #[test]
    fn active_routes_have_one_owner_and_segment_boundaries() {
        for (path, expected) in [
            ("/app", Some("/app")),
            ("/app/toolkits/slack", Some("/app/toolkits")),
            ("/app/toolkits-extra", None),
            ("/app/settings/usage?month=9", Some("/app/settings/usage")),
            ("/app/settings/account", Some("/app/settings")),
            ("/app/users/member", Some("/app/settings")),
            ("/app/sessions", Some("/app/settings")),
            ("/app/support", Some("/app/settings")),
            ("/app/runs", None),
        ] {
            assert_eq!(active_destination(path), expected, "{path}");
            let s = Session {
                user_id: String::new(),
                tenant_id: String::new(),
                tenant_name: String::new(),
                email: String::new(),
                access_token: String::new(),
                refresh_token: String::new(),
            };
            let html = layout("Title", &s, "", path);
            assert_eq!(
                html.matches("aria-current=\"page\"").count(),
                usize::from(expected.is_some())
            );
        }
    }
    #[test]
    fn fingerprints_are_content_derived() {
        assert_eq!(
            asset_url("/static/test.js", b"abc"),
            "/static/test.js?v=ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        assert_ne!(
            asset_url("/static/test.js", b"old"),
            asset_url("/static/test.js", b"new")
        );
    }
    #[test]
    fn shell_geometry_and_hidden_results_are_explicit() {
        let css = include_str!("../static/dashboard.css");
        for expected in [
            "grid-template-columns: 236px",
            "min-height: 48px",
            "padding: 24px",
            "max-width: 1279px",
            "[hidden]",
            "::backdrop",
            ".shell-skip",
        ] {
            assert!(css.contains(expected), "missing {expected}");
        }
    }
}
#[derive(Clone, Copy, PartialEq)]
enum Group {
    Build,
    Observe,
    Footer,
}
struct Destination {
    href: &'static str,
    label: &'static str,
    glyph: &'static str,
    group: Group,
}
const NAV: &[Destination] = &[
    Destination {
        href: "/app",
        label: "Overview",
        glyph: "◫",
        group: Group::Build,
    },
    Destination {
        href: "/app/toolkits",
        label: "Connectors",
        glyph: "◇",
        group: Group::Build,
    },
    Destination {
        href: "/app/auth-configs",
        label: "Connections",
        glyph: "⇄",
        group: Group::Build,
    },
    Destination {
        href: "/app/logs",
        label: "Logs",
        glyph: "≡",
        group: Group::Observe,
    },
    Destination {
        href: "/app/triggers",
        label: "Events",
        glyph: "↯",
        group: Group::Observe,
    },
    Destination {
        href: "/app/settings/usage",
        label: "Usage",
        glyph: "▥",
        group: Group::Observe,
    },
    Destination {
        href: "/app/docs",
        label: "Docs",
        glyph: "▤",
        group: Group::Footer,
    },
    Destination {
        href: "/app/settings",
        label: "Settings",
        glyph: "⚙",
        group: Group::Footer,
    },
];
fn active_destination(path: &str) -> Option<&'static str> {
    let path = path.split(['?', '#']).next().unwrap_or(path);
    if ["/app/users", "/app/sessions", "/app/support"]
        .iter()
        .any(|prefix| owns_path(prefix, path))
    {
        return Some("/app/settings");
    }
    NAV.iter()
        .filter(|item| owns_path(item.href, path))
        .max_by_key(|item| item.href.len())
        .map(|item| item.href)
}
fn owns_path(prefix: &str, path: &str) -> bool {
    path == prefix
        || (prefix != "/app"
            && path
                .strip_prefix(prefix)
                .is_some_and(|rest| rest.starts_with('/')))
}
fn asset_url(path: &str, contents: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let hash = Sha256::digest(contents)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    format!("{path}?v={hash}")
}
fn shell_button(label: &str, action: crate::ui::ShellAction) -> String {
    let mut button = crate::ui::Button::new(label);
    button.variant = crate::ui::ButtonVariant::Quiet;
    button.shell_action = Some(action);
    button.render()
}
pub(crate) fn layout(title: &str, s: &Session, content: &str, path: &str) -> String {
    use crate::ui::{Control, Field, InputType, ShellAction};
    let owner = active_destination(path);
    let mut nav = String::new();
    for (group, name) in [
        (Group::Build, "BUILD"),
        (Group::Observe, "OBSERVE"),
        (Group::Footer, "RESOURCES"),
    ] {
        if group == Group::Footer {
            nav.push_str("<div class=\"shell-nav-footer\">");
        } else {
            nav.push_str(&format!(
                "<div class=\"shell-nav-group\"><p class=\"shell-group-label\">{name}</p>"
            ));
        }
        for item in NAV.iter().filter(|item| item.group == group) {
            let current = if owner == Some(item.href) {
                " aria-current=\"page\""
            } else {
                ""
            };
            nav.push_str(&format!("<a href=\"{}\" title=\"{}\" aria-label=\"{}\"{current}><span class=\"shell-nav-glyph\" aria-hidden=\"true\">{}</span><span class=\"shell-nav-label\">{}</span></a>", item.href, item.label, item.label, item.glyph, item.label));
        }
        nav.push_str("</div>");
    }
    let commands = NAV
        .iter()
        .enumerate()
        .map(|(index, item)| {
            format!(
                "<a id=\"cmdk-option-{index}\" href=\"{}\" role=\"option\" aria-selected=\"false\" tabindex=\"-1\" data-cmd=\"{}\">{}</a>",
                item.href, item.label, item.label
            )
        })
        .collect::<String>();
    let mut field = Field::new(
        "cmdk-input",
        "search",
        "Search pages",
        Control::Input(InputType::Search),
    );
    field.placeholder = "Search pages…";
    field.autocomplete = Some("off");
    field.aria_label = Some("Search pages");
    let search_field = field.render().replacen(
        "<input class=\"ui-control\"",
        "<input role=\"combobox\" aria-haspopup=\"listbox\" aria-autocomplete=\"list\" aria-expanded=\"false\" aria-controls=\"cmdk-list\" class=\"ui-control\"",
        1,
    );
    let menu = shell_button("Menu", ShellAction::Navigation);
    let close_nav = shell_button("Close navigation", ShellAction::CloseNavigation);
    let search = shell_button("Search · ⌘K", ShellAction::Search);
    let close_search = shell_button("Close search", ShellAction::CloseSearch);
    let app_css = asset_url("/static/app.css", include_bytes!("../static/app.css"));
    let dashboard_css = asset_url(
        "/static/dashboard.css",
        include_bytes!("../static/dashboard.css"),
    );
    let dashboard_js = asset_url(
        "/static/dashboard.js",
        include_bytes!("../static/dashboard.js"),
    );
    let palette_js = asset_url("/static/palette.js", include_bytes!("../static/palette.js"));
    let logs_js = asset_url("/static/logs.js", include_bytes!("../static/logs.js"));
    format!(
        r##"<!DOCTYPE html><html lang="en" class="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{title} · appcall</title><link rel="icon" type="image/svg+xml" href="/static/favicon.svg"><link rel="preload" href="/static/fonts/archivo-latin-variable.woff2" as="font" type="font/woff2" crossorigin><link rel="preload" href="/static/fonts/ibm-plex-mono-variable.woff2" as="font" type="font/woff2" crossorigin><link rel="stylesheet" href="{app_css}"><link rel="stylesheet" href="{dashboard_css}"><script src="{dashboard_js}" defer></script><script src="{logs_js}" defer></script><script type="module" src="/static/datastar.js"></script><script src="{palette_js}" defer></script></head><body data-dashboard><a class="shell-skip" href="#main-content">Skip to content</a><div class="shell"><aside id="dashboard-sidebar" aria-label="Workspace navigation"><div class="shell-brand"><span class="shell-mark" aria-hidden="true">a</span><span class="shell-brand-name">appcall</span>{close_nav}</div><div class="shell-project"><span class="shell-group-label">Project</span><span title="{tenant}">{tenant}</span></div><nav aria-label="Main navigation">{nav}</nav><div class="shell-account"><span title="{email}">{email}</span><a href="/app/logout" aria-label="Sign out">Sign out</a></div></aside><div id="shell-workspace"><header class="shell-topbar">{menu}<span class="shell-breadcrumb">{title}</span>{search}</header><main id="main-content" tabindex="-1">{content}</main></div></div><dialog id="nav-drawer" aria-label="Workspace navigation"></dialog><dialog id="cmdk" aria-label="Search pages"><div class="shell-search-heading">{search_field}{close_search}</div><div id="cmdk-list" role="listbox" aria-label="Pages" aria-live="polite" aria-atomic="true">{commands}</div><p id="cmdk-status" role="status" aria-live="polite" aria-atomic="true"></p><p class="shell-search-help">↑ ↓ to choose · Enter to open · Esc to close</p></dialog></body></html>"##,
        title = escape(title),
        tenant = escape(&s.tenant_name),
        email = escape(&s.email)
    )
}
/// Serves the exact embedded asset allowlist; fonts use `Response::binary_body`.
/// Non-GET requests return 405, and unknown GET paths return 404.
pub(crate) fn asset(path: &str, method: &str) -> Response {
    if method != "GET" {
        return Response::new(405, "Method not allowed".into());
    }
    let font: Option<&'static [u8]> = match path {
        "/static/fonts/archivo-latin-variable.woff2" => Some(include_bytes!(
            "../static/fonts/archivo-latin-variable.woff2"
        )),
        "/static/fonts/ibm-plex-mono-variable.woff2" => Some(include_bytes!(
            "../static/fonts/ibm-plex-mono-variable.woff2"
        )),
        _ => None,
    };
    let (mime, body) = match path {
        "/static/dashboard.css" => ("text/css", include_str!("../static/dashboard.css")),
        "/static/dashboard.js" => ("text/javascript", include_str!("../static/dashboard.js")),
        "/static/logs.js" => ("text/javascript", include_str!("../static/logs.js")),
        "/static/app.css" => ("text/css", include_str!("../static/app.css")),
        "/static/datastar.js" => ("text/javascript", include_str!("../static/datastar.js")),
        "/static/palette.js" => ("text/javascript", include_str!("../static/palette.js")),
        "/static/oauth-callback.js" => (
            "text/javascript",
            include_str!("../static/oauth-callback.js"),
        ),
        "/static/favicon.svg" => ("image/svg+xml", include_str!("../static/favicon.svg")),
        _ if font.is_some() => ("font/woff2", ""),
        _ => return Response::new(404, "Not found".into()),
    };
    let mut response = Response::new(200, body.into());
    response.binary_body = font;
    response.headers = vec![
        ("Content-Type".into(), mime.into()),
        ("X-Content-Type-Options".into(), "nosniff".into()),
        (
            "Cache-Control".into(),
            if matches!(path, "/static/dashboard.css" | "/static/dashboard.js") {
                "no-cache"
            } else {
                "public, max-age=3600"
            }
            .into(),
        ),
    ];
    response
}
