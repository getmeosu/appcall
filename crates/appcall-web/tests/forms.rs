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
