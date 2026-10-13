import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import manifest from "../manifest.json";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const ORIGIN_OPS = [
  "healthcheck",
  "accounts.list",
  "projects.list",
  "sandboxes.list",
  "contact-lists.list",
] as const;

export const COMPOSIO_TOOLS: Record<string, string> = {
  MAILTRAP_CLEAN_INBOX: "sandboxes.clean",
  MAILTRAP_CREATE_CONTACT: "contacts.unscoped.create",
  MAILTRAP_CREATE_CONTACT_EVENT: "contacts.unscoped.events.create",
  MAILTRAP_CREATE_CONTACT_EXPORT: "contacts.unscoped.exports.create",
  MAILTRAP_CREATE_CONTACT_FIELD: "contacts.unscoped.fields.create",
  MAILTRAP_CREATE_CONTACT_LIST: "contact-lists.unscoped.create",
  MAILTRAP_CREATE_EMAIL_TEMPLATE: "email-templates.unscoped.create",
  MAILTRAP_CREATE_SENDING_DOMAIN: "domains.create",
  MAILTRAP_DELETE_CONTACT: "contacts.delete",
  MAILTRAP_DELETE_CONTACT_FIELD: "contacts.fields.delete",
  MAILTRAP_DELETE_CONTACT_LIST: "contact-lists.delete",
  MAILTRAP_DELETE_EMAIL_TEMPLATE: "email-templates.delete",
  MAILTRAP_DELETE_PROJECT: "projects.unscoped.delete",
  MAILTRAP_DELETE_SENDING_DOMAIN: "sending-domains.delete",
  MAILTRAP_GET_BILLING_USAGE: "billing.unscoped.usage.get",
  MAILTRAP_GET_CONTACT: "contacts.unscoped.get",
  MAILTRAP_GET_CONTACT_EXPORT: "contacts.unscoped.exports.get",
  MAILTRAP_GET_CONTACT_FIELD: "contacts.unscoped.fields.get",
  MAILTRAP_GET_CONTACT_IMPORT: "contacts.unscoped.imports.get",
  MAILTRAP_GET_CONTACT_LIST: "contact-lists.unscoped.get",
  MAILTRAP_GET_EMAIL_TEMPLATE: "email-templates.unscoped.get",
  MAILTRAP_GET_INBOX: "sandboxes.get",
  MAILTRAP_GET_MESSAGE_HTML: "messages.html.get",
  MAILTRAP_GET_PERMISSION_RESOURCES: "permissions.unscoped.resources.get",
  MAILTRAP_GET_PROJECT: "projects.unscoped.get",
  MAILTRAP_GET_SENDING_DOMAIN: "domains.get",
  MAILTRAP_GET_SENDING_STATS: "sending-stats.unscoped.get",
  MAILTRAP_GET_SENDING_STATS_BY_CATEGORIES: "sending-stats.unscoped.by-categories",
  MAILTRAP_GET_SENDING_STATS_BY_DATE: "sending-stats.unscoped.by-date",
  MAILTRAP_GET_SENDING_STATS_BY_DOMAINS: "sending-stats.unscoped.by-domains",
  MAILTRAP_GET_SENDING_STATS_BY_ESP: "sending-stats.unscoped.by-esp",
  MAILTRAP_IMPORT_CONTACTS: "contacts.unscoped.import",
  MAILTRAP_LIST_ACCOUNTS: "accounts.list",
  MAILTRAP_LIST_CONTACT_FIELDS: "contacts.unscoped.fields.list",
  MAILTRAP_LIST_CONTACT_LISTS: "contact-lists.list_account",
  MAILTRAP_LIST_EMAIL_TEMPLATES: "email-templates.unscoped.list",
  MAILTRAP_LIST_INBOXES: "inboxes.list",
  MAILTRAP_LIST_MESSAGES: "sandboxes.messages.list",
  MAILTRAP_LIST_PROJECTS: "projects.list_account",
  MAILTRAP_LIST_SENDING_DOMAINS: "domains.list",
  MAILTRAP_LIST_SUPPRESSIONS: "suppressions.unscoped.list",
  MAILTRAP_MARK_INBOX_AS_READ: "sandboxes.mark_as_read",
  MAILTRAP_RESET_INBOX_CREDENTIALS: "sandboxes.reset_credentials",
  MAILTRAP_UPDATE_CONTACT: "contacts.unscoped.update",
  MAILTRAP_UPDATE_CONTACT_FIELD: "contacts.unscoped.fields.update",
  MAILTRAP_UPDATE_CONTACT_LIST: "contact-lists.unscoped.update",
  MAILTRAP_UPDATE_EMAIL_TEMPLATE: "email-templates.unscoped.update",
  MAILTRAP_UPDATE_INBOX: "sandboxes.update",
  MAILTRAP_UPDATE_PROJECT: "projects.unscoped.update",
};


