use appcall_web::{DashboardData, DashboardOperation as Op, DashboardRequest, Error};
use std::collections::BTreeMap;

pub async fn assert_invalid_filters(data: &dyn DashboardData, principal: appcall_auth::Principal) {
    for (key, value) in [
        ("createdFrom", "invalid"),
        ("createdBefore", "invalid"),
        ("status", "invalid"),
        ("errorCode", "invalid"),
    ] {
        let result = data
            .execute_detailed(DashboardRequest {
                principal: principal.clone(),
                operation: Op::Logs,
                resource: None,
                account_id: Some("brand".into()),
                fields: [(key.into(), value.into())].into_iter().collect(),
                form_values: Default::default(),
            })
            .await;
        assert!(
            matches!(result, Err(ref e) if e.classification() == Error::Invalid),
            "{key}: expected browser Invalid, got {result:?}"
        );
    }
}

pub async fn assert_log_filters(data: &dyn DashboardData, principal: appcall_auth::Principal) {
    let request = |extra: &[(&str, &str)]| DashboardRequest {
        principal: principal.clone(),
        operation: Op::Logs,
        resource: None,
        account_id: Some("brand".into()),
        fields: [
            ("connector", "test"),
            ("action", "write"),
            ("connectionId", "copy-connection"),
            ("requestId", "filter-request"),
            ("status", "failed"),
            ("errorCode", "ACTION_TIMEOUT"),
        ]
        .into_iter()
        .chain(extra.iter().copied())
        .map(|(k, v)| (k.into(), v.into()))
        .collect::<BTreeMap<_, _>>(),
        form_values: Default::default(),
    };
    let result = data
        .execute(request(&[
            ("createdFrom", "2026-09-07T15:30:00+05:30"),
            ("createdBefore", "2026-09-07T11:00:00Z"),
            ("limit", "1"),
        ]))
        .await
        .unwrap();
    let result = result.get("data").unwrap_or(&result);
    assert_eq!(
        result["logs"][0]["id"], "filter-start",
        "DashboardData must forward both time bounds"
    );
    assert_eq!(result["pagination"]["hasMore"], false);
    for fields in [
        vec![("createdFrom", "invalid")],
        vec![("createdBefore", "2026-09-07T11:00:00")],
        vec![
            ("createdFrom", "2026-09-08T00:00:00Z"),
            ("createdBefore", "2026-09-07T00:00:00Z"),
        ],
    ] {
        let result = data.execute_detailed(request(&fields)).await;
        assert!(
            matches!(result, Err(ref e) if e.classification() == Error::Invalid),
            "invalid time must map to browser Invalid: {result:?}"
        );
    }
    for operation in [Op::Triggers, Op::Stream] {
        let mut r = request(&[("createdFrom", "invalid"), ("createdBefore", "invalid")]);
        r.operation = operation;
        assert!(data.execute(r).await.is_ok(), "time filter is Logs-only");
    }
}
