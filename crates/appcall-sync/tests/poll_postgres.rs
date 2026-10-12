//! OXIDE-POLL-1 against a real schema (all migrations) and a scripted runner.
use appcall_connectors::{Connector, PollSpec, Registry};
use appcall_sync::*;
use postgres::{Client, NoTls};
use serde_json::{json, Value};
use std::time::Duration;

fn connect() -> Client {
    Client::connect(
        &std::env::var("APPCALL_ENGINE_POSTGRES_URL")
            .expect("explicit PostgreSQL test URL required"),
        NoTls,
    )
    .unwrap()
}
static FIXTURE_ID: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

/// A schema with every migration applied, one project and one active
/// connection `c` for the `pollfix` connector.
fn fixture() -> (Client, String) {
    let mut c = connect();
    let schema = format!(
        "poll_test_{}_{}",
        std::process::id(),
        FIXTURE_ID.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
    );
    c.batch_execute(&format!(
        "DROP SCHEMA IF EXISTS {schema} CASCADE; CREATE SCHEMA {schema}; SET search_path TO {schema}"
    ))
    .unwrap();
    let mut migrations =
        std::fs::read_dir(concat!(env!("CARGO_MANIFEST_DIR"), "/../../migrations"))
            .unwrap()
            .map(|entry| entry.unwrap().path())
            .filter(|path| path.extension().is_some_and(|e| e == "sql"))
            .collect::<Vec<_>>();
    migrations.sort();
    for migration in migrations {
        c.batch_execute(&std::fs::read_to_string(&migration).unwrap())
            .unwrap_or_else(|e| panic!("{}: {e}", migration.display()));
    }
    c.batch_execute(
        "INSERT INTO projects(id,name) VALUES('p','poll');
         INSERT INTO connections(id,project_id,connector,status,auth_type,external_account_id,credential_owner)
         VALUES('c','p','pollfix','active','api_key','brand','brand');",
    )
    .unwrap();
    (c, schema)
}
fn session(schema: &str) -> Client {
    let mut c = connect();
    c.batch_execute(&format!("SET search_path TO {schema}"))
        .unwrap();
    c
}
fn drop_schema(schema: &str) {
    connect()
        .batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
        .unwrap();
}
fn spec() -> PollSpec {
    serde_json::from_value(json!({
        "intervalSeconds": 60, "itemKey": "id", "versionKey": "updatedAt",
        "onNew": ["item.created"], "onChanged": ["item.updated"]
    }))
    .unwrap()
}
fn subscription(input: Value) -> PollSubscription {
    PollSubscription {
        project_id: "p".into(),
        connection_id: "c".into(),
        operation: "items.list".into(),
        input,
    }
}
fn items(pairs: &[(&str, &str)]) -> Vec<PollItem> {
    let page = json!({"items": pairs.iter().map(|(id, v)| json!({"id": id, "updatedAt": v})).collect::<Vec<_>>()});
    decode_poll_page(page, &spec()).unwrap().0
}
/// Make the subscription due now (tests do not wait out the interval).
fn make_due(c: &mut Client) {
    c.execute(
        "UPDATE poll_subscriptions SET next_run_at=clock_timestamp()",
        &[],
    )
    .unwrap();
}
fn events(c: &mut Client) -> Vec<(String, Vec<String>, Value, String)> {
    c.query(
        "SELECT e.operation,e.triggers,e.payload,e.provider_event_key FROM webhook_events e JOIN webhook_outbox o ON o.project_id=e.project_id AND o.event_id=e.id ORDER BY e.stream_position",
        &[],
    )
    .unwrap()
    .into_iter()
    .map(|r| (r.get(0), r.get(1), r.get(2), r.get(3)))
    .collect()
}
fn epoch(c: &mut Client) -> i64 {
    c.query_one("SELECT epoch FROM poll_subscriptions", &[])
        .unwrap()
        .get(0)
}
fn poll(repo: &mut Repository, worker: &str, page: &[(&str, &str)]) -> PollReport {
    let claim = repo
        .poll_claim(worker, Duration::from_secs(30))
        .unwrap()
        .expect("due subscription");
    repo.poll_commit(&claim, &spec(), items(page)).unwrap()
}

