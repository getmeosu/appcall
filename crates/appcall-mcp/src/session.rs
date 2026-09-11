use crate::Scope;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Mutex,
};

pub const MCP_SESSION_ID_HEADER: &str = "Mcp-Session-Id";
pub const MAX_MCP_SESSION_ID_BYTES: usize = 128;
pub(crate) const MAX_MCP_SESSIONS: usize = 1024;

const AUTHENTICATION_CONTEXT_HEADERS: &[&str] = &[
    "authorization",
    "x-api-key",
    "x-external-account-id",
    "x-tenant-id",
];
const SESSION_RANDOM_BYTES: usize = 32;
const SESSION_GENERATION_ATTEMPTS: usize = 8;

#[derive(Clone, Eq, PartialEq)]
pub(crate) struct SessionBinding {
    project_id: String,
    account_id: String,
    profile: String,
    auth_context_fingerprint: String,
}
impl SessionBinding {
    pub(crate) fn from_scope(scope: &Scope) -> Self {
        Self {
            project_id: scope.project_id.clone(),
            account_id: scope.account_id.clone(),
            profile: scope.profile.clone(),
            auth_context_fingerprint: scope.auth_context_fingerprint.clone(),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum SessionError {
    Capacity,
    Invalid,
    Unknown,
    Mismatch,
    Unavailable,
}

pub(crate) struct SessionRegistry {
    entries: Mutex<BTreeMap<String, SessionBinding>>,
    capacity: usize,
}
impl SessionRegistry {
    pub(crate) fn new(capacity: usize) -> Self {
        Self {
            entries: Mutex::new(BTreeMap::new()),
            capacity,
        }
    }

    pub(crate) fn issue(&self, binding: SessionBinding) -> Result<String, SessionError> {
        let mut entries = self
            .entries
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if entries.len() >= self.capacity {
            return Err(SessionError::Capacity);
        }
        for _ in 0..SESSION_GENERATION_ATTEMPTS {
            let mut bytes = [0u8; SESSION_RANDOM_BYTES];
            getrandom::fill(&mut bytes).map_err(|_| SessionError::Unavailable)?;
            let session_id = URL_SAFE_NO_PAD.encode(bytes);
            if let std::collections::btree_map::Entry::Vacant(entry) =
                entries.entry(session_key(&session_id))
            {
                entry.insert(binding);
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
        if !valid_session_id(session_id) {
            return Err(SessionError::Invalid);
        }
        let entries = self
            .entries
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        match entries.get(&session_key(session_id)) {
            Some(existing) if existing == binding => Ok(()),
            Some(_) => Err(SessionError::Mismatch),
            None => Err(SessionError::Unknown),
        }
    }

    pub(crate) fn len(&self) -> usize {
        self.entries
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .len()
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

fn update_component(digest: &mut Sha256, value: &str) {
    digest.update((value.len() as u64).to_be_bytes());
    digest.update(value.as_bytes());
}

pub(crate) fn next_legacy_scope_id() -> u64 {
    static NEXT_ID: AtomicU64 = AtomicU64::new(1);
    NEXT_ID.fetch_add(1, Ordering::Relaxed)
}
