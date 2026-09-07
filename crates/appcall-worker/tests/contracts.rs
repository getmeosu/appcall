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
