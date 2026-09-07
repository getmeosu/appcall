//! Managed connector OAuth; callers schedule synchronous work on a bounded executor.
mod state;
mod types;
pub use state::*;
pub use types::*;
mod http;
pub use http::*;
mod lifecycle;
pub use lifecycle::Lifecycle;
mod authorization;
pub use authorization::StartResult;
