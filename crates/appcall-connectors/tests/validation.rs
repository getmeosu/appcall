use appcall_connectors::{Connector, ErrorCode, Operation, Registry};
use serde_json::{json, Value};
fn manifest() -> Value {
    json!({"key":"validate","name":"Test","version":"1","runtime":"bun","auth":{"type":"api_key","setup":{"mode":"api_key","fields":[{"key":"user","label":"User","required":true},{"key":"password","label":"Password","required":true,"secret":true}],"derive":[{"field":"basicAuth","kind":"basic","from":["user","password"]}]}},"network":{"allowedHosts":["{{ user }}","*.example.com"]},"models":["item"],"operations":{"read":{"kind":"action","timeoutMs":10,"maxInputBytes":1000,"maxResponseBytes":1000}}})
}
fn parse(v: &Value) -> Result<Connector, appcall_connectors::Error> {
    Connector::from_bytes(&serde_json::to_vec(v).unwrap())
}
#[test]
fn setup_and_visibility_match_go_policy() {
    let mut v = manifest();
    v["visibility"] = json!("internal");
    let c = parse(&v).unwrap();
    let registry = Registry::from_connectors([c]).unwrap();
    assert!(registry.public_list().next().is_none());
    assert_eq!(
        registry.public_connector("validate").unwrap_err().code(),
        ErrorCode::UnknownConnector
    );
    assert_eq!(
        registry.credential_fields("validate").unwrap(),
        vec!["basicAuth", "password", "user"]
    );
    for (target, replacement) in [
        ("from", json!(["user", "unknown"])),
        ("kind", json!("shell")),
        ("field", json!("user")),
    ] {
        let mut bad = v.clone();
        bad["auth"]["setup"]["derive"][0][target] = replacement;
        assert_eq!(parse(&bad).unwrap_err().code(), ErrorCode::InvalidManifest);
    }
    let mut no_mode = v.clone();
    no_mode["auth"]["setup"]["mode"] = json!("");
    assert!(parse(&no_mode).is_err());
    let mut no_fields = v.clone();
    no_fields["auth"]["setup"] = json!({"mode":"api_key"});
    assert!(parse(&no_fields).is_err());
    let mut routes = v.clone();
    routes["auth"]["setup"] = json!({"mode":"api_key","routes":[{"id":"same","label":"A","fields":[{"key":"a","label":"A"}]},{"id":"same","label":"B","fields":[{"key":"b","label":"B"}]}]});
    assert!(parse(&routes).is_err());
}
#[test]
fn network_and_oauth_urls_cannot_broaden_egress() {
    for host in [
        "*.com",
        "*",
        "https://example.com",
        "example.com:443",
        "{{sub}}.example.com",
        "a..com",
        "-a.com",
    ] {
        let mut v = manifest();
        v["network"]["allowedHosts"] = json!([host]);
        assert!(parse(&v).is_err(), "{host}");
    }
    let mut v = manifest();
    v["network"] = json!({"allowedHosts":["provider.example"]});
    v["auth"]["oauth"] = json!({"authorizeUrl":"https://provider.example/authorize","tokenUrl":"https://provider.example/token","clientAuth":"basic","supportsRefresh":true});
    assert!(parse(&v).is_ok());
    for url in [
        "http://provider.example/token",
        "https://evil.example/token",
    ] {
        v["auth"]["oauth"]["tokenUrl"] = json!(url);
        assert!(parse(&v).is_err());
    }
    let mut v = manifest();
    v["auth"]["setup"]["docsUrl"] = json!("javascript:SECRET");
    assert!(parse(&v).is_err());
}
#[test]
fn operation_validation_enforces_current_schema_contract() {
    let schema = json!({"type":"object","required":["rows"],"additionalProperties":false,"properties":{"rows":{"type":"array","minItems":1,"items":{"type":"object","required":["name"],"properties":{"name":{"type":"string","minLength":2},"kind":{"enum":["a","b"]}},"additionalProperties":false}}}});
    let op = Operation {
        input_schema: Some(schema.clone()),
        output_schema: Some(schema),
        ..Default::default()
    };
    assert!(op
        .validate_input(&json!({"rows":[{"name":"é日","kind":"a"}]}))
        .is_ok());
    for input in [
        json!(null),
        json!({}),
        json!({"rows":[]}),
        json!({"rows":[{"name":"a"}]}),
        json!({"rows":[{"name":"good","kind":"invalid"}]}),
        json!({"rows":[{"name":"good"}],"apiKey":"smuggled"}),
    ] {
        assert_eq!(
            op.validate_input(&input).unwrap_err().code(),
            ErrorCode::InvalidInput
        );
        assert_eq!(
            op.validate_output(&input).unwrap_err().code(),
            ErrorCode::InvalidOutput
        );
    }
    let op = Operation {
        input_schema: Some(json!({"$ref":"https://evil.example/schema"})),
        ..Default::default()
    };
    assert_eq!(
        op.validate_input(&json!({})).unwrap_err().code(),
        ErrorCode::UnsupportedSchema
    );
}

