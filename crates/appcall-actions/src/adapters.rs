use crate::*;
use appcall_connectors::{OperationKind, Registry};
use appcall_runner_client::{ActionExecuteRequest, ErrorKind, RequestContext, RunnerClient};
impl ActionCatalog for Registry {
    fn requires_credentials(&self, connector: &str) -> Result<bool> {
        self.connector(connector)
            .map(|c| c.manifest().auth.type_ != "none")
            .map_err(|_| ActionError::new("UNKNOWN_ACTION"))
    }
    fn operation(&self, connector: &str, action: &str) -> Result<Operation> {
        let o = Registry::operation(self, connector, action)
            .map_err(|_| ActionError::new("UNKNOWN_ACTION"))?;
        if o.kind != OperationKind::Action {
            return Err(ActionError::new("UNKNOWN_ACTION"));
        };
        Ok(Operation {
            read_only: o.is_read_only(),
            timeout_ms: o
                .timeout_ms
                .try_into()
                .map_err(|_| ActionError::new("UNKNOWN_ACTION"))?,
            max_input_bytes: o
                .max_input_bytes
                .try_into()
                .map_err(|_| ActionError::new("UNKNOWN_ACTION"))?,
            max_response_bytes: o
                .max_response_bytes
                .try_into()
                .map_err(|_| ActionError::new("UNKNOWN_ACTION"))?,
            credential_fields: self
                .credential_fields(connector)
                .map_err(|_| ActionError::new("UNKNOWN_ACTION"))?
                .into_iter()
                .map(str::to_owned)
                .collect(),
        })
    }
    fn validate_input(&self, connector: &str, action: &str, input: &Value) -> Result<()> {
        let operation = Registry::operation(self, connector, action)
            .map_err(|_| ActionError::new("UNKNOWN_ACTION"))?;
        // Operation schemas describe public action arguments. Credentials are
        // injected by the service after caller values have been removed. Keep
        // explicit credential constraints, but exclude undeclared transport
        // credentials from additionalProperties validation.
        let mut public_input = input.clone();
        if let Some(fields) = public_input.as_object_mut() {
            for credential in self
                .credential_fields(connector)
                .map_err(|_| ActionError::new("UNKNOWN_ACTION"))?
                .into_iter()
                .chain(["accessToken"])
                .chain((connector == "unipile").then_some("account_id"))
            {
                let declared = operation.input_schema.as_ref().is_some_and(|schema| {
                    schema
                        .get("properties")
                        .and_then(|p| p.get(credential))
                        .is_some()
                        || schema
                            .get("required")
                            .and_then(Value::as_array)
                            .is_some_and(|keys| {
                                keys.iter().any(|key| key.as_str() == Some(credential))
                            })
                });
                if !declared {
                    fields.remove(credential);
                }
            }
        }
        operation
            .validate_input(&public_input)
            .map_err(|_| ActionError::new("INVALID_ACTION_INPUT"))
    }
    fn validate_output(&self, connector: &str, action: &str, output: &Value) -> Result<()> {
        Registry::operation(self, connector, action)
            .map_err(|_| ActionError::new("UNKNOWN_ACTION"))?
            .validate_output(output)
            .map_err(|_| ActionError::new("ACTION_RESPONSE_INVALID"))?;
        crate::normalized::validate_action_output(connector, action, output)
    }
}
impl ActionRunner for RunnerClient {
    async fn execute(
        &self,
        a: &Attempt,
        input: Value,
        deadline_unix_ms: u64,
    ) -> std::result::Result<Value, RunnerFailure> {
        self.action_execute(
            &RequestContext {
                request_id: a.request_id.clone(),
                deadline_unix_ms: Some(deadline_unix_ms),
            },
            ActionExecuteRequest {
                connector_key: a.connector.clone(),
                action: a.action.clone(),
                input: input.clone(),
            },
        )
        .await
        .map(|r| r.output)
        .map_err(|e| runner_failure(e, &input))
    }
}

