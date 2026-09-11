//! Signed provider callbacks and authenticated durable event history.
use crate::{ApiError, Request, Response, Result};
use appcall_auth::{Principal, WebhookClaims, WebhookVerifier};
use appcall_events::{Event, ListRequest, ParsedWebhook, PgEvents};
use appcall_runner_client::{
    RequestContext, RunnerClient, WebhookParseRequest, WebhookVerifyRequest,
};
use appcall_store::{Scope, Status, Store};
use serde_json::Value;
use std::{
    collections::BTreeMap,
    sync::{Arc, Mutex},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

pub const STREAM_PAGE_SIZE: usize = 16;

fn ingest_path(method: &str, path: &str) -> Option<(String, String)> {
    let parts: Vec<_> = path.strip_prefix('/')?.split('/').collect();
    if method != "POST"
        || parts.len() != 5
        || parts[0] != "v1"
        || parts[1] != "connections"
        || parts[3] != "webhooks"
    {
        return None;
    }
    if [parts[2], parts[4]].iter().any(|s| {
        s.is_empty()
            || s.len() > 256
            || *s == "."
            || *s == ".."
            || !s
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'_' | b'-' | b'.'))
    }) {
        return None;
    }
    Some((parts[2].into(), parts[4].into()))
}
/// Only these routes accept scoped callback authentication. A missing token still
/// requires an authenticated principal; a supplied invalid token never falls back.
pub fn public_exact(method: &str, path: &str) -> bool {
    ingest_path(method, path).is_some()
}
struct Database {
    events: postgres::Client,
    connections: Store,
}
#[derive(Clone)]
pub struct EventRoutes {
    streams: Arc<crate::streaming::StreamActivity>,
    database: Arc<Mutex<Database>>,
    database_admission: Arc<tokio::sync::Semaphore>,
    database_capacity: Arc<tokio::sync::Semaphore>,
    admission: Arc<tokio::sync::Semaphore>,
    runner: RunnerClient,
    verifier: Option<Arc<WebhookVerifier>>,
}
impl EventRoutes {
    pub fn retirement_ready(&self) -> bool {
        self.streams.idle()
    }
    pub(crate) fn stream_activity(&self) -> Arc<crate::streaming::StreamActivity> {
        self.streams.clone()
    }

