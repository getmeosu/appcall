//! Live PG store.load measure: pre-seal full-history blob vs sealed history table.
//! Requires APPCALL_ENGINE_POSTGRES_URL. Set APPCALL_HISTORY_REPLAY_PHASE=before|after.
//! Writes evidence under crates/appcall-engine/benchmarks/ (required) and local benchmarks/.
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

fn seed_pre_seal_blob(client: &mut Client, id: &str, run: &RunRecord) {
    let blob = serde_json::to_vec(run).expect("encode full RunRecord blob");
    let revision = i64::try_from(run.revision).unwrap();
    client
        .execute(
            "UPDATE appcall_workflow_runs SET record=$1, revision=$2 WHERE id=$3",
            &[&blob, &revision, &id],
        )
        .unwrap();
    client
        .execute(
            "DELETE FROM appcall_workflow_history WHERE run_id=$1",
            &[&id],
        )
        .unwrap();
}

fn engine_benchmarks_dir() -> std::path::PathBuf {
    std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../appcall-engine/benchmarks")
}

#[test]
#[ignore = "requires APPCALL_ENGINE_POSTGRES_URL; writes history-replay evidence"]
fn measure_postgres_history_replay_load() {
    let url = std::env::var("APPCALL_ENGINE_POSTGRES_URL").expect("APPCALL_ENGINE_POSTGRES_URL");
    let phase =
        std::env::var("APPCALL_HISTORY_REPLAY_PHASE").expect("APPCALL_HISTORY_REPLAY_PHASE");
    assert!(
        phase == "before" || phase == "after",
        "APPCALL_HISTORY_REPLAY_PHASE must be before|after"
    );
    let schema = format!(
        "engine_hist_replay_{}_{}",
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
            let mut probe = connect();
            seed_pre_seal_blob(&mut probe, id, &base_run(id, revision, history.clone()));
            drop(probe);
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
            let mut probe = connect();
            (record_len(&mut probe, id), history_bytes(&mut probe, id))
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
    admin
        .batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
        .unwrap();

    let note = if phase == "before" {
        "Pre-seal layout: full RunRecord JSON (incl. history) in main record BYTEA; zero appcall_workflow_history rows. Times store.load."
    } else {
        "Sealed append-only appcall_workflow_history; main record BYTEA holds unresolved suffix only. Times store.load assemble path."
    };
    let out = serde_json::json!({
        "suite": format!("history_replay_postgres_{phase}"),
        "backend": "postgres",
        "phase": phase,
        "live_pg": true,
        "note": note,
        "caps": {"history_events": 1024, "record_bytes": 1048576},
        "samples_per_depth": samples,
        "points": points,
    });
    let pretty = serde_json::to_string_pretty(&out).unwrap();

    let engine_dir = engine_benchmarks_dir();
    std::fs::create_dir_all(&engine_dir).unwrap();
    let engine_path = engine_dir.join(format!("history-replay-postgres-{phase}.json"));
    std::fs::write(&engine_path, &pretty).unwrap();

    let local_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("benchmarks");
    std::fs::create_dir_all(&local_dir).unwrap();
    let local_path = local_dir.join(format!("history-replay-{phase}.json"));
    std::fs::write(&local_path, &pretty).unwrap();

    eprintln!("wrote {engine_path:?}\nwrote {local_path:?}\n{pretty}");
}
