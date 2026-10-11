import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import recipe from "../../../../scripts/connector-gen/openconnector/recipes/notion/recipe.json";

const operations = manifest.operations as Record<
  string,
  {
    kind?: string;
    sideEffect?: string;
    title?: string;
    description?: string;
    validationMode?: string;
    responseFormat?: string;
    enforceOutputSchema?: boolean;
    request?: {
      method?: string;
      path?: string;
      body?: unknown;
      query?: Record<string, unknown>;
      headers?: Record<string, string>;
      echo?: unknown;
    };
    inputSchema?: {
      type?: string;
      required?: string[];
      additionalProperties?: boolean;
      properties?: Record<string, any>;
    };
  }
>;

const AUTH_KEYS = ["scopes", "setup", "type"] as const;
const compiled = compileDeclarativeConnector(manifest as never);

const ORIGIN_OPS = ["healthcheck", "credentials.validate", "comments.create", "comments.list", "comments.retrieve", "documents.blocks.append", "documents.blocks.list", "documents.create", "documents.get", "documents.restore", "documents.search", "documents.trash", "databases.get", "databases.items.query", "databases.items.update", "databases.items.restore", "databases.items.trash", "databases.items.create", "databases.items.get", "users.list", "users.me", "users.get", "databases.create", "blocks.delete", "pages.properties.get", "webhook.page.updated", "webhook.database.updated"] as const;

const REQUIRED = {"healthcheck": {"method": "GET", "path": "/v1/users/me"}, "search": {"method": "POST", "path": "/v1/search"}, "pages.get": {"method": "GET", "path": "/v1/pages/{{pageId}}"}, "pages.create": {"method": "POST", "path": "/v1/pages"}, "databases.query": {"method": "POST", "path": "/v1/databases/{{databaseId}}/query"}, "blocks.children.list": {"method": "GET", "path": "/v1/blocks/{{blockId}}/children"}} as const;

const DESTRUCTIVE = new Set([
  "blocks.delete",
  "comments.delete",
  "views.delete",
  "views.queries.delete",
  "documents.trash",
  "databases.items.trash",
]);

const READ_POST = new Set([
  "search",
  "documents.search",
  "databases.query",
  "databases.items.query",
  "dataSources.query",
  "views.queries.create",
]);

function requestOf(key: string) {
  return operations[key]?.request;
}

function dummyInput(schema: { properties?: Record<string, any>; required?: string[] }): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const key of schema.required ?? []) {
    const prop = schema.properties?.[key] ?? {};
    if (Array.isArray(prop.enum) && prop.enum.length > 0) input[key] = prop.enum[0];
    else if (prop.type === "integer" || prop.type === "number") input[key] = 1;
    else if (prop.type === "boolean") input[key] = true;
    else if (prop.type === "array") {
      const items = prop.items ?? {};
      if (items.type === "object") input[key] = [{ object: "block", type: "paragraph" }];
      else input[key] = ["x"];
    } else if (prop.type === "object") input[key] = { page_id: "page-1" };
    else input[key] = key.endsWith("Id") || key.endsWith("ID") ? "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" : "x";
  }
  return input;
}

