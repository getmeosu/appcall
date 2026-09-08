use crate::{pages::render, DashboardOperation as Op};
use serde_json::{json, Value};

fn fixture() -> Value {
    json!({"name":"<Provider>","description":"Use <tools>","action":"mail.read",
        "inputSchema":{"type":"object","properties":{"query":{"type":"string"}}},
        "sample":{"query":"O'Brien $HOME `whoami`\n</template><script>"},
        "setup":{"mode":"api_key","help":"Keep <secret>","fields":[{"key":"token","label":"API token","secret":true,"required":true}],"routes":[{"id":"key","label":"Connect with key","fields":[]}]},
        "connections":[{"id":"active_1","connector":"provider","status":"active","authType":"api_key","lastTest":"2026-01-01","displayName":"INVENTED IDENTITY"},{"id":"inactive_2","connector":"provider","status":"disconnected","authType":"oauth2","lastTest":null},{"id":"foreign_3","connector":"other","status":"active"}],
        "connectionId":"active_1","operations":[
            {"name":"mail.write","title":"Write","kind":"action","readOnly":false},
            {"name":"mail.read","title":"Read <mail>","description":"Find <messages>","kind":"action","readOnly":true,"inputSchema":{"type":"object"},"outputSchema":{"type":"array"}},
            {"name":"ping","title":"Ping","kind":"action"},
            {"name":"mail.received","title":"Received <mail>","description":"Declared <event>","kind":"webhook"},
            {"name":"legacy","kind":"trigger"}]})
}

#[test]
fn signal_unnamed_operations_never_select_or_enable_execution() {
    for operation in [
        json!({"kind":"action","title":"Malformed tool"}),
        json!({"kind":"action","name":"","title":"Malformed tool"}),
    ] {
        let mut v = fixture();
        v["action"] = json!("");
        v["operations"] = json!([operation,{"kind":"webhook","title":"Malformed event"}]);
        let html = page(&v);
        let run = html
            .split("id=\"tk-run-control\"")
            .nth(1)
            .unwrap()
            .split("</button>")
            .next()
            .unwrap();
        assert!(run.contains(" disabled"));
        assert!(!html.contains("Malformed tool"));
        assert!(!html.contains("Malformed event"));
        assert!(html.contains("No tool selected"));
    }
}
fn page(v: &Value) -> String {
    render(Op::Toolkit, v, Some("provider")).unwrap()
}

#[test]
fn copy_setup_labels_follow_direct_modes_and_preserve_route_choices() {
    let mut v = fixture();
    v["setup"]["routes"] = json!([]);
    for (mode, label) in [
        ("api_key", "Connect &lt;Provider&gt;"),
        ("oauth2", "Continue to &lt;Provider&gt;"),
        ("external_bearer", "Connect"),
    ] {
        v["setup"]["mode"] = json!(mode);
        let html = page(&v);
        let settings = html.split("id=\"tk-setup\"").nth(1).unwrap();
        assert!(settings.contains(&format!(">{label}</span>")), "{mode}");
        assert!(settings.contains("action=\"/app/toolkits/provider/setup\""));
        assert!(settings.contains("name=\"token\""));
    }
    v["name"] = json!("");
    v["setup"]["mode"] = json!("api_key");
    assert!(page(&v)
        .split("id=\"tk-setup\"")
        .nth(1)
        .unwrap()
        .contains(">Connect</span>"));
    let routed = page(&fixture());
    assert!(routed.contains(">Connect with key</span>"));
    assert!(routed.contains("name=\"route\" type=\"hidden\" value=\"key\""));
    v["setup"]["mode"] = json!("none");
    assert!(!page(&v)
        .split("id=\"tk-setup\"")
        .nth(1)
        .unwrap()
        .contains("/setup\""));
}

#[test]
fn signal_mobile_tool_selection_does_not_compete_with_primary_execution() {
    let html = page(&fixture());
    let selector = html
        .split("id=\"tk-tool-selector\"")
        .nth(1)
        .unwrap()
        .split("</form>")
        .next()
        .unwrap();
    assert!(selector.contains("ui-button-quiet"));
    assert!(!selector.contains("ui-button-primary"));
    assert!(selector.contains("type=\"submit\""));
}

