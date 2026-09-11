use crate::{McpRequestContext, Scope};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Mutex,
};
use std::time::{Duration, Instant};

pub const MCP_SESSION_ID_HEADER: &str = "Mcp-Session-Id";
pub const MAX_MCP_SESSION_ID_BYTES: usize = 128;
pub(crate) const MAX_MCP_SESSIONS: usize = 1024;
pub(crate) const MAX_MCP_SESSIONS_PER_PRINCIPAL: usize = 16;

const AUTHENTICATION_CONTEXT_HEADERS: &[&str] = &[
    "authorization",
    "x-api-key",
    "x-external-account-id",
    "x-tenant-id",
];
const SESSION_RANDOM_BYTES: usize = 32;
const SESSION_GENERATION_ATTEMPTS: usize = 8;
const SESSION_TTL: Duration = Duration::from_secs(30 * 60);

#[derive(Clone, Eq, PartialEq)]
pub(crate) struct SessionBinding {
    project_id: String,
    account_id: String,
    profile: String,
    auth_context_fingerprint: String,
}
impl SessionBinding {
    pub(crate) fn from_scope(scope: &Scope, context: &McpRequestContext) -> Self {
        Self {
            project_id: scope.project_id.clone(),
            account_id: scope.account_id.clone(),
            profile: scope.profile.clone(),
            auth_context_fingerprint: context.auth_context_fingerprint().to_owned(),
        }
    }
    fn same_principal(&self, other: &Self) -> bool {
        self.project_id == other.project_id
            && self.account_id == other.account_id
            && self.auth_context_fingerprint == other.auth_context_fingerprint
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum SessionError {
    Capacity,
    Quota,
    Invalid,
    Unknown,
    Mismatch,
    Unavailable,
}

pub(crate) struct SessionRegistry {
    entries: Mutex<BTreeMap<String, SessionEntry>>,
    capacity: usize,
    principal_quota: usize,
    ttl: Duration,
}
struct SessionEntry {
    binding: SessionBinding,
    last_used: Instant,
}
impl SessionRegistry {
    pub(crate) fn new(capacity: usize) -> Self {
        Self::new_with_limits(capacity, MAX_MCP_SESSIONS_PER_PRINCIPAL, SESSION_TTL)
    }

    fn new_with_limits(capacity: usize, principal_quota: usize, ttl: Duration) -> Self {
        Self {
            entries: Mutex::new(BTreeMap::new()),
            capacity,
            principal_quota,
            ttl,
        }
    }

    pub(crate) fn issue(&self, binding: SessionBinding) -> Result<String, SessionError> {
        self.issue_at(binding, Instant::now())
    }

    fn issue_at(&self, binding: SessionBinding, now: Instant) -> Result<String, SessionError> {
        let mut entries = self.lock();
        self.reclaim_expired(&mut entries, now);
        if entries.len() >= self.capacity {
            return Err(SessionError::Capacity);
        }
        if entries
            .values()
            .filter(|entry| entry.binding.same_principal(&binding))
            .count()
            >= self.principal_quota
        {
            return Err(SessionError::Quota);
        }
        for _ in 0..SESSION_GENERATION_ATTEMPTS {
            let mut bytes = [0u8; SESSION_RANDOM_BYTES];
            getrandom::fill(&mut bytes).map_err(|_| SessionError::Unavailable)?;
            let session_id = URL_SAFE_NO_PAD.encode(bytes);
            if let std::collections::btree_map::Entry::Vacant(entry) =
                entries.entry(session_key(&session_id))
            {
                entry.insert(SessionEntry {
                    binding,
                    last_used: now,
                });
                return Ok(session_id);
            }
        }
        Err(SessionError::Unavailable)
    }

    pub(crate) fn validate(
        &self,
        session_id: &str,
        binding: &SessionBinding,
    ) -> Result<(), SessionError> {
        self.validate_at(session_id, binding, Instant::now())
    }

    fn validate_at(
        &self,
        session_id: &str,
        binding: &SessionBinding,
        now: Instant,
    ) -> Result<(), SessionError> {
        if !valid_session_id(session_id) {
            return Err(SessionError::Invalid);
        }
        let mut entries = self.lock();
        self.reclaim_expired(&mut entries, now);
        match entries.get_mut(&session_key(session_id)) {
            Some(existing) if existing.binding == *binding => {
                existing.last_used = now;
                Ok(())
            }
            Some(_) => Err(SessionError::Mismatch),
            None => Err(SessionError::Unknown),
        }
    }

    pub(crate) fn close(
        &self,
        session_id: &str,
        binding: &SessionBinding,
    ) -> Result<(), SessionError> {
        self.close_at(session_id, binding, Instant::now())
    }

    fn close_at(
        &self,
        session_id: &str,
        binding: &SessionBinding,
        now: Instant,
    ) -> Result<(), SessionError> {
        if !valid_session_id(session_id) {
            return Err(SessionError::Invalid);
        }
        let mut entries = self.lock();
        self.reclaim_expired(&mut entries, now);
        let key = session_key(session_id);
        match entries.get(&key) {
            Some(existing) if existing.binding == *binding => {
                entries.remove(&key);
                Ok(())
            }
            Some(_) => Err(SessionError::Mismatch),
            None => Err(SessionError::Unknown),
        }
    }

    pub(crate) fn len(&self) -> usize {
        self.len_at(Instant::now())
    }

    fn len_at(&self, now: Instant) -> usize {
        let mut entries = self.lock();
        self.reclaim_expired(&mut entries, now);
        entries.len()
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, BTreeMap<String, SessionEntry>> {
        self.entries
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
    }

    fn reclaim_expired(&self, entries: &mut BTreeMap<String, SessionEntry>, now: Instant) {
        entries.retain(|_, entry| now.saturating_duration_since(entry.last_used) <= self.ttl);
    }
}

fn session_key(session_id: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(session_id.as_bytes()))
}

pub(crate) fn valid_session_id(session_id: &str) -> bool {
    !session_id.is_empty()
        && session_id.len() <= MAX_MCP_SESSION_ID_BYTES
        && session_id.bytes().all(|byte| byte.is_ascii_graphic())
}

fn update_component(digest: &mut Sha256, value: &str) {
    digest.update((value.len() as u64).to_be_bytes());
    digest.update(value.as_bytes());
}

pub(crate) fn next_legacy_scope_id() -> u64 {
    static NEXT_ID: AtomicU64 = AtomicU64::new(1);
    NEXT_ID.fetch_add(1, Ordering::Relaxed)
}

pub(crate) fn legacy_scope_id(scope: &Scope) -> u64 {
    let mut digest = Sha256::new();
    digest.update(b"appcall-mcp-legacy-scope-v1");
    for value in [
        scope.project_id.as_str(),
        scope.account_id.as_str(),
        scope.profile.as_str(),
        scope.connector_token.as_str(),
    ] {
        update_component(&mut digest, value);
    }
    let digest = digest.finalize();
    u64::from_be_bytes(digest[..8].try_into().expect("SHA-256 has 8-byte prefix"))
}

/// Return a stable, non-secret digest of the headers that establish identity.
/// Callers must invoke this only after the request has passed authorization.
pub fn auth_context_fingerprint(headers: &[(String, String)]) -> String {
    let mut fields = headers
        .iter()
        .filter(|(name, _)| {
            AUTHENTICATION_CONTEXT_HEADERS
                .iter()
                .any(|allowed| name.eq_ignore_ascii_case(allowed))
        })
        .map(|(name, value)| (name.to_ascii_lowercase(), value.clone()))
        .collect::<Vec<_>>();
    fields.sort_unstable();

    let mut digest = Sha256::new();
    digest.update(b"appcall-mcp-auth-context-v1");
    for (name, value) in fields {
        update_component(&mut digest, &name);
        update_component(&mut digest, &value);
    }
    URL_SAFE_NO_PAD.encode(digest.finalize())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};

    fn binding() -> SessionBinding {
        SessionBinding {
            project_id: "project".into(),
            account_id: "account".into(),
            profile: "profile".into(),
            auth_context_fingerprint: "fingerprint".into(),
        }
    }

    #[test]
    fn expired_sessions_are_reclaimed_before_capacity_is_rejected() {
        let ttl = Duration::from_secs(10);
        let registry = SessionRegistry::new_with_limits(1, 1, ttl);
        let first_now = Instant::now();
        let first = registry.issue_at(binding(), first_now).unwrap();
        assert_eq!(registry.len_at(first_now), 1);

        let second = registry.issue_at(binding(), first_now + ttl + Duration::from_secs(1));
        assert!(second.is_ok());
        assert!(registry
            .validate_at(&first, &binding(), first_now + ttl + Duration::from_secs(1))
            .is_err());
    }

    #[test]
    fn close_removes_only_the_matching_authenticated_session() {
        let registry = SessionRegistry::new_with_limits(2, 2, Duration::from_secs(10));
        let now = Instant::now();
        let first = registry.issue_at(binding(), now).unwrap();
        assert_eq!(registry.close_at(&first, &binding(), now), Ok(()));
        assert_eq!(registry.len_at(now), 0);
        assert_eq!(
            registry.close_at(&first, &binding(), now),
            Err(SessionError::Unknown)
        );
    }
}
