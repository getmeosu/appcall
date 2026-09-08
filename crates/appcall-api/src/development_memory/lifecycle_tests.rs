use super::*;
mod credential_evidence;
use appcall_connectors::{Connector, Registry};
use appcall_oauth::{AppCredentials, TokenProvider, TokenSet};
use appcall_store::{Status, TestStatus};
use std::{
    collections::BTreeMap,
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    },
};
fn fixture(
    apps: BTreeMap<String, AppCredentials>,
    provider: Arc<dyn TokenProvider>,
) -> (MemoryRepository, MemorySetup) {
    fixture_url(apps, provider, "https://provider.example/token")
}
fn fixture_url(
    apps: BTreeMap<String, AppCredentials>,
    provider: Arc<dyn TokenProvider>,
    token_url: &str,
) -> (MemoryRepository, MemorySetup) {
    let manifests = [
        serde_json::json!({"key":"keyed","name":"Keyed","version":"1","runtime":"bun","models":["item"],"auth":{"type":"api_key","setup":{"mode":"api_key","fields":[{"key":"apiKey","label":"API Key","required":true,"secret":true}]}},"network":{"egress":"none"},"operations":{"read":{"kind":"action","timeoutMs":100,"maxInputBytes":128,"maxResponseBytes":128,"sideEffect":"read"}}}),
        serde_json::json!({"key":"oauth","name":"OAuth","version":"1","runtime":"bun","models":["item"],"auth":{"type":"oauth2","setup":{"mode":"oauth2"},"oauth":{"authorizeUrl":"https://provider.example/authorize","tokenUrl":token_url,"pkce":true,"supportsRefresh":true}},"network":{"allowedHosts":["provider.example"]},"operations":{"read":{"kind":"action","timeoutMs":100,"maxInputBytes":128,"maxResponseBytes":128,"sideEffect":"read"}}}),
    ];
    let registry = Registry::from_connectors(
        manifests
            .into_iter()
            .map(|m| Connector::from_bytes(&serde_json::to_vec(&m).unwrap()).unwrap()),
    )
    .unwrap();
    let repo = MemoryRepository::new(
        DevelopmentPermit::validate(false, None).unwrap(),
        Arc::new(registry),
        MemoryLimits::default(),
    )
    .unwrap();
    let oauth = Arc::new(MemoryOAuth::new(repo.clone(), apps, provider).unwrap());
    let setup = MemorySetup::new(repo.clone(), None, oauth);
    (repo, setup)
}
struct Tokens(AtomicUsize);
impl TokenProvider for Tokens {
    fn exchange(
        &self,
        _: &appcall_connectors::OAuthConfig,
        _: &AppCredentials,
        _: &str,
        _: &str,
        _: i64,
    ) -> appcall_oauth::Result<TokenSet> {
        self.0.fetch_add(1, Ordering::SeqCst);
        TokenSet::decode(
            br#"{"accessToken":"synthetic-access","refreshToken":"synthetic-refresh"}"#,
        )
    }
    fn refresh(
        &self,
        s: &appcall_connectors::OAuthConfig,
        a: &AppCredentials,
        r: &str,
        n: i64,
    ) -> appcall_oauth::Result<TokenSet> {
        self.exchange(s, a, r, "", n)
    }
}
fn apps() -> BTreeMap<String, AppCredentials> {
    BTreeMap::from([(
        "oauth".into(),
        AppCredentials {
            client_id: "client".into(),
            client_secret: "synthetic-client-secret".into(),
            redirect_uri: "https://app.example/oauth/oauth/callback".into(),
        },
    )])
}
#[test]
fn setup_reconnect_scope_cancellation_and_unverified_health() {
    let (repo, s) = fixture(BTreeMap::new(), Arc::new(Tokens(AtomicUsize::new(0))));
    let fields = BTreeMap::from([("apiKey".into(), "synthetic-key".into())]);
    assert!(s
        .submit_checked("proj_dev", Some("a"), "keyed", "", &fields, &|| false)
        .is_err());
    assert!(repo.list_connections("proj_dev", None).unwrap().is_empty());
    let first = s
        .submit_checked("proj_dev", Some("a"), "keyed", "", &fields, &|| true)
        .unwrap();
    let second = s
        .submit_checked("proj_dev", Some("a"), "keyed", "", &fields, &|| true)
        .unwrap();
    assert_eq!(first.id, second.id);
    assert_ne!(first.secret_ref_id, second.secret_ref_id);
    assert!(s
        .disconnect_checked("proj_dev", Some("b"), &first.id, &|| true)
        .is_err());
    assert_eq!(
        s.test_checked("proj_dev", Some("a"), &first.id, &|| true)
            .unwrap()
            .last_test_status,
        TestStatus::Unknown
    );
    assert_eq!(
        s.disconnect_checked("proj_dev", Some("a"), &first.id, &|| true)
            .unwrap()
            .status,
        Status::Disconnected
    );
}