describe("notion manifest", () => {
  test("compiles a REST connector against api.notion.com with Bearer apiToken", () => {
    expect(manifest.key).toBe("notion");
    expect(manifest.version).toBe("0.3.0");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.categories).toEqual(["productivity"]);
    expect(manifest.network.allowedHosts).toEqual(["api.notion.com"]);
    expect(manifest.http.baseUrl).toBe("https://api.notion.com");
    expect(manifest.http.auth).toEqual({
      field: "apiToken",
      in: "header",
      name: "Authorization",
      value: "Bearer {{apiToken}}",
    });
    expect(manifest.http.headers["Notion-Version"]).toBe("2026-03-11");
    expect(manifest.http.headers["Content-Type"]).toBeUndefined();
    expect(manifest.auth.type).toBe("api_key");
    expect(Object.keys(manifest.auth).sort()).toEqual([...AUTH_KEYS]);
    expect(manifest.auth.scopes).toEqual([]);
    expect(manifest.auth.setup.fields.map((field: { key: string }) => field.key)).toEqual(["apiToken"]);
    expect(manifest.auth.setup.fields[0].required).toBe(true);
    expect(manifest.auth.setup.fields[0].secret).toBe(true);
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("keeps every origin/main operation", () => {
    for (const name of ORIGIN_OPS) {
      expect(operations[name], name).toBeDefined();
    }
    expect(ORIGIN_OPS).toHaveLength(27);
  });

  test("covers healthcheck, search, pages.get/create, databases.query, and blocks.children.list", () => {
    for (const [name, spec] of Object.entries(REQUIRED)) {
      expect(operations[name]?.kind, name).toBe("action");
      expect(requestOf(name)?.method, name).toBe(spec.method);
      expect(requestOf(name)?.path, name).toBe(spec.path);
      expect(compiled.actions[name], name).toBeTypeOf("function");
    }
    expect(requestOf("healthcheck")?.echo).toEqual({ status: "ok" });
    expect(operations.search?.sideEffect).toBe("read");
    expect(operations["databases.query"]?.sideEffect).toBe("read");
    expect(operations["blocks.children.list"]?.sideEffect).toBe("read");
    expect(operations["pages.get"]?.sideEffect).toBe("read");
    expect(operations["pages.create"]?.sideEffect).toBe("write");
  });

  test("gives every action a request, a strict object schema, and GET/DELETE body-less JSON writes", () => {
    const httpHeaders = (manifest.http.headers ?? {}) as Record<string, string>;
    for (const [name, operation] of Object.entries(operations)) {
      expect(["action", "webhook"], name).toContain(operation.kind);
      expect(["read", "write", "destructive"], name).toContain(operation.sideEffect);
      expect(String(operation.title ?? "").length, name).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, name).toBeGreaterThan(0);
      if (operation.kind === "webhook" || name.includes("webhook")) {
        expect(operation.sideEffect, name).toBe("read");
        expect(operation.request, name).toBeUndefined();
        continue;
      }
      const request = operation.request;
      expect(request?.method, name).toBeString();
      expect(String(request?.path ?? "").startsWith("/v1/"), name).toBe(true);
      expect(operation.inputSchema?.type, name).toBe("object");
      expect(operation.inputSchema?.additionalProperties, name).toBe(false);
      expect(operation.validationMode, name).toBe("strict-generated");
      expect(operation.responseFormat, name).toBe("json");
      expect(operation.enforceOutputSchema, name).toBe(true);
      const placeholders = [...String(request?.path ?? "").matchAll(/\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g)].map(
        (match) => match[1],
      );
      for (const placeholder of placeholders) {
        expect(operation.inputSchema?.required ?? [], name + " " + placeholder).toContain(placeholder);
      }
      if (request?.method === "GET" || request?.method === "DELETE") expect(request.body, name).toBeUndefined();
      if (request?.body !== undefined) {
        const contentType =
          request.headers?.["Content-Type"] ??
          request.headers?.["content-type"] ??
          httpHeaders["Content-Type"] ??
          httpHeaders["content-type"];
        expect(contentType, name).toBe("application/json");
      } else {
        expect(request?.headers?.["Content-Type"], name).toBeUndefined();
      }
    }
  });

  test("classifies mutating HTTP methods as write or destructive", () => {
    for (const [key, operation] of Object.entries(operations)) {
      if (operation.kind === "webhook") {
        expect(operation.sideEffect, key).toBe("read");
        continue;
      }
      const method = String(operation.request?.method);
      if (DESTRUCTIVE.has(key) || method === "DELETE") expect(operation.sideEffect, key).toBe("destructive");
      else if (READ_POST.has(key) || method === "GET") expect(operation.sideEffect, key).toBe("read");
      else if (["POST", "PUT", "PATCH"].includes(method)) expect(operation.sideEffect, key).toBe("write");
    }
  });

  test("keeps webhook catalog reads as sideEffect read and native recipe auth type/scopes/setup only", () => {
    for (const [name, operation] of Object.entries(operations)) {
      if (name.includes("webhook") || operation.kind === "webhook") expect(operation.sideEffect, name).toBe("read");
    }
    expect(Object.keys(recipe.auth).sort()).toEqual([...AUTH_KEYS]);
    expect(Object.keys(recipe.manifest.auth).sort()).toEqual([...AUTH_KEYS]);
    expect(recipe.auth.type).toBe("api_key");
    expect(recipe.auth.scopes).toEqual([]);
    expect(recipe.auth.setup.fields.map((field: { key: string }) => field.key)).toEqual(["apiToken"]);
    expect(recipe.auth.setup.fields[0].secret).toBe(true);
    expect(recipe.auth.setup.fields[0].required).toBe(true);
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(Object.keys(operations).sort());
    expect([...recipe.selection.operations].sort()).toEqual(Object.keys(operations).sort());
    expect(Object.keys(recipe.operationSources).sort()).toEqual(Object.keys(operations).sort());
    expect(recipe.source.revision).toBe("33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a");
    expect(recipe.selection.upstreamSha).toBe("33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a");
    expect(JSON.stringify(recipe.manifest)).toBe(JSON.stringify(manifest));
  });
});

