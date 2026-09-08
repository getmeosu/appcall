use crate::*;
use postgres::{Client, GenericClient, Row};
use serde_json::json;
use sha2::{Digest, Sha256};

const MAX_EVENT_DETAIL_BYTES: usize = 1024;
const MAX_EVENT_STRING_BYTES: usize = 96;
const MAX_PAGE_RECORDS: u64 = 10_000;
const MAX_RETRY_DELAY_MS: u64 = 86_400_000;

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

fn event_detail(kind: &str, detail: &Value) -> Result<()> {
    let object = detail.as_object().ok_or(Error::InvalidInput)?;
    if serde_json::to_vec(detail)
        .map_err(|_| Error::InvalidInput)?
        .len()
        > MAX_EVENT_DETAIL_BYTES
    {
        return Err(Error::InvalidInput);
    }
    if object.keys().any(|key| {
        !matches!(
            key.as_str(),
            "reason" | "recordsWritten" | "hasMore" | "retryDelayMs" | "code" | "policy"
        )
    }) {
        return Err(Error::InvalidInput);
    }
    let bounded_string = |value: Option<&Value>| {
        value.is_some_and(|value| {
            value.as_str().is_some_and(|value| {
                value.len() <= MAX_EVENT_STRING_BYTES && !value.chars().any(char::is_control)
            })
        })
    };
    if let Some(reason) = object.get("reason") {
        if !bounded_string(Some(reason)) {
            return Err(Error::InvalidInput);
        }
    }
    if let Some(code) = object.get("code") {
        if !bounded_string(Some(code))
            || !code.as_str().is_some_and(|value| {
                value
                    .chars()
                    .all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || c == '_')
            })
        {
            return Err(Error::InvalidInput);
        }
    }
    if let Some(records) = object.get("recordsWritten") {
        if records
            .as_u64()
            .is_none_or(|value| value > MAX_PAGE_RECORDS)
        {
            return Err(Error::InvalidInput);
        }
    }
    if let Some(has_more) = object.get("hasMore") {
        if !has_more.is_boolean() {
            return Err(Error::InvalidInput);
        }
    }
    if let Some(delay) = object.get("retryDelayMs") {
        if delay
            .as_u64()
            .is_none_or(|value| value > MAX_RETRY_DELAY_MS)
        {
            return Err(Error::InvalidInput);
        }
    }
    if let Some(policy) = object.get("policy") {
        let policy = policy.as_object().ok_or(Error::InvalidInput)?;
        if policy.keys().any(|key| {
            !matches!(
                key.as_str(),
                "maxAttempts" | "leaseDurationMs" | "retryBaseMs" | "maxRetryDelayMs" | "source"
            )
        }) || policy
            .get("maxAttempts")
            .and_then(Value::as_u64)
            .is_none_or(|value| value == 0 || value > u32::MAX as u64)
            || policy
                .get("leaseDurationMs")
                .and_then(Value::as_u64)
                .is_none_or(|value| value > 3_600_000)
            || policy
                .get("maxRetryDelayMs")
                .and_then(Value::as_u64)
                .is_none_or(|value| value > 86_400_000)
            || policy
                .get("retryBaseMs")
                .and_then(Value::as_str)
                .is_none_or(|value| {
                    value.is_empty()
                        || value.len() > 128
                        || !value.chars().all(|c| c.is_ascii_digit())
                })
            || policy.get("source").and_then(Value::as_str) != Some("service_config")
        {
            return Err(Error::InvalidInput);
        }
    }
    match kind {
        "scheduled" => {
            let reason = object.get("reason").and_then(Value::as_str);
            if !matches!(reason, Some("new_job" | "run_now" | "reset_attempts")) {
                return Err(Error::InvalidInput);
            }
        }
        "page" => {
            if object
                .get("recordsWritten")
                .and_then(Value::as_u64)
                .is_none()
                || object.get("hasMore").and_then(Value::as_bool).is_none()
            {
                return Err(Error::InvalidInput);
            }
        }
        "retry" => {
            if object.get("retryDelayMs").and_then(Value::as_u64).is_none() {
                return Err(Error::InvalidInput);
            }
        }
        "failed" => {
            if object.get("code").and_then(Value::as_str).is_none() {
                return Err(Error::InvalidInput);
            }
        }
        "cancelled" => {
            if object.get("reason").and_then(Value::as_str) != Some("operator_cancelled") {
                return Err(Error::InvalidInput);
            }
        }
        "claimed" => {
            if object.keys().any(|key| key != "policy") {
                return Err(Error::InvalidInput);
            }
        }
        "lease_expired" | "succeeded" => {
            if !object.is_empty() {
                return Err(Error::InvalidInput);
            }
        }
        _ => return Err(Error::InvalidInput),
    }
    Ok(())
}

