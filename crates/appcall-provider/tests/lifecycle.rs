use appcall_provider::*;
use postgres::{Client as Pg, NoTls};
use serde_json::{json, Value};
use std::{
    collections::BTreeSet,
    io::{Read, Write},
    net::TcpListener,
    sync::{Arc, Barrier, Mutex},
    thread,
};
struct Creds(String);
impl Credentials for Creds {
    fn resolve(&self, _: &str) -> Result<WorkspaceCredentials> {
        Ok(WorkspaceCredentials {
            api_key: "synthetic".to_owned().into(),
            dsn: self.0.clone().into(),
        })
    }
}
type RequestBarriers = Arc<Mutex<Option<(Arc<Barrier>, Arc<Barrier>)>>>;
struct Fixture {
    url: String,
    schema: String,
    db: Pg,
    creds: Arc<Creds>,
    requests: Arc<Mutex<Vec<Value>>>,
    registrations: Arc<std::sync::atomic::AtomicUsize>,
    webhook_barriers: RequestBarriers,
    delete_barriers: RequestBarriers,
}
impl Fixture {
    fn new() -> Self {
        let url = std::env::var("APPCALL_ENGINE_POSTGRES_URL").unwrap();
        let mut db = Pg::connect(&url, NoTls).unwrap();
        static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let schema = format!(
            "provider_{}_{}",
            std::process::id(),
            NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        );
        db.batch_execute(&format!(
            "CREATE SCHEMA {schema}; SET search_path TO {schema}"
        ))
        .unwrap();
        for sql in [
            include_str!("../../../migrations/202605140001_init.sql"),
            include_str!("../../../migrations/202605290002_provider_subaccounts.sql"),
            include_str!("../../../migrations/202606050001_provider_subaccounts_channel.sql"),
            include_str!("../../../migrations/202606100001_linkedin_accepted_relations.sql"),
            include_str!("../../../migrations/202609070003_unipile_flow.sql"),
            include_str!("../../../migrations/202606100002_project_plans.sql"),
        ] {
            db.batch_execute(sql).unwrap()
        }
        db.batch_execute("INSERT INTO projects(id,name)VALUES('p','one'),('q','two')")
            .unwrap();
        let server = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = format!("http://{}", server.local_addr().unwrap());
        let requests = Arc::new(Mutex::new(Vec::new()));
        let captured = requests.clone();
        let delete_barriers = Arc::new(Mutex::new(None::<(Arc<Barrier>, Arc<Barrier>)>));
        let delete_wait = delete_barriers.clone();
        let registrations = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let registered = registrations.clone();
        let webhook_barriers = Arc::new(Mutex::new(None::<(Arc<Barrier>, Arc<Barrier>)>));
        let webhook_wait = webhook_barriers.clone();
        thread::spawn(move || {
            for socket in server.incoming() {
                let captured = captured.clone();
                let delete_wait = delete_wait.clone();
                let registered = registered.clone();
                let webhook_wait = webhook_wait.clone();
                thread::spawn(move || {
                    let mut socket = socket.unwrap();
                    let mut bytes = Vec::new();
                    let mut buffer = [0; 1024];
                    loop {
                        let n = socket.read(&mut buffer).unwrap();
                        if n == 0 {
                            break;
                        }
                        bytes.extend_from_slice(&buffer[..n]);
                        if let Some(end) = bytes.windows(4).position(|b| b == b"\r\n\r\n") {
                            let header = String::from_utf8_lossy(&bytes[..end]);
                            let length = header
                                .lines()
                                .find_map(|l| {
                                    l.to_lowercase()
                                        .strip_prefix("content-length:")
                                        .and_then(|v| v.trim().parse::<usize>().ok())
                                })
                                .unwrap_or(0);
                            if bytes.len() >= end + 4 + length {
                                break;
                            }
                        }
                    }
                    let req = String::from_utf8_lossy(&bytes);
                    if req.starts_with("DELETE") {
                        let waits = delete_wait.lock().unwrap().take();
                        if let Some((entered, release)) = waits {
                            entered.wait();
                            release.wait();
                        }
                    }
                    if req.starts_with("POST /api/v1/webhooks ") {
                        if let Some((entered, release)) = webhook_wait.lock().unwrap().take() {
                            entered.wait();
                            release.wait();
                        }
                        registered.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                    }
                    let body = if req.starts_with("GET") {
                        json!({"items":[{"id":"a","type":"LINKEDIN"},{"id":"b","type":"LINKEDIN"},{"id":"c","type":"GOOGLE"}]})
                    } else if req.contains("/hosted/accounts/link") {
                        captured.lock().unwrap().push(
                            serde_json::from_str(req.split_once("\r\n\r\n").unwrap().1).unwrap(),
                        );
                        json!({"url":"https://account.unipile.test/hosted"})
                    } else {
                        json!({})
                    };
                    let body = body.to_string();
                    write!(
                        socket,
                        "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                        body.len(),
                        body
                    )
                    .unwrap();
                });
            }
        });
        Self {
            url,
            schema,
            db,
            creds: Arc::new(Creds(address)),
            requests,
            delete_barriers,
            registrations,
            webhook_barriers,
        }
    }
    fn service(&self, limit: i64) -> Service {
        self.service_signed(limit, "")
    }
    fn service_signed(&self, limit: i64, signing: &str) -> Service {
        let mut db = Pg::connect(&self.url, NoTls).unwrap();
        db.batch_execute(&format!("SET search_path TO {}", self.schema))
            .unwrap();
        Service::new(
            db,
            self.creds.clone(),
            Arc::new(ConfigGate {
                default_limit: limit,
                ..Default::default()
            }),
            Config {
                public_base_url: "https://api.test".into(),
                signing_secret: signing.into(),
                allow_loopback_http: true,
                ..Default::default()
            },
        )
        .unwrap()
    }
    fn start(&self, s: &Service, brand: &str) -> (String, String) {
        s.handle(
            "p",
            None,
            "hosted",
            &json!({"brandId":brand,"providers":["LINKEDIN"]}),
            None,
        )
        .unwrap();
        let data = self.requests.lock().unwrap().last().unwrap().clone();
        (
            data["name"].as_str().unwrap().into(),
            data["notify_url"]
                .as_str()
                .unwrap()
                .split("token=")
                .nth(1)
                .unwrap()
                .into(),
        )
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        self.db
            .batch_execute(&format!("DROP SCHEMA {} CASCADE", self.schema))
            .unwrap();
    }
}
fn notify(s: &Service, flow: &(String, String), account: &str) -> Result<Value> {
    s.handle(
        "",
        None,
        "notify",
        &json!({"status":"CREATION_SUCCESS","name":flow.0,"account_id":account}),
        Some(&flow.1),
    )
}
#[test]
#[ignore = "requires isolated local PostgreSQL"]
fn callback_ownership_replay_and_disconnect_contract() {
    let mut f = Fixture::new();
    let s = f.service(5);
    let a = f.start(&s, "brand-a");
    assert_eq!(
        notify(&s, &(a.0.clone(), "forged".into()), "a")
            .unwrap_err()
            .status,
        401
    );
    assert_eq!(notify(&s, &a, "a").unwrap()["bound"][0]["accountId"], "a");
    assert_eq!(notify(&s, &a, "b").unwrap_err().status, 401);
    let b = f.start(&s, "brand-b");
    assert_eq!(
        notify(&s, &b, "a").unwrap_err().code,
        "UNIPILE_ACCOUNT_ALREADY_BOUND"
    );
    assert_eq!(
        s.handle(
            "p",
            Some("brand-b"),
            "list",
            &json!({"brandId":"brand-a"}),
            None
        )
        .unwrap_err()
        .status,
        403
    );
    assert_eq!(
        s.handle("q", None, "list", &json!({"brandId":"brand-a"}), None)
            .unwrap()["bound"],
        json!([])
    );
    s.handle(
        "p",
        None,
        "relations",
        &json!({"account_id":"a","user_provider_id":"member"}),
        None,
    )
    .unwrap();
    s.handle(
        "p",
        None,
        "relations",
        &json!({"account_id":"a","user_provider_id":"member"}),
        None,
    )
    .unwrap();
    let accepted = s
        .handle("p", None, "accepted", &json!({"brandId":"brand-a"}), None)
        .unwrap();
    assert_eq!(accepted["accepted"].as_array().unwrap().len(), 1);
    assert_eq!(
        s.handle(
            "p",
            None,
            "accepted",
            &json!({"brandId":"brand-a","sinceCursor":accepted["nextCursor"]}),
            None
        )
        .unwrap()["accepted"],
        json!([])
    );
    s.handle(
        "p",
        None,
        "disconnect",
        &json!({"brandId":"brand-a","channel":"LINKEDIN"}),
        None,
    )
    .unwrap();
    assert_eq!(notify(&s, &a, "a").unwrap(), json!({"acknowledged":true}));
    assert_eq!(
        s.handle("p", None, "list", &json!({"brandId":"brand-a"}), None)
            .unwrap()["bound"],
        json!([])
    );
    f.db.execute(
        "UPDATE unipile_hosted_flows SET expires_at=now()-interval '1 second' WHERE id=$1",
        &[&a.0],
    )
    .unwrap();
    assert_eq!(notify(&s, &a, "a").unwrap_err().status, 401);
}

