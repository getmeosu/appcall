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
