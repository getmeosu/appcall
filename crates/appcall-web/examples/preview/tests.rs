use super::*;

#[tokio::test]
async fn copy_preview_populated_collections_use_real_dtos() {
    for (operation, key) in [
        (DashboardOperation::AuthConfigs, "connections"),
        (DashboardOperation::Logs, "logs"),
        (DashboardOperation::Triggers, "events"),
        (DashboardOperation::Qa, "certifications"),
    ] {
        let result = Data.execute(dashboard_request(operation)).await;
        assert!(
            result.is_ok(),
            "missing synthetic collection: {operation:?}"
        );
        assert_eq!(result.unwrap()[key].as_array().unwrap().len(), 1);
    }
}

#[tokio::test]
async fn copy_preview_confirmations_are_available_at_valid_fixture_ids() {
    for (operation, resource) in [
        (DashboardOperation::Setup, "connector-0"),
        (DashboardOperation::TestConnection, "preview_connection"),
        (
            DashboardOperation::DisconnectConnection,
            "preview_connection",
        ),
        (DashboardOperation::ReplayTrace, "preview_original"),
        (DashboardOperation::ReplayEvent, "preview_event"),
        (DashboardOperation::RequestToolkit, ""),
    ] {
        let mut request = dashboard_request(operation);
        request.resource = Some(resource.into());
        let result = Data.execute(request).await;
        assert!(
            result.is_ok(),
            "missing synthetic confirmation: {operation:?}"
        );
    }
}

#[tokio::test]
async fn copy_preview_detailed_invalid_json_has_actual_position() {
    let mut request = dashboard_request(DashboardOperation::Test);
    request
        .fields
        .insert("connectionId".into(), "preview_active_1".into());
    request
        .fields
        .insert("input_raw".into(), "{\n \"query\": }".into());
    let result = Data.execute_detailed(request).await.unwrap_err();
    assert_eq!(result.cause(), FailureCause::InvalidJson);
    let position = result.json_position().expect("parser position required");
    assert_eq!((position.line(), position.column()), (2, 11));
}

pub(super) fn dashboard_request(operation: DashboardOperation) -> DashboardRequest {
    DashboardRequest {
        principal: appcall_auth::Principal::project("preview").unwrap(),
        operation,
        resource: Some("connector-0".into()),
        account_id: None,
        fields: Default::default(),
        form_values: Default::default(),
    }
}

fn dynamic_request(operation: DashboardOperation) -> DashboardRequest {
    let mut request = dashboard_request(operation);
    request.resource = Some("connector-3".into());
    request.fields = std::collections::BTreeMap::from([
        ("connectionId".into(), "preview_active_2".into()),
        ("source".into(), "actors.options".into()),
        ("fieldName".into(), "f.actorId".into()),
        ("detailSource".into(), "actors.input_schema".into()),
        ("q".into(), "alpha".into()),
    ]);
    request
}

#[tokio::test]
async fn dynamic_preview_declares_its_dedicated_action_without_changing_baseline() {
    let mut request = dashboard_request(DashboardOperation::Toolkit);
    request.resource = Some("connector-3".into());
    let item = Data.execute(request).await.unwrap();
    assert_eq!(item["action"], "actors.run");
    assert_eq!(
        item["inputSchema"]["properties"]["actorId"]["x-dynamic-options"]["source"],
        "actors.options"
    );
    assert_eq!(
        item["inputSchema"]["properties"]["actorId"]["x-dynamic-options"]["detailSource"],
        "actors.input_schema"
    );
    let baseline = Data
        .execute(dashboard_request(DashboardOperation::Toolkit))
        .await
        .unwrap();
    assert_eq!(baseline["action"], "messages.list");
    assert!(baseline["inputSchema"]["properties"]
        .get("actorId")
        .is_none());
}