#[test]
#[ignore = "requires explicit local PostgreSQL"]
fn first_run_seeds_then_new_and_changed_items_emit_exactly_once() {
    let (db, schema) = fixture();
    let mut repo = Repository::new(db);
    repo.poll_subscribe(&subscription(json!({"repo":"r"})))
        .unwrap();

    let seed = poll(&mut repo, "w", &[("a", "1"), ("b", "1")]);
    assert!(seed.seeded);
    assert_eq!((seed.observed, seed.changed, seed.emitted), (2, 2, 0));
    let mut c = session(&schema);
    assert!(events(&mut c).is_empty(), "seeding emits nothing");
    // Not due again until the interval passes.
    assert!(repo
        .poll_claim("w", Duration::from_secs(30))
        .unwrap()
        .is_none());
    let next: bool = c
        .query_one(
            "SELECT next_run_at>clock_timestamp()+interval '59 seconds' FROM poll_subscriptions",
            &[],
        )
        .unwrap()
        .get(0);
    assert!(next);

    make_due(&mut c);
    let run = poll(
        &mut repo,
        "w",
        &[("a", "1"), ("b", "2"), ("c", "1"), ("c", "9")],
    );
    assert!(!run.seeded);
    assert_eq!((run.observed, run.changed, run.emitted), (3, 2, 2));
    let got = events(&mut c);
    assert_eq!(got.len(), 2);
    assert_eq!(got[0].0, "items.list");
    assert_eq!(got[0].1, vec!["item.updated".to_string()]);
    assert_eq!(got[0].2["change"], "changed");
    assert_eq!(got[0].2["itemKey"], "b");
    assert_eq!(got[0].2["revision"], 1);
    assert_eq!(got[0].2["item"], json!({"id":"b","updatedAt":"2"}));
    assert_eq!(got[1].1, vec!["item.created".to_string()]);
    assert_eq!(got[1].2["change"], "new");
    // First occurrence of a duplicated key wins.
    assert_eq!(got[1].2["item"], json!({"id":"c","updatedAt":"1"}));

    // The same observation again emits nothing.
    make_due(&mut c);
    let same = poll(&mut repo, "w", &[("a", "1"), ("b", "2"), ("c", "1")]);
    assert_eq!((same.changed, same.emitted), (0, 0));
    assert_eq!(events(&mut c).len(), 2);
    drop(c);
    drop(repo);
    drop_schema(&schema);
}

#[test]
#[ignore = "requires explicit local PostgreSQL"]
fn flip_back_emits_each_observed_change_with_a_distinct_key() {
    let (db, schema) = fixture();
    let mut repo = Repository::new(db);
    repo.poll_subscribe(&subscription(json!({}))).unwrap();
    let mut c = session(&schema);
    poll(&mut repo, "w", &[("a", "A")]);
    for version in ["B", "A"] {
        make_due(&mut c);
        assert_eq!(poll(&mut repo, "w", &[("a", version)]).emitted, 1);
    }
    let got = events(&mut c);
    assert_eq!(got.len(), 2);
    assert_eq!(got[0].2["revision"], 1);
    assert_eq!(got[1].2["revision"], 2);
    assert_ne!(got[0].3, got[1].3);
    let epoch = epoch(&mut c);
    assert_eq!(got[1].3, poll_event_key(epoch, 1, "items.list", "a", 2));
    drop(c);
    drop(repo);
    drop_schema(&schema);
}

/// Seed `a` at `seed`, then observe it at `change`: one emitted event at
/// revision 1 (the revision restarts with every reset of the seen state).
fn seed_then_change(repo: &mut Repository, c: &mut Client, seed: &str, change: &str) {
    let seeded = poll(repo, "w", &[("a", seed)]);
    assert_eq!((seeded.seeded, seeded.emitted), (true, 0));
    make_due(c);
    let run = poll(repo, "w", &[("a", change)]);
    assert_eq!(run.emitted, 1, "the change after a reset must be emitted");
    make_due(c);
}
/// Every event is stored (none dropped as a duplicate) with a distinct key,
/// and every one restarted at revision 1.
fn assert_distinct_revision_one_events(c: &mut Client, expected: usize) {
    let got = events(c);
    assert_eq!(got.len(), expected);
    let keys = got
        .iter()
        .map(|e| &e.3)
        .collect::<std::collections::BTreeSet<_>>();
    assert_eq!(keys.len(), expected);
    assert!(got.iter().all(|e| e.2["revision"] == 1));
}

#[test]
#[ignore = "requires explicit local PostgreSQL"]
fn resubscribe_starts_a_new_epoch_and_still_emits() {
    let (db, schema) = fixture();
    let mut repo = Repository::new(db);
    let mut c = session(&schema);
    repo.poll_subscribe(&subscription(json!({}))).unwrap();
    let first = epoch(&mut c);
    seed_then_change(&mut repo, &mut c, "1", "2");
    assert!(repo.poll_unsubscribe("p", "c", "items.list").unwrap());
    repo.poll_subscribe(&subscription(json!({}))).unwrap();
    assert!(epoch(&mut c) > first, "resubscribe renews the epoch");
    // Same item, same revision 1 as before the reset: a new key, emitted.
    seed_then_change(&mut repo, &mut c, "2", "3");
    assert_distinct_revision_one_events(&mut c, 2);
    drop(c);
    drop(repo);
    drop_schema(&schema);
}

