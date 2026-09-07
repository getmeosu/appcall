import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";

describe("zoom connector manifest", () => {
  test("declares key, runtime, auth, network, operations, and models", () => {
    expect(manifest.key).toBe("zoom");
    expect(manifest.name).toBe("Zoom");
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.runtime).toBe("bun");
  });

  test("auth is oauth2 with required scopes", () => {
    expect(manifest.auth.type).toBe("oauth2");
    expect(manifest.auth.scopes).toContain("meeting:read");
    expect(manifest.auth.scopes).toContain("meeting:write");
    expect(manifest.auth.scopes).toContain("user:read");
    expect(manifest.auth.setup.mode).toBe("oauth2");
    expect(manifest.auth.setup.fields).toEqual([]);
  });

  test("network allows api.zoom.us", () => {
    expect(manifest.network.allowedHosts).toEqual(["api.zoom.us"]);
  });

  test("categories includes productivity", () => {
    expect(manifest.categories).toContain("productivity");
  });

  test("models include meeting, user, and webinar", () => {
    expect(manifest.models).toContain("meeting");
    expect(manifest.models).toContain("user");
    expect(manifest.models).toContain("webinar");
  });

  const ACTION_KEYS = [
    "healthcheck",
    "users.me",
    "users.list",
    "meetings.create",
    "meetings.list",
    "meetings.get",
    "meetings.update",
    "meetings.delete",
    "meetings.list_registrants",
    "meetings.add_registrant",
    "past_meetings.participants",
    "webinars.create",
    "webinars.list",
  ];

  test("includes all action operations", () => {
    const ops = manifest.operations as Record<string, { kind: string }>;
    for (const key of ACTION_KEYS) {
      expect(ops[key]).toBeDefined();
      expect(ops[key].kind).toBe("action");
    }
  });

  test("all action operations have title and description", () => {
    const ops = manifest.operations as Record<string, { kind: string; title?: string; description?: string }>;
    for (const key of ACTION_KEYS) {
      expect(typeof ops[key].title).toBe("string");
      expect((ops[key].title as string).length).toBeGreaterThan(0);
      expect(typeof ops[key].description).toBe("string");
      expect((ops[key].description as string).length).toBeGreaterThan(0);
    }
  });

  test("all action operations have timeoutMs, maxInputBytes, maxResponseBytes > 0", () => {
    const ops = manifest.operations as Record<string, { timeoutMs: number; maxInputBytes: number; maxResponseBytes: number }>;
    for (const key of ACTION_KEYS) {
      expect(ops[key].timeoutMs).toBeGreaterThan(0);
      expect(ops[key].maxInputBytes).toBeGreaterThan(0);
      expect(ops[key].maxResponseBytes).toBeGreaterThan(0);
    }
  });

  test("all action operations have object inputSchema with required array", () => {
    const ops = manifest.operations as Record<string, { inputSchema?: { type: string; required?: unknown[] } }>;
    for (const key of ACTION_KEYS) {
      expect(ops[key].inputSchema).toBeDefined();
      expect(ops[key].inputSchema!.type).toBe("object");
      expect(Array.isArray(ops[key].inputSchema!.required)).toBe(true);
    }
  });
});
