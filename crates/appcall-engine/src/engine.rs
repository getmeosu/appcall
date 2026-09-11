use crate::*;
use std::{
    collections::{HashMap, HashSet},
    panic::{catch_unwind, AssertUnwindSafe},
    path::Path,
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};
type Workflow = Arc<dyn Fn(&mut Context) -> WorkflowResult + Send + Sync>;
pub(crate) type Activity = Arc<
    dyn Fn(&ActivityAttempt, &[u8]) -> std::result::Result<PayloadRef, ActivityFailure>
        + Send
        + Sync,
>;
/// No threads, runtime, sockets or polling. The host owns execution and wakeups.
pub struct Engine<S: Store = SqliteStore> {
    store: S,
    workflows: HashMap<(String, String), Workflow>,
    activities: HashMap<(String, String), Option<Activity>>,
    dispatch_limit: usize,
    retry_policy: RetryPolicy,
    dispatched: HashMap<(String, u64, u64), ActivityAttempt>,
    parked: HashSet<String>,
}
impl Engine<SqliteStore> {
    pub fn open(path: impl AsRef<Path>) -> Result<Self> {
        Ok(Self::with_store(SqliteStore::open(path)?))
    }
}
impl<S: Store> Engine<S> {
    pub fn with_store(store: S) -> Self {
        Self {
            store,
            workflows: HashMap::new(),
            activities: HashMap::new(),
            dispatch_limit: 8,
            retry_policy: RetryPolicy::default(),
            dispatched: HashMap::new(),
            parked: HashSet::new(),
        }
    }
    /// Maximum simultaneous dispatched attempts (1..=256); executor threads are host-owned.
    pub fn set_dispatch_limit(&mut self, limit: usize) -> Result<()> {
        if limit == 0 || limit > 256 || limit < self.dispatched.len() {
            return Err(Error::Limit);
        }
        self.dispatch_limit = limit;
        Ok(())
    }
    /// Configure bounded native retries for attempts that have not failed yet.
    /// The effective policy is copied into each attempt before dispatch so a
    /// retry keeps the same budget after the engine is restarted.
    pub fn set_retry_policy(&mut self, policy: RetryPolicy) -> Result<()> {
        policy.validate()?;
        self.retry_policy = policy;
        Ok(())
    }
    fn release_dispatch(&mut self, attempt: &ActivityAttempt) -> Result<()> {
        if self.dispatched.get(&dispatch_key(attempt)) != Some(attempt) {
            return Ok(());
        }
        let parked: Vec<_> = self.parked.iter().cloned().collect();
        for id in parked {
            let mut run = self.store.load(&id)?;
            if run.state == RunState::Running {
                run.wakeup = Some(0);
                self.save(&mut run, &[])?;
            }
            self.parked.remove(&id);
        }
        self.dispatched.remove(&dispatch_key(attempt));
        Ok(())
    }
    pub fn register_workflow(
        &mut self,
        name: &str,
        version: &str,
        workflow: impl Fn(&mut Context) -> WorkflowResult + Send + Sync + 'static,
    ) -> Result<()> {
        validate(name)?;
        validate(version)?;
        if self.workflows.len() >= 256
            || self.workflows.contains_key(&(name.into(), version.into()))
        {
            return Err(Error::Conflict);
        }
        self.workflows
            .insert((name.into(), version.into()), Arc::new(workflow));
        Ok(())
    }
    /// Registers an activity dispatched to a host executor via DriveOutcome.
    pub fn register_activity(&mut self, name: &str, version: &str) -> Result<()> {
        self.add_activity(name, version, None)
    }
    pub fn register_activity_fn(
        &mut self,
        name: &str,
        version: &str,
        activity: impl Fn(&ActivityAttempt, &[u8]) -> std::result::Result<PayloadRef, ActivityFailure>
            + Send
            + Sync
            + 'static,
    ) -> Result<()> {
        self.add_activity(name, version, Some(Arc::new(activity)))
    }
    fn add_activity(
        &mut self,
        name: &str,
        version: &str,
        activity: Option<Activity>,
    ) -> Result<()> {
        validate(name)?;
        validate(version)?;
        if self.activities.len() >= 256
            || self.activities.contains_key(&(name.into(), version.into()))
        {
            return Err(Error::Conflict);
        }
        self.activities
            .insert((name.into(), version.into()), activity);
        Ok(())
    }
    pub fn start(&mut self, id: &str, name: &str, version: &str, input: PayloadRef) -> Result<()> {
        self.store.insert(&new_run(id, name, version, input)?)
    }
    pub fn status(&self, id: &str) -> Result<RunState> {
        Ok(self.store.load(id)?.state)
    }
    pub fn failure_reason(&self, id: &str) -> Result<Option<RunFailure>> {
        Ok(self.store.load(id)?.failure_reason)
    }
    pub fn has_native_activity(&self, name: &str, version: &str) -> bool {
        self.activities
            .get(&(name.into(), version.into()))
            .is_some_and(Option::is_some)
    }
    /// Persist a safe per-run diagnostic without failing the host service.
    pub fn reject_run(&mut self, id: &str, reason: RunFailure) -> Result<()> {
        let mut run = self.store.load(id)?;
        ensure_active(&run)?;
        run.state = failure_state(reason);
        run.failure_reason = Some(reason);
        run.wakeup = None;
        self.save(&mut run, &[])
    }
    fn reject_malformed_run(&mut self, id: &str) -> Result<()> {
        self.reject_run(id, RunFailure::InvalidCommand)?;
        let run = self.store.load(id)?;
        let attempts: Vec<_> = self
            .dispatched
            .values()
            .filter(|attempt| {
                attempt.run_id == id
                    && run.tasks.iter().any(|task| {
                        task.attempt == **attempt && matches!(task.state, TaskState::InFlight)
                    })
            })
            .cloned()
            .collect();
        for attempt in attempts {
            self.release_dispatch(&attempt)?;
        }
        Ok(())
    }
    /// Reject an attempt before native invocation began. Invoking work cannot
    /// be classified as unexecuted or release its capacity through this API.
    pub fn reject_dispatch(&mut self, attempt: &ActivityAttempt, reason: RunFailure) -> Result<()> {
        let mut run = self.store.load(&attempt.run_id)?;
        ensure_active(&run)?;
        let task = owned_task(&mut run, attempt, self.store.owner_epoch())?;
        if !matches!(task.state, TaskState::InFlight) {
            return Err(Error::Conflict);
        }
        task.state = TaskState::Ready;
        run.state = failure_state(reason);
        run.failure_reason = Some(reason);
        run.wakeup = None;
        self.save(&mut run, &[])?;
        self.release_dispatch(attempt)
    }
    pub fn history(&self, id: &str) -> Result<Vec<HistoryEvent>> {
        Ok(self.store.load(id)?.history)
    }
    pub fn next_wakeup(&self) -> Result<Option<i64>> {
        self.store.next_wakeup()
    }
    pub fn runnable(&self, now_ms: i64, limit: usize) -> Result<Vec<String>> {
        self.store.runnable(now_ms, limit)
    }
    /// Requeue one persisted run for a bounded recheck.
    ///
    /// This operation never changes the serialized command history or effect
    /// fences. A restarted in-flight attempt is recovered according to its
    /// effect policy before the run is requeued. In particular, an unknown
    /// outcome must be reconciled explicitly before any further execution can
    /// be scheduled.
    pub fn resume(&mut self, id: &str) -> Result<()> {
        let mut run = self.store.load(id)?;
        match run.state {
            RunState::NeedsInput | RunState::NeedsImplementation => {
                run.state = RunState::Running;
                run.wakeup = Some(0);
                self.save(&mut run, &[])
            }
            RunState::Running => {
                self.recover(&mut run)?;
                if run.state != RunState::Running {
                    return Err(Error::Conflict);
                }
                Ok(())
            }
            _ => Err(Error::Conflict),
        }
    }
    fn save(&mut self, run: &mut RunRecord, children: &[RunRecord]) -> Result<()> {
        let old = run.revision;
        run.revision = old.checked_add(1).ok_or(Error::Limit)?;
        self.store.commit(old, run, children)
    }
    pub fn signal(&mut self, id: &str, name: &str, value: PayloadRef) -> Result<()> {
        validate(name)?;
        let mut r = self.store.load(id)?;
        ensure_active(&r)?;
        if r.signals.len() >= 256 {
            return Err(Error::Limit);
        }
        r.signals.push(SignalEvent {
            name: name.into(),
            value,
            consumed: false,
        });
        r.wakeup = Some(0);
        self.save(&mut r, &[])
    }
    /// Cancellation is durable before walking attached children. Repeated calls
    /// finish an interrupted walk; completions are fenced as soon as requested.
    pub fn cancel(&mut self, id: &str) -> Result<()> {
        let mut r = self.store.load(id)?;
        if matches!(
            r.state,
            RunState::Completed
                | RunState::Cancelled
                | RunState::OutcomeUnknown
                | RunState::Nondeterminism
                | RunState::Failed
        ) {
            return Ok(());
        }
        r.state = RunState::CancelRequested;
        r.wakeup = Some(0);
        self.save(&mut r, &[])?;
        for child in &r.children {
            self.cancel(child)?;
        }
        r.state = RunState::Cancelled;
        self.save(&mut r, &[])
    }
    pub fn drive(&mut self, id: &str, now_ms: i64) -> Result<DriveOutcome> {
        self.drive_with_resolver(id, now_ms, &MissingPayloads)
    }
    pub fn drive_with_resolver(
        &mut self,
        id: &str,
        now_ms: i64,
        resolver: &dyn PayloadResolver,
    ) -> Result<DriveOutcome> {
        let mut r = self.store.load(id)?;
        self.recover(&mut r)?;
        if r.state == RunState::CancelRequested {
            self.cancel(id)?;
            return Ok(DriveOutcome::Suspended(RunState::Cancelled));
        }
        if r.state == RunState::Completed {
            return Ok(DriveOutcome::Completed(r.output.ok_or(Error::Conflict)?));
        }
        if matches!(
            r.state,
            RunState::Cancelled
                | RunState::OutcomeUnknown
                | RunState::Nondeterminism
                | RunState::Failed
        ) {
            return Ok(DriveOutcome::Suspended(r.state));
        }
        let Some(workflow) = self
            .workflows
            .get(&(r.workflow.clone(), r.version.clone()))
            .cloned()
        else {
            return self.suspend(&mut r, RunState::NeedsImplementation);
        };
        if r.input.is_ephemeral() && resolver.resolve(&r.input)?.is_none() {
            return self.suspend(&mut r, RunState::NeedsInput);
        }
        for event in &r.history {
            let reference = match &event.value {
                Some(CommandValue::Payload(p)) => Some(p),
                Some(CommandValue::Selected(selection)) => selection.value.as_ref(),
                _ => None,
            };
            if let Some(p) = reference {
                if p.is_ephemeral() && resolver.resolve(p)?.is_none() {
                    return self.suspend(&mut r, RunState::NeedsInput);
                }
            }
        }
        r.state = RunState::Running;
        r.failure_reason = None;
        if let Some(outcome) = self.advance_retries(&mut r, now_ms)? {
            return Ok(outcome);
        }
        for _ in 0..128 {
            let mut ctx = Context {
                input: r.input.clone(),
                history: r.history.clone(),
                cursor: 0,
                pending: None,
                blocked: false,
                faulted: false,
            };
            let result = match catch_unwind(AssertUnwindSafe(|| workflow(&mut ctx))) {
                Ok(result) => result,
                Err(_) => {
                    self.reject_run(id, RunFailure::InvalidCommand)?;
                    return Ok(DriveOutcome::Suspended(RunState::Failed));
                }
            };
            if ctx.faulted {
                return self.suspend(&mut r, RunState::Nondeterminism);
            }
            match result {
                Ok(output) => {
                    if ctx.cursor != r.history.len()
                        || ctx.pending.is_some()
                        || r.history.iter().any(|e| e.value.is_none())
                    {
                        return self.suspend(&mut r, RunState::Nondeterminism);
                    }
                    if r.tasks
                        .iter()
                        .any(|t| !matches!(t.state, TaskState::Done(_)))
                    {
                        return Err(Error::Invalid("join all activities before returning"));
                    }
                    for child in &r.children {
                        if self.store.load(child)?.state != RunState::Completed {
                            return self.suspend(&mut r, RunState::Nondeterminism);
                        }
                    }
                    r.state = RunState::Completed;
                    r.output = Some(output.clone());
                    r.wakeup = None;
                    self.save(&mut r, &[])?;
                    return Ok(DriveOutcome::Completed(output));
                }
                Err(WorkflowError::Nondeterminism | WorkflowError::Invalid) => {
                    return self.suspend(&mut r, RunState::Nondeterminism)
                }
                Err(WorkflowError::Blocked)
                    if ctx.pending.is_none()
                        && !r.history.iter().any(|event| event.value.is_none()) =>
                {
                    self.reject_malformed_run(id)?;
                    return Ok(DriveOutcome::Suspended(RunState::Failed));
                }
                Err(WorkflowError::Blocked) => {}
            }
            if let Some(command) = ctx.pending {
                if r.history.len() >= 1024 {
                    return Err(Error::Limit);
                }
                r.history.push(HistoryEvent {
                    command,
                    value: None,
                });
            }
            let index = r
                .history
                .iter()
                .position(|e| e.value.is_none())
                .ok_or(Error::Conflict)?;
            let command = r.history[index].command.clone();
            let mut children = vec![];
            let value = self.evaluate(&mut r, index, &command, now_ms, &mut children)?;
            merge_retry_wakeup(&mut r);
            if let Some(value) = value {
                r.history[index].value = Some(value);
                r.wakeup = Some(0);
                self.save(&mut r, &children)?;
                continue;
            }
            if r.state == RunState::Cancelled {
                self.cancel(id)?;
                return Ok(DriveOutcome::Suspended(RunState::Cancelled));
            }
            if r.state != RunState::Running {
                self.save(&mut r, &children)?;
                return Ok(DriveOutcome::Suspended(r.state));
            }
            if r.tasks.iter().any(|t| matches!(t.state, TaskState::Ready))
                && self.dispatched.len() >= self.dispatch_limit
            {
                if self.parked.len() >= 256 && !self.parked.contains(id) {
                    return Err(Error::Limit);
                }
                self.parked.insert(id.into());
                self.save(&mut r, &children)?;
                return Ok(DriveOutcome::Waiting);
            }
            if let Some(index) = r
                .tasks
                .iter()
                .position(|t| matches!(t.state, TaskState::Ready))
            {
                let activity_key = (
                    r.tasks[index].attempt.name.clone(),
                    r.tasks[index].attempt.version.clone(),
                );
                if !self.activities.contains_key(&activity_key) {
                    return self.suspend(&mut r, RunState::NeedsImplementation);
                }
                let retry_policy = r.tasks[index]
                    .attempt
                    .retry_policy
                    .unwrap_or(self.retry_policy);
                retry_policy.validate()?;
                let retry_deadline = r.tasks[index]
                    .attempt
                    .retry_policy
                    .filter(|_| r.tasks[index].attempt.attempt > 0)
                    .map(|_| {
                        elapsed_retry_deadline(
                            r.tasks[index].attempt.retry_started_at_ms,
                            retry_policy,
                        )
                    });
                if retry_deadline.is_some_and(|deadline| now_ms >= deadline) {
                    r.tasks[index].state = TaskState::Ready;
                    r.state = RunState::Failed;
                    r.failure_reason = Some(RunFailure::RetryExhausted);
                    r.wakeup = None;
                    self.save(&mut r, &children)?;
                    return Ok(DriveOutcome::Suspended(RunState::Failed));
                }
                if r.tasks[index].attempt.attempt >= retry_policy.max_attempts {
                    r.tasks[index].state = TaskState::Ready;
                    r.state = RunState::Failed;
                    r.failure_reason = Some(RunFailure::RetryExhausted);
                    r.wakeup = None;
                    self.save(&mut r, &children)?;
                    return Ok(DriveOutcome::Suspended(RunState::Failed));
                }
                let task = &mut r.tasks[index];
                let retry_state_missing = task.attempt.retry_policy.is_none();
                task.attempt.attempt = task.attempt.attempt.checked_add(1).ok_or(Error::Limit)?;
                task.attempt.owner_epoch = self.store.owner_epoch();
                if task.attempt.attempt == 1 {
                    task.attempt.retry_started_at_ms = now_ms;
                }
                task.attempt.started_at_ms = now_ms;
                if retry_state_missing {
                    task.attempt.retry_policy = Some(self.retry_policy);
                    if task.attempt.attempt > 1 {
                        task.attempt.retry_started_at_ms = now_ms;
                    }
                }
                task.state = TaskState::InFlight;
                let attempt = task.attempt.clone();
                if r.tasks.iter().any(|t| matches!(t.state, TaskState::Ready)) {
                    r.wakeup = Some(0);
                }
                self.save(&mut r, &children)?;
                self.dispatched
                    .insert(dispatch_key(&attempt), attempt.clone());
                return Ok(DriveOutcome::Activity(attempt));
            }
            self.save(&mut r, &children)?;
            return Ok(DriveOutcome::Waiting);
        }
        r.wakeup = Some(0);
        self.save(&mut r, &[])?;
        Ok(DriveOutcome::Progressed)
    }
    fn suspend(&mut self, r: &mut RunRecord, state: RunState) -> Result<DriveOutcome> {
        r.state = state;
        r.wakeup = None;
        self.save(r, &[])?;
        Ok(DriveOutcome::Suspended(state))
    }
    fn advance_retries(&mut self, r: &mut RunRecord, now_ms: i64) -> Result<Option<DriveOutcome>> {
        let mut changed = false;
        let mut exhausted = false;
        for task in &mut r.tasks {
            let TaskState::Retrying(retry) = &task.state else {
                continue;
            };
            retry.policy.validate()?;
            let elapsed_deadline = elapsed_retry_deadline(retry.retry_started_at_ms, retry.policy);
            if now_ms >= elapsed_deadline {
                task.state = TaskState::Ready;
                exhausted = true;
                break;
            }
            if now_ms >= retry.next_attempt_at_ms {
                task.attempt.retry_policy = Some(retry.policy);
                task.state = TaskState::Ready;
                changed = true;
            }
        }
        if exhausted {
            r.state = RunState::Failed;
            r.failure_reason = Some(RunFailure::RetryExhausted);
            r.wakeup = None;
            self.save(r, &[])?;
            return Ok(Some(DriveOutcome::Suspended(RunState::Failed)));
        }
        if changed {
            r.wakeup = Some(0);
            self.save(r, &[])?;
            return Ok(None);
        }
        if let Some(wakeup) = retry_wakeup(r) {
            if r.wakeup != Some(wakeup) {
                r.wakeup = Some(wakeup);
                self.save(r, &[])?;
            }
        }
        Ok(None)
    }
    fn evaluate(
        &self,
        r: &mut RunRecord,
        index: usize,
        command: &Command,
        now: i64,
        children: &mut Vec<RunRecord>,
    ) -> Result<Option<CommandValue>> {
        r.wakeup = None;
        match command {
            Command::Activity {
                name,
                version,
                input,
                policy,
                detached_wait,
            } => {
                validate(name)?;
                validate(version)?;
                let effect_id = format!("{}:a:{}", r.id, index);
                if !r.tasks.iter().any(|t| t.attempt.effect_id == effect_id) {
                    r.tasks.push(ActivityTask {
                        attempt: ActivityAttempt {
                            run_id: r.id.clone(),
                            effect_id: effect_id.clone(),
                            attempt: 0,
                            owner_epoch: self.store.owner_epoch(),
                            name: name.clone(),
                            version: version.clone(),
                            input: input.clone(),
                            policy: *policy,
                            started_at_ms: 0,
                            retry_started_at_ms: 0,
                            retry_policy: None,
                        },
                        state: TaskState::Ready,
                    });
                }
                if *detached_wait {
                    return Ok(Some(CommandValue::Activity(ActivityHandle(effect_id))));
                }
                let task = r
                    .tasks
                    .iter()
                    .find(|t| t.attempt.effect_id == effect_id)
                    .ok_or(Error::Conflict)?;
                if let TaskState::Done(p) = &task.state {
                    Ok(Some(CommandValue::Payload(p.clone())))
                } else {
                    Ok(None)
                }
            }
            Command::Timer(deadline) => {
                if now >= *deadline {
                    Ok(Some(CommandValue::Unit))
                } else {
                    r.wakeup = Some(*deadline);
                    Ok(None)
                }
            }
            Command::Signal(name) => {
                validate(name)?;
                Ok(take_signal(r, name).map(CommandValue::Payload))
            }
            Command::Child {
                name,
                version,
                input,
            } => {
                let full_id = format!("{}:c:{}", r.id, index);
                let id = if full_id.len() <= 128 {
                    full_id
                } else {
                    use sha2::{Digest, Sha256};
                    {
                        let digest = Sha256::digest(full_id.as_bytes());
                        let hex: String = digest.iter().map(|b| format!("{b:02x}")).collect();
                        format!("child:{hex}")
                    }
                };
                // Root run IDs remain backward-compatible. A deterministic
                // child ID already owned by another run is a local command
                // failure, never permission to adopt that run as a child.
                match self.store.load(&id) {
                    Ok(_) => return Err(Error::Invalid("child id collision")),
                    Err(Error::NotFound) => {}
                    Err(error) => return Err(error),
                }
                let mut child = new_run(&id, name, version, input.clone())?;
                child.parent = Some(r.id.clone());
                r.children.push(id.clone());
                children.push(child);
                Ok(Some(CommandValue::Child(ChildHandle(id))))
            }
            Command::Select(sources) => {
                for source in sources {
                    match source {
                        WaitSource::Signal(name) => validate(name)?,
                        WaitSource::Child(ChildHandle(id)) if !r.children.contains(id) => {
                            return Err(Error::Invalid("unattached child"))
                        }
                        WaitSource::Activity(ActivityHandle(id))
                            if !r.tasks.iter().any(|t| t.attempt.effect_id == *id) =>
                        {
                            return Err(Error::Invalid("unknown activity handle"))
                        }
                        _ => {}
                    }
                }

                for (i, source) in sources.iter().enumerate() {
                    let (ready, value) = match source {
                        WaitSource::Timer(deadline) => {
                            if now >= *deadline {
                                (true, None)
                            } else {
                                r.wakeup = Some(r.wakeup.map_or(*deadline, |d| d.min(*deadline)));
                                (false, None)
                            }
                        }
                        WaitSource::Signal(name) => {
                            validate(name)?;
                            let value = take_signal(r, name);
                            (value.is_some(), value)
                        }
                        WaitSource::Child(ChildHandle(id)) => {
                            if !r.children.contains(id) {
                                return Err(Error::Invalid("unattached child"));
                            }
                            let child = self.store.load(id)?;
                            if matches!(child.state, RunState::Failed | RunState::Nondeterminism) {
                                // A terminal child cannot provide a successful join value.
                                // Preserve recorded commands and propagate its durable failure.
                                r.state = child.state;
                                r.failure_reason = child.failure_reason;
                                r.wakeup = None;
                                return Ok(None);
                            }
                            if child.state == RunState::Cancelled {
                                r.state = RunState::Cancelled;
                                return Ok(None);
                            }
                            (child.state == RunState::Completed, child.output)
                        }
                        WaitSource::Activity(ActivityHandle(id)) => {
                            let task = r
                                .tasks
                                .iter()
                                .find(|t| t.attempt.effect_id == *id)
                                .ok_or(Error::Invalid("unknown activity handle"))?;
                            match &task.state {
                                TaskState::Done(p) => (true, Some(p.clone())),
                                _ => (false, None),
                            }
                        }
                    };
                    if ready {
                        return Ok(Some(CommandValue::Selected(Selection { index: i, value })));
                    }
                }
                Ok(None)
            }
        }
    }
    /// Fence completion by run, stable effect identity, attempt and owner epoch.
    pub fn complete(&mut self, attempt: &ActivityAttempt, output: PayloadRef) -> Result<()> {
        let result = self.complete_inner(attempt, output);
        let released = self.release_dispatch(attempt);
        result.and(released)
    }
    fn complete_inner(&mut self, attempt: &ActivityAttempt, output: PayloadRef) -> Result<()> {
        let mut r = self.store.load(&attempt.run_id)?;
        ensure_active(&r)?;
        let task = owned_task(&mut r, attempt, self.store.owner_epoch())?;
        task.state = TaskState::Done(output);
        r.wakeup = Some(0);
        self.save(&mut r, &[])
    }
    pub fn fail(&mut self, attempt: &ActivityAttempt, failure: ActivityFailure) -> Result<()> {
        self.fail_at(attempt, failure, current_time_ms())
    }
    /// Apply a failure at an explicit timestamp for deterministic hosts and tests.
    pub fn fail_at(
        &mut self,
        attempt: &ActivityAttempt,
        failure: ActivityFailure,
        failed_at_ms: i64,
    ) -> Result<()> {
        let result = self.fail_inner(attempt, failure, failed_at_ms);
        let released = self.release_dispatch(attempt);
        result.and(released)
    }
    fn fail_inner(
        &mut self,
        attempt: &ActivityAttempt,
        failure: ActivityFailure,
        failed_at_ms: i64,
    ) -> Result<()> {
        let mut r = self.store.load(&attempt.run_id)?;
        ensure_active(&r)?;
        let task = owned_task(&mut r, attempt, self.store.owner_epoch())?;
        let safe = matches!(
            task.attempt.policy,
            EffectPolicy::Read | EffectPolicy::Idempotent
        );
        if safe && matches!(failure, ActivityFailure::Retryable) {
            let policy = task.attempt.retry_policy.unwrap_or(self.retry_policy);
            policy.validate()?;
            if task.attempt.attempt >= policy.max_attempts {
                task.state = TaskState::Ready;
                r.state = RunState::Failed;
                r.failure_reason = Some(RunFailure::RetryExhausted);
                r.wakeup = None;
            } else {
                let retry_started_at_ms = if task.attempt.attempt == 1 {
                    task.attempt.started_at_ms
                } else {
                    task.attempt.retry_started_at_ms
                };
                let next_attempt_at_ms =
                    failed_at_ms.saturating_add(backoff_ms(policy, task.attempt.attempt));
                task.state = TaskState::Retrying(RetryState {
                    next_attempt_at_ms,
                    retry_started_at_ms,
                    policy,
                });
                merge_retry_wakeup(&mut r);
            }
        } else {
            task.state = TaskState::Uncertain;
            r.state = RunState::OutcomeUnknown;
            r.wakeup = None;
        }
        self.save(&mut r, &[])
    }
    /// Prepare exactly one owned invocation. Send it to a bounded host executor;
    /// the engine remains available while native code runs. Always finish results,
    /// even after cancellation, to release dispatch capacity.
    pub fn prepare_registered(
        &mut self,
        attempt: &ActivityAttempt,
        resolver: &dyn PayloadResolver,
    ) -> Result<Option<NativeInvocation>> {
        let mut r = self.store.load(&attempt.run_id)?;
        ensure_active(&r)?;
        let task = owned_task(&mut r, attempt, self.store.owner_epoch())?;
        if !matches!(task.state, TaskState::InFlight) {
            return Err(Error::Conflict);
        }
        let handler = self
            .activities
            .get(&(attempt.name.clone(), attempt.version.clone()))
            .and_then(Clone::clone)
            .ok_or(Error::Unavailable)?;
        let Some(bytes) = resolver.resolve(&attempt.input)? else {
            owned_task(&mut r, attempt, self.store.owner_epoch())?.state = TaskState::Ready;
            self.suspend(&mut r, RunState::NeedsInput)?;
            self.release_dispatch(attempt)?;
            return Ok(None);
        };
        if bytes.len() > 1024 * 1024 {
            return Err(Error::Limit);
        }
        owned_task(&mut r, attempt, self.store.owner_epoch())?.state = TaskState::Invoking;
        self.save(&mut r, &[])?;
        Ok(Some(NativeInvocation {
            attempt: attempt.clone(),
            handler,
            bytes,
        }))
    }
    pub fn finish_registered(&mut self, result: NativeResult) -> Result<()> {
        match result.outcome {
            Ok(output) => self.complete(&result.attempt, output),
            Err(failure) => self.fail(&result.attempt, failure),
        }
    }
    /// Synchronous convenience wrapper; prepare/run/finish allows concurrent cancellation.
    pub fn execute_registered(
        &mut self,
        attempt: &ActivityAttempt,
        resolver: &dyn PayloadResolver,
    ) -> Result<()> {
        if let Some(invocation) = self.prepare_registered(attempt, resolver)? {
            self.finish_registered(invocation.run())?;
        }
        Ok(())
    }
    /// An explicit operator/provider reconciliation result. None authorizes a
    /// retry only after the host has proven that the earlier effect did not run.
    pub fn reconcile(
        &mut self,
        id: &str,
        effect_id: &str,
        observed: Option<PayloadRef>,
    ) -> Result<()> {
        let mut r = self.store.load(id)?;
        if r.state != RunState::OutcomeUnknown {
            return Err(Error::Conflict);
        }
        let task = r
            .tasks
            .iter_mut()
            .find(|t| t.attempt.effect_id == effect_id && matches!(t.state, TaskState::Uncertain))
            .ok_or(Error::Conflict)?;
        task.state = observed.map_or(TaskState::Ready, TaskState::Done);
        r.state = if r
            .tasks
            .iter()
            .any(|t| matches!(t.state, TaskState::Uncertain))
        {
            RunState::OutcomeUnknown
        } else {
            RunState::Running
        };
        r.wakeup = Some(0);
        self.save(&mut r, &[])
    }
    fn recover(&mut self, r: &mut RunRecord) -> Result<()> {
        if matches!(
            r.state,
            RunState::Cancelled
                | RunState::CancelRequested
                | RunState::Completed
                | RunState::Nondeterminism
                | RunState::Failed
        ) {
            return Ok(());
        }
        let mut changed = false;
        for task in &mut r.tasks {
            if matches!(task.state, TaskState::InFlight | TaskState::Invoking)
                && task.attempt.owner_epoch != self.store.owner_epoch()
            {
                changed = true;
                match task.attempt.policy {
                    EffectPolicy::Read | EffectPolicy::Idempotent => task.state = TaskState::Ready,
                    EffectPolicy::Reconcile | EffectPolicy::Unknown => {
                        task.state = TaskState::Uncertain;
                        r.state = RunState::OutcomeUnknown;
                    }
                }
            }
        }
        if changed {
            r.wakeup = if r.state == RunState::Running {
                Some(0)
            } else {
                None
            };
            self.save(r, &[])?;
        }
        Ok(())
    }
}
fn new_run(id: &str, name: &str, version: &str, input: PayloadRef) -> Result<RunRecord> {
    validate(id)?;
    validate(name)?;
    validate(version)?;
    Ok(RunRecord {
        id: id.into(),
        parent: None,
        workflow: name.into(),
        version: version.into(),
        input,
        state: RunState::Running,
        failure_reason: None,
        revision: 0,
        history: vec![],
        tasks: vec![],
        signals: vec![],
        children: vec![],
        output: None,
        wakeup: Some(0),
    })
}
fn ensure_active(r: &RunRecord) -> Result<()> {
    if matches!(
        r.state,
        RunState::Cancelled
            | RunState::CancelRequested
            | RunState::Completed
            | RunState::Nondeterminism
            | RunState::Failed
    ) {
        Err(Error::Conflict)
    } else {
        Ok(())
    }
}
fn take_signal(r: &mut RunRecord, name: &str) -> Option<PayloadRef> {
    let signal = r
        .signals
        .iter_mut()
        .find(|s| s.name == name && !s.consumed)?;
    signal.consumed = true;
    Some(signal.value.clone())
}
fn owned_task<'a>(
    r: &'a mut RunRecord,
    attempt: &ActivityAttempt,
    epoch: u64,
) -> Result<&'a mut ActivityTask> {
    r.tasks
        .iter_mut()
        .find(|t| {
            t.attempt == *attempt
                && t.attempt.owner_epoch == epoch
                && attempt.owner_epoch == epoch
                && matches!(t.state, TaskState::InFlight | TaskState::Invoking)
        })
        .ok_or(Error::Conflict)
}

