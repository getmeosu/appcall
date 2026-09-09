use appcall_engine::*;
use appcall_engine_http::*;
use std::{sync::Arc, time::Duration};
const TOKEN: &str = "actor-test-token-at-least-thirty-two-bytes";
#[test]
fn one_exhausted_or_external_only_run_does_not_stop_other_workflows() {
    let d = tempfile::tempdir().unwrap();
    let mut e = Engine::open(d.path().join("db")).unwrap();
    e.register_workflow("cap", "v1", |c| {
        for _ in 0..1025 {
            c.timer(0)?;
        }
        Ok(c.input().clone())
    })
    .unwrap();
    e.register_workflow("healthy", "v1", |c| Ok(c.input().clone()))
        .unwrap();
    e.register_workflow("external", "v1", |c| {
        c.activity("external", "v1", c.input().clone(), EffectPolicy::Read)
    })
    .unwrap();
    e.register_activity("external", "v1").unwrap();
    for name in ["cap", "healthy", "external"] {
        e.start(name, name, "v1", PayloadRef::durable("input").unwrap())
            .unwrap();
    }
    let host = EngineHost::spawn(
        HttpAdapter::new(e, TOKEN).unwrap(),
        Arc::new(MissingPayloads),
    )
    .unwrap();
    let client = host.client();
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();
    runtime.block_on(async {
        for _ in 0..30 {
            let response = client
                .request(
                    "GET".into(),
                    "/runs/cap".into(),
                    format!("Bearer {TOKEN}"),
                    vec![],
                    Duration::from_secs(10),
                )
                .await;
            let body = String::from_utf8(response.body).unwrap();
            assert_eq!(response.status, 200, "{body}");
            if body.contains("ResourceLimit") {
                break;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        for (id, expected) in [
            ("cap", "Failed"),
            ("healthy", "Completed"),
            ("external", "NeedsImplementation"),
        ] {
            let response = client
                .request(
                    "GET".into(),
                    format!("/runs/{id}"),
                    format!("Bearer {TOKEN}"),
                    vec![],
                    Duration::from_secs(10),
                )
                .await;
            assert_eq!(response.status, 200);
            assert!(String::from_utf8(response.body).unwrap().contains(expected));
        }
    });
    assert!(client.is_alive());
    host.shutdown().unwrap();
    assert!(!client.is_alive());
}
#[test]
fn repeated_cancellation_retains_physical_native_capacity_until_callback_returns() {
    use std::sync::{
        atomic::{AtomicUsize, Ordering},
        mpsc, Condvar, Mutex,
    };
    let d = tempfile::tempdir().unwrap();
    let mut e = Engine::open(d.path().join("db")).unwrap();
    e.set_dispatch_limit(2).unwrap();
    let gate = Arc::new((Mutex::new(false), Condvar::new()));
    let active = Arc::new(AtomicUsize::new(0));
    let peak = Arc::new(AtomicUsize::new(0));
    let (started_tx, started_rx) = mpsc::channel();
    e.register_workflow("native", "v1", |c| {
        c.activity("blocking", "v1", c.input().clone(), EffectPolicy::Unknown)
    })
    .unwrap();
    let worker_gate = gate.clone();
    let worker_active = active.clone();
    let worker_peak = peak.clone();
    e.register_activity_fn("blocking", "v1", move |_, _| {
        let count = worker_active.fetch_add(1, Ordering::SeqCst) + 1;
        worker_peak.fetch_max(count, Ordering::SeqCst);
        started_tx.send(()).unwrap();
        let (lock, ready) = &*worker_gate;
        let mut allowed = lock.lock().unwrap();
        while !*allowed {
            allowed = ready.wait(allowed).unwrap();
        }
        worker_active.fetch_sub(1, Ordering::SeqCst);
        Ok(PayloadRef::durable("done").unwrap())
    })
    .unwrap();
    struct Local;
    impl PayloadResolver for Local {
        fn resolve(&self, _: &PayloadRef) -> Result<Option<Vec<u8>>> {
            Ok(Some(vec![]))
        }
    }
    let host = EngineHost::spawn(HttpAdapter::new(e, TOKEN).unwrap(), Arc::new(Local)).unwrap();
    let client = host.client();
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();
    let authorization = format!("Bearer {TOKEN}");
    for i in 0..20 {
        let body=serde_json::to_vec(&serde_json::json!({"id":format!("run-{i}"),"workflow":"native","version":"v1","input":{"key":"input","ephemeral":false}})).unwrap();
        assert_eq!(
            runtime
                .block_on(client.request(
                    "POST".into(),
                    "/runs".into(),
                    authorization.clone(),
                    body,
                    Duration::from_secs(2)
                ))
                .status,
            201
        );
        if i < 2 {
            started_rx.recv_timeout(Duration::from_secs(2)).unwrap();
        }
        assert_eq!(
            runtime
                .block_on(client.request(
                    "POST".into(),
                    format!("/runs/run-{i}/cancel"),
                    authorization.clone(),
                    vec![],
                    Duration::from_secs(2)
                ))
                .status,
            202
        );
        assert!(active.load(Ordering::SeqCst) <= 2);
    }
    assert_eq!(active.load(Ordering::SeqCst), 2);
    assert_eq!(peak.load(Ordering::SeqCst), 2);
    {
        let (lock, ready) = &*gate;
        *lock.lock().unwrap() = true;
        ready.notify_all();
    }
    let body=serde_json::to_vec(&serde_json::json!({"id":"healthy","workflow":"native","version":"v1","input":{"key":"input","ephemeral":false}})).unwrap();
    assert_eq!(
        runtime
            .block_on(client.request(
                "POST".into(),
                "/runs".into(),
                authorization.clone(),
                body,
                Duration::from_secs(2)
            ))
            .status,
        201
    );
    started_rx.recv_timeout(Duration::from_secs(2)).unwrap();
    runtime.block_on(async {
        for _ in 0..50 {
            let response = client
                .request(
                    "GET".into(),
                    "/runs/healthy".into(),
                    authorization.clone(),
                    vec![],
                    Duration::from_secs(2),
                )
                .await;
            if String::from_utf8(response.body)
                .unwrap()
                .contains("Completed")
            {
                break;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        let response = client
            .request(
                "GET".into(),
                "/runs/healthy".into(),
                authorization.clone(),
                vec![],
                Duration::from_secs(2),
            )
            .await;
        assert!(String::from_utf8(response.body)
            .unwrap()
            .contains("Completed"));
        let cancelled = client
            .request(
                "GET".into(),
                "/runs/run-0".into(),
                authorization,
                vec![],
                Duration::from_secs(2),
            )
            .await;
        assert!(String::from_utf8(cancelled.body)
            .unwrap()
            .contains("Cancelled"));
    });
    assert_eq!(peak.load(Ordering::SeqCst), 2);
    host.shutdown().unwrap();
}

#[test]
fn workflow_panic_keeps_actor_available() {
    let d = tempfile::tempdir().unwrap();
    let mut e = Engine::open(d.path().join("db")).unwrap();
    e.register_workflow("bad", "v1", |_| {
        panic!("workflow panic payload must not escape the actor");
    })
    .unwrap();
    e.register_workflow("healthy", "v1", |c| Ok(c.input().clone()))
        .unwrap();
    e.start("a_bad", "bad", "v1", PayloadRef::durable("input").unwrap())
        .unwrap();
    e.start(
        "z_good",
        "healthy",
        "v1",
        PayloadRef::durable("input").unwrap(),
    )
    .unwrap();

    let host = EngineHost::spawn(
        HttpAdapter::new(e, TOKEN).unwrap(),
        Arc::new(MissingPayloads),
    )
    .unwrap();
    let client = host.client();
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();
    let authorization = format!("Bearer {TOKEN}");

    runtime.block_on(async {
        let mut bad_body = String::new();
        for _ in 0..100 {
            let response = client
                .request(
                    "GET".into(),
                    "/runs/a_bad".into(),
                    authorization.clone(),
                    vec![],
                    Duration::from_secs(2),
                )
                .await;
            assert_eq!(
                response.status, 200,
                "bad response status: {}",
                response.status
            );
            bad_body = String::from_utf8(response.body).unwrap();
            if bad_body.contains("\"state\":\"Failed\"")
                && bad_body.contains("\"failure_reason\":\"InvalidCommand\"")
            {
                break;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        assert!(bad_body.contains("\"state\":\"Failed\""), "{bad_body}");
        assert!(
            bad_body.contains("\"failure_reason\":\"InvalidCommand\""),
            "{bad_body}"
        );
        assert!(!bad_body.contains("workflow panic payload"), "{bad_body}");

        let mut healthy_body = String::new();
        for _ in 0..100 {
            let response = client
                .request(
                    "GET".into(),
                    "/runs/z_good".into(),
                    authorization.clone(),
                    vec![],
                    Duration::from_secs(2),
                )
                .await;
            assert_eq!(
                response.status, 200,
                "healthy response status: {}",
                response.status
            );
            healthy_body = String::from_utf8(response.body).unwrap();
            if healthy_body.contains("\"state\":\"Completed\"") {
                break;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        assert!(
            healthy_body.contains("\"state\":\"Completed\""),
            "{healthy_body}"
        );
        assert!(
            !healthy_body.contains("workflow panic payload"),
            "{healthy_body}"
        );
    });

    assert!(client.is_alive());
    host.shutdown().unwrap();
    assert!(!client.is_alive());
}