#[test]
#[ignore = "requires isolated local PostgreSQL"]
fn accepted_cursor_keeps_tied_rows_after_page_boundary() {
    let mut f = Fixture::new();
    let s = f.service(5);
    f.db
        .execute(
            "INSERT INTO linkedin_accepted_relations(project_id,external_account_id,provider_member_id,accepted_at) SELECT 'p','brand-a',format('member_%s',lpad(n::text,3,'0')),'2026-09-09T10:00:00Z'::timestamptz FROM generate_series(0,200) n",
            &[],
        )
        .unwrap();

    // Timestamp-only cursors remain accepted. Because they carry no tie-breaker,
    // the timestamp boundary is inclusive so rows sharing it cannot be lost.
    let legacy = s
        .handle(
            "p",
            None,
            "accepted",
            &json!({"brandId":"brand-a","sinceCursor":"2026-09-09T10:00:00Z"}),
            None,
        )
        .unwrap();
    assert_eq!(legacy["accepted"].as_array().unwrap().len(), 200);

    let first = s
        .handle("p", None, "accepted", &json!({"brandId":"brand-a"}), None)
        .unwrap();
    let first_rows = first["accepted"].as_array().unwrap();
    assert_eq!(first_rows.len(), 200);
    assert_eq!(first_rows.first().unwrap()["memberId"], "member_000");
    assert_eq!(first_rows.last().unwrap()["memberId"], "member_199");
    assert_eq!(first_rows.first().unwrap()["brandId"], "brand-a");
    assert_eq!(first_rows.last().unwrap()["brandId"], "brand-a");
    assert_eq!(
        first_rows.last().unwrap()["acceptedAt"],
        "2026-09-09T10:00:00Z"
    );
    let first_cursor = first["nextCursor"].as_str().unwrap();
    assert_ne!(first_cursor, "2026-09-09T10:00:00Z");

    let second = s
        .handle(
            "p",
            None,
            "accepted",
            &json!({"brandId":"brand-a","sinceCursor":first_cursor}),
            None,
        )
        .unwrap();
    assert_eq!(second["accepted"].as_array().unwrap().len(), 1);
    assert_eq!(second["accepted"][0]["memberId"], "member_200");
    assert_eq!(second["accepted"][0]["brandId"], "brand-a");
    assert_eq!(second["accepted"][0]["acceptedAt"], "2026-09-09T10:00:00Z");

    let second_cursor = second["nextCursor"].as_str().unwrap();
    let empty = s
        .handle(
            "p",
            None,
            "accepted",
            &json!({"brandId":"brand-a","sinceCursor":second_cursor}),
            None,
        )
        .unwrap();
    assert!(empty["accepted"].as_array().unwrap().is_empty());
    assert_eq!(empty["nextCursor"], second_cursor);
}

