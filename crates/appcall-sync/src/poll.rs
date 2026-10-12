//! Opt-in polling of manifest sync operations (OXIDE-POLL-1).
//!
//! A [`PollSubscription`] row per (project, connection, operation) carries the
//! schedule and a lease. One poll claims a due row, fetches up to
//! `poll.maxPages` pages through the runner, diffs the items against the
//! stored seen state and, in a single fenced transaction, records the new
//! seen state, appends one durable event per new or changed item and
//! reschedules the row. The first run after subscribing (or after a
//! connection rebind) only seeds the seen state and emits nothing.
use crate::service::SyncCall;
use crate::*;
use appcall_connectors::{OperationKind, PollChange, PollSpec};
use appcall_events::{append_polled, PolledEvent};
use postgres::{GenericClient, Transaction};
use serde_json::{json, Map};
use sha2::{Digest, Sha256};
use std::collections::BTreeSet;
use std::fmt::Write as _;
use std::time::UNIX_EPOCH;

const MAX_POLL_INPUT_BYTES: usize = 4096;
const MAX_POLL_ITEMS_PER_PAGE: usize = 10_000;
const MAX_ITEM_KEY_BYTES: usize = 1024;
const MAX_CURSOR_BYTES: usize = 65_536;

/// Request to start (or keep) polling one sync operation on a connection.
#[derive(Clone, Debug, PartialEq)]
pub struct PollSubscription {
    pub project_id: String,
    pub connection_id: String,
    pub operation: String,
    /// Caller-provided sync input (for example a repository). Credentials are
    /// merged in per call and always win; `cursor` is reserved.
    pub input: Value,
}

impl PollSubscription {
    fn validate(&self) -> Result<()> {
        let id = |v: &str| !v.is_empty() && v.len() <= 512 && !v.chars().any(char::is_control);
        let object = self.input.as_object().ok_or(Error::InvalidInput)?;
        if !id(&self.project_id)
            || !id(&self.connection_id)
            || !id(&self.operation)
            || object.contains_key("cursor")
            || serde_json::to_vec(&self.input)
                .map_err(|_| Error::InvalidInput)?
                .len()
                > MAX_POLL_INPUT_BYTES
        {
            return Err(Error::InvalidInput);
        }
        Ok(())
    }
}

/// Seen-item retention for one subscription. Items observed by the current
/// poll are always kept (so nothing still on the pages is re-emitted); of
/// the rest, items unobserved for longer than `ttl` are pruned, and only
/// the `cap` most recently observed are kept. A prune renews the epoch.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PollRetention {
    pub cap: u32,
    pub ttl: Duration,
}

impl Default for PollRetention {
    fn default() -> Self {
        Self {
            cap: 10_000,
            ttl: Duration::from_secs(30 * 24 * 3600),
        }
    }
}

/// A leased, due subscription. Only the holder of this exact lease can
/// commit or fail it.
#[derive(Clone, Debug, PartialEq)]
pub struct PollClaim {
    pub project_id: String,
    pub connection_id: String,
    pub connector: String,
    pub operation: String,
    pub input: Value,
    pub connection_generation: i64,
    /// Seen-state epoch: renewed on every reset of the seen state, part of
    /// every event dedup key.
    pub epoch: i64,
    pub seeded: bool,
    pub attempts: u32,
    pub worker_id: String,
    pub leased_until: SystemTime,
}

/// One decoded page item with its identity and change fingerprint.
#[derive(Clone, Debug, PartialEq)]
pub struct PollItem {
    pub key: String,
    pub fingerprint: String,
    pub item: Value,
}

/// What one successful poll committed.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct PollReport {
    pub project_id: String,
    pub connection_id: String,
    pub operation: String,
    /// Distinct items observed across the fetched pages.
    pub observed: usize,
    /// Items stored as new or changed in the seen state.
    pub changed: usize,
    /// Events appended (zero on a seeding run).
    pub emitted: usize,
    /// True when this run seeded the seen state.
    pub seeded: bool,
    /// Seen items dropped by retention in this run.
    pub pruned: u64,
}

fn hex(bytes: &[u8]) -> String {
    bytes
        .iter()
        .fold(String::with_capacity(bytes.len() * 2), |mut s, b| {
            let _ = write!(s, "{b:02x}");
            s
        })
}

/// Serialize with object keys sorted at every level so the fingerprint does
/// not depend on provider key order.
fn canonical(value: &Value, out: &mut Vec<u8>) -> Result<()> {
    match value {
        Value::Object(map) => {
            out.push(b'{');
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort();
            for (i, k) in keys.into_iter().enumerate() {
                if i > 0 {
                    out.push(b',');
                }
                serde_json::to_writer(&mut *out, k).map_err(|_| Error::InvalidPage)?;
                out.push(b':');
                canonical(&map[k], out)?;
            }
            out.push(b'}');
        }
        Value::Array(items) => {
            out.push(b'[');
            for (i, item) in items.iter().enumerate() {
                if i > 0 {
                    out.push(b',');
                }
                canonical(item, out)?;
            }
            out.push(b']');
        }
        scalar => serde_json::to_writer(&mut *out, scalar).map_err(|_| Error::InvalidPage)?,
    }
    Ok(())
}

