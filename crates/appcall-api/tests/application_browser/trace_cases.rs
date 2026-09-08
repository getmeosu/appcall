//! Actual HTTP qualification through the spawned application and PostgreSQL.
use super::{request, SocketAddr};

pub(super) fn seed(db: &mut postgres::Client) {
    for (id, project, connection, action) in [
        (
            "http-trace-owned",
            "proj_tenant-a",
            "application-browser-connection",
            "tool<unsafe>&value",
        ),
        (
            "http-trace-no-replay",
            "proj_tenant-a",
            "application-browser-connection",
            "read",
        ),
        (
            "http-trace-foreign",
            "other",
            "other-project-secret-connection",
            "foreign-private-action",
        ),
    ] {
        db.execute("INSERT INTO action_logs(id,project_id,connection_id,connector,action,status,request_id) VALUES($1,$2,$3,'slack',$4,'succeeded',$1)", &[&id, &project, &connection, &action]).unwrap();
    }
    db.execute("INSERT INTO action_replay_logs(id,project_id,connection_id,connector,action,request_id,sanitized_input) VALUES('http-replay-owned','proj_tenant-a','application-browser-connection','slack','tool<unsafe>&value','http-trace-owned',$1::text::jsonb)", &[&r#"{"private":"never-expose-retained-input"}"#]).unwrap();
}

fn parts(wire: &str) -> (&str, &str) {
    wire.split_once("\r\n\r\n").expect("HTTP headers and body")
}

fn header<'a>(wire: &'a str, name: &str) -> Option<&'a str> {
    parts(wire).0.lines().find_map(|line| {
        line.split_once(':')
            .and_then(|(key, value)| key.eq_ignore_ascii_case(name).then_some(value.trim()))
    })
}

fn status(wire: &str, expected: u16) {
    assert_eq!(
        parts(wire).0.split_whitespace().nth(1),
        Some(expected.to_string().as_str()),
        "{wire}"
    );
}

fn private_html_headers(wire: &str) {
    assert_eq!(
        header(wire, "Content-Type"),
        Some("text/html; charset=utf-8")
    );
    assert_eq!(header(wire, "Cache-Control"), Some("no-store"));
    assert_eq!(header(wire, "Referrer-Policy"), Some("no-referrer"));
}

pub(super) fn assert_assets(address: SocketAddr) {
    let expected = include_str!("../../../appcall-web/static/logs.js");
    let wire = request(address, "GET", "/static/logs.js", "", "");
    status(&wire, 200);
    assert_eq!(header(&wire, "Content-Type"), Some("text/javascript"));
    assert_eq!(
        parts(&wire).1,
        expected,
        "real host must serve exact embedded Logs script"
    );
    for method in ["POST", "PUT", "DELETE"] {
        assert!(!appcall_api::browser_host::public_path(
            method,
            "/static/logs.js"
        ));
        let wire = request(address, method, "/static/logs.js", "", "");
        assert_ne!(parts(&wire).0.split_whitespace().nth(1), Some("200"));
        assert_ne!(parts(&wire).1, expected);
    }
}

pub(super) fn assert_session_required(address: SocketAddr, cookie: &str) {
    for (query, expected) in [("", 302), ("?view=drawer", 401)] {
        let wire = request(
            address,
            "GET",
            &format!("/app/logs/http-trace-owned{query}"),
            cookie,
            "",
        );
        status(&wire, expected);
        private_html_headers(&wire);
        let cleared = header(&wire, "Set-Cookie").expect("clear session cookie");
        assert!(cleared.starts_with("appcall_session="));
        assert!(cleared.contains("Max-Age=0"));
        assert_eq!(
            header(&wire, "Location"),
            if expected == 302 {
                Some("/app/login")
            } else {
                None
            }
        );
        assert!(!parts(&wire).1.contains("trace-content"));
        assert!(!parts(&wire).1.contains("tool&lt;unsafe&gt;"));
    }
}

pub(super) fn assert_traces(address: SocketAddr, cookie: &str) {
    for (id, replay) in [("http-trace-owned", true), ("http-trace-no-replay", false)] {
        let full = request(address, "GET", &format!("/app/logs/{id}"), cookie, "");
        let drawer = request(
            address,
            "GET",
            &format!("/app/logs/{id}?view=drawer&projectId=other"),
            cookie,
            "",
        );
        for wire in [&full, &drawer] {
            status(wire, 200);
            private_html_headers(wire);
            let body = parts(wire).1;
            assert!(body.contains(&format!("data-request-id=\"{id}\"")));
            assert!(body.contains("id=\"trace-title\" tabindex=\"-1\""));
            assert!(body.contains("&quot;actionLog&quot;"));
            assert!(body.contains(&format!("&quot;replayAvailable&quot;: {replay}")));
            assert_eq!(
                body.contains(&format!("action=\"/app/logs/{id}/replay\"")),
                replay
            );
            assert_eq!(
                body.contains("Replay is not available for this trace."),
                !replay
            );
            for absent in [
                "sanitizedInput",
                "never-expose-retained-input",
                "foreign-private-action",
                "tool<unsafe>",
            ] {
                assert!(!body.contains(absent), "leaked {absent}");
            }
            if replay {
                assert!(body.contains("tool&lt;unsafe&gt;&amp;value"));
                assert!(body.contains("http-replay-owned"));
                assert!(body.contains("method=\"post\""));
            }
        }
        let full_body = parts(&full).1;
        let drawer_body = parts(&drawer).1;
        assert!(full_body.starts_with("<!DOCTYPE html>"));
        assert!(full_body.contains("Back to logs"));
        assert!(drawer_body.starts_with("<section id=\"trace-content\""));
        for absent in ["<html", "<script", "<nav", "<main", "Back to logs"] {
            assert!(!drawer_body.contains(absent));
        }
        if !replay {
            assert!(full_body.contains(drawer_body));
        }
    }
    let mut previous_failure = None;
    for id in ["http-trace-foreign", "http-trace-missing"] {
        for query in ["", "?view=drawer"] {
            let wire = request(
                address,
                "GET",
                &format!("/app/logs/{id}{query}"),
                cookie,
                "",
            );
            status(&wire, 503);
            private_html_headers(&wire);
            let body = parts(&wire).1;
            assert!(!body.contains("trace-content"));
            assert!(!body.contains("foreign-private-action"));
            assert!(!body.contains("other-project-secret-connection"));
            if let Some(previous) = &previous_failure {
                assert_eq!(body, previous);
            }
            previous_failure = Some(body.to_owned());
        }
    }
    for query in [
        "view=",
        "view=other",
        "view=DRAWER",
        "view=drawer&view=drawer",
        "view=drawer&view=other",
    ] {
        let wire = request(
            address,
            "GET",
            &format!("/app/logs/http-trace-owned?{query}"),
            cookie,
            "",
        );
        status(&wire, 400);
        assert!(!parts(&wire).1.contains("trace-content"));
        assert!(!parts(&wire).1.contains("tool&lt;unsafe&gt;"));
    }
}
