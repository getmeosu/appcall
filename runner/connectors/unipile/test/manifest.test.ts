import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";

describe("unipile connector manifest", () => {
  test("declares key, runtime, auth, network, operations, and models", () => {
    expect(manifest.key).toBe("unipile");
    expect(manifest.name).toBe("Unipile");
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.runtime).toBe("bun");
  });

  test("auth is api_key with required fields", () => {
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.auth.setup.mode).toBe("api_key");
    const fields = manifest.auth.setup.fields;
    expect(fields).toHaveLength(2);
    const apiKeyField = fields.find((f) => f.key === "apiKey");
    expect(apiKeyField).toBeDefined();
    expect(apiKeyField?.required).toBe(true);
    expect(apiKeyField?.secret).toBe(true);
    const dsnField = fields.find((f) => f.key === "dsn");
    expect(dsnField).toBeDefined();
    expect(dsnField?.required).toBe(true);
    expect(dsnField?.secret).toBe(false);
  });

  test("network allowedHosts contains all 15 unipile API subdomains", () => {
    const allowed = manifest.network.allowedHosts;
    expect(allowed).toContain("api1.unipile.com");
    expect(allowed).toContain("api8.unipile.com");
    expect(allowed).toContain("api15.unipile.com");
    expect(allowed).toHaveLength(15);
    for (let i = 1; i <= 15; i++) {
      expect(allowed).toContain(`api${i}.unipile.com`);
    }
  });

  test("operations include healthcheck action", () => {
    const ops = manifest.operations as Record<string, { kind: string }>;
    expect(ops["healthcheck"].kind).toBe("action");
  });

  test("all expected action operations are present", () => {
    const ops = manifest.operations as Record<string, { kind: string; title?: string; description?: string }>;
    const expectedOps = [
      "healthcheck",
      "accounts.list",
      "accounts.get",
      "chats.list",
      "chats.get",
      "messages.list",
      "messages.send",
      "chats.start",
      "emails.list",
      "emails.get",
      "emails.send",
      "linkedin.profile.get",
      "linkedin.invitation.send",
      "linkedin.relations.list",
    ];
    for (const key of expectedOps) {
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
    for (const key of Object.keys(ops)) {
      expect(ops[key].timeoutMs).toBeGreaterThan(0);
      expect(ops[key].maxInputBytes).toBeGreaterThan(0);
      expect(ops[key].maxResponseBytes).toBeGreaterThan(0);
    }
  });

  test("all action operations have object inputSchema with required array", () => {
    const ops = manifest.operations as Record<string, { kind: string; inputSchema?: { type: string; required?: unknown[] } }>;
    for (const key of Object.keys(ops)) {
      expect(ops[key].inputSchema).toBeDefined();
      expect(ops[key].inputSchema!.type).toBe("object");
      expect(Array.isArray(ops[key].inputSchema!.required)).toBe(true);
    }
  });

  test("account_id is NOT exposed in any agent-facing input schema (server-injected like apiKey/dsn)", () => {
    // account_id is resolved server-side from the brand's subaccount mapping and
    // injected into the ephemeral dispatch input. It must never appear in the
    // agent-facing manifest schema so callers cannot supply / impersonate it.
    const ops = manifest.operations as Record<string, { inputSchema?: { properties?: Record<string, unknown>; required?: string[] } }>;
    for (const key of Object.keys(ops)) {
      const schema = ops[key].inputSchema;
      expect(schema).toBeDefined();
      const props = schema!.properties ?? {};
      expect(Object.keys(props)).not.toContain("account_id");
      const required = schema!.required ?? [];
      expect(required).not.toContain("account_id");
    }
  });

  test("account-scoped write actions still expose their non-account inputs", () => {
    // chats.start no longer requires account_id but still requires attendees_ids
    const ops = manifest.operations as Record<string, { inputSchema: { properties: Record<string, unknown>; required: string[] } }>;
    expect(ops["chats.start"].inputSchema.required).toEqual(["attendees_ids"]);
    expect(Object.keys(ops["chats.start"].inputSchema.properties)).toContain("attendees_ids");

    // emails.send no longer requires account_id but still requires to/subject/body
    expect(ops["emails.send"].inputSchema.required).toEqual(["to", "subject", "body"]);

    // linkedin.profile.get no longer requires account_id but still requires identifier
    expect(ops["linkedin.profile.get"].inputSchema.required).toEqual(["identifier"]);

    // linkedin.invitation.send no longer requires account_id but still requires provider_id
    expect(ops["linkedin.invitation.send"].inputSchema.required).toEqual(["provider_id"]);

    // linkedin.relations.list no longer requires account_id; required is now empty
    expect(ops["linkedin.relations.list"].inputSchema.required).toEqual([]);
  });

  test("categories is ['messaging']", () => {
    expect(manifest.categories).toEqual(["messaging"]);
  });

  test("models includes account, chat, message, email", () => {
    expect(manifest.models).toContain("account");
    expect(manifest.models).toContain("chat");
    expect(manifest.models).toContain("message");
    expect(manifest.models).toContain("email");
  });
});