#[test]
fn operation_budgets_above_the_runner_contract_are_rejected() {
    for (field, value) in [
        ("timeoutMs", json!(300_001)),
        ("maxInputBytes", json!(26_214_401)),
        ("maxResponseBytes", json!(52_428_801)),
    ] {
        let mut unsupported = manifest();
        unsupported["operations"]["read"][field] = value;
        assert_eq!(
            parse(&unsupported).unwrap_err().code(),
            ErrorCode::InvalidManifest,
            "{field} must not be accepted above the supported contract"
        );
    }
}

#[test]
fn api_docker_build_context_copies_the_canonical_budget_contract() {
    let dockerfile = include_str!("../../../Dockerfile.api");
    assert!(
        dockerfile.lines().any(|line| {
            line.trim() == "COPY runner/budget-contract.json ./runner/budget-contract.json"
        }),
        "Dockerfile.api must copy the contract at the path used by include_str!"
    );
}

#[test]
fn runner_docker_build_context_copies_the_canonical_budget_contract() {
    let dockerfile = include_str!("../../../Dockerfile.runner");
    assert!(
        dockerfile.lines().any(|line| {
            line.trim() == "COPY runner/budget-contract.json /app/runner/budget-contract.json"
        }),
        "Dockerfile.runner must copy the contract at the path used by the Bun import"
    );
}

#[test]
fn unsupported_nested_schema_is_never_silently_ignored() {
    let op = Operation {
        input_schema: Some(json!({"type":"object","properties":{"optional":{"pattern":"SECRET"}}})),
        ..Default::default()
    };
    assert_eq!(
        op.validate_input(&json!({})).unwrap_err().code(),
        ErrorCode::UnsupportedSchema
    );
}

#[test]
fn numeric_enums_match_javascript_without_losing_large_integer_precision() {
    let op = Operation {
        input_schema: Some(json!({"type":"integer","enum":[1,2,3,4]})),
        ..Default::default()
    };
    assert!(op.validate_input(&json!(1.0)).is_ok());
    let op = Operation {
        input_schema: Some(json!({"enum":[9007199254740993_u64]})),
        ..Default::default()
    };
    assert!(op.validate_input(&json!(9007199254740992.0_f64)).is_err());
    for (allowed, input) in [
        (json!(0), json!(-0.0)),
        (json!(1000), serde_json::from_str("1e3").unwrap()),
        (json!({"items":[1,2]}), json!({"items":[1.0,2.0]})),
        (
            json!(1e-20),
            serde_json::from_str("0.00000000000000000001").unwrap(),
        ),
    ] {
        let op = Operation {
            input_schema: Some(json!({"enum":[allowed]})),
            ..Default::default()
        };
        assert!(op.validate_input(&input).is_ok());
    }
}