fn fingerprint(value: &Value) -> Result<String> {
    let mut bytes = Vec::new();
    canonical(value, &mut bytes)?;
    Ok(hex(&Sha256::digest(&bytes)))
}

fn item_key(item: &Map<String, Value>, field: &str) -> Result<String> {
    let key = match item.get(field) {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Number(n)) if n.is_i64() || n.is_u64() => n.to_string(),
        _ => return Err(Error::InvalidPage),
    };
    if key.is_empty() || key.len() > MAX_ITEM_KEY_BYTES || key.chars().any(char::is_control) {
        return Err(Error::InvalidPage);
    }
    Ok(key)
}

/// Decode one runner page: `{items: [object...], cursor?: string|null}`.
/// Extra top-level fields are ignored. Every item must carry `itemKey`, and
/// `versionKey` when declared (a JSON null version is a valid value).
pub fn decode_poll_page(value: Value, spec: &PollSpec) -> Result<(Vec<PollItem>, String)> {
    #[derive(serde::Deserialize)]
    struct Wire {
        items: Vec<Value>,
        #[serde(default)]
        cursor: Option<String>,
    }
    let wire: Wire = serde_json::from_value(value).map_err(|_| Error::InvalidPage)?;
    let cursor = wire.cursor.unwrap_or_default();
    if wire.items.len() > MAX_POLL_ITEMS_PER_PAGE || cursor.len() > MAX_CURSOR_BYTES {
        return Err(Error::InvalidPage);
    }
    let items = wire
        .items
        .into_iter()
        .map(|item| {
            let object = item.as_object().ok_or(Error::InvalidPage)?;
            let key = item_key(object, &spec.item_key)?;
            let fingerprint = match &spec.version_key {
                Some(version) => fingerprint(object.get(version).ok_or(Error::InvalidPage)?)?,
                None => fingerprint(&item)?,
            };
            Ok(PollItem {
                key,
                fingerprint,
                item,
            })
        })
        .collect::<Result<Vec<_>>>()?;
    Ok((items, cursor))
}

/// Keep the first occurrence of each key; pages can shift between calls.
fn dedup_items(items: Vec<PollItem>) -> Vec<PollItem> {
    let mut seen = BTreeSet::new();
    items
        .into_iter()
        .filter(|item| seen.insert(item.key.clone()))
        .collect()
}

/// Deterministic event dedup key for one observed change. Revisions restart
/// whenever the seen state resets (resubscribe, input change, rebind reseed,
/// retention pruning) while the stored provider key index does not, so the
/// key includes the subscription epoch, which every reset renews from a
/// sequence. A crash replay or lease takeover within one epoch reuses the
/// same key and stays deduplicated.
pub fn poll_event_key(
    epoch: i64,
    generation: i64,
    operation: &str,
    item_key: &str,
    revision: i64,
) -> String {
    let mut h = Sha256::new();
    h.update(epoch.to_be_bytes());
    h.update(generation.to_be_bytes());
    for part in [operation, item_key] {
        h.update((part.len() as u64).to_be_bytes());
        h.update(part);
    }
    h.update(revision.to_be_bytes());
    format!("poll:{}", hex(&h.finalize()))
}

/// Opaque per-page request id: stable for one lease, never leaks identifiers.
fn poll_request_id(claim: &PollClaim, page: u8) -> String {
    let mut h = Sha256::new();
    for part in [&claim.project_id, &claim.connection_id, &claim.operation] {
        h.update((part.len() as u64).to_be_bytes());
        h.update(part);
    }
    let lease_nanos = claim
        .leased_until
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_nanos());
    h.update(lease_nanos.to_be_bytes());
    h.update([page]);
    format!("poll_{}", &hex(&h.finalize())[..32])
}

fn claim_row(row: &postgres::Row) -> PollClaim {
    PollClaim {
        project_id: row.get("project_id"),
        connection_id: row.get("connection_id"),
        connector: row.get("connector"),
        operation: row.get("operation"),
        input: row.get("input"),
        connection_generation: row.get("connection_generation"),
        epoch: row.get("epoch"),
        seeded: row.get("seeded"),
        attempts: u32::try_from(row.get::<_, i32>("attempts")).unwrap_or(0),
        worker_id: row.get("worker_id"),
        leased_until: row.get("leased_until"),
    }
}

