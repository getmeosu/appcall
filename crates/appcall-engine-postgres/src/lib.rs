//! Optional server backend. It is not linked into the default embedded build.
use appcall_engine::*;
use postgres::{Client, Transaction};
use std::sync::{Mutex, MutexGuard};
const OWNER_LOCK: i64 = 0x61707063616c6c;
/// A single host-configured session; TLS and credentials stay with its Client.
/// Session advisory ownership is exclusive for this engine database. Use a
/// dedicated database/schema with a stable search_path and direct sessions,
/// never a transaction-pooling proxy.
pub struct PostgresStore {
    client: Mutex<Client>,
    epoch: u64,
}
impl PostgresStore {
    pub fn from_client(mut client: Client) -> Result<Self> {
        let owned: bool = client
            .query_one("SELECT pg_try_advisory_lock($1)", &[&OWNER_LOCK])
            .map_err(safe)?
            .get(0);
        if !owned {
            return Err(Error::Conflict);
        }
        client.batch_execute("SET synchronous_commit=on; CREATE TABLE IF NOT EXISTS appcall_workflow_owner(id INTEGER PRIMARY KEY CHECK(id=1),epoch BIGINT NOT NULL);
            INSERT INTO appcall_workflow_owner VALUES(1,0) ON CONFLICT DO NOTHING;
            CREATE TABLE IF NOT EXISTS appcall_workflow_runs(id TEXT PRIMARY KEY,revision BIGINT NOT NULL,state TEXT NOT NULL,wakeup BIGINT,record BYTEA NOT NULL CHECK(octet_length(record)<=1048576));
            CREATE INDEX IF NOT EXISTS appcall_workflow_wakeup ON appcall_workflow_runs(state,wakeup);").map_err(safe)?;
        let mut tx = client.transaction().map_err(safe)?;
        let epoch: i64 = tx
            .query_one(
                "UPDATE appcall_workflow_owner SET epoch=epoch+1 WHERE id=1 RETURNING epoch",
                &[],
            )
            .map_err(safe)?
            .get(0);
        let recovery_ids: Vec<String> = tx
            .query(
                "SELECT id,wakeup,record FROM appcall_workflow_runs WHERE state='running'",
                &[],
            )
            .map_err(safe)?
            .into_iter()
            .filter_map(|row| {
                let id: String = row.get(0);
                let wakeup: Option<i64> = row.get(1);
                let record: Vec<u8> = row.get(2);
                let recover = wakeup.is_none()
                    && serde_json::from_slice::<RunRecord>(&record)
                        .map(|run| requires_recovery(&run))
                        .unwrap_or(false);
                recover.then_some(id)
            })
            .collect();
        for id in recovery_ids {
            tx.execute(
                "UPDATE appcall_workflow_runs SET wakeup=0 WHERE id=$1 AND state='running'",
                &[&id],
            )
            .map_err(safe)?;
        }
        tx.commit().map_err(safe)?;
        Ok(Self {
            client: Mutex::new(client),
            epoch: epoch as u64,
        })
    }
    fn client(&self) -> Result<MutexGuard<'_, Client>> {
        self.client.lock().map_err(|_| Error::Unavailable)
    }
}
fn safe(error: postgres::Error) -> Error {
    if error.code() == Some(&postgres::error::SqlState::UNIQUE_VIOLATION) {
        Error::Conflict
    } else {
        Error::Storage("postgres operation failed".into())
    }
}
fn encoded(run: &RunRecord) -> Result<Vec<u8>> {
    let bytes = serde_json::to_vec(run).map_err(|_| Error::Invalid("record encoding"))?;
    if bytes.len() > 1024 * 1024 {
        return Err(Error::Limit);
    }
    Ok(bytes)
}
fn state(r: &RunRecord) -> &'static str {
    if matches!(r.state, RunState::Running | RunState::CancelRequested) {
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
fn insert(tx: &mut Transaction<'_>, run: &RunRecord) -> Result<()> {
    let revision = i64::try_from(run.revision).map_err(|_| Error::Limit)?;
    tx.execute(
        "INSERT INTO appcall_workflow_runs VALUES($1,$2,$3,$4,$5)",
        &[&run.id, &revision, &state(run), &run.wakeup, &encoded(run)?],
    )
    .map_err(safe)?;
    Ok(())
}
fn fence(tx: &mut Transaction<'_>, epoch: u64) -> Result<()> {
    let actual: i64 = tx
        .query_one(
            "SELECT epoch FROM appcall_workflow_owner WHERE id=1 FOR UPDATE",
            &[],
        )
        .map_err(safe)?
        .get(0);
    if actual as u64 != epoch {
        return Err(Error::Conflict);
    }
    Ok(())
}
impl Store for PostgresStore {
    fn owner_epoch(&self) -> u64 {
        self.epoch
    }
    fn load(&self, id: &str) -> Result<RunRecord> {
        let row = self
            .client()?
            .query_opt(
                "SELECT record FROM appcall_workflow_runs WHERE id=$1",
                &[&id],
            )
            .map_err(safe)?
            .ok_or(Error::NotFound)?;
        let bytes: Vec<u8> = row.get(0);
        serde_json::from_slice(&bytes).map_err(|_| Error::Storage("invalid durable record".into()))
    }
    fn insert(&mut self, run: &RunRecord) -> Result<()> {
        let mut client = self.client()?;
        let mut tx = client.transaction().map_err(safe)?;
        fence(&mut tx, self.epoch)?;
        insert(&mut tx, run)?;
        tx.commit().map_err(safe)
    }
    fn commit(&mut self, expected: u64, run: &RunRecord, children: &[RunRecord]) -> Result<()> {
        if expected.checked_add(1) != Some(run.revision) {
            return Err(Error::Conflict);
        }
        let revision = i64::try_from(run.revision).map_err(|_| Error::Limit)?;
        let expected = i64::try_from(expected).map_err(|_| Error::Limit)?;
        let mut client = self.client()?;
        let mut tx = client.transaction().map_err(safe)?;
        fence(&mut tx, self.epoch)?;
        let count=tx.execute("UPDATE appcall_workflow_runs SET revision=$2,state=$3,wakeup=$4,record=$5 WHERE id=$1 AND revision=$6",&[&run.id,&revision,&state(run),&run.wakeup,&encoded(run)?,&expected]).map_err(safe)?;
        if count != 1 {
            return Err(Error::Conflict);
        }
        for child in children {
            insert(&mut tx, child).map_err(|error| match error {
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
                    "UPDATE appcall_workflow_runs SET wakeup=0 WHERE id=$1 AND state='running'",
                    &[parent],
                )
                .map_err(safe)?;
            }
        }
        tx.commit().map_err(safe)
    }
    fn runnable(&self, now_ms: i64, limit: usize) -> Result<Vec<String>> {
        if limit == 0 || limit > 256 {
            return Err(Error::Limit);
        }
        Ok(self.client()?.query("SELECT id FROM appcall_workflow_runs WHERE state='running' AND wakeup<=$1 ORDER BY wakeup,id LIMIT $2",&[&now_ms,&(limit as i64)]).map_err(safe)?.iter().map(|row|row.get(0)).collect())
    }
    fn next_wakeup(&self) -> Result<Option<i64>> {
        Ok(self
            .client()?
            .query_one(
                "SELECT MIN(wakeup) FROM appcall_workflow_runs WHERE state='running'",
                &[],
            )
            .map_err(safe)?
            .get(0))
    }
}
