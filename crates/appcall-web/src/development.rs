//! No-login development rendering. The host must restrict this adapter to a
//! development process bound to loopback; this is never a fallback for Anusa.
use crate::{
    dashboard::{resolve, DashboardRenderer},
    *,
};
pub struct DevelopmentDashboard<'a> {
    pub public_origin: &'a str,
    pub data: &'a dyn DashboardData,
}
impl DevelopmentDashboard<'_> {
    pub async fn handle(&self, r: &Request<'_>) -> Option<Response> {
        if r.method == "GET" && r.path == "/" {
            return Some(Response::redirect("/app"));
        }
        if r.path.starts_with("/static/") {
            return Some(crate::shell::asset(r.path, r.method));
        }
        let admin = admin_target(r.path);
        let operation = resolve(r.method, r.path);
        if admin.is_none() && operation.is_none() {
            return None;
        }
        if r.method == "POST" && verify_csrf(self.public_origin, r.origin, r.referer).is_err() {
            return Some(Response::new(403, "Access denied".into()));
        }
        let session = Session {
            access_token: String::new(),
            refresh_token: String::new(),
            user_id: String::new(),
            email: "dev@appcall.local".into(),
            tenant_id: "dev".into(),
            tenant_name: "Development".into(),
        };
        if let Some((title, target)) = admin {
            return Some(match r.method {
                "POST" if r.path != "/app/settings" => Response::redirect(target),
                "GET" if r.path == target => {
                    let content = if r.path == "/app/settings" {
                        crate::admin_ui::settings("proj_dev", "Development", "Development")
                    } else {
                        format!("<h1 class=\"text-2xl font-semibold\">{title}</h1><div class=\"flex flex-col items-center justify-center rounded-xl border border-dashed border-space-indigo-800 bg-space-indigo-950/40 px-6 py-16 text-center\"><p class=\"text-sm font-medium text-dusk-blue-200\">Sign in to manage {title}</p><p class=\"mt-1 max-w-sm text-sm text-dusk-blue-500\">{title} is powered by anusa identity. Configure anusa auth and sign in to view and manage it here.</p></div>")
                    };
                    Response::new(200, crate::shell::layout(title, &session, &content, r.path))
                }
                _ => Response::new(404, "Not found".into()),
            });
        }
        let principal = appcall_auth::Principal::project("proj_dev").expect("fixed project");
        Some(
            match (DashboardRenderer { data: self.data })
                .render(r, operation?, &session, principal)
                .await
            {
                Ok(response) => response,
                Err(error) => Response::new(
                    match error {
                        Error::Invalid => 400,
                        Error::Forbidden => 403,
                        Error::Unauthorized => 401,
                        _ => 503,
                    },
                    error.to_string(),
                ),
            },
        )
    }
}
fn admin_target(path: &str) -> Option<(&'static str, &'static str)> {
    for (title, target) in [
        ("Settings", "/app/settings"),
        ("Users", "/app/users"),
        ("Sessions", "/app/sessions"),
        ("Account", "/app/settings/account"),
        ("Organization", "/app/settings/organization"),
        ("Billing", "/app/settings/billing"),
    ] {
        if path == target
            || target != "/app/settings"
                && path
                    .strip_prefix(target)
                    .is_some_and(|suffix| suffix.starts_with('/'))
        {
            return Some((title, target));
        }
    }
    None
}
