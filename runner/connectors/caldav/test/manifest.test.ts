import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";

describe("caldav connector manifest", () => {
  test("declares key, runtime, auth, network, operations, and models", () => {
    expect(manifest.key).toBe("caldav");
    expect(manifest.name).toBe("CalDAV (Apple iCloud & generic)");
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.runtime).toBe("bun");
  });

  test("auth is api_key with username/password/baseUrl fields", () => {
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.auth.setup.mode).toBe("api_key");
    const fields = manifest.auth.setup.fields;
    expect(fields).toHaveLength(3);
    expect(fields[0].key).toBe("username");
    expect(fields[0].required).toBe(true);
    expect(fields[0].secret).toBe(false);
    expect(fields[1].key).toBe("password");
    expect(fields[1].required).toBe(true);
    expect(fields[1].secret).toBe(true);
    expect(fields[2].key).toBe("baseUrl");
    expect(fields[2].required).toBe(false);
  });

  test("categories is scheduling", () => {
    expect(manifest.categories).toContain("scheduling");
  });

  test("models include calendar and event", () => {
    expect(manifest.models).toContain("calendar");
    expect(manifest.models).toContain("event");
  });

  test("network allowedHosts includes iCloud base and partition hosts p01..p99", () => {
    const hosts = manifest.network.allowedHosts as string[];
    expect(hosts).toContain("caldav.icloud.com");
    expect(hosts).toContain("p01-caldav.icloud.com");
    expect(hosts).toContain("p50-caldav.icloud.com");
    expect(hosts).toContain("p99-caldav.icloud.com");
    expect(hosts).toContain("caldav.fastmail.com");
    expect(hosts).toContain("apidata.googleusercontent.com");
    // Should have 1 base + 99 partition + 2 other = 102
    expect(hosts.length).toBe(102);
  });

  test("includes healthcheck action operation", () => {
    const ops = manifest.operations as Record<string, { kind: string; title?: string; description?: string; inputSchema?: { type: string } }>;
    expect(ops["healthcheck"]).toBeDefined();
    expect(ops["healthcheck"].kind).toBe("action");
    expect(ops["healthcheck"].title).toBeDefined();
    expect(ops["healthcheck"].description).toBeDefined();
  });

  const actionKeys = [
    "principal.discover",
    "calendar_home.get",
    "calendars.list",
    "events.list",
    "events.get",
    "events.create",
    "events.update",
    "events.delete",
    "freebusy.query",
  ];

  test("includes all CalDAV action operations", () => {
    const ops = manifest.operations as Record<string, { kind: string }>;
    for (const key of actionKeys) {
      expect(ops[key]).toBeDefined();
      expect(ops[key].kind).toBe("action");
    }
  });

  test("all action operations have title, description, and object inputSchema", () => {
    const ops = manifest.operations as Record<string, { kind: string; title?: string; description?: string; inputSchema?: { type: string; required?: unknown[] } }>;
    const allActionKeys = [...actionKeys, "healthcheck"];
    for (const key of allActionKeys) {
      const op = ops[key];
      expect(op).toBeDefined();
      expect(typeof op.title).toBe("string");
      expect((op.title as string).length).toBeGreaterThan(0);
      expect(typeof op.description).toBe("string");
      expect((op.description as string).length).toBeGreaterThan(0);
      expect(op.inputSchema).toBeDefined();
      expect(op.inputSchema!.type).toBe("object");
    }
  });

  test("all operations have timeoutMs, maxInputBytes, maxResponseBytes > 0", () => {
    const ops = manifest.operations as Record<string, { timeoutMs: number; maxInputBytes: number; maxResponseBytes: number }>;
    for (const key of [...actionKeys, "healthcheck"]) {
      expect(ops[key].timeoutMs).toBeGreaterThan(0);
      expect(ops[key].maxInputBytes).toBeGreaterThan(0);
      expect(ops[key].maxResponseBytes).toBeGreaterThan(0);
    }
  });
});
