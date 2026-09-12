use appcall_worker::*;
#[test]
fn tick_limits_fail_closed() {
    assert_eq!(
        TickLimits { outbox: 0, jobs: 1 }.validate(),
        Err(Error::InvalidConfig)
    );
    assert_eq!(
        TickLimits {
            outbox: 1,
            jobs: 101
        }
        .validate(),
        Err(Error::InvalidConfig)
    );
    assert!(TickLimits {
        outbox: 1000,
        jobs: 100
    }
    .validate()
    .is_ok());
}
#[test]
fn job_identity_is_stable_and_project_scoped() {
    assert_eq!(sync_job_id("p", "webhook:e"), sync_job_id("p", "webhook:e"));
    assert_ne!(sync_job_id("p", "webhook:e"), sync_job_id("q", "webhook:e"));
    assert_ne!(
        sync_job_id("p", "webhook:e"),
        sync_job_id("p", "webhook-replay:e:1")
    );
}

#[test]
fn secret_cleanup_config_is_conservative_and_bounded() {
    assert!(SecretCleanupConfig::default().validate().is_ok());
    assert_eq!(SecretCleanupConfig::default().retention_days(), 7);
    assert_eq!(SecretCleanupConfig::default().batch, 100);
    assert_eq!(
        SecretCleanupConfig {
            retention: std::time::Duration::ZERO,
            batch: 100,
        }
        .validate(),
        Err(Error::InvalidConfig)
    );
    assert_eq!(
        SecretCleanupConfig {
            retention: std::time::Duration::from_secs(7 * 24 * 3600),
            batch: 1001,
        }
        .validate(),
        Err(Error::InvalidConfig)
    );
}
