use crate::{ActionError, Result};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
#[derive(Default)]
struct State {
    generation: u64,
    failures: u32,
    open_until: Option<Instant>,
    probe: bool,
}
#[derive(Clone)]
pub struct Circuit {
    states: Arc<Mutex<HashMap<String, State>>>,
    threshold: u32,
    cooldown: Duration,
}
impl Default for Circuit {
    fn default() -> Self {
        Self::new(5, Duration::from_secs(60))
    }
}
impl Circuit {
    pub fn new(threshold: u32, cooldown: Duration) -> Self {
        Self {
            states: Arc::new(Mutex::new(HashMap::new())),
            threshold: threshold.max(1),
            cooldown,
        }
    }
    pub fn admit(&self, key: String) -> Result<Admission> {
        let mut states = self
            .states
            .lock()
            .map_err(|_| ActionError::new("CIRCUIT_OPEN"))?;
        let state = states.entry(key.clone()).or_default();
        if state.probe || state.open_until.is_some_and(|until| Instant::now() < until) {
            return Err(ActionError::new("CIRCUIT_OPEN"));
        };
        let probe = state.open_until.is_some();
        if probe {
            state.probe = true
        };
        Ok(Admission {
            circuit: self.clone(),
            key,
            generation: state.generation,
            probe,
            resolved: false,
        })
    }
}
pub struct Admission {
    circuit: Circuit,
    key: String,
    generation: u64,
    probe: bool,
    resolved: bool,
}
impl Admission {
    pub fn resolve(mut self, transient_failure: bool) {
        if let Ok(mut states) = self.circuit.states.lock() {
            if let Some(state) = states.get_mut(&self.key) {
                if state.generation == self.generation {
                    state.probe = false;
                    if transient_failure {
                        state.failures = state.failures.saturating_add(1);
                        if state.failures >= self.circuit.threshold {
                            state.open_until = Some(Instant::now() + self.circuit.cooldown);
                            state.generation = state.generation.wrapping_add(1)
                        }
                    } else {
                        state.failures = 0;
                        state.open_until = None;
                        state.generation = state.generation.wrapping_add(1)
                    }
                }
            }
        }
        self.resolved = true;
    }
}
impl Drop for Admission {
    fn drop(&mut self) {
        if !self.resolved && self.probe {
            if let Ok(mut states) = self.circuit.states.lock() {
                if let Some(state) = states.get_mut(&self.key) {
                    if state.generation == self.generation {
                        state.probe = false
                    }
                }
            }
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn stale_closed_admission_cannot_release_new_probe() {
        let c = Circuit::new(1, Duration::ZERO);
        let stale = c.admit("k".into()).unwrap();
        c.admit("k".into()).unwrap().resolve(true);
        let probe = c.admit("k".into()).unwrap();
        drop(stale);
        assert!(c.admit("k".into()).is_err());
        drop(probe);
        assert!(c.admit("k".into()).is_ok());
    }
}
