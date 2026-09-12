//! Startup-only synthetic qualification fixtures. Never production adapters.
use super::*;
#[path = "scenario.rs"]
mod scenario;
pub use scenario::*;
#[path = "data.rs"]
mod data;
pub use data::*;
#[path = "runs.rs"]
mod runs;
pub use runs::runs_fixture;
#[path = "history.rs"]
mod history;
pub use history::run_history_fixture;
#[path = "broker.rs"]
mod broker;
pub use broker::*;
#[path = "logs.rs"]
mod logs;
pub use logs::*;
/// Exact synthetic write targets. GET routes still use the real router.
pub fn allowed(method: &str, path: &str) -> bool {
    method == "GET"
        || method == "POST"
            && matches!(
                path,
                "/app/connectors/connector-0/setup"
                    | "/app/connectors/connector-0/test"
                    | "/app/connectors/connector-3/test"
                    | "/app/connections/preview_connection/test"
                    | "/app/connections/preview_connection/disconnect"
                    | "/app/logs/preview_original/replay"
                    | "/app/events/preview_event/replay"
                    | "/app/connectors/request"
                    | "/app/login"
                    | "/app/login/mfa"
                    | "/app/signup"
                    | "/app/otp"
                    | "/app/otp/verify"
                    | "/app/forgot-password"
                    | "/app/magic-link"
                    | "/app/settings/account/mfa/setup"
                    | "/app/action-claims/reconcile"
            )
}

#[cfg(test)]
#[path = "copy_tests.rs"]
mod copy_tests;

#[cfg(test)]
#[path = "logs_tests.rs"]
mod logs_tests;

#[cfg(test)]
#[path = "connections_tests.rs"]
mod connections_tests;
