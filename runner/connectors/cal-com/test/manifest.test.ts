import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";

describe("cal-com connector manifest", () => {
  test("declares key, runtime, auth, network, operations, and models", () => {
    expect(manifest.key).toBe("cal-com");
    expect(manifest.name).toBe("Cal.com");
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.runtime).toBe("bun");
  });

  test("auth is external_bearer with no stored fields", () => {
    expect(manifest.auth.type).toBe("external_bearer");
    expect(manifest.auth.setup.mode).toBe("external_bearer");
    expect(manifest.auth.setup.fields).toHaveLength(0);
    expect(manifest.auth.scopes).toContain("BOOKING_WRITE");
  });

  test("network allows api.cal.com", () => {
    expect(manifest.network.allowedHosts).toEqual(["api.cal.com"]);
  });

  test("categories includes scheduling", () => {
    expect(manifest.categories).toContain("scheduling");
  });

  test("models include booking, event-type, schedule", () => {
    expect(manifest.models).toContain("booking");
    expect(manifest.models).toContain("event-type");
    expect(manifest.models).toContain("schedule");
  });

  test("healthcheck operation is defined as action kind", () => {
    const ops = manifest.operations as Record<string, { kind: string; title?: string; description?: string }>;
    expect(ops["healthcheck"].kind).toBe("action");
    expect(typeof ops["healthcheck"].title).toBe("string");
    expect(typeof ops["healthcheck"].description).toBe("string");
  });

  test("all action operations have title, description, and non-empty object inputSchema", () => {
    const ops = manifest.operations as Record<string, { kind: string; title?: string; description?: string; inputSchema?: { type: string; required?: unknown[] } }>;
    const actionKeys = [
      "healthcheck",
      "me.get",
      "event_types.list",
      "event_types.get",
      "bookings.list",
      "bookings.get",
      "bookings.create",
      "bookings.cancel",
      "bookings.reschedule",
      "bookings.confirm",
      "bookings.decline",
      "slots.available",
      "schedules.list",
    ];
    for (const key of actionKeys) {
      expect(ops[key]).toBeDefined();
      expect(ops[key].kind).toBe("action");
      expect(typeof ops[key].title).toBe("string");
      expect((ops[key].title as string).length).toBeGreaterThan(0);
      expect(typeof ops[key].description).toBe("string");
      expect((ops[key].description as string).length).toBeGreaterThan(0);
      expect(ops[key].inputSchema).toBeDefined();
      expect(ops[key].inputSchema!.type).toBe("object");
    }
  });

  test("all operations declare timeout and size bounds > 0", () => {
    const ops = manifest.operations as Record<string, { kind: string; timeoutMs: number; maxInputBytes: number; maxResponseBytes: number }>;
    for (const [, op] of Object.entries(ops)) {
      expect(op.timeoutMs).toBeGreaterThan(0);
      expect(op.maxInputBytes).toBeGreaterThan(0);
      expect(op.maxResponseBytes).toBeGreaterThan(0);
    }
  });
});