#[test]
fn signal_raw_editor_explains_existing_override_without_conversion() {
    let html = page(&fixture());
    assert!(html.contains("<summary>Edit as JSON</summary>"));
    assert!(html.contains("Replaces the fields above"));
    assert!(html.contains("id=\"tk-input-raw\" name=\"input_raw\""));
    assert!(!html.contains("data-on:toggle"));
}

#[test]
fn signal_destructive_confirmation_is_explicit_and_uses_existing_form() {
    let mut v = fixture();
    v["operations"][1]["destructive"] = json!(true);
    let html = page(&v);
    assert!(html.contains("id=\"tk-run-confirm\""));
    assert!(html.contains("form=\"tk-run-form\""));
    assert!(html.contains("marked destructive and may permanently change data"));
    assert!(html.contains("Run mail.read as active_1"));
    assert_eq!(html.matches("id=\"tk-run-form\"").count(), 1);
    assert!(!page(&fixture()).contains("id=\"tk-run-confirm\""));
    v["connections"] = json!([]);
    assert!(!page(&v).contains("id=\"tk-run-confirm\""));
}

#[test]
fn signal_search_status_and_table_headers_have_semantic_hooks() {
    let html = page(&fixture());
    assert!(html.contains("id=\"tk-tool-filter\""));
    assert!(html.contains("id=\"tk-status\" role=\"status\""));
    assert!(html.contains("<caption class=\"sr-only\">Connector accounts</caption>"));
    assert_eq!(html.matches("<th scope=\"col\">").count(), 4);
}

#[test]
fn dynamic_options_render_a_keyboard_listbox_contract() {
    let html = page(&serde_json::json!({
        "name": "Provider",
        "action": "mail.read",
        "inputSchema":{"type":"object","properties": {
            "actor": {"type":"string","title":"Actor","x-dynamic-options":{"source":"actors.options"}}
        }},
        "sample": {"actor":"actor-1"},
        "operations": [{"name":"mail.read","title":"Read","kind":"action"}],
        "connections": [{"id":"active_1","connector":"provider","status":"active"}]
    }));
    assert!(html.contains("role=\"combobox\""));
    assert!(html.contains("aria-autocomplete=\"list\""));
    assert!(html.contains("aria-controls=\"tk-opts-f.actor\""));
    assert!(html.contains("role=\"listbox\""));
    assert!(html.contains("aria-live=\"polite\""));
    assert!(!html.contains("role=\"option\""));
    assert!(html.contains("data-input-id=\"tk-search-"));

    let loaded = render(
        Op::Options,
        &serde_json::json!({
            "fieldName":"f.actor",
            "key":"provider",
            "detailSource":"actors.options",
            "options":[{"id":"actor-1","name":"Alice"}]
        }),
        None,
    )
    .unwrap();
    assert!(loaded.contains("role=\"listbox\""));
    assert!(loaded.contains("role=\"option\""));
    assert!(loaded.contains("aria-selected=\"false\""));
}

#[test]
fn signal_tabs_and_stable_targets_are_unique_and_accessible() {
    let html = page(&fixture());
    for tab in ["tools", "accounts", "events", "code", "settings"] {
        assert!(
            html.contains(&format!("id=\"tk-tab-{tab}\"")),
            "missing tab {tab}"
        );
        assert!(
            html.contains(&format!("id=\"tk-panel-{tab}\"")),
            "missing panel {tab}"
        );
    }
    for id in [
        "tk-connection",
        "tk-action",
        "tk-test-fields",
        "tk-runinput",
        "tk-test-result",
    ] {
        assert_eq!(html.matches(&format!("id=\"{id}\"")).count(), 1, "{id}");
    }
    for id in ["tk-test-fields", "tk-test-result"] {
        let region = html
            .split(&format!("id=\"{id}\""))
            .nth(1)
            .unwrap()
            .split('>')
            .next()
            .unwrap();
        assert!(region.contains("aria-live=\"polite\""));
        assert!(region.contains("aria-busy=\"false\""));
        assert!(region.contains("aria-labelledby="));
    }
    assert!(html.contains("&lt;Provider&gt;"));
    assert!(html.contains("&lt;messages&gt;"));
    assert!(!html.contains("<script>"));
}

