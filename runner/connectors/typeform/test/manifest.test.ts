import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";

describe("typeform manifest", () => {
  it("has correct key and version", () => {
    expect(manifest.key).toBe("typeform");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.runtime).toBe("bun");
  });

  it("uses oauth2 auth with required scopes", () => {
    expect(manifest.auth.type).toBe("oauth2");
    expect(manifest.auth.setup.mode).toBe("oauth2");
    expect(manifest.auth.scopes).toContain("forms:read");
    expect(manifest.auth.scopes).toContain("responses:read");
    expect(manifest.auth.scopes).toContain("workspaces:read");
    expect(manifest.auth.scopes).toContain("themes:write");
    expect(manifest.auth.scopes).toContain("images:write");
    expect(manifest.auth.scopes).toContain("accounts:read");
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
    expect(ops).toContain("users.me");
    expect(ops).toContain("workspaces.list");
    expect(ops).toContain("workspaces.create_in_account");
    expect(ops).toContain("workspaces.delete");
    expect(ops).toContain("themes.create");
    expect(ops).toContain("themes.patch");
    expect(ops).toContain("images.create");
    expect(ops).toContain("images.get");
    expect(ops).toContain("images.background.get");
    expect(ops).toContain("images.choice.get");
    expect(ops).toContain("forms.messages.update");
    expect(ops).toContain("responses.files.get");
    expect(ops).toContain("videos.upload");
    expect(ops).toContain("webhook.form_response");
  });

  it("webhook trigger is read-only", () => {
    const webhook = manifest.operations["webhook.form_response"] as Record<string, unknown>;
    expect(webhook.kind).toBe("webhook");
    expect(webhook.sideEffect).toBe("read");
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
    const actionOps = Object.keys(manifest.operations).filter((op) => (manifest.operations as Record<string, { kind: string }>)[op].kind === "action");
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
    expect(manifest.models).toContain("workspace");
    expect(manifest.models).toContain("theme");
    expect(manifest.models).toContain("image");
    expect(manifest.models).toContain("user");
  });
});