#[test]
#[ignore = "requires explicit local PostgreSQL"]
fn input_change_starts_a_new_epoch_and_still_emits() {
    let (db, schema) = fixture();
    let mut repo = Repository::new(db);
    let mut c = session(&schema);
    repo.poll_subscribe(&subscription(json!({"repo":"a"})))
        .unwrap();
    let first = epoch(&mut c);
    seed_then_change(&mut repo, &mut c, "1", "2");
    // Refreshing with the same input is not a reset.
    repo.poll_subscribe(&subscription(json!({"repo":"a"})))
        .unwrap();
    assert_eq!(epoch(&mut c), first);
    repo.poll_subscribe(&subscription(json!({"repo":"b"})))
        .unwrap();
    assert!(epoch(&mut c) > first, "an input change renews the epoch");
    seed_then_change(&mut repo, &mut c, "1", "2");
    assert_distinct_revision_one_events(&mut c, 2);
    drop(c);
    drop(repo);
    drop_schema(&schema);
}

#[test]
#[ignore = "requires explicit local PostgreSQL"]
fn input_a_b_a_never_reuses_an_epoch_and_every_change_emits() {
    let (db, schema) = fixture();
    let mut repo = Repository::new(db);
    let mut c = session(&schema);
    let mut epochs = Vec::new();
    for input in ["a", "b", "a"] {
        repo.poll_subscribe(&subscription(json!({ "repo": input })))
            .unwrap();
        epochs.push(epoch(&mut c));
        // Identical observations under every input: only the epoch differs.
        seed_then_change(&mut repo, &mut c, "1", "2");
    }
    assert!(epochs.windows(2).all(|w| w[0] < w[1]), "{epochs:?}");
    assert_distinct_revision_one_events(&mut c, 3);
    drop(c);
    drop(repo);
    drop_schema(&schema);
}

#[test]
#[ignore = "requires explicit local PostgreSQL"]
fn renew_extends_only_the_held_unexpired_lease() {
    let (db, schema) = fixture();
    let mut repo = Repository::new(db);
    repo.poll_subscribe(&subscription(json!({}))).unwrap();
    let mut c = session(&schema);
    poll(&mut repo, "w", &[("a", "1")]);
    make_due(&mut c);

    let mut claim = repo
        .poll_claim("w1", Duration::from_secs(1))
        .unwrap()
        .unwrap();
    let held = claim.clone();
    claim.leased_until = repo.poll_renew(&claim, Duration::from_secs(60)).unwrap();
    assert!(claim.leased_until > held.leased_until);
    // The superseded lease value no longer commits or renews.
    assert_eq!(
        repo.poll_renew(&held, Duration::from_secs(60)),
        Err(Error::LeaseLost)
    );
    assert_eq!(
        repo.poll_commit(&held, &spec(), items(&[("a", "2")])),
        Err(Error::LeaseLost)
    );
    // Outliving the original 1s lease is safe after renewal.
    std::thread::sleep(Duration::from_millis(1100));
    assert!(repo
        .poll_claim("w2", Duration::from_secs(30))
        .unwrap()
        .is_none());
    assert_eq!(
        repo.poll_commit(&claim, &spec(), items(&[("a", "2")]))
            .unwrap()
            .emitted,
        1
    );

    // An expired lease cannot be renewed, even before anyone takes over.
    make_due(&mut c);
    let late = repo
        .poll_claim("w1", Duration::from_secs(30))
        .unwrap()
        .unwrap();
    c.execute(
        "UPDATE poll_subscriptions SET leased_until=clock_timestamp()-interval '1 second'",
        &[],
    )
    .unwrap();
    let late = PollClaim {
        leased_until: c
            .query_one("SELECT leased_until FROM poll_subscriptions", &[])
            .unwrap()
            .get(0),
        ..late
    };
    assert_eq!(
        repo.poll_renew(&late, Duration::from_secs(30)),
        Err(Error::LeaseLost)
    );
    // ... but its failure is still recorded with backoff while unclaimed.
    repo.poll_fail(
        &late,
        Duration::from_secs(120),
        true,
        false,
        &Error::LeaseLost,
    )
    .unwrap();
    let row = c
        .query_one(
            "SELECT attempts,last_error,worker_id,next_run_at>clock_timestamp()+interval '119 seconds' FROM poll_subscriptions",
            &[],
        )
        .unwrap();
    assert_eq!(row.get::<_, i32>(0), 1);
    assert_eq!(row.get::<_, String>(1), "LEASE_LOST");
    assert_eq!(row.get::<_, String>(2), "");
    assert!(row.get::<_, bool>(3));
    assert_eq!(events(&mut c).len(), 1);
    drop(c);
    drop(repo);
    drop_schema(&schema);
}

