import { describe, expect, test } from "bun:test";
import { parseWebhook } from "../src/webhook";

describe("Heyzine webhook parser", () => {
  test("normalizes leads and derives a stable idempotency key", () => {
    const payload = {
      apiKey: "must-not-persist",
      data: {
        id_webhook: "hook-42",
        date: "2026-10-09T12:00:00Z",
        leads: [{ email: "lead@example.com", name: "Ada" }],
        secret: "must-not-persist",
      },
    };

    expect(parseWebhook(payload)).toEqual({
      idempotencyKey: "heyzine-wh:hook-42",
      operation: "webhooks.leads",
      sanitized: {
        data: {
          id_webhook: "hook-42",
          date: "2026-10-09T12:00:00Z",
          leads: [{ email: "lead@example.com", name: "Ada" }],
        },
      },
    });
  });

  test("uses a deterministic fallback when the event id is missing", () => {
    expect(parseWebhook({ data: { date: "2026-10-09T12:00:00Z", leads: [] } }).idempotencyKey)
      .toBe("heyzine-wh:2026-10-09T12:00:00Z");
    expect(parseWebhook({ data: { leads: [] } }).idempotencyKey).toBe("heyzine-wh:unknown");
  });
});