/// Lock the claimed row only if this exact lease still owns it and the
/// connection generation is unchanged. The connection row is not locked
/// here: emitting runs lock it in [`lock_emission`], after the per-project
/// event lock, and a rebind that commits during a run that emits nothing is
/// reconciled by the next claim's reseed.
fn lock_claim(tx: &mut Transaction<'_>, claim: &PollClaim) -> Result<()> {
    let row = tx
        .query_opt(
            "SELECT s.connection_generation=c.connection_generation FROM poll_subscriptions s JOIN connections c ON c.id=s.connection_id AND c.project_id=s.project_id WHERE s.project_id=$1 AND s.connection_id=$2 AND s.operation=$3 AND s.worker_id=$4 AND s.leased_until=$5 AND s.leased_until>clock_timestamp() AND s.status='active' AND s.connection_generation=$6 FOR UPDATE OF s",
            &[
                &claim.project_id,
                &claim.connection_id,
                &claim.operation,
                &claim.worker_id,
                &claim.leased_until,
                &claim.connection_generation,
            ],
        )?
        .ok_or(Error::LeaseLost)?;
    if row.get::<_, bool>(0) {
        Ok(())
    } else {
        Err(Error::StaleGeneration)
    }
}

/// Taken once, just before a commit's first event append: the per-project
/// event lock, then the connection row shared, in the same order as webhook
/// acceptance so the two cannot deadlock. The shared row lock holds the
/// generation fixed for the remaining appends.
fn lock_emission(tx: &mut Transaction<'_>, claim: &PollClaim) -> Result<()> {
    tx.query_one(
        "SELECT pg_advisory_xact_lock(hashtextextended($1::text,741))",
        &[&claim.project_id],
    )?;
    let generation: i64 = tx
        .query_opt(
            "SELECT connection_generation FROM connections WHERE project_id=$1 AND id=$2 AND status='active' FOR SHARE",
            &[&claim.project_id, &claim.connection_id],
        )?
        .ok_or(Error::Unavailable)?
        .get(0);
    if generation == claim.connection_generation {
        Ok(())
    } else {
        Err(Error::StaleGeneration)
    }
}

/// Which connection rows a subscription write may target. The default
/// admits any connection of the request's project (trusted callers); API
/// callers narrow it to their account and to the connector whose manifest
/// they validated the request against.
#[derive(Clone, Copy, Debug, Default)]
pub(crate) struct ConnectionFilter<'a> {
    /// Empty for the whole project, else the caller's external account.
    pub(crate) account_id: &'a str,
    pub(crate) connector: Option<&'a str>,
}

/// The connection's generation if the filter admits it; `NotFound` otherwise
/// (never revealing whether the row exists outside the caller's scope).
/// Same account predicate as run controls.
pub(crate) fn scoped_connection<C: GenericClient>(
    db: &mut C,
    project_id: &str,
    connection_id: &str,
    filter: &ConnectionFilter<'_>,
) -> Result<i64> {
    let row = db
        .query_opt(
            "SELECT connection_generation,connector FROM connections WHERE project_id=$1 AND id=$2 AND ($3='' OR (external_account_id=$3 AND credential_owner<>'platform')) FOR SHARE",
            &[&project_id, &connection_id, &filter.account_id],
        )?
        .ok_or(Error::NotFound)?;
    match filter.connector {
        Some(connector) if row.get::<_, &str>(1) != connector => Err(Error::NotFound),
        _ => Ok(row.get(0)),
    }
}

/// Create or refresh one subscription inside `db`'s transaction. Returns
/// whether a new row was created. Idempotent for an unchanged input.
pub(crate) fn subscribe_in<C: GenericClient>(
    db: &mut C,
    request: &PollSubscription,
    filter: &ConnectionFilter<'_>,
) -> Result<bool> {
    request.validate()?;
    let mut tx = db.transaction()?;
    let generation =
        scoped_connection(&mut tx, &request.project_id, &request.connection_id, filter)?;
    let existing = tx.query_opt(
        "SELECT input FROM poll_subscriptions WHERE project_id=$1 AND connection_id=$2 AND operation=$3 FOR UPDATE",
        &[&request.project_id, &request.connection_id, &request.operation],
    )?;
    let created = existing.is_none();
    match existing.map(|row| row.get::<_, Value>(0)) {
        None => {
            tx.execute(
                "INSERT INTO poll_subscriptions(project_id,connection_id,operation,input,connection_generation) VALUES($1,$2,$3,$4,$5)",
                &[&request.project_id, &request.connection_id, &request.operation, &request.input, &generation],
            )?;
        }
        Some(input) if input == request.input => {
            tx.execute(
                "UPDATE poll_subscriptions SET status='active',updated_at=clock_timestamp() WHERE project_id=$1 AND connection_id=$2 AND operation=$3",
                &[&request.project_id, &request.connection_id, &request.operation],
            )?;
        }
        Some(_) => {
            tx.execute(
                "DELETE FROM poll_seen_items WHERE project_id=$1 AND connection_id=$2 AND operation=$3",
                &[&request.project_id, &request.connection_id, &request.operation],
            )?;
            tx.execute(
                "UPDATE poll_subscriptions SET input=$4,connection_generation=$5,epoch=nextval('poll_subscription_epoch'),status='active',seeded=false,attempts=0,last_error='',worker_id='',leased_until=NULL,next_run_at=clock_timestamp(),updated_at=clock_timestamp() WHERE project_id=$1 AND connection_id=$2 AND operation=$3",
                &[&request.project_id, &request.connection_id, &request.operation, &request.input, &generation],
            )?;
        }
    }
    tx.commit()?;
    Ok(created)
}