#[test]
#[ignore = "requires explicit local PostgreSQL"]
fn claim_skips_inactive_connections() {
    let (db, schema) = fixture();
    let mut repo = Repository::new(db);
    repo.poll_subscribe(&subscription(json!({}))).unwrap();
    let mut c = session(&schema);
    c.execute("UPDATE connections SET status='inactive'", &[])
        .unwrap();
    assert!(repo
        .poll_claim("w", Duration::from_secs(30))
        .unwrap()
        .is_none());
    c.execute("UPDATE connections SET status='active'", &[])
        .unwrap();
    assert!(repo
        .poll_claim("w", Duration::from_secs(30))
        .unwrap()
        .is_some());
    drop(c);
    drop(repo);
    drop_schema(&schema);
}

#[test]
#[ignore = "requires explicit local PostgreSQL"]
fn event_lock_is_taken_only_once_there_is_an_event_to_append() {
    let (mut db, schema) = fixture();
    // Fail instead of hanging if a run waits for the held event lock.
    db.batch_execute("SET lock_timeout='2s'").unwrap();
    let mut repo = Repository::new(db);
    repo.poll_subscribe(&subscription(json!({}))).unwrap();
    let mut c = session(&schema);
    // Another transaction holds the project's event lock (as a concurrent
    // webhook acceptance would).
    let mut holder = session(&schema);
    let mut held = holder.transaction().unwrap();
    held.query_one(
        "SELECT pg_advisory_xact_lock(hashtextextended('p'::text,741))",
        &[],
    )
    .unwrap();
    // Seeding and unchanged observations never wait for it.
    poll(&mut repo, "w", &[("a", "1")]);
    make_due(&mut c);
    assert_eq!(poll(&mut repo, "w", &[("a", "1")]).changed, 0);
    held.commit().unwrap();
    make_due(&mut c);
    assert_eq!(poll(&mut repo, "w", &[("a", "2")]).emitted, 1);
    drop(c);
    drop(holder);
    drop(repo);
    drop_schema(&schema);
}

#[test]
#[ignore = "requires explicit local PostgreSQL"]
fn restart_and_lost_lease_never_duplicate_or_lose_an_event() {
    let (db, schema) = fixture();
    let mut repo = Repository::new(db);
    repo.poll_subscribe(&subscription(json!({}))).unwrap();
    let mut c = session(&schema);
    poll(&mut repo, "w", &[("a", "1")]);
    make_due(&mut c);

    // Worker 1 claims and "crashes" before committing.
    let crashed = repo
        .poll_claim("w1", Duration::from_secs(30))
        .unwrap()
        .unwrap();
    // A live lease is not claimable by anyone else.
    assert!(repo
        .poll_claim("w2", Duration::from_secs(30))
        .unwrap()
        .is_none());
    c.execute(
        "UPDATE poll_subscriptions SET leased_until=clock_timestamp()-interval '1 second'",
        &[],
    )
    .unwrap();
    // Worker 2 takes over after lease expiry and commits once.
    let survivor = repo
        .poll_claim("w2", Duration::from_secs(30))
        .unwrap()
        .unwrap();
    assert_eq!(
        repo.poll_commit(&survivor, &spec(), items(&[("a", "2"), ("b", "1")]))
            .unwrap()
            .emitted,
        2
    );
    // The crashed worker's late commit and late failure are both fenced out.
    assert_eq!(
        repo.poll_commit(&crashed, &spec(), items(&[("a", "2"), ("b", "1")])),
        Err(Error::LeaseLost)
    );
    assert_eq!(
        repo.poll_fail(&crashed, Duration::ZERO, true, false, &Error::Storage),
        Err(Error::LeaseLost)
    );
    assert_eq!(events(&mut c).len(), 2);
    // A replay of the same observation by a fresh claim emits nothing.
    make_due(&mut c);
    assert_eq!(poll(&mut repo, "w3", &[("a", "2"), ("b", "1")]).emitted, 0);
    assert_eq!(events(&mut c).len(), 2);
    drop(c);
    drop(repo);
    drop_schema(&schema);
}

