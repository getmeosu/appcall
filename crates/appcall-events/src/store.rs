use crate::{
    cursor::{self, Cursor},
    input::{self, valid_id},
    *,
};
use appcall_auth::{Grant, Principal, WebhookClaims, WebhookVerifier};
use chrono::{DateTime, Utc};
use postgres::{types::ToSql, Client, Row, Transaction};
use uuid::Uuid;

pub struct PgEvents<'a> {
    client: &'a mut Client,
}
impl<'a> PgEvents<'a> {
    pub fn new(client: &'a mut Client) -> Self {
        Self { client }
    }
    pub fn ingest(
        &mut self,
        verifier: &WebhookVerifier,
        request: &IngestRequest<'_>,
        parser: &impl WebhookParser,
    ) -> Result<IngestResult> {
        if request.raw.len() > 1024 * 1024
            || request.headers.len() > 128
            || request
                .headers
                .iter()
                .map(|(k, v)| k.len() + v.len())
                .sum::<usize>()
                > 32768
        {
            return Err(Error::TooLarge);
        }
        let claims = verifier
            .verify_scoped(request.token, request.connector, request.connection_id)
            .map_err(|_| Error::Signature)?;
        let expected_revision = connection_revision_snapshot(self.client, &claims)?;
        let parsed = parser.verify_and_parse(&claims.connector, request.headers, request.raw)?;
        self.accept_checked(&claims, &parsed, None, expected_revision)
    }
    /// Accept only a signature-verified parser result and token-derived scope.
    pub fn accept(
        &mut self,
        claims: &WebhookClaims,
        parsed: &ParsedWebhook,
    ) -> Result<IngestResult> {
        self.accept_checked(claims, parsed, None, None)
    }
    /// Preserve the exact connection identity whose scope was checked before RPC.
    pub fn accept_for_connection(
        &mut self,
        claims: &WebhookClaims,
        parsed: &ParsedWebhook,
        expected: &appcall_store::Connection,
        expected_revision: i64,
    ) -> Result<IngestResult> {
        self.accept_checked(claims, parsed, Some(expected), Some(expected_revision))
    }
    fn accept_checked(
        &mut self,
        claims: &WebhookClaims,
        parsed: &ParsedWebhook,
        expected: Option<&appcall_store::Connection>,
        expected_revision: Option<i64>,
    ) -> Result<IngestResult> {
        if !valid_id(&claims.project_id)
            || !valid_id(&claims.connection_id)
            || !valid_id(&claims.connector)
        {
            return Err(Error::Invalid);
        }
        input::validate_parsed(&claims.connector, parsed)?;
        let provider_event_key =
            (!parsed.idempotency_key.is_empty()).then_some(parsed.idempotency_key.as_str());
        let mut tx = self.client.transaction().map_err(|_| Error::Storage)?;
        tx.query_one(
            "SELECT pg_advisory_xact_lock(hashtextextended($1::text,741))",
            &[&claims.project_id],
        )
        .map_err(|_| Error::Storage)?;
        let connection_revision_column = connection_revision_column_exists(&mut tx)?;
        let event_revision_column = webhook_event_revision_column_exists(&mut tx)?;
        let connection_generation_column = connection_generation_column_exists(&mut tx)?;
        let event_generation_column = webhook_event_generation_column_exists(&mut tx)?;
        if connection_revision_column != event_revision_column
            || connection_generation_column != event_generation_column
            || expected_revision.is_some() && !connection_revision_column
        {
            return Err(Error::Storage);
        }
        let connection = if connection_revision_column && connection_generation_column {
            tx.query_opt("SELECT coalesce(external_account_id,''),coalesce(secret_ref_id,''),auth_type,credential_owner,connection_revision,connection_generation FROM connections WHERE project_id=$1 AND id=$2 AND connector=$3 AND status='active' FOR UPDATE",&[&claims.project_id,&claims.connection_id,&claims.connector]).map_err(|_|Error::Storage)?.ok_or(Error::NotFound)?
        } else if connection_revision_column {
            tx.query_opt("SELECT coalesce(external_account_id,''),coalesce(secret_ref_id,''),auth_type,credential_owner,connection_revision FROM connections WHERE project_id=$1 AND id=$2 AND connector=$3 AND status='active' FOR UPDATE",&[&claims.project_id,&claims.connection_id,&claims.connector]).map_err(|_|Error::Storage)?.ok_or(Error::NotFound)?
        } else if connection_generation_column {
            tx.query_opt("SELECT coalesce(external_account_id,''),coalesce(secret_ref_id,''),auth_type,credential_owner,connection_generation FROM connections WHERE project_id=$1 AND id=$2 AND connector=$3 AND status='active' FOR UPDATE",&[&claims.project_id,&claims.connection_id,&claims.connector]).map_err(|_|Error::Storage)?.ok_or(Error::NotFound)?
        } else {
            tx.query_opt("SELECT coalesce(external_account_id,''),coalesce(secret_ref_id,''),auth_type,credential_owner FROM connections WHERE project_id=$1 AND id=$2 AND connector=$3 AND status='active' FOR UPDATE",&[&claims.project_id,&claims.connection_id,&claims.connector]).map_err(|_|Error::Storage)?.ok_or(Error::NotFound)?
        };
        let snapshot = ConnectionSnapshot {
            brand: connection.get(0),
            secret_ref_id: connection.get(1),
            auth_type: connection.get(2),
            credential_owner: connection.get(3),
            revision: connection_revision_column.then(|| connection.get::<_, i64>(4)),
            generation: connection_generation_column
                .then(|| connection.get::<_, i64>(if connection_revision_column { 5 } else { 4 })),
        };
        let brand = &snapshot.brand;
        let current_revision = snapshot.revision;
        let current_generation = snapshot.generation;
        let revision_value = current_revision.unwrap_or_default();
        let generation_value = current_generation.unwrap_or_default();
        if expected_revision.is_some_and(|revision| current_revision != Some(revision)) {
            return Err(Error::Conflict);
        }
        if expected.is_some_and(|c| {
            c.project_id != claims.project_id
                || c.id != claims.connection_id
                || c.connector != claims.connector
                || c.status != appcall_store::Status::Active
                || c.external_account_id != *brand
                || c.secret_ref_id != snapshot.secret_ref_id
                || c.auth_type.as_str() != snapshot.auth_type
                || c.credential_owner.as_str() != snapshot.credential_owner
        }) {
            return Err(Error::Conflict);
        }
        let scoped_dedup = provider_event_key_column_exists(&mut tx)?;
        if provider_event_key.is_some() && !scoped_dedup {
            // Do not store a provider key as a public ID while an older schema
            // is still active; that would make a later migration unable to
            // distinguish provider provenance from legacy resource IDs.
            return Err(Error::Storage);
        }
        if let Some(provider_event_key) = provider_event_key {
            let prior = if connection_generation_column {
                if current_generation.is_none() {
                    return Err(Error::Storage);
                }
                tx.query_opt(
                    "SELECT id,external_account_id FROM webhook_events WHERE project_id=$1 AND connector=$2 AND connection_id=$3 AND connection_generation=$5 AND provider_event_key=$4",
                    &[
                        &claims.project_id,
                        &claims.connector,
                        &claims.connection_id,
                        &provider_event_key,
                        &generation_value,
                    ],
                )
            } else if connection_revision_column {
                if current_revision.is_none() {
                    return Err(Error::Storage);
                }
                tx.query_opt(
                    "SELECT id,external_account_id FROM webhook_events WHERE project_id=$1 AND connector=$2 AND connection_id=$3 AND connection_revision=$5 AND provider_event_key=$4",
                    &[
                        &claims.project_id,
                        &claims.connector,
                        &claims.connection_id,
                        &provider_event_key,
                        &revision_value,
                    ],
                )
            } else {
                tx.query_opt(
                    "SELECT id,external_account_id FROM webhook_events WHERE project_id=$1 AND connector=$2 AND connection_id=$3 AND provider_event_key=$4",
                    &[
                        &claims.project_id,
                        &claims.connector,
                        &claims.connection_id,
                        &provider_event_key,
                    ],
                )
            }
            .map_err(|_| Error::Storage)?;
            if let Some(prior) = prior {
                if prior.get::<_, String>(1).as_str() != brand.as_str() {
                    return Err(Error::Conflict);
                }
                let id: String = prior.get(0);
                tx.commit().map_err(|_| Error::Storage)?;
                return Ok(IngestResult {
                    event_id: id,
                    duplicate: true,
                });
            }
            if let Some(prior) = tx
                .query_opt(
                    "SELECT provider_event_key FROM webhook_events WHERE project_id=$1 AND id=$2",
                    &[&claims.project_id, &provider_event_key],
                )
                .map_err(|_| Error::Storage)?
            {
                let known_provider_key: Option<String> = prior.get(0);
                if known_provider_key.is_none() {
                    // A NULL key is an intentionally unknown legacy row. A
                    // matching provider key is an ambiguous redelivery, not a
                    // safe duplicate and not a safe new insert.
                    return Err(Error::Conflict);
                }
            }
        }
        // Event.id is the opaque public resource identity. The raw provider
        // key is stored only in provider_event_key for scoped deduplication.
        let id = fresh_public_id(&mut tx, &claims.project_id)?;
        let mut columns = vec![
            "id",
            "project_id",
            "connection_id",
            "connector",
            "operation",
            "payload",
            "external_account_id",
        ];
        let mut params: Vec<&(dyn ToSql + Sync)> = vec![
            &id,
            &claims.project_id,
            &claims.connection_id,
            &claims.connector,
            &parsed.operation,
            &parsed.sanitized,
            brand,
        ];
        if connection_revision_column {
            columns.push("connection_revision");
            if current_revision.is_none() {
                return Err(Error::Storage);
            }
            params.push(&revision_value);
        }
        if connection_generation_column {
            columns.push("connection_generation");
            if current_generation.is_none() {
                return Err(Error::Storage);
            }
            params.push(&generation_value);
        }
        if scoped_dedup {
            columns.push("provider_event_key");
            params.push(&provider_event_key);
        }
        let placeholders = (1..=params.len())
            .map(|position| format!("${position}"))
            .collect::<Vec<_>>()
            .join(",");
        let sql = format!(
            "INSERT INTO webhook_events({}) VALUES({}) ON CONFLICT(project_id,id) DO NOTHING",
            columns.join(","),
            placeholders
        );
        let created = tx.execute(&sql, &params).map_err(|_| Error::Storage)? == 1;
        if created {
            tx.execute(
                "INSERT INTO webhook_outbox(project_id,event_id) VALUES($1,$2)",
                &[&claims.project_id, &id],
            )
            .map_err(|_| Error::Storage)?;
        } else {
            let prior = tx
                .query_one(
                    "SELECT connection_id,connector,external_account_id FROM webhook_events WHERE project_id=$1 AND id=$2",
                    &[&claims.project_id, &id],
                )
                .map_err(|_| Error::Storage)?;
            if prior.get::<_, String>(0) != claims.connection_id
                || prior.get::<_, String>(1) != claims.connector
                || prior.get::<_, String>(2).as_str() != brand.as_str()
            {
                return Err(Error::Conflict);
            }
        }
        tx.commit().map_err(|_| Error::Storage)?;
        Ok(IngestResult {
            event_id: id,
            duplicate: !created,
        })
    }
    pub fn get(&mut self, principal: &Principal, event_id: &str) -> Result<Event> {
        authorize(principal)?;
        let row=self.client.query_opt("SELECT * FROM webhook_events WHERE project_id=$1 AND id=$2 AND ($3::text IS NULL OR external_account_id=$3)",&[&principal.project_id,&event_id,&principal.brand_id]).map_err(|_|Error::Storage)?.ok_or(Error::NotFound)?;
        event(row)
    }
    pub fn list(&mut self, principal: &Principal, request: &ListRequest) -> Result<EventPage> {
        self.page(principal, request, false)
    }
    pub fn stream(&mut self, principal: &Principal, request: &ListRequest) -> Result<EventPage> {
        self.page(principal, request, true)
    }
    fn page(&mut self, p: &Principal, r: &ListRequest, forward: bool) -> Result<EventPage> {
        authorize(p)?;
        let limit = if r.limit == 0 {
            if forward {
                100
            } else {
                50
            }
        } else {
            r.limit.min(100)
        };
        let mut position = 0_i64;
        let mut at: Option<DateTime<Utc>> = None;
        let mut id = String::new();
        if !r.cursor.is_empty() {
            match cursor::decode(&r.cursor)? {
                Cursor::Position(n) if forward => position = n,
                Cursor::Position(_) => return Err(Error::Invalid),
                Cursor::Time(time, key) => {
                    at = Some(time);
                    id = key;
                }
            }
        }
        let sql = if forward {
            "SELECT * FROM webhook_events WHERE project_id=$1 AND ($2::text IS NULL OR external_account_id=$2) AND ($3::text='' OR connection_id=$3) AND ($4::text='' OR connector=$4) AND ($5::text='' OR operation=$5) AND stream_position>$6 AND ($7::timestamptz IS NULL OR (created_at,id)>($7,$8::text)) ORDER BY stream_position LIMIT $9"
        } else {
            "WITH snapshot AS (SELECT l.stream_position AS snapshot_position,l.id AS snapshot_id FROM webhook_events l WHERE l.project_id=$1 AND ($2::text IS NULL OR l.external_account_id=$2) AND l.stream_position IS NOT NULL ORDER BY l.stream_position DESC LIMIT 1) SELECT page.*,snapshot.snapshot_position,snapshot.snapshot_id FROM snapshot LEFT JOIN LATERAL (SELECT l.* FROM webhook_events l WHERE l.project_id=$1 AND ($2::text IS NULL OR l.external_account_id=$2) AND ($3::text='' OR l.connection_id=$3) AND ($4::text='' OR l.connector=$4) AND ($5::text='' OR l.operation=$5) AND l.stream_position>$6 AND ($7::timestamptz IS NULL OR (l.created_at,l.id)<($7,$8::text)) ORDER BY l.created_at DESC,l.id DESC LIMIT $9) page ON TRUE"
        };
        let rows = self
            .client
            .query(
                sql,
                &[
                    &p.project_id,
                    &p.brand_id,
                    &r.connection_id,
                    &r.connector,
                    &r.operation,
                    &position,
                    &at,
                    &id,
                    &((limit + 1) as i64),
                ],
            )
            .map_err(|_| Error::Storage)?;
        let snapshot_cursor = if forward {
            String::new()
        } else {
            match rows.first() {
                None => String::new(),
                Some(row) => {
                    let position: Option<i64> = row
                        .try_get("snapshot_position")
                        .map_err(|_| Error::Storage)?;
                    let id: Option<String> =
                        row.try_get("snapshot_id").map_err(|_| Error::Storage)?;
                    match (position, id) {
                        (Some(position), Some(id))
                            if position > 0
                                && !id.is_empty()
                                && id.len() <= 1024
                                && !id.chars().any(char::is_control) =>
                        {
                            stream_cursor_at(position, &id)
                        }
                        _ => return Err(Error::Storage),
                    }
                }
            }
        };
        let mut events = Vec::new();
        for row in rows {
            if row
                .try_get::<_, Option<String>>("id")
                .map_err(|_| Error::Storage)?
                .is_some()
            {
                events.push(event(row)?);
            }
        }
        let has_more = events.len() > limit;
        events.truncate(limit);
        let next_cursor = if forward || has_more {
            events
                .last()
                .map(|e| {
                    if forward {
                        stream_cursor(e)
                    } else {
                        history_cursor(e)
                    }
                })
                .unwrap_or_else(|| r.cursor.clone())
        } else {
            String::new()
        };
        Ok(EventPage {
            events,
            next_cursor,
            has_more,
            snapshot_cursor,
        })
    }
    pub fn replay(
        &mut self,
        principal: &Principal,
        event_id: &str,
        sink: &mut impl DispatchSink,
    ) -> Result<String> {
        if !principal.scopes.permits("events:replay") {
            return Err(Error::Forbidden);
        }
        let e = self.get(principal, event_id)?;
        let public_id = e.id.clone();
        if e.operation.is_empty() {
            return Ok(public_id);
        }
        let job = input::event_job(
            &e,
            format!("webhook-replay:{}:{}", e.id, Uuid::new_v4().simple()),
        )?;
        let mut tx = self.client.transaction().map_err(|_| Error::Storage)?;
        if let Some(job) = job {
            ensure_current_connection(&mut tx, &e)?;
            sink.schedule(&mut tx, &job)?;
        }
        tx.commit().map_err(|_| Error::Storage)?;
        Ok(public_id)
    }
    pub fn dispatch_pending(
        &mut self,
        limit: usize,
        sink: &mut impl DispatchSink,
    ) -> Result<DispatchReport> {
        let limit = if limit == 0 { 100 } else { limit.min(1000) };
        let mut report = DispatchReport::default();
        for _ in 0..limit {
            let mut tx = self.client.transaction().map_err(|_| Error::Storage)?;
            let terminal_columns = webhook_outbox_terminal_columns_exist(&mut tx)?;
            let row = if terminal_columns {
                tx.query_opt("SELECT e.*,o.attempts AS outbox_attempts,o.status AS outbox_status FROM webhook_outbox o JOIN webhook_events e ON e.project_id=o.project_id AND e.id=o.event_id WHERE o.status='pending' AND o.dispatched_at IS NULL AND o.next_attempt_at<=clock_timestamp() ORDER BY o.next_attempt_at,e.stream_position FOR UPDATE OF o SKIP LOCKED LIMIT 1", &[])
            } else {
                tx.query_opt("SELECT e.*,o.attempts AS outbox_attempts FROM webhook_outbox o JOIN webhook_events e ON e.project_id=o.project_id AND e.id=o.event_id WHERE o.dispatched_at IS NULL AND o.next_attempt_at<=clock_timestamp() ORDER BY o.next_attempt_at,e.stream_position FOR UPDATE OF o SKIP LOCKED LIMIT 1", &[])
            }
            .map_err(|_| Error::Storage)?;
            let Some(row) = row else { break };
            let attempts: i32 = row.try_get("outbox_attempts").map_err(|_| Error::Storage)?;
            let e = event(row)?;
            let result = {
                let mut effects = tx.transaction().map_err(|_| Error::Storage)?;
                match dispatch(&mut effects, &e, sink, terminal_columns) {
                    Ok(()) => effects.commit().map_err(|_| Error::Storage),
                    Err(err) => {
                        effects.rollback().map_err(|_| Error::Storage)?;
                        Err(err)
                    }
                }
            };
            match result {
                Ok(()) => {
                    report.completed += 1;
                }
                Err(error) => {
                    let error_code = dispatch_error_code(error);
                    let next_attempt = attempts.saturating_add(1).min(10);
                    if terminal_columns && next_attempt >= 10 {
                        tx.execute(
                            "UPDATE webhook_outbox
                                SET attempts=$3,status='dead_letter',last_error_code=$4,
                                    dead_lettered_at=clock_timestamp(),next_attempt_at=clock_timestamp()
                              WHERE project_id=$1 AND event_id=$2",
                            &[&e.project_id, &e.id, &next_attempt, &error_code],
                        )
                        .map_err(|_| Error::Storage)?;
                        report.dead_lettered += 1;
                    } else if terminal_columns {
                        tx.execute(
                            "UPDATE webhook_outbox
                                SET attempts=$3,status='pending',last_error_code=$4,
                                    dead_lettered_at=NULL,
                                    next_attempt_at=clock_timestamp()+make_interval(secs=>least(300,power(2,($5::integer)::double precision))::double precision)
                              WHERE project_id=$1 AND event_id=$2",
                            &[&e.project_id, &e.id, &next_attempt, &error_code, &attempts],
                        )
                        .map_err(|_| Error::Storage)?;
                    } else {
                        tx.execute("UPDATE webhook_outbox SET attempts=$3,next_attempt_at=clock_timestamp()+make_interval(secs=>least(300,power(2,($4::integer)::double precision))::double precision) WHERE project_id=$1 AND event_id=$2", &[&e.project_id, &e.id, &next_attempt, &attempts]).map_err(|_| Error::Storage)?;
                    }
                    report.failed += 1;
                }
            }
            tx.commit().map_err(|_| Error::Storage)?;
        }
        Ok(report)
    }
}
fn connection_revision_snapshot(
    client: &mut Client,
    claims: &WebhookClaims,
) -> Result<Option<i64>> {
    let exists = client
        .query_one(
            "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='connections' AND column_name='connection_revision')",
            &[],
        )
        .map_err(|_| Error::Storage)?
        .get::<_, bool>(0);
    if !exists {
        return Ok(None);
    }
    let revision = client
        .query_opt(
            "SELECT connection_revision FROM connections WHERE project_id=$1 AND id=$2 AND connector=$3 AND status='active'",
            &[&claims.project_id, &claims.connection_id, &claims.connector],
        )
        .map_err(|_| Error::Storage)?
        .ok_or(Error::NotFound)?
        .get(0);
    Ok(Some(revision))
}

