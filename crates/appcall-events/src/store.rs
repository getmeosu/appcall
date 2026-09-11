use crate::{
    cursor::{self, Cursor},
    input::{self, valid_id},
    *,
};
use appcall_auth::{Grant, Principal, WebhookClaims, WebhookVerifier};
use chrono::{DateTime, Utc};
use postgres::{Client, Row, Transaction};
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
        let parsed = parser.verify_and_parse(&claims.connector, request.headers, request.raw)?;
        self.accept(&claims, &parsed)
    }
    /// Accept only a signature-verified parser result and token-derived scope.
    pub fn accept(
        &mut self,
        claims: &WebhookClaims,
        parsed: &ParsedWebhook,
    ) -> Result<IngestResult> {
        self.accept_checked(claims, parsed, None)
    }
    /// Preserve the exact connection identity whose scope was checked before RPC.
    pub fn accept_for_connection(
        &mut self,
        claims: &WebhookClaims,
        parsed: &ParsedWebhook,
        expected: &appcall_store::Connection,
    ) -> Result<IngestResult> {
        self.accept_checked(claims, parsed, Some(expected))
    }
    fn accept_checked(
        &mut self,
        claims: &WebhookClaims,
        parsed: &ParsedWebhook,
        expected: Option<&appcall_store::Connection>,
    ) -> Result<IngestResult> {
        if !valid_id(&claims.project_id)
            || !valid_id(&claims.connection_id)
            || !valid_id(&claims.connector)
        {
            return Err(Error::Invalid);
        }
        input::validate_parsed(&claims.connector, parsed)?;
        let id = if parsed.idempotency_key.is_empty() {
            format!("wh_{}", Uuid::new_v4().simple())
        } else {
            parsed.idempotency_key.clone()
        };
        let mut tx = self.client.transaction().map_err(|_| Error::Storage)?;
        tx.query_one(
            "SELECT pg_advisory_xact_lock(hashtextextended($1::text,741))",
            &[&claims.project_id],
        )
        .map_err(|_| Error::Storage)?;
        let connection=tx.query_opt("SELECT coalesce(external_account_id,''),coalesce(secret_ref_id,''),auth_type,credential_owner FROM connections WHERE project_id=$1 AND id=$2 AND connector=$3 AND status='active' FOR SHARE",&[&claims.project_id,&claims.connection_id,&claims.connector]).map_err(|_|Error::Storage)?.ok_or(Error::NotFound)?;
        let brand: String = connection.get(0);
        if expected.is_some_and(|c| {
            c.project_id != claims.project_id
                || c.id != claims.connection_id
                || c.connector != claims.connector
                || c.status != appcall_store::Status::Active
                || c.external_account_id != brand
                || c.secret_ref_id != connection.get::<_, String>(1)
                || c.auth_type.as_str() != connection.get::<_, String>(2)
                || c.credential_owner.as_str() != connection.get::<_, String>(3)
        }) {
            return Err(Error::Conflict);
        }
        let created=tx.execute("INSERT INTO webhook_events(id,project_id,connection_id,connector,operation,payload,external_account_id) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(project_id,id) DO NOTHING",&[&id,&claims.project_id,&claims.connection_id,&claims.connector,&parsed.operation,&parsed.sanitized,&brand]).map_err(|_|Error::Storage)?==1;
        if created {
            tx.execute(
                "INSERT INTO webhook_outbox(project_id,event_id) VALUES($1,$2)",
                &[&claims.project_id, &id],
            )
            .map_err(|_| Error::Storage)?;
        } else {
            let prior=tx.query_one("SELECT connection_id,connector,external_account_id FROM webhook_events WHERE project_id=$1 AND id=$2",&[&claims.project_id,&id]).map_err(|_|Error::Storage)?;
            if prior.get::<_, String>(0) != claims.connection_id
                || prior.get::<_, String>(1) != claims.connector
                || prior.get::<_, String>(2) != brand
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
    ) -> Result<()> {
        if !principal.scopes.permits("events:replay") {
            return Err(Error::Forbidden);
        }
        let e = self.get(principal, event_id)?;
        if e.operation.is_empty() {
            return Ok(());
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
        tx.commit().map_err(|_| Error::Storage)
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
            let row=tx.query_opt("SELECT e.* FROM webhook_outbox o JOIN webhook_events e ON e.project_id=o.project_id AND e.id=o.event_id WHERE o.dispatched_at IS NULL AND o.next_attempt_at<=clock_timestamp() ORDER BY o.next_attempt_at,e.stream_position FOR UPDATE OF o SKIP LOCKED LIMIT 1",&[]).map_err(|_|Error::Storage)?;
            let Some(row) = row else { break };
            let e = event(row)?;
            let result = {
                let mut effects = tx.transaction().map_err(|_| Error::Storage)?;
                match dispatch(&mut effects, &e, sink) {
                    Ok(()) => effects.commit().map_err(|_| Error::Storage),
                    Err(err) => {
                        effects.rollback().map_err(|_| Error::Storage)?;
                        Err(err)
                    }
                }
            };
            if result.is_err() {
                tx.execute("UPDATE webhook_outbox SET attempts=least(attempts+1,10),next_attempt_at=clock_timestamp()+make_interval(secs=>least(300,power(2,attempts))::double precision) WHERE project_id=$1 AND event_id=$2",&[&e.project_id,&e.id]).map_err(|_|Error::Storage)?;
            }
            tx.commit().map_err(|_| Error::Storage)?;
            if result.is_ok() {
                report.completed += 1
            } else {
                report.failed += 1
            }
        }
        Ok(report)
    }
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
fn dispatch(tx: &mut Transaction<'_>, e: &Event, sink: &mut impl DispatchSink) -> Result<()> {
    if let Some(job) = input::event_job(e, format!("webhook:{}", e.id))? {
        ensure_current_connection(tx, e)?;
        sink.schedule(tx, &job)?;
    }
    let id = format!("usage_{}", Uuid::new_v4().simple());
    let key = format!("usage_webhook_{}", e.id);
    tx.execute("WITH inserted AS (INSERT INTO usage_events(id,project_id,connector,action,kind,occurred_at,external_account_id,quantity,metering_event_key) VALUES($1,$2,'','','webhook_event',$3,$4,1,$5) ON CONFLICT(project_id,metering_event_key) DO NOTHING RETURNING project_id,external_account_id,occurred_at,kind,quantity) INSERT INTO usage_monthly_rollups(project_id,external_account_id,month,kind,quantity) SELECT project_id,external_account_id,to_char(occurred_at AT TIME ZONE 'UTC','YYYY-MM'),kind,quantity FROM inserted ON CONFLICT(project_id,external_account_id,month,kind) DO UPDATE SET quantity=usage_monthly_rollups.quantity+EXCLUDED.quantity,updated_at=now()",&[&id,&e.project_id,&e.created_at,&e.external_account_id,&key]).map_err(|_|Error::Storage)?;
    tx.execute(
        "UPDATE webhook_outbox SET dispatched_at=now() WHERE project_id=$1 AND event_id=$2",
        &[&e.project_id, &e.id],
    )
    .map_err(|_| Error::Storage)?;
    Ok(())
}
