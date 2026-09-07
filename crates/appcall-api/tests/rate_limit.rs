use appcall_api::rate_limit::*;
use std::{
    collections::BTreeMap,
    net::{IpAddr, Ipv4Addr},
    time::{Duration, Instant},
};
fn config(rps: &str, burst: &str) -> Result<RateConfig, RateConfigError> {
    RateConfig::from_map(&BTreeMap::from([
        ("APPCALL_RATE_LIMIT_RPS".into(), rps.into()),
        ("APPCALL_RATE_LIMIT_BURST".into(), burst.into()),
    ]))
}
#[test]
fn environment_defaults_fractional_rate_and_validation() {
    assert_eq!(config("0", "0").unwrap().requests_per_second(), 50.);
    assert_eq!(config(" ", "").unwrap().burst(), 100);
    let c = config(" 2.5 ", "3").unwrap();
    assert_eq!(c.requests_per_second(), 2.5);
    assert_eq!(c.burst(), 3);
    for bad in ["NaN", "inf", "-1", "secret", "1e999"] {
        assert_eq!(config(bad, "1").unwrap_err(), RateConfigError::InvalidRps);
    }
    for bad in ["-1", "1.5", "NaN", "secret", "18446744073709551616"] {
        assert_eq!(config("1", bad).unwrap_err(), RateConfigError::InvalidBurst);
    }
    let _from_env: fn() -> Result<RateConfig, RateConfigError> = RateConfig::from_env;
}
#[test]
fn burst_refill_and_backwards_clock_are_conservative() {
    let limiter = PeerLimiter::new(config("2.5", "2").unwrap());
    let peer = "127.0.0.1".parse().unwrap();
    let now = Instant::now();
    assert!(limiter.allow(peer, now));
    assert!(limiter.allow(peer, now));
    assert!(!limiter.allow(peer, now));
    assert!(!limiter.allow(peer, now + Duration::from_millis(399)));
    assert!(limiter.allow(peer, now + Duration::from_millis(400)));
    assert!(!limiter.allow(peer, now));
    assert!(!limiter.allow(peer, now + Duration::from_millis(400)));
    assert!(limiter.allow(peer, now + Duration::from_secs(100)));
    assert!(limiter.allow(peer, now + Duration::from_secs(100)));
    assert!(!limiter.allow(peer, now + Duration::from_secs(100)));
}
#[test]
fn peer_budgets_are_isolated_but_collisions_share_fixed_capacity() {
    let limiter = PeerLimiter::new(config("1", "1").unwrap());
    let now = Instant::now();
    let mut allowed = 0;
    for n in 0..100_000u32 {
        let peer = IpAddr::V4(Ipv4Addr::from(n));
        if limiter.allow(peer, now) {
            allowed += 1;
        }
        assert!(!limiter.allow(peer, now));
    }
    assert!(allowed > 1000, "not a global budget");
    assert!(allowed <= 4096, "peer fanout must not allocate new budgets");
}
#[test]
fn concurrent_requests_cannot_overspend_one_bucket() {
    let limiter = std::sync::Arc::new(PeerLimiter::new(config("1", "7").unwrap()));
    let now = Instant::now();
    let handles = (0..32)
        .map(|_| {
            let limiter = limiter.clone();
            std::thread::spawn(move || usize::from(limiter.allow("::1".parse().unwrap(), now)))
        })
        .collect::<Vec<_>>();
    assert_eq!(
        handles
            .into_iter()
            .map(|h| h.join().unwrap())
            .sum::<usize>(),
        7
    );
}
