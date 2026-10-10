import { describe, expect, it } from "bun:test";
import { parseWebhook } from "../src/webhook";
import payload from "../fixtures/webhook_form_response.json";

describe("typeform webhook parser", () => {
  it("classifies a completed form_response as webhook.form_response", () => {
    const parsed = parseWebhook(payload);
    expect(parsed.operation).toBe("webhook.form_response");
    expect(parsed.idempotencyKey).toBe("evt_01fixture");
    expect(parsed.sanitized).toMatchObject({
      eventType: "form_response",
      formId: "abc123",
      token: "resp_001",
    });
  });

  it("rejects non-objects", () => {
    expect(() => parseWebhook("nope")).toThrow("webhook payload must be an object");
  });
});
