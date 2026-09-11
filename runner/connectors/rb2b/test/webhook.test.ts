import { describe, expect, test } from "bun:test";
import { parseWebhook, verifyWebhook } from "../src/webhook";
import visitorFixture from "../fixtures/visitor_identified.json";
import partialFixture from "../fixtures/visitor_identified_partial.json";

describe("parseWebhook", () => {
  test("returns idempotencyKey, operation, and a normalized sanitized payload", () => {
    const result = parseWebhook(visitorFixture);
    expect(result.operation).toBe("webhook.visitor_identified");
    expect(result.idempotencyKey).toMatch(/^rb2b-wh:/);
    const sanitized = result.sanitized as Record<string, unknown>;
    expect(sanitized.provider).toBe("rb2b");
    expect(typeof sanitized.id).toBe("string");
    // sanitized is the normalized visitor — has structured identity fields
    expect(sanitized).toHaveProperty("linkedinUrl");
    expect(sanitized).toHaveProperty("workEmail");
  });

  test("prefers an explicit event_id for the idempotency key", () => {
    const result = parseWebhook({ ...visitorFixture, event_id: "evt_abc123" });
    expect(result.idempotencyKey).toBe("rb2b-wh:evt_abc123");
  });

  test("derives a stable key from visitor identity + timestamp when no event id", () => {
    const a = parseWebhook(visitorFixture);
    const b = parseWebhook(visitorFixture);
    expect(a.idempotencyKey).toBe(b.idempotencyKey); // redelivery collapses
  });

  test("handles a partial payload without throwing", () => {
    const result = parseWebhook(partialFixture);
    expect(result.operation).toBe("webhook.visitor_identified");
    expect(result.idempotencyKey).toMatch(/^rb2b-wh:/);
    expect((result.sanitized as Record<string, unknown>).provider).toBe("rb2b");
  });

  test("tolerates a non-object payload", () => {
    const result = parseWebhook("not-an-object");
    expect(result.operation).toBe("webhook.visitor_identified");
    expect(result.idempotencyKey).toBe("rb2b-wh:unknown");
    expect(result.sanitized).toEqual({});
  });

  test("classifies a visitor delivery as a webhook event for independent retention", () => {
    const result = parseWebhook({ ...partialFixture, event_id: "evt_visitor_1" });
    expect(result.operation).toBe("webhook.visitor_identified");
    expect(result.idempotencyKey).toBe("rb2b-wh:evt_visitor_1");
    expect(result.sanitized).toMatchObject({ provider: "rb2b" });
  });
});

describe("verifyWebhook", () => {
  test("accepts when no secret is configured (RB2B default unsigned delivery)", () => {
    expect(verifyWebhook(visitorFixture, {}, undefined)).toBe(true);
    expect(verifyWebhook(visitorFixture, {})).toBe(true);
  });

  test("accepts when the configured secret matches the x-rb2b-token header", () => {
    expect(verifyWebhook(visitorFixture, { "X-RB2B-Token": "shh" }, "shh")).toBe(true);
  });

  test("accepts when the secret matches the x-rb2b-signature header", () => {
    expect(verifyWebhook(visitorFixture, { "x-rb2b-signature": "shh" }, "shh")).toBe(true);
  });

  test("accepts when the secret is echoed in the body", () => {
    expect(verifyWebhook({ ...visitorFixture, token: "shh" }, {}, "shh")).toBe(true);
  });

  test("rejects when a secret is configured but no matching token is presented", () => {
    expect(verifyWebhook(visitorFixture, {}, "shh")).toBe(false);
    expect(verifyWebhook(visitorFixture, { "x-rb2b-token": "wrong" }, "shh")).toBe(false);
  });
});