#[test]
fn signal_tools_select_only_active_accounts_and_use_get_selection() {
    let html = page(&fixture());
    assert!(html.contains("<option value=\"active_1\" selected>active_1</option>"));
    assert!(!html.contains("<option value=\"inactive_2\""));
    assert!(!html.contains("foreign_3"));
    assert!(!html.contains("INVENTED IDENTITY"));
    assert!(html.contains("inactive_2"));
    assert!(html.contains("disconnected"));
    assert!(html.contains("2026-01-01"));
    assert!(html.contains("General"));
    assert_eq!(html.matches("class=\"ui-tag\">Read only").count(), 1);
    assert!(html.contains("/app/toolkits/provider?action=mail.read"));
    assert!(!html.contains("/test-form?action="));
    assert!(html.contains("id=\"tk-tool-selector\" method=\"get\""));
    for name in [
        "connectionId",
        "action",
        "callerToken",
        "input_raw",
        "f.query",
    ] {
        assert!(html.contains(&format!("name=\"{name}\"")), "{name}");
    }
    assert!(html.contains("action=\"/app/toolkits/provider/test\""));
    assert!(html.contains("retry:&#39;never&#39;, retryMaxCount:1, openWhenHidden:true, requestCancellation:new AbortController()"));
    assert!(html.contains("Schema"));
    assert!(html.contains("Output schema"));
}

#[test]
fn signal_run_disabled_without_eligible_account_or_action() {
    for accounts in [
        json!([]),
        json!([{"id":"old","connector":"provider","status":"disconnected"}]),
        json!([{"id":"unknown","connector":"provider"}]),
    ] {
        let mut v = fixture();
        v["connections"] = accounts;
        let html = page(&v);
        let run = html
            .split("id=\"tk-run-control\"")
            .nth(1)
            .unwrap()
            .split("</button>")
            .next()
            .unwrap();
        assert!(run.contains(" disabled"));
        assert!(html.contains("tab=settings&amp;action=mail.read#tk-setup"));
    }
    let mut v = fixture();
    v["action"] = json!("");
    v["operations"] = json!([]);
    let html = page(&v);
    assert!(html
        .split("id=\"tk-run-control\"")
        .nth(1)
        .unwrap()
        .split("</button>")
        .next()
        .unwrap()
        .contains(" disabled"));
}

#[test]
fn signal_setup_events_and_none_are_truthful() {
    let html = page(&fixture());
    assert!(html.contains("Keep &lt;secret&gt;"));
    assert!(
        html.contains("name=\"token\" type=\"password\" value=\"\" autocomplete=\"off\" required")
    );
    assert!(html.contains("name=\"route\" type=\"hidden\" value=\"key\""));
    assert!(html.contains("Received &lt;mail&gt;"));
    assert!(html.contains("Declared &lt;event&gt;"));
    assert!(html.contains("/app/triggers?connector=provider"));
    assert!(!html.contains("legacy"));
    let mut v = fixture();
    v["setup"] = json!({"mode":"none"});
    v["connections"] = json!([]);
    let html = page(&v);
    assert!(!html.contains("/app/toolkits/provider/setup"));
    assert!(html.contains("No additional configuration"));
}

#[test]
fn signal_result_shows_output_and_valid_trace_without_fabricated_metrics() {
    let html = render(
        Op::Test,
        &json!({"data":{"requestId":"req-123.a_b","output":{"message":"<ok>"}}}),
        None,
    )
    .unwrap();
    assert!(html.contains("Succeeded"));
    assert!(html.contains("/app/logs/req-123.a_b"));
    assert!(html.contains("id=\"tk-copy-json\""));
    assert!(html.contains("id=\"tk-output-json\" aria-live=\"off\""));
    let output = html.split("id=\"tk-output-json\"").nth(1).unwrap();
    assert!(!output.contains("requestId"));
    assert!(output.contains("&lt;ok&gt;"));
    for invalid in ["", "bad/id", "<script>", &"a".repeat(257)] {
        let html = render(Op::Test, &json!({"requestId":invalid,"output":null}), None).unwrap();
        assert!(!html.contains("/app/logs/"));
    }
    let idle = page(&fixture());
    assert!(idle.contains("Ready to run"));
    assert!(!idle.contains("request cost"));
    assert!(!idle.contains("Duration"));
}