#[test]
fn new_setup_does_not_replace_existing_without_an_explicit_connection_id() {
    let (repo, s) = fixture(BTreeMap::new(), Arc::new(Tokens(AtomicUsize::new(0))));
    let fields = BTreeMap::from([("apiKey".into(), "synthetic-key".into())]);
    let existing = s
        .submit_checked("proj_dev", Some("a"), "keyed", "", &fields, &|| true)
        .unwrap();
    let created = s
        .submit_new_checked("proj_dev", Some("a"), "keyed", "", &fields, &|| true)
        .unwrap();
    assert_ne!(created.id, existing.id);
    assert_eq!(
        repo.list_connections("proj_dev", Some("a")).unwrap().len(),
        2
    );
    assert_ne!(created.secret_ref_id, existing.secret_ref_id);
    assert_eq!(
        repo.get_connection("proj_dev", Some("a"), &existing.id)
            .unwrap()
            .0
            .secret_ref_id,
        existing.secret_ref_id
    );
}

#[test]
fn new_oauth_setup_does_not_replace_existing_without_an_explicit_connection_id() {
    let (repo, s) = fixture(apps(), Arc::new(Tokens(AtomicUsize::new(0))));
    let first = s
        .start_checked("proj_dev", Some("a"), "oauth", None, &|| true)
        .unwrap();
    let second = s
        .start_checked("proj_dev", Some("a"), "oauth", None, &|| true)
        .unwrap();
    assert_ne!(first.connection.id, second.connection.id);
    assert_eq!(
        repo.list_connections("proj_dev", Some("a")).unwrap().len(),
        2
    );
}

#[test]
fn local_oauth_once_only_no_secret_and_cancelled_start() {
    let (repo, s) = fixture(BTreeMap::new(), Arc::new(Tokens(AtomicUsize::new(0))));
    assert!(s
        .start_checked("proj_dev", Some("a"), "oauth", None, &|| false)
        .is_err());
    assert!(repo.list_connections("proj_dev", None).unwrap().is_empty());
    let start = s
        .start_checked("proj_dev", Some("a"), "oauth", None, &|| true)
        .unwrap();
    assert!(start
        .authorization_url
        .starts_with("/oauth/local/authorize?"));
    let c = s
        .local_callback_checked("oauth", &start.connection.id, &|| true)
        .unwrap();
    assert_eq!(c.status, Status::Active);
    assert_eq!(c.external_account_id, "a");
    assert!(c.secret_ref_id.is_empty());
    assert!(s.local_callback_checked("oauth", &c.id, &|| true).is_err());
    assert!(s
        .start_checked("other", None, "oauth", None, &|| true)
        .is_err());
}
#[test]
fn managed_oauth_signed_binding_and_single_exchange() {
    let provider = Arc::new(Tokens(AtomicUsize::new(0)));
    let (repo, s) = fixture(apps(), provider.clone());
    let start = s
        .start_checked("proj_dev", Some("a"), "oauth", None, &|| true)
        .unwrap();
    let url = url::Url::parse(&start.authorization_url).unwrap();
    assert!(url.query_pairs().any(|(k, _)| k == "code_challenge"));
    let state = url
        .query_pairs()
        .find(|(k, _)| k == "state")
        .unwrap()
        .1
        .into_owned();
    assert!(s
        .callback_checked("oauth", Some("other"), "code", &state, &|| true)
        .is_err());
    assert!(s
        .local_callback_checked("oauth", &start.connection.id, &|| true)
        .is_err());
    let c = s
        .callback_checked("oauth", Some("proj_dev"), "code", &state, &|| true)
        .unwrap();
    assert_eq!(c.status, Status::Active);
    assert_eq!(c.external_account_id, "a");
    assert!(repo.secret("other", &c.id, &c.secret_ref_id).is_err());
    assert!(s
        .callback_checked("oauth", None, "code", &state, &|| true)
        .is_err());
    assert_eq!(provider.0.load(Ordering::SeqCst), 1);
}

