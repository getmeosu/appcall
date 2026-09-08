//! Browser identity boundary. Secrets intentionally do not implement Debug.
mod session;
pub use session::*;
mod broker;
mod identity;
pub use broker::*;
pub use identity::*;
mod http;
pub use http::*;
mod routes;
pub use routes::{canonical_browser_path, legacy_browser_location};
mod admin;
mod dashboard;
mod dashboard_failure;
pub use dashboard_failure::*;
mod connections;
mod connector;
#[cfg(test)]
#[path = "connector/tests.rs"]
mod connector_tests;
mod logs;
mod overview;
mod pages;
mod shell;
mod trace;
pub use dashboard::*;

mod refresh;
mod sse;
pub use sse::render_event_patch;
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