#[test]
fn connector_icons_are_https_urls_from_provider_hosts_not_bundled_assets() {
    let mut v = manifest();
    v["network"]["allowedHosts"] = json!(["api.github.com"]);
    let github = parse(&v).unwrap();
    assert_eq!(
        github.manifest().brand_host().as_deref(),
        Some("github.com")
    );
    assert_eq!(
        github.manifest().resolved_icon_url().as_deref(),
        Some("https://github.com/favicon.ico")
    );

    v["network"]["allowedHosts"] = json!(["slack.com"]);
    assert_eq!(
        parse(&v).unwrap().manifest().resolved_icon_url().as_deref(),
        Some("https://slack.com/favicon.ico")
    );

    v["iconUrl"] = json!("https://cdn.example/slack.png");
    assert_eq!(
        parse(&v).unwrap().manifest().resolved_icon_url().as_deref(),
        Some("https://cdn.example/slack.png")
    );

    v["iconUrl"] = json!("javascript:alert(1)");
    assert_eq!(parse(&v).unwrap_err().field(), "iconUrl");
    v["iconUrl"] = json!("http://slack.com/favicon.ico");
    assert_eq!(parse(&v).unwrap_err().field(), "iconUrl");

    let mut docs_only = manifest();
    docs_only["network"] = json!({"egress":"none","allowedHosts":[]});
    docs_only["auth"]["setup"]["docsUrl"] = json!("https://www.notion.so/help");
    assert_eq!(
        parse(&docs_only)
            .unwrap()
            .manifest()
            .resolved_icon_url()
            .as_deref(),
        Some("https://notion.so/favicon.ico")
    );

    let mut templated = manifest();
    templated["network"]["allowedHosts"] = json!(["{{ user }}", "*.example.com"]);
    assert_eq!(
        parse(&templated)
            .unwrap()
            .manifest()
            .resolved_icon_url()
            .as_deref(),
        Some("https://example.com/favicon.ico")
    );

    let mut tenant = manifest();
    tenant["network"]["allowedHosts"] = json!(["*.bamboohr.com"]);
    assert_eq!(
        parse(&tenant).unwrap().manifest().brand_host().as_deref(),
        Some("bamboohr.com")
    );

    let mut algolia = manifest();
    algolia["network"]["allowedHosts"] = json!(["*.algolia.net"]);
    assert_eq!(
        parse(&algolia)
            .unwrap()
            .manifest()
            .resolved_icon_url()
            .as_deref(),
        Some("https://algolia.net/favicon.ico")
    );

    let mut self_hosted = manifest();
    self_hosted["key"] = json!("gitlab");
    self_hosted["network"]["allowedHosts"] = json!(["{{host}}"]);
    assert_eq!(
        parse(&self_hosted)
            .unwrap()
            .manifest()
            .resolved_icon_url()
            .as_deref(),
        Some("https://gitlab.com/favicon.ico")
    );

    let mut utility = manifest();
    utility["key"] = json!("csv");
    utility["network"] = json!({"egress":"none","allowedHosts":[]});
    assert_eq!(
        parse(&utility)
            .unwrap()
            .manifest()
            .resolved_icon_url()
            .as_deref(),
        Some("https://github.com/getmeosu.png")
    );
}

