use appcall_web::*;
use std::{collections::BTreeMap, future::Future, pin::Pin, sync::Mutex};
#[derive(Default)]
struct Data(Mutex<Vec<DashboardRequest>>);
impl DashboardData for Data {
    fn execute(
        &self,
        r: DashboardRequest,
    ) -> Pin<Box<dyn Future<Output = Result<serde_json::Value, Error>> + Send + '_>> {
        self.0.lock().unwrap().push(r);
        Box::pin(async { Ok(serde_json::json!({"connectors":[]})) })
    }
}
fn request<'a>(method: &'a str, path: &'a str, origin: Option<&'a str>) -> Request<'a> {
    Request {
        method,
        path,
        origin,
        referer: None,
        cookies: "",
        fields: BTreeMap::new(),
        now: 0,
    }
}
#[tokio::test]
async fn developer_dashboard_keeps_identity_and_admin_unavailable() {
    let data = Data::default();
    let dashboard = DevelopmentDashboard {
        public_origin: "http://127.0.0.1:5080",
        data: &data,
    };
    let mut r = request("GET", "/app/connectors", None);
    r.fields.insert("projectId".into(), vec!["victim".into()]);
    let result = dashboard.handle(&r).await.unwrap();
    assert_eq!(result.status, 200);
    assert!(result.body.contains("dev@appcall.local"));
    assert_eq!(data.0.lock().unwrap()[0].principal.project_id, "proj_dev");
    for path in [
        "/app/settings/team",
        "/app/sessions",
        "/app/settings/account",
        "/app/settings/organization",
        "/app/settings/billing",
    ] {
        let response = dashboard.handle(&request("GET", path, None)).await.unwrap();
        assert_eq!(response.status, 200);
        assert!(response.body.contains("Configure anusa auth"));
        assert!(!response
            .headers
            .iter()
            .any(|(k, _)| k.eq_ignore_ascii_case("set-cookie")));
    }
    let response = dashboard
        .handle(&request(
            "POST",
            "/app/settings/team/invite",
            Some("http://127.0.0.1:5080"),
        ))
        .await
        .unwrap();
    assert_eq!(response.status, 302);
    assert_eq!(data.0.lock().unwrap().len(), 1);
    assert_eq!(
        dashboard
            .handle(&request("GET", "/app/settings", None))
            .await
            .unwrap()
            .status,
        200
    );
    assert!(dashboard
        .handle(&request("GET", "/app/login", None))
        .await
        .is_none());
}
#[tokio::test]
async fn developer_mutations_require_same_origin_before_data_access() {
    let data = Data::default();
    let dashboard = DevelopmentDashboard {
        public_origin: "http://127.0.0.1:5080",
        data: &data,
    };
    for origin in [None, Some("https://evil.example"), Some("null")] {
        for path in [
            "/app/connectors/slack/setup",
            "/app/settings/team/invite",
            "/app/settings/white-labeling",
        ] {
            assert_eq!(
                dashboard
                    .handle(&request("POST", path, origin))
                    .await
                    .unwrap()
                    .status,
                403
            );
        }
    }
    assert!(data.0.lock().unwrap().is_empty());
}
