import { describe, expect, it } from "bun:test";
import { normalizeEvent, detectEventType } from "../src/objects";

describe("normalizeEvent", () => {
  it("maps all fields with defaults", () => {
    const evt = normalizeEvent({
      eventType: "push",
      source: "github",
    });

    expect(evt.id).toMatch(/^webhook-evt:/);
    expect(evt.provider).toBe("webhook");
    expect(evt.eventType).toBe("push");
    expect(evt.source).toBe("github");
    expect(evt.payload).toBeNull();
    expect(evt.headers).toEqual({});
    expect(evt.raw).toBeNull();
    expect(evt.receivedAt).toBeDefined();
  });

  it("uses provided values when given", () => {
    const headers = { "content-type": "application/json", "x-signature": "abc123" };
    const payload = { action: "opened", repo: "panora" };

    const evt = normalizeEvent({
      id: "evt-custom-42",
      eventType: "pull_request",
      source: "github",
      payload,
      headers,
    });

    expect(evt.id).toBe("evt-custom-42");
    expect(evt.eventType).toBe("pull_request");
    expect(evt.source).toBe("github");
    expect(evt.payload).toEqual(payload);
    expect(evt.headers).toEqual(headers);
    expect(evt.raw).toEqual(payload);
  });
});

describe("detectEventType", () => {
  it("detects event type from X-Event header", () => {
    const type = detectEventType({ "X-Event": "order.created" }, {});
    expect(type).toBe("order.created");
  });

  it("detects event type from X-Event-Type header", () => {
    const type = detectEventType({ "X-Event-Type": "user.signup" }, {});
    expect(type).toBe("user.signup");
  });

  it("detects event type from X-GitHub-Event header", () => {
    const type = detectEventType({ "X-GitHub-Event": "push" }, {});
    expect(type).toBe("push");
  });

  it("detects event type from CloudEvents ce-type header", () => {
    const type = detectEventType({ "ce-type": "com.example.foo" }, {});
    expect(type).toBe("com.example.foo");
  });

  it("falls back to payload.event field", () => {
    const type = detectEventType({}, { event: "payment.completed", data: {} });
    expect(type).toBe("payment.completed");
  });

  it("falls back to payload.type field", () => {
    const type = detectEventType({}, { type: "stripe.invoice.paid" });
    expect(type).toBe("stripe.invoice.paid");
  });

  it("prefers header over payload field", () => {
    const type = detectEventType(
      { "X-Event": "header.event" },
      { event: "payload.event" },
    );
    expect(type).toBe("header.event");
  });

  it("returns unknown when no type information is available", () => {
    const type = detectEventType({}, null);
    expect(type).toBe("unknown");
  });

  it("returns unknown for array payload", () => {
    const type = detectEventType({}, [1, 2, 3]);
    expect(type).toBe("unknown");
  });
});
