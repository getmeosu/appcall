use appcall_web::*;
use std::{collections::BTreeMap, future::Future, pin::Pin};

struct Data;

#[tokio::test]
async fn logs_client_is_embedded_fingerprinted_and_get_only() {
    use sha2::{Digest, Sha256};
    let dashboard = DevelopmentDashboard {
        public_origin: "http://127.0.0.1:5080",
        data: &Data,
    };
    let asset = dashboard.handle(&request("/static/logs.js")).await.unwrap();
    assert_eq!(asset.status, 200, "Logs client must be served");
    let source =
        std::fs::read_to_string(format!("{}/static/logs.js", env!("CARGO_MANIFEST_DIR"))).unwrap();
    assert_eq!(asset.body, source);
    assert!(asset
        .headers
        .contains(&("Content-Type".into(), "text/javascript".into())));
    assert!(asset
        .headers
        .contains(&("X-Content-Type-Options".into(), "nosniff".into())));
    let hash: String = Sha256::digest(source.as_bytes())
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect();
    let page = dashboard.handle(&request("/app/settings")).await.unwrap();
    assert!(page
        .body
        .contains(&format!("src=\"/static/logs.js?v={hash}\" defer")));
    let mut post = request("/static/logs.js");
    post.method = "POST";
    assert_eq!(dashboard.handle(&post).await.unwrap().status, 405);
}
fn request(path: &str) -> Request<'_> {
    Request {
        method: "GET",
        path,
        origin: None,
        referer: None,
        cookies: "",
        fields: BTreeMap::new(),
        now: 0,
    }
}
impl DashboardData for Data {
    fn execute(
        &self,
        _: DashboardRequest,
    ) -> Pin<Box<dyn Future<Output = Result<serde_json::Value, Error>> + Send + '_>> {
        Box::pin(async { Ok(serde_json::json!({})) })
    }
}

#[test]
fn signal_replaces_old_ramps_and_defines_accessible_base() {
    let css = include_str!("../styles/app.css");
    let compiled = include_str!("../static/app.css");
    for old in [
        "prussian-blue",
        "space-indigo",
        "dusk-blue",
        "tropical-teal",
        "neon-ice",
    ] {
        assert!(!css.contains(old), "obsolete ramp: {old}");
        assert!(!compiled.contains(old), "compiled obsolete ramp: {old}");
    }
    for required in [
        "--color-ink-950: #08090C",
        "--color-iris-400: #9A90FF",
        "--radius-ctl: 4px",
        "--radius-panel: 10px",
        "font-variant-numeric: tabular-nums",
        ":focus-visible",
        "prefers-reduced-motion: reduce",
        "font-display: swap",
    ] {
        assert!(css.contains(required), "missing: {required}");
    }
    assert!(!compiled.contains("fonts.googleapis.com"));
}

#[tokio::test]
async fn shell_preloads_local_fonts_and_embeds_assets() {
    let dashboard = DevelopmentDashboard {
        public_origin: "http://127.0.0.1:5080",
        data: &Data,
    };
    let page = dashboard.handle(&request("/app/settings")).await.unwrap();
    assert_eq!(page.status, 200);
    for name in [
        "archivo-latin-variable.woff2",
        "ibm-plex-mono-regular.woff2",
    ] {
        assert!(page.body.contains(&format!("rel=\"preload\" href=\"/static/fonts/{name}\" as=\"font\" type=\"font/woff2\" crossorigin")), "missing preload {name}");
    }
    for name in [
        "archivo-latin-variable.woff2",
        "ibm-plex-mono-regular.woff2",
        "ibm-plex-mono-medium.woff2",
    ] {
        let path = format!("/static/fonts/{name}");
        let response = dashboard.handle(&request(&path)).await.unwrap();
        assert_eq!(response.status, 200, "{path}");
        assert!(response
            .headers
            .contains(&("Content-Type".into(), "font/woff2".into())));
        let expected = std::fs::read(format!(
            "{}/static/fonts/{name}",
            env!("CARGO_MANIFEST_DIR")
        ))
        .unwrap();
        assert_eq!(response.binary_body.unwrap(), expected);
    }
}

#[test]
fn signal_text_and_control_roles_meet_contrast_on_their_surfaces() {
    let css = include_str!("../styles/app.css");
    let luminance = |name: &str| {
        let value = css
            .split(&format!("--color-{name}:"))
            .nth(1)
            .unwrap()
            .trim_start();
        let rgb = u32::from_str_radix(&value[1..7], 16).unwrap();
        [16, 8, 0]
            .into_iter()
            .zip([0.2126, 0.7152, 0.0722])
            .map(|(shift, weight)| {
                let c = ((rgb >> shift) & 255) as f64 / 255.0;
                weight
                    * if c <= 0.04045 {
                        c / 12.92
                    } else {
                        ((c + 0.055) / 1.055).powf(2.4)
                    }
            })
            .sum::<f64>()
    };
    for surface in ["ground", "panel", "raised", "inset"] {
        for (role, minimum) in [
            ("ink-300", 4.5),
            ("ink-100", 4.5),
            ("iris-400", 4.5),
            ("ink-500", 3.0),
        ] {
            let ratio = (luminance(role) + 0.05) / (luminance(surface) + 0.05);
            assert!(ratio >= minimum, "{role} on {surface}: {ratio}");
        }
    }
}
