//! Sanitized history views over the same memory repository used by actions.
use super::{
    state::{ActionLog, ReplayLog},
    MemoryRepository,
};
use crate::{
    data_routes::{sanitize, LogKind, LogQuery},
    ApiError, Identity, Request, Response, Result,
};
use appcall_actions::{Attempt, ExecuteRequest};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use chrono::{DateTime, Utc};
use serde_json::{json, Value};
#[derive(Clone)]
pub struct MemoryHistory(MemoryRepository);
impl MemoryHistory {
    pub fn new(repo: MemoryRepository) -> Self {
        Self(repo)
    }
    fn rows(
        &self,
        identity: &Identity,
        replay: bool,
        selected: Option<(&str, bool)>,
    ) -> Result<Vec<Value>> {
        if identity.project_id.is_empty() {
            return Err(ApiError::new("UNAUTHORIZED"));
        }
        let data = self
            .0
            .lock()
            .map_err(|_| ApiError::new("STORAGE_UNAVAILABLE"))?;
        let allowed = |a: &Attempt| {
            a.project_id == identity.project_id
                && (identity.account_id.is_empty() || a.external_account_id == identity.account_id)
                && data
                    .connections
                    .get(&a.connection_id)
                    .is_some_and(|c| c.project_id == identity.project_id)
        };
        let mut rows: Vec<Value> = if replay {
            data.replay_logs
                .values()
                .filter(|l| {
                    allowed(&l.attempt)
                        && selected.is_none_or(|(id, by_request)| {
                            if by_request {
                                l.attempt.request_id == id
                            } else {
                                l.id == id
                            }
                        })
                })
                .map(|l| replay_projection(l, selected.is_some()))
                .collect()
        } else {
            data.action_logs
                .iter()
                .filter(|(key, l)| {
                    allowed(&l.attempt)
                        && selected.is_none_or(|(id, by_request)| {
                            if by_request {
                                l.attempt.request_id == id
                            } else {
                                key.as_str() == id
                            }
                        })
                })
                .map(|(id, l)| action_projection(id, l))
                .collect()
        };
        rows.sort_by_key(|row| std::cmp::Reverse(sort_key(row)));
        Ok(rows)
    }
    pub fn read(&self, identity: &Identity, url: &url::Url) -> Result<Option<Response>> {
        let decoded = url
            .path()
            .trim_matches('/')
            .split('/')
            .map(|s| {
                percent_encoding::percent_decode_str(s)
                    .decode_utf8()
                    .map(|s| s.into_owned())
                    .map_err(|_| ApiError::new("INVALID_REQUEST"))
            })
            .collect::<Result<Vec<_>>>()?;
        let path: Vec<&str> = decoded.iter().map(String::as_str).collect();
        let body = match path.as_slice() {
            ["v1", "action-logs"] => self.list(identity, false, &LogQuery::parse(url)?)?,
            ["v1", "replay-logs"] => {
                self.list(identity, true, &LogQuery::parse_for(url, LogKind::Replay)?)?
            }
            ["v1", "action-logs", id] => self.detail(identity, false, id, true)?,
            ["v1", "replay-logs", "by-request", id] => self.detail(identity, true, id, true)?,
            ["v1", "replay-logs", id] => self.detail(identity, true, id, false)?,
            ["v1", "requests", id] => {
                let action = self.detail(identity, false, id, true).map_err(|e| {
                    if e.code == "ACTION_LOG_NOT_FOUND" {
                        ApiError::new("REQUEST_TRACE_NOT_FOUND")
                    } else {
                        e
                    }
                })?;
                let mut result = json!({"requestId":id,"actionLog":action,"replayAvailable":false});
                match self.detail(identity, true, id, true) {
                    Ok(mut replay) => {
                        replay.as_object_mut().unwrap().remove("sanitizedInput");
                        result["replayLog"] = replay;
                        result["replayAvailable"] = true.into();
                    }
                    Err(e) if e.code == "REPLAY_LOG_NOT_FOUND" => {
                        result["replayUnavailableReason"] = "no_replay_log".into()
                    }
                    Err(e) => return Err(e),
                }
                result
            }
            _ => return Ok(None),
        };
        Ok(Some(Response {
            status: 200,
            body,
            headers: vec![],
        }))
    }
    fn list(&self, identity: &Identity, replay: bool, q: &LogQuery) -> Result<Value> {
        let mut rows = self.rows(identity, replay, None)?;
        let (time, id) = q.cursor_boundary();
        let cursor = if time.is_empty() {
            None
        } else {
            Some((
                DateTime::parse_from_rfc3339(time)
                    .map_err(|_| ApiError::new("INVALID_CURSOR"))?
                    .with_timezone(&Utc),
                id.to_owned(),
            ))
        };
        rows.retain(|r| {
            ["connectionId", "connector", "action", "requestId"]
                .into_iter()
                .all(|key| q.get(key).is_empty() || r[key].as_str() == Some(q.get(key)))
                && (replay
                    || ["status", "errorCode"]
                        .into_iter()
                        .all(|key| q.get(key).is_empty() || r[key].as_str() == Some(q.get(key))))
                && cursor.as_ref().is_none_or(|c| sort_key(r) < *c)
        });
        let more = rows.len() > q.limit as usize;
        rows.truncate(q.limit as usize);
        let mut pagination = json!({"hasMore":more});
        if more {
            let last = rows.last().unwrap();
            pagination["nextCursor"] = URL_SAFE_NO_PAD
                .encode(format!(
                    "{}|{}",
                    last["createdAt"].as_str().unwrap(),
                    last["id"].as_str().unwrap()
                ))
                .into();
        }
        for row in &mut rows {
            row.as_object_mut().unwrap().remove("sanitizedInput");
        }
        Ok(json!({"logs":rows,"pagination":pagination}))
    }
    pub fn detail(
        &self,
        identity: &Identity,
        replay: bool,
        id: &str,
        by_request: bool,
    ) -> Result<Value> {
        let key = if by_request { "requestId" } else { "id" };
        self.rows(identity, replay, Some((id, by_request)))?
            .into_iter()
            .find(|r| r[key].as_str() == Some(id))
            .ok_or_else(|| {
                ApiError::new(if replay {
                    "REPLAY_LOG_NOT_FOUND"
                } else {
                    "ACTION_LOG_NOT_FOUND"
                })
            })
    }
    pub fn prepare_replay(
        &self,
        identity: &Identity,
        id: &str,
        request: &Request,
    ) -> Result<ExecuteRequest> {
        let by_request = request
            .uri
            .split('?')
            .next()
            .unwrap_or("")
            .starts_with("/v1/requests/");
        let log = self.detail(identity, true, id, by_request)?;
        Ok(ExecuteRequest {
            project_id: identity.project_id.clone(),
            connection_id: log["connectionId"].as_str().unwrap().into(),
            external_account_id: identity.account_id.clone(),
            admin_scope: false,
            action: log["action"].as_str().unwrap().into(),
            idempotency_key: String::new(),
            input: log["sanitizedInput"].clone(),
            caller_credential: crate::connector_token(&request.headers).into(),
        })
    }
}
fn sort_key(value: &Value) -> (DateTime<Utc>, String) {
    (
        DateTime::parse_from_rfc3339(value["createdAt"].as_str().unwrap())
            .unwrap()
            .with_timezone(&Utc),
        value["id"].as_str().unwrap().into(),
    )
}
fn common(id: &str, a: &Attempt, at: DateTime<Utc>) -> Value {
    json!({"id":id,"connectionId":a.connection_id,"connector":a.connector,"createdAt":at,"requestId":a.request_id,"action":a.action})
}
fn action_projection(id: &str, l: &ActionLog) -> Value {
    let mut v = common(id, &l.attempt, l.created_at);
    v["status"] = l.status.clone().into();
    if !l.error_code.is_empty() {
        v["errorCode"] = l.error_code.clone().into();
    }
    v
}
fn replay_projection(l: &ReplayLog, detail: bool) -> Value {
    let mut v = common(&l.id, &l.attempt, l.created_at);
    if detail {
        v["sanitizedInput"] = sanitize(&l.sanitized_input, &[]);
    }
    v
}