struct Expired {
    exchanges: AtomicUsize,
    refreshes: AtomicUsize,
}
impl TokenProvider for Expired {
    fn exchange(
        &self,
        _: &appcall_connectors::OAuthConfig,
        _: &AppCredentials,
        _: &str,
        _: &str,
        _: i64,
    ) -> appcall_oauth::Result<TokenSet> {
        self.exchanges.fetch_add(1, Ordering::SeqCst);
        TokenSet::decode(br#"{"accessToken":"old-access","refreshToken":"single-use-refresh","expiresAt":"2000-01-01T00:00:00Z"}"#)
    }
    fn refresh(
        &self,
        _: &appcall_connectors::OAuthConfig,
        _: &AppCredentials,
        _: &str,
        _: i64,
    ) -> appcall_oauth::Result<TokenSet> {
        self.refreshes.fetch_add(1, Ordering::SeqCst);
        Err(appcall_oauth::Error::OutcomeUnknown)
    }
}
fn state_from(start: &appcall_setup::StartResult) -> String {
    url::Url::parse(&start.authorization_url)
        .unwrap()
        .query_pairs()
        .find(|(k, _)| k == "state")
        .unwrap()
        .1
        .into_owned()
}
#[test]
fn unknown_refresh_is_fenced_for_actions_and_health_without_retry() {
    let provider = Arc::new(Expired {
        exchanges: AtomicUsize::new(0),
        refreshes: AtomicUsize::new(0),
    });
    let (repo, s) = fixture(apps(), provider.clone());
    let start = s
        .start_checked("proj_dev", Some("brand"), "oauth", None, &|| true)
        .unwrap();
    let c = s
        .callback_checked("oauth", None, "code", &state_from(&start), &|| true)
        .unwrap();
    let snapshot = super::repository::action_connection(&c);
    assert!(s.oauth().resolve_tracked(&snapshot, &|| true).is_err());
    let c = repo
        .get_connection("proj_dev", Some("brand"), &c.id)
        .unwrap()
        .0;
    assert_eq!(c.status, Status::Degraded);
    assert!(s
        .oauth()
        .resolve_health_tracked(&super::repository::action_connection(&c), &|| true)
        .is_err());
    assert!(s.oauth().resolve_tracked(&snapshot, &|| true).is_err());
    assert_eq!(provider.refreshes.load(Ordering::SeqCst), 1);
}
#[test]
fn old_callback_cannot_overwrite_reconnect_and_scope_is_checked_before_exchange() {
    let provider = Arc::new(Tokens(AtomicUsize::new(0)));
    let (repo, s) = fixture(apps(), provider.clone());
    let old = s
        .start_checked("proj_dev", Some("a"), "oauth", None, &|| true)
        .unwrap();
    assert!(s
        .start_checked(
            "proj_dev",
            Some("b"),
            "oauth",
            Some(&old.connection.id),
            &|| true
        )
        .is_err());
    let fresh = s
        .start_checked(
            "proj_dev",
            Some("a"),
            "oauth",
            Some(&old.connection.id),
            &|| true,
        )
        .unwrap();
    assert!(s
        .callback_checked("oauth", None, "code", &state_from(&old), &|| true)
        .is_err());
    let c = s
        .callback_checked("oauth", None, "code", &state_from(&fresh), &|| true)
        .unwrap();
    assert_eq!(repo.list_connections("proj_dev", None).unwrap().len(), 1);
    assert_eq!(provider.0.load(Ordering::SeqCst), 1);
    assert_eq!(c.id, old.connection.id);
}
#[test]
fn cancelled_contended_setup_has_no_late_mutation() {
    use std::sync::atomic::AtomicBool;
    let (repo, s) = fixture(BTreeMap::new(), Arc::new(Tokens(AtomicUsize::new(0))));
    let live = Arc::new(AtomicBool::new(true));
    let started = Arc::new(std::sync::Barrier::new(2));
    let lock = repo.lock().unwrap();
    let worker_live = live.clone();
    let signal = started.clone();
    let worker = std::thread::spawn(move || {
        signal.wait();
        s.submit_checked(
            "proj_dev",
            Some("a"),
            "keyed",
            "",
            &BTreeMap::from([("apiKey".into(), "synthetic".into())]),
            &|| worker_live.load(Ordering::SeqCst),
        )
    });
    started.wait();
    live.store(false, Ordering::SeqCst);
    drop(lock);
    assert!(worker.join().unwrap().is_err());
    assert!(repo.list_connections("proj_dev", None).unwrap().is_empty());
}
#[test]
fn configured_but_invalid_oauth_never_falls_back_to_local() {
    let mut configured = apps();
    configured.get_mut("oauth").unwrap().client_id.clear();
    let (repo, s) = fixture(configured, Arc::new(Tokens(AtomicUsize::new(0))));
    assert!(s
        .start_checked("proj_dev", None, "oauth", None, &|| true)
        .is_err());
    assert!(repo.list_connections("proj_dev", None).unwrap().is_empty());
}

#[test]
fn managed_exchange_uses_real_token_client_with_pkce_and_persists_only_ciphertext() {
    use std::{
        io::{Read, Write},
        net::TcpListener,
        time::Duration,
    };
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let endpoint = format!("http://{}/token", listener.local_addr().unwrap());
    let server = std::thread::spawn(move || {
        let (mut socket, _) = listener.accept().unwrap();
        socket
            .set_read_timeout(Some(Duration::from_secs(3)))
            .unwrap();
        let mut bytes = Vec::new();
        let mut chunk = [0; 4096];
        loop {
            let count = socket.read(&mut chunk).unwrap();
            assert!(count > 0);
            bytes.extend_from_slice(&chunk[..count]);
            assert!(bytes.len() < 16384);
            if let Some(end) = bytes.windows(4).position(|w| w == b"\r\n\r\n") {
                let header = String::from_utf8_lossy(&bytes[..end]);
                let length = header
                    .lines()
                    .find_map(|line| {
                        line.to_ascii_lowercase()
                            .strip_prefix("content-length:")
                            .and_then(|s| s.trim().parse::<usize>().ok())
                    })
                    .unwrap();
                if bytes.len() >= end + 4 + length {
                    break;
                }
            }
        }
        let request = String::from_utf8(bytes).unwrap();
        assert!(request.contains("code_verifier="));
        assert!(request.contains("code=socket-code"));
        let body = r#"{"access_token":"socket-access","refresh_token":"socket-refresh","expires_in":3600}"#;
        write!(socket,"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",body.len(),body).unwrap();
    });
    let provider = Arc::new(LocalTokenClient {
        endpoint: endpoint.clone(),
        client: appcall_oauth::TokenClient::new(
            Duration::from_secs(3),
            appcall_oauth::EndpointPolicy::LoopbackDevelopment,
        )
        .unwrap(),
    });
    let (repo, s) = fixture(apps(), provider);
    let start = s
        .start_checked("proj_dev", Some("a"), "oauth", None, &|| true)
        .unwrap();
    let c = s
        .callback_checked("oauth", None, "socket-code", &state_from(&start), &|| true)
        .unwrap();
    server.join().unwrap();
    assert_eq!(c.status, Status::Active);
    let data = repo.lock().unwrap();
    assert!(data.oauth_pending.is_empty());
    assert_eq!(data.bytes_reserved, 0);
    for envelope in data.secrets.values() {
        assert!(!envelope
            .envelope
            .ciphertext
            .windows(b"socket-access".len())
            .any(|w| w == b"socket-access"));
    }
    drop(data);
    let (_, credentials) = s
        .oauth()
        .resolve_tracked(&super::repository::action_connection(&c), &|| true)
        .unwrap();
    assert_eq!(
        credentials.fields().get("accessToken").unwrap(),
        "socket-access"
    );
}

struct CancelDuringExchange {
    live: Arc<std::sync::atomic::AtomicBool>,
    calls: AtomicUsize,
}
impl TokenProvider for CancelDuringExchange {
    fn exchange(
        &self,
        _: &appcall_connectors::OAuthConfig,
        _: &AppCredentials,
        _: &str,
        _: &str,
        _: i64,
    ) -> appcall_oauth::Result<TokenSet> {
        self.calls.fetch_add(1, Ordering::SeqCst);
        self.live.store(false, Ordering::SeqCst);
        TokenSet::decode(br#"{"accessToken":"discard-after-cancel"}"#)
    }
    fn refresh(
        &self,
        s: &appcall_connectors::OAuthConfig,
        a: &AppCredentials,
        r: &str,
        n: i64,
    ) -> appcall_oauth::Result<TokenSet> {
        self.exchange(s, a, r, "", n)
    }
}
#[test]
fn cancellation_after_exchange_consumes_state_and_releases_reservation() {
    let live = Arc::new(std::sync::atomic::AtomicBool::new(true));
    let provider = Arc::new(CancelDuringExchange {
        live: live.clone(),
        calls: AtomicUsize::new(0),
    });
    let (repo, s) = fixture(apps(), provider.clone());
    let start = s
        .start_checked("proj_dev", None, "oauth", None, &|| true)
        .unwrap();
    let state = state_from(&start);
    assert!(s
        .callback_checked("oauth", None, "code", &state, &|| live
            .load(Ordering::SeqCst))
        .is_err());
    let data = repo.lock().unwrap();
    assert_eq!(data.bytes_reserved, 0);
    assert_eq!(data.active_effects, 0);
    assert_eq!(
        data.connections[&start.connection.id].status,
        Status::Degraded
    );
    assert!(data.connections[&start.connection.id]
        .secret_ref_id
        .is_empty());
    drop(data);
    assert!(s
        .callback_checked("oauth", None, "code", &state, &|| true)
        .is_err());
    assert_eq!(provider.calls.load(Ordering::SeqCst), 1);
}
#[test]
fn provider_dispatch_requires_available_capacity() {
    let provider = Arc::new(Tokens(AtomicUsize::new(0)));
    let (repo, s) = fixture(apps(), provider.clone());
    let start = s
        .start_checked("proj_dev", None, "oauth", None, &|| true)
        .unwrap();
    let state = state_from(&start);
    repo.lock().unwrap().active_effects = repo.limits().concurrent_effects;
    assert!(s
        .callback_checked("oauth", None, "code", &state, &|| true)
        .is_err());
    assert_eq!(provider.0.load(Ordering::SeqCst), 0);
    assert_eq!(
        repo.get_connection("proj_dev", None, &start.connection.id)
            .unwrap()
            .0
            .status,
        Status::Authorizing
    );
    repo.lock().unwrap().active_effects = 0;
    assert!(s
        .callback_checked("oauth", None, "code", &state, &|| true)
        .is_ok());
    assert_eq!(provider.0.load(Ordering::SeqCst), 1);
}

#[test]
fn real_runner_static_health_is_unverified_and_provider_health_is_passed() {
    use std::{
        io::{Read, Write},
        net::TcpListener,
    };
    for (source, expected) in [
        ("static", TestStatus::Unknown),
        ("provider", TestStatus::Passed),
    ] {
        let (repo, setup) = fixture(BTreeMap::new(), Arc::new(Tokens(AtomicUsize::new(0))));
        let c = setup
            .submit_checked(
                "proj_dev",
                Some("a"),
                "keyed",
                "",
                &BTreeMap::from([("apiKey".into(), "synthetic".into())]),
                &|| true,
            )
            .unwrap();
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let server = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            socket
                .set_read_timeout(Some(std::time::Duration::from_secs(3)))
                .unwrap();
            let mut raw = Vec::new();
            let request = loop {
                let mut bytes = [0; 4096];
                let count = socket.read(&mut bytes).unwrap();
                assert!(count > 0);
                raw.extend_from_slice(&bytes[..count]);
                if let Some(end) = raw.windows(4).position(|w| w == b"\r\n\r\n") {
                    if let Ok(value) = serde_json::from_slice::<serde_json::Value>(&raw[end + 4..])
                    {
                        break value;
                    }
                }
            };
            assert_eq!(request["params"]["input"]["apiKey"], "synthetic");
            let body=serde_json::json!({"id":request["id"],"ok":true,"result":{"status":"ok","source":source}}).to_string();
            write!(
                socket,
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            )
            .unwrap();
        });
        let runtime = tokio::runtime::Runtime::new().unwrap();
        let validator = appcall_setup::RunnerValidator::new(
            Arc::new(
                appcall_runner_client::RunnerClient::new(
                    &url,
                    "",
                    appcall_runner_client::ClientOptions::default(),
                )
                .unwrap(),
            ),
            repo.registry().clone(),
            runtime.handle().clone(),
        );
        let checked = MemorySetup::new(
            repo.clone(),
            Some(Arc::new(validator)),
            setup.oauth().clone(),
        );
        let tested = checked
            .test_checked("proj_dev", Some("a"), &c.id, &|| true)
            .unwrap();
        server.join().unwrap();
        assert_eq!(tested.last_test_status, expected);
    }
}

