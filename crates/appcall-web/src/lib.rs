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
mod pages;
mod shell;
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
