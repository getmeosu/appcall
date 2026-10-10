import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import COMPOSIO_TOOLS from "./composio-cover.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const ORIGIN_OPS = ["healthcheck", "companies.list", "persons.get", "persons.list"] as const;

const compiled = compileDeclarativeConnector(manifest as never);

function requestOf(key: string): Record<string, unknown> {
  return operations[key]!.request as Record<string, unknown>;
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
      if (items.type === "integer" || items.type === "number") input[key] = [1];
      else if (Array.isArray(items.enum) && items.enum.length > 0) input[key] = [items.enum[0]];
      else if (items.type === "object") input[key] = [dummyInput(items)];
      else input[key] = ["x"];
    } else if (prop.type === "object") input[key] = { id: 1 };
    else input[key] = "x";
  }
  return input;
}

function sameUrl(a: string, b: string): boolean {
  const x = new URL(a);
  const y = new URL(b);
  if (x.protocol !== y.protocol || x.host !== y.host || x.pathname !== y.pathname) return false;
  const q = (u: URL) => [...u.searchParams.entries()].sort((l, r) => l[0].localeCompare(r[0]) || l[1].localeCompare(r[1]));
  return JSON.stringify(q(x)) === JSON.stringify(q(y));
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ak = Object.keys(a as object);
    const bk = Object.keys(b as object);
    return ak.length === bk.length && ak.every((k) => Object.hasOwn(b as object, k) && deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return false;
}

describe("affinity manifest", () => {
  test("has bounded host, origin auth, version, and compiles", () => {
    expect(manifest.key).toBe("affinity");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.categories).toEqual(["crm"]);
    expect(manifest.network.allowedHosts).toEqual(["api.affinity.co"]);
    expect(manifest.http.baseUrl).toBe("https://api.affinity.co");
    expect(manifest.http.auth.field).toBe("apiKey");
    expect(manifest.http.auth.value).toBe("Bearer {{apiKey}}");
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("keeps the origin four operations", () => {
    for (const key of ORIGIN_OPS) {
      expect(operations[key], key).toBeDefined();
      expect(String(requestOf(key).path).startsWith("/v2/"), key).toBe(true);
    }
    expect(requestOf("healthcheck")).toMatchObject({ method: "GET", path: "/v2/auth/whoami" });
    expect(requestOf("persons.list").path).toBe("/v2/persons");
    expect(requestOf("persons.get").path).toBe("/v2/persons/{{personId}}");
    expect(requestOf("companies.list").path).toBe("/v2/companies");
    expect((operations["persons.get"]!.inputSchema as { required: string[] }).required).toEqual(["personId"]);
  });

  test("covers every Composio Affinity tool with a real request", () => {
    expect(Object.keys(COMPOSIO_TOOLS)).toHaveLength(20);
    expect(Object.keys(operations).length).toBe(21);
    for (const [slug, key] of Object.entries(COMPOSIO_TOOLS)) {
      expect(operations[key], slug).toBeDefined();
      expect(requestOf(key), slug).toBeDefined();
      expect(compiled.actions[key], slug).toBeTypeOf("function");
    }
    expect(operations.healthcheck).toBeDefined();
  });

  test("gives every action a real request, title, description, and object inputSchema", () => {
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind, key).toBe("action");
      expect(operation.sideEffect, key).toBe("read");
      expect(String(operation.title ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(0);
      expect((operation.inputSchema as { type?: string }).type, key).toBe("object");
      expect(operation.request, `${key} must declare a request block`).toBeDefined();
      const request = operation.request as Record<string, unknown>;
      expect(request.method, key).toBe("GET");
      expect(typeof request.path, key).toBe("string");
      expect(String(request.path).startsWith("/v2/"), key).toBe(true);
    }
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

  test("keeps GET body-less", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as Record<string, unknown>;
      expect(request.body, key).toBeUndefined();
      const headers = (request.headers as Record<string, string> | undefined) ?? {};
      expect(headers["Content-Type"], key).toBeUndefined();
    }
  });

  test("maps documented Affinity v2 paths", () => {
    expect(requestOf("users.me").path).toBe("/v2/auth/whoami");
    expect(requestOf("companies.get").path).toBe("/v2/companies/{{companyId}}");
    expect(requestOf("companies.fields.list").path).toBe("/v2/companies/fields");
    expect(requestOf("companies.lists.list").path).toBe("/v2/companies/{{companyId}}/lists");
    expect(requestOf("companies.list_entries.list").path).toBe("/v2/companies/{{companyId}}/list-entries");
    expect(requestOf("persons.fields.list").path).toBe("/v2/persons/fields");
    expect(requestOf("persons.lists.list").path).toBe("/v2/persons/{{personId}}/lists");
    expect(requestOf("persons.list_entries.list").path).toBe("/v2/persons/{{personId}}/list-entries");
    expect(requestOf("opportunities.list").path).toBe("/v2/opportunities");
    expect(requestOf("opportunities.get").path).toBe("/v2/opportunities/{{opportunityId}}");
    expect(requestOf("lists.list").path).toBe("/v2/lists");
    expect(requestOf("lists.get").path).toBe("/v2/lists/{{listId}}");
    expect(requestOf("lists.fields.list").path).toBe("/v2/lists/{{listId}}/fields");
    expect(requestOf("lists.list_entries.list").path).toBe("/v2/lists/{{listId}}/list-entries");
    expect(requestOf("lists.saved_views.list").path).toBe("/v2/lists/{{listId}}/saved-views");
    expect(requestOf("lists.saved_views.get").path).toBe("/v2/lists/{{listId}}/saved-views/{{viewId}}");
    expect(requestOf("lists.saved_views.list_entries.list").path).toBe("/v2/lists/{{listId}}/saved-views/{{viewId}}/list-entries");
    expect((requestOf("persons.list").query as Record<string, string>).fieldIds).toBe("{{fieldIds}}");
    expect((requestOf("companies.get").query as Record<string, string>).fieldTypes).toBe("{{fieldTypes}}");
  });

  test("recipe operations equal runner operations", async () => {
    const recipe = await Bun.file(new URL("../../../../scripts/connector-gen/openconnector/recipes/affinity/recipe.json", import.meta.url)).json();
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(Object.keys(operations).sort());
    expect([...recipe.selection.operations].sort()).toEqual(Object.keys(operations).sort());
    expect(recipe.manifest.version).toBe("0.2.0");
  });
});

describe("affinity compiled handlers", () => {
  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  async function invoke(key: string, input: Record<string, unknown>, respond: (request: Request) => Promise<Response> | Response) {
    const requests: Request[] = [];
    const result = await compiled.actions[key]!({
      apiKey: "dummy",
      ...input,
      fetch: async (url: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(url, init);
        requests.push(request);
        return respond(request);
      },
    });
    return { requests, result };
  }

  test("every operation dispatches a real HTTP request for required input", async () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as { method: string; path: string; success?: number[] };
      const input = dummyInput(operation.inputSchema as { properties?: Record<string, any>; required?: string[] });
      const { requests, result } = await invoke(key, input, () => jsonResponse({ id: 1 }, request.success?.[0] ?? 200));
      expect(requests, key).toHaveLength(1);
      expect(requests[0]!.method, key).toBe("GET");
      expect(new URL(requests[0]!.url).hostname, key).toBe("api.affinity.co");
      expect(requests[0]!.headers.get("authorization"), key).toBe("Bearer dummy");
      expect(requests[0]!.headers.get("accept"), key).toBe("application/json");
      expect(result).toMatchObject({ connector: "affinity", action: key, source: "provider" });
    }
  });

  test("origin healthcheck still probes GET /v2/auth/whoami", async () => {
    const { requests } = await invoke("healthcheck", {}, () => jsonResponse({ user: { id: 1 } }));
    expect(new URL(requests[0]!.url).pathname).toBe("/v2/auth/whoami");
    expect(requests[0]!.method).toBe("GET");
    expect(new URL(requests[0]!.url).search).toBe("");
  });

  test("optional query params are omitted when unset and exploded when set", async () => {
    const bare = await invoke("persons.list", {}, () => jsonResponse({ data: [] }));
    expect(new URL(bare.requests[0]!.url).href).toBe("https://api.affinity.co/v2/persons");
    const filtered = await invoke(
      "persons.list",
      { cursor: "abc", limit: 2, ids: [42, 7], fieldIds: ["field-1234", "affinity-data-location"], fieldTypes: ["enriched", "global"] },
      () => jsonResponse({ data: [] }),
    );
    const url = new URL(filtered.requests[0]!.url);
    expect(url.searchParams.get("cursor")).toBe("abc");
    expect(url.searchParams.get("limit")).toBe("2");
    expect(url.searchParams.getAll("ids")).toEqual(["42", "7"]);
    expect(url.searchParams.getAll("fieldIds")).toEqual(["field-1234", "affinity-data-location"]);
    expect(url.searchParams.getAll("fieldTypes")).toEqual(["enriched", "global"]);
  });

  test("companies.get explodes fieldIds", async () => {
    const { requests } = await invoke(
      "companies.get",
      { companyId: 7, fieldIds: ["field-1234", "affinity-data-location"] },
      () => jsonResponse({ id: 7 }),
    );
    expect(new URL(requests[0]!.url).pathname).toBe("/v2/companies/7");
    expect(new URL(requests[0]!.url).searchParams.getAll("fieldIds")).toEqual(["field-1234", "affinity-data-location"]);
  });

  test("path segments are URL-encoded", async () => {
    const { requests } = await invoke("lists.saved_views.get", { listId: 3, viewId: 11 }, () => jsonResponse({ id: 11 }));
    expect(new URL(requests[0]!.url).pathname).toBe("/v2/lists/3/saved-views/11");
  });

  test("maps 401 and 429", async () => {
    await expect(invoke("healthcheck", {}, () => jsonResponse({ message: "nope" }, 401))).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
    await expect(
      invoke("healthcheck", {}, () => new Response("{}", { status: 429, headers: { "retry-after": "4", "content-type": "application/json" } })),
    ).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });

  test("runs fixtures against compiled handlers", async () => {
    const caseDir = join(import.meta.dir, "../fixtures/cases");
    const files = readdirSync(caseDir).filter((name) => name.endsWith(".json")).sort();
    expect(files.length).toBeGreaterThan(20);
    for (const file of files) {
      const raw = JSON.parse(readFileSync(join(caseDir, file), "utf8")) as {
        id: string;
        operation: string;
        input: Record<string, unknown>;
        credentials: Record<string, string>;
        exchanges: Array<{
          request: { method: string; url: string; headers?: Record<string, string>; body: unknown };
          response: { status: number; headers?: Record<string, string>; bodyFile?: string };
        }>;
        expected: { kind: "success"; resultFile: string } | { kind: "error"; code: string };
      };
      const action = compiled.actions[raw.operation];
      expect(action, raw.id).toBeTypeOf("function");
      let index = 0;
      const fetchStub = async (input: RequestInfo | URL, init?: RequestInit) => {
        const expected = raw.exchanges[index++];
        if (!expected) throw new Error(`${raw.id}: extra request`);
        const url = String(input instanceof Request ? input.url : input);
        const method = String(init?.method ?? "GET").toUpperCase();
        if (method !== expected.request.method.toUpperCase() || !sameUrl(url, expected.request.url)) {
          throw new Error(`${raw.id}: ${method} ${url} != ${expected.request.method} ${expected.request.url}`);
        }
        const rawBody = init?.body == null ? null : String(init.body);
        if (expected.request.body === null) {
          if (rawBody !== null && rawBody !== "") throw new Error(`${raw.id}: unexpected body ${rawBody}`);
        } else if (typeof expected.request.body === "object") {
          if (!deepEqual(rawBody ? JSON.parse(rawBody) : null, expected.request.body)) {
            throw new Error(`${raw.id}: body mismatch ${rawBody}`);
          }
        } else if (rawBody !== expected.request.body) {
          throw new Error(`${raw.id}: body mismatch ${rawBody}`);
        }
        const got = new Headers(init?.headers);
        for (const [headerKey, value] of Object.entries(expected.request.headers ?? {})) {
          if (got.get(headerKey) !== value) throw new Error(`${raw.id}: header ${headerKey}=${got.get(headerKey)}!=${value}`);
        }
        const status = expected.response.status;
        if (status === 204) return new Response(null, { status, headers: expected.response.headers });
        const bodyBytes = expected.response.bodyFile
          ? readFileSync(join(dirname(join(caseDir, file)), expected.response.bodyFile))
          : Buffer.from("{}");
        return new Response(bodyBytes, { status, headers: expected.response.headers });
      };
      const input = { ...raw.input, ...raw.credentials, fetch: fetchStub };
      if (raw.expected.kind === "error") {
        let rejected: { code?: string } | undefined;
        try {
          await action!(input);
        } catch (error) {
          rejected = error as { code?: string };
        }
        expect(index, raw.id).toBe(raw.exchanges.length);
        expect(rejected?.code, raw.id).toBe(raw.expected.code);
        continue;
      }
      const result = await action!(input);
      expect(index, raw.id).toBe(raw.exchanges.length);
      const expected = JSON.parse(readFileSync(join(dirname(join(caseDir, file)), raw.expected.resultFile), "utf8"));
      expect(deepEqual(result, expected), `${raw.id} ${JSON.stringify(result)}`).toBe(true);
    }
  });
});