#[test]
fn effect_policy_reconcile_requires_read_ish_target() {
    use appcall_connectors::EffectPolicy;
    let mut ok = manifest();
    ok["operations"]["observe"] = json!({
        "kind": "sync",
        "timeoutMs": 10,
        "maxInputBytes": 1000,
        "maxResponseBytes": 1000,
        "description": "Observe"
    });
    ok["operations"]["write"] = json!({
        "kind": "action",
        "timeoutMs": 10,
        "maxInputBytes": 1000,
        "maxResponseBytes": 1000,
        "description": "Write",
        "sideEffect": "write",
        "effectPolicy": "Reconcile",
        "reconcile": "observe",
        "inputSchema": {"type": "object"}
    });
    let connector = parse(&ok).unwrap();
    let write = connector.operation("write").unwrap();
    assert_eq!(write.effect_policy, EffectPolicy::Reconcile);
    assert_eq!(write.reconcile, "observe");

    // Missing reconcile target.
    let mut missing = ok.clone();
    missing["operations"]["write"]["reconcile"] = json!("nope");
    assert_eq!(
        parse(&missing).unwrap_err().code(),
        ErrorCode::InvalidManifest
    );

    // Reconcile must not point at another write action.
    let mut write_target = ok.clone();
    write_target["operations"]["other_write"] = json!({
        "kind": "action",
        "timeoutMs": 10,
        "maxInputBytes": 1000,
        "maxResponseBytes": 1000,
        "description": "Other write",
        "sideEffect": "write",
        "inputSchema": {"type": "object"}
    });
    write_target["operations"]["write"]["reconcile"] = json!("other_write");
    assert_eq!(
        parse(&write_target).unwrap_err().code(),
        ErrorCode::InvalidManifest
    );

    // Reconcile without a target name is invalid.
    let mut empty = ok.clone();
    empty["operations"]["write"]["reconcile"] = json!("");
    assert_eq!(
        parse(&empty).unwrap_err().code(),
        ErrorCode::InvalidManifest
    );

    // effectPolicy None must not carry a reconcile name.
    let mut stray = ok.clone();
    stray["operations"]["write"]["effectPolicy"] = json!("None");
    stray["operations"]["write"]["reconcile"] = json!("observe");
    assert_eq!(
        parse(&stray).unwrap_err().code(),
        ErrorCode::InvalidManifest
    );

    // Explicit read action is an allowed reconcile target.
    let mut read_action = ok.clone();
    read_action["operations"]["read_action"] = json!({
        "kind": "action",
        "timeoutMs": 10,
        "maxInputBytes": 1000,
        "maxResponseBytes": 1000,
        "description": "Read",
        "sideEffect": "read",
        "inputSchema": {"type": "object"}
    });
    read_action["operations"]["write"]["reconcile"] = json!("read_action");
    assert!(parse(&read_action).is_ok());
}

#[test]
fn effect_policy_idempotent_allows_optional_reconcile() {
    use appcall_connectors::EffectPolicy;
    let mut ok = manifest();
    ok["operations"]["observe"] = json!({
        "kind": "sync",
        "timeoutMs": 10,
        "maxInputBytes": 1000,
        "maxResponseBytes": 1000,
        "description": "Observe"
    });
    ok["operations"]["create"] = json!({
        "kind": "action",
        "timeoutMs": 10,
        "maxInputBytes": 1000,
        "maxResponseBytes": 1000,
        "description": "Create",
        "sideEffect": "write",
        "effectPolicy": "Idempotent",
        "reconcile": "observe",
        "inputSchema": {"type": "object"}
    });
    let connector = parse(&ok).unwrap();
    assert_eq!(
        connector.operation("create").unwrap().effect_policy,
        EffectPolicy::Idempotent
    );

    // Idempotent without reconcile is also valid.
    let mut bare = ok.clone();
    bare["operations"]["create"]["reconcile"] = json!("");
    assert!(parse(&bare).is_ok());
}

