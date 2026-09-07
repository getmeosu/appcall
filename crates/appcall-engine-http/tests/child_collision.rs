// Shared regression contract AC-WF-CHILD-COLLISION-001.
use appcall_engine::*;
use appcall_engine_http::*;
use std::{sync::Arc, time::Duration};
const TOKEN: &str = "synthetic-child-collision-token-32-bytes";
struct Payloads;
impl PayloadResolver for Payloads {
    fn resolve(&self, _: &PayloadRef) -> Result<Option<Vec<u8>>> {
        Ok(Some(vec![]))
    }
}
#[test]
#[ignore = "opens local TCP sockets"]
fn child_id_collision_fails_one_run_and_keeps_http_actor_alive() {
    let temp = tempfile::tempdir().unwrap();
    let mut engine = Engine::open(temp.path().join("db")).unwrap();
    engine
        .register_workflow("parent", "v1", |c| {
            let child = c.child("done", "v1", c.input().clone())?;
            c.join_child(child)
        })
        .unwrap();
    engine
        .register_workflow("park", "v1", |c| c.signal("resume"))
        .unwrap();
    engine
        .register_workflow("done", "v1", |c| Ok(c.input().clone()))
        .unwrap();
    let host =
        EngineHost::spawn(HttpAdapter::new(engine, TOKEN).unwrap(), Arc::new(Payloads)).unwrap();
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();
    runtime.block_on(async {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let (stop, done) = tokio::sync::oneshot::channel();
        let server = tokio::spawn(serve(listener, host.client(), TOKEN.into(), TransportLimits::default(), async { let _ = done.await; }));
        async fn request(address: std::net::SocketAddr, method: &str, path: &str, body: &str) -> String {
            let mut socket = tokio::net::TcpStream::connect(address).await.unwrap();
            socket.write_all(format!("{method} {path} HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer {TOKEN}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()).as_bytes()).await.unwrap();
            let mut result = String::new();
            tokio::time::timeout(Duration::from_secs(3), socket.read_to_string(&mut result)).await.unwrap().unwrap();
            result
        }
        for (id, workflow) in [("parent:c:0", "park"), ("parent", "parent")] {
            let body = serde_json::json!({"id":id,"workflow":workflow,"version":"v1","input":{"key":"input","ephemeral":false}}).to_string();
            let response = request(address, "POST", "/runs", &body).await;
            assert!(response.starts_with("HTTP/1.1 201"), "{response}");
        }
        let parent = request(address, "GET", "/runs/parent", "").await;
        assert!(parent.contains("Failed"), "colliding parent did not fail independently: {parent}");
        let reserved = request(address, "GET", "/runs/parent:c:0", "").await;
        assert!(reserved.contains("Running"), "unrelated existing run changed: {reserved}");
        let body = r#"{"id":"healthy","workflow":"done","version":"v1","input":{"key":"input","ephemeral":false}}"#;
        assert!(request(address, "POST", "/runs", body).await.starts_with("HTTP/1.1 201"));
        assert!(request(address, "GET", "/runs/healthy", "").await.contains("Completed"));
        assert!(host.client().is_alive());
        stop.send(()).unwrap(); server.await.unwrap().unwrap();
    });
    host.shutdown().unwrap();
}
