//! Setup and hosted provider lifecycle HTTP contracts.
use crate::{ApiError, Identity, Request, Response, Result};
use serde_json::{json, Value};
use std::{collections::BTreeMap, sync::Arc};

#[derive(Clone, Debug, PartialEq, Eq)]
enum Route {
    Description(String),
    Submit(String),
    Start(String),
    Callback(String),
    Unipile(&'static str),
}
fn classify(method: &str, path: &str) -> Option<Route> {
    let parts = path.strip_prefix('/')?.split('/').collect::<Vec<_>>();
    let connector = *parts.get(2)?;
    if connector.is_empty()
        || connector.len() > 128
        || connector == "."
        || connector == ".."
        || !connector
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.'))
    {
        return None;
    }
    match (method, parts.as_slice()) {
        ("GET", ["v1", "connectors", key, "setup"]) => Some(Route::Description((*key).into())),
        ("GET", ["v1", "connectors", key, "setup", "oauth", "callback"]) => {
            Some(Route::Callback((*key).into()))
        }
        ("POST", ["v1", "connectors", "unipile", "setup", "hosted"]) => {
            Some(Route::Unipile("hosted"))
        }
        ("POST", ["v1", "connectors", "unipile", "setup", "notify"]) => {
            Some(Route::Unipile("notify"))
        }
        ("POST", ["v1", "connectors", "unipile", "accounts", "capture"]) => {
            Some(Route::Unipile("capture"))
        }
        ("POST", ["v1", "connectors", "unipile", "accounts", "list"]) => {
            Some(Route::Unipile("list"))
        }
        ("POST", ["v1", "connectors", "unipile", "accounts", "accepted"]) => {
            Some(Route::Unipile("accepted"))
        }
        ("POST" | "DELETE", ["v1", "connectors", "unipile", "accounts", "disconnect"]) => {
            Some(Route::Unipile("disconnect"))
        }
        ("POST", ["v1", "connectors", "unipile", "webhooks", "relations"]) => {
            Some(Route::Unipile("relations"))
        }
        ("POST", ["v1", "connectors", key, "setup", "api-key"]) => {
            Some(Route::Submit((*key).into()))
        }
        ("POST", ["v1", "connectors", key, "setup", "oauth"]) => Some(Route::Start((*key).into())),
        _ => None,
    }
}
/// Public means route-specific callback authentication, never unrestricted access.
/// The host must still forward any supplied authenticated identity for binding.
pub fn public_exact(method: &str, path: &str) -> bool {
    matches!(
        classify(method, path),
        Some(Route::Callback(_) | Route::Unipile("notify" | "relations"))
    )
}

fn decode_body(route: &Route, bytes: &[u8]) -> Option<Value> {
    if matches!(route, Route::Callback(_) | Route::Description(_)) {
        return Some(Value::Null);
    }
    let defaults = matches!(
        route,
        Route::Start(_) | Route::Unipile("accepted" | "relations")
    );
    if defaults && bytes.is_empty() {
        return Some(json!({}));
    }
    match serde_json::from_slice::<Value>(bytes).ok()? {
        Value::Null if defaults => Some(json!({})),
        value if value.is_object() => Some(value),
        _ => None,
    }
}

#[derive(Clone)]
pub struct ProviderRoutes {
    setup: Arc<appcall_setup::Service>,
    unipile: Option<Arc<appcall_provider::Service>>,
    admission: Arc<tokio::sync::Semaphore>,
}
impl ProviderRoutes {
    pub fn database_health(&self) -> Option<bool> {
        crate::combined_database_health([
            self.setup.database_health(),
            self.unipile
                .as_ref()
                .map_or(Some(true), |provider| provider.database_health()),
        ])
    }
    pub fn new(
        setup: Arc<appcall_setup::Service>,
        unipile: Option<Arc<appcall_provider::Service>>,
    ) -> Self {
        Self {
            setup,
            unipile,
            admission: Arc::new(tokio::sync::Semaphore::new(16)),
        }
    }
    pub async fn handle(
        &self,
        identity: Option<&Identity>,
        request: &Request,
    ) -> Result<Option<Response>> {
        let (path, query) = request.uri.split_once('?').unwrap_or((&request.uri, ""));
        let Some(route) = classify(&request.method, path) else {
            return Ok(None);
        };
        crate::validate_headers(&request.headers)?;
        if request.uri.len() > 4096 || request.body.len() > 1024 * 1024 {
            return Err(ApiError::new("REQUEST_TOO_LARGE"));
        }
        if !public_exact(&request.method, path) && identity.is_none_or(|i| i.project_id.is_empty())
        {
            return Err(ApiError::new("UNAUTHORIZED"));
        }
        let mut queries = BTreeMap::new();
        for (key, value) in url::form_urlencoded::parse(query.as_bytes()) {
            if queries
                .insert(key.into_owned(), value.into_owned())
                .is_some()
            {
                return Err(ApiError::new("INVALID_REQUEST"));
            }
        }
        let body = match decode_body(&route, &request.body) {
            Some(body) => body,
            None => {
                return Ok(Some(failure(
                    400,
                    "INVALID_JSON",
                    "Request body must be valid JSON.",
                )))
            }
        };
        let permit = self
            .admission
            .clone()
            .try_acquire_owned()
            .map_err(|_| ApiError::new("SERVICE_BUSY"))?;
        let identity = identity.cloned();
        let this = self.clone();
        let cancelled = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let _cancel_on_drop = CancelOnDrop(cancelled.clone());
        let task = tokio::task::spawn_blocking(move || {
            let _permit = permit;
            if cancelled.load(std::sync::atomic::Ordering::Acquire) {
                return failure(503, "SERVICE_BUSY", "The service is busy.");
            }
            this.dispatch(identity.as_ref(), route, body, queries, &|| {
                !cancelled.load(std::sync::atomic::Ordering::Acquire)
            })
        });
        let response = tokio::time::timeout(std::time::Duration::from_secs(55), task)
            .await
            .map_err(|_| ApiError::new("SERVICE_BUSY"))?
            .map_err(|_| ApiError::new("STORAGE_UNAVAILABLE"))?;
        Ok(Some(response))
    }
    fn dispatch(
        &self,
        identity: Option<&Identity>,
        route: Route,
        body: Value,
        queries: BTreeMap<String, String>,
        active: &dyn Fn() -> bool,
    ) -> Response {
        if let Route::Unipile(operation) = route {
            let Some(provider) = &self.unipile else {
                return failure(404, "NOT_FOUND", "The route was not found.");
            };
            let project = identity.map(|i| i.project_id.as_str()).unwrap_or_default();
            let account =
                identity.and_then(|i| (!i.account_id.is_empty()).then_some(i.account_id.as_str()));
            return match provider.handle_checked(
                project,
                account,
                operation,
                &body,
                queries.get("token").map(String::as_str),
                active,
            ) {
                Ok(body) => response(200, body),
                Err(error) => response(error.status, error.body()),
            };
        }
        if let Route::Callback(connector) = route {
            let code = queries.get("code").map(String::as_str).unwrap_or_default();
            let state = queries.get("state").map(String::as_str).unwrap_or_default();
            if code.is_empty() || state.is_empty() {
                return failure(
                    400,
                    "INVALID_OAUTH_CALLBACK",
                    "Missing OAuth code or state.",
                );
            }
            return match self.setup.callback_checked(
                &connector,
                identity
                    .map(|i| i.project_id.as_str())
                    .filter(|p| !p.is_empty()),
                code,
                state,
                active,
            ) {
                Ok(_) => response(204, Value::Null),
                Err(error) => setup_error(error, true),
            };
        }
        let Some(identity) = identity else {
            return failure(401, "UNAUTHORIZED", "Missing or invalid API key.");
        };
        let scope = match appcall_setup::SetupScope::new(
            &identity.project_id,
            (!identity.account_id.is_empty()).then_some(identity.account_id.as_str()),
        ) {
            Ok(scope) => scope,
            Err(error) => return setup_error(error, false),
        };
        match route {
            Route::Description(connector) => match self.setup.describe(&connector) {
                Ok(description) => {
                    let mut value = json!({"connector":description.connector,"authType":description.auth_type,"mode":description.setup.mode,"fields":description.setup.fields});
                    if !description.setup.help.is_empty() {
                        value["help"] = json!(description.setup.help)
                    }
                    if !description.setup.docs_url.is_empty() {
                        value["docsUrl"] = json!(description.setup.docs_url)
                    }
                    response(200, value)
                }
                Err(error) => setup_error(error, false),
            },
            Route::Submit(connector) => {
                let fields: BTreeMap<String, String> = match body.get("fields") {
                    None | Some(Value::Null) => BTreeMap::new(),
                    Some(fields) => match serde_json::from_value(fields.clone()) {
                        Ok(fields) => fields,
                        Err(_) => {
                            return failure(400, "INVALID_JSON", "Request body must be valid JSON.")
                        }
                    },
                };
                if let Ok(description) = self.setup.describe(&connector) {
                    let selected = description
                        .setup
                        .routes
                        .first()
                        .map(|r| r.fields.as_slice())
                        .unwrap_or(&description.setup.fields);
                    if let Some(field) = selected.iter().find(|f| {
                        f.required && fields.get(&f.key).is_none_or(|v| v.trim().is_empty())
                    }) {
                        return response(
                            400,
                            json!({"error":{"code":"MISSING_SETUP_FIELD","message":"A required connector setup field is missing.","field":field.key}}),
                        );
                    }
                }
                match self
                    .setup
                    .submit_checked(&scope, &connector, "", &fields, active)
                {
                    Ok(connection) => response(
                        201,
                        json!({"connection":crate::connection_json(&connection)}),
                    ),
                    Err(error) => setup_error(error, false),
                }
            }
            Route::Start(connector) => {
                if body
                    .get("redirectUri")
                    .is_some_and(|v| !v.is_null() && !v.is_string())
                {
                    return failure(400, "INVALID_JSON", "Request body must be valid JSON.");
                }
                // As in Go, the managed app configuration determines the actual redirect.
                match self.setup.start_checked(&scope, &connector, None, active) {
                    Ok(start) => response(
                        201,
                        json!({"connection":crate::connection_json(&start.connection),"authorizationUrl":start.authorization_url}),
                    ),
                    Err(error) => setup_error(error, false),
                }
            }
            _ => failure(404, "NOT_FOUND", "The route was not found."),
        }
    }
}
struct CancelOnDrop(Arc<std::sync::atomic::AtomicBool>);
impl Drop for CancelOnDrop {
    fn drop(&mut self) {
        self.0.store(true, std::sync::atomic::Ordering::Release)
    }
}
fn response(status: u16, body: Value) -> Response {
    Response {
        status,
        body,
        headers: vec![],
    }
}
fn failure(status: u16, code: &str, message: &str) -> Response {
    response(status, json!({"error":{"code":code,"message":message}}))
}
pub(crate) fn setup_error(error: appcall_setup::Error, callback: bool) -> Response {
    use appcall_oauth::Error as O;
    use appcall_setup::Error as S;
    match error {
        S::CredentialResolutionFailed(cause) => {
            setup_error(S::OAuth(cause.oauth_error()), callback)
        }
        S::OAuth(O::InvalidState | O::StateExpired | O::StateBinding) => failure(
            400,
            "INVALID_OAUTH_STATE",
            "The OAuth state was invalid, expired, or did not match this project.",
        ),
        S::OAuth(O::Unsupported | O::NotConfigured) if callback => failure(
            400,
            "OAUTH_NOT_CONFIGURED",
            "Managed OAuth is not configured for this connector.",
        ),
        S::OAuth(O::NotConfigured) => failure(
            503,
            "OAUTH_APP_NOT_CONFIGURED",
            "A managed OAuth app must be configured for this connector.",
        ),
        S::OAuth(O::Transport | O::InvalidToken | O::OutcomeUnknown) => failure(
            502,
            "OAUTH_EXCHANGE_FAILED",
            "The authorization code exchange could not be completed.",
        ),
        S::MissingField | S::MissingDeclaredField(_) => failure(
            400,
            "MISSING_SETUP_FIELD",
            "A required connector setup field is missing.",
        ),
        S::Unsupported => failure(
            400,
            "UNSUPPORTED_SETUP_MODE",
            "This connector does not support that setup mode.",
        ),
        S::ValidationFailed | S::Validation(_) => failure(
            502,
            "CONNECTOR_SETUP_VALIDATION_FAILED",
            "The connector credentials could not be verified.",
        ),
        S::InvalidInput | S::UnknownRoute | S::OAuth(O::InvalidInput) => failure(
            400,
            "INVALID_INPUT",
            "The request contains invalid setup fields.",
        ),
        S::NotFound => failure(
            404,
            "CONNECTION_NOT_FOUND",
            "The connection or connector was not found.",
        ),
        S::Conflict => failure(
            409,
            "CONNECTION_CONFLICT",
            "The connection changed during setup.",
        ),
        _ => failure(500, "INTERNAL_ERROR", "The request could not be completed."),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn struct_body_defaults_preserve_null_empty_but_reject_scalars() {
        for route in [
            Route::Start("slack".into()),
            Route::Unipile("accepted"),
            Route::Unipile("relations"),
        ] {
            for body in [b"".as_slice(), b"null", b"{}"] {
                assert_eq!(
                    decode_body(&route, body),
                    Some(json!({})),
                    "{route:?}: {body:?}"
                );
            }
            for body in [b"[]".as_slice(), b"true", b"3", b"\"value\"", b"{invalid}"] {
                assert!(decode_body(&route, body).is_none(), "{route:?}: {body:?}");
            }
        }
        assert!(decode_body(&Route::Submit("slack".into()), b"null").is_none());
        assert!(decode_body(&Route::Unipile("disconnect"), b"").is_none());
    }

    #[test]
    fn public_routes_do_not_grant_account_or_setup_mutation_access() {
        assert!(public_exact(
            "GET",
            "/v1/connectors/slack/setup/oauth/callback"
        ));
        assert!(public_exact("POST", "/v1/connectors/unipile/setup/notify"));
        assert!(public_exact(
            "POST",
            "/v1/connectors/unipile/webhooks/relations"
        ));
        for (method, path) in [
            ("POST", "/v1/connectors/slack/setup/oauth/callback"),
            ("GET", "/v1/connectors/unipile/setup/notify"),
            ("POST", "/v1/connectors/unipile/accounts/disconnect"),
            ("POST", "/v1/connectors/slack/setup/oauth"),
            ("GET", "/v1/connectors/a%2fb/setup/oauth/callback"),
            ("GET", "/v1/connectors/slack/setup/oauth/callback/"),
        ] {
            assert!(!public_exact(method, path), "{method} {path}")
        }
    }
}

#[cfg(test)]
mod database_tests {
    use super::*;
    use appcall_connectors::{Connector, Registry};
    use appcall_oauth::{AppCredentials, EndpointPolicy, Lifecycle, StateSigner, TokenClient};
    use appcall_store::{LocalProvider, Scope, Status, Store};
    use std::{
        io::{Read, Write},
        net::TcpListener,
        sync::Mutex,
    };
    struct LocalTokens {
        client: TokenClient,
        url: String,
    }
    impl appcall_oauth::TokenProvider for LocalTokens {
        fn refresh(
            &self,
            spec: &appcall_connectors::OAuthConfig,
            app: &AppCredentials,
            refresh: &str,
            now: i64,
        ) -> appcall_oauth::Result<appcall_oauth::TokenSet> {
            let mut local = spec.clone();
            local.token_url = self.url.clone();
            self.client.refresh(&local, app, refresh, now)
        }
        fn exchange(
            &self,
            spec: &appcall_connectors::OAuthConfig,
            app: &AppCredentials,
            code: &str,
            verifier: &str,
            now: i64,
        ) -> appcall_oauth::Result<appcall_oauth::TokenSet> {
            let mut local = spec.clone();
            local.token_url = self.url.clone();
            self.client.exchange(&local, app, code, verifier, now)
        }
    }
    struct Accept;
    impl appcall_setup::Validator for Accept {
        fn validate(
            &self,
            _: &str,
            _: &str,
            _: &appcall_setup::Credentials,
        ) -> appcall_setup::Result<()> {
            Ok(())
        }
    }
    fn request(method: &str, uri: &str, body: Value) -> Request {
        Request {
            method: method.into(),
            uri: uri.into(),
            headers: vec![],
            body: serde_json::to_vec(&body).unwrap(),
        }
    }
    #[test]
    #[ignore = "requires isolated PostgreSQL and loopback OAuth simulator"]
    fn setup_routes_persist_scoped_credentials_and_complete_real_http_oauth() {
        let url = std::env::var("APPCALL_ENGINE_POSTGRES_URL").unwrap();
        let mut db = postgres::Client::connect(&url, postgres::NoTls).unwrap();
        let schema = format!("provider_http_{}", std::process::id());
        db.batch_execute(&format!(
            "CREATE SCHEMA {schema};SET search_path TO {schema}"
        ))
        .unwrap();
        for sql in [
            include_str!("../../../migrations/202605140001_init.sql"),
            include_str!("../../../migrations/202605290001_connections_ownership.sql"),
            include_str!("../../../migrations/202605290004_connections_owner_check.sql"),
            include_str!("../../../migrations/202609070004_oauth_refresh_intents.sql"),
        ] {
            db.batch_execute(sql).unwrap()
        }
        db.batch_execute("INSERT INTO projects(id,name)VALUES('p','test'),('q','other')")
            .unwrap();
        let store = Arc::new(Mutex::new(Store::new(
            db,
            LocalProvider::new(&[7; 32]).unwrap(),
        )));
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let token_url = format!("http://{}/token", listener.local_addr().unwrap());
        let exchange = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            let mut bytes = [0; 8192];
            let n = socket.read(&mut bytes).unwrap();
            let wire = String::from_utf8_lossy(&bytes[..n]);
            assert!(wire.starts_with("POST /token "));
            let body = r#"{"access_token":"synthetic-access","refresh_token":"synthetic-refresh","expires_in":3600}"#;
            write!(
                socket,
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{}",
                body.len(),
                body
            )
            .unwrap();
        });
        let google: Value = serde_json::from_slice(include_bytes!(
            "../../../runner/connectors/google-workspace/manifest.json"
        ))
        .unwrap();
        let registry = Arc::new(
            Registry::from_connectors([
                Connector::from_bytes(&serde_json::to_vec(&google).unwrap()).unwrap(),
                Connector::from_bytes(include_bytes!(
                    "../../../runner/connectors/brevo/manifest.json"
                ))
                .unwrap(),
            ])
            .unwrap(),
        );
        let oauth = Arc::new(Lifecycle::new(
            store.clone(),
            registry.clone(),
            BTreeMap::from([(
                "google-workspace".into(),
                AppCredentials {
                    client_id: "client".into(),
                    client_secret: "secret".into(),
                    redirect_uri: "https://app.test/callback".into(),
                },
            )]),
            StateSigner::new(&[1; 32]).unwrap(),
            Arc::new(LocalTokens {
                client: TokenClient::new(
                    std::time::Duration::from_secs(2),
                    EndpointPolicy::LoopbackDevelopment,
                )
                .unwrap(),
                url: token_url,
            }),
        ));
        let routes = ProviderRoutes::new(
            Arc::new(appcall_setup::Service::new(
                store.clone(),
                registry,
                oauth,
                Arc::new(Accept),
            )),
            None,
        );
        let identity = Identity {
            project_id: "p".into(),
            account_id: "brand".into(),
            admin_scope: false,
        };
        let runtime = tokio::runtime::Runtime::new().unwrap();
        runtime.block_on(async {
            // The HTTP future can disappear while setup waits for its store lock.
            // Releasing that lock must not turn abandoned work into a connection.
            let held_store = store.clone();
            let (locked_tx, locked_rx) = std::sync::mpsc::channel();
            let (release_tx, release_rx) = std::sync::mpsc::channel();
            let holder = std::thread::spawn(move || {
                let _held = held_store.lock().unwrap();
                locked_tx.send(()).unwrap();
                release_rx.recv().unwrap();
            });
            locked_rx.recv().unwrap();
            let abandoned_routes = routes.clone();
            let abandoned_identity = identity.clone();
            let abandoned = tokio::spawn(async move {
                abandoned_routes
                    .handle(
                        Some(&abandoned_identity),
                        &request(
                            "POST",
                            "/v1/connectors/brevo/setup/api-key",
                            json!({"fields":{"apiKey":"abandoned-key"}}),
                        ),
                    )
                    .await
            });
            tokio::time::sleep(std::time::Duration::from_millis(80)).await;
            abandoned.abort();
            let _ = abandoned.await;
            release_tx.send(()).unwrap();
            holder.join().unwrap();
            tokio::time::sleep(std::time::Duration::from_millis(80)).await;
            tokio::task::block_in_place(|| {
                assert!(
                    store
                        .lock()
                        .unwrap()
                        .list(&Scope::new("p", Some("brand")).unwrap())
                        .unwrap()
                        .is_empty(),
                    "cancelled setup created a connection"
                )
            });
            assert!(routes
                .handle(
                    None,
                    &request(
                        "POST",
                        "/v1/connectors/brevo/setup/api-key",
                        json!({"fields":{"apiKey":"key"}})
                    )
                )
                .await
                .is_err());
            let missing = routes
                .handle(
                    Some(&identity),
                    &request("POST", "/v1/connectors/brevo/setup/api-key", json!({})),
                )
                .await
                .unwrap()
                .unwrap();
            assert_eq!(missing.body["error"]["field"], "apiKey");
            let saved = routes
                .handle(
                    Some(&identity),
                    &request(
                        "POST",
                        "/v1/connectors/brevo/setup/api-key",
                        json!({"fields":{"apiKey":"synthetic-key"}}),
                    ),
                )
                .await
                .unwrap()
                .unwrap();
            assert_eq!(saved.status, 201);
            assert_eq!(saved.body["connection"]["credentialOwner"], "brand");
            assert!(!saved.body.to_string().contains("synthetic-key"));
            assert!(saved.body["connection"].get("secretRefId").is_none());
            let start = routes
                .handle(
                    Some(&identity),
                    &Request {
                        body: Vec::new(),
                        ..request(
                            "POST",
                            "/v1/connectors/google-workspace/setup/oauth",
                            Value::Null,
                        )
                    },
                )
                .await
                .unwrap()
                .unwrap();
            assert_eq!(start.status, 201);
            let auth = url::Url::parse(start.body["authorizationUrl"].as_str().unwrap()).unwrap();
            let pairs = auth.query_pairs().collect::<BTreeMap<_, _>>();
            assert_eq!(
                pairs.get("redirect_uri").unwrap(),
                "https://app.test/callback"
            );
            let state = pairs.get("state").unwrap();
            let query = url::form_urlencoded::Serializer::new(String::new())
                .append_pair("code", "code")
                .append_pair("state", state)
                .finish();
            let callback = request(
                "GET",
                &format!("/v1/connectors/google-workspace/setup/oauth/callback?{query}"),
                Value::Null,
            );
            let other = Identity {
                project_id: "q".into(),
                ..identity.clone()
            };
            let rejected = routes
                .handle(Some(&other), &callback)
                .await
                .unwrap()
                .unwrap();
            assert_eq!(rejected.body["error"]["code"], "INVALID_OAUTH_STATE");
            assert_eq!(
                routes
                    .handle(None, &callback)
                    .await
                    .unwrap()
                    .unwrap()
                    .status,
                204
            );
            assert_ne!(
                routes
                    .handle(None, &callback)
                    .await
                    .unwrap()
                    .unwrap()
                    .status,
                204
            );
        });
        exchange.join().unwrap();
        let scope = Scope::new("p", Some("brand")).unwrap();
        assert!(store
            .lock()
            .unwrap()
            .list(&scope)
            .unwrap()
            .iter()
            .all(|c| c.status == Status::Active));
        assert!(store
            .lock()
            .unwrap()
            .list(&Scope::new("q", None).unwrap())
            .unwrap()
            .is_empty());
        let mut admin = postgres::Client::connect(&url, postgres::NoTls).unwrap();
        admin
            .batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
            .unwrap();
    }
}
