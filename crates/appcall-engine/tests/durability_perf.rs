//! Continuous RSS + latency probe + acceptance gate for appcall-engine.
//!
//! Durability path: unknown → fenced reconcile → complete → restart replay.
//! Noop Waiting: parked re-drives after the no-op save skip.
//!
//! Each probe:
//! 1. Loads committed baseline JSON (if present) and fails on regression
//!    beyond multiplier × baseline (gradual drift) or absolute budget (ceiling).
//!    Baseline match requires identical host tag and run/redrive count; a
//!    baseline without a host field is treated as no match (so the ×5 drift
//!    gate stays off on Linux CI until a linux-x86_64 baseline exists).
//! 2. Writes fresh evidence under crates/appcall-engine/benchmarks/.
//!
//! Caps (1024 history / 1 MiB) and exclusive-owner epoch+CAS live in
//! `acceptance_bar` — this file is the continuous perf half of the gate.
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

fn host_tag() -> String {
    format!("{}-{}", std::env::consts::OS, std::env::consts::ARCH)
}

/// Absolute ceilings — fail closed if the path regresses badly on any host.
const DURABILITY_BUDGET_RSS_KIB: u64 = 32_768;
const DURABILITY_BUDGET_P95_US: u128 = 50_000;
const DURABILITY_BUDGET_REOPEN_US: u128 = 2_000_000;
const DURABILITY_WARMUP: usize = 8;
const DURABILITY_RUNS: usize = 256;
const NOOP_BUDGET_RSS_KIB: u64 = 8_192;
const NOOP_BUDGET_P99_US: u128 = 5_000;
/// Gradual-regression multipliers vs committed baseline evidence.
const RSS_REGRESSION_MULT: u64 = 3;
const LATENCY_REGRESSION_MULT: u128 = 5;

/// Load the newest matching baseline JSON from the committed benchmarks dir.
///
/// A match requires `host` equal to this process's `host_tag()` and
/// `runs`/`redrives` equal to `runs`. A baseline that lacks a `host`
/// field is treated as no match. Among matching files, the newest by
/// filename sort wins — not the newest overall (so a newer other-host
/// baseline cannot hide an older same-host one).
fn load_baseline(name_suffix: &str, runs: usize) -> Option<serde_json::Value> {
    let dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("benchmarks");
    select_baseline(&dir, name_suffix, &host_tag(), runs)
}

/// Pick the newest baseline under `dir` whose host + run count match.
///
/// Filenames are sorted ascending; candidates are scanned newest-first.
/// First host+runs match wins. No match → `None` (caller takes the
/// absolute-budget / no-baseline path).
fn select_baseline(
    dir: &std::path::Path,
    name_suffix: &str,
    host: &str,
    runs: usize,
) -> Option<serde_json::Value> {
    let mut candidates: Vec<_> = std::fs::read_dir(dir)
        .ok()?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| {
            p.file_name()
                .and_then(|n| n.to_str())
                .is_some_and(|n| n.ends_with(name_suffix))
        })
        .collect();
    candidates.sort();
    for path in candidates.into_iter().rev() {
        let Ok(bytes) = std::fs::read(&path) else {
            continue;
        };
        let Ok(prior) = serde_json::from_slice::<serde_json::Value>(&bytes) else {
            continue;
        };
        let Some(prior_host) = prior.get("host").and_then(|v| v.as_str()) else {
            continue;
        };
        if prior_host != host {
            continue;
        }
        let Some(prior_runs) = prior
            .get("runs")
            .or_else(|| prior.get("redrives"))
            .and_then(|v| v.as_u64())
        else {
            continue;
        };
        if prior_runs as usize != runs {
            continue;
        }
        return Some(prior);
    }
    None
}

struct LatencyDiag<'a> {
    host: &'a str,
    p50: u128,
    p95: u128,
    p99: u128,
    max: u128,
}

fn log_no_baseline(suite: &str, diag: &LatencyDiag<'_>) {
    eprintln!(
        "durability_perf: no matching baseline for {suite}; host={} p50={} p95={} p99={} (absolute budgets only)",
        diag.host, diag.p50, diag.p95, diag.p99
    );
}

fn assert_under_budget_and_baseline(
    label: &str,
    value: u128,
    absolute: u128,
    baseline: Option<u128>,
    mult: u128,
    out: &std::path::Path,
    diag: &LatencyDiag<'_>,
) {
    let LatencyDiag {
        host,
        p50,
        p95,
        p99,
        max,
    } = *diag;
    assert!(
        value <= absolute,
        "{label} {value} exceeds absolute budget {absolute}; host={host} p50={p50} p95={p95} p99={p99} max={max}; wrote {out:?}"
    );
    if let Some(base) = baseline {
        // Regression gate: current must stay within mult × committed baseline,
        // still capped by absolute so a missing/tiny baseline cannot raise the bar.
        let gate = base.saturating_mul(mult).min(absolute);
        assert!(
            value <= gate,
            "{label} {value} exceeds baseline gate {gate} (baseline {base} × {mult}, abs {absolute}); host={host} p50={p50} p95={p95} p99={p99} max={max}; wrote {out:?}"
        );
    }
}

