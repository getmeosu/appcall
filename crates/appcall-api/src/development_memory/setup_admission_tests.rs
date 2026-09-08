use super::*;
use appcall_actions::{ActionRepository, Attempt};
use appcall_oauth::{AppCredentials, TokenProvider, TokenSet};
use appcall_store::{AuthType, Connection, CredentialOwner, Status, TestStatus};
use std::{
    collections::BTreeMap,
    io::{Read, Write},
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        Arc,
    },
    time::Duration,
};
struct NoTokens;
impl TokenProvider for NoTokens {
    fn exchange(
        &self,
        _: &appcall_connectors::OAuthConfig,
        _: &AppCredentials,
        _: &str,
        _: &str,
        _: i64,
    ) -> appcall_oauth::Result<TokenSet> {
        panic!("unexpected exchange")
    }
    fn refresh(
        &self,
        _: &appcall_connectors::OAuthConfig,
        _: &AppCredentials,
        _: &str,
        _: i64,
    ) -> appcall_oauth::Result<TokenSet> {
        panic!("unexpected refresh")
    }
}
fn fixture(url: &str, runtime: tokio::runtime::Handle) -> (MemoryRepository, MemorySetup) {
    fixture_with_effects(url, runtime, 1)
}
fn fixture_with_effects(
    url: &str,
    runtime: tokio::runtime::Handle,
    effects: usize,
) -> (MemoryRepository, MemorySetup) {
    let manifest = serde_json::json!({"key":"keyed","name":"Keyed","version":"1","runtime":"bun","models":["item"],"auth":{"type":"api_key","setup":{"mode":"api_key","fields":[{"key":"apiKey","label":"API Key","required":true,"secret":true}]}},"network":{"egress":"none"},"operations":{"write":{"kind":"action","timeoutMs":1000,"maxInputBytes":1024,"maxResponseBytes":1024,"sideEffect":"write"}}});
    let registry =
        appcall_connectors::Registry::from_connectors([appcall_connectors::Connector::from_bytes(
            &serde_json::to_vec(&manifest).unwrap(),
        )
        .unwrap()])
        .unwrap();
    let repo = MemoryRepository::new(
        DevelopmentPermit::validate(false, None).unwrap(),
        Arc::new(registry),
        MemoryLimits {
            concurrent_effects: effects,
            ..Default::default()
        },
    )
    .unwrap();
    repo.create_connection(
        Connection {
            id: "c".into(),
            project_id: "proj_dev".into(),
            connector: "keyed".into(),
            auth_type: AuthType::ApiKey,
            status: Status::Active,
            secret_ref_id: String::new(),
            last_test_status: TestStatus::Unknown,
            external_account_id: "brand".into(),
            credential_owner: CredentialOwner::Brand,
        },
        Some(("connector_setup_bundle", br#"{"apiKey":"private"}"#)),
    )
    .unwrap();
    let oauth =
        Arc::new(MemoryOAuth::new(repo.clone(), BTreeMap::new(), Arc::new(NoTokens)).unwrap());
    let client = Arc::new(
        appcall_runner_client::RunnerClient::new(
            url,
            "",
            appcall_runner_client::ClientOptions {
                timeout: Duration::from_secs(5),
                ..Default::default()
            },
        )
        .unwrap(),
    );
    let validator = Arc::new(appcall_setup::RunnerValidator::new(
        client,
        repo.registry().clone(),
        runtime,
    ));
    let setup = MemorySetup::new(repo.clone(), Some(validator), oauth);
    (repo, setup)
}
fn attempt(id: &str) -> Attempt {
    Attempt {
        request_id: id.into(),
        project_id: "proj_dev".into(),
        connection_id: "c".into(),
        connector: "keyed".into(),
        external_account_id: "brand".into(),
        action: "write".into(),
        key: id.into(),
        input_hash: "hash".into(),
        lease_ms: 10000,
    }
}

#[test]
fn selected_setup_rejects_authorizing_without_mutation() {
    let rt = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(2)
        .enable_all()
        .build()
        .unwrap();
    let (repo, _) = fixture("http://127.0.0.1:1", rt.handle().clone());
    let (mut current, revision) = repo.get_connection("proj_dev", Some("brand"), "c").unwrap();
    current.status = Status::Authorizing;
    repo.replace_connection("proj_dev", Some("brand"), revision, current, None)
        .unwrap();
    let before = repo.get_connection("proj_dev", Some("brand"), "c").unwrap();
    let oauth =
        Arc::new(MemoryOAuth::new(repo.clone(), BTreeMap::new(), Arc::new(NoTokens)).unwrap());
    let setup = MemorySetup::new(repo.clone(), None, oauth);
    let fields = BTreeMap::from([("apiKey".into(), "replacement-synthetic".into())]);
    let result = setup.submit_checked("proj_dev", Some("brand"), "keyed", "", &fields, &|| true);
    assert!(
        matches!(result, Err(appcall_setup::Error::Conflict)),
        "selected authorizing row must not be overwritten"
    );
    assert_eq!(
        repo.get_connection("proj_dev", Some("brand"), "c").unwrap(),
        before
    );
}

#[test]
fn concurrent_memory_reuse_is_atomic_but_explicit_new_and_accounts_stay_distinct() {
    for (explicit_new, separate_accounts) in [(true, false), (false, true), (false, false)] {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let rt = tokio::runtime::Builder::new_multi_thread()
            .worker_threads(2)
            .enable_all()
            .build()
            .unwrap();
        let (repo, setup) = fixture_with_effects(
            &format!("http://{}", listener.local_addr().unwrap()),
            rt.handle().clone(),
            2,
        );
        let server = std::thread::spawn(move || {
            let deadline = std::time::Instant::now() + Duration::from_secs(5);
            let mut pending = Vec::new();
            // Both lookups precede validation in the regression. Do not release
            // either validator until both requests reached the fixture server.
            while pending.len() < 2 {
                match listener.accept() {
                    Ok((mut socket, _)) => {
                        socket.set_nonblocking(false).unwrap();
                        let request = rpc(&mut socket);
                        pending.push((socket, request));
                    }
                    Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                        assert!(
                            std::time::Instant::now() < deadline,
                            "both concurrent validators must arrive before release"
                        );
                        std::thread::sleep(Duration::from_millis(5));
                    }
                    Err(error) => panic!("synthetic validator accept failed: {error}"),
                }
            }
            for (mut socket, request) in pending {
                reply(&mut socket, &request);
            }
        });
        let spawn = |account: &'static str| {
            let setup = setup.clone();
            std::thread::spawn(move || {
                let fields = BTreeMap::from([("apiKey".into(), "synthetic-concurrent-key".into())]);
                if explicit_new {
                    setup.submit_new_checked(
                        "proj_dev",
                        Some(account),
                        "keyed",
                        "",
                        &fields,
                        &|| true,
                    )
                } else {
                    setup.submit_checked("proj_dev", Some(account), "keyed", "", &fields, &|| true)
                }
            })
        };
        let first = spawn("concurrent-a");
        let second = spawn(if separate_accounts {
            "concurrent-b"
        } else {
            "concurrent-a"
        });
        let first = first.join().unwrap();
        let second = second.join().unwrap();
        server.join().unwrap();
        let first = first.unwrap();
        let second = second.unwrap();
        let first_rows = setup.list("proj_dev", Some("concurrent-a")).unwrap();
        if explicit_new {
            assert_ne!(first.id, second.id);
            assert_eq!(first_rows.len(), 2);
        } else if separate_accounts {
            assert_ne!(first.id, second.id);
            assert_eq!(first_rows.len(), 1);
            assert_eq!(
                setup.list("proj_dev", Some("concurrent-b")).unwrap().len(),
                1
            );
            assert!(repo
                .get_connection("proj_dev", Some("concurrent-a"), &second.id)
                .is_err());
        } else {
            assert_eq!(
                first.id, second.id,
                "reuse submissions must converge on one identity"
            );
            assert_eq!(first_rows.len(), 1);
        }
    }
}
fn rpc(socket: &mut std::net::TcpStream) -> serde_json::Value {
    socket
        .set_read_timeout(Some(Duration::from_secs(5)))
        .unwrap();
    let mut bytes = Vec::new();
    let mut chunk = [0; 4096];
    let split = loop {
        let n = socket.read(&mut chunk).unwrap();
        assert!(n > 0);
        bytes.extend_from_slice(&chunk[..n]);
        if let Some(p) = bytes.windows(4).position(|w| w == b"\r\n\r\n") {
            break p + 4;
        }
    };
    let head = std::str::from_utf8(&bytes[..split]).unwrap();
    let len: usize = head
        .lines()
        .find_map(|l| {
            l.to_lowercase()
                .strip_prefix("content-length:")
                .map(|n| n.trim().parse().unwrap())
        })
        .unwrap();
    while bytes.len() < split + len {
        let n = socket.read(&mut chunk).unwrap();
        assert!(n > 0);
        bytes.extend_from_slice(&chunk[..n]);
    }
    serde_json::from_slice(&bytes[split..split + len]).unwrap()
}
fn reply(socket: &mut std::net::TcpStream, request: &serde_json::Value) {
    let body=serde_json::json!({"id":request["id"],"ok":true,"result":{"status":"ok","source":"provider"}}).to_string();
    write!(socket,"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",body.len(),body).unwrap();
}
#[test]
#[ignore = "opens synthetic runner sockets"]
fn dispatched_action_blocks_setup_validation_and_health_before_rpc() {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    listener.set_nonblocking(true).unwrap();
    let rt = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(2)
        .enable_all()
        .build()
        .unwrap();
    let (repo, setup) = fixture(
        &format!("http://{}", listener.local_addr().unwrap()),
        rt.handle().clone(),
    );
    let stop = Arc::new(AtomicBool::new(false));
    let calls = Arc::new(AtomicUsize::new(0));
    let server = {
        let stop = stop.clone();
        let calls = calls.clone();
        std::thread::spawn(move || {
            while !stop.load(Ordering::Acquire) {
                match listener.accept() {
                    Ok((mut socket, _)) => {
                        socket.set_nonblocking(false).unwrap();
                        calls.fetch_add(1, Ordering::SeqCst);
                        let request = rpc(&mut socket);
                        reply(&mut socket, &request);
                    }
                    Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                        std::thread::sleep(Duration::from_millis(1))
                    }
                    Err(e) => panic!("{e}"),
                }
            }
        })
    };
    let action = attempt("held");
    rt.block_on(async {
        repo.acquire(&action).await.unwrap();
        let c = repo.connection("proj_dev", "c").await.unwrap();
        repo.mark_dispatched_checked(&action, &c).await.unwrap();
    });
    let fields = BTreeMap::from([("apiKey".into(), "replacement".into())]);
    let save = setup.submit_checked("proj_dev", Some("brand"), "keyed", "", &fields, &|| true);
    let health = setup.test_checked("proj_dev", Some("brand"), "c", &|| true);
    stop.store(true, Ordering::Release);
    server.join().unwrap();
    assert_eq!(
        calls.load(Ordering::SeqCst),
        0,
        "setup/health bypassed shared active effect limit"
    );
    assert!(save.is_err());
    assert!(health.is_err());
    rt.block_on(repo.finish(&action, None, Some("ACTION_FAILED")))
        .unwrap();
    assert_eq!(repo.lock().unwrap().active_effects, 0);
}

