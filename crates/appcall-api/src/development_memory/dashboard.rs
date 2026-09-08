//! The existing browser renderer backed by the same memory services as API/MCP.
use super::{
    backend::{account, active, memory_work, setup_error},
    MemoryCore,
};
use crate::{ApiError, Identity, Request};
use appcall_web::{
    DashboardData, DashboardFailure, DashboardOperation as Op, DashboardRequest, Error,
};
use serde_json::{json, Value};
use std::{
    collections::BTreeMap,
    future::Future,
    pin::Pin,
    sync::{Arc, Mutex},
};
pub struct MemoryDashboard {
    core: Arc<MemoryCore>,
    state: Mutex<Presentation>,
}
#[derive(Default)]
struct Presentation {
    branding: BTreeMap<String, Value>,
    requests: Vec<Value>,
}
impl MemoryDashboard {
    pub fn new(core: Arc<MemoryCore>) -> Self {
        Self {
            core,
            state: Mutex::new(Presentation::default()),
        }
    }
    async fn run(&self, r: DashboardRequest) -> Result<Value, DashboardFailure> {
        // Development mode does not confer trusted operator authority.
        if r.operation == Op::Qa {
            return Err(Error::Forbidden.into());
        }
        let account_id = r
            .account_id
            .as_deref()
            .or(r.principal.brand_id.as_deref())
            .unwrap_or("");
        if r.principal.project_id.is_empty()
            || r.principal.user_id.is_none()
                && !(r.principal.project_id == "proj_dev" && r.principal.tenant_id.is_none())
            || r.principal
                .brand_id
                .as_deref()
                .is_some_and(|b| b != account_id)
            || !r.principal.allowed_brands.permits(account_id)
            || r.principal.scopes != appcall_auth::Grant::All
        {
            return Err(Error::Forbidden.into());
        }
        self.core
            .repository
            .ensure_project(&r.principal.project_id)
            .map_err(|_| Error::Unavailable)?;
        let identity = Identity {
            project_id: r.principal.project_id.clone(),
            account_id: account_id.into(),
            admin_scope: false,
        };
        let resource = r.resource.as_deref().unwrap_or("");
        let field = |key: &str| r.fields.get(key).map(String::as_str).unwrap_or("");
        if !active() {
            return Err(Error::Unavailable.into());
        }
        match r.operation {
            Op::Catalog => Ok(
                json!({"connectors":self.core.registry().public_list().map(|c|crate::browser_host::catalog_item(c.manifest())).collect::<Vec<_>>()}),
            ),
            Op::Toolkit | Op::TestForm => {
                let c = self
                    .core
                    .registry()
                    .public_connector(resource)
                    .map_err(|_| Error::Invalid)?;
                let mut item = crate::browser_host::catalog_item(c.manifest());
                item["setup"] = serde_json::to_value(&c.manifest().auth.setup)
                    .map_err(|_| Error::Unavailable)?;
                item["connections"] = self
                    .core
                    .connections(&identity)
                    .await
                    .map_err(web_error)?
                    .iter()
                    .filter(|c| c.connector == resource)
                    .map(crate::browser_host::connection_value)
                    .collect();
                let selected = crate::browser_host::selected_action(c.manifest(), field("action"))?;
                if let Some((action, op)) = selected {
                    item["action"] = action.clone().into();
                    item["inputSchema"] = op
                        .input_schema
                        .clone()
                        .unwrap_or_else(|| json!({"type":"object"}));
                    item["sample"] = op.sample.clone().unwrap_or(Value::Null);
                    item["connectionId"] = field("connectionId").into();
                }
                Ok(item)
            }
            Op::Overview => Ok(
                json!({"toolkitCount":self.core.registry().public_list().count(),"connectionCount":self.core.connections(&identity).await.map_err(web_error)?.len(),"toolCalls":self.core.usage(&identity,"").map_err(web_error)?["actionCalls"]}),
            ),
            Op::AuthConfigs => Ok(
                json!({"connections":self.core.connections(&identity).await.map_err(web_error)?.iter().map(crate::browser_host::connection_value).collect::<Vec<_>>()}),
            ),
            Op::TestConnection => Ok(crate::browser_host::connection_value(
                &self
                    .core
                    .test_connection(&identity, resource)
                    .await
                    .map_err(web_error)?,
            )),
            Op::DisconnectConnection => {
                self.core
                    .disconnect(&identity, resource)
                    .await
                    .map_err(web_error)?;
                Ok(json!({"disconnected":true}))
            }
            Op::Usage => {
                let mut value = self
                    .core
                    .usage(&identity, field("month"))
                    .map_err(web_error)?;
                value["toolCalls"] = value["actionCalls"].clone();
                Ok(value)
            }
            Op::Qa => Ok(json!({"unavailable":true,"certifications":[]})),
            Op::Logs | Op::Trace | Op::Triggers | Op::Stream => {
                let path = match r.operation {
                    Op::Logs => "/v1/action-logs".to_owned(),
                    Op::Trace => format!("/v1/requests/{resource}"),
                    _ => "/v1/webhook-events".into(),
                };
                let mut url = url::Url::parse(&format!("http://local.invalid{path}"))
                    .map_err(|_| Error::Invalid)?;
                for (k, v) in &r.fields {
                    if [
                        "limit",
                        "cursor",
                        "connectionId",
                        "connector",
                        "action",
                        "status",
                        "requestId",
                        "errorCode",
                        "operation",
                    ]
                    .contains(&k.as_str())
                        || r.operation == Op::Logs
                            && ["createdFrom", "createdBefore"].contains(&k.as_str())
                    {
                        url.query_pairs_mut().append_pair(k, v);
                    }
                }
                let response = if matches!(r.operation, Op::Triggers | Op::Stream) {
                    let principal = appcall_auth::Principal {
                        brand_id: (!account_id.is_empty()).then(|| account_id.to_owned()),
                        ..r.principal.clone()
                    };
                    self.core
                        .events
                        .handle(
                            Some(&principal),
                            &Request {
                                method: "GET".into(),
                                uri: format!(
                                    "{}{}",
                                    url.path(),
                                    url.query().map(|q| format!("?{q}")).unwrap_or_default()
                                ),
                                headers: vec![],
                                body: vec![],
                            },
                        )
                        .await
                        .map_err(web_error)?
                } else {
                    self.core.history.read(&identity, &url).map_err(web_error)?
                };
                response
                    .map(|r| r.body)
                    .ok_or_else(|| Error::Invalid.into())
            }
            Op::ReplayTrace => {
                let request = Request {
                    method: "POST".into(),
                    uri: format!("/v1/requests/{resource}/replay"),
                    headers: vec![],
                    body: vec![],
                };
                let mut execute = self
                    .core
                    .history
                    .prepare_replay(&identity, resource, &request)
                    .map_err(web_error)?;
                execute.admin_scope = account_id.is_empty();
                let value = self.core.execute(execute).await.map_err(web_error)?;
                Ok(
                    json!({"requestId":value.request_id,"replayLogId":value.replay_log_id,"output":value.output}),
                )
            }
            Op::ReplayEvent => {
                let request = Request {
                    method: "POST".into(),
                    uri: format!("/v1/webhook-events/{resource}/replay"),
                    headers: vec![],
                    body: vec![],
                };
                self.core
                    .events
                    .handle(Some(&r.principal), &request)
                    .await
                    .map_err(web_error)?
                    .map(|r| r.body)
                    .ok_or_else(|| Error::Invalid.into())
            }
            Op::Branding => Ok(self
                .state
                .lock()
                .map_err(|_| Error::Unavailable)?
                .branding
                .get(&identity.project_id)
                .cloned()
                .unwrap_or_else(|| json!({"appName":"appcall","logoURL":"","tagColor":"#5eead4"}))),
            Op::SaveBranding => {
                let name = field("appName").trim();
                let logo = field("logoURL");
                let color = field("tagColor");
                if name.len() > 128
                    || logo.len() > 2048
                    || (!logo.is_empty()
                        && url::Url::parse(logo).ok().is_none_or(|u| {
                            u.scheme() != "https"
                                || !u.username().is_empty()
                                || u.password().is_some()
                        }))
                    || !(color.len() == 7
                        && color.starts_with('#')
                        && color[1..].bytes().all(|b| b.is_ascii_hexdigit()))
                {
                    return Err(Error::Invalid.into());
                }
                let value = json!({"appName":if name.is_empty(){"appcall"}else{name},"logoURL":logo,"tagColor":color});
                let mut state = self.state.lock().map_err(|_| Error::Unavailable)?;
                if state.branding.len() >= 1000
                    && !state.branding.contains_key(&identity.project_id)
                {
                    return Err(Error::Unavailable.into());
                }
                let old = state
                    .branding
                    .get(&identity.project_id)
                    .map(|v| v.to_string().len() + identity.project_id.len() + 128)
                    .unwrap_or(0);
                let bytes = value.to_string().len() + identity.project_id.len() + 128;
                let mut data = self
                    .core
                    .repository
                    .lock()
                    .map_err(|_| Error::Unavailable)?;
                data.check_capacity(self.core.repository.limits(), bytes.saturating_sub(old), 0)
                    .map_err(|_| Error::Unavailable)?;
                data.bytes_used = data.bytes_used.saturating_sub(old) + bytes;
                state.branding.insert(identity.project_id, value.clone());
                Ok(value)
            }
            Op::RequestToolkit => {
                if field("name").trim().is_empty()
                    || field("name").len() > 256
                    || field("email").len() > 256
                    || field("notes").len() > 4000
                {
                    return Err(Error::Invalid.into());
                }
                let mut state = self.state.lock().map_err(|_| Error::Unavailable)?;
                if state.requests.len() >= 1000 {
                    return Err(Error::Unavailable.into());
                }
                let value = json!({"event":"toolkit_requested","projectId":identity.project_id,"name":field("name"),"email":field("email"),"notes":field("notes")});
                let bytes = value.to_string().len() + 128;
                let mut data = self
                    .core
                    .repository
                    .lock()
                    .map_err(|_| Error::Unavailable)?;
                data.check_capacity(self.core.repository.limits(), bytes, 0)
                    .map_err(|_| Error::Unavailable)?;
                data.bytes_used += bytes;
                eprintln!("{value}");
                state.requests.push(value);
                Ok(json!({"accepted":true}))
            }
            Op::Setup => {
                let setup = self.core.setup.clone();
                let resource = resource.to_owned();
                let description = setup
                    .describe(&resource)
                    .map_err(setup_error)
                    .map_err(web_error)?;
                let route = field("route").to_owned();
                let existing = field("connectionId").to_owned();
                let fields = r
                    .fields
                    .iter()
                    .filter(|(k, _)| {
                        !["externalAccountId", "route", "projectId", "connectionId"]
                            .contains(&k.as_str())
                    })
                    .map(|(k, v)| (k.clone(), v.clone()))
                    .collect();
                memory_work(move || {
                    let map = |error: appcall_setup::Error| {
                        let classification = web_error(ApiError::from(error.clone())).classification();
                        crate::browser_host::dashboard_failure::setup_failure(error, classification, &description.setup, &route)
                    };
                    let result = if description.setup.mode == "oauth2" {
                        setup.start_checked(&identity.project_id, account(&identity), &resource, (!existing.is_empty()).then_some(existing.as_str()), &active)
                            .map(|start| { let local = start.authorization_url.starts_with("/oauth/local/authorize?"); json!({"redirectUrl":start.authorization_url,"connectionId":start.connection.id,"developmentOAuth":local}) })
                            .map_err(map)
                    } else {
                        setup.submit_checked(&identity.project_id, account(&identity), &resource, &route, &fields, &active)
                            .map(|c| crate::browser_host::connection_value(&c)).map_err(map)
                    };
                    Ok(result)
                }).await.map_err(web_error)?
            }
            Op::Test | Op::Options | Op::RunInputFields => {
                let id = field("connectionId");
                let action = match r.operation {
                    Op::Options => field("source"),
                    Op::RunInputFields => {
                        if field("source").is_empty() {
                            "actors.input_schema"
                        } else {
                            field("source")
                        }
                    }
                    _ => field("action"),
                };
                let connection = self
                    .core
                    .connection(&identity, id)
                    .await
                    .map_err(web_error)?;
                if connection.connector != resource {
                    return Err(Error::Forbidden.into());
                }
                let operation = self
                    .core
                    .registry()
                    .operation(resource, action)
                    .map_err(|_| Error::Invalid)?;
                if r.operation != Op::Test && !operation.is_read_only() {
                    return Err(Error::Forbidden.into());
                }
                let input = match r.operation {
                    Op::Options => {
                        let key = if field("searchParam").is_empty() {
                            "search"
                        } else {
                            field("searchParam")
                        };
                        json!({key:field("q")})
                    }
                    Op::RunInputFields => json!({"actorId":field("actorId")}),
                    _ => {
                        let raw = if field("input_raw").is_empty() {
                            field("input")
                        } else {
                            field("input_raw")
                        };
                        if raw.is_empty() {
                            crate::browser_host::guided_action_input_detailed(
                                operation.input_schema.as_ref().unwrap_or(&json!({})),
                                &r.form_values,
                                field("runInputSchema"),
                            )?
                        } else {
                            serde_json::from_str(raw)
                                .map_err(crate::browser_host::dashboard_failure::invalid_json)?
                        }
                    }
                };
                let result = self
                    .core
                    .execute(appcall_actions::ExecuteRequest {
                        project_id: identity.project_id,
                        connection_id: id.into(),
                        external_account_id: account_id.into(),
                        admin_scope: account_id.is_empty(),
                        action: action.into(),
                        input,
                        idempotency_key: String::new(),
                        caller_credential: field("callerToken").into(),
                    })
                    .await
                    .map_err(web_error)?;
                match r.operation {
                    Op::Options => {
                        let values = result
                            .output
                            .get("options")
                            .and_then(Value::as_array)
                            .ok_or(Error::Unavailable)?;
                        let value_field = if field("valueField").is_empty() {
                            "value"
                        } else {
                            field("valueField")
                        };
                        let label_field = if field("labelField").is_empty() {
                            "label"
                        } else {
                            field("labelField")
                        };
                        Ok(
                            json!({"options":values.iter().map(|v|json!({"value":v[value_field],"label":v[label_field]})).collect::<Vec<_>>()}),
                        )
                    }
                    Op::RunInputFields => {
                        let schema = result
                            .output
                            .get("schema")
                            .filter(|s| s.is_object())
                            .ok_or(Error::Unavailable)?;
                        Ok(json!({"inputSchema":schema,"schema":schema,"actorId":field("actorId")}))
                    }
                    _ => Ok(json!({"requestId":result.request_id,"output":result.output})),
                }
            }
        }
    }
}
impl DashboardData for MemoryDashboard {
    fn execute_detailed(
        &self,
        r: DashboardRequest,
    ) -> Pin<Box<dyn Future<Output = Result<Value, DashboardFailure>> + Send + '_>> {
        Box::pin(self.run(r))
    }

    fn execute(
        &self,
        r: DashboardRequest,
    ) -> Pin<Box<dyn Future<Output = Result<Value, Error>> + Send + '_>> {
        Box::pin(async move { self.run(r).await.map_err(|e| e.classification()) })
    }
}
fn web_error(error: ApiError) -> DashboardFailure {
    let classification = match error.code {
        "UNAUTHORIZED" => Error::Unauthorized,
        "FORBIDDEN" | "CONNECTION_NOT_FOUND" | "ACTION_NOT_PERMITTED" => Error::Forbidden,
        "INVALID_REQUEST"
        | "INVALID_JSON"
        | "INVALID_LIMIT"
        | "INVALID_CURSOR"
        | "INVALID_TIME_RANGE"
        | "INVALID_STATUS"
        | "INVALID_ERROR_CODE"
        | "UNKNOWN_ACTION"
        | "MISSING_SETUP_FIELD" => Error::Invalid,
        _ => Error::Unavailable,
    };
    crate::browser_host::dashboard_failure::map_classified(error, classification)
}

#[cfg(test)]
#[test]
fn logs_filter_errors_are_invalid_in_memory_dashboard() {
    for code in ["INVALID_TIME_RANGE", "INVALID_STATUS", "INVALID_ERROR_CODE"] {
        assert_eq!(
            web_error(ApiError::new(code)).classification(),
            Error::Invalid,
            "{code}"
        );
    }
}
