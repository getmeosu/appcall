use appcall_runtime::{Config, SessionHealth};
use std::collections::BTreeMap;
#[test]
#[ignore = "requires explicit local PostgreSQL"]
fn tracker_detects_one_dead_session_while_other_session_remains_healthy() {
    let url =
        std::env::var("APPCALL_ENGINE_POSTGRES_URL").expect("explicit PostgreSQL URL required");
    let cfg = Config::from_map(&BTreeMap::from([
        ("APPCALL_DATABASE_URL".into(), url.clone()),
        ("APPCALL_RUNNER_URL".into(), "http://127.0.0.1:1".into()),
        ("APPCALL_SECRET_KEY".into(), "07".repeat(32)),
    ]))
    .unwrap();
    let (generation, tracker) = cfg.generation();
    let mut first = generation.connect().unwrap();
    let mut second = generation.connect_auxiliary(&url).unwrap();
    assert_eq!(tracker.session_count(), 2);
    assert_eq!(tracker.probe(), SessionHealth::Healthy);
    let pid: i32 = first
        .query_one("SELECT pg_backend_pid()", &[])
        .unwrap()
        .get(0);
    let mut admin = cfg.connect().unwrap();
    admin
        .query_one("SELECT pg_terminate_backend($1)", &[&pid])
        .unwrap();
    // Detect an idle terminated backend before any failed application query.
    assert_eq!(tracker.probe(), SessionHealth::Missing);
    assert!(first.simple_query("SELECT 1").is_err());
    assert!(second.simple_query("SELECT 1").is_ok());
    assert_eq!(tracker.probe(), SessionHealth::Missing);
    let (next, next_tracker) = cfg.generation();
    let _fresh = next.connect().unwrap();
    assert_eq!(next_tracker.probe(), SessionHealth::Healthy);
    assert_eq!(next_tracker.session_count(), 1);
    assert_eq!(tracker.session_count(), 2);
}
