import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";

describe("lusha connector manifest", () => {
  test("declares key, runtime, auth, network, operations, and models", () => {
    expect(manifest.key).toBe("lusha");
    expect(manifest.name).toBe("Lusha");
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.runtime).toBe("bun");
  });

  test("auth is api_key with apiKey field", () => {
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.auth.setup.mode).toBe("api_key");
    expect(manifest.auth.setup.fields).toHaveLength(1);
    const field = manifest.auth.setup.fields[0];
    expect(field.key).toBe("apiKey");
    expect(field.label).toBe("API Key");
    expect(field.required).toBe(true);
    expect(field.secret).toBe(true);
  });

  test("network allows api.lusha.com only", () => {
    expect(manifest.network.allowedHosts).toEqual(["api.lusha.com"]);
  });

  test("categories is crm", () => {
    expect(manifest.categories).toContain("crm");
  });

  test("models include person and company", () => {
    expect(manifest.models).toContain("person");
    expect(manifest.models).toContain("company");
    expect(manifest.models).toHaveLength(2);
  });

  test("includes healthcheck action", () => {
    const ops = manifest.operations as Record<string, { kind: string; title?: string; description?: string }>;
    expect(ops["healthcheck"]).toBeDefined();
    expect(ops["healthcheck"].kind).toBe("action");
    expect(typeof ops["healthcheck"].title).toBe("string");
    expect(typeof ops["healthcheck"].description).toBe("string");
  });

  test("includes all 8 required action operations", () => {
    const ops = manifest.operations as Record<string, { kind: string; title?: string; description?: string }>;
    const actionKeys = [
      "healthcheck",
      "person.enrich",
      "company.enrich",
      "prospecting.contact.search",
      "prospecting.contact.enrich",
      "prospecting.company.search",
      "prospecting.company.enrich",
      "bulk.person",
      "usage.get",
    ];
    for (const key of actionKeys) {
      expect(ops[key]).toBeDefined();
      expect(ops[key].kind).toBe("action");
      expect(typeof ops[key].title).toBe("string");
      expect((ops[key].title as string).length).toBeGreaterThan(0);
      expect(typeof ops[key].description).toBe("string");
      expect((ops[key].description as string).length).toBeGreaterThan(0);
    }
  });

  test("all action operations have timeoutMs, maxInputBytes, maxResponseBytes > 0", () => {
    const ops = manifest.operations as Record<string, { kind: string; timeoutMs: number; maxInputBytes: number; maxResponseBytes: number }>;
    for (const [, op] of Object.entries(ops)) {
      expect(op.timeoutMs).toBeGreaterThan(0);
      expect(op.maxInputBytes).toBeGreaterThan(0);
      expect(op.maxResponseBytes).toBeGreaterThan(0);
    }
  });

  test("all action operations have object inputSchema", () => {
    const ops = manifest.operations as Record<string, { kind: string; inputSchema?: { type: string; required?: unknown[] } }>;
    for (const [, op] of Object.entries(ops)) {
      expect(op.inputSchema).toBeDefined();
      expect(op.inputSchema!.type).toBe("object");
      expect(Array.isArray(op.inputSchema!.required)).toBe(true);
    }
  });
});
