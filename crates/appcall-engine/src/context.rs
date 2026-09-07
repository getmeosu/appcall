use crate::*;
#[derive(Debug)]
pub enum WorkflowError {
    Blocked,
    Nondeterminism,
    Invalid,
}
pub type WorkflowResult = std::result::Result<PayloadRef, WorkflowError>;
/// Workflow code runs again from its entry point for each drive. Only context
/// commands may produce effects, observe time, or consume external information.
pub struct Context {
    pub(crate) input: PayloadRef,
    pub(crate) history: Vec<HistoryEvent>,
    pub(crate) cursor: usize,
    pub(crate) pending: Option<Command>,
    pub(crate) blocked: bool,
    pub(crate) faulted: bool,
}
impl Context {
    pub fn input(&self) -> &PayloadRef {
        &self.input
    }
    fn command(&mut self, command: Command) -> std::result::Result<CommandValue, WorkflowError> {
        if self.blocked || self.faulted {
            self.faulted = true;
            return Err(WorkflowError::Nondeterminism);
        }
        if let Some(event) = self.history.get(self.cursor) {
            if event.command != command {
                self.faulted = true;
                return Err(WorkflowError::Nondeterminism);
            }
            self.cursor += 1;
            self.blocked = event.value.is_none();
            event.value.clone().ok_or(WorkflowError::Blocked)
        } else {
            self.pending = Some(command);
            self.blocked = true;
            Err(WorkflowError::Blocked)
        }
    }
    pub fn activity(
        &mut self,
        name: &str,
        version: &str,
        input: PayloadRef,
        policy: EffectPolicy,
    ) -> WorkflowResult {
        match self.command(Command::Activity {
            name: name.into(),
            version: version.into(),
            input,
            policy,
            detached_wait: false,
        })? {
            CommandValue::Payload(p) => Ok(p),
            _ => Err(WorkflowError::Nondeterminism),
        }
    }
    pub fn spawn_activity(
        &mut self,
        name: &str,
        version: &str,
        input: PayloadRef,
        policy: EffectPolicy,
    ) -> std::result::Result<ActivityHandle, WorkflowError> {
        match self.command(Command::Activity {
            name: name.into(),
            version: version.into(),
            input,
            policy,
            detached_wait: true,
        })? {
            CommandValue::Activity(p) => Ok(p),
            _ => Err(WorkflowError::Nondeterminism),
        }
    }
    pub fn timer(&mut self, deadline_ms: i64) -> std::result::Result<(), WorkflowError> {
        match self.command(Command::Timer(deadline_ms))? {
            CommandValue::Unit => Ok(()),
            _ => Err(WorkflowError::Nondeterminism),
        }
    }
    pub fn signal(&mut self, name: &str) -> WorkflowResult {
        match self.command(Command::Signal(name.into()))? {
            CommandValue::Payload(p) => Ok(p),
            _ => Err(WorkflowError::Nondeterminism),
        }
    }
    pub fn child(
        &mut self,
        name: &str,
        version: &str,
        input: PayloadRef,
    ) -> std::result::Result<ChildHandle, WorkflowError> {
        match self.command(Command::Child {
            name: name.into(),
            version: version.into(),
            input,
        })? {
            CommandValue::Child(p) => Ok(p),
            _ => Err(WorkflowError::Nondeterminism),
        }
    }
    pub fn select(
        &mut self,
        sources: Vec<WaitSource>,
    ) -> std::result::Result<Selection, WorkflowError> {
        if sources.is_empty() || sources.len() > 64 {
            self.faulted = true;
            return Err(WorkflowError::Invalid);
        }
        match self.command(Command::Select(sources))? {
            CommandValue::Selected(p) => Ok(p),
            _ => Err(WorkflowError::Nondeterminism),
        }
    }
    pub fn join_child(&mut self, child: ChildHandle) -> WorkflowResult {
        self.select(vec![WaitSource::Child(child)])?
            .value
            .ok_or(WorkflowError::Nondeterminism)
    }
    pub fn join_activity(&mut self, activity: ActivityHandle) -> WorkflowResult {
        self.select(vec![WaitSource::Activity(activity)])?
            .value
            .ok_or(WorkflowError::Nondeterminism)
    }
}