#[test]
#[ignore = "requires isolated local PostgreSQL"]
fn accepted_project_cursor_orders_account_scope_with_overlapping_members() {
    let mut f = Fixture::new();
    let s = f.service(5);
    f.db
        .execute(
            "INSERT INTO linkedin_accepted_relations(project_id,external_account_id,provider_member_id,accepted_at) SELECT 'p','brand-a',format('member_%s',lpad(n::text,3,'0')),'2026-09-09T10:00:00Z'::timestamptz FROM generate_series(0,100) n UNION ALL SELECT 'p','brand-b',format('member_%s',lpad(n::text,3,'0')),'2026-09-09T10:00:00Z'::timestamptz FROM generate_series(0,100) n",
            &[],
        )
        .unwrap();

    let first = s
        .handle("p", None, "accepted", &json!({"brandId":""}), None)
        .unwrap();
    let first_rows = first["accepted"].as_array().unwrap();
    assert_eq!(first_rows.len(), 200);
    let cursor = first["nextCursor"].as_str().unwrap();

    let second = s
        .handle(
            "p",
            None,
            "accepted",
            &json!({"brandId":"","sinceCursor":cursor}),
            None,
        )
        .unwrap();
    let second_rows = second["accepted"].as_array().unwrap();
    assert_eq!(second_rows.len(), 2);

    let mut pairs: Vec<(&str, &str)> = first_rows
        .iter()
        .chain(second_rows.iter())
        .map(|row| {
            (
                row["brandId"].as_str().unwrap(),
                row["memberId"].as_str().unwrap(),
            )
        })
        .collect();
    let mut expected = (0..=100)
        .map(|n| ("brand-a", format!("member_{n:03}")))
        .chain((0..=100).map(|n| ("brand-b", format!("member_{n:03}"))))
        .collect::<Vec<_>>();
    // Each brand/member pair is part of the cursor identity. The response
    // carries the account scope so project-wide consumers can retain it.
    let unique_pairs: BTreeSet<_> = pairs.iter().copied().collect();
    assert_eq!(unique_pairs.len(), 202);
    assert_eq!(pairs.len(), expected.len());
    assert_eq!(
        pairs,
        expected
            .iter()
            .map(|(brand, member)| (*brand, member.as_str()))
            .collect::<Vec<_>>()
    );
    pairs.sort_unstable();
    expected.sort_unstable();
    assert_eq!(
        pairs,
        expected
            .iter()
            .map(|(brand, member)| (*brand, member.as_str()))
            .collect::<Vec<_>>()
    );
}
#[test]
#[ignore = "requires isolated local PostgreSQL"]
fn competing_claims_and_cross_brand_cap_are_atomic() {
    let f = Fixture::new();
    let s = f.service(1);
    let a = f.start(&s, "brand-a");
    let b = f.start(&s, "brand-b");
    let s1 = f.service(1);
    let s2 = f.service(1);
    let one = thread::spawn(move || notify(&s1, &a, "a"));
    let two = thread::spawn(move || notify(&s2, &b, "b"));
    let results = [one.join().unwrap(), two.join().unwrap()];
    assert_eq!(results.iter().filter(|r| r.is_ok()).count(), 1);
    assert_eq!(
        results
            .iter()
            .filter_map(|r| r.as_ref().err())
            .next()
            .unwrap()
            .code,
        "QUOTA_EXCEEDED"
    );
}

