//! Project-owned audit history. SQL selections intentionally exclude credentials.
use crate::{ApiError, Identity, Response, Result};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use chrono::DateTime;
use postgres::GenericClient;
use serde_json::{json, Value};
use std::collections::BTreeMap;
mod webhook;
pub use webhook::*;
mod sse;
mod unified;
pub use sse::*;
mod usage;
pub use unified::*;
pub use usage::*;
mod runs;
pub use runs::{dead_runs_projection, list as runs_list, RunQuery};

// Go QueryParam/url.Values.Get selects the first scalar value.
fn first_query_values(url: &url::Url) -> BTreeMap<String, String> {
    let mut values = BTreeMap::new();
    for (key, value) in url.query_pairs() {
        values
            .entry(key.into_owned())
            .or_insert_with(|| value.into_owned());
    }
    values
}

#[derive(Debug, Default)]
pub struct LogQuery {
    pub limit: i64,
    pub filters: BTreeMap<String, String>,
    time: String,
    id: String,
}
impl LogQuery {
    pub fn parse(url: &url::Url) -> Result<Self> {
        Self::parse_for(url, LogKind::Action)
    }
    pub fn parse_for(url: &url::Url, kind: LogKind) -> Result<Self> {
        let filters = first_query_values(url);
        let raw = filters.get("limit").map(String::as_str).unwrap_or("");
        let limit = if raw.is_empty() {
            50
        } else {
            let n = raw
                .parse::<i32>()
                .map_err(|_| ApiError::new("INVALID_LIMIT"))?;
            if n < 0 {
                return Err(ApiError::new("INVALID_LIMIT"));
            }
            if n == 0 {
                50
            } else {
                n.min(100) as i64
            }
        };
        if matches!(kind, LogKind::Action)
            && filters
                .get("status")
                .is_some_and(|v| !["", "succeeded", "failed"].contains(&v.as_str()))
        {
            return Err(ApiError::new("INVALID_STATUS"));
        }
        if matches!(kind, LogKind::Action)
            && filters.get("errorCode").is_some_and(|v| {
                ![
                    "",
                    "ACTION_FAILED",
                    "ACTION_INPUT_TOO_LARGE",
                    "ACTION_RESPONSE_INVALID",
                    "ACTION_RESPONSE_TOO_LARGE",
                    "ACTION_TIMEOUT",
                    "CONNECTION_DISCONNECTED",
                    "CONNECTOR_RATE_LIMITED",
                    "CONNECTOR_UNAVAILABLE",
                    "IDEMPOTENCY_CONFLICT",
                    "IDEMPOTENCY_IN_PROGRESS",
                    "UNKNOWN_ACTION",
                    "USAGE_LIMIT_EXCEEDED",
                    "MISSING_CREDENTIAL",
                    "MISSING_SUBACCOUNT",
                ]
                .contains(&v.as_str())
            })
        {
            return Err(ApiError::new("INVALID_ERROR_CODE"));
        }
        let (time, id) = match filters.get("cursor").filter(|s| !s.is_empty()) {
            None => (String::new(), String::new()),
            Some(raw) => {
                if raw.len() > 4096 {
                    return Err(ApiError::new("INVALID_CURSOR"));
                };
                let bytes = URL_SAFE_NO_PAD
                    .decode(raw)
                    .map_err(|_| ApiError::new("INVALID_CURSOR"))?;
                let text = String::from_utf8(bytes).map_err(|_| ApiError::new("INVALID_CURSOR"))?;
                let (t, id) = text
                    .split_once('|')
                    .ok_or_else(|| ApiError::new("INVALID_CURSOR"))?;
                if id.is_empty() || DateTime::parse_from_rfc3339(t).is_err() {
                    return Err(ApiError::new("INVALID_CURSOR"));
                }
                (t.into(), id.into())
            }
        };
        Ok(Self {
            limit,
            filters,
            time,
            id,
        })
    }
    pub(crate) fn cursor_boundary(&self) -> (&str, &str) {
        (&self.time, &self.id)
    }
    pub(crate) fn get(&self, key: &str) -> &str {
        self.filters.get(key).map(String::as_str).unwrap_or("")
    }
}

