//! Open-scan cost at N: before was O(N) full-table blob decode; after is indexed
//! recoverable UPDATE (passive waits do not pay per-row decode on open).
//! Caps stay 1024 history / 1 MiB. Evidence JSON under benchmarks/.
use appcall_engine::*;
use std::time::Instant;

fn seed_passive_running_raw(db: &std::path::Path, n: usize) {
    {
        let mut e = Engine::open(db).unwrap();
        e.register_workflow("idle", "v1", |c| {
            c.timer(1_000_000_000)?;
            Ok(c.input().clone())
        })
        .unwrap();
        e.start("seed0", "idle", "v1", PayloadRef::durable("input").unwrap())
            .unwrap();
        assert!(matches!(
            e.drive("seed0", 0).unwrap(),
            DriveOutcome::Waiting
        ));
        drop(e);
    }
    if n <= 1 {
        return;
    }
    let conn = rusqlite::Connection::open(db).unwrap();
    let template: Vec<u8> = conn
        .query_row(
            "SELECT record FROM engine_runs WHERE id='seed0'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    let mut tmpl: serde_json::Value = serde_json::from_slice(&template).unwrap();
    let tx = conn.unchecked_transaction().unwrap();
    for i in 1..n {
        let id = format!("r{i:05}");
        tmpl["id"] = serde_json::Value::String(id.clone());
        let bytes = serde_json::to_vec(&tmpl).unwrap();
        tx.execute(
            "INSERT INTO engine_runs(id,revision,state,wakeup,record,recoverable)
             VALUES(?1,1,'running',1000000000,?2,0)",
            rusqlite::params![id, bytes],
        )
        .unwrap();
    }
    tx.commit().unwrap();
}

fn time_open_ms(db: &std::path::Path, samples: u32) -> (f64, f64) {
    let mut times = Vec::new();
    for _ in 0..samples {
        let t0 = Instant::now();
        let store = SqliteStore::open(db).unwrap();
        let ms = t0.elapsed().as_secs_f64() * 1000.0;
        drop(store);
        times.push(ms);
    }
    times.sort_by(|a, b| a.partial_cmp(b).unwrap());
    (times[times.len() / 2], *times.last().unwrap())
}

#[test]
fn open_scan_after_is_sublinear_for_passive_waits() {
    let before_path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("benchmarks/open-scan-before.json");
    assert!(
        before_path.is_file(),
        "missing before evidence at {before_path:?}"
    );
    let before: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(&before_path).unwrap()).unwrap();
    let before_10k = before["points"]
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["n_running"] == 10_000)
        .unwrap()["open_median_ms"]
        .as_f64()
        .unwrap();

    let ns = [10usize, 100, 1000, 10_000];
    let mut points = Vec::new();
    for &n in &ns {
        let dir = tempfile::tempdir().unwrap();
        let db = dir.path().join("engine.db");
        let seed_t0 = Instant::now();
        seed_passive_running_raw(&db, n);
        let seed_ms = seed_t0.elapsed().as_secs_f64() * 1000.0;
        let (median_ms, max_ms) = time_open_ms(&db, 7);
        points.push(serde_json::json!({
            "n_running": n,
            "seed_ms": seed_ms,
            "open_median_ms": median_ms,
            "open_max_ms": max_ms,
        }));
    }
    let after_10k = points
        .iter()
        .find(|p| p["n_running"] == 10_000)
        .unwrap()["open_median_ms"]
        .as_f64()
        .unwrap();
    let after_1k = points
        .iter()
        .find(|p| p["n_running"] == 1000)
        .unwrap()["open_median_ms"]
        .as_f64()
        .unwrap();
    let after_100 = points
        .iter()
        .find(|p| p["n_running"] == 100)
        .unwrap()["open_median_ms"]
        .as_f64()
        .unwrap();

    // Complexity: 10k must not scale like before (~95ms). Allow generous host noise.
    assert!(
        after_10k < before_10k * 0.35,
        "10k open should drop vs before blob-scan ({before_10k:.3}ms); got {after_10k:.3}ms"
    );
    // Sublinear: 10k / 100 should not approach 100× (O(N) would).
    let ratio = after_10k / after_100.max(0.05);
    assert!(
        ratio < 25.0,
        "open at 10k vs 100 should stay far below O(N); ratio={ratio:.1} (after_100={after_100:.3} after_10k={after_10k:.3})"
    );
    let _ = after_1k;

    let report = serde_json::json!({
        "suite": "open_scan_after",
        "backend": "sqlite",
        "fix": "denormalized recoverable INTEGER + indexed SELECT of recoverable=1 subset (O(K)); passive waits not decoded on open",
        "caps": {"history": 1024, "record_bytes": 1048576},
        "samples_per_n": 7,
        "before_10k_open_median_ms": before_10k,
        "points": points,
    });
    let out = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("benchmarks/open-scan-after.json");
    std::fs::write(&out, serde_json::to_string_pretty(&report).unwrap()).unwrap();
}

