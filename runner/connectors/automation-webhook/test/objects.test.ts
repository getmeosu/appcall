import { describe, expect, it } from "bun:test";
import { normalizeEvent, parseEventsResponse } from "../src/objects";

describe("normalizeEvent", () => {
  it("normalizes an event with all fields", () => {
    const result = normalizeEvent({
      id: "evt-001",
      source: "zapier",
      event_type: "contact.created",
      payload: { email: "new@example.com", name: "Jane Doe" },
      headers: { "X-Hook-Signature": "sha256=abc", "Content-Type": "application/json" },
      received_at: "2025-07-15T08:00:00Z",
    });
    expect(result.id).toBe("webhook-event:evt-001");
    expect(result.provider).toBe("automation-webhook");
    expect(result.providerEventId).toBe("evt-001");
    expect(result.source).toBe("zapier");
    expect(result.eventType).toBe("contact.created");
    expect(result.payload).toEqual({ email: "new@example.com", name: "Jane Doe" });
    expect(result.headers).toEqual({ "X-Hook-Signature": "sha256=abc", "Content-Type": "application/json" });
    expect(result.receivedAt).toBe("2025-07-15T08:00:00Z");
    expect(result.modelVersion).toBe("2026-05-17");
  });

  it("defaults missing string fields to empty string", () => {
    const result = normalizeEvent({ id: "evt-002" });
    expect(result.source).toBe("");
    expect(result.eventType).toBe("");
    expect(result.receivedAt).toBe("");
  });

  it("defaults missing payload to empty object", () => {
    const result = normalizeEvent({ id: "evt-003" });
    expect(result.payload).toEqual({});
  });

  it("defaults payload to empty object when not a record", () => {
    const result = normalizeEvent({ id: "evt-004", payload: "not-an-object" });
    expect(result.payload).toEqual({});
  });

  it("defaults missing headers to empty object", () => {
    const result = normalizeEvent({ id: "evt-005" });
    expect(result.headers).toEqual({});
  });

  it("filters non-string header values", () => {
    const result = normalizeEvent({
      id: "evt-006",
      headers: { "X-String": "ok", "X-Number": 42, "X-Null": null },
    });
    expect(result.headers).toEqual({ "X-String": "ok" });
  });

  it("preserves raw object", () => {
    const raw = { id: "evt-007", source: "make" };
    const result = normalizeEvent(raw);
    expect(result.raw).toBe(raw);
  });

  it("handles activepieces source", () => {
    const result = normalizeEvent({
      id: "evt-008",
      source: "activepieces",
      event_type: "order.completed",
      payload: { orderId: "ord-123", total: 99.99 },
    });
    expect(result.source).toBe("activepieces");
    expect(result.eventType).toBe("order.completed");
    expect(result.payload).toEqual({ orderId: "ord-123", total: 99.99 });
  });
});

describe("parseEventsResponse", () => {
  it("parses an events response", () => {
    const result = parseEventsResponse({
      events: [
        { id: "evt-a", source: "zapier", event_type: "lead.created", payload: { name: "Alice" } },
        { id: "evt-b", source: "make", event_type: "task.done", payload: { taskId: "t1" } },
      ],
    });
    expect(result.events).toHaveLength(2);
    expect(result.events[0].id).toBe("webhook-event:evt-a");
    expect(result.events[0].source).toBe("zapier");
    expect(result.events[0].eventType).toBe("lead.created");
    expect(result.events[1].id).toBe("webhook-event:evt-b");
    expect(result.events[1].source).toBe("make");
    expect(result.events[1].eventType).toBe("task.done");
  });

  it("returns empty for null input", () => {
    const result = parseEventsResponse(null);
    expect(result.events).toEqual([]);
  });

  it("returns empty for non-object input", () => {
    const result = parseEventsResponse("string");
    expect(result.events).toEqual([]);
  });

  it("returns empty when events is not an array", () => {
    const result = parseEventsResponse({ events: "not-array" });
    expect(result.events).toEqual([]);
  });

  it("returns empty for empty events array", () => {
    const result = parseEventsResponse({ events: [] });
    expect(result.events).toEqual([]);
  });

  it("filters out non-record entries in events", () => {
    const result = parseEventsResponse({ events: [null, "string", { id: "ok" }, 42] });
    expect(result.events).toHaveLength(1);
    expect(result.events[0].id).toBe("webhook-event:ok");
  });

  it("returns empty for object without events key", () => {
    const result = parseEventsResponse({});
    expect(result.events).toEqual([]);
  });
});
