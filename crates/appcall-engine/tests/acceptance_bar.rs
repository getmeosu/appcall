//! Acceptance gate for appcall-engine (fail CI on regression).
//!
//! Contract enforced here + durability_perf:
//! - History cap stays **1024**; encoded record cap stays **1 MiB** (never raise).
//! - Exclusive-owner store: flock + bumping `owner_epoch`; second open → Conflict.
//! - Durable commits are revision CAS; stale expected revision → Conflict, no mutation.
//! - Fenced reconcile requires matching attempt + owner_epoch (see durability.rs).
//! - Continuous RSS/latency budgets live in `durability_perf` + `benchmarks/*.json`.

use appcall_engine::*;
use std::path::PathBuf;

const SECRET: &str = "synthetic-secret-token-47";

fn revision_of(db: &std::path::Path, id: &str) -> u64 {
    let store = SqliteStore::open(db).unwrap();
    let rev = store.load(id).unwrap().revision;
    drop(store);
    rev
}

fn secret_input() -> PayloadRef {
    PayloadRef::digest(SECRET.as_bytes()).unwrap()
}

struct SecretResolver;
impl PayloadResolver for SecretResolver {
    fn resolve(&self, _: &PayloadRef) -> Result<Option<Vec<u8>>> {
        Ok(Some(SECRET.as_bytes().to_vec()))
    }
}

#[test]
fn history_1024_still_limit_via_progressed_batches() {
    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("engine.db");
    let mut e = Engine::open(&db).unwrap();
    e.register_workflow("grow", "v1", |c| {
        for _ in 0..2048 {
            c.timer(0)?;
        }
        Ok(c.input().clone())
    })
    .unwrap();
    e.start("r", "grow", "v1", PayloadRef::durable("input").unwrap())
        .unwrap();

    let mut progressed = 0u32;
    let mut hit_limit = false;
    for _ in 0..64 {
        match e.drive("r", 0) {
            Ok(DriveOutcome::Progressed) => progressed += 1,
            Err(Error::Limit) => {
                hit_limit = true;
                break;
            }
            Ok(other) => panic!("unexpected outcome: {other:?}"),
            Err(err) => panic!("unexpected err: {err:?}"),
        }
    }
    assert!(
        hit_limit,
        "expected Error::Limit at history 1024 after Progressed batches; progressed={progressed}"
    );
    assert!(
        progressed >= 7,
        "1024/128 batches should Progressed several times first; got {progressed}"
    );
    let history_len = e.history("r").unwrap().len();
    assert!(
        history_len >= 1024,
        "history should sit at the cap when Limit fires; len={history_len}"
    );
}

#[test]
fn encoded_record_1mib_still_limit_via_sqlite_commit_chunk_growth() {
    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("engine.db");
    {
        let mut e = Engine::open(&db).unwrap();
        e.register_workflow("idle", "v1", |c| {
            c.timer(1_000_000)?;
            Ok(c.input().clone())
        })
        .unwrap();
        e.start("r", "idle", "v1", PayloadRef::durable("input").unwrap())
            .unwrap();
        assert!(matches!(e.drive("r", 0).unwrap(), DriveOutcome::Waiting));
        drop(e);
    }

    let mut store = SqliteStore::open(&db).unwrap();
    let mut run = store.load("r").unwrap();
    let chunk = "x".repeat(120);
    let mut hit_limit = false;
    for round in 0..20_000 {
        run.signals.push(SignalEvent {
            name: format!("n{round}"),
            value: PayloadRef::durable(&chunk).unwrap(),
            consumed: false,
        });
        let expected = run.revision;
        run.revision = expected + 1;
        match store.commit(expected, &run, &[]) {
            Err(Error::Limit) => {
                hit_limit = true;
                break;
            }
            Ok(()) => {}
            Err(err) => panic!("unexpected commit err at round {round}: {err:?}"),
        }
    }
    assert!(
        hit_limit,
        "SqliteStore commit must return Limit once encoded record exceeds 1 MiB"
    );
}

