//! TRIG-3b runtime-served proof: every poll-tagged GitHub trigger slug, end to end through real
//! processes.
//!
//! - `appcall-api` (this crate's binary) serves `POST /v1/connections/c/poll-subscriptions`.
//! - The bun runner (`runner/bun/src/index.ts`) runs with a test-only preload
//!   (`runner/bun/test/github_poll_e2e_preload.ts`) that rewrites the `api.github.com` origin
//!   to a local HTTP mock owned by this test; the connector code itself is unchanged.
//! - `appcall-worker` (sibling binary in the same target dir; build it first with
//!   `cargo build -p appcall-worker`) runs one-shot cycles that poll and dispatch the outbox.
//!
//! Poll intervals are 60 s or more, so between cycles the test sets `next_run_at` to now in SQL
//! instead of sleeping. That is the only shortcut; claim, fetch, diff, emit and dispatch are the
//! production code paths.
//!
//! The proven slugs are recorded as the `poll` source of
//! `runner/connectors/github/fixtures/runtime-served.json` (see github_served/mod.rs), written
//! with `APPCALL_GITHUB_SERVED_WRITE=1` and checked otherwise.
#[path = "github_served/mod.rs"]
mod github_served;

use serde_json::{json, Value};
use std::{
    collections::{BTreeMap, BTreeSet},
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    os::unix::process::CommandExt,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicBool, AtomicU8, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};

const TOKEN: &str = "e2e-github-token";

