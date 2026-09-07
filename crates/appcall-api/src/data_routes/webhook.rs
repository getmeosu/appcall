use super::*;
use appcall_auth::Principal;
use appcall_events::{DispatchSink, Event, EventPage, ListRequest, PgEvents};
use postgres::Client;
/// Host runs these calls on its bounded blocking database executor. Preserve the
/// verifier's principal, including narrowed grants, rather than rebuilding it.
pub fn webhook_read(
    client: &mut Client,
    principal: &Principal,
    url: &url::Url,
) -> Result<Option<Response>> {
    let path = url.path();
    let body = if path == "/v1/webhook-events" {
        let q = LogQuery::parse_for(url, LogKind::Webhook)?;
        let page = PgEvents::new(client)
            .list(
                principal,
                &ListRequest {
                    cursor: q.get("cursor").into(),
                    limit: q.limit as usize,
                    connection_id: q.get("connectionId").into(),
                    connector: q.get("connector").into(),
                    operation: q.get("operation").into(),
                },
            )
            .map_err(event_error)?;
        event_page(page)
    } else if let Some(id) = path
        .strip_prefix("/v1/webhook-events/")
        .filter(|s| !s.is_empty() && !s.contains('/'))
    {
        let id = percent_encoding::percent_decode_str(id)
            .decode_utf8()
            .map_err(|_| ApiError::new("INVALID_REQUEST"))?;
        event_response(
            &PgEvents::new(client)
                .get(principal, &id)
                .map_err(event_error)?,
        )
    } else {
        return Ok(None);
    };
    Ok(Some(Response {
        status: 200,
        body,
        headers: vec![],
    }))
}
pub fn webhook_replay(
    client: &mut Client,
    principal: &Principal,
    id: &str,
    sink: &mut impl DispatchSink,
) -> Result<Response> {
    PgEvents::new(client)
        .replay(principal, id, sink)
        .map_err(event_error)?;
    Ok(Response {
        status: 200,
        body: json!({"eventId":id,"replayed":true}),
        headers: vec![],
    })
}
pub fn event_response(event: &Event) -> Value {
    let mut body = json!({"id":event.id,"connectionId":event.connection_id,"connector":event.connector,"createdAt":event.created_at,"payload":event.payload});
    if !event.operation.is_empty() {
        body["operation"] = event.operation.clone().into()
    }
    body
}
pub fn event_page(page: EventPage) -> Value {
    let mut pagination = json!({"hasMore":page.has_more});
    if !page.next_cursor.is_empty() {
        pagination["nextCursor"] = page.next_cursor.into()
    }
    json!({"events":page.events.iter().map(event_response).collect::<Vec<_>>(),"pagination":pagination})
}
pub fn event_error(error: appcall_events::Error) -> ApiError {
    use appcall_events::Error;
    ApiError::new(match error {
        Error::Invalid => "INVALID_CURSOR",
        Error::TooLarge => "WEBHOOK_PAYLOAD_TOO_LARGE",
        Error::Signature => "UNAUTHORIZED",
        Error::Forbidden => "FORBIDDEN",
        Error::NotFound => "WEBHOOK_EVENT_NOT_FOUND",
        Error::Conflict => "CONNECTION_CHANGED",
        Error::ConfigurationRequired => "WEBHOOK_CONFIGURATION_REQUIRED",
        Error::Storage => "WEBHOOK_EVENTS_FAILED",
        Error::Dispatch => "WEBHOOK_REPLAY_FAILED",
    })
}
