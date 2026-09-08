//! Browser identity boundary. Secrets intentionally do not implement Debug.
mod session;
pub use session::*;
mod broker;
mod identity;
pub use broker::*;
pub use identity::*;
mod http;
pub use http::*;
mod admin;
mod dashboard;
mod dashboard_failure;
pub use dashboard_failure::*;
mod logs;
mod pages;
mod shell;
mod toolkit;
#[cfg(test)]
#[path = "toolkit/tests.rs"]
mod toolkit_tests;
mod trace;
pub use dashboard::*;

mod refresh;
mod sse;
pub use sse::render_trigger_patch;
mod forms;
pub use forms::assemble_guided_input;

mod admin_ui;

mod branding;

mod development;
pub use development::DevelopmentDashboard;

mod remaining_pages;
#[cfg(test)]
mod remaining_tests;
pub mod ui;