fn append_event<C: GenericClient>(
    db: &mut C,
    job_id: &str,
    kind: &str,
    detail: &Value,
) -> Result<()> {
    event_detail(kind, detail)?;
    if db
        .query_opt(
            "SELECT id FROM sync_jobs WHERE id=$1 FOR UPDATE",
            &[&job_id],
        )?
        .is_none()
    {
        return Err(Error::NotFound);
    }
    let seq: i32 = db
        .query_one(
            "SELECT COALESCE(MAX(seq),0)+1 FROM sync_job_events WHERE job_id=$1",
            &[&job_id],
        )?
        .get(0);
    if db.execute(
        "INSERT INTO sync_job_events(job_id,seq,kind,\"at\",detail) VALUES($1,$2,$3,clock_timestamp(),$4)",
        &[&job_id, &seq, &kind, detail],
    )? != 1 {
        return Err(Error::Storage);
    }
    Ok(())
}

fn simple_detail() -> Value {
    json!({})
}

fn scheduled_detail(reason: &str) -> Value {
    json!({"reason": reason})
}

fn page_detail(page: &Page) -> Value {
    json!({
        "recordsWritten": page.records.len(),
        "hasMore": !page.next_cursor.is_empty(),
    })
}

fn retry_detail(delay: Duration, code: &str) -> Value {
    json!({
        "retryDelayMs": delay.as_millis().min(MAX_RETRY_DELAY_MS as u128) as u64,
        "code": code,
    })
}

