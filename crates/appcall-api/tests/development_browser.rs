use appcall_api::development_browser::DevelopmentBrowserConfig;
#[test]
fn developer_browser_requires_loopback_and_never_production() {
    assert!(
        DevelopmentBrowserConfig::new(false, "127.0.0.1:5080", "http://127.0.0.1:5080").is_ok()
    );
    for (production, bind, origin) in [
        (true, "127.0.0.1:5080", "http://127.0.0.1:5080"),
        (false, "0.0.0.0:5080", "http://127.0.0.1:5080"),
        (false, "127.0.0.1:5080", "https://evil.example"),
        (false, "127.0.0.1:5080", "http://localhost:5080/path"),
        (false, "127.0.0.1:5080", "http://u@localhost:5080"),
    ] {
        assert!(DevelopmentBrowserConfig::new(production, bind, origin).is_err());
    }
}