#[test]
fn continue_as_new_digest_claim_check_successor_empty_no_raw_secret() {
    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("engine.db");
    let input = secret_input();
    assert!(!input.key().contains(SECRET));

    let mut e = Engine::open(&db).unwrap();
    e.register_workflow("private", "v1", |c| {
        if c.input().key() == "next" {
            return Ok(c.input().clone());
        }
        c.timer(100)?;
        c.continue_as_new(PayloadRef::durable("next").unwrap())
    })
    .unwrap();
    e.start("r", "private", "v1", input).unwrap();
    assert!(matches!(
        e.drive_with_resolver("r", 0, &SecretResolver).unwrap(),
        DriveOutcome::Waiting
    ));
    let successor = match e.drive_with_resolver("r", 100, &SecretResolver).unwrap() {
        DriveOutcome::ContinuedAsNew { successor } => successor,
        other => panic!("{other:?}"),
    };
    assert!(e.history(&successor).unwrap().is_empty());
    assert_eq!(e.status("r").unwrap(), RunState::ContinuedAsNew);

    let hist = serde_json::to_vec(&e.history("r").unwrap()).unwrap();
    assert!(!hist.windows(SECRET.len()).any(|w| w == SECRET.as_bytes()));
    drop(e);
    let persisted = std::fs::read(&db).unwrap();
    assert!(!persisted
        .windows(SECRET.len())
        .any(|w| w == SECRET.as_bytes()));

    let mut e = Engine::open(&db).unwrap();
    e.register_workflow("private", "v1", |c| {
        if c.input().key() == "next" {
            return Ok(c.input().clone());
        }
        c.timer(100)?;
        c.continue_as_new(PayloadRef::durable("next").unwrap())
    })
    .unwrap();
    assert!(matches!(
        e.drive_with_resolver(&successor, 0, &SecretResolver).unwrap(),
        DriveOutcome::Completed(out) if out.key() == "next"
    ));
}

#[test]
fn uncertain_blocks_until_fenced_reconcile_no_blind_redispatch_exclusive_owner() {
    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("engine.db");
    let mut e = Engine::open(&db).unwrap();
    assert!(Engine::open(&db).is_err());

    e.register_workflow("write", "v1", |c| {
        c.activity("write", "v1", c.input().clone(), EffectPolicy::Reconcile)
    })
    .unwrap();
    e.register_activity("write", "v1").unwrap();
    e.start("r", "write", "v1", PayloadRef::durable("input").unwrap())
        .unwrap();
    let attempt = match e.drive("r", 0).unwrap() {
        DriveOutcome::Activity(a) => a,
        other => panic!("{other:?}"),
    };
    e.fail(&attempt, ActivityFailure::OutcomeUnknown).unwrap();
    assert_eq!(e.status("r").unwrap(), RunState::OutcomeUnknown);

    for _ in 0..3 {
        assert!(matches!(
            e.drive("r", 0).unwrap(),
            DriveOutcome::Suspended(RunState::OutcomeUnknown)
        ));
    }

    assert!(Engine::open(&db).is_err());

    e.reconcile_fenced(
        "r",
        &attempt.effect_id,
        attempt.attempt,
        attempt.owner_epoch,
        Some(PayloadRef::durable("verified").unwrap()),
    )
    .unwrap();
    assert!(matches!(
        e.drive("r", 0).unwrap(),
        DriveOutcome::Completed(_)
    ));
}

#[test]
fn waiting_noise_signals_revision_delta_proves_noop_drive_skip() {
    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("engine.db");
    let mut e = Engine::open(&db).unwrap();
    e.register_workflow("wait", "v1", |c| {
        c.signal("go")?;
        Ok(c.input().clone())
    })
    .unwrap();
    e.start("r", "wait", "v1", PayloadRef::durable("input").unwrap())
        .unwrap();
    assert!(matches!(e.drive("r", 0).unwrap(), DriveOutcome::Waiting));
    drop(e);

    let baseline = revision_of(&db, "r");
    let n = 8usize;
    let mut e = Engine::open(&db).unwrap();
    e.register_workflow("wait", "v1", |c| {
        c.signal("go")?;
        Ok(c.input().clone())
    })
    .unwrap();
    // Noise signals = spurious worker wakeups/re-polls with no new work.
    for _ in 0..n {
        assert!(matches!(e.drive("r", 0).unwrap(), DriveOutcome::Waiting));
    }
    drop(e);

    let after = revision_of(&db, "r");
    let delta = after.saturating_sub(baseline);
    assert!(
        delta <= (n as u64) + 1,
        "revision delta {delta} after {n} noisy Waiting re-drives exceeds N+1 (noop save skip broken)"
    );
    assert_eq!(
        delta, 0,
        "pure Waiting re-drives must not commit; delta={delta}"
    );
}

