use appcall_actions::{LifecycleCredentialResolver, PgActionRepository, PgPolicy, Service};
use appcall_cli::{options::*, qa::*};
use appcall_connectors::Registry;
use std::{collections::BTreeMap, sync::Arc, time::Duration};
fn main() {
    let result = run();
    if let Err((code, msg)) = result {
        eprintln!("qa: {msg}");
        std::process::exit(code)
    }
}
type Error = (i32, &'static str);
fn run() -> Result<(), Error> {
    let mut args = std::env::args().skip(1);
    let cmd = args.next().ok_or((2, "usage: qa run|check [flags]"))?;
    match cmd.as_str() {
        "check" => check(args),
        "run" => execute(args),
        _ => Err((2, "usage: qa run|check [flags]")),
    }
}
fn check(args: impl Iterator<Item = String>) -> Result<(), Error> {
    let f =
        flags(args, &["report", "connector", "manifests", "max-age"], &[]).map_err(|e| (2, e))?;
    let path = f.get("report").ok_or((2, "--report is required"))?;
    let age =
        duration(f.get("max-age").map(String::as_str).unwrap_or("24h")).map_err(|e| (2, e))?;
    let root = f
        .get("manifests")
        .map(std::path::PathBuf::from)
        .map(Ok)
        .unwrap_or_else(manifest_root)
        .map_err(|e| (1, e))?;
    let reg = Registry::load(root).map_err(|_| (1, "manifest loading failed"))?;
    let reports: Vec<ConnectorReport> = serde_json::from_slice(
        &read_bounded(std::path::Path::new(path), 32 * 1024 * 1024).map_err(|e| (1, e))?,
    )
    .map_err(|_| (1, "invalid report JSON"))?;
    let health = assess(
        &reg,
        &reports,
        f.get("connector").map(String::as_str).unwrap_or(""),
        chrono::Utc::now(),
        age,
    )
    .map_err(|e| (1, e))?;
    output(&health)?;
    if health.is_empty() || health.iter().any(|h| h.state != "healthy") {
        return Err((1, "probe health requirements not satisfied"));
    };
    Ok(())
}
fn execute(args: impl Iterator<Item = String>) -> Result<(), Error> {
    let started = std::time::Instant::now();
    let f = flags(
        args,
        &["connector", "project", "scenarios", "timeout"],
        &["read-only", "json", "require-probe"],
    )
    .map_err(|e| (2, e))?;
    let project = f
        .get("project")
        .cloned()
        .or_else(|| std::env::var("APPCALL_QA_PROJECT_ID").ok())
        .filter(|s| !s.trim().is_empty())
        .ok_or((2, "--project or APPCALL_QA_PROJECT_ID is required"))?;
    let timeout =
        duration(f.get("timeout").map(String::as_str).unwrap_or("10m")).map_err(|e| (2, e))?;
    let deadline = started
        .checked_add(timeout)
        .ok_or((2, "timeout exceeds platform range"))?;
    if std::time::Instant::now() >= deadline {
        return Err((
            1,
            "run deadline exceeded; inspect provider state before retrying",
        ));
    }
    let cancellation = appcall_cli::qa_deadline::Cancellation::default();
    let worker_cancellation = cancellation.clone();
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|_| (1, "supervisor startup failed"))?;
    let (send, mut receive) = tokio::sync::oneshot::channel();
    std::thread::spawn(move || {
        let result = execute_run(f, project, timeout, deadline, worker_cancellation);
        let _ = send.send(result);
    });
    runtime.block_on(async {
        let reason = tokio::select! {
            biased;
            _ = interrupt() => "interrupted; inspect provider state before retrying",
            _ = tokio::time::sleep_until(tokio::time::Instant::from_std(deadline)) => "run deadline exceeded; inspect provider state before retrying",
            result = &mut receive => return result.map_err(|_|(1,"execution worker failed"))?,
        };
        cancellation.cancel();
        // Keep the signal listener alive for initialization, execution and persistence;
        // allow only one second for cleanup verdicts and already-running SQL to drain.
        let _ = tokio::time::timeout(Duration::from_secs(1), &mut receive).await;
        Err((1,reason))
    })
}
fn execute_run(
    f: BTreeMap<String, String>,
    project: String,
    timeout: Duration,
    deadline: std::time::Instant,
    cancellation: appcall_cli::qa_deadline::Cancellation,
) -> Result<(), Error> {
    if std::time::Instant::now() >= deadline {
        return Err((
            1,
            "run deadline exceeded; inspect provider state before retrying",
        ));
    }
    if cancellation.is_cancelled() {
        return Err((1, "interrupted; inspect provider state before retrying"));
    }
    let root = manifest_root().map_err(|e| (1, e))?;
    let reg = Registry::load(&root).map_err(|_| (1, "manifest loading failed"))?;
    let filter = f.get("connector").map(String::as_str).unwrap_or("");
    let files = discover(
        &f.get("scenarios")
            .map(std::path::PathBuf::from)
            .unwrap_or(root),
        &reg,
        filter,
    )
    .map_err(|e| (1, e))?;
    let config =
        appcall_runtime::Config::from_env().map_err(|_| (1, "invalid runtime configuration"))?;
    let remaining = deadline
        .saturating_duration_since(std::time::Instant::now())
        .min(Duration::from_secs(60));
    config
        .migrate_cancellable(remaining, || cancellation.is_cancelled())
        .map_err(|_| (1, "database migration failed"))?;
    let mut database = config
        .connect()
        .map_err(|_| (1, "database connection failed"))?;
    let rows=database.query("SELECT connector,id FROM connections WHERE project_id=$1 AND status='active' ORDER BY id",&[&project]).map_err(|_|(1,"connection lookup failed"))?;
    let mut connections = BTreeMap::<String, String>::new();
    for r in rows {
        connections.entry(r.get(0)).or_insert_with(|| r.get(1));
    }
    let repository = PgActionRepository::new(
        config
            .connect()
            .map_err(|_| (1, "database connection failed"))?,
    );
    let policy = PgPolicy::new(repository.clone(), config.policy_config())
        .map_err(|_| (1, "invalid policy configuration"))?;
    let lifecycle = config
        .lifecycle(Arc::new(reg.clone()))
        .map_err(|_| (1, "credential configuration failed"))?;
    let service = Service::new(
        repository,
        reg.clone(),
        LifecycleCredentialResolver(lifecycle),
        config
            .runner_with_options(appcall_runner_client::ClientOptions {
                timeout: Duration::from_secs(30),
                ..Default::default()
            })
            .map_err(|_| (1, "runner configuration failed"))?,
        policy,
    );
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .max_blocking_threads(8)
        .build()
        .map_err(|_| (1, "runtime startup failed"))?;
    let read_only = f.get("read-only").is_some_and(|v| v == "true");
    let reports = runtime.block_on(async {
        let exec = appcall_cli::qa_deadline::Deadline {
            inner: &service,
            deadline: tokio::time::Instant::from_std(deadline),
            cancellation: cancellation.clone(),
        };
        let collect = async {
            let mut reports = vec![];
            let run_id = uuid::Uuid::new_v4().to_string();
            for file in files {
                let c = reg
                    .connector(&file.connector)
                    .map_err(|_| (1, "unknown connector"))?;
                reports.push(
                    run_connector(
                        c,
                        &file,
                        &exec,
                        &project,
                        connections.get(&file.connector).map(String::as_str),
                        read_only,
                        &run_id,
                    )
                    .await,
                );
            }
            Ok(reports)
        };
        collect.await
    });
    runtime.shutdown_timeout(Duration::from_secs(1));
    let reports = reports?;
    for r in &reports {
        if save(&mut database, r).is_err() {
            eprintln!("qa: warning: report persistence failed");
        }
    }
    if f.get("json").is_some_and(|v| v == "true") {
        output(&reports)?;
    } else {
        human(&reports)?;
    }
    if std::time::Instant::now() >= deadline {
        return Err((
            1,
            "run deadline exceeded; inspect provider state before retrying",
        ));
    }
    if cancellation.is_cancelled() {
        return Err((1, "interrupted; inspect provider state before retrying"));
    }
    if reports.iter().any(|r| r.overall == "red") {
        return Err((1, "certification failed"));
    };
    if f.get("require-probe").is_some_and(|v| v == "true") {
        let health =
            assess(&reg, &reports, filter, chrono::Utc::now(), timeout).map_err(|e| (1, e))?;
        if health.is_empty() || health.iter().any(|h| h.state != "healthy") {
            return Err((1, "probe health requirements not satisfied"));
        }
    }
    Ok(())
}
fn save(db: &mut postgres::Client, r: &ConnectorReport) -> Result<(), postgres::Error> {
    let payload = serde_json::json!({"manifestDigest":r.manifest_digest,"operations":r.operations});
    db.execute("INSERT INTO qa_connector_status(connector,overall,total,passed,failed,not_certified,results,last_run_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(connector) DO UPDATE SET overall=EXCLUDED.overall,total=EXCLUDED.total,passed=EXCLUDED.passed,failed=EXCLUDED.failed,not_certified=EXCLUDED.not_certified,results=EXCLUDED.results,last_run_at=EXCLUDED.last_run_at",&[&r.connector,&r.overall,&(r.total as i32),&(r.passed as i32),&(r.failed as i32),&(r.not_certified as i32),&payload,&r.last_run_at])?;
    Ok(())
}
fn output(value: &impl serde::Serialize) -> Result<(), Error> {
    let stdout = std::io::stdout();
    let mut out = stdout.lock();
    serde_json::to_writer_pretty(&mut out, value).map_err(|_| (1, "output failed"))?;
    use std::io::Write;
    out.write_all(b"\n").map_err(|_| (1, "output failed"))
}
fn human(reports: &[ConnectorReport]) -> Result<(), Error> {
    use std::io::Write;
    let stdout = std::io::stdout();
    let mut out = stdout.lock();
    for r in reports {
        writeln!(
            out,
            "{}  [{}]  pass={} fail={} uncertified={}",
            r.connector, r.overall, r.passed, r.failed, r.not_certified
        )
        .map_err(|_| (1, "output failed"))?;
        for op in &r.operations {
            writeln!(out, "  - {:28} {}", op.operation, op.status)
                .map_err(|_| (1, "output failed"))?;
            for s in &op.scenarios {
                for f in &s.failures {
                    writeln!(out, "      x {}: {}", s.name, f).map_err(|_| (1, "output failed"))?;
                }
            }
            for warning in &op.leak_warnings {
                writeln!(out, "      ! {warning}").map_err(|_| (1, "output failed"))?;
            }
        }
    }
    Ok(())
}

async fn interrupt() {
    #[cfg(unix)]
    {
        if let Ok(mut term) =
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
        {
            tokio::select! { _ = term.recv() => {}, _ = tokio::signal::ctrl_c() => {} }
            return;
        }
    }
    let _ = tokio::signal::ctrl_c().await;
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn expired_worker_deadline_precedes_initialization() {
        let result = execute_run(
            BTreeMap::from([(
                "scenarios".into(),
                "/definitely-missing-qa-scenarios".into(),
            )]),
            "p".into(),
            Duration::from_nanos(1),
            std::time::Instant::now() - Duration::from_secs(1),
            appcall_cli::qa_deadline::Cancellation::default(),
        );
        assert_eq!(
            result,
            Err((
                1,
                "run deadline exceeded; inspect provider state before retrying"
            ))
        );
    }
}