#[test]
#[ignore = "requires isolated local PostgreSQL"]
fn slow_disconnect_does_not_remove_reconnected_binding() {
    let f = Fixture::new();
    let s = f.service(5);
    let old = f.start(&s, "brand");
    notify(&s, &old, "a").unwrap();
    let new = f.start(&s, "brand");
    let entered = Arc::new(Barrier::new(2));
    let release = Arc::new(Barrier::new(2));
    *f.delete_barriers.lock().unwrap() = Some((entered.clone(), release.clone()));
    let deleting = f.service(5);
    let worker = thread::spawn(move || {
        deleting.handle(
            "p",
            None,
            "disconnect",
            &json!({"brandId":"brand","channel":"LINKEDIN"}),
            None,
        )
    });
    entered.wait();
    notify(&s, &new, "b").unwrap();
    release.wait();
    worker.join().unwrap().unwrap();
    assert_eq!(
        s.handle(
            "p",
            None,
            "capture",
            &json!({"brandId":"brand","channel":"LINKEDIN"}),
            None
        )
        .unwrap()["bound"][0]["accountId"],
        "b"
    );
}
#[test]
#[ignore = "requires isolated local PostgreSQL"]
fn provider_mismatch_and_signed_relation_scope_fail_closed() {
    use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
    use hmac::{Hmac, Mac};
    let f = Fixture::new();
    let s = f.service(5);
    let flow = f.start(&s, "brand");
    assert_eq!(
        notify(&s, &flow, "c").unwrap_err().code,
        "UNIPILE_FLOW_MISMATCH"
    );
    assert_eq!(
        s.handle(
            "p",
            None,
            "relations",
            &json!({"account_id":"a","user_provider_id":"member"}),
            Some("forged")
        )
        .unwrap_err()
        .status,
        401
    );
    assert_eq!(
        s.handle("p", None, "accepted", &json!({"sinceCursor":"bad"}), None)
            .unwrap_err()
            .code,
        "INVALID_CURSOR"
    );
    let mut db = Pg::connect(&f.url, NoTls).unwrap();
    db.batch_execute(&format!("SET search_path TO {}", f.schema))
        .unwrap();
    let signed = Service::new(
        db,
        f.creds.clone(),
        Arc::new(ConfigGate {
            default_limit: 5,
            ..Default::default()
        }),
        Config {
            signing_secret: "signing-secret".into(),
            ..Default::default()
        },
    )
    .unwrap();
    let segment =
        URL_SAFE_NO_PAD.encode(json!({"p":"p","c":"relations","k":"unipile"}).to_string());
    let mut mac = Hmac::<sha2::Sha256>::new_from_slice(b"signing-secret").unwrap();
    mac.update(segment.as_bytes());
    let token = format!(
        "{segment}.{}",
        URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes())
    );
    assert_eq!(
        signed
            .handle("", None, "relations", &json!({}), Some(&token))
            .unwrap(),
        json!({"ok":true})
    );
    assert_eq!(
        signed
            .handle("", None, "list", &json!({"brandId":"brand"}), Some(&token))
            .unwrap_err()
            .status,
        401
    );
}

