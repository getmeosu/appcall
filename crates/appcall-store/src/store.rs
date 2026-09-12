use crate::*;
use postgres::{Client, Transaction};
use std::time::SystemTime;

pub const MAX_SECRET_CLEANUP_BATCH: usize = 1000;
/// Maximum number of envelopes inspected by one cleanup transaction. This is
/// deliberately separate from the deletion batch: protected rows still count
/// toward the scan budget so a reference-heavy prefix cannot create an
/// unbounded query.
pub const MAX_SECRET_CLEANUP_SCAN: usize = 1000;

#[derive(Clone)]
struct SecretCleanupCursor {
    created_at: SystemTime,
    id: String,
}

pub struct Store {
    client: Client,
    provider: LocalProvider,
    secret_cleanup_cursor: Option<SecretCleanupCursor>,
}
pub struct StoreTransaction<'a> {
    transaction: Transaction<'a>,
    provider: &'a LocalProvider,
}
impl Store {
    /// Physical socket state only: never sends or retries a SQL statement.
    pub fn database_health(&self) -> Option<bool> {
        Some(!self.client.is_closed())
    }
    pub fn new(client: Client, provider: LocalProvider) -> Self {
        Self {
            client,
            provider,
            secret_cleanup_cursor: None,
        }
    }
    pub fn into_client(self) -> Client {
        self.client
    }
    pub fn transaction<T>(
        &mut self,
        f: impl FnOnce(&mut StoreTransaction<'_>) -> Result<T, Error>,
    ) -> Result<T, Error> {
        let mut tx = StoreTransaction {
            transaction: self.client.transaction()?,
            provider: &self.provider,
        };
        let value = f(&mut tx)?;
        tx.transaction.commit()?;
        Ok(value)
    }
    pub fn set_secret_ref(
        &mut self,
        s: &Scope,
        id: &str,
        secret: &str,
    ) -> Result<Connection, Error> {
        self.transaction(|tx| tx.set_secret_ref(s, id, secret))
    }
    pub fn expire_stale_authorizing(
        &mut self,
        project: &str,
        cutoff: std::time::SystemTime,
    ) -> Result<u64, Error> {
        self.transaction(|tx| {
            // Lock only stale candidates and skip rows currently owned by an
            // authorization transaction. The UPDATE below gets a fresh READ
            // COMMITTED snapshot and rechecks the intent before changing any
            // row, so a candidate that was reauthorized while selected stays
            // authorizing.
            let stale_ids: Vec<String> = tx
                .client()
                .query(
                    "SELECT c.id FROM connections AS c \
                     WHERE c.project_id=$1 AND c.status='authorizing' \
                       AND COALESCE((\
                         SELECT i.created_at FROM oauth_refresh_intents AS i \
                         WHERE i.project_id=c.project_id AND i.connection_id=c.id \
                           AND i.operation='authorization' AND i.state='authorizing'\
                       ), c.updated_at) < $2 \
                     ORDER BY c.id \
                     FOR UPDATE SKIP LOCKED",
                    &[&project, &cutoff],
                )?
                .into_iter()
                .map(|row| row.get("id"))
                .collect();
            if stale_ids.is_empty() {
                return Ok(0);
            }
            Ok(tx.client().execute(
                "UPDATE connections AS c SET status='disconnected',updated_at=now() \
                 WHERE c.project_id=$1 AND c.id=ANY($2) AND c.status='authorizing' \
                   AND COALESCE((\
                     SELECT i.created_at FROM oauth_refresh_intents AS i \
                     WHERE i.project_id=c.project_id AND i.connection_id=c.id \
                       AND i.operation='authorization' AND i.state='authorizing'\
                   ), c.updated_at) < $3",
                &[&project, &stale_ids, &cutoff],
            )?)
        })
    }
    pub fn get_platform_connection(
        &mut self,
        project: &str,
        connector: &str,
    ) -> Result<Connection, Error> {
        self.transaction(|tx|Connection::row(tx.client().query_opt("SELECT * FROM connections WHERE project_id=$1 AND connector=$2 AND credential_owner='platform' ORDER BY id LIMIT 1",&[&project,&connector])?.ok_or(Error::NotFound)?))
    }
    pub fn get_brand_connection(
        &mut self,
        project: &str,
        connector: &str,
        account: &str,
    ) -> Result<Connection, Error> {
        self.transaction(|tx|Connection::row(tx.client().query_opt("SELECT * FROM connections WHERE project_id=$1 AND connector=$2 AND credential_owner='brand' AND external_account_id=$3 ORDER BY id LIMIT 1",&[&project,&connector,&account])?.ok_or(Error::NotFound)?))
    }
    pub fn get(&mut self, s: &Scope, id: &str) -> Result<Connection, Error> {
        self.transaction(|tx| tx.get(s, id))
    }
    /// Return the public connection record together with its durable
    /// generation. The revision is intentionally separate from Connection's
    /// compatibility-preserved wire shape.
    pub fn get_with_revision(&mut self, s: &Scope, id: &str) -> Result<(Connection, i64), Error> {
        self.transaction(|tx| tx.get_with_revision(s, id))
    }
    pub fn list(&mut self, s: &Scope) -> Result<Vec<Connection>, Error> {
        self.transaction(|tx| tx.list(s))
    }
    pub fn create(&mut self, s: &Scope, c: &Connection) -> Result<Connection, Error> {
        self.transaction(|tx| tx.create(s, c))
    }
    pub fn update_status(
        &mut self,
        s: &Scope,
        id: &str,
        status: Status,
    ) -> Result<Connection, Error> {
        self.transaction(|tx| tx.update_status(s, id, status))
    }
    pub fn update_test_status(
        &mut self,
        s: &Scope,
        id: &str,
        status: TestStatus,
    ) -> Result<Connection, Error> {
        self.transaction(|tx| tx.update_test_status(s, id, status))
    }
    pub fn replace_credentials(
        &mut self,
        s: &Scope,
        id: &str,
        secret: &str,
        auth: AuthType,
    ) -> Result<Connection, Error> {
        self.transaction(|tx| tx.replace_credentials(s, id, secret, auth))
    }
    pub fn load_secret(&mut self, project: &str, id: &str) -> Result<SecretBytes, Error> {
        self.transaction(|tx| tx.load_secret(project, id))
    }
    pub fn store_secret(
        &mut self,
        project: &str,
        id: &str,
        kind: &str,
        plain: &[u8],
    ) -> Result<(), Error> {
        self.transaction(|tx| tx.store_secret(project, id, kind, plain))
    }
    /// Delete at most `batch` stale envelopes that have no live credential
    /// reference. The scan is global and age ordered so a busy project cannot
    /// monopolize maintenance cycles.
    pub fn cleanup_expired_secrets(
        &mut self,
        cutoff: SystemTime,
        batch: usize,
    ) -> Result<u64, Error> {
        if batch == 0 || batch > MAX_SECRET_CLEANUP_BATCH {
            return Err(Error::Invalid);
        }
        let cursor = self.secret_cleanup_cursor.clone();
        let (deleted, next_cursor) =
            self.transaction(|tx| tx.cleanup_expired_secrets(cutoff, batch, cursor.as_ref()))?;
        self.secret_cleanup_cursor = next_cursor;
        Ok(deleted)
    }
}
impl<'a> StoreTransaction<'a> {
    /// SQL escape hatch for service repositories. All operations share this transaction.
    pub fn client(&mut self) -> &mut Transaction<'a> {
        &mut self.transaction
    }
    pub fn get(&mut self, s: &Scope, id: &str) -> Result<Connection, Error> {
        let row=self.transaction.query_opt("SELECT * FROM connections WHERE project_id=$1 AND id=$2 AND ($3='' OR external_account_id=$3 OR credential_owner='platform')",&[&s.project,&id,&s.account])?.ok_or(Error::NotFound)?;
        Connection::row(row)
    }
    pub fn get_with_revision(&mut self, s: &Scope, id: &str) -> Result<(Connection, i64), Error> {
        let row=self.transaction.query_opt("SELECT * FROM connections WHERE project_id=$1 AND id=$2 AND ($3='' OR external_account_id=$3 OR credential_owner='platform')",&[&s.project,&id,&s.account])?.ok_or(Error::NotFound)?;
        let revision = row.try_get("connection_revision")?;
        Ok((Connection::row(row)?, revision))
    }
    pub fn lock_connection(&mut self, s: &Scope, id: &str) -> Result<Connection, Error> {
        let row=self.transaction.query_opt("SELECT * FROM connections WHERE project_id=$1 AND id=$2 AND ($3='' OR external_account_id=$3) FOR UPDATE",&[&s.project,&id,&s.account])?.ok_or(Error::NotFound)?;
        Connection::row(row)
    }
    pub fn list(&mut self, s: &Scope) -> Result<Vec<Connection>, Error> {
        self.transaction.query("SELECT * FROM connections WHERE project_id=$1 AND ($2='' OR external_account_id=$2 OR credential_owner='platform') ORDER BY id",&[&s.project,&s.account])?.into_iter().map(Connection::row).collect()
    }
    pub fn create(&mut self, s: &Scope, c: &Connection) -> Result<Connection, Error> {
        if c.project_id != s.project
            || c.id.is_empty()
            || c.connector.is_empty()
            || (!s.account.is_empty() && c.external_account_id != s.account)
            || ((c.credential_owner == CredentialOwner::Platform)
                != c.external_account_id.is_empty())
        {
            return Err(Error::Invalid);
        }
        self.check_secret(&s.project, &c.secret_ref_id)?;
        Connection::row(self.transaction.query_one("INSERT INTO connections(id,project_id,connector,auth_type,status,secret_ref_id,last_test_status,external_account_id,credential_owner) VALUES ($1,$2,$3,$4,$5,NULLIF($6,''),$7,NULLIF($8,''),$9) RETURNING *",&[&c.id,&c.project_id,&c.connector,&c.auth_type.as_str(),&c.status.as_str(),&c.secret_ref_id,&c.last_test_status.as_str(),&c.external_account_id,&c.credential_owner.as_str()])?)
    }
    pub fn update_status(
        &mut self,
        s: &Scope,
        id: &str,
        status: Status,
    ) -> Result<Connection, Error> {
        Connection::row(self.transaction.query_opt("UPDATE connections SET status=$4,updated_at=now() WHERE project_id=$1 AND id=$2 AND ($3='' OR external_account_id=$3) RETURNING *",&[&s.project,&id,&s.account,&status.as_str()])?.ok_or(Error::NotFound)?)
    }
    pub fn update_test_status(
        &mut self,
        s: &Scope,
        id: &str,
        status: TestStatus,
    ) -> Result<Connection, Error> {
        Connection::row(self.transaction.query_opt("UPDATE connections SET last_test_status=$4,updated_at=now() WHERE project_id=$1 AND id=$2 AND ($3='' OR external_account_id=$3) RETURNING *",&[&s.project,&id,&s.account,&status.as_str()])?.ok_or(Error::NotFound)?)
    }
    fn check_secret(&mut self, project: &str, id: &str) -> Result<(), Error> {
        if !id.is_empty()
            && self
                .transaction
                .query_opt(
                    "SELECT id FROM secret_envelopes WHERE project_id=$1 AND id=$2 FOR KEY SHARE",
                    &[&project, &id],
                )?
                .is_none()
        {
            return Err(Error::NotFound);
        }
        Ok(())
    }
    pub fn set_secret_ref(
        &mut self,
        s: &Scope,
        id: &str,
        secret: &str,
    ) -> Result<Connection, Error> {
        self.check_secret(&s.project, secret)?;
        Connection::row(self.transaction.query_opt("UPDATE connections SET secret_ref_id=NULLIF($4,''),updated_at=now() WHERE project_id=$1 AND id=$2 AND ($3='' OR external_account_id=$3) RETURNING *",&[&s.project,&id,&s.account,&secret])?.ok_or(Error::NotFound)?)
    }
    pub fn replace_credentials(
        &mut self,
        s: &Scope,
        id: &str,
        secret: &str,
        auth: AuthType,
    ) -> Result<Connection, Error> {
        self.check_secret(&s.project, secret)?;
        Connection::row(self.transaction.query_opt("UPDATE connections SET secret_ref_id=NULLIF($4,''),auth_type=$5,status='active',last_test_status='unknown',updated_at=now() WHERE project_id=$1 AND id=$2 AND ($3='' OR external_account_id=$3) RETURNING *",&[&s.project,&id,&s.account,&secret,&auth.as_str()])?.ok_or(Error::NotFound)?)
    }
    pub fn store_secret(
        &mut self,
        project: &str,
        id: &str,
        kind: &str,
        plain: &[u8],
    ) -> Result<(), Error> {
        if project.is_empty() || id.is_empty() || kind.is_empty() {
            return Err(Error::Invalid);
        }
        let e = self.provider.encrypt(plain)?;
        self.transaction.execute("INSERT INTO secret_envelopes(id,project_id,kind,key_id,algorithm,nonce,ciphertext) VALUES ($1,$2,$3,$4,$5,$6,$7)",&[&id,&project,&kind,&e.key_id,&e.algorithm,&e.nonce,&e.ciphertext])?;
        Ok(())
    }
    pub fn load_secret(&mut self, project: &str, id: &str) -> Result<SecretBytes, Error> {
        let r=self.transaction.query_opt("SELECT key_id,algorithm,nonce,ciphertext FROM secret_envelopes WHERE project_id=$1 AND id=$2",&[&project,&id])?.ok_or(Error::NotFound)?;
        self.provider.decrypt(&Envelope {
            key_id: r.get(0),
            algorithm: r.get(1),
            nonce: r.get(2),
            ciphertext: r.get(3),
        })
    }
    pub fn secret_kind(&mut self, project: &str, id: &str) -> Result<String, Error> {
        Ok(self
            .transaction
            .query_opt(
                "SELECT kind FROM secret_envelopes WHERE project_id=$1 AND id=$2",
                &[&project, &id],
            )?
            .ok_or(Error::NotFound)?
            .get(0))
    }
    /// Delete a bounded, globally age-ordered batch of unreferenced envelopes.
    /// The candidate row lock and restrictive foreign keys give reference
    /// writers a deterministic boundary: an existing writer makes the row
    /// skip, while a writer arriving after the check fails safely instead of
    /// losing its credential reference.
    fn cleanup_expired_secrets(
        &mut self,
        cutoff: SystemTime,
        batch: usize,
        cursor: Option<&SecretCleanupCursor>,
    ) -> Result<(u64, Option<SecretCleanupCursor>), Error> {
        if batch == 0 || batch > MAX_SECRET_CLEANUP_BATCH {
            return Err(Error::Invalid);
        }
        let scan_limit = MAX_SECRET_CLEANUP_SCAN as i64;
        let mut scanned = match cursor {
            Some(cursor) => self.transaction.query(
                "SELECT id,created_at FROM secret_envelopes \
                 WHERE created_at < $1 AND (created_at,id) > ($2,$3) \
                 ORDER BY created_at,id LIMIT $4",
                &[&cutoff, &cursor.created_at, &cursor.id, &scan_limit],
            )?,
            None => self.transaction.query(
                "SELECT id,created_at FROM secret_envelopes \
                 WHERE created_at < $1 ORDER BY created_at,id LIMIT $2",
                &[&cutoff, &scan_limit],
            )?,
        };
        if cursor.is_some() && scanned.len() < MAX_SECRET_CLEANUP_SCAN {
            let remaining = (MAX_SECRET_CLEANUP_SCAN - scanned.len()) as i64;
            scanned.extend(self.transaction.query(
                "SELECT id,created_at FROM secret_envelopes \
                 WHERE created_at < $1 ORDER BY created_at,id LIMIT $2",
                &[&cutoff, &remaining],
            )?);
        }
        let next_cursor = scanned.last().map(|row| SecretCleanupCursor {
            id: row.get("id"),
            created_at: row.get("created_at"),
        });
        if scanned.is_empty() {
            return Ok((0, None));
        }
        let scanned_ids: Vec<String> = scanned.iter().map(|row| row.get("id")).collect();
        let candidates = self.transaction.query(
            r#"
            SELECT e.id
            FROM secret_envelopes AS e
            WHERE e.id = ANY($1)
              AND e.created_at < $2
              AND NOT EXISTS (
                  SELECT 1 FROM connections AS c
                  WHERE c.secret_ref_id = e.id
              )
              AND NOT EXISTS (
                  SELECT 1 FROM provider_subaccounts AS s
                  WHERE s.secret_ref_id = e.id
              )
              AND NOT EXISTS (
                  SELECT 1 FROM oauth_refresh_intents AS i
                  WHERE i.pkce_secret_ref_id = e.id
              )
              AND NOT EXISTS (
                  -- Before pkce_secret_ref_id existed, the signed state and
                  -- its kind were the only durable binding. Keep that
                  -- envelope while a corresponding authorization intent is
                  -- unresolved, including a disconnected/unknown connection.
                  SELECT 1
                  FROM oauth_refresh_intents AS i
                  WHERE i.state IN ('authorizing', 'dispatched', 'unknown')
                    AND i.secret_ref_id = e.id
              )
              AND NOT EXISTS (
                  SELECT 1
                  FROM connections AS c
                  JOIN oauth_refresh_intents AS i
                    ON i.project_id = c.project_id
                   AND i.connection_id = c.id
                  WHERE c.project_id = e.project_id
                    AND e.kind = 'oauth_pkce_' || c.id
                    AND i.operation = 'authorization'
                    AND i.state IN ('authorizing', 'dispatched', 'unknown')
                    AND i.pkce_secret_ref_id IS NULL
              )
            ORDER BY e.created_at, e.id
            FOR UPDATE OF e SKIP LOCKED
            LIMIT $3
            "#,
            &[&scanned_ids, &cutoff, &(batch as i64)],
        )?;
        let candidate_ids: Vec<String> = candidates.iter().map(|row| row.get("id")).collect();
        if candidate_ids.is_empty() {
            return Ok((0, next_cursor));
        }
        let deleted = self.transaction.execute(
            "DELETE FROM secret_envelopes WHERE id=ANY($1)",
            &[&candidate_ids],
        )?;
        Ok((deleted, next_cursor))
    }
}
