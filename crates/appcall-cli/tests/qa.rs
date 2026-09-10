use appcall_cli::qa::*;
use serde_json::json;
#[test]
fn templates_preserve_types_and_unknown_tokens() {
    let vars = std::collections::BTreeMap::from([
        ("id".into(), json!(42)),
        ("nested".into(), json!({"x":true})),
    ]);
    assert_eq!(
        expand(
            &json!({"a":"{{ id }}","b":"run-{{id}}","c":"{{missing}}","d":["{{nested}}"]}),
            &vars
        ),
        json!({"a":42,"b":"run-42","c":"{{missing}}","d":[{"x":true}]})
    );
}
#[test]
fn assertions_have_go_object_path_and_byte_length_semantics() {
    let value = json!({"a":null,"s":"é","arr":[3],"x":7});
    for (path, op, want, pass) in [
        ("a", "exists", json!(null), true),
        ("missing", "exists", json!(null), false),
        ("s", "len", json!(2), true),
        ("arr.0", "exists", json!(null), false),
        ("x", "gt", json!(6), true),
        ("x", "lt", json!(6), false),
        ("s", "matches", json!("["), false),
    ] {
        assert_eq!(
            check_assertion(
                &value,
                &Assertion {
                    path: path.into(),
                    op: op.into(),
                    value: want
                }
            ),
            pass,
            "{path} {op}"
        );
    }
}
struct Mock(std::sync::Mutex<Vec<String>>);
impl Executor for Mock {
    async fn execute(
        &self,
        r: appcall_actions::ExecuteRequest,
    ) -> Result<serde_json::Value, String> {
        self.0.lock().unwrap().push(r.action.clone());
        if r.action == "setup" {
            Err("PROVIDER_ERROR".into())
        } else {
            Ok(json!({"id":42}))
        }
    }
}
struct TeardownFailureMock(std::sync::Mutex<Vec<String>>);
impl Executor for TeardownFailureMock {
    async fn execute(
        &self,
        request: appcall_actions::ExecuteRequest,
    ) -> Result<serde_json::Value, String> {
        let action = request.action.clone();
        self.0.lock().unwrap().push(action.clone());
        if action == "cleanup" {
            Err("provider cleanup failed: qa-secret-66".into())
        } else {
            Ok(json!({"id":42}))
        }
    }
}
fn connector() -> appcall_connectors::Connector {
    let mut ops = serde_json::Map::new();
    for (k, e) in [
        ("read", "read"),
        ("write", "write"),
        ("setup", "read"),
        ("cleanup", "write"),
    ] {
        ops.insert(k.into(),json!({"kind":"action","timeoutMs":100,"maxInputBytes":1000,"maxResponseBytes":1000,"inputSchema":{},"sideEffect":e}));
    }
    appcall_connectors::Connector::from_bytes(&serde_json::to_vec(&json!({"key":"test","name":"Test","version":"1","runtime":"bun","models":["item"],"auth":{"type":"none"},"network":{"egress":"none"},"operations":ops})).unwrap()).unwrap()
}
fn file(v: serde_json::Value) -> ScenarioFile {
    serde_json::from_value(json!({"connector":"test","scenarios":v})).unwrap()
}
#[test]
fn readonly_preflights_setup_and_teardown_and_mutations_require_cleanup() {
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();
    let ex = Mock(Default::default());
    let c = connector();
    let f = file(
        json!([{"name":"unsafe","operation":"read","teardown":[{"operation":"cleanup"}],"expect":{"status":"ok"}},{"name":"write","operation":"write","expect":{"status":"ok"}}]),
    );
    let r = rt.block_on(run_connector(&c, &f, &ex, "p", Some("c"), true, "run"));
    assert_eq!(
        r.operations
            .iter()
            .find(|o| o.operation == "read")
            .unwrap()
            .status,
        "skipped"
    );
    assert!(ex.0.lock().unwrap().is_empty());
    let r = rt.block_on(run_connector(&c, &f, &ex, "p", Some("c"), false, "run"));
    assert_eq!(
        r.operations
            .iter()
            .find(|o| o.operation == "write")
            .unwrap()
            .status,
        "needs_teardown"
    );
}
#[test]
fn setup_failure_still_tears_down_and_negative_expectation_is_not_probe() {
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();
    let ex = Mock(Default::default());
    let f = file(
        json!([{"name":"setupfailure","operation":"read","setup":[{"operation":"setup"}],"teardown":[{"operation":"cleanup"}],"expect":{"status":"ok"}},{"name":"negative","operation":"setup","expect":{"status":"error","errorCode":"PROVIDER_ERROR"}}]),
    );
    let r = rt.block_on(run_connector(
        &connector(),
        &f,
        &ex,
        "p",
        Some("c"),
        false,
        "run",
    ));
    assert_eq!(*ex.0.lock().unwrap(), vec!["setup", "cleanup", "setup"]);
    assert_eq!(r.overall, "red");
    let negative = &r
        .operations
        .iter()
        .find(|o| o.operation == "setup")
        .unwrap()
        .scenarios[0];
    assert_eq!(negative.status, "pass");
    assert!(!negative.probe_passed);
}
#[test]
fn teardown_failure_marks_scenario_and_report_red_while_continuing_cleanup() {
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();
    let ex = TeardownFailureMock(Default::default());
    let f = file(json!([{
        "name":"cleanup failure",
        "operation":"write",
        "expect":{"status":"ok","assertions":[{"path":"id","op":"eq","value":42}]},
        "teardown":[{"operation":"cleanup"},{"operation":"read"}]
    }]));
    let report = rt.block_on(run_connector(
        &connector(),
        &f,
        &ex,
        "p",
        Some("c"),
        false,
        "run",
    ));
    let operation = report
        .operations
        .iter()
        .find(|operation| operation.operation == "write")
        .unwrap();
    let scenario = &operation.scenarios[0];
    let diagnostic = "teardown cleanup failed (EXECUTION_ERROR)";
    assert_eq!(scenario.status, "fail");
    assert_eq!(scenario.failure_kind, "teardown_error");
    assert_eq!(scenario.error_code, "EXECUTION_ERROR");
    assert_eq!(scenario.error, "teardown failed");
    assert_eq!(scenario.failures, vec![diagnostic]);
    assert_eq!(operation.status, "fail");
    assert_eq!(report.overall, "red");
    assert_eq!(report.failed, 1);
    assert_eq!(operation.leak_warnings, vec![diagnostic]);
    assert_eq!(*ex.0.lock().unwrap(), vec!["write", "cleanup", "read"]);
    let serialized = serde_json::to_string(&report).unwrap();
    assert!(!serialized.contains("qa-secret-66"));
    assert!(!serialized.contains("provider cleanup failed: qa-secret-66"));
    assert!(serialized.contains(diagnostic));
}
struct ExecutionAndTeardownFailureMock(std::sync::Mutex<Vec<String>>);
impl Executor for ExecutionAndTeardownFailureMock {
    async fn execute(
        &self,
        request: appcall_actions::ExecuteRequest,
    ) -> Result<serde_json::Value, String> {
        let action = request.action.clone();
        self.0.lock().unwrap().push(action.clone());
        match action.as_str() {
            "write" => Err("PRIMARY_PROVIDER_ERROR".into()),
            "cleanup" => Err("CLEANUP_PROVIDER_ERROR".into()),
            _ => Ok(json!({"id":42})),
        }
    }
}
#[test]
fn teardown_failure_preserves_primary_execution_failure_details() {
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();
    let ex = ExecutionAndTeardownFailureMock(Default::default());
    let f = file(json!([{
        "name":"primary and cleanup failure",
        "operation":"write",
        "expect":{"status":"ok"},
        "teardown":[{"operation":"cleanup"}]
    }]));
    let report = rt.block_on(run_connector(
        &connector(),
        &f,
        &ex,
        "p",
        Some("c"),
        false,
        "run",
    ));
    let operation = report
        .operations
        .iter()
        .find(|operation| operation.operation == "write")
        .unwrap();
    let scenario = &operation.scenarios[0];
    assert_eq!(scenario.status, "fail");
    assert_eq!(scenario.failure_kind, "execution_error");
    assert_eq!(scenario.error_code, "PRIMARY_PROVIDER_ERROR");
    assert_eq!(scenario.error, "operation failed");
    assert_eq!(
        scenario.failures,
        vec![
            "operation returned an unexpected error code",
            "teardown cleanup failed (CLEANUP_PROVIDER_ERROR)"
        ]
    );
    assert_eq!(
        operation.leak_warnings,
        vec!["teardown cleanup failed (CLEANUP_PROVIDER_ERROR)"]
    );
    assert_eq!(report.overall, "red");
    assert_eq!(
        *ex.0.lock().unwrap(),
        vec!["write".to_owned(), "cleanup".to_owned()]
    );
}
#[test]
fn health_rejects_fingerprint_drift_stale_future_zero_and_negative_only() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(dir.path().join("manifest.json"), connector().raw_bytes()).unwrap();
    let reg = appcall_connectors::Registry::load(dir.path()).unwrap();
    let now = chrono::Utc::now();
    let report = ConnectorReport {
        connector: "test".into(),
        manifest_digest: connector().manifest_digest().into(),
        overall: "partial".into(),
        last_run_at: Some(now),
        operations: vec![OperationResult {
            operation: "read".into(),
            status: "pass".into(),
            scenarios: vec![ScenarioResult {
                status: "pass".into(),
                probe_passed: true,
                ..Default::default()
            }],
            ..Default::default()
        }],
        ..Default::default()
    };
    assert_eq!(
        assess(
            &reg,
            std::slice::from_ref(&report),
            "",
            now,
            std::time::Duration::from_secs(60)
        )
        .unwrap()[0]
            .state,
        "healthy"
    );
    for (time, digest, state) in [
        (Some(now), "drift".into(), "unverified"),
        (
            Some(now - chrono::Duration::seconds(61)),
            report.manifest_digest.clone(),
            "stale",
        ),
        (
            Some(now + chrono::Duration::seconds(1)),
            report.manifest_digest.clone(),
            "unverified",
        ),
        (
            Some("0001-01-01T00:00:00Z".parse().unwrap()),
            report.manifest_digest.clone(),
            "unverified",
        ),
    ] {
        let r = ConnectorReport {
            last_run_at: time,
            manifest_digest: digest,
            ..report.clone()
        };
        assert_eq!(
            assess(&reg, &[r], "", now, std::time::Duration::from_secs(60)).unwrap()[0].state,
            state
        );
    }
    let mut negative = report.clone();
    negative.operations[0].scenarios[0].probe_passed = false;
    assert_eq!(
        assess(
            &reg,
            &[negative],
            "",
            now,
            std::time::Duration::from_secs(60)
        )
        .unwrap()[0]
            .state,
        "unverified"
    );
    assert!(assess(
        &reg,
        &[report.clone(), report],
        "",
        now,
        std::time::Duration::from_secs(60)
    )
    .is_err());
}
#[test]
fn legacy_go_null_slices_and_missing_optional_fields_are_accepted() {
    let r:ConnectorReport=serde_json::from_value(json!({"connector":"test","overall":"partial","total":0,"passed":0,"failed":0,"notCertified":0,"operations":null,"lastRunAt":"0001-01-01T00:00:00Z"})).unwrap();
    assert!(r.operations.is_empty());
    let f:ScenarioFile=serde_json::from_value(json!({"connector":"test","scenarios":[{"name":"x","operation":"read","expect":{"status":"ok","assertions":null},"setup":null,"teardown":null}]})).unwrap();
    assert!(f.scenarios[0].setup.is_empty());
}
#[test]
fn workspace_scenarios_parse_against_actual_registry() {
    let root = std::path::Path::new(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../runner/connectors"
    ));
    let registry = appcall_connectors::Registry::load(root).unwrap();
    assert_eq!(
        appcall_cli::options::discover(root, &registry, "")
            .unwrap()
            .len(),
        registry.list().len()
    );
}
#[test]
fn cancellation_and_deadline_report_failed_cleanup_without_starting_more_calls() {
    use appcall_cli::qa_deadline::*;
    struct Slow(std::sync::atomic::AtomicUsize);
    impl Executor for Slow {
        async fn execute(
            &self,
            _: appcall_actions::ExecuteRequest,
        ) -> Result<serde_json::Value, String> {
            self.0.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            tokio::time::sleep(std::time::Duration::from_secs(10)).await;
            Ok(json!({}))
        }
    }
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();
    for cancel in [true, false] {
        let slow = Slow(Default::default());
        let cancellation = Cancellation::default();
        rt.block_on(async{let exec=Deadline{inner:&slow,deadline:tokio::time::Instant::now()+std::time::Duration::from_millis(if cancel{10000}else{5}),cancellation:cancellation.clone()};let f=file(json!([{"name":"blocked","operation":"write","teardown":[{"operation":"cleanup"}],"expect":{"status":"ok"}}]));let c=connector();let run=run_connector(&c,&f,&exec,"p",Some("c"),false,"run");tokio::pin!(run);let report=if cancel{tokio::select!{_=tokio::time::sleep(std::time::Duration::from_millis(5))=>{cancellation.cancel();run.await},_= &mut run=>panic!("must remain blocked")}}else{run.await};assert_eq!(report.overall,"red");assert_eq!(report.operations.iter().find(|o|o.operation=="write").unwrap().leak_warnings.len(),1);});
        assert_eq!(slow.0.load(std::sync::atomic::Ordering::SeqCst), 1);
    }
}
#[test]
fn harness_timeout_cannot_pass_an_expected_provider_error_case() {
    use appcall_cli::qa_deadline::*;
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();
    let ex = Mock(Default::default());
    rt.block_on(async {
        let deadline = Deadline {
            inner: &ex,
            deadline: tokio::time::Instant::now(),
            cancellation: Cancellation::default(),
        };
        let f = file(json!([{"name":"negative","operation":"read","expect":{"status":"error"}}]));
        let r = run_connector(&connector(), &f, &deadline, "p", Some("c"), true, "run").await;
        assert_eq!(r.overall, "red");
    });
    assert!(ex.0.lock().unwrap().is_empty());
}
