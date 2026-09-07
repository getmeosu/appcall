//! Process-local webhook history. Sync operations require a durable scheduler.
use super::MemoryRepository;
use crate::{
    data_routes::{event_error, event_page, event_response, sanitize, LogKind, LogQuery},
    ApiError, Request, Response, Result,
};
use appcall_auth::{Grant, Principal, WebhookClaims, WebhookVerifier};
use appcall_events::{Cursor, Event, EventPage, IngestResult, ParsedWebhook};
use appcall_runner_client::{
    RequestContext, RunnerClient, WebhookParseRequest, WebhookVerifyRequest,
};
use appcall_store::{Connection, Status};
use serde_json::json;
use std::{collections::BTreeMap, sync::Arc};
#[derive(Clone)]
pub struct MemoryEvents {
    repo: MemoryRepository,
    runner: Option<RunnerClient>,
    verifier: Option<Arc<WebhookVerifier>>,
    activity: Arc<crate::streaming::StreamActivity>,
    admission: Arc<tokio::sync::Semaphore>,
}
impl MemoryEvents {
    pub fn new(
        repo: MemoryRepository,
        runner: Option<RunnerClient>,
        verifier: Option<WebhookVerifier>,
    ) -> Self {
        Self {
            repo,
            runner,
            verifier: verifier.map(Arc::new),
            activity: Arc::new(Default::default()),
            admission: Arc::new(tokio::sync::Semaphore::new(16)),
        }
    }
    pub fn retirement_ready(&self) -> bool {
        self.activity.idle()
    }
    pub fn public_exact(&self, method: &str, path: &str) -> bool {
        crate::event_routes::public_exact(method, path)
    }
    pub(crate) fn accept(
        &self,
        expected: &Connection,
        expected_revision: u64,
        parsed: &ParsedWebhook,
    ) -> Result<IngestResult> {
        // Reject scheduling even for a duplicate: no in-memory durable-success fiction.
        if !parsed.operation.is_empty() {
            return Err(ApiError::new("WEBHOOK_SYNC_UNAVAILABLE"));
        }
        appcall_events::validate_parsed(&expected.connector, parsed).map_err(
            |error| match error {
                appcall_events::Error::Invalid => ApiError::new("INVALID_WEBHOOK_PAYLOAD"),
                other => event_error(other),
            },
        )?;
        let payload = sanitize(&parsed.sanitized, &[]);
        let mut data = self
            .repo
            .lock()
            .map_err(|_| ApiError::new("WEBHOOK_INGEST_FAILED"))?;
        let current = data
            .connections
            .get(&expected.id)
            .ok_or_else(|| ApiError::new("CONNECTION_NOT_FOUND"))?;
        // A disconnect/reactivate can restore identical fields. The monotonic
        // revision still invalidates every parser result started before it.
        if data.connection_revision.get(&expected.id).copied() != Some(expected_revision)
            || current.project_id != expected.project_id
            || current.connector != expected.connector
            || current.status != Status::Active
            || current.external_account_id != expected.external_account_id
            || current.secret_ref_id != expected.secret_ref_id
            || current.auth_type != expected.auth_type
            || current.credential_owner != expected.credential_owner
        {
            return Err(ApiError::new("CONNECTION_CHANGED"));
        }
        let id = if parsed.idempotency_key.is_empty() {
            format!("wh_{}", uuid::Uuid::new_v4().simple())
        } else {
            parsed.idempotency_key.clone()
        };
        let key = (expected.project_id.clone(), id.clone());
        if let Some(old) = data.events.get(&key) {
            if old.connection_id != expected.id
                || old.connector != expected.connector
                || old.external_account_id != expected.external_account_id
            {
                return Err(ApiError::new("CONNECTION_CHANGED"));
            }
            return Ok(IngestResult {
                event_id: id,
                duplicate: true,
            });
        }
        let position = data
            .next_sequence
            .checked_add(1)
            .ok_or_else(|| ApiError::new("MEMORY_CAPACITY_EXCEEDED"))?;
        let event = Event {
            id: id.clone(),
            project_id: expected.project_id.clone(),
            connection_id: expected.id.clone(),
            external_account_id: expected.external_account_id.clone(),
            connector: expected.connector.clone(),
            operation: String::new(),
            payload,
            created_at: chrono::Utc::now(),
            stream_position: position,
        };
        let bytes = serde_json::to_vec(&event)
            .map_err(|_| ApiError::new("WEBHOOK_INGEST_FAILED"))?
            .len();
        let usage_id = format!(
            "usage_webhook_{}_{}_{}",
            expected.project_id.len(),
            expected.project_id,
            id
        );
        let usage_key = (
            expected.project_id.clone(),
            expected.external_account_id.clone(),
            event.created_at.format("%Y-%m").to_string(),
            "webhook_event".into(),
        );
        let usage_total = data
            .usage_monthly
            .get(&usage_key)
            .copied()
            .unwrap_or(0)
            .checked_add(1)
            .ok_or_else(|| ApiError::new("MEMORY_CAPACITY_EXCEEDED"))?;
        let retained = bytes
            .checked_add(
                usage_id.len()
                    + expected.project_id.len()
                    + expected.id.len()
                    + expected.external_account_id.len()
                    + expected.connector.len()
                    + 512,
            )
            .ok_or_else(|| ApiError::new("MEMORY_CAPACITY_EXCEEDED"))?;
        data.check_capacity(self.repo.state.limits, retained, 2)
            .map_err(|_| ApiError::new("MEMORY_CAPACITY_EXCEEDED"))?;
        data.usage_events.insert(
            usage_id.clone(),
            super::state::UsageEvent {
                id: usage_id,
                project_id: expected.project_id.clone(),
                connection_id: expected.id.clone(),
                external_account_id: expected.external_account_id.clone(),
                connector: expected.connector.clone(),
                action: String::new(),
                kind: "webhook_event".into(),
                quantity: 1,
                occurred_at: event.created_at,
            },
        );
        data.usage_monthly.insert(usage_key, usage_total);
        data.bytes_used += retained;
        data.next_sequence = position;
        data.events.insert(key, event);
        Ok(IngestResult {
            event_id: id,
            duplicate: false,
        })
    }
    fn page(
        &self,
        p: &Principal,
        q: Option<&LogQuery>,
        cursor: &str,
        forward: bool,
    ) -> Result<EventPage> {
        authorize(p)?;
        let boundary = if cursor.is_empty() {
            None
        } else {
            Some(appcall_events::decode_cursor(cursor).map_err(event_error)?)
        };
        if !forward && matches!(boundary, Some(Cursor::Position(_))) {
            return Err(ApiError::new("INVALID_CURSOR"));
        }
        let data = self
            .repo
            .lock()
            .map_err(|_| ApiError::new("WEBHOOK_EVENTS_FAILED"))?;
        let mut events: Vec<_> = data
            .events
            .values()
            .filter(|e| {
                e.project_id == p.project_id
                    && p.brand_id
                        .as_ref()
                        .is_none_or(|b| *b == e.external_account_id)
                    && q.is_none_or(|q| {
                        [
                            ("connectionId", &e.connection_id),
                            ("connector", &e.connector),
                            ("operation", &e.operation),
                        ]
                        .into_iter()
                        .all(|(key, value)| q.get(key).is_empty() || q.get(key) == value)
                    })
                    && match &boundary {
                        None => true,
                        Some(Cursor::Position(n)) => e.stream_position > *n,
                        Some(Cursor::Time(at, id)) => {
                            if forward {
                                (e.created_at, &e.id) > (*at, id)
                            } else {
                                (e.created_at, &e.id) < (*at, id)
                            }
                        }
                    }
            })
            .collect();
        if forward {
            events.sort_by_key(|e| e.stream_position)
        } else {
            events.sort_by(|a, b| (b.created_at, &b.id).cmp(&(a.created_at, &a.id)));
        }
        let limit = if forward {
            crate::event_routes::STREAM_PAGE_SIZE
        } else {
            q.map_or(50, |q| q.limit as usize)
        };
        let has_more = events.len() > limit;
        events.truncate(limit);
        let next_cursor = if forward || has_more {
            events
                .last()
                .map(|e| {
                    if forward {
                        appcall_events::stream_cursor(e)
                    } else {
                        appcall_events::history_cursor(e)
                    }
                })
                .unwrap_or_default()
        } else {
            String::new()
        };
        Ok(EventPage {
            events: events.into_iter().cloned().collect(),
            next_cursor,
            has_more,
        })
    }
    pub async fn poll(&self, p: &Principal, cursor: &str) -> Result<Vec<Event>> {
        self.page(p, None, cursor, true).map(|p| p.events)
    }
    pub async fn open(
        &self,
        p: Principal,
        cursor: String,
        shutdown: tokio::sync::watch::Receiver<bool>,
        verify: crate::streaming::SessionVerifier,
        dashboard: bool,
    ) -> Result<crate::streaming::EventReceiver> {
        crate::streaming::open_source(
            Arc::new(MemoryPoller {
                events: self.clone(),
                principal: p.clone(),
            }),
            p,
            cursor,
            shutdown,
            verify,
            dashboard,
        )
        .await
    }
    fn get(&self, p: &Principal, id: &str) -> Result<Event> {
        authorize(p)?;
        self.repo
            .lock()
            .map_err(|_| ApiError::new("WEBHOOK_EVENTS_FAILED"))?
            .events
            .get(&(p.project_id.clone(), id.to_owned()))
            .filter(|e| {
                p.brand_id
                    .as_ref()
                    .is_none_or(|b| *b == e.external_account_id)
            })
            .cloned()
            .ok_or_else(|| ApiError::new("WEBHOOK_EVENT_NOT_FOUND"))
    }
    pub async fn handle(
        &self,
        principal: Option<&Principal>,
        request: &Request,
    ) -> Result<Option<Response>> {
        let url = crate::validate_request_uri(&request.uri)?;
        let path = request.uri.split('?').next().unwrap_or("");
        if crate::event_routes::public_exact(&request.method, path) {
            return self.ingest(principal, request, &url).await.map(Some);
        }
        let value = if request.method == "GET" && path == "/v1/webhook-events" {
            let p = principal.ok_or_else(|| ApiError::new("UNAUTHORIZED"))?;
            let q = LogQuery::parse_for(&url, LogKind::Webhook)?;
            event_page(self.page(p, Some(&q), q.get("cursor"), false)?)
        } else if let Some(tail) = path.strip_prefix("/v1/webhook-events/") {
            let p = principal.ok_or_else(|| ApiError::new("UNAUTHORIZED"))?;
            let (id, replay) = if request.method == "POST" {
                match tail.strip_suffix("/replay") {
                    Some(id) => (id, true),
                    None => return Ok(None),
                }
            } else if request.method == "GET" {
                (tail, false)
            } else {
                return Ok(None);
            };
            if id.is_empty() || id.contains('/') {
                return Ok(None);
            }
            let id = percent_encoding::percent_decode_str(id)
                .decode_utf8()
                .map_err(|_| ApiError::new("INVALID_REQUEST"))?;
            let event = self.get(p, &id)?;
            if replay {
                if !p.scopes.permits("events:replay") {
                    return Err(ApiError::new("FORBIDDEN"));
                }
                if !event.operation.is_empty() {
                    return Err(ApiError::new("WEBHOOK_SYNC_UNAVAILABLE"));
                }
                return Ok(Some(Response {
                    status: 202,
                    body: json!({"eventId":id,"replayed":true}),
                    headers: vec![],
                }));
            }
            event_response(&event)
        } else {
            return Ok(None);
        };
        Ok(Some(Response {
            status: 200,
            body: value,
            headers: vec![],
        }))
    }
    async fn ingest(
        &self,
        p: Option<&Principal>,
        request: &Request,
        url: &url::Url,
    ) -> Result<Response> {
        let _permit = self
            .admission
            .clone()
            .try_acquire_owned()
            .map_err(|_| ApiError::new("SERVICE_BUSY"))?;
        if request.body.len() > 1024 * 1024
            || request.headers.len() > 64
            || request
                .headers
                .iter()
                .map(|(k, v)| k.len() + v.len())
                .sum::<usize>()
                > 16384
        {
            return Err(ApiError::new("WEBHOOK_PAYLOAD_TOO_LARGE"));
        }
        let parts: Vec<_> = url.path().split('/').collect();
        let connection = decode(parts[3])?;
        let connector = decode(parts[5])?;
        let tokens: Vec<_> = url
            .query_pairs()
            .filter(|(k, _)| k == "token")
            .map(|(_, v)| v.into_owned())
            .collect();
        if tokens.len() > 1 {
            return Err(ApiError::new("UNAUTHORIZED"));
        }
        let claims = if let Some(token) = tokens.first() {
            self.verifier
                .as_ref()
                .ok_or_else(|| ApiError::new("UNAUTHORIZED"))?
                .verify_scoped(token, &connector, &connection)
                .map_err(|_| ApiError::new("UNAUTHORIZED"))?
        } else {
            let p = p.ok_or_else(|| ApiError::new("UNAUTHORIZED"))?;
            WebhookClaims {
                project_id: p.project_id.clone(),
                connection_id: connection,
                connector,
            }
        };
        if p.is_some_and(|p| p.project_id != claims.project_id || !p.scopes.permits("events:write"))
        {
            return Err(ApiError::new("FORBIDDEN"));
        }
        let (expected, expected_revision) = self
            .repo
            .get_connection(&claims.project_id, None, &claims.connection_id)
            .map_err(|_| ApiError::new("CONNECTION_NOT_FOUND"))?;
        if expected.status != Status::Active || expected.connector != claims.connector {
            return Err(ApiError::new("CONNECTION_NOT_FOUND"));
        }
        if p.is_some_and(|p| {
            !p.allowed_brands.permits(&expected.external_account_id)
                || p.brand_id
                    .as_ref()
                    .is_some_and(|b| *b != expected.external_account_id)
        }) {
            return Err(ApiError::new("FORBIDDEN"));
        }
        let mut headers = BTreeMap::new();
        for (k, v) in &request.headers {
            if headers.insert(k.to_ascii_lowercase(), v.clone()).is_some() {
                return Err(ApiError::new("INVALID_WEBHOOK_PAYLOAD"));
            }
        }
        let payload: serde_json::Value = serde_json::from_slice(&request.body)
            .map_err(|_| ApiError::new("INVALID_WEBHOOK_PAYLOAD"))?;
        let Some(runner) = self.runner.as_ref() else {
            // Explicit local development parser. API identity is required even
            // when a valid callback token exists; no provider verification claim.
            p.ok_or_else(|| ApiError::new("UNAUTHORIZED"))?;
            let parsed = ParsedWebhook {
                idempotency_key: payload
                    .get("event_id")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .into(),
                operation: payload
                    .get("operation")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .into(),
                sanitized: sanitize(&payload, &[]),
            };
            return accepted_response(self.accept(&expected, expected_revision, &parsed)?);
        };
        let context = RequestContext {
            request_id: format!("webhook_{}", uuid::Uuid::new_v4().simple()),
            deadline_unix_ms: Some(chrono::Utc::now().timestamp_millis() as u64 + 10000),
        };
        let verified = runner
            .webhook_verify(
                &context,
                WebhookVerifyRequest {
                    connector_key: claims.connector.clone(),
                    headers,
                    payload: payload.clone(),
                },
            )
            .await
            .map_err(|_| ApiError::new("WEBHOOK_INGEST_FAILED"))?;
        if !verified.verified {
            return Err(ApiError::new("WEBHOOK_SIGNATURE_INVALID"));
        }
        let parsed = runner
            .webhook_parse(
                &context,
                WebhookParseRequest {
                    connector_key: claims.connector,
                    payload,
                },
            )
            .await
            .map_err(|_| ApiError::new("WEBHOOK_INGEST_FAILED"))?;
        let result = self.accept(
            &expected,
            expected_revision,
            &ParsedWebhook {
                idempotency_key: parsed.idempotency_key,
                operation: parsed.operation,
                sanitized: parsed.sanitized,
            },
        )?;
        accepted_response(result)
    }
}
fn accepted_response(result: IngestResult) -> Result<Response> {
    Ok(Response {
        status: if result.duplicate { 200 } else { 202 },
        body: serde_json::to_value(result).map_err(|_| ApiError::new("WEBHOOK_INGEST_FAILED"))?,
        headers: vec![],
    })
}

fn decode(s: &str) -> Result<String> {
    percent_encoding::percent_decode_str(s)
        .decode_utf8()
        .map(|s| s.into_owned())
        .map_err(|_| ApiError::new("INVALID_REQUEST"))
}
fn authorize(p: &Principal) -> Result<()> {
    if p.project_id.is_empty() || !p.scopes.permits("events:read") {
        return Err(ApiError::new("FORBIDDEN"));
    }
    match &p.brand_id {
        Some(b) if !b.is_empty() && p.allowed_brands.permits(b) => Ok(()),
        None if p.allowed_brands == Grant::All => Ok(()),
        _ => Err(ApiError::new("FORBIDDEN")),
    }
}
struct MemoryPoller {
    events: MemoryEvents,
    principal: Principal,
}
impl crate::streaming::Poller for MemoryPoller {
    fn activity(&self) -> Option<Arc<crate::streaming::StreamActivity>> {
        Some(self.events.activity.clone())
    }
    fn poll<'a>(
        &'a self,
        cursor: &'a str,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<Vec<Event>>> + Send + 'a>> {
        Box::pin(self.events.poll(&self.principal, cursor))
    }
}