#[test]
#[ignore = "requires explicit local PostgreSQL"]
fn failed_commit_rolls_back_seen_state_and_events() {
    let (db, schema) = fixture();
    let mut repo = Repository::new(db);
    repo.poll_subscribe(&subscription(json!({}))).unwrap();
    let mut c = session(&schema);
    poll(&mut repo, "w", &[("a", "1")]);
    make_due(&mut c);
    let claim = repo
        .poll_claim("w", Duration::from_secs(30))
        .unwrap()
        .unwrap();
    // The connection goes inactive mid-poll: the event append fails, so the
    // already-written seen rows in the same transaction must roll back.
    c.execute("UPDATE connections SET status='inactive'", &[])
        .unwrap();
    assert_eq!(
        repo.poll_commit(&claim, &spec(), items(&[("a", "2"), ("b", "1")])),
        Err(Error::Unavailable)
    );
    let seen: i64 = c
        .query_one("SELECT count(*) FROM poll_seen_items WHERE item_key='b' OR fingerprint<>(SELECT fingerprint FROM poll_seen_items WHERE item_key='a')", &[])
        .unwrap()
        .get(0);
    assert_eq!(seen, 0);
    let revision: i64 = c
        .query_one(
            "SELECT revision FROM poll_seen_items WHERE item_key='a'",
            &[],
        )
        .unwrap()
        .get(0);
    assert_eq!(revision, 0);
    assert!(events(&mut c).is_empty());
    drop(c);
    drop(repo);
    drop_schema(&schema);
}

#[test]
#[ignore = "requires explicit local PostgreSQL"]
fn rebind_resets_seen_state_and_reseeds_without_emitting() {
    let (db, schema) = fixture();
    let mut repo = Repository::new(db);
    repo.poll_subscribe(&subscription(json!({}))).unwrap();
    let mut c = session(&schema);
    poll(&mut repo, "w", &[("a", "1")]);
    make_due(&mut c);
    let stale = repo
        .poll_claim("w", Duration::from_secs(30))
        .unwrap()
        .unwrap();
    // A real rebind (account change); the trigger advances the generation.
    c.execute("UPDATE connections SET external_account_id='brand-2'", &[])
        .unwrap();
    assert_eq!(
        repo.poll_commit(&stale, &spec(), items(&[("a", "2")])),
        Err(Error::StaleGeneration)
    );
    repo.poll_fail(
        &stale,
        Duration::ZERO,
        false,
        false,
        &Error::StaleGeneration,
    )
    .unwrap();
    let current: i64 = c
        .query_one("SELECT connection_generation FROM connections", &[])
        .unwrap()
        .get(0);
    let claim = repo
        .poll_claim("w", Duration::from_secs(30))
        .unwrap()
        .unwrap();
    assert_eq!(claim.connection_generation, current);
    assert!(!claim.seeded);
    let seen: i64 = c
        .query_one("SELECT count(*) FROM poll_seen_items", &[])
        .unwrap()
        .get(0);
    assert_eq!(seen, 0, "old-generation seen state is discarded");
    let report = repo
        .poll_commit(&claim, &spec(), items(&[("a", "2"), ("b", "1")]))
        .unwrap();
    assert!(report.seeded);
    assert_eq!(report.emitted, 0);
    assert!(events(&mut c).is_empty());
    assert!(claim.epoch > stale.epoch, "the reseed renews the epoch");
    make_due(&mut c);
    assert_eq!(poll(&mut repo, "w", &[("a", "3")]).emitted, 1);
    assert_eq!(events(&mut c)[0].2["revision"], 1);
    drop(c);
    drop(repo);
    drop_schema(&schema);
}

