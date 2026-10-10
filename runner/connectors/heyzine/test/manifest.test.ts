import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import { heyzineWriteHandlers } from "../src/writes";
import COMPOSIO_TOOLS from "./composio-cover.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const ORIGIN_OPS = ["healthcheck", "flipbooks.list", "flipbooks.get", "bookshelves.list", "bookshelves.flipbooks.list"] as const;
const HANDWRITTEN = new Set(Object.keys(heyzineWriteHandlers));
const compiled = compileDeclarativeConnector(manifest as never);
const actions: Record<string, (input: unknown) => unknown> = { ...compiled.actions, ...heyzineWriteHandlers };

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
      if (items.type === "object") input[key] = [dummyInput(items)];
      else input[key] = ["x"];
    } else if (prop.type === "object") input[key] = { id: 1 };
    else input[key] = key.includes("url") || key === "pdf" ? "https://example.com/file.pdf" : "x";
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

function fixtureRequestBodyExpectation(operation: string, input: Record<string, unknown>, body: unknown): unknown {
  if (operation !== "flipbooks.access_list.update") {
    let candidate = body;
    if (typeof candidate === "string") {
      try {
        candidate = JSON.parse(candidate) as unknown;
      } catch {
        return undefined;
      }
    }
    return candidate !== null && typeof candidate === "object" ? candidate : undefined;
  }

  const entries = input.access_list;
  const first = Array.isArray(entries) ? entries[0] : undefined;
  if (!first || typeof first !== "object" || Array.isArray(first)) return undefined;
  const entry = first as Record<string, unknown>;
  const expected: Record<string, unknown> = {
    access_type: entry.access_type,
    name: input.flipbook_id,
    password: entry.password,
    type: input.type,
    user: entry.user,
  };
  return Object.fromEntries(Object.entries(expected).filter(([, value]) => value !== undefined));
}

