use super::*;

fn data(name: &str) -> ScenarioData {
    ScenarioData::new(Scenario::parse(name).expect("explicit connections fixture scenario"))
}

async fn page(data: &ScenarioData, path: &str, fields: &[(&str, &str)]) -> Response {
    DevelopmentDashboard {
        public_origin: "http://127.0.0.1:55589",
        data,
    }
    .handle(&Request {
        method: "GET",
        path,
        cookies: "",
        origin: None,
        referer: None,
        now: 0,
        fields: fields
            .iter()
            .map(|(key, value)| ((*key).into(), vec![(*value).into()]))
            .collect(),
    })
    .await
    .unwrap()
}

#[tokio::test]
async fn connections_preview_states_use_real_dto_fields_and_separate_intent_age() {
    let data = data("connections");
    let value = data
        .execute(crate::tests::dashboard_request(
            DashboardOperation::Connections,
        ))
        .await
        .unwrap();
    assert_eq!(value["synthetic"], true);
    let rows = value["connections"].as_array().unwrap();
    for status in ["active", "authorizing", "degraded", "disconnected", ""] {
        assert!(
            rows.iter().any(|row| row["status"] == status),
            "missing {status}"
        );
    }
    let authorizing = rows
        .iter()
        .find(|row| row["id"] == "synthetic_authorizing")
        .unwrap();
    assert_eq!(authorizing["createdAgeSeconds"], 86400);
    assert_eq!(authorizing["authorizationAgeSeconds"], 42);
    assert_eq!(authorizing["authType"], "oauth2");
    let unknown_intent = rows
        .iter()
        .find(|row| row["id"] == "synthetic_authorizing_no_intent")
        .unwrap();
    assert!(unknown_intent.get("authorizationAgeSeconds").is_none());
    assert!(rows
        .iter()
        .any(|row| row["id"].as_str().unwrap().len() > 160));
    for row in rows {
        assert!(row.get("providerEmail").is_none());
        assert!(row.get("credential").is_none());
        assert!(row.get("secretRefId").is_none());
    }
    let response = page(&data, "/app/connections", &[]).await;
    assert_eq!(response.status, 200);
    for text in [
        "Active",
        "Authorizing",
        "Degraded",
        "Disconnected",
        "Not recorded",
        "Authorization elapsed",
        "less than a minute",
        "Provider identity not recorded",
    ] {
        assert!(response.body.contains(text), "missing {text}");
    }
    assert!(response
        .body
        .contains("connectionId=synthetic_disconnected#tk-setup"));
    assert!(data.stats()["operations"]
        .as_object()
        .unwrap()
        .values()
        .all(|value| value == 0));
}

#[tokio::test]
async fn connections_preview_reconnect_preserves_the_exact_non_active_sibling() {
    let data = data("connections");
    for id in [
        "synthetic_disconnected",
        "synthetic_degraded",
        "synthetic_authorizing",
    ] {
        let response = page(
            &data,
            "/app/connectors/connector-0",
            &[("tab", "settings"), ("connectionId", id)],
        )
        .await;
        assert_eq!(response.status, 200);
        let settings = response
            .body
            .split("id=\"tk-panel-settings\"")
            .nth(1)
            .unwrap()
            .split("</section>")
            .next()
            .unwrap();
        assert!(
            settings.contains(&format!("value=\"{id}\"")),
            "missing selected {id}"
        );
        assert!(!settings.contains("value=\"synthetic_active\""));
        assert!(settings.contains("Synthetic setup only"));
    }
    let invalid = page(
        &data,
        "/app/connectors/connector-0",
        &[("connectionId", "missing_sibling")],
    )
    .await;
    assert_eq!(invalid.status, 503);
}

#[tokio::test]
async fn connections_preview_malformed_empty_and_unavailable_stay_distinct() {
    let malformed = data("connections-malformed");
    let payload = malformed
        .execute(crate::tests::dashboard_request(
            DashboardOperation::Connections,
        ))
        .await
        .unwrap();
    assert_eq!(payload["synthetic"], true);
    assert!(payload["connections"][0]["id"]
        .as_str()
        .unwrap()
        .contains('/'));
    assert_eq!(page(&malformed, "/app/connections", &[]).await.status, 503);
    let empty = page(&data("empty"), "/app/connections", &[]).await;
    assert_eq!(empty.status, 200);
    assert!(empty.body.contains("No connections"));
    let unavailable = page(&data("unavailable"), "/app/connections", &[]).await;
    assert_eq!(unavailable.status, 503);
}