#[tokio::test]
async fn dynamic_preview_filters_options_and_returns_the_selected_actor_schema() {
    let result = Data
        .execute(dynamic_request(DashboardOperation::Options))
        .await;
    assert!(result.is_ok(), "synthetic options must be available");
    let result = result.unwrap();
    assert_eq!(
        result["options"],
        json!([{"value":"preview_actor_alpha","label":"Synthetic Alpha actor"}])
    );
    for (actor, field, kind) in [
        ("preview_actor_alpha", "message", "string"),
        ("preview_actor_beta", "count", "integer"),
    ] {
        let mut request = dynamic_request(DashboardOperation::RunInputFields);
        request
            .fields
            .insert("source".into(), "actors.input_schema".into());
        request.fields.insert("actorId".into(), actor.into());
        let detail = Data.execute(request).await.unwrap();
        assert_eq!(detail["actorId"], actor);
        assert_eq!(detail["inputSchema"]["properties"][field]["type"], kind);
        assert_eq!(detail["inputSchema"]["required"], json!([field]));
    }
}

#[tokio::test]
async fn dynamic_preview_renders_existing_option_and_runinput_targets() {
    let dashboard = DevelopmentDashboard {
        public_origin: "http://127.0.0.1:55589",
        data: &Data,
    };
    let fields = dynamic_request(DashboardOperation::Options)
        .fields
        .into_iter()
        .map(|(key, value)| (key, vec![value]))
        .collect();
    let mut request = Request {
        method: "GET",
        path: "/app/toolkits/connector-3/options",
        cookies: "",
        origin: None,
        referer: None,
        fields,
        now: 0,
    };
    let options = dashboard.handle(&request).await.unwrap();
    assert_eq!(options.status, 200);
    assert!(options.body.starts_with("event: datastar-patch-elements\n"));
    assert!(options.body.contains("id=\"tk-opts-f.actorId\""));
    assert!(options.body.contains("data-field=\"f.actorId\" data-value=\"preview_actor_alpha\" data-key=\"connector-3\" data-detail=\"actors.input_schema\""));
    request.path = "/app/toolkits/connector-3/runinput-fields";
    request
        .fields
        .insert("source".into(), vec!["actors.input_schema".into()]);
    request
        .fields
        .insert("actorId".into(), vec!["preview_actor_alpha".into()]);
    let detail = dashboard.handle(&request).await.unwrap();
    assert_eq!(detail.status, 200);
    assert!(detail.body.contains("id=\"tk-runinput\""));
    assert!(detail.body.contains("name=\"runInputSchema\""));
    assert!(detail.body.contains("name=\"f.runInput.message\""));
}

#[tokio::test]
async fn dynamic_preview_rejects_malformed_or_unavailable_fixture_selection() {
    for (field, value) in [
        ("source", "messages.send"),
        ("fieldName", "f.unknown"),
        ("connectionId", "preview_inactive"),
        ("connectionId", ""),
    ] {
        let mut request = dynamic_request(DashboardOperation::Options);
        request.fields.insert(field.into(), value.into());
        assert!(matches!(Data.execute(request).await, Err(Error::Invalid)));
    }
    for actor in ["", "unknown", "<script>"] {
        let mut request = dynamic_request(DashboardOperation::RunInputFields);
        request
            .fields
            .insert("source".into(), "actors.input_schema".into());
        request.fields.insert("actorId".into(), actor.into());
        assert!(matches!(Data.execute(request).await, Err(Error::Invalid)));
    }
    let mut foreign = dynamic_request(DashboardOperation::Options);
    foreign.resource = Some("connector-0".into());
    assert!(matches!(Data.execute(foreign).await, Err(Error::Invalid)));
}

#[test]
fn connector_preview_form_transport_preserves_body_and_duplicates() {
    let fields = preview_fields("/app/toolkits/connector-0/test?tab=tools",
        b"connectionId=preview_active_1&action=messages.list&f.query=hash%23+%26+space&f.metadata.key=one&f.metadata.key=two&f.metadata.val=1&f.metadata.val=2")
        .unwrap();
    assert_eq!(
        fields.get("connectionId"),
        Some(&vec!["preview_active_1".into()])
    );
    assert_eq!(fields.get("f.query"), Some(&vec!["hash# & space".into()]));
    assert_eq!(
        fields.get("f.metadata.key"),
        Some(&vec!["one".into(), "two".into()])
    );
    assert_eq!(fields.get("tab"), Some(&vec!["tools".into()]));
}

