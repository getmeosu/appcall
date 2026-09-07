use crate::*;
/// An owned, single-use native call. The host may move this to its bounded
/// executor. Dropping it does not prove that a provider effect did not happen;
/// report an explicit failure or recover its durable attempt after restart.
pub struct NativeInvocation {
    pub(crate) attempt: ActivityAttempt,
    pub(crate) handler: crate::engine::Activity,
    pub(crate) bytes: Vec<u8>,
}
pub struct NativeResult {
    pub(crate) attempt: ActivityAttempt,
    pub(crate) outcome: std::result::Result<PayloadRef, ActivityFailure>,
}
impl NativeInvocation {
    pub fn attempt(&self) -> &ActivityAttempt {
        &self.attempt
    }
    pub fn run(self) -> NativeResult {
        let outcome = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            (self.handler)(&self.attempt, &self.bytes)
        }))
        .unwrap_or(Err(ActivityFailure::OutcomeUnknown));
        NativeResult {
            attempt: self.attempt,
            outcome,
        }
    }
}
