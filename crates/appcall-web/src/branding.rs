use crate::http::escape;
use serde_json::Value;
pub(crate) fn render(v: &Value) -> String {
    let name = v["appName"]
        .as_str()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or("appcall");
    let logo = v["logoURL"]
        .as_str()
        .or_else(|| v["logoUrl"].as_str())
        .unwrap_or("");
    let safe_logo = reqwest::Url::parse(logo)
        .ok()
        .filter(|u| u.scheme() == "https" && u.username().is_empty() && u.password().is_none())
        .map(|u| u.to_string())
        .unwrap_or_default();
    let color = v["tagColor"]
        .as_str()
        .filter(|v| {
            v.len() == 7 && v.starts_with('#') && v[1..].bytes().all(|b| b.is_ascii_hexdigit())
        })
        .unwrap_or("#67e8f9");
    let input = |id: &str, key: &str, label: &str, kind: &str, value: &str| {
        format!("<label class=\"block\"><span class=\"mb-1.5 block text-sm font-medium text-dusk-blue-200\">{label}</span><input id=\"{id}\" name=\"{key}\" type=\"{kind}\" value=\"{}\" class=\"w-full rounded-lg border border-space-indigo-700 bg-prussian-blue-950 px-3 py-2 text-sm text-dusk-blue-100\"></label>",escape(value))
    };
    format!(
        r##"<div class="mb-2"><a href="/app/settings" class="text-sm text-dusk-blue-400">← Back to Settings</a></div><h2 class="text-xl font-semibold text-dusk-blue-50">White Labeling</h2><p class="mt-1 mb-6 text-sm text-dusk-blue-400">Customize how your app appears on the OAuth consent screen when end-users connect their accounts.</p><div class="grid grid-cols-1 gap-6 lg:grid-cols-2"><section class="rounded-xl border border-space-indigo-800 bg-space-indigo-950 p-5"><h3 class="text-sm font-semibold">Branding</h3><p class="mt-1 text-sm text-dusk-blue-500">Your app name and logo shown to end-users during the OAuth connection flow.</p><form method="post" action="/app/settings/white-labeling" class="mt-5 space-y-4">{}{}{}<p class="text-xs text-dusk-blue-500">Square JPEG or PNG, 256×256 to 1024×1024 pixels.</p><div class="rounded-lg border border-space-indigo-800 bg-prussian-blue-950/60 px-3 py-2 text-xs text-dusk-blue-500">Preview only. To apply custom branding and remove the &quot;Secured by appcall&quot; badge, configure your own OAuth app credentials.</div><button class="rounded-lg bg-neon-ice-500 px-4 py-2 text-sm font-semibold text-prussian-blue-950">Save</button></form></section><section><p class="mb-3 text-xs font-medium uppercase tracking-wider text-dusk-blue-500">Preview</p><div class="rounded-2xl border border-space-indigo-800 bg-space-indigo-950 p-6"><div class="mx-auto max-w-xs rounded-xl border border-space-indigo-800 bg-prussian-blue-950 p-6 text-center"><div class="mx-auto flex size-14 items-center justify-center"><div id="wl-logo-initial" style="background:{};display:{}" class="flex size-14 items-center justify-center rounded-xl text-xl font-semibold text-prussian-blue-950">{}</div><img id="wl-logo-img" {} alt="App logo" referrerpolicy="no-referrer" style="display:{}" class="size-14 rounded-xl object-cover"></div><p class="mt-4 text-sm font-semibold text-dusk-blue-50"><span id="wl-preview-name">{}</span> wants to connect</p><p class="mt-0.5 text-sm text-dusk-blue-400">to your Intercom</p><p class="mt-3 text-xs text-dusk-blue-500">Only connect your account to apps you have verified. By linking your account, you allow <span id="wl-badge-name">{}</span> to interact with your data.</p><button type="button" class="mt-5 w-full rounded-lg bg-neon-ice-500 px-3.5 py-2 text-sm font-semibold text-prussian-blue-950">Continue</button><p class="mt-4 text-xs text-dusk-blue-600">Secured by appcall</p></div></div></section></div>"##,
        input("wl-name", "appName", "App name", "text", name),
        input("wl-logo", "logoURL", "Logo URL", "url", logo),
        input("wl-color", "tagColor", "Tag color", "color", color),
        color,
        if safe_logo.is_empty() { "flex" } else { "none" },
        escape(
            &name
                .chars()
                .next()
                .unwrap_or('a')
                .to_uppercase()
                .to_string()
        ),
        if safe_logo.is_empty() {
            String::new()
        } else {
            format!("src=\"{}\"", escape(&safe_logo))
        },
        if safe_logo.is_empty() {
            "none"
        } else {
            "block"
        },
        escape(name),
        escape(name)
    )
}

#[cfg(test)]
mod tests {
    #[test]
    fn preview_defaults_and_rejects_active_content() {
        let html = super::render(
            &serde_json::json!({"appName":"<script>","logoURL":"javascript:alert(1)","tagColor":"red;display:none"}),
        );
        assert!(html.contains("id=\"wl-preview-name\""));
        assert!(html.contains("&lt;script&gt;"));
        assert!(!html.contains("src=\"javascript:"));
        assert!(!html.contains("style=\"background:red;"));
        assert!(super::render(&serde_json::json!({})).contains(">appcall</span>"));
    }
}