#[tokio::test]
async fn connector_preview_waits_for_the_complete_form_body() {
    let (mut client, mut server) = tokio::io::duplex(1024);
    let body = "f.query=long%20input".repeat(200);
    let expected = format!(
        "POST /app/toolkits/connector-0/test HTTP/1.1\r\nContent-Length: {}\r\n\r\n{body}",
        body.len()
    );
    let sent = expected.clone();
    let sender = tokio::spawn(async move {
        let boundary = sent.find("\r\n\r\n").unwrap() + 4;
        client.write_all(sent[..boundary].as_bytes()).await.unwrap();
        tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        let _ = client.write_all(sent[boundary..].as_bytes()).await;
    });
    let received = read_preview_request(&mut server).await.unwrap();
    assert_eq!(received, expected.as_bytes());
    sender.await.unwrap();
}

#[tokio::test]
async fn connector_preview_rejects_incomplete_or_ambiguous_http_bodies() {
    for raw in [
        "POST / HTTP/1.1\r\nContent-Length: 999999\r\n\r\n",
        "POST / HTTP/1.1\r\nContent-Length: 10\r\n\r\nshort",
        "POST / HTTP/1.1\r\nContent-Length: 0\r\nContent-Length: 0\r\n\r\n",
        "POST / HTTP/1.1\r\nTransfer-Encoding: chunked\r\n\r\n0\r\n\r\n",
    ] {
        let mut bytes = raw.as_bytes();
        assert!(read_preview_request(&mut bytes).await.is_err(), "{raw:?}");
    }
    let mut malformed = b"POST / HTTP/1.1\r\nContent-Length: 1\r\n\r\n\xff".as_slice();
    assert!(read_preview_request(&mut malformed).await.is_err());
}

#[tokio::test]
async fn connector_preview_has_realistic_but_explicitly_synthetic_data() {
    let item = Data
        .execute(dashboard_request(DashboardOperation::Toolkit))
        .await
        .expect("connector detail must be available in the local preview");
    assert_eq!(item["action"], "messages.list");
    assert_eq!(item["connections"][0]["id"], "preview_active_1");
    assert_eq!(item["connections"][0]["status"], "active");
    assert!(item["connections"]
        .as_array()
        .unwrap()
        .iter()
        .any(|c| c["status"] == "disconnected"));
    assert!(item["operations"]
        .as_array()
        .unwrap()
        .iter()
        .any(|o| o["kind"] == "webhook"));
    assert!(item["description"].as_str().unwrap().contains("Synthetic"));
    assert!(item.get("safeDefault").is_none());
    assert!(item["connections"][0].get("email").is_none());
}

#[tokio::test]
async fn connector_preview_can_exercise_destructive_confirmation_without_deleting_data() {
    let mut request = dashboard_request(DashboardOperation::Toolkit);
    request
        .fields
        .insert("action".into(), "messages.delete".into());
    let item = connector_fixture(&request).unwrap();
    let operation = item["operations"]
        .as_array()
        .unwrap()
        .iter()
        .find(|op| op["name"] == "messages.delete")
        .unwrap();
    assert_eq!(operation["destructive"], true);
    assert_eq!(operation["readOnly"], false);
    assert!(operation["description"]
        .as_str()
        .unwrap()
        .contains("No data is deleted"));
    request.operation = DashboardOperation::Test;
    request
        .fields
        .insert("connectionId".into(), "preview_active_1".into());
    let result = Data.execute(request).await.unwrap();
    assert_eq!(result["output"]["synthetic"], true);
    assert_eq!(result["output"]["action"], "messages.delete");
}

