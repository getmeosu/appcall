use appcall_web::*;
use serde_json::json;
use std::collections::BTreeMap;

fn google_workspace_input_schema(operation: &str) -> serde_json::Value {
    let manifest: serde_json::Value =
        serde_json::from_str(include_str!("../../../runner/connectors/google-workspace/manifest.json"))
            .unwrap();
    manifest["operations"][operation]["inputSchema"].clone()
}

#[test]
fn guided_input_uses_schema_types_and_preserves_repeated_key_values() {
    let schema = json!({"type":"object","properties":{"count":{"type":"number"},"enabled":{"type":"boolean"},"emails":{"type":"array","items":{"type":"object","properties":{"email":{"type":"string"}}}},"metadata":{"type":"object"},"nested":{"type":"object","properties":{"title":{"type":"string"}}}}});
    let fields = BTreeMap::from([
        ("f.count".into(), vec!["42".into()]),
        ("f.enabled".into(), vec!["true".into()]),
        (
            "f.emails".into(),
            vec!["a@example.invalid, b@example.invalid".into()],
        ),
        (
            "f.metadata.key".into(),
            vec!["first".into(), "second".into()],
        ),
        ("f.metadata.val".into(), vec!["a".into(), "b".into()]),
        ("f.nested.title".into(), vec!["Hello".into()]),
        ("forged".into(), vec!["ignored".into()]),
    ]);
    assert_eq!(
        assemble_guided_input(&schema, &fields).unwrap(),
        json!({"count":42.0,"enabled":true,"emails":[{"email":"a@example.invalid"},{"email":"b@example.invalid"}],"metadata":{"first":"a","second":"b"},"nested":{"title":"Hello"}})
    );
}

#[test]
fn guided_boolean_values_preserve_omitted_false_and_true_states() {
    let schema = json!({
        "type":"object",
        "required":["required_flag"],
        "properties":{
            "required_flag":{"type":"boolean"},
            "hoist":{"type":"boolean"},
            "mentionable":{"type":"boolean"},
            "enabled":{"type":"boolean"}
        }
    });
    let fields = BTreeMap::from([
        ("f.required_flag".into(), vec!["false".into()]),
        ("f.hoist".into(), vec!["false".into()]),
        ("f.mentionable".into(), vec!["false".into()]),
        ("f.enabled".into(), vec!["true".into()]),
    ]);
    assert_eq!(
        assemble_guided_input(&schema, &fields).unwrap(),
        json!({"required_flag":false,"hoist":false,"mentionable":false,"enabled":true})
    );

    let omitted_optional = BTreeMap::from([("f.required_flag".into(), vec!["false".into()])]);
    assert_eq!(
        assemble_guided_input(&schema, &omitted_optional).unwrap(),
        json!({"required_flag":false})
    );
    let blank_optional = BTreeMap::from([("f.hoist".into(), vec![String::new()])]);
    assert_eq!(
        assemble_guided_input(&schema, &blank_optional).unwrap(),
        json!({})
    );

    for invalid in ["on", "0", "yes", "TRUE"] {
        let fields = BTreeMap::from([("f.hoist".into(), vec![invalid.into()])]);
        assert_eq!(
            assemble_guided_input(&schema, &fields),
            Err(Error::Invalid),
            "{invalid} must not be accepted as a boolean"
        );
    }
}

