import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";

describe("apollo connector manifest", () => {
  test("declares key, name, runtime, and version", () => {
    expect(manifest.key).toBe("apollo");
    expect(manifest.name).toBe("Apollo");
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.runtime).toBe("bun");
  });

  test("categories include crm", () => {
    expect(manifest.categories).toContain("crm");
  });

  test("auth is api_key with apiKey field", () => {
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.auth.setup.mode).toBe("api_key");
    expect(manifest.auth.setup.fields).toHaveLength(1);
    const field = manifest.auth.setup.fields[0];
    expect(field.key).toBe("apiKey");
    expect(field.required).toBe(true);
    expect(field.secret).toBe(true);
  });

  test("network allows api.apollo.io", () => {
    expect(manifest.network.allowedHosts).toEqual(["api.apollo.io"]);
  });

  test("models include person, organization, contact, account", () => {
    expect(manifest.models).toContain("person");
    expect(manifest.models).toContain("organization");
    expect(manifest.models).toContain("contact");
    expect(manifest.models).toContain("account");
  });

  test("healthcheck operation is an action with required fields", () => {
    const ops = manifest.operations as Record<string, { kind: string; title?: string; description?: string; inputSchema?: { type: string } }>;
    expect(ops["healthcheck"]).toBeDefined();
    expect(ops["healthcheck"].kind).toBe("action");
    expect(typeof ops["healthcheck"].title).toBe("string");
    expect(typeof ops["healthcheck"].description).toBe("string");
  });

  const actionKeys = [
    "healthcheck",
    "people.search",
    "people.match",
    "people.bulk_match",
    "organizations.search",
    "organizations.enrich",
    "organizations.bulk_enrich",
    "organizations.job_postings",
    "contacts.create",
    "contacts.update",
    "contacts.search",
    "accounts.create",
    "accounts.update",
    "sequences.search",
    "sequences.add_contacts",
    "email_accounts.list",
    "users.search",
  ];

  test("includes all expected action operations", () => {
    const ops = manifest.operations as Record<string, { kind: string }>;
    for (const key of actionKeys) {
      expect(ops[key]).toBeDefined();
      expect(ops[key].kind).toBe("action");
    }
  });

  test("all action operations have title and description", () => {
    const ops = manifest.operations as Record<string, { kind: string; title?: string; description?: string }>;
    for (const key of actionKeys) {
      expect(typeof ops[key].title).toBe("string");
      expect((ops[key].title as string).length).toBeGreaterThan(0);
      expect(typeof ops[key].description).toBe("string");
      expect((ops[key].description as string).length).toBeGreaterThan(0);
    }
  });

  test("all action operations have timeoutMs, maxInputBytes, maxResponseBytes > 0", () => {
    const ops = manifest.operations as Record<string, { timeoutMs: number; maxInputBytes: number; maxResponseBytes: number }>;
    for (const key of actionKeys) {
      expect(ops[key].timeoutMs).toBeGreaterThan(0);
      expect(ops[key].maxInputBytes).toBeGreaterThan(0);
      expect(ops[key].maxResponseBytes).toBeGreaterThan(0);
    }
  });

  test("all action operations have object inputSchema", () => {
    const ops = manifest.operations as Record<string, { kind: string; inputSchema?: { type: string; required?: unknown[] } }>;
    for (const key of actionKeys) {
      expect(ops[key].inputSchema).toBeDefined();
      expect(ops[key].inputSchema!.type).toBe("object");
    }
  });
});
