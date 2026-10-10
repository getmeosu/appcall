import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import { getMeetingAnalysis } from "../src/handlers";
import COMPOSIO_TOOLS from "./composio-cover.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const ORIGIN_OPS = ["healthcheck", "users.list", "users.get", "meetings.list", "meetings.get"] as const;
const HANDWRITTEN = new Set(["meetings.analysis.get"]);
const compiled = compileDeclarativeConnector(manifest as never);
const actions = { ...compiled.actions, "meetings.analysis.get": getMeetingAnalysis };

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
    else input[key] = key.includes("url") ? "https://example.com/recording.mp3" : "x";
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

describe("avoma manifest", () => {
  test("has bounded host, origin auth, version, and compiles", () => {
    expect(manifest.key).toBe("avoma");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.categories).toEqual(["scheduling"]);
    expect(manifest.network.allowedHosts).toEqual(["api.avoma.com"]);
    expect(manifest.http.baseUrl).toBe("https://api.avoma.com");
    expect(manifest.http.auth.field).toBe("apiKey");
    expect(manifest.http.auth.value).toBe("Bearer {{apiKey}}");
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("keeps the origin five operations", () => {
    for (const key of ORIGIN_OPS) {
      expect(operations[key], key).toBeDefined();
      expect(requestOf(key), key).toBeDefined();
    }
    expect(requestOf("healthcheck")).toMatchObject({ method: "GET", path: "/v1/users/" });
    expect(requestOf("users.list").path).toBe("/v1/users/");
    expect(requestOf("users.get").path).toBe("/v1/users/{{userUuid}}/");
    expect(requestOf("meetings.list").path).toBe("/v1/meetings/");
    expect(requestOf("meetings.get").path).toBe("/v1/meetings/{{meetingUuid}}/");
    expect((operations["users.get"]!.inputSchema as { required: string[] }).required).toEqual(["userUuid"]);
    expect((operations["meetings.get"]!.inputSchema as { required: string[] }).required).toEqual(["meetingUuid"]);
    expect((operations["meetings.list"]!.inputSchema as { required: string[] }).required).toEqual(["fromDate", "toDate"]);
  });

  test("covers every Composio Avoma tool with a real request or handwritten handler", () => {
    expect(Object.keys(COMPOSIO_TOOLS)).toHaveLength(17);
    expect(Object.keys(operations).length).toBe(18);
    for (const [slug, key] of Object.entries(COMPOSIO_TOOLS)) {
      expect(operations[key], slug).toBeDefined();
      if (HANDWRITTEN.has(key)) {
        expect(requestOf(key), slug).toMatchObject({
          method: "GET",
          path: "/v1/meetings/{{meeting_uuid}}/insights/",
        });
        expect(compiled.actions[key], slug).toBeTypeOf("function");
        expect(actions[key], slug).toBe(getMeetingAnalysis);
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
        expect(operation.request, key).toMatchObject({
          method: "GET",
          path: "/v1/meetings/{{meeting_uuid}}/insights/",
        });
        continue;
      }
      expect(operation.request, `${key} must declare a request block`).toBeDefined();
      const request = operation.request as Record<string, unknown>;
      expect(typeof request.method, key).toBe("string");
      expect(typeof request.path, key).toBe("string");
      expect(String(request.path).startsWith("/v1/"), key).toBe(true);
    }
  });

  test("classifies mutating HTTP methods as write or destructive", () => {
    for (const [key, operation] of Object.entries(operations)) {
      if (HANDWRITTEN.has(key)) {
        expect(operation.sideEffect, key).toBe("read");
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

  test("maps documented Avoma paths and Composio aliases", () => {
    expect(requestOf("calls.create").path).toBe("/v1/calls/");
    expect(requestOf("calls.get").path).toBe("/v1/calls/{{external_id}}/");
    expect(requestOf("calls.list").path).toBe("/v1/calls/");
    expect(requestOf("recordings.get").path).toBe("/v1/recordings/");
    expect(requestOf("notes.list").path).toBe("/v1/notes/");
    expect(requestOf("transcriptions.list").path).toBe("/v1/transcriptions/");
    expect(requestOf("snippets.list").path).toBe("/v1/snippets/");
    expect(requestOf("scorecard_evaluations.list").path).toBe("/v1/scorecard_evaluations/");
    expect(requestOf("engagement.list").path).toBe("/v1/engagement/");
    expect(requestOf("engagement.summary.get").path).toBe("/v1/engagement/summary/");
    expect(requestOf("configuration.list").path).toBe("/v1/{{catalog}}/");
    expect(requestOf("webhooks.list").path).toBe("/v1/webhooks/");
    expect((requestOf("meetings.list").query as Record<string, string>).attendee_emails).toBe("{{attendee_emails}}");
    expect((requestOf("calls.create").body as Record<string, string>).external_id).toBe("{{external_id}}");
    expect((requestOf("calls.create").body as Record<string, string>).frm).toBe("{{frm}}");
  });

  test("recipe operations equal runner operations", async () => {
    const recipe = await Bun.file(new URL("../../../../scripts/connector-gen/openconnector/recipes/avoma/recipe.json", import.meta.url)).json();
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(Object.keys(operations).sort());
    expect([...recipe.selection.operations].sort()).toEqual(Object.keys(operations).sort());
    expect(recipe.manifest.version).toBe("0.2.0");
  });
});

describe("avoma compiled handlers", () => {
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
    if (HANDWRITTEN.has(String(operation.title))) return {};
    const data = (operation.outputSchema as { properties?: { data?: { type?: unknown } } }).properties?.data;
    const types = data?.type;
    if (types === "array" || (Array.isArray(types) && types.includes("array"))) return [{ id: 1 }];
    return { id: 1 };
  }

  test("every operation dispatches a real HTTP request for required input", async () => {
    for (const [key, operation] of Object.entries(operations)) {
      const input = dummyInput(operation.inputSchema as { properties?: Record<string, any>; required?: string[] });
      if (HANDWRITTEN.has(key)) {
        const { requests, result } = await invoke(key, input, (request) => {
          const path = new URL(request.url).pathname;
          if (path.endsWith("/insights/")) return jsonResponse({ insights: true });
          if (path.startsWith("/v1/meeting_segments/")) return jsonResponse({ segments: [] });
          return jsonResponse([]);
        });
        expect(requests, key).toHaveLength(3);
        expect(requests.map((request) => request.method), key).toEqual(["GET", "GET", "GET"]);
        expect(result).toMatchObject({ connector: "avoma", action: key, source: "provider" });
        continue;
      }
      const request = operation.request as { method: string; path: string; success?: number[] };
      const { requests, result } = await invoke(key, input, () => jsonResponse(dummyResponse(operation), request.success?.[0] ?? 200));
      expect(requests, key).toHaveLength(1);
      expect(requests[0]!.method, key).toBe(request.method);
      expect(new URL(requests[0]!.url).hostname, key).toBe("api.avoma.com");
      expect(requests[0]!.headers.get("authorization"), key).toBe("Bearer dummy");
      expect(requests[0]!.headers.get("accept"), key).toBe("application/json");
      expect(result).toMatchObject({ connector: "avoma", action: key, source: "provider" });
    }
  });

  test("origin healthcheck still probes GET /v1/users/", async () => {
    const { requests } = await invoke("healthcheck", {}, () => jsonResponse([]));
    expect(new URL(requests[0]!.url).pathname).toBe("/v1/users/");
    expect(requests[0]!.method).toBe("GET");
    expect(new URL(requests[0]!.url).search).toBe("");
  });

  test("optional query params are omitted when unset and encoded when set", async () => {
    const bare = await invoke("calls.list", { from_date: "2026-01-01T00:00:00Z", to_date: "2026-01-31T23:59:59Z" }, () => jsonResponse({ results: [] }));
    expect(new URL(bare.requests[0]!.url).href).toBe("https://api.avoma.com/v1/calls/?from_date=2026-01-01T00%3A00%3A00Z&to_date=2026-01-31T23%3A59%3A59Z");
    const filtered = await invoke(
      "calls.list",
      { from_date: "2026-01-01T00:00:00Z", to_date: "2026-01-31T23:59:59Z", direction: "inbound" },
      () => jsonResponse({ results: [] }),
    );
    expect(new URL(filtered.requests[0]!.url).searchParams.get("direction")).toBe("inbound");
  });

  test("meetings.list origin dates stay required and extra filters encode", async () => {
    const origin = await invoke(
      "meetings.list",
      { fromDate: "2026-01-01T00:00:00Z", toDate: "2026-01-31T23:59:59Z", page: 1, pageSize: 10, order: "-start_at" },
      () => jsonResponse({ results: [] }),
    );
    const originUrl = new URL(origin.requests[0]!.url);
    expect(originUrl.pathname).toBe("/v1/meetings/");
    expect(originUrl.searchParams.get("from_date")).toBe("2026-01-01T00:00:00Z");
    expect(originUrl.searchParams.get("page_size")).toBe("10");
    expect(originUrl.searchParams.has("attendee_emails")).toBe(false);
    const filtered = await invoke(
      "meetings.list",
      { fromDate: "2026-01-01T00:00:00Z", toDate: "2026-01-31T23:59:59Z", attendee_emails: "lead@example.com", is_call: false },
      () => jsonResponse({ results: [] }),
    );
    const url = new URL(filtered.requests[0]!.url);
    expect(url.searchParams.get("attendee_emails")).toBe("lead@example.com");
    expect(url.searchParams.get("is_call")).toBe("false");
  });

  test("calls.create sends official JSON body", async () => {
    const participants = [{ email: "lead@example.com", name: "Lead" }];
    const { requests } = await invoke(
      "calls.create",
      {
        external_id: "dialer-call-1001",
        user_email: "user@example.com",
        frm: "+11234567890",
        to: "+12234567890",
        start_at: "2026-01-15T15:00:00Z",
        recording_url: "https://example.com/recording.mp3",
        direction: "Outbound",
        source: "ringcentral",
        participants,
      },
      () => jsonResponse({ external_id: "dialer-call-1001" }, 201),
    );
    expect(requests[0]!.method).toBe("POST");
    expect(new URL(requests[0]!.url).pathname).toBe("/v1/calls/");
    expect(requests[0]!.headers.get("content-type")).toBe("application/json");
    expect(await requests[0]!.json()).toEqual({
      external_id: "dialer-call-1001",
      user_email: "user@example.com",
      frm: "+11234567890",
      to: "+12234567890",
      start_at: "2026-01-15T15:00:00Z",
      recording_url: "https://example.com/recording.mp3",
      direction: "Outbound",
      source: "ringcentral",
      participants,
    });
  });

  test("configuration.list interpolates official catalog paths", async () => {
    const { requests } = await invoke("configuration.list", { catalog: "meeting_type" }, () => jsonResponse([{ uuid: "x", name: "Demo" }]));
    expect(new URL(requests[0]!.url).pathname).toBe("/v1/meeting_type/");
  });

  test("meetings.analysis.get fans out insights, segments, and sentiments", async () => {
    const { requests, result } = await invoke("meetings.analysis.get", { meeting_uuid: "3bd338c2-dc82-47c4-83c8-225049c14788" }, (request) => {
      const url = new URL(request.url);
      if (url.pathname.endsWith("/insights/")) return jsonResponse({ topics: ["pricing"] });
      if (url.pathname === "/v1/meeting_segments/") return jsonResponse({ segments: [] });
      return jsonResponse([{ sentiment: 0 }]);
    });
    expect(requests).toHaveLength(3);
    expect(new URL(requests[0]!.url).pathname).toBe("/v1/meetings/3bd338c2-dc82-47c4-83c8-225049c14788/insights/");
    expect(new URL(requests[1]!.url).href).toBe("https://api.avoma.com/v1/meeting_segments/?uuid=3bd338c2-dc82-47c4-83c8-225049c14788");
    expect(new URL(requests[2]!.url).href).toBe("https://api.avoma.com/v1/meeting_sentiments/?meeting_uuid=3bd338c2-dc82-47c4-83c8-225049c14788");
    expect(result).toEqual({
      connector: "avoma",
      action: "meetings.analysis.get",
      source: "provider",
      data: { insights: { topics: ["pricing"] }, segments: { segments: [] }, sentiments: [{ sentiment: 0 }] },
    });
  });

  test("webhooks.list does not read signing secrets", async () => {
    const { requests } = await invoke("webhooks.list", {}, () => jsonResponse({ count: 0, results: [] }));
    expect(new URL(requests[0]!.url).pathname).toBe("/v1/webhooks/");
    expect(new URL(requests[0]!.url).pathname.includes("signing-secret")).toBe(false);
  });

  test("path segments are URL-encoded", async () => {
    const { requests } = await invoke("calls.get", { external_id: "id/with space" }, () => jsonResponse({ external_id: "x" }));
    expect(new URL(requests[0]!.url).pathname).toBe("/v1/calls/id%2Fwith%20space/");
  });

  test("maps 401 and 429", async () => {
    await expect(invoke("healthcheck", {}, () => jsonResponse({ detail: "Invalid token." }, 401))).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
    await expect(
      invoke("healthcheck", {}, () => new Response("{}", { status: 429, headers: { "retry-after": "4", "content-type": "application/json" } })),
    ).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });

  test("runs fixtures against declarative projections and handwritten handlers", async () => {
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
      const action = HANDWRITTEN.has(raw.operation) ? compiled.actions[raw.operation] : actions[raw.operation];
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
