//! Arch PG one-pager footguns. Live blob-rewrite WAL/TOAST vs history depth
//! evidence lives in benchmarks/blob-rewrite-{before,after}.json (requires
//! APPCALL_ENGINE_POSTGRES_URL to regenerate). No SKIP LOCKED.
//! Open-scan uses denormalized `recoverable` + indexed UPDATE.
//! Sealed history is append-only; main record no longer full-row rewrites history.

#[test]
fn session_advisory_and_txn_pooling_ban_are_load_bearing_in_source() {
    let lib = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/src/lib.rs"));
    assert!(
        lib.contains("pg_try_advisory_lock"),
        "session advisory ownership must remain in PostgresStore::from_client"
    );
    assert!(
        lib.contains("never a transaction-pooling proxy"),
        "txn pooling ban is load-bearing documentation in lib.rs"
    );
    assert!(
        lib.contains("octet_length(record)<=1048576"),
        "1MiB record CHECK must remain on appcall_workflow_runs"
    );
    assert!(
        lib.contains("appcall_workflow_history"),
        "sealed history must live in append-only appcall_workflow_history"
    );
    assert!(
        lib.contains("seal_end"),
        "commit must seal resolved prefix instead of rewriting full history BYTEA"
    );
    assert!(
        lib.contains("recoverable"),
        "open recovery must denormalize recoverable (no full-table blob decode)"
    );
    assert!(
        lib.contains("WHERE state='running' AND recoverable"),
        "recover_running must filter the recoverable index subset"
    );
    assert!(
        !lib.contains("RECOVERY_BATCH_SIZE"),
        "paged full-running blob-scan recovery must stay gone"
    );
    assert!(
        !lib.to_ascii_lowercase().contains("skip locked"),
        "multi-worker SKIP LOCKED must not appear in postgres store"
    );
    let dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("benchmarks");
    for name in [
        "arch-pg-footguns.json",
        "blob-rewrite-before.json",
        "blob-rewrite-after.json",
    ] {
        let artifact = dir.join(name);
        assert!(artifact.is_file(), "missing PG footgun evidence at {artifact:?}");
    }
    let body = std::fs::read_to_string(dir.join("arch-pg-footguns.json")).unwrap();
    assert!(body.contains("txn_pooling_rejected"));
    assert!(body.contains("skip_locked_multi_worker"));
    assert!(body.contains("\"txn_pooling_rejected\": true"));
    assert!(body.contains("\"skip_locked_multi_worker\": false"));
    assert!(body.contains("recoverable"));
    assert!(body.contains("appcall_workflow_history") || body.contains("FIXED"));

    let before: serde_json::Value = serde_json::from_str(
        &std::fs::read_to_string(dir.join("blob-rewrite-before.json")).unwrap(),
    )
    .unwrap();
    let after: serde_json::Value = serde_json::from_str(
        &std::fs::read_to_string(dir.join("blob-rewrite-after.json")).unwrap(),
    )
    .unwrap();
    assert_eq!(before["live_pg"], true);
    assert_eq!(after["live_pg"], true);
    let before_1024 = before["points"]
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["history_depth"] == 1024)
        .unwrap()["wal_bytes_median"]
        .as_u64()
        .unwrap();
    let after_1024 = after["points"]
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["history_depth"] == 1024)
        .unwrap()["wal_bytes_median"]
        .as_u64()
        .unwrap();
    assert!(
        after_1024 * 4 < before_1024,
        "depth-1024 WAL median must drop sharply after seal split ({before_1024} -> {after_1024})"
    );
    let after_1 = after["points"]
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["history_depth"] == 1)
        .unwrap()["wal_bytes_median"]
        .as_u64()
        .unwrap();
    assert!(
        after_1024 <= after_1.saturating_mul(2).saturating_add(256),
        "after WAL median must stay flat vs depth ({after_1} @1 vs {after_1024} @1024)"
    );
}
