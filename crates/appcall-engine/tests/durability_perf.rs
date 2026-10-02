//! RSS + latency probe under a Temporal-class durability path
//! (unknown → fenced reconcile → complete → restart replay).
//! Writes JSON under crates/appcall-engine/benchmarks/ for scoreboard evidence.
use appcall_engine::*;
use std::{
    process::Command,
    time::{Duration, Instant},
};

fn rss_kib() -> u64 {
    let out = Command::new("ps")
        .args(["-o", "rss=", "-p", &std::process::id().to_string()])
        .output()
        .expect("ps");
    String::from_utf8(out.stdout)
        .unwrap()
        .trim()
        .parse()
        .expect("rss")
}

fn one(c: &mut Context) -> WorkflowResult {
    c.activity("lookup", "v1", c.input().clone(), EffectPolicy::Unknown)
}

fn percentile_us(sorted: &[u128], p: f64) -> u128 {
    if sorted.is_empty() {
        return 0;
    }
    let idx = ((sorted.len() as f64 - 1.0) * p).round() as usize;
    sorted[idx.min(sorted.len() - 1)]
}

#[test]
fn durability_path_rss_and_latency_under_budget() {
    let runs = 64usize;
    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("engine.db");
    let baseline = rss_kib();

    let mut e = Engine::open(&db).unwrap();
    e.register_workflow("one", "v1", one).unwrap();
    e.register_activity("lookup", "v1").unwrap();

    let mut latencies_us = Vec::with_capacity(runs);
    for i in 0..runs {
        let id = format!("r-{i}");
        let started = Instant::now();
        e.start(&id, "one", "v1", PayloadRef::durable("input").unwrap())
            .unwrap();
        let attempt = match e.drive(&id, 0).unwrap() {
            DriveOutcome::Activity(a) => a,
            other => panic!("{other:?}"),
        };
        e.fail(&attempt, ActivityFailure::OutcomeUnknown).unwrap();
        e.reconcile_fenced(
            &id,
            &attempt.effect_id,
            attempt.attempt,
            attempt.owner_epoch,
            Some(PayloadRef::durable("verified").unwrap()),
        )
        .unwrap();
        assert!(matches!(
            e.drive(&id, 0).unwrap(),
            DriveOutcome::Completed(_)
        ));
        latencies_us.push(started.elapsed().as_micros());
    }

    let after_work = rss_kib();
    drop(e);

    let reopen = Instant::now();
    let mut e = Engine::open(&db).unwrap();
    e.register_workflow("one", "v1", one).unwrap();
    e.register_activity("lookup", "v1").unwrap();
    for i in 0..runs {
        let id = format!("r-{i}");
        assert_eq!(e.status(&id).unwrap(), RunState::Completed);
        assert_eq!(e.reconciliation_audit(&id).unwrap().len(), 1);
    }
    let reopen_us = reopen.elapsed().as_micros();
    let final_rss = rss_kib();
    drop(e);

    latencies_us.sort_unstable();
    let p50 = percentile_us(&latencies_us, 0.50);
    let p99 = percentile_us(&latencies_us, 0.99);
    let incremental = after_work.saturating_sub(baseline);

    let report = serde_json::json!({
        "suite": "durability_path_rss_and_latency",
        "runs": runs,
        "baseline_rss_kib": baseline,
        "after_work_rss_kib": after_work,
        "final_rss_kib": final_rss,
        "incremental_rss_kib": incremental,
        "start_fail_reconcile_complete_p50_us": p50,
        "start_fail_reconcile_complete_p99_us": p99,
        "reopen_status_audit_us": reopen_us,
        // Soft budgets — fail closed if the path regresses badly.
        "budget_incremental_rss_kib": 32_768,
        "budget_p99_us": 50_000,
        "budget_reopen_us": 2_000_000,
    });

    let out = benchmarks_report_path();
    std::fs::create_dir_all(out.parent().unwrap()).unwrap();
    std::fs::write(&out, serde_json::to_vec_pretty(&report).unwrap()).unwrap();

    assert!(
        incremental <= 32_768,
        "incremental RSS {incremental} KiB exceeds 32 MiB soft budget; wrote {out:?}"
    );
    assert!(
        p99 <= 50_000,
        "p99 latency {p99} us exceeds 50ms soft budget; wrote {out:?}"
    );
    assert!(
        reopen_us <= 2_000_000,
        "reopen {reopen_us} us exceeds 2s soft budget; wrote {out:?}"
    );
}

fn benchmarks_report_path() -> std::path::PathBuf {
    let stamp = chrono_like_stamp();
    std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("benchmarks")
        .join(format!("{stamp}-durability-path.json"))
}

fn chrono_like_stamp() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or(Duration::from_secs(0))
        .as_secs();
    // Keep filenames stable-ish per day (UTC date from unix day).
    let days = secs / 86_400;
    // Approximate YYYY-MM-DD without chrono dep: use unix day ordinal label.
    format!("unix-day-{days}")
}

#[test]
fn noop_waiting_redrive_rss_and_latency_under_budget() {
    // Evidence that no-op Waiting re-drives stay cheap after skipping serde commits.
    let redrives = 256usize;
    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("engine.db");
    let baseline = rss_kib();

    let mut e = Engine::open(&db).unwrap();
    e.register_workflow("wait", "v1", |c| {
        c.signal("go")?;
        Ok(c.input().clone())
    })
    .unwrap();
    e.start("r", "wait", "v1", PayloadRef::durable("input").unwrap())
        .unwrap();
    assert!(matches!(e.drive("r", 0).unwrap(), DriveOutcome::Waiting));

    let mut latencies_us = Vec::with_capacity(redrives);
    for _ in 0..redrives {
        let started = Instant::now();
        assert!(matches!(e.drive("r", 0).unwrap(), DriveOutcome::Waiting));
        latencies_us.push(started.elapsed().as_micros());
    }
    let after_work = rss_kib();
    drop(e);

    latencies_us.sort_unstable();
    let p50 = percentile_us(&latencies_us, 0.50);
    let p99 = percentile_us(&latencies_us, 0.99);
    let incremental = after_work.saturating_sub(baseline);

    let report = serde_json::json!({
        "suite": "noop_waiting_redrive_rss_and_latency",
        "redrives": redrives,
        "baseline_rss_kib": baseline,
        "after_work_rss_kib": after_work,
        "incremental_rss_kib": incremental,
        "noop_waiting_p50_us": p50,
        "noop_waiting_p99_us": p99,
        "budget_incremental_rss_kib": 8_192,
        "budget_p99_us": 5_000,
    });
    let out = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("benchmarks")
        .join(format!("{}-noop-waiting.json", chrono_like_stamp()));
    std::fs::create_dir_all(out.parent().unwrap()).unwrap();
    std::fs::write(&out, serde_json::to_vec_pretty(&report).unwrap()).unwrap();

    assert!(
        incremental <= 8_192,
        "incremental RSS {incremental} KiB exceeds 8 MiB soft budget; wrote {out:?}"
    );
    assert!(
        p99 <= 5_000,
        "noop Waiting p99 {p99} us exceeds 5ms soft budget; wrote {out:?}"
    );
}