/// Refresh `last_seen_at` for the observed items (at most hourly per item),
/// then prune unobserved items past the TTL or beyond the cap, most
/// recently observed kept. Any prune renews the epoch: a pruned item that
/// reappears restarts at revision 0 and must not reuse an old event key.
fn prune_seen(
    tx: &mut Transaction<'_>,
    claim: &PollClaim,
    observed: &[String],
    cap: u32,
    ttl_ms: i64,
) -> Result<u64> {
    let scope: [&(dyn postgres::types::ToSql + Sync); 3] =
        [&claim.project_id, &claim.connection_id, &claim.operation];
    tx.execute(
        "UPDATE poll_seen_items SET last_seen_at=clock_timestamp() WHERE project_id=$1 AND connection_id=$2 AND operation=$3 AND item_key=ANY($4) AND last_seen_at<clock_timestamp()-interval '1 hour'",
        &[scope[0], scope[1], scope[2], &observed],
    )?;
    let pruned = tx.execute(
        "DELETE FROM poll_seen_items WHERE project_id=$1 AND connection_id=$2 AND operation=$3 AND NOT item_key=ANY($4) AND (last_seen_at<clock_timestamp()-($5::bigint*interval '1 millisecond') OR item_key IN (SELECT item_key FROM poll_seen_items WHERE project_id=$1 AND connection_id=$2 AND operation=$3 AND NOT item_key=ANY($4) ORDER BY last_seen_at DESC,item_key DESC OFFSET $6))",
        &[scope[0], scope[1], scope[2], &observed, &ttl_ms, &i64::from(cap)],
    )?;
    if pruned > 0 {
        tx.execute(
            "UPDATE poll_subscriptions SET epoch=nextval('poll_subscription_epoch') WHERE project_id=$1 AND connection_id=$2 AND operation=$3",
            &scope,
        )?;
    }
    Ok(pruned)
}

impl Repository {
    /// Create or refresh a subscription. Changing the input resets the seen
    /// state (and any in-flight lease) under a fresh epoch so the next run
    /// seeds again. Refreshing with the same input keeps the seen state.
    pub fn poll_subscribe(&mut self, request: &PollSubscription) -> Result<()> {
        let mut tx = self.client.transaction()?;
        subscribe_in(&mut tx, request, &ConnectionFilter::default())?;
        tx.commit()?;
        Ok(())
    }

    /// Remove a subscription and its seen state. A later subscribe starts
    /// a new epoch.
    pub fn poll_unsubscribe(
        &mut self,
        project_id: &str,
        connection_id: &str,
        operation: &str,
    ) -> Result<bool> {
        Ok(self.client.execute(
            "DELETE FROM poll_subscriptions WHERE project_id=$1 AND connection_id=$2 AND operation=$3",
            &[&project_id, &connection_id, &operation],
        )? == 1)
    }