#[test]
fn signal_code_is_a_quoted_sample_with_external_scope_placeholder() {
    let html = page(&fixture());
    assert!(html.contains("/v1/connections/active_1/actions/mail.read"));
    assert!(html.contains("X-API-Key: YOUR_API_KEY"));
    assert!(html.contains("X-External-Account-Id: YOUR_EXTERNAL_ACCOUNT_ID"));
    assert!(html.contains("Content-Type: application/json"));
    assert!(!html.contains("X-External-Account-Id: active_1"));
    assert!(html.contains("O&#39;&quot;&#39;&quot;&#39;Brien $HOME `whoami`"));
    assert!(html.contains("id=\"tk-code-data\""));
    assert!(html.contains("Sample input"));
    assert!(html.contains("&quot;input&quot;"));
    let mut v = fixture();
    v["connections"] = json!([]);
    assert!(page(&v).contains("/v1/connections/YOUR_CONNECTION_ID/actions/mail.read"));
}

#[test]
fn signal_per_call_help_uses_actual_external_bearer_setup_mode() {
    let mut v = fixture();
    v["setup"] = json!({"mode":"external_bearer","fields":[]});
    assert!(page(&v).contains("include X-Connector-Token"));
    assert!(!page(&fixture()).contains("include X-Connector-Token"));
}

#[test]
fn signal_unknown_setup_mode_does_not_offer_an_unsupported_flow() {
    let mut v = fixture();
    v["setup"] = json!({"mode":"invented","help":"<unsupported>"});
    v["connections"] = json!([]);
    let html = page(&v);
    assert!(!html.contains("/app/toolkits/provider/setup"));
    assert!(html.contains("&lt;unsupported&gt;"));
}

#[test]
fn signal_tabs_preserve_only_actual_selection_and_have_one_visible_panel() {
    let mut v = fixture();
    v["tab"] = json!("code");
    v["callerToken"] = json!("NEVER_RENDER_SECRET");
    let html = page(&v);
    assert!(html.contains("tab=accounts&amp;action=mail.read&amp;connectionId=active_1"));
    assert!(html.contains("id=\"tk-panel-code\" class=\"tk-panel\" aria-label=\"Code\">"));
    assert_eq!(html.matches("class=\"tk-panel\"").count(), 5);
    assert_eq!(html.matches(" hidden>").count(), 4);
    assert!(!html.contains("NEVER_RENDER_SECRET"));
    v["tab"] = json!("<unknown>");
    assert!(page(&v).contains("id=\"tk-panel-tools\" class=\"tk-panel\" aria-label=\"Tools\">"));
}

#[test]
fn signal_legacy_fragment_and_multiple_setup_routes_keep_ids_unique() {
    let html=render(Op::TestForm,&json!({"inputSchema":{"type":"object","properties":{"term":{"type":"string"}}},"sample":{"term":"<term>"}}),Some("provider")).unwrap();
    assert!(html.contains("id=\"tk-test-fields\" aria-live=\"polite\""));
    assert!(html.contains("name=\"f.term\""));
    assert!(html.contains("&lt;term&gt;"));
    let mut v = fixture();
    v["setup"]["routes"] = json!([{"id":"one","label":"First","fields":[{"key":"region"}]},{"id":"two","label":"Second","fields":[{"key":"region"}]}]);
    let html = page(&v);
    let ids: Vec<_> = html
        .split(" id=\"")
        .skip(1)
        .map(|v| v.split('"').next().unwrap())
        .collect();
    let unique: std::collections::BTreeSet<_> = ids.iter().collect();
    assert_eq!(ids.len(), unique.len());
    assert_eq!(
        html.matches("action=\"/app/toolkits/provider/setup\"")
            .count(),
        2
    );
}

#[test]
fn signal_code_encodes_action_segments_before_shell_and_html_escaping() {
    let mut v = fixture();
    v["action"] = json!("find/'$`?\n");
    v["operations"][1]["name"] = v["action"].clone();
    let html = page(&v);
    assert!(html.contains("/actions/find%2F%27%24%60%3F%0A"));
    assert!(html.contains("&quot;input&quot;:{&quot;query&quot;:"));
    assert!(html.contains("\\n&lt;/template&gt;&lt;script&gt;"));
}
