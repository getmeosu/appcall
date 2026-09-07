use appcall_cli::options::*;
#[test]
fn go_flag_spellings_values_and_duration_validation() {
    let parse = |a: Vec<&str>| flags(a.into_iter().map(str::to_owned), &["project"], &["show"]);
    assert_eq!(
        parse(vec!["-project=p", "--show=false"]).unwrap()["project"],
        "p"
    );
    assert!(parse(vec!["--bad"]).is_err());
    assert!(parse(vec!["--project"]).is_err());
    assert!(parse(vec!["--show=maybe"]).is_err());
    assert!(parse(vec!["--project=p", "--project=q"]).is_err());
    assert!(parse(vec!["positional"]).is_err());
    assert_eq!(duration("1h2m3.5s").unwrap().as_secs_f64(), 3723.5);
    for bad in [
        "",
        "0s",
        "-1s",
        "junk",
        "1d",
        "1sbad",
        "999999999999999999999999999999h",
    ] {
        assert!(duration(bad).is_err(), "{bad}");
    }
}
#[test]
fn subprocess_usage_and_diagnostics_do_not_echo_secrets() {
    for (bin, args, code) in [
        (env!("CARGO_BIN_EXE_qa"), vec![], 2),
        (env!("CARGO_BIN_EXE_qa"), vec!["check"], 2),
        (
            env!("CARGO_BIN_EXE_qa"),
            vec!["run", "--timeout=0s", "--project=p"],
            2,
        ),
        (
            env!("CARGO_BIN_EXE_qa"),
            vec!["run", "--credential=synthetic-secret"],
            2,
        ),
        (env!("CARGO_BIN_EXE_planctl"), vec!["-plan=free"], 1),
    ] {
        let out = std::process::Command::new(bin)
            .env_clear()
            .envs(std::env::var_os("LLVM_PROFILE_FILE").map(|v| ("LLVM_PROFILE_FILE", v)))
            .args(args)
            .output()
            .unwrap();
        assert_eq!(out.status.code(), Some(code));
        assert!(!String::from_utf8_lossy(&out.stderr).contains("synthetic-secret"));
    }
}
#[test]
fn discovery_includes_missing_scenarios_and_rejects_duplicate_ownership() {
    let root = tempfile::tempdir().unwrap();
    let m = serde_json::json!({"key":"test","name":"Test","version":"1","runtime":"bun","models":["item"],"auth":{"type":"none"},"network":{"egress":"none"},"operations":{"read":{"kind":"action","timeoutMs":100,"maxInputBytes":100,"maxResponseBytes":100,"sideEffect":"read"}}});
    std::fs::write(
        root.path().join("manifest.json"),
        serde_json::to_vec(&m).unwrap(),
    )
    .unwrap();
    let registry = appcall_connectors::Registry::load(root.path()).unwrap();
    assert_eq!(
        discover(root.path(), &registry, "").unwrap()[0]
            .scenarios
            .len(),
        0
    );
    assert!(discover(root.path(), &registry, "unknown").is_err());
    let scenario = serde_json::json!({"connector":"test","scenarios":[]});
    std::fs::write(
        root.path().join("qa.json"),
        serde_json::to_vec(&scenario).unwrap(),
    )
    .unwrap();
    std::fs::create_dir(root.path().join("nested")).unwrap();
    std::fs::write(
        root.path().join("nested/qa.json"),
        serde_json::to_vec(&scenario).unwrap(),
    )
    .unwrap();
    assert!(discover(root.path(), &registry, "").is_err());
    std::fs::remove_file(root.path().join("nested/qa.json")).unwrap();
    for raw in [
        r#"{"connector":"test","scenarios":[],"unknown":true}"#,
        r#"{"connector":"test","scenarios":[{"name":"x","operation":"read","expect":{"status":"maybe"}}]}"#,
        r#"{"connector":"test","scenarios":[{"name":"x","operation":"read","expect":{"status":"ok","assertions":[{"path":"id","op":"bad"}]}}]}"#,
    ] {
        std::fs::write(root.path().join("qa.json"), raw).unwrap();
        assert!(discover(root.path(), &registry, "").is_err());
    }
}
#[test]
fn run_timeout_covers_initialization_and_has_bounded_drain() {
    // Bound runtime deadline/drain, not first-launch OS loader/code-signature work.
    // Fresh instrumented macOS binaries have exceeded two seconds before warmup.
    let warmup = std::process::Command::new(env!("CARGO_BIN_EXE_qa"))
        .env_clear()
        .envs(std::env::var_os("LLVM_PROFILE_FILE").map(|v| ("LLVM_PROFILE_FILE", v)))
        .output()
        .unwrap();
    assert_eq!(warmup.status.code(), Some(2));
    assert!(String::from_utf8_lossy(&warmup.stderr).contains("usage: qa run|check"));
    let start = std::time::Instant::now();
    let out = std::process::Command::new(env!("CARGO_BIN_EXE_qa"))
        .env_clear()
        .envs(std::env::var_os("LLVM_PROFILE_FILE").map(|v| ("LLVM_PROFILE_FILE", v)))
        .args(["run", "--project=p", "--timeout=1ns", "--json"])
        .output()
        .unwrap();
    assert_eq!(out.status.code(), Some(1));
    assert!(String::from_utf8_lossy(&out.stderr).contains("deadline exceeded"));
    assert!(start.elapsed() < std::time::Duration::from_secs(2));
}

