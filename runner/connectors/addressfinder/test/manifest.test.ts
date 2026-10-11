import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import COMPOSIO_TOOLS from "./composio-cover.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const ORIGIN_OPS = ["healthcheck", "addresses.au.find", "addresses.nz.find"] as const;

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
    else if (prop.type === "object") input[key] = { id: 1 };
    else if (key === "email") input[key] = "user@example.com";
    else if (typeof prop.minLength === "number" && prop.minLength > 1) input[key] = "x".repeat(prop.minLength);
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

describe("addressfinder manifest", () => {
  test("has bounded host, origin auth, version, and compiles", () => {
    expect(manifest.key).toBe("addressfinder");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.categories).toEqual(["utility"]);
    expect(manifest.network.allowedHosts).toEqual(["api.addressfinder.io"]);
    expect(manifest.http.baseUrl).toBe("https://api.addressfinder.io/api");
    expect(manifest.http.auth.field).toBe("apiKey");
    expect(manifest.http.auth.in).toBe("query");
    expect(manifest.http.auth.name).toBe("key");
    expect(manifest.http.auth.value).toBe("{{apiKey}}");
    expect(manifest.http.headers).toEqual({ Accept: "application/json", Authorization: "{{apiSecret}}" });
    expect(manifest.http.query).toEqual({ format: "json" });
    expect(manifest.http.errors.bodyErrorPaths).toEqual(["message"]);
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("keeps the origin three operations", () => {
    for (const key of ORIGIN_OPS) {
      expect(operations[key], key).toBeDefined();
      expect(requestOf(key), key).toBeDefined();
    }
    expect(requestOf("healthcheck")).toMatchObject({ method: "GET", path: "/nz/address/autocomplete" });
    expect((requestOf("healthcheck").query as Record<string, string>).q).toBe("test");
    expect((requestOf("healthcheck").query as Record<string, string>).max).toBe("1");
    expect(requestOf("addresses.au.find").path).toBe("/au/address/autocomplete");
    expect(requestOf("addresses.nz.find").path).toBe("/nz/address/autocomplete");
    expect((operations["addresses.au.find"]!.inputSchema as { required: string[] }).required).toEqual(["query"]);
    expect((operations["addresses.nz.find"]!.inputSchema as { required: string[] }).required).toEqual(["query"]);
    expect(((requestOf("addresses.au.find").query as Record<string, string>).q)).toBe("{{query}}");
    expect(((requestOf("addresses.nz.find").query as Record<string, string>).q)).toBe("{{query}}");
  });

  test("covers every Composio Addressfinder tool with a real request", () => {
    expect(Object.keys(COMPOSIO_TOOLS)).toHaveLength(17);
    expect(Object.keys(operations).length).toBe(18);
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
      expect(String(request.path).startsWith("/"), key).toBe(true);
      expect(request.body, key).toBeUndefined();
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

  test("maps documented Addressfinder paths and Composio aliases", () => {
    expect(requestOf("addresses.au.metadata").path).toBe("/au/address/metadata");
    expect(requestOf("addresses.au.verify").path).toBe("/au/address/v2/verification");
    expect(requestOf("locations.au.find").path).toBe("/au/location/autocomplete");
    expect(requestOf("locations.au.metadata").path).toBe("/au/location/metadata");
    expect(requestOf("addresses.nz.metadata").path).toBe("/nz/address/metadata");
    expect(requestOf("addresses.nz.verify").path).toBe("/nz/address/verification");
    expect(requestOf("addresses.nz.reverse_geocode").path).toBe("/nz/address/reverse_geocode");
    expect(requestOf("locations.nz.find").path).toBe("/nz/location/autocomplete");
    expect(requestOf("locations.nz.metadata").path).toBe("/nz/location/metadata");
    expect(requestOf("poi.nz.find").path).toBe("/nz/points_of_interest/autocomplete");
    expect(requestOf("poi.nz.metadata").path).toBe("/nz/points_of_interest/metadata");
    expect(requestOf("emails.verify").path).toBe("/email/v1/verification");
    expect(requestOf("phones.verify").path).toBe("/phone/v1/verification");
    expect(requestOf("addresses.international.find").path).toBe("/{{country}}/address/v2/autocomplete");
    expect(requestOf("addresses.international.metadata").path).toBe("/{{country}}/address/v2/metadata");
    expect((operations["addresses.international.find"]!.inputSchema as { properties: { max: { maximum: number } } }).properties.max.maximum).toBe(15);
    expect((operations["phones.verify"]!.inputSchema as { required: string[] }).required).toEqual(["phone_number", "default_country_code"]);
  });

  test("recipe operations equal runner operations", async () => {
    const recipe = await Bun.file(new URL("../../../../scripts/connector-gen/openconnector/recipes/addressfinder/recipe.json", import.meta.url)).json();
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(Object.keys(operations).sort());
    expect([...recipe.selection.operations].sort()).toEqual(Object.keys(operations).sort());
    expect(Object.keys(recipe.operationSources).sort()).toEqual(Object.keys(operations).sort());
    expect(recipe.manifest.version).toBe("0.2.0");
  });
});

describe("addressfinder compiled handlers", () => {
  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  async function invoke(key: string, input: Record<string, unknown>, respond: (request: Request) => Promise<Response> | Response) {
    const requests: Request[] = [];
    const result = await compiled.actions[key]!({
      apiKey: "dummy",
      apiSecret: "dummy-secret",
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
      const { requests, result } = await invoke(key, input, () => jsonResponse({ success: true }, request.success?.[0] ?? 200));
      expect(requests, key).toHaveLength(1);
      expect(requests[0]!.method, key).toBe("GET");
      expect(new URL(requests[0]!.url).hostname, key).toBe("api.addressfinder.io");
      expect(new URL(requests[0]!.url).searchParams.get("format"), key).toBe("json");
      expect(new URL(requests[0]!.url).searchParams.get("key"), key).toBe("dummy");
      expect(requests[0]!.headers.get("authorization"), key).toBe("dummy-secret");
      expect(requests[0]!.headers.get("accept"), key).toBe("application/json");
      expect(result).toMatchObject({ connector: "addressfinder", action: key, source: "provider" });
    }
  });

  test("origin healthcheck still probes GET /nz/address/autocomplete", async () => {
    const { requests } = await invoke("healthcheck", {}, () => jsonResponse({ success: true, completions: [] }));
    const url = new URL(requests[0]!.url);
    expect(url.pathname).toBe("/api/nz/address/autocomplete");
    expect(url.searchParams.get("q")).toBe("test");
    expect(url.searchParams.get("max")).toBe("1");
    expect(url.searchParams.get("format")).toBe("json");
  });

  test("optional query params are omitted when unset and encoded when set", async () => {
    const bare = await invoke("addresses.au.find", { query: "21 Kent" }, () => jsonResponse({ success: true }));
    const bareUrl = new URL(bare.requests[0]!.url);
    expect(bareUrl.pathname).toBe("/api/au/address/autocomplete");
    expect(bareUrl.searchParams.get("q")).toBe("21 Kent");
    expect(bareUrl.searchParams.get("max")).toBeNull();
    expect(bareUrl.searchParams.get("state_codes")).toBeNull();
    const filtered = await invoke("addresses.au.find", { query: "21 Kent", max: 5, state_codes: "NSW", source: "GNAF" }, () => jsonResponse({ success: true }));
    const url = new URL(filtered.requests[0]!.url);
    expect(url.searchParams.get("max")).toBe("5");
    expect(url.searchParams.get("state_codes")).toBe("NSW");
    expect(url.searchParams.get("source")).toBe("GNAF");
  });

  test("international country is a path segment", async () => {
    const { requests } = await invoke("addresses.international.find", { country: "fr", query: "15 Rue Sa" }, () => jsonResponse({ success: true }));
    expect(new URL(requests[0]!.url).pathname).toBe("/api/fr/address/v2/autocomplete");
    expect(new URL(requests[0]!.url).searchParams.get("q")).toBe("15 Rue Sa");
  });

  test("maps 200 message envelopes and 429", async () => {
    await expect(invoke("healthcheck", {}, () => jsonResponse({ success: false, message: "Key not found", error_code: "1001" }))).rejects.toMatchObject({
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