fn assert_rss_gate(
    label: &str,
    value: u64,
    absolute: u64,
    baseline: Option<u64>,
    out: &std::path::Path,
    diag: &LatencyDiag<'_>,
) {
    let LatencyDiag {
        host,
        p50,
        p95,
        p99,
        max,
    } = *diag;
    assert!(
        value <= absolute,
        "{label} {value} KiB exceeds absolute budget {absolute}; host={host} p50={p50} p95={p95} p99={p99} max={max}; wrote {out:?}"
    );
    if let Some(base) = baseline {
        let gate = base.saturating_mul(RSS_REGRESSION_MULT).min(absolute);
        assert!(
            value <= gate,
            "{label} {value} KiB exceeds baseline gate {gate} (baseline {base} × {RSS_REGRESSION_MULT}, abs {absolute}); host={host} p50={p50} p95={p95} p99={p99} max={max}; wrote {out:?}"
        );
    }
}

#[test]
fn durability_path_rss_and_latency_under_budget() {
    let warmup = DURABILITY_WARMUP;
    let runs = DURABILITY_RUNS;
    let total = warmup + runs;
    let host = host_tag();
    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("engine.db");
    let baseline = rss_kib();

    let mut e = Engine::open(&db).unwrap();
    e.register_workflow("one", "v1", one).unwrap();
    e.register_activity("lookup", "v1").unwrap();

    let mut latencies_us = Vec::with_capacity(runs);
    for i in 0..total {
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
        if i >= warmup {
            latencies_us.push(started.elapsed().as_micros());
        }
    }

    let after_work = rss_kib();
    drop(e);

    let reopen = Instant::now();
    let mut e = Engine::open(&db).unwrap();
    e.register_workflow("one", "v1", one).unwrap();
    e.register_activity("lookup", "v1").unwrap();
    for i in 0..total {
        let id = format!("r-{i}");
        assert_eq!(e.status(&id).unwrap(), RunState::Completed);
        assert_eq!(e.reconciliation_audit(&id).unwrap().len(), 1);
    }
    let reopen_us = reopen.elapsed().as_micros();
    let final_rss = rss_kib();
    drop(e);

    latencies_us.sort_unstable();
    let p50 = percentile_us(&latencies_us, 0.50);
    let p95 = percentile_us(&latencies_us, 0.95);
    let p99 = percentile_us(&latencies_us, 0.99);
    let max = latencies_us.last().copied().unwrap_or(0);
    let incremental = after_work.saturating_sub(baseline);

    let prior = load_baseline("-durability-path.json", runs);
    let prior_rss = prior
        .as_ref()
        .and_then(|v| v.get("incremental_rss_kib"))
        .and_then(|v| v.as_u64());
    let prior_p95 = prior
        .as_ref()
        .and_then(|v| v.get("start_fail_reconcile_complete_p95_us"))
        .and_then(|v| v.as_u64())
        .map(|v| v as u128);
    let prior_reopen = prior
        .as_ref()
        .and_then(|v| v.get("reopen_status_audit_us"))
        .and_then(|v| v.as_u64())
        .map(|v| v as u128);

    let report = serde_json::json!({
        "suite": "durability_path_rss_and_latency",
        "host": host,
        "warmup": warmup,
        "runs": runs,
        "baseline_rss_kib": baseline,
        "after_work_rss_kib": after_work,
        "final_rss_kib": final_rss,
        "incremental_rss_kib": incremental,
        "start_fail_reconcile_complete_p50_us": p50,
        "start_fail_reconcile_complete_p95_us": p95,
        "start_fail_reconcile_complete_p99_us": p99,
        "start_fail_reconcile_complete_max_us": max,
        "reopen_status_audit_us": reopen_us,
        "budget_incremental_rss_kib": DURABILITY_BUDGET_RSS_KIB,
        "budget_p95_us": DURABILITY_BUDGET_P95_US,
        "budget_reopen_us": DURABILITY_BUDGET_REOPEN_US,
        "baseline_regression_multiplier_rss": RSS_REGRESSION_MULT,
        "baseline_regression_multiplier_latency": LATENCY_REGRESSION_MULT,
        "prior_incremental_rss_kib": prior_rss,
        "prior_p95_us": prior_p95,
        "prior_reopen_us": prior_reopen,
    });

    let out = benchmarks_report_path();
    std::fs::create_dir_all(out.parent().unwrap()).unwrap();
    std::fs::write(&out, serde_json::to_vec_pretty(&report).unwrap()).unwrap();

    let diag = LatencyDiag {
        host: &host,
        p50,
        p95,
        p99,
        max,
    };
    if prior.is_none() {
        log_no_baseline("durability_path", &diag);
    }
    assert_rss_gate(
        "incremental RSS",
        incremental,
        DURABILITY_BUDGET_RSS_KIB,
        prior_rss,
        &out,
        &diag,
    );
    assert_under_budget_and_baseline(
        "p95 latency us",
        p95,
        DURABILITY_BUDGET_P95_US,
        prior_p95,
        LATENCY_REGRESSION_MULT,
        &out,
        &diag,
    );
    assert_under_budget_and_baseline(
        "reopen us",
        reopen_us,
        DURABILITY_BUDGET_REOPEN_US,
        prior_reopen,
        LATENCY_REGRESSION_MULT,
        &out,
        &diag,
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
    let host = host_tag();
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
    let p95 = percentile_us(&latencies_us, 0.95);
    let p99 = percentile_us(&latencies_us, 0.99);
    let max = latencies_us.last().copied().unwrap_or(0);
    let incremental = after_work.saturating_sub(baseline);

    let prior = load_baseline("-noop-waiting.json", redrives);
    let prior_rss = prior
        .as_ref()
        .and_then(|v| v.get("incremental_rss_kib"))
        .and_then(|v| v.as_u64());
    let prior_p99 = prior
        .as_ref()
        .and_then(|v| v.get("noop_waiting_p99_us"))
        .and_then(|v| v.as_u64())
        .map(|v| v as u128);

    let report = serde_json::json!({
        "suite": "noop_waiting_redrive_rss_and_latency",
        "host": host,
        "redrives": redrives,
        "baseline_rss_kib": baseline,
        "after_work_rss_kib": after_work,
        "incremental_rss_kib": incremental,
        "noop_waiting_p50_us": p50,
        "noop_waiting_p95_us": p95,
        "noop_waiting_p99_us": p99,
        "noop_waiting_max_us": max,
        "budget_incremental_rss_kib": NOOP_BUDGET_RSS_KIB,
        "budget_p99_us": NOOP_BUDGET_P99_US,
        "baseline_regression_multiplier_rss": RSS_REGRESSION_MULT,
        "baseline_regression_multiplier_latency": LATENCY_REGRESSION_MULT,
        "prior_incremental_rss_kib": prior_rss,
        "prior_p99_us": prior_p99,
    });
    let out = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("benchmarks")
        .join(format!("{}-noop-waiting.json", chrono_like_stamp()));
    std::fs::create_dir_all(out.parent().unwrap()).unwrap();
    std::fs::write(&out, serde_json::to_vec_pretty(&report).unwrap()).unwrap();

    let diag = LatencyDiag {
        host: &host,
        p50,
        p95,
        p99,
        max,
    };
    if prior.is_none() {
        log_no_baseline("noop_waiting", &diag);
    }
    assert_rss_gate(
        "noop Waiting incremental RSS",
        incremental,
        NOOP_BUDGET_RSS_KIB,
        prior_rss,
        &out,
        &diag,
    );
    assert_under_budget_and_baseline(
        "noop Waiting p99 us",
        p99,
        NOOP_BUDGET_P99_US,
        prior_p99,
        LATENCY_REGRESSION_MULT,
        &out,
        &diag,
    );
}

#[test]
fn select_baseline_newest_matching_host_wins() {
    let dir = tempfile::tempdir().unwrap();
    // Older same-host match.
    std::fs::write(
        dir.path().join("unix-day-100-durability-path.json"),
        serde_json::json!({
            "host": "linux-x86_64",
            "runs": 256,
            "incremental_rss_kib": 100,
            "marker": "older-match"
        })
        .to_string(),
    )
    .unwrap();
    // Newer other-host — must NOT win over the older matching baseline.
    std::fs::write(
        dir.path().join("unix-day-200-durability-path.json"),
        serde_json::json!({
            "host": "macos-aarch64",
            "runs": 256,
            "incremental_rss_kib": 999,
            "marker": "newer-other-host"
        })
        .to_string(),
    )
    .unwrap();

    let picked = select_baseline(dir.path(), "-durability-path.json", "linux-x86_64", 256)
        .expect("expected a matching baseline");
    assert_eq!(
        picked.get("marker").and_then(|v| v.as_str()),
        Some("older-match"),
        "newest matching host must beat a newer non-matching baseline"
    );
}

#[test]
fn select_baseline_no_match_returns_none() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(
        dir.path().join("unix-day-200-durability-path.json"),
        serde_json::json!({
            "host": "macos-aarch64",
            "runs": 256,
            "marker": "other-host"
        })
        .to_string(),
    )
    .unwrap();
    // Missing host field → no match.
    std::fs::write(
        dir.path().join("unix-day-100-durability-path.json"),
        serde_json::json!({
            "runs": 256,
            "marker": "no-host"
        })
        .to_string(),
    )
    .unwrap();
    // Wrong run count → no match.
    std::fs::write(
        dir.path().join("unix-day-300-durability-path.json"),
        serde_json::json!({
            "host": "linux-x86_64",
            "runs": 64,
            "marker": "wrong-runs"
        })
        .to_string(),
    )
    .unwrap();

    assert!(
        select_baseline(dir.path(), "-durability-path.json", "linux-x86_64", 256).is_none(),
        "no host+runs match should fall back to no-baseline"
    );
}
