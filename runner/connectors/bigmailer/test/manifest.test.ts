import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import manifest from "../manifest.json";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const recipe = JSON.parse(
  readFileSync(join(import.meta.dir, "../../../../scripts/connector-gen/openconnector/recipes/bigmailer/recipe.json"), "utf8"),
) as {
  selection: { operations: string[] };
  operationSources: Record<string, { sourceRefs: string[] }>;
  source: { spans: Record<string, unknown> };
  manifest: { operations: Record<string, unknown>; version: string };
};

const ORIGIN_OPS = [
  "healthcheck",
  "brands.list",
  "brands.get",
  "lists.list",
  "contacts.list",
] as const;

const COMPOSIO_TOOLS: Record<string, string> = {
  BIGMAILER_CREATE_BRAND: "brands.create",
  BIGMAILER_CREATE_BRAND_PROPERTY: "properties.create",
  BIGMAILER_CREATE_BULK_CAMPAIGN: "bulkCampaigns.create",
  BIGMAILER_CREATE_CONTACT: "contacts.create",
  BIGMAILER_CREATE_CONTACT_BATCH: "contactBatches.create",
  BIGMAILER_CREATE_FIELD: "fields.create",
  BIGMAILER_CREATE_LIST: "lists.create",
  BIGMAILER_CREATE_SEGMENT: "segments.create",
  BIGMAILER_CREATE_SUPPRESSION_LIST: "suppressionLists.create",
  BIGMAILER_CREATE_TEMPLATE: "templates.create",
  BIGMAILER_CREATE_TRANSACTIONAL_CAMPAIGN: "transactionalCampaigns.create",
  BIGMAILER_CREATE_USER: "users.create",
  BIGMAILER_DELETE_BRAND_PROPERTY: "properties.delete",
  BIGMAILER_DELETE_CONTACT: "contacts.delete",
  BIGMAILER_DELETE_FIELD: "fields.delete",
  BIGMAILER_DELETE_LIST: "lists.delete",
  BIGMAILER_DELETE_SEGMENT: "segments.delete",
  BIGMAILER_DELETE_TEMPLATE: "templates.delete",
  BIGMAILER_DELETE_USER: "users.delete",
  BIGMAILER_GET_BRAND: "brands.get",
  BIGMAILER_GET_BRAND_PROPERTY: "properties.get",
  BIGMAILER_GET_BULK_CAMPAIGN: "bulkCampaigns.get",
  BIGMAILER_GET_CONTACT: "contacts.get",
  BIGMAILER_GET_CONTACT_BATCH: "contactBatches.get",
  BIGMAILER_GET_FIELD: "fields.get",
  BIGMAILER_GET_LIST: "lists.get",
  BIGMAILER_GET_SEGMENT: "segments.get",
  BIGMAILER_GET_SUPPRESSION_LIST: "suppressionLists.get",
  BIGMAILER_GET_TEMPLATE: "templates.get",
  BIGMAILER_GET_TRANSACTIONAL_CAMPAIGN: "transactionalCampaigns.get",
  BIGMAILER_GET_USER: "users.get",
  BIGMAILER_GET_USER_INFO: "users.me",
  BIGMAILER_LIST_ALL_BRANDS: "brands.list",
  BIGMAILER_LIST_BRAND_PROPERTIES: "properties.list",
  BIGMAILER_LIST_BULK_CAMPAIGNS: "bulkCampaigns.list",
  BIGMAILER_LIST_CONNECTIONS: "connections.list",
  BIGMAILER_LIST_CONTACTS: "contacts.list",
  BIGMAILER_LIST_FIELDS: "fields.list",
  BIGMAILER_LIST_LISTS: "lists.list",
  BIGMAILER_LIST_MESSAGE_TYPES: "messageTypes.list",
  BIGMAILER_LIST_SEGMENTS: "segments.list",
  BIGMAILER_LIST_SENDERS: "senders.list",
  BIGMAILER_LIST_SUPPRESSION_LISTS: "suppressionLists.list",
  BIGMAILER_LIST_TEMPLATES: "templates.list",
  BIGMAILER_LIST_TRANSACTIONAL_CAMPAIGNS: "transactionalCampaigns.list",
  BIGMAILER_LIST_USERS: "users.list",
  BIGMAILER_UPDATE_BRAND: "brands.update",
  BIGMAILER_UPDATE_BRAND_PROPERTY: "properties.update",
  BIGMAILER_UPDATE_BULK_CAMPAIGN: "bulkCampaigns.update",
  BIGMAILER_UPDATE_CONTACT: "contacts.update",
  BIGMAILER_UPDATE_FIELD: "fields.update",
  BIGMAILER_UPDATE_LIST: "lists.update",
  BIGMAILER_UPDATE_SEGMENT: "segments.update",
  BIGMAILER_UPDATE_TEMPLATE: "templates.update",
  BIGMAILER_UPDATE_TRANSACTIONAL_CAMPAIGN: "transactionalCampaigns.update",
  BIGMAILER_UPDATE_USER: "users.update",
  BIGMAILER_UPSERT_CONTACT: "contacts.upsert",
};

const HANDWRITTEN = new Set(["suppressionLists.create"]);
const compiled = compileDeclarativeConnector(manifest as never);

function requestOf(key: string): Record<string, unknown> {
  return operations[key]!.request as Record<string, unknown>;
}