struct LocalTokenClient {
    client: appcall_oauth::TokenClient,
    endpoint: String,
}
#[test]
fn failed_health_rpc_preserves_passed_evidence_and_saves_degraded_before_error() {
    use std::{io::Read, net::TcpListener, time::Duration};
    for timeout in [false, true] {
        let (repo, setup) = fixture(BTreeMap::new(), Arc::new(Tokens(AtomicUsize::new(0))));
        let c = setup
            .submit_checked(
                "proj_dev",
                Some("a"),
                "keyed",
                "",
                &BTreeMap::from([("apiKey".into(), "submitted-secret".into())]),
                &|| true,
            )
            .unwrap();
        let (mut c, revision) = repo.get_connection("proj_dev", Some("a"), &c.id).unwrap();
        c.last_test_status = TestStatus::Passed;
        repo.replace_connection("proj_dev", Some("a"), revision, c.clone(), None)
            .unwrap();
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let server = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            socket
                .set_read_timeout(Some(Duration::from_secs(3)))
                .unwrap();
            let mut bytes = [0; 4096];
            assert!(socket.read(&mut bytes).unwrap() > 0);
            if timeout {
                std::thread::sleep(Duration::from_millis(300));
            }
        });
        let runtime = tokio::runtime::Runtime::new().unwrap();
        let validator = appcall_setup::RunnerValidator::new(
            Arc::new(
                appcall_runner_client::RunnerClient::new(
                    &url,
                    "",
                    appcall_runner_client::ClientOptions {
                        timeout: Duration::from_millis(100),
                        ..Default::default()
                    },
                )
                .unwrap(),
            ),
            repo.registry().clone(),
            runtime.handle().clone(),
        );
        let checked = MemorySetup::new(
            repo.clone(),
            Some(Arc::new(validator)),
            setup.oauth().clone(),
        );
        let actions = memory_actions(
            repo.clone(),
            None,
            Default::default(),
            setup.oauth().clone(),
        )
        .unwrap();
        let core = MemoryCore::new(
            repo.clone(),
            actions,
            Arc::new(checked),
            Arc::new(MemoryEvents::new(repo.clone(), None, None)),
            0,
        );
        let api = runtime
            .block_on(core.test_connection(
                &crate::Identity {
                    project_id: "proj_dev".into(),
                    account_id: "a".into(),
                    admin_scope: false,
                },
                &c.id,
            ))
            .unwrap_err();
        server.join().unwrap();
        let saved = repo.get_connection("proj_dev", Some("a"), &c.id).unwrap().0;
        assert_eq!(saved.status, Status::Degraded);
        assert_eq!(saved.last_test_status, TestStatus::Passed);
        assert_eq!(api.code, "CONNECTOR_SETUP_VALIDATION_FAILED");
        let evidence = format!("{:?}", api.evidence);
        assert!(!evidence.contains("submitted-secret"));
        assert!(
            matches!(api.evidence.as_deref(), Some(crate::ApiFailureEvidence::ConnectionCheck(cause)) if *cause == if timeout { crate::ConnectionCheckFailure::Timeout } else { crate::ConnectionCheckFailure::Transport })
        );
    }
}
impl TokenProvider for LocalTokenClient {
    fn exchange(
        &self,
        spec: &appcall_connectors::OAuthConfig,
        app: &AppCredentials,
        code: &str,
        verifier: &str,
        now: i64,
    ) -> appcall_oauth::Result<TokenSet> {
        let mut local = spec.clone();
        local.token_url = self.endpoint.clone();
        self.client.exchange(&local, app, code, verifier, now)
    }
    fn refresh(
        &self,
        spec: &appcall_connectors::OAuthConfig,
        app: &AppCredentials,
        refresh: &str,
        now: i64,
    ) -> appcall_oauth::Result<TokenSet> {
        let mut local = spec.clone();
        local.token_url = self.endpoint.clone();
        self.client.refresh(&local, app, refresh, now)
    }
}