    pub fn database_health(&self) -> Option<bool> {
        match self.database.try_lock() {
            Ok(database) => crate::combined_database_health([
                Some(!database.events.is_closed()),
                database.connections.database_health(),
            ]),
            Err(std::sync::TryLockError::WouldBlock) => None,
            Err(std::sync::TryLockError::Poisoned(_)) => Some(false),
        }
    }
    pub fn new(
        client: postgres::Client,
        store: Store,
        runner: RunnerClient,
        verifier: Option<WebhookVerifier>,
    ) -> Self {
        Self {
            streams: Arc::new(crate::streaming::StreamActivity::default()),
            database: Arc::new(Mutex::new(Database {
                events: client,
                connections: store,
            })),
            database_admission: Arc::new(tokio::sync::Semaphore::new(1)),
            database_capacity: Arc::new(tokio::sync::Semaphore::new(64)),
            admission: Arc::new(tokio::sync::Semaphore::new(16)),
            runner,
            verifier: verifier.map(Arc::new),
        }
    }
    async fn database<T: Send + 'static>(
        &self,
        f: impl FnOnce(&mut Database) -> Result<T> + Send + 'static,
    ) -> Result<T> {
        let capacity = self
            .database_capacity
            .clone()
            .try_acquire_owned()
            .map_err(|_| ApiError::new("WEBHOOK_EVENTS_FAILED"))?;
        let permit = tokio::time::timeout(
            Duration::from_secs(2),
            self.database_admission.clone().acquire_owned(),
        )
        .await
        .map_err(|_| ApiError::new("WEBHOOK_EVENTS_FAILED"))?
        .map_err(|_| ApiError::new("WEBHOOK_EVENTS_FAILED"))?;
        let db = self.database.clone();
        let stream_guard = self.streams.acquire();
        let work = tokio::task::spawn_blocking(move || {
            let _stream_guard = stream_guard;
            let _permit = permit;
            let _capacity = capacity;
            let mut db = db
                .lock()
                .map_err(|_| ApiError::new("WEBHOOK_EVENTS_FAILED"))?;
            f(&mut db)
        });
        tokio::time::timeout(Duration::from_secs(6), work)
            .await
            .map_err(|_| ApiError::new("WEBHOOK_EVENTS_FAILED"))?
            .map_err(|_| ApiError::new("WEBHOOK_EVENTS_FAILED"))?
    }
    pub async fn handle(
        &self,
        principal: Option<&Principal>,
        request: &Request,
    ) -> Result<Option<Response>> {
        if request.uri.len() > 16384 {
            return Err(ApiError::new("INVALID_REQUEST"));
        }
        let url = url::Url::parse(&format!("http://appcall.invalid{}", request.uri))
            .map_err(|_| ApiError::new("INVALID_REQUEST"))?;
        // Validate raw route before URL normalization can collapse dot segments.
        let raw_path = request.uri.split('?').next().unwrap_or("");
        if let Some((connection, connector)) = ingest_path(&request.method, raw_path) {
            let _permit = self
                .admission
                .clone()
                .try_acquire_owned()
                .map_err(|_| ApiError::new("WEBHOOK_INGEST_FAILED"))?;
            return self
                .ingest(principal, request, &url, connection, connector)
                .await
                .map(Some);
        }
        if !raw_path.starts_with("/v1/webhook-events") {
            return Ok(None);
        }
        let is_read = request.method == "GET"
            && (raw_path == "/v1/webhook-events"
                || raw_path
                    .strip_prefix("/v1/webhook-events/")
                    .is_some_and(|s| !s.is_empty() && !s.contains('/')));
        let replay = raw_path
            .strip_prefix("/v1/webhook-events/")
            .and_then(|s| s.strip_suffix("/replay"))
            .filter(|s| !s.is_empty() && !s.contains('/'));
        if !(is_read || request.method == "POST" && replay.is_some()) {
            return Ok(None);
        }
        let p = principal
            .cloned()
            .ok_or_else(|| ApiError::new("UNAUTHORIZED"))?;
        if is_read {
            return self
                .database(move |db| crate::data_routes::webhook_read(&mut db.events, &p, &url))
                .await;
        }
        let id = percent_encoding::percent_decode_str(replay.unwrap_or(""))
            .decode_utf8()
            .map_err(|_| ApiError::new("INVALID_REQUEST"))?
            .into_owned();
        self.database(move |db| {
            let mut response = crate::data_routes::webhook_replay(
                &mut db.events,
                &p,
                &id,
                &mut appcall_worker::SyncDispatchSink,
            )?;
            response.status = 202;
            Ok(Some(response))
        })
        .await
    }
    async fn ingest(
        &self,
        principal: Option<&Principal>,
        request: &Request,
        url: &url::Url,
        connection: String,
        connector: String,
    ) -> Result<Response> {
        if request.body.len() > 1024 * 1024
            || request.headers.len() > 128
            || request
                .headers
                .iter()
                .map(|(k, v)| k.len() + v.len())
                .sum::<usize>()
                > 32768
        {
            return Err(ApiError::new("WEBHOOK_PAYLOAD_TOO_LARGE"));
        }
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
            let p = principal.ok_or_else(|| ApiError::new("UNAUTHORIZED"))?;
            WebhookClaims {
                project_id: p.project_id.clone(),
                connection_id: connection,
                connector,
            }
        };
        if principal
            .is_some_and(|p| p.project_id != claims.project_id || !p.scopes.permits("events:write"))
        {
            return Err(ApiError::new("FORBIDDEN"));
        }
        let p = principal.cloned();
        let scope_claims = claims.clone();
        let (expected, expected_revision) = self
            .database(move |db| {
                let scope = Scope::new(&scope_claims.project_id, None)
                    .map_err(|_| ApiError::new("UNAUTHORIZED"))?;
                let c = db
                    .connections
                    .get_with_revision(&scope, &scope_claims.connection_id)
                    .map_err(|_| ApiError::new("CONNECTION_NOT_FOUND"))?;
                if c.0.status != Status::Active || c.0.connector != scope_claims.connector {
                    return Err(ApiError::new("CONNECTION_NOT_FOUND"));
                }
                if p.is_some_and(|p| {
                    !p.allowed_brands.permits(&c.0.external_account_id)
                        || p.brand_id
                            .as_ref()
                            .is_some_and(|b| *b != c.0.external_account_id)
                }) {
                    return Err(ApiError::new("FORBIDDEN"));
                }
                Ok(c)
            })
            .await?;
        let payload: Value = serde_json::from_slice(&request.body)
            .map_err(|_| ApiError::new("INVALID_WEBHOOK_PAYLOAD"))?;
        let mut headers = BTreeMap::new();
        for (key, value) in &request.headers {
            let key = key.to_ascii_lowercase();
            if headers.insert(key, value.clone()).is_some() {
                return Err(ApiError::new("INVALID_WEBHOOK_PAYLOAD"));
            }
        }
        let deadline = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|_| ApiError::new("WEBHOOK_INGEST_FAILED"))?
            .as_millis() as u64
            + 10000;
        let context = RequestContext {
            request_id: format!("webhook_{}", uuid::Uuid::new_v4().simple()),
            deadline_unix_ms: Some(deadline),
        };
        let verified = self
            .runner
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
        let parsed = self
            .runner
            .webhook_parse(
                &context,
                WebhookParseRequest {
                    connector_key: claims.connector.clone(),
                    payload,
                },
            )
            .await
            .map_err(|_| ApiError::new("WEBHOOK_INGEST_FAILED"))?;
        self.database(move |db| {
            let accepted = PgEvents::new(&mut db.events)
                .accept_for_connection(
                    &claims,
                    &ParsedWebhook {
                        idempotency_key: parsed.idempotency_key,
                        operation: parsed.operation,
                        sanitized: parsed.sanitized,
                    },
                    &expected,
                    expected_revision,
                )
                .map_err(|e| match e {
                    appcall_events::Error::Invalid => ApiError::new("INVALID_WEBHOOK_PAYLOAD"),
                    other => crate::data_routes::event_error(other),
                })?;
            Ok(Response {
                status: if accepted.duplicate { 200 } else { 202 },
                body: serde_json::to_value(accepted)
                    .map_err(|_| ApiError::new("WEBHOOK_INGEST_FAILED"))?,
                headers: vec![],
            })
        })
        .await
    }
    /// Poll durable stream positions using the authenticated principal unchanged.
    /// The host owns SSE framing, repeated authorization, cancellation and pacing.
    pub async fn poll(&self, principal: &Principal, cursor: &str) -> Result<Vec<Event>> {
        self.poll_filtered(
            principal,
            cursor,
            &crate::streaming::EventFilters::default(),
        )
        .await
    }
    pub async fn poll_filtered(
        &self,
        principal: &Principal,
        cursor: &str,
        filters: &crate::streaming::EventFilters,
    ) -> Result<Vec<Event>> {
        if cursor.len() > 4096 {
            return Err(ApiError::new("INVALID_CURSOR"));
        }
        filters.validate()?;
        let p = principal.clone();
        let cursor = cursor.to_owned();
        let filters = filters.clone();
        self.database(move |db| {
            PgEvents::new(&mut db.events)
                .stream(
                    &p,
                    &ListRequest {
                        cursor,
                        limit: STREAM_PAGE_SIZE,
                        connection_id: filters.connection_id,
                        connector: filters.connector,
                        operation: filters.operation,
                    },
                )
                .map(|page| page.events)
                .map_err(crate::data_routes::event_error)
        })
        .await
    }
}
