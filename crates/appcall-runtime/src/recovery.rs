//! Host generation session inventory; no failed SQL or external work is replayed.
use crate::{connect_database_url, Error, Result};
use std::{
    collections::BTreeMap,
    sync::Mutex,
    time::{Instant, SystemTime},
};
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SessionHealth {
    Healthy,
    Missing,
    Unavailable,
}
#[derive(Clone)]
struct Session {
    database: String,
    production: bool,
    pid: i32,
    started: SystemTime,
}
#[derive(Default)]
pub struct SessionTracker {
    sessions: Mutex<Vec<Session>>,
}
impl SessionTracker {
    pub(crate) fn register(
        &self,
        database: &str,
        production: bool,
        client: &mut postgres::Client,
    ) -> Result<()> {
        let row=client.query_one("SELECT pg_backend_pid(),backend_start FROM pg_stat_activity WHERE pid=pg_backend_pid()",&[]).map_err(|_|Error::Database)?;
        let session = Session {
            database: database.into(),
            production,
            pid: row.try_get(0).map_err(|_| Error::Database)?,
            started: row.try_get(1).map_err(|_| Error::Database)?,
        };
        let mut sessions = self.sessions.lock().map_err(|_| Error::Database)?;
        if sessions.len() >= 64
            || (!sessions.iter().any(|s| s.database == database)
                && sessions
                    .iter()
                    .map(|s| &s.database)
                    .collect::<std::collections::BTreeSet<_>>()
                    .len()
                    >= 4)
        {
            return Err(Error::Configuration);
        }
        sessions.push(session);
        Ok(())
    }
    pub fn session_count(&self) -> usize {
        self.sessions.lock().map(|s| s.len()).unwrap_or(0)
    }
    /// New, untracked monitor connections cannot hide an old physical session's
    /// death. PID reuse must also match backend_start. Same-user PG visibility is
    /// sufficient; this does not require a superuser or reading other users' SQL.
    pub fn live_sessions(&self) -> Result<usize> {
        let entries = self.sessions.lock().map_err(|_| Error::Database)?.clone();
        let mut groups = BTreeMap::<(String, bool), Vec<(i32, SystemTime)>>::new();
        for entry in entries {
            groups
                .entry((entry.database, entry.production))
                .or_default()
                .push((entry.pid, entry.started));
        }
        let mut live = 0;
        for ((database, production), expected) in groups {
            let mut client = connect_database_url(&database, production)?;
            let ids = expected.iter().map(|(pid, _)| *pid).collect::<Vec<_>>();
            let rows = client
                .query(
                    "SELECT pid,backend_start FROM pg_stat_activity WHERE pid=ANY($1)",
                    &[&ids],
                )
                .map_err(|_| Error::Database)?;
            for row in rows {
                let pid: i32 = row.try_get(0).map_err(|_| Error::Database)?;
                let started: SystemTime = row.try_get(1).map_err(|_| Error::Database)?;
                if expected.contains(&(pid, started)) {
                    live += 1;
                }
            }
        }
        Ok(live)
    }
    pub fn probe(&self) -> SessionHealth {
        match self.live_sessions() {
            Ok(n) if n == self.session_count() => SessionHealth::Healthy,
            Ok(_) => SessionHealth::Missing,
            Err(_) => SessionHealth::Unavailable,
        }
    }
}
pub(crate) fn check_deadline(deadline: Option<Instant>) -> Result<()> {
    if deadline.is_some_and(|d| Instant::now() >= d) {
        Err(Error::Database)
    } else {
        Ok(())
    }
}