#[test]
#[ignore = "requires explicit local PostgreSQL"]
fn failure_backoff_pause_and_input_change() {
    let (db, schema) = fixture();
    let mut repo = Repository::new(db);
    repo.poll_subscribe(&subscription(json!({"repo":"r"})))
        .unwrap();
    let mut c = session(&schema);
    poll(&mut repo, "w", &[("a", "1")]);
    make_due(&mut c);

    let claim = repo
        .poll_claim("w", Duration::from_secs(30))
        .unwrap()
        .unwrap();
    repo.poll_fail(
        &claim,
        Duration::from_secs(120),
        true,
        false,
        &Error::Runner {
            retry_after_seconds: Some(120),
        },
    )
    .unwrap();
    let row = c
        .query_one(
            "SELECT attempts,last_error,worker_id,leased_until IS NULL,next_run_at>clock_timestamp()+interval '119 seconds',status FROM poll_subscriptions",
            &[],
        )
        .unwrap();
    assert_eq!(row.get::<_, i32>(0), 1);
    assert_eq!(row.get::<_, String>(1), "RUNNER_ERROR");
    assert_eq!(row.get::<_, String>(2), "");
    assert!(row.get::<_, bool>(3));
    assert!(row.get::<_, bool>(4));
    assert_eq!(row.get::<_, String>(5), "active");
    assert!(repo
        .poll_claim("w", Duration::from_secs(30))
        .unwrap()
        .is_none());

    // Pause stops scheduling even when due.
    make_due(&mut c);
    let claim = repo
        .poll_claim("w", Duration::from_secs(30))
        .unwrap()
        .unwrap();
    assert_eq!(claim.attempts, 1);
    repo.poll_fail(&claim, Duration::ZERO, true, true, &Error::UnsupportedModel)
        .unwrap();
    make_due(&mut c);
    assert!(repo
        .poll_claim("w", Duration::from_secs(30))
        .unwrap()
        .is_none());

    // Re-subscribing with the same input resumes and keeps the seen state.
    repo.poll_subscribe(&subscription(json!({"repo":"r"})))
        .unwrap();
    let report = poll(&mut repo, "w", &[("a", "1")]);
    assert_eq!((report.seeded, report.emitted), (false, 0));
    let attempts: i32 = c
        .query_one("SELECT attempts FROM poll_subscriptions", &[])
        .unwrap()
        .get(0);
    assert_eq!(attempts, 0, "success resets attempts");

    // A different input is a different item universe: reseed.
    repo.poll_subscribe(&subscription(json!({"repo":"other"})))
        .unwrap();
    let report = poll(&mut repo, "w", &[("z", "1")]);
    assert!(report.seeded);
    assert_eq!(report.emitted, 0);
    assert!(events(&mut c).is_empty());
    assert!(repo.poll_unsubscribe("p", "c", "items.list").unwrap());
    let seen: i64 = c
        .query_one("SELECT count(*) FROM poll_seen_items", &[])
        .unwrap()
        .get(0);
    assert_eq!(seen, 0, "unsubscribe cascades seen state");
    drop(c);
    drop(repo);
    drop_schema(&schema);
}

// ─── service level: scripted runner ──────────────────────────────────────────

struct Creds;
impl CredentialResolver for Creds {
    async fn resolve(&self, connection: appcall_store::Connection) -> Result<ResolvedCredentials> {
        Ok(ResolvedCredentials {
            connection,
            fields: json!({"accessToken":"tok"}).as_object().unwrap().clone(),
        })
    }
}

fn registry() -> Registry {
    let manifest = json!({
        "key":"pollfix","name":"Poll fixture","version":"1","runtime":"bun",
        "auth":{"type":"api_key","setup":{"mode":"api_key","fields":[{"key":"accessToken","label":"Token","required":true,"secret":true}]}},
        "network":{"allowedHosts":["api.example.com"]},"models":["item"],
        "operations":{
            "items.list":{"kind":"sync","timeoutMs":5000,"maxInputBytes":65536,"maxResponseBytes":1048576,
                "poll":{"intervalSeconds":60,"itemKey":"id","versionKey":"updatedAt","maxPages":2,
                        "onNew":["item.created"],"onChanged":["item.updated"]}},
            "other.list":{"kind":"sync","timeoutMs":5000,"maxInputBytes":65536,"maxResponseBytes":1048576}
        }
    });
    Registry::from_connectors([
        Connector::from_bytes(&serde_json::to_vec(&manifest).unwrap()).unwrap(),
    ])
    .unwrap()
}