fn poll_manifest(connector: &str, op: &str, poll: Value) -> Value {
    let mut v = manifest();
    v["key"] = json!(connector);
    v["operations"][op] = json!({"kind":"sync","timeoutMs":10,"maxInputBytes":1000,"maxResponseBytes":1000,"poll":poll});
    v
}
fn good_poll() -> Value {
    json!({"intervalSeconds":300,"itemKey":"id","versionKey":"updatedAt","onNew":["issue.opened"],"onChanged":["issue.updated"]})
}
#[test]
fn poll_block_is_opt_in_and_round_trips_without_touching_other_operations() {
    let c = parse(&poll_manifest("validate", "issues.list", good_poll())).unwrap();
    let registry = Registry::from_connectors([c]).unwrap();
    let op = registry.operation("validate", "issues.list").unwrap();
    let poll = op.poll.as_ref().unwrap();
    assert_eq!(poll.interval_seconds, 300);
    assert_eq!(poll.max_pages, 1);
    assert_eq!(poll.version_key.as_deref(), Some("updatedAt"));
    assert_eq!(
        poll.triggers(appcall_connectors::PollChange::New),
        ["issue.opened".to_string()]
    );
    // Operations without a block stay None and serialize without a poll key.
    let read = registry.operation("validate", "read").unwrap();
    assert!(read.poll.is_none());
    assert!(serde_json::to_value(read).unwrap().get("poll").is_none());
}
#[test]
fn poll_block_rejects_out_of_contract_shapes() {
    let mut bad: Vec<(String, String, Value)> = Vec::new();
    for (k, v) in [
        ("intervalSeconds", json!(59)),
        ("intervalSeconds", json!(86_401)),
        ("maxPages", json!(0)),
        ("maxPages", json!(11)),
        ("itemKey", json!("")),
        ("itemKey", json!("a/b")),
        ("versionKey", json!("id")),
        ("onNew", json!(["dup", "dup"])),
        ("onNew", json!(["bad name"])),
        ("unknownField", json!(true)),
    ] {
        let mut p = good_poll();
        p[k] = v;
        bad.push(("validate".into(), "issues.list".into(), p));
    }
    let mut none = good_poll();
    none["onNew"] = json!([]);
    none["onChanged"] = json!([]);
    bad.push(("validate".into(), "issues.list".into(), none));
    let mut many = good_poll();
    many["onNew"] = json!((0..17).map(|i| format!("t{i}")).collect::<Vec<_>>());
    bad.push(("validate".into(), "issues.list".into(), many));
    // The four worker-owned messages.list syncs stay on their existing path.
    for connector in ["slack", "telegram", "google-workspace", "microsoft-365"] {
        bad.push((connector.into(), "messages.list".into(), good_poll()));
    }
    for (connector, op, poll) in bad {
        let v = poll_manifest(&connector, &op, poll.clone());
        assert_eq!(
            parse(&v).unwrap_err().code(),
            ErrorCode::InvalidManifest,
            "{connector}.{op} {poll}"
        );
    }
    // A poll block on an action is rejected.
    let mut action = manifest();
    action["operations"]["read"]["poll"] = good_poll();
    assert_eq!(
        parse(&action).unwrap_err().code(),
        ErrorCode::InvalidManifest
    );
    // messages.list on another connector may opt in.
    assert!(parse(&poll_manifest("other", "messages.list", good_poll())).is_ok());
}

#[test]
fn github_trig3a_poll_specs_load_through_the_manifest_loader() {
    use appcall_connectors::{OperationKind, PollChange};
    /// (operation, intervalSeconds, maxPages, versionKey, onNew, onChanged)
    type PollRow<'a> = (
        &'a str,
        u32,
        u8,
        Option<&'a str>,
        &'a [String],
        &'a [String],
    );
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../runner/connectors/github/manifest.json");
    let github = Connector::from_bytes(&std::fs::read(path).unwrap()).unwrap();
    let mut polled: Vec<PollRow> = github
        .manifest()
        .operations
        .iter()
        .filter_map(|(key, op)| {
            let poll = op.poll.as_ref()?;
            assert_eq!(op.kind, OperationKind::Sync, "{key}");
            assert_eq!(poll.item_key, "id", "{key}");
            Some((
                key.as_str(),
                poll.interval_seconds,
                poll.max_pages,
                poll.version_key.as_deref(),
                poll.triggers(PollChange::New),
                poll.triggers(PollChange::Changed),
            ))
        })
        .collect();
    polled.sort_by_key(|row| row.0);
    let s = |v: &[&str]| v.iter().map(|t| (*t).to_owned()).collect::<Vec<_>>();
    let (artifact, workflow, deployment, follower) = (
        s(&[
            "GITHUB_ARTIFACT_CREATED_TRIGGER",
            "GITHUB_WORKFLOW_RUN_ARTIFACT_ADDED",
        ]),
        s(&["GITHUB_WORKFLOW_ADDED_TRIGGER"]),
        s(&["GITHUB_DEPLOYMENT_STATE_CHANGED_TRIGGER"]),
        s(&["GITHUB_FOLLOWER_EVENT"]),
    );
    // TRIG-3b (v0.89.0).
    let (asset, content, notification, readme) = (
        s(&["GITHUB_RELEASE_ASSET_ADDED_TRIGGER"]),
        s(&["GITHUB_REPOSITORY_CONTENT_CHANGED_TRIGGER"]),
        s(&["GITHUB_REPOSITORY_NOTIFICATION_RECEIVED_TRIGGER"]),
        s(&["GITHUB_README_CHANGED_TRIGGER"]),
    );
    let expected: Vec<PollRow> = vec![
        ("actions.artifacts.sync", 300, 1, None, &artifact, &[]),
        ("actions.workflows.sync", 900, 3, None, &workflow, &[]),
        (
            "deployments.sync",
            300,
            1,
            Some("latestStatusState"),
            &[],
            &deployment,
        ),
        ("releases.assets.sync", 300, 1, None, &asset, &[]),
        ("repos.contents.sync", 300, 1, None, &content, &[]),
        (
            "repos.notifications.sync",
            60,
            1,
            Some("updatedAt"),
            &notification,
            &notification,
        ),
        ("repos.readme.sync", 300, 1, Some("sha"), &readme, &readme),
        ("user.followers.sync", 900, 10, None, &follower, &[]),
    ];
    assert_eq!(polled, expected);
}

