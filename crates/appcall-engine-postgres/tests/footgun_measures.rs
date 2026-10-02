//! Arch PG one-pager footguns documented without requiring a live database.
//! Live blob-rewrite WAL/TOAST vs history depth and open-scan timing stay behind
//! APPCALL_ENGINE_POSTGRES_URL (see contract.rs ignore tests). No SKIP LOCKED.

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
        !lib.to_ascii_lowercase().contains("skip locked"),
        "multi-worker SKIP LOCKED must not appear in postgres store"
    );
    let artifact = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("benchmarks/arch-pg-footguns.json");
    assert!(
        artifact.is_file(),
        "missing PG footgun evidence artifact at {artifact:?}"
    );
    let body = std::fs::read_to_string(&artifact).unwrap();
    assert!(body.contains("txn_pooling_rejected"));
    assert!(body.contains("skip_locked_multi_worker"));
    assert!(body.contains("\"txn_pooling_rejected\": true"));
    assert!(body.contains("\"skip_locked_multi_worker\": false"));
}