const compiled = compileDeclarativeConnector(manifest as never);

function requestOf(key: string): Record<string, unknown> {
  return operations[key]!.request as Record<string, unknown>;
}

describe("mailtrap manifest", () => {
  test("keeps origin auth, host, and provenance", () => {
    expect(manifest.key).toBe("mailtrap");
    expect(manifest.version).toBe("0.2.1");
    expect(manifest.visibility).toBe("public");
    expect(manifest.network.allowedHosts).toEqual(["mailtrap.io"]);
    expect(manifest.http.baseUrl).toBe("https://mailtrap.io");
    expect(manifest.http.auth.value).toBe("Bearer {{apiKey}}");
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    expect(manifest.provenance.source).toEqual({
      url: "https://github.com/oomol-lab/open-connector",
      revision: "33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a",
    });
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("keeps the origin five operations and unscoped inventory paths", () => {
    for (const key of ORIGIN_OPS) {
      expect(operations[key], key).toBeDefined();
      expect(requestOf(key).method).toBe("GET");
    }
    expect(requestOf("healthcheck")).toMatchObject({ method: "GET", path: "/api/accounts" });
    expect(requestOf("accounts.list").path).toBe("/api/accounts");
    expect(requestOf("projects.list").path).toBe("/api/projects");
    expect(requestOf("sandboxes.list").path).toBe("/api/sandboxes");
    expect(requestOf("contact-lists.list").path).toBe("/api/contacts/lists");
  });

  test("covers every Composio Mailtrap tool with a real request", () => {
    expect(Object.keys(COMPOSIO_TOOLS)).toHaveLength(49);
    expect(Object.keys(operations).length).toBe(92);
    for (const [slug, key] of Object.entries(COMPOSIO_TOOLS)) {
      expect(operations[key], slug).toBeDefined();
      expect(requestOf(key), slug).toBeDefined();
      expect(compiled.actions[key], slug).toBeTypeOf("function");
    }
  });

  test("gives every action a real request, title, description, and object inputSchema", () => {
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind, key).toBe("action");
      expect(["read", "write", "destructive"], key).toContain(operation.sideEffect);
      expect(String(operation.title ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(0);
      expect((operation.inputSchema as { type?: string }).type, key).toBe("object");
      expect(operation.request, `${key} must declare a request block`).toBeDefined();
      const request = operation.request as Record<string, unknown>;
      expect(typeof request.method, key).toBe("string");
      expect(typeof request.path, key).toBe("string");
      expect(String(request.path).startsWith("/api/"), key).toBe(true);
    }
  });

  test("classifies mutating HTTP methods as write or destructive", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const method = String((operation.request as Record<string, unknown>).method);
      if (method === "DELETE" && key === "projects.unscoped.delete") expect(operation.sideEffect, key).toBe("write");
      else if (method === "DELETE") expect(operation.sideEffect, key).toBe("destructive");
      else if (["POST", "PUT", "PATCH"].includes(method)) expect(operation.sideEffect, key).toBe("write");
      else expect(operation.sideEffect, key).toBe("read");
    }
  });

  test("only interpolates path placeholders the schema requires", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as Record<string, unknown>;
      const schema = operation.inputSchema as { required?: string[] };
      const placeholders = [...String(request.path ?? "").matchAll(/\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g)].map(
        (match) => match[1],
      );
      for (const placeholder of placeholders) {
        expect(schema.required ?? [], `${key} path uses {{${placeholder}}}`).toContain(placeholder);
      }
    }
  });

  test("maps Composio account-scoped tools onto /api/accounts/{account_id} paths", () => {
    expect(requestOf("inboxes.list")).toMatchObject({
      method: "GET",
      path: "/api/accounts/{{account_id}}/inboxes",
    });
    expect(requestOf("projects.list_account").path).toBe("/api/accounts/{{account_id}}/projects");
    expect(requestOf("contact-lists.list_account").path).toBe("/api/accounts/{{account_id}}/contacts/lists");
    expect(requestOf("inboxes.clean").path).toBe("/api/accounts/{{account_id}}/inboxes/{{inbox_id}}/clean");
    expect(requestOf("messages.html.get")).toMatchObject({
      method: "GET",
      path: "/api/accounts/{{account_id}}/inboxes/{{inbox_id}}/messages/{{message_id}}/body.html",
    });
    expect(operations["messages.html.get"]!.responseFormat).toBe("text");
    expect(requestOf("sending-stats.by-date").path).toBe("/api/accounts/{{account_id}}/stats/date");
    expect(requestOf("contacts.create")).toMatchObject({
      method: "POST",
      path: "/api/accounts/{{account_id}}/contacts",
      body: { contact: "{{contact}}" },
    });
  });

  test("keeps the unchanged 0.2.0 recipe and leaves the public routes as the gap", () => {
    const recipePath = "scripts/connector-gen/openconnector/recipes/mailtrap/recipe.json";
    expect(existsSync(recipePath)).toBe(true);
    const recipe = JSON.parse(readFileSync(recipePath, "utf8")) as {
      selection: { operations: string[] };
      operationSources: Record<string, unknown>;
      manifest: { operations: Record<string, unknown>; version: string };
    };
    const runnerOps = Object.keys(operations).sort();
    const recipeOps = Object.keys(recipe.manifest.operations).sort();
    const publicOps = Object.values(COMPOSIO_TOOLS)
      .filter((key) => !Object.hasOwn(recipe.manifest.operations, key))
      .sort();
    expect(recipe.manifest.version).toBe("0.2.0");
    expect(recipeOps).toHaveLength(53);
    expect(publicOps).toHaveLength(39);
    expect([...recipe.selection.operations].sort()).toEqual(recipeOps);
    expect(Object.keys(recipe.operationSources).sort()).toEqual(recipeOps);
    const absentFromRecipe = runnerOps.filter((key) => !Object.hasOwn(recipe.operationSources, key));
    expect(absentFromRecipe).toEqual(publicOps);
    expect(runnerOps).toEqual([...recipeOps, ...publicOps].sort());
    for (const key of recipeOps) {
      expect(operations[key], key).toEqual(recipe.manifest.operations[key]);
    }
  });

  test("adds the public JSON routes without a base URL override", () => {
    const publicPaths: Record<string, { method: string; path: string; success: number[]; body?: boolean }> = {
      "sandboxes.clean": { method: "PATCH", path: "/api/sandboxes/{{sandbox_id}}/clean", success: [200] },
      "contacts.unscoped.create": { method: "POST", path: "/api/contacts", success: [201], body: true },
      "projects.unscoped.delete": { method: "DELETE", path: "/api/projects/{{project_id}}", success: [200] },
      "billing.unscoped.usage.get": { method: "GET", path: "/api/billing/usage", success: [200] },
      "sending-stats.unscoped.get": { method: "GET", path: "/api/stats", success: [200] },
      "domains.create": { method: "POST", path: "/api/domains", success: [200], body: true },
    };
    for (const [key, expected] of Object.entries(publicPaths)) {
      const request = requestOf(key);
      expect(request.method, key).toBe(expected.method);
      expect(request.path, key).toBe(expected.path);
      expect(request.success, key).toEqual(expected.success);
      expect(request.baseUrl, key).toBeUndefined();
      expect(operations[key]!.timeoutMs, key).toBe(operations["accounts.list"]!.timeoutMs);
      expect(operations[key]!.maxInputBytes, key).toBe(operations["accounts.list"]!.maxInputBytes);
      expect(operations[key]!.maxResponseBytes, key).toBe(operations["accounts.list"]!.maxResponseBytes);
      expect(operations[key]!.responseFormat, key).toBe("json");
      expect(operations[key]!.validationMode, key).toBe("strict-generated");
      expect(operations[key]!.enforceOutputSchema, key).toBe(true);
      const headers = request.headers as Record<string, string> | undefined;
      if (expected.body) {
        expect(request.body, key).toBeDefined();
        expect(headers?.["Content-Type"], key).toBe("application/json");
      } else {
        expect(request.body, key).toBeUndefined();
        expect(headers, key).toBeUndefined();
      }
    }
    expect(requestOf("sandboxes.clean").headers).toBeUndefined();
    expect(requestOf("sending-stats.unscoped.get").query).toMatchObject({
      start_date: "{{start_date}}",
      "domain_ids[]": "{{domain_ids}}",
    });
  });
});
