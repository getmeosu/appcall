use appcall_engine::*;
use appcall_engine_http::*;
use std::{sync::Arc, time::Duration};
const TOKEN: &str = "transport-test-token-at-least-thirty-two-bytes";
struct Local;
impl PayloadResolver for Local {
    fn resolve(&self, _: &PayloadRef) -> Result<Option<Vec<u8>>> {
        Ok(Some(b"native bytes".to_vec()))
    }
}
#[test]
#[ignore = "opens local TCP sockets"]
fn bounded_transport_rejects_slow_oversize_malformed_clients_and_keeps_running() {
    let d = tempfile::tempdir().unwrap();
    let mut e = Engine::open(d.path().join("db")).unwrap();
    e.register_workflow("native", "v1", |c| {
        c.activity("length", "v1", c.input().clone(), EffectPolicy::Read)
    })
    .unwrap();
    e.register_activity_fn("length", "v1", |_, bytes| {
        assert_eq!(bytes.len(), 12);
        Ok(PayloadRef::durable("result").unwrap())
    })
    .unwrap();
    let host = EngineHost::spawn(
        HttpAdapter::with_scope(e, TOKEN, "project").unwrap(),
        Arc::new(Local),
    )
    .unwrap();
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();
    runtime.block_on(async {
        use tokio::io::{AsyncReadExt,AsyncWriteExt};
        let listener=tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();let address=listener.local_addr().unwrap();
        let (stop_tx,stop_rx)=tokio::sync::oneshot::channel();
        let limits=TransportLimits {max_connections:2,requests_per_second:100,header_timeout:Duration::from_millis(200),read_timeout:Duration::from_millis(200),body_timeout:Duration::from_millis(100),write_timeout:Duration::from_millis(200),request_timeout:Duration::from_secs(1),connection_timeout:Duration::from_secs(2)};
        let server=tokio::spawn(serve(listener,host.client(),TOKEN.into(),limits,async {let _=stop_rx.await;}));
        async fn send(address:std::net::SocketAddr,request:&str)->String {
            let mut stream=tokio::net::TcpStream::connect(address).await.unwrap();stream.write_all(request.as_bytes()).await.unwrap();let mut result=Vec::new();tokio::time::timeout(Duration::from_secs(2),stream.read_to_end(&mut result)).await.unwrap().unwrap();String::from_utf8(result).unwrap()
        }
        let mut stalled_a=tokio::net::TcpStream::connect(address).await.unwrap();
        let mut stalled_b=tokio::net::TcpStream::connect(address).await.unwrap();
        stalled_a.write_all(b"GET /runs/r HTTP/1.1\r\n").await.unwrap();stalled_b.write_all(b"GET /runs/r HTTP/1.1\r\n").await.unwrap();
        tokio::time::sleep(Duration::from_millis(10)).await;
        let mut excess=tokio::net::TcpStream::connect(address).await.unwrap();
        let closed=tokio::time::timeout(Duration::from_millis(100),excess.read(&mut[0u8;1])).await.unwrap();assert!(matches!(closed,Ok(0)|Err(_)));
        drop(stalled_a);drop(stalled_b);drop(excess);tokio::time::sleep(Duration::from_millis(10)).await;
        let unauthorized=send(address,"POST /runs HTTP/1.1\r\nHost: local\r\nContent-Length: 1000\r\n\r\n").await;assert!(unauthorized.contains("401"));
        let slow=send(address,&format!("POST /runs HTTP/1.1\r\nHost: local\r\nAuthorization: Bearer {TOKEN}\r\nContent-Length: 1000\r\n\r\n{{")).await;assert!(slow.contains("408"));
        let big=send(address,&format!("POST /runs HTTP/1.1\r\nHost: local\r\nAuthorization: Bearer {TOKEN}\r\nContent-Length: 65537\r\n\r\n")).await;assert!(big.contains("413"));
        let malformed=send(address,"NOT HTTP\r\n\r\n").await;assert!(malformed.is_empty()||malformed.contains("400"));
        let json=r#"{"id":"r","workflow":"native","version":"v1","input":{"key":"input","ephemeral":false}}"#;
        let started=send(address,&format!("POST /runs HTTP/1.1\r\nHost: local\r\nAuthorization: Bearer {TOKEN}\r\nContent-Length: {}\r\n\r\n{json}",json.len())).await;assert!(started.contains("201"));
        for _ in 0..50 {let status=send(address,&format!("GET /runs/r HTTP/1.1\r\nHost: local\r\nAuthorization: Bearer {TOKEN}\r\n\r\n")).await;if status.contains("Completed"){stop_tx.send(()).unwrap();server.await.unwrap().unwrap();return;}tokio::time::sleep(Duration::from_millis(10)).await;}
        panic!("native workflow did not complete");
    });
    host.shutdown().unwrap();
}
