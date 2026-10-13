import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, any>;

const ORIGIN: Record<string, { method: string; path: string; sideEffect: string }> = {
  "channels.list": { method: "POST", path: "/channels/search", sideEffect: "read" },
  "contacts.get": { method: "GET", path: "/contacts/{{contactId}}", sideEffect: "read" },
  "contacts.list": { method: "POST", path: "/contacts/search", sideEffect: "read" },
  healthcheck: { method: "POST", path: "/channels/search", sideEffect: "read" },
  "labels.list": { method: "POST", path: "/labels/search", sideEffect: "read" },
  "channels.get": { method: "GET", path: "/channels/{{channelId}}", sideEffect: "read" },
  "contacts.create": { method: "POST", path: "/contacts", sideEffect: "write" },
  "contacts.update": { method: "PUT", path: "/contacts/{{contactId}}", sideEffect: "write" },
  "contacts.delete": { method: "DELETE", path: "/contacts/{{contactId}}", sideEffect: "destructive" },
  "contacts.subscribe": { method: "POST", path: "/contacts/{{contactId}}/subscribe", sideEffect: "write" },
  "labels.get": { method: "GET", path: "/labels/{{labelId}}", sideEffect: "read" },
  "labels.create": { method: "POST", path: "/labels", sideEffect: "write" },
  "labels.update": { method: "PUT", path: "/labels/{{labelId}}", sideEffect: "write" },
  "labels.delete": { method: "DELETE", path: "/labels/{{labelId}}", sideEffect: "destructive" },
  "chats.list": { method: "POST", path: "/chats/search", sideEffect: "read" },
  "chats.get": { method: "GET", path: "/chats/{{chatId}}", sideEffect: "read" },
  "messages.send": { method: "POST", path: "/messages/send", sideEffect: "write" },
  "workspace.get": { method: "GET", path: "/workspace", sideEffect: "read" },
  "users.list": { method: "GET", path: "/users", sideEffect: "read" },
  "teams.list": { method: "POST", path: "/teams/search", sideEffect: "read" },
  "automations.list": { method: "POST", path: "/automations/search", sideEffect: "read" },
};

const V2: Record<string, { method: string; path: string; sideEffect: string }> = {
  "v2.attributes.create": { method: "POST", path: "/attributes", sideEffect: "write" },
  "v2.contacts.create": { method: "POST", path: "/contacts", sideEffect: "write" },
  "v2.labels.create": { method: "POST", path: "/labels", sideEffect: "write" },
  "v2.webhooks.create": { method: "POST", path: "/api_webhooks", sideEffect: "write" },
  "v2.attributes.delete": { method: "DELETE", path: "/attributes/{{attributeId}}", sideEffect: "destructive" },
  "v2.labels.delete": { method: "DELETE", path: "/labels/{{labelId}}", sideEffect: "destructive" },
  "v2.webhooks.delete": { method: "DELETE", path: "/api_webhooks/{{webhookId}}", sideEffect: "destructive" },
  "v2.attributes.list": { method: "GET", path: "/attributes", sideEffect: "read" },
  "v2.workflows.list": { method: "GET", path: "/{{channelId}}/workflows", sideEffect: "read" },
  "v2.channels.list": { method: "GET", path: "/channels", sideEffect: "read" },
  "v2.message_templates.list": { method: "GET", path: "/message_templates", sideEffect: "read" },
  "v2.webhooks.list": { method: "GET", path: "/api_webhooks", sideEffect: "read" },
  "v2.webhooks.update": { method: "PUT", path: "/api_webhooks/{{webhookId}}", sideEffect: "write" },
};

const RECIPE_SHA256 = "0a901bd71c3a3be0bb115c71e3d9d5a9356abc34a85565ddb59009a92fa504ad";

// recipe keys the pinned recipe has real provenance for (its pinned selection plus EventOnly webhooks)
const PINNED_OPS = [
  "automations.list",
  "channels.get",
  "channels.list",
  "chats.get",
  "chats.list",
  "contacts.create",
  "contacts.delete",
  "contacts.get",
  "contacts.list",
  "contacts.subscribe",
  "contacts.update",
  "healthcheck",
  "labels.create",
  "labels.delete",
  "labels.get",
  "labels.list",
  "labels.update",
  "messages.send",
  "teams.list",
  "users.list",
  "webhook.message_received",
  "webhook.message_sent",
  "webhook.message_updated",
  "workspace.get",
];

// ops this branch added from the provider's live API; no pinned action id exists
const DEEPENED_OPS = [
  "v2.attributes.create",
  "v2.attributes.delete",
  "v2.attributes.list",
  "v2.channels.list",
  "v2.contacts.create",
  "v2.labels.create",
  "v2.labels.delete",
  "v2.message_templates.list",
  "v2.webhooks.create",
  "v2.webhooks.delete",
  "v2.webhooks.list",
  "v2.webhooks.update",
  "v2.workflows.list",
];

