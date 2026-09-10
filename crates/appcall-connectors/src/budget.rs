use serde::Deserialize;
use std::{sync::OnceLock, time::Duration};

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BudgetContract {
    pub max_operation_timeout_ms: u64,
    pub max_operation_input_bytes: usize,
    pub max_operation_response_bytes: usize,
    pub rpc_envelope_overhead_bytes: usize,
    pub connection_grace_ms: u64,
}

static CONTRACT: OnceLock<BudgetContract> = OnceLock::new();

pub fn contract() -> &'static BudgetContract {
    CONTRACT.get_or_init(|| {
        serde_json::from_str(include_str!("../../../runner/budget-contract.json"))
            .expect("runner budget contract must be valid")
    })
}

pub fn max_operation_timeout() -> Duration {
    Duration::from_millis(contract().max_operation_timeout_ms)
}

pub fn connection_timeout() -> Duration {
    Duration::from_millis(
        contract()
            .max_operation_timeout_ms
            .saturating_add(contract().connection_grace_ms),
    )
}

pub fn rpc_request_bytes() -> usize {
    contract()
        .max_operation_input_bytes
        .saturating_add(contract().rpc_envelope_overhead_bytes)
}

pub fn rpc_response_bytes() -> usize {
    contract()
        .max_operation_response_bytes
        .saturating_add(contract().rpc_envelope_overhead_bytes)
}

pub fn supports_operation(
    timeout_ms: u64,
    max_input_bytes: usize,
    max_response_bytes: usize,
) -> bool {
    timeout_ms > 0
        && timeout_ms <= contract().max_operation_timeout_ms
        && max_input_bytes > 0
        && max_input_bytes <= contract().max_operation_input_bytes
        && max_response_bytes > 0
        && max_response_bytes <= contract().max_operation_response_bytes
}

pub fn supports_manifest_operation(
    timeout_ms: i64,
    max_input_bytes: i64,
    max_response_bytes: i64,
) -> bool {
    let (Ok(timeout_ms), Ok(max_input_bytes), Ok(max_response_bytes)) = (
        u64::try_from(timeout_ms),
        usize::try_from(max_input_bytes),
        usize::try_from(max_response_bytes),
    ) else {
        return false;
    };
    supports_operation(timeout_ms, max_input_bytes, max_response_bytes)
}