#[derive(Clone, Copy)]
pub enum LogKind {
    Action,
    Replay,
    Webhook,
}
impl LogKind {
    fn table(self) -> &'static str {
        match self {
            Self::Action => "action_logs",
            Self::Replay => "action_replay_logs",
            Self::Webhook => "webhook_events",
        }
    }
    fn missing(self) -> &'static str {
        match self {
            Self::Action => "ACTION_LOG_NOT_FOUND",
            Self::Replay => "REPLAY_LOG_NOT_FOUND",
            Self::Webhook => "WEBHOOK_EVENT_NOT_FOUND",
        }
    }
    fn fields(self, detail: bool) -> String {
        let common="'id', l.id, 'connectionId',l.connection_id,'connector',l.connector,'createdAt',to_char(l.created_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"')";
        match self {
            Self::Action=>format!("jsonb_build_object({common},'requestId',l.request_id,'action',l.action,'status',l.status) || CASE WHEN l.error_code='' THEN '{{}}'::jsonb ELSE jsonb_build_object('errorCode',l.error_code) END"),
            Self::Replay=>format!("jsonb_build_object({common},'requestId',l.request_id,'action',l.action{})",if detail{",'sanitizedInput',l.sanitized_input"}else{""}),
            Self::Webhook=>format!("jsonb_build_object({common},'payload',l.payload) || CASE WHEN l.operation='' THEN '{{}}'::jsonb ELSE jsonb_build_object('operation',l.operation) END"),
        }
    }
}
// Persisted provenance is authoritative, including on shared platform connections.
// Historical rows with unknown provenance remain visible only project-wide.
const OWNERSHIP: &str = "l.project_id=$1 AND ($2='' OR l.external_account_id=$2) AND EXISTS(SELECT 1 FROM connections c WHERE c.id=l.connection_id AND c.project_id=l.project_id)";

