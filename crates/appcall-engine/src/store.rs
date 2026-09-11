use crate::*;
use fs2::FileExt;
use rusqlite::{params, Connection, OptionalExtension};
use std::{
    fs::{File, OpenOptions},
    path::Path,
};

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
        connection.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA cache_size=-256; PRAGMA mmap_size=0; PRAGMA temp_store=FILE; PRAGMA wal_autocheckpoint=64;
            CREATE TABLE IF NOT EXISTS engine_owner (id INTEGER PRIMARY KEY CHECK(id=1), epoch INTEGER NOT NULL);
            INSERT INTO engine_owner VALUES(1,0) ON CONFLICT DO NOTHING;
            UPDATE engine_owner SET epoch=epoch+1 WHERE id=1;
            CREATE TABLE IF NOT EXISTS engine_runs (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, state TEXT NOT NULL, wakeup INTEGER, record BLOB NOT NULL);
            CREATE INDEX IF NOT EXISTS engine_runs_wakeup ON engine_runs(state,wakeup);")?;
        // A NULL wakeup identifies interrupted work that recovery must inspect.
        // Keep the old restart behavior for runs with an in-flight native
        // attempt, but preserve scheduled retry deadlines and timers.
        let recovery_ids: Vec<String> = {
            let mut statement = connection
                .prepare("SELECT id,wakeup,record FROM engine_runs WHERE state='running'")?;
            let rows = statement.query_map([], |row| {
                let id: String = row.get(0)?;
                let wakeup: Option<i64> = row.get(1)?;
                let recover = wakeup.is_none()
                    && serde_json::from_slice::<RunRecord>(&row.get::<_, Vec<u8>>(2)?)
                        .map(|run| requires_recovery(&run))
                        .unwrap_or(false);
                Ok((id, recover))
            })?;
            rows.collect::<std::result::Result<Vec<_>, _>>()?
                .into_iter()
                .filter_map(|(id, recover)| recover.then_some(id))
                .collect()
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
fn encoded(run: &RunRecord) -> Result<Vec<u8>> {
    let bytes = serde_json::to_vec(run).map_err(|_| Error::Invalid("record encoding"))?;
    if bytes.len() > 1024 * 1024 {
        return Err(Error::Limit);
    }
    Ok(bytes)
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
        serde_json::from_slice(&bytes).map_err(|_| Error::Storage("invalid durable record".into()))
    }
    fn insert(&mut self, run: &RunRecord) -> Result<()> {
        let revision = i64::try_from(run.revision).map_err(|_| Error::Limit)?;
        self.connection
            .execute(
                "INSERT INTO engine_runs VALUES (?1,?2,?3,?4,?5)",
                params![run.id, revision, state(run), run.wakeup, encoded(run)?],
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
    fn commit(&mut self, expected: u64, run: &RunRecord, children: &[RunRecord]) -> Result<()> {
        if expected.checked_add(1) != Some(run.revision) {
            return Err(Error::Conflict);
        }
        let revision = i64::try_from(run.revision).map_err(|_| Error::Limit)?;
        let expected = i64::try_from(expected).map_err(|_| Error::Limit)?;
        let tx = self.connection.transaction()?;
        let n = tx.execute("UPDATE engine_runs SET revision=?2,state=?3,wakeup=?4,record=?5 WHERE id=?1 AND revision=?6", params![run.id,revision,state(run),run.wakeup,encoded(run)?,expected])?;
        if n != 1 {
            return Err(Error::Conflict);
        }
        for child in children {
            tx.execute(
                "INSERT INTO engine_runs VALUES (?1,?2,?3,?4,?5)",
                params![
                    child.id,
                    child.revision,
                    state(child),
                    child.wakeup,
                    encoded(child)?
                ],
            )
            .map_err(|error| {
                if error.sqlite_error().is_some_and(|error| {
                    error.extended_code == rusqlite::ffi::SQLITE_CONSTRAINT_PRIMARYKEY
                }) {
                    Error::Invalid("child id collision")
                } else {
                    error.into()
                }
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
}