    /// Lease the most overdue active subscription of an active connection.
    /// A connection rebind since the last run resets its seen state under a
    /// fresh epoch so this run seeds again.
    pub fn poll_claim(&mut self, worker: &str, lease: Duration) -> Result<Option<PollClaim>> {
        if worker.is_empty() || worker.len() > 256 {
            return Err(Error::InvalidInput);
        }
        let lease_ms = i64::try_from(lease.as_millis()).map_err(|_| Error::InvalidInput)?;
        let mut tx = self.client.transaction()?;
        let Some(row) = tx.query_opt(
            "SELECT s.project_id,s.connection_id,s.operation,s.connection_generation,c.connection_generation AS current_generation FROM poll_subscriptions s JOIN connections c ON c.id=s.connection_id AND c.project_id=s.project_id WHERE s.status='active' AND c.status='active' AND s.next_run_at<=clock_timestamp() AND (s.leased_until IS NULL OR s.leased_until<=clock_timestamp()) ORDER BY s.next_run_at,s.project_id,s.connection_id,s.operation FOR UPDATE OF s SKIP LOCKED LIMIT 1",
            &[],
        )?
        else {
            return Ok(None);
        };
        let project_id: String = row.get(0);
        let connection_id: String = row.get(1);
        let operation: String = row.get(2);
        let stored: i64 = row.get(3);
        let current: i64 = row.get(4);
        if stored != current {
            tx.execute(
                "DELETE FROM poll_seen_items WHERE project_id=$1 AND connection_id=$2 AND operation=$3",
                &[&project_id, &connection_id, &operation],
            )?;
            tx.execute(
                "UPDATE poll_subscriptions SET connection_generation=$4,epoch=nextval('poll_subscription_epoch'),seeded=false WHERE project_id=$1 AND connection_id=$2 AND operation=$3",
                &[&project_id, &connection_id, &operation, &current],
            )?;
        }
        let claimed = tx.query_one(
            "WITH leased AS (UPDATE poll_subscriptions SET worker_id=$4,leased_until=clock_timestamp()+($5::bigint*interval '1 millisecond'),updated_at=clock_timestamp() WHERE project_id=$1 AND connection_id=$2 AND operation=$3 RETURNING *) SELECT leased.*,c.connector FROM leased JOIN connections c ON c.id=leased.connection_id AND c.project_id=leased.project_id",
            &[&project_id, &connection_id, &operation, &worker, &lease_ms],
        )?;
        tx.commit()?;
        Ok(Some(claim_row(&claimed)))
    }

    /// Extend a claim's lease by `lease` from now. Fenced like the commit:
    /// only the exact, unexpired lease of an active subscription renews, so
    /// a worker that overran its lease can never take it back from a new
    /// owner. Returns the new lease end; the claim must use it from then on.
    pub fn poll_renew(&mut self, claim: &PollClaim, lease: Duration) -> Result<SystemTime> {
        let lease_ms = i64::try_from(lease.as_millis()).map_err(|_| Error::InvalidInput)?;
        self.client
            .query_opt(
                "UPDATE poll_subscriptions SET leased_until=clock_timestamp()+($6::bigint*interval '1 millisecond'),updated_at=clock_timestamp() WHERE project_id=$1 AND connection_id=$2 AND operation=$3 AND worker_id=$4 AND leased_until=$5 AND leased_until>clock_timestamp() AND status='active' RETURNING leased_until",
                &[
                    &claim.project_id,
                    &claim.connection_id,
                    &claim.operation,
                    &claim.worker_id,
                    &claim.leased_until,
                    &lease_ms,
                ],
            )?
            .map(|row| row.get(0))
            .ok_or(Error::LeaseLost)
    }

    /// Atomically record the diff, append one event per emitted change and
    /// reschedule. Fenced by the claim's lease and generation; on any error
    /// nothing is persisted.
    pub fn poll_commit(
        &mut self,
        claim: &PollClaim,
        spec: &PollSpec,
        items: Vec<PollItem>,
    ) -> Result<PollReport> {
        self.poll_commit_with(claim, spec, items, PollRetention::default())
    }

