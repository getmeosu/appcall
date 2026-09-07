//! Infrastructure admission based only on the socket peer, before authentication.
//! A randomized hash maps every peer to one of 4096 fixed token buckets. Hash
//! collisions conservatively share capacity; caller-controlled headers cannot
//! create budgets or grow memory. No sweeper, timer task or per-peer allocation.
use std::{
    collections::{hash_map::RandomState, BTreeMap},
    hash::BuildHasher,
    net::IpAddr,
    sync::Mutex,
    time::Instant,
};
const BUCKETS: usize = 4096;
#[derive(Clone, Copy, Debug)]
pub struct RateConfig {
    rps: f64,
    burst: usize,
}
impl Default for RateConfig {
    fn default() -> Self {
        Self {
            rps: 50.,
            burst: 100,
        }
    }
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RateConfigError {
    InvalidRps,
    InvalidBurst,
}
impl std::fmt::Display for RateConfigError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            Self::InvalidRps => "APPCALL_RATE_LIMIT_RPS must be finite and nonnegative",
            Self::InvalidBurst => "APPCALL_RATE_LIMIT_BURST must be a nonnegative integer",
        })
    }
}
impl std::error::Error for RateConfigError {}
impl RateConfig {
    pub fn from_env() -> Result<Self, RateConfigError> {
        Self::from_map(&std::env::vars().collect())
    }
    pub fn from_map(env: &BTreeMap<String, String>) -> Result<Self, RateConfigError> {
        let raw = |key: &str| env.get(key).map(|s| s.trim()).filter(|s| !s.is_empty());
        let rps = raw("APPCALL_RATE_LIMIT_RPS")
            .map(|s| s.parse::<f64>().map_err(|_| RateConfigError::InvalidRps))
            .transpose()?
            .unwrap_or(0.);
        if !rps.is_finite() || rps < 0. {
            return Err(RateConfigError::InvalidRps);
        }
        // Go parses an int64 before converting to the platform int.
        let burst = raw("APPCALL_RATE_LIMIT_BURST")
            .map(|s| s.parse::<i64>().map_err(|_| RateConfigError::InvalidBurst))
            .transpose()?
            .unwrap_or(0);
        let burst = usize::try_from(burst).map_err(|_| RateConfigError::InvalidBurst)?;
        let defaults = Self::default();
        Ok(Self {
            rps: if rps == 0. { defaults.rps } else { rps },
            burst: if burst == 0 { defaults.burst } else { burst },
        })
    }
    pub fn requests_per_second(&self) -> f64 {
        self.rps
    }
    pub fn burst(&self) -> usize {
        self.burst
    }
}
struct Bucket {
    last: Option<Instant>,
    tokens: f64,
}
pub struct PeerLimiter {
    config: RateConfig,
    hash: RandomState,
    buckets: Box<[Mutex<Bucket>]>,
}
impl PeerLimiter {
    pub fn new(config: RateConfig) -> Self {
        let buckets = (0..BUCKETS)
            .map(|_| {
                Mutex::new(Bucket {
                    last: None,
                    tokens: config.burst() as f64,
                })
            })
            .collect::<Vec<_>>()
            .into_boxed_slice();
        Self {
            config,
            hash: RandomState::new(),
            buckets,
        }
    }
    pub fn allow(&self, peer: IpAddr, now: Instant) -> bool {
        let index = self.hash.hash_one(peer) as usize % BUCKETS;
        let Ok(mut bucket) = self.buckets[index].lock() else {
            return false;
        };
        if let Some(last) = bucket.last {
            // A stale timestamp never moves the clock backwards or mints credit.
            if let Some(elapsed) = now.checked_duration_since(last) {
                bucket.tokens = (bucket.tokens
                    + elapsed.as_secs_f64() * self.config.requests_per_second())
                .min(self.config.burst() as f64);
                bucket.last = Some(now);
            }
        } else {
            bucket.last = Some(now);
        }
        if bucket.tokens < 1. {
            return false;
        }
        bucket.tokens -= 1.;
        true
    }
}
