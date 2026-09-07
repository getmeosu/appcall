//! Production worker host. No embedded runtime is created by the library.
mod generation;
use appcall_worker::{LifecycleCredentials, Worker};
use std::{
    sync::{
        atomic::{AtomicU8, Ordering},
        Arc,
    },
    time::Duration,
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    sync::watch,
};
type LiveWorker = Worker<LifecycleCredentials>;
fn log(event: &str, ok: bool) {
    println!(
        "{}",
        serde_json::json!({"level":if ok{"info"}else{"error"},"event":event})
    );
}
fn main() {
    let status = run();
    if status.is_err() {
        log("worker_failed", false);
        std::process::exit(1)
    }
}
fn integer(name: &str, default: usize, max: usize) -> Result<usize, Box<dyn std::error::Error>> {
    let n = match std::env::var(name) {
        Ok(v) if !v.is_empty() => v.parse()?,
        _ => default,
    };
    if n == 0 || n > max {
        return Err("invalid worker limit".into());
    }
    Ok(n)
}
fn run() -> Result<(), Box<dyn std::error::Error>> {
    let cfg = appcall_runtime::Config::from_env()?;
    cfg.migrate()?;
    let jobs = integer("APPCALL_WORKER_MAX_JOBS", 10, 100)?;
    let interval =
        Duration::from_millis(integer("APPCALL_WORKER_INTERVAL_MS", 1000, 60000)? as u64);
    let oneshot = std::env::var("APPCALL_WORKER_MAX_JOBS").is_ok_and(|v| !v.is_empty());
    let worker_id = std::env::var("APPCALL_WORKER_ID")
        .unwrap_or_else(|_| format!("worker_{}", std::process::id()));
    if worker_id.is_empty() || worker_id.len() > 256 {
        return Err("invalid worker id".into());
    }
    let runner = cfg.runner()?;
    let (host, reaper) = generation::Host::new(&cfg, jobs)?;
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(2)
        .max_blocking_threads(8)
        .enable_all()
        .build()?;
    let result=runtime.block_on(async {
  let described=runner.describe(&appcall_runner_client::RequestContext::default()).await.map_err(|_|"runner unavailable")?;
  if ["absolute-deadline","bounded-rpc","cancellation"].iter().any(|cap|!described.durable_capabilities.iter().any(|v|v==cap)){return Err("runner durable capabilities unavailable");}
  if oneshot {let generation=host.current();let worker=&generation.worker;let cycle=worker.tick(&worker_id);tokio::pin!(cycle);
   tokio::select!{r=&mut cycle=>{let r=r.map_err(|_|"worker cycle failed")?;if r.outbox_failed>0||!r.job_failures.is_empty(){return Err("worker cycle failed")}},_ = shutdown_signal()=>{worker.request_shutdown();tokio::time::timeout(Duration::from_secs(65),&mut cycle).await.map_err(|_|"worker drain timed out")?.map_err(|_|"worker cycle failed")?;},_ = tokio::time::sleep(Duration::from_secs(30))=>{worker.request_shutdown();let _=tokio::time::timeout(Duration::from_secs(65),&mut cycle).await;return Err("worker cycle timed out")}}
   log("worker_cycle_completed",true);return Ok(())
  }
  daemon(host.clone(),worker_id,interval).await
 });
    host.stop();
    drop(host);
    let retired = reaper.join();
    runtime.shutdown_timeout(Duration::from_secs(1));
    if !retired {
        return Err("worker retirement timed out".into());
    }
    result.map_err(Into::into)
}
async fn shutdown_signal() {
    #[cfg(unix)]
    {
        let mut signal = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("signal handler");
        tokio::select! {_ = signal.recv()=>{},_ = tokio::signal::ctrl_c()=>{}}
    }
    #[cfg(not(unix))]
    {
        let _ = tokio::signal::ctrl_c().await;
    }
}
async fn daemon(
    host: Arc<generation::Host>,
    id: String,
    interval: Duration,
) -> Result<(), &'static str> {
    let addr = std::env::var("APPCALL_WORKER_HTTP_ADDR").unwrap_or_else(|_| "0.0.0.0:5082".into());
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .map_err(|_| "worker health bind failed")?;
    let ready = host.ready.clone();
    let (stop, receiver) = watch::channel(false);
    let (health_stop, health_receiver) = watch::channel(false);
    let health = tokio::spawn(health(listener, ready.clone(), health_receiver));
    let monitor = tokio::spawn(host.clone().monitor(receiver.clone()));
    let jobs_host = host.clone();
    let mut jobs_stop = receiver.clone();
    let jobs = tokio::spawn(async move {
        loop {
            if *jobs_stop.borrow() {
                break;
            }
            let generation = jobs_host.current();
            let result = generation.worker.tick_jobs(&id).await;
            match &result {
                Ok(report) => println!(
                    "{}",
                    serde_json::json!({"level":if report.job_failures.is_empty(){"info"}else{"error"},"event":"worker_sync_cycle","jobs_processed":report.pages_completed,"jobs_failed":report.job_failures.len()})
                ),
                Err(_) => log("worker_sync_cycle", false),
            }
            jobs_host.observe(&generation, 1, result.is_ok());
            tokio::select! {_ = jobs_stop.changed()=>break,_ = tokio::time::sleep(interval)=>{}}
        }
    });
    let events_host = host.clone();
    let mut events_stop = receiver;
    let events = tokio::spawn(async move {
        loop {
            if *events_stop.borrow() {
                break;
            }
            let generation = events_host.current();
            let result = generation.worker.dispatch_outbox().await;
            match &result {
                Ok(report) => println!(
                    "{}",
                    serde_json::json!({"level":if report.failed==0{"info"}else{"error"},"event":"worker_outbox_cycle","completed":report.completed,"failed":report.failed})
                ),
                Err(_) => log("worker_outbox_cycle", false),
            }
            events_host.observe(&generation, 2, result.is_ok());
            tokio::select! {_ = events_stop.changed()=>break,_ = tokio::time::sleep(interval)=>{}}
        }
    });
    log("worker_ready", true);
    shutdown_signal().await;
    ready.fetch_or(4, Ordering::SeqCst);
    host.stop();
    let _ = stop.send(true);
    tokio::time::timeout(Duration::from_secs(65), async {
        jobs.await.map_err(|_| "worker task failed")?;
        events.await.map_err(|_| "worker task failed")?;
        monitor.await.map_err(|_| "worker monitor task failed")?;
        let _ = health_stop.send(true);
        health.await.map_err(|_| "worker health task failed")?;
        Ok::<_, &str>(())
    })
    .await
    .map_err(|_| "worker drain timed out")??;
    log("worker_stopped", true);
    Ok(())
}
async fn health(
    listener: tokio::net::TcpListener,
    ready: Arc<AtomicU8>,
    mut stop: watch::Receiver<bool>,
) {
    let permits = Arc::new(tokio::sync::Semaphore::new(16));
    loop {
        tokio::select! {_ = stop.changed()=>break,accepted=listener.accept()=>{let Ok((mut socket,_))=accepted else{break};let Ok(permit)=permits.clone().try_acquire_owned()else{continue};let ready=ready.clone();tokio::spawn(async move{let _permit=permit;let _=tokio::time::timeout(Duration::from_secs(1),async{let mut bytes=[0;1024];let n=socket.read(&mut bytes).await?;let line=std::str::from_utf8(&bytes[..n]).unwrap_or("");let (status,body)=if line.starts_with("GET /healthz HTTP/"){("200 OK","ok")}else if line.starts_with("GET /readyz HTTP/"){if ready.load(Ordering::SeqCst)==3{("200 OK","ready")}else{("503 Service Unavailable","not ready")}}else{("404 Not Found","not found")};socket.write_all(format!("HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",body.len()).as_bytes()).await}).await;});}}
    }
}
