use appcall_sync::*;
use serde_json::json;
#[test]
fn persisted_input_cannot_supply_credentials_or_cursor() {
    for input in [
        json!({"accessToken":"secret"}),
        json!({"cursor":"old"}),
        json!(null),
        json!({"limit":101}),
    ] {
        assert_eq!(validate_input(&input), Err(Error::InvalidInput));
    }
    assert!(validate_input(&json!({"channelId":"C123","limit":100})).is_ok());
}
#[test]
fn retry_hint_is_floor_and_bounded() {
    let c = Config::default();
    assert_eq!(c.retry_delay(0, Some(120)).as_secs(), 120);
    assert_eq!(c.retry_delay(u32::MAX, Some(u64::MAX)).as_secs(), 86400);
    assert_eq!(c.retry_delay(u32::MAX, None).as_secs(), 3600);
}
#[test]
fn message_page_requires_items_and_valid_records() {
    for v in [
        json!({}),
        json!({"items":null}),
        json!({"items":[{"id":"x"}]}),
    ] {
        assert_eq!(Page::decode(v), Err(Error::InvalidPage));
    }
    assert_eq!(Page::decode(json!({"items":[]})).unwrap().records.len(), 0);
}

#[test]
fn message_page_decodes_terminal_and_continuation_cursors() {
    let terminal_with_null_cursor = Page::decode(json!({"items":[],"cursor":null})).unwrap();
    assert_eq!(terminal_with_null_cursor.next_cursor, "");
    let terminal_without_cursor = Page::decode(json!({"items":[]})).unwrap();
    assert_eq!(terminal_without_cursor.next_cursor, "");
    let continuation = Page::decode(json!({"items":[],"cursor":"next"})).unwrap();
    assert_eq!(continuation.next_cursor, "next");
    assert_eq!(
        Page::decode(json!({"items":[],"cursor":42})),
        Err(Error::InvalidPage)
    );
}

#[test]
fn message_page_accepts_senderless_records_but_rejects_malformed_sender_identity() {
    let page = Page::decode(json!({
        "items":[
            {"id":"gmail:1","provider":"google-workspace","providerMessageId":"1","channelId":"thread-1","senderId":"sender@example.com","modelVersion":"2026-05-16","raw":{}},
            {"id":"outlook:2","provider":"microsoft-365","providerMessageId":"2","channelId":"thread-2","senderId":"","modelVersion":"2026-05-16","raw":{}}
        ],
        "cursor":"next"
    }))
    .unwrap();
    assert_eq!(page.records.len(), 2);
    assert_eq!(page.records[1].sender_id, "");
    assert_eq!(page.next_cursor, "next");

    for sender_id in [json!(null), json!(42)] {
        assert_eq!(
            Page::decode(json!({
                "items":[{"id":"m","provider":"google-workspace","providerMessageId":"1","channelId":"thread","senderId":sender_id,"modelVersion":"2026-05-16","raw":{}}]
            })),
            Err(Error::InvalidPage)
        );
    }
}

#[test]
fn missing_raw_is_not_silently_converted_to_null() {
    let v = json!({"items":[{"id":"m","provider":"slack","providerMessageId":"1","channelId":"C1","senderId":"U1","modelVersion":"2026-05-14"}]});
    assert_eq!(Page::decode(v), Err(Error::InvalidPage));
}