#[test]
fn poll_trigger_filters_narrow_one_trigger_and_fail_closed() {
    use appcall_connectors::{PollChange, PollSpec};
    use serde_json::json;
    let spec: PollSpec = serde_json::from_value(json!({
        "intervalSeconds": 300, "itemKey": "id",
        "onNew": ["created", "run.added"],
        "triggerFilters": {"run.added": {"itemField": "runId", "inputField": "runId"}}
    }))
    .unwrap();
    let item = json!({"id": "a", "runId": 7});
    let new = PollChange::New;
    assert_eq!(
        spec.triggers_for(new, &item, &json!({"runId": 7})),
        ["created", "run.added"]
    );
    assert_eq!(
        spec.triggers_for(new, &item, &json!({"runId": 8})),
        ["created"]
    );
    // No run filter on the subscription: the filtered trigger is never emitted.
    assert_eq!(spec.triggers_for(new, &item, &json!({})), ["created"]);
    assert_eq!(
        spec.triggers_for(new, &item, &json!({"runId": null})),
        ["created"]
    );
    assert_eq!(
        spec.triggers_for(new, &item, &json!({"runId": "7"})),
        ["created"]
    );
    assert!(spec
        .triggers_for(PollChange::Changed, &item, &json!({"runId": 7}))
        .is_empty());

    // The GitHub manifest carries the run filter on actions.artifacts.sync.
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../runner/connectors/github/manifest.json");
    let github = Connector::from_bytes(&std::fs::read(path).unwrap()).unwrap();
    let artifacts = github.manifest().operations["actions.artifacts.sync"]
        .poll
        .clone()
        .unwrap();
    let filter = &artifacts.trigger_filters["GITHUB_WORKFLOW_RUN_ARTIFACT_ADDED"];
    assert_eq!(
        (filter.item_field.as_str(), filter.input_field.as_str()),
        ("runId", "runId")
    );
}

#[test]
fn poll_trigger_filter_must_name_a_declared_trigger() {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../runner/connectors/github/manifest.json");
    let mut manifest: serde_json::Value =
        serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap();
    manifest["operations"]["actions.artifacts.sync"]["poll"]["triggerFilters"] =
        serde_json::json!({"NOT_DECLARED": {"itemField": "runId", "inputField": "runId"}});
    assert!(Connector::from_bytes(&serde_json::to_vec(&manifest).unwrap()).is_err());
    manifest["operations"]["actions.artifacts.sync"]["poll"]["triggerFilters"] = serde_json::json!(
        {"GITHUB_WORKFLOW_RUN_ARTIFACT_ADDED": {"itemField": "", "inputField": "runId"}}
    );
    assert!(Connector::from_bytes(&serde_json::to_vec(&manifest).unwrap()).is_err());
}
