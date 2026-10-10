import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import COMPOSIO_TOOLS from "./composio-cover.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const ORIGIN_OPS = ["healthcheck", "surveys.list", "surveys.get", "collectors.list", "contact-lists.list"] as const;

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
    } else if (prop.type === "object") input[key] = { id: "1" };
    else input[key] = key.includes("email") ? "test@surveymonkey.com" : "x";
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

describe("survey-monkey manifest", () => {
  test("has bounded host, origin auth, version, and compiles", () => {
    expect(manifest.key).toBe("survey-monkey");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.categories).toEqual(["forms"]);
    expect(manifest.network.allowedHosts).toEqual(["api.surveymonkey.com"]);
    expect(manifest.http.baseUrl).toBe("https://api.surveymonkey.com");
    expect(manifest.http.auth.field).toBe("apiKey");
    expect(manifest.http.auth.value).toBe("Bearer {{apiKey}}");
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("keeps the origin five operations", () => {
    for (const key of ORIGIN_OPS) {
      expect(operations[key], key).toBeDefined();
      expect(String(requestOf(key).path).startsWith("/v3/"), key).toBe(true);
    }
    expect(requestOf("healthcheck")).toMatchObject({ method: "GET", path: "/v3/users/me" });
    expect(requestOf("surveys.list").path).toBe("/v3/surveys");
    expect(requestOf("surveys.get").path).toBe("/v3/surveys/{{surveyId}}/details");
    expect(requestOf("collectors.list").path).toBe("/v3/surveys/{{surveyId}}/collectors");
    expect(requestOf("contact-lists.list").path).toBe("/v3/contact_lists");
    expect((operations["surveys.get"]!.inputSchema as { required: string[] }).required).toEqual(["surveyId"]);
    expect((operations["collectors.list"]!.inputSchema as { required: string[] }).required).toEqual(["surveyId"]);
  });

  test("covers every Composio SurveyMonkey tool with a real request", () => {
    expect(Object.keys(COMPOSIO_TOOLS)).toHaveLength(22);
    expect(Object.keys(operations).length).toBe(22);
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
      expect(String(request.path).startsWith("/v3/"), key).toBe(true);
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

  test("puts JSON Content-Type only on bodies and keeps GET body-less", () => {
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

  test("maps documented SurveyMonkey paths and Composio aliases", () => {
    expect(requestOf("surveys.create").path).toBe("/v3/surveys");
    expect(requestOf("surveys.delete").path).toBe("/v3/surveys/{{survey_id}}");
    expect(requestOf("surveys.get_summary").path).toBe("/v3/surveys/{{survey_id}}");
    expect(requestOf("surveys.trends.get").path).toBe("/v3/surveys/{{survey_id}}/trends");
    expect(requestOf("responses.list").path).toBe("/v3/surveys/{{survey_id}}/responses");
    expect(requestOf("responses.bulk.list").path).toBe("/v3/surveys/{{id}}/responses/bulk");
    expect(requestOf("contacts.create").path).toBe("/v3/contacts");
    expect(requestOf("contacts.bulk.create").path).toBe("/v3/contacts/bulk");
    expect(requestOf("contacts.bulk.list").path).toBe("/v3/contacts/bulk");
    expect(requestOf("contact-lists.create").path).toBe("/v3/contact_lists");
    expect(requestOf("contact-fields.list").path).toBe("/v3/contact_fields");
    expect(requestOf("groups.list").path).toBe("/v3/groups");
    expect(requestOf("webhooks.list").path).toBe("/v3/webhooks");
    expect(requestOf("survey-folders.create").path).toBe("/v3/survey_folders");
    expect(requestOf("survey-languages.list").path).toBe("/v3/survey_languages");
    expect(requestOf("benchmark-bundles.list").path).toBe("/v3/benchmark_bundles");
    expect((requestOf("surveys.list").query as Record<string, string>).per_page).toBe("{{perPage}}");
    expect((requestOf("collectors.list").query as Record<string, string>).sort_by).toBe("{{sortBy}}");
    expect((requestOf("contacts.bulk.create").body as Record<string, string>).contacts).toBe("{{contacts}}");
    expect((requestOf("surveys.create").body as Record<string, string>).title).toBe("{{title}}");
    expect(requestOf("surveys.delete").result).toEqual({ success: true });
  });

  test("recipe operations equal runner operations", async () => {
    const recipe = await Bun.file(new URL("../../../../scripts/connector-gen/openconnector/recipes/survey_monkey/recipe.json", import.meta.url)).json();
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(Object.keys(operations).sort());
    expect([...recipe.selection.operations].sort()).toEqual(Object.keys(operations).sort());
    expect(recipe.manifest.version).toBe("0.2.0");
  });
});

describe("survey-monkey compiled handlers", () => {
  const jsonResponse = (body: unknown, status = 200) =>
    new Response(body == null ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

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
    if (types === "array" || (Array.isArray(types) && types.includes("array"))) return [{ id: "1" }];
    return { id: "1" };
  }

  test("every operation dispatches a real HTTP request for required input", async () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as { method: string; path: string; success?: number[]; result?: unknown };
      const input = dummyInput(operation.inputSchema as { properties?: Record<string, any>; required?: string[] });
      const { requests, result } = await invoke(key, input, () => jsonResponse(dummyResponse(operation), request.success?.[0] ?? 200));
      expect(requests, key).toHaveLength(1);
      expect(requests[0]!.method, key).toBe(request.method);
      expect(new URL(requests[0]!.url).hostname, key).toBe("api.surveymonkey.com");
      expect(requests[0]!.headers.get("authorization"), key).toBe("Bearer dummy");
      expect(requests[0]!.headers.get("accept"), key).toBe("application/json");
      expect(result).toMatchObject({ connector: "survey-monkey", action: key, source: "provider" });
    }
  });

  test("origin healthcheck still probes GET /v3/users/me", async () => {
    const { requests } = await invoke("healthcheck", {}, () => jsonResponse({ id: "1234", username: "jane" }));
    expect(new URL(requests[0]!.url).pathname).toBe("/v3/users/me");
    expect(requests[0]!.method).toBe("GET");
    expect(new URL(requests[0]!.url).search).toBe("");
  });

  test("optional query params are omitted when unset and encoded when set", async () => {
    const bare = await invoke("surveys.list", {}, () => jsonResponse({ data: [] }));
    expect(new URL(bare.requests[0]!.url).href).toBe("https://api.surveymonkey.com/v3/surveys");
    const filtered = await invoke(
      "surveys.list",
      { page: 2, perPage: 50, title: "NPS", sortBy: "date_modified", sortOrder: "DESC" },
      () => jsonResponse({ data: [] }),
    );
    const url = new URL(filtered.requests[0]!.url);
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("per_page")).toBe("50");
    expect(url.searchParams.get("title")).toBe("NPS");
    expect(url.searchParams.get("sort_by")).toBe("date_modified");
    expect(url.searchParams.get("sort_order")).toBe("DESC");
  });

  test("include arrays are comma-joined", async () => {
    const { requests } = await invoke(
      "surveys.list",
      { include: ["response_count", "date_modified"] },
      () => jsonResponse({ data: [] }),
    );
    expect(new URL(requests[0]!.url).searchParams.get("include")).toBe("response_count,date_modified");
    const collectors = await invoke(
      "collectors.list",
      { surveyId: "1234", include: ["url", "status"] },
      () => jsonResponse({ data: [] }),
    );
    expect(new URL(collectors.requests[0]!.url).pathname).toBe("/v3/surveys/1234/collectors");
    expect(new URL(collectors.requests[0]!.url).searchParams.get("include")).toBe("url,status");
  });

  test("create survey and bulk contacts send JSON bodies", async () => {
    const created = await invoke(
      "surveys.create",
      { title: "Customer Satisfaction Survey", nickname: "csat", language: "en", footer: false },
      () => jsonResponse({ id: "1234" }),
    );
    expect(created.requests[0]!.method).toBe("POST");
    expect(new URL(created.requests[0]!.url).pathname).toBe("/v3/surveys");
    expect(await created.requests[0]!.json()).toEqual({
      title: "Customer Satisfaction Survey",
      nickname: "csat",
      language: "en",
      footer: false,
    });
    const contacts = [{ first_name: "John", last_name: "Doe", email: "test@surveymonkey.com" }];
    const bulk = await invoke("contacts.bulk.create", { contacts, update_existing: true }, () => jsonResponse({ succeeded: [] }));
    expect(new URL(bulk.requests[0]!.url).pathname).toBe("/v3/contacts/bulk");
    expect(await bulk.requests[0]!.json()).toEqual({ contacts, update_existing: true });
  });

  test("path segments are URL-encoded", async () => {
    const { requests } = await invoke("surveys.get", { surveyId: "a/b?c" }, () => jsonResponse({ id: "a/b?c" }));
    expect(new URL(requests[0]!.url).pathname).toBe("/v3/surveys/a%2Fb%3Fc/details");
  });

  test("surveys.delete returns the static envelope", async () => {
    const { requests, result } = await invoke("surveys.delete", { survey_id: "1234" }, () => new Response(null, { status: 204 }));
    expect(requests[0]!.method).toBe("DELETE");
    expect(new URL(requests[0]!.url).pathname).toBe("/v3/surveys/1234");
    expect(result).toEqual({ connector: "survey-monkey", action: "surveys.delete", source: "provider", success: true });
  });

  test("maps 401 and 429", async () => {
    await expect(invoke("healthcheck", {}, () => jsonResponse({ error: { message: "nope" } }, 401))).rejects.toMatchObject({
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
