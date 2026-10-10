import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import COMPOSIO_TOOLS from "./composio-cover.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const ORIGIN_OPS = ["healthcheck", "gifs.trending", "gifs.search", "gifs.get", "categories.list"] as const;
const compiled = compileDeclarativeConnector(manifest as never);
const ALLOWED = ["api.giphy.com", "upload.giphy.com", "giphy-analytics.giphy.com"];

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
    else input[key] = key.includes("url") ? "https://example.com/cat.gif" : "x";
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

describe("giphy manifest", () => {
  test("has bounded hosts, origin auth, version, and compiles", () => {
    expect(manifest.key).toBe("giphy");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.categories).toEqual(["social"]);
    expect(manifest.network.allowedHosts).toEqual(ALLOWED);
    expect(manifest.http.baseUrl).toBe("https://api.giphy.com/v1");
    expect(manifest.http.auth.field).toBe("apiKey");
    expect(manifest.http.auth.in).toBe("query");
    expect(manifest.http.auth.name).toBe("api_key");
    expect(manifest.http.auth.value).toBe("{{apiKey}}");
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("keeps the origin five operations", () => {
    for (const key of ORIGIN_OPS) {
      expect(operations[key], key).toBeDefined();
      expect(requestOf(key), key).toBeDefined();
    }
    expect(requestOf("healthcheck")).toMatchObject({ method: "GET", path: "/gifs/trending" });
    expect(requestOf("gifs.trending").path).toBe("/gifs/trending");
    expect(requestOf("gifs.search").path).toBe("/gifs/search");
    expect((requestOf("gifs.search").query as Record<string, string>).q).toBe("{{query}}");
    expect(requestOf("gifs.get").path).toBe("/gifs/{{gifId}}");
    expect(requestOf("categories.list").path).toBe("/gifs/categories");
    expect((operations["gifs.get"]!.inputSchema as { required: string[] }).required).toEqual(["gifId"]);
    expect((operations["gifs.search"]!.inputSchema as { required: string[] }).required).toEqual(["query"]);
  });

  test("covers every Composio Giphy tool with a real request", () => {
    expect(Object.keys(COMPOSIO_TOOLS)).toHaveLength(23);
    expect(Object.keys(operations).length).toBe(24);
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

  test("maps documented GIPHY paths and extra hosts", () => {
    expect(requestOf("gifs.list").path).toBe("/gifs");
    expect(requestOf("gifs.translate").path).toBe("/gifs/translate");
    expect(requestOf("gifs.random").path).toBe("/gifs/random");
    expect(requestOf("stickers.search").path).toBe("/stickers/search");
    expect(requestOf("stickers.trending").path).toBe("/stickers/trending");
    expect(requestOf("stickers.translate").path).toBe("/stickers/translate");
    expect(requestOf("stickers.random").path).toBe("/stickers/random");
    expect(requestOf("gifs.autocomplete").path).toBe("/gifs/search/tags");
    expect(requestOf("channels.search").path).toBe("/channels/search");
    expect(requestOf("tags.related").path).toBe("/tags/related/{{term}}");
    expect(requestOf("trending.searches").path).toBe("/trending/searches");
    expect(requestOf("randomid.get").path).toBe("/randomid");
    expect(requestOf("categories.get").path).toBe("/gifs/categories/{{category_id}}");
    expect(requestOf("categories.gifs").path).toBe("/gifs/categories/{{category_id}}/{{tag}}");
    expect(requestOf("emoji.list").path).toBe("/emoji");
    expect(requestOf("emoji.list").baseUrl).toBe("https://api.giphy.com/v2");
    expect(requestOf("emoji.variations").path).toBe("/emoji/{{gif_id}}/variations");
    expect(requestOf("tags.random").path).toBe("/gifs/search/tags");
    expect(requestOf("gifs.upload").method).toBe("POST");
    expect(requestOf("gifs.upload").baseUrl).toBe("https://upload.giphy.com/v1");
    expect(requestOf("gifs.upload").bodyEncoding).toBe("form");
    expect(requestOf("analytics.register").baseUrl).toBe("https://giphy-analytics.giphy.com");
    expect((requestOf("analytics.register").query as Record<string, string>).customer_id).toBe("{{random_id}}");
  });

  test("recipe operations equal runner operations", async () => {
    const recipe = await Bun.file(new URL("../../../../scripts/connector-gen/openconnector/recipes/giphy/recipe.json", import.meta.url)).json();
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(Object.keys(operations).sort());
    expect([...recipe.selection.operations].sort()).toEqual(Object.keys(operations).sort());
    expect(recipe.manifest.version).toBe("0.2.0");
    expect(recipe.manifest.network.allowedHosts).toEqual(ALLOWED);
  });
});

describe("giphy compiled handlers", () => {
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
    if ((operation.request as { result?: unknown }).result !== undefined) return {};
    return { data: { id: "x" }, meta: { status: 200, msg: "OK" } };
  }

  test("every operation dispatches a real HTTP request for required input", async () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as { method: string; path: string; success?: number[]; result?: unknown; baseUrl?: string };
      const input = dummyInput(operation.inputSchema as { properties?: Record<string, any>; required?: string[] });
      const { requests, result } = await invoke(key, input, () => jsonResponse(dummyResponse(operation), request.success?.[0] ?? 200));
      expect(requests, key).toHaveLength(1);
      expect(requests[0]!.method, key).toBe(request.method);
      expect(ALLOWED, key).toContain(new URL(requests[0]!.url).hostname);
      expect(new URL(requests[0]!.url).searchParams.get("api_key"), key).toBe("dummy");
      expect(requests[0]!.headers.get("accept"), key).toBe("application/json");
      expect(result).toMatchObject({ connector: "giphy", action: key, source: "provider" });
    }
  });

  test("origin healthcheck still probes GET /v1/gifs/trending?limit=1", async () => {
    const { requests } = await invoke("healthcheck", {}, () => jsonResponse({ data: [] }));
    const url = new URL(requests[0]!.url);
    expect(url.hostname).toBe("api.giphy.com");
    expect(url.pathname).toBe("/v1/gifs/trending");
    expect(url.searchParams.get("limit")).toBe("1");
    expect(requests[0]!.method).toBe("GET");
  });

  test("optional query params are omitted when unset and encoded when set", async () => {
    const bare = await invoke("gifs.search", { query: "cats" }, () => jsonResponse({ data: [] }));
    const bareUrl = new URL(bare.requests[0]!.url);
    expect(bareUrl.searchParams.get("q")).toBe("cats");
    expect(bareUrl.searchParams.get("limit")).toBeNull();
    expect(bareUrl.searchParams.get("rating")).toBeNull();
    const filtered = await invoke("gifs.search", { query: "cats", limit: 2, rating: "g", lang: "en" }, () => jsonResponse({ data: [] }));
    const url = new URL(filtered.requests[0]!.url);
    expect(url.searchParams.get("q")).toBe("cats");
    expect(url.searchParams.get("limit")).toBe("2");
    expect(url.searchParams.get("rating")).toBe("g");
    expect(url.searchParams.get("lang")).toBe("en");
  });

  test("upload sends form body to upload.giphy.com", async () => {
    const { requests } = await invoke(
      "gifs.upload",
      { source_image_url: "https://example.com/cat.gif", tags: "cats" },
      () => jsonResponse({ data: { id: "1" } }),
    );
    expect(requests[0]!.method).toBe("POST");
    expect(new URL(requests[0]!.url).hostname).toBe("upload.giphy.com");
    expect(new URL(requests[0]!.url).pathname).toBe("/v1/gifs");
    expect(requests[0]!.headers.get("content-type")).toBe("application/x-www-form-urlencoded");
    expect(await requests[0]!.text()).toBe("source_image_url=https%3A%2F%2Fexample.com%2Fcat.gif&tags=cats");
  });

  test("analytics register maps random_id to customer_id", async () => {
    const { requests, result } = await invoke(
      "analytics.register",
      {
        ts: 1527703430507,
        gif_id: "abc",
        random_id: "user-1",
        action_type: "CLICK",
        analytics_response_payload: "payload",
      },
      () => jsonResponse({}),
    );
    const url = new URL(requests[0]!.url);
    expect(url.hostname).toBe("giphy-analytics.giphy.com");
    expect(url.pathname).toBe("/v2/pingback_simple");
    expect(url.searchParams.get("customer_id")).toBe("user-1");
    expect(url.searchParams.get("action_type")).toBe("CLICK");
    expect(url.searchParams.get("gif_id")).toBe("abc");
    expect(result).toMatchObject({ ok: true, action: "analytics.register" });
  });

  test("emoji uses the v2 host path", async () => {
    const listed = await invoke("emoji.list", { limit: 1 }, () => jsonResponse({ data: [] }));
    expect(new URL(listed.requests[0]!.url).pathname).toBe("/v2/emoji");
    const varied = await invoke("emoji.variations", { gif_id: "iigp4VDyf5dCLRlGkm" }, () => jsonResponse({ data: [] }));
    expect(new URL(varied.requests[0]!.url).pathname).toBe("/v2/emoji/iigp4VDyf5dCLRlGkm/variations");
  });

  test("path segments are URL-encoded", async () => {
    const { requests } = await invoke("gifs.get", { gifId: "a b" }, () => jsonResponse({ data: {} }));
    expect(new URL(requests[0]!.url).pathname).toBe(" /v1/gifs/a%20b".trim());
  });

  test("maps 401 and 429", async () => {
    await expect(invoke("healthcheck", {}, () => jsonResponse({ meta: { msg: "nope" } }, 401))).rejects.toMatchObject({
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
        const expectedEx = raw.exchanges[index++];
        if (!expectedEx) throw new Error(`${raw.id}: extra request`);
        const url = String(input instanceof Request ? input.url : input);
        const method = String(init?.method ?? "GET").toUpperCase();
        if (method !== expectedEx.request.method.toUpperCase() || !sameUrl(url, expectedEx.request.url)) {
          throw new Error(`${raw.id}: ${method} ${url} != ${expectedEx.request.method} ${expectedEx.request.url}`);
        }
        const rawBody = init?.body == null ? null : String(init.body);
        if (expectedEx.request.body === null) {
          if (rawBody !== null && rawBody !== "") throw new Error(`${raw.id}: unexpected body ${rawBody}`);
        } else if (typeof expectedEx.request.body === "object") {
          if (!deepEqual(rawBody ? JSON.parse(rawBody) : null, expectedEx.request.body)) {
            throw new Error(`${raw.id}: body mismatch ${rawBody}`);
          }
        } else if (rawBody !== expectedEx.request.body) {
          throw new Error(`${raw.id}: body mismatch ${rawBody}`);
        }
        const got = new Headers(init?.headers);
        for (const [headerKey, value] of Object.entries(expectedEx.request.headers ?? {})) {
          if (got.get(headerKey) !== value) throw new Error(`${raw.id}: header ${headerKey}=${got.get(headerKey)}!=${value}`);
        }
        const status = expectedEx.response.status;
        if (status === 204) return new Response(null, { status, headers: expectedEx.response.headers });
        const bodyBytes = expectedEx.response.bodyFile
          ? readFileSync(join(dirname(join(caseDir, file)), expectedEx.response.bodyFile))
          : Buffer.from("{}");
        return new Response(bodyBytes, { status, headers: expectedEx.response.headers });
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
      const expectedResult = JSON.parse(readFileSync(join(dirname(join(caseDir, file)), raw.expected.resultFile), "utf8"));
      expect(deepEqual(result, expectedResult), `${raw.id} ${JSON.stringify(result)}`).toBe(true);
    }
  });
});
