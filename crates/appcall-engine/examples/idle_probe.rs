//! Reports same-process incremental RSS, including database initialization.
//! Uses OS `ps`; sleeps once and performs no engine polling during the interval.
use appcall_engine::*;
use std::{process::Command, time::Duration};
fn metric(field: &str) -> String {
    String::from_utf8(
        Command::new("ps")
            .args(["-o", field, "-p", &std::process::id().to_string()])
            .output()
            .unwrap()
            .stdout,
    )
    .unwrap()
    .trim()
    .into()
}
fn rss() -> u64 {
    metric("rss=").parse().unwrap()
}
fn cpu_micros() -> u64 {
    // SAFETY: getrusage initializes the correctly sized OS rusage object on
    // success; it is never read on an error return.
    let mut usage = std::mem::MaybeUninit::<libc::rusage>::uninit();
    assert_eq!(
        unsafe { libc::getrusage(libc::RUSAGE_SELF, usage.as_mut_ptr()) },
        0
    );
    let usage = unsafe { usage.assume_init() };
    let micros = |v: libc::timeval| (v.tv_sec as u64) * 1_000_000 + (v.tv_usec as u64);
    micros(usage.ru_utime) + micros(usage.ru_stime)
}
fn main() -> std::result::Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().collect();
    let path = args.get(1).ok_or("fresh database path required")?;
    let count: usize = args.get(2).map_or(Ok(0), |s| s.parse())?;
    let seconds: u64 = args.get(3).map_or(Ok(5), |s| s.parse())?;
    let baseline = rss();
    let control = args.get(4).is_some_and(|argument| argument == "baseline");
    let engine = if control {
        None
    } else {
        let mut e = Engine::open(path)?;
        e.register_workflow("parked", "v1", |c| c.signal("resume"))?;
        for i in 0..count {
            let id = format!("run-{i}");
            e.start(&id, "parked", "v1", PayloadRef::durable("opaque-input")?)?;
            assert!(matches!(e.drive(&id, 0)?, DriveOutcome::Waiting));
        }
        Some(e)
    };
    if let Some(e) = &engine {
        assert_eq!(e.next_wakeup()?, None);
        assert!(e.runnable(0, 256)?.is_empty());
    }
    let idle = rss();
    let before = cpu_micros();
    let started = std::time::Instant::now();
    std::thread::sleep(Duration::from_secs(seconds));
    let elapsed = started.elapsed().as_secs_f64();
    let cpu = cpu_micros().saturating_sub(before);
    let percent = (cpu as f64 / 1_000_000.0) / elapsed * 100.0;
    if let Some(e) = &engine {
        assert_eq!(e.next_wakeup()?, None);
        assert!(e.runnable(0, 256)?.is_empty());
    }
    println!(
        "{}",
        serde_json::json!({"runs":count,"baseline_rss_kib":baseline,"idle_rss_kib":idle,"incremental_rss_kib":idle.saturating_sub(baseline),"idle_seconds":seconds,"idle_cpu_millis":cpu/1000,"idle_cpu_micros":cpu,"cpu_percent_single_core":percent,"elapsed_seconds":elapsed,"engine_open":!control,"next_wakeup":null,"runnable":0,"target_kib":5120})
    );
    Ok(())
}
