//! SQLite sealed-history evidence: full-row BLOB rewrite vs append-only seal.
//! Regenerate with APPCALL_BLOB_REWRITE_PHASE=before|after (ignored measure).
use appcall_engine::*;
use std::time::Instant;

fn event_at(i: usize) -> HistoryEvent {
    let input_key = format!("in-{i}");
    HistoryEvent {
        command: Command::Activity {
            name: format!("act-{i}"),
            version: "v1".into(),
            input: PayloadRef::durable(&input_key).unwrap(),
            policy: EffectPolicy::Idempotent,
            detached_wait: false,
        },
        value: Some(CommandValue::Activity(ActivityHandle(format!("h-{i}")))),
    }
}

fn base_run(id: &str, revision: u64, history: Vec<HistoryEvent>) -> RunRecord {
    RunRecord {
        id: id.into(),
        parent: None,
        workflow: "bench".into(),
        version: "v1".into(),
        input: PayloadRef::durable("input").unwrap(),
        state: RunState::Running,
        failure_reason: None,
        revision,
        history,
        tasks: vec![],
        signals: vec![],
        children: vec![],
        output: None,
        wakeup: Some(0),
        reconciliation_audit: vec![],
        continued_as: None,
    }
}

fn record_len(conn: &rusqlite::Connection, id: &str) -> i64 {
    conn.query_row(
        "SELECT length(record) FROM engine_runs WHERE id=?1",
        [id],
        |r| r.get(0),
    )
    .unwrap()
}

fn history_bytes(conn: &rusqlite::Connection, id: &str) -> i64 {
    let exists: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='engine_history'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    if exists == 0 {
        return 0;
    }
    conn.query_row(
        "SELECT COALESCE(SUM(length(event)),0) FROM engine_history WHERE run_id=?1",
        [id],
        |r| r.get(0),
    )
    .unwrap()
}

fn wal_size(db: &std::path::Path) -> u64 {
    let wal = {
        let mut s = db.as_os_str().to_os_string();
        s.push("-wal");
        std::path::PathBuf::from(s)
    };
    std::fs::metadata(&wal).map(|m| m.len()).unwrap_or(0)
}

#[test]
fn sqlite_sealed_history_is_load_bearing_in_source_and_evidence() {
    let store = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/src/store.rs"));
    assert!(
        store.contains("engine_history"),
        "sealed history must live in append-only engine_history"
    );
    assert!(
        store.contains("seal_end"),
        "commit must seal resolved prefix instead of rewriting full history BLOB"
    );
    assert!(
        store.contains("HISTORY_CAP") && store.contains("1024"),
        "1024 history cap must remain"
    );
    assert!(
        store.contains("RECORD_CAP") || store.contains("1048576"),
        "1MiB record cap must remain"
    );
    assert!(
        !store.to_ascii_lowercase().contains("skip locked"),
        "SKIP LOCKED must not appear in sqlite store"
    );

    let dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("benchmarks");
    for name in [
        "blob-rewrite-sqlite-before.json",
        "blob-rewrite-sqlite-after.json",
    ] {
        let path = dir.join(name);
        assert!(
            path.is_file(),
            "missing sqlite blob-rewrite evidence at {path:?}"
        );
    }
    let before: serde_json::Value = serde_json::from_str(
        &std::fs::read_to_string(dir.join("blob-rewrite-sqlite-before.json")).unwrap(),
    )
    .unwrap();
    let after: serde_json::Value = serde_json::from_str(
        &std::fs::read_to_string(dir.join("blob-rewrite-sqlite-after.json")).unwrap(),
    )
    .unwrap();
    let before_1024 = before["points"]
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["history_depth"] == 1024)
        .unwrap();
    let after_1024 = after["points"]
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["history_depth"] == 1024)
        .unwrap();
    let before_rec = before_1024["record_bytes"].as_i64().unwrap();
    let after_rec = after_1024["record_bytes"].as_i64().unwrap();
    assert!(
        after_rec * 10 < before_rec,
        "depth-1024 record body must shrink sharply after seal ({before_rec} -> {after_rec})"
    );
    let after_1 = after["points"]
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["history_depth"] == 1)
        .unwrap()["record_bytes"]
        .as_i64()
        .unwrap();
    assert!(
        (after_rec - after_1).abs() < 64,
        "after record body must stay flat vs depth ({after_1} @1 vs {after_rec} @1024)"
    );
}

