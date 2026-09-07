use crate::{hash_api_key, ApiKeyVerifier, AuthError, Principal, StaticApiKey};
use std::sync::Mutex;
/// Construct with the host's TLS-configured Postgres connection. No environment
/// or plaintext connection fallback is performed by this crate.
pub struct PostgresApiKeys {
    client: Mutex<postgres::Client>,
}
impl PostgresApiKeys {
    pub fn database_health(&self) -> Option<bool> {
        match self.client.try_lock() {
            Ok(client) => Some(!client.is_closed()),
            Err(std::sync::TryLockError::WouldBlock) => None,
            Err(std::sync::TryLockError::Poisoned(_)) => Some(false),
        }
    }
    pub fn new(client: postgres::Client) -> Self {
        Self {
            client: Mutex::new(client),
        }
    }
}
impl ApiKeyVerifier for PostgresApiKeys {
    fn verify_api_key(&self, raw: &str) -> Result<Option<Principal>, AuthError> {
        if raw.is_empty() || raw.len() > 4096 {
            return Ok(None);
        }
        let hash = hash_api_key(raw);
        let mut client = self.client.lock().map_err(|_| AuthError::Unavailable)?;
        let row=bounded_query(&mut client,"SELECT p.id, ak.key_hash FROM api_keys ak JOIN projects p ON p.id=ak.project_id WHERE ak.key_hash=$1 AND ak.disabled_at IS NULL AND p.disabled_at IS NULL",&[&hash]).map_err(|_|AuthError::Unavailable)?;
        let Some(row) = row else { return Ok(None) };
        let project: String = row.try_get(0).map_err(|_| AuthError::Unavailable)?;
        let stored: String = row.try_get(1).map_err(|_| AuthError::Unavailable)?;
        StaticApiKey::from_hash(
            &stored,
            Principal::project(project).map_err(|_| AuthError::Unavailable)?,
        )
        .map_err(|_| AuthError::Unavailable)?
        .verify_api_key(raw)
    }
}

/// Use an Anusa database connection, separate from the AppCall project store.
pub struct PostgresMemberships {
    client: Mutex<postgres::Client>,
}
impl PostgresMemberships {
    pub fn database_health(&self) -> Option<bool> {
        match self.client.try_lock() {
            Ok(client) => Some(!client.is_closed()),
            Err(std::sync::TryLockError::WouldBlock) => None,
            Err(std::sync::TryLockError::Poisoned(_)) => Some(false),
        }
    }
    pub fn new(client: postgres::Client) -> Self {
        Self {
            client: Mutex::new(client),
        }
    }
}
impl crate::MembershipVerifier for PostgresMemberships {
    fn verify_membership(
        &self,
        claims: &crate::AccessClaims,
        tenant: &str,
        token_hash: &str,
    ) -> Result<Option<crate::Membership>, AuthError> {
        if !crate::principal::valid_id(tenant)
            || !crate::principal::valid_id(&claims.user_id)
            || token_hash.is_empty()
            || token_hash.len() > 128
        {
            return Ok(None);
        }
        let mut client = self.client.lock().map_err(|_| AuthError::Unavailable)?;
        // Match the pinned SDK's revocation query: any retained hash revokes,
        // including expired rows until Anusa removes them.
        let row=bounded_query(&mut client,"SELECT tm.tenant_id::text FROM tenant_memberships tm JOIN users u ON u.id=tm.user_id JOIN tenants t ON t.id=tm.tenant_id WHERE tm.user_id::text=$1 AND tm.tenant_id::text=$2 AND u.is_active AND t.is_active AND NOT EXISTS (SELECT 1 FROM revoked_tokens r WHERE r.token_hash=$3)",&[&claims.user_id,&tenant,&token_hash]).map_err(|_|AuthError::Unavailable)?;
        let Some(row) = row else { return Ok(None) };
        let tenant_id: String = row.try_get(0).map_err(|_| AuthError::Unavailable)?;
        Ok(Some(crate::Membership {
            tenant_id,
            allowed_brands: crate::Grant::All,
            scopes: crate::Grant::All,
        }))
    }
}

// Transaction-local limits cannot leak into other operations on the supplied
// connection. An error drops and rolls back the transaction before reuse.
fn bounded_query(
    client: &mut postgres::Client,
    query: &str,
    params: &[&(dyn postgres::types::ToSql + Sync)],
) -> Result<Option<postgres::Row>, postgres::Error> {
    let mut tx = client.transaction()?;
    tx.batch_execute("SET LOCAL statement_timeout = '1s'; SET LOCAL lock_timeout = '250ms'")?;
    let row = tx.query_opt(query, params)?;
    tx.commit()?;
    Ok(row)
}

#[cfg(test)]
mod health_tests {
    use super::*;
    #[test]
    #[ignore = "requires local PostgreSQL"]
    fn physical_health_distinguishes_busy_and_closed_clients() {
        let url = std::env::var("APPCALL_ENGINE_POSTGRES_URL").unwrap();
        let mut admin = postgres::Client::connect(&url, postgres::NoTls).unwrap();
        let mut client = postgres::Client::connect(&url, postgres::NoTls).unwrap();
        let pid: i32 = client
            .query_one("SELECT pg_backend_pid()", &[])
            .unwrap()
            .get(0);
        let keys = PostgresApiKeys::new(client);
        assert_eq!(keys.database_health(), Some(true));
        {
            let _held = keys.client.lock().unwrap();
            assert_eq!(keys.database_health(), None);
        }
        admin
            .query_one("SELECT pg_terminate_backend($1)", &[&pid])
            .unwrap();
        assert!(keys
            .client
            .lock()
            .unwrap()
            .simple_query("SELECT 1")
            .is_err());
        assert_eq!(keys.database_health(), Some(false));
        let memberships =
            PostgresMemberships::new(postgres::Client::connect(&url, postgres::NoTls).unwrap());
        assert_eq!(memberships.database_health(), Some(true));
        {
            let _held = memberships.client.lock().unwrap();
            assert_eq!(memberships.database_health(), None);
        }
        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let _held = memberships.client.lock().unwrap();
            panic!("synthetic poison");
        }));
        assert_eq!(memberships.database_health(), Some(false));
    }
}
