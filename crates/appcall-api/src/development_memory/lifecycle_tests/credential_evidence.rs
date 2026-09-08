use super::*;

fn core(
    repo: &MemoryRepository,
    setup: &MemorySetup,
    runtime: &tokio::runtime::Runtime,
) -> MemoryCore {
    let validator = appcall_setup::RunnerValidator::new(
        Arc::new(
            appcall_runner_client::RunnerClient::new("http://127.0.0.1:1", "", Default::default())
                .unwrap(),
        ),
        repo.registry().clone(),
        runtime.handle().clone(),
    );
    MemoryCore::new(
        repo.clone(),
        memory_actions(
            repo.clone(),
            None,
            Default::default(),
            setup.oauth().clone(),
        )
        .unwrap(),
        Arc::new(MemorySetup::new(
            repo.clone(),
            Some(Arc::new(validator)),
            setup.oauth().clone(),
        )),
        Arc::new(MemoryEvents::new(repo.clone(), None, None)),
        0,
    )
}

fn identity(account: &str) -> crate::Identity {
    crate::Identity {
        project_id: "proj_dev".into(),
        account_id: account.into(),
        admin_scope: false,
    }
}

#[test]
fn memory_check_retains_credential_resolution_cause_and_existing_state() {
    for refresh_unknown in [false, true] {
        let provider = Arc::new(Expired {
            exchanges: AtomicUsize::new(0),
            refreshes: AtomicUsize::new(0),
        });
        let (repo, setup) = fixture(apps(), provider.clone());
        let started = setup
            .start_checked("proj_dev", Some("a"), "oauth", None, &|| true)
            .unwrap();
        let c = setup
            .callback_checked("oauth", None, "code", &state_from(&started), &|| true)
            .unwrap();
        let (mut c, revision) = repo.get_connection("proj_dev", Some("a"), &c.id).unwrap();
        c.last_test_status = TestStatus::Passed;
        let invalid_token = br#"{"private":"stored-secret"}"#;
        repo.replace_connection(
            "proj_dev",
            Some("a"),
            revision,
            c.clone(),
            (!refresh_unknown).then_some(("oauth_token", invalid_token.as_slice())),
        )
        .unwrap();
        let runtime = tokio::runtime::Runtime::new().unwrap();
        let core = core(&repo, &setup, &runtime);
        let error = runtime
            .block_on(core.test_connection(&identity("a"), &c.id))
            .unwrap_err();
        assert_eq!(error.code, "OAUTH_EXCHANGE_FAILED");
        assert!(error.detail.is_none());
        let saved = repo.get_connection("proj_dev", Some("a"), &c.id).unwrap().0;
        assert_eq!(
            saved.status,
            if refresh_unknown {
                Status::Degraded
            } else {
                Status::Active
            }
        );
        assert_eq!(saved.last_test_status, TestStatus::Passed);
        assert_eq!(
            provider.refreshes.load(Ordering::SeqCst),
            usize::from(refresh_unknown)
        );
        let debug = format!("{:?}", error.evidence);
        assert!(!debug.contains("stored-secret"));
        assert!(
            matches!(
                error.evidence.as_deref(),
                Some(crate::ApiFailureEvidence::ConnectionCheck(
                    crate::ConnectionCheckFailure::CredentialsUnavailable
                ))
            ),
            "credential origin was lost: {debug}"
        );
    }
}

#[test]
fn memory_check_access_cancellation_and_revision_errors_are_not_credentials() {
    let (repo, setup) = fixture(BTreeMap::new(), Arc::new(Tokens(AtomicUsize::new(0))));
    let c = setup
        .submit_checked(
            "proj_dev",
            Some("a"),
            "keyed",
            "",
            &BTreeMap::from([("apiKey".into(), "secret".into())]),
            &|| true,
        )
        .unwrap();
    let runtime = tokio::runtime::Runtime::new().unwrap();
    let core = core(&repo, &setup, &runtime);
    for (account, id) in [("other", c.id.as_str()), ("a", "missing")] {
        let error = runtime
            .block_on(core.test_connection(&identity(account), id))
            .unwrap_err();
        assert_eq!(error.code, "CONNECTION_NOT_FOUND");
        assert!(error.evidence.is_none());
    }
    assert_eq!(
        core.setup
            .test_checked("proj_dev", Some("a"), &c.id, &|| false)
            .unwrap_err(),
        appcall_setup::Error::Cancelled
    );
    let (mut c, revision) = repo.get_connection("proj_dev", Some("a"), &c.id).unwrap();
    c.status = Status::Authorizing;
    repo.replace_connection("proj_dev", Some("a"), revision, c.clone(), None)
        .unwrap();
    let error = runtime
        .block_on(core.test_connection(&identity("a"), &c.id))
        .unwrap_err();
    assert_eq!(error.code, "CONNECTION_CHANGED");
    assert!(error.evidence.is_none());
    assert_eq!(
        repo.get_connection("proj_dev", Some("a"), &c.id)
            .unwrap()
            .0
            .status,
        Status::Authorizing
    );
}
