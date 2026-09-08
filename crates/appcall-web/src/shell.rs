use crate::{http::escape, Response, Session};
const NAV: &[(&str, &str)] = &[
    ("/app", "Getting Started"),
    ("/app/toolkits", "Toolkits"),
    ("/app/users", "Users"),
    ("/app/sessions", "Sessions"),
    ("/app/auth-configs", "Auth Configs"),
    ("/app/triggers", "Triggers"),
    ("/app/logs", "Logs"),
    ("/app/qa", "QA"),
    ("/app/support", "Support"),
    ("/app/docs", "Documentation"),
    ("/app/settings", "Settings"),
];
// Markup/classes ported from internal/web/components/layout.templ. Assets are
// copied verbatim so the Rust binary no longer needs the Go source tree.
pub(crate) fn layout(title: &str, s: &Session, content: &str) -> String {
    let nav=NAV.iter().map(|(href,label)|format!("<a href=\"{href}\" class=\"group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition text-dusk-blue-300 hover:bg-space-indigo-900 hover:text-dusk-blue-100\">{label}</a>")).collect::<String>();
    let commands=NAV.iter().map(|(href,label)|format!("<a href=\"{href}\" data-cmd=\"{label}\" class=\"flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-dusk-blue-300 hover:bg-space-indigo-900 data-[active]:bg-space-indigo-800 data-[active]:text-dusk-blue-50\">{label}</a>")).collect::<String>();
    format!(
        r#"<!DOCTYPE html><html lang="en" class="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{title} · appcall</title><link rel="icon" type="image/svg+xml" href="/static/favicon.svg"><link rel="preload" href="/static/fonts/archivo-latin-variable.woff2" as="font" type="font/woff2" crossorigin><link rel="preload" href="/static/fonts/ibm-plex-mono-regular.woff2" as="font" type="font/woff2" crossorigin><link rel="stylesheet" href="/static/app.css"><link rel="stylesheet" href="/static/dashboard.css"><script src="/static/dashboard.js" defer></script><script type="module" src="/static/datastar.js"></script><script src="/static/palette.js" defer></script></head><body data-dashboard class="h-screen overflow-hidden bg-surface text-dusk-blue-100 antialiased"><div class="flex h-screen"><button id="nav-backdrop" aria-label="Close navigation" type="button"></button><aside id="dashboard-sidebar" class="flex w-64 shrink-0 flex-col border-r border-space-indigo-800 bg-prussian-blue-900"><div class="flex h-14 items-center gap-2.5 border-b border-space-indigo-800 px-4"><div class="flex size-7 shrink-0 items-center justify-center rounded-md bg-neon-ice-500 font-semibold text-prussian-blue-950">a</div><div class="flex min-w-0 flex-col"><span class="text-sm font-semibold leading-tight tracking-tight text-dusk-blue-50">appcall</span><span class="truncate text-[11px] leading-tight text-dusk-blue-400">{tenant}</span></div></div><div class="mx-3 mt-3 rounded-lg border border-space-indigo-800 bg-space-indigo-950 px-3 py-2"><span class="flex min-w-0 flex-col"><span class="text-[11px] uppercase tracking-wider text-dusk-blue-500">Project</span><span class="truncate text-sm font-medium text-dusk-blue-100">{tenant}</span></span></div><nav class="mt-4 flex flex-1 flex-col gap-0.5 overflow-y-auto px-3">{nav}</nav><div class="border-t border-space-indigo-800 p-3"><div class="flex items-center gap-2.5 rounded-lg px-2 py-1.5"><span class="min-w-0 flex-1 truncate text-xs text-dusk-blue-300">{email}</span><a href="/app/logout" class="text-dusk-blue-500 transition hover:text-neon-ice-400" title="Sign out">Sign out</a></div></div></aside><div class="flex min-w-0 flex-1 flex-col"><header class="flex h-14 shrink-0 items-center gap-4 border-b border-space-indigo-800 bg-prussian-blue-950/60 px-8 backdrop-blur"><button id="nav-toggle" type="button" aria-controls="dashboard-sidebar" aria-expanded="false">Menu</button><h1 class="text-sm font-semibold text-dusk-blue-50">{title}</h1><div class="flex-1"></div><button type="button" data-cmdk-open class="flex items-center gap-2 rounded-lg border border-space-indigo-800 bg-space-indigo-950 px-3 py-1.5 text-sm text-dusk-blue-400 transition hover:border-space-indigo-700"><span>Search</span><kbd class="rounded border border-space-indigo-700 px-1.5 text-[11px] text-dusk-blue-500">⌘K</kbd></button></header><main class="flex-1 overflow-y-auto px-8 py-7">{content}</main></div></div><div id="cmdk" hidden class="fixed inset-0 z-50 flex items-start justify-center bg-prussian-blue-950/70 px-4 pt-[12vh] backdrop-blur-sm"><div class="w-full max-w-lg overflow-hidden rounded-xl border border-space-indigo-700 bg-space-indigo-950 shadow-2xl"><div class="flex items-center gap-2 border-b border-space-indigo-800 px-4"><input id="cmdk-input" type="text" placeholder="Search pages…" autocomplete="off" class="w-full bg-transparent py-3.5 text-sm text-dusk-blue-100 placeholder:text-dusk-blue-600 focus:outline-none"><kbd class="rounded border border-space-indigo-700 px-1.5 text-[11px] text-dusk-blue-500">esc</kbd></div><div id="cmdk-list" class="max-h-80 overflow-y-auto p-2">{commands}</div></div></div></body></html>"#,
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
        "/static/fonts/ibm-plex-mono-regular.woff2" => Some(include_bytes!(
            "../static/fonts/ibm-plex-mono-regular.woff2"
        )),
        "/static/fonts/ibm-plex-mono-medium.woff2" => {
            Some(include_bytes!("../static/fonts/ibm-plex-mono-medium.woff2"))
        }
        _ => None,
    };
    let (mime, body) = match path {
        "/static/dashboard.css" => ("text/css", include_str!("../static/dashboard.css")),
        "/static/dashboard.js" => ("text/javascript", include_str!("../static/dashboard.js")),
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