#[test]
#[ignore = "requires isolated local PostgreSQL"]
fn quota_denial_does_not_consume_flow_and_known_account_preserves_status() {
    let mut f = Fixture::new();
    let s = f.service(5);
    let flow = f.start(&s, "brand");
    let denied = f.service(0);
    assert_eq!(
        notify(&denied, &flow, "a").unwrap_err().code,
        "NOT_ENTITLED"
    );
    assert!(!f
        .db
        .query_one(
            "SELECT completed FROM unipile_hosted_flows WHERE id=$1",
            &[&flow.0]
        )
        .unwrap()
        .get::<_, bool>(0));
    notify(&s, &flow, "a").unwrap();
    f.db.execute(
        "UPDATE provider_subaccounts SET status='needs_reconnect' WHERE provider_account_id='a'",
        &[],
    )
    .unwrap();
    let repeat = f.start(&s, "brand");
    let result = notify(&s, &repeat, "a").unwrap();
    assert_eq!(result["bound"][0]["provider"], "");
    assert_eq!(
        f.db.query_one(
            "SELECT status FROM provider_subaccounts WHERE provider_account_id='a'",
            &[]
        )
        .unwrap()
        .get::<_, String>(0),
        "needs_reconnect"
    );
}

#[test]
#[ignore = "requires isolated local PostgreSQL"]
fn account_gate_reads_live_plan_changes() {
    let mut f = Fixture::new();
    let mut db = Pg::connect(&f.url, NoTls).unwrap();
    db.batch_execute(&format!("SET search_path TO {}", f.schema))
        .unwrap();
    let gate = PgAccountGate::new(db, 2).unwrap();
    assert_eq!(gate.limit("p").unwrap(), 2);
    f.db.execute(
        "INSERT INTO project_plans(project_id,plan_key,status)VALUES('p','starter','active')",
        &[],
    )
    .unwrap();
    assert_eq!(gate.limit("p").unwrap(), 1);
    f.db.execute("UPDATE project_plans SET overrides='{\"unipile_max_accounts\":4}'::jsonb WHERE project_id='p'",&[]).unwrap();
    assert_eq!(gate.limit("p").unwrap(), 4);
    f.db.execute(
        "UPDATE project_plans SET status='past_due' WHERE project_id='p'",
        &[],
    )
    .unwrap();
    assert_eq!(gate.limit("p").unwrap(), 0);
    f.db.execute("UPDATE project_plans SET status='active',overrides='{\"unipile_max_accounts\":\"bad\"}'::jsonb WHERE project_id='p'",&[]).unwrap();
    assert!(gate.limit("p").is_err());
}