    /// [`Self::poll_commit`] with explicit seen-item retention.
    pub fn poll_commit_with(
        &mut self,
        claim: &PollClaim,
        spec: &PollSpec,
        items: Vec<PollItem>,
        retention: PollRetention,
    ) -> Result<PollReport> {
        let ttl_ms = i64::try_from(retention.ttl.as_millis()).map_err(|_| Error::InvalidInput)?;
        let items = dedup_items(items);
        let observed: Vec<String> = items.iter().map(|item| item.key.clone()).collect();
        let mut tx = self.client.transaction()?;
        lock_claim(&mut tx, claim)?;
        // The per-project event lock serializes all event appends of the
        // project, so it is taken only once there is an event to append,
        // not across the whole diff. Seeding runs never take it.
        let mut emission_locked = false;
        let mut report = PollReport {
            project_id: claim.project_id.clone(),
            connection_id: claim.connection_id.clone(),
            operation: claim.operation.clone(),
            observed: items.len(),
            seeded: !claim.seeded,
            ..PollReport::default()
        };
        for item in items {
            let prior = tx.query_opt(
                "SELECT fingerprint,revision FROM poll_seen_items WHERE project_id=$1 AND connection_id=$2 AND operation=$3 AND item_key=$4 FOR UPDATE",
                &[&claim.project_id, &claim.connection_id, &claim.operation, &item.key],
            )?;
            let (change, revision) = match prior {
                None => {
                    tx.execute(
                        "INSERT INTO poll_seen_items(project_id,connection_id,operation,item_key,fingerprint) VALUES($1,$2,$3,$4,$5)",
                        &[&claim.project_id, &claim.connection_id, &claim.operation, &item.key, &item.fingerprint],
                    )?;
                    (PollChange::New, 0_i64)
                }
                Some(row) if row.get::<_, String>(0) != item.fingerprint => {
                    let revision = row.get::<_, i64>(1).checked_add(1).ok_or(Error::Storage)?;
                    tx.execute(
                        "UPDATE poll_seen_items SET fingerprint=$5,revision=$6,changed_at=clock_timestamp() WHERE project_id=$1 AND connection_id=$2 AND operation=$3 AND item_key=$4",
                        &[&claim.project_id, &claim.connection_id, &claim.operation, &item.key, &item.fingerprint, &revision],
                    )?;
                    (PollChange::Changed, revision)
                }
                Some(_) => continue,
            };
            report.changed += 1;
            let triggers = spec.triggers(change);
            if !claim.seeded || triggers.is_empty() {
                continue;
            }
            if !emission_locked {
                lock_emission(&mut tx, claim)?;
                emission_locked = true;
            }
            let event = PolledEvent {
                project_id: claim.project_id.clone(),
                connection_id: claim.connection_id.clone(),
                connector: claim.connector.clone(),
                operation: claim.operation.clone(),
                dedup_key: poll_event_key(
                    claim.epoch,
                    claim.connection_generation,
                    &claim.operation,
                    &item.key,
                    revision,
                ),
                payload: json!({
                    "change": change,
                    "itemKey": item.key,
                    "revision": revision,
                    "item": item.item,
                }),
                triggers: triggers.to_vec(),
            };
            match append_polled(&mut tx, &event) {
                Ok(Some(_)) => report.emitted += 1,
                Ok(None) => {}
                Err(appcall_events::Error::NotFound) => return Err(Error::Unavailable),
                Err(appcall_events::Error::Invalid | appcall_events::Error::TooLarge) => {
                    return Err(Error::InvalidPage)
                }
                Err(_) => return Err(Error::Storage),
            }
        }
        report.pruned = prune_seen(&mut tx, claim, &observed, retention.cap, ttl_ms)?;
        let interval_ms = i64::from(spec.interval_seconds) * 1000;
        tx.execute(
            "UPDATE poll_subscriptions SET seeded=true,attempts=0,last_error='',worker_id='',leased_until=NULL,next_run_at=clock_timestamp()+($4::bigint*interval '1 millisecond'),updated_at=clock_timestamp() WHERE project_id=$1 AND connection_id=$2 AND operation=$3",
            &[&claim.project_id, &claim.connection_id, &claim.operation, &interval_ms],
        )?;
        tx.commit()?;
        Ok(report)
    }

    /// Release a claim after a failed poll. `attempt` counts toward backoff;
    /// `pause` stops scheduling until the subscription is refreshed. Matches
    /// the claim's exact lease even after it expired, but never a row another
    /// worker has claimed since (its lease differs).
    pub fn poll_fail(
        &mut self,
        claim: &PollClaim,
        delay: Duration,
        attempt: bool,
        pause: bool,
        cause: &Error,
    ) -> Result<()> {
        let delay_ms = i64::try_from(delay.as_millis()).map_err(|_| Error::InvalidInput)?;
        let code = failure_code(Some(cause));
        let updated = self.client.execute(
            "UPDATE poll_subscriptions SET attempts=CASE WHEN $6 AND attempts<2147483647 THEN attempts+1 ELSE attempts END,status=CASE WHEN $7 THEN 'paused' ELSE status END,last_error=$8,next_run_at=clock_timestamp()+($9::bigint*interval '1 millisecond'),worker_id='',leased_until=NULL,updated_at=clock_timestamp() WHERE project_id=$1 AND connection_id=$2 AND operation=$3 AND worker_id=$4 AND leased_until=$5",
            &[
                &claim.project_id,
                &claim.connection_id,
                &claim.operation,
                &claim.worker_id,
                &claim.leased_until,
                &attempt,
                &pause,
                &code,
                &delay_ms,
            ],
        )?;
        if updated == 1 {
            Ok(())
        } else {
            Err(Error::LeaseLost)
        }
    }
}

impl<C: CredentialResolver> Service<C> {
    /// Subscribe a connection's sync operation to polling. The operation
    /// must declare a manifest `poll` block.
    pub async fn poll_subscribe(&self, request: PollSubscription) -> Result<()> {
        request.validate()?;
        let connector = self
            .connection_connector(&request.project_id, &request.connection_id)
            .await?;
        self.poll_spec(&connector, &request.operation)?;
        self.db(move |r| r.poll_subscribe(&request)).await
    }

    /// Remove a poll subscription and its seen state.
    pub async fn poll_unsubscribe(
        &self,
        project_id: &str,
        connection_id: &str,
        operation: &str,
    ) -> Result<bool> {
        let (p, c, o) = (
            project_id.to_owned(),
            connection_id.to_owned(),
            operation.to_owned(),
        );
        self.db(move |r| r.poll_unsubscribe(&p, &c, &o)).await
    }