fn runner_failure(e: appcall_runner_client::Error, input: &Value) -> RunnerFailure {
    let mut secrets = Vec::new();
    let bounded = collect_input_strings(input, &mut secrets, 0);
    let mut code = e.code.unwrap_or_else(|| {
        match e.kind {
            ErrorKind::Timeout => "ACTION_TIMEOUT",
            ErrorKind::ResponseTooLarge => "ACTION_RESPONSE_TOO_LARGE",
            ErrorKind::Transport => "CONNECTOR_UNAVAILABLE",
            _ => "ACTION_FAILED",
        }
        .into()
    });
    if !bounded
        || secrets.iter().any(|value| code.contains(*value))
        || code.is_empty()
        || code.len() > 96
        || !code
            .bytes()
            .all(|b| b.is_ascii_uppercase() || b.is_ascii_digit() || b == b'_')
    {
        code = "ACTION_FAILED".into();
    }
    let transient = matches!(
        code.as_str(),
        "CONNECTOR_RATE_LIMITED" | "CONNECTOR_UNAVAILABLE" | "RUNNER_UNAVAILABLE"
    );
    let detail = (e.kind == ErrorKind::Runner).then(|| FailureDetail {
        safe_message: Some(scrub_detail(&e.message, &secrets, bounded)),
        response_size: None,
    });
    RunnerFailure {
        code,
        transient,
        retry_after_ms: e.retry_after_seconds.unwrap_or(0).saturating_mul(1000),
        detail,
        retry_after_seconds: e.retry_after_seconds,
        outcome: match e.outcome {
            appcall_runner_client::DispatchOutcome::NotDispatched => {
                crate::ActionDispatchOutcome::NotDispatched
            }
            appcall_runner_client::DispatchOutcome::ResponseReceived => {
                crate::ActionDispatchOutcome::ResponseReceived
            }
            appcall_runner_client::DispatchOutcome::Unknown => {
                crate::ActionDispatchOutcome::Unknown
            }
        },
    }
}
fn collect_input_strings<'a>(value: &'a Value, secrets: &mut Vec<&'a str>, depth: usize) -> bool {
    if depth > 32 || secrets.len() > 128 {
        return false;
    }
    match value {
        Value::String(s) if !s.is_empty() => {
            secrets.push(s);
            secrets.len() <= 128
        }
        Value::Object(fields) => fields
            .values()
            .all(|v| collect_input_strings(v, secrets, depth + 1)),
        Value::Array(values) => values
            .iter()
            .all(|v| collect_input_strings(v, secrets, depth + 1)),
        _ => true,
    }
}
fn scrub_detail(message: &str, secrets: &[&str], bounded: bool) -> String {
    if !bounded || message.len() > 4096 {
        return "Runner returned an error.".into();
    }
    let variants = crate::history::secret_variants(secrets);
    let mut safe = message.trim().to_owned();
    for value in variants {
        safe = safe.replace(&value, "[REDACTED]");
    }
    if safe.len() > 300 {
        let mut boundary = 300;
        while !safe.is_char_boundary(boundary) {
            boundary -= 1;
        }
        safe.truncate(boundary);
        safe.push('…');
    }
    safe
}

#[cfg(test)]
mod metadata_tests {
    use super::*;
    use appcall_runner_client::DispatchOutcome;
    use serde_json::json;
    #[test]
    fn evidence_adapter_preserves_rpc_outcome_and_optional_retry_hint() {
        for (outcome, expected) in [
            (
                DispatchOutcome::Unknown,
                crate::ActionDispatchOutcome::Unknown,
            ),
            (
                DispatchOutcome::NotDispatched,
                crate::ActionDispatchOutcome::NotDispatched,
            ),
            (
                DispatchOutcome::ResponseReceived,
                crate::ActionDispatchOutcome::ResponseReceived,
            ),
        ] {
            for hint in [None, Some(0), Some(11)] {
                let error = runner_failure(
                    appcall_runner_client::Error {
                        kind: ErrorKind::Transport,
                        outcome,
                        code: None,
                        retry_after_seconds: hint,
                        message: "private diagnostic".into(),
                    },
                    &json!({}),
                );
                assert_eq!(error.outcome, expected);
                assert_eq!(error.retry_after_seconds, hint);
                assert!(error.detail.is_none());
            }
        }
    }
    fn failure(kind: ErrorKind, message: &str) -> appcall_runner_client::Error {
        appcall_runner_client::Error {
            kind,
            outcome: DispatchOutcome::ResponseReceived,
            code: Some("NOTE_TOO_LONG".into()),
            retry_after_seconds: None,
            message: message.into(),
        }
    }
    #[test]
    fn runtime_credentials_under_arbitrary_names_are_scrubbed() {
        let input = json!({"custom":{"dsn":"private/key +value"},"text":"hello"});
        let error = runner_failure(
            failure(
                ErrorKind::Runner,
                "Rejected private/key +value and private%2Fkey%20%2Bvalue: note too long",
            ),
            &input,
        );
        let detail = error.detail.unwrap();
        let message = detail.safe_message.unwrap();
        assert!(!message.contains("private"));
        assert!(message.contains("note too long"));
        assert_eq!(error.code, "NOTE_TOO_LONG");
    }
    #[test]
    fn transport_errors_never_expose_raw_detail() {
        let error = runner_failure(
            failure(ErrorKind::Transport, "password=DO_NOT_SHOW"),
            &json!({}),
        );
        assert!(error.detail.is_none());
    }
    #[test]
    fn provider_detail_is_bounded_and_utf8_safe() {
        let error = runner_failure(failure(ErrorKind::Runner, &"界".repeat(200)), &json!({}));
        let message = error.detail.unwrap().safe_message.unwrap();
        assert!(message.len() <= 303);
        assert!(message.ends_with('…'));
        let input = json!((0..130).map(|n| format!("value-{n}")).collect::<Vec<_>>());
        let error = runner_failure(failure(ErrorKind::Runner, "private"), &input);
        assert_eq!(
            error.detail.unwrap().safe_message.as_deref(),
            Some("Runner returned an error.")
        );
    }
}
