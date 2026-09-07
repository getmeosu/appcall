import { describe, expect, test } from "bun:test";
import fixture from "../fixtures/message.json";
import { executeMessagesListSync } from "../src/sync";

describe("slack messages.list sync handler", () => {
  test("executes messages.list from a Slack fixture response", () => {
    const result = executeMessagesListSync({
      channelId: "C123",
      response: fixture,
    });

    expect(result).toEqual({
      provider: "slack",
      operation: "messages.list",
      items: [
        {
          id: "slack:C123:1715680861.000100",
          provider: "slack",
          providerMessageId: "1715680861.000100",
          channelId: "C123",
          senderId: "U123",
          text: "hello from slack",
          modelVersion: "2026-05-14",
          raw: fixture.messages[0],
        },
      ],
      cursor: "next-cursor",
    });
  });

  test("rejects invalid messages.list fixture responses", () => {
    expect(() => executeMessagesListSync({
      channelId: "C123",
      response: { ok: true, messages: {} },
    })).toThrow("messages must be an array");
  });
});
