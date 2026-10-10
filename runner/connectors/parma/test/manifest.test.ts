import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import COMPOSIO_TOOLS from "./composio-cover.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const ORIGIN_OPS = ["healthcheck", "currentUser.get", "pipelines.list", "users.list", "deals.list"] as const;
const CKAN_TOOLS = ["PARMA_DATA_JSON", "PARMA_PACKAGE_LIST"] as const;

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

describe("parma manifest", () => {
  test("has bounded host, origin auth, version, and compiles", () => {
    expect(manifest.key).toBe("parma");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.categories).toEqual(["crm"]);
    expect(manifest.network.allowedHosts).toEqual(["app.parma.ai", "dati.comune.parma.it"]);
    expect(manifest.http.baseUrl).toBe("https://app.parma.ai");
    expect(manifest.http.auth.field).toBe("apiKey");
    expect(manifest.http.auth.value).toBe("Bearer {{apiKey}}");
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("keeps the origin five operations", () => {
    for (const key of ORIGIN_OPS) {
      expect(operations[key], key).toBeDefined();
      expect(String(requestOf(key).path).startsWith("/api/v1/"), key).toBe(true);
    }
    expect(requestOf("healthcheck")).toMatchObject({ method: "GET", path: "/api/v1/users/me" });
    expect(requestOf("currentUser.get").path).toBe("/api/v1/users/me");
    expect(requestOf("pipelines.list").path).toBe("/api/v1/pipelines");
    expect(requestOf("users.list").path).toBe("/api/v1/users");
    expect(requestOf("deals.list").path).toBe("/api/v1/deals");
    expect((requestOf("deals.list").query as Record<string, string>).page).toBe("{{page}}");
    expect((requestOf("users.list").query as Record<string, string>).page).toBe("{{page}}");
  });

  test("covers every Composio Parma CRM tool with a real request", () => {
    expect(Object.keys(COMPOSIO_TOOLS)).toHaveLength(23);
    expect(Object.keys(operations).length).toBe(24);
    for (const [slug, key] of Object.entries(COMPOSIO_TOOLS)) {
      expect(operations[key], slug).toBeDefined();
      expect(requestOf(key), slug).toBeDefined();
      expect(compiled.actions[key], slug).toBeTypeOf("function");
    }
    expect(operations.healthcheck).toBeDefined();
    expect(COMPOSIO_TOOLS.PARMA_PACKAGE_LIST).toBe("packages.list");
    expect(COMPOSIO_TOOLS.PARMA_DATA_JSON).toBe("catalog.dataJson");
    for (const slug of CKAN_TOOLS) expect(COMPOSIO_TOOLS[slug as keyof typeof COMPOSIO_TOOLS]).toBeDefined();
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
      if (key === "packages.list" || key === "catalog.dataJson") {
        expect(String(request.path).startsWith("/"), key).toBe(true);
      } else {
        expect(String(request.path).startsWith("/api/v1/"), key).toBe(true);
      }
      expect(Object.hasOwn(request, "result"), `${key} must omit request.result`).toBe(false);
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
      const placeholders = [...String(request.path ?? "").matchAll(/\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g)].map((match) => match[1]);
      for (const placeholder of placeholders) {
        expect(schema.required ?? [], `${key} path uses {{${placeholder}}}`).toContain(placeholder);
      }
    }
  });

  test("puts JSON Content-Type only on bodies and keeps GET/DELETE body-less", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as Record<string, unknown>;
      const method = String(request.method);
      const headers = (request.headers as Record<string, string> | undefined) ?? {};
      if (request.body !== undefined) {
        expect(headers["Content-Type"], key).toBe("application/json");
      } else {
        expect(headers["Content-Type"], key).toBeUndefined();
      }
      if (method === "GET" || method === "DELETE") expect(request.body, key).toBeUndefined();
    }
  });

  test("maps documented Parma CRM paths and Composio aliases", () => {
    expect(requestOf("groups.list").path).toBe("/api/v1/groups");
    expect(requestOf("notes.create").path).toBe("/api/v1/notes");
    expect(requestOf("notes.update").path).toBe("/api/v1/notes/{{id}}");
    expect(requestOf("pipelines.get").path).toBe("/api/v1/pipelines/{{id}}");
    expect(requestOf("relationships.list").path).toBe("/api/v1/relationships");
    expect(requestOf("relationships.create").path).toBe("/api/v1/relationships");
    expect(requestOf("relationships.get").path).toBe("/api/v1/relationships/{{id}}");
    expect(requestOf("relationships.update").path).toBe("/api/v1/relationships/{{id}}");
    expect(requestOf("relationships.delete").path).toBe("/api/v1/relationships/{{id}}");
    expect(requestOf("relationships.groups.add").path).toBe("/api/v1/relationships/{{relationship_id}}/groups");
    expect(requestOf("relationships.groups.remove").path).toBe(
      "/api/v1/relationships/{{relationship_id}}/groups/{{relationship_group_id}}",
    );
    expect(requestOf("relationships.notes.list").path).toBe("/api/v1/relationships/{{relationship_id}}/notes");
    expect(requestOf("stages.list").path).toBe("/api/v1/stages");
    expect(requestOf("users.get").path).toBe("/api/v1/users/{{id}}");
    expect((requestOf("notes.create").body as Record<string, string>).relationship_ids).toBe("{{relationship_ids}}");
    expect((requestOf("relationships.groups.add").body as Record<string, string>).group_id).toBe("{{group_id}}");
    expect((requestOf("relationships.list").query as Record<string, string>).linkedin).toBe("{{linkedin}}");
    expect(requestOf("packages.list")).toMatchObject({
      method: "GET",
      path: "/api/3/action/package_list",
      baseUrl: "https://dati.comune.parma.it",
    });
    expect(requestOf("catalog.dataJson")).toMatchObject({
      method: "GET",
      path: "/data.json",
      baseUrl: "https://dati.comune.parma.it",
    });
  });

  test("recipe operations equal runner operations", async () => {
    const recipe = await Bun.file(new URL("../../../../scripts/connector-gen/openconnector/recipes/parma/recipe.json", import.meta.url)).json();
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(Object.keys(operations).sort());
    expect([...recipe.selection.operations].sort()).toEqual(Object.keys(operations).sort());
    expect(recipe.manifest.version).toBe("0.2.0");
  });
});