fn connection_revision_column_exists(tx: &mut Transaction<'_>) -> Result<bool> {
    tx.query_one(
        "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='connections' AND column_name='connection_revision')",
        &[],
    )
    .map(|row| row.get(0))
    .map_err(|_| Error::Storage)
}

fn webhook_event_revision_column_exists(tx: &mut Transaction<'_>) -> Result<bool> {
    tx.query_one(
        "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='webhook_events' AND column_name='connection_revision')",
        &[],
    )
    .map(|row| row.get(0))
    .map_err(|_| Error::Storage)
}

fn connection_generation_column_exists(tx: &mut Transaction<'_>) -> Result<bool> {
    tx.query_one(
        "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='connections' AND column_name='connection_generation')",
        &[],
    )
    .map(|row| row.get(0))
    .map_err(|_| Error::Storage)
}

fn webhook_event_generation_column_exists(tx: &mut Transaction<'_>) -> Result<bool> {
    tx.query_one(
        "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='webhook_events' AND column_name='connection_generation')",
        &[],
    )
    .map(|row| row.get(0))
    .map_err(|_| Error::Storage)
}

fn provider_event_key_column_exists(tx: &mut Transaction<'_>) -> Result<bool> {
    tx.query_one(
        "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='webhook_events' AND column_name='provider_event_key')",
        &[],
    )
    .map(|row| row.get(0))
    .map_err(|_| Error::Storage)
}

