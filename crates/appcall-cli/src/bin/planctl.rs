use appcall_cli::{options::flags, plan};
fn main() {
    match run() {
        Ok(()) => {}
        Err("help requested") => {
            eprintln!("Usage: planctl -project ID [-show | -audit | -plan PLAN [-status active] [-overrides JSON]]");
        }
        Err(e) => {
            eprintln!("planctl: {e}");
            std::process::exit(1)
        }
    }
}
fn run() -> Result<(), &'static str> {
    let flags = flags(
        std::env::args().skip(1),
        &["project", "plan", "status", "overrides"],
        &["show", "audit"],
    )?;
    let project = flags
        .get("project")
        .filter(|s| !s.trim().is_empty() && !s.chars().any(char::is_control))
        .ok_or("-project is required")?
        .clone();
    let url =
        std::env::var("APPCALL_DATABASE_URL").map_err(|_| "APPCALL_DATABASE_URL is not set")?;
    let (send, recv) = std::sync::mpsc::sync_channel(1);
    std::thread::spawn(move || {
        let result = (|| {
            let mut client = appcall_runtime::connect_database_url(
                &url,
                matches!(
                    std::env::var("APPCALL_ENV").as_deref(),
                    Ok("production" | "prod")
                ),
            )
            .map_err(|_| "connect failed")?;
            if flags.get("show").is_some_and(|s| s == "true") {
                return plan::inspect(&mut client, &project).map(|s| (s, None));
            }
            if flags.get("audit").is_some_and(|s| s == "true") {
                return plan::audit(&mut client, &project).map(|s| (format!("{s}\n"), None));
            }
            let overrides =
                serde_json::from_str(flags.get("overrides").map(String::as_str).unwrap_or("{}"))
                    .map_err(|_| "-overrides is not a JSON object")?;
            plan::assign(
                &mut client,
                &project,
                flags.get("plan").map(String::as_str).unwrap_or(""),
                flags.get("status").map(String::as_str).unwrap_or("active"),
                &overrides,
            )
        })();
        let _ = send.send(result);
    });
    let (output, warning) = recv
        .recv_timeout(std::time::Duration::from_secs(15))
        .map_err(|_| "operation deadline exceeded; inspect the plan and audit before retrying")??;
    if let Some(w) = warning {
        eprintln!("warning: {w}")
    };
    use std::io::Write;
    std::io::stdout()
        .write_all(output.as_bytes())
        .map_err(|_| "output failed")
}