fn failure_code(error: Option<&Error>) -> &'static str {
    match error {
        Some(Error::InvalidInput) => "INVALID_INPUT",
        Some(Error::InvalidPage) => "INVALID_PAGE",
        Some(Error::UnsupportedModel) => "UNSUPPORTED_MODEL",
        Some(Error::Unavailable) => "UNAVAILABLE",
        Some(Error::CursorCycle) => "CURSOR_CYCLE",
        Some(Error::Runner { .. }) => "RUNNER_ERROR",
        Some(Error::NotFound) => "NOT_FOUND",
        Some(Error::Conflict) => "CONFLICT",
        Some(Error::Storage) | None => "SYNC_PROCESSING_FAILED",
        Some(Error::LeaseLost) => "LEASE_LOST",
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
    let mut tx = db.transaction()?;
    let current = tx.query_opt("INSERT INTO sync_jobs(id,project_id,connection_id,operation,status,run_after,dedup_key,input) SELECT $1,$2,c.id,$4,'pending',now(),$5,$6 FROM connections c WHERE c.id=$3 AND c.project_id=$2 ON CONFLICT DO NOTHING RETURNING sync_jobs.*",&[&r.id,&r.project_id,&r.connection_id,&r.operation,&r.dedup_key,&r.input])?;
    let (result, inserted) = if let Some(row) = current {
        (job(row), true)
    } else {
        let row = tx
            .query_opt(
                "SELECT sync_jobs.* FROM sync_jobs WHERE project_id=$1 AND dedup_key=$2",
                &[&r.project_id, &r.dedup_key],
            )?
            .ok_or(Error::Conflict)?;
        let existing = job(row);
        if existing.connection_id != r.connection_id
            || existing.operation != r.operation
            || existing.input != r.input
        {
            return Err(Error::Conflict);
        }
        (existing, false)
    };
    if inserted {
        append_event(
            &mut tx,
            &result.id,
            "scheduled",
            &scheduled_detail("new_job"),
        )?;
    }
    tx.commit()?;
    Ok(result)
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
    pub fn control(
        &mut self,
        project_id: &str,
        account_id: &str,
        job_id: &str,
        action: OperatorAction,
    ) -> Result<()> {
        let mut tx = self.client.transaction()?;
        control_in_transaction(&mut tx, project_id, account_id, job_id, action)?;
        tx.commit()?;
        Ok(())
    }
    pub fn run_now(&mut self, project_id: &str, account_id: &str, job_id: &str) -> Result<()> {
        self.control(project_id, account_id, job_id, OperatorAction::RunNow)
    }
    pub fn reset_attempts(
        &mut self,
        project_id: &str,
        account_id: &str,
        job_id: &str,
    ) -> Result<()> {
        self.control(
            project_id,
            account_id,
            job_id,
            OperatorAction::ResetAttempts,
        )
    }
    pub fn cancel(&mut self, project_id: &str, account_id: &str, job_id: &str) -> Result<()> {
        self.control(project_id, account_id, job_id, OperatorAction::Cancel)
    }
    pub fn claim(&mut self, worker: &str, lease: Duration) -> Result<Option<Job>> {
        self.claim_with_policy(worker, lease, None)
    }
    pub fn claim_with_policy(
        &mut self,
        worker: &str,
        lease: Duration,
        policy: Option<&Value>,
    ) -> Result<Option<Job>> {
        if worker.is_empty()
            || worker.len() > 256
            || lease.is_zero()
            || lease > Duration::from_secs(3600)
        {
            return Err(Error::InvalidInput);
        }
        let millis = lease.as_millis() as i64;
        let mut tx = self.client.transaction()?;
        let row = tx.query_opt("WITH candidate AS (SELECT j.id,j.status AS previous_status FROM sync_jobs j JOIN connections c ON c.id=j.connection_id AND c.project_id=j.project_id WHERE ((j.status='pending' AND j.run_after<=now()) OR (j.status='running' AND j.leased_until<=now())) AND NOT EXISTS(SELECT 1 FROM sync_jobs earlier WHERE earlier.connection_id=j.connection_id AND earlier.operation=j.operation AND earlier.status IN ('pending','running') AND (earlier.created_at,earlier.id)<(j.created_at,j.id)) ORDER BY j.run_after,j.created_at,j.id FOR UPDATE OF c,j SKIP LOCKED LIMIT 1), updated AS (UPDATE sync_jobs SET status='running',worker_id=$1,leased_until=clock_timestamp()+($2::bigint*interval '1 millisecond'),updated_at=now() FROM candidate WHERE sync_jobs.id=candidate.id RETURNING sync_jobs.*,candidate.previous_status AS previous_status) SELECT * FROM updated",&[&worker,&millis])?;
        let Some(row) = row else {
            tx.commit()?;
            return Ok(None);
        };
        let previous_status: String = row.get("previous_status");
        let claimed = job(row);
        if previous_status == "running" {
            append_event(&mut tx, &claimed.id, "lease_expired", &simple_detail())?;
        }
        let detail = policy
            .map(|policy| json!({"policy": policy}))
            .unwrap_or_else(simple_detail);
        append_event(&mut tx, &claimed.id, "claimed", &detail)?;
        tx.commit()?;
        Ok(Some(claimed))
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
        append_event(&mut tx, &j.id, "page", &page_detail(page))?;
        if page.next_cursor.is_empty() {
            append_event(&mut tx, &j.id, "succeeded", &simple_detail())?;
        }
        tx.commit()?;
        Ok(())
    }
    pub fn fail(&mut self, j: &Job, delay: Duration, terminal: bool) -> Result<()> {
        self.fail_with_error(j, delay, terminal, None)
    }
    pub fn fail_with_error(
        &mut self,
        j: &Job,
        delay: Duration,
        terminal: bool,
        error: Option<&Error>,
    ) -> Result<()> {
        let mut tx = self.client.transaction()?;
        lock(&mut tx, j)?;
        let millis = delay.as_millis().min(MAX_RETRY_DELAY_MS as u128) as i64;
        let status = if terminal { "failed" } else { "pending" };
        tx.execute("UPDATE sync_jobs SET status=$2,attempts=attempts+1,worker_id='',leased_until=NULL,run_after=now()+($3::bigint*interval '1 millisecond'),last_error='sync processing failed',updated_at=now() WHERE id=$1",&[&j.id,&status,&millis])?;
        let code = failure_code(error);
        if terminal {
            append_event(&mut tx, &j.id, "failed", &json!({"code": code}))?;
        } else {
            append_event(
                &mut tx,
                &j.id,
                "retry",
                &retry_detail(Duration::from_millis(millis as u64), code),
            )?;
        }
        tx.commit()?;
        Ok(())
    }
}

