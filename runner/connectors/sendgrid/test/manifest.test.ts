import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";

describe("sendgrid manifest", () => {
  it("has correct key and version", () => {
    expect(manifest.key).toBe("sendgrid");
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.runtime).toBe("bun");
  });

  it("offers api_key and smtp connection routes", () => {
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.auth.setup.mode).toBe("api_key");
    const routes = manifest.auth.setup.routes;
    const apiRoute = routes.find((r: { id: string }) => r.id === "api_key");
    expect(apiRoute).toBeDefined();
    const apiKeyField = apiRoute.fields.find((f: { key: string }) => f.key === "apiKey");
    expect(apiKeyField.required).toBe(true);
    expect(apiKeyField.secret).toBe(true);
    expect(routes.find((r: { id: string }) => r.id === "smtp")).toBeDefined();
  });

  it("allows sendgrid hosts", () => {
    expect(manifest.network.allowedHosts).toContain("api.sendgrid.com");
  });

  it("has all expected operations", () => {
    const ops = Object.keys(manifest.operations);
    expect(ops).toContain("contacts.list");
    expect(ops).toContain("lists.list");
    expect(ops).toContain("campaigns.list");
    expect(ops).toContain("contacts.create");
    expect(ops).toContain("healthcheck");
    // new actions
    expect(ops).toContain("mail.send");
    expect(ops).toContain("contacts.upsert");
    expect(ops).toContain("contacts.search");
    expect(ops).toContain("contacts.delete");
    expect(ops).toContain("lists.create");
    expect(ops).toContain("lists.get");
    expect(ops).toContain("lists.delete");
    expect(ops).toContain("templates.create");
    expect(ops).toContain("templates.get");
    expect(ops).toContain("suppression.bounces.list");
  });

  it("has correct models", () => {
    expect(manifest.models).toEqual(["contact", "list", "campaign"]);
  });

  it("has operation kinds", () => {
    expect(manifest.operations["contacts.list"].kind).toBe("sync");
    expect(manifest.operations["lists.list"].kind).toBe("sync");
    expect(manifest.operations["campaigns.list"].kind).toBe("sync");
    expect(manifest.operations["contacts.create"].kind).toBe("action");
    expect(manifest.operations["healthcheck"].kind).toBe("action");
    expect(manifest.operations["mail.send"].kind).toBe("action");
    expect(manifest.operations["contacts.upsert"].kind).toBe("action");
    expect(manifest.operations["contacts.search"].kind).toBe("action");
    expect(manifest.operations["contacts.delete"].kind).toBe("action");
    expect(manifest.operations["lists.create"].kind).toBe("action");
    expect(manifest.operations["lists.get"].kind).toBe("action");
    expect(manifest.operations["lists.delete"].kind).toBe("action");
    expect(manifest.operations["templates.create"].kind).toBe("action");
    expect(manifest.operations["templates.get"].kind).toBe("action");
    expect(manifest.operations["suppression.bounces.list"].kind).toBe("action");
  });

  it("operations have timeout constraints", () => {
    expect(manifest.operations["healthcheck"].timeoutMs).toBe(5000);
    expect(manifest.operations["contacts.list"].timeoutMs).toBe(30000);
  });
});