#[tokio::test]
async fn connector_preview_assembles_fields_without_reflecting_credentials() {
    let mut request = dashboard_request(DashboardOperation::Test);
    request.fields = std::collections::BTreeMap::from([
        ("connectionId".into(), "preview_active_1".into()),
        ("action".into(), "messages.list".into()),
        ("callerToken".into(), "do-not-reflect-credential".into()),
    ]);
    request.form_values = std::collections::BTreeMap::from([
        ("f.query".into(), vec!["A real submitted value".into()]),
        ("f.metadata.key".into(), vec!["one".into(), "two".into()]),
        ("f.metadata.val".into(), vec!["1".into(), "2".into()]),
    ]);
    let result = Data.execute(request).await.expect("synthetic tool can run");
    assert_eq!(result["output"]["query"], "A real submitted value");
    assert_eq!(result["output"]["metadata"], json!({"one":"1","two":"2"}));
    assert!(result["requestId"]
        .as_str()
        .unwrap()
        .starts_with("preview_request_"));
    assert!(!result.to_string().contains("do-not-reflect-credential"));
}

#[tokio::test]
async fn connector_preview_supports_empty_and_inactive_account_states() {
    for (key, expected_count) in [("connector-1", 0), ("connector-2", 1)] {
        let mut request = dashboard_request(DashboardOperation::Toolkit);
        request.resource = Some(key.into());
        let item = Data.execute(request).await.unwrap();
        let connections = item["connections"].as_array().unwrap();
        assert_eq!(connections.len(), expected_count);
        assert!(connections.iter().all(|c| c["status"] != "active"));
    }
}

#[tokio::test]
async fn connector_preview_raw_override_remains_object_only() {
    let make_request = |raw: &str| {
        let mut request = dashboard_request(DashboardOperation::Test);
        request.fields = std::collections::BTreeMap::from([
            ("connectionId".into(), "preview_active_1".into()),
            ("action".into(), "messages.list".into()),
            ("input_raw".into(), raw.into()),
        ]);
        request
            .form_values
            .insert("f.query".into(), vec!["guided".into()]);
        request
    };
    let result = Data
        .execute(make_request(r#"{"query":"raw override"}"#))
        .await
        .unwrap();
    assert_eq!(result["output"]["query"], "raw override");
    for invalid in ["{", "[]", "42", "   "] {
        assert!(matches!(
            Data.execute(make_request(invalid)).await,
            Err(Error::Invalid)
        ));
    }
}

#[tokio::test]
async fn connector_preview_rejects_ineligible_accounts_and_unknown_actions() {
    for (connection, action) in [
        ("preview_inactive", "messages.list"),
        ("unknown", "messages.list"),
        ("preview_active_1", "unknown"),
        ("preview_active_1", "messages.received"),
    ] {
        let mut request = dashboard_request(DashboardOperation::Test);
        request.fields = std::collections::BTreeMap::from([
            ("connectionId".into(), connection.into()),
            ("action".into(), action.into()),
        ]);
        assert!(matches!(Data.execute(request).await, Err(Error::Invalid)));
    }
}

#[test]
fn native_delete_form_receives_an_honest_preview_confirmation() {
    let sheet = preview_response("GET", "/preview/components").unwrap();
    assert!(sheet
        .body
        .contains("method=\"post\" action=\"/preview/delete\""));
    let response = preview_response("POST", "/preview/delete")
        .expect("the component sheet's native form action must resolve");
    assert_eq!(response.status, 200);
    assert!(response.body.contains("Preview confirmation received"));
    assert!(response.body.contains("No data was deleted"));
    assert!(response.body.contains("href=\"/preview/components\""));
    assert!(response
        .headers
        .iter()
        .any(|(key, value)| key == "Content-Type" && value == "text/html; charset=utf-8"));
}

#[test]
fn fixture_routes_require_their_exact_method_and_path() {
    for (method, path) in [
        ("GET", "/preview/delete"),
        ("DELETE", "/preview/delete"),
        ("POST", "/preview/components"),
        ("POST", "/app/connections/delete"),
    ] {
        assert!(preview_response(method, path).is_none());
    }
}
