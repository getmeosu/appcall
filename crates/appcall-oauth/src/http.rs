use crate::*;
use appcall_connectors::OAuthConfig;
use reqwest::{blocking::Client, Url};
use serde::Deserialize;
use std::{collections::BTreeMap, io::Read, time::Duration};
use zeroize::Zeroizing;

pub trait TokenProvider: Send + Sync {
    fn refresh(
        &self,
        spec: &OAuthConfig,
        app: &AppCredentials,
        refresh: &str,
        now: i64,
    ) -> Result<TokenSet>;
    fn exchange(
        &self,
        spec: &OAuthConfig,
        app: &AppCredentials,
        code: &str,
        verifier: &str,
        now: i64,
    ) -> Result<TokenSet>;
}
#[derive(Clone, Copy)]
pub enum EndpointPolicy {
    HttpsOnly,
    LoopbackDevelopment,
}
pub struct TokenClient {
    client: Client,
    policy: EndpointPolicy,
}
impl TokenClient {
    pub fn new(timeout: Duration, policy: EndpointPolicy) -> Result<Self> {
        if timeout.is_zero() || timeout > Duration::from_secs(20) {
            return Err(Error::InvalidInput);
        }
        let client = Client::builder()
            .timeout(timeout)
            .connect_timeout(timeout)
            .redirect(reqwest::redirect::Policy::none())
            .no_proxy()
            .build()
            .map_err(|_| Error::Transport)?;
        Ok(Self { client, policy })
    }
    fn post<'a>(
        &self,
        spec: &OAuthConfig,
        app: &'a AppCredentials,
        mut form: BTreeMap<&str, &'a str>,
        now: i64,
    ) -> Result<TokenSet> {
        let url = Url::parse(&spec.token_url).map_err(|_| Error::InvalidInput)?;
        let local = url
            .host_str()
            .and_then(|host| host.parse::<std::net::IpAddr>().ok())
            .is_some_and(|ip| ip.is_loopback());
        if !url.username().is_empty()
            || url.password().is_some()
            || url.fragment().is_some()
            || !(url.scheme() == "https"
                || (url.scheme() == "http"
                    && local
                    && matches!(self.policy, EndpointPolicy::LoopbackDevelopment)))
        {
            return Err(Error::InvalidInput);
        }
        if app.client_id.is_empty() || !matches!(spec.client_auth.as_str(), "" | "body" | "basic") {
            return Err(Error::NotConfigured);
        }
        form.insert("client_id", &app.client_id);
        let mut request = self.client.post(url).header("Accept", "application/json");
        if spec.client_auth == "basic" {
            request = request.basic_auth(&app.client_id, Some(&app.client_secret));
        } else {
            form.insert("client_secret", &app.client_secret);
        }
        let response = request
            .form(&form)
            .send()
            .map_err(|_| Error::OutcomeUnknown)?;
        if !response.status().is_success() {
            return Err(Error::OutcomeUnknown);
        }
        let mut raw = Zeroizing::new(Vec::new());
        response
            .take(1024 * 1024 + 1)
            .read_to_end(&mut raw)
            .map_err(|_| Error::OutcomeUnknown)?;
        if raw.len() > 1024 * 1024 {
            return Err(Error::OutcomeUnknown);
        }
        #[derive(Deserialize)]
        struct Response {
            access_token: String,
            #[serde(default)]
            refresh_token: String,
            #[serde(default)]
            token_type: String,
            #[serde(default)]
            scope: String,
            #[serde(default)]
            expires_in: i64,
            ok: Option<bool>,
        }
        let parsed: Response = serde_json::from_slice(&raw).map_err(|_| Error::OutcomeUnknown)?;
        if parsed.access_token.trim().is_empty()
            || parsed.ok == Some(false)
            || parsed.expires_in < 0
        {
            return Err(Error::OutcomeUnknown);
        }
        let expires_at = if parsed.expires_in == 0 {
            "0001-01-01T00:00:00Z".into()
        } else {
            chrono::DateTime::from_timestamp(
                now.checked_add(parsed.expires_in)
                    .ok_or(Error::OutcomeUnknown)?,
                0,
            )
            .ok_or(Error::OutcomeUnknown)?
            .to_rfc3339_opts(chrono::SecondsFormat::AutoSi, true)
        };
        Ok(TokenSet {
            access_token: parsed.access_token,
            refresh_token: parsed.refresh_token,
            token_type: parsed.token_type,
            scope: parsed.scope,
            expires_at,
        })
    }
}
impl TokenProvider for TokenClient {
    fn refresh(
        &self,
        spec: &OAuthConfig,
        app: &AppCredentials,
        refresh: &str,
        now: i64,
    ) -> Result<TokenSet> {
        if !spec.supports_refresh {
            return Err(Error::Unsupported);
        }
        if refresh.trim().is_empty() {
            return Err(Error::InvalidToken);
        }
        let mut tokens = self.post(
            spec,
            app,
            BTreeMap::from([("grant_type", "refresh_token"), ("refresh_token", refresh)]),
            now,
        )?;
        if tokens.refresh_token.is_empty() {
            tokens.refresh_token = refresh.into();
        }
        Ok(tokens)
    }
    fn exchange(
        &self,
        spec: &OAuthConfig,
        app: &AppCredentials,
        code: &str,
        verifier: &str,
        now: i64,
    ) -> Result<TokenSet> {
        if code.is_empty() || code.len() > 4096 || (spec.pkce && verifier.is_empty()) {
            return Err(Error::InvalidInput);
        }
        let mut form = BTreeMap::from([
            ("grant_type", "authorization_code"),
            ("code", code),
            ("redirect_uri", app.redirect_uri.as_str()),
        ]);
        if spec.pkce {
            form.insert("code_verifier", verifier);
        }
        self.post(spec, app, form, now)
    }
}
