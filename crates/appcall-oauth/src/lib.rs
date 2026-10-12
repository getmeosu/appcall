//! Managed connector OAuth; callers schedule synchronous work on a bounded executor.
mod state;
mod types;
pub use state::*;
pub use types::*;
mod http;
pub use http::*;
mod setup_fields;
pub use setup_fields::{merge_health_fields, validate_setup_fields, PROVIDER_METADATA_KEYS};
mod lifecycle;
pub use lifecycle::Lifecycle;
mod authorization;
pub use authorization::StartResult;