describe("bigmailer manifest", () => {
  test("keeps origin identity, auth, and version 0.2.1", () => {
    expect(manifest.key).toBe("bigmailer");
    expect(manifest.version).toBe("0.2.1");
    expect(manifest.network.allowedHosts).toEqual(["api.bigmailer.io"]);
    expect(manifest.http.baseUrl).toBe("https://api.bigmailer.io");
    expect(manifest.http.auth).toMatchObject({
      field: "apiKey",
      in: "header",
      name: "X-API-Key",
      value: "{{apiKey}}",
    });
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("keeps the origin five operations and paths", () => {
    for (const key of ORIGIN_OPS) {
      expect(operations[key], key).toBeDefined();
      expect(requestOf(key).path, key).toBeDefined();
    }
    expect(requestOf("healthcheck")).toMatchObject({ method: "GET", path: "/v1/brands", query: { limit: 1 } });
    expect(requestOf("brands.list").path).toBe("/v1/brands");
    expect(requestOf("brands.get").path).toBe("/v1/brands/{{brandId}}");
    expect(requestOf("lists.list").path).toBe("/v1/brands/{{brandId}}/lists");
    expect(requestOf("contacts.list")).toMatchObject({
      method: "GET",
      path: "/v1/brands/{{brandId}}/contacts",
      query: { list_id: "{{listId}}" },
    });
  });

  test("covers every Composio BigMailer tool with a real HTTP operation", () => {
    expect(Object.keys(COMPOSIO_TOOLS)).toHaveLength(57);
    expect(Object.keys(operations)).toHaveLength(58);
    for (const [slug, key] of Object.entries(COMPOSIO_TOOLS)) {
      expect(operations[key], slug).toBeDefined();
      if (HANDWRITTEN.has(key)) {
        expect(operations[key]!.request, slug).toBeUndefined();
        expect(compiled.actions[key], slug).toBeUndefined();
      } else {
        expect(requestOf(key), slug).toBeDefined();
        expect(compiled.actions[key], slug).toBeTypeOf("function");
      }
    }
    expect(operations["healthcheck"]).toBeDefined();
    expect(compiled.actions["healthcheck"]).toBeTypeOf("function");
  });

  test("gives every action a title, description, object inputSchema, and request or handwritten handler", () => {
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind, key).toBe("action");
      expect(["read", "write", "destructive"], key).toContain(operation.sideEffect);
      expect(String(operation.title ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(0);
      expect((operation.inputSchema as { type?: string }).type, key).toBe("object");
      if (HANDWRITTEN.has(key)) {
        expect(operation.request, key).toBeUndefined();
      } else {
        expect(operation.request, `${key} must declare a request block`).toBeDefined();
        const request = operation.request as Record<string, unknown>;
        expect(typeof request.method, key).toBe("string");
        expect(typeof request.path, key).toBe("string");
        expect(String(request.path).startsWith("/v1/"), key).toBe(true);
      }
    }
  });

  test("classifies mutating HTTP methods as write or destructive", () => {
    for (const [key, operation] of Object.entries(operations)) {
      if (HANDWRITTEN.has(key)) {
        expect(operation.sideEffect, key).toBe("write");
        continue;
      }
      const method = String((operation.request as Record<string, unknown>).method);
      if (method === "DELETE") expect(operation.sideEffect, key).toBe("destructive");
      else if (["POST", "PUT", "PATCH"].includes(method)) expect(operation.sideEffect, key).toBe("write");
      else expect(operation.sideEffect, key).toBe("read");
    }
  });

  test("uses official POST updates and documented path IDs", () => {
    expect(requestOf("brands.update")).toMatchObject({ method: "POST", path: "/v1/brands/{{brandId}}" });
    expect(requestOf("contacts.update")).toMatchObject({
      method: "POST",
      path: "/v1/brands/{{brandId}}/contacts/{{contactId}}",
      query: {
        field_values_op: "{{fieldValuesOp}}",
        list_ids_op: "{{listIdsOp}}",
        unsubscribe_ids_op: "{{unsubscribeIdsOp}}",
      },
    });
    expect(requestOf("contacts.upsert")).toMatchObject({
      method: "POST",
      path: "/v1/brands/{{brandId}}/contacts/upsert",
      query: { validate: "{{validateEmail}}" },
    });
    expect(requestOf("contacts.create").query).toMatchObject({ validate: "{{validateEmail}}" });
    expect(requestOf("users.me")).toMatchObject({ method: "GET", path: "/v1/users/me" });
    expect(requestOf("connections.list").path).toBe("/v1/connections");
    expect(requestOf("messageTypes.list").query).toMatchObject({ type: "{{type}}" });
    expect((requestOf("bulkCampaigns.create").body as Record<string, unknown>).from).toBe("{{fromAddress}}");
    expect((requestOf("contacts.create").body as Record<string, unknown>).field_values).toBe("{{fieldValues}}");
  });

  test("recipe operations match the runner manifest and reuse existing spans", () => {
    expect(recipe.manifest.version).toBe("0.2.0");
    const runnerOps = Object.keys(operations).sort();
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(runnerOps);
    expect([...recipe.selection.operations].sort()).toEqual(runnerOps);
    expect(Object.keys(recipe.operationSources).sort()).toEqual(runnerOps);
    for (const [op, mapping] of Object.entries(recipe.operationSources)) {
      expect(mapping.sourceRefs.length, op).toBeGreaterThan(0);
      for (const ref of mapping.sourceRefs) {
        expect(recipe.source.spans[ref], `${op} sourceRef ${ref}`).toBeDefined();
      }
    }
  });
});
