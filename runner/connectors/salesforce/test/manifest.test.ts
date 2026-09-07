import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";

describe("salesforce connector manifest", () => {
  test("manifest declares key, runtime, and auth", () => {
    expect(manifest.key).toBe("salesforce");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.auth.type).toBe("oauth2");
    expect(manifest.auth.scopes).toContain("refresh_token");
    expect(manifest.auth.scopes).toContain("full");
    expect(manifest.auth.scopes).toContain("api");
  });

  test("manifest declares network controls", () => {
    expect(manifest.network.allowedHosts).toContain("login.salesforce.com");
    expect(manifest.network.allowedHosts).toContain("test.salesforce.com");
    expect(manifest.network.allowedHosts).toContain("my.salesforce.com");
  });

  test("manifest declares sync and action operations", () => {
    expect(manifest.operations["contacts.list"].kind).toBe("sync");
    expect(manifest.operations["leads.list"].kind).toBe("sync");
    expect(manifest.operations["accounts.list"].kind).toBe("sync");
    expect(manifest.operations["opportunities.list"].kind).toBe("sync");
    expect(manifest.operations["cases.list"].kind).toBe("sync");
    // original actions
    expect(manifest.operations["contacts.create"].kind).toBe("action");
    expect(manifest.operations["leads.create"].kind).toBe("action");
    expect(manifest.operations["opportunities.create"].kind).toBe("action");
    expect(manifest.operations["cases.create"].kind).toBe("action");
    expect(manifest.operations["healthcheck"].kind).toBe("action");
    // new actions
    expect(manifest.operations["accounts.create"].kind).toBe("action");
    expect(manifest.operations["accounts.get"].kind).toBe("action");
    expect(manifest.operations["accounts.update"].kind).toBe("action");
    expect(manifest.operations["contacts.get"].kind).toBe("action");
    expect(manifest.operations["contacts.update"].kind).toBe("action");
    expect(manifest.operations["contacts.delete"].kind).toBe("action");
    expect(manifest.operations["leads.update"].kind).toBe("action");
    expect(manifest.operations["opportunities.get"].kind).toBe("action");
    expect(manifest.operations["sobjects.query"].kind).toBe("action");
    expect(manifest.operations["sobjects.search"].kind).toBe("action");
  });

  test("all new action operations have non-empty title and description", () => {
    const newOps = [
      "accounts.create", "accounts.get", "accounts.update",
      "contacts.get", "contacts.update", "contacts.delete",
      "leads.update", "opportunities.get",
      "sobjects.query", "sobjects.search",
    ];
    for (const key of newOps) {
      const op = manifest.operations[key as keyof typeof manifest.operations] as Record<string, unknown>;
      expect(typeof op.title).toBe("string");
      expect((op.title as string).length).toBeGreaterThan(0);
      expect(typeof op.description).toBe("string");
      expect((op.description as string).length).toBeGreaterThan(0);
    }
  });

  test("manifest declares CRM models", () => {
    expect(manifest.models).toContain("contact");
    expect(manifest.models).toContain("lead");
    expect(manifest.models).toContain("account");
    expect(manifest.models).toContain("opportunity");
    expect(manifest.models).toContain("case");
  });

  test("manifest has timeout and size limits on all operations", () => {
    for (const [, spec] of Object.entries(manifest.operations)) {
      const s = spec as Record<string, unknown>;
      expect(typeof s.timeoutMs).toBe("number");
      expect((s.timeoutMs as number) > 0).toBe(true);
      expect(typeof s.maxInputBytes).toBe("number");
      expect(typeof s.maxResponseBytes).toBe("number");
    }
  });
});
