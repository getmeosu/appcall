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
            ">APPS<",
            ">WORKFLOWS<",
            ">Overview<",
            ">Connectors<",
            ">Connections<",
            ">Calls<",
            ">Syncs<",
            ">Events<",
            ">Runs<",
            "id=\"main-content\"",
            "href=\"#main-content\"",
            "aria-label=\"Search pages, apps, and runs\"",
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
            "href=\"/app/certification\"",
            "fonts.googleapis.com",
        ] {
            assert!(!html.contains(forbidden), "unexpected {forbidden}");
        }
    }
    #[test]
    fn apps_and_workflows_navigation_use_specified_order_and_canonical_destinations() {
        let session = Session {
            user_id: String::new(),
            tenant_id: String::new(),
            tenant_name: String::new(),
            email: String::new(),
            access_token: String::new(),
            refresh_token: String::new(),
        };
        let html = layout("Title", &session, "", "/app");
        let apps = html
            .split("<p class=\"shell-group-label\">APPS</p>")
            .nth(1)
            .and_then(|group| group.split("</div>").next())
            .expect("apps navigation group");
        let mut previous = 0;
        for href in [
            "/app/connectors",
            "/app/connections",
            "/app/calls",
            "/app/syncs",
            "/app/events",
        ] {
            let position = apps
                .find(&format!("href=\"{href}\""))
                .unwrap_or_else(|| panic!("missing canonical Apps destination: {href}"));
            assert!(position >= previous, "Apps order changed at {href}");
            previous = position;
        }
        let workflows = html
            .split("<p class=\"shell-group-label\">WORKFLOWS</p>")
            .nth(1)
            .and_then(|group| group.split("</div>").next())
            .expect("workflows navigation group");
        previous = 0;
        for href in ["/app/workflows", "/app/workflows/runs"] {
            let position = workflows
                .find(&format!("href=\"{href}\""))
                .unwrap_or_else(|| panic!("missing canonical Workflows destination: {href}"));
            assert!(position >= previous, "Workflows order changed at {href}");
            previous = position;
        }
        assert!(html.contains("class=\"shell-nav-icon\""));
        assert!(html.contains("Jump to page, app, or run"));
    }
    #[test]
    fn active_routes_have_one_owner_and_segment_boundaries() {
        for (path, expected) in [
            ("/app", Some("/app")),
            ("/app/connectors/slack", Some("/app/connectors")),
            ("/app/connectors-extra", None),
            ("/app/usage?month=9", Some("/app/usage")),
            ("/app/settings/account", Some("/app/settings")),
            ("/app/settings/team/member", Some("/app/settings")),
            ("/app/sessions", Some("/app/settings")),
            ("/app/support", Some("/app/settings")),
            ("/app/syncs", Some("/app/syncs")),
            ("/app/calls", Some("/app/calls")),
            ("/app/workflows/runs", Some("/app/workflows/runs")),
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
    Overview,
    Apps,
    Workflows,
    Footer,
}
struct Destination {
    href: &'static str,
    label: &'static str,
    icon: &'static str,
    group: Group,
    search: &'static str,
}
const NAV: &[Destination] = &[
    Destination {
        href: "/app",
        label: "Overview",
        icon: r#"<rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/>"#,
        group: Group::Overview,
        search: "overview home",
    },
    Destination {
        href: "/app/connectors",
        label: "Connectors",
        icon: r#"<path d="M8 2l6 3.5v5L8 14l-6-3.5v-5z"/><path d="M8 8l6-3.5M8 8L2 4.5M8 8v6"/>"#,
        group: Group::Apps,
        search: "connectors apps catalog",
    },
    Destination {
        href: "/app/connections",
        label: "Connections",
        icon: r#"<path d="M6.5 9.5l3-3"/><path d="M7 4.5l1.5-1.5a2.5 2.5 0 013.5 3.5L10.5 8"/><path d="M9 11.5l-1.5 1.5a2.5 2.5 0 01-3.5-3.5L5.5 8"/>"#,
        group: Group::Apps,
        search: "connections accounts auth",
    },
    Destination {
        href: "/app/calls",
        label: "Calls",
        icon: r#"<path d="M2.5 8h3l1.5-4 2 8 1.5-4h3"/>"#,
        group: Group::Apps,
        search: "calls logs traces",
    },
    Destination {
        href: "/app/syncs",
        label: "Syncs",
        icon: r#"<path d="M13 8a5 5 0 01-8.5 3.6"/><path d="M3 8a5 5 0 018.5-3.6"/><path d="M11.5 1.5v3h-3M4.5 14.5v-3h3"/>"#,
        group: Group::Apps,
        search: "syncs queue jobs",
    },
    Destination {
        href: "/app/events",
        label: "Events",
        icon: r#"<path d="M9 1.5L3.5 9H8l-1 5.5L12.5 7H8z"/>"#,
        group: Group::Apps,
        search: "events webhooks",
    },
    Destination {
        href: "/app/workflows",
        label: "Workflows",
        icon: r#"<circle cx="3.5" cy="8" r="1.75"/><circle cx="12.5" cy="3.5" r="1.75"/><circle cx="12.5" cy="12.5" r="1.75"/><path d="M5.25 8h2.5c1 0 1.5-.5 2-1.5l1-2M7.75 8c1 0 1.5.5 2 1.5l1 2"/>"#,
        group: Group::Workflows,
        search: "workflows engine durable",
    },
    Destination {
        href: "/app/workflows/runs",
        label: "Runs",
        icon: r#"<circle cx="8" cy="8" r="6"/><path d="M6.5 5.5v5l4-2.5z"/>"#,
        group: Group::Workflows,
        search: "workflow runs history",
    },
    Destination {
        href: "/app/usage",
        label: "Usage",
        icon: r#"<path d="M3 13V8M8 13V3M13 13V6"/>"#,
        group: Group::Footer,
        search: "usage",
    },
    Destination {
        href: "/app/docs",
        label: "Docs",
        icon: r#"<path d="M3 2.5h6a2 2 0 012 2V14H5a2 2 0 00-2 2z"/><path d="M13 3.5v10"/>"#,
        group: Group::Footer,
        search: "docs documentation start here",
    },
    Destination {
        href: "/app/settings",
        label: "Settings",
        icon: r#"<path d="M3 4.5h10M3 8h10M3 11.5h10"/><circle cx="6" cy="4.5" r="1.5" fill="var(--color-canvas)"/><circle cx="10.5" cy="8" r="1.5" fill="var(--color-canvas)"/><circle cx="7" cy="11.5" r="1.5" fill="var(--color-canvas)"/>"#,
        group: Group::Footer,
        search: "settings account organization",
    },
];
fn active_destination(path: &str) -> Option<&'static str> {
    let path = path.split(['?', '#']).next().unwrap_or(path);
    if ["/app/settings/team", "/app/sessions", "/app/support"]
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
fn breadcrumb(title: &str, path: &str) -> String {
    let path = path.split(['?', '#']).next().unwrap_or(path);
    let parent = if path.starts_with("/app/connectors/") {
        Some(("/app/connectors", "Connectors"))
    } else if path.starts_with("/app/calls/") {
        Some(("/app/calls", "Calls"))
    } else if path.starts_with("/app/syncs/") {
        Some(("/app/syncs", "Syncs"))
    } else if path == "/app/workflows/runs" || path.starts_with("/app/workflows/runs/") {
        Some(("/app/workflows", "Workflows"))
    } else if path.starts_with("/app/settings/") {
        Some(("/app/settings", "Settings"))
    } else {
        None
    };
    match parent {
        Some((href, label)) => format!(
            "<nav class=\"shell-breadcrumb\" aria-label=\"Breadcrumb\"><a href=\"{href}\">{label}</a><span class=\"shell-crumb-sep\" aria-hidden=\"true\">/</span><span class=\"shell-crumb-here\">{}</span></nav>",
            escape(title)
        ),
        None => format!(
            "<nav class=\"shell-breadcrumb\" aria-label=\"Breadcrumb\"><span class=\"shell-crumb-here\">{}</span></nav>",
            escape(title)
        ),
    }
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
        (Group::Overview, ""),
        (Group::Apps, "APPS"),
        (Group::Workflows, "WORKFLOWS"),
        (Group::Footer, ""),
    ] {
        if group == Group::Footer {
            nav.push_str("<div class=\"shell-nav-footer\">");
        } else if name.is_empty() {
            nav.push_str("<div class=\"shell-nav-group\">");
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
            nav.push_str(&format!("<a href=\"{}\" title=\"{}\" aria-label=\"{}\"{current}><svg class=\"shell-nav-icon\" viewBox=\"0 0 16 16\" aria-hidden=\"true\">{}</svg><span class=\"shell-nav-label\">{}</span></a>", item.href, item.label, item.label, item.icon, item.label));
        }
        nav.push_str("</div>");
    }
    let mut commands = NAV
        .iter()
        .enumerate()
        .map(|(index, item)| {
            format!(
                "<a id=\"cmdk-option-{index}\" href=\"{}\" role=\"option\" aria-selected=\"false\" tabindex=\"-1\" data-cmd=\"{}\" data-search=\"{}\">{}</a>",
                item.href, item.label, item.search, item.label
            )
        })
        .collect::<String>();
    commands.push_str(&format!(
        "<a id=\"cmdk-option-start\" href=\"/app/start\" role=\"option\" aria-selected=\"false\" tabindex=\"-1\" data-cmd=\"Start here\" data-search=\"start here first run apps workflows\">Start here</a>"
    ));
    let mut field = Field::new(
        "cmdk-input",
        "search",
        "Search pages, apps, and runs",
        Control::Input(InputType::Search),
    );
    field.placeholder = "Jump to page, app, or run…";
    field.autocomplete = Some("off");
    field.aria_label = Some("Search pages, apps, and runs");
    let search_field = field.render().replacen(
        "<input class=\"ui-control\"",
        "<input role=\"combobox\" aria-haspopup=\"listbox\" aria-autocomplete=\"list\" aria-expanded=\"false\" aria-controls=\"cmdk-list\" class=\"ui-control\"",
        1,
    );
    let menu = shell_button("Menu", ShellAction::Navigation);
    let close_nav = shell_button("Close navigation", ShellAction::CloseNavigation);
    let search = shell_button("Search · ⌘K", ShellAction::Search);
    let close_search = shell_button("Close search", ShellAction::CloseSearch);
    let archivo_font = asset_url(
        "/static/fonts/archivo-latin-variable.woff2",
        include_bytes!("../static/fonts/archivo-latin-variable.woff2"),
    );
    let mono_font = asset_url(
        "/static/fonts/ibm-plex-mono-variable.woff2",
        include_bytes!("../static/fonts/ibm-plex-mono-variable.woff2"),
    );
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
    let crumbs = breadcrumb(title, path);
    let project_mark = crate::ui::provider_mark(&crate::ui::provider_initials(&s.tenant_name));
    format!(
        r##"<!DOCTYPE html><html lang="en" class="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{title} · appcall</title><link rel="icon" type="image/svg+xml" href="/static/favicon.svg"><link rel="preload" href="{archivo_font}" as="font" type="font/woff2" crossorigin><link rel="preload" href="{mono_font}" as="font" type="font/woff2" crossorigin><link rel="stylesheet" href="{app_css}"><link rel="stylesheet" href="{dashboard_css}"><script src="{dashboard_js}" defer></script><script src="{logs_js}" defer></script><script type="module" src="/static/datastar.js"></script><script src="{palette_js}" defer></script></head><body data-dashboard><a class="shell-skip" href="#main-content">Skip to content</a><div class="shell"><aside id="dashboard-sidebar" aria-label="Workspace navigation"><div class="shell-brand"><span class="shell-mark" aria-hidden="true">a</span><span class="shell-brand-name">appcall</span>{close_nav}</div><div class="shell-project">{project_mark}<span class="shell-project-name" title="{tenant}">{tenant}</span></div><nav aria-label="Main navigation">{nav}</nav><div class="shell-account"><span title="{email}">{email}</span><a href="/app/logout" aria-label="Sign out">Sign out</a></div></aside><div id="shell-workspace"><header class="shell-topbar">{menu}{crumbs}{search}</header><main id="main-content" tabindex="-1">{content}</main></div></div><dialog id="nav-drawer" aria-label="Workspace navigation"></dialog><dialog id="cmdk" aria-label="Search pages, apps, and runs"><div class="shell-search-heading">{search_field}{close_search}</div><div id="cmdk-list" role="listbox" aria-label="Pages, apps, and runs" aria-live="polite" aria-atomic="true">{commands}</div><p id="cmdk-status" role="status" aria-live="polite" aria-atomic="true"></p><p class="shell-search-help">↑ ↓ to choose · Enter to open · Esc to close</p></dialog></body></html>"##,
        title = escape(title),
        tenant = escape(&s.tenant_name),
        email = escape(&s.email),
        archivo_font = archivo_font,
        mono_font = mono_font,
        project_mark = project_mark,
        crumbs = crumbs
    )
}
/// Serves the exact embedded asset allowlist; fonts use `Response::binary_body`.
/// Non-GET requests return 405, and unknown GET paths return 404.
pub(crate) fn asset(path: &str, method: &str) -> Response {
    if method != "GET" {
        return Response::new(405, "Method not allowed".into());
    }
    let path = path.split(['?', '#']).next().unwrap_or(path);
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
