use super::*;
use serde::Deserialize;
pub fn unified_request(
    identity: &Identity,
    body: &[u8],
    headers: &[(String, String)],
) -> Result<appcall_actions::ExecuteRequest> {
    if body.len() > 1024 * 1024 {
        return Err(ApiError::new("ACTION_INPUT_TOO_LARGE"));
    }
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase", deny_unknown_fields)]
    struct Body {
        connection_id: String,
        input: Value,
    }
    let body: Body = serde_json::from_slice(body).map_err(|_| ApiError::new("INVALID_JSON"))?;
    if body.connection_id.trim().is_empty() || !body.input.is_object() {
        return Err(ApiError::new("INVALID_JSON"));
    }
    Ok(appcall_actions::ExecuteRequest {
        project_id: identity.project_id.clone(),
        connection_id: body.connection_id,
        external_account_id: identity.account_id.clone(),
        admin_scope: false,
        action: "normalized.post.create".into(),
        input: body.input,
        idempotency_key: crate::header(headers, "Idempotency-Key").into(),
        caller_credential: crate::connector_token(headers).into(),
    })
}
pub fn unified_response(result: appcall_actions::ExecuteResult) -> Result<Response> {
    if !valid_post(&result.output) {
        let mut error = ApiError::new("ACTION_RESPONSE_INVALID");
        error.request_id = result.request_id;
        return Err(error);
    }
    let post = project_post(&result.output);
    let mut body = json!({"success":true,"model":"post","data":[post],"pagination":{},"requestId":result.request_id});
    if !result.replay_log_id.is_empty() {
        body["replayLogId"] = result.replay_log_id.into()
    }
    if result.usage_warning {
        body["usageWarning"] = true.into();
        body["usage"] =
            serde_json::to_value(result.usage).map_err(|_| ApiError::new("ACTION_FAILED"))?
    }
    Ok(Response {
        status: 200,
        body,
        headers: vec![],
    })
}
/// Must also run inside the action catalog before success/idempotency persistence.
pub fn valid_post(post: &Value) -> bool {
    ["id", "provider", "providerPostId"].iter().all(|k| {
        post.get(k)
            .and_then(Value::as_str)
            .is_some_and(|s| !s.trim().is_empty())
    }) && post["modelVersion"] == "2026-09-05"
        && post["raw"].is_object()
        && ["text", "authorId", "url"]
            .iter()
            .all(|key| post.get(key).is_none_or(|v| v.is_null() || v.is_string()))
        && post.get("publishedAt").is_none_or(|v| {
            v.is_null()
                || v.as_str().is_some_and(|s| {
                    s.is_empty()
                        || (chrono::DateTime::parse_from_rfc3339(s).is_ok()
                            && s.as_bytes().get(17..19) != Some(b"60"))
                })
        })
        && post.get("media").is_none_or(|v| {
            v.is_null()
                || v.as_array().is_some_and(|items| {
                    items.iter().all(|m| {
                        m.get("type").is_none_or(|v| v.is_null() || v.is_string())
                            && m.get("url")
                                .and_then(Value::as_str)
                                .is_some_and(|s| !s.trim().is_empty())
                    })
                })
        })
}
fn project_post(post: &Value) -> Value {
    let mut value = json!({"id":post["id"],"provider":post["provider"],"providerPostId":post["providerPostId"],"text":post.get("text").and_then(Value::as_str).unwrap_or(""),"modelVersion":post["modelVersion"],"raw":post["raw"]});
    for key in ["authorId", "url", "publishedAt"] {
        if post
            .get(key)
            .and_then(Value::as_str)
            .is_some_and(|s| !s.is_empty())
        {
            value[key] = post[key].clone()
        }
    }
    if let Some(items) = post
        .get("media")
        .and_then(Value::as_array)
        .filter(|items| !items.is_empty())
    {
        value["media"] = items
            .iter()
            .map(|m| {
                let mut item = json!({"url":m["url"]});
                if m.get("type")
                    .and_then(Value::as_str)
                    .is_some_and(|s| !s.is_empty())
                {
                    item["type"] = m["type"].clone()
                }
                item
            })
            .collect();
    }
    value
}
