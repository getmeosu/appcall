import { describe, expect, test } from "bun:test";
import fixture from "../fixtures/update.json";
import { executeMessagesListSync } from "../src/sync";

describe("telegram messages.list sync handler", () => {
  test("executes messages.list from a Telegram fixture response", () => {
    const result = executeMessagesListSync({
      response: fixture,
    });

    expect(result).toEqual({
      provider: "telegram",
      operation: "messages.list",
      items: [
        {
          id: "telegram:1001:42",
          provider: "telegram",
          providerMessageId: "42",
          channelId: "1001",
          senderId: "501",
          text: "hello from telegram",
          modelVersion: "2026-05-14",
          raw: fixture.result[0],
        },
      ],
      cursor: "778",
    });
  });

  test("rejects invalid messages.list fixture responses", () => {
    expect(() => executeMessagesListSync({
      response: { ok: true, result: {} },
    })).toThrow("result must be an array");
  });
});
