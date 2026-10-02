//! Optional console → workflow-engine HTTP client. Path-only routes; no query strings.
//! Deliberately omits Debug so bearer configuration stays private.
use percent_encoding::{utf8_percent_encode, NON_ALPHANUMERIC};
use serde_json::Value;
use std::{collections::BTreeMap, time::Duration};

const URL_ENV: &str = "APPCALL_WORKFLOW_ENGINE_URL";
const TOKEN_ENV: &str = "APPCALL_WORKFLOW_ENGINE_TOKEN";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WorkflowEngineError {
    Configuration,
    Transport,
    Response,
    NotFound,
}

/// Bearer-authenticated engine list client. Construct once; clone freely.
#[derive(Clone)]
pub struct WorkflowEngineClient {
    base: reqwest::Url,
    http: reqwest::Client,
}

impl WorkflowEngineClient {
    pub fn from_env() -> Result<Option<Self>, WorkflowEngineError> {
        Self::from_map(&std::env::vars().collect())
    }

    pub fn from_map(env: &BTreeMap<String, String>) -> Result<Option<Self>, WorkflowEngineError> {
        let url = env.get(URL_ENV).map(|s| s.trim()).filter(|s| !s.is_empty());
        let token = env
            .get(TOKEN_ENV)
            .map(|s| s.trim())
            .filter(|s| !s.is_empty());
        match (url, token) {
            (None, None) => Ok(None),
            (Some(url), Some(token)) => Self::new(url, token).map(Some),
            _ => Err(WorkflowEngineError::Configuration),
        }
    }

    pub fn new(base_url: &str, bearer_token: &str) -> Result<Self, WorkflowEngineError> {
        let mut base =
            reqwest::Url::parse(base_url).map_err(|_| WorkflowEngineError::Configuration)?;
        if !matches!(base.scheme(), "http" | "https")
            || !base.username().is_empty()
            || base.password().is_some()
            || base.query().is_some()
            || base.fragment().is_some()
            || base.host_str().is_none()
        {
            return Err(WorkflowEngineError::Configuration);
        }
        // Normalize to a directory-like base so joins replace the final segment cleanly.
        if !base.path().ends_with('/') {
            let path = format!("{}/", base.path().trim_end_matches('/'));
            base.set_path(&path);
        }
        let token = bearer_token.trim();
        if token.len() < 32 || token.len() > 256 || !token.is_ascii() {
            return Err(WorkflowEngineError::Configuration);
        }
        let mut headers = reqwest::header::HeaderMap::new();
        let mut header = reqwest::header::HeaderValue::from_str(&format!("Bearer {token}"))
            .map_err(|_| WorkflowEngineError::Configuration)?;
        header.set_sensitive(true);
        headers.insert(reqwest::header::AUTHORIZATION, header);
        let http = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(Duration::from_secs(10))
            .default_headers(headers)
            .no_proxy()
            .build()
            .map_err(|_| WorkflowEngineError::Configuration)?;
        Ok(Self { base, http })
    }

    pub async fn list_workflows(&self) -> Result<Value, WorkflowEngineError> {
        let data = self.get("workflows").await?;
        data.get("workflows")
            .cloned()
            .ok_or(WorkflowEngineError::Response)
    }

    pub async fn list_run_summaries(
        &self,
        cursor: Option<&str>,
    ) -> Result<Value, WorkflowEngineError> {
        let path = match cursor.map(str::trim).filter(|c| !c.is_empty()) {
            Some(cursor) => {
                if cursor.len() > 128
                    || !cursor
                        .bytes()
                        .all(|b| b.is_ascii_alphanumeric() || b"_-.:/".contains(&b))
                {
                    return Err(WorkflowEngineError::Configuration);
                }
                format!(
                    "workflow-runs/after/{}",
                    utf8_percent_encode(cursor, NON_ALPHANUMERIC)
                )
            }
            None => "workflow-runs".into(),
        };
        self.get(&path).await
    }

    /// Engine `GET /runs/{id}` — state, failure_reason, reconciliation_audit only.
    pub async fn get_run(&self, id: &str) -> Result<Value, WorkflowEngineError> {
        let id = id.trim();
        if !valid_run_id(id) {
            return Err(WorkflowEngineError::Configuration);
        }
        self.get(&format!(
            "runs/{}",
            utf8_percent_encode(id, NON_ALPHANUMERIC)
        ))
        .await
    }

    async fn get(&self, relative: &str) -> Result<Value, WorkflowEngineError> {
        if relative.contains('?') || relative.contains('#') || relative.contains("..") {
            return Err(WorkflowEngineError::Configuration);
        }
        let url = self
            .base
            .join(relative)
            .map_err(|_| WorkflowEngineError::Configuration)?;
        if url.query().is_some() {
            return Err(WorkflowEngineError::Configuration);
        }
        let response = self
            .http
            .get(url)
            .send()
            .await
            .map_err(|_| WorkflowEngineError::Transport)?;
        let status = response.status();
        if status.as_u16() == 404 {
            return Err(WorkflowEngineError::NotFound);
        }
        if !status.is_success() {
            return Err(WorkflowEngineError::Transport);
        }
        let bytes = response
            .bytes()
            .await
            .map_err(|_| WorkflowEngineError::Transport)?;
        if bytes.len() > 1024 * 1024 {
            return Err(WorkflowEngineError::Response);
        }
        let envelope: Value =
            serde_json::from_slice(&bytes).map_err(|_| WorkflowEngineError::Response)?;
        if envelope.get("success").and_then(Value::as_bool) != Some(true) {
            return Err(WorkflowEngineError::Response);
        }
        envelope
            .get("data")
            .cloned()
            .ok_or(WorkflowEngineError::Response)
    }
}

fn valid_run_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 256
        && !matches!(value, "." | "..")
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.'))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn get_run_rejects_untrusted_identifiers_without_transport() {
        let client =
            WorkflowEngineClient::new("http://127.0.0.1:9/", &"a".repeat(32)).expect("client");
        for bad in ["", ".", "..", "a/b", "a b", "a?b", "a#b", &"x".repeat(257)] {
            assert_eq!(
                client.get_run(bad).await,
                Err(WorkflowEngineError::Configuration),
                "{bad:?}"
            );
        }
    }
}
