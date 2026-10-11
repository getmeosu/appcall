import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import COMPOSIO_TOOLS from "./composio-cover.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const ORIGIN_OPS = ["healthcheck", "account.status", "locations.list", "locations.get", "browsers.list"] as const;

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
    else if (prop.type === "array") input[key] = ["x"];
    else if (prop.type === "object") input[key] = { id: "x" };
    else input[key] = key.includes("url") ? "https://example.com/" : "x";
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

describe("gtmetrix manifest", () => {
  test("has bounded host, origin auth, version, and compiles", () => {
    expect(manifest.key).toBe("gtmetrix");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.categories).toEqual(["dev-tools"]);
    expect(manifest.network.allowedHosts).toEqual(["gtmetrix.com"]);
    expect(manifest.http.baseUrl).toBe("https://gtmetrix.com/api/2.0");
    expect(manifest.http.auth.field).toBe("apiKey");
    expect(manifest.http.auth.basic).toEqual({ username: "{{apiKey}}", password: "" });
    expect(manifest.http.headers).toEqual({ Accept: "application/vnd.api+json" });
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("keeps the origin five operations", () => {
    for (const key of ORIGIN_OPS) {
      expect(operations[key], key).toBeDefined();
      expect(requestOf(key), key).toBeDefined();
    }
    expect(requestOf("healthcheck")).toMatchObject({ method: "GET", path: "/status" });
    expect(requestOf("account.status")).toMatchObject({ method: "GET", path: "/status" });
    expect(requestOf("locations.list").path).toBe("/locations");
    expect(requestOf("locations.get").path).toBe("/locations/{{location_id}}");
    expect(requestOf("browsers.list").path).toBe("/browsers");
    expect((operations["locations.get"]!.inputSchema as { required: string[] }).required).toEqual(["location_id"]);
  });

  test("covers every Composio GTmetrix tool with a real request", () => {
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

  test("puts JSON:API Content-Type only on bodies and keeps GET body-less", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as Record<string, unknown>;
      const method = String(request.method);
      const headers = (request.headers as Record<string, string> | undefined) ?? {};
      if (request.body !== undefined) {
        expect(headers["Content-Type"], key).toBe("application/vnd.api+json");
      } else {
        expect(headers["Content-Type"], key).toBeUndefined();
      }
      if (method === "GET" || method === "DELETE") expect(request.body, key).toBeUndefined();
    }
  });

  test("maps documented GTmetrix paths and Composio aliases", () => {
    expect(requestOf("browsers.get").path).toBe("/browsers/{{browser_id}}");
    expect(requestOf("simulated_devices.list").path).toBe("/simulated-devices");
    expect(requestOf("simulated_devices.get").path).toBe("/simulated-devices/{{simulated_device_id}}");
    expect(requestOf("tests.start")).toMatchObject({ method: "POST", path: "/tests" });
    expect(requestOf("tests.list").path).toBe("/tests");
    expect(requestOf("tests.get").path).toBe("/tests/{{test_id}}");
    expect(requestOf("pages.list").path).toBe("/pages");
    expect(requestOf("pages.get").path).toBe("/pages/{{page_id}}");
    expect(requestOf("pages.delete")).toMatchObject({ method: "DELETE", path: "/pages/{{page_id}}" });
    expect(requestOf("pages.retest")).toMatchObject({ method: "POST", path: "/pages/{{page_id}}/retest" });
    expect(requestOf("pages.latest_report.get").path).toBe("/pages/{{page_id}}/latest-report");
    expect(requestOf("pages.reports.list").path).toBe("/pages/{{page_id}}/reports");
    expect(requestOf("reports.get").path).toBe("/reports/{{report_id}}");
    expect(requestOf("reports.delete").path).toBe("/reports/{{report_id}}");
    expect(requestOf("reports.retest").path).toBe("/reports/{{report_id}}/retest");
    expect(requestOf("reports.resource.get").path).toBe("/reports/{{report_id}}/resources/{{resource_name}}");
    expect((requestOf("tests.list").query as Record<string, string>)["page[size]"]).toBe("{{page_size}}");
    expect((requestOf("tests.list").query as Record<string, string>)["filter[state]"]).toBe("{{filter_state}}");
    expect((requestOf("pages.list").query as Record<string, string>)["filter[url]"]).toBe("{{filter_url}}");
    expect((requestOf("tests.start").body as { data: { type: string } }).data.type).toBe("test");
    expect((requestOf("tests.start").success as number[])).toEqual([202]);
    expect((requestOf("tests.get").success as number[])).toEqual([200]);
  });

  test("recipe operations equal runner operations", async () => {
    const recipe = await Bun.file(new URL("../../../../scripts/connector-gen/openconnector/recipes/gtmetrix/recipe.json", import.meta.url)).json();
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(Object.keys(operations).sort());
    expect([...recipe.selection.operations].sort()).toEqual(Object.keys(operations).sort());
    expect(Object.keys(recipe.operationSources).sort()).toEqual(Object.keys(operations).sort());
    expect(recipe.manifest.version).toBe("0.2.0");
  });
});

describe("gtmetrix compiled handlers", () => {
  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/vnd.api+json" } });

  async function invoke(key: string, input: Record<string, unknown>, respond: (request: Request) => Promise<Response> | Response) {
    const requests: Request[] = [];
    const result = await compiled.actions[key]!({
      apiKey: "gtm-key",
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
    return { data: { type: "fixture", id: "ok" } };
  }

  test("every operation dispatches a real HTTP request for required input", async () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as { method: string; path: string; success?: number[] };
      const input = dummyInput(operation.inputSchema as { properties?: Record<string, any>; required?: string[] });
      const { requests, result } = await invoke(key, input, () => jsonResponse(dummyResponse(operation), request.success?.[0] ?? 200));
      expect(requests, key).toHaveLength(1);
      expect(requests[0]!.method, key).toBe(request.method);
      expect(new URL(requests[0]!.url).hostname, key).toBe("gtmetrix.com");
      expect(requests[0]!.headers.get("authorization"), key).toBe("Basic Z3RtLWtleTo=");
      expect(requests[0]!.headers.get("accept"), key).toBe("application/vnd.api+json");
      expect(result).toMatchObject({ connector: "gtmetrix", action: key, source: "provider" });
    }
  });

  test("origin healthcheck still probes GET /status", async () => {
    const { requests } = await invoke("healthcheck", {}, () => jsonResponse({ data: { type: "user" } }));
    expect(new URL(requests[0]!.url).pathname).toBe("/api/2.0/status");
    expect(requests[0]!.method).toBe("GET");
    expect(new URL(requests[0]!.url).search).toBe("");
  });

  test("optional query params are omitted when unset and encoded when set", async () => {
    const bare = await invoke("tests.list", {}, () => jsonResponse({ data: [] }));
    expect(new URL(bare.requests[0]!.url).href).toBe("https://gtmetrix.com/api/2.0/tests");
    const filtered = await invoke(
      "tests.list",
      { filter_state: "completed", page_number: 2, page_size: 10, sort: "-created" },
      () => jsonResponse({ data: [] }),
    );
    const url = new URL(filtered.requests[0]!.url);
    expect(url.searchParams.get("filter[state]")).toBe("completed");
    expect(url.searchParams.get("page[number]")).toBe("2");
    expect(url.searchParams.get("page[size]")).toBe("10");
    expect(url.searchParams.get("sort")).toBe("-created");
  });

  test("tests.start sends JSON:API attributes and omits unset options", async () => {
    const bare = await invoke("tests.start", { url: "https://gtmetrix.com/" }, () => jsonResponse({ data: { type: "test", id: "EMz34Hyw" } }, 202));
    expect(bare.requests[0]!.method).toBe("POST");
    expect(bare.requests[0]!.headers.get("content-type")).toBe("application/vnd.api+json");
    expect(await bare.requests[0]!.json()).toEqual({ data: { attributes: { url: "https://gtmetrix.com/" }, type: "test" } });
    const full = await invoke(
      "tests.start",
      { url: "https://gtmetrix.com/", location: "1", browser: "3", adblock: 1, video: 0 },
      () => jsonResponse({ data: { type: "test", id: "EMz34Hyw" } }, 202),
    );
    expect(await full.requests[0]!.json()).toEqual({
      data: { attributes: { adblock: 1, browser: "3", location: "1", url: "https://gtmetrix.com/", video: 0 }, type: "test" },
    });
  });

  test("path segments are URL-encoded", async () => {
    const { requests } = await invoke("pages.get", { page_id: "a/b?c" }, () => jsonResponse({ data: { id: "a/b?c" } }));
    expect(new URL(requests[0]!.url).pathname).toBe("/api/2.0/pages/a%2Fb%3Fc");
  });

  test("maps 401 and 429", async () => {
    await expect(invoke("healthcheck", {}, () => jsonResponse({ errors: [{ detail: "Invalid API key" }] }, 401))).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
    await expect(
      invoke("healthcheck", {}, () => new Response("{}", { status: 429, headers: { "retry-after": "4", "content-type": "application/vnd.api+json" } })),
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
