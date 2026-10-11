import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const ORIGIN_OPS = ["healthcheck", "organizations.list", "transcriptions.list", "transcriptions.get", "orders.get"] as const;

const COMPOSIO_TOOLS: Record<string, string> = {
  HAPPY_SCRIBE_CREATE_SUBTITLE: "orders.create",
  HAPPY_SCRIBE_CREATE_TRANSLATION_TASK: "translationTasks.create",
  HAPPY_SCRIBE_DELETE_TRANSCRIPTION: "transcriptions.delete",
  HAPPY_SCRIBE_GET_ACCOUNT_DETAILS: "memberships.list",
  HAPPY_SCRIBE_GET_LANGUAGE_LIST: "languages.list",
  HAPPY_SCRIBE_GET_RATE_LIMIT: "rateLimits.get",
  HAPPY_SCRIBE_GET_SIGNED_UPLOAD_URL: "uploads.new",
  HAPPY_SCRIBE_HS_CONFIRM_ORDER: "orders.confirm",
  HAPPY_SCRIBE_HS_CREATE_TRANSLATION_ORDER: "orders.createTranslation",
  HAPPY_SCRIBE_HS_EXPORT_TRANSCRIPTION: "exports.create",
  HAPPY_SCRIBE_HS_GET_API_VERSION: "api.version",
  HAPPY_SCRIBE_HS_GET_ERROR_CODES: "errorCodes.list",
  HAPPY_SCRIBE_HS_GET_SUPPORTED_FORMATS: "formats.list",
  HAPPY_SCRIBE_HS_GET_TRANSCRIPTION: "transcriptions.get",
  HAPPY_SCRIBE_HS_RETRIEVE_EXPORT: "exports.get",
  HAPPY_SCRIBE_HS_RETRIEVE_TRANSLATION_TASK: "translationTasks.get",
  HAPPY_SCRIBE_LIST_TRANSCRIPTIONS: "transcriptions.list",
  HAPPY_SCRIBE_RETRIEVE_ORDER: "orders.get",
};

const MISSING_STILL = ["HAPPY_SCRIBE_DELETE_WEBHOOK", "HAPPY_SCRIBE_HS_GET_WEBHOOKS"] as const;

const DOC_PROBE_OPS = ["api.version", "errorCodes.list", "formats.list", "languages.list", "rateLimits.get"] as const;

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
    else if (prop.type === "array") input[key] = prop.items?.type === "integer" ? [1] : ["x"];
    else if (prop.type === "object") input[key] = {};
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

