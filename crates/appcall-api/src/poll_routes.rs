//! Poll subscription routes (OXIDE-POLL-2). A trigger is reachable once a
//! connection's pollable sync operation is subscribed here; the worker then
//! polls it and emits the manifest's trigger events.
//!
//! - `GET    /v1/connections/{id}/poll-subscriptions`
//! - `POST   /v1/connections/{id}/poll-subscriptions` `{"operation","input"}`
//! - `GET    /v1/connections/{id}/poll-subscriptions/{operation}`
//! - `DELETE /v1/connections/{id}/poll-subscriptions/{operation}`
//!
//! Every route is scoped to the caller's project and account: a connection
//! outside the scope is `CONNECTION_NOT_FOUND`, like a missing one.
use crate::{ok, ApiError, Backend, Identity, Request, Response, Result};
use appcall_connectors::{OperationKind, Registry};
use appcall_sync::PollSubscriptionView;
use serde::Deserialize;
use serde_json::{json, Value};

/// One validated poll subscription command for a backend.
#[derive(Clone, Debug, PartialEq)]
pub enum PollCommand {
    /// The caller validated `operation` and `input` against `connector`'s
    /// manifest; the backend re-checks that the connection is `connector`.
    Subscribe {
        connection_id: String,
        connector: String,
        operation: String,
        input: Value,
    },
    Unsubscribe {
        connection_id: String,
        operation: String,
    },
    /// All of the connection's subscriptions, or only `operation`.
    List {
        connection_id: String,
        operation: Option<String>,
    },
}

/// A backend's answer to a [`PollCommand`].
#[derive(Clone, Debug, PartialEq)]
pub enum PollReply {
    Subscribed {
        subscription: PollSubscriptionView,
        created: bool,
    },
    Unsubscribed {
        removed: bool,
    },
    Listed(Vec<PollSubscriptionView>),
}

/// Whether `segments` is one of the poll subscription routes.
pub(crate) fn matches(method: &str, segments: &[&str]) -> bool {
    matches!(
        (method, segments),
        (
            "GET" | "POST",
            ["v1", "connections", _, "poll-subscriptions"]
        ) | (
            "GET" | "DELETE",
            ["v1", "connections", _, "poll-subscriptions", _]
        )
    )
}

pub(crate) async fn handle<B: Backend>(
    registry: &Registry,
    backend: &B,
    identity: &Identity,
    request: &Request,
    segments: &[&str],
) -> Result<Response> {
    let command = match (request.method.as_str(), segments) {
        ("POST", ["v1", "connections", id, "poll-subscriptions"]) => {
            subscribe_command(registry, backend, identity, id, &request.body).await?
        }
        ("GET", ["v1", "connections", id, "poll-subscriptions"]) => PollCommand::List {
            connection_id: (*id).to_owned(),
            operation: None,
        },
        ("GET", ["v1", "connections", id, "poll-subscriptions", operation]) => PollCommand::List {
            connection_id: (*id).to_owned(),
            operation: Some((*operation).to_owned()),
        },
        ("DELETE", ["v1", "connections", id, "poll-subscriptions", operation]) => {
            PollCommand::Unsubscribe {
                connection_id: (*id).to_owned(),
                operation: (*operation).to_owned(),
            }
        }
        _ => return Err(ApiError::new("ROUTE_NOT_FOUND")),
    };
    let single = matches!(
        &command,
        PollCommand::List {
            operation: Some(_),
            ..
        }
    );
    Ok(match backend.poll_subscriptions(identity, command).await? {
        PollReply::Subscribed {
            subscription,
            created,
        } => Response {
            status: if created { 201 } else { 200 },
            headers: vec![],
            body: json!({"subscription": view_json(&subscription), "created": created}),
        },
        PollReply::Unsubscribed { removed } => ok(json!({"removed": removed})),
        PollReply::Listed(views) if single => match views.first() {
            Some(view) => ok(json!({"subscription": view_json(view)})),
            None => return Err(ApiError::new("POLL_SUBSCRIPTION_NOT_FOUND")),
        },
        PollReply::Listed(views) => ok(json!({
            "subscriptions": views.iter().map(view_json).collect::<Vec<_>>()
        })),
    })
}

async fn subscribe_command<B: Backend>(
    registry: &Registry,
    backend: &B,
    identity: &Identity,
    connection_id: &str,
    body: &[u8],
) -> Result<PollCommand> {
    #[derive(Deserialize)]
    #[serde(deny_unknown_fields)]
    struct Body {
        operation: String,
        #[serde(default = "crate::empty_input")]
        input: Value,
    }
    let body: Body = serde_json::from_slice(body).map_err(|_| ApiError::new("INVALID_REQUEST"))?;
    if !body.input.is_object() {
        return Err(ApiError::new("INVALID_SUBSCRIPTION_INPUT"));
    }
    let connection = backend.connection(identity, connection_id).await?;
    if !identity.account_id.is_empty() && connection.external_account_id != identity.account_id {
        return Err(ApiError::new("CONNECTION_NOT_FOUND"));
    }
    let operation = registry
        .operation(&connection.connector, &body.operation)
        .map_err(|_| ApiError::new("UNKNOWN_OPERATION"))?;
    if operation.kind != OperationKind::Sync || operation.poll.is_none() {
        return Err(ApiError::new("OPERATION_NOT_POLLABLE"));
    }
    operation
        .validate_input(&body.input)
        .map_err(|_| ApiError::new("INVALID_SUBSCRIPTION_INPUT"))?;
    Ok(PollCommand::Subscribe {
        connection_id: connection.id,
        connector: connection.connector,
        operation: body.operation,
        input: body.input,
    })
}

fn view_json(view: &PollSubscriptionView) -> Value {
    json!({
        "connectionId": view.connection_id,
        "operation": view.operation,
        "input": view.input,
        "status": view.status,
        "seeded": view.seeded,
        "attempts": view.attempts,
        "lastError": (!view.last_error.is_empty()).then_some(&view.last_error),
        "nextRunAt": view.next_run_at,
        "createdAt": view.created_at,
        "updatedAt": view.updated_at,
    })
}

/// Map a scoped sync-crate failure to the route's error code.
pub(crate) fn sync_error(error: appcall_sync::Error) -> ApiError {
    ApiError::new(match error {
        appcall_sync::Error::NotFound => "CONNECTION_NOT_FOUND",
        appcall_sync::Error::InvalidInput => "INVALID_SUBSCRIPTION_INPUT",
        _ => "POLL_SUBSCRIPTIONS_FAILED",
    })
}
