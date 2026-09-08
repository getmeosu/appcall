use appcall_web::*;
use serde_json::json;
use std::collections::BTreeMap;
#[test]
fn guided_input_uses_schema_types_and_preserves_repeated_key_values() {
    let schema = json!({"type":"object","properties":{"count":{"type":"number"},"enabled":{"type":"boolean"},"emails":{"type":"array","items":{"type":"object","properties":{"email":{"type":"string"}}}},"metadata":{"type":"object"},"nested":{"type":"object","properties":{"title":{"type":"string"}}}}});
    let fields = BTreeMap::from([
        ("f.count".into(), vec!["42".into()]),
        ("f.enabled".into(), vec!["on".into()]),
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
fn datastar_patch_escapes_event_html_and_cannot_inject_frames() {
    let result = render_trigger_patch(
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
        "/app/auth-configs",
        json!({"connections":[{"id":"conn_1"}]}),
    )
    .await;
    assert!(connections.contains(">Check connection</span>"));
    assert!(connections.contains(">Disconnect</span>"));
    let check = connections
        .split("<form ")
        .find(|form| form.starts_with("method=\"post\" action=\"/app/auth-configs/conn_1/test\""))
        .expect("native connection check form")
        .split("</form>")
        .next()
        .unwrap();
    assert!(check.contains("ui-button-secondary"));
    assert!(check.contains("type=\"submit\""));
    assert!(connections.contains("action=\"/app/auth-configs/conn_1/test\""));
    assert!(
        !check.contains("data-on:submit"),
        "connection checks must navigate to their redirect or error response"
    );
    assert!(connections.contains("action=\"/app/auth-configs/conn_1/disconnect\""));
    let event = json!({"id":"evt_1"});
    let initial = action_page("/app/triggers", json!({"events":[event.clone()]})).await;
    let streamed = render_trigger_patch(&event).unwrap();
    let trace = action_page(
        "/app/logs/request_1",
        json!({"requestId":"request_1","replayAvailable":true}),
    )
    .await;
    for (html, route) in [
        (&initial, "/app/triggers/evt_1/replay"),
        (&streamed, "/app/triggers/evt_1/replay"),
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
        "/app/auth-configs",
        json!({"connections":[{"id":"conn_1"}]}),
    )
    .await;
    assert_confirmation(
        &connections,
        "Disconnect this connection?",
        "Disconnect connection conn_1? Tool runs require an active connection.",
        "/app/auth-configs/conn_1/disconnect",
    );
    let trace = action_page(
        "/app/logs/request_1",
        json!({"requestId":"request_1","replayAvailable":true}),
    )
    .await;
    assert_confirmation(&trace, "Run this tool again?", "Run the tool for recorded request request_1 again using saved input? This creates another tool execution and may repeat changes at the provider.", "/app/logs/request_1/replay");
    let event = json!({"id":"evt_1"});
    let initial = action_page("/app/triggers", json!({"events":[event.clone()]})).await;
    let first = render_trigger_patch(&event).unwrap();
    let second = render_trigger_patch(&event).unwrap();
    let ids: std::collections::BTreeSet<_> = [&initial, &first, &second]
        .into_iter()
        .map(|html| {
            assert_confirmation(
                html,
                "Dispatch this event again?",
                "Dispatch event evt_1 again? Consumers may process the event again.",
                "/app/triggers/evt_1/replay",
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
        path: "/app/triggers",
        cookies: "",
        origin: None,
        referer: None,
        fields: BTreeMap::new(),
        now: 0,
    })
    .await
    .unwrap()
    .body;
    assert_eq!(initial.matches("@get('/app/triggers/stream')").count(), 1);
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
        let frames = render_trigger_patch(&json!({"id":id,"connector":id})).unwrap();
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
        assert!(tbody.contains("/app/triggers/first/replay"));
    }
    assert!(tbody.contains("/app/triggers/second/replay"));
    assert!(
        tbody.find("/app/triggers/second/replay").unwrap()
            < tbody.find("/app/triggers/first/replay").unwrap()
    );
    // Rows now inherit table styling; an opening tag need not have attributes.
    assert_eq!(tbody.matches("</tr>").count(), 2);
    for invalid in ["", "../bad", "a\nevent: injected"] {
        assert_eq!(
            render_trigger_patch(&json!({"id":invalid})),
            Err(Error::Invalid)
        );
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
        path: "/app/toolkits/provider/test-form",
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
async fn guided_number_control_keeps_native_type_without_new_step_constraints() {
    let html = guided_html(
        json!({"type":"object","required":["amount"],"properties":{"amount":{"type":"number"}}}),
        json!({"amount":1.5}),
    )
    .await;
    assert!(html.contains("name=\"f.amount\" type=\"number\" value=\"1.5\""));
    assert!(!html.contains(" step="));
    assert!(!html.contains(" required>"));
    assert!(!html.contains(" required "));
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
    let checkbox = html
        .split("id=\"tk-field-662e656e61626c6564\"")
        .nth(1)
        .unwrap()
        .split('>')
        .next()
        .unwrap();
    assert!(checkbox.contains("type=\"checkbox\" value=\"true\" checked"));
    assert!(!checkbox.contains(" required"));
    assert!(html.contains("name=\"f.actor\" type=\"hidden\" value=\"a&quot;&amp;&lt;b&gt;\""));
    assert!(html.contains("data-options-source=\"/app/toolkits/provider/options?"));
    assert!(html.contains("source=actors.%27%3Coptions%3E"));
    assert!(html.contains("Actor &quot;&lt;name&gt; (Required)"));
    assert!(html.contains("evt.target.dataset.optionsSource"));
    assert!(html.contains("getElementById(&#39;tk-connection&#39;)"));
    assert!(html.contains("id=\"tk-opts-f.actor\""));
    assert!(html.contains("aria-describedby=\"tk-search-662e6163746f72-help\""));
    assert!(!html.contains("@get(&#39;/app/toolkits"));
}
