use appcall_provider::Client;
use serde_json::json;
use std::{
    io::{Read, Write},
    net::TcpListener,
    thread,
};
fn serve(response: impl Into<String>) -> (String, thread::JoinHandle<String>) {
    let response = response.into();
    let server = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = format!("http://{}", server.local_addr().unwrap());
    let handle = thread::spawn(move || {
        let (mut socket, _) = server.accept().unwrap();
        let mut bytes = [0; 8192];
        let count = socket.read(&mut bytes).unwrap();
        socket.write_all(response.as_bytes()).unwrap();
        String::from_utf8_lossy(&bytes[..count]).into_owned()
    });
    (address, handle)
}
#[test]
fn redirect_does_not_forward_secret_and_errors_are_redacted() {
    let (url, server) = serve(
        "HTTP/1.1 302 Found\r\nLocation: http://127.0.0.1:9/leak\r\nContent-Length: 0\r\n\r\n",
    );
    let c = Client::new(&url, "very-secret", true).unwrap();
    let error = c.accounts().unwrap_err();
    assert!(!format!("{error:?}").contains("very-secret"));
    assert_eq!(error.code, "UNIPILE_LIST_FAILED");
    assert!(server.join().unwrap().contains("/api/v1/accounts"));
}
#[test]
fn normalizes_dsn_and_reads_account_shape() {
    let(url,server)=serve("HTTP/1.1 200 OK\r\nContent-Length: 40\r\n\r\n{\"items\":[{\"id\":\"a\",\"type\":\"LINKEDIN\"}]}");
    let c = Client::new(&format!("{url}/api/v1/accounts?q=x"), "key", true).unwrap();
    assert_eq!(c.accounts().unwrap()[0].id, "a");
    assert!(server
        .join()
        .unwrap()
        .starts_with("GET /api/v1/accounts HTTP/1.1"));
}
#[test]
fn rejects_invalid_delete_identifiers_and_plaintext_remote() {
    assert!(Client::new("http://example.com", "key", false).is_err());
    let c = Client::new("https://api.unipile.com", "key", false).unwrap();
    for bad in ["", "..", "a/b", "a%2fb", "a?b", " a", "a\\b"] {
        assert!(c.delete(bad).is_err());
    }
    let _ = json!({});
}

#[test]
fn oversized_valid_json_is_rejected_and_delete_404_is_idempotent() {
    let body = format!("{}{}", r#"{"items":[]}"#, " ".repeat(4 * 1024 * 1024));
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Length: {}\r\n\r\n{}",
        body.len(),
        body
    );
    let (url, server) = serve(response);
    let client = Client::new(&url, "key", true).unwrap();
    assert_eq!(client.accounts().unwrap_err().code, "UNIPILE_LIST_FAILED");
    server.join().unwrap();
    let (url, server) = serve("HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n");
    Client::new(&url, "key", true).unwrap().delete("a").unwrap();
    server.join().unwrap();
}