describe("heyy manifest", () => {
  test("keeps the v3 base, bearer auth, and api.heyy.io only", () => {
    expect(manifest.key).toBe("heyy");
    expect(manifest.version).toBe("0.3.0");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.full_depth).toBeUndefined();
    expect(manifest.http.baseUrl).toBe("https://api.heyy.io/v3");
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "Authorization",
      value: "Bearer {{apiKey}}",
    });
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.auth.setup.fields).toEqual([
      { key: "apiKey", label: "Heyy API key", required: true, secret: true },
    ]);
    expect(manifest.network.allowedHosts).toEqual(["api.heyy.io"]);
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("keeps every origin v3 operation on the connector base URL", () => {
    expect(Object.keys(operations)).toHaveLength(Object.keys(ORIGIN).length + Object.keys(V2).length);
    for (const [key, spec] of Object.entries(ORIGIN)) {
      const request = operations[key]?.request;
      expect(request, key).toBeDefined();
      expect(request.method, key).toBe(spec.method);
      expect(request.path, key).toBe(spec.path);
      expect(operations[key].sideEffect, key).toBe(spec.sideEffect);
      expect(request.baseUrl, key).toBeUndefined();
    }
  });

  test("points the v2 JSON routes at https://api.heyy.io/v2", () => {
    expect(Object.keys(V2)).toHaveLength(13);
    for (const [key, spec] of Object.entries(V2)) {
      const request = operations[key]?.request;
      expect(request, key).toBeDefined();
      expect(request.method, key).toBe(spec.method);
      expect(request.path, key).toBe(spec.path);
      expect(request.baseUrl, key).toBe("https://api.heyy.io/v2");
      expect(new URL(request.baseUrl).host, key).toBe("api.heyy.io");
      expect(operations[key].sideEffect, key).toBe(spec.sideEffect);
      expect(request.success, key).toEqual([200]);
    }
  });

  test("bounds every action and puts JSON content type only on bodies", () => {
    for (const [key, op] of Object.entries(operations)) {
      expect(op.title.length, key).toBeGreaterThan(0);
      expect(op.description.length, key).toBeGreaterThan(0);
      expect(op.timeoutMs, key).toBeGreaterThan(0);
      expect(op.timeoutMs, key).toBeLessThanOrEqual(300000);
      expect(op.maxInputBytes, key).toBeLessThanOrEqual(26214400);
      expect(op.maxResponseBytes, key).toBeGreaterThanOrEqual(op.maxInputBytes);
      expect(op.maxResponseBytes, key).toBeLessThanOrEqual(5242880);
      expect(op.kind, key).toBe("action");
      expect(op.inputSchema.type, key).toBe("object");
      expect(op.inputSchema.additionalProperties, key).toBe(false);
      expect(op.outputSchema.type, key).toBe("object");
      expect(op.enforceOutputSchema, key).toBe(true);
      expect(op.validationMode, key).toBe("strict-generated");
      expect(op.responseFormat, key).toBe("json");
      const request = op.request;
      const headers = request.headers ?? {};
      if (request.method === "GET" || request.method === "DELETE") expect(request.body, key).toBeUndefined();
      if (request.body !== undefined) expect(headers["Content-Type"], key).toBe("application/json");
      else expect(headers["Content-Type"], key).toBeUndefined();
      const placeholders = [...String(request.path).matchAll(/\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g)].map((match) => match[1]);
      for (const name of placeholders) expect(op.inputSchema.required ?? [], `${key} {{${name}}}`).toContain(name);
      if (request.method === "DELETE") expect(op.sideEffect, key).toBe("destructive");
      else if (["POST", "PUT", "PATCH"].includes(request.method) && !String(request.path).endsWith("/search") && key !== "healthcheck") {
        expect(op.sideEffect, key).toBe("write");
      } else expect(op.sideEffect, key).toBe("read");
    }
  });

  test("recipe mirrors the deepened operations; provenance mappings stay pinned", () => {
    const bytes = readFileSync(new URL("../../../../scripts/connector-gen/openconnector/recipes/heyy/recipe.json", import.meta.url));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(RECIPE_SHA256);
    const recipe = JSON.parse(bytes.toString("utf8"));
    const runnerOps = Object.keys(operations).sort();
    const recipeOps = Object.keys(recipe.manifest.operations).sort();
    expect(recipe.manifest.version).toBe("0.2.0");
    expect(runnerOps).toEqual(recipeOps);
    expect([...recipe.selection.operations].sort()).toEqual(PINNED_OPS);
    expect(Object.keys(recipe.operationSources).sort()).toEqual(PINNED_OPS);
    expect(runnerOps.filter((key) => !Object.hasOwn(recipe.operationSources, key))).toEqual(DEEPENED_OPS);
    for (const key of recipeOps) {
      expect(operations[key], key).toEqual(recipe.manifest.operations[key]);
    }
    for (const key of DEEPENED_OPS) {
      expect(recipe.operationSources[key], key).toBeUndefined();
      expect(recipe.selection.operations, key).not.toContain(key);
    }
  });
});
