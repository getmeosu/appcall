//! Finite synthetic UI qualification data, not a production filter implementation.
//! Only the four listed UTC instants are supported. No provider or database is used.
use super::*;

pub fn is_logs_scenario(scenario: Scenario) -> bool {
    matches!(
        scenario,
        Scenario::Logs
            | Scenario::Logs401
            | Scenario::Logs403
            | Scenario::Logs503
            | Scenario::LogsMalformed
    )
}

pub fn logs_trace_id(id: &str) -> bool {
    matches!(
        id,
        "preview_original" | "preview_logs_b" | "preview_logs_no_replay"
    )
}

const TIMES: [&str; 4] = [
    "2026-09-08T08:00:00Z",
    "2026-09-08T09:00:00Z",
    "2026-09-08T10:00:00Z",
    "2026-09-08T11:00:00Z",
];

fn rows() -> Vec<Value> {
    [
        ("preview_original", "connector-0", "messages.list", "succeeded", "", "preview_connection", TIMES[2]),
        ("preview_logs_b", "connector-0", "messages.list", "failed", "ACTION_TIMEOUT", "preview_connection", TIMES[1]),
        ("preview_logs_no_replay", "connector-1", "files.list", "succeeded", "", "preview_logs_connection", TIMES[0]),
    ].into_iter().map(|(id, connector, action, status, error, connection, time)| {
        let base = json!({"id":format!("{id}_action"),"connectionId":connection,"requestId":id,"connector":connector,"action":action,"status":status,"createdAt":time});
        if error.is_empty() { base } else {
            Value::Object(base.as_object().unwrap().iter().map(|(key, value)| (key.clone(), value.clone())).chain(std::iter::once(("errorCode".into(), json!(error)))).collect())
        }
    }).collect()
}

fn time_index(value: &str) -> Result<Option<usize>, Error> {
    if value.is_empty() {
        return Ok(None);
    }
    TIMES
        .iter()
        .position(|time| *time == value)
        .map(Some)
        .ok_or(Error::Invalid)
}

pub fn logs_collection(request: &DashboardRequest) -> Result<Value, Error> {
    let field = |key: &str| request.fields.get(key).map(String::as_str).unwrap_or("");
    let from = time_index(field("createdFrom"))?;
    let before = time_index(field("createdBefore"))?;
    if from.zip(before).is_some_and(|(a, b)| a >= b) {
        return Err(Error::Invalid);
    }
    let limit = match field("limit") {
        "" => 100,
        value if value.bytes().all(|b| b.is_ascii_digit()) => {
            value.parse::<usize>().map_err(|_| Error::Invalid)?
        }
        _ => return Err(Error::Invalid),
    };
    if !(1..=100).contains(&limit) {
        return Err(Error::Invalid);
    }
    let offset = match field("cursor") {
        "" => 0,
        "synthetic-logs-1" => 1,
        "synthetic-logs-2" => 2,
        _ => return Err(Error::Invalid),
    };
    let filtered: Vec<_> = rows()
        .into_iter()
        .filter(|row| {
            let equals = [
                "status",
                "connector",
                "action",
                "connectionId",
                "requestId",
                "errorCode",
            ]
            .into_iter()
            .all(|key| field(key).is_empty() || row[key].as_str().unwrap_or("") == field(key));
            let instant = TIMES
                .iter()
                .position(|time| row["createdAt"].as_str() == Some(*time))
                .unwrap();
            equals
                && from.is_none_or(|start| instant >= start)
                && before.is_none_or(|end| instant < end)
        })
        .collect();
    if offset > 0 && offset >= filtered.len() {
        return Err(Error::Invalid);
    }
    let next =
        (offset + limit < filtered.len()).then(|| format!("synthetic-logs-{}", offset + limit));
    let pagination = match next {
        Some(cursor) => json!({"hasMore":true,"nextCursor":cursor}),
        None => json!({"hasMore":false}),
    };
    Ok(
        json!({"logs":filtered.into_iter().skip(offset).take(limit).collect::<Vec<_>>(),"pagination":pagination}),
    )
}

pub fn logs_trace(id: &str) -> Value {
    let action = rows()
        .into_iter()
        .find(|row| row["requestId"] == id)
        .expect("known synthetic trace");
    if id == "preview_original" {
        json!({"requestId":id,"actionLog":action,"replayAvailable":true,
            "replayLog":{"id":"preview_original_replay","connectionId":"preview_connection","connector":"connector-0","createdAt":TIMES[2],"requestId":id,"action":"messages.list"}})
    } else {
        json!({"requestId":id,"actionLog":action,"replayAvailable":false,"replayUnavailableReason":"no_replay_log"})
    }
}