struct Process(&'static str, Child);
impl Drop for Process {
    fn drop(&mut self) {
        // Each process leads its own group; `bun` may be a wrapper that forks the real binary,
        // so kill the whole group, not just the direct child.
        let _ = Command::new("kill")
            .args(["-KILL", &format!("-{}", self.1.id())])
            .status();
        let _ = self.1.kill();
        let _ = self.1.wait();
    }
}

fn root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn fixture(path: &str) -> Value {
    let file = root().join("runner/connectors/github/fixtures").join(path);
    serde_json::from_slice(&std::fs::read(file).unwrap()).unwrap()
}

fn free_address() -> std::net::SocketAddr {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    listener.local_addr().unwrap()
}

/// The subscriptions (connection, operation, input) and the slugs each must emit after the
/// change. Connection `c` subscribes repo-wide (no runId): its new artifact belongs to a different
/// run, so it emits GITHUB_ARTIFACT_CREATED_TRIGGER but not GITHUB_WORKFLOW_RUN_ARTIFACT_ADDED.
/// Connection `c2` subscribes with runId: its new artifact on that run emits both.
type Case = (&'static str, &'static str, Value, Vec<&'static str>);
fn cases() -> Vec<Case> {
    let repo = json!({"owner": "octo-org", "repo": "octo-repo"});
    let with = |c: &'static str, (o, i, t): (&'static str, Value, Vec<&'static str>)| (c, o, i, t);
    let mut out = vec![
        with(
            "c2",
            (
                "actions.artifacts.sync",
                json!({"owner": "octo-org", "repo": "octo-repo", "runId": RUN_ID}),
                vec![
                    "GITHUB_ARTIFACT_CREATED_TRIGGER",
                    "GITHUB_WORKFLOW_RUN_ARTIFACT_ADDED",
                ],
            ),
        ),
        with(
            "c",
            (
                "actions.artifacts.sync",
                repo.clone(),
                vec!["GITHUB_ARTIFACT_CREATED_TRIGGER"],
            ),
        ),
    ];
    out.extend(cases_c(repo).into_iter().map(|case| with("c", case)));
    out
}

const RUN_ID: u64 = 2332938;
const OTHER_RUN_ID: u64 = 4444444;

fn cases_c(repo: Value) -> Vec<(&'static str, Value, Vec<&'static str>)> {
    vec![
        (
            "actions.workflows.sync",
            repo.clone(),
            vec!["GITHUB_WORKFLOW_ADDED_TRIGGER"],
        ),
        (
            "deployments.sync",
            repo.clone(),
            vec!["GITHUB_DEPLOYMENT_STATE_CHANGED_TRIGGER"],
        ),
        (
            "user.followers.sync",
            json!({}),
            vec!["GITHUB_FOLLOWER_EVENT"],
        ),
        (
            "releases.assets.sync",
            repo.clone(),
            vec!["GITHUB_RELEASE_ASSET_ADDED_TRIGGER"],
        ),
        (
            "repos.notifications.sync",
            repo.clone(),
            vec!["GITHUB_REPOSITORY_NOTIFICATION_RECEIVED_TRIGGER"],
        ),
        (
            "repos.readme.sync",
            repo.clone(),
            vec!["GITHUB_README_CHANGED_TRIGGER"],
        ),
        (
            "repos.contents.sync",
            json!({"owner": "octo-org", "repo": "octo-repo", "path": "docs"}),
            vec!["GITHUB_REPOSITORY_CONTENT_CHANGED_TRIGGER"],
        ),
    ]
}

/// GitHub's state before (`changed == false`) and after the change, by request path.
fn github_body(path: &str, changed: bool) -> Option<Value> {
    let mut body = match path {
        "/repos/octo-org/octo-repo/actions/artifacts" => fixture("trig3a/artifacts.json"),
        "/repos/octo-org/octo-repo/actions/runs/2332938/artifacts" => {
            let mut body = fixture("trig3a/artifacts.json");
            body["artifacts"]
                .as_array_mut()?
                .retain(|a| a["workflow_run"]["id"] == json!(RUN_ID));
            if changed {
                let mut item = body["artifacts"][0].clone();
                item["id"] = json!(9906);
                item["name"] = json!("e2e-9906");
                body["artifacts"].as_array_mut()?.push(item);
            }
            body["total_count"] = json!(body["artifacts"].as_array()?.len());
            return Some(body);
        }
        "/repos/octo-org/octo-repo/actions/workflows" => fixture("trig3a/workflows.json"),
        "/repos/octo-org/octo-repo/deployments" => fixture("trig3a/deployments.json"),
        "/user/followers" => fixture("trig3a/followers.json"),
        "/repos/octo-org/octo-repo/releases" => fixture("trig3b/releases.json"),
        "/repos/octo-org/octo-repo/notifications" => fixture("trig3b/notifications.json"),
        "/repos/octo-org/octo-repo/readme" => fixture("trig3b/readme.json"),
        "/repos/octo-org/octo-repo/commits" => fixture("trig3b/commits.json"),
        _ => {
            let id = path
                .strip_prefix("/repos/octo-org/octo-repo/deployments/")?
                .strip_suffix("/statuses")?;
            let mut statuses = fixture("trig3a/deployment_statuses.json")[id].take();
            if changed && id == "1" {
                let mut newest = statuses[0].clone();
                newest["id"] = json!(9901);
                newest["state"] = json!("failure");
                statuses.as_array_mut()?.insert(0, newest);
            }
            return Some(statuses);
        }
    };
    if !changed {
        return Some(body);
    }
    let add = |list: &mut Value, id: u64| {
        let mut item = list[0].clone();
        item["id"] = json!(id);
        if item.get("name").is_some() {
            item["name"] = json!(format!("e2e-{id}"));
        }
        if item.get("login").is_some() {
            item["login"] = json!(format!("e2e-{id}"));
        }
        list.as_array_mut().unwrap().push(item);
    };
    match path {
        "/repos/octo-org/octo-repo/actions/artifacts" => {
            add(&mut body["artifacts"], 9902);
            // On a different run than the c2 subscription's runId.
            let last = body["artifacts"].as_array().unwrap().len() - 1;
            body["artifacts"][last]["workflow_run"]["id"] = json!(OTHER_RUN_ID);
            body["total_count"] = json!(body["artifacts"].as_array().unwrap().len());
        }
        "/repos/octo-org/octo-repo/actions/workflows" => {
            add(&mut body["workflows"], 9903);
            body["total_count"] = json!(body["workflows"].as_array().unwrap().len());
        }
        "/user/followers" => add(&mut body, 9904),
        "/repos/octo-org/octo-repo/releases" => add(&mut body[0]["assets"], 9905),
        "/repos/octo-org/octo-repo/notifications" => {
            body[0]["updated_at"] = json!("2026-10-12T00:00:00Z")
        }
        "/repos/octo-org/octo-repo/readme" => {
            body["sha"] = json!("0123456789abcdef0123456789abcdef01234567")
        }
        "/repos/octo-org/octo-repo/commits" => {
            let mut commit = body[0].clone();
            commit["sha"] = json!("89abcdef0123456789abcdef0123456789abcdef");
            body.as_array_mut().unwrap().insert(0, commit);
        }
        _ => {}
    }
    Some(body)
}

struct Mock {
    address: std::net::SocketAddr,
    changed: Arc<AtomicU8>,
    stop: Arc<AtomicBool>,
    requests: Arc<Mutex<Vec<(String, String)>>>,
    thread: Option<std::thread::JoinHandle<()>>,
}
impl Mock {
    fn start() -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let (changed, stop, requests) = (
            Arc::new(AtomicU8::new(0)),
            Arc::new(AtomicBool::new(false)),
            Arc::new(Mutex::new(Vec::new())),
        );
        let (c, s, r) = (changed.clone(), stop.clone(), requests.clone());
        let thread = std::thread::spawn(move || {
            for socket in listener.incoming() {
                if s.load(Ordering::SeqCst) {
                    break;
                }
                let Ok(mut socket) = socket else { continue };
                let _ = socket.set_read_timeout(Some(Duration::from_secs(5)));
                let mut data = Vec::new();
                let mut buffer = [0; 4096];
                while !data.windows(4).any(|w| w == b"\r\n\r\n") {
                    match socket.read(&mut buffer) {
                        Ok(0) | Err(_) => break,
                        Ok(n) => data.extend_from_slice(&buffer[..n]),
                    }
                }
                let head = String::from_utf8_lossy(&data).to_string();
                let target = head.split_whitespace().nth(1).unwrap_or("").to_owned();
                let path = target.split('?').next().unwrap_or("").to_owned();
                let auth = head
                    .lines()
                    .find_map(|l| {
                        let (k, v) = l.split_once(':')?;
                        k.eq_ignore_ascii_case("authorization")
                            .then(|| v.trim().to_owned())
                    })
                    .unwrap_or_default();
                r.lock().unwrap().push((target, auth));
                let (status, body) = match github_body(&path, c.load(Ordering::SeqCst) == 1) {
                    Some(body) => ("200 OK", body.to_string()),
                    None => ("404 Not Found", json!({"message": "Not Found"}).to_string()),
                };
                let _ = write!(
                    socket,
                    "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                );
            }
        });
        Mock {
            address,
            changed,
            stop,
            requests,
            thread: Some(thread),
        }
    }
}
impl Drop for Mock {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        let _ = TcpStream::connect(self.address);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

fn wait_for(address: std::net::SocketAddr, process: &mut Process) {
    let start = Instant::now();
    while TcpStream::connect(address).is_err() {
        assert!(
            process.1.try_wait().unwrap().is_none(),
            "{} exited before listening",
            process.0
        );
        assert!(
            start.elapsed() < Duration::from_secs(120),
            "{} did not listen",
            process.0
        );
        std::thread::sleep(Duration::from_millis(50));
    }
}

fn http(address: std::net::SocketAddr, brand: &str, path: &str, body: &Value) -> (u16, Value) {
    let method = "POST";
    let payload = body.to_string();
    let mut socket = TcpStream::connect(address).unwrap();
    socket
        .set_read_timeout(Some(Duration::from_secs(10)))
        .unwrap();
    write!(socket, "{method} {path} HTTP/1.1\r\nHost: localhost\r\nX-API-Key: hello\r\nX-External-Account-Id: {brand}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{payload}", payload.len()).unwrap();
    let mut reply = String::new();
    socket.read_to_string(&mut reply).unwrap();
    let status = reply[9..12].parse().unwrap();
    let body = reply.split_once("\r\n\r\n").map(|(_, b)| b).unwrap_or("");
    (status, serde_json::from_str(body).unwrap_or(Value::Null))
}

fn worker_cycle(database: &str) {
    let worker = PathBuf::from(env!("CARGO_BIN_EXE_appcall-api")).with_file_name("appcall-worker");
    assert!(
        worker.exists(),
        "build the worker first: cargo build -p appcall-worker"
    );
    let output = Command::new(worker)
        .env_clear()
        .env("PATH", std::env::var("PATH").unwrap_or_default())
        .env("APPCALL_DATABASE_URL", database)
        .env("APPCALL_SECRET_KEY", "01".repeat(32))
        .env("APPCALL_OAUTH_STATE_SECRET", "cd".repeat(32))
        .env("APPCALL_CONNECTOR_DIR", root().join("runner/connectors"))
        .env("APPCALL_RUNNER_URL", RUNNER.with(|r| r.borrow().clone()))
        .env("APPCALL_WORKER_MAX_JOBS", "10")
        .env("APPCALL_WORKER_ID", "github-poll-e2e")
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "worker cycle failed: {}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
}

thread_local! {
    static RUNNER: std::cell::RefCell<String> = const { std::cell::RefCell::new(String::new()) };
}

#[test]
#[ignore = "requires APPCALL_ENGINE_POSTGRES_URL, bun, and a built appcall-worker"]
fn every_poll_tagged_github_slug_is_served_end_to_end() {
    let base = std::env::var("APPCALL_ENGINE_POSTGRES_URL").unwrap();
    let mut admin = postgres::Client::connect(&base, postgres::NoTls).unwrap();
    let schema = format!("github_poll_e2e_{}", uuid::Uuid::new_v4().simple());
    admin
        .batch_execute(&format!("CREATE SCHEMA {schema}"))
        .unwrap();
    let mut url = url::Url::parse(&base).unwrap();
    url.query_pairs_mut()
        .append_pair("options", &format!("-csearch_path={schema}"));
    let database = url.to_string();
    let result = std::panic::catch_unwind(|| run(&database));
    admin
        .batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
        .unwrap();
    if let Err(panic) = result {
        std::panic::resume_unwind(panic);
    }
}

fn run(database: &str) {
    appcall_runtime::SqlxMigration::new(
        root().join("migrations").to_str().unwrap(),
        database,
        Duration::from_secs(30),
    )
    .unwrap()
    .apply()
    .unwrap();
    let mut db = postgres::Client::connect(database, postgres::NoTls).unwrap();
    db.batch_execute(
        "INSERT INTO projects(id,name) VALUES('p','p');
         INSERT INTO api_keys(id,project_id,key_hash) VALUES('k','p','2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
         INSERT INTO connections(id,project_id,connector,auth_type,status,external_account_id,credential_owner) VALUES('c','p','github','oauth2','active','brand','brand'),('c2','p','github','oauth2','active','brand-2','brand');",
    )
    .unwrap();
    let mut vault =
        appcall_store::Store::new(db, appcall_store::LocalProvider::new(&[0x01; 32]).unwrap());
    for (connection, brand) in [("c", "brand"), ("c2", "brand-2")] {
        let secret = format!("gh-e2e-{connection}");
        vault
            .store_secret(
                "p",
                &secret,
                &format!("oauth_tokens_{connection}"),
                format!(r#"{{"accessToken":"{TOKEN}","tokenType":"bearer"}}"#).as_bytes(),
            )
            .unwrap();
        vault
            .replace_credentials(
                &appcall_store::Scope::new("p", Some(brand)).unwrap(),
                connection,
                &secret,
                appcall_store::AuthType::OAuth2,
            )
            .unwrap();
    }
    let mut db = vault.into_client();

    let mock = Mock::start();
    let runner_address = free_address();
    let mut runner = Process(
        "runner",
        Command::new("bun")
            .arg("run")
            .arg("--preload")
            .arg(root().join("runner/bun/test/github_poll_e2e_preload.ts"))
            .arg(root().join("runner/bun/src/index.ts"))
            .env("APPCALL_RUNNER_PORT", runner_address.port().to_string())
            .env(
                "APPCALL_E2E_GITHUB_MOCK",
                format!("http://{}", mock.address),
            )
            .process_group(0)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .unwrap(),
    );
    wait_for(runner_address, &mut runner);
    RUNNER.with(|r| *r.borrow_mut() = format!("http://{runner_address}"));

    let api_address = free_address();
    let mut api = Process(
        "api",
        Command::new(env!("CARGO_BIN_EXE_appcall-api"))
            .env_clear()
            .env("PATH", std::env::var("PATH").unwrap_or_default())
            .env("APPCALL_ENV", "development")
            .env("APPCALL_RUST_QUALIFICATION", "0")
            .env(
                "APPCALL_DEV_API_KEY",
                "synthetic-platform-bootstrap-key-123456",
            )
            .env(
                "APPCALL_SESSION_SECRET",
                "synthetic-session-key-01234567890",
            )
            .env("APPCALL_SESSION_COOKIE_SECURE", "false")
            .env(
                "ANUSA_JWT_ACCESS_SECRET",
                "synthetic-jwt-key-0123456789012345",
            )
            .env("ANUSA_DATABASE_URL", database)
            .env("ANUSA_API_URL", "http://127.0.0.1:1")
            .env("APPCALL_PUBLIC_BASE_URL", "http://127.0.0.1:5080")
            .env(
                "APPCALL_WEBHOOK_SIGNING_SECRET",
                "synthetic-webhook-key-01234567890",
            )
            .env("APPCALL_SECRET_KEY", "01".repeat(32))
            .env("APPCALL_DATABASE_URL", database)
            .env("APPCALL_VAULT_MASTER_KEY", "01".repeat(32))
            .env(
                "APPCALL_OAUTH_STATE_KEY",
                "01234567890123456789012345678901",
            )
            .env("APPCALL_RUNNER_URL", format!("http://{runner_address}"))
            .env("APPCALL_RUST_LISTEN", api_address.to_string())
            .env("APPCALL_CONNECTOR_DIR", root().join("runner/connectors"))
            .process_group(0)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .unwrap(),
    );
    wait_for(api_address, &mut api);

    for (connection, operation, input, _) in cases() {
        let brand = if connection == "c" {
            "brand"
        } else {
            "brand-2"
        };
        let (status, body) = http(
            api_address,
            brand,
            &format!("/v1/connections/{connection}/poll-subscriptions"),
            &json!({"operation": operation, "input": input}),
        );
        assert_eq!(status, 201, "{operation}: {body}");
        assert_eq!(body["subscription"]["seeded"], false, "{operation}");
    }
    let due = "UPDATE poll_subscriptions SET next_run_at=clock_timestamp()";
    let failures = |db: &mut postgres::Client| -> Vec<(String, String)> {
        db.query(
            "SELECT operation,last_error FROM poll_subscriptions WHERE last_error<>'' OR NOT seeded",
            &[],
        )
        .unwrap()
        .iter()
        .map(|r| (r.get(0), r.get(1)))
        .collect()
    };

    // Seed run: every subscription records GitHub's current state and emits nothing.
    db.batch_execute(due).unwrap();
    worker_cycle(database);
    assert_eq!(failures(&mut db), vec![], "seed run");
    let seeded: i64 = db
        .query_one("SELECT count(*) FROM poll_subscriptions WHERE seeded", &[])
        .unwrap()
        .get(0);
    assert_eq!(seeded, 9);
    let events: i64 = db
        .query_one("SELECT count(*) FROM webhook_events", &[])
        .unwrap()
        .get(0);
    assert_eq!(events, 0, "a seed run must emit nothing");
    let seed_requests = mock.requests.lock().unwrap().len();
    assert!(seed_requests >= 9);

    // GitHub changes; the next poll emits exactly one event per subscription.
    mock.changed.store(1, Ordering::SeqCst);
    db.batch_execute(due).unwrap();
    worker_cycle(database);
    assert_eq!(failures(&mut db), vec![], "change run");
    // A third cycle dispatches the outbox (a one-shot cycle dispatches before it polls).
    worker_cycle(database);

    let requests = mock.requests.lock().unwrap().clone();
    assert!(requests
        .iter()
        .all(|(_, auth)| auth == &format!("Bearer {TOKEN}")));
    let rows = db
        .query(
            "SELECT e.connection_id||'/'||e.operation,e.triggers,e.payload,o.status,o.dispatched_at IS NOT NULL FROM webhook_events e JOIN webhook_outbox o ON o.project_id=e.project_id AND o.event_id=e.id WHERE e.connector='github' ORDER BY e.stream_position",
            &[],
        )
        .unwrap();
    let total: i64 = db
        .query_one("SELECT count(*) FROM webhook_events", &[])
        .unwrap()
        .get(0);
    assert_eq!(total as usize, rows.len(), "every event has an outbox row");
    #[allow(clippy::type_complexity)]
    let mut by_operation: BTreeMap<String, Vec<(Vec<String>, Value, String, bool)>> =
        BTreeMap::new();
    for row in &rows {
        by_operation.entry(row.get(0)).or_default().push((
            row.get(1),
            row.get(2),
            row.get(3),
            row.get(4),
        ));
    }
    let mut served = BTreeSet::new();
    for (connection, operation, _, slugs) in cases() {
        let operation = format!("{connection}/{operation}");
        let events = by_operation
            .get(&operation)
            .unwrap_or_else(|| panic!("{operation}: no event"));
        assert_eq!(events.len(), 1, "{operation}: {events:?}");
        let (triggers, payload, status, dispatched) = &events[0];
        assert_eq!(triggers, &slugs, "{operation}");
        assert_eq!(status, "dispatched", "{operation}");
        assert!(dispatched, "{operation}");
        assert!(payload["item"].is_object(), "{operation}: {payload}");
        println!(
            "e2e {operation}: change={} key={} triggers={triggers:?} outbox={status}",
            payload["change"], payload["itemKey"]
        );
        served.extend(slugs.iter().map(|s| (*s).to_owned()));
    }
    assert_eq!(by_operation.len(), 9, "{:?}", by_operation.keys());
    assert_eq!(served.len(), 9);

    github_served::record("poll", &served);
    drop(api);
    drop(runner);
}