/// Apply an operator control atomically, using a nested transaction when the
/// caller already owns a transaction.
///
/// The job row is locked before its connection row. Every mutation clears the
/// worker lease, so a worker that still holds an older claim fails the normal
/// owner/input/lease fence before it can commit a page or record a failure.
pub fn control_in_transaction<C: GenericClient>(
    db: &mut C,
    project_id: &str,
    account_id: &str,
    job_id: &str,
    action: OperatorAction,
) -> Result<()> {
    let mut tx = db.transaction()?;
    control_in_transaction_inner(&mut tx, project_id, account_id, job_id, action)?;
    tx.commit()?;
    Ok(())
}

fn control_in_transaction_inner<C: GenericClient>(
    db: &mut C,
    project_id: &str,
    account_id: &str,
    job_id: &str,
    action: OperatorAction,
) -> Result<()> {
    if project_id.is_empty()
        || project_id.len() > 512
        || job_id.is_empty()
        || job_id.len() > 512
        || account_id.len() > 512
    {
        return Err(Error::InvalidInput);
    }
    let job = db
        .query_opt(
            "SELECT connection_id,status,COALESCE(status='running' AND leased_until>clock_timestamp(),false) AS active_lease FROM sync_jobs WHERE id=$1 AND project_id=$2 FOR UPDATE",
            &[&job_id, &project_id],
        )?
        .ok_or(Error::NotFound)?;
    let connection_id: String = job.get("connection_id");
    if db
        .query_opt(
            "SELECT id FROM connections WHERE id=$1 AND project_id=$2 AND ($3='' OR (external_account_id=$3 AND credential_owner<>'platform')) FOR UPDATE",
            &[&connection_id, &project_id, &account_id],
        )?
        .is_none()
    {
        return Err(Error::NotFound);
    }
    let status: String = job.get("status");
    let active_lease: bool = job.get("active_lease");
    let allowed = match action {
        OperatorAction::RunNow => (status == "pending") || (status == "running" && !active_lease),
        OperatorAction::ResetAttempts => {
            status == "pending" || status == "failed" || (status == "running" && !active_lease)
        }
        OperatorAction::Cancel => status == "pending" || status == "running",
    };
    if !allowed {
        return Err(Error::Conflict);
    }
    let updated = match action {
        OperatorAction::RunNow => db.execute(
            "UPDATE sync_jobs SET status='pending',worker_id='',leased_until=NULL,run_after=clock_timestamp(),updated_at=clock_timestamp() WHERE id=$1 AND project_id=$2",
            &[&job_id, &project_id],
        )?,
        OperatorAction::ResetAttempts => db.execute(
            "UPDATE sync_jobs SET status='pending',attempts=0,worker_id='',leased_until=NULL,run_after=clock_timestamp(),last_error='',updated_at=clock_timestamp() WHERE id=$1 AND project_id=$2",
            &[&job_id, &project_id],
        )?,
        OperatorAction::Cancel => db.execute(
            "UPDATE sync_jobs SET status='cancelled',worker_id='',leased_until=NULL,run_after=clock_timestamp(),last_error='cancelled by operator',updated_at=clock_timestamp() WHERE id=$1 AND project_id=$2",
            &[&job_id, &project_id],
        )?,
    };
    if updated != 1 {
        return Err(Error::Conflict);
    }
    match action {
        OperatorAction::RunNow => {
            append_event(db, job_id, "scheduled", &scheduled_detail("run_now"))?
        }
        OperatorAction::ResetAttempts => {
            append_event(db, job_id, "scheduled", &scheduled_detail("reset_attempts"))?
        }
        OperatorAction::Cancel => append_event(
            db,
            job_id,
            "cancelled",
            &json!({"reason":"operator_cancelled"}),
        )?,
    }
    Ok(())
}

fn lock(tx: &mut postgres::Transaction<'_>, j: &Job) -> Result<()> {
    if tx.query_opt("SELECT id FROM sync_jobs WHERE id=$1 AND project_id=$2 AND connection_id=$3 AND operation=$4 AND worker_id=$5 AND leased_until=$6 AND input=$7 AND status='running' AND leased_until>clock_timestamp() FOR UPDATE",&[&j.id,&j.project_id,&j.connection_id,&j.operation,&j.worker_id,&j.leased_until,&j.input])?.is_none(){return Err(Error::LeaseLost)}
    Ok(())
}