#[test]
fn guided_google_sheets_rows_preserve_json_cell_values_for_append_and_update() {
    let rows: serde_json::Value =
        serde_json::from_str(r#"[["A, B",42,true,""],["C",false,0],[]]"#).unwrap();
    for operation in ["sheets.values.append", "sheets.values.update"] {
        let schema = google_workspace_input_schema(operation);
        let fields = BTreeMap::from([
            ("f.spreadsheetId".into(), vec!["sheet-123".into()]),
            ("f.range".into(), vec!["Sheet1!A1".into()]),
            ("f.values".into(), vec![rows.to_string()]),
        ]);
        assert_eq!(
            assemble_guided_input(&schema, &fields).unwrap(),
            json!({"spreadsheetId":"sheet-123","range":"Sheet1!A1","values":rows}),
            "{operation} should preserve structured rows"
        );
    }
}

#[test]
fn guided_google_sheets_rows_reject_invalid_json_or_non_array_rows() {
    for operation in ["sheets.values.append", "sheets.values.update"] {
        let schema = google_workspace_input_schema(operation);
        for raw in [r#"[["unterminated"]"#, r#"["not a row"]"#, r#"{"rows":[]}"#] {
            let fields = BTreeMap::from([("f.values".into(), vec![raw.into()])]);
            assert_eq!(
                assemble_guided_input(&schema, &fields),
                Err(Error::Invalid),
                "{operation} should reject {raw}"
            );
        }
    }
}

#[test]
fn guided_google_sheets_rows_omit_empty_values() {
    let schema = google_workspace_input_schema("sheets.values.append");
    let fields = BTreeMap::from([("f.values".into(), vec!["  ".into()])]);
    assert_eq!(assemble_guided_input(&schema, &fields).unwrap(), json!({}));
}

#[test]
fn datastar_patch_escapes_event_html_and_cannot_inject_frames() {
    let result = render_event_patch(
        &json!({"id":"event-1","connector":"<script>\nevent: injected","operation":"received"}),
    )
    .unwrap();
    assert!(result.starts_with("event: datastar-patch-elements\n"));
    assert!(result.contains("data: selector #trigger-rows\n"));
    assert!(result.contains("data: mode prepend\n"));
    assert!(!result.contains("\nevent: injected"));
    assert!(result.contains("&lt;script&gt;"));
}
#[test]
fn guided_input_bounds_duplicates_and_depth() {
    let schema = json!({"type":"object","properties":{"title":{"type":"string"}}});
    let fields = BTreeMap::from([("f.title".into(), vec!["first".into(), "second".into()])]);
    assert!(assemble_guided_input(&schema, &fields).is_err());
    let mut deep = json!({"type":"string"});
    for _ in 0..20 {
        deep = json!({"type":"object","properties":{"nested":deep}})
    }
    assert!(assemble_guided_input(&deep, &BTreeMap::new()).is_err());
}

struct GuidedFixture(serde_json::Value);

async fn action_page(path: &str, data: serde_json::Value) -> String {
    let data = GuidedFixture(data);
    DevelopmentDashboard {
        public_origin: "http://127.0.0.1:5080",
        data: &data,
    }
    .handle(&Request {
        method: "GET",
        path,
        cookies: "",
        origin: None,
        referer: None,
        fields: BTreeMap::new(),
        now: 0,
    })
    .await
    .unwrap()
    .body
}

#[tokio::test]
async fn copy_connection_and_replay_actions_keep_routes() {
    let connections = action_page(
        "/app/connections",
        json!({"connections":[{"id":"conn_1","connector":"provider","status":"active"}]}),
    )
    .await;
    assert!(connections.contains(">Check connection</span>"));
    assert!(connections.contains(">Disconnect</span>"));
    let check = connections
        .split("<form ")
        .find(|form| {
            form.split('>').next().is_some_and(|opening| {
                opening.contains("method=\"post\"")
                    && opening.contains("action=\"/app/connections/conn_1/test\"")
            })
        })
        .expect("native connection check form")
        .split("</form>")
        .next()
        .unwrap();
    assert!(check.contains("ui-button-secondary"));
    assert!(check.contains("type=\"submit\""));
    assert!(connections.contains("action=\"/app/connections/conn_1/test\""));
    assert!(
        !check.contains("data-on:submit"),
        "connection checks must navigate to their redirect or error response"
    );
    assert!(connections.contains("action=\"/app/connections/conn_1/disconnect\""));
    let event = json!({"id":"evt_1"});
    let initial = action_page("/app/events", json!({"events":[event.clone()]})).await;
    let streamed = render_event_patch(&event).unwrap();
    let trace = action_page(
        "/app/logs/request_1",
        json!({"requestId":"request_1","replayAvailable":true}),
    )
    .await;
    for (html, route) in [
        (&initial, "/app/events/evt_1/replay"),
        (&streamed, "/app/events/evt_1/replay"),
        (&trace, "/app/logs/request_1/replay"),
    ] {
        assert!(html.contains(">Run this again</span>"));
        assert!(html.contains(&format!("method=\"post\" action=\"{route}\"")));
    }
}

fn assert_confirmation(html: &str, heading: &str, body: &str, route: &str) -> String {
    assert!(html.contains(heading));
    assert!(html.contains(body));
    assert!(html.contains(">Cancel</span>"));
    assert!(!html.contains("window.confirm"));
    let id = html
        .split("<dialog id=\"")
        .nth(1)
        .expect("confirmation dialog")
        .split('"')
        .next()
        .unwrap();
    assert!(html.contains(&format!("data-confirm-open=\"{id}\"")));
    assert!(html.contains(&format!(
        "form=\"{id}-form\" formaction=\"{route}\" formmethod=\"post\""
    )));
    assert!(html.contains(&format!(
        "<form id=\"{id}-form\" method=\"post\" action=\"{route}\"></form>"
    )));
    let dialog = html
        .split("<dialog ")
        .nth(1)
        .unwrap()
        .split("</dialog>")
        .next()
        .unwrap();
    assert!(!dialog.contains("<form"));
    id.to_owned()
}

#[tokio::test]
async fn copy_confirmations_name_targets_without_provider_promises() {
    let connections = action_page(
        "/app/connections",
        json!({"connections":[{"id":"conn_1","connector":"provider","status":"active"}]}),
    )
    .await;
    assert_confirmation(
        &connections,
        "Disconnect provider connection conn_1?",
        "Tool runs for provider connection conn_1 will stop until you reconnect it.",
        "/app/connections/conn_1/disconnect",
    );
    let trace = action_page(
        "/app/logs/request_1",
        json!({"requestId":"request_1","replayAvailable":true}),
    )
    .await;
    assert_confirmation(&trace, "Run this tool again?", "Run the tool for recorded request request_1 again using saved input? This creates another tool execution and may repeat changes at the provider.", "/app/logs/request_1/replay");
    let event = json!({"id":"evt_1"});
    let initial = action_page("/app/events", json!({"events":[event.clone()]})).await;
    let first = render_event_patch(&event).unwrap();
    let second = render_event_patch(&event).unwrap();
    let ids: std::collections::BTreeSet<_> = [&initial, &first, &second]
        .into_iter()
        .map(|html| {
            assert_confirmation(
                html,
                "Dispatch this event again?",
                "Dispatch event evt_1 again? Consumers may process the event again.",
                "/app/events/evt_1/replay",
            )
        })
        .collect();
    assert_eq!(
        ids.len(),
        3,
        "independently rendered occurrences must not share dialog associations"
    );
}

#[tokio::test]
async fn copy_empty_events_first_and_second_patch_preserve_rows() {
    let data = GuidedFixture(json!({"events":[]}));
    let initial = DevelopmentDashboard {
        public_origin: "http://127.0.0.1:5080",
        data: &data,
    }
    .handle(&Request {
        method: "GET",
        path: "/app/events",
        cookies: "",
        origin: None,
        referer: None,
        fields: BTreeMap::new(),
        now: 0,
    })
    .await
    .unwrap()
    .body;
    assert_eq!(initial.matches("@get('/app/events/stream')").count(), 1);
    let mut tbody = initial
        .split("<tbody id=\"trigger-rows\"")
        .nth(1)
        .unwrap()
        .split_once('>')
        .unwrap()
        .1
        .split("</tbody>")
        .next()
        .unwrap()
        .to_owned();
    assert!(tbody.contains("id=\"trigger-empty-state\""));
    assert!(tbody.contains("colspan=\"5\""));
    assert!(tbody.contains("No webhook events to show."));
    // Apply the actual frame modes to a bounded table-body string model. Browser
    // qualification separately verifies these frames against bundled Datastar.
    for id in ["first", "second"] {
        let frames = render_event_patch(&json!({"id":id,"connector":id})).unwrap();
        for frame in frames.split("\n\n").filter(|f| !f.is_empty()) {
            let lines: Vec<_> = frame.lines().collect();
            if lines.contains(&"data: mode prepend") {
                assert!(lines.contains(&"data: selector #trigger-rows"));
                let html = lines
                    .iter()
                    .filter_map(|line| line.strip_prefix("data: elements "))
                    .collect::<Vec<_>>()
                    .join("\n");
                tbody.insert_str(0, &html);
            } else if lines.contains(&"data: mode remove") {
                assert!(lines.contains(&"data: selector #trigger-empty-state"));
                if let Some(start) = tbody.find("<tr id=\"trigger-empty-state\"") {
                    let end = start + tbody[start..].find("</tr>").unwrap() + 5;
                    tbody.replace_range(start..end, "");
                }
            } else {
                panic!("unexpected event frame: {frame}");
            }
        }
        assert!(!tbody.contains("No webhook events to show."));
        assert!(!tbody.contains("trigger-empty-state"));
        assert!(tbody.contains("/app/events/first/replay"));
    }
    assert!(tbody.contains("/app/events/second/replay"));
    assert!(
        tbody.find("/app/events/second/replay").unwrap()
            < tbody.find("/app/events/first/replay").unwrap()
    );
    // Rows now inherit table styling; an opening tag need not have attributes.
    assert_eq!(tbody.matches("</tr>").count(), 2);
    for id in ["../bad", "bad/id", "<event>", "a?b", "a b"] {
        let initial = action_page(
            "/app/events",
            json!({"events":[{"id":id,"connector":"<connector>"}]}),
        )
        .await;
        assert!(initial.contains("Replay unavailable"), "{id}");
        assert!(initial.contains("&lt;connector&gt;"), "{id}");
        assert!(
            !initial.contains(&format!("/app/events/{id}/replay")),
            "{id}"
        );
        let streamed = render_event_patch(&json!({
            "id": id,
            "connector": "<connector>",
        }))
        .unwrap();
        assert!(streamed.contains("Replay unavailable"), "{id}");
        assert!(streamed.contains("&lt;connector&gt;"), "{id}");
        assert!(
            !streamed.contains(&format!("/app/events/{id}/replay")),
            "{id}"
        );
    }
    let oversized = "x".repeat(1025);
    for invalid in [
        json!({}),
        json!({"id": null}),
        json!({"id": 42}),
        json!({"id": ""}),
        json!({"id": "a\nevent: injected"}),
        json!({"id": oversized}),
    ] {
        assert_eq!(render_event_patch(&invalid), Err(Error::Invalid));
    }
}

impl DashboardData for GuidedFixture {
    fn execute(
        &self,
        _: DashboardRequest,
    ) -> std::pin::Pin<
        Box<dyn std::future::Future<Output = Result<serde_json::Value, Error>> + Send + '_>,
    > {
        Box::pin(async { Ok(self.0.clone()) })
    }
}
async fn guided_html(schema: serde_json::Value, sample: serde_json::Value) -> String {
    let data = GuidedFixture(json!({"inputSchema":schema,"sample":sample}));
    DevelopmentDashboard {
        public_origin: "http://127.0.0.1:5080",
        data: &data,
    }
    .handle(&Request {
        method: "GET",
        path: "/app/connectors/provider/test-form",
        cookies: "",
        origin: None,
        referer: None,
        fields: BTreeMap::new(),
        now: 0,
    })
    .await
    .unwrap()
    .body
}

#[tokio::test]
async fn guided_google_sheets_rows_render_as_identified_json_textareas() {
    for operation in ["sheets.values.append", "sheets.values.update"] {
        let html = guided_html(
            google_workspace_input_schema(operation),
            json!({"values":[["A, B",42,true,""],[]]}),
        )
        .await;
        let control = html
            .split("name=\"f.values\"")
            .nth(1)
            .expect("guided values control")
            .split("</textarea>")
            .next()
            .unwrap();
        assert!(control.contains("<textarea class=\"ui-control\""));
        assert!(html.contains("JSON rows"), "{operation} should identify JSON rows");
        assert!(html.contains("commas"), "{operation} should explain comma preservation");
        assert!(html.contains("empty strings"), "{operation} should explain empty cells");
    }
}

fn rendered_select_option(html: &str, name: &str, label: &str) -> String {
    let control = html
        .split(&format!("name=\"{name}\""))
        .nth(1)
        .unwrap()
        .split("</select>")
        .next()
        .unwrap();
    let option = control
        .split("</option>")
        .find(|option| option.ends_with(&format!(">{label}")))
        .unwrap();
    option
        .split("value=\"")
        .nth(1)
        .unwrap()
        .split('"')
        .next()
        .unwrap()
        .to_owned()
}

#[tokio::test]
async fn toolkit_guided_field_accessibility() {
    let html = guided_html(json!({"type":"object","required":["body","recipient_email"],"properties":{
        "body":{"type":"string","format":"textarea","description":"Use <plain text>"},
        "recipient_email":{"type":"string","title":"Recipient","description":"Delivery address","examples":["person@example.invalid"]},
        "threadID":{"type":"string"},"send_copy":{"type":"boolean"}}}),json!({"body":"Hello\nworld"})).await;
    assert!(html.contains("class=\"ui-control\""));
    assert!(html.contains(
        "for=\"tk-field-662e726563697069656e745f656d61696c\">Recipient (Required)</label>"
    ));
    assert!(html.contains("aria-describedby=\"tk-field-662e626f6479-help\""));
    assert!(html.contains("id=\"tk-field-662e626f6479-help\""));
    assert!(html.contains("Use &lt;plain text&gt;"));
    assert!(html.contains("<textarea class=\"ui-control\" id=\"tk-field-662e626f6479\""));
    assert!(html.contains("placeholder=\"person@example.invalid\""));
    assert!(html.contains("for=\"tk-field-662e7468726561644944\">Thread ID</label>"));
    assert!(
        html.find("name=\"f.recipient_email\"").unwrap() < html.find("name=\"f.body\"").unwrap()
    );
    let optional = html.find("<summary>More options</summary>").unwrap();
    assert!(optional > html.find("name=\"f.body\"").unwrap());
    assert!(optional < html.find("name=\"f.threadID\"").unwrap());
    assert_eq!(html.matches("placeholder=").count(), 1);
    assert!(!html.contains("dusk-blue"));
    // Required is schema metadata, not a newly imposed browser gate that would
    // block the pre-existing raw JSON override path.
    assert!(!html.contains(" required>"));
    assert!(!html.contains(" required "));
}

#[tokio::test]
async fn guided_number_control_accepts_decimal_values_with_any_step() {
    let html = guided_html(
        json!({"type":"object","required":["amount"],"properties":{"amount":{"type":"number"}}}),
        json!({"amount":1.5}),
    )
    .await;
    assert!(html.contains("name=\"f.amount\" type=\"number\" step=\"any\" value=\"1.5\""));
    assert!(!html.contains(" required>"));
    assert!(!html.contains(" required "));
}

#[tokio::test]
async fn guided_integer_control_keeps_integral_native_constraint() {
    let html = guided_html(
        json!({"type":"object","properties":{"count":{"type":"integer"}}}),
        json!({"count":2}),
    )
    .await;
    assert!(html.contains("name=\"f.count\" type=\"number\" step=\"1\" value=\"2\""));
    assert!(!html.contains("name=\"f.count\" type=\"number\" step=\"any\""));
}

#[tokio::test]
async fn guided_decimal_schema_keeps_raw_json_override_unblocked() {
    let html = guided_html(
        json!({"type":"object","required":["latitude","amount"],"properties":{
            "latitude":{"type":"number"},
            "amount":{"type":"number"}
        }}),
        json!({}),
    )
    .await;
    assert!(html.contains("name=\"f.latitude\" type=\"number\" step=\"any\" value=\"\""));
    assert!(html.contains("name=\"f.amount\" type=\"number\" step=\"any\" value=\"\""));
    assert!(html.contains("name=\"input_raw\""));
    assert!(!html.contains("name=\"f.latitude\" type=\"number\" step=\"any\" value=\"\" required"));
    assert!(!html.contains("name=\"f.amount\" type=\"number\" step=\"any\" value=\"\" required"));
}

#[tokio::test]
async fn guided_enum_options_preserve_literal_null_and_selected_numeric_values() {
    let html = guided_html(
        json!({"type":"object","properties":{"mode":{"type":"string","enum":[null,2,"<x>"]}}}),
        json!({"mode":2}),
    )
    .await;
    assert!(html.contains("<option value=\"null\">null</option>"));
    assert!(html.contains("<option value=\"2\" selected>2</option>"));
    assert!(html.contains("<option value=\"&lt;x&gt;\">&lt;x&gt;</option>"));
}

#[tokio::test]
async fn guided_presentation_ids_do_not_collide_with_schema_keys_or_dynamic_targets() {
    let html = guided_html(
        json!({"type":"object","properties":{
            "foo":{"type":"string","description":"Help"},"foo-help":{"type":"string"},
            "foo-error":{"type":"string"},"actor-search":{"type":"string"},
            "actor":{"type":"string","x-dynamic-options":{"source":"actors.options"}},
            "metadata":{"type":"object"},"metadata.key.0":{"type":"string"}
        }}),
        json!({}),
    )
    .await;
    let ids: Vec<_> = html
        .split(" id=\"")
        .skip(1)
        .map(|rest| rest.split('"').next().unwrap())
        .collect();
    let unique: std::collections::BTreeSet<_> = ids.iter().collect();
    assert_eq!(ids.len(), unique.len(), "{ids:?}");
    assert!(html.contains("id=\"f.actor\" name=\"f.actor\" type=\"hidden\""));
    assert!(html.contains("id=\"tk-opts-f.actor\""));
}

#[tokio::test]
async fn guided_nested_map_boolean_and_dynamic_fields_preserve_submission_contracts() {
    let html = guided_html(json!({"type":"object","required":["enabled","actor"],"properties":{
        "enabled":{"type":"boolean"},"metadata":{"type":"object"},
        "nested":{"type":"object","properties":{"message_text":{"type":"string"}}},
        "actor":{"type":"string","title":"Actor \"<name>","description":"Pick <actor>","x-dynamic-options":{"source":"actors.'<options>","detailSource":"actors.input_schema"}}
    }}),json!({"enabled":true,"actor":"a\"&<b>"})).await;
    assert!(html.contains("<fieldset"));
    assert_eq!(html.matches("name=\"f.metadata.key\"").count(), 3);
    assert_eq!(html.matches("name=\"f.metadata.val\"").count(), 3);
    assert!(html.contains("name=\"f.nested.message_text\""));
    let boolean = html
        .split("id=\"tk-field-662e656e61626c6564\"")
        .nth(1)
        .unwrap()
        .split("</select>")
        .next()
        .unwrap();
    assert!(boolean.contains("name=\"f.enabled\""));
    assert!(boolean.contains("<option value=\"true\" selected>true</option>"));
    assert!(boolean.contains("<option value=\"false\">false</option>"));
    assert!(!boolean.contains(" required"));
    assert!(html.contains("name=\"f.actor\" type=\"hidden\" value=\"a&quot;&amp;&lt;b&gt;\""));
    assert!(html.contains("data-options-source=\"/app/connectors/provider/options?"));
    assert!(html.contains("source=actors.%27%3Coptions%3E"));
    assert!(html.contains("Actor &quot;&lt;name&gt; (Required)"));
    assert!(html.contains("evt.target.dataset.optionsSource"));
    assert!(html.contains("getElementById(&#39;tk-connection&#39;)"));
    assert!(html.contains("id=\"tk-opts-f.actor\""));
    assert!(html.contains("aria-describedby=\"tk-search-662e6163746f72-help\""));
    assert!(!html.contains("@get(&#39;/app/connectors"));
}

#[tokio::test]
async fn guided_boolean_controls_offer_omit_true_and_false_choices() {
    let html = guided_html(
        json!({"type":"object","required":["required_flag"],"properties":{
            "required_flag":{"type":"boolean"},
            "hoist":{"type":"boolean","title":"Hoist"},
            "mentionable":{"type":"boolean","title":"Mentionable"}
        }}),
        json!({"required_flag":true}),
    )
    .await;
    for name in ["required_flag", "hoist", "mentionable"] {
        let control = html
            .split(&format!("name=\"f.{name}\""))
            .nth(1)
            .unwrap()
            .split("</select>")
            .next()
            .unwrap();
        assert!(
            control.contains("<option value=\"\"") && control.contains(">Omit</option>"),
            "{name}: {control}"
        );
        assert!(
            control.contains("<option value=\"true\"") && control.contains(">true</option>"),
            "{name}"
        );
        assert!(
            control.contains("<option value=\"false\">false</option>"),
            "{name}"
        );
    }
    assert!(!html.contains("type=\"checkbox\""));
    assert!(html.contains("<option value=\"true\" selected>true</option>"));
}

#[tokio::test]
async fn guided_boolean_enum_options_only_offer_declared_values() {
    for (allowed, forbidden) in [("true", "false"), ("false", "true")] {
        let html = guided_html(
            json!({"type":"object","properties":{"flag":{"type":"boolean","enum":[allowed == "true"]}}}),
            json!({}),
        )
        .await;
        let control = html
            .split("name=\"f.flag\"")
            .nth(1)
            .unwrap()
            .split("</select>")
            .next()
            .unwrap();
        assert!(control.contains("<option value=\"\" selected>Omit</option>"));
        assert!(control.contains(&format!("<option value=\"{allowed}\">{allowed}</option>")));
        assert!(!control.contains(&format!(
            "<option value=\"{forbidden}\">{forbidden}</option>"
        )));
    }
}

#[tokio::test]
async fn guided_boolean_rendered_controls_submit_false_and_omit_optional_fields() {
    let schema = json!({"type":"object","required":["required_flag"],"properties":{
        "required_flag":{"type":"boolean"},
        "hoist":{"type":"boolean"},
        "mentionable":{"type":"boolean"}
    }});
    let html = guided_html(schema.clone(), json!({})).await;
    let fields = BTreeMap::from([
        (
            "f.required_flag".into(),
            vec![rendered_select_option(&html, "f.required_flag", "false")],
        ),
        (
            "f.hoist".into(),
            vec![rendered_select_option(&html, "f.hoist", "false")],
        ),
        (
            "f.mentionable".into(),
            vec![rendered_select_option(&html, "f.mentionable", "Omit")],
        ),
    ]);
    assert_eq!(
        assemble_guided_input(&schema, &fields).unwrap(),
        json!({"required_flag":false,"hoist":false})
    );
}