describe("happy-scribe manifest", () => {
  test("has bounded host, origin auth, version, and compiles", () => {
    expect(manifest.key).toBe("happy-scribe");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.categories).toEqual(["productivity"]);
    expect(manifest.network.allowedHosts).toEqual(["www.happyscribe.com"]);
    expect(manifest.http.baseUrl).toBe("https://www.happyscribe.com/api/v1");
    expect(manifest.http.auth.field).toBe("apiKey");
    expect(manifest.http.auth.value).toBe("Bearer {{apiKey}}");
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    expect(manifest.provenance.source.revision).toBe("33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a");
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("keeps the origin five operations", () => {
    for (const key of ORIGIN_OPS) {
      expect(operations[key], key).toBeDefined();
      expect(requestOf(key), key).toBeDefined();
    }
    expect(requestOf("healthcheck")).toMatchObject({ method: "GET", path: "/organizations" });
    expect(requestOf("organizations.list").path).toBe("/organizations");
    expect(requestOf("transcriptions.list").path).toBe("/transcriptions");
    expect(requestOf("transcriptions.get").path).toBe("/transcriptions/{{transcriptionId}}");
    expect(requestOf("orders.get").path).toBe("/orders/{{orderId}}");
    expect((operations["transcriptions.list"]!.inputSchema as { required: string[] }).required).toEqual(["organizationId"]);
    expect((operations["orders.get"]!.inputSchema as { required: string[] }).required).toEqual(["orderId"]);
  });

  test("covers every real Composio Happy Scribe HTTP tool", () => {
    expect(Object.keys(COMPOSIO_TOOLS)).toHaveLength(18);
    expect(MISSING_STILL).toHaveLength(2);
    expect(Object.keys(operations).length).toBe(20);
    for (const [slug, key] of Object.entries(COMPOSIO_TOOLS)) {
      expect(operations[key], slug).toBeDefined();
      expect(requestOf(key), slug).toBeDefined();
      expect(compiled.actions[key], slug).toBeTypeOf("function");
    }
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

  test("maps documented Happy Scribe paths and Composio aliases", () => {
    expect(requestOf("orders.create")).toMatchObject({ method: "POST", path: "/orders" });
    expect((requestOf("orders.create").body as { order: { is_subtitle: string } }).order.is_subtitle).toBe("{{isSubtitle}}");
    expect(requestOf("orders.createTranslation").path).toBe("/orders/translation");
    expect(requestOf("orders.confirm").path).toBe("/orders/{{orderId}}/confirm");
    expect(requestOf("transcriptions.delete").path).toBe("/transcriptions/{{transcriptionId}}");
    expect((requestOf("transcriptions.delete").query as Record<string, string>).permanent).toBe("{{permanent}}");
    expect(requestOf("exports.create").path).toBe("/exports");
    expect(requestOf("exports.get").path).toBe("/exports/{{exportId}}");
    expect(requestOf("uploads.new").path).toBe("/uploads/new");
    expect((requestOf("uploads.new").query as Record<string, string>).filename).toBe("{{filename}}");
    expect(requestOf("translationTasks.create").path).toBe("/task/transcription_translation");
    expect(requestOf("translationTasks.get").path).toBe("/task/transcription_translation/{{translationTaskId}}");
    expect((requestOf("transcriptions.list").query as Record<string, string>).tags).toBe("{{tags}}");
    expect(requestOf("memberships.list")).toMatchObject({ method: "GET", path: "/organization_memberships" });
    expect((requestOf("memberships.list").query as Record<string, string>).organization_id).toBe("{{organizationId}}");
    for (const key of DOC_PROBE_OPS) {
      expect(requestOf(key), key).toMatchObject({ method: "GET", path: "/organizations" });
      expect((requestOf(key) as { result?: unknown }).result, key).toBeDefined();
    }
  });

  test("keeps recipe operations equal to runner operations", async () => {
    const recipe = await Bun.file(new URL("../../../../scripts/connector-gen/openconnector/recipes/happy_scribe/recipe.json", import.meta.url)).json();
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(Object.keys(operations).sort());
    expect([...recipe.selection.operations].sort()).toEqual(Object.keys(operations).sort());
    expect(Object.keys(recipe.operationSources).sort()).toEqual(Object.keys(operations).sort());
    expect(recipe.manifest.operations).toEqual(operations);
    expect(recipe.manifest.version).toBe("0.2.0");
    expect(recipe.source.revision).toBe("33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a");
    for (const operation of Object.values(recipe.manifest.operations) as Array<Record<string, unknown>>) {
      if (operation.kind === "webhook") expect(operation.sideEffect).toBe("read");
    }
  });
});

describe("happy-scribe compiled handlers", () => {
  const jsonResponse = (body: unknown, status = 200) =>
    new Response(body === null ? null : JSON.stringify(body), {
      status,
      headers: body === null ? undefined : { "content-type": "application/json" },
    });

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
    return { id: "ok" };
  }

  test("every operation dispatches a real HTTP request for required input", async () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as { method: string; path: string; success?: number[]; result?: unknown };
      const input = dummyInput(operation.inputSchema as { properties?: Record<string, any>; required?: string[] });
      const status = request.success?.[0] ?? 200;
      const { requests, result } = await invoke(key, input, () => {
        if (status === 204) return new Response(null, { status });
        return jsonResponse(dummyResponse(operation), status);
      });
      expect(requests, key).toHaveLength(1);
      expect(requests[0]!.method, key).toBe(request.method);
      expect(new URL(requests[0]!.url).hostname, key).toBe("www.happyscribe.com");
      expect(requests[0]!.headers.get("authorization"), key).toBe("Bearer dummy");
      expect(requests[0]!.headers.get("accept"), key).toBe("application/json");
      expect(result).toMatchObject({ connector: "happy-scribe", action: key, source: "provider" });
    }
  });

  test("origin healthcheck still probes GET /organizations", async () => {
    const { requests } = await invoke("healthcheck", {}, () => jsonResponse({ organizations: [] }));
    expect(new URL(requests[0]!.url).pathname).toBe("/api/v1/organizations");
    expect(requests[0]!.method).toBe("GET");
    expect(new URL(requests[0]!.url).search).toBe("");
  });

  test("optional query params are omitted when unset and encoded when set", async () => {
    const bare = await invoke("transcriptions.list", { organizationId: 123 }, () => jsonResponse({ results: [] }));
    expect(new URL(bare.requests[0]!.url).href).toBe("https://www.happyscribe.com/api/v1/transcriptions?organization_id=123");
    const filtered = await invoke(
      "transcriptions.list",
      { organizationId: 123, page: 1, perPage: 5, folderId: 521, tags: ["sales", "q4"] },
      () => jsonResponse({ results: [] }),
    );
    const url = new URL(filtered.requests[0]!.url);
    expect(url.searchParams.get("organization_id")).toBe("123");
    expect(url.searchParams.get("page")).toBe("1");
    expect(url.searchParams.get("per_page")).toBe("5");
    expect(url.searchParams.get("folder_id")).toBe("521");
    expect(url.searchParams.getAll("tags")).toEqual(["sales", "q4"]);
  });

  test("memberships.list hits GET /organization_memberships", async () => {
    const bare = await invoke("memberships.list", {}, () => jsonResponse({ members: [] }));
    expect(new URL(bare.requests[0]!.url).href).toBe("https://www.happyscribe.com/api/v1/organization_memberships");
    const scoped = await invoke("memberships.list", { organizationId: 123, page: 1, role: "owner" }, () => jsonResponse({ members: [] }));
    const url = new URL(scoped.requests[0]!.url);
    expect(url.pathname).toBe("/api/v1/organization_memberships");
    expect(url.searchParams.get("organization_id")).toBe("123");
    expect(url.searchParams.get("page")).toBe("1");
    expect(url.searchParams.get("role")).toBe("owner");
  });

  test("docs catalog ops probe GET /organizations and keep unused filters off the wire", async () => {
    for (const key of DOC_PROBE_OPS) {
      const { requests, result } = await invoke(key, {}, () => jsonResponse({ organizations: [] }));
      expect(new URL(requests[0]!.url).href, key).toBe("https://www.happyscribe.com/api/v1/organizations");
      expect(requests[0]!.method, key).toBe("GET");
      expect(result).toMatchObject({ connector: "happy-scribe", action: key, source: "provider" });
    }
    const filtered = await invoke("languages.list", { filterHumanService: true }, () => jsonResponse({ organizations: [] }));
    expect(new URL(filtered.requests[0]!.url).href).toBe("https://www.happyscribe.com/api/v1/organizations");
    expect((filtered.result as { languages: Array<{ code: string; humanService: boolean }> }).languages.length).toBeGreaterThan(100);
    expect((filtered.result as { languages: Array<{ code: string; humanService: boolean }> }).languages.find((row) => row.code === "en-US")).toEqual({
      code: "en-US",
      name: "English (United States)",
      humanService: true,
    });
    const version = await invoke("api.version", { endpointPreference: "auto" }, () => jsonResponse({ organizations: [] }));
    expect(version.result).toMatchObject({ apiVersion: "v1", inferredFrom: "base_url", httpStatus: 200 });
    const formats = await invoke("formats.list", { includeAudio: true, exportCategory: "all" }, () => jsonResponse({ organizations: [] }));
    const values = (formats.result as { exportFormats: Array<{ value: string }> }).exportFormats.map((row) => row.value);
    expect(values).toEqual(expect.arrayContaining(["srt", "vtt", "json", "mp4"]));
    const rate = await invoke("rateLimits.get", {}, () => jsonResponse({ organizations: [] }));
    expect(rate.result).toMatchObject({ limit: 200, window: "hour", tooManyRequestsStatus: 429 });
    const errors = await invoke("errorCodes.list", {}, () => jsonResponse({ organizations: [] }));
    const statuses = (errors.result as { errorCodes: Array<{ status: number }> }).errorCodes.map((row) => row.status);
    expect(statuses).toEqual(expect.arrayContaining([401, 418, 429]));
  });

  test("path segments are URL-encoded", async () => {
    const { requests } = await invoke("transcriptions.get", { transcriptionId: "a/b?c" }, () => jsonResponse({ id: "a/b?c" }));
    expect(new URL(requests[0]!.url).pathname).toBe("/api/v1/transcriptions/a%2Fb%3Fc");
  });

  test("orders.create sends nested order JSON and drops unset optionals", async () => {
    const { requests } = await invoke(
      "orders.create",
      { url: "https://example.com/a.mp4", language: "en-US", organizationId: 123, isSubtitle: true },
      () => jsonResponse({ id: "ord" }, 201),
    );
    expect(requests[0]!.method).toBe("POST");
    expect(requests[0]!.headers.get("content-type")).toBe("application/json");
    expect(await requests[0]!.json()).toEqual({
      order: {
        url: "https://example.com/a.mp4",
        language: "en-US",
        organization_id: 123,
        is_subtitle: true,
      },
    });
  });

  test("exports.create sends nested export JSON including arrays", async () => {
    const { requests } = await invoke(
      "exports.create",
      { format: "srt", transcriptionIds: ["abc", "def"], showTimestamps: false },
      () => jsonResponse({ id: "exp" }, 201),
    );
    expect(await requests[0]!.json()).toEqual({
      export: { format: "srt", transcription_ids: ["abc", "def"], show_timestamps: false },
    });
  });

  test("delete and confirm return the static envelope", async () => {
    const deleted = await invoke("transcriptions.delete", { transcriptionId: "abc" }, () => new Response(null, { status: 204 }));
    expect(deleted.requests[0]!.method).toBe("DELETE");
    expect(new URL(deleted.requests[0]!.url).pathname).toBe("/api/v1/transcriptions/abc");
    expect(deleted.result).toEqual({
      connector: "happy-scribe",
      action: "transcriptions.delete",
      source: "provider",
      deleted: true,
      transcriptionId: "abc",
    });
    const confirmed = await invoke("orders.confirm", { orderId: "ord1" }, () => new Response(null, { status: 200 }));
    expect(confirmed.requests[0]!.method).toBe("POST");
    expect(new URL(confirmed.requests[0]!.url).pathname).toBe("/api/v1/orders/ord1/confirm");
    expect(confirmed.result).toEqual({
      connector: "happy-scribe",
      action: "orders.confirm",
      source: "provider",
      confirmed: true,
      orderId: "ord1",
    });
  });

  test("maps 401 and 429", async () => {
    await expect(invoke("healthcheck", {}, () => jsonResponse({ error: "Unauthorized" }, 401))).rejects.toMatchObject({
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
    const covered = new Set<string>();
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
      covered.add(raw.operation);
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
        if (status === 204 || !expected.response.bodyFile) return new Response(null, { status, headers: expected.response.headers });
        const bodyBytes = readFileSync(join(dirname(join(caseDir, file)), expected.response.bodyFile));
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
    for (const key of Object.keys(operations)) expect(covered.has(key), `missing positive fixture for ${key}`).toBe(true);
  });
});
