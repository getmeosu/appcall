import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;

describe("airtable manifest", () => {
  it("declares the connector identity the control plane keys on", () => {
    expect(manifest.key).toBe("airtable");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.categories).toEqual(["productivity"]);
    expect(manifest.models.length).toBeGreaterThan(0);
  });

  it("collects the personal access token under the field the request template reads", () => {
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.auth.setup.mode).toBe("api_key");
    const secretFields = manifest.auth.setup.fields.filter((field) => field.secret);
    expect(secretFields.map((field) => field.key)).toEqual(["apiKey"]);
    expect(manifest.http.auth.field).toBe("apiKey");
  });

  it("gives every action the limits and tool schema the MCP gateway requires", () => {
    for (const [key, operation] of Object.entries(operations)) {
      if (operation.kind === "webhook") continue;
      expect(operation.kind, key).toBe("action");
      expect(operation.timeoutMs as number).toBeGreaterThan(0);
      expect(operation.maxInputBytes as number).toBeGreaterThan(0);
      expect(operation.maxResponseBytes as number).toBeGreaterThan(0);
      expect(String(operation.title ?? "").length).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length).toBeGreaterThan(0);
      expect((operation.inputSchema as Record<string, unknown>).type).toBe("object");
      expect(["read", "write"]).toContain(operation.sideEffect as string);
      expect(operation.request, `${key} must declare a request block`).toBeDefined();
    }
  });

  it("declares inbound Airtable webhooks without compiling them", () => {
    for (const key of [
      "webhook.record_created",
      "webhook.record_updated",
      "webhook.record_deleted",
      "webhook.table_created",
      "webhook.base_created",
      "webhook.comment_created",
    ]) {
      const operation = operations[key]!;
      expect(operation.kind).toBe("webhook");
      expect(operation.request).toBeUndefined();
      expect(operation.timeoutMs as number).toBeGreaterThan(0);
      expect(operation.maxInputBytes as number).toBeGreaterThan(0);
      expect(operation.maxResponseBytes as number).toBeGreaterThan(0);
    }
  });

  it("fetches one base schema by ID", () => {
    const operation = operations["bases.get"]!;
    expect(operation.kind).toBe("action");
    expect(operation.sideEffect).toBe("read");
    expect((operation.request as Record<string, unknown>).path).toBe("/v0/meta/bases/{{baseId}}/tables");
    expect((operation.inputSchema as { required?: string[] }).required).toContain("baseId");
  });

  it("keeps every request inside the declared outbound host", () => {
    for (const operation of Object.values(operations)) {
      if (operation.kind === "webhook") continue;
      const request = operation.request as Record<string, unknown>;
      const baseUrl = String(request.baseUrl ?? manifest.http.baseUrl);
      expect(new URL(baseUrl).hostname).toBe("api.airtable.com");
      expect(manifest.network.allowedHosts).toContain("api.airtable.com");
    }
  });

  it("only interpolates path placeholders that the operation's schema requires", () => {
    for (const [key, operation] of Object.entries(operations)) {
      if (operation.kind === "webhook") continue;
      const request = operation.request as Record<string, unknown>;
      const schema = operation.inputSchema as { required?: string[] };
      const placeholders = [...String(request.path ?? "").matchAll(/\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g)].map((match) => match[1]);
      for (const placeholder of placeholders) {
        expect(schema.required ?? [], `${key} path uses {{${placeholder}}}`).toContain(placeholder);
      }
    }
  });
});
