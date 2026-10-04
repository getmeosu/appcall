import { describe, expect, test } from "bun:test";
import { parseWebhook } from "../src/webhook";
import inviteeCreatedFixture from "../fixtures/webhook_invitee_created.json";

describe("parseWebhook", () => {
  test("maps invitee.created onto webhook.invitee_created", () => {
    const result = parseWebhook(inviteeCreatedFixture);
    expect(result.operation).toBe("webhook.invitee_created");
    expect(result.sanitized).toEqual({
      event: "invitee.created",
      uri: "https://api.calendly.com/scheduled_events/evt_001/invitees/inv_001",
      email: "bob@example.com",
      name: "Bob Smith",
      status: "active",
      scheduledEvent: "https://api.calendly.com/scheduled_events/evt_001",
    });
    expect(result.idempotencyKey).toBe(
      "calendly-wh:invitee.created:https://api.calendly.com/scheduled_events/evt_001/invitees/inv_001",
    );
  });

  test("maps invitee.canceled onto webhook.invitee_canceled", () => {
    const result = parseWebhook({
      event: "invitee.canceled",
      payload: {
        uri: "https://api.calendly.com/scheduled_events/evt_001/invitees/inv_002",
        email: "carol@example.com",
        name: "Carol White",
        status: "canceled",
        event: "https://api.calendly.com/scheduled_events/evt_001",
      },
    });
    expect(result.operation).toBe("webhook.invitee_canceled");
    expect((result.sanitized as Record<string, unknown>).email).toBe("carol@example.com");
    expect(result.idempotencyKey).toContain("invitee.canceled");
  });

  test("maps routing_form_submission.created onto webhook.routing_form_submission", () => {
    const result = parseWebhook({
      event: "routing_form_submission.created",
      payload: {
        uri: "https://api.calendly.com/routing_form_submissions/rfs_001",
        routing_form: "https://api.calendly.com/routing_forms/rf_001",
      },
    });
    expect(result.operation).toBe("webhook.routing_form_submission");
    expect((result.sanitized as Record<string, unknown>).uri).toBe(
      "https://api.calendly.com/routing_form_submissions/rfs_001",
    );
  });

  test("redelivery of the same invitee event collapses to the same idempotency key", () => {
    expect(parseWebhook(inviteeCreatedFixture).idempotencyKey).toBe(
      parseWebhook(inviteeCreatedFixture).idempotencyKey,
    );
  });

  test("tolerates a non-object payload", () => {
    const result = parseWebhook("not-an-object");
    expect(result.operation).toBe("webhook.invitee_created");
    expect(result.idempotencyKey).toBe("calendly-wh:unknown");
    expect(result.sanitized).toEqual({});
  });

  test("does not throw on an empty object", () => {
    const result = parseWebhook({});
    expect(result.operation).toBe("webhook.invitee_created");
    expect(result.idempotencyKey).toBe("calendly-wh:unknown:unknown");
  });
});
