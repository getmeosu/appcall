use super::state::*;
use appcall_actions::{Acquisition, ActionCatalog, ActionError, ActionRepository, Attempt};
use appcall_connectors::Registry;
use appcall_store::{Connection, LocalProvider, SecretBytes, Status, TestStatus};
use chrono::Utc;
use serde_json::Value;
use std::{
    sync::{Arc, Mutex, MutexGuard},
    time::{Duration, Instant},
};
use zeroize::Zeroizing;
#[derive(Clone)]
pub struct MemoryRepository {
    pub(crate) state: Arc<MemoryState>,
}
impl MemoryRepository {
    pub fn new(
        _: DevelopmentPermit,
        registry: Arc<Registry>,
        limits: MemoryLimits,
    ) -> Result<Self> {
        let limits = limits.validate()?;
        let mut key = Zeroizing::new([0u8; 32]);
        getrandom::fill(&mut *key).map_err(|_| MemoryError::Unavailable)?;
        let vault = LocalProvider::new(&key[..]).map_err(|_| MemoryError::Unavailable)?;
        let mut data = MemoryData::default();
        data.projects.insert(
            "proj_dev".into(),
            MemoryProject {
                id: "proj_dev".into(),
                disabled: false,
                plan: "free".into(),
            },
        );
        Ok(Self {
            state: Arc::new(MemoryState {
                registry,
                limits,
                vault,
                data: Mutex::new(data),
            }),
        })
    }
    pub(crate) fn lock(&self) -> Result<MutexGuard<'_, MemoryData>> {
        self.state.data.lock().map_err(|_| MemoryError::Unavailable)
    }
    pub(crate) fn effect_guard(&self, active: &dyn Fn() -> bool) -> Result<EffectGuard> {
        EffectGuard::acquire(self.state.clone(), active)
    }
    pub fn registry(&self) -> &Arc<Registry> {
        &self.state.registry
    }
    pub fn list_usage_events(
        &self,
        project: &str,
        account: Option<&str>,
    ) -> Result<Vec<UsageEvent>> {
        Ok(self
            .lock()?
            .usage_events
            .values()
            .filter(|event| {
                event.project_id == project
                    && account.is_none_or(|a| a == event.external_account_id)
            })
            .cloned()
            .collect())
    }
    pub fn limits(&self) -> MemoryLimits {
        self.state.limits
    }
    /// Only verified host identities may provision additional development projects.
    pub fn ensure_project(&self, project: &str) -> Result<()> {
        validate_id(project)?;
        let mut d = self.lock()?;
        if d.projects.contains_key(project) {
            return Ok(());
        }
        if d.projects.len() >= self.state.limits.connections {
            return Err(MemoryError::Capacity);
        }
        d.check_capacity(self.state.limits, project.len() + 256, 0)?;
        d.bytes_used += project.len() + 256;
        d.projects.insert(
            project.into(),
            MemoryProject {
                id: project.into(),
                disabled: false,
                plan: "free".into(),
            },
        );
        Ok(())
    }
    pub(crate) fn prepare_secret(
        &self,
        project: &str,
        connection: &str,
        kind: &str,
        plaintext: &[u8],
    ) -> Result<(String, OwnedEnvelope)> {
        validate_id(project)?;
        validate_id(connection)?;
        validate_id(kind)?;
        if plaintext.len() > self.state.limits.payload_bytes {
            return Err(MemoryError::Capacity);
        }
        let envelope = self
            .state
            .vault
            .encrypt(plaintext)
            .map_err(|_| MemoryError::Unavailable)?;
        let bytes = envelope.ciphertext.len()
            + envelope.nonce.len()
            + project.len()
            + connection.len()
            + kind.len()
            + 256;
        Ok((
            format!("sec_{}", uuid::Uuid::new_v4()),
            OwnedEnvelope {
                project_id: project.into(),
                connection_id: connection.into(),
                kind: kind.into(),
                envelope,
                bytes,
            },
        ))
    }
    pub fn create_connection(
        &self,
        c: Connection,
        secret: Option<(&str, &[u8])>,
    ) -> Result<Connection> {
        self.create_connection_checked(c, secret, &|| true)
    }
    pub fn create_connection_checked(
        &self,
        c: Connection,
        secret: Option<(&str, &[u8])>,
        active: &dyn Fn() -> bool,
    ) -> Result<Connection> {
        if !active() {
            return Err(MemoryError::Unavailable);
        }
        let secret = secret
            .map(|(kind, bytes)| self.prepare_secret(&c.project_id, &c.id, kind, bytes))
            .transpose()?;
        let mut d = self.lock()?;
        if !active() {
            return Err(MemoryError::Unavailable);
        }
        self.insert_connection_locked(&mut d, c, secret)
    }
    /// Complete a validated reuse submission whose initial lookup found no row.
    /// The identity recheck and write share one lock; no provider work runs here.
    pub(crate) fn create_or_reuse_connection_checked(
        &self,
        candidate: Connection,
        secret: Option<(&str, &[u8])>,
        active: &dyn Fn() -> bool,
    ) -> Result<Connection> {
        validate_connection(&candidate)?;
        if !active() {
            return Err(MemoryError::Unavailable);
        }
        let mut data = self.lock()?;
        let selected = data
            .connections
            .values()
            .find(|connection| {
                connection.project_id == candidate.project_id
                    && connection.connector == candidate.connector
                    && connection.external_account_id == candidate.external_account_id
            })
            .cloned();
        if selected.as_ref().is_some_and(|connection| {
            connection.auth_type != candidate.auth_type
                || connection.credential_owner != candidate.credential_owner
                || connection.status == Status::Authorizing
        }) {
            return Err(MemoryError::Conflict);
        }
        let mut connection = selected.clone().unwrap_or(candidate);
        connection.status = Status::Active;
        connection.last_test_status = TestStatus::Unknown;
        let prepared = secret
            .map(|(kind, bytes)| {
                self.prepare_secret(&connection.project_id, &connection.id, kind, bytes)
            })
            .transpose()?;
        if !active() {
            return Err(MemoryError::Unavailable);
        }
        if selected.is_some() {
            let revision = *data
                .connection_revision
                .get(&connection.id)
                .ok_or(MemoryError::Unavailable)?;
            let project = connection.project_id.clone();
            let account = connection.external_account_id.clone();
            self.replace_connection_locked(
                &mut data,
                &project,
                Some(&account),
                revision,
                connection,
                prepared,
            )
        } else {
            self.insert_connection_locked(&mut data, connection, prepared)
        }
    }
    pub(crate) fn insert_connection_locked(
        &self,
        d: &mut MemoryData,
        mut c: Connection,
        secret: Option<(String, OwnedEnvelope)>,
    ) -> Result<Connection> {
        validate_connection(&c)?;
        if !d.projects.contains_key(&c.project_id) {
            return Err(MemoryError::NotFound);
        }
        if d.connections.contains_key(&c.id) {
            return Err(MemoryError::Conflict);
        }
        if d.connections.len() >= self.state.limits.connections {
            return Err(MemoryError::Capacity);
        }
        if !c.secret_ref_id.is_empty() {
            return Err(MemoryError::Invalid);
        }
        if let Some((id, e)) = &secret {
            check_envelope(&c, e)?;
            c.secret_ref_id = id.clone();
        }
        let bytes = connection_bytes(&c)? + secret.as_ref().map(|(_, e)| e.bytes).unwrap_or(0);
        d.check_capacity(self.state.limits, bytes, 0)?;
        d.bytes_used += bytes;
        if let Some((id, e)) = secret {
            d.secrets.insert(id, e);
        }
        d.connection_revision.insert(c.id.clone(), 1);
        d.connections.insert(c.id.clone(), c.clone());
        Ok(c)
    }
    pub fn get_connection(
        &self,
        project: &str,
        account: Option<&str>,
        id: &str,
    ) -> Result<(Connection, u64)> {
        let d = self.lock()?;
        let c = scoped(&d, project, account, id)?;
        Ok((
            c.clone(),
            *d.connection_revision
                .get(id)
                .ok_or(MemoryError::Unavailable)?,
        ))
    }
    pub fn list_connections(
        &self,
        project: &str,
        account: Option<&str>,
    ) -> Result<Vec<Connection>> {
        Ok(self
            .lock()?
            .connections
            .values()
            .filter(|c| visible(c, project, account))
            .cloned()
            .collect())
    }
    pub fn replace_connection(
        &self,
        project: &str,
        account: Option<&str>,
        revision: u64,
        c: Connection,
        secret: Option<(&str, &[u8])>,
    ) -> Result<Connection> {
        self.replace_connection_checked(project, account, revision, c, secret, &|| true)
    }
    pub fn replace_connection_checked(
        &self,
        project: &str,
        account: Option<&str>,
        revision: u64,
        c: Connection,
        secret: Option<(&str, &[u8])>,
        active: &dyn Fn() -> bool,
    ) -> Result<Connection> {
        if !active() {
            return Err(MemoryError::Unavailable);
        }
        let secret = secret
            .map(|(kind, bytes)| self.prepare_secret(&c.project_id, &c.id, kind, bytes))
            .transpose()?;
        let mut d = self.lock()?;
        if !active() {
            return Err(MemoryError::Unavailable);
        }
        self.replace_connection_locked(&mut d, project, account, revision, c, secret)
    }
    pub(crate) fn replace_connection_locked(
        &self,
        d: &mut MemoryData,
        project: &str,
        account: Option<&str>,
        revision: u64,
        mut c: Connection,
        secret: Option<(String, OwnedEnvelope)>,
    ) -> Result<Connection> {
        validate_connection(&c)?;
        let old = scoped(d, project, account, &c.id)?.clone();
        if !same_owner(&old, &c)
            || old.auth_type != c.auth_type
            || old.secret_ref_id != c.secret_ref_id
            || d.connection_revision.get(&c.id) != Some(&revision)
        {
            return Err(MemoryError::Conflict);
        }
        let next = revision.checked_add(1).ok_or(MemoryError::Capacity)?;
        if let Some((id, e)) = &secret {
            check_envelope(&c, e)?;
            c.secret_ref_id = id.clone();
        }
        let old_secret = if secret.is_some() {
            d.secrets
                .get(&old.secret_ref_id)
                .map(|e| e.bytes)
                .unwrap_or(0)
        } else {
            0
        };
        let old_bytes = connection_bytes(&old)? + old_secret;
        let new_bytes = connection_bytes(&c)? + secret.as_ref().map(|(_, e)| e.bytes).unwrap_or(0);
        d.check_capacity(self.state.limits, new_bytes.saturating_sub(old_bytes), 0)?;
        d.bytes_used = d
            .bytes_used
            .checked_sub(old_bytes)
            .ok_or(MemoryError::Unavailable)?
            + new_bytes;
        if let Some((id, e)) = secret {
            d.secrets.remove(&old.secret_ref_id);
            d.secrets.insert(id, e);
        }
        d.connection_revision.insert(c.id.clone(), next);
        d.connections.insert(c.id.clone(), c.clone());
        Ok(c)
    }
    pub fn secret(
        &self,
        project: &str,
        connection: &str,
        reference: &str,
    ) -> Result<(String, SecretBytes)> {
        let d = self.lock()?;
        let c = scoped(&d, project, None, connection)?;
        if c.secret_ref_id != reference || reference.is_empty() {
            return Err(MemoryError::NotFound);
        }
        self.decrypt_locked(&d, project, connection, reference)
    }
    pub fn secret_for_connection(
        &self,
        expected: &appcall_actions::Connection,
    ) -> Result<Option<(String, SecretBytes)>> {
        self.secret_for_connection_versioned(expected)
            .map(|(_, secret)| secret)
    }
    pub fn secret_for_connection_versioned(
        &self,
        expected: &appcall_actions::Connection,
    ) -> Result<(u64, Option<(String, SecretBytes)>)> {
        self.credential_snapshot(None, expected)
    }
    fn credential_snapshot(
        &self,
        attempt: Option<&Attempt>,
        expected: &appcall_actions::Connection,
    ) -> Result<(u64, Option<(String, SecretBytes)>)> {
        let d = self.lock()?;
        let c = scoped(&d, &expected.project_id, None, &expected.id)?;
        if action_connection(c) != *expected {
            return Err(MemoryError::Conflict);
        }
        let revision = *d
            .connection_revision
            .get(&c.id)
            .ok_or(MemoryError::Unavailable)?;
        if let Some(attempt) = attempt {
            let claim = checked_claim(&d, attempt, ClaimPhase::Pending)
                .map_err(|_| MemoryError::Conflict)?;
            if claim.revision != revision
                || claim.expires_at <= Instant::now()
                || attempt.connection_id != expected.id
                || attempt.project_id != expected.project_id
            {
                return Err(MemoryError::Conflict);
            }
        }
        let secret = if c.secret_ref_id.is_empty() {
            None
        } else {
            Some(self.decrypt_locked(&d, &c.project_id, &c.id, &c.secret_ref_id)?)
        };
        Ok((revision, secret))
    }
    pub(crate) fn secret_for_attempt(
        &self,
        attempt: &Attempt,
        expected: &appcall_actions::Connection,
    ) -> Result<(u64, Option<(String, SecretBytes)>)> {
        self.credential_snapshot(Some(attempt), expected)
    }
    /// Bind credential provenance captured at resolution to this exact pending owner.
    pub fn bind_resolved_revision(
        &self,
        a: &Attempt,
        expected: &appcall_actions::Connection,
        revision: u64,
    ) -> appcall_actions::Result<()> {
        let mut d = self.lock().map_err(action_error)?;
        let claim = checked_claim(&d, a, ClaimPhase::Pending)?;
        let current = scoped(&d, &a.project_id, None, &a.connection_id).map_err(action_error)?;
        if claim.expires_at <= Instant::now()
            || action_connection(current) != *expected
            || current.status != appcall_store::Status::Active
            || d.connection_revision.get(&a.connection_id) != Some(&revision)
        {
            return Err(ActionError::new("CONNECTION_CHANGED"));
        }
        d.action_claims
            .get_mut(&key(a))
            .expect("checked claim")
            .revision = revision;
        Ok(())
    }
    pub(crate) fn decrypt_locked(
        &self,
        d: &MemoryData,
        project: &str,
        connection: &str,
        reference: &str,
    ) -> Result<(String, SecretBytes)> {
        let e = d
            .secrets
            .get(reference)
            .filter(|e| e.project_id == project && e.connection_id == connection)
            .ok_or(MemoryError::NotFound)?;
        Ok((
            e.kind.clone(),
            self.state
                .vault
                .decrypt(&e.envelope)
                .map_err(|_| MemoryError::Unavailable)?,
        ))
    }
}
fn validate_id(s: &str) -> Result<()> {
    if s.is_empty() || s.len() > 256 || s.chars().any(char::is_control) {
        Err(MemoryError::Invalid)
    } else {
        Ok(())
    }
}
fn validate_connection(c: &Connection) -> Result<()> {
    for s in [&c.id, &c.project_id, &c.connector] {
        validate_id(s)?
    }
    if c.external_account_id.len() > 256 || c.external_account_id.chars().any(char::is_control) {
        return Err(MemoryError::Invalid);
    }
    Ok(())
}
fn visible(c: &Connection, p: &str, a: Option<&str>) -> bool {
    c.project_id == p && a.is_none_or(|a| c.external_account_id == a)
}
fn scoped<'a>(d: &'a MemoryData, p: &str, a: Option<&str>, id: &str) -> Result<&'a Connection> {
    d.connections
        .get(id)
        .filter(|c| visible(c, p, a))
        .ok_or(MemoryError::NotFound)
}
fn same_owner(a: &Connection, b: &Connection) -> bool {
    a.project_id == b.project_id
        && a.external_account_id == b.external_account_id
        && a.connector == b.connector
        && a.credential_owner == b.credential_owner
}
fn check_envelope(c: &Connection, e: &OwnedEnvelope) -> Result<()> {
    if c.project_id != e.project_id || c.id != e.connection_id {
        return Err(MemoryError::Forbidden);
    }
    Ok(())
}
fn connection_bytes(c: &Connection) -> Result<usize> {
    serde_json::to_vec(c)
        .map(|b| b.len() + 256)
        .map_err(|_| MemoryError::Invalid)
}
pub fn action_connection(c: &Connection) -> appcall_actions::Connection {
    appcall_actions::Connection {
        id: c.id.clone(),
        project_id: c.project_id.clone(),
        external_account_id: c.external_account_id.clone(),
        connector: c.connector.clone(),
        status: c.status.as_str().into(),
        auth_type: c.auth_type.as_str().into(),
        secret_ref_id: (!c.secret_ref_id.is_empty()).then(|| c.secret_ref_id.clone()),
    }
}
pub(crate) fn action_error(e: MemoryError) -> ActionError {
    ActionError::new(match e {
        MemoryError::Capacity => "MEMORY_CAPACITY_EXCEEDED",
        MemoryError::NotFound => "CONNECTION_NOT_FOUND",
        MemoryError::Conflict => "CONNECTION_CHANGED",
        MemoryError::Invalid => "INVALID_ACTION_INPUT",
        MemoryError::Forbidden => "FORBIDDEN",
        MemoryError::Unavailable => "STORAGE_UNAVAILABLE",
    })
}
fn key(a: &Attempt) -> (String, String) {
    (
        a.project_id.clone(),
        if a.key.is_empty() {
            format!("request:{}", a.request_id)
        } else {
            format!("key:{}", a.key)
        },
    )
}
fn matching(a: &Attempt, b: &Attempt) -> bool {
    a.project_id == b.project_id
        && a.connection_id == b.connection_id
        && a.connector == b.connector
        && a.action == b.action
        && a.input_hash == b.input_hash
        && a.external_account_id == b.external_account_id
}
fn owned<'a>(d: &'a MemoryData, a: &Attempt) -> appcall_actions::Result<&'a ActionClaim> {
    d.action_claims
        .get(&key(a))
        .filter(|c| matching(&c.attempt, a) && c.attempt.request_id == a.request_id)
        .ok_or_else(|| ActionError::new("IDEMPOTENCY_IN_PROGRESS"))
}
fn checked_claim<'a>(
    d: &'a MemoryData,
    a: &Attempt,
    phase: ClaimPhase,
) -> appcall_actions::Result<&'a ActionClaim> {
    let c = owned(d, a)?;
    if c.phase != phase {
        return Err(ActionError::new("IDEMPOTENCY_IN_PROGRESS"));
    }
    Ok(c)
}
impl ActionRepository for MemoryRepository {
    async fn connection(
        &self,
        p: &str,
        id: &str,
    ) -> appcall_actions::Result<appcall_actions::Connection> {
        self.get_connection(p, None, id)
            .map(|(c, _)| action_connection(&c))
            .map_err(action_error)
    }
    async fn acquire(&self, a: &Attempt) -> appcall_actions::Result<Acquisition> {
        for s in [
            &a.request_id,
            &a.project_id,
            &a.connection_id,
            &a.connector,
            &a.action,
            &a.input_hash,
        ] {
            validate_id(s).map_err(action_error)?
        }
        if a.key.len() > 128
            || a.external_account_id.len() > 256
            || a.lease_ms <= 0
            || a.lease_ms > 330000
        {
            return Err(ActionError::new("INVALID_ACTION_INPUT"));
        }
        let op = ActionCatalog::operation(self.state.registry.as_ref(), &a.connector, &a.action)?;
        let reserved = op
            .max_input_bytes
            .checked_mul(2)
            .and_then(|n| n.checked_add(op.max_response_bytes))
            .and_then(|n| n.checked_add(16384))
            .ok_or_else(|| action_error(MemoryError::Capacity))?;
        let now = Instant::now();
        let expiry = now
            .checked_add(Duration::from_millis(a.lease_ms as u64))
            .ok_or_else(|| action_error(MemoryError::Invalid))?;
        let mut d = self.lock().map_err(action_error)?;
        if d.projects.get(&a.project_id).is_none_or(|p| p.disabled) {
            return Err(ActionError::new("PROJECT_DISABLED"));
        }
        let connection = scoped(&d, &a.project_id, None, &a.connection_id)
            .map_err(action_error)?
            .clone();
        if connection.connector != a.connector
            || (!connection.external_account_id.is_empty()
                && connection.external_account_id != a.external_account_id)
        {
            return Err(ActionError::new("CONNECTION_NOT_FOUND"));
        }
        if let Some(c) = d.action_claims.get(&key(a)) {
            if !matching(&c.attempt, a) {
                return Err(ActionError::new("IDEMPOTENCY_CONFLICT"));
            }
            if c.phase == ClaimPhase::Completed {
                return Ok(Acquisition::Cached(
                    c.output
                        .clone()
                        .ok_or_else(|| action_error(MemoryError::Unavailable))?,
                ));
            }
            if c.phase != ClaimPhase::Pending || c.expires_at > now {
                return Err(ActionError::new("IDEMPOTENCY_IN_PROGRESS"));
            }
        }
        if d.action_claims
            .values()
            .any(|claim| claim.attempt.request_id == a.request_id)
        {
            return Err(ActionError::new("IDEMPOTENCY_CONFLICT"));
        }
        // Only never-dispatched expired work can release admission and history reservations.
        let expired: Vec<_> = d
            .action_claims
            .iter()
            .filter(|(_, c)| c.phase == ClaimPhase::Pending && c.expires_at <= now)
            .map(|(k, _)| k.clone())
            .collect();
        for k in expired {
            remove_pending(&mut d, &k);
        }
        if d.pending_actions >= self.state.limits.concurrent_effects {
            return Err(action_error(MemoryError::Capacity));
        }
        d.check_capacity(self.state.limits, reserved, 4)
            .map_err(action_error)?;
        let revision = *d
            .connection_revision
            .get(&a.connection_id)
            .ok_or_else(|| action_error(MemoryError::Unavailable))?;
        d.bytes_reserved += reserved;
        d.histories_reserved += 3;
        d.pending_actions += 1;
        d.action_claims.insert(
            key(a),
            ActionClaim {
                attempt: a.clone(),
                phase: ClaimPhase::Pending,
                expires_at: expiry,
                output: None,
                revision,
                reserved_bytes: reserved,
                reserved_histories: 3,
                retained_bytes: 0,
            },
        );
        Ok(Acquisition::Acquired)
    }
    async fn mark_dispatched(&self, a: &Attempt) -> appcall_actions::Result<()> {
        let c = self.connection(&a.project_id, &a.connection_id).await?;
        self.mark_dispatched_checked(a, &c).await
    }
    async fn mark_dispatched_checked(
        &self,
        a: &Attempt,
        expected: &appcall_actions::Connection,
    ) -> appcall_actions::Result<()> {
        let mut d = self.lock().map_err(action_error)?;
        let claim = checked_claim(&d, a, ClaimPhase::Pending)?;
        if claim.expires_at <= Instant::now() {
            return Err(ActionError::new("IDEMPOTENCY_IN_PROGRESS"));
        }
        let current = scoped(&d, &a.project_id, None, &a.connection_id).map_err(action_error)?;
        if action_connection(current) != *expected
            || current.status != appcall_store::Status::Active
            || d.connection_revision.get(&a.connection_id) != Some(&claim.revision)
        {
            return Err(ActionError::new("CONNECTION_CHANGED"));
        }
        if d.active_effects >= self.state.limits.concurrent_effects {
            return Err(action_error(MemoryError::Capacity));
        }
        super::usage::reserve_usage(&mut d, a)?;
        d.action_claims
            .get_mut(&key(a))
            .expect("checked claim")
            .phase = ClaimPhase::Dispatched;
        d.pending_actions -= 1;
        d.active_effects += 1;
        Ok(())
    }
    async fn prepare_replay(&self, a: &Attempt, input: &Value) -> appcall_actions::Result<()> {
        let op = ActionCatalog::operation(self.state.registry.as_ref(), &a.connector, &a.action)?;
        let bytes = serde_json::to_vec(input)
            .map_err(|_| action_error(MemoryError::Invalid))?
            .len();
        let needed = bytes
            .checked_add(op.max_response_bytes)
            .and_then(|n| n.checked_add(12288))
            .ok_or_else(|| action_error(MemoryError::Capacity))?;
        let mut d = self.lock().map_err(action_error)?;
        let claim = checked_claim(&d, a, ClaimPhase::Pending)?;
        let extra = needed.saturating_sub(claim.reserved_bytes);
        d.check_capacity(self.state.limits, extra, 0)
            .map_err(action_error)?;
        d.action_claims
            .get_mut(&key(a))
            .expect("checked claim")
            .reserved_bytes += extra;
        d.bytes_reserved += extra;
        Ok(())
    }
    async fn record_replay(&self, a: &Attempt, input: &Value) -> appcall_actions::Result<String> {
        let mut d = self.lock().map_err(action_error)?;
        let claim = checked_claim(&d, a, ClaimPhase::Dispatched)?;
        let id = format!("replay_{}", a.request_id);
        if let Some(old) = d.replay_logs.get(&id) {
            if old.attempt.request_id == a.request_id
                && matching(&old.attempt, a)
                && old.sanitized_input == *input
            {
                return Ok(id);
            }
            return Err(ActionError::new("IDEMPOTENCY_CONFLICT"));
        }
        let bytes = serde_json::to_vec(input)
            .map_err(|_| action_error(MemoryError::Invalid))?
            .len()
            + 4096;
        if bytes > claim.reserved_bytes || claim.reserved_histories == 0 {
            return Err(action_error(MemoryError::Capacity));
        }
        consume(&mut d, a, bytes, 1);
        d.replay_logs.insert(
            id.clone(),
            ReplayLog {
                id: id.clone(),
                attempt: a.clone(),
                sanitized_input: input.clone(),
                created_at: Utc::now(),
            },
        );
        Ok(id)
    }
    async fn release_pending(&self, a: &Attempt) -> appcall_actions::Result<()> {
        let mut d = self.lock().map_err(action_error)?;
        if let Ok(c) = owned(&d, a) {
            if c.phase == ClaimPhase::Pending {
                remove_pending(&mut d, &key(a));
            }
        }
        Ok(())
    }
    async fn release_not_dispatched_with_reservation(
        &self,
        a: &Attempt,
        _: &appcall_actions::PolicyReservation,
    ) -> appcall_actions::Result<()> {
        let mut d = self.lock().map_err(action_error)?;
        let phase = owned(&d, a).ok().map(|claim| claim.phase);
        match phase {
            Some(ClaimPhase::Pending) => remove_pending(&mut d, &key(a)),
            Some(ClaimPhase::Dispatched) => clear_dispatched(&mut d, a)?,
            Some(ClaimPhase::Completed | ClaimPhase::OutcomeUnknown) | None => {}
        }
        Ok(())
    }
    async fn finish_not_dispatched_with_reservation(
        &self,
        a: &Attempt,
        _: &appcall_actions::PolicyReservation,
        error: &str,
    ) -> appcall_actions::Result<()> {
        if error.len() > 128
            || !error
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'_')
        {
            return Err(ActionError::new("INVALID_ACTION_INPUT"));
        }
        let mut d = self.lock().map_err(action_error)?;
        let claim = checked_claim(&d, a, ClaimPhase::Dispatched)?;
        if claim.reserved_bytes < 8192 || claim.reserved_histories < 1 {
            return Err(action_error(MemoryError::Capacity));
        }
        clear_dispatched(&mut d, a)?;
        d.bytes_used = d
            .bytes_used
            .checked_add(8192)
            .ok_or_else(|| action_error(MemoryError::Capacity))?;
        d.action_logs.insert(
            format!("alog_{}", a.request_id),
            ActionLog {
                attempt: a.clone(),
                status: "failed".into(),
                error_code: error.into(),
                created_at: Utc::now(),
            },
        );
        Ok(())
    }
    async fn finish_read_failure_with_reservation(
        &self,
        a: &Attempt,
        _: &appcall_actions::PolicyReservation,
        error: &str,
    ) -> appcall_actions::Result<()> {
        validate_error_code(error)?;
        let mut d = self.lock().map_err(action_error)?;
        let claim = checked_claim(&d, a, ClaimPhase::Dispatched)?;
        validate_failure_retention(claim)?;
        if d.bytes_used.checked_add(8192).is_none() {
            return Err(action_error(MemoryError::Capacity));
        }
        settle_dispatched(&mut d, a, false)?;
        record_failure(&mut d, a, error);
        Ok(())
    }
    async fn finish_read_timeout(
        &self,
        a: &Attempt,
        outcome: appcall_actions::ActionDispatchOutcome,
    ) -> appcall_actions::Result<()> {
        let mut d = self.lock().map_err(action_error)?;
        let Some(phase) = owned(&d, a).ok().map(|claim| claim.phase) else {
            return Ok(());
        };
        if d.bytes_used.checked_add(8192).is_none() {
            return Err(action_error(MemoryError::Capacity));
        }
        match phase {
            ClaimPhase::Pending => {
                let claim = checked_claim(&d, a, ClaimPhase::Pending)?;
                validate_failure_retention(claim)?;
                remove_pending(&mut d, &key(a));
            }
            ClaimPhase::Dispatched => {
                let claim = checked_claim(&d, a, ClaimPhase::Dispatched)?;
                validate_failure_retention(claim)?;
                settle_dispatched(
                    &mut d,
                    a,
                    outcome != appcall_actions::ActionDispatchOutcome::NotDispatched,
                )?;
            }
            ClaimPhase::Completed | ClaimPhase::OutcomeUnknown => return Ok(()),
        }
        record_failure(&mut d, a, "ACTION_TIMEOUT");
        Ok(())
    }
    async fn finish(
        &self,
        a: &Attempt,
        output: Option<&Value>,
        error: Option<&str>,
    ) -> appcall_actions::Result<()> {
        if error.is_some_and(|e| {
            e.len() > 128 || !e.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_')
        }) {
            return Err(ActionError::new("INVALID_ACTION_INPUT"));
        }
        let bytes = output
            .map(serde_json::to_vec)
            .transpose()
            .map_err(|_| action_error(MemoryError::Invalid))?
            .map_or(0, |v| v.len())
            + 8192;
        let mut d = self.lock().map_err(action_error)?;
        let c = checked_claim(&d, a, ClaimPhase::Dispatched)?;
        if bytes > c.reserved_bytes || c.reserved_histories < if output.is_some() { 2 } else { 1 } {
            return Err(action_error(MemoryError::Capacity));
        }
        super::usage::complete_usage(&mut d, a, output.is_some())?;
        let claim = d.action_claims.get_mut(&key(a)).expect("checked claim");
        let reserved_bytes = claim.reserved_bytes;
        let reserved_histories = claim.reserved_histories;
        claim.reserved_bytes = 0;
        claim.reserved_histories = 0;
        claim.retained_bytes += bytes;
        claim.phase = if output.is_some() {
            ClaimPhase::Completed
        } else {
            ClaimPhase::OutcomeUnknown
        };
        claim.output = output.cloned();
        d.bytes_reserved -= reserved_bytes;
        d.histories_reserved -= reserved_histories;
        d.bytes_used += bytes;
        d.active_effects -= 1;
        d.action_logs.insert(
            format!("alog_{}", a.request_id),
            ActionLog {
                attempt: a.clone(),
                status: if output.is_some() {
                    "succeeded"
                } else {
                    "failed"
                }
                .into(),
                error_code: error.unwrap_or("").into(),
                created_at: Utc::now(),
            },
        );
        Ok(())
    }
}
fn validate_error_code(error: &str) -> appcall_actions::Result<()> {
    if error.len() > 128
        || !error
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_')
    {
        Err(ActionError::new("INVALID_ACTION_INPUT"))
    } else {
        Ok(())
    }
}
fn validate_failure_retention(claim: &ActionClaim) -> appcall_actions::Result<()> {
    if claim.reserved_bytes < 8192 || claim.reserved_histories < 1 {
        Err(action_error(MemoryError::Capacity))
    } else {
        Ok(())
    }
}
fn settle_dispatched(
    d: &mut MemoryData,
    a: &Attempt,
    success: bool,
) -> appcall_actions::Result<()> {
    let claim = checked_claim(d, a, ClaimPhase::Dispatched)?;
    if d.active_effects == 0
        || d.bytes_reserved < claim.reserved_bytes
        || d.histories_reserved < claim.reserved_histories
    {
        return Err(action_error(MemoryError::Unavailable));
    }
    super::usage::complete_usage(d, a, success)?;
    let claim = d
        .action_claims
        .remove(&key(a))
        .expect("checked dispatched claim");
    d.bytes_reserved -= claim.reserved_bytes;
    d.histories_reserved -= claim.reserved_histories;
    d.active_effects -= 1;
    Ok(())
}
fn record_failure(d: &mut MemoryData, a: &Attempt, error: &str) {
    d.bytes_used += 8192;
    d.action_logs.insert(
        format!("alog_{}", a.request_id),
        ActionLog {
            attempt: a.clone(),
            status: "failed".into(),
            error_code: error.into(),
            created_at: Utc::now(),
        },
    );
}
fn consume(d: &mut MemoryData, a: &Attempt, bytes: usize, history: usize) {
    let c = d.action_claims.get_mut(&key(a)).expect("checked claim");
    c.reserved_bytes -= bytes;
    c.reserved_histories -= history;
    c.retained_bytes += bytes;
    d.bytes_reserved -= bytes;
    d.bytes_used += bytes;
    d.histories_reserved -= history;
}
fn remove_pending(d: &mut MemoryData, k: &(String, String)) {
    if let Some(c) = d.action_claims.remove(k) {
        d.bytes_reserved -= c.reserved_bytes;
        d.histories_reserved -= c.reserved_histories;
        d.pending_actions -= 1;
    }
}
fn clear_dispatched(d: &mut MemoryData, a: &Attempt) -> appcall_actions::Result<()> {
    let claim = checked_claim(d, a, ClaimPhase::Dispatched)?;
    let has_usage_reservation = d
        .usage_reserved
        .get(&a.request_id)
        .filter(|reservation| {
            reservation.project == a.project_id && reservation.brand == a.external_account_id
        })
        .is_some();
    if !has_usage_reservation {
        return Err(action_error(MemoryError::Unavailable));
    }
    if d.active_effects == 0
        || d.bytes_reserved < claim.reserved_bytes
        || d.histories_reserved < claim.reserved_histories
    {
        return Err(action_error(MemoryError::Unavailable));
    }
    let claim = d
        .action_claims
        .remove(&key(a))
        .expect("checked dispatched claim");
    d.usage_reserved.remove(&a.request_id);
    d.bytes_reserved -= claim.reserved_bytes;
    d.histories_reserved -= claim.reserved_histories;
    d.active_effects -= 1;
    Ok(())
}
