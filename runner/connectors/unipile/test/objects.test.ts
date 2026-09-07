import { describe, expect, test } from "bun:test";
import accountsListFixture from "../fixtures/accounts_list.json";
import accountsEmptyFixture from "../fixtures/accounts_list_empty.json";
import messagesListFixture from "../fixtures/messages_list.json";

import {
  normalizeAccount,
  parseAccountsResponse,
  normalizeMessage,
  parseMessagesResponse,
} from "../src/objects";

// ---------------------------------------------------------------------------
// normalizeAccount
// ---------------------------------------------------------------------------

describe("normalizeAccount", () => {
  test("normalizes an account from fixture", () => {
    const raw = accountsListFixture.items[0] as Record<string, unknown>;
    const result = normalizeAccount(raw);

    expect(result.id).toBe("uni-account:acc_001");
    expect(result.provider).toBe("unipile");
    expect(result.accountId).toBe("acc_001");
    expect(result.name).toBe("John LinkedIn");
    expect(result.type).toBe("LINKEDIN");
    expect(result.status).toBe("OK");
    expect(result.modelVersion).toBe("2026-05-17");
    expect(result.raw).toBe(raw);
  });

  test("normalizes account with missing fields", () => {
    const result = normalizeAccount({});
    expect(result.id).toBe("uni-account:");
    expect(result.provider).toBe("unipile");
    expect(result.accountId).toBe("");
    expect(result.name).toBe("");
    expect(result.type).toBe("");
    expect(result.status).toBe("");
  });

  test("uses 'id' field for accountId", () => {
    const result = normalizeAccount({ id: "acc_xyz", name: "Test", type: "GMAIL", status: "OK" });
    expect(result.id).toBe("uni-account:acc_xyz");
    expect(result.accountId).toBe("acc_xyz");
  });
});

// ---------------------------------------------------------------------------
// parseAccountsResponse
// ---------------------------------------------------------------------------

describe("parseAccountsResponse", () => {
  test("parses accounts_list fixture", () => {
    const result = parseAccountsResponse(accountsListFixture);
    expect(result.accounts).toHaveLength(2);
    expect(result.accounts[0].id).toBe("uni-account:acc_001");
    expect(result.accounts[0].name).toBe("John LinkedIn");
    expect(result.accounts[1].id).toBe("uni-account:acc_002");
    expect(result.accounts[1].name).toBe("John Gmail");
    expect(result.pagination.cursor).toBe("next_cursor_abc123");
  });

  test("parses empty accounts list", () => {
    const result = parseAccountsResponse(accountsEmptyFixture);
    expect(result.accounts).toHaveLength(0);
    expect(result.pagination.cursor).toBeNull();
  });

  test("returns empty for null input", () => {
    const result = parseAccountsResponse(null);
    expect(result.accounts).toEqual([]);
    expect(result.pagination.cursor).toBeNull();
  });

  test("returns empty for non-record input", () => {
    const result = parseAccountsResponse("string");
    expect(result.accounts).toEqual([]);
    expect(result.pagination.cursor).toBeNull();
  });

  test("filters out non-record entries in items array", () => {
    const result = parseAccountsResponse({
      items: [null, { id: "acc_003", name: "Test", type: "LINKEDIN", status: "OK" }, "bad"],
      cursor: null,
    });
    expect(result.accounts).toHaveLength(1);
    expect(result.accounts[0].id).toBe("uni-account:acc_003");
  });

  test("handles 'accounts' key fallback", () => {
    const result = parseAccountsResponse({
      accounts: [{ id: "acc_004", name: "FB", type: "WHATSAPP", status: "OK" }],
      cursor: "abc",
    });
    expect(result.accounts).toHaveLength(1);
    expect(result.pagination.cursor).toBe("abc");
  });
});

// ---------------------------------------------------------------------------
// normalizeMessage
// ---------------------------------------------------------------------------

describe("normalizeMessage", () => {
  test("normalizes a message from fixture", () => {
    const raw = messagesListFixture.items[0] as Record<string, unknown>;
    const result = normalizeMessage(raw);

    expect(result.id).toBe("uni-msg:msg_001");
    expect(result.provider).toBe("unipile");
    expect(result.messageId).toBe("msg_001");
    expect(result.chatId).toBe("chat_001");
    expect(result.senderId).toBe("att_001");
    expect(result.text).toBe("Hi, would love to connect!");
    expect(result.timestamp).toBe("2024-03-10T14:20:00Z");
    expect(result.modelVersion).toBe("2026-05-17");
    expect(result.raw).toBe(raw);
  });

  test("normalizes message with missing fields", () => {
    const result = normalizeMessage({});
    expect(result.id).toBe("uni-msg:");
    expect(result.messageId).toBe("");
    expect(result.chatId).toBe("");
    expect(result.senderId).toBe("");
    expect(result.text).toBe("");
    expect(result.timestamp).toBe("");
  });

  test("falls back to 'body' for text field", () => {
    const result = normalizeMessage({ id: "m1", body: "hello from body" });
    expect(result.text).toBe("hello from body");
  });

  test("falls back to 'timestamp' for timestamp field", () => {
    const result = normalizeMessage({ id: "m1", timestamp: "2024-01-01T00:00:00Z" });
    expect(result.timestamp).toBe("2024-01-01T00:00:00Z");
  });
});

// ---------------------------------------------------------------------------
// parseMessagesResponse
// ---------------------------------------------------------------------------

describe("parseMessagesResponse", () => {
  test("parses messages_list fixture", () => {
    const result = parseMessagesResponse(messagesListFixture);
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0].id).toBe("uni-msg:msg_001");
    expect(result.messages[1].id).toBe("uni-msg:msg_002");
    expect(result.pagination.cursor).toBeNull();
  });

  test("returns empty for null input", () => {
    const result = parseMessagesResponse(null);
    expect(result.messages).toEqual([]);
    expect(result.pagination.cursor).toBeNull();
  });

  test("returns empty for non-record input", () => {
    const result = parseMessagesResponse("bad");
    expect(result.messages).toEqual([]);
    expect(result.pagination.cursor).toBeNull();
  });

  test("handles 'messages' key fallback", () => {
    const result = parseMessagesResponse({
      messages: [{ id: "msg_x", chat_id: "c1", text: "hi", sender_id: "s1", created_at: "2024-01-01" }],
    });
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].id).toBe("uni-msg:msg_x");
  });

  test("filters out non-record entries", () => {
    const result = parseMessagesResponse({
      items: [null, { id: "msg_y" }, "str"],
    });
    expect(result.messages).toHaveLength(1);
  });
});