describe("parma compiled handlers", () => {
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

  function dummyResponse(operation: Record<string, unknown>): unknown {
    const data = (operation.outputSchema as { properties?: { data?: { type?: unknown } } }).properties?.data;
    const types = data?.type;
    if (types === "array" || (Array.isArray(types) && types.includes("array"))) return [{ id: 1 }];
    return { id: 1 };
  }

  test("every operation dispatches a real HTTP request for required input", async () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as { method: string; path: string; success?: number[] };
      const input = dummyInput(operation.inputSchema as { properties?: Record<string, any>; required?: string[] });
      const { requests, result } = await invoke(key, input, () => jsonResponse(dummyResponse(operation), request.success?.[0] ?? 200));
      expect(requests, key).toHaveLength(1);
      expect(requests[0]!.method, key).toBe(request.method);
      const host = new URL(requests[0]!.url).hostname;
      if (key === "packages.list" || key === "catalog.dataJson") expect(host, key).toBe("dati.comune.parma.it");
      else expect(host, key).toBe("app.parma.ai");
      expect(requests[0]!.headers.get("authorization"), key).toBe("Bearer dummy");
      expect(requests[0]!.headers.get("accept"), key).toBe("application/json");
      expect(result).toMatchObject({ connector: "parma", action: key, source: "provider" });
    }
  });

  test("origin healthcheck still probes GET /api/v1/users/me", async () => {
    const { requests } = await invoke("healthcheck", {}, () => jsonResponse({ data: { user: { id: 1 } } }));
    expect(new URL(requests[0]!.url).pathname).toBe("/api/v1/users/me");
    expect(requests[0]!.method).toBe("GET");
    expect(new URL(requests[0]!.url).search).toBe("");
  });

  test("optional query params are omitted when unset and encoded when set", async () => {
    const bare = await invoke("relationships.list", {}, () => jsonResponse({ data: [] }));
    expect(new URL(bare.requests[0]!.url).href).toBe("https://app.parma.ai/api/v1/relationships");
    const filtered = await invoke(
      "relationships.list",
      { name: "Ada", type: "person", email: "ada@example.com", page: "2" },
      () => jsonResponse({ data: [] }),
    );
    const url = new URL(filtered.requests[0]!.url);
    expect(url.searchParams.get("name")).toBe("Ada");
    expect(url.searchParams.get("type")).toBe("person");
    expect(url.searchParams.get("email")).toBe("ada@example.com");
    expect(url.searchParams.get("page")).toBe("2");
    const groups = await invoke("groups.list", { query: "cust", page: "3" }, () => jsonResponse({ data: [] }));
    expect(new URL(groups.requests[0]!.url).searchParams.get("query")).toBe("cust");
    expect(new URL(groups.requests[0]!.url).searchParams.get("page")).toBe("3");
  });

  test("notes.create sends relationship_ids as a JSON array", async () => {
    const { requests } = await invoke(
      "notes.create",
      { body: "Hello", relationship_ids: [7, 8], datetime: "2024-06-19T23:26:32.693Z" },
      () => jsonResponse({ data: { id: 11 } }, 201),
    );
    expect(requests[0]!.method).toBe("POST");
    expect(new URL(requests[0]!.url).pathname).toBe("/api/v1/notes");
    expect(await requests[0]!.json()).toEqual({
      body: "Hello",
      datetime: "2024-06-19T23:26:32.693Z",
      relationship_ids: [7, 8],
    });
  });

  test("optional body fields are omitted when unset", async () => {
    const { requests } = await invoke(
      "relationships.create",
      { name: "Ada Lovelace", group_ids: [2] },
      () => jsonResponse({ data: { id: 7 } }, 201),
    );
    expect(await requests[0]!.json()).toEqual({ name: "Ada Lovelace", group_ids: [2] });
  });

  test("204 deletes wrap data: null without request.result", async () => {
    const { requests, result } = await invoke("relationships.delete", { id: 7 }, () => new Response(null, { status: 204 }));
    expect(requests[0]!.method).toBe("DELETE");
    expect(new URL(requests[0]!.url).pathname).toBe("/api/v1/relationships/7");
    expect(result).toEqual({ connector: "parma", action: "relationships.delete", source: "provider", data: null });
  });

  test("path segments are URL-encoded", async () => {
    const { requests } = await invoke("relationships.get", { id: 9 }, () => jsonResponse({ data: { id: 9 } }));
    expect(new URL(requests[0]!.url).pathname).toBe("/api/v1/relationships/9");
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
