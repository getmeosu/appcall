//! Bounded durable SSE delivery. No event payload is retained after its frame drains.
use crate::{ApiError, Result};
use appcall_auth::Principal;
use appcall_events::{stream_cursor, Event};
use bytes::Bytes;
use http_body_util::Full;
use hyper::body::{Body, Frame, SizeHint};
use std::{
    convert::Infallible,
    future::Future,
    pin::Pin,
    sync::Arc,
    task::{Context, Poll},
    time::Duration,
};
use tokio::sync::{mpsc, watch};

pub type EventReceiver = mpsc::Receiver<Vec<u8>>;
pub struct StreamResponse {
    pub receiver: EventReceiver,
    pub headers: Vec<(String, String)>,
}
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct EventFilters {
    pub connector: String,
    pub connection_id: String,
    pub operation: String,
}
impl EventFilters {
    pub fn validate(&self) -> Result<()> {
        if [
            self.connector.as_str(),
            self.connection_id.as_str(),
            self.operation.as_str(),
        ]
        .iter()
        .any(|value| value.len() > 4096 || value.chars().any(char::is_control))
        {
            return Err(ApiError::new("INVALID_REQUEST"));
        }
        Ok(())
    }
}
pub struct EventBody {
    receiver: EventReceiver,
}
impl EventBody {
    pub fn new(receiver: EventReceiver) -> Self {
        Self { receiver }
    }
}
impl Body for EventBody {
    type Data = Bytes;
    type Error = Infallible;
    fn poll_frame(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
    ) -> Poll<Option<std::result::Result<Frame<Bytes>, Infallible>>> {
        self.get_mut()
            .receiver
            .poll_recv(cx)
            .map(|item| item.map(|bytes| Ok(Frame::data(Bytes::from(bytes)))))
    }
    fn is_end_stream(&self) -> bool {
        self.receiver.is_closed() && self.receiver.is_empty()
    }
    fn size_hint(&self) -> SizeHint {
        SizeHint::default()
    }
}
pub enum WireBody {
    Full(Full<Bytes>),
    Events(EventBody),
}
impl Body for WireBody {
    type Data = Bytes;
    type Error = Infallible;
    fn poll_frame(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
    ) -> Poll<Option<std::result::Result<Frame<Bytes>, Infallible>>> {
        match self.get_mut() {
            Self::Full(body) => Pin::new(body).poll_frame(cx),
            Self::Events(body) => Pin::new(body).poll_frame(cx),
        }
    }
    fn is_end_stream(&self) -> bool {
        match self {
            Self::Full(body) => body.is_end_stream(),
            Self::Events(body) => body.is_end_stream(),
        }
    }
    fn size_hint(&self) -> SizeHint {
        match self {
            Self::Full(body) => body.size_hint(),
            Self::Events(body) => body.size_hint(),
        }
    }
}
pub fn response(receiver: EventReceiver) -> hyper::Response<WireBody> {
    let mut response = hyper::Response::new(WireBody::Events(EventBody::new(receiver)));
    let headers = response.headers_mut();
    headers.insert(
        "content-type",
        hyper::header::HeaderValue::from_static("text/event-stream"),
    );
    headers.insert(
        "cache-control",
        hyper::header::HeaderValue::from_static("no-cache"),
    );
    headers.insert(
        "x-accel-buffering",
        hyper::header::HeaderValue::from_static("no"),
    );
    response
}

