use appcall_actions::{ActionError, ExecuteRequest, ExecuteResult};
use appcall_connectors::{Connector, Registry};
use appcall_mcp::*;
use serde_json::{json, Value};
use std::sync::{Arc, Mutex};
#[derive(Clone)]
struct Connections(Vec<Connection>);
impl ConnectionLister for Connections {
    async fn list(&self, _: &str) -> Result<Vec<Connection>, InfrastructureError> {
        Ok(self.0.clone())
    }
}
#[derive(Clone)]
struct MutableConnections(Arc<Mutex<Vec<Connection>>>);
impl ConnectionLister for MutableConnections {
    async fn list(&self, _: &str) -> Result<Vec<Connection>, InfrastructureError> {
        Ok(self.0.lock().unwrap().clone())
    }
}
#[derive(Clone, Default)]
struct Executor(Arc<Mutex<Vec<ExecuteRequest>>>);
impl ActionExecutor for Executor {
    async fn execute(&self, request: ExecuteRequest) -> Result<ExecuteResult, ActionError> {
        if request.input.get("oversize").is_some() {
            return Err(ActionError::response_too_large(5000, 1000));
        }
        if request.input.get("detail").is_some() {
            return Err(ActionError::new("NOTE_TOO_LONG").with_detail(Some(
                appcall_actions::FailureDetail {
                    safe_message: Some("Please shorten the invitation note.".into()),
                    response_size: None,
                },
            )));
        }
        if request.input.get("fail").is_some() {
            return Err(ActionError::new("password=SECRET"));
        }
        self.0.lock().unwrap().push(request);
        Ok(ExecuteResult {
            request_id: "r".into(),
            output: json!({"ok":true}),
            replay_log_id: String::new(),
            usage_warning: false,
            usage: Default::default(),
        })
    }
}
fn registry() -> Registry {
    let v = json!({"key":"apollo","name":"Apollo","version":"1.0.0","runtime":"bun","models":["user"],"auth":{"type":"api_key"},"network":{"allowedHosts":["api.apollo.io"]},"operations":{
        "people.search":{"kind":"action","timeoutMs":1000,"maxInputBytes":4096,"maxResponseBytes":4096,"description":"Search people","inputSchema":{"type":"object"},"outputSchema":{"type":"object"},"sideEffect":"read"},
        "private.delete":{"kind":"action","timeoutMs":1000,"maxInputBytes":4096,"maxResponseBytes":4096,"description":"Delete","inputSchema":{"type":"object"},"sideEffect":"destructive"}}});
    Registry::from_connectors([Connector::from_bytes(&serde_json::to_vec(&v).unwrap()).unwrap()])
        .unwrap()
}
fn connection_with(
    id: &str,
    project: &str,
    account: &str,
    connector: &str,
    status: &str,
) -> Connection {
    Connection {
        id: id.into(),
        project_id: project.into(),
        external_account_id: account.into(),
        connector: connector.into(),
        status: status.into(),
    }
}
fn connection(id: &str, project: &str, account: &str) -> Connection {
    connection_with(id, project, account, "apollo", "active")
}
fn server() -> (Server<Connections, Executor, MemoryUsage>, Executor) {
    let e = Executor::default();
    (
        Server::new(
            registry(),
            Connections(vec![
                connection("a", "p", "other"),
                connection("z", "p", ""),
                connection("b", "p", "brand"),
                connection("0", "evil", "brand"),
            ]),
            e.clone(),
            MemoryUsage::default(),
        ),
        e,
    )
}
fn scope() -> Scope {
    Scope::new("p", "brand")
        .with_profile("sena_mvt")
        .with_connector_token("SECRET")
}
async fn rpc<L: ConnectionLister, E: ActionExecutor, U: UsageRecorder>(
    s: &Server<L, E, U>,
    scope: &Scope,
    req: Value,
) -> Value {
    s.handle_http("POST", scope, &serde_json::to_vec(&req).unwrap())
        .await
        .body
        .unwrap()
}
#[tokio::test]
async fn protocol_transport_and_notifications() {
    let (s, e) = server();
    let sc = scope();
    assert_eq!(s.handle_http("GET", &sc, b"").await.status, 405);
    assert_eq!(
        s.handle_http("POST", &Scope::new("", ""), b"{}")
            .await
            .status,
        401
    );
    assert_eq!(
        s.handle_http("POST", &sc, &vec![b' '; MAX_REQUEST_BYTES + 1])
            .await
            .status,
        413
    );
    assert_eq!(
        s.handle_http("POST", &sc, b"{").await.body.unwrap()["error"]["code"],
        -32700
    );
    for method in [
        "notifications/initialized",
        "notifications/cancelled",
        "tools/call",
        "unknown",
    ] {
        let r=s.handle_http("POST",&sc,&serde_json::to_vec(&json!({"jsonrpc":"2.0","method":method,"params":{"name":"apollo__people__search"}})).unwrap()).await;
        assert_eq!(r.status, 202);
        assert!(r.body.is_none());
    }
    assert!(e.0.lock().unwrap().is_empty());
    let init = rpc(
        &s,
        &sc,
        json!({"jsonrpc":"2.0","id":1,"method":"initialize"}),
    )
    .await;
    assert_eq!(init["result"]["protocolVersion"], "2025-06-18");
    assert_eq!(
        rpc(&s, &sc, json!({"jsonrpc":"2.0","id":"x","method":"ping"})).await["result"],
        json!({})
    );
    assert_eq!(
        rpc(&s, &sc, json!({"jsonrpc":"2.0","id":1,"method":"unknown"})).await["error"]["code"],
        -32601
    );
}
#[tokio::test]
async fn schemas_profile_scope_dispatch_and_redaction() {
    let (s, e) = server();
    let sc = scope();
    let list = rpc(
        &s,
        &sc,
        json!({"jsonrpc":"2.0","id":1,"method":"tools/list"}),
    )
    .await;
    let tools = list["result"]["tools"].as_array().unwrap();
    assert_eq!(tools.len(), 1);
    assert_eq!(tools[0]["inputSchema"], json!({"type":"object"}));
    assert_eq!(tools[0]["annotations"], json!({"readOnlyHint":true}));
    assert_eq!(
        tools[0]["_meta"]["appcall"]["connectionIds"],
        json!(["b", "z"])
    );
    let call = json!({"jsonrpc":"2.0","id":2,"method":"tools/call","projectId":"evil","accountId":"other","params":{"name":"apollo__people__search","arguments":{"projectId":"evil","accountId":"other"}}});
    let result = rpc(&s, &sc, call).await;
    assert_eq!(result["result"]["structuredContent"], json!({"ok":true}));
    {
        let calls = e.0.lock().unwrap();
        assert_eq!(calls[0].project_id, "p");
        assert_eq!(calls[0].external_account_id, "brand");
        assert_eq!(calls[0].connection_id, "b");
        assert_eq!(calls[0].caller_credential, "SECRET");
        assert!(!calls[0].admin_scope);
    }
    let denied=rpc(&s,&sc,json!({"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"apollo__private__delete"}})).await;
    assert_eq!(
        denied["result"]["structuredContent"]["code"],
        "TOOL_NOT_ALLOWED"
    );
    let failed=rpc(&s,&sc,json!({"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"apollo__people__search","arguments":{"fail":true}}})).await;
    assert!(!failed.to_string().contains("SECRET"));
    assert_eq!(
        failed["result"]["structuredContent"]["code"],
        "ACTION_FAILED"
    );
    assert_eq!(s.usage().list("p", "brand").unwrap()[0].count, 1);
}

#[tokio::test]
async fn tools_list_exposes_scoped_connection_ids_and_selector_schema() {
    let server = Server::new(
        registry(),
        Connections(vec![
            connection("second", "p", "brand"),
            connection("first", "p", "brand"),
        ]),
        Executor::default(),
        (),
    );

    let response = rpc(
        &server,
        &scope(),
        json!({"jsonrpc":"2.0","id":1,"method":"tools/list"}),
    )
    .await;
    let tools = response["result"]["tools"].as_array().unwrap();

    assert_eq!(tools.len(), 1);
    assert_eq!(tools[0]["inputSchema"], json!({"type":"object"}));
    assert_eq!(
        tools[0]["_meta"]["appcall"]["connectionIds"],
        json!(["first", "second"])
    );
    assert_eq!(
        tools[0]["_meta"]["appcall"]["connectionSelector"],
        json!({
            "location":"tools/call.params.connectionId",
            "schema":{"type":"string","enum":["first","second"]}
        })
    );
}

#[tokio::test]
async fn public_call_tool_for_connection_targets_the_selected_connection() {
    let executor = Executor::default();
    let server = Server::new(
        registry(),
        Connections(vec![
            connection("first", "p", "brand"),
            connection("second", "p", "brand"),
        ]),
        executor.clone(),
        (),
    );

    let result = server
        .call_tool_for_connection(
            &scope(),
            "apollo__people__search",
            "second",
            json!({"query":"Ada"}),
        )
        .await
        .unwrap();

    assert_eq!(result["isError"], false);
    let calls = executor.0.lock().unwrap();
    assert_eq!(calls.len(), 1);
    assert_eq!(calls[0].connection_id, "second");
    assert_eq!(calls[0].input, json!({"query":"Ada"}));
}

#[tokio::test]
async fn empty_account_scope_hides_connections_from_tools_list() {
    let server = Server::new(
        registry(),
        Connections(vec![
            connection("brand", "p", "brand"),
            connection("platform", "p", ""),
        ]),
        Executor::default(),
        (),
    );

    assert!(server
        .list_tools(&Scope::new("p", ""))
        .await
        .unwrap()
        .is_empty());
}

#[tokio::test]
async fn empty_account_scope_rejects_before_a_permissive_executor() {
    let executor = Executor::default();
    let server = Server::new(
        registry(),
        Connections(vec![connection("brand", "p", "brand")]),
        executor.clone(),
        (),
    );

    let result = server
        .call_tool(&Scope::new("p", ""), "apollo__people__search", json!({}))
        .await
        .unwrap();

    assert_eq!(result["isError"], true);
    assert_eq!(result["structuredContent"]["code"], "MISSING_ACCOUNT_SCOPE");
    assert!(executor.0.lock().unwrap().is_empty());
}

#[tokio::test]
async fn stale_discovered_target_never_falls_back_after_status_or_deletion() {
    for deleted in [false, true] {
        let state = Arc::new(Mutex::new(vec![
            connection("selected", "p", "brand"),
            connection("fallback", "p", "brand"),
        ]));
        let executor = Executor::default();
        let server = Server::new(
            registry(),
            MutableConnections(state.clone()),
            executor.clone(),
            (),
        );

        let tools = server.list_tools(&scope()).await.unwrap();
        assert_eq!(
            tools[0]["_meta"]["appcall"]["connectionIds"],
            json!(["fallback", "selected"])
        );

        if deleted {
            state
                .lock()
                .unwrap()
                .retain(|connection| connection.id != "selected");
        } else {
            state
                .lock()
                .unwrap()
                .iter_mut()
                .find(|connection| connection.id == "selected")
                .unwrap()
                .status = "disconnected".into();
        }

        let result = rpc(
            &server,
            &scope(),
            json!({
                "jsonrpc":"2.0",
                "id":1,
                "method":"tools/call",
                "params":{
                    "name":"apollo__people__search",
                    "connectionId":"selected",
                    "arguments":{}
                }
            }),
        )
        .await;

        assert_eq!(result["result"]["isError"], true);
        assert_eq!(
            result["result"]["structuredContent"]["code"],
            if deleted {
                "CONNECTION_NOT_FOUND"
            } else {
                "CONNECTION_DISCONNECTED"
            }
        );
        assert!(executor.0.lock().unwrap().is_empty());
    }
}

#[tokio::test]
async fn mcp_rejects_ambiguous_default_connection_before_dispatch() {
    let executor = Executor::default();
    let server = Server::new(
        registry(),
        Connections(vec![
            connection("first", "p", "brand"),
            connection("second", "p", "brand"),
        ]),
        executor.clone(),
        (),
    );

    let result = rpc(
        &server,
        &scope(),
        json!({
            "jsonrpc":"2.0",
            "id":1,
            "method":"tools/call",
            "params":{"name":"apollo__people__search","arguments":{}}
        }),
    )
    .await;

    assert_eq!(result["result"]["isError"], true);
    assert_eq!(
        result["result"]["structuredContent"]["code"],
        "CONNECTION_AMBIGUOUS"
    );
    assert!(executor.0.lock().unwrap().is_empty());
}

#[tokio::test]
async fn mcp_explicit_connection_id_targets_only_the_selected_connection() {
    let executor = Executor::default();
    let server = Server::new(
        registry(),
        Connections(vec![
            connection("first", "p", "brand"),
            connection("second", "p", "brand"),
        ]),
        executor.clone(),
        (),
    );

    let result = rpc(
        &server,
        &scope(),
        json!({
            "jsonrpc":"2.0",
            "id":1,
            "method":"tools/call",
            "params":{
                "name":"apollo__people__search",
                "connectionId":"second",
                "arguments":{"query":"Ada"}
            }
        }),
    )
    .await;

    assert_eq!(result["result"]["isError"], false);
    let calls = executor.0.lock().unwrap();
    assert_eq!(calls.len(), 1);
    assert_eq!(calls[0].connection_id, "second");
    assert_eq!(calls[0].input, json!({"query":"Ada"}));
}

#[tokio::test]
async fn mcp_prefers_one_own_brand_connection_over_platform_fallback() {
    let executor = Executor::default();
    let server = Server::new(
        registry(),
        Connections(vec![
            connection("platform", "p", ""),
            connection("brand", "p", "brand"),
        ]),
        executor.clone(),
        (),
    );

    let result = rpc(
        &server,
        &scope(),
        json!({
            "jsonrpc":"2.0",
            "id":1,
            "method":"tools/call",
            "params":{"name":"apollo__people__search","arguments":{}}
        }),
    )
    .await;

    assert_eq!(result["result"]["isError"], false);
    assert_eq!(executor.0.lock().unwrap()[0].connection_id, "brand");
}

#[tokio::test]
async fn mcp_brand_scope_can_explicitly_target_platform_connection() {
    let executor = Executor::default();
    let server = Server::new(
        registry(),
        Connections(vec![
            connection("platform", "p", ""),
            connection("brand", "p", "brand"),
        ]),
        executor.clone(),
        (),
    );

    let result = rpc(
        &server,
        &scope(),
        json!({
            "jsonrpc":"2.0",
            "id":1,
            "method":"tools/call",
            "params":{
                "name":"apollo__people__search",
                "connectionId":"platform",
                "arguments":{}
            }
        }),
    )
    .await;

    assert_eq!(result["result"]["isError"], false);
    assert_eq!(executor.0.lock().unwrap()[0].connection_id, "platform");
}

#[tokio::test]
async fn mcp_platform_scope_cannot_target_a_brand_connection_without_account_scope() {
    let actions = appcall_actions::Service::new(
        NoStorage,
        registry(),
        NoCredentials,
        NoRunner,
        appcall_actions::ReadOnlyPolicy,
    );
    let server = Server::new(
        registry(),
        Connections(vec![
            connection("brand", "p", "brand"),
            connection("platform", "p", ""),
        ]),
        actions,
        (),
    );

    let result = rpc(
        &server,
        &Scope::new("p", ""),
        json!({
            "jsonrpc":"2.0",
            "id":1,
            "method":"tools/call",
            "params":{
                "name":"apollo__people__search",
                "connectionId":"brand",
                "arguments":{}
            }
        }),
    )
    .await;

    assert_eq!(result["result"]["isError"], true);
    assert_eq!(
        result["result"]["structuredContent"]["code"],
        "MISSING_ACCOUNT_SCOPE"
    );
}

#[tokio::test]
async fn mcp_rejects_foreign_wrong_connector_disconnected_and_stale_targets() {
    let cases = [
        (
            "foreign-project",
            connection("foreign-project", "other-project", "brand"),
            "CONNECTION_NOT_FOUND",
        ),
        (
            "foreign-brand",
            connection("foreign-brand", "p", "other-brand"),
            "CONNECTION_NOT_FOUND",
        ),
        (
            "wrong-connector",
            connection_with("wrong-connector", "p", "brand", "other", "active"),
            "CONNECTION_NOT_FOUND",
        ),
        (
            "disconnected",
            connection_with("disconnected", "p", "brand", "apollo", "disconnected"),
            "CONNECTION_DISCONNECTED",
        ),
        (
            "stale",
            connection("unused", "other-project", "brand"),
            "CONNECTION_NOT_FOUND",
        ),
    ];

    for (target, candidate, expected_code) in cases {
        let executor = Executor::default();
        let connections = if target == "stale" {
            vec![connection("fallback", "p", "brand")]
        } else {
            vec![candidate, connection("fallback", "p", "brand")]
        };
        let server = Server::new(registry(), Connections(connections), executor.clone(), ());
        let result = rpc(
            &server,
            &scope(),
            json!({
                "jsonrpc":"2.0",
                "id":1,
                "method":"tools/call",
                "params":{
                    "name":"apollo__people__search",
                    "connectionId":target,
                    "arguments":{}
                }
            }),
        )
        .await;

        assert_eq!(result["result"]["isError"], true, "target: {target}");
        assert_eq!(
            result["result"]["structuredContent"]["code"], expected_code,
            "target: {target}"
        );
        assert!(executor.0.lock().unwrap().is_empty(), "target: {target}");
    }
}

#[tokio::test]
async fn mcp_requires_a_string_connection_id_when_the_field_is_present() {
    let (server, executor) = server();
    for connection_id in [json!(42), Value::Null] {
        let result = rpc(
            &server,
            &scope(),
            json!({
                "jsonrpc":"2.0",
                "id":1,
                "method":"tools/call",
                "params":{
                    "name":"apollo__people__search",
                    "connectionId":connection_id,
                    "arguments":{}
                }
            }),
        )
        .await;

        assert_eq!(result["error"]["code"], -32600);
        assert!(executor.0.lock().unwrap().is_empty());
    }
}

#[tokio::test]
async fn mcp_rejects_empty_connection_id_before_dispatch() {
    let executor = Executor::default();
    let server = Server::new(
        registry(),
        Connections(vec![connection("brand", "p", "brand")]),
        executor.clone(),
        (),
    );
    let result = rpc(
        &server,
        &scope(),
        json!({
            "jsonrpc":"2.0",
            "id":1,
            "method":"tools/call",
            "params":{
                "name":"apollo__people__search",
                "connectionId":"",
                "arguments":{}
            }
        }),
    )
    .await;

    assert_eq!(result["result"]["isError"], true);
    assert_eq!(
        result["result"]["structuredContent"]["code"],
        "INVALID_TOOL_INPUT"
    );
    assert!(executor.0.lock().unwrap().is_empty());
}

#[tokio::test]
async fn mcp_caller_idempotency_key_is_forwarded_outside_provider_arguments() {
    let (s, e) = server();
    let result = rpc(
        &s,
        &scope(),
        json!({
            "jsonrpc":"2.0",
            "id":1,
            "method":"tools/call",
            "params":{
                "name":"apollo__people__search",
                "idempotencyKey":"fixture-key",
                "arguments":{"query":"Ada"}
            }
        }),
    )
    .await;

    assert_eq!(result["result"]["isError"], false);
    let calls = e.0.lock().unwrap();
    assert_eq!(calls.len(), 1);
    assert_eq!(calls[0].idempotency_key, "fixture-key");
    assert_eq!(calls[0].input, json!({"query":"Ada"}));
}

#[tokio::test]
async fn mcp_omitted_idempotency_keys_dispatch_independently_with_empty_execute_keys() {
    let (s, e) = server();
    let request = |id| {
        json!({
            "jsonrpc":"2.0",
            "id":id,
            "method":"tools/call",
            "params":{
                "name":"apollo__people__search",
                "arguments":{"query":"Ada"}
            }
        })
    };

    let first = rpc(&s, &scope(), request(1)).await;
    let second = rpc(&s, &scope(), request(2)).await;

    assert_eq!(first["result"]["isError"], false);
    assert_eq!(second["result"]["isError"], false);
    let calls = e.0.lock().unwrap();
    assert_eq!(calls.len(), 2);
    assert!(calls.iter().all(|call| call.idempotency_key.is_empty()));
    assert!(calls
        .iter()
        .all(|call| call.input == json!({"query":"Ada"})));
}

#[tokio::test]
async fn mcp_rejects_explicit_empty_idempotency_key_before_executor_dispatch() {
    let (s, e) = server();
    let result = rpc(
        &s,
        &scope(),
        json!({
            "jsonrpc":"2.0",
            "id":1,
            "method":"tools/call",
            "params":{
                "name":"apollo__people__search",
                "idempotencyKey":"",
                "arguments":{}
            }
        }),
    )
    .await;

    assert_eq!(result["result"]["isError"], true);
    assert_eq!(
        result["result"]["structuredContent"]["code"],
        "INVALID_TOOL_INPUT"
    );
    assert!(e.0.lock().unwrap().is_empty());
}

#[tokio::test]
async fn mcp_rejects_idempotency_keys_outside_the_action_contract_before_dispatch() {
    let (s, e) = server();
    for key in [
        "a".repeat(129),
        "contains space".into(),
        "line\nbreak".into(),
        "é".into(),
    ] {
        let result = rpc(
            &s,
            &scope(),
            json!({
                "jsonrpc":"2.0",
                "id":1,
                "method":"tools/call",
                "params":{
                    "name":"apollo__people__search",
                    "idempotencyKey":key,
                    "arguments":{}
                }
            }),
        )
        .await;

        assert_eq!(result["result"]["isError"], true, "key: {key:?}");
        assert_eq!(
            result["result"]["structuredContent"]["code"], "INVALID_TOOL_INPUT",
            "key: {key:?}"
        );
        assert!(!result.to_string().contains(&key));
    }
    assert!(e.0.lock().unwrap().is_empty());
}

#[tokio::test]
async fn mcp_requires_a_string_idempotency_key_when_the_field_is_present() {
    let (s, e) = server();
    let result = rpc(
        &s,
        &scope(),
        json!({
            "jsonrpc":"2.0",
            "id":1,
            "method":"tools/call",
            "params":{
                "name":"apollo__people__search",
                "idempotencyKey":42,
                "arguments":{}
            }
        }),
    )
    .await;

    assert_eq!(result["error"]["code"], -32600);
    assert!(e.0.lock().unwrap().is_empty());
}

#[tokio::test]
async fn mcp_rejects_null_idempotency_key_before_executor_dispatch() {
    let (s, e) = server();
    let result = rpc(
        &s,
        &scope(),
        json!({
            "jsonrpc":"2.0",
            "id":1,
            "method":"tools/call",
            "params":{
                "name":"apollo__people__search",
                "idempotencyKey":null,
                "arguments":{}
            }
        }),
    )
    .await;

    assert_eq!(result["error"]["code"], -32600);
    assert!(e.0.lock().unwrap().is_empty());
}

#[tokio::test]
async fn malformed_params_unknown_tool_and_platform_fallback() {
    let e = Executor::default();
    let s = Server::new(
        registry(),
        Connections(vec![
            connection("a", "p", "other"),
            connection("z", "p", ""),
        ]),
        e.clone(),
        MemoryUsage::default(),
    );
    let sc = scope();
    for params in [json!([]), json!({"name":3}), json!({})] {
        assert_eq!(
            rpc(
                &s,
                &sc,
                json!({"jsonrpc":"2.0","id":1,"method":"tools/call","params":params})
            )
            .await["error"]["code"],
            -32600
        );
    }
    let r=rpc(&s,&sc,json!({"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"apollo__people__search"}})).await;
    assert_eq!(r["result"]["isError"], false);
    assert_eq!(e.0.lock().unwrap()[0].connection_id, "z");
    let r = rpc(
        &s,
        &sc,
        json!({"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"apollo____search"}}),
    )
    .await;
    assert_eq!(r["result"]["structuredContent"]["code"], "UNKNOWN_TOOL");
}
#[tokio::test]
async fn explicit_null_input_is_not_replaced_by_default_object() {
    let (s, e) = server();
    rpc(&s,&scope(),json!({"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"apollo__people__search","arguments":null}})).await;
    assert_eq!(e.0.lock().unwrap()[0].input, Value::Null);
}
struct BrokenConnections;
impl ConnectionLister for BrokenConnections {
    async fn list(&self, _: &str) -> Result<Vec<Connection>, InfrastructureError> {
        Err(InfrastructureError)
    }
}
#[tokio::test]
async fn infrastructure_failures_are_protocol_errors() {
    let s = Server::new(registry(), BrokenConnections, Executor::default(), ());
    for (method, params) in [
        ("tools/list", json!({})),
        ("tools/call", json!({"name":"apollo__people__search"})),
    ] {
        let r = rpc(
            &s,
            &scope(),
            json!({"jsonrpc":"2.0","id":1,"method":method,"params":params}),
        )
        .await;
        assert_eq!(r["error"]["code"], -32603);
    }
}
struct WaitingExecutor(Arc<std::sync::atomic::AtomicBool>);
impl ActionExecutor for WaitingExecutor {
    async fn execute(&self, _: ExecuteRequest) -> Result<ExecuteResult, ActionError> {
        struct Guard(Arc<std::sync::atomic::AtomicBool>);
        impl Drop for Guard {
            fn drop(&mut self) {
                self.0.store(true, std::sync::atomic::Ordering::SeqCst)
            }
        }
        let _guard = Guard(self.0.clone());
        std::future::pending().await
    }
}
#[tokio::test]
async fn dropping_http_future_cancels_action_and_does_not_count_usage() {
    let dropped = Arc::new(std::sync::atomic::AtomicBool::new(false));
    let s = Server::new(
        registry(),
        Connections(vec![connection("a", "p", "brand")]),
        WaitingExecutor(dropped.clone()),
        MemoryUsage::default(),
    );
    let request = json!({"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"apollo__people__search"}});
    assert!(tokio::time::timeout(
        std::time::Duration::from_millis(10),
        rpc(&s, &scope(), request)
    )
    .await
    .is_err());
    assert!(dropped.load(std::sync::atomic::Ordering::SeqCst));
    assert!(s.usage().list("p", "brand").unwrap().is_empty());
}
#[tokio::test]
async fn project_brand_isolation_and_unknown_profile_compatibility() {
    let s = Server::new(
        registry(),
        Connections(vec![
            connection("a", "p", "other"),
            connection("b", "evil", "brand"),
        ]),
        Executor::default(),
        (),
    );
    assert!(s.list_tools(&scope()).await.unwrap().is_empty());
    let r = s
        .call_tool(&scope(), "apollo__people__search", json!({}))
        .await
        .unwrap();
    assert_eq!(r["structuredContent"]["code"], "CONNECTION_REQUIRED");
    let (s, _) = server();
    assert_eq!(
        s.list_tools(&Scope::new("p", "brand").with_profile("future"))
            .await
            .unwrap()
            .len(),
        2
    );
    assert!(tool_allowed(
        "sena_mvt",
        "google-workspace",
        "sheets.spreadsheets.batchUpdate"
    ));
    assert!(!tool_allowed(
        "sena_mvt",
        "google-workspace",
        "gmail.messages.send"
    ));
    assert_eq!(profile_connectors("sena_mvt").unwrap().len(), 9);
}
#[tokio::test]
async fn go_compatible_typed_json_request_errors() {
    let (s, _) = server();
    assert!(s.handle(&scope(), b"null").await.is_none());
    for request in [
        json!({"jsonrpc":2,"method":"ping","id":1}),
        json!({"jsonrpc":"2.0","method":4,"id":1}),
        json!([]),
    ] {
        let result = s
            .handle(&scope(), &serde_json::to_vec(&request).unwrap())
            .await
            .unwrap();
        assert_eq!(result["error"]["code"], -32700);
    }
}
struct NoStorage;
impl appcall_actions::ActionRepository for NoStorage {
    async fn record_replay(
        &self,
        _: &appcall_actions::Attempt,
        _: &Value,
    ) -> appcall_actions::Result<String> {
        panic!("invalid requests must not record replay")
    }
    async fn connection(
        &self,
        _: &str,
        _: &str,
    ) -> appcall_actions::Result<appcall_actions::Connection> {
        panic!("invalid requests must not reach storage")
    }
    async fn acquire(
        &self,
        _: &appcall_actions::Attempt,
    ) -> appcall_actions::Result<appcall_actions::Acquisition> {
        panic!("unexpected acquire")
    }
    async fn mark_dispatched(&self, _: &appcall_actions::Attempt) -> appcall_actions::Result<()> {
        panic!("unexpected dispatch")
    }
    async fn release_pending(&self, _: &appcall_actions::Attempt) -> appcall_actions::Result<()> {
        panic!("unexpected release")
    }
    async fn finish(
        &self,
        _: &appcall_actions::Attempt,
        _: Option<&Value>,
        _: Option<&str>,
    ) -> appcall_actions::Result<()> {
        panic!("unexpected finish")
    }
}
struct NoCredentials;
impl appcall_actions::CredentialResolver for NoCredentials {
    async fn resolve(
        &self,
        _: &appcall_actions::Connection,
        _: &str,
    ) -> appcall_actions::Result<serde_json::Map<String, Value>> {
        panic!("invalid requests must not resolve credentials")
    }
}
struct NoRunner;
impl appcall_actions::ActionRunner for NoRunner {
    async fn execute(
        &self,
        _: &appcall_actions::Attempt,
        _: Value,
        _: u64,
    ) -> Result<Value, appcall_actions::RunnerFailure> {
        panic!("invalid requests must not dispatch")
    }
}
#[tokio::test]
async fn concrete_action_adapter_enforces_missing_scope_and_invalid_input() {
    let actions = appcall_actions::Service::new(
        NoStorage,
        registry(),
        NoCredentials,
        NoRunner,
        appcall_actions::ReadOnlyPolicy,
    );
    let s = Server::new(
        registry(),
        Connections(vec![connection("a", "p", "")]),
        actions,
        (),
    );
    let missing = s
        .call_tool(&Scope::new("p", ""), "apollo__people__search", json!({}))
        .await
        .unwrap();
    assert_eq!(
        missing["structuredContent"]["code"],
        "MISSING_ACCOUNT_SCOPE"
    );
    for input in [Value::Null, json!([]), json!(42), json!("secret")] {
        let invalid = s
            .call_tool(&scope(), "apollo__people__search", input)
            .await
            .unwrap();
        assert_eq!(invalid["structuredContent"]["code"], "INVALID_TOOL_INPUT");
    }
}

#[tokio::test]
async fn action_failure_metadata_is_preserved_in_mcp_wire_result() {
    let (s, _) = server();
    let oversized = s
        .call_tool(&scope(), "apollo__people__search", json!({"oversize":true}))
        .await
        .unwrap();
    let message = oversized["structuredContent"]["message"].as_str().unwrap();
    assert!(message.contains("5000 bytes"));
    assert!(message.contains("1000-byte limit"));
    assert!(message.contains("withheld"));
    let detailed = s
        .call_tool(&scope(), "apollo__people__search", json!({"detail":true}))
        .await
        .unwrap();
    assert_eq!(
        detailed["structuredContent"]["message"],
        "Tool execution failed: NOTE_TOO_LONG: Please shorten the invitation note."
    );
}