/// Serve scripted (status, body) replies in order; return the request bodies.
fn runner(replies: Vec<(u16, Value)>) -> (String, std::thread::JoinHandle<Vec<Value>>) {
    runner_with(replies, |_| {})
}
/// Like [`runner`], running `before_reply(i)` before answering request `i`.
fn runner_with(
    replies: Vec<(u16, Value)>,
    mut before_reply: impl FnMut(usize) + Send + 'static,
) -> (String, std::thread::JoinHandle<Vec<Value>>) {
    use std::io::{Read, Write};
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let handle = std::thread::spawn(move || {
        let mut seen = Vec::new();
        for (index, (status, reply)) in replies.into_iter().enumerate() {
            let (mut stream, _) = listener.accept().unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            let mut data = Vec::new();
            let body: Value = loop {
                let mut b = [0; 4096];
                let got = stream.read(&mut b).unwrap();
                assert!(got > 0);
                data.extend_from_slice(&b[..got]);
                if let Some(end) = data.windows(4).position(|p| p == b"\r\n\r\n") {
                    let headers = String::from_utf8_lossy(&data[..end]).to_lowercase();
                    let len: usize = headers
                        .lines()
                        .find_map(|l| {
                            l.strip_prefix("content-length:")
                                .map(|v| v.trim().parse().unwrap())
                        })
                        .unwrap();
                    if data.len() >= end + 4 + len {
                        break serde_json::from_slice(&data[end + 4..end + 4 + len]).unwrap();
                    }
                }
            };
            before_reply(index);
            let mut envelope = reply;
            envelope["id"] = body["id"].clone();
            let text = envelope.to_string();
            write!(
                stream,
                "HTTP/1.1 {status} X\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{text}",
                text.len()
            )
            .unwrap();
            seen.push(body);
        }
        seen
    });
    (url, handle)
}
fn ok(items: Value, cursor: Value) -> (u16, Value) {
    (
        200,
        json!({"ok":true,"result":{"output":{"items":items,"cursor":cursor}}}),
    )
}

#[test]
#[ignore = "requires explicit local PostgreSQL and local HTTP"]
fn service_polls_pages_honours_retry_after_and_emits_once() {
    let (db, schema) = fixture();
    let (url, server) = runner(vec![
        // seed: two pages
        ok(json!([{"id":1,"updatedAt":"a"}]), json!("p2")),
        ok(json!([{"id":2,"updatedAt":"a"}]), Value::Null),
        // rate limited
        (
            429,
            json!({"ok":false,"error":{"code":"CONNECTOR_RATE_LIMITED","message":"slow down","retryAfterSeconds":300}}),
        ),
        // next run: item 2 changed, item 3 new
        ok(
            json!([{"id":3,"updatedAt":"a"},{"id":2,"updatedAt":"b"}]),
            Value::Null,
        ),
    ]);
    let service = service(db, &schema, &url, Duration::from_secs(30));
    let mut c = session(&schema);
    let rt = tokio::runtime::Runtime::new().unwrap();
    rt.block_on(async {
        // Only operations with a poll block can be subscribed.
        assert_eq!(
            service
                .poll_subscribe(PollSubscription { operation: "other.list".into(), ..subscription(json!({})) })
                .await,
            Err(Error::UnsupportedModel)
        );
        service.poll_subscribe(subscription(json!({"repo":"r"}))).await.unwrap();
        let seed = service.poll_once("w").await.unwrap().unwrap();
        assert_eq!((seed.seeded, seed.observed, seed.emitted), (true, 2, 0));
        assert!(service.poll_once("w").await.unwrap().is_none());

        tokio::task::block_in_place(|| make_due(&mut c));
        assert_eq!(
            service.poll_once("w").await,
            Err(Error::Runner { retry_after_seconds: Some(300) })
        );
        let row = tokio::task::block_in_place(|| {
            c.query_one("SELECT attempts,next_run_at>clock_timestamp()+interval '299 seconds' FROM poll_subscriptions", &[])
                .unwrap()
        });
        assert_eq!(row.get::<_, i32>(0), 1);
        assert!(row.get::<_, bool>(1), "Retry-After is honoured");

        tokio::task::block_in_place(|| make_due(&mut c));
        let run = service.poll_once("w").await.unwrap().unwrap();
        assert_eq!((run.seeded, run.observed, run.changed, run.emitted), (false, 2, 2, 2));
    });
    let bodies = server.join().unwrap();
    assert_eq!(bodies.len(), 4);
    for body in &bodies {
        assert_eq!(body["method"], "connector.sync.list");
        assert_eq!(body["params"]["connectorKey"], "pollfix");
        assert_eq!(body["params"]["sync"], "items.list");
        assert_eq!(body["params"]["input"]["repo"], "r");
        assert_eq!(body["params"]["input"]["accessToken"], "tok");
    }
    assert!(bodies[0]["params"]["input"].get("cursor").is_none());
    assert_eq!(bodies[1]["params"]["input"]["cursor"], "p2");
    let got = events(&mut c);
    assert_eq!(
        got.iter()
            .map(|e| (e.1.clone(), e.2["itemKey"].clone()))
            .collect::<Vec<_>>(),
        vec![
            (vec!["item.created".to_string()], json!("3")),
            (vec!["item.updated".to_string()], json!("2")),
        ]
    );
    // Event-only dispatch: the outbox drains without scheduling sync jobs.
    let report = appcall_events::PgEvents::new(&mut c)
        .dispatch_pending(10, &mut NoJobs)
        .unwrap();
    assert_eq!(report.completed, 2);
    drop(service);
    drop(rt);
    drop(c);
    drop_schema(&schema);
}

