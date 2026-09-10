use crate::evidence::DispatchEvidence;
use crate::*;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

pub struct Service<R, C, V, D, P> {
    repository: R,
    catalog: C,
    credentials: V,
    runner: D,
    policy: P,
    circuit: Circuit,
}
impl<
        R: ActionRepository,
        C: ActionCatalog,
        V: CredentialResolver,
        D: ActionRunner,
        P: PolicyGate,
    > Service<R, C, V, D, P>
{
    pub fn with_circuit(mut self, circuit: Circuit) -> Self {
        self.circuit = circuit;
        self
    }
    pub fn circuit(&self) -> Circuit {
        self.circuit.clone()
    }
    pub fn database_health(&self) -> Option<bool> {
        let states = [
            self.repository.database_health(),
            self.credentials.database_health(),
        ];
        if states.contains(&Some(false)) {
            Some(false)
        } else if states.contains(&None) {
            None
        } else {
            Some(true)
        }
    }
    pub fn new(repository: R, catalog: C, credentials: V, runner: D, policy: P) -> Self {
        Self {
            repository,
            catalog,
            credentials,
            runner,
            policy,
            circuit: Circuit::default(),
        }
    }
    pub async fn execute(&self, request: ExecuteRequest) -> Result<ExecuteResult> {
        let request_id = format!("req_{}", uuid::Uuid::new_v4().simple());
        self.execute_inner(&request, request_id.clone())
            .await
            .map_err(|mut e| {
                e.request_id = request_id;
                e
            })
    }
    async fn execute_inner(
        &self,
        request: &ExecuteRequest,
        request_id: String,
    ) -> Result<ExecuteResult> {
        if request.project_id.is_empty()
            || request.connection_id.is_empty()
            || request.action.is_empty()
            || request.idempotency_key.len() > 128
            || !request
                .idempotency_key
                .bytes()
                .all(|b| (33..=126).contains(&b))
            || !request.input.is_object()
        {
            return Err(ActionError::new("INVALID_ACTION_INPUT").local_validation());
        }
        if request.external_account_id.is_empty() && !request.admin_scope {
            return Err(ActionError::new("MISSING_ACCOUNT_SCOPE").local_validation());
        }
        let connection = self
            .repository
            .connection(&request.project_id, &request.connection_id)
            .await?;
        if connection.project_id != request.project_id
            || connection.id != request.connection_id
            || (!request.external_account_id.is_empty()
                && !connection.external_account_id.is_empty()
                && connection.external_account_id != request.external_account_id)
        {
            return Err(ActionError::new("CONNECTION_NOT_FOUND").local_validation());
        }
        if connection.status != "active" {
            return Err(ActionError::new("CONNECTION_DISCONNECTED").local_validation());
        }
        let operation = self
            .catalog
            .operation(&connection.connector, &request.action)
            .map_err(ActionError::local_validation)?;
        if operation.timeout_ms == 0
            || operation.timeout_ms > 300_000
            || operation.max_input_bytes == 0
            || operation.max_response_bytes == 0
        {
            return Err(ActionError::new("UNKNOWN_ACTION").local_validation());
        }
        if encoded_len(&request.input).map_err(ActionError::local_validation)?
            > operation.max_input_bytes
        {
            return Err(ActionError::new("ACTION_INPUT_TOO_LARGE").local_validation());
        }
        self.policy
            .authorize(request, &connection, &operation)
            .await
            .map_err(ActionError::local_admission)?;
        let attempt = Attempt {
            request_id: request_id.clone(),
            project_id: request.project_id.clone(),
            connection_id: connection.id.clone(),
            connector: connection.connector.clone(),
            external_account_id: request.external_account_id.clone(),
            action: request.action.clone(),
            key: request.idempotency_key.clone(),
            input_hash: scoped_input_hash(&request.input, &request.external_account_id)
                .map_err(ActionError::local_validation)?,
            lease_ms: operation.timeout_ms as i64 + 30_000,
        };
        match self.repository.acquire(&attempt).await? {
            Acquisition::Cached(output) => return Ok(result(request_id, output)),
            Acquisition::Acquired => {}
        }
        // Deadline cancellation leaves a durable pending/dispatched claim. Pending
        // leases can expire; a dispatched mutation is never automatically retried.
        let duration = Duration::from_millis(operation.timeout_ms);
        let evidence = DispatchEvidence::new();
        let output = tokio::time::timeout(
            duration,
            self.dispatch(request, &connection, &operation, &attempt, &evidence),
        )
        .await;
        match output {
            Ok(Ok((output, usage, replay_log_id))) => {
                let mut result = result(request_id, output);
                result.usage_warning = usage.soft_limit > 0 && usage.projected > usage.soft_limit;
                result.usage = usage;
                result.replay_log_id = replay_log_id;
                Ok(result)
            }
            Ok(Err(error)) => Err(evidence.attach(error)),
            Err(_) => Err(evidence.attach(ActionError::new("ACTION_TIMEOUT"))),
        }
    }
    async fn dispatch(
        &self,
        request: &ExecuteRequest,
        connection: &Connection,
        operation: &Operation,
        attempt: &Attempt,
        evidence: &DispatchEvidence,
    ) -> Result<(Value, UsageSnapshot, String)> {
        let prepared = self.prepare(request, connection, operation, attempt).await;
        let Prepared {
            input,
            admission,
            replay_input,
            revision,
        } = match prepared {
            Ok(v) => v,
            Err(e) => {
                evidence.local_error(&e);
                self.repository.release_pending(attempt).await?;
                return Err(e);
            }
        };
        let connection = &revision;
        let deadline = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|_| ActionError::new("ACTION_TIMEOUT"))?
            .as_millis() as u64
            + operation.timeout_ms;
        if let Err(error) = self.repository.prepare_replay(attempt, &replay_input).await {
            self.repository.release_pending(attempt).await?;
            return Err(error);
        }
        let reservation = match self
            .policy
            .reserve(request, connection, operation, &input)
            .await
        {
            Ok(v) => v,
            Err(e) => {
                let e = e.local_admission();
                evidence.local_error(&e);
                self.repository.release_pending(attempt).await?;
                return Err(e);
            }
        };
        if let Err(e) = self
            .repository
            .mark_dispatched_checked_with_reservation(attempt, connection, &reservation)
            .await
        {
            self.policy
                .observe_failure(request, connection, &reservation, "INVALID_ACTION_INPUT")
                .await?;
            self.repository
                .release_pending_with_reservation(attempt, &reservation)
                .await?;
            return Err(e);
        }
        let attempts = if operation.read_only { 3 } else { 1 };
        for index in 0..attempts {
            let prior = evidence.begin_attempt();
            let outcome = self.runner.execute(attempt, input.clone(), deadline).await;
            evidence.finish_attempt(prior, outcome.as_ref().err());
            match outcome {
                Ok(output) => {
                    admission.resolve(false);
                    let valid = if encoded_len(&output)? > operation.max_response_bytes {
                        Err(ActionError::response_too_large(
                            encoded_len(&output)?,
                            operation.max_response_bytes,
                        ))
                    } else {
                        self.catalog.validate_output(
                            &connection.connector,
                            &request.action,
                            &output,
                        )
                    };
                    if let Err(e) = valid {
                        // A provider response may have caused an external
                        // effect even when its payload fails local validation.
                        // Keep the dispatched reservation and mutation fence;
                        // bounded recovery meters it once if finish cannot
                        // record a valid output.
                        self.repository
                            .finish_with_reservation(attempt, &reservation, None, Some(&e.code))
                            .await?;
                        return Err(e);
                    }
                    let replay_log_id = self
                        .repository
                        .record_replay(attempt, &replay_input)
                        .await?;
                    self.repository
                        .finish_with_reservation(attempt, &reservation, Some(&output), None)
                        .await?;
                    return Ok((output, reservation.usage, replay_log_id));
                }
                Err(failure) => {
                    if failure.transient && index + 1 < attempts {
                        let delay = failure.retry_after_ms.max(25_u64 << index);
                        tokio::time::sleep(Duration::from_millis(delay.min(operation.timeout_ms)))
                            .await;
                        continue;
                    }
                    admission.resolve(failure.transient);
                    let code = safe_runner_code(&failure.code);
                    let outcome = evidence.outcome();
                    if outcome == ActionDispatchOutcome::NotDispatched {
                        // This explicit finalizer clears the dispatched claim
                        // and records the failure without re-entering the
                        // ordinary dispatched-claim finish path. Keep it
                        // before policy observation, matching the existing
                        // no-dispatch cleanup ordering.
                        self.repository
                            .finish_not_dispatched_with_reservation(attempt, &reservation, code)
                            .await?;
                    } else if outcome == ActionDispatchOutcome::ResponseReceived {
                        // A typed provider failure releases quota capacity,
                        // but its dispatched claim still fences mutation
                        // replay until normal recovery or operator handling.
                        self.repository
                            .release_quota_with_reservation(attempt, &reservation)
                            .await?;
                    }
                    self.policy
                        .observe_failure(request, connection, &reservation, &failure.code)
                        .await?;
                    if outcome != ActionDispatchOutcome::NotDispatched {
                        self.repository
                            .finish_with_reservation(attempt, &reservation, None, Some(code))
                            .await?;
                    }
                    return Err(ActionError::new(code).with_detail(failure.detail));
                }
            }
        }
        unreachable!()
    }
    async fn prepare(
        &self,
        request: &ExecuteRequest,
        connection: &Connection,
        operation: &Operation,
        attempt: &Attempt,
    ) -> Result<Prepared> {
        let admission = self
            .circuit
            .admit(format!("{}\0{}", request.project_id, request.connection_id))?;
        let resolved = self
            .credentials
            .resolve_for_attempt(attempt, connection, &request.caller_credential)
            .await?;
        let revision = resolved.connection;
        // Rotation may replace the secret, but cannot transfer the authority
        // under which this request selected its connector and operation.
        if revision.id != connection.id
            || revision.project_id != connection.project_id
            || revision.connector != connection.connector
            || revision.external_account_id != connection.external_account_id
            || revision.auth_type != connection.auth_type
            || revision.status != "active"
        {
            return Err(ActionError::new("CONNECTION_CHANGED").local_validation());
        }
        self.policy
            .authorize(request, &revision, operation)
            .await
            .map_err(ActionError::local_admission)?;
        let connection = &revision;
        let fields = resolved.fields;
        if self.catalog.requires_credentials(&connection.connector)? && fields.is_empty() {
            return Err(ActionError::new("MISSING_CREDENTIAL").local_validation());
        }
        let replay_secrets = crate::history::credential_values(&fields, &request.caller_credential);
        let replay_input = sanitize_replay_input(
            &request.input,
            &connection.connector,
            &operation.credential_fields,
            replay_secrets.as_deref(),
        );
        let mut input = request
            .input
            .as_object()
            .cloned()
            .ok_or_else(|| ActionError::new("INVALID_ACTION_INPUT").local_validation())?;
        for key in operation
            .credential_fields
            .iter()
            .map(String::as_str)
            .chain(PROTECTED_FIELDS.iter().copied())
        {
            input.remove(key);
        }
        for (key, value) in fields {
            input.insert(key, value);
        }
        let input = self
            .policy
            .prepare_input(request, connection, Value::Object(input))
            .await
            .map_err(ActionError::local_admission)?;
        if encoded_len(&input).map_err(ActionError::local_validation)? > operation.max_input_bytes {
            return Err(ActionError::new("ACTION_INPUT_TOO_LARGE").local_validation());
        }
        self.catalog
            .validate_input(&connection.connector, &request.action, &input)
            .map_err(ActionError::local_validation)?;
        Ok(Prepared {
            input,
            admission,
            replay_input,
            revision,
        })
    }
}
struct Prepared {
    input: Value,
    admission: Admission,
    replay_input: Value,
    revision: Connection,
}
const PROTECTED_FIELDS: &[&str] = &[
    "apiKey",
    "api_key",
    "accessToken",
    "access_token",
    "token",
    "authorization",
    "baseUrl",
    "baseURL",
    "dsn",
    "smtpHost",
    "smtpPort",
    "smtpSecure",
    "smtpPassword",
    "smtpUsername",
    "account_id",
];
fn result(request_id: String, output: Value) -> ExecuteResult {
    ExecuteResult {
        request_id,
        output,
        replay_log_id: String::new(),
        usage_warning: false,
        usage: UsageSnapshot::default(),
    }
}
fn encoded_len(value: &Value) -> Result<usize> {
    serde_json::to_vec(value)
        .map(|v| v.len())
        .map_err(|_| ActionError::new("INVALID_ACTION_INPUT"))
}
fn safe_runner_code(code: &str) -> &str {
    match code {
        "CONNECTOR_ACCOUNT_RESTRICTED" => "CONNECTION_RESTRICTED",
        "CONNECTOR_ACTION_NOT_PERMITTED" => "ACTION_NOT_PERMITTED",
        "CONNECTOR_RATE_LIMITED"
        | "CONNECTOR_UNAVAILABLE"
        | "RUNNER_BUSY"
        | "ACTION_TIMEOUT"
        | "INVALID_ACTION_INPUT"
        | "NOTE_TOO_LONG"
        | "MISSING_CREDENTIAL"
        | "ACTION_RESPONSE_TOO_LARGE" => code,
        c if !c.is_empty()
            && c.len() <= 96
            && c.bytes()
                .all(|b| b.is_ascii_uppercase() || b.is_ascii_digit() || b == b'_') =>
        {
            c
        }
        _ => "ACTION_FAILED",
    }
}
