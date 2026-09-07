import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";

describe("rb2b connector manifest", () => {
  test("declares key, name, runtime, version", () => {
    expect(manifest.key).toBe("rb2b");
    expect(manifest.name).toBe("RB2B");
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.runtime).toBe("bun");
  });

  test("auth is api_key with optional apiKey field", () => {
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.auth.setup.mode).toBe("api_key");
    expect(manifest.auth.setup.fields).toHaveLength(1);
    const field = manifest.auth.setup.fields[0];
    expect(field.key).toBe("apiKey");
    expect(field.required).toBe(false);
    expect(field.secret).toBe(true);
  });

  test("network allows app.rb2b.com and rb2b.com", () => {
    expect(manifest.network.allowedHosts).toContain("app.rb2b.com");
    expect(manifest.network.allowedHosts).toContain("rb2b.com");
  });

  test("operations include webhook.visitor_identified, visitors.parse, and healthcheck", () => {
    const ops = manifest.operations as Record<string, { kind: string }>;
    expect(ops["webhook.visitor_identified"].kind).toBe("webhook");
    expect(ops["visitors.parse"].kind).toBe("action");
    expect(ops["healthcheck"].kind).toBe("action");
  });

  test("action operations have title and description", () => {
    const ops = manifest.operations as Record<string, { kind: string; title?: string; description?: string }>;
    const actionKeys = ["visitors.parse", "healthcheck"];
    for (const key of actionKeys) {
      expect(ops[key]).toBeDefined();
      expect(typeof ops[key].title).toBe("string");
      expect((ops[key].title as string).length).toBeGreaterThan(0);
      expect(typeof ops[key].description).toBe("string");
      expect((ops[key].description as string).length).toBeGreaterThan(0);
    }
  });

  test("action operations have timeoutMs, maxInputBytes, maxResponseBytes", () => {
    const ops = manifest.operations as Record<string, { kind: string; timeoutMs: number; maxInputBytes: number; maxResponseBytes: number }>;
    const actionKeys = ["visitors.parse", "healthcheck"];
    for (const key of actionKeys) {
      expect(ops[key].timeoutMs).toBeGreaterThan(0);
      expect(ops[key].maxInputBytes).toBeGreaterThan(0);
      expect(ops[key].maxResponseBytes).toBeGreaterThan(0);
    }
  });

  test("action operations have object inputSchema with required array", () => {
    const ops = manifest.operations as Record<string, { kind: string; inputSchema?: { type: string; required?: unknown[] } }>;
    const actionKeys = ["visitors.parse", "healthcheck"];
    for (const key of actionKeys) {
      expect(ops[key].inputSchema).toBeDefined();
      expect(ops[key].inputSchema!.type).toBe("object");
    }
  });

  test("visitors.parse inputSchema requires payload", () => {
    const op = (manifest.operations as Record<string, { inputSchema?: { required?: string[] } }>)["visitors.parse"];
    expect(op.inputSchema?.required).toContain("payload");
  });

  test("models include visitor", () => {
    expect(manifest.models).toContain("visitor");
  });

  test("categories include crm", () => {
    expect(manifest.categories).toContain("crm");
  });
});