describe("heyzine manifest", () => {
  test("has bounded hosts, origin auth, version, and compiles", () => {
    expect(manifest.key).toBe("heyzine");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.categories).toEqual(["productivity"]);
    expect(manifest.network.allowedHosts).toEqual(["cdn.heyzine.com", "heyzine.com"]);
    expect(manifest.http.baseUrl).toBe("https://heyzine.com");
    expect(manifest.http.auth.field).toBe("apiKey");
    expect(manifest.http.auth.value).toBe("Bearer {{apiKey}}");
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    expect(manifest.http.errors.bodyErrorPaths).toEqual(["msg"]);
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("keeps the origin five operations", () => {
    for (const key of ORIGIN_OPS) {
      expect(operations[key], key).toBeDefined();
      expect(requestOf(key).method, key).toBe("GET");
    }
    expect(requestOf("healthcheck")).toMatchObject({ method: "GET", path: "/api1/flipbook-list" });
    expect(requestOf("flipbooks.list").path).toBe("/api1/flipbook-list");
    expect(requestOf("flipbooks.get")).toMatchObject({ method: "GET", path: "/api1/flipbook-details" });
    expect(requestOf("bookshelves.list").path).toBe("/api1/bookshelf-list");
    expect(requestOf("bookshelves.flipbooks.list").path).toBe("/api1/bookshelf-flipbooks");
    expect((operations["flipbooks.get"]!.inputSchema as { required: string[] }).required).toEqual(["id"]);
  });

  test("covers every Composio Heyzine tool", () => {
    expect(Object.keys(COMPOSIO_TOOLS)).toHaveLength(16);
    expect(Object.keys(operations).length).toBe(20);
    for (const [slug, key] of Object.entries(COMPOSIO_TOOLS)) {
      expect(operations[key], slug).toBeDefined();
      if (operations[key]!.kind === "webhook") {
        expect(operations[key]!.sideEffect, slug).toBe("read");
        continue;
      }
      expect(requestOf(key), slug).toBeDefined();
      expect(actions[key], slug).toBeTypeOf("function");
    }
    expect(operations.healthcheck).toBeDefined();
  });

  test("gives every action a title, description, object inputSchema, and request or webhook", () => {
    for (const [key, operation] of Object.entries(operations)) {
      expect(["action", "webhook"], key).toContain(operation.kind);
      expect(operation.sideEffect, key).toBe(operation.kind === "webhook" ? "read" : operation.sideEffect);
      expect(["read", "write", "destructive"], key).toContain(operation.sideEffect);
      expect(String(operation.title ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(0);
      expect((operation.inputSchema as { type?: string }).type, key).toBe("object");
      if (operation.kind === "webhook") {
        expect(operation.request, key).toBeUndefined();
        continue;
      }
      expect(operation.request, `${key} must declare a request block`).toBeDefined();
      const request = operation.request as Record<string, unknown>;
      expect(typeof request.method, key).toBe("string");
      expect(typeof request.path, key).toBe("string");
    }
  });

  test("classifies mutating HTTP methods as write", () => {
    for (const [key, operation] of Object.entries(operations)) {
      if (operation.kind !== "action") continue;
      const method = String((operation.request as Record<string, unknown>).method);
      if (["POST", "PUT", "PATCH"].includes(method) || key === "flipbooks.create.link") expect(operation.sideEffect, key).toBe("write");
      else expect(operation.sideEffect, key).toBe("read");
    }
  });

  test("maps documented Heyzine paths and Composio aliases", () => {
    expect(requestOf("flipbooks.create.link")).toMatchObject({ method: "GET", path: "/api1" });
    expect(requestOf("flipbooks.create.async")).toMatchObject({ method: "POST", path: "/api1/async" });
    expect(requestOf("flipbooks.create.sync")).toMatchObject({ method: "POST", path: "/api1/rest" });
    expect(requestOf("flipbooks.delete")).toMatchObject({ method: "POST", path: "/api1/flipbook-delete" });
    expect(requestOf("limits.get").path).toBe("/api1/limits");
    expect(requestOf("flipbooks.embed.get").path).toBe("/api1/flipbook-details");
    expect(requestOf("jquery.plugin.get")).toMatchObject({ method: "GET", path: "/release/jquery.pdfflipbook.4.js", baseUrl: "https://cdn.heyzine.com" });
    expect(requestOf("oembed.get").path).toBe("/api1/oembed");
    expect(requestOf("webhooks.setup").path).toBe("/api1/flipbook-list");
    expect(requestOf("flipbooks.access_list.update").path).toBe("/api1/access-add");
    expect(requestOf("flipbooks.password.update").path).toBe("/api1/access-setup");
    expect(requestOf("flipbooks.social.update").path).toBe("/api1/flipbook-social");
    expect((requestOf("flipbooks.social.update").body as Record<string, string>).id).toBe("{{flipbook_id}}");
    expect((requestOf("flipbooks.access_list.update").body as Record<string, string>).name).toBe("{{flipbook_id}}");
    expect((requestOf("flipbooks.access_list.update").body as Record<string, string>).access_type).toBe("{{access_type}}");
  });

  test("recipe operations equal runner operations", async () => {
    const recipe = await Bun.file(new URL("../../../../scripts/connector-gen/openconnector/recipes/heyzine/recipe.json", import.meta.url)).json();
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(Object.keys(operations).sort());
    expect([...recipe.selection.operations].sort()).toEqual(Object.keys(operations).sort());
    expect(recipe.manifest.version).toBe("0.2.0");
  });
});

describe("heyzine compiled handlers", () => {
  const jsonResponse = (body: unknown, status = 200, contentType = "application/json") =>
    new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": contentType } });

  async function invoke(key: string, input: Record<string, unknown>, respond: (request: Request) => Promise<Response> | Response) {
    const requests: Request[] = [];
    const result = await actions[key]!({
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
    if (data?.type === "array") return [{ id: 1 }];
    return { id: 1, success: true };
  }

  test("every HTTP action dispatches a real request for required input", async () => {
    for (const [key, operation] of Object.entries(operations)) {
      if (operation.kind !== "action") continue;
      const request = operation.request as { method: string; path: string; success?: number[]; baseUrl?: string };
      const input = dummyInput(operation.inputSchema as { properties?: Record<string, any>; required?: string[] });
      const host = request.baseUrl ? new URL(request.baseUrl).hostname : "heyzine.com";
      const { requests, result } = await invoke(key, input, () => jsonResponse(dummyResponse(operation), request.success?.[0] ?? 200, key === "jquery.plugin.get" ? "application/javascript" : "application/json"));
      expect(requests, key).toHaveLength(1);
      expect(requests[0]!.method, key).toBe(request.method);
      expect(new URL(requests[0]!.url).hostname, key).toBe(host);
      expect(requests[0]!.headers.get("authorization"), key).toBe("Bearer dummy");
      expect(requests[0]!.headers.get("accept"), key).toBe("application/json");
      expect(result).toMatchObject({ connector: "heyzine", action: key, source: "provider" });
    }
  });

  test("origin healthcheck still probes GET /api1/flipbook-list", async () => {
    const { requests } = await invoke("healthcheck", {}, () => jsonResponse([]));
    expect(new URL(requests[0]!.url).pathname).toBe("/api1/flipbook-list");
    expect(requests[0]!.method).toBe("GET");
  });

  test("optional list filters are omitted when unset", async () => {
    const bare = await invoke("flipbooks.list", {}, () => jsonResponse([]));
    expect(new URL(bare.requests[0]!.url).href).toBe("https://heyzine.com/api1/flipbook-list");
    const filtered = await invoke("flipbooks.list", { tag: "catalog", page: 2, limit: 10, search: "summer" }, () => jsonResponse([]));
    const url = new URL(filtered.requests[0]!.url);
    expect(url.searchParams.get("tag")).toBe("catalog");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("limit")).toBe("10");
    expect(url.searchParams.get("search")).toBe("summer");
  });

  test("handwritten writes keep success:true bodies that include msg", async () => {
    const deleted = await invoke("flipbooks.delete", { id: "abc.pdf" }, () => jsonResponse({ success: true, code: 200, msg: "Flipbook deleted" }));
    expect(new URL(deleted.requests[0]!.url).pathname).toBe("/api1/flipbook-delete");
    expect(await deleted.requests[0]!.json()).toEqual({ id: "abc.pdf" });
    expect(deleted.result).toEqual({ connector: "heyzine", action: "flipbooks.delete", source: "provider", data: { success: true, code: 200, msg: "Flipbook deleted" } });

    const access = await invoke(
      "flipbooks.access_list.update",
      { flipbook_id: "abc.pdf", access_list: [{ access_type: "user_pass", user: "a@b.c", password: "p" }] },
      () => jsonResponse({ success: true, code: 200, msg: "Added to the access list" }),
    );
    expect(new URL(access.requests[0]!.url).pathname).toBe("/api1/access-add");
    expect(await access.requests[0]!.json()).toEqual({
      access_type: "user_pass",
      name: "abc.pdf",
      password: "p",
      user: "a@b.c",
    });
  });

  test("maps 401 and 429", async () => {
    await expect(invoke("healthcheck", {}, () => jsonResponse({ message: "nope" }, 401))).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
    await expect(
      invoke("healthcheck", {}, () => new Response("{}", { status: 429, headers: { "retry-after": "4", "content-type": "application/json" } })),
    ).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });

  test("runs fixtures against compiled and handwritten handlers", async () => {
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
      const action = actions[raw.operation];
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
        const bodyExpectation = fixtureRequestBodyExpectation(raw.operation, raw.input, expected.request.body);
        if (expected.request.body === null) {
          if (rawBody !== null && rawBody !== "") throw new Error(`${raw.id}: unexpected body ${rawBody}`);
        } else if (bodyExpectation !== undefined) {
          if (!deepEqual(rawBody ? JSON.parse(rawBody) : null, bodyExpectation)) {
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
