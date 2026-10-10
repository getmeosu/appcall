import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import COMPOSIO_TOOLS from "./composio-cover.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const ORIGIN_OPS = ["healthcheck", "contacts.get", "contacts.list", "jobs.get", "jobs.list"] as const;

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

describe("jobnimbus manifest", () => {
  test("has bounded host, origin auth, version, and compiles", () => {
    expect(manifest.key).toBe("jobnimbus");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.categories).toEqual(["crm"]);
    expect(manifest.network.allowedHosts).toEqual(["app.jobnimbus.com"]);
    expect(manifest.http.baseUrl).toBe("https://app.jobnimbus.com/api1");
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
    expect(requestOf("healthcheck")).toMatchObject({ method: "GET", path: "/contacts" });
    expect(requestOf("healthcheck").query).toEqual({ size: 1 });
    expect(requestOf("contacts.list").path).toBe("/contacts");
    expect(requestOf("contacts.get").path).toBe("/contacts/{{contactId}}");
    expect(requestOf("jobs.list").path).toBe("/jobs");
    expect(requestOf("jobs.get").path).toBe("/jobs/{{jobId}}");
    expect((operations["contacts.get"]!.inputSchema as { required: string[] }).required).toEqual(["contactId"]);
    expect((operations["jobs.get"]!.inputSchema as { required: string[] }).required).toEqual(["jobId"]);
  });

  test("covers every Composio JobNimbus tool with a real request", () => {
    expect(Object.keys(COMPOSIO_TOOLS)).toHaveLength(21);
    expect(Object.keys(operations).length).toBe(24);
    for (const [slug, key] of Object.entries(COMPOSIO_TOOLS)) {
      expect(operations[key], slug).toBeDefined();
      expect(requestOf(key), slug).toBeDefined();
      expect(compiled.actions[key], slug).toBeTypeOf("function");
    }
    expect(operations.healthcheck).toBeDefined();
    expect(operations["jobs.list"]).toBeDefined();
    expect(operations["jobs.get"]).toBeDefined();
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

  test("maps documented JobNimbus Open API paths", () => {
    expect(requestOf("account.settings.get").path).toBe("/account/settings");
    expect(requestOf("account.locations.create").path).toBe("/account/location");
    expect(requestOf("account.filetypes.create").path).toBe("/account/filetype");
    expect(requestOf("account.workflows.status.create").path).toBe("/account/workflow/{{workflowid}}/status");
    expect(requestOf("activities.get").path).toBe("/activities/{{jnid}}");
    expect(requestOf("activities.list").path).toBe("/activities");
    expect(requestOf("contacts.update").path).toBe("/contacts/{{jnid}}");
    expect(requestOf("files.get").path).toBe("/files/{{jnid}}");
    expect(requestOf("invoices.list").path).toBe("/v2/invoices");
    expect(requestOf("materialorders.create").path).toBe("/v2/materialorders");
    expect(requestOf("materialorders.list").path).toBe("/v2/materialorders");
    expect(requestOf("payments.list").path).toBe("/payments");
    expect(requestOf("products.get").path).toBe("/v2/products/{{jnid}}");
    expect(requestOf("products.list").path).toBe("/v2/products");
    expect(requestOf("tasks.create").path).toBe("/tasks");
    expect(requestOf("tasks.list").path).toBe("/tasks");
    expect(requestOf("tasks.update").path).toBe("/tasks/{{jnid}}");
    expect(requestOf("utility.uoms.list").path).toBe("/utility/uoms");
    expect(requestOf("workorders.list").path).toBe("/v2/workorders");
    expect((requestOf("contacts.update").body as Record<string, string>).first_name).toBe("{{firstName}}");
    expect((requestOf("contacts.update").body as Record<string, string>).mobile_phone).toBe("{{mobilePhone}}");
    expect((requestOf("materialorders.create").body as Record<string, string>).vendor_id).toBe("{{vendorId}}");
  });

  test("recipe operations equal runner operations", async () => {
    const recipe = await Bun.file(new URL("../../../../scripts/connector-gen/openconnector/recipes/jobnimbus/recipe.json", import.meta.url)).json();
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(Object.keys(operations).sort());
    expect([...recipe.selection.operations].sort()).toEqual(Object.keys(operations).sort());
    expect(recipe.manifest.version).toBe("0.2.0");
  });
});

describe("jobnimbus compiled handlers", () => {
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
    return { id: 1 };
  }

  test("every operation dispatches a real HTTP request for required input", async () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as { method: string; path: string; success?: number[]; result?: unknown };
      const input = dummyInput(operation.inputSchema as { properties?: Record<string, any>; required?: string[] });
      const { requests, result } = await invoke(key, input, () => jsonResponse(dummyResponse(operation), request.success?.[0] ?? 200));
      expect(requests, key).toHaveLength(1);
      expect(requests[0]!.method, key).toBe(request.method);
      expect(new URL(requests[0]!.url).hostname, key).toBe("app.jobnimbus.com");
      expect(new URL(requests[0]!.url).pathname.startsWith("/api1/"), key).toBe(true);
      expect(requests[0]!.headers.get("authorization"), key).toBe("Bearer dummy");
      expect(requests[0]!.headers.get("accept"), key).toBe("application/json");
      expect(result).toMatchObject({ connector: "jobnimbus", action: key, source: "provider" });
    }
  });

  test("origin healthcheck still probes GET /contacts?size=1", async () => {
    const { requests } = await invoke("healthcheck", {}, () => jsonResponse({ count: 0, results: [] }));
    expect(new URL(requests[0]!.url).pathname).toBe("/api1/contacts");
    expect(requests[0]!.method).toBe("GET");
    expect(new URL(requests[0]!.url).searchParams.get("size")).toBe("1");
  });

  test("optional query params are omitted when unset and encoded when set", async () => {
    const bare = await invoke("contacts.list", {}, () => jsonResponse({ count: 0, results: [] }));
    expect(new URL(bare.requests[0]!.url).href).toBe("https://app.jobnimbus.com/api1/contacts");
    const filtered = await invoke(
      "contacts.list",
      { size: 25, from: 0, sort_field: "date_created", sort_direction: "desc", fields: "jnid,email" },
      () => jsonResponse({ count: 0, results: [] }),
    );
    const url = new URL(filtered.requests[0]!.url);
    expect(url.searchParams.get("size")).toBe("25");
    expect(url.searchParams.get("from")).toBe("0");
    expect(url.searchParams.get("sort_field")).toBe("date_created");
    expect(url.searchParams.get("sort_direction")).toBe("desc");
    expect(url.searchParams.get("fields")).toBe("jnid,email");
  });

  test("contacts.update maps Composio camelCase to Open API snake_case", async () => {
    const { requests } = await invoke(
      "contacts.update",
      { jnid: "abc", firstName: "Ada", lastName: "Lovelace", mobilePhone: "555-0100" },
      () => jsonResponse({ jnid: "abc" }),
    );
    expect(requests[0]!.method).toBe("PUT");
    expect(new URL(requests[0]!.url).pathname).toBe("/api1/contacts/abc");
    expect(await requests[0]!.json()).toEqual({
      first_name: "Ada",
      last_name: "Lovelace",
      mobile_phone: "555-0100",
    });
  });

  test("path segments are URL-encoded", async () => {
    const { requests } = await invoke("contacts.get", { contactId: "a/b" }, () => jsonResponse({ jnid: "a/b" }));
    expect(new URL(requests[0]!.url).pathname).toBe("/api1/contacts/a%2Fb");
  });

  test("maps 401 and 429", async () => {
    await expect(invoke("healthcheck", {}, () => jsonResponse({ message: "nope" }, 401))).rejects.toMatchObject({
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
      const expectedResult = JSON.parse(readFileSync(join(dirname(join(caseDir, file)), raw.expected.resultFile), "utf8"));
      expect(deepEqual(result, expectedResult), `${raw.id} ${JSON.stringify(result)}`).toBe(true);
    }
  });
});
