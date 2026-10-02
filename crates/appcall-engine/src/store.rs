use crate::*;
use fs2::FileExt;
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use std::{
    fs::{File, OpenOptions},
    path::Path,
};

const HISTORY_CAP: usize = 1024;

/// Backend contract: one active owner, durable atomic CAS of parent + children,
/// ordered per-run history, and bounded runnable enumeration. A PostgreSQL
/// implementation must provide equivalent ownership/fencing, not just CRUD.
pub trait Store {
    fn owner_epoch(&self) -> u64;
    fn load(&self, id: &str) -> Result<RunRecord>;
    fn insert(&mut self, run: &RunRecord) -> Result<()>;
    fn commit(
        &mut self,
        expected_revision: u64,
        run: &RunRecord,
        children: &[RunRecord],
    ) -> Result<()>;
    fn runnable(&self, now_ms: i64, limit: usize) -> Result<Vec<String>>;
    fn next_wakeup(&self) -> Result<Option<i64>>;
    /// Runs with id strictly greater than `after_id`, ordered by id ascending.
    /// `limit` must be in 1..=100.
    fn list_run_summaries(&self, after_id: &str, limit: usize) -> Result<Vec<RunSummary>>;
}
pub struct SqliteStore {
    connection: Connection,
    _owner: File,
    epoch: u64,
}
impl SqliteStore {
    pub fn open(path: impl AsRef<Path>) -> Result<Self> {
        // Resolve aliases before locking the sidecar. Do not flock SQLite
        // itself: on macOS flock conflicts with SQLite database locking.
        let file = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(path.as_ref())
            .map_err(|_| Error::Storage("cannot open database".into()))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt;
            if file.metadata().map_err(|_| Error::Unavailable)?.nlink() != 1 {
                return Err(Error::Invalid("hardlinked database"));
            }
        }
        drop(file);
        let canonical = std::fs::canonicalize(path.as_ref()).map_err(|_| Error::Unavailable)?;
        let mut lock_path = canonical.as_os_str().to_os_string();
        lock_path.push(".owner");
        let owner = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(lock_path)
            .map_err(|_| Error::Unavailable)?;
        owner.try_lock_exclusive().map_err(|_| Error::Conflict)?;
        let connection = Connection::open(canonical)?;
        connection.execute_batch(
            "PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA cache_size=-256; PRAGMA mmap_size=0; PRAGMA temp_store=FILE; PRAGMA wal_autocheckpoint=64;
            CREATE TABLE IF NOT EXISTS engine_owner (id INTEGER PRIMARY KEY CHECK(id=1), epoch INTEGER NOT NULL);
            INSERT INTO engine_owner VALUES(1,0) ON CONFLICT DO NOTHING;
            UPDATE engine_owner SET epoch=epoch+1 WHERE id=1;
            CREATE TABLE IF NOT EXISTS engine_runs (
                id TEXT PRIMARY KEY,
                revision INTEGER NOT NULL,
                state TEXT NOT NULL,
                wakeup INTEGER,
                record BLOB NOT NULL,
                recoverable INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS engine_runs_wakeup ON engine_runs(state,wakeup);
            CREATE TABLE IF NOT EXISTS engine_history (
                run_id TEXT NOT NULL,
                seq INTEGER NOT NULL CHECK(seq >= 0 AND seq < 1024),
                event BLOB NOT NULL CHECK(length(event) <= 1048576),
                PRIMARY KEY (run_id, seq)
            );",
        )?;
        ensure_recoverable_column(&connection)?;
        connection.execute_batch(
            "CREATE INDEX IF NOT EXISTS engine_runs_recoverable
                ON engine_runs(state, recoverable) WHERE recoverable=1;",
        )?;
        // Recoverable is denormalized on insert/commit. Open only visits the
        // indexed recoverable subset (O(K), not O(N) running), validates the
        // blob, then bumps wakeup — passive waits are not decoded.
        let recovery_ids: Vec<String> = {
            let mut statement = connection.prepare(
                "SELECT id,record FROM engine_runs
                 WHERE state='running' AND recoverable=1
                   AND IFNULL(wakeup, -1) != 0",
            )?;
            let mut rows = statement.query([])?;
            let mut recovery_ids = Vec::new();
            while let Some(row) = rows.next()? {
                let id: String = row.get(0)?;
                let record: Vec<u8> = row.get(1)?;
                let _ = requires_recovery(&decode_record(&record)?);
                recovery_ids.push(id);
            }
            recovery_ids
        };
        for id in recovery_ids {
            connection.execute(
                "UPDATE engine_runs SET wakeup=0 WHERE id=?1 AND state='running'",
                [id],
            )?;
        }
        let epoch = connection.query_row("SELECT epoch FROM engine_owner WHERE id=1", [], |r| {
            r.get(0)
        })?;
        Ok(Self {
            connection,
            _owner: owner,
            epoch,
        })
    }
}
/// Add `recoverable` to pre-column databases and backfill once from record blobs.
fn ensure_recoverable_column(connection: &Connection) -> Result<()> {
    let mut stmt = connection.prepare("PRAGMA table_info(engine_runs)")?;
    let mut has = false;
    let mut rows = stmt.query([])?;
    while let Some(row) = rows.next()? {
        let name: String = row.get(1)?;
        if name == "recoverable" {
            has = true;
            break;
        }
    }
    drop(rows);
    drop(stmt);
    if has {
        return Ok(());
    }
    connection.execute_batch(
        "ALTER TABLE engine_runs ADD COLUMN recoverable INTEGER NOT NULL DEFAULT 0;",
    )?;
    // One-time upgrade backfill: decode running blobs, set flag + wakeup.
    let recovery: Vec<(String, bool)> = {
        let mut statement =
            connection.prepare("SELECT id,record FROM engine_runs WHERE state='running'")?;
        let mut rows = statement.query([])?;
        let mut out = Vec::new();
        while let Some(row) = rows.next()? {
            let id: String = row.get(0)?;
            let record: Vec<u8> = row.get(1)?;
            out.push((id, requires_recovery(&decode_record(&record)?)));
        }
        out
    };
    for (id, recover) in recovery {
        if recover {
            connection.execute(
                "UPDATE engine_runs SET recoverable=1, wakeup=0 WHERE id=?1 AND state='running'",
                [id],
            )?;
        }
    }
    Ok(())
}
fn encode_event(event: &HistoryEvent) -> Result<Vec<u8>> {
    serde_json::to_vec(event).map_err(|_| Error::Invalid("record encoding"))
}
fn decode_event(bytes: &[u8]) -> Result<HistoryEvent> {
    serde_json::from_slice(bytes).map_err(|_| Error::Storage("invalid durable record".into()))
}
fn decode_record(record: &[u8]) -> Result<RunRecord> {
    serde_json::from_slice(record).map_err(|_| Error::Storage("invalid durable record".into()))
}
/// Seal index: first unresolved event, or len if all resolved. Engine fills
/// values in order, so [0..seal) is append-only and never rewritten.
fn seal_end(history: &[HistoryEvent]) -> usize {
    history
        .iter()
        .position(|event| event.value.is_none())
        .unwrap_or(history.len())
}
/// Persist run body with only the unsealed history suffix; sealed prefix lives
/// in engine_history. Enforces the same 1MiB total + 1024 caps.
fn encode_body(run: &RunRecord, seal: usize) -> Result<Vec<u8>> {
    if run.history.len() > HISTORY_CAP {
        return Err(Error::Limit);
    }
    let mut sealed_bytes = 0usize;
    for event in &run.history[..seal] {
        sealed_bytes = sealed_bytes
            .checked_add(encode_event(event)?.len())
            .ok_or(Error::Limit)?;
    }
    let mut body = run.clone();
    body.history = run.history[seal..].to_vec();
    let bytes = serde_json::to_vec(&body).map_err(|_| Error::Invalid("record encoding"))?;
    let total = sealed_bytes.checked_add(bytes.len()).ok_or(Error::Limit)?;
    // Load-bearing 1MiB literal (acceptance_bar freeze); also caps sealed+body total.
    if bytes.len() > 1024 * 1024 {
        return Err(Error::Limit);
    }
    if total > 1024 * 1024 {
        return Err(Error::Limit);
    }
    Ok(bytes)
}
fn sealed_count(tx: &Transaction<'_>, id: &str) -> Result<usize> {
    let n: i64 = tx.query_row(
        "SELECT COUNT(*) FROM engine_history WHERE run_id=?1",
        [id],
        |r| r.get(0),
    )?;
    usize::try_from(n).map_err(|_| Error::Limit)
}
fn load_sealed(connection: &Connection, id: &str) -> Result<Vec<HistoryEvent>> {
    let mut stmt = connection.prepare(
        "SELECT seq,event FROM engine_history WHERE run_id=?1 ORDER BY seq",
    )?;
    let mut rows = stmt.query([id])?;
    let mut out = Vec::new();
    let mut expected = 0usize;
    while let Some(row) = rows.next()? {
        let seq: i64 = row.get(0)?;
        if seq as usize != expected {
            return Err(Error::Storage("invalid durable record".into()));
        }
        let bytes: Vec<u8> = row.get(1)?;
        out.push(decode_event(&bytes)?);
        expected += 1;
    }
    Ok(out)
}
fn assemble(record: &[u8], sealed: Vec<HistoryEvent>) -> Result<RunRecord> {
    let mut run = decode_record(record)?;
    if sealed.is_empty() {
        // Legacy row: full history still embedded in the blob.
        return Ok(run);
    }
    let mut history = sealed;
    history.extend(run.history.drain(..));
    if history.len() > HISTORY_CAP {
        return Err(Error::Limit);
    }
    run.history = history;
    Ok(run)
}
fn append_sealed(
    tx: &Transaction<'_>,
    id: &str,
    history: &[HistoryEvent],
    from: usize,
    to: usize,
) -> Result<()> {
    for (seq, event) in history.iter().enumerate().take(to).skip(from) {
        let seq_i = i64::try_from(seq).map_err(|_| Error::Limit)?;
        tx.execute(
            "INSERT INTO engine_history(run_id,seq,event) VALUES(?1,?2,?3)",
            params![id, seq_i, encode_event(event)?],
        )?;
    }
    Ok(())
}
fn persist_history(tx: &Transaction<'_>, run: &RunRecord) -> Result<Vec<u8>> {
    let seal = seal_end(&run.history);
    let already = sealed_count(tx, &run.id)?;
    if seal < already {
        return Err(Error::Invalid("history shrink"));
    }
    append_sealed(tx, &run.id, &run.history, already, seal)?;
    encode_body(run, seal)
}
fn insert_run(tx: &Transaction<'_>, run: &RunRecord) -> Result<()> {
    let revision = i64::try_from(run.revision).map_err(|_| Error::Limit)?;
    let body = persist_history(tx, run)?;
    tx.execute(
        "INSERT INTO engine_runs(id,revision,state,wakeup,record,recoverable)
         VALUES (?1,?2,?3,?4,?5,?6)",
        params![
            run.id,
            revision,
            state(run),
            run.wakeup,
            body,
            recoverable_flag(run)
        ],
    )
    .map_err(|e| {
        if e.sqlite_error_code() == Some(rusqlite::ErrorCode::ConstraintViolation) {
            Error::Conflict
        } else {
            e.into()
        }
    })?;
    Ok(())
}
fn state(run: &RunRecord) -> &'static str {
    if matches!(run.state, RunState::Running | RunState::CancelRequested) {
        "running"
    } else {
        "suspended"
    }
}
fn requires_recovery(run: &RunRecord) -> bool {
    run.state == RunState::CancelRequested
        || run.tasks.iter().any(|task| {
            matches!(
                task.state,
                TaskState::Ready | TaskState::InFlight | TaskState::Invoking
            )
        })
}
fn recoverable_flag(run: &RunRecord) -> i64 {
    i64::from(requires_recovery(run))
}
impl Store for SqliteStore {
    fn owner_epoch(&self) -> u64 {
        self.epoch
    }
    fn load(&self, id: &str) -> Result<RunRecord> {
        let bytes: Vec<u8> = self
            .connection
            .query_row("SELECT record FROM engine_runs WHERE id=?1", [id], |r| {
                r.get(0)
            })
            .optional()?
            .ok_or(Error::NotFound)?;
        let sealed = load_sealed(&self.connection, id)?;
        assemble(&bytes, sealed)
    }
    fn insert(&mut self, run: &RunRecord) -> Result<()> {
        let tx = self.connection.transaction()?;
        insert_run(&tx, run)?;
        tx.commit()?;
        Ok(())
    }
    fn commit(&mut self, expected: u64, run: &RunRecord, children: &[RunRecord]) -> Result<()> {
        if expected.checked_add(1) != Some(run.revision) {
            return Err(Error::Conflict);
        }
        let revision = i64::try_from(run.revision).map_err(|_| Error::Limit)?;
        let expected = i64::try_from(expected).map_err(|_| Error::Limit)?;
        let tx = self.connection.transaction()?;
        let body = persist_history(&tx, run)?;
        let n = tx.execute(
            "UPDATE engine_runs SET revision=?2,state=?3,wakeup=?4,record=?5,recoverable=?6
             WHERE id=?1 AND revision=?7",
            params![
                run.id,
                revision,
                state(run),
                run.wakeup,
                body,
                recoverable_flag(run),
                expected
            ],
        )?;
        if n != 1 {
            return Err(Error::Conflict);
        }
        for child in children {
            insert_run(&tx, child).map_err(|error| match error {
                Error::Conflict => Error::Invalid("child id collision"),
                error => error,
            })?;
        }
        if matches!(
            run.state,
            RunState::Completed | RunState::Cancelled | RunState::Failed | RunState::Nondeterminism
        ) {
            if let Some(parent) = &run.parent {
                tx.execute(
                    "UPDATE engine_runs SET wakeup=0 WHERE id=?1 AND state='running'",
                    [parent],
                )?;
            }
        }
        tx.commit()?;
        Ok(())
    }
    fn runnable(&self, now_ms: i64, limit: usize) -> Result<Vec<String>> {
        if limit == 0 || limit > 256 {
            return Err(Error::Limit);
        }
        let mut stmt = self.connection.prepare("SELECT id FROM engine_runs WHERE state='running' AND wakeup<=?1 ORDER BY wakeup,id LIMIT ?2")?;
        let rows = stmt.query_map(params![now_ms, limit], |r| r.get(0))?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }
    fn next_wakeup(&self) -> Result<Option<i64>> {
        Ok(self.connection.query_row(
            "SELECT MIN(wakeup) FROM engine_runs WHERE state='running'",
            [],
            |r| r.get(0),
        )?)
    }
    fn list_run_summaries(&self, after_id: &str, limit: usize) -> Result<Vec<RunSummary>> {
        if limit == 0 || limit > 100 {
            return Err(Error::Limit);
        }
        let mut stmt = self
            .connection
            .prepare("SELECT record FROM engine_runs WHERE id>?1 ORDER BY id LIMIT ?2")?;
        let rows = stmt.query_map(params![after_id, limit as i64], |r| r.get::<_, Vec<u8>>(0))?;
        let mut out = Vec::new();
        for row in rows {
            // Summaries only need identity fields on the body blob; sealed
            // history is not required.
            let run = decode_record(&row?)?;
            out.push(RunSummary {
                id: run.id,
                workflow: run.workflow,
                version: run.version,
                state: run.state,
                parent: run.parent,
                wakeup: run.wakeup,
            });
        }
        Ok(out)
    }
}
