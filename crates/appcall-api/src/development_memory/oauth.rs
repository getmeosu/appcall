//! OAuth state and token envelopes live only in the bounded development repository.
use super::{
    repository::action_connection,
    setup::{active, memory_error, new_connection, scope},
    state::OAuthPending,
    MemoryRepository,
};
use appcall_oauth::{
    AppCredentials, ExpectedState, StateClaims, StateSigner, TokenProvider, TokenSet,
};
use appcall_setup::{Credentials, Error, Result, StartResult};
use appcall_store::{AuthType, Connection, Status};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD as BASE64, Engine as _};
use chrono::{Duration, Utc};
use sha2::{Digest, Sha256};
use std::{collections::BTreeMap, sync::Arc};
use zeroize::Zeroizing;
// StateSigner bounds the signed JSON to 8KiB; this includes map/key overhead.
const METADATA_BYTES: usize = 16384;
const TOKEN_RESERVATION: usize = 1024 * 1024 + 4096;
pub struct MemoryOAuth {
    repository: MemoryRepository,
    apps: BTreeMap<String, AppCredentials>,
    provider: Arc<dyn TokenProvider>,
    signer: StateSigner,
}
fn oauth(e: appcall_oauth::Error) -> Error {
    Error::OAuth(e)
}
fn random() -> String {
    format!(
        "{}{}",
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple()
    )
}
fn digest(value: &str) -> String {
    BASE64.encode(Sha256::digest(value.as_bytes()))
}
impl MemoryOAuth {
    pub fn new(
        repository: MemoryRepository,
        apps: BTreeMap<String, AppCredentials>,
        provider: Arc<dyn TokenProvider>,
    ) -> Result<Self> {
        let mut key = Zeroizing::new([0u8; 32]);
        getrandom::fill(key.as_mut()).map_err(|_| Error::Persistence)?;
        Ok(Self {
            repository,
            apps,
            provider,
            signer: StateSigner::new(key.as_ref()).map_err(oauth)?,
        })
    }
    pub fn managed(&self, connector: &str) -> bool {
        self.apps.contains_key(connector)
    }
    fn spec(&self, connector: &str) -> Result<appcall_connectors::OAuthConfig> {
        self.repository
            .state
            .registry
            .public_connector(connector)
            .map_err(|_| Error::NotFound)?
            .manifest()
            .auth
            .oauth
            .clone()
            .filter(|spec| spec.version.is_empty() || spec.version == "2.0")
            .ok_or(Error::Unsupported)
    }
    pub fn start_checked(
        &self,
        project: &str,
        account: Option<&str>,
        connector: &str,
        existing: Option<&str>,
        check: &dyn Fn() -> bool,
    ) -> Result<StartResult> {
        active(check)?;
        scope(project, account)?;
        if !self.managed(connector) {
            return self.local_start(project, account, connector, existing, check);
        }
        let spec = self.spec(connector)?;
        let app = self.apps.get(connector).ok_or(Error::Unsupported)?;
        let mut url = authorization_url(&spec, app)?;
        let selected = self.select(project, account, connector, existing)?;
        let mut connection = selected
            .as_ref()
            .map(|(c, _)| c.clone())
            .unwrap_or_else(|| new_connection(project, account, connector, AuthType::OAuth2));
        connection.status = Status::Authorizing;
        connection.auth_type = AuthType::OAuth2;
        let verifier = Zeroizing::new(if spec.pkce { random() } else { String::new() });
        let (secret_ref, envelope) = self
            .repository
            .prepare_secret(project, &connection.id, "oauth_pkce", verifier.as_bytes())
            .map_err(memory_error)?;
        let expires = Utc::now() + Duration::minutes(10);
        let claims = StateClaims {
            project_id: project.into(),
            connector: connector.into(),
            connection_id: connection.id.clone(),
            redirect_uri: app.redirect_uri.clone(),
            expires_at: expires.to_rfc3339(),
            pkce_ref: secret_ref.clone(),
        };
        let state = self.signer.sign(&claims).map_err(oauth)?;
        let key = digest(&state);
        {
            let scopes = self
                .repository
                .state
                .registry
                .public_connector(connector)
                .map_err(|_| Error::NotFound)?
                .manifest()
                .auth
                .scopes
                .join(" ");
            let mut query = url.query_pairs_mut();
            query
                .append_pair("client_id", &app.client_id)
                .append_pair("redirect_uri", &app.redirect_uri)
                .append_pair("response_type", "code")
                .append_pair("state", &state);
            if !scopes.is_empty() {
                query.append_pair("scope", &scopes);
            }
            for (k, v) in &spec.extra_auth_params {
                query.append_pair(k, v);
            }
            if spec.pkce {
                query
                    .append_pair("code_challenge", &digest(&verifier))
                    .append_pair("code_challenge_method", "S256");
            }
        }
        let mut data = self.repository.lock().map_err(memory_error)?;
        active(check)?;
        if data.oauth_pending.len() >= self.repository.state.limits.oauth_states {
            return Err(Error::Persistence);
        }
        data.check_capacity(
            self.repository.state.limits,
            envelope.bytes + METADATA_BYTES + 2048,
            0,
        )
        .map_err(memory_error)?;
        let saved = match selected {
            Some((_, revision)) => self
                .repository
                .replace_connection_locked(&mut data, project, account, revision, connection, None),
            None => self
                .repository
                .insert_connection_locked(&mut data, connection, None),
        }
        .map_err(memory_error)?;
        let revision = *data
            .connection_revision
            .get(&saved.id)
            .ok_or(Error::Persistence)?;
        data.bytes_used += envelope.bytes + METADATA_BYTES;
        data.secrets.insert(secret_ref.clone(), envelope);
        data.oauth_pending.insert(
            key,
            OAuthPending {
                project_id: project.into(),
                connection_id: saved.id.clone(),
                connector: connector.into(),
                revision,
                secret_ref,
                redirect_uri: app.redirect_uri.clone(),
                expires_at: expires,
                consumed: false,
                dispatched: false,
                reserved_bytes: 0,
            },
        );
        Ok(StartResult {
            connection: saved,
            authorization_url: url.into(),
        })
    }
    fn select(
        &self,
        project: &str,
        account: Option<&str>,
        connector: &str,
        existing: Option<&str>,
    ) -> Result<Option<(Connection, u64)>> {
        let selected = match existing {
            Some(id) => Some(
                self.repository
                    .get_connection(project, account, id)
                    .map_err(memory_error)?,
            ),
            None => None,
        };
        if selected.as_ref().is_some_and(|(c, _)| {
            c.connector != connector
                || c.external_account_id != account.unwrap_or_default()
                || c.auth_type != AuthType::OAuth2
        }) {
            return Err(Error::NotFound);
        }
        Ok(selected)
    }
    fn local_start(
        &self,
        project: &str,
        account: Option<&str>,
        connector: &str,
        existing: Option<&str>,
        check: &dyn Fn() -> bool,
    ) -> Result<StartResult> {
        if project != "proj_dev" {
            return Err(Error::NotFound);
        }
        let manifest = self
            .repository
            .state
            .registry
            .public_connector(connector)
            .map_err(|_| Error::NotFound)?
            .manifest();
        if manifest.auth.setup.mode != "oauth2" {
            return Err(Error::Unsupported);
        }
        let selected = self.select(project, account, connector, existing)?;
        if selected
            .as_ref()
            .is_some_and(|(c, _)| !c.secret_ref_id.is_empty())
        {
            return Err(Error::Conflict);
        }
        let mut c = selected
            .as_ref()
            .map(|(c, _)| c.clone())
            .unwrap_or_else(|| new_connection(project, account, connector, AuthType::OAuth2));
        c.status = Status::Authorizing;
        let c = match selected {
            Some((_, rev)) => self
                .repository
                .replace_connection_checked(project, account, rev, c, None, check),
            None => self.repository.create_connection_checked(c, None, check),
        }
        .map_err(|e| {
            if check() {
                memory_error(e)
            } else {
                Error::Cancelled
            }
        })?;
        let query = url::form_urlencoded::Serializer::new(String::new())
            .append_pair("connector", connector)
            .append_pair("connectionId", &c.id)
            .finish();
        Ok(StartResult {
            connection: c,
            authorization_url: format!("/oauth/local/authorize?{query}"),
        })
    }
    pub fn local_callback_checked(
        &self,
        connector: &str,
        id: &str,
        check: &dyn Fn() -> bool,
    ) -> Result<Connection> {
        active(check)?;
        if self.managed(connector) {
            return Err(Error::NotFound);
        }
        let (c, rev) = self
            .repository
            .get_connection("proj_dev", None, id)
            .map_err(memory_error)?;
        if c.connector != connector
            || c.auth_type != AuthType::OAuth2
            || c.status != Status::Authorizing
            || !c.secret_ref_id.is_empty()
        {
            return Err(Error::Conflict);
        }
        let mut next = c;
        next.status = Status::Active;
        self.repository
            .replace_connection_checked("proj_dev", None, rev, next, None, check)
            .map_err(|e| {
                if check() {
                    memory_error(e)
                } else {
                    Error::Cancelled
                }
            })
    }
    pub fn callback_checked(
        &self,
        connector: &str,
        project: Option<&str>,
        code: &str,
        state: &str,
        check: &dyn Fn() -> bool,
    ) -> Result<Connection> {
        active(check)?;
        if code.is_empty() || code.len() > 4096 {
            return Err(Error::InvalidInput);
        }
        let spec = self.spec(connector)?;
        let app = self.apps.get(connector).ok_or(Error::Unsupported)?;
        let claims = self
            .signer
            .verify(
                state,
                &ExpectedState {
                    project_id: project,
                    connector,
                    redirect_uri: &app.redirect_uri,
                },
                Utc::now().timestamp(),
            )
            .map_err(oauth)?;
        let key = digest(state);
        let (connection, verifier) = self.claim_callback(&key, &claims, check)?;
        let result = if check() {
            self.provider
                .exchange(&spec, app, code, &verifier, Utc::now().timestamp())
        } else {
            Err(appcall_oauth::Error::OutcomeUnknown)
        };
        self.finish(&key, &connection, result, check)
    }
    fn claim_callback(
        &self,
        key: &str,
        claims: &StateClaims,
        check: &dyn Fn() -> bool,
    ) -> Result<(Connection, Zeroizing<String>)> {
        let mut data = self.repository.lock().map_err(memory_error)?;
        active(check)?;
        let p = data.oauth_pending.get(key).ok_or(Error::Conflict)?;
        let c = data
            .connections
            .get(&claims.connection_id)
            .ok_or(Error::NotFound)?
            .clone();
        if p.consumed
            || p.dispatched
            || p.expires_at <= Utc::now()
            || p.project_id != claims.project_id
            || p.connection_id != claims.connection_id
            || p.connector != claims.connector
            || p.redirect_uri != claims.redirect_uri
            || p.secret_ref != claims.pkce_ref
            || c.project_id != claims.project_id
            || c.connector != claims.connector
            || c.status != Status::Authorizing
            || data.connection_revision.get(&c.id) != Some(&p.revision)
        {
            return Err(Error::Conflict);
        }
        let envelope = data.secrets.get(&p.secret_ref).ok_or(Error::Persistence)?;
        if envelope.project_id != c.project_id
            || envelope.connection_id != c.id
            || envelope.kind != "oauth_pkce"
        {
            return Err(Error::Conflict);
        }
        let raw = self
            .repository
            .state
            .vault
            .decrypt(&envelope.envelope)
            .map_err(|_| Error::Persistence)?;
        let verifier = Zeroizing::new(
            std::str::from_utf8(raw.as_bytes())
                .map_err(|_| Error::Persistence)?
                .to_owned(),
        );
        if data.active_effects >= self.repository.state.limits.concurrent_effects {
            return Err(Error::Persistence);
        }
        data.check_capacity(self.repository.state.limits, TOKEN_RESERVATION, 0)
            .map_err(memory_error)?;
        active(check)?;
        let mut next = c.clone();
        next.status = Status::Degraded;
        let revision = *data
            .connection_revision
            .get(&c.id)
            .ok_or(Error::Persistence)?;
        let next = self
            .repository
            .replace_connection_locked(&mut data, &c.project_id, None, revision, next, None)
            .map_err(memory_error)?;
        let revision = *data
            .connection_revision
            .get(&c.id)
            .ok_or(Error::Persistence)?;
        let p = data.oauth_pending.get_mut(key).ok_or(Error::Persistence)?;
        p.dispatched = true;
        p.consumed = true;
        p.revision = revision;
        p.reserved_bytes = TOKEN_RESERVATION;
        data.bytes_reserved += TOKEN_RESERVATION;
        data.active_effects += 1;
        Ok((next, verifier))
    }
    fn finish(
        &self,
        key: &str,
        expected: &Connection,
        result: appcall_oauth::Result<TokenSet>,
        check: &dyn Fn() -> bool,
    ) -> Result<Connection> {
        self.finish_versioned(key, expected, result, check)
            .map(|(connection, _)| connection)
    }
    fn finish_versioned(
        &self,
        key: &str,
        expected: &Connection,
        result: appcall_oauth::Result<TokenSet>,
        check: &dyn Fn() -> bool,
    ) -> Result<(Connection, u64)> {
        // A cancelled or failed exchange stays consumed and degraded; never retry a code/token.
        let prepared = result.map_err(oauth).and_then(|tokens| {
            let raw = Zeroizing::new(tokens.encode().map_err(oauth)?);
            if raw.len() > 1024 * 1024 {
                return Err(oauth(appcall_oauth::Error::InvalidToken));
            }
            self.repository
                .prepare_secret(&expected.project_id, &expected.id, "oauth_token", &raw)
                .map_err(memory_error)
        });
        let mut data = self.repository.lock().map_err(memory_error)?;
        let p = data.oauth_pending.get(key).ok_or(Error::Conflict)?;
        let reserved = p.reserved_bytes;
        let revision = p.revision;
        let pkce = p.secret_ref.clone();
        data.bytes_reserved = data.bytes_reserved.saturating_sub(reserved);
        if reserved > 0 {
            data.active_effects = data.active_effects.saturating_sub(1);
        }
        if let Some(p) = data.oauth_pending.get_mut(key) {
            p.reserved_bytes = 0;
        }
        active(check)?;
        let prepared = Some(prepared?);
        if data.connections.get(&expected.id) != Some(expected)
            || data.connection_revision.get(&expected.id) != Some(&revision)
        {
            return Err(Error::Conflict);
        }
        let mut next = expected.clone();
        next.status = Status::Active;
        let saved = self
            .repository
            .replace_connection_locked(
                &mut data,
                &expected.project_id,
                None,
                revision,
                next,
                prepared,
            )
            .map_err(memory_error)?;
        data.oauth_pending.remove(key);
        data.bytes_used = data.bytes_used.saturating_sub(METADATA_BYTES);
        // Refresh intents reference a live token, unlike authorization PKCE records.
        if let Some(secret) = data.secrets.get(&pkce) {
            if secret.kind == "oauth_pkce" {
                let bytes = secret.bytes;
                data.secrets.remove(&pkce);
                data.bytes_used = data.bytes_used.saturating_sub(bytes);
            }
        }
        let revision = *data
            .connection_revision
            .get(&saved.id)
            .ok_or(Error::Persistence)?;
        Ok((saved, revision))
    }
    pub fn resolve_tracked(
        &self,
        expected: &appcall_actions::Connection,
        check: &dyn Fn() -> bool,
    ) -> Result<(Connection, Credentials)> {
        self.resolve_tracked_versioned(expected, check)
            .map(|(c, _, fields)| (c, fields))
    }
    pub fn resolve_health_tracked(
        &self,
        expected: &appcall_actions::Connection,
        check: &dyn Fn() -> bool,
    ) -> Result<(Connection, Credentials)> {
        self.resolve_health_tracked_versioned(expected, check)
            .map(|(c, _, fields)| (c, fields))
    }
    pub fn resolve_tracked_versioned(
        &self,
        expected: &appcall_actions::Connection,
        check: &dyn Fn() -> bool,
    ) -> Result<(Connection, u64, Credentials)> {
        self.resolve_expected(expected, false, None, check)
    }
    /// Action resolution is bound to the claim's original credential revision.
    pub fn resolve_tracked_for_attempt(
        &self,
        attempt: &appcall_actions::Attempt,
        expected: &appcall_actions::Connection,
        check: &dyn Fn() -> bool,
    ) -> Result<(Connection, u64, Credentials)> {
        self.resolve_expected(expected, false, Some(attempt), check)
    }
    pub fn resolve_health_tracked_versioned(
        &self,
        expected: &appcall_actions::Connection,
        check: &dyn Fn() -> bool,
    ) -> Result<(Connection, u64, Credentials)> {
        self.resolve_expected(expected, true, None, check)
    }
    pub fn resolve_checked(
        &self,
        project: &str,
        account: Option<&str>,
        id: &str,
        check: &dyn Fn() -> bool,
    ) -> Result<(Connection, Credentials)> {
        self.resolve_checked_versioned(project, account, id, check)
            .map(|(c, _, fields)| (c, fields))
    }
    pub fn resolve_checked_versioned(
        &self,
        project: &str,
        account: Option<&str>,
        id: &str,
        check: &dyn Fn() -> bool,
    ) -> Result<(Connection, u64, Credentials)> {
        active(check)?;
        scope(project, account)?;
        let (c, _) = self
            .repository
            .get_connection(project, account, id)
            .map_err(memory_error)?;
        self.resolve_expected(&action_connection(&c), true, None, check)
    }
    fn resolve_expected(
        &self,
        expected: &appcall_actions::Connection,
        health: bool,
        attempt: Option<&appcall_actions::Attempt>,
        check: &dyn Fn() -> bool,
    ) -> Result<(Connection, u64, Credentials)> {
        active(check)?;
        let (c, revision) = self
            .repository
            .get_connection(&expected.project_id, None, &expected.id)
            .map_err(memory_error)?;
        if action_connection(&c) != *expected
            || c.status == Status::Authorizing
            || (!health && c.status != Status::Active)
        {
            return Err(Error::Conflict);
        }
        let (credential_revision, secret) = match attempt {
            Some(attempt) => self.repository.secret_for_attempt(attempt, expected),
            None => self.repository.secret_for_connection_versioned(expected),
        }
        .map_err(memory_error)?;
        if credential_revision != revision {
            return Err(Error::Conflict);
        }
        {
            let data = self.repository.lock().map_err(memory_error)?;
            active(check)?;
            if data.connection_revision.get(&c.id) != Some(&revision) {
                return Err(Error::Conflict);
            }
            if data.oauth_pending.values().any(|p| {
                p.connection_id == c.id
                    && p.project_id == c.project_id
                    && p.revision == revision
                    && p.dispatched
            }) {
                return Err(oauth(appcall_oauth::Error::OutcomeUnknown));
            }
        }
        if c.secret_ref_id.is_empty() {
            return Ok((c, revision, Credentials::from_fields(BTreeMap::new())?));
        }
        let (kind, raw) = secret.ok_or(Error::Conflict)?;
        if kind != "oauth_token" {
            let fields: BTreeMap<String, String> =
                serde_json::from_slice(raw.as_bytes()).map_err(|_| Error::InvalidInput)?;
            return Ok((c, revision, Credentials::from_fields(fields)?));
        }
        let tokens = TokenSet::decode(raw.as_bytes()).map_err(oauth)?;
        if !tokens.needs_refresh(Utc::now().timestamp()) {
            return Ok((c, revision, token_credentials(&tokens)?));
        }
        if c.status != Status::Active {
            return Err(Error::Conflict);
        }
        let spec = self.spec(&c.connector)?;
        let app = self.apps.get(&c.connector).ok_or(Error::Unsupported)?;
        let refresh = tokens.refresh_token();
        if refresh.is_empty() || !spec.supports_refresh {
            return Err(oauth(appcall_oauth::Error::InvalidToken));
        }
        let key = format!(
            "refresh:{}",
            digest(&format!("{}:{}:{}", c.project_id, c.id, c.secret_ref_id))
        );
        let pending = self.claim_refresh(&key, &c, revision, check)?;
        let result = if check() {
            self.provider
                .refresh(&spec, app, refresh, Utc::now().timestamp())
        } else {
            Err(appcall_oauth::Error::OutcomeUnknown)
        };
        let (next, revision) = self.finish_versioned(&key, &pending, result, check)?;
        let (secret_revision, secret) = self
            .repository
            .secret_for_connection_versioned(&action_connection(&next))
            .map_err(memory_error)?;
        if secret_revision != revision {
            return Err(Error::Conflict);
        }
        let (_, raw) = secret.ok_or(Error::Conflict)?;
        let tokens = TokenSet::decode(raw.as_bytes()).map_err(oauth)?;
        Ok((next, revision, token_credentials(&tokens)?))
    }
    fn claim_refresh(
        &self,
        key: &str,
        c: &Connection,
        revision: u64,
        check: &dyn Fn() -> bool,
    ) -> Result<Connection> {
        let mut data = self.repository.lock().map_err(memory_error)?;
        active(check)?;
        if data.oauth_pending.contains_key(key)
            || data.oauth_pending.len() >= self.repository.state.limits.oauth_states
        {
            return Err(Error::Conflict);
        }
        if data.connections.get(&c.id) != Some(c)
            || data.connection_revision.get(&c.id) != Some(&revision)
        {
            return Err(Error::Conflict);
        }
        if data.active_effects >= self.repository.state.limits.concurrent_effects {
            return Err(Error::Persistence);
        }
        data.check_capacity(
            self.repository.state.limits,
            TOKEN_RESERVATION + METADATA_BYTES,
            0,
        )
        .map_err(memory_error)?;
        let mut next = c.clone();
        next.status = Status::Degraded;
        let next = self
            .repository
            .replace_connection_locked(&mut data, &c.project_id, None, revision, next, None)
            .map_err(memory_error)?;
        let revision = *data
            .connection_revision
            .get(&c.id)
            .ok_or(Error::Persistence)?;
        data.bytes_used += METADATA_BYTES;
        data.bytes_reserved += TOKEN_RESERVATION;
        data.active_effects += 1;
        data.oauth_pending.insert(
            key.into(),
            OAuthPending {
                project_id: c.project_id.clone(),
                connection_id: c.id.clone(),
                connector: c.connector.clone(),
                revision,
                secret_ref: c.secret_ref_id.clone(),
                redirect_uri: String::new(),
                expires_at: Utc::now() + Duration::minutes(10),
                consumed: true,
                dispatched: true,
                reserved_bytes: TOKEN_RESERVATION,
            },
        );
        Ok(next)
    }
}
fn token_credentials(tokens: &TokenSet) -> Result<Credentials> {
    Credentials::from_fields(BTreeMap::from([(
        "accessToken".into(),
        tokens.access_token().into(),
    )]))
}
fn authorization_url(
    spec: &appcall_connectors::OAuthConfig,
    app: &AppCredentials,
) -> Result<url::Url> {
    let redirect = url::Url::parse(&app.redirect_uri).map_err(|_| Error::InvalidInput)?;
    let url = url::Url::parse(&spec.authorize_url).map_err(|_| Error::InvalidInput)?;
    for u in [&redirect, &url] {
        if u.scheme() != "https"
            || u.host_str().is_none()
            || !u.username().is_empty()
            || u.password().is_some()
            || u.fragment().is_some()
        {
            return Err(Error::InvalidInput);
        }
    }
    if app.client_id.is_empty() {
        return Err(oauth(appcall_oauth::Error::NotConfigured));
    }
    let reserved = [
        "client_id",
        "client_secret",
        "redirect_uri",
        "state",
        "response_type",
        "scope",
        "code_challenge",
        "code_challenge_method",
    ];
    if spec
        .extra_auth_params
        .keys()
        .any(|k| reserved.contains(&k.as_str()))
        || url
            .query_pairs()
            .any(|(k, _)| reserved.contains(&k.as_ref()))
    {
        return Err(Error::InvalidInput);
    }
    Ok(url)
}
