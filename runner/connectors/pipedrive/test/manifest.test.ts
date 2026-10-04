import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;

const ACTION_KEYS = [
  "healthcheck",
  "persons.list",
  "persons.get",
  "persons.create",
  "persons.update",
  "persons.delete",
  "organizations.list",
  "organizations.get",
  "organizations.create",
  "organizations.update",
  "organizations.delete",
  "deals.list",
  "deals.get",
  "deals.create",
  "deals.update",
  "deals.delete",
  "activities.list",
  "activities.get",
  "activities.create",
  "activities.update",
  "notes.list",
  "notes.create",
] as const;

const WEBHOOK_KEYS = ["webhook.deal_added", "webhook.person_added", "webhook.activity_added"] as const;

describe("pipedrive manifest", () => {
  it("declares the connector identity the control plane keys on", () => {
    expect(manifest.key).toBe("pipedrive");
    expect(manifest.name).toBe("Pipedrive");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.visibility).toBe("public");
    expect(manifest.categories).toEqual(["crm"]);
    expect(manifest.models).toEqual(["person", "organization", "deal", "activity", "note"]);
  });

  it("keeps token auth on api.pipedrive.com", () => {
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.auth.setup.mode).toBe("api_key");
    expect(manifest.auth.setup.fields.map((field: { key: string }) => field.key)).toEqual(["apiKey"]);
    expect(manifest.http.baseUrl).toBe("https://api.pipedrive.com");
    expect(manifest.network.allowedHosts).toEqual(["api.pipedrive.com"]);
    expect(manifest.http.auth.field).toBe("apiKey");
    expect(manifest.http.auth.in).toBe("header");
    expect(manifest.http.auth.name).toBe("x-api-token");
  });

  it("declares the high-value first-depth slice, not the full Composio catalog", () => {
    expect(Object.keys(operations).sort()).toEqual([...ACTION_KEYS, ...WEBHOOK_KEYS].sort());
    expect(Object.keys(operations).length).toBeLessThan(40);
  });

  it("gives every action the limits and tool schema the MCP gateway requires", () => {
    for (const key of ACTION_KEYS) {
      const operation = operations[key]!;
      expect(operation.kind, key).toBe("action");
      expect(operation.timeoutMs as number, key).toBeGreaterThan(0);
      expect(operation.maxInputBytes as number, key).toBeGreaterThan(0);
      expect(operation.maxResponseBytes as number, key).toBeGreaterThan(0);
      expect(String(operation.title ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(0);
      expect((operation.inputSchema as Record<string, unknown>).type, key).toBe("object");
      expect(operation.outputSchema, `${key} must declare an outputSchema`).toBeDefined();
      expect(["read", "write"]).toContain(operation.sideEffect as string);
      expect(operation.request, `${key} must declare a request block`).toBeDefined();
      expect(operation.enforceOutputSchema, key).toBe(true);
      expect(operation.validationMode, key).toBe("strict-generated");
      expect(operation.responseFormat, key).toBe("json");
    }
  });

  it("classifies every mutating operation as a write", () => {
    for (const [key, operation] of Object.entries(operations)) {
      if (operation.kind !== "action") continue;
      const method = String(((operation.request as Record<string, unknown>) ?? {}).method ?? "GET");
      if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
        expect(operation.sideEffect, `${key} mutates and must be sideEffect write`).toBe("write");
      }
    }
  });

  it("uses Pipedrive API v2 paths except notes, which remain on documented v1", () => {
    const v2 = [
      "persons.get",
      "persons.create",
      "organizations.get",
      "deals.get",
      "activities.list",
      "activities.create",
    ];
    for (const key of v2) {
      const path = String(((operations[key]!.request as Record<string, unknown>).path));
      expect(path.startsWith("/api/v2/"), key).toBe(true);
    }
    expect((operations["notes.list"]!.request as Record<string, unknown>).path).toBe("/api/v1/notes");
    expect((operations["notes.create"]!.request as Record<string, unknown>).path).toBe("/api/v1/notes");
  });

  it("requires resource ids on get/update/delete and create names/titles", () => {
    for (const key of [
      "persons.get",
      "persons.update",
      "persons.delete",
      "organizations.get",
      "organizations.update",
      "organizations.delete",
      "deals.get",
      "deals.update",
      "deals.delete",
      "activities.get",
      "activities.update",
    ]) {
      expect(((operations[key]!.inputSchema as { required?: string[] }).required ?? []), key).toContain("id");
    }
    expect((operations["persons.create"]!.inputSchema as { required?: string[] }).required ?? []).toContain("name");
    expect((operations["organizations.create"]!.inputSchema as { required?: string[] }).required ?? []).toContain("name");
    expect((operations["deals.create"]!.inputSchema as { required?: string[] }).required ?? []).toContain("title");
    expect((operations["notes.create"]!.inputSchema as { required?: string[] }).required ?? []).toContain("content");
  });

  it("declares EventOnly webhooks with apollo-shaped bounds, titles, and no handlers", () => {
    for (const key of WEBHOOK_KEYS) {
      const operation = operations[key]!;
      expect(operation.kind, key).toBe("webhook");
      expect(operation.timeoutMs, key).toBe(30000);
      expect(operation.maxInputBytes, key).toBe(1048576);
      expect(operation.maxResponseBytes, key).toBe(1048576);
      expect(String(operation.title ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(0);
      expect(operation.request, `${key} must not declare a request`).toBeUndefined();
      expect(operation.effectPolicy, `${key} must not declare effectPolicy`).toBeUndefined();
      expect(operation.reconcile, `${key} must not declare reconcile`).toBeUndefined();
    }
  });

  it("only interpolates path placeholders the operation schema requires", () => {
    for (const [key, operation] of Object.entries(operations)) {
      if (operation.kind !== "action") continue;
      const request = operation.request as Record<string, unknown>;
      const schema = operation.inputSchema as { required?: string[] };
      const placeholders = [...String(request.path ?? "").matchAll(/\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g)].map((match) => match[1]);
      for (const placeholder of placeholders) {
        expect(schema.required ?? [], `${key} path uses {{${placeholder}}}`).toContain(placeholder);
      }
    }
  });

  it("keeps every operation key inside the control plane's safe charset", () => {
    for (const key of Object.keys(operations)) {
      expect(key).toMatch(/^[a-zA-Z0-9._-]+$/);
    }
  });
});