#[test]
fn planctl_help_exits_successfully_without_database_access() {
    for args in [vec!["-h"], vec!["--help"], vec!["-project=p", "-help"]] {
        let out = std::process::Command::new(env!("CARGO_BIN_EXE_planctl"))
            .env_clear()
            .envs(std::env::var_os("LLVM_PROFILE_FILE").map(|v| ("LLVM_PROFILE_FILE", v)))
            .args(args)
            .output()
            .unwrap();
        assert!(out.status.success(), "{:?}", out);
        assert!(String::from_utf8_lossy(&out.stderr).contains("-project"));
    }
}

#[test]
fn go_boolean_spellings_normalize_for_cli_callers() {
    for (forms, expected) in [
        (vec!["1", "t", "T", "TRUE", "true", "True"], "true"),
        (vec!["0", "f", "F", "FALSE", "false", "False"], "false"),
    ] {
        for form in forms {
            let parsed = flags([format!("--show={form}")], &[], &["show"]).unwrap();
            assert_eq!(parsed["show"], expected, "{form}");
        }
    }
    for invalid in ["", "yes", "no", "TrUe", "False ", " true", "2"] {
        assert!(flags([format!("--show={invalid}")], &[], &["show"]).is_err());
    }
}

#[test]
fn go_duration_forms_truncate_each_component_and_enforce_signed_nanosecond_limit() {
    for (text, nanos) in [
        (".5s", 500_000_000),
        ("1.s", 1_000_000_000),
        ("+1s", 1_000_000_000),
        ("+.5s", 500_000_000),
        ("1.s.5s", 1_500_000_000),
        ("1.9ns", 1),
        (".5ns1ns", 1),
        ("1µs1μs1us", 3000),
        ("9223372036854775807ns", i64::MAX as u64),
        ("2562047h47m16.854775807s", i64::MAX as u64),
    ] {
        assert_eq!(
            duration(text).unwrap().as_nanos(),
            u128::from(nanos),
            "{text}"
        );
    }
    for bad in [
        "9223372036854775808ns",
        "2562047h47m16.854775808s",
        "10000000000s",
        ".5ns",
        ".5ns.5ns",
        "-1s",
        "-.5s",
        "+0s",
        "+",
        ".s",
        "1..s",
        "1e3s",
        " 1s",
        "1s ",
        "++1s",
        "1s+1s",
    ] {
        assert!(duration(bad).is_err(), "{bad}");
    }
}

#[test]
fn qa_subprocess_accepts_go_boolean_and_plus_duration_flags() {
    let out = std::process::Command::new(env!("CARGO_BIN_EXE_qa"))
        .env_clear()
        .envs(std::env::var_os("LLVM_PROFILE_FILE").map(|v| ("LLVM_PROFILE_FILE", v)))
        .args([
            "run",
            "--project=p",
            "--timeout=+1ns",
            "--read-only=T",
            "--json=1",
            "--require-probe=FALSE",
        ])
        .output()
        .unwrap();
    assert_eq!(out.status.code(), Some(1));
    assert!(String::from_utf8_lossy(&out.stderr).contains("deadline exceeded"));
}
