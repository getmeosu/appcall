//! SQLite store.load evidence: pre-seal full-history blob vs sealed engine_history.
//! Regenerate with APPCALL_HISTORY_REPLAY_PHASE=before|after (ignored measure).
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

fn seed_pre_seal_blob(db: &std::path::Path, id: &str, run: &RunRecord) {
    let blob = serde_json::to_vec(run).expect("encode full RunRecord blob");
    let conn = rusqlite::Connection::open(db).unwrap();
    conn.execute(
        "UPDATE engine_runs SET record=?1, revision=?2 WHERE id=?3",
        rusqlite::params![blob, run.revision as i64, id],
    )
    .unwrap();
    conn.execute("DELETE FROM engine_history WHERE run_id=?1", [id])
        .unwrap();
}

#[test]
fn sqlite_history_replay_evidence_and_caps_remain() {
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
        store.contains("assemble") && store.contains("Legacy row"),
        "assemble must keep legacy empty-sealed full-blob load path"
    );

    let acceptance = include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/tests/acceptance_bar.rs"
    ));
    assert!(
        acceptance.contains("exclusive_owner_epoch_cas_stale_revision_conflict_no_mutation"),
        "exclusive-owner epoch + revision CAS acceptance must remain"
    );
    assert!(
        store.contains("try_lock_exclusive") && store.contains("epoch"),
        "exclusive flock + epoch bump must remain in store"
    );
    assert!(
        store.contains("WHERE id=?1 AND revision=?7") || store.contains("revision=?7"),
        "revision CAS on commit must remain"
    );

    let dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("benchmarks");
    for name in [
        "history-replay-sqlite-before.json",
        "history-replay-sqlite-after.json",
        "history-replay-postgres-before.json",
        "history-replay-postgres-after.json",
    ] {
        let path = dir.join(name);
        assert!(
            path.is_file(),
            "missing history-replay evidence at {path:?}"
        );
    }

    let before: serde_json::Value = serde_json::from_str(
        &std::fs::read_to_string(dir.join("history-replay-sqlite-before.json")).unwrap(),
    )
    .unwrap();
    let after: serde_json::Value = serde_json::from_str(
        &std::fs::read_to_string(dir.join("history-replay-sqlite-after.json")).unwrap(),
    )
    .unwrap();
    assert_eq!(before["caps"]["history_events"], 1024);
    assert_eq!(before["caps"]["record_bytes"], 1_048_576);
    assert_eq!(after["caps"]["history_events"], 1024);
    assert_eq!(after["caps"]["record_bytes"], 1_048_576);

    let before_1024 = before["points"]
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["history_depth"] == 1024)
        .expect("sqlite before depth 1024");
    let after_1024 = after["points"]
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["history_depth"] == 1024)
        .expect("sqlite after depth 1024");
    assert_eq!(before_1024["events_loaded"], 1024);
    assert_eq!(after_1024["events_loaded"], 1024);
    assert_eq!(before_1024["history_table_bytes"], 0);
    assert!(
        after_1024["history_table_bytes"].as_i64().unwrap() > 0,
        "sealed after path must store events in engine_history"
    );
    assert!(
        after_1024["record_bytes"].as_i64().unwrap() * 10
            < before_1024["record_bytes"].as_i64().unwrap(),
        "depth-1024 sealed record body must be far smaller than pre-seal blob"
    );
}

#[test]
#[ignore = "set APPCALL_HISTORY_REPLAY_PHASE=before|after to regenerate evidence"]
fn measure_sqlite_history_replay_load() {
    let Ok(phase) = std::env::var("APPCALL_HISTORY_REPLAY_PHASE") else {
        // cargo test -- --ignored runs without a regenerate request.
        return;
    };
    assert!(
        phase == "before" || phase == "after",
        "APPCALL_HISTORY_REPLAY_PHASE must be before|after, got {phase}"
    );

    let depths: &[usize] = &[1, 16, 64, 256, 512, 1024];
    let samples = 5u32;
    let mut points = Vec::new();

    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("engine.db");
    let mut store = SqliteStore::open(&db).unwrap();
    let id = "hist-replay";
    store.insert(&base_run(id, 0, vec![])).unwrap();

    let mut history = Vec::new();
    let mut revision = 0u64;

    for &target in depths {
        while history.len() < target {
            history.push(event_at(history.len()));
        }

        if phase == "after" {
            let run = base_run(id, revision + 1, history.clone());
            store.commit(revision, &run, &[]).unwrap();
            revision += 1;
        } else {
            // Pre-seal layout: full RunRecord JSON in main blob, zero history rows.
            seed_pre_seal_blob(&db, id, &base_run(id, revision, history.clone()));
        }

        let mut times = Vec::new();
        let mut events_loaded = 0usize;
        for _ in 0..samples {
            let t0 = Instant::now();
            let loaded = store.load(id).unwrap();
            let ms = t0.elapsed().as_secs_f64() * 1000.0;
            events_loaded = loaded.history.len();
            assert_eq!(events_loaded, target, "load must return full history depth");
            times.push(ms);
        }

        let (rec_bytes, hist_bytes) = {
            let probe = rusqlite::Connection::open(&db).unwrap();
            (record_len(&probe, id), history_bytes(&probe, id))
        };
        if phase == "before" {
            assert_eq!(
                hist_bytes, 0,
                "pre-seal blob path must leave history table empty"
            );
        }

        times.sort_by(|a, b| a.partial_cmp(b).unwrap());
        points.push(serde_json::json!({
            "history_depth": target,
            "record_bytes": rec_bytes,
            "history_table_bytes": hist_bytes,
            "durable_bytes": rec_bytes + hist_bytes,
            "load_median_ms": times[times.len() / 2],
            "load_max_ms": times[times.len() - 1],
            "events_loaded": events_loaded,
        }));
    }

    drop(store);

    let note = if phase == "before" {
        "Pre-seal layout: full RunRecord JSON (incl. history) in main record BLOB; zero engine_history rows. Times store.load."
    } else {
        "Sealed append-only engine_history; main record BLOB holds unresolved suffix only. Times store.load assemble path."
    };
    let out = serde_json::json!({
        "suite": format!("history_replay_sqlite_{phase}"),
        "backend": "sqlite",
        "phase": phase,
        "note": note,
        "caps": {"history_events": 1024, "record_bytes": 1048576},
        "samples_per_depth": samples,
        "points": points,
    });

    let bench = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("benchmarks");
    std::fs::create_dir_all(&bench).unwrap();
    let path = bench.join(format!("history-replay-sqlite-{phase}.json"));
    std::fs::write(&path, serde_json::to_string_pretty(&out).unwrap()).unwrap();
    eprintln!("wrote {path:?}");
}
