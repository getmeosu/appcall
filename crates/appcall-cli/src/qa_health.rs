use crate::qa::*;
use appcall_connectors::{OperationKind, Registry};
use chrono::{DateTime, Utc};
use std::{
    collections::{BTreeMap, BTreeSet},
    time::Duration,
};
pub fn assess(
    reg: &Registry,
    reports: &[ConnectorReport],
    filter: &str,
    now: DateTime<Utc>,
    max_age: Duration,
) -> Result<Vec<ConnectorHealth>, &'static str> {
    if max_age.is_zero() {
        return Err("max age must be positive");
    }
    if !filter.is_empty() {
        reg.connector(filter).map_err(|_| "unknown connector")?;
    }
    let mut by_key = BTreeMap::new();
    for r in reports {
        reg.connector(&r.connector)
            .map_err(|_| "unknown report connector")?;
        if by_key.insert(&r.connector, r).is_some() {
            return Err("duplicate report connector");
        }
    }
    Ok(reg
        .list()
        .filter(|c| filter.is_empty() || c.manifest().key == filter)
        .map(|c| {
            let r = by_key.get(&c.manifest().key).copied();
            let time = r.and_then(|r| r.last_run_at).filter(|t| {
                *t != "0001-01-01T00:00:00Z"
                    .parse::<DateTime<Utc>>()
                    .expect("constant date")
            });
            let fresh =
                time.is_some_and(|t| t <= now && (now - t).to_std().is_ok_and(|a| a <= max_age));
            let current = r.is_some_and(|r| r.manifest_digest == c.manifest_digest()) && fresh;
            let actions = &c.manifest().operations;
            let total = actions
                .values()
                .filter(|o| o.kind == OperationKind::Action)
                .count();
            let passed = r
                .filter(|_| current)
                .map(|r| {
                    r.operations
                        .iter()
                        .filter(|o| {
                            o.status == "pass"
                                && o.scenarios
                                    .iter()
                                    .any(|s| s.status == "pass" && s.probe_passed)
                                && actions.get(&o.operation).is_some_and(|a| {
                                    a.kind == OperationKind::Action && a.is_read_only()
                                })
                        })
                        .map(|o| &o.operation)
                        .collect::<BTreeSet<_>>()
                        .len()
                })
                .unwrap_or(0);
            let (state, reason) = match r {
                None => ("unverified", "no probe report"),
                Some(_) if time.is_none() || time.is_some_and(|t| t > now) => {
                    ("unverified", "missing or invalid probe timestamp")
                }
                Some(_) if !fresh => ("stale", "probe evidence exceeded maximum age"),
                Some(r)
                    if r.overall == "red"
                        || r.failed > 0
                        || r.operations
                            .iter()
                            .any(|o| o.status == "fail" || !o.leak_warnings.is_empty()) =>
                {
                    (
                        "failing",
                        "probe execution, response contract, or cleanup failed",
                    )
                }
                Some(r) if r.manifest_digest.is_empty() => {
                    ("unverified", "missing manifest fingerprint; re-run probes")
                }
                Some(r) if r.manifest_digest != c.manifest_digest() => {
                    ("unverified", "manifest changed since probe; re-run probes")
                }
                Some(_) if passed == 0 => (
                    "unverified",
                    "no operation passed; check scenarios and QA credentials",
                ),
                _ => (
                    "healthy",
                    "recent probes passed; coverage is limited to tested operations",
                ),
            };
            ConnectorHealth {
                connector: c.manifest().key.clone(),
                state: state.into(),
                last_run_at: time,
                passed_operations: passed,
                uncertified_operations: total - passed,
                reason: reason.into(),
            }
        })
        .collect())
}
