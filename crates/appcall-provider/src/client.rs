use crate::{Error, Result};
use reqwest::{blocking::Client as Http, redirect::Policy, Method, Url};
use serde::Deserialize;
use serde_json::{json, Value};
use std::{io::Read, time::Duration};
use zeroize::Zeroizing;
#[derive(Debug, Clone, Deserialize)]
pub struct Account {
    pub id: String,
    #[serde(rename = "type")]
    pub provider: String,
}
pub struct Client {
    origin: Url,
    key: Zeroizing<String>,
    http: Http,
}
impl Client {
    pub fn new(dsn: &str, key: &str, allow_loopback_http: bool) -> Result<Self> {
        let invalid = || {
            Error::new(
                502,
                "UNIPILE_UNAVAILABLE",
                "The Unipile workspace is not configured.",
            )
        };
        let raw = if dsn.trim().contains("://") {
            dsn.trim().to_owned()
        } else {
            format!("https://{}", dsn.trim())
        };
        let mut origin = Url::parse(&raw).map_err(|_| invalid())?;
        let loopback = origin.host_str().is_some_and(|h| {
            h.parse::<std::net::IpAddr>()
                .is_ok_and(|ip| ip.is_loopback())
        });
        if key.is_empty()
            || !origin.username().is_empty()
            || origin.password().is_some()
            || origin.host_str().is_none()
            || (origin.scheme() != "https"
                && !(allow_loopback_http && loopback && origin.scheme() == "http"))
        {
            return Err(invalid());
        }
        origin.set_path("/");
        origin.set_query(None);
        origin.set_fragment(None);
        let http = Http::builder()
            .timeout(Duration::from_secs(30))
            .connect_timeout(Duration::from_secs(5))
            .redirect(Policy::none())
            .build()
            .map_err(|_| invalid())?;
        Ok(Self {
            origin,
            key: Zeroizing::new(key.into()),
            http,
        })
    }
    fn request(
        &self,
        method: Method,
        path: &str,
        body: Option<Value>,
        code: &'static str,
        allow_404: bool,
    ) -> Result<Value> {
        let error = || Error::new(502, code, "The Unipile request could not be completed.");
        let url = self.origin.join(path).map_err(|_| error())?;
        let mut request = self
            .http
            .request(method, url)
            .header("X-API-KEY", self.key.as_str())
            .header("Accept", "application/json");
        if let Some(body) = body {
            request = request.json(&body)
        }
        let response = request
            .timeout(Duration::from_secs(if path == "/api/v1/webhooks" {
                15
            } else {
                30
            }))
            .send()
            .map_err(|_| error())?;
        if allow_404 && response.status().as_u16() == 404 {
            return Ok(Value::Null);
        }
        if !response.status().is_success() {
            return Err(error());
        }
        let mut bytes = Vec::new();
        response
            .take(4 * 1024 * 1024 + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| error())?;
        if bytes.len() > 4 * 1024 * 1024 {
            return Err(error());
        }
        if allow_404 && bytes.is_empty() {
            return Ok(Value::Null);
        }
        serde_json::from_slice(&bytes).map_err(|_| error())
    }
    pub fn accounts(&self) -> Result<Vec<Account>> {
        let v = self.request(
            Method::GET,
            "/api/v1/accounts",
            None,
            "UNIPILE_LIST_FAILED",
            false,
        )?;
        let items = v
            .get("items")
            .filter(|v| v.as_array().is_some_and(|a| !a.is_empty()))
            .or_else(|| v.get("accounts"))
            .cloned()
            .unwrap_or(json!([]));
        serde_json::from_value(items).map_err(|_| {
            Error::new(
                502,
                "UNIPILE_LIST_FAILED",
                "Could not list Unipile accounts.",
            )
        })
    }
    pub fn hosted(
        &self,
        name: &str,
        notify: &str,
        providers: &[String],
        expires: &str,
        success: &str,
    ) -> Result<String> {
        let mut body = json!({"type":"create","api_url":self.origin.as_str().trim_end_matches('/'),"name":name,"notify_url":notify,"providers":if providers.is_empty(){json!("*")}else{json!(providers)},"expiresOn":expires});
        if !success.is_empty() {
            body["success_redirect_url"] = json!(success)
        }
        let v = self.request(
            Method::POST,
            "/api/v1/hosted/accounts/link",
            Some(body),
            "UNIPILE_LINK_FAILED",
            false,
        )?;
        v.get("url")
            .or_else(|| v.get("link"))
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
            .map(str::to_owned)
            .ok_or_else(|| {
                Error::new(
                    502,
                    "UNIPILE_LINK_FAILED",
                    "Unipile rejected the hosted-link request.",
                )
            })
    }
    pub fn delete(&self, id: &str) -> Result<()> {
        if id.is_empty()
            || id == "."
            || id == ".."
            || id.trim() != id
            || id.contains(['/', '\\', '?', '#', '%'])
        {
            return Err(Error::new(
                400,
                "INVALID_ACCOUNT",
                "The account identifier is invalid.",
            ));
        }
        self.request(
            Method::DELETE,
            &format!("/api/v1/accounts/{id}"),
            None,
            "UNIPILE_DELETE_FAILED",
            true,
        )?;
        Ok(())
    }
    pub fn register_relations(&self, url: &str) -> Result<()> {
        self.request(
            Method::POST,
            "/api/v1/webhooks",
            Some(json!({"source":"users","request_url":url,"name":"sena-accept"})),
            "UNIPILE_WEBHOOK_FAILED",
            false,
        )?;
        Ok(())
    }
}