fn service(db: Client, schema: &str, url: &str, lease: Duration) -> Service<Creds> {
    let store = appcall_store::Store::new(
        session(schema),
        appcall_store::LocalProvider::new(&[7; 32]).unwrap(),
    );
    Service::new(
        Repository::new(db),
        store,
        registry(),
        appcall_runner_client::RunnerClient::new(url, "fixture", Default::default()).unwrap(),
        Creds,
        Config {
            lease_duration: lease,
            ..Default::default()
        },
    )
    .unwrap()
}

#[test]
#[ignore = "requires explicit local PostgreSQL and local HTTP"]
fn service_renews_the_lease_per_page_so_a_slow_poll_outlives_one_lease() {
    let (db, schema) = fixture();
    // Each page takes 1.2s against a 2s lease: 2.4s of fetching only
    // commits because the lease is renewed before page 2 and the commit.
    let (url, server) = runner_with(
        vec![
            ok(json!([{"id":1,"updatedAt":"a"}]), json!("p2")),
            ok(json!([{"id":2,"updatedAt":"a"}]), Value::Null),
        ],
        |_| std::thread::sleep(Duration::from_millis(1200)),
    );
    let service = service(db, &schema, &url, Duration::from_secs(2));
    let rt = tokio::runtime::Runtime::new().unwrap();
    rt.block_on(async {
        service
            .poll_subscribe(subscription(json!({})))
            .await
            .unwrap();
        let seed = service.poll_once("w").await.unwrap().unwrap();
        assert_eq!((seed.seeded, seed.observed), (true, 2));
    });
    assert_eq!(server.join().unwrap().len(), 2);
    let mut c = session(&schema);
    let row = c
        .query_one(
            "SELECT seeded,worker_id,last_error FROM poll_subscriptions",
            &[],
        )
        .unwrap();
    assert!(row.get::<_, bool>(0));
    assert_eq!(row.get::<_, String>(1), "");
    assert_eq!(row.get::<_, String>(2), "");
    drop(service);
    drop(rt);
    drop(c);
    drop_schema(&schema);
}

#[test]
#[ignore = "requires explicit local PostgreSQL and local HTTP"]
fn service_stops_at_a_taken_over_lease_and_leaves_the_new_owner_alone() {
    let (db, schema) = fixture();
    let takeover_schema = schema.clone();
    let (url, server) = runner_with(
        vec![ok(json!([{"id":1,"updatedAt":"a"}]), json!("p2"))],
        move |_| {
            // While page 1 is in flight the lease expires and w2 claims.
            let mut c = session(&takeover_schema);
            c.execute(
                "UPDATE poll_subscriptions SET leased_until=clock_timestamp()-interval '1 second'",
                &[],
            )
            .unwrap();
            Repository::new(c)
                .poll_claim("w2", Duration::from_secs(30))
                .unwrap()
                .expect("expired lease is claimable");
        },
    );
    let service = service(db, &schema, &url, Duration::from_secs(30));
    let rt = tokio::runtime::Runtime::new().unwrap();
    rt.block_on(async {
        service
            .poll_subscribe(subscription(json!({})))
            .await
            .unwrap();
        // Renewal before page 2 finds the lease gone: no page 2, no commit.
        assert_eq!(service.poll_once("w1").await, Err(Error::LeaseLost));
    });
    assert_eq!(server.join().unwrap().len(), 1);
    let mut c = session(&schema);
    let row = c
        .query_one(
            "SELECT worker_id,leased_until>clock_timestamp(),attempts,last_error,seeded FROM poll_subscriptions",
            &[],
        )
        .unwrap();
    assert_eq!(row.get::<_, String>(0), "w2");
    assert!(row.get::<_, bool>(1));
    assert_eq!(row.get::<_, i32>(2), 0);
    assert_eq!(row.get::<_, String>(3), "");
    assert!(!row.get::<_, bool>(4));
    drop(service);
    drop(rt);
    drop(c);
    drop_schema(&schema);
}

struct NoJobs;
impl appcall_events::DispatchSink for NoJobs {
    fn schedule(
        &mut self,
        _: &mut postgres::Transaction<'_>,
        _: &appcall_events::SyncJob,
    ) -> appcall_events::Result<()> {
        panic!("polled events must not schedule sync jobs")
    }
}