#[test]
#[ignore = "opens a synthetic blocking runner socket"]
fn cancelled_setup_holds_effect_slot_until_rpc_really_returns() {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let rt = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(2)
        .enable_all()
        .build()
        .unwrap();
    let (repo, setup) = fixture(
        &format!("http://{}", listener.local_addr().unwrap()),
        rt.handle().clone(),
    );
    let before = repo.get_connection("proj_dev", None, "c").unwrap();
    let (entered_tx, entered_rx) = std::sync::mpsc::channel();
    let (release_tx, release_rx) = std::sync::mpsc::channel();
    let server = std::thread::spawn(move || {
        let (mut socket, _) = listener.accept().unwrap();
        let request = rpc(&mut socket);
        entered_tx.send(()).unwrap();
        release_rx.recv_timeout(Duration::from_secs(5)).unwrap();
        reply(&mut socket, &request);
    });
    let active = Arc::new(AtomicBool::new(true));
    let setup_thread = {
        let active = active.clone();
        std::thread::spawn(move || {
            setup.submit_checked(
                "proj_dev",
                Some("brand"),
                "keyed",
                "",
                &BTreeMap::from([("apiKey".into(), "replacement".into())]),
                &|| active.load(Ordering::Acquire),
            )
        })
    };
    entered_rx.recv_timeout(Duration::from_secs(5)).unwrap();
    active.store(false, Ordering::Release);
    let held = repo.lock().unwrap().active_effects;
    let a = attempt("blocked");
    let marked = rt.block_on(async {
        repo.acquire(&a).await.unwrap();
        let c = repo.connection("proj_dev", "c").await.unwrap();
        repo.mark_dispatched_checked(&a, &c).await
    });
    release_tx.send(()).unwrap();
    server.join().unwrap();
    let result = setup_thread.join().unwrap();
    assert_eq!(
        held, 1,
        "blocking setup RPC did not retain the global effect slot"
    );
    assert_eq!(marked.unwrap_err().code, "MEMORY_CAPACITY_EXCEEDED");
    assert!(matches!(result, Err(appcall_setup::Error::Cancelled)));
    assert_eq!(repo.lock().unwrap().active_effects, 0);
    assert_eq!(repo.get_connection("proj_dev", None, "c").unwrap(), before);
    rt.block_on(repo.release_pending(&a)).unwrap();
}
