//! Startup-only synthetic qualification fixtures. Never production adapters.
use super::*;
#[path = "scenario.rs"]
mod scenario;
pub use scenario::*;
#[path = "data.rs"]
mod data;
pub use data::*;
#[path = "broker.rs"]
mod broker;
pub use broker::*;
/// Exact synthetic write targets. GET routes still use the real router.
pub fn allowed(method: &str, path: &str) -> bool {
    method == "GET"
        || method == "POST"
            && matches!(
                path,
                "/app/toolkits/connector-0/setup"
                    | "/app/toolkits/connector-0/test"
                    | "/app/toolkits/connector-3/test"
                    | "/app/auth-configs/preview_connection/test"
                    | "/app/auth-configs/preview_connection/disconnect"
                    | "/app/logs/preview_original/replay"
                    | "/app/triggers/preview_event/replay"
                    | "/app/toolkits/request"
                    | "/app/login"
                    | "/app/login/mfa"
                    | "/app/signup"
                    | "/app/otp"
                    | "/app/otp/verify"
                    | "/app/forgot-password"
                    | "/app/magic-link"
                    | "/app/settings/account/mfa/setup"
            )
}

#[cfg(test)]
#[path = "copy_tests.rs"]
mod copy_tests;