    fn poll_spec(&self, connector: &str, operation: &str) -> Result<PollSpec> {
        let op = self
            .registry
            .operation(connector, operation)
            .map_err(|_| Error::UnsupportedModel)?;
        match (&op.poll, op.kind) {
            (Some(spec), OperationKind::Sync) => Ok(spec.clone()),
            _ => Err(Error::UnsupportedModel),
        }
    }

    /// Claim and run at most one due poll. `Ok(None)` means nothing was due.
    pub async fn poll_once(&self, worker: &str) -> Result<Option<PollReport>> {
        let worker_id = worker.to_owned();
        let lease = self.config.lease_duration;
        let Some(mut claim) = self.db(move |r| r.poll_claim(&worker_id, lease)).await? else {
            return Ok(None);
        };
        let result = match self.poll_fetch(&mut claim).await {
            Ok((spec, items)) => match self.poll_renew(&mut claim).await {
                Ok(()) => {
                    let committed = claim.clone();
                    let retention = self.config.poll_retention;
                    self.db(move |r| r.poll_commit_with(&committed, &spec, items, retention))
                        .await
                }
                Err(error) => Err(error),
            },
            Err(error) => Err(error),
        };
        match result {
            Ok(report) => Ok(Some(report)),
            Err(cause) => {
                self.poll_failed(claim, cause.clone()).await?;
                Err(cause)
            }
        }
    }

    /// Renew the claim's lease in place (see [`Repository::poll_renew`]).
    async fn poll_renew(&self, claim: &mut PollClaim) -> Result<()> {
        let held = claim.clone();
        let lease = self.config.lease_duration;
        claim.leased_until = self.db(move |r| r.poll_renew(&held, lease)).await?;
        Ok(())
    }

    async fn poll_failed(&self, claim: PollClaim, cause: Error) -> Result<()> {
        let (attempt, pause, delay) = match &cause {
            // The next claim resets the seen state for the new generation.
            Error::StaleGeneration => (false, false, Duration::ZERO),
            // Configuration no longer admits this poll; stop until refreshed.
            Error::UnsupportedModel | Error::InvalidInput => {
                (true, true, self.config.max_retry_delay)
            }
            Error::Runner {
                retry_after_seconds,
            } => (
                true,
                false,
                self.config
                    .retry_delay(claim.attempts, *retry_after_seconds),
            ),
            // A lost lease is recorded and backed off like any failure:
            // `poll_fail` matches only while no other worker has claimed the
            // row since, so a new owner is never touched.
            Error::LeaseLost
            | Error::InvalidPage
            | Error::Unavailable
            | Error::CursorCycle
            | Error::NotFound
            | Error::Conflict
            | Error::Storage => (true, false, self.config.retry_delay(claim.attempts, None)),
        };
        match self
            .db(move |r| r.poll_fail(&claim, delay, attempt, pause, &cause))
            .await
        {
            Ok(()) | Err(Error::LeaseLost) => Ok(()),
            Err(error) => Err(error),
        }
    }

    /// Fetch up to `maxPages` pages, renewing the lease before every page
    /// after the first so a slow multi-page poll never outlives its lease.
    async fn poll_fetch(&self, claim: &mut PollClaim) -> Result<(PollSpec, Vec<PollItem>)> {
        let spec = self.poll_spec(&claim.connector, &claim.operation)?;
        let mut items = Vec::new();
        let mut cursor = String::new();
        for page in 0..spec.max_pages {
            if page > 0 {
                self.poll_renew(claim).await?;
            }
            let claim = &*claim;
            let (output, connection) = self
                .call_sync(
                    SyncCall {
                        project_id: &claim.project_id,
                        connection_id: &claim.connection_id,
                        connection_generation: claim.connection_generation,
                        operation: &claim.operation,
                        input: &claim.input,
                        cursor: &cursor,
                        leased_until: Some(claim.leased_until),
                        request_id: poll_request_id(claim, page),
                    },
                    |connector, operation| {
                        connector == claim.connector
                            && operation.kind == OperationKind::Sync
                            && operation.poll.is_some()
                    },
                )
                .await?;
            if connection.connector != claim.connector {
                return Err(Error::Unavailable);
            }
            let (page_items, next) = decode_poll_page(output, &spec)?;
            items.extend(page_items);
            if next.is_empty() || next == cursor {
                break;
            }
            cursor = next;
        }
        Ok((spec, items))
    }