#[test]
#[ignore = "requires isolated local PostgreSQL"]
fn concurrent_bindings_each_schedule_relations_registration() {
    let f = Fixture::new();
    let s = f.service_signed(5, "signer");
    let first = f.start(&s, "brand-a");
    let second = f.start(&s, "brand-b");
    let entered = Arc::new(Barrier::new(2));
    let release = Arc::new(Barrier::new(2));
    *f.webhook_barriers.lock().unwrap() = Some((entered.clone(), release.clone()));
    notify(&s, &first, "a").unwrap();
    entered.wait();
    notify(&s, &second, "b").unwrap();
    release.wait();
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(3);
    while f.registrations.load(std::sync::atomic::Ordering::SeqCst) < 2
        && std::time::Instant::now() < deadline
    {
        std::thread::sleep(std::time::Duration::from_millis(5));
    }
    assert_eq!(f.registrations.load(std::sync::atomic::Ordering::SeqCst), 2);
}

#[test]
#[ignore = "requires isolated local PostgreSQL and loopback provider"]
fn cancelled_hosted_request_cannot_dispatch_after_credentials_wait() {
    use std::sync::atomic::{AtomicBool, Ordering};
    struct CancelCredentials {
        address: String,
        active: Arc<AtomicBool>,
    }
    impl Credentials for CancelCredentials {
        fn resolve(&self, _: &str) -> Result<WorkspaceCredentials> {
            self.active.store(false, Ordering::Release);
            Ok(WorkspaceCredentials {
                api_key: "synthetic".to_owned().into(),
                dsn: self.address.clone().into(),
            })
        }
    }
    let mut fixture = Fixture::new();
    let mut db = Pg::connect(&fixture.url, NoTls).unwrap();
    db.batch_execute(&format!("SET search_path TO {}", fixture.schema))
        .unwrap();
    let active = Arc::new(AtomicBool::new(true));
    let service = Service::new(
        db,
        Arc::new(CancelCredentials {
            address: fixture.creds.0.clone(),
            active: active.clone(),
        }),
        Arc::new(ConfigGate {
            default_limit: 10,
            ..Default::default()
        }),
        Config {
            public_base_url: "https://api.test".into(),
            allow_loopback_http: true,
            ..Default::default()
        },
    )
    .unwrap();
    let result = service.handle_checked(
        "p",
        Some("brand"),
        "hosted",
        &json!({"brandId":"brand","providers":["LINKEDIN"]}),
        None,
        &|| active.load(Ordering::Acquire),
    );
    assert!(
        result.is_err(),
        "abandoned hosted request dispatched to provider"
    );
    assert!(fixture.requests.lock().unwrap().is_empty());
    let count: i64 = fixture
        .db
        .query_one("SELECT count(*) FROM unipile_hosted_flows", &[])
        .unwrap()
        .get(0);
    assert_eq!(count, 0);
}
