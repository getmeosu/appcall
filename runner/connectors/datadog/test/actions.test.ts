import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import COMPOSIO_TOOLS from "./composio-cover.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const compiled = compileDeclarativeConnector(manifest as never);
const EXTRAS = ["healthcheck", "events.get", "downtimes.list", "downtimes.cancel"] as const;

function requestOf(key: string): Record<string, unknown> {
  return operations[key]!.request as Record<string, unknown>;
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

describe("datadog manifest", () => {
  test("keeps the origin US1 host and dual keys", () => {
    expect(manifest.key).toBe("datadog");
    expect(manifest.version).toBe("0.3.0");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.http.baseUrl).toBe("https://api.datadoghq.com");
    expect(manifest.network.allowedHosts).toEqual(["api.datadoghq.com"]);
    expect(manifest.http.auth).toEqual({ field: "apiKey", in: "header", name: "DD-API-KEY", value: "{{apiKey}}" });
    expect(manifest.http.headers).toEqual({ "DD-APPLICATION-KEY": "{{applicationKey}}" });
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.auth.scopes).toEqual([]);
    expect(Object.keys(manifest.auth).sort()).toEqual(["scopes", "setup", "type"]);
    const fields = manifest.auth.setup.fields as Array<{ key: string; required: boolean; secret: boolean }>;
    expect(fields.map((field) => field.key)).toEqual(["apiKey", "applicationKey"]);
    expect(fields.every((field) => field.required && field.secret)).toBe(true);
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("maps every live Composio tool that has a public REST call", () => {
    expect(Object.keys(COMPOSIO_TOOLS)).toHaveLength(68);
    expect(Object.keys(operations)).toHaveLength(Object.keys(COMPOSIO_TOOLS).length + EXTRAS.length);
    for (const extra of EXTRAS) expect(operations[extra]).toBeDefined();
    expect(operations["serviceChecks.list"]).toBeUndefined();
    for (const [slug, key] of Object.entries(COMPOSIO_TOOLS)) {
      expect(operations[key], slug).toBeDefined();
      expect(requestOf(key).method, slug).toEqual(expect.any(String));
      expect(String(requestOf(key).path).startsWith("/"), slug).toBe(true);
      expect(compiled.actions[key], slug).toBeTypeOf("function");
    }
  });

  test("gives every action a request, title, description, object input, and response budget", () => {
    for (const [key, operation] of Object.entries(operations)) {
      expect(String(operation.title ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(0);
      expect(operation.kind, key).toBe("action");
      expect((operation.inputSchema as { type?: string }).type, key).toBe("object");
      const request = requestOf(key);
      expect(typeof request.method, key).toBe("string");
      expect(String(request.path).startsWith("/"), key).toBe(true);
      expect(operation.maxResponseBytes as number, key).toBeGreaterThanOrEqual(operation.maxInputBytes as number);
      const schema = operation.inputSchema as { required?: string[] };
      const placeholders = [...String(request.path ?? "").matchAll(/\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g)].map((match) => match[1]!.split(".")[0]);
      for (const placeholder of placeholders) {
        expect(schema.required ?? [], `${key} {{${placeholder}}}`).toContain(placeholder);
      }
    }
  });

  test("classifies methods and keeps GET and DELETE body-less", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = requestOf(key);
      const method = String(request.method);
      const headers = (request.headers as Record<string, string> | undefined) ?? {};
      if (request.body !== undefined) expect(headers["Content-Type"], key).toBe("application/json");
      else expect(headers["Content-Type"], key).toBeUndefined();
      if (method === "GET" || method === "DELETE") {
        expect(request.body, key).toBeUndefined();
        expect(operation.sideEffect, key).toBe(method === "DELETE" ? "destructive" : "read");
      } else if (method === "POST" || method === "PUT" || method === "PATCH") {
        const queryPost = new Set([
          "logs.aggregate",
          "logs.search",
          "metrics.scalar",
          "metrics.timeseries",
          "auditLogs.search",
          "events.search",
          "spans.aggregate",
          "traces.search",
          "traces.get",
        ]);
        expect(operation.sideEffect, key).toBe(queryPost.has(key) ? "read" : "write");
      }
    }
    expect(manifest.http.headers["Content-Type"]).toBeUndefined();
  });
});

describe("datadog fixtures", () => {
  const caseDir = join(import.meta.dir, "../fixtures/cases");

  test("replays every success fixture and covers every action", async () => {
    const files = readdirSync(caseDir).filter((name) => name.endsWith(".json")).sort();
    const covered = new Set<string>();
    expect(files.length).toBe(Object.keys(operations).length);
    for (const file of files) {
      const raw = JSON.parse(readFileSync(join(caseDir, file), "utf8")) as {
        id: string;
        operation: string;
        input: Record<string, unknown>;
        credentials: Record<string, string>;
        exchanges: Array<{
          request: { method: string; url: string; headers?: Record<string, string>; body: string | null };
          response: { status: number; headers?: Record<string, string>; bodyFile: string };
        }>;
        expected: { kind: "success"; resultFile: string };
      };
      expect(raw.expected.kind, raw.id).toBe("success");
      const action = compiled.actions[raw.operation];
      expect(action, raw.id).toBeTypeOf("function");
      let index = 0;
      const result = await action!({
        ...raw.input,
        ...raw.credentials,
        fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
          const expected = raw.exchanges[index++];
          if (!expected) throw new Error(`${raw.id}: extra request`);
          const request = new Request(input, init);
          const text = await request.text();
          const body = text === "" ? null : text;
          if (request.method !== expected.request.method || !sameUrl(request.url, expected.request.url)) {
            throw new Error(`${raw.id}: ${request.method} ${request.url} != ${expected.request.method} ${expected.request.url}`);
          }
          if (body !== expected.request.body) throw new Error(`${raw.id}: body ${body} != ${expected.request.body}`);
          const got = new Headers(init?.headers);
          for (const [header, value] of Object.entries(expected.request.headers ?? {})) {
            if (got.get(header) !== value) throw new Error(`${raw.id}: header ${header}=${got.get(header)} != ${value}`);
          }
          const bytes = readFileSync(join(dirname(join(caseDir, file)), expected.response.bodyFile));
          return new Response(bytes, { status: expected.response.status, headers: expected.response.headers });
        },
      });
      expect(index, raw.id).toBe(raw.exchanges.length);
      const expectedResult = JSON.parse(readFileSync(join(dirname(join(caseDir, file)), raw.expected.resultFile), "utf8"));
      expect(deepEqual(result, expectedResult), `${raw.id} ${JSON.stringify(result)}`).toBe(true);
      if (raw.exchanges[0]!.request.body !== null) {
        expect(raw.exchanges[0]!.request.body, raw.id).toBe(JSON.stringify(JSON.parse(raw.exchanges[0]!.request.body!)));
      }
      covered.add(raw.operation);
    }
    expect([...covered].sort()).toEqual(Object.keys(operations).sort());
  });

  test("omits absent filters and maps 401 and 429", async () => {
    const seen: Request[] = [];
    await compiled.actions["metrics.list"]!({
      apiKey: "a",
      applicationKey: "b",
      from: 1,
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return new Response(JSON.stringify({ metrics: ["cpu"] }), { status: 200, headers: { "content-type": "application/json" } });
      },
    });
    expect(new URL(seen[0]!.url).search).toBe("?from=1");
    await expect(compiled.actions["monitors.get"]!({ apiKey: "a", applicationKey: "b", monitorId: "7", fetch: async () => new Response("{}") })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
    await expect(
      compiled.actions.healthcheck!({ apiKey: "secret", applicationKey: "app", fetch: async () => new Response(JSON.stringify({ errors: ["nope"] }), { status: 401 }) }),
    ).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(
      compiled.actions.healthcheck!({
        apiKey: "secret",
        applicationKey: "app",
        fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "9", "content-type": "application/json" } }),
      }),
    ).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 9 });
  });
});
