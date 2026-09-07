import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";

describe("typeform manifest", () => {
  it("has correct key and version", () => {
    expect(manifest.key).toBe("typeform");
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.runtime).toBe("bun");
  });

  it("uses oauth2 auth with required scopes", () => {
    expect(manifest.auth.type).toBe("oauth2");
    expect(manifest.auth.setup.mode).toBe("oauth2");
    expect(manifest.auth.scopes).toContain("forms:read");
    expect(manifest.auth.scopes).toContain("responses:read");
  });

  it("allows typeform hosts", () => {
    expect(manifest.network.allowedHosts).toContain("api.typeform.com");
  });

  it("has all expected operations", () => {
    const ops = Object.keys(manifest.operations);
    expect(ops).toContain("forms.list");
    expect(ops).toContain("responses.list");
    expect(ops).toContain("healthcheck");
    expect(ops).toContain("forms.list.action");
    expect(ops).toContain("forms.get");
    expect(ops).toContain("forms.create");
    expect(ops).toContain("forms.update");
    expect(ops).toContain("forms.delete");
    expect(ops).toContain("responses.list.action");
    expect(ops).toContain("responses.delete");
    expect(ops).toContain("webhooks.create");
    expect(ops).toContain("webhooks.list");
  });

  it("operations use flat kind field", () => {
    expect(manifest.operations["forms.list"].kind).toBe("sync");
    expect(manifest.operations["responses.list"].kind).toBe("sync");
    expect(manifest.operations["healthcheck"].kind).toBe("action");
    expect(manifest.operations["forms.get"].kind).toBe("action");
    expect(manifest.operations["forms.create"].kind).toBe("action");
    expect(manifest.operations["forms.update"].kind).toBe("action");
    expect(manifest.operations["forms.delete"].kind).toBe("action");
    expect(manifest.operations["responses.delete"].kind).toBe("action");
    expect(manifest.operations["webhooks.create"].kind).toBe("action");
    expect(manifest.operations["webhooks.list"].kind).toBe("action");
  });

  it("all action operations have required fields", () => {
    const actionOps = ["forms.list.action", "forms.get", "forms.create", "forms.update", "forms.delete", "responses.list.action", "responses.delete", "webhooks.create", "webhooks.list"];
    for (const op of actionOps) {
      const operation = manifest.operations[op as keyof typeof manifest.operations] as Record<string, unknown>;
      expect(operation.kind).toBe("action");
      expect(typeof operation.title).toBe("string");
      expect(typeof operation.description).toBe("string");
      expect((operation.title as string).length).toBeGreaterThan(0);
      expect((operation.description as string).length).toBeGreaterThan(0);
      expect(typeof operation.timeoutMs).toBe("number");
      expect(typeof operation.maxInputBytes).toBe("number");
      expect(typeof operation.maxResponseBytes).toBe("number");
      expect((operation.timeoutMs as number)).toBeGreaterThan(0);
      const inputSchema = operation.inputSchema as Record<string, unknown>;
      expect(inputSchema.type).toBe("object");
    }
  });

  it("has correct models", () => {
    expect(manifest.models).toContain("form");
    expect(manifest.models).toContain("response");
    expect(manifest.models).toContain("webhook");
  });
});
