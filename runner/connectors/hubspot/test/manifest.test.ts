import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";

describe("hubspot manifest", () => {
  it("has correct key and version", () => {
    expect(manifest.key).toBe("hubspot");
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.runtime).toBe("bun");
  });

  it("uses oauth2 auth with CRM scopes", () => {
    expect(manifest.auth.type).toBe("oauth2");
    expect(manifest.auth.setup.mode).toBe("oauth2");
    expect(manifest.auth.scopes).toContain("crm.objects.contacts.read");
    expect(manifest.auth.scopes).toContain("crm.objects.contacts.write");
    expect(manifest.auth.scopes).toContain("crm.objects.companies.read");
    expect(manifest.auth.scopes).toContain("crm.objects.companies.write");
    expect(manifest.auth.scopes).toContain("crm.objects.deals.read");
    expect(manifest.auth.scopes).toContain("crm.objects.deals.write");
    expect(manifest.auth.scopes).toContain("crm.objects.tickets.read");
    expect(manifest.auth.scopes).toContain("crm.objects.tickets.write");
    expect(manifest.auth.scopes).toContain("oauth");
  });

  it("allows hubspot hosts", () => {
    expect(manifest.network.allowedHosts).toContain("api.hubapi.com");
    expect(manifest.network.allowedHosts).toContain("app.hubspot.com");
  });

  it("has all expected operations", () => {
    const ops = Object.keys(manifest.operations);
    // sync ops
    expect(ops).toContain("contacts.list");
    expect(ops).toContain("companies.list");
    expect(ops).toContain("deals.list");
    expect(ops).toContain("tickets.list");
    // original action ops
    expect(ops).toContain("contacts.create");
    expect(ops).toContain("companies.create");
    expect(ops).toContain("deals.create");
    expect(ops).toContain("tickets.create");
    expect(ops).toContain("healthcheck");
    // new action ops
    expect(ops).toContain("contacts.get");
    expect(ops).toContain("contacts.update");
    expect(ops).toContain("contacts.delete");
    expect(ops).toContain("contacts.search");
    expect(ops).toContain("companies.get");
    expect(ops).toContain("companies.update");
    expect(ops).toContain("companies.delete");
    expect(ops).toContain("deals.get");
    expect(ops).toContain("deals.update");
    expect(ops).toContain("deals.delete");
    expect(ops).toContain("tickets.get");
    expect(ops).toContain("tickets.update");
  });

  it("all action operations have required fields", () => {
    const ops = manifest.operations as Record<string, Record<string, unknown>>;
    for (const [key, op] of Object.entries(ops)) {
      if (op.kind !== "action") continue;
      expect(op.title, `${key} missing title`).toBeTruthy();
      expect(op.description, `${key} missing description`).toBeTruthy();
      expect(op.timeoutMs, `${key} missing timeoutMs`).toBeGreaterThan(0);
      expect(op.maxInputBytes, `${key} missing maxInputBytes`).toBeGreaterThan(0);
      expect(op.maxResponseBytes, `${key} missing maxResponseBytes`).toBeGreaterThan(0);
      const schema = op.inputSchema as Record<string, unknown>;
      expect(schema?.type, `${key} inputSchema.type`).toBe("object");
    }
  });

  it("has correct models", () => {
    expect(manifest.models).toEqual(["contact", "company", "deal", "ticket"]);
  });
});
