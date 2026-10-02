//! Evidence: drive hot path no longer deep-clones history (depths 256 / 1024).
//! Compares synthetic Vec::clone cost vs borrow Context construction, then
//! measures parked Waiting re-drive latency at those depths.
//! Parked history length equals the target depth (cap 1024 inclusive).
use appcall_engine::*;
use std::time::Instant;

fn percentile_us(sorted: &[u128], p: f64) -> u128 {
    if sorted.is_empty() {
        return 0;
    }
    let idx = ((sorted.len() as f64 - 1.0) * p).round() as usize;
    sorted[idx.min(sorted.len() - 1)]
}

fn event(i: usize) -> HistoryEvent {
    HistoryEvent {
        command: Command::Timer(i as i64),
        value: Some(CommandValue::Unit),
    }
}

fn measure_clone_vs_borrow(depth: usize, iters: usize) -> (u128, u128, u128, u128) {
    let history: Vec<HistoryEvent> = (0..depth).map(event).collect();
    for _ in 0..8 {
        let _ = history.clone();
        let _ = history.as_slice();
    }
    let mut clone_samples = Vec::with_capacity(iters);
    for _ in 0..iters {
        let t = Instant::now();
        let cloned = history.clone();
        clone_samples.push(t.elapsed().as_nanos());
        std::hint::black_box(cloned);
    }
    let mut borrow_samples = Vec::with_capacity(iters);
    for _ in 0..iters {
        let t = Instant::now();
        let borrowed: &[HistoryEvent] = &history;
        let cursor = borrowed.len();
        borrow_samples.push(t.elapsed().as_nanos());
        std::hint::black_box((borrowed.len(), cursor));
    }
    clone_samples.sort_unstable();
    borrow_samples.sort_unstable();
    let clone_p50 = clone_samples[clone_samples.len() / 2] / 1000;
    let clone_p99 = clone_samples[(clone_samples.len() - 1) * 99 / 100] / 1000;
    let borrow_p50 = borrow_samples[borrow_samples.len() / 2] / 1000;
    let borrow_p99 = borrow_samples[(borrow_samples.len() - 1) * 99 / 100] / 1000;
    (clone_p50, clone_p99, borrow_p50, borrow_p99)
}

fn measure_redrive_at_depth(depth: usize, redrives: usize) -> (u128, u128, usize) {
    // depth events total: (depth-1) resolved timers + 1 open signal (fits cap 1024).
    assert!(depth >= 1 && depth <= 1024);
    let timers = depth - 1;
    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("engine.db");
    let mut e = Engine::open(&db).unwrap();
    e.register_workflow("deep-wait", "v1", move |c| {
        for i in 0..timers {
            c.timer(i as i64)?;
        }
        c.signal("go")?;
        Ok(c.input().clone())
    })
    .unwrap();

    e.start(
        "r",
        "deep-wait",
        "v1",
        PayloadRef::durable("input").unwrap(),
    )
    .unwrap();
    let now = timers as i64;
    let mut guard = 0usize;
    loop {
        guard += 1;
        assert!(guard < 64, "failed to park on signal at depth {depth}");
        match e.drive("r", now).unwrap() {
            DriveOutcome::Waiting => {
                let hist = e.history("r").unwrap();
                if hist.len() == depth && hist.last().is_some_and(|h| h.value.is_none()) {
                    break;
                }
            }
            DriveOutcome::Progressed => {}
            other => panic!("unexpected while seeding depth {depth}: {other:?}"),
        }
    }
    let hist_len = e.history("r").unwrap().len();

    let mut samples = Vec::with_capacity(redrives);
    for _ in 0..redrives {
        let t = Instant::now();
        assert!(matches!(e.drive("r", now).unwrap(), DriveOutcome::Waiting));
        samples.push(t.elapsed().as_micros());
    }
    samples.sort_unstable();
    (
        percentile_us(&samples, 0.50),
        percentile_us(&samples, 0.99),
        hist_len,
    )
}

#[test]
fn history_borrow_bench_depths_256_and_1024() {
    let iters = 200usize;
    let redrives = 64usize;
    let mut depth_reports = Vec::new();
    for depth in [256usize, 1024usize] {
        let (clone_p50, clone_p99, borrow_p50, borrow_p99) = measure_clone_vs_borrow(depth, iters);
        let (redrive_p50, redrive_p99, hist_len) = measure_redrive_at_depth(depth, redrives);
        assert_eq!(hist_len, depth, "parked history depth");
        assert!(
            borrow_p99 <= clone_p99,
            "borrow p99 {borrow_p99}us should be <= clone p99 {clone_p99}us at depth {depth}"
        );
        depth_reports.push(serde_json::json!({
            "history_depth": depth,
            "parked_history_len": hist_len,
            "clone_construct_p50_us": clone_p50,
            "clone_construct_p99_us": clone_p99,
            "borrow_construct_p50_us": borrow_p50,
            "borrow_construct_p99_us": borrow_p99,
            "noop_redrive_p50_us": redrive_p50,
            "noop_redrive_p99_us": redrive_p99,
            "redrives": redrives,
            "construct_iters": iters,
            "history_clone_on_hot_path": false,
        }));
    }
    let c256 = depth_reports[0]["clone_construct_p99_us"].as_u64().unwrap();
    let c1024 = depth_reports[1]["clone_construct_p99_us"].as_u64().unwrap();
    assert!(
        c1024 >= c256,
        "clone cost should not shrink with depth ({c1024} vs {c256})"
    );

    let report = serde_json::json!({
        "suite": "history_borrow_drive_hot_path",
        "note": "Context now borrows &[HistoryEvent]; history.clone() removed from drive/evaluate loop.",
        "caps_unchanged": {"history": 1024, "encoded_record_mib": 1},
        "depths": depth_reports,
    });
    let out = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("benchmarks")
        .join("history-borrow-after.json");
    std::fs::create_dir_all(out.parent().unwrap()).unwrap();
    std::fs::write(&out, serde_json::to_vec_pretty(&report).unwrap()).unwrap();
    eprintln!("{}", serde_json::to_string_pretty(&report).unwrap());
}
