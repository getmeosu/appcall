use appcall_connectors::OAuthConfig;
use appcall_oauth::{AppCredentials, EndpointPolicy, TokenClient, TokenProvider};
use std::{
    collections::BTreeMap,
    io::{BufRead, BufReader, Read, Write},
    net::TcpListener,
    time::Duration,
};
fn provider(response: &str) -> (String, std::thread::JoinHandle<String>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://{}/token", listener.local_addr().unwrap());
    let response = response.to_owned();
    let thread = std::thread::spawn(move || {
        let (mut socket, _) = listener.accept().unwrap();
        socket
            .set_read_timeout(Some(Duration::from_secs(2)))
            .unwrap();
        let mut reader = BufReader::new(&mut socket);
        let mut headers = String::new();
        let mut size = 0;
        loop {
            let mut line = String::new();
            reader.read_line(&mut line).unwrap();
            if line == "\r\n" {
                break;
            }
            if line.to_lowercase().starts_with("content-length:") {
                size = line
                    .split(':')
                    .nth(1)
                    .unwrap()
                    .trim()
                    .parse::<usize>()
                    .unwrap()
            }
            headers.push_str(&line)
        }
        let mut body = vec![0; size];
        reader.read_exact(&mut body).unwrap();
        drop(reader);
        socket.write_all(response.as_bytes()).unwrap();
        headers + &String::from_utf8(body).unwrap()
    });
    (url, thread)
}
fn spec(url: String) -> OAuthConfig {
    OAuthConfig {
        authorize_url: "https://provider.test/auth".into(),
        token_url: url,
        pkce: true,
        supports_refresh: true,
        client_auth: "body".into(),
        version: "".into(),
        extra_auth_params: BTreeMap::new(),
    }
}
#[test]
fn refresh_rotates_without_forwarding_redirects_or_secret_errors() {
    let app = AppCredentials {
        client_id: "client".into(),
        client_secret: "synthetic-client-secret".into(),
        redirect_uri: "https://app.test/callback".into(),
    };
    let body = r#"{"access_token":"fresh","refresh_token":"rotated","expires_in":3600}"#;
    let (url, server) = provider(&format!(
        "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
    ));
    let client =
        TokenClient::new(Duration::from_secs(2), EndpointPolicy::LoopbackDevelopment).unwrap();
    let tokens = client
        .refresh(&spec(url), &app, "synthetic-old-refresh", 100)
        .unwrap();
    assert_eq!(tokens.access_token(), "fresh");
    assert!(!tokens.needs_refresh(200));
    let request = server.join().unwrap();
    assert!(request.contains("grant_type=refresh_token"));
    assert!(request.contains("refresh_token=synthetic-old-refresh"));
    let trap = TcpListener::bind("127.0.0.1:0").unwrap();
    trap.set_nonblocking(true).unwrap();
    let(url,server)=provider(&format!("HTTP/1.1 307 Temporary Redirect\r\nLocation: http://{}/steal\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",trap.local_addr().unwrap()));
    let err = client
        .refresh(&spec(url), &app, "synthetic-old-refresh", 100)
        .unwrap_err();
    assert!(!err.to_string().contains("synthetic"));
    server.join().unwrap();
    assert!(trap.accept().is_err());
}
