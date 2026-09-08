use super::*;
use std::sync::atomic::{AtomicU64, Ordering};
const COUNTERS: [&str; 11] = [
    "setup",
    "run",
    "check",
    "disconnect",
    "replay-trace",
    "replay-event",
    "request",
    "stream",
    "post-attempts",
    "request-attempts",
    "rejected-posts",
];
pub struct ScenarioData {
    pub scenario: Scenario,
    counters: [AtomicU64; COUNTERS.len()],
}
impl ScenarioData {
    pub fn new(scenario: Scenario) -> Self {
        Self {
            scenario,
            counters: std::array::from_fn(|_| AtomicU64::new(0)),
        }
    }
    fn increment(&self, index: usize) {
        self.counters[index].fetch_add(1, Ordering::Relaxed);
    }
    pub fn record_post(&self, path: &str, accepted: bool) {
        self.increment(8);
        if path == "/app/toolkits/request" {
            self.increment(9);
        }
        if !accepted {
            self.increment(10);
        }
    }
    pub fn stats(&self) -> Value {
        let operations: serde_json::Map<String, Value> = COUNTERS
            .iter()
            .zip(&self.counters)
            .map(|(key, counter)| ((*key).into(), json!(counter.load(Ordering::Relaxed))))
            .collect();
        json!({"synthetic":true,"scenario":format!("{:?}",self.scenario),"operations":operations})
    }
    async fn run(&self, r: DashboardRequest) -> Result<Value, DashboardFailure> {
        use DashboardOperation as Op;
        if is_logs_scenario(self.scenario) {
            if r.operation == Op::Logs {
                return logs_collection(&r).map_err(Into::into);
            }
            if r.operation == Op::Trace && logs_trace_id(r.resource.as_deref().unwrap_or("")) {
                let id = r.resource.as_deref().ok_or(Error::Invalid)?;
                if id == "preview_original" {
                    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                }
                return Ok(logs_trace(id));
            }
        }
        let counter = match r.operation {
            Op::Setup => Some(0),
            Op::Test => Some(1),
            Op::TestConnection => Some(2),
            Op::DisconnectConnection => Some(3),
            Op::ReplayTrace => Some(4),
            Op::ReplayEvent => Some(5),
            Op::RequestToolkit => Some(6),
            Op::Stream => Some(7),
            _ => None,
        };
        if let Some(index) = counter {
            self.increment(index);
        }
        if matches!(
            r.operation,
            Op::Setup | Op::Test | Op::TestForm | Op::TestConnection | Op::ReplayTrace
        ) {
            if let Some(failure) = self.scenario.failure() {
                return Err(failure);
            }
        }
        if let Some(value) = collection(self.scenario, &r) {
            return value.map_err(Into::into);
        }
        Ok(match r.operation {
            Op::Toolkit | Op::TestForm => {
                let mut value = connector_fixture(&r)?;
                if self.scenario == Scenario::Connections
                    && r.resource.as_deref() == Some("connector-0")
                {
                    value["connections"] = json!(connections_fixture());
                    value["synthetic"] = true.into();
                }
                if self.scenario != Scenario::Preview
                    && r.resource.as_deref() == Some("connector-0")
                {
                    value["setup"] = json!({"mode":"api_key","help":"Synthetic setup only. Enter sample text, never credentials. Nothing is stored.","fields":[{"key":"workspace","label":SETUP_LABEL,"required":true,"secret":false}]});
                }
                value
            }
            Op::Test => fixture_run(&r).await?,
            Op::Options | Op::RunInputFields => fixture_dynamic(&r)?,
            Op::Branding => json!({"appName":"Sample App","tagColor":"#67e8f9"}),
            Op::Overview if self.scenario == Scenario::Unavailable => {
                return Err(Error::Unavailable.into())
            }
            Op::Overview => overview_fixture(self.scenario),
            Op::Runs => runs_fixture(self.scenario, &r)?,
            Op::Usage => match self.scenario {
                Scenario::Unavailable => return Err(Error::Unavailable.into()),
                Scenario::Empty => {
                    json!({"synthetic":true,"month":"2026-09 (synthetic preview)","toolCalls":0,"syncedRecords":0,"webhookEvents":0})
                }
                _ => {
                    json!({"synthetic":true,"month":"2026-09 (synthetic preview)","toolCalls":1205,"syncedRecords":340,"webhookEvents":27})
                }
            },
            Op::Setup if r.resource.as_deref() == Some("connector-0") => json!({"synthetic":true}),
            Op::TestConnection | Op::DisconnectConnection
                if r.resource.as_deref() == Some("preview_connection") =>
            {
                json!({"synthetic":true,"lastTestStatus":"passed"})
            }
            Op::Trace
                if matches!(
                    r.resource.as_deref(),
                    Some("preview_original" | "preview_current")
                ) =>
            {
                trace_fixture(self.scenario, r.resource.as_deref().ok_or(Error::Invalid)?)
            }
            Op::ReplayTrace if r.resource.as_deref() == Some("preview_original") => {
                json!({"requestId":"preview_current","replayLogId":"preview_replay","output":{"synthetic":true}})
            }
            Op::ReplayEvent if r.resource.as_deref() == Some("preview_event") => {
                json!({"synthetic":true})
            }
            Op::Stream => json!({"events":[]}),
            Op::RequestToolkit => {
                tokio::time::sleep(self.scenario.delay()).await;
                match self.scenario {
                    Scenario::RequestInvalid => return Err(Error::Invalid.into()),
                    Scenario::RequestUnavailable => return Err(Error::Unavailable.into()),
                    _ => json!({"synthetic":true}),
                }
            }
            _ => return Err(Error::Invalid.into()),
        })
    }
}
fn overview_fixture(scenario: Scenario) -> Value {
    if scenario == Scenario::Empty {
        return json!({
            "synthetic": true,
            "toolkitCount": 24,
            "connectionCount": 0,
            "activeConnectionCount": 0,
            "actionCalls": 0,
            "successfulCalls": 0,
            "failedCalls": 0,
            "successRate": null,
            "activity": [],
            "failureActivity": [],
            "attention": [],
            "deadRuns": []
        });
    }
    json!({
        "synthetic": true,
        "toolkitCount": 24,
        "connectionCount": 3,
        "activeConnectionCount": 2,
        "actionCalls": 1205,
        "successfulCalls": 1187,
        "failedCalls": 18,
        "successRate": 98.5,
        "activity": [
            {"date":"2026-09-08T14:00:00Z","label":"14:00","calls":188,"succeeded":185,"failed":3},
            {"date":"2026-09-08T15:00:00Z","label":"15:00","calls":246,"succeeded":243,"failed":3},
            {"date":"2026-09-08T16:00:00Z","label":"16:00","calls":291,"succeeded":286,"failed":5},
            {"date":"2026-09-08T17:00:00Z","label":"17:00","calls":233,"succeeded":228,"failed":5},
            {"date":"2026-09-08T18:00:00Z","label":"18:00","calls":247,"succeeded":245,"failed":2}
        ],
        "failureActivity": [
            {"date":"2026-09-08T14:00:00Z","label":"14:00","failures":3},
            {"date":"2026-09-08T15:00:00Z","label":"15:00","failures":3},
            {"date":"2026-09-08T16:00:00Z","label":"16:00","failures":5},
            {"date":"2026-09-08T17:00:00Z","label":"17:00","failures":5},
            {"date":"2026-09-08T18:00:00Z","label":"18:00","failures":2}
        ],
        "deadRuns": [],
        "attention": [
            {"kind":"failure","title":"Slack / messages.send failed","body":"Error code: CONNECTOR_RATE_LIMITED.","href":"/app/logs?status=failed&connector=slack&requestId=preview_failed"},
            {"kind":"connection","title":"Notion connection is degraded","body":"Provider status: degraded. Last test: failed.","href":"/app/auth-configs"}
        ]
    })
}
fn trace_fixture(scenario: Scenario, id: &str) -> Value {
    let status = if id == "preview_current" && matches!(scenario, Scenario::Failure(_)) {
        "failed"
    } else {
        "succeeded"
    };
    json!({"requestId":id,
        "actionLog":{"id":format!("{id}_action"),"connectionId":"preview_connection","connector":"connector-0","createdAt":"2026-09-08T10:00:00Z","requestId":id,"action":"messages.list","status":status},
        "replayAvailable":true,
        "replayLog":{"id":format!("{id}_replay"),"connectionId":"preview_connection","connector":"connector-0","createdAt":"2026-09-08T10:00:00Z","requestId":id,"action":"messages.list"}
    })
}
impl DashboardData for ScenarioData {
    fn execute(
        &self,
        r: DashboardRequest,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<Value, Error>> + Send + '_>>
    {
        Box::pin(async move {
            self.run(r)
                .await
                .map_err(|failure| failure.classification())
        })
    }
    fn execute_detailed(
        &self,
        r: DashboardRequest,
    ) -> std::pin::Pin<
        Box<dyn std::future::Future<Output = Result<Value, DashboardFailure>> + Send + '_>,
    > {
        Box::pin(self.run(r))
    }
}
fn collection(scenario: Scenario, r: &DashboardRequest) -> Option<Result<Value, Error>> {
    use DashboardOperation as Op;
    let key = match r.operation {
        Op::Catalog => "connectors",
        Op::AuthConfigs => "connections",
        Op::Logs => "logs",
        Op::Triggers => "events",
        Op::Qa => "certifications",
        _ => return None,
    };
    if scenario == Scenario::Unavailable {
        return Some(Err(Error::Unavailable));
    }
    if r.operation == Op::AuthConfigs {
        if scenario == Scenario::Connections {
            return Some(Ok(
                json!({"synthetic":true,"connections":connections_fixture()}),
            ));
        }
        if scenario == Scenario::ConnectionsMalformed {
            return Some(Ok(json!({"synthetic":true,"connections":[{
                "id":"synthetic/invalid-id","connector":"connector-0","status":"active"
            }]})));
        }
    }
    if scenario == Scenario::Empty
        || scenario == Scenario::EventsStream && r.operation == Op::Triggers
    {
        return Some(Ok(json!({key:[]})));
    }
    let long_name = "Synthetic Workspace & \"regional operations\" — long integration name for layout inspection";
    let rows = match r.operation {
        Op::Catalog => (0..24).map(|i| json!({"key":format!("connector-{i}"),"name":if i==0 {long_name.to_owned()} else {format!("Integration {}",i+1)},"categories":["Synthetic"],"operations":[{"name":"list","kind":"action"},{"name":"create","kind":"action"}]})).collect(),
        Op::AuthConfigs => vec![json!({"id":"preview_connection","connector":long_name,"authType":"api_key","status":"active","lastTest":"passed"})],
        Op::Logs if r.fields.get("status").is_some_and(|s| !s.is_empty() && s != "succeeded") => vec![],
        Op::Logs => vec![json!({"requestId":"preview_original","connector":long_name,"action":"messages.list","status":"succeeded","createdAt":"2026-09-08T10:00:00Z","errorCode":""})],
        Op::Triggers => vec![event_fixture("First synthetic event")],
        Op::Qa => vec![json!({"connector":long_name,"status":"synthetic","total":3,"passed":2,"failed":1,"notCertified":1,"drifted":false,"manifestFingerprint":"synthetic_fixture_only","certifiedAt":"2026-09-08T10:00:00Z"})],
        _ => unreachable!("collection operation checked above"),
    };
    Some(Ok(json!({key:rows})))
}

/// Fixed display evidence only. Ages are synthetic DTO values, not claims
/// about a provider request or a live OAuth intent. No secrets are present.
fn connections_fixture() -> Vec<Value> {
    vec![
        json!({"id":"preview_connection","connector":"connector-0","authType":"api_key","status":"active","lastTestStatus":"passed","createdAgeSeconds":3600}),
        json!({"id":"synthetic_authorizing","connector":"connector-0","authType":"oauth2","status":"authorizing","lastTestStatus":"unknown","createdAgeSeconds":86400,"authorizationAgeSeconds":42}),
        json!({"id":"synthetic_authorizing_no_intent","connector":"connector-0","authType":"oauth2","status":"authorizing","lastTestStatus":"unknown","createdAgeSeconds":86400}),
        json!({"id":"synthetic_degraded","connector":"connector-0","authType":"oauth2","status":"degraded","lastTestStatus":"failed","createdAgeSeconds":7200}),
        json!({"id":"synthetic_disconnected","connector":"connector-0","authType":"api_key","status":"disconnected","lastTestStatus":"unknown","createdAgeSeconds":172800}),
        json!({"id":"synthetic_unknown","connector":"connector-0","authType":"","status":"","lastTestStatus":"unknown"}),
        json!({"id":format!("synthetic_long_{}", "workspace_region_".repeat(12)),"connector":"connector-0","authType":"external_bearer","status":"disconnected","lastTestStatus":"unknown","createdAgeSeconds":604800}),
    ]
}
fn event_fixture(operation: &str) -> Value {
    json!({"id":"preview_event","connector":"Synthetic Workspace & \"regional operations\"","operation":operation,"connectionId":"preview_connection","createdAt":"2026-09-08T10:00:00Z"})
}
pub fn event_frames() -> Result<Vec<String>, Error> {
    ["First synthetic event", "Second synthetic event"]
        .iter()
        .map(|operation| render_trigger_patch(&event_fixture(operation)))
        .collect()
}
