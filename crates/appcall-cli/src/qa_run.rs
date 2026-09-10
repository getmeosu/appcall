use crate::{
    qa::*,
    qa_value::{capture, label},
};
use appcall_actions::ExecuteRequest;
use appcall_connectors::{Connector, OperationKind, SideEffect};
use serde_json::Value;
use std::collections::BTreeMap;
#[allow(clippy::too_many_arguments)]
pub async fn run_connector<E: Executor>(
    connector: &Connector,
    file: &ScenarioFile,
    exec: &E,
    project: &str,
    connection: Option<&str>,
    read_only: bool,
    run_id: &str,
) -> ConnectorReport {
    let mut report = ConnectorReport {
        connector: connector.manifest().key.clone(),
        manifest_digest: connector.manifest_digest().into(),
        last_run_at: Some(chrono::Utc::now()),
        ..Default::default()
    };
    for (key, op) in &connector.manifest().operations {
        if op.kind != OperationKind::Action {
            continue;
        }
        let mut result = OperationResult {
            operation: key.clone(),
            side_effect: match op.side_effect_kind() {
                SideEffect::Read => "read",
                SideEffect::Write => "write",
                SideEffect::Destructive => "destructive",
            }
            .into(),
            status: "not_certified".into(),
            ..Default::default()
        };
        for s in file.scenarios.iter().filter(|s| s.operation == *key) {
            let mut sr = ScenarioResult {
                name: label(&s.name),
                status: "pass".into(),
                ..Default::default()
            };
            if read_only
                && !std::iter::once(s.operation.as_str())
                    .chain(
                        s.setup
                            .iter()
                            .chain(&s.teardown)
                            .map(|s| s.operation.as_str()),
                    )
                    .all(|k| {
                        connector
                            .manifest()
                            .operations
                            .get(k)
                            .is_some_and(|o| o.kind == OperationKind::Action && o.is_read_only())
                    })
            {
                sr.status = "skipped".into();
                sr.failure_kind = "unsafe_probe".into();
                sr.error =
                    "scenario contains an undeclared, non-action, or non-read-only step".into();
            } else if !op.is_read_only() && s.teardown.is_empty() {
                sr.status = "needs_teardown".into();
            } else if let Some(conn) = connection {
                let (out, leaks) = run_scenario(exec, project, conn, s, run_id).await;
                sr = out;
                result.leak_warnings.extend(leaks);
            } else {
                sr.status = "not_certified".into();
                sr.error = "no active connection in QA project".into();
            }
            sr.probe_passed = op.is_read_only() && sr.status == "pass" && s.expect.status == "ok";
            if result.scenarios.is_empty() || rank(&sr.status) > rank(&result.status) {
                result.status = sr.status.clone();
            }
            result.scenarios.push(sr);
        }
        report.operations.push(result);
    }
    report.total = report.operations.len();
    report.passed = report
        .operations
        .iter()
        .filter(|o| o.status == "pass")
        .count();
    report.failed = report
        .operations
        .iter()
        .filter(|o| o.status == "fail")
        .count();
    report.not_certified = report.total - report.passed - report.failed;
    report.overall = if report.failed > 0 {
        "red"
    } else if report.passed > 0 && report.not_certified == 0 {
        "green"
    } else {
        "partial"
    }
    .into();
    report
}
fn rank(s: &str) -> u8 {
    match s {
        "fail" => 5,
        "needs_teardown" => 4,
        "not_certified" => 3,
        "skipped" => 2,
        "pass" => 1,
        _ => 0,
    }
}
async fn call<E: Executor>(
    exec: &E,
    project: &str,
    conn: &str,
    op: &str,
    input: Value,
) -> Result<Value, String> {
    exec.execute(ExecuteRequest {
        project_id: project.into(),
        connection_id: conn.into(),
        external_account_id: String::new(),
        admin_scope: true,
        action: op.into(),
        idempotency_key: String::new(),
        input,
        caller_credential: String::new(),
    })
    .await
}
async fn run_scenario<E: Executor>(
    exec: &E,
    project: &str,
    conn: &str,
    s: &Scenario,
    run_id: &str,
) -> (ScenarioResult, Vec<String>) {
    let mut result = ScenarioResult {
        name: label(&s.name),
        status: "pass".into(),
        ..Default::default()
    };
    let mut vars = BTreeMap::from([("runId".into(), Value::String(run_id.into()))]);
    for step in &s.setup {
        if let Err(code) = call(
            exec,
            project,
            conn,
            &step.operation,
            expand(&step.input, &vars),
        )
        .await
        {
            result.status = "fail".into();
            result.error_code = safe_code(&code);
            result.failure_kind = "setup_error".into();
            result.error = "setup failed".into();
            break;
        }
    }
    if result.status == "pass" {
        let response = call(exec, project, conn, &s.operation, expand(&s.input, &vars)).await;
        match response {
            Ok(output) => {
                capture(&output, "", &mut vars);
                vars.insert("runId".into(), Value::String(run_id.into()));
                if s.expect.status == "error" {
                    result
                        .failures
                        .push("expected error but operation succeeded".into());
                } else {
                    for a in &s.expect.assertions {
                        if !check_assertion(&output, a) {
                            result.failures.push(format!(
                                "{}: {} assertion failed",
                                label(&a.path),
                                label(&a.op)
                            ));
                        }
                    }
                }
            }
            Err(code) => {
                if matches!(code.as_str(), "TIMEOUT" | "INTERRUPTED")
                    || s.expect.status != "error"
                    || (!s.expect.error_code.is_empty() && s.expect.error_code != code)
                {
                    result.error_code = safe_code(&code);
                    result
                        .failures
                        .push("operation returned an unexpected error code".into());
                    result.failure_kind = "execution_error".into();
                    result.error = "operation failed".into();
                }
            }
        }
        if !result.failures.is_empty() {
            result.status = "fail".into();
            if result.failure_kind.is_empty() {
                result.failure_kind = "response_contract".into();
            }
        }
    }
    let mut leaks = vec![];
    for step in &s.teardown {
        if let Err(code) = call(
            exec,
            project,
            conn,
            &step.operation,
            expand(&step.input, &vars),
        )
        .await
        {
            let diagnostic = format!(
                "teardown {} failed ({})",
                label(&step.operation),
                safe_code(&code)
            );
            leaks.push(diagnostic.clone());
            result.status = "fail".into();
            result.failure_kind = "teardown_error".into();
            result.error_code = safe_code(&code);
            result.error = "teardown failed".into();
            result.failures.push(diagnostic);
        }
    }
    (result, leaks)
}
fn safe_code(s: &str) -> String {
    if !s.is_empty()
        && s.len() <= 80
        && s.bytes()
            .all(|b| b.is_ascii_uppercase() || b.is_ascii_digit() || b == b'_')
    {
        s.into()
    } else {
        "EXECUTION_ERROR".into()
    }
}
