use crate::{Error, OAuthTransaction, Session};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{sync::Arc, time::Duration};
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Membership {
    pub tenant_id: String,
    #[serde(default)]
    pub tenant_name: String,
    #[serde(default)]
    pub role: String,
    #[serde(default)]
    pub is_root: bool,
}
#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthResult {
    #[serde(default)]
    pub access_token: String,
    #[serde(default)]
    pub refresh_token: String,
    #[serde(default)]
    pub memberships: Vec<Membership>,
    #[serde(default)]
    pub mfa_required: bool,
    #[serde(default)]
    pub mfa_token: String,
}
/// Application-lifetime identity transport. Clones retain the same refresh
/// coordinator, including in-flight exchanges across database generations.
#[derive(Clone)]
pub struct Broker {
    refresh_cache: Arc<crate::refresh::RefreshCache>,
    base: reqwest::Url,
    client: reqwest::Client,
    pub product_slug: String,
}
impl Broker {
    /// Construct once during application assembly, then inject the same Arc into
    /// every replacement BrowserHost. Database recovery must not recreate it.
    pub fn shared(base: &str, product_slug: &str) -> Result<Arc<Self>, Error> {
        Self::new(base, product_slug).map(Arc::new)
    }
    pub fn new(base: &str, product_slug: &str) -> Result<Self, Error> {
        let base = reqwest::Url::parse(base).map_err(|_| Error::Configuration)?;
        if !base.username().is_empty()
            || base.password().is_some()
            || base.query().is_some()
            || base.fragment().is_some()
            || !(base.scheme() == "https"
                || (base.scheme() == "http"
                    && matches!(base.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"))))
        {
            return Err(Error::Configuration);
        }
        let client = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(Duration::from_secs(10))
            .build()
            .map_err(|_| Error::Configuration)?;
        Ok(Self {
            refresh_cache: Default::default(),
            base,
            client,
            product_slug: product_slug.into(),
        })
    }
    pub async fn refresh_tokens(&self, token: &str) -> Result<(String, String), Error> {
        self.refresh_cache.rotate(self, token).await
    }
    pub fn oauth_url(&self, provider: &str, tx: &OAuthTransaction) -> Result<String, Error> {
        if !matches!(provider, "google" | "github" | "microsoft") {
            return Err(Error::Invalid);
        }
        let mut url = self
            .base
            .join(&format!("/api/auth/{provider}"))
            .map_err(|_| Error::Configuration)?;
        url.query_pairs_mut()
            .append_pair("client_state", &tx.state)
            .append_pair("code_challenge", &tx.challenge())
            .append_pair("code_challenge_method", "S256");
        Ok(url.into())
    }
    /// Paths must be selected by trusted route code; this adapter never follows redirects.
    pub async fn call(
        &self,
        method: reqwest::Method,
        path: &str,
        session: Option<&Session>,
        body: Option<Value>,
    ) -> Result<Value, Error> {
        if !path.starts_with("/api/")
            || path.contains("..")
            || path.contains('?')
            || path.contains('#')
            || path.contains('%')
            || path.contains('\\')
        {
            return Err(Error::Invalid);
        }
        let mut req = self
            .client
            .request(method, self.base.join(path).map_err(|_| Error::Invalid)?);
        if let Some(s) = session {
            req = req
                .bearer_auth(&s.access_token)
                .header("X-Tenant-ID", &s.tenant_id)
        }
        if let Some(body) = body {
            req = req
                .header("Content-Type", "application/json")
                .body(serde_json::to_vec(&body).map_err(|_| Error::Invalid)?)
        }
        let mut response = req.send().await.map_err(|_| Error::Unavailable)?;
        let status = response.status();
        if !status.is_success() {
            return Err(if status.as_u16() == 401 {
                Error::Unauthorized
            } else if status.as_u16() == 403 {
                Error::Forbidden
            } else if status.is_client_error() {
                Error::Invalid
            } else {
                Error::Unavailable
            });
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(|_| Error::Unavailable)? {
            if bytes.len() + chunk.len() > 1048576 {
                return Err(Error::Unavailable);
            }
            bytes.extend_from_slice(&chunk)
        }
        if bytes.is_empty() {
            return Ok(Value::Null);
        }
        serde_json::from_slice(&bytes).map_err(|_| Error::Unavailable)
    }
    pub async fn auth(&self, path: &str, body: Value) -> Result<AuthResult, Error> {
        serde_json::from_value(
            self.call(reqwest::Method::POST, path, None, Some(body))
                .await?,
        )
        .map_err(|_| Error::Unavailable)
    }
    pub async fn exchange(&self, code: &str, tx: &OAuthTransaction) -> Result<AuthResult, Error> {
        if code.is_empty() || code.len() > 512 {
            return Err(Error::Invalid);
        }
        let raw = self
            .call(
                reqwest::Method::POST,
                "/api/auth/exchange-code",
                None,
                Some(json!({"code":code,"code_verifier":tx.verifier,"client_state":tx.state})),
            )
            .await?;
        if !crate::session::binding_eq(
            raw.get("clientState").and_then(Value::as_str).unwrap_or(""),
            &tx.state,
        ) || !crate::session::binding_eq(
            raw.get("codeChallenge")
                .and_then(Value::as_str)
                .unwrap_or(""),
            &tx.challenge(),
        ) {
            return Err(Error::Unauthorized);
        }
        let result: AuthResult = serde_json::from_value(raw).map_err(|_| Error::Unavailable)?;
        if result.access_token.is_empty() || result.refresh_token.is_empty() || result.mfa_required
        {
            return Err(Error::Unauthorized);
        }
        Ok(result)
    }
}
