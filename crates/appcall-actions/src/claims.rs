//! Bounded inspection and explicit operator reconciliation for action claims.
//!
//! This module only changes durable claim and accounting state. It never owns a
//! runner or provider client. Callers must pass a PostgreSQL transaction to
//! [`reconcile_action_claim`] so the audit, outcome, claim and accounting
//! transition commit or roll back together.

use postgres::{GenericClient, Transaction};
use serde::Serialize;
use std::fmt;

const MAX_PROJECT_ID: usize = 128;
const MAX_ACCOUNT_ID: usize = 128;
const MAX_IDEMPOTENCY_KEY: usize = 128;
const MAX_REQUEST_ID: usize = 128;
const MAX_ACTOR_ID: usize = 128;
const MAX_EVIDENCE_REF: usize = 256;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ClaimErrorCode {
    InvalidInput,
    NotFound,
    RequestMismatch,
    OwnershipUnknown,
    IdentityUnknown,
    ClaimLive,
    NotDispatched,
    AlreadyCompleted,
    ReservationIdentityUnknown,
    ReservationMismatch,
    ReservationConflict,
    ReservationStateConflict,
    StorageUnavailable,
}

impl ClaimErrorCode {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::InvalidInput => "INVALID_ACTION_CLAIM_INPUT",
            Self::NotFound => "ACTION_CLAIM_NOT_FOUND",
            Self::RequestMismatch => "ACTION_CLAIM_REQUEST_MISMATCH",
            Self::OwnershipUnknown => "ACTION_CLAIM_OWNERSHIP_UNKNOWN",
            Self::IdentityUnknown => "ACTION_CLAIM_IDENTITY_UNKNOWN",
            Self::ClaimLive => "ACTION_CLAIM_LIVE",
            Self::NotDispatched => "ACTION_CLAIM_NOT_DISPATCHED",
            Self::AlreadyCompleted => "ACTION_CLAIM_ALREADY_COMPLETED",
            Self::ReservationIdentityUnknown => "ACTION_CLAIM_RESERVATION_IDENTITY_UNKNOWN",
            Self::ReservationMismatch => "ACTION_CLAIM_RESERVATION_MISMATCH",
            Self::ReservationConflict => "ACTION_CLAIM_RESERVATION_CONFLICT",
            Self::ReservationStateConflict => "ACTION_CLAIM_RESERVATION_STATE_CONFLICT",
            Self::StorageUnavailable => "STORAGE_UNAVAILABLE",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ClaimError {
    pub code: ClaimErrorCode,
}

impl ClaimError {
    const fn new(code: ClaimErrorCode) -> Self {
        Self { code }
    }
}

impl fmt::Display for ClaimError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.code.as_str())
    }
}

impl std::error::Error for ClaimError {}

pub type ClaimResult<T> = std::result::Result<T, ClaimError>;

/// Immutable request identity used for both reads and reconciliation.
/// `external_account_id` is the account captured on the claim at admission;
/// it is never looked up again from the mutable connection row.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionClaimScope {
    pub project_id: String,
    pub external_account_id: String,
    pub idempotency_key: String,
    pub expected_request_id: String,
}

impl ActionClaimScope {
    pub fn new(
        project_id: impl Into<String>,
        external_account_id: impl Into<String>,
        idempotency_key: impl Into<String>,
        expected_request_id: impl Into<String>,
    ) -> ClaimResult<Self> {
        let scope = Self {
            project_id: project_id.into(),
            external_account_id: external_account_id.into(),
            idempotency_key: idempotency_key.into(),
            expected_request_id: expected_request_id.into(),
        };
        scope.validate()?;
        Ok(scope)
    }

    fn validate(&self) -> ClaimResult<()> {
        if !bounded_token(&self.project_id, MAX_PROJECT_ID, false)
            || !bounded_token(&self.external_account_id, MAX_ACCOUNT_ID, true)
            || !bounded_token(&self.idempotency_key, MAX_IDEMPOTENCY_KEY, false)
            || !bounded_token(&self.expected_request_id, MAX_REQUEST_ID, false)
        {
            return Err(ClaimError::new(ClaimErrorCode::InvalidInput));
        }
        Ok(())
    }
}