pub fn list(
    client: &mut impl GenericClient,
    identity: &Identity,
    kind: LogKind,
    q: &LogQuery,
) -> Result<Value> {
    let specific=match kind {LogKind::Action=>" AND ($8='' OR l.request_id=$8) AND ($9='' OR l.status=$9) AND ($10='' OR l.error_code=$10)",LogKind::Replay=>" AND ($8='' OR l.request_id=$8) AND $9::text='' AND $10::text=''",LogKind::Webhook=>" AND $8::text='' AND $9::text='' AND $10::text=''"};
    let operation = if matches!(kind, LogKind::Webhook) {
        "operation"
    } else {
        "action"
    };
    let sql=format!("SELECT ({})::text FROM {} l WHERE {OWNERSHIP} AND ($3='' OR l.connection_id=$3) AND ($4='' OR l.connector=$4) AND ($5='' OR l.{operation}=$5) AND ($6='' OR (l.created_at,l.id)<(NULLIF($6,'')::timestamptz,$7)){specific} ORDER BY l.created_at DESC,l.id DESC LIMIT $11",kind.fields(false),kind.table());
    let req = if matches!(kind, LogKind::Webhook) {
        ""
    } else {
        q.get("requestId")
    };
    let status = if matches!(kind, LogKind::Action) {
        q.get("status")
    } else {
        ""
    };
    let error = if matches!(kind, LogKind::Action) {
        q.get("errorCode")
    } else {
        ""
    };
    let rows = client
        .query(
            &sql,
            &[
                &identity.project_id,
                &identity.account_id,
                &q.get("connectionId"),
                &q.get("connector"),
                &q.get(operation),
                &q.time,
                &q.id,
                &req,
                &status,
                &error,
                &(q.limit + 1),
            ],
        )
        .map_err(db_error)?;
    let mut logs = rows
        .iter()
        .map(|r| {
            serde_json::from_str::<Value>(&r.get::<_, String>(0))
                .map_err(|_| ApiError::new("STORAGE_UNAVAILABLE"))
        })
        .collect::<Result<Vec<_>>>()?;
    let more = logs.len() > q.limit as usize;
    logs.truncate(q.limit as usize);
    let mut pagination = json!({"hasMore":more});
    if more {
        let last = logs.last().unwrap();
        pagination["nextCursor"] = URL_SAFE_NO_PAD
            .encode(format!(
                "{}|{}",
                last["createdAt"].as_str().unwrap(),
                last["id"].as_str().unwrap()
            ))
            .into()
    }
    Ok(if matches!(kind, LogKind::Webhook) {
        json!({"events":logs,"pagination":pagination})
    } else {
        json!({"logs":logs,"pagination":pagination})
    })
}
pub fn detail(
    client: &mut impl GenericClient,
    identity: &Identity,
    kind: LogKind,
    id: &str,
    by_request: bool,
) -> Result<Value> {
    let key = if by_request { "request_id" } else { "id" };
    if matches!(kind, LogKind::Webhook) && by_request {
        return Err(ApiError::new("INVALID_REQUEST"));
    }
    let sql=format!("SELECT ({})::text FROM {} l WHERE {OWNERSHIP} AND l.{key}=$3 ORDER BY l.created_at DESC,l.id DESC LIMIT 1",kind.fields(true),kind.table());
    let row = client
        .query_opt(&sql, &[&identity.project_id, &identity.account_id, &id])
        .map_err(db_error)?
        .ok_or_else(|| ApiError::new(kind.missing()))?;
    let mut value: Value = serde_json::from_str(&row.get::<_, String>(0))
        .map_err(|_| ApiError::new("STORAGE_UNAVAILABLE"))?;
    if let Some(input) = value.get("sanitizedInput") {
        value["sanitizedInput"] = sanitize(input, &[])
    }
    Ok(value)
}
pub fn trace(client: &mut impl GenericClient, identity: &Identity, id: &str) -> Result<Value> {
    let action = detail(client, identity, LogKind::Action, id, true).map_err(|e| {
        if e.code == "ACTION_LOG_NOT_FOUND" {
            ApiError::new("REQUEST_TRACE_NOT_FOUND")
        } else {
            e
        }
    })?;
    let mut result = json!({"requestId":id,"actionLog":action,"replayAvailable":false});
    match detail(client, identity, LogKind::Replay, id, true) {
        Ok(mut replay) => {
            replay.as_object_mut().unwrap().remove("sanitizedInput");
            result["replayAvailable"] = true.into();
            result["replayLog"] = replay;
        }
        Err(e) if e.code == "REPLAY_LOG_NOT_FOUND" => {
            result["replayUnavailableReason"] = "no_replay_log".into()
        }
        Err(e) => return Err(e),
    }
    Ok(result)
}
pub fn read(
    client: &mut impl GenericClient,
    identity: &Identity,
    url: &url::Url,
) -> Result<Option<Response>> {
    if identity.project_id.is_empty() {
        return Err(ApiError::new("UNAUTHORIZED"));
    }
    let decoded = url
        .path()
        .trim_matches('/')
        .split('/')
        .map(|segment| {
            percent_encoding::percent_decode_str(segment)
                .decode_utf8()
                .map(|s| s.into_owned())
                .map_err(|_| ApiError::new("INVALID_REQUEST"))
        })
        .collect::<Result<Vec<_>>>()?;
    let segments: Vec<&str> = decoded.iter().map(String::as_str).collect();
    let value = match segments.as_slice() {
        ["v1", "action-logs"] => list(client, identity, LogKind::Action, &LogQuery::parse(url)?),
        ["v1", "action-logs", id] => detail(client, identity, LogKind::Action, id, true),
        ["v1", "replay-logs"] => list(
            client,
            identity,
            LogKind::Replay,
            &LogQuery::parse_for(url, LogKind::Replay)?,
        ),
        ["v1", "replay-logs", "by-request", id] => {
            detail(client, identity, LogKind::Replay, id, true)
        }
        ["v1", "replay-logs", id] => detail(client, identity, LogKind::Replay, id, false),
        ["v1", "webhook-events"] => list(
            client,
            identity,
            LogKind::Webhook,
            &LogQuery::parse_for(url, LogKind::Webhook)?,
        ),
        ["v1", "webhook-events", id] => detail(client, identity, LogKind::Webhook, id, false),
        ["v1", "requests", id] => trace(client, identity, id),
        ["v1", "sync-runs"] => runs::list(client, identity, &RunQuery::parse(url)?),
        _ => return Ok(None),
    }
    .map_err(|error| {
        if error.code == "STORAGE_UNAVAILABLE" {
            ApiError::new(match segments.get(1).copied() {
                Some("action-logs") => "ACTION_LOGS_FAILED",
                Some("replay-logs") => "REPLAY_LOGS_FAILED",
                Some("webhook-events") => "WEBHOOK_EVENTS_FAILED",
                Some("sync-runs") => "RUNS_FAILED",
                _ => "REQUEST_TRACE_FAILED",
            })
        } else {
            error
        }
    })?;
    Ok(Some(Response {
        status: 200,
        body: value,
        headers: vec![],
    }))
}
pub fn replay_request(
    client: &mut impl GenericClient,
    identity: &Identity,
    id: &str,
    by_request: bool,
) -> Result<(String, appcall_actions::ExecuteRequest)> {
    let command = prepare_replay(client, identity, id, by_request)?;
    Ok((command.log_id, command.execute))
}

