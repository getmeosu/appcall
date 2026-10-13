import { describe, expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import COMPOSIO_TOOLS from "./composio-cover.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const compiled = compileDeclarativeConnector(manifest as never);

function requestOf(key: string): Record<string, unknown> {
  return operations[key]!.request as Record<string, unknown>;
}

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
    expect(manifest.version).toBe("0.4.1");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.visibility).toBe("public");
    expect(manifest.categories).toEqual(["crm"]);
    expect(manifest.models).toEqual(["person", "organization", "deal", "activity", "note"]);
  });

  it("keeps token auth on api.pipedrive.com", () => {
    expect(Object.keys(manifest.auth).sort()).toEqual(["scopes", "setup", "type"]);
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.auth.scopes).toEqual([]);
    expect(manifest.auth.setup.mode).toBe("api_key");
    expect(manifest.auth.setup.fields.map((field: { key: string }) => field.key)).toEqual(["apiKey"]);
    expect(manifest.http.baseUrl).toBe("https://api.pipedrive.com");
    expect(manifest.network.allowedHosts).toEqual(["api.pipedrive.com", "oauth.pipedrive.com"]);
    expect(manifest.http.auth.field).toBe("apiKey");
    expect(manifest.http.auth.in).toBe("header");
    expect(manifest.http.auth.name).toBe("x-api-token");
    expect(manifest.http.auth.value).toBe("{{apiKey}}");
    expect(manifest.provenance.source).toEqual({
      url: "https://github.com/oomol-lab/open-connector",
      revision: "33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a",
    });
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  it("keeps the original operations and stays within the official HTTP ceiling", () => {
    for (const key of [...ACTION_KEYS, ...WEBHOOK_KEYS]) {
      expect(operations[key], key).toBeDefined();
    }
    const webhooks = Object.entries(operations)
      .filter(([, operation]) => operation.kind === "webhook")
      .map(([key]) => key)
      .sort();
    expect(webhooks).toEqual([...WEBHOOK_KEYS].sort());
    expect(Object.keys(operations).length).toBeGreaterThan(ACTION_KEYS.length + WEBHOOK_KEYS.length);
    expect(Object.keys(operations).length).toBe(405);
    expect(operations["oauth.create"]).toBeDefined();
    expect(operations["oauth.create-token"]).toBeDefined();
    expect(requestOf("organizations.list-beta")).toMatchObject({
      method: "GET",
      path: "/api/v1/organizations/collection",
    });
    expect(requestOf("persons.list-beta")).toMatchObject({
      method: "GET",
      path: "/api/v1/persons/collection",
    });
    expect(operations["organizations.list-beta"]!.request).not.toHaveProperty("body");
    expect(operations["persons.list-beta"]!.request).not.toHaveProperty("body");
  });

  it("gives every action the limits and tool schema the MCP gateway requires", () => {
    const actionKeys = Object.entries(operations)
      .filter(([, operation]) => operation.kind === "action")
      .map(([key]) => key);
    for (const key of actionKeys) {
      const operation = operations[key]!;
      expect(operation.kind, key).toBe("action");
      expect(operation.timeoutMs as number, key).toBeGreaterThan(0);
      expect(operation.timeoutMs as number, key).toBeLessThanOrEqual(300000);
      expect(operation.maxInputBytes as number, key).toBeGreaterThan(0);
      expect(operation.maxResponseBytes as number, key).toBeGreaterThanOrEqual(operation.maxInputBytes as number);
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
      expect(operation.sideEffect, key).toBe("read");
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

  it("puts a body Content-Type only when a body is set and keeps GET body-less", () => {
    for (const [key, operation] of Object.entries(operations)) {
      if (operation.kind !== "action") continue;
      const request = operation.request as Record<string, unknown>;
      const method = String(request.method);
      const headers = (request.headers as Record<string, string> | undefined) ?? {};
      if (request.body !== undefined) {
        const encoding = request.bodyEncoding;
        expect(headers["Content-Type"], key).toBe(
          encoding === "form" ? "application/x-www-form-urlencoded" : "application/json",
        );
      } else {
        expect(headers["Content-Type"], key).toBeUndefined();
      }
      if (method === "GET") expect(request.body, key).toBeUndefined();
    }
  });

  it("covers mapped Composio Pipedrive tools and the two collection GETs", () => {
    expect(Object.keys(COMPOSIO_TOOLS).length).toBeGreaterThan(390);
    for (const [slug, key] of Object.entries(COMPOSIO_TOOLS)) {
      expect(operations[key], slug).toBeDefined();
      if (operations[key]!.kind === "action") {
        expect(requestOf(key), slug).toBeDefined();
        expect(compiled.actions[key], slug).toBeTypeOf("function");
      }
    }
    expect(COMPOSIO_TOOLS["PIPEDRIVE_GET_ALL_ORGANIZATIONS_BETA"]).toBe("organizations.list-beta");
    expect(COMPOSIO_TOOLS["PIPEDRIVE_GET_ALL_PERSONS_BETA"]).toBe("persons.list-beta");
    expect(requestOf("webhooks.list")).toMatchObject({ method: "GET", path: "/v1/webhooks" });
    expect(operations["webhooks.list"]!.sideEffect).toBe("read");
    for (const dropped of [
      "files.create",
      "files.get-download",
      "persons.create-picture",
      "call-logs.create-recordings",
      "products.create-images",
      "products.update-images",
    ]) {
      expect(operations[dropped], dropped).toBeUndefined();
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
