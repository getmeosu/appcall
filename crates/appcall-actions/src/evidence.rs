use crate::{
    ActionDispatchOutcome, ActionError, ActionFailureEvidence, ActionFailureOrigin, Admission,
    RunnerFailure,
};
use std::sync::Mutex;

/// Owned outside the timed dispatch future, so cancellation retains evidence.
/// No lock spans an await, and marking the durable fence is deliberately absent.
pub(crate) struct DispatchEvidence(Mutex<State>);
struct State {
    evidence: ActionFailureEvidence,
    admission: Option<Admission>,
    runner_entered: bool,
}
impl DispatchEvidence {
    pub(crate) fn new() -> Self {
        Self(Mutex::new(State {
            evidence: ActionFailureEvidence {
                outcome: ActionDispatchOutcome::NotDispatched,
                ..Default::default()
            },
            admission: None,
            runner_entered: false,
        }))
    }
    pub(crate) fn set_admission(&self, admission: Admission) {
        self.0.lock().unwrap_or_else(|e| e.into_inner()).admission = Some(admission);
    }
    pub(crate) fn begin_attempt(&self) -> ActionDispatchOutcome {
        let mut state = self.0.lock().unwrap_or_else(|e| e.into_inner());
        let prior = state.evidence.outcome;
        state.evidence.outcome = ActionDispatchOutcome::Unknown;
        state.evidence.origin = ActionFailureOrigin::Runner;
        state.runner_entered = true;
        // An earlier hint must not describe the new, still in-flight attempt.
        state.evidence.retry_after_seconds = None;
        prior
    }
    pub(crate) fn finish_attempt(
        &self,
        prior: ActionDispatchOutcome,
        failure: Option<&RunnerFailure>,
    ) {
        let mut state = self.0.lock().unwrap_or_else(|e| e.into_inner());
        let current = failure.map_or(ActionDispatchOutcome::ResponseReceived, |f| f.outcome);
        state.evidence.outcome = combine(prior, current);
        state.evidence.retry_after_seconds = failure.and_then(|f| f.retry_after_seconds);
    }
    pub(crate) fn outcome(&self) -> ActionDispatchOutcome {
        self.0
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .evidence
            .outcome
    }
    pub(crate) fn local_error(&self, error: &ActionError) {
        let mut state = self.0.lock().unwrap_or_else(|e| e.into_inner());
        // Only before any runner entry can a local origin describe this failure.
        if state.evidence.origin != ActionFailureOrigin::Runner {
            state.evidence.origin = error.evidence.origin;
        }
    }
    /// Resolve the circuit admission when a dispatch completes normally.
    pub(crate) fn resolve_admission(&self, transient_failure: bool) {
        let admission = self
            .0
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .admission
            .take();
        if let Some(admission) = admission {
            admission.resolve(transient_failure);
        }
    }
    /// A timed outer future may cancel `dispatch` before its normal finalizer
    /// runs. Count only deadlines after runner entry; preparation timeouts and
    /// caller-driven future cancellation must not trip the provider circuit.
    /// A retry backoff after explicit nondispatch evidence is also quiescent:
    /// it must release a half-open probe without adding another failure.
    pub(crate) fn resolve_deadline(&self) {
        let (admission, runner_entered, outcome) = {
            let mut state = self.0.lock().unwrap_or_else(|e| e.into_inner());
            (
                state.admission.take(),
                state.runner_entered,
                state.evidence.outcome,
            )
        };
        if let Some(admission) = admission {
            if runner_entered && outcome != ActionDispatchOutcome::NotDispatched {
                admission.resolve(true);
            }
            // A preparation timeout has no runner failure to report. Dropping
            // the unresolved admission only releases a half-open probe while
            // preserving the circuit's existing failure history.
        }
    }
    pub(crate) fn attach(&self, mut error: ActionError) -> ActionError {
        let state = self.0.lock().unwrap_or_else(|e| e.into_inner());
        error.evidence = Box::new(state.evidence.clone());
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
