use crate::{
    ActionDispatchOutcome, ActionError, ActionFailureEvidence, ActionFailureOrigin, RunnerFailure,
};
use std::sync::Mutex;

/// Owned outside the timed dispatch future, so cancellation retains evidence.
/// No lock spans an await, and marking the durable fence is deliberately absent.
pub(crate) struct DispatchEvidence(Mutex<ActionFailureEvidence>);
impl DispatchEvidence {
    pub(crate) fn new() -> Self {
        Self(Mutex::new(ActionFailureEvidence {
            outcome: ActionDispatchOutcome::NotDispatched,
            ..Default::default()
        }))
    }
    pub(crate) fn begin_attempt(&self) -> ActionDispatchOutcome {
        let mut state = self.0.lock().unwrap_or_else(|e| e.into_inner());
        let prior = state.outcome;
        state.outcome = ActionDispatchOutcome::Unknown;
        state.origin = ActionFailureOrigin::Runner;
        // An earlier hint must not describe the new, still in-flight attempt.
        state.retry_after_seconds = None;
        prior
    }
    pub(crate) fn finish_attempt(
        &self,
        prior: ActionDispatchOutcome,
        failure: Option<&RunnerFailure>,
    ) {
        let mut state = self.0.lock().unwrap_or_else(|e| e.into_inner());
        let current = failure.map_or(ActionDispatchOutcome::ResponseReceived, |f| f.outcome);
        state.outcome = combine(prior, current);
        state.retry_after_seconds = failure.and_then(|f| f.retry_after_seconds);
    }
    pub(crate) fn local_error(&self, error: &ActionError) {
        let mut state = self.0.lock().unwrap_or_else(|e| e.into_inner());
        // Only before any runner entry can a local origin describe this failure.
        if state.origin != ActionFailureOrigin::Runner {
            state.origin = error.evidence.origin;
        }
    }
    pub(crate) fn attach(&self, mut error: ActionError) -> ActionError {
        let state = self.0.lock().unwrap_or_else(|e| e.into_inner());
        error.evidence = Box::new(state.clone());
        error
    }
}
fn combine(prior: ActionDispatchOutcome, current: ActionDispatchOutcome) -> ActionDispatchOutcome {
    use ActionDispatchOutcome::*;
    match (prior, current) {
        (Unknown, _) | (_, Unknown) => Unknown,
        (ResponseReceived, _) | (_, ResponseReceived) => ResponseReceived,
        (NotDispatched, NotDispatched) => NotDispatched,
    }
}
