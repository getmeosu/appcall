//! Live PG measure: BYTEA rewrite WAL/latency vs history depth.
//! Requires APPCALL_ENGINE_POSTGRES_URL. Set APPCALL_BLOB_REWRITE_PHASE=before|after
//! to choose the evidence filename under benchmarks/.
use appcall_engine::*;
use appcall_engine_postgres::PostgresStore;
use postgres::{Client, NoTls};
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

fn wal_lsn(client: &mut Client) -> u64 {
    let s: String = client
        .query_one("SELECT pg_current_wal_insert_lsn()::text", &[])
        .unwrap()
        .get(0);
    let (hi, lo) = s.split_once('/').unwrap();
    (u64::from_str_radix(hi, 16).unwrap() << 32) | u64::from_str_radix(lo, 16).unwrap()
}

fn record_len(client: &mut Client, id: &str) -> i64 {
    let n: i32 = client
        .query_one(
            "SELECT octet_length(record) FROM appcall_workflow_runs WHERE id=$1",
            &[&id],
        )
        .unwrap()
        .get(0);
    i64::from(n)
}

fn history_bytes(client: &mut Client, id: &str) -> i64 {
    let exists: bool = client
        .query_one(
            "SELECT EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_schema = current_schema()
                  AND table_name = 'appcall_workflow_history'
             )",
            &[],
        )
        .unwrap()
        .get(0);
    if !exists {
        return 0;
    }
    let n: i64 = client
        .query_one(
            "SELECT COALESCE(SUM(octet_length(event)),0)::bigint
             FROM appcall_workflow_history WHERE run_id=$1",
            &[&id],
        )
        .unwrap()
        .get(0);
    n
}

#[test]
#[ignore = "requires APPCALL_ENGINE_POSTGRES_URL; writes blob-rewrite evidence"]
fn measure_blob_rewrite_vs_history_depth() {
    let url = std::env::var("APPCALL_ENGINE_POSTGRES_URL").expect("APPCALL_ENGINE_POSTGRES_URL");
    let phase = std::env::var("APPCALL_BLOB_REWRITE_PHASE").unwrap_or_else(|_| "before".into());
    assert!(
        phase == "before" || phase == "after",
        "APPCALL_BLOB_REWRITE_PHASE must be before|after"
    );
    let schema = format!(
        "engine_blob_rw_{}_{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    );
    let mut admin = Client::connect(&url, NoTls).unwrap();
    admin
        .batch_execute(&format!("CREATE SCHEMA {schema}"))
        .unwrap();
    let connect = {
        let url = url.clone();
        let schema = schema.clone();
        move || {
            let mut c = Client::connect(&url, NoTls).unwrap();
            c.batch_execute(&format!("SET search_path TO {schema}"))
                .unwrap();
            c
        }
    };

    let depths: &[usize] = &[1, 16, 64, 256, 512, 1024];
    let samples = 5u32;
    let mut points = Vec::new();

    let mut store = PostgresStore::from_client(connect()).unwrap();
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

            let mut probe = connect();
            let w0 = wal_lsn(&mut probe);
            drop(probe);

            let t0 = Instant::now();
            store.commit(revision, &run, &[]).unwrap();
            let ms = t0.elapsed().as_secs_f64() * 1000.0;
            revision += 1;

            let mut probe = connect();
            let w1 = wal_lsn(&mut probe);
            rec_bytes = record_len(&mut probe, id);
            hist_bytes = history_bytes(&mut probe, id);
            drop(probe);

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
    admin
        .batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
        .unwrap();

    let note = if phase == "before" {
        "Full-row BYTEA UPDATE of record (serde RunRecord incl. history) on every commit."
    } else {
        "Append-only sealed history rows in appcall_workflow_history; main record BYTEA holds unresolved suffix only (no full-history rewrite)."
    };
    let out = serde_json::json!({
        "suite": format!("blob_rewrite_{phase}"),
        "backend": "postgres",
        "phase": phase,
        "live_pg": true,
        "note": note,
        "caps": {"history_events": 1024, "record_bytes": 1048576},
        "samples_per_depth": samples,
        "points": points,
    });

    let dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("benchmarks");
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join(format!("blob-rewrite-{phase}.json"));
    std::fs::write(&path, serde_json::to_string_pretty(&out).unwrap()).unwrap();
    eprintln!("wrote {path:?}\n{}", serde_json::to_string_pretty(&out).unwrap());
}