pub fn record(
    client: &mut impl GenericClient,
    request: &appcall_actions::ExecuteRequest,
    connector: &str,
    request_id: &str,
    secrets: &[&str],
) -> Result<String> {
    let id = format!("replay_{}", uuid::Uuid::new_v4().simple());
    let input = sanitize(&request.input, secrets).to_string();
    client.execute("INSERT INTO action_replay_logs(id,project_id,connection_id,connector,action,request_id,sanitized_input,external_account_id) SELECT $1,$2,$3,$4,$5,$6,$7::text::jsonb,$8 WHERE EXISTS(SELECT 1 FROM connections WHERE project_id=$2 AND id=$3)",&[&id,&request.project_id,&request.connection_id,&connector,&request.action,&request_id,&input,&request.external_account_id]).map_err(db_error).and_then(|n|if n==1{Ok(id)}else{Err(ApiError::new("CONNECTION_NOT_FOUND"))})
}
pub fn sanitize(value: &Value, secrets: &[&str]) -> Value {
    match value {
        Value::Object(map) => Value::Object(
            map.iter()
                .map(|(k, v)| {
                    let key = k.to_lowercase().replace(['_', '-', '.'], "");
                    let secret = [
                        "apikey",
                        "accesstoken",
                        "refreshtoken",
                        "authorization",
                        "authorizationheader",
                        "bottoken",
                        "clientsecret",
                        "cookie",
                        "password",
                        "secret",
                        "token",
                        "webhooksecret",
                    ]
                    .contains(&key.as_str());
                    (
                        k.clone(),
                        if secret {
                            Value::String("[REDACTED]".into())
                        } else {
                            sanitize(v, secrets)
                        },
                    )
                })
                .collect(),
        ),
        Value::Array(items) => Value::Array(items.iter().map(|v| sanitize(v, secrets)).collect()),
        Value::String(s) => Value::String(
            secrets
                .iter()
                .filter(|s| !s.is_empty())
                .fold(s.clone(), |s, secret| s.replace(secret, "[REDACTED]")),
        ),
        other => other.clone(),
    }
}
fn db_error(_: postgres::Error) -> ApiError {
    ApiError::new("STORAGE_UNAVAILABLE")
}

/// Replay retains the original history identity in its public response; action
/// execution still obtains a fresh request id and re-evaluates current policy.
pub struct ReplayCommand {
    pub log_id: String,
    pub request_id: String,
    pub execute: appcall_actions::ExecuteRequest,
}
pub fn prepare_replay(
    client: &mut impl GenericClient,
    identity: &Identity,
    id: &str,
    by_request: bool,
) -> Result<ReplayCommand> {
    let log = detail(client, identity, LogKind::Replay, id, by_request)?;
    Ok(ReplayCommand {
        log_id: log["id"].as_str().unwrap().into(),
        request_id: log["requestId"].as_str().unwrap().into(),
        execute: appcall_actions::ExecuteRequest {
            project_id: identity.project_id.clone(),
            external_account_id: identity.account_id.clone(),
            admin_scope: false,
            connection_id: log["connectionId"].as_str().unwrap().into(),
            action: log["action"].as_str().unwrap().into(),
            input: log["sanitizedInput"].clone(),
            idempotency_key: String::new(),
            caller_credential: String::new(),
        },
    })
}

#[cfg(test)]
mod query_contract_tests {
    use super::*;
    #[test]
    fn scalar_filters_take_first_value_and_ignore_other_routes_filters() {
        let url = url::Url::parse("http://x/v1/action-logs?limit=1&limit=bad&status=succeeded&status=bad&month=2026-09&month=bad").unwrap();
        let query = LogQuery::parse(&url).unwrap();
        assert_eq!(query.limit, 1);
        assert_eq!(query.get("status"), "succeeded");
        assert_eq!(first_query_values(&url)["month"], "2026-09");
        assert!(LogQuery::parse(&url::Url::parse("http://x/?limit=bad&limit=1").unwrap()).is_err());
        assert_eq!(
            LogQuery::parse(&url::Url::parse("http://x/?limit=&limit=bad").unwrap())
                .unwrap()
                .limit,
            50
        );
        assert_eq!(
            first_query_values(&url::Url::parse("http://x/?month=&month=bad").unwrap())["month"],
            ""
        );

        for kind in [LogKind::Replay, LogKind::Webhook] {
            let url = url::Url::parse("http://x/?status=irrelevant&errorCode=irrelevant").unwrap();
            assert!(LogQuery::parse_for(&url, kind).is_ok());
            assert!(LogQuery::parse_for(&url, LogKind::Action).is_err());
        }
    }
}
