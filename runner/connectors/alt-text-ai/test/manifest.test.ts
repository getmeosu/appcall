import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import { bulkCreateImages } from "../src/actions";
import manifest from "../manifest.json";
import COMPOSIO_TOOLS from "./composio-cover.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const ORIGIN_OPS = ["healthcheck", "account.get", "images.list", "images.get", "images.search"] as const;
const HANDWRITTEN = new Set(["images.bulk_create"]);

const compiled = compileDeclarativeConnector(manifest as never);
const actions = {
  ...compiled.actions,
  "images.bulk_create": bulkCreateImages,
};

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
    } else if (prop.type === "object") {
      if (key === "file") input[key] = { name: "images.csv", content: "url\nhttps://example.com/a.jpg\n" };
      else if (key === "image" && prop.properties?.url) input[key] = { url: "https://example.com/a.jpg" };
      else if (key === "image" && prop.properties?.alt_text) input[key] = { alt_text: "A fruit bowl." };
      else if (key === "page_scrape") input[key] = { url: "https://example.com/gallery.html" };
      else if (key === "account") input[key] = { name: "Demo" };
      else input[key] = dummyInput(prop);
    } else input[key] = key.includes("url") ? "https://example.com/hook" : "x";
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

describe("alt-text-ai manifest", () => {
  test("has bounded host, origin auth, version, and compiles", () => {
    expect(manifest.key).toBe("alt-text-ai");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.categories).toEqual(["utility"]);
    expect(manifest.network.allowedHosts).toEqual(["alttext.ai"]);
    expect(manifest.http.baseUrl).toBe("https://alttext.ai/api/v1");
    expect(manifest.http.auth.field).toBe("apiKey");
    expect(manifest.http.auth.name).toBe("X-API-Key");
    expect(manifest.http.auth.value).toBe("{{apiKey}}");
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("keeps the origin five operations", () => {
    for (const key of ORIGIN_OPS) {
      expect(operations[key], key).toBeDefined();
      expect(requestOf(key), key).toBeDefined();
    }
    expect(requestOf("healthcheck")).toMatchObject({ method: "GET", path: "/account" });
    expect(requestOf("account.get")).toMatchObject({ method: "GET", path: "/account" });
    expect(requestOf("images.list").path).toBe("/images");
    expect(requestOf("images.get").path).toBe("/images/{{asset_id}}");
    expect(requestOf("images.search").path).toBe("/images/search");
    expect((operations["images.get"]!.inputSchema as { required: string[] }).required).toEqual(["asset_id"]);
    expect((operations["images.search"]!.inputSchema as { required: string[] }).required).toEqual(["query"]);
  });

  test("covers every Composio AltText.ai tool with a real request or handwritten handler", () => {
    expect(Object.keys(COMPOSIO_TOOLS)).toHaveLength(10);
    expect(Object.keys(operations).length).toBe(11);
    for (const [slug, key] of Object.entries(COMPOSIO_TOOLS)) {
      expect(operations[key], slug).toBeDefined();
      if (HANDWRITTEN.has(key)) {
        expect(operations[key]!.request, slug).toMatchObject({ method: "POST", path: "/images/bulk_create" });
        expect((operations[key]!.request as Record<string, unknown>).body, slug).toBeUndefined();
        expect(compiled.actions[key], slug).toBeTypeOf("function");
        expect(actions[key], slug).toBeTypeOf("function");
      } else {
        expect(requestOf(key), slug).toBeDefined();
        expect(compiled.actions[key], slug).toBeTypeOf("function");
      }
    }
    expect(operations.healthcheck).toBeDefined();
  });

  test("gives every action a title, description, object inputSchema, and request or handwritten handler", () => {
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind, key).toBe("action");
      expect(["read", "write", "destructive"], key).toContain(operation.sideEffect);
      expect(String(operation.title ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(0);
      expect((operation.inputSchema as { type?: string }).type, key).toBe("object");
      if (HANDWRITTEN.has(key)) {
        expect(operation.request, key).toMatchObject({ method: "POST", path: "/images/bulk_create" });
        expect((operation.request as Record<string, unknown>).body, key).toBeUndefined();
      } else {
        expect(operation.request, `${key} must declare a request block`).toBeDefined();
        const request = operation.request as Record<string, unknown>;
        expect(typeof request.method, key).toBe("string");
        expect(typeof request.path, key).toBe("string");
        expect(String(request.path).startsWith("/"), key).toBe(true);
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

  test("only interpolates path placeholders the schema requires", () => {
    for (const [key, operation] of Object.entries(operations)) {
      if (HANDWRITTEN.has(key)) continue;
      const request = operation.request as Record<string, unknown>;
      const schema = operation.inputSchema as { required?: string[] };
      const placeholders = [...String(request.path ?? "").matchAll(/\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g)].map((match) => match[1]);
      for (const placeholder of placeholders) {
        expect(schema.required ?? [], `${key} path uses {{${placeholder}}}`).toContain(placeholder);
      }
    }
  });

  test("puts JSON Content-Type only on bodies and keeps GET body-less", () => {
    for (const [key, operation] of Object.entries(operations)) {
      if (HANDWRITTEN.has(key)) continue;
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

  test("maps documented AltText.ai paths and Composio aliases", () => {
    expect(requestOf("account.update")).toMatchObject({ method: "PUT", path: "/account" });
    expect((requestOf("account.update").body as Record<string, string>).account).toBe("{{account}}");
    expect(requestOf("images.create")).toMatchObject({ method: "POST", path: "/images" });
    expect((requestOf("images.create").body as Record<string, string>).image).toBe("{{image}}");
    expect((requestOf("images.create").body as Record<string, string>).async).toBe("{{async_mode}}");
    expect(requestOf("images.update")).toMatchObject({ method: "PUT", path: "/images/{{asset_id}}" });
    expect(requestOf("images.delete")).toMatchObject({ method: "DELETE", path: "/images/{{asset_id}}" });
    expect(requestOf("images.scrape")).toMatchObject({ method: "POST", path: "/images/page_scrape" });
    expect((requestOf("images.scrape").body as Record<string, string>).page_scrape).toBe("{{page_scrape}}");
    expect((requestOf("images.search").query as Record<string, string>).q).toBe("{{query}}");
    const parameters = requestOf("images.search").parameters as Array<{ inputName: string; wireName: string }>;
    expect(parameters).toEqual(expect.arrayContaining([
      expect.objectContaining({ inputName: "limit", wireName: "limit" }),
      expect.objectContaining({ inputName: "per_page", wireName: "limit" }),
    ]));
  });

  test("recipe operations equal runner operations", async () => {
    const recipe = await Bun.file(new URL("../../../../scripts/connector-gen/openconnector/recipes/alt_text_ai/recipe.json", import.meta.url)).json();
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(Object.keys(operations).sort());
    expect([...recipe.selection.operations].sort()).toEqual(Object.keys(operations).sort());
    expect(recipe.manifest.version).toBe("0.2.0");
  });
});

describe("alt-text-ai compiled handlers", () => {
  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

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
    if ((operation.request as { result?: unknown } | undefined)?.result !== undefined) return {};
    const data = (operation.outputSchema as { properties?: { data?: { type?: unknown } } }).properties?.data;
    const types = data?.type;
    if (types === "array" || (Array.isArray(types) && types.includes("array"))) return [{ id: 1 }];
    return { id: 1 };
  }

  test("every operation dispatches a real HTTP request for required input", async () => {
    const handwrittenPath: Record<string, { method: string; path: string }> = {
      "images.bulk_create": { method: "POST", path: "/api/v1/images/bulk_create" },
    };
    for (const [key, operation] of Object.entries(operations)) {
      const request = (operation.request as { method: string; path: string; success?: number[] } | undefined)
        ?? handwrittenPath[key]!;
      const input = dummyInput(operation.inputSchema as { properties?: Record<string, any>; required?: string[] });
      const { requests, result } = await invoke(key, input, () => jsonResponse(dummyResponse(operation), request.success?.[0] ?? 200));
      expect(requests, key).toHaveLength(1);
      expect(requests[0]!.method, key).toBe(request.method);
      expect(new URL(requests[0]!.url).hostname, key).toBe("alttext.ai");
      expect(requests[0]!.headers.get("x-api-key"), key).toBe("dummy");
      expect(requests[0]!.headers.get("accept"), key).toBe("application/json");
      expect(result).toMatchObject({ connector: "alt-text-ai", action: key, source: "provider" });
    }
  });

  test("origin healthcheck still probes GET /account", async () => {
    const { requests } = await invoke("healthcheck", {}, () => jsonResponse({ name: "Demo" }));
    expect(new URL(requests[0]!.url).pathname).toBe("/api/v1/account");
    expect(requests[0]!.method).toBe("GET");
    expect(new URL(requests[0]!.url).search).toBe("");
  });

  test("optional query params are omitted when unset and encoded when set", async () => {
    const bare = await invoke("images.list", {}, () => jsonResponse({ images: [] }));
    expect(new URL(bare.requests[0]!.url).href).toBe("https://alttext.ai/api/v1/images");
    const filtered = await invoke("images.list", { page: 2, limit: 10, url: "https://cdn.example.com/a.jpg" }, () => jsonResponse({ images: [] }));
    const url = new URL(filtered.requests[0]!.url);
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("limit")).toBe("10");
    expect(url.searchParams.get("url")).toBe("https://cdn.example.com/a.jpg");
  });

  test("images.search maps query to q and per_page to limit", async () => {
    const origin = await invoke("images.search", { query: "apple", page: 1, limit: 20 }, () => jsonResponse({ images: [] }));
    expect(new URL(origin.requests[0]!.url).href).toBe("https://alttext.ai/api/v1/images/search?q=apple&page=1&limit=20");
    const composio = await invoke("images.search", { query: "apple", page: 1, per_page: 20 }, () => jsonResponse({ images: [] }));
    expect(new URL(composio.requests[0]!.url).href).toBe("https://alttext.ai/api/v1/images/search?q=apple&page=1&limit=20");
  });

  test("images.create sends nested image and maps async_mode to async", async () => {
    const { requests } = await invoke(
      "images.create",
      {
        image: { url: "https://example.com/watch.jpg", asset_id: "watch-1" },
        lang: "en,es",
        keywords: ["watch"],
        ecomm: { product: "Daytona", brand: "Rolex" },
        async_mode: true,
        overwrite: false,
      },
      () => jsonResponse({ asset_id: "watch-1" }),
    );
    expect(requests[0]!.method).toBe("POST");
    expect(new URL(requests[0]!.url).pathname).toBe("/api/v1/images");
    expect(await requests[0]!.json()).toEqual({
      image: { url: "https://example.com/watch.jpg", asset_id: "watch-1" },
      lang: "en,es",
      keywords: ["watch"],
      ecomm: { product: "Daytona", brand: "Rolex" },
      async: true,
      overwrite: false,
    });
  });

  test("account.update and images.scrape send nested Composio objects", async () => {
    const account = await invoke(
      "account.update",
      { account: { name: "Demo Account", webhook_url: "https://example.com/hook" } },
      () => jsonResponse({ name: "Demo Account" }),
    );
    expect(await account.requests[0]!.json()).toEqual({
      account: { name: "Demo Account", webhook_url: "https://example.com/hook" },
    });
    const scrape = await invoke(
      "images.scrape",
      { page_scrape: { url: "https://example.com/gallery.html" }, include_existing: true, keywords: ["fruit"] },
      () => jsonResponse({ total_processed: 1 }),
    );
    expect(new URL(scrape.requests[0]!.url).pathname).toBe("/api/v1/images/page_scrape");
    expect(await scrape.requests[0]!.json()).toEqual({
      page_scrape: { url: "https://example.com/gallery.html" },
      include_existing: true,
      keywords: ["fruit"],
    });
  });

  test("images.bulk_create posts multipart CSV and optional email", async () => {
    const { requests, result } = await invoke(
      "images.bulk_create",
      {
        file: { name: "images.csv", content: "url\nhttps://example.com/a.jpg\n", mimetype: "text/csv" },
        email: "ops@example.com",
      },
      () => jsonResponse({ success: true, rows: 1, row_errors: [], error: null }),
    );
    expect(requests[0]!.method).toBe("POST");
    expect(new URL(requests[0]!.url).pathname).toBe("/api/v1/images/bulk_create");
    expect(requests[0]!.headers.get("content-type") ?? "").toContain("multipart/form-data");
    const form = await requests[0]!.formData();
    const file = form.get("file");
    expect(file).toBeInstanceOf(File);
    expect((file as File).name).toBe("images.csv");
    expect(await (file as File).text()).toBe("url\nhttps://example.com/a.jpg\n");
    expect(form.get("email")).toBe("ops@example.com");
    expect(result).toMatchObject({
      connector: "alt-text-ai",
      action: "images.bulk_create",
      source: "provider",
      data: { success: true, rows: 1 },
    });
  });

  test("path segments are URL-encoded", async () => {
    const { requests } = await invoke("images.get", { asset_id: "a/b" }, () => jsonResponse({ asset_id: "a/b" }));
    expect(new URL(requests[0]!.url).pathname).toBe("/api/v1/images/a%2Fb");
  });

  test("maps 401 and 429", async () => {
    await expect(invoke("healthcheck", {}, () => jsonResponse({ message: "nope" }, 401))).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
    await expect(
      invoke("healthcheck", {}, () => new Response("{}", { status: 429, headers: { "retry-after": "4", "content-type": "application/json" } })),
    ).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });

  test("runs declarative fixtures against compiled handlers", async () => {
    const caseDir = join(import.meta.dir, "../fixtures/cases");
    const files = readdirSync(caseDir).filter((name) => name.endsWith(".json")).sort();
    expect(files.length).toBeGreaterThan(15);
    await replayFixtureDirectory(caseDir, compiled.actions);
  });

  test("runs handwritten multipart fixtures against the handwritten handler", async () => {
    const caseDir = join(import.meta.dir, "../fixtures/handwritten-cases");
    const files = readdirSync(caseDir).filter((name) => name.endsWith(".json")).sort();
    expect(files).toEqual(["images-bulk-create-missing-file.json", "images-bulk-create-success.json"]);
    await replayFixtureDirectory(caseDir, actions);
  });
});

async function replayFixtureDirectory(
  caseDir: string,
  handlers: Record<string, (input: unknown) => unknown>,
): Promise<void> {
  const files = readdirSync(caseDir).filter((name) => name.endsWith(".json")).sort();
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
    const action = handlers[raw.operation];
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
      const jsonBody = jsonBodyExpectation(expected.request.body);
      const multipartSpec = isRecord(jsonBody) && jsonBody.multipart === true ? jsonBody : undefined;
      const multipart = multipartSpec !== undefined;
      if (multipart) {
        const form = await new Request(url, init).formData();
        const file = form.get("file");
        if (!(file instanceof File) || file.name !== multipartSpec!.fileName) {
          throw new Error(`${raw.id}: missing multipart file ${String(multipartSpec!.fileName)}`);
        }
        if (multipartSpec!.email !== undefined && form.get("email") !== multipartSpec!.email) {
          throw new Error(`${raw.id}: email mismatch`);
        }
      } else {
        const rawBody = init?.body == null ? null : String(init.body);
        if (expected.request.body === null) {
          if (rawBody !== null && rawBody !== "") throw new Error(`${raw.id}: unexpected body ${rawBody}`);
        } else if (jsonBody !== undefined) {
          if (!deepEqual(rawBody ? JSON.parse(rawBody) : null, jsonBody)) {
            throw new Error(`${raw.id}: body mismatch ${rawBody}`);
          }
        } else if (rawBody !== expected.request.body) {
          throw new Error(`${raw.id}: body mismatch ${rawBody}`);
        }
      }
      const got = new Headers(init?.headers);
      for (const [headerKey, value] of Object.entries(expected.request.headers ?? {})) {
        if (headerKey.toLowerCase() === "content-type" && multipart) continue;
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
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonBodyExpectation(value: unknown): unknown {
  let candidate = value;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate) as unknown;
    } catch {
      return undefined;
    }
  }
  return candidate !== null && typeof candidate === "object" ? candidate : undefined;
}
