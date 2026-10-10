import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import COMPOSIO_TOOLS from "./composio-cover.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const ORIGIN_OPS = ["healthcheck", "geocoding.direct", "weather.current", "weather.forecast", "air-pollution.current"] as const;

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

describe("openweather-api manifest", () => {
  test("has bounded hosts, origin query auth, version, and compiles", () => {
    expect(manifest.key).toBe("openweather-api");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.categories).toEqual(["utility"]);
    expect(manifest.network.allowedHosts).toEqual(["api.openweathermap.org", "tile.openweathermap.org"]);
    expect(manifest.http.baseUrl).toBe("https://api.openweathermap.org");
    expect(manifest.http.auth.field).toBe("apiKey");
    expect(manifest.http.auth.in).toBe("query");
    expect(manifest.http.auth.name).toBe("appid");
    expect(manifest.http.auth.value).toBe("{{apiKey}}");
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("keeps the origin five operations", () => {
    for (const key of ORIGIN_OPS) {
      expect(operations[key], key).toBeDefined();
      expect(requestOf(key), key).toBeDefined();
    }
    expect(requestOf("healthcheck")).toMatchObject({ method: "GET", path: "/geo/1.0/direct" });
    expect(requestOf("geocoding.direct").path).toBe("/geo/1.0/direct");
    expect(requestOf("weather.current").path).toBe("/data/2.5/weather");
    expect(requestOf("weather.forecast").path).toBe("/data/2.5/forecast");
    expect(requestOf("air-pollution.current").path).toBe("/data/2.5/air_pollution");
    expect((operations["weather.current"]!.inputSchema as { required: string[] }).required).toEqual(["lat", "lon"]);
    expect((operations["weather.forecast"]!.inputSchema as { required: string[] }).required).toEqual(["lat", "lon"]);
    expect((operations["geocoding.direct"]!.inputSchema as { required: string[] }).required).toEqual(["q"]);
  });

  test("covers every Composio OpenWeather tool with a real request", () => {
    expect(Object.keys(COMPOSIO_TOOLS)).toHaveLength(20);
    expect(Object.keys(operations).length).toBe(21);
    expect(operations["maps.tile"]).toBeUndefined();
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

  test("maps documented OpenWeather paths and Composio aliases", () => {
    expect(requestOf("geocoding.zip").path).toBe("/geo/1.0/zip");
    expect(requestOf("geocoding.reverse").path).toBe("/geo/1.0/reverse");
    expect(requestOf("air-pollution.forecast").path).toBe("/data/2.5/air_pollution/forecast");
    expect(requestOf("air-pollution.history").path).toBe("/data/2.5/air_pollution/history");
    expect(requestOf("weather.find").path).toBe("/data/2.5/find");
    expect(requestOf("uv.current").path).toBe("/data/2.5/uvi");
    expect(requestOf("uv.forecast").path).toBe("/data/2.5/uvi/forecast");
    expect(requestOf("uv.history").path).toBe("/data/2.5/uvi/history");
    expect(requestOf("stations.list").path).toBe("/data/3.0/stations");
    expect(requestOf("stations.get").path).toBe("/data/3.0/stations/{{station_id}}");
    expect(requestOf("stations.create").path).toBe("/data/3.0/stations");
    expect(requestOf("stations.update").path).toBe("/data/3.0/stations/{{station_id}}");
    expect(requestOf("stations.delete").path).toBe("/data/3.0/stations/{{station_id}}");
    expect(requestOf("stations.measurements.create").path).toBe("/data/3.0/measurements");
    expect(requestOf("stations.measurements.list").path).toBe("/data/3.0/measurements");
    expect(requestOf("triggers.list").path).toBe("/data/3.0/triggers");
    expect(requestOf("stations.measurements.create").body).toBe("{{measurements}}");
  });

  test("recipe operations equal runner operations", async () => {
    const recipe = await Bun.file(new URL("../../../../scripts/connector-gen/openconnector/recipes/openweather_api/recipe.json", import.meta.url)).json();
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(Object.keys(operations).sort());
    expect([...recipe.selection.operations].sort()).toEqual(Object.keys(operations).sort());
    expect(recipe.manifest.version).toBe("0.2.0");
  });
});

describe("openweather-api compiled handlers", () => {
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
    const data = (operation.outputSchema as { properties?: { data?: { type?: unknown } } }).properties?.data;
    const types = data?.type;
    if (types === "array" || (Array.isArray(types) && types.includes("array"))) return [{ id: 1 }];
    if (types === "string" || (Array.isArray(types) && types.includes("string") && !types.includes("object"))) return "x";
    return { id: 1 };
  }

  test("every operation dispatches a real HTTP request for required input", async () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as { method: string; path: string; success?: number[]; result?: unknown; baseUrl?: string };
      const input = dummyInput(operation.inputSchema as { properties?: Record<string, any>; required?: string[] });
      const { requests, result } = await invoke(key, input, () => jsonResponse(dummyResponse(operation), request.success?.[0] ?? 200));
      expect(requests, key).toHaveLength(1);
      expect(requests[0]!.method, key).toBe(request.method);
      const host = "api.openweathermap.org";
      expect(new URL(requests[0]!.url).hostname, key).toBe(host);
      expect(new URL(requests[0]!.url).searchParams.get("appid"), key).toBe("dummy");
      expect(requests[0]!.headers.get("accept"), key).toBe("application/json");
      expect(result).toMatchObject({ connector: "openweather-api", action: key, source: "provider" });
    }
  });

  test("origin healthcheck still probes GET /geo/1.0/direct?q=London&limit=1", async () => {
    const { requests } = await invoke("healthcheck", {}, () => jsonResponse([]));
    const url = new URL(requests[0]!.url);
    expect(url.pathname).toBe("/geo/1.0/direct");
    expect(requests[0]!.method).toBe("GET");
    expect(url.searchParams.get("q")).toBe("London");
    expect(url.searchParams.get("limit")).toBe("1");
    expect(url.searchParams.get("appid")).toBe("dummy");
  });

  test("optional query params are omitted when unset and encoded when set", async () => {
    const bare = await invoke("weather.current", { lat: 51.5085, lon: -0.1257 }, () => jsonResponse({ id: 1 }));
    expect(new URL(bare.requests[0]!.url).href).toBe("https://api.openweathermap.org/data/2.5/weather?lat=51.5085&lon=-0.1257&appid=dummy");
    const filtered = await invoke(
      "weather.current",
      { lat: 51.5085, lon: -0.1257, units: "metric", lang: "en", q: "London,GB" },
      () => jsonResponse({ id: 1 }),
    );
    const url = new URL(filtered.requests[0]!.url);
    expect(url.searchParams.get("units")).toBe("metric");
    expect(url.searchParams.get("lang")).toBe("en");
    expect(url.searchParams.get("q")).toBe("London,GB");
  });

  test("zip geocoding percent-encodes the comma in zip,country", async () => {
    const { requests } = await invoke("geocoding.zip", { zip: "E14,GB" }, () => jsonResponse({ zip: "E14" }));
    expect(new URL(requests[0]!.url).href).toBe("https://api.openweathermap.org/geo/1.0/zip?zip=E14%2CGB&appid=dummy");
  });

  test("stations.measurements.create sends a JSON array body", async () => {
    const measurements = [{ station_id: "abc", dt: 1479817340, temperature: 18.7 }];
    const { requests, result } = await invoke(
      "stations.measurements.create",
      { measurements },
      () => new Response(null, { status: 204 }),
    );
    expect(requests[0]!.method).toBe("POST");
    expect(new URL(requests[0]!.url).pathname).toBe("/data/3.0/measurements");
    expect(await requests[0]!.json()).toEqual(measurements);
    expect(result).toEqual({ connector: "openweather-api", action: "stations.measurements.create", source: "provider", success: true });
  });

  test("stations.delete maps empty 204 to success", async () => {
    const { requests, result } = await invoke("stations.delete", { station_id: "abc" }, () => new Response(null, { status: 204 }));
    expect(requests[0]!.method).toBe("DELETE");
    expect(new URL(requests[0]!.url).pathname).toBe("/data/3.0/stations/abc");
    expect(result).toEqual({ connector: "openweather-api", action: "stations.delete", source: "provider", success: true });
  });

  test("path segments are URL-encoded", async () => {
    const { requests } = await invoke("stations.get", { station_id: "id/1" }, () => jsonResponse({ id: "id/1" }));
    expect(new URL(requests[0]!.url).pathname).toBe("/data/3.0/stations/id%2F1");
  });

  test("maps 401 and 429", async () => {
    await expect(invoke("healthcheck", {}, () => jsonResponse({ message: "Invalid API key" }, 401))).rejects.toMatchObject({
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
