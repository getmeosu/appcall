//! Caller-scoped poll subscription management (OXIDE-POLL-2).
//!
//! The API runs these inside its own store transaction. Every function is
//! scoped to one project and, for account-bound callers, to connections of
//! that external account: a connection outside the scope is `NotFound`,
//! exactly like a missing one.
use crate::poll::{scoped_connection, subscribe_in, ConnectionFilter};
use crate::*;
use postgres::GenericClient;

/// The caller a scoped call acts for.
#[derive(Clone, Copy, Debug)]
pub struct PollCaller<'a> {
    pub project_id: &'a str,
    /// Empty for a project-wide caller.
    pub account_id: &'a str,
}

/// A subscription as reported to its owner. Timestamps are RFC 3339 UTC.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PollSubscriptionView {
    pub connection_id: String,
    pub operation: String,
    pub input: Value,
    /// `active` or `paused`.
    pub status: String,
    pub seeded: bool,
    pub attempts: u32,
    pub last_error: String,
    pub next_run_at: String,
    pub created_at: String,
    pub updated_at: String,
}

const VIEW_COLUMNS: &str = "connection_id,operation,input,status,seeded,attempts,last_error,to_char(next_run_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"'),to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"'),to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"')";

fn view(row: &postgres::Row) -> PollSubscriptionView {
    PollSubscriptionView {
        connection_id: row.get(0),
        operation: row.get(1),
        input: row.get(2),
        status: row.get(3),
        seeded: row.get(4),
        attempts: u32::try_from(row.get::<_, i32>(5)).unwrap_or(0),
        last_error: row.get(6),
        next_run_at: row.get(7),
        created_at: row.get(8),
        updated_at: row.get(9),
    }
}

fn caller_filter<'a>(
    caller: &PollCaller<'a>,
    connector: Option<&'a str>,
) -> Result<ConnectionFilter<'a>> {
    if caller.project_id.is_empty()
        || caller.project_id.len() > 512
        || caller.account_id.len() > 512
    {
        return Err(Error::InvalidInput);
    }
    Ok(ConnectionFilter {
        account_id: caller.account_id,
        connector,
    })
}

/// Subscribe `request.connection_id` (which must be in the caller's scope and
/// belong to `connector`, the connector whose manifest the caller validated
/// `request` against). Idempotent: an unchanged input keeps the seen state.
/// Returns the subscription and whether it was newly created.
pub fn poll_subscribe_scoped<C: GenericClient>(
    db: &mut C,
    caller: &PollCaller<'_>,
    connector: &str,
    request: &PollSubscription,
) -> Result<(PollSubscriptionView, bool)> {
    if request.project_id != caller.project_id {
        return Err(Error::NotFound);
    }
    let filter = caller_filter(caller, Some(connector))?;
    let mut tx = db.transaction()?;
    let created = subscribe_in(&mut tx, request, &filter)?;
    let row = tx.query_one(
        &format!("SELECT {VIEW_COLUMNS} FROM poll_subscriptions WHERE project_id=$1 AND connection_id=$2 AND operation=$3"),
        &[&request.project_id, &request.connection_id, &request.operation],
    )?;
    tx.commit()?;
    Ok((view(&row), created))
}

/// Remove a subscription and its seen state. `Ok(false)` when there was none
/// (idempotent); `NotFound` when the connection is outside the scope.
pub fn poll_unsubscribe_scoped<C: GenericClient>(
    db: &mut C,
    caller: &PollCaller<'_>,
    connection_id: &str,
    operation: &str,
) -> Result<bool> {
    let filter = caller_filter(caller, None)?;
    let mut tx = db.transaction()?;
    scoped_connection(&mut tx, caller.project_id, connection_id, &filter)?;
    let removed = tx.execute(
        "DELETE FROM poll_subscriptions WHERE project_id=$1 AND connection_id=$2 AND operation=$3",
        &[&caller.project_id, &connection_id, &operation],
    )? == 1;
    tx.commit()?;
    Ok(removed)
}

/// The connection's subscriptions, ordered by operation; only `operation`
/// when given.
pub fn poll_subscriptions_scoped<C: GenericClient>(
    db: &mut C,
    caller: &PollCaller<'_>,
    connection_id: &str,
    operation: Option<&str>,
) -> Result<Vec<PollSubscriptionView>> {
    let filter = caller_filter(caller, None)?;
    let mut tx = db.transaction()?;
    scoped_connection(&mut tx, caller.project_id, connection_id, &filter)?;
    let rows = tx.query(
        &format!("SELECT {VIEW_COLUMNS} FROM poll_subscriptions WHERE project_id=$1 AND connection_id=$2 AND ($3::text IS NULL OR operation=$3) ORDER BY operation"),
        &[&caller.project_id, &connection_id, &operation],
    )?;
    tx.commit()?;
    Ok(rows.iter().map(view).collect())
}