struct Rotating {
    entered: Arc<std::sync::Barrier>,
    release: Arc<std::sync::Barrier>,
    refreshes: AtomicUsize,
}
impl TokenProvider for Rotating {
    fn exchange(
        &self,
        _: &appcall_connectors::OAuthConfig,
        _: &AppCredentials,
        _: &str,
        _: &str,
        _: i64,
    ) -> appcall_oauth::Result<TokenSet> {
        TokenSet::decode(br#"{"accessToken":"old","refreshToken":"single-use","expiresAt":"2000-01-01T00:00:00Z"}"#)
    }
    fn refresh(
        &self,
        _: &appcall_connectors::OAuthConfig,
        _: &AppCredentials,
        refresh: &str,
        _: i64,
    ) -> appcall_oauth::Result<TokenSet> {
        assert_eq!(refresh, "single-use");
        self.refreshes.fetch_add(1, Ordering::SeqCst);
        self.entered.wait();
        self.release.wait();
        TokenSet::decode(br#"{"accessToken":"fresh","refreshToken":"rotated"}"#)
    }
}
#[test]
fn concurrent_refresh_dispatches_once_and_returns_new_exact_snapshot() {
    let entered = Arc::new(std::sync::Barrier::new(2));
    let release = Arc::new(std::sync::Barrier::new(2));
    let provider = Arc::new(Rotating {
        entered: entered.clone(),
        release: release.clone(),
        refreshes: AtomicUsize::new(0),
    });
    let (repo, s) = fixture(apps(), provider.clone());
    let start = s
        .start_checked("proj_dev", Some("a"), "oauth", None, &|| true)
        .unwrap();
    let old = s
        .callback_checked("oauth", None, "code", &state_from(&start), &|| true)
        .unwrap();
    let snapshot = super::repository::action_connection(&old);
    let resolver = s.oauth().clone();
    let first = snapshot.clone();
    let worker = std::thread::spawn(move || resolver.resolve_tracked_versioned(&first, &|| true));
    entered.wait();
    let second = s.oauth().resolve_tracked(&snapshot, &|| true);
    release.wait();
    assert!(second.is_err());
    let (fresh, resolved_revision, credentials) = worker.join().unwrap().unwrap();
    assert_eq!(
        repo.get_connection("proj_dev", Some("a"), &fresh.id)
            .unwrap()
            .1,
        resolved_revision
    );
    assert_ne!(fresh.secret_ref_id, old.secret_ref_id);
    assert_eq!(fresh.external_account_id, "a");
    assert_eq!(credentials.fields()["accessToken"], "fresh");
    assert_eq!(provider.refreshes.load(Ordering::SeqCst), 1);
    assert!(repo
        .secret("proj_dev", &old.id, &old.secret_ref_id)
        .is_err());
    assert!(s.oauth().resolve_tracked(&snapshot, &|| true).is_err());
    let data = repo.lock().unwrap();
    assert_eq!(data.bytes_reserved, 0);
    assert_eq!(data.active_effects, 0);
    assert!(data.oauth_pending.is_empty());
}
#[test]
fn resolved_credential_constructor_enforces_existing_payload_bounds() {
    assert!(appcall_setup::Credentials::from_fields(
        (0..65).map(|n| (format!("k{n}"), String::new())).collect()
    )
    .is_err());
    assert!(appcall_setup::Credentials::from_fields(BTreeMap::from([(
        "token".into(),
        "x".repeat(65537)
    )]))
    .is_err());
    assert!(appcall_setup::Credentials::from_fields(BTreeMap::new()).is_ok());
}

#[test]
fn pending_action_admission_does_not_starve_its_oauth_refresh() {
    let provider = Arc::new(Rotating {
        entered: Arc::new(std::sync::Barrier::new(1)),
        release: Arc::new(std::sync::Barrier::new(1)),
        refreshes: AtomicUsize::new(0),
    });
    let (template, _) = fixture(apps(), provider.clone());
    let repo = MemoryRepository::new(
        DevelopmentPermit::validate(false, None).unwrap(),
        template.registry().clone(),
        MemoryLimits {
            concurrent_effects: 1,
            ..MemoryLimits::default()
        },
    )
    .unwrap();
    let resolver = Arc::new(MemoryOAuth::new(repo.clone(), apps(), provider.clone()).unwrap());
    let setup = MemorySetup::new(repo.clone(), None, resolver.clone());
    let start = setup
        .start_checked("proj_dev", None, "oauth", None, &|| true)
        .unwrap();
    let connection = setup
        .callback_checked("oauth", None, "code", &state_from(&start), &|| true)
        .unwrap();
    use appcall_actions::ActionRepository;
    let runtime = tokio::runtime::Runtime::new().unwrap();
    let attempt = appcall_actions::Attempt {
        request_id: "refreshing-action".into(),
        project_id: "proj_dev".into(),
        connection_id: connection.id.clone(),
        connector: "oauth".into(),
        external_account_id: String::new(),
        action: "read".into(),
        key: "one".into(),
        input_hash: "hash".into(),
        lease_ms: 10000,
    };
    runtime.block_on(repo.acquire(&attempt)).unwrap();
    let result = resolver.resolve_tracked_for_attempt(
        &attempt,
        &super::repository::action_connection(&connection),
        &|| true,
    );
    assert!(result.is_ok());
    assert_eq!(provider.refreshes.load(Ordering::SeqCst), 1);
    let (fresh, revision, _) = result.unwrap();
    repo.bind_resolved_revision(
        &attempt,
        &super::repository::action_connection(&fresh),
        revision,
    )
    .unwrap();
    runtime
        .block_on(
            repo.mark_dispatched_checked(&attempt, &super::repository::action_connection(&fresh)),
        )
        .unwrap();
    runtime
        .block_on(repo.finish(&attempt, Some(&serde_json::json!({})), None))
        .unwrap();
    assert_eq!(repo.lock().unwrap().active_effects, 0);
}

#[test]
fn clearing_optional_setup_fields_does_not_retain_old_credentials() {
    let provider = Arc::new(Tokens(AtomicUsize::new(0)));
    let (template, _) = fixture(BTreeMap::new(), provider.clone());
    let mut manifest = template
        .registry()
        .public_connector("keyed")
        .unwrap()
        .manifest()
        .clone();
    manifest.auth.setup.fields[0].required = false;
    let registry =
        Registry::from_connectors([
            Connector::from_bytes(&serde_json::to_vec(&manifest).unwrap()).unwrap(),
        ])
        .unwrap();
    let repo = MemoryRepository::new(
        DevelopmentPermit::validate(false, None).unwrap(),
        Arc::new(registry),
        MemoryLimits::default(),
    )
    .unwrap();
    let setup = MemorySetup::new(
        repo.clone(),
        None,
        Arc::new(MemoryOAuth::new(repo.clone(), BTreeMap::new(), provider).unwrap()),
    );
    let old = setup
        .submit_checked(
            "proj_dev",
            None,
            "keyed",
            "",
            &BTreeMap::from([("apiKey".into(), "old-secret".into())]),
            &|| true,
        )
        .unwrap();
    let cleared = setup
        .submit_checked("proj_dev", None, "keyed", "", &BTreeMap::new(), &|| true)
        .unwrap();
    assert_ne!(old.secret_ref_id, cleared.secret_ref_id);
    assert!(repo
        .secret("proj_dev", &old.id, &old.secret_ref_id)
        .is_err());
    let (_, fields) = setup
        .oauth()
        .resolve_tracked(&super::repository::action_connection(&cleared), &|| true)
        .unwrap();
    assert!(fields.fields().is_empty());
}

#[test]
fn restart_invalidates_pending_oauth_and_its_signing_key() {
    let (_, first) = fixture(apps(), Arc::new(Tokens(AtomicUsize::new(0))));
    let pending = first
        .start_checked("proj_dev", None, "oauth", None, &|| true)
        .unwrap();
    let (fresh, second) = fixture(apps(), Arc::new(Tokens(AtomicUsize::new(0))));
    assert!(second
        .callback_checked("oauth", None, "code", &state_from(&pending), &|| true)
        .is_err());
    assert!(fresh.list_connections("proj_dev", None).unwrap().is_empty());
}

#[path = "lifecycle_tests/attempt.rs"]
mod attempt;
