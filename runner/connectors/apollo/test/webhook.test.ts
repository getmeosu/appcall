import { describe, expect, test } from "bun:test";
import { parseWebhook } from "../src/webhook";

describe("parseWebhook", () => {
  test("extracts personId and phone from a nested person with phone_numbers", () => {
    const result = parseWebhook({
      person: {
        id: "5f1a2b3c",
        phone_numbers: [{ raw_number: "+1 (555) 010-1234", sanitized_number: "+15550101234" }],
      },
    });
    expect(result.operation).toBe("webhook.phone_revealed");
    expect(result.sanitized).toEqual({ personId: "5f1a2b3c", phone: "+15550101234" });
    expect(result.idempotencyKey).toBe("apollo-wh:5f1a2b3c:+15550101234");
  });

  test("prefers sanitized_number, falls back to raw_number when sanitized absent", () => {
    const result = parseWebhook({
      person: { id: "p1", phone_numbers: [{ raw_number: "+15550000000" }] },
    });
    expect((result.sanitized as Record<string, unknown>).phone).toBe("+15550000000");
  });

  test("reads a flat top-level person_id + phone shape", () => {
    const result = parseWebhook({ person_id: "p2", phone: "+15551112222" });
    expect(result.sanitized).toEqual({ personId: "p2", phone: "+15551112222" });
  });

  test("reads the first entry of a people array", () => {
    const result = parseWebhook({
      people: [{ id: "p3", phone_numbers: [{ sanitized_number: "+15553334444" }] }],
    });
    expect(result.sanitized).toEqual({ personId: "p3", phone: "+15553334444" });
  });

  test("prefers an explicit event_id-derived suffix when phone is missing", () => {
    const result = parseWebhook({ person: { id: "p4" }, event_id: "evt_9" });
    expect(result.sanitized).toEqual({ personId: "p4", phone: "" });
    expect(result.idempotencyKey).toBe("apollo-wh:p4:evt_9");
  });

  test("redelivery of the same reveal collapses to the same idempotency key", () => {
    const payload = { person: { id: "p5", phone_numbers: [{ sanitized_number: "+15550009999" }] } };
    expect(parseWebhook(payload).idempotencyKey).toBe(parseWebhook(payload).idempotencyKey);
  });

  test("tolerates a non-object payload", () => {
    const result = parseWebhook("not-an-object");
    expect(result.operation).toBe("webhook.phone_revealed");
    expect(result.idempotencyKey).toBe("apollo-wh:unknown");
    expect(result.sanitized).toEqual({});
  });

  test("does not throw on an empty object and yields blank correlation fields", () => {
    const result = parseWebhook({});
    expect(result.sanitized).toEqual({ personId: "", phone: "" });
    expect(result.idempotencyKey).toBe("apollo-wh:unknown:unknown");
  });
});