    async fn connection_connector(&self, project_id: &str, connection_id: &str) -> Result<String> {
        let (p, c) = (project_id.to_owned(), connection_id.to_owned());
        self.db(move |r| {
            r.client
                .query_opt(
                    "SELECT connector FROM connections WHERE project_id=$1 AND id=$2",
                    &[&p, &c],
                )?
                .map(|row| row.get::<_, String>(0))
                .ok_or(Error::NotFound)
        })
        .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn spec(version: Option<&str>) -> PollSpec {
        serde_json::from_value(json!({
            "intervalSeconds": 60, "itemKey": "id",
            "versionKey": version, "onNew": ["created"], "onChanged": ["updated"]
        }))
        .unwrap()
    }

    #[test]
    fn decode_extracts_keys_and_version_fingerprints() {
        let (items, cursor) = decode_poll_page(
            json!({"items":[{"id":7,"updatedAt":"t1","x":1},{"id":"a","updatedAt":null}],"cursor":"c2","provider":"github"}),
            &spec(Some("updatedAt")),
        )
        .unwrap();
        assert_eq!(cursor, "c2");
        assert_eq!(items[0].key, "7");
        assert_eq!(items[1].key, "a");
        assert_eq!(items[0].fingerprint, fingerprint(&json!("t1")).unwrap());
        assert_eq!(items[1].fingerprint, fingerprint(&Value::Null).unwrap());
        // Only the version decides: other field changes keep the fingerprint.
        let (again, _) = decode_poll_page(
            json!({"items":[{"id":7,"updatedAt":"t1","x":2}]}),
            &spec(Some("updatedAt")),
        )
        .unwrap();
        assert_eq!(again[0].fingerprint, items[0].fingerprint);
    }

    #[test]
    fn whole_item_fingerprint_ignores_key_order_but_not_values() {
        let a = fingerprint(&json!({"b":1,"a":{"y":[1,2],"x":null}})).unwrap();
        let b = fingerprint(&json!({"a":{"x":null,"y":[1,2]},"b":1})).unwrap();
        let c = fingerprint(&json!({"a":{"x":null,"y":[2,1]},"b":1})).unwrap();
        assert_eq!(a, b);
        assert_ne!(a, c);
        assert_eq!(a.len(), 64);
    }

    #[test]
    fn decode_rejects_malformed_pages_without_defaults() {
        let s = spec(Some("updatedAt"));
        for page in [
            json!({}),
            json!({"items":{}}),
            json!({"items":[1]}),
            json!({"items":[{"updatedAt":"t"}]}),
            json!({"items":[{"id":"","updatedAt":"t"}]}),
            json!({"items":[{"id":1.5,"updatedAt":"t"}]}),
            json!({"items":[{"id":true,"updatedAt":"t"}]}),
            json!({"items":[{"id":"a"}]}),
            json!({"items":[],"cursor":7}),
            json!({"items":[],"cursor":"c".repeat(MAX_CURSOR_BYTES + 1)}),
        ] {
            assert_eq!(
                decode_poll_page(page.clone(), &s),
                Err(Error::InvalidPage),
                "{page}"
            );
        }
        assert!(decode_poll_page(json!({"items":[],"cursor":null}), &s).is_ok());
    }

    #[test]
    fn dedup_keeps_first_occurrence() {
        let item = |k: &str, f: &str| PollItem {
            key: k.into(),
            fingerprint: f.into(),
            item: json!({}),
        };
        let out = dedup_items(vec![item("a", "1"), item("b", "2"), item("a", "3")]);
        assert_eq!(out, vec![item("a", "1"), item("b", "2")]);
    }

    #[test]
    fn event_key_is_scoped_by_epoch_generation_operation_item_and_revision() {
        let base = poll_event_key(1, 1, "issues.list", "7", 0);
        assert!(base.starts_with("poll:") && base.len() == 5 + 64);
        assert_eq!(base, poll_event_key(1, 1, "issues.list", "7", 0));
        for other in [
            poll_event_key(2, 1, "issues.list", "7", 0),
            poll_event_key(1, 2, "issues.list", "7", 0),
            poll_event_key(1, 1, "commits.list", "7", 0),
            poll_event_key(1, 1, "issues.list", "8", 0),
            poll_event_key(1, 1, "issues.list", "7", 1),
            // Length prefixes keep part boundaries unambiguous.
            poll_event_key(1, 1, "issues.list7", "", 0),
        ] {
            assert_ne!(base, other);
        }
    }

    #[test]
    fn subscription_input_is_bounded_and_reserves_cursor() {
        let ok = PollSubscription {
            project_id: "p".into(),
            connection_id: "c".into(),
            operation: "issues.list".into(),
            input: json!({"owner":"o","repo":"r"}),
        };
        assert!(ok.validate().is_ok());
        for input in [
            json!([]),
            json!({"cursor":"x"}),
            json!({"x":"x".repeat(MAX_POLL_INPUT_BYTES)}),
        ] {
            assert_eq!(
                PollSubscription {
                    input,
                    ..ok.clone()
                }
                .validate(),
                Err(Error::InvalidInput)
            );
        }
        assert_eq!(
            PollSubscription {
                operation: String::new(),
                ..ok
            }
            .validate(),
            Err(Error::InvalidInput)
        );
    }
}
