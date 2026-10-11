import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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
  MAILTRAP_CLEAN_INBOX: "inboxes.clean",
  MAILTRAP_CREATE_CONTACT: "contacts.create",
  MAILTRAP_CREATE_CONTACT_EVENT: "contacts.events.create",
  MAILTRAP_CREATE_CONTACT_EXPORT: "contacts.exports.create",
  MAILTRAP_CREATE_CONTACT_FIELD: "contacts.fields.create",
  MAILTRAP_CREATE_CONTACT_LIST: "contact-lists.create",
  MAILTRAP_CREATE_EMAIL_TEMPLATE: "email-templates.create",
  MAILTRAP_CREATE_SENDING_DOMAIN: "sending-domains.create",
  MAILTRAP_DELETE_CONTACT: "contacts.delete",
  MAILTRAP_DELETE_CONTACT_FIELD: "contacts.fields.delete",
  MAILTRAP_DELETE_CONTACT_LIST: "contact-lists.delete",
  MAILTRAP_DELETE_EMAIL_TEMPLATE: "email-templates.delete",
  MAILTRAP_DELETE_PROJECT: "projects.delete",
  MAILTRAP_DELETE_SENDING_DOMAIN: "sending-domains.delete",
  MAILTRAP_GET_BILLING_USAGE: "billing.usage.get",
  MAILTRAP_GET_CONTACT: "contacts.get",
  MAILTRAP_GET_CONTACT_EXPORT: "contacts.exports.get",
  MAILTRAP_GET_CONTACT_FIELD: "contacts.fields.get",
  MAILTRAP_GET_CONTACT_IMPORT: "contacts.imports.get",
  MAILTRAP_GET_CONTACT_LIST: "contact-lists.get",
  MAILTRAP_GET_EMAIL_TEMPLATE: "email-templates.get",
  MAILTRAP_GET_INBOX: "inboxes.get",
  MAILTRAP_GET_MESSAGE_HTML: "messages.html.get",
  MAILTRAP_GET_PERMISSION_RESOURCES: "permissions.resources.get",
  MAILTRAP_GET_PROJECT: "projects.get",
  MAILTRAP_GET_SENDING_DOMAIN: "sending-domains.get",
  MAILTRAP_GET_SENDING_STATS: "sending-stats.get",
  MAILTRAP_GET_SENDING_STATS_BY_CATEGORIES: "sending-stats.by-categories",
  MAILTRAP_GET_SENDING_STATS_BY_DATE: "sending-stats.by-date",
  MAILTRAP_GET_SENDING_STATS_BY_DOMAINS: "sending-stats.by-domains",
  MAILTRAP_GET_SENDING_STATS_BY_ESP: "sending-stats.by-esp",
  MAILTRAP_IMPORT_CONTACTS: "contacts.import",
  MAILTRAP_LIST_ACCOUNTS: "accounts.list",
  MAILTRAP_LIST_CONTACT_FIELDS: "contacts.fields.list",
  MAILTRAP_LIST_CONTACT_LISTS: "contact-lists.list_account",
  MAILTRAP_LIST_EMAIL_TEMPLATES: "email-templates.list",
  MAILTRAP_LIST_INBOXES: "inboxes.list",
  MAILTRAP_LIST_MESSAGES: "messages.list",
  MAILTRAP_LIST_PROJECTS: "projects.list_account",
  MAILTRAP_LIST_SENDING_DOMAINS: "sending-domains.list",
  MAILTRAP_LIST_SUPPRESSIONS: "suppressions.list",
  MAILTRAP_MARK_INBOX_AS_READ: "inboxes.mark_as_read",
  MAILTRAP_RESET_INBOX_CREDENTIALS: "inboxes.reset_credentials",
  MAILTRAP_UPDATE_CONTACT: "contacts.update",
  MAILTRAP_UPDATE_CONTACT_FIELD: "contacts.fields.update",
  MAILTRAP_UPDATE_CONTACT_LIST: "contact-lists.update",
  MAILTRAP_UPDATE_EMAIL_TEMPLATE: "email-templates.update",
  MAILTRAP_UPDATE_INBOX: "inboxes.update",
  MAILTRAP_UPDATE_PROJECT: "projects.update",
};

const recipe = JSON.parse(
  readFileSync(join(import.meta.dir, "../../../../scripts/connector-gen/openconnector/recipes/mailtrap/recipe.json"), "utf8"),
) as {
  selection: { operations: string[] };
  manifest: { operations: Record<string, unknown>; version?: string };
};

const compiled = compileDeclarativeConnector(manifest as never);

function requestOf(key: string): Record<string, unknown> {
  return operations[key]!.request as Record<string, unknown>;
}

describe("mailtrap manifest", () => {
  test("keeps origin auth, host, and provenance", () => {
    expect(manifest.key).toBe("mailtrap");
    expect(manifest.version).toBe("0.2.0");
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
    expect(Object.keys(operations).length).toBe(53);
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
      if (method === "DELETE") expect(operation.sideEffect, key).toBe("destructive");
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

  test("keeps recipe operations equal to runner operations", () => {
    expect(recipe.manifest.version).toBe(manifest.version);
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(Object.keys(operations).sort());
    expect([...recipe.selection.operations].sort()).toEqual(Object.keys(operations).sort());
  });
});
