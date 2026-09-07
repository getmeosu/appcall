use crate::*;
use postgres::{Client, GenericClient, Row};
use sha2::{Digest, Sha256};
fn job(r: Row) -> Job {
    Job {
        id: r.get("id"),
        project_id: r.get("project_id"),
        connection_id: r.get("connection_id"),
        operation: r.get("operation"),
        input: r.get("input"),
        status: r.get("status"),
        worker_id: r.get("worker_id"),
        attempts: r.get::<_, i32>("attempts").max(0) as u32,
        leased_until: r.get("leased_until"),
    }
}
/// Can share the event outbox transaction. A dedup key cannot change its target or input.
pub fn enqueue<C: GenericClient>(db: &mut C, r: &ScheduleRequest) -> Result<Job> {
    validate_input(&r.input)?;
    if [&r.id, &r.project_id, &r.connection_id, &r.operation]
        .iter()
        .any(|s| s.is_empty() || s.len() > 512)
    {
        return Err(Error::InvalidInput);
    }
    // Provider event IDs allow 1024 bytes; webhook and replay prefixes add bytes.
    // Keep the exact legacy dedup key, independently of ordinary identity bounds.
    if r.dedup_key.is_empty() || r.dedup_key.len() > 2048 {
        return Err(Error::InvalidInput);
    }
    let row=db.query_opt("INSERT INTO sync_jobs(id,project_id,connection_id,operation,status,run_after,dedup_key,input) SELECT $1,$2,c.id,$4,'pending',now(),$5,$6 FROM connections c WHERE c.id=$3 AND c.project_id=$2 ON CONFLICT(project_id,dedup_key) DO UPDATE SET dedup_key=EXCLUDED.dedup_key WHERE sync_jobs.connection_id=EXCLUDED.connection_id AND sync_jobs.operation=EXCLUDED.operation AND sync_jobs.input=EXCLUDED.input RETURNING sync_jobs.*",&[&r.id,&r.project_id,&r.connection_id,&r.operation,&r.dedup_key,&r.input])?.ok_or(Error::Conflict)?;
    Ok(job(row))
}
pub struct Repository {
    pub(crate) client: Client,
}
impl Repository {
    pub fn database_health(&self) -> Option<bool> {
        Some(!self.client.is_closed())
    }
    pub fn new(client: Client) -> Self {
        Self { client }
    }
    pub fn into_client(self) -> Client {
        self.client
    }
    pub fn enqueue(&mut self, r: &ScheduleRequest) -> Result<Job> {
        enqueue(&mut self.client, r)
    }
    pub fn claim(&mut self, worker: &str, lease: Duration) -> Result<Option<Job>> {
        if worker.is_empty()
            || worker.len() > 256
            || lease.is_zero()
            || lease > Duration::from_secs(3600)
        {
            return Err(Error::InvalidInput);
        }
        let millis = lease.as_millis() as i64;
        Ok(self.client.query_opt("WITH candidate AS (SELECT j.id FROM sync_jobs j JOIN connections c ON c.id=j.connection_id AND c.project_id=j.project_id WHERE ((j.status='pending' AND j.run_after<=now()) OR (j.status='running' AND j.leased_until<=now())) AND NOT EXISTS(SELECT 1 FROM sync_jobs earlier WHERE earlier.connection_id=j.connection_id AND earlier.operation=j.operation AND earlier.status IN ('pending','running') AND (earlier.created_at,earlier.id)<(j.created_at,j.id)) ORDER BY j.run_after,j.created_at,j.id FOR UPDATE OF c,j SKIP LOCKED LIMIT 1) UPDATE sync_jobs SET status='running',worker_id=$1,leased_until=clock_timestamp()+($2::bigint*interval '1 millisecond'),updated_at=now() FROM candidate WHERE sync_jobs.id=candidate.id RETURNING sync_jobs.*",&[&worker,&millis])?.map(job))
    }
    pub fn cursor(&mut self, j: &Job) -> Result<String> {
        let mut tx = self.client.transaction()?;
        lock(&mut tx, j)?;
        let cursor = tx
            .query_opt(
                "SELECT cursor FROM sync_job_checkpoints WHERE job_id=$1",
                &[&j.id],
            )?
            .map(|r| r.get(0))
            .unwrap_or_default();
        tx.commit()?;
        Ok(cursor)
    }
    pub fn commit_page(&mut self, j: &Job, cursor: &str, page: &Page) -> Result<()> {
        self.commit_page_checked(j, cursor, page, None)
    }
    pub fn commit_page_for_connection(
        &mut self,
        j: &Job,
        cursor: &str,
        page: &Page,
        connection: &appcall_store::Connection,
    ) -> Result<()> {
        self.commit_page_checked(j, cursor, page, Some(connection))
    }
    fn commit_page_checked(
        &mut self,
        j: &Job,
        cursor: &str,
        page: &Page,
        connection: Option<&appcall_store::Connection>,
    ) -> Result<()> {
        page.validate()?;
        if !page.next_cursor.is_empty() && page.next_cursor == cursor {
            return Err(Error::CursorCycle);
        }
        let mut tx = self.client.transaction()?;
        lock(&mut tx, j)?;
        if let Some(c) = connection {
            if tx.query_opt("SELECT id FROM connections WHERE id=$1 AND project_id=$2 AND connector=$3 AND status='active' AND coalesce(secret_ref_id,'')=$4 AND coalesce(external_account_id,'')=$5 AND auth_type=$6 AND credential_owner=$7 FOR SHARE",&[&c.id,&c.project_id,&c.connector,&c.secret_ref_id,&c.external_account_id,&c.auth_type.as_str(),&c.credential_owner.as_str()])?.is_none(){return Err(Error::Unavailable)}
        }

        let persisted: String = tx
            .query_opt(
                "SELECT cursor FROM sync_job_checkpoints WHERE job_id=$1",
                &[&j.id],
            )?
            .map(|r| r.get(0))
            .unwrap_or_default();
        if persisted != cursor {
            return Err(Error::LeaseLost);
        }
        if !page.next_cursor.is_empty()
            && tx
                .query_opt(
                    "SELECT 1 FROM sync_job_cursor_visits WHERE job_id=$1 AND cursor=$2",
                    &[&j.id, &page.next_cursor],
                )?
                .is_some()
        {
            return Err(Error::CursorCycle);
        }
        if tx.execute("INSERT INTO sync_job_cursor_visits(job_id,cursor) VALUES($1,$2) ON CONFLICT DO NOTHING",&[&j.id,&cursor])?!=1{return Err(Error::CursorCycle)}
        for m in &page.records {
            tx.execute("INSERT INTO synced_messages(id,project_id,connection_id,provider,provider_message_id,channel_id,sender_id,text,model_version,raw) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(project_id,connection_id,id) DO UPDATE SET provider=EXCLUDED.provider,provider_message_id=EXCLUDED.provider_message_id,channel_id=EXCLUDED.channel_id,sender_id=EXCLUDED.sender_id,text=EXCLUDED.text,model_version=EXCLUDED.model_version,raw=EXCLUDED.raw,updated_at=now()",&[&m.id,&j.project_id,&j.connection_id,&m.provider,&m.provider_message_id,&m.channel_id,&m.sender_id,&m.text,&m.model_version,&m.raw])?;
        }
        if !page.records.is_empty() {
            let hash = Sha256::digest(cursor.as_bytes());
            let suffix: String = hash[..8].iter().map(|b| format!("{b:02x}")).collect();
            let id = format!("usage_sync_{}_{}", j.id, suffix);
            let quantity = page.records.len() as i64;
            tx.execute("WITH inserted AS (INSERT INTO usage_events(id,project_id,connection_id,connector,action,kind,occurred_at,external_account_id,quantity) SELECT $1,c.project_id,c.id,c.connector,$3,'synced_record',now(),COALESCE(c.external_account_id,''),$4 FROM connections c WHERE c.id=$2 AND c.project_id=$5 ON CONFLICT(id) DO NOTHING RETURNING project_id,external_account_id,kind) INSERT INTO usage_monthly_rollups(project_id,external_account_id,month,kind,quantity) SELECT project_id,external_account_id,to_char(now() AT TIME ZONE 'UTC','YYYY-MM'),kind,$4 FROM inserted ON CONFLICT(project_id,external_account_id,month,kind) DO UPDATE SET quantity=usage_monthly_rollups.quantity+EXCLUDED.quantity,updated_at=now()",&[&id,&j.connection_id,&j.operation,&quantity,&j.project_id])?;
        }
        tx.execute("INSERT INTO sync_job_checkpoints(job_id,cursor) VALUES($1,$2) ON CONFLICT(job_id) DO UPDATE SET cursor=EXCLUDED.cursor",&[&j.id,&page.next_cursor])?;
        let status = if page.next_cursor.is_empty() {
            "succeeded"
        } else {
            "pending"
        };
        tx.execute("UPDATE sync_jobs SET status=$2,worker_id='',leased_until=NULL,run_after=now(),updated_at=now() WHERE id=$1",&[&j.id,&status])?;
        tx.commit()?;
        Ok(())
    }
    pub fn fail(&mut self, j: &Job, delay: Duration, terminal: bool) -> Result<()> {
        let mut tx = self.client.transaction()?;
        lock(&mut tx, j)?;
        let millis = delay.as_millis().min(86400000) as i64;
        let status = if terminal { "failed" } else { "pending" };
        tx.execute("UPDATE sync_jobs SET status=$2,attempts=attempts+1,worker_id='',leased_until=NULL,run_after=now()+($3::bigint*interval '1 millisecond'),last_error='sync processing failed',updated_at=now() WHERE id=$1",&[&j.id,&status,&millis])?;
        tx.commit()?;
        Ok(())
    }
}
fn lock(tx: &mut postgres::Transaction<'_>, j: &Job) -> Result<()> {
    if tx.query_opt("SELECT id FROM sync_jobs WHERE id=$1 AND project_id=$2 AND connection_id=$3 AND operation=$4 AND worker_id=$5 AND leased_until=$6 AND input=$7 AND status='running' AND leased_until>clock_timestamp() FOR UPDATE",&[&j.id,&j.project_id,&j.connection_id,&j.operation,&j.worker_id,&j.leased_until,&j.input])?.is_none(){return Err(Error::LeaseLost)}
    Ok(())
}
