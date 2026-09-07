import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";

describe("saleshandy connector manifest", () => {
  test("declares key, runtime, auth, network, operations, and models", () => {
    expect(manifest.key).toBe("saleshandy");
    expect(manifest.name).toBe("SalesHandy");
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.runtime).toBe("bun");
  });

  test("auth is api_key with apiKey field", () => {
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.auth.setup.mode).toBe("api_key");
    expect(manifest.auth.setup.fields).toHaveLength(1);
    expect(manifest.auth.setup.fields[0].key).toBe("apiKey");
    expect(manifest.auth.setup.fields[0].required).toBe(true);
    expect(manifest.auth.setup.fields[0].secret).toBe(true);
  });

  test("network allows open-api.saleshandy.com", () => {
    expect(manifest.network.allowedHosts).toEqual(["open-api.saleshandy.com"]);
  });

  test("models include sequence, prospect, email-account", () => {
    expect(manifest.models).toContain("sequence");
    expect(manifest.models).toContain("prospect");
    expect(manifest.models).toContain("email-account");
  });

  test("categories include email-marketing", () => {
    expect(manifest.categories).toContain("email-marketing");
  });

  test("healthcheck is an action op with proper schema", () => {
    const hc = manifest.operations["healthcheck"];
    expect(hc.kind).toBe("action");
    expect(hc.timeoutMs).toBe(5000);
    expect(hc.maxInputBytes).toBe(4096);
    expect(hc.maxResponseBytes).toBe(65536);
  });

  test("all action operations have title, description, inputSchema", () => {
    const ops = manifest.operations as Record<string, { kind: string; title?: string; description?: string; inputSchema?: { type: string; required?: unknown[] } }>;
    const actionOps = Object.entries(ops).filter(([, op]) => op.kind === "action").map(([k]) => k);
    expect(actionOps.length).toBeGreaterThan(0);
    for (const key of actionOps) {
      expect(typeof ops[key].title).toBe("string");
      expect((ops[key].title as string).length).toBeGreaterThan(0);
      expect(typeof ops[key].description).toBe("string");
      expect((ops[key].description as string).length).toBeGreaterThan(0);
      expect(ops[key].inputSchema).toBeDefined();
      expect(ops[key].inputSchema!.type).toBe("object");
      expect(Array.isArray(ops[key].inputSchema!.required)).toBe(true);
    }
  });

  test("all action operations have timeoutMs, maxInputBytes, maxResponseBytes > 0", () => {
    const ops = manifest.operations as Record<string, { kind: string; timeoutMs: number; maxInputBytes: number; maxResponseBytes: number }>;
    const actionOps = Object.keys(ops).filter((k) => ops[k].kind === "action");
    for (const key of actionOps) {
      expect(ops[key].timeoutMs).toBeGreaterThan(0);
      expect(ops[key].maxInputBytes).toBeGreaterThan(0);
      expect(ops[key].maxResponseBytes).toBeGreaterThan(0);
    }
  });

  test("includes all expected action operations", () => {
    const ops = manifest.operations as Record<string, { kind: string }>;
    const expectedOps = [
      "healthcheck",
      "sequences.list",
      "sequences.get",
      "sequences.create",
      "sequences.pause",
      "sequences.resume",
      "sequence.steps.list",
      "prospects.add_to_sequence",
      "prospects.list",
      "prospects.get",
      "prospects.update",
      "prospects.pause",
      "prospects.resume",
      "prospects.unsubscribe",
      "email_accounts.list",
    ];
    for (const key of expectedOps) {
      expect(ops[key]).toBeDefined();
      expect(ops[key].kind).toBe("action");
    }
  });
});