describe("notion compiled handlers", () => {
  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  async function invoke(
    key: string,
    input: Record<string, unknown>,
    respond: (request: Request) => Promise<Response> | Response,
  ) {
    const requests: Request[] = [];
    const result = await compiled.actions[key]!({
      apiToken: "secret_dummy",
      ...input,
      fetch: async (url: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(url, init);
        requests.push(request);
        return respond(request);
      },
    });
    return { requests, result };
  }

  test("every request-backed operation hits api.notion.com with Bearer and Notion-Version", async () => {
    for (const [key, operation] of Object.entries(operations)) {
      if (operation.kind === "webhook" || !operation.request) continue;
      const request = operation.request as { method: string; success?: number[] };
      const input = dummyInput(operation.inputSchema as { properties?: Record<string, any>; required?: string[] });
      const { requests, result } = await invoke(key, input, () =>
        jsonResponse({ object: "list", results: [] }, request.success?.[0] ?? 200),
      );
      expect(requests, key).toHaveLength(1);
      expect(requests[0]!.method, key).toBe(request.method);
      expect(new URL(requests[0]!.url).host, key).toBe("api.notion.com");
      expect(requests[0]!.headers.get("authorization"), key).toBe("Bearer secret_dummy");
      expect(requests[0]!.headers.get("notion-version"), key).toBe("2026-03-11");
      if (request.method === "GET" || request.method === "DELETE") {
        expect(await requests[0]!.clone().text(), key).toBe("");
      } else {
        expect(requests[0]!.headers.get("content-type"), key).toContain("application/json");
        const text = await requests[0]!.clone().text();
        expect(text.length, key).toBeGreaterThan(0);
        JSON.parse(text);
      }
      expect(result).toMatchObject({ connector: "notion", action: key, source: "provider" });
    }
  });

  test("healthcheck GETs /v1/users/me and echoes ok without a credential", async () => {
    const { requests } = await invoke("healthcheck", {}, () =>
      jsonResponse({ object: "user", id: "bot-1", type: "bot" }),
    );
    expect(requests[0]!.url).toBe("https://api.notion.com/v1/users/me");
    const echoed = compiled.actions.healthcheck!({ fetch: async () => jsonResponse({}) });
    expect(echoed).toMatchObject({ connector: "notion", action: "healthcheck", source: "connector", status: "ok" });
  });

  test("pages.get requires pageId and search POSTs JSON", async () => {
    await expect(invoke("pages.get", {}, () => jsonResponse({}))).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
    const got = await invoke("pages.get", { pageId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }, () =>
      jsonResponse({ object: "page", id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }),
    );
    expect(got.requests[0]!.url).toBe("https://api.notion.com/v1/pages/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    const searched = await invoke("search", { query: "plan" }, () => jsonResponse({ object: "list", results: [] }));
    expect(searched.requests[0]!.method).toBe("POST");
    expect(JSON.parse(await searched.requests[0]!.text())).toMatchObject({ query: "plan" });
  });

  test("rejects undeclared healthcheck fields before fetch", async () => {
    let calls = 0;
    await expect(
      compiled.actions.healthcheck!({
        apiToken: "secret_dummy",
        nope: true,
        fetch: async () => {
          calls += 1;
          return jsonResponse({});
        },
      }),
    ).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    expect(calls).toBe(0);
  });
});