#[derive(Default)]
pub(crate) struct StreamActivity(std::sync::atomic::AtomicUsize);
impl StreamActivity {
    pub(crate) fn idle(&self) -> bool {
        self.0.load(std::sync::atomic::Ordering::Acquire) == 0
    }
    pub(crate) fn acquire(self: &Arc<Self>) -> StreamGuard {
        self.0.fetch_add(1, std::sync::atomic::Ordering::AcqRel);
        StreamGuard(self.clone())
    }
}
pub(crate) struct StreamGuard(Arc<StreamActivity>);
impl Drop for StreamGuard {
    fn drop(&mut self) {
        self.0 .0.fetch_sub(1, std::sync::atomic::Ordering::AcqRel);
    }
}
// Field order is intentional: all PG/verifier owners drop before acknowledgment.
struct TrackedPoller {
    source: Arc<dyn Poller>,
    _guard: StreamGuard,
}
impl Poller for TrackedPoller {
    fn poll<'a>(
        &'a self,
        cursor: &'a str,
        filters: &'a EventFilters,
    ) -> Pin<Box<dyn Future<Output = Result<Vec<Event>>> + Send + 'a>> {
        self.source.poll(cursor, filters)
    }
}
pub(crate) trait Poller: Send + Sync {
    fn activity(&self) -> Option<Arc<StreamActivity>> {
        None
    }
    fn poll<'a>(
        &'a self,
        cursor: &'a str,
        filters: &'a EventFilters,
    ) -> Pin<Box<dyn Future<Output = Result<Vec<Event>>> + Send + 'a>>;
}
struct ScopedPoller {
    routes: crate::event_routes::EventRoutes,
    principal: Principal,
}
impl Poller for ScopedPoller {
    fn activity(&self) -> Option<Arc<StreamActivity>> {
        Some(self.routes.stream_activity())
    }
    fn poll<'a>(
        &'a self,
        cursor: &'a str,
        filters: &'a EventFilters,
    ) -> Pin<Box<dyn Future<Output = Result<Vec<Event>>> + Send + 'a>> {
        Box::pin(self.routes.poll_filtered(&self.principal, cursor, filters))
    }
}
/// Revalidate the existing session without rotating credentials after headers.
pub type SessionVerifier =
    Arc<dyn Fn() -> Pin<Box<dyn Future<Output = Result<Principal>> + Send>> + Send + Sync>;
struct VerifiedPoller {
    source: Arc<dyn Poller>,
    expected: Principal,
    verify: SessionVerifier,
}
impl Poller for VerifiedPoller {
    fn activity(&self) -> Option<Arc<StreamActivity>> {
        self.source.activity()
    }
    fn poll<'a>(
        &'a self,
        cursor: &'a str,
        filters: &'a EventFilters,
    ) -> Pin<Box<dyn Future<Output = Result<Vec<Event>>> + Send + 'a>> {
        Box::pin(async move {
            let principal = (self.verify)().await?;
            if principal != self.expected {
                return Err(ApiError::new("UNAUTHORIZED"));
            }
            self.source.poll(cursor, filters).await
        })
    }
}
#[derive(Clone, Copy)]
enum Format {
    Api,
    Dashboard,
}
struct OpenOptions {
    cursor: String,
    filters: EventFilters,
    shutdown: watch::Receiver<bool>,
    verify: SessionVerifier,
    timing: Timing,
    format: Format,
}
/// Render durable events as Datastar patches; recheck identity before every poll.
pub async fn open_dashboard(
    routes: crate::event_routes::EventRoutes,
    principal: Principal,
    cursor: String,
    shutdown: watch::Receiver<bool>,
    verify: SessionVerifier,
) -> Result<EventReceiver> {
    open_dashboard_with_filters(
        routes,
        principal,
        cursor,
        EventFilters::default(),
        shutdown,
        verify,
    )
    .await
}
pub async fn open_dashboard_with_filters(
    routes: crate::event_routes::EventRoutes,
    principal: Principal,
    cursor: String,
    filters: EventFilters,
    shutdown: watch::Receiver<bool>,
    verify: SessionVerifier,
) -> Result<EventReceiver> {
    open_verified_source_with_filters(
        Arc::new(ScopedPoller {
            routes,
            principal: principal.clone(),
        }),
        principal,
        OpenOptions {
            cursor,
            filters,
            shutdown,
            verify,
            timing: Timing::default(),
            format: Format::Dashboard,
        },
    )
    .await
}
/// Recheck the original API credentials and exact grants before each page.
pub async fn open_verified(
    routes: crate::event_routes::EventRoutes,
    principal: Principal,
    cursor: String,
    shutdown: watch::Receiver<bool>,
    verify: SessionVerifier,
) -> Result<EventReceiver> {
    open_verified_source_with_filters(
        Arc::new(ScopedPoller {
            routes,
            principal: principal.clone(),
        }),
        principal,
        OpenOptions {
            cursor,
            filters: EventFilters::default(),
            shutdown,
            verify,
            timing: Timing::default(),
            format: Format::Api,
        },
    )
    .await
}
pub async fn open_verified_with_filters(
    routes: crate::event_routes::EventRoutes,
    principal: Principal,
    cursor: String,
    filters: EventFilters,
    shutdown: watch::Receiver<bool>,
    verify: SessionVerifier,
) -> Result<EventReceiver> {
    open_verified_source_with_filters(
        Arc::new(ScopedPoller {
            routes,
            principal: principal.clone(),
        }),
        principal,
        OpenOptions {
            cursor,
            filters,
            shutdown,
            verify,
            timing: Timing::default(),
            format: Format::Api,
        },
    )
    .await
}
/// Reuse authentication, capacity, framing and drain semantics for process-local stores.
pub(crate) async fn open_source_with_filters(
    source: Arc<dyn Poller>,
    principal: Principal,
    cursor: String,
    filters: EventFilters,
    shutdown: watch::Receiver<bool>,
    verify: SessionVerifier,
    dashboard: bool,
) -> Result<EventReceiver> {
    open_verified_source_with_filters(
        source,
        principal,
        OpenOptions {
            cursor,
            filters,
            shutdown,
            verify,
            timing: Timing::default(),
            format: if dashboard {
                Format::Dashboard
            } else {
                Format::Api
            },
        },
    )
    .await
}
#[cfg(test)]
async fn open_verified_with(
    source: Arc<dyn Poller>,
    expected: Principal,
    cursor: String,
    shutdown: watch::Receiver<bool>,
    verify: SessionVerifier,
    timing: Timing,
    format: Format,
) -> Result<EventReceiver> {
    open_verified_source_with_filters(
        source,
        expected,
        OpenOptions {
            cursor,
            filters: EventFilters::default(),
            shutdown,
            verify,
            timing,
            format,
        },
    )
    .await
}
async fn open_verified_source_with_filters(
    source: Arc<dyn Poller>,
    expected: Principal,
    options: OpenOptions,
) -> Result<EventReceiver> {
    let OpenOptions {
        cursor,
        filters,
        shutdown,
        verify,
        timing,
        format,
    } = options;
    open_mode_with_filters(
        Arc::new(VerifiedPoller {
            source,
            expected,
            verify,
        }),
        cursor,
        filters,
        shutdown,
        timing,
        format,
    )
    .await
}