/// The only two operator resolutions supported by this module.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum ClaimResolution {
    ProvenNotDispatched,
    ProviderOutcomeKnown { provider_succeeded: bool },
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ActionClaimReconciliation {
    pub scope: ActionClaimScope,
    pub actor_id: String,
    pub evidence_ref: String,
    pub resolution: ClaimResolution,
}

impl ActionClaimReconciliation {
    pub fn new(
        scope: ActionClaimScope,
        actor_id: impl Into<String>,
        evidence_ref: impl Into<String>,
        resolution: ClaimResolution,
    ) -> ClaimResult<Self> {
        let command = Self {
            scope,
            actor_id: actor_id.into(),
            evidence_ref: evidence_ref.into(),
            resolution,
        };
        command.validate()?;
        Ok(command)
    }

    fn validate(&self) -> ClaimResult<()> {
        self.scope.validate()?;
        if !bounded_token(&self.actor_id, MAX_ACTOR_ID, false)
            || !bounded_token(&self.evidence_ref, MAX_EVIDENCE_REF, false)
        {
            return Err(ClaimError::new(ClaimErrorCode::InvalidInput));
        }
        Ok(())
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionClaimReservationInspection {
    pub id: String,
    pub state: String,
    pub month: String,
    pub expires_at: String,
    pub identity_bound: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionClaimInspection {
    pub project_id: String,
    pub idempotency_key: String,
    pub request_id: String,
    pub connection_id: String,
    pub external_account_id: Option<String>,
    pub connector: String,
    pub action: String,
    pub input_hash: String,
    pub dispatched: bool,
    pub lease_expired: bool,
    pub ownership_proven: bool,
    pub reconciliation_allowed: bool,
    pub leased_until: String,
    pub dispatched_at: Option<String>,
    pub created_at: String,
    pub reservation: Option<ActionClaimReservationInspection>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionClaimReconciliationResult {
    pub audit_id: String,
    pub resolution: ClaimResolution,
    pub reservation_state: Option<String>,
    pub charges_refunded: bool,
    pub usage_recorded: bool,
}

#[derive(Clone, Debug)]
struct ClaimRecord {
    project_id: String,
    idempotency_key: String,
    request_id: String,
    connection_id: String,
    external_account_id: Option<String>,
    connector: String,
    action: String,
    input_hash: String,
    dispatched: bool,
    lease_expired: bool,
    leased_until: String,
    dispatched_at: Option<String>,
    created_at: String,
}

#[derive(Clone, Debug)]
struct ReservationRecord {
    id: String,
    month: String,
    state: String,
    connection_id: String,
    connector: String,
    action: String,
    external_account_id: String,
    idempotency_key: Option<String>,
    request_id: Option<String>,
    input_hash: Option<String>,
    expires_at: String,
}

/// Read one claim and its immutable reservation metadata. No current
/// connection row is joined, so a connection retarget cannot rewrite history.
pub fn inspect_action_claim(
    client: &mut impl GenericClient,
    scope: &ActionClaimScope,
) -> ClaimResult<ActionClaimInspection> {
    scope.validate()?;
    let claim = load_claim(client, scope, false, true)?;
    let terminal = terminal_reconciliation_exists(client, &claim)?;
    let reservation = load_reservation(client, &claim, false)?.map(reservation_inspection);
    let ownership_proven = claim.external_account_id.is_some();
    Ok(ActionClaimInspection {
        project_id: claim.project_id,
        idempotency_key: claim.idempotency_key,
        request_id: claim.request_id,
        connection_id: claim.connection_id,
        external_account_id: claim.external_account_id,
        connector: claim.connector,
        action: claim.action,
        input_hash: claim.input_hash,
        dispatched: claim.dispatched,
        lease_expired: claim.lease_expired,
        ownership_proven,
        reconciliation_allowed: ownership_proven
            && claim.dispatched
            && claim.lease_expired
            && !terminal,
        leased_until: claim.leased_until,
        dispatched_at: claim.dispatched_at,
        created_at: claim.created_at,
        reservation,
    })
}

/// Apply one explicit, audited resolution. The caller must pass a live
/// transaction; accepting `Transaction` here makes partial audit/refund
/// transitions impossible at this domain boundary.
pub fn reconcile_action_claim(
    tx: &mut Transaction<'_>,
    command: &ActionClaimReconciliation,
) -> ClaimResult<ActionClaimReconciliationResult> {
    command.validate()?;
    // Validate the immutable claim identity before taking quota locks. The
    // second load below is the locked recheck after the ordered lock set.
    load_claim(tx, &command.scope, false, true)?;
    let quota_months = lock_reservation_months(tx, &command.scope)?;
    lock_claim_key(tx, &command.scope)?;
    let claim = load_claim(tx, &command.scope, true, true)?;
    if completed_record_exists(tx, &claim)? {
        return Err(ClaimError::new(ClaimErrorCode::AlreadyCompleted));
    }
    if terminal_reconciliation_exists(tx, &claim)? {
        return Err(ClaimError::new(ClaimErrorCode::AlreadyCompleted));
    }
    if !claim.dispatched {
        return Err(ClaimError::new(ClaimErrorCode::NotDispatched));
    }
    if !claim.lease_expired {
        return Err(ClaimError::new(ClaimErrorCode::ClaimLive));
    }
    let reservation = load_reservation(tx, &claim, true)?;
    if let Some(reservation) = reservation.as_ref() {
        // Existing finalizers acquire the quota lock before the action lock.
        // If a reservation was committed after the prelock snapshot, abort
        // rather than acquire the locks in the opposite order.
        if !quota_months.iter().any(|month| month == &reservation.month) {
            return Err(ClaimError::new(ClaimErrorCode::ReservationConflict));
        }
    }

    let (reservation_state, charges_refunded, usage_recorded) = match command.resolution {
        ClaimResolution::ProvenNotDispatched => {
            let (state, refunded) = if let Some(reservation) = reservation.as_ref() {
                if reservation.state == "settled" {
                    return Err(ClaimError::new(ClaimErrorCode::ReservationStateConflict));
                }
                let refunded = refund_reservation_charges(tx, &claim, reservation)?;
                if reservation.state == "pending" || reservation.state == "dispatched" {
                    tx.execute(
                        "UPDATE action_usage_reservations SET state='released', released_at=now() WHERE id=$1 AND project_id=$2 AND state IN ('pending','dispatched')",
                        &[&reservation.id, &claim.project_id],
                    )
                    .map_err(|_| ClaimError::new(ClaimErrorCode::StorageUnavailable))?;
                }
                (Some("released".to_owned()), refunded)
            } else {
                (None, false)
            };
            (state, refunded, false)
        }
        ClaimResolution::ProviderOutcomeKnown { provider_succeeded } => {
            let mut recorded = false;
            let state = if let Some(reservation) = reservation.as_ref() {
                match (provider_succeeded, reservation.state.as_str()) {
                    (true, "pending") => {
                        return Err(ClaimError::new(ClaimErrorCode::ReservationStateConflict))
                    }
                    (true, "released") => {
                        return Err(ClaimError::new(ClaimErrorCode::ReservationStateConflict))
                    }
                    (true, "dispatched" | "settled") => {
                        recorded = write_usage(tx, &claim, reservation)?;
                        if reservation.state == "dispatched" {
                            tx.execute(
                                "UPDATE action_usage_reservations SET state='settled', settled_at=now() WHERE id=$1 AND project_id=$2 AND state='dispatched'",
                                &[&reservation.id, &claim.project_id],
                            )
                            .map_err(|_| ClaimError::new(ClaimErrorCode::StorageUnavailable))?;
                        }
                        Some("settled".to_owned())
                    }
                    (false, "settled") => {
                        return Err(ClaimError::new(ClaimErrorCode::ReservationStateConflict))
                    }
                    (false, "pending" | "dispatched") => {
                        tx.execute(
                            "UPDATE action_usage_reservations SET state='released', released_at=now() WHERE id=$1 AND project_id=$2 AND state IN ('pending','dispatched')",
                            &[&reservation.id, &claim.project_id],
                        )
                        .map_err(|_| ClaimError::new(ClaimErrorCode::StorageUnavailable))?;
                        Some("released".to_owned())
                    }
                    (false, "released") => Some("released".to_owned()),
                    _ => return Err(ClaimError::new(ClaimErrorCode::ReservationStateConflict)),
                }
            } else if provider_succeeded {
                recorded = write_usage_without_reservation(tx, &claim)?;
                Some("settled".to_owned())
            } else {
                None
            };
            (state, false, recorded)
        }
    };

    let audit_id = format!("recon_{}", uuid::Uuid::new_v4().simple());
    insert_audit(tx, &audit_id, &claim, command)?;
    if matches!(command.resolution, ClaimResolution::ProvenNotDispatched) {
        let deleted = tx
            .execute(
                "DELETE FROM action_idempotency_claims WHERE project_id=$1 AND idempotency_key=$2 AND request_id=$3",
                &[&claim.project_id, &claim.idempotency_key, &claim.request_id],
            )
            .map_err(|_| ClaimError::new(ClaimErrorCode::StorageUnavailable))?;
        if deleted != 1 {
            return Err(ClaimError::new(ClaimErrorCode::NotFound));
        }
    }
    Ok(ActionClaimReconciliationResult {
        audit_id,
        resolution: command.resolution,
        reservation_state,
        charges_refunded,
        usage_recorded,
    })
}

fn load_claim<C: GenericClient>(
    client: &mut C,
    scope: &ActionClaimScope,
    lock: bool,
    reject_unknown_owner: bool,
) -> ClaimResult<ClaimRecord> {
    let suffix = if lock { " FOR UPDATE" } else { "" };
    let sql = format!(
        "SELECT project_id,idempotency_key,request_id,connection_id,external_account_id,connector,action,input_hash,dispatched_at IS NOT NULL,leased_until<=now(),to_char(leased_until AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"'),CASE WHEN dispatched_at IS NULL THEN NULL ELSE to_char(dispatched_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') END,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') FROM action_idempotency_claims WHERE project_id=$1 AND idempotency_key=$2{suffix}"
    );
    let row = client
        .query_opt(&sql, &[&scope.project_id, &scope.idempotency_key])
        .map_err(|_| ClaimError::new(ClaimErrorCode::StorageUnavailable))?
        .ok_or_else(|| ClaimError::new(ClaimErrorCode::NotFound))?;
    // Check immutable ownership before request identity so a foreign account
    // cannot turn a guessed request ID into a claim-existence oracle.
    let external_account_id: Option<String> = row.get(4);
    if external_account_id
        .as_deref()
        .is_some_and(|account| account != scope.external_account_id)
    {
        return Err(ClaimError::new(ClaimErrorCode::NotFound));
    }
    if reject_unknown_owner && external_account_id.is_none() {
        return Err(ClaimError::new(ClaimErrorCode::OwnershipUnknown));
    }
    let request_id: String = row.get(2);
    if request_id != scope.expected_request_id {
        return Err(ClaimError::new(ClaimErrorCode::RequestMismatch));
    }
    let connector: Option<String> = row.get(5);
    let connector = connector
        .filter(|connector| !connector.is_empty())
        .ok_or_else(|| ClaimError::new(ClaimErrorCode::IdentityUnknown))?;
    Ok(ClaimRecord {
        project_id: row.get(0),
        idempotency_key: row.get(1),
        request_id,
        connection_id: row.get(3),
        external_account_id,
        connector,
        action: row.get(6),
        input_hash: row.get(7),
        dispatched: row.get(8),
        lease_expired: row.get(9),
        leased_until: row.get(10),
        dispatched_at: row.get(11),
        created_at: row.get(12),
    })
}

fn load_reservation<C: GenericClient>(
    client: &mut C,
    claim: &ClaimRecord,
    lock: bool,
) -> ClaimResult<Option<ReservationRecord>> {
    let suffix = if lock { " FOR UPDATE" } else { "" };
    let sql = format!(
        "SELECT id,month,state,connection_id,connector,action,external_account_id,idempotency_key,request_id,input_hash,to_char(expires_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') FROM action_usage_reservations WHERE project_id=$1 AND idempotency_key=$2 ORDER BY created_at DESC{suffix}"
    );
    let rows = client
        .query(&sql, &[&claim.project_id, &claim.idempotency_key])
        .map_err(|_| ClaimError::new(ClaimErrorCode::StorageUnavailable))?;
    let mut exact = None;
    for row in rows {
        let candidate = ReservationRecord {
            id: row.get(0),
            month: row.get(1),
            state: row.get(2),
            connection_id: row.get(3),
            connector: row.get(4),
            action: row.get(5),
            external_account_id: row.get(6),
            idempotency_key: row.get(7),
            request_id: row.get(8),
            input_hash: row.get(9),
            expires_at: row.get(10),
        };
        let complete = candidate.idempotency_key.is_some()
            && candidate.request_id.is_some()
            && candidate.input_hash.is_some();
        if !complete {
            if matches!(candidate.state.as_str(), "pending" | "dispatched") {
                return Err(ClaimError::new(ClaimErrorCode::ReservationIdentityUnknown));
            }
            // A released/settled legacy row no longer carries capacity that
            // this claim could refund or settle. Ignore it while looking for
            // the current attempt's fully bound reservation.
            continue;
        }
        let matches = candidate.connection_id == claim.connection_id
            && candidate.connector == claim.connector
            && candidate.action == claim.action
            && candidate.external_account_id
                == claim.external_account_id.clone().unwrap_or_default()
            && candidate.idempotency_key.as_deref() == Some(claim.idempotency_key.as_str())
            && candidate.request_id.as_deref() == Some(claim.request_id.as_str())
            && candidate.input_hash.as_deref() == Some(claim.input_hash.as_str());
        if !matches {
            if matches!(candidate.state.as_str(), "pending" | "dispatched") {
                return Err(ClaimError::new(ClaimErrorCode::ReservationMismatch));
            }
            // A prior proven-nondispatch retry may leave a terminal row with
            // the same idempotency key but a different request identity.
            continue;
        }
        if exact.replace(candidate).is_some() {
            return Err(ClaimError::new(ClaimErrorCode::ReservationConflict));
        }
    }
    Ok(exact)
}

fn reservation_inspection(record: ReservationRecord) -> ActionClaimReservationInspection {
    ActionClaimReservationInspection {
        id: record.id,
        state: record.state,
        month: record.month,
        expires_at: record.expires_at,
        identity_bound: record.idempotency_key.is_some()
            && record.request_id.is_some()
            && record.input_hash.is_some(),
    }
}

fn completed_record_exists<C: GenericClient>(
    client: &mut C,
    claim: &ClaimRecord,
) -> ClaimResult<bool> {
    let row = client
        .query_opt(
            "SELECT connection_id,action,input_hash FROM action_idempotency_records WHERE project_id=$1 AND idempotency_key=$2",
            &[&claim.project_id, &claim.idempotency_key],
        )
        .map_err(|_| ClaimError::new(ClaimErrorCode::StorageUnavailable))?;
    let Some(row) = row else { return Ok(false) };
    if row.get::<_, String>(0) != claim.connection_id
        || row.get::<_, String>(1) != claim.action
        || row.get::<_, String>(2) != claim.input_hash
    {
        return Err(ClaimError::new(ClaimErrorCode::ReservationMismatch));
    }
    Ok(true)
}

/// A provider-known audit is the durable terminal tombstone for the
/// idempotency key. The claim remains present in that case, and the acquire
/// path must consult this same row before allowing an expired-lease upsert.
/// Proven-nondispatch audits are intentionally excluded: that branch deletes
/// the claim and is the only resolution that permits a later retry.
fn terminal_reconciliation_exists<C: GenericClient>(
    client: &mut C,
    claim: &ClaimRecord,
) -> ClaimResult<bool> {
    let row = client
        .query_opt(
            "SELECT 1
               FROM action_claim_reconciliation_audits
              WHERE project_id=$1
                AND idempotency_key=$2
                AND resolution='provider_outcome_known'
                AND provider_succeeded IS NOT NULL
              LIMIT 1",
            &[&claim.project_id, &claim.idempotency_key],
        )
        .map_err(|_| ClaimError::new(ClaimErrorCode::StorageUnavailable))?;
    Ok(row.is_some())
}

fn lock_claim_key(tx: &mut Transaction<'_>, scope: &ActionClaimScope) -> ClaimResult<()> {
    let identity = serde_json::to_string(&[&scope.project_id, &scope.idempotency_key])
        .map_err(|_| ClaimError::new(ClaimErrorCode::StorageUnavailable))?;
    tx.query_one(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        &[&identity],
    )
    .map_err(|_| ClaimError::new(ClaimErrorCode::StorageUnavailable))?;
    Ok(())
}

fn lock_reservation_months(
    tx: &mut Transaction<'_>,
    scope: &ActionClaimScope,
) -> ClaimResult<Vec<String>> {
    let months = tx
        .query(
            "SELECT DISTINCT month
               FROM action_usage_reservations
              WHERE project_id=$1 AND idempotency_key=$2
              ORDER BY month",
            &[&scope.project_id, &scope.idempotency_key],
        )
        .map_err(|_| ClaimError::new(ClaimErrorCode::StorageUnavailable))?
        .into_iter()
        .map(|row| row.get::<_, String>(0))
        .collect::<Vec<_>>();
    for month in &months {
        crate::policy_postgres::usage_quota_lock(tx, &scope.project_id, month)
            .map_err(|_| ClaimError::new(ClaimErrorCode::StorageUnavailable))?;
    }
    Ok(months)
}

fn insert_audit(
    tx: &mut Transaction<'_>,
    audit_id: &str,
    claim: &ClaimRecord,
    command: &ActionClaimReconciliation,
) -> ClaimResult<()> {
    let (resolution, provider_succeeded) = match command.resolution {
        ClaimResolution::ProvenNotDispatched => ("proven_not_dispatched", None),
        ClaimResolution::ProviderOutcomeKnown { provider_succeeded } => {
            ("provider_outcome_known", Some(provider_succeeded))
        }
    };
    tx.execute(
        "INSERT INTO action_claim_reconciliation_audits(id,project_id,idempotency_key,request_id,connection_id,external_account_id,connector,action,input_hash,resolution,provider_succeeded,actor_id,evidence_ref) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",
        &[
            &audit_id,
            &claim.project_id,
            &claim.idempotency_key,
            &claim.request_id,
            &claim.connection_id,
            &claim.external_account_id.clone().unwrap_or_default(),
            &claim.connector,
            &claim.action,
            &claim.input_hash,
            &resolution,
            &provider_succeeded,
            &command.actor_id,
            &command.evidence_ref,
        ],
    )
    .map_err(|_| ClaimError::new(ClaimErrorCode::StorageUnavailable))?;
    Ok(())
}

fn refund_reservation_charges(
    tx: &mut Transaction<'_>,
    claim: &ClaimRecord,
    reservation: &ReservationRecord,
) -> ClaimResult<bool> {
    let charges = tx
        .query(
            "SELECT charge_kind,action_class,window_kind,window_key,quantity,spend_micros FROM action_usage_reservation_charges WHERE reservation_id=$1 AND refunded_at IS NULL FOR UPDATE",
            &[&reservation.id],
        )
        .map_err(|_| ClaimError::new(ClaimErrorCode::StorageUnavailable))?;
    let mut refunded = false;
    for row in charges {
        let kind: String = row.get(0);
        let class: String = row.get(1);
        let window_kind: String = row.get(2);
        let window_key: String = row.get(3);
        let quantity: i64 = row.get(4);
        let spend_micros: i64 = row.get(5);
        let count = match kind.as_str() {
            "send" => tx
                .execute(
                    "UPDATE action_send_caps SET send_count=GREATEST(send_count-$4,0),spend_micros=GREATEST(spend_micros-$5,0),updated_at=now() WHERE project_id=$1 AND external_account_id=$2 AND window_key=$3",
                    &[&claim.project_id, &reservation.external_account_id, &window_key, &quantity, &spend_micros],
                )
                .map_err(|_| ClaimError::new(ClaimErrorCode::StorageUnavailable))?,
            "linkedin" => {
                crate::policy_postgres::linkedin_lock(
                    tx,
                    &claim.project_id,
                    &reservation.external_account_id,
                    &class,
                )
                .map_err(|_| ClaimError::new(ClaimErrorCode::StorageUnavailable))?;
                tx.execute(
                    "UPDATE linkedin_action_counters SET count=GREATEST(count-$6,0),updated_at=now() WHERE project_id=$1 AND external_account_id=$2 AND action_class=$3 AND window_kind=$4 AND window_key=$5",
                    &[&claim.project_id, &reservation.external_account_id, &class, &window_kind, &window_key, &quantity],
                )
                .map_err(|_| ClaimError::new(ClaimErrorCode::StorageUnavailable))?
            }
            _ => return Err(ClaimError::new(ClaimErrorCode::ReservationStateConflict)),
        };
        if count != 1 {
            return Err(ClaimError::new(ClaimErrorCode::ReservationStateConflict));
        }
        let marked = tx
            .execute(
                "UPDATE action_usage_reservation_charges SET refunded_at=now() WHERE reservation_id=$1 AND charge_kind=$2 AND action_class=$3 AND window_kind=$4 AND window_key=$5 AND refunded_at IS NULL",
                &[&reservation.id, &kind, &class, &window_kind, &window_key],
            )
            .map_err(|_| ClaimError::new(ClaimErrorCode::StorageUnavailable))?;
        if marked != 1 {
            return Err(ClaimError::new(ClaimErrorCode::ReservationStateConflict));
        }
        refunded = true;
    }
    Ok(refunded)
}

fn write_usage(
    tx: &mut Transaction<'_>,
    claim: &ClaimRecord,
    reservation: &ReservationRecord,
) -> ClaimResult<bool> {
    write_usage_sql(tx, claim, Some((&reservation.id, &reservation.month)))
}

fn write_usage_without_reservation(
    tx: &mut Transaction<'_>,
    claim: &ClaimRecord,
) -> ClaimResult<bool> {
    write_usage_sql(tx, claim, None)
}

fn write_usage_sql(
    tx: &mut Transaction<'_>,
    claim: &ClaimRecord,
    reservation: Option<(&String, &String)>,
) -> ClaimResult<bool> {
    let id = format!("usage_action_{}", claim.request_id);
    let reservation_id = reservation.map(|(id, _)| id.clone());
    let month = reservation.map(|(_, month)| month.clone());
    let row = tx
        .query_opt(
            "WITH inserted AS (INSERT INTO usage_events(id,project_id,connection_id,connector,action,kind,occurred_at,external_account_id,quantity,metering_event_key) VALUES($1,$2,$3,$4,$5,'action_call',COALESCE((SELECT created_at FROM action_usage_reservations WHERE id=$7),now()),$6,1,$1) ON CONFLICT(project_id,metering_event_key) DO NOTHING RETURNING project_id,external_account_id,occurred_at,kind,quantity) INSERT INTO usage_monthly_rollups(project_id,external_account_id,month,kind,quantity) SELECT project_id,COALESCE(external_account_id,''),COALESCE($8::text,to_char(occurred_at AT TIME ZONE 'UTC','YYYY-MM')),kind,quantity FROM inserted ON CONFLICT(project_id,external_account_id,month,kind) DO UPDATE SET quantity=usage_monthly_rollups.quantity+EXCLUDED.quantity,updated_at=now() RETURNING project_id",
            &[
                &id,
                &claim.project_id,
                &claim.connection_id,
                &claim.connector,
                &claim.action,
                &claim.external_account_id.clone().unwrap_or_default(),
                &reservation_id,
                &month,
            ],
        )
        .map_err(|_| ClaimError::new(ClaimErrorCode::StorageUnavailable))?;
    Ok(row.is_some())
}

fn bounded_token(value: &str, max: usize, allow_empty: bool) -> bool {
    (allow_empty || !value.is_empty())
        && value.len() <= max
        && value.bytes().all(|byte| (0x21..=0x7e).contains(&byte))
}