fn dispatch_key(a: &ActivityAttempt) -> (String, u64, u64) {
    (a.effect_id.clone(), a.attempt, a.owner_epoch)
}

fn current_time_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(i64::MAX as u128) as i64
}

fn merge_retry_wakeup(r: &mut RunRecord) {
    if let Some(retry_wakeup) = retry_wakeup(r) {
        r.wakeup = Some(
            r.wakeup
                .map_or(retry_wakeup, |wakeup| wakeup.min(retry_wakeup)),
        );
    }
}

fn retry_wakeup(r: &RunRecord) -> Option<i64> {
    r.tasks
        .iter()
        .filter_map(|task| {
            let TaskState::Retrying(retry) = &task.state else {
                return None;
            };
            Some(retry.next_attempt_at_ms.min(elapsed_retry_deadline(
                retry.retry_started_at_ms,
                retry.policy,
            )))
        })
        .min()
}

fn elapsed_retry_deadline(retry_started_at_ms: i64, policy: RetryPolicy) -> i64 {
    retry_started_at_ms.saturating_add(policy.max_elapsed_ms)
}

fn backoff_ms(policy: RetryPolicy, attempt: u64) -> i64 {
    let shift = attempt.saturating_sub(1).min(62) as u32;
    let multiplier = 1_i64.checked_shl(shift).unwrap_or(i64::MAX);
    policy
        .base_delay_ms
        .saturating_mul(multiplier)
        .min(policy.max_delay_ms)
}

fn failure_state(reason: RunFailure) -> RunState {
    match reason {
        RunFailure::InvalidCommand | RunFailure::ResourceLimit | RunFailure::RetryExhausted => {
            RunState::Failed
        }
        RunFailure::MissingActivityImplementation => RunState::NeedsImplementation,
        RunFailure::PayloadUnavailable => RunState::NeedsInput,
    }
}
