import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const ORIGIN_OPS = [
  "healthcheck",
  "users.list",
  "users.get",
  "groups.list",
  "people.list",
  "people.get",
  "companies.list",
  "companies.get",
] as const;

const COMPOSIO_TOOLS: Record<string, string> = {
  FOLK_CREATE_COMPANY: "companies.create",
  FOLK_CREATE_NOTE: "notes.create",
  FOLK_CREATE_PERSON: "people.create",
  FOLK_DELETE_COMPANY: "companies.delete",
  FOLK_DELETE_NOTE: "notes.delete",
  FOLK_DELETE_PERSON: "people.delete",
  FOLK_DELETE_REMINDER: "reminders.delete",
  FOLK_GET_COMPANY: "companies.get",
  FOLK_GET_CURRENT_WORKSPACE_USER: "healthcheck",
  FOLK_GET_NOTE: "notes.get",
  FOLK_GET_PERSON: "people.get",
  FOLK_GET_USER: "users.get",
  FOLK_LIST_COMPANIES: "companies.list",
  FOLK_LIST_GROUP_CUSTOM_FIELDS: "groups.customFields.list",
  FOLK_LIST_GROUPS: "groups.list",
  FOLK_LIST_NOTES: "notes.list",
  FOLK_LIST_PEOPLE: "people.list",
  FOLK_LIST_REMINDERS: "reminders.list",
  FOLK_LIST_USERS: "users.list",
  FOLK_LIST_WEBHOOKS: "webhooks.list",
  FOLK_UPDATE_COMPANY: "companies.update",
  FOLK_UPDATE_NOTE: "notes.update",
  FOLK_UPDATE_PERSON: "people.update",
};

const compiled = compileDeclarativeConnector(manifest as never);

function requestOf(key: string): Record<string, unknown> {
  return operations[key]!.request as Record<string, unknown>;
}

describe("folk manifest", () => {
  test("has bounded host, origin auth, version, and compiles", () => {
    expect(manifest.key).toBe("folk");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.network.allowedHosts).toEqual(["api.folk.app"]);
    expect(manifest.http.baseUrl).toBe("https://api.folk.app/v1");
    expect(manifest.http.auth.value).toBe("Bearer {{apiKey}}");
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("keeps the origin eight operations", () => {
    for (const key of ORIGIN_OPS) {
      expect(operations[key], key).toBeDefined();
      expect(String(requestOf(key).path).startsWith("/"), key).toBe(true);
    }
    expect(requestOf("healthcheck")).toMatchObject({ method: "GET", path: "/users/me" });
    expect(requestOf("users.list").path).toBe("/users");
    expect(requestOf("users.get").path).toBe("/users/{{userId}}");
    expect(requestOf("groups.list").path).toBe("/groups");
    expect(requestOf("people.list").path).toBe("/people");
    expect(requestOf("people.get").path).toBe("/people/{{personId}}");
    expect(requestOf("companies.list").path).toBe("/companies");
    expect(requestOf("companies.get").path).toBe("/companies/{{companyId}}");
  });

  test("covers every Composio Folk tool with a real request", () => {
    expect(Object.keys(COMPOSIO_TOOLS)).toHaveLength(23);
    expect(Object.keys(operations).length).toBe(23);
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
      expect(String(request.path).startsWith("/"), key).toBe(true);
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

  test("webhook list is a read action", () => {
    expect(operations["webhooks.list"]!.sideEffect).toBe("read");
    expect(requestOf("webhooks.list").method).toBe("GET");
  });

  test("only interpolates path placeholders the schema requires", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as Record<string, unknown>;
      const schema = operation.inputSchema as { required?: string[] };
      const placeholders = [...String(request.path ?? "").matchAll(/\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g)].map((match) => match[1]);
      for (const placeholder of placeholders) {
        expect(schema.required ?? [], `${key} path uses {{${placeholder}}}`).toContain(placeholder);
      }
    }
  });

  test("maps documented Folk paths", () => {
    expect(requestOf("people.create").path).toBe("/people");
    expect(requestOf("people.update").path).toBe("/people/{{personId}}");
    expect(requestOf("people.delete").path).toBe("/people/{{personId}}");
    expect(requestOf("companies.create").path).toBe("/companies");
    expect(requestOf("companies.update").path).toBe("/companies/{{companyId}}");
    expect(requestOf("companies.delete").path).toBe("/companies/{{companyId}}");
    expect(requestOf("notes.create").path).toBe("/notes");
    expect(requestOf("notes.get").path).toBe("/notes/{{noteId}}");
    expect(requestOf("notes.update").path).toBe("/notes/{{noteId}}");
    expect(requestOf("notes.delete").path).toBe("/notes/{{noteId}}");
    expect(requestOf("reminders.delete").path).toBe("/reminders/{{reminderId}}");
    expect(requestOf("groups.customFields.list").path).toBe("/groups/{{groupId}}/custom-fields/{{entityType}}");
    expect(requestOf("webhooks.list").path).toBe("/webhooks");
    expect((requestOf("reminders.list").query as Record<string, string>)["entity.id"]).toBe("{{entityId}}");
  });
});
