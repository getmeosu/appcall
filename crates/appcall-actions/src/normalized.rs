//! Go-compatible normalized post checks at the action commit boundary.
//! Keep native provider operations untouched. A bad normalized result is logged
//! as failure and must never become a successful idempotency cache/replay entry.
use crate::{ActionError, Result};
use serde_json::Value;

pub(crate) fn validate_action_output(connector: &str, action: &str, output: &Value) -> Result<()> {
    if action != "normalized.post.create" {
        return Ok(());
    }
    let invalid = || ActionError::new("ACTION_RESPONSE_INVALID");
    let post = output.as_object().ok_or_else(invalid)?;
    for key in ["id", "provider", "providerPostId"] {
        if post
            .get(key)
            .and_then(Value::as_str)
            .is_none_or(|s| s.trim().is_empty())
        {
            return Err(invalid());
        }
    }
    if post["provider"] != connector
        || post.get("modelVersion").and_then(Value::as_str) != Some("2026-09-05")
        || !post.get("raw").is_some_and(Value::is_object)
    {
        return Err(invalid());
    }
    // Go encoding/json accepts null for optional string fields as the zero value.
    for key in ["text", "authorId", "url", "publishedAt"] {
        if post
            .get(key)
            .is_some_and(|v| !v.is_null() && !v.is_string())
        {
            return Err(invalid());
        }
    }
    if let Some(time) = post
        .get("publishedAt")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
    {
        if chrono::DateTime::parse_from_rfc3339(time).is_err()
            || time.as_bytes().get(17..19) == Some(b"60")
        {
            return Err(invalid());
        }
    }
    if let Some(media) = post.get("media").filter(|v| !v.is_null()) {
        for item in media.as_array().ok_or_else(invalid)? {
            let item = item.as_object().ok_or_else(invalid)?;
            if item
                .get("url")
                .and_then(Value::as_str)
                .is_none_or(|s| s.trim().is_empty())
                || item
                    .get("type")
                    .is_some_and(|v| !v.is_null() && !v.is_string())
            {
                return Err(invalid());
            }
        }
    }
    Ok(())
}