#[test]
fn recover_no_retry_storm_drop_engine_before_sqlite_reopen() {
    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("engine.db");
    let mut e = Engine::open(&db).unwrap();
    e.register_workflow("one", "v1", |c| {
        c.activity("lookup", "v1", c.input().clone(), EffectPolicy::Read)
    })
    .unwrap();
    e.register_activity("lookup", "v1").unwrap();
    e.start("r", "one", "v1", PayloadRef::durable("input").unwrap())
        .unwrap();
    let attempt = match e.drive("r", 0).unwrap() {
        DriveOutcome::Activity(a) => a,
        other => panic!("{other:?}"),
    };
    assert_eq!(attempt.attempt, 1);
    drop(e);

    let store = SqliteStore::open(&db).unwrap();
    let run = store.load("r").unwrap();
    assert_eq!(run.tasks.len(), 1);
    assert_eq!(run.tasks[0].attempt.attempt, 1);
    drop(store);

    let mut e = Engine::open(&db).unwrap();
    e.register_workflow("one", "v1", |c| {
        c.activity("lookup", "v1", c.input().clone(), EffectPolicy::Read)
    })
    .unwrap();
    e.register_activity("lookup", "v1").unwrap();
    let again = match e.drive("r", 0).unwrap() {
        DriveOutcome::Activity(a) => a,
        other => panic!("{other:?}"),
    };
    assert!(
        again.attempt <= 2,
        "retry storm: attempt {} after single recover",
        again.attempt
    );
    assert_eq!(again.effect_id, attempt.effect_id);
}

#[test]
fn caps_1024_and_1mib_remain_frozen_in_source() {
    // Load-bearing literals — raising either breaks the acceptance bar.
    let engine = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/src/engine.rs"));
    let store = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/src/store.rs"));
    assert!(
        engine.contains("if r.history.len() >= 1024"),
        "history cap must remain 1024 in engine.rs"
    );
    assert!(
        engine.contains("if bytes.len() > 1024 * 1024"),
        "1 MiB payload Limit must remain in engine.rs"
    );
    assert!(
        store.contains("if bytes.len() > 1024 * 1024"),
        "1 MiB encoded-record Limit must remain in store.rs encoded()"
    );
    assert!(
        !engine.contains("history.len() >= 2048") && !engine.contains("history.len() >= 4096"),
        "history cap must not be silently raised"
    );
    let artifact =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("benchmarks/acceptance-gate.json");
    assert!(
        artifact.is_file(),
        "missing acceptance-gate evidence at {artifact:?}"
    );
    let body = std::fs::read_to_string(&artifact).unwrap();
    assert!(body.contains("\"history_cap\": 1024"));
    assert!(body.contains("\"encoded_record_cap_bytes\": 1048576"));
    assert!(body.contains("\"caps_may_raise\": false"));
}

#[test]
fn exclusive_owner_epoch_cas_stale_revision_conflict_no_mutation() {
    // Single-owner store: exclusive flock, epoch bump on open, revision CAS on commit.
    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("engine.db");
    let mut e = Engine::open(&db).unwrap();
    assert!(
        matches!(Engine::open(&db), Err(Error::Conflict)),
        "second open must Conflict while first owner holds the flock"
    );
    e.register_workflow("park", "v1", |c| {
        c.signal("go")?;
        Ok(c.input().clone())
    })
    .unwrap();
    e.start("r", "park", "v1", PayloadRef::durable("input").unwrap())
        .unwrap();
    assert!(matches!(e.drive("r", 0).unwrap(), DriveOutcome::Waiting));
    drop(e);

    let (epoch1, original) = {
        let s = SqliteStore::open(&db).unwrap();
        let epoch = s.owner_epoch();
        let original = s.load("r").unwrap();
        (epoch, original)
    };

    let mut s = SqliteStore::open(&db).unwrap();
    let epoch2 = s.owner_epoch();
    assert!(
        epoch2 > epoch1,
        "owner_epoch must bump on each exclusive open; was {epoch1} now {epoch2}"
    );

    let mut stale = original.clone();
    // revision == expected (not expected+1) → Conflict before any write.
    stale.state = RunState::Cancelled;
    assert!(
        matches!(
            s.commit(original.revision, &stale, &[]),
            Err(Error::Conflict)
        ),
        "commit where revision != expected+1 must Conflict"
    );
    assert_eq!(
        s.load("r").unwrap().revision,
        original.revision,
        "failed CAS must not mutate the durable record"
    );
    assert_eq!(s.load("r").unwrap().state, original.state);

    // Wrong expected revision (already advanced) → Conflict, no mutation.
    let mut forged = original.clone();
    forged.revision = original.revision + 1;
    forged.state = RunState::Cancelled;
    assert!(matches!(
        s.commit(original.revision.saturating_add(9), &forged, &[]),
        Err(Error::Conflict)
    ));
    assert_eq!(s.load("r").unwrap().revision, original.revision);

    let mut ok = original.clone();
    ok.revision = original.revision + 1;
    ok.state = RunState::Cancelled;
    s.commit(original.revision, &ok, &[]).unwrap();
    assert_eq!(s.load("r").unwrap().revision, original.revision + 1);
    assert_eq!(s.load("r").unwrap().state, RunState::Cancelled);
}