fn webhook_outbox_terminal_columns_exist(tx: &mut Transaction<'_>) -> Result<bool> {
    tx.query_one(
        "SELECT count(*) = 3
           FROM information_schema.columns
          WHERE table_schema=current_schema()
            AND table_name='webhook_outbox'
            AND column_name IN ('status','last_error_code','dead_lettered_at')",
        &[],
    )
    .map(|row| row.get(0))
    .map_err(|_| Error::Storage)
}

fn dispatch_error_code(error: Error) -> &'static str {
    match error {
        Error::NotFound | Error::Conflict => "CONNECTION_UNAVAILABLE",
        Error::ConfigurationRequired => "CONFIGURATION_REQUIRED",
        Error::Dispatch => "DISPATCH_FAILED",
        Error::Storage => "STORAGE_ERROR",
        Error::Invalid | Error::TooLarge => "INVALID_EVENT",
        Error::Signature | Error::Forbidden => "AUTHORIZATION_FAILED",
    }
}

struct ConnectionSnapshot {
    brand: String,
    secret_ref_id: String,
    auth_type: String,
    credential_owner: String,
    revision: Option<i64>,
    generation: Option<i64>,
}

fn fresh_public_id(tx: &mut Transaction<'_>, project_id: &str) -> Result<String> {
    for _ in 0..8 {
        let id = format!("wh_{}", Uuid::new_v4().simple());
        let exists = tx
            .query_opt(
                "SELECT 1 FROM webhook_events WHERE project_id=$1 AND id=$2",
                &[&project_id, &id],
            )
            .map_err(|_| Error::Storage)?;
        if exists.is_none() {
            return Ok(id);
        }
    }
    Err(Error::Storage)
}
fn authorize(p: &Principal) -> Result<()> {
    if !valid_id(&p.project_id) || !p.scopes.permits("events:read") {
        return Err(Error::Forbidden);
    }
    match &p.brand_id {
        Some(brand) if valid_id(brand) && p.allowed_brands.permits(brand) => Ok(()),
        None if p.allowed_brands == Grant::All => Ok(()),
        _ => Err(Error::Forbidden),
    }
}
fn event(row: Row) -> Result<Event> {
    Ok(Event {
        id: row.try_get("id").map_err(|_| Error::Storage)?,
        project_id: row.try_get("project_id").map_err(|_| Error::Storage)?,
        connection_id: row.try_get("connection_id").map_err(|_| Error::Storage)?,
        external_account_id: row
            .try_get("external_account_id")
            .map_err(|_| Error::Storage)?,
        connector: row.try_get("connector").map_err(|_| Error::Storage)?,
        operation: row.try_get("operation").map_err(|_| Error::Storage)?,
        payload: row.try_get("payload").map_err(|_| Error::Storage)?,
        created_at: row.try_get("created_at").map_err(|_| Error::Storage)?,
        stream_position: row.try_get("stream_position").map_err(|_| Error::Storage)?,
    })
}
fn ensure_current_connection(tx: &mut Transaction<'_>, e: &Event) -> Result<()> {
    tx.query_opt("SELECT id FROM connections WHERE project_id=$1 AND id=$2 AND connector=$3 AND status='active' AND coalesce(external_account_id,'')=$4 FOR SHARE",&[&e.project_id,&e.connection_id,&e.connector,&e.external_account_id]).map_err(|_|Error::Storage)?.ok_or(Error::NotFound)?;
    Ok(())
}
fn dispatch(
    tx: &mut Transaction<'_>,
    e: &Event,
    sink: &mut impl DispatchSink,
    terminal_columns: bool,
) -> Result<()> {
    if let Some(job) = input::event_job(e, format!("webhook:{}", e.id))? {
        ensure_current_connection(tx, e)?;
        sink.schedule(tx, &job)?;
    }
    let id = format!("usage_{}", Uuid::new_v4().simple());
    let key = format!("usage_webhook_{}", e.id);
    tx.execute("WITH inserted AS (INSERT INTO usage_events(id,project_id,connector,action,kind,occurred_at,external_account_id,quantity,metering_event_key) VALUES($1,$2,'','','webhook_event',$3,$4,1,$5) ON CONFLICT(project_id,metering_event_key) DO NOTHING RETURNING project_id,external_account_id,occurred_at,kind,quantity) INSERT INTO usage_monthly_rollups(project_id,external_account_id,month,kind,quantity) SELECT project_id,external_account_id,to_char(occurred_at AT TIME ZONE 'UTC','YYYY-MM'),kind,quantity FROM inserted ON CONFLICT(project_id,external_account_id,month,kind) DO UPDATE SET quantity=usage_monthly_rollups.quantity+EXCLUDED.quantity,updated_at=now()",&[&id,&e.project_id,&e.created_at,&e.external_account_id,&key]).map_err(|_|Error::Storage)?;
    if terminal_columns {
        tx.execute(
            "UPDATE webhook_outbox
                SET dispatched_at=clock_timestamp(),status='dispatched',
                    last_error_code='',dead_lettered_at=NULL
              WHERE project_id=$1 AND event_id=$2",
            &[&e.project_id, &e.id],
        )
    } else {
        tx.execute(
            "UPDATE webhook_outbox SET dispatched_at=clock_timestamp()
              WHERE project_id=$1 AND event_id=$2",
            &[&e.project_id, &e.id],
        )
    }
    .map_err(|_| Error::Storage)?;
    Ok(())
}
