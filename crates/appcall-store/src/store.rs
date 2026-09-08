use crate::*;
use postgres::{Client, Transaction};
pub struct Store {
    client: Client,
    provider: LocalProvider,
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
        Self { client, provider }
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
                    "SELECT id FROM secret_envelopes WHERE project_id=$1 AND id=$2",
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
}