#[test]
fn open_requeues_ready_via_recoverable_flag_not_blob_scan() {
    let store_src = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/src/store.rs"));
    assert!(
        store_src.contains("recoverable"),
        "store must denormalize recoverable"
    );
    assert!(
        store_src.contains("WHERE state='running' AND recoverable=1"),
        "open must filter recoverable index subset (O(K), not O(N))"
    );

    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("engine.db");
    {
        let mut e = Engine::open(&db).unwrap();
        e.set_dispatch_limit(1).unwrap();
        e.register_workflow("ready-one", "v1", |c| {
            c.activity("lookup", "v1", c.input().clone(), EffectPolicy::Read)
        })
        .unwrap();
        e.register_activity("lookup", "v1").unwrap();
        for id in ["ready-a", "ready-b"] {
            e.start(id, "ready-one", "v1", PayloadRef::durable("input").unwrap())
                .unwrap();
        }
        assert!(matches!(
            e.drive("ready-a", 0).unwrap(),
            DriveOutcome::Activity(_)
        ));
        assert!(matches!(
            e.drive("ready-b", 0).unwrap(),
            DriveOutcome::Waiting
        ));
        let flag: i64 = {
            // peek via reopen path after drop
            0
        };
        let _ = flag;
        drop(e);
    }
    {
        let conn = rusqlite::Connection::open(&db).unwrap();
        let flag: i64 = conn
            .query_row(
                "SELECT recoverable FROM engine_runs WHERE id='ready-b'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(flag, 1, "Ready task must set recoverable=1 on commit");
    }
    let e = Engine::open(&db).unwrap();
    assert!(e.runnable(0, 10).unwrap().contains(&"ready-b".to_string()));
}

#[test]
fn pre_column_sqlite_db_backfills_recoverable_on_open() {
    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("legacy.db");
    {
        let conn = rusqlite::Connection::open(&db).unwrap();
        conn.execute_batch(
            "CREATE TABLE engine_owner (id INTEGER PRIMARY KEY CHECK(id=1), epoch INTEGER NOT NULL);
             INSERT INTO engine_owner VALUES(1,0);
             CREATE TABLE engine_runs (
                id TEXT PRIMARY KEY,
                revision INTEGER NOT NULL,
                state TEXT NOT NULL,
                wakeup INTEGER,
                record BLOB NOT NULL
             );",
        )
        .unwrap();
    }
    // Build a real recoverable record via a fresh engine, copy bytes into legacy schema.
    let tmp = tempfile::tempdir().unwrap();
    let modern = tmp.path().join("modern.db");
    {
        let mut e = Engine::open(&modern).unwrap();
        e.set_dispatch_limit(1).unwrap();
        e.register_workflow("ready-one", "v1", |c| {
            c.activity("lookup", "v1", c.input().clone(), EffectPolicy::Read)
        })
        .unwrap();
        e.register_activity("lookup", "v1").unwrap();
        e.start("ready-a", "ready-one", "v1", PayloadRef::durable("input").unwrap())
            .unwrap();
        e.start("ready-b", "ready-one", "v1", PayloadRef::durable("input").unwrap())
            .unwrap();
        assert!(matches!(
            e.drive("ready-a", 0).unwrap(),
            DriveOutcome::Activity(_)
        ));
        assert!(matches!(
            e.drive("ready-b", 0).unwrap(),
            DriveOutcome::Waiting
        ));
        drop(e);
    }
    {
        let src = rusqlite::Connection::open(&modern).unwrap();
        let dst = rusqlite::Connection::open(&db).unwrap();
        let mut stmt = src
            .prepare("SELECT id,revision,state,wakeup,record FROM engine_runs")
            .unwrap();
        let rows = stmt
            .query_map([], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, i64>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, Option<i64>>(3)?,
                    r.get::<_, Vec<u8>>(4)?,
                ))
            })
            .unwrap();
        for row in rows {
            let (id, rev, state, wakeup, record) = row.unwrap();
            dst.execute(
                "INSERT INTO engine_runs(id,revision,state,wakeup,record) VALUES(?1,?2,?3,?4,?5)",
                rusqlite::params![id, rev, state, wakeup, record],
            )
            .unwrap();
        }
    }
    let e = Engine::open(&db).unwrap();
    assert!(
        e.runnable(0, 10).unwrap().contains(&"ready-b".to_string()),
        "legacy DB must backfill recoverable and requeue Ready on open"
    );
}