#[derive(Clone, Copy)]
struct Timing {
    poll: Duration,
    heartbeat: Duration,
    send: Duration,
}
impl Default for Timing {
    fn default() -> Self {
        Self {
            poll: Duration::from_secs(1),
            heartbeat: Duration::from_secs(25),
            send: Duration::from_secs(5),
        }
    }
}
/// Authenticate the principal before calling. Initial cursor/store errors are
/// returned before constructing an HTTP 200 response.
pub async fn open(
    routes: crate::event_routes::EventRoutes,
    principal: Principal,
    cursor: String,
    shutdown: watch::Receiver<bool>,
) -> Result<EventReceiver> {
    open_with_filters(
        Arc::new(ScopedPoller { routes, principal }),
        cursor,
        EventFilters::default(),
        shutdown,
        Timing::default(),
    )
    .await
}
#[cfg(test)]
async fn open_with(
    source: Arc<dyn Poller>,
    cursor: String,
    shutdown: watch::Receiver<bool>,
    timing: Timing,
) -> Result<EventReceiver> {
    open_with_filters(source, cursor, EventFilters::default(), shutdown, timing).await
}
async fn open_with_filters(
    source: Arc<dyn Poller>,
    cursor: String,
    filters: EventFilters,
    shutdown: watch::Receiver<bool>,
    timing: Timing,
) -> Result<EventReceiver> {
    open_mode_with_filters(source, cursor, filters, shutdown, timing, Format::Api).await
}
#[cfg(test)]
async fn open_mode(
    source: Arc<dyn Poller>,
    cursor: String,
    shutdown: watch::Receiver<bool>,
    timing: Timing,
    format: Format,
) -> Result<EventReceiver> {
    open_mode_with_filters(
        source,
        cursor,
        EventFilters::default(),
        shutdown,
        timing,
        format,
    )
    .await
}
async fn open_mode_with_filters(
    source: Arc<dyn Poller>,
    cursor: String,
    filters: EventFilters,
    mut shutdown: watch::Receiver<bool>,
    timing: Timing,
    format: Format,
) -> Result<EventReceiver> {
    let source: Arc<dyn Poller> = match source.activity() {
        Some(activity) => Arc::new(TrackedPoller {
            source,
            _guard: activity.acquire(),
        }),
        None => source,
    };
    filters.validate()?;
    let first = tokio::select! {_ = stop(&mut shutdown)=>return Err(ApiError::new("SERVICE_BUSY")), result=source.poll(&cursor, &filters)=>result?};
    let first = encode_page(first, &cursor, format)?;
    let (tx, rx) = mpsc::channel(16);
    tokio::spawn(async move {
        run(
            RunContext {
                source,
                cursor,
                filters,
                shutdown,
                timing,
                format,
            },
            tx,
            first,
        )
        .await;
    });
    Ok(rx)
}
struct Page {
    frames: Vec<(String, Vec<u8>)>,
    more: bool,
}
fn encode_page(events: Vec<Event>, cursor: &str, format: Format) -> Result<Page> {
    if events.len() > crate::event_routes::STREAM_PAGE_SIZE {
        return Err(ApiError::new("INVALID_RESPONSE"));
    }
    let mut more = events.len() == crate::event_routes::STREAM_PAGE_SIZE;
    let mut frames = Vec::new();
    let mut bytes = 0usize;
    let mut previous = cursor.to_owned();
    let mut position = 0;
    for event in events {
        let next = stream_cursor(&event);
        if event.stream_position <= position || next == previous {
            return Err(ApiError::new("INVALID_RESPONSE"));
        }
        let mut data =
            serde_json::json!({"id":event.id,"type":"webhook_event","createdAt":event.created_at});
        for (key, value) in [
            ("connectionId", event.connection_id),
            ("accountId", event.external_account_id),
            ("connector", event.connector),
            ("operation", event.operation),
        ] {
            if !value.is_empty() {
                data[key] = serde_json::Value::String(value)
            }
        }
        if !event.payload.is_null() {
            data["payload"] = event.payload
        }
        let frame = match format {
            Format::Api => {
                format!("id: {next}\nevent: webhook_event\ndata: {data}\n\n").into_bytes()
            }
            Format::Dashboard => format!(
                "id: {next}\n{}",
                appcall_web::render_event_patch(&data)
                    .map_err(|_| ApiError::new("INVALID_RESPONSE"))?
            )
            .into_bytes(),
        };
        if frame.len() > 4 * 1024 * 1024 {
            return Err(ApiError::new("INVALID_RESPONSE"));
        }
        if bytes + frame.len() > 4 * 1024 * 1024 && !frames.is_empty() {
            more = true;
            break;
        }
        bytes += frame.len();
        position = event.stream_position;
        previous = next.clone();
        frames.push((next, frame));
    }
    Ok(Page { frames, more })
}
async fn stop(shutdown: &mut watch::Receiver<bool>) {
    if *shutdown.borrow() {
        return;
    }
    loop {
        if shutdown.changed().await.is_err() || *shutdown.borrow() {
            return;
        }
    }
}
async fn send(
    tx: &mpsc::Sender<Vec<u8>>,
    frame: &[u8],
    shutdown: &mut watch::Receiver<bool>,
    timeout: Duration,
) -> bool {
    // Chunking bounds queued bytes to 16 * 32KiB, independent of payload size.
    let sending = async {
        for chunk in frame.chunks(32 * 1024) {
            if tx.send(chunk.to_vec()).await.is_err() {
                return false;
            }
        }
        true
    };
    tokio::select! {_ = stop(shutdown)=>false,_ = tx.closed()=>false,result=tokio::time::timeout(timeout,sending)=>result.unwrap_or(false)}
}
struct RunContext {
    source: Arc<dyn Poller>,
    cursor: String,
    filters: EventFilters,
    shutdown: watch::Receiver<bool>,
    timing: Timing,
    format: Format,
}
async fn run(context: RunContext, tx: mpsc::Sender<Vec<u8>>, mut page: Page) {
    let RunContext {
        source,
        mut cursor,
        filters,
        mut shutdown,
        timing,
        format,
    } = context;
    let mut heartbeat = tokio::time::interval_at(
        tokio::time::Instant::now() + timing.heartbeat,
        timing.heartbeat,
    );
    heartbeat.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    if !send(&tx, b": connected\n\n", &mut shutdown, timing.send).await {
        return;
    }
    loop {
        for (next, frame) in page.frames {
            if !send(&tx, &frame, &mut shutdown, timing.send).await {
                return;
            }
            cursor = next;
        }
        if !page.more {
            tokio::select! {
             _=stop(&mut shutdown)=>return,
             _=tx.closed()=>return,
             _=heartbeat.tick()=>{if !send(&tx,b": heartbeat\n\n",&mut shutdown,timing.send).await{return}},
             _=tokio::time::sleep(timing.poll)=>{},
            }
        }
        let result = tokio::select! {_=stop(&mut shutdown)=>return,_=tx.closed()=>return,result=source.poll(&cursor, &filters)=>result};
        match result.and_then(|events| encode_page(events, &cursor, format)) {
            Ok(next) => page = next,
            Err(_) => {
                let _ = send(
                    &tx,
                    b"event: error\ndata: {\"code\":\"EVENT_STREAM_BACKFILL_FAILED\"}\n\n",
                    &mut shutdown,
                    timing.send,
                )
                .await;
                return;
            }
        }
    }
}

#[cfg(test)]
mod tests;
