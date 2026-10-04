import { describe, expect, test } from "bun:test";
import webhookFixture from "../fixtures/webhook_message.json";
import { parseWebhook } from "../src/webhook";
import manifest from "../manifest.json";

describe("whatsapp webhook.message_received", () => {
  test("is EventOnly like apollo webhook.phone_revealed", () => {
    const webhook = (manifest.operations as Record<string, Record<string, unknown>>)["webhook.message_received"];
    expect(webhook.kind).toBe("webhook");
    expect(webhook.request).toBeUndefined();
    expect(webhook.title ?? "").toBe("");
    expect(webhook.inputSchema).toBeUndefined();
  });

  test("extracts the inbound message id, sender, and text", () => {
    const result = parseWebhook(webhookFixture);
    expect(result.operation).toBe("webhook.message_received");
    expect(result.sanitized).toEqual({
      messageId: "wamid.HBgINCOMING0001=",
      from: "15557654321",
      phoneNumberId: "123456789",
      type: "text",
      text: "hello inbound",
      timestamp: "1710000000",
    });
    expect(result.idempotencyKey).toBe("whatsapp-wh:wamid.HBgINCOMING0001=");
  });

  test("collapses redelivery of the same inbound message", () => {
    expect(parseWebhook(webhookFixture).idempotencyKey).toBe(parseWebhook(webhookFixture).idempotencyKey);
  });

  test("tolerates a non-object payload", () => {
    const result = parseWebhook("not-an-object");
    expect(result.operation).toBe("webhook.message_received");
    expect(result.idempotencyKey).toBe("whatsapp-wh:unknown");
    expect(result.sanitized).toEqual({});
  });
});
