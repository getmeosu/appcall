import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import manifest from "../manifest.json";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const recipePath = "scripts/connector-gen/openconnector/recipes/bigmailer/recipe.json";
const recipe = JSON.parse(readFileSync(recipePath, "utf8")) as {
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
  BIGMAILER_GET_USER_INFO: "me.get",
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
    expect(Object.keys(operations)).toHaveLength(59);
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
    expect(requestOf("me.get")).toMatchObject({ method: "GET", path: "/v1/me" });
    expect(requestOf("connections.list").path).toBe("/v1/connections");
    expect(requestOf("messageTypes.list").query).toMatchObject({ type: "{{type}}" });
    expect((requestOf("bulkCampaigns.create").body as Record<string, unknown>).from).toBe("{{fromAddress}}");
    expect((requestOf("contacts.create").body as Record<string, unknown>).field_values).toBe("{{fieldValues}}");
  });

  test("keeps the unchanged 0.2.0 recipe and leaves me.get as the only gap", () => {
    expect(existsSync(recipePath)).toBe(true);
    expect(recipe.manifest.version).toBe("0.2.0");
    const runnerOps = Object.keys(operations).sort();
    const recipeOps = Object.keys(recipe.manifest.operations).sort();
    expect(recipeOps).toHaveLength(58);
    expect([...recipe.selection.operations].sort()).toEqual(recipeOps);
    expect(Object.keys(recipe.operationSources).sort()).toEqual(recipeOps);
    const absentFromRecipe = runnerOps.filter((key) => !Object.hasOwn(recipe.operationSources, key));
    expect(absentFromRecipe).toEqual(["me.get"]);
    expect(runnerOps).toEqual([...recipeOps, "me.get"].sort());
    for (const key of recipeOps) {
      const runnerOp = operations[key]!;
      const recipeOp = recipe.manifest.operations[key] as Record<string, unknown>;
      // The frozen recipe still records 1048576, below this operation's maxInputBytes.
      // The origin handler keeps 8388608 so maxResponseBytes stays >= maxInputBytes.
      if (key === "suppressionLists.create") {
        expect(recipeOp.maxResponseBytes).toBe(1048576);
        expect(runnerOp.maxResponseBytes).toBe(8388608);
        expect(runnerOp.maxResponseBytes as number).toBeGreaterThanOrEqual(runnerOp.maxInputBytes as number);
        const { maxResponseBytes: _recipeBudget, ...recipeRest } = recipeOp;
        const { maxResponseBytes: _runnerBudget, ...runnerRest } = runnerOp;
        expect(runnerRest).toEqual(recipeRest);
        continue;
      }
      expect(runnerOp, key).toEqual(recipeOp);
    }
    for (const [op, mapping] of Object.entries(recipe.operationSources)) {
      expect(mapping.sourceRefs.length, op).toBeGreaterThan(0);
      for (const ref of mapping.sourceRefs) {
        expect(recipe.source.spans[ref], `${op} sourceRef ${ref}`).toBeDefined();
      }
    }
  });

  test("adds the documented GET /v1/me identity check beside users.me", () => {
    const users = operations["users.me"]!;
    const me = operations["me.get"]!;
    expect(users.description).toBe(
      "Get the authenticated BigMailer user. Composio GET /me is implemented as GET /v1/users/me.",
    );
    expect(requestOf("users.me")).toEqual({ method: "GET", path: "/v1/users/me", success: [200] });
    expect(me.title).toBe("Get authenticated account");
    expect(me.description).toBe(
      "Documented GET /v1/me identity check. Distinct from users.me, which is GET /v1/users/me.",
    );
    expect(me.sideEffect).toBe("read");
    expect(me.kind).toBe("action");
    expect(me.timeoutMs).toBe(users.timeoutMs);
    expect(me.maxInputBytes).toBe(users.maxInputBytes);
    expect(me.maxResponseBytes).toBe(users.maxResponseBytes);
    expect(me.outputSchema).toEqual(users.outputSchema);
    expect(me.responseFormat).toBe(users.responseFormat);
    expect(me.validationMode).toBe(users.validationMode);
    expect(me.enforceOutputSchema).toBe(users.enforceOutputSchema);
    expect(me.request).toEqual({ method: "GET", path: "/v1/me", success: [200] });
    const request = me.request as { body?: unknown; query?: unknown; headers?: unknown; baseUrl?: unknown };
    expect(request.body).toBeUndefined();
    expect(request.query).toBeUndefined();
    expect(request.headers).toBeUndefined();
    expect(request.baseUrl).toBeUndefined();
    expect(me.inputSchema).toEqual({
      type: "object",
      properties: {},
      additionalProperties: false,
    });
  });
});