#[test]
#[ignore = "set APPCALL_BLOB_REWRITE_PHASE=before|after to regenerate evidence"]
fn measure_sqlite_blob_rewrite_vs_history_depth() {
    let Ok(phase) = std::env::var("APPCALL_BLOB_REWRITE_PHASE") else {
        // cargo test -- --ignored runs without a regenerate request.
        return;
    };
    assert!(
        phase == "before" || phase == "after",
        "APPCALL_BLOB_REWRITE_PHASE must be before|after, got {phase}"
    );

    let depths: &[usize] = &[1, 16, 64, 256, 512, 1024];
    let samples = 5u32;
    let mut points = Vec::new();

    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("engine.db");
    let mut store = SqliteStore::open(&db).unwrap();
    let id = "blob-rw";
    store.insert(&base_run(id, 0, vec![])).unwrap();

    let mut history = Vec::new();
    let mut revision = 0u64;

    for &target in depths {
        while history.len() < target {
            history.push(event_at(history.len()));
        }
        let mut times = Vec::new();
        let mut wals = Vec::new();
        let mut rec_bytes = 0i64;
        let mut hist_bytes = 0i64;

        for s in 0..samples {
            let mut run = base_run(id, revision + 1, history.clone());
            run.wakeup = Some(i64::from(s));

            {
                let probe = rusqlite::Connection::open(&db).unwrap();
                let _ = probe.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
            }
            let w0 = wal_size(&db);

            let t0 = Instant::now();
            store.commit(revision, &run, &[]).unwrap();
            let ms = t0.elapsed().as_secs_f64() * 1000.0;
            revision += 1;

            let w1 = wal_size(&db);
            {
                let probe = rusqlite::Connection::open(&db).unwrap();
                rec_bytes = record_len(&probe, id);
                hist_bytes = history_bytes(&probe, id);
            }

            times.push(ms);
            wals.push(w1.saturating_sub(w0));
        }

        times.sort_by(|a, b| a.partial_cmp(b).unwrap());
        wals.sort_unstable();
        points.push(serde_json::json!({
            "history_depth": target,
            "record_bytes": rec_bytes,
            "history_table_bytes": hist_bytes,
            "durable_bytes": rec_bytes + hist_bytes,
            "commit_median_ms": times[times.len() / 2],
            "commit_max_ms": times[times.len() - 1],
            "wal_bytes_median": wals[wals.len() / 2],
            "wal_bytes_max": wals[wals.len() - 1],
        }));
    }

    drop(store);

    let note = if phase == "before" {
        "Full-row BLOB UPDATE of record (serde RunRecord incl. history) on every commit."
    } else {
        "Append-only sealed history rows in engine_history; main record BLOB holds unresolved suffix only."
    };
    let out = serde_json::json!({
        "suite": format!("blob_rewrite_sqlite_{phase}"),
        "backend": "sqlite",
        "phase": phase,
        "note": note,
        "caps": {"history_events": 1024, "record_bytes": 1048576},
        "samples_per_depth": samples,
        "points": points,
    });

    let bench = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("benchmarks");
    std::fs::create_dir_all(&bench).unwrap();
    let path = bench.join(format!("blob-rewrite-sqlite-{phase}.json"));
    std::fs::write(&path, serde_json::to_string_pretty(&out).unwrap()).unwrap();
    eprintln!("wrote {path:?}");
}
