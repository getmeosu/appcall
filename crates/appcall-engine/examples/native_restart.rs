//! Run with `cargo run -p appcall-engine --example native_restart -- /tmp/native-engine.db`.
use appcall_engine::*;
use std::{
    collections::HashMap,
    path::Path,
    sync::{Arc, Mutex},
};
#[derive(Clone, Default)]
struct Payloads(Arc<Mutex<HashMap<String, Vec<u8>>>>);
impl PayloadResolver for Payloads {
    fn resolve(&self, key: &PayloadRef) -> Result<Option<Vec<u8>>> {
        Ok(self
            .0
            .lock()
            .map_err(|_| Error::Unavailable)?
            .get(key.key())
            .cloned())
    }
}
impl Payloads {
    fn put(&self, key: &str, bytes: Vec<u8>) -> PayloadRef {
        self.0.lock().unwrap().insert(key.into(), bytes);
        // This demonstration host survives engine restart. A process-restart
        // host should instead use its own durable encrypted payload store.
        PayloadRef::durable(key).unwrap()
    }
}
fn workflow(c: &mut Context) -> WorkflowResult {
    let first = c.activity("uppercase", "v1", c.input().clone(), EffectPolicy::Read)?;
    c.timer(100)?;
    c.signal("continue")?;
    c.activity("length", "v1", first, EffectPolicy::Read)
}
fn register(e: &mut Engine, payloads: &Payloads) -> Result<()> {
    e.register_workflow("native", "v1", workflow)?;
    let store = payloads.clone();
    e.register_activity_fn("uppercase", "v1", move |_, bytes| {
        Ok(store.put("uppercase-result", bytes.to_ascii_uppercase()))
    })?;
    let store = payloads.clone();
    e.register_activity_fn("length", "v1", move |_, bytes| {
        Ok(store.put("length-result", bytes.len().to_string().into_bytes()))
    })
}
fn run(path: &Path) -> Result<()> {
    let payloads = Payloads::default();
    let input = payloads.put("input", b"hello".to_vec());
    let mut engine = Engine::open(path)?;
    register(&mut engine, &payloads)?;
    engine.start("demo", "native", "v1", input)?;
    if let DriveOutcome::Activity(a) = engine.drive("demo", 0)? {
        engine.execute_registered(&a, &payloads)?;
    }
    assert!(matches!(engine.drive("demo", 0)?, DriveOutcome::Waiting));
    drop(engine); // Shutdown pauses durable work. No cancellation is issued.
    let mut engine = Engine::open(path)?;
    register(&mut engine, &payloads)?;
    engine.signal("demo", "continue", PayloadRef::durable("signal-event")?)?;
    if let DriveOutcome::Activity(a) = engine.drive("demo", 100)? {
        engine.execute_registered(&a, &payloads)?;
    }
    let DriveOutcome::Completed(result) = engine.drive("demo", 100)? else {
        return Err(Error::Conflict);
    };
    assert_eq!(payloads.resolve(&result)?, Some(b"5".to_vec()));
    println!("Two native activities completed across restart; no repeated first effect.");
    Ok(())
}
fn main() -> std::result::Result<(), Box<dyn std::error::Error>> {
    let path = std::env::args()
        .nth(1)
        .ok_or("provide a fresh SQLite database path")?;
    run(Path::new(&path))?;
    Ok(())
}
