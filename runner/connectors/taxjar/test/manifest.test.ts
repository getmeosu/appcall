import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import COMPOSIO_TOOLS from "./composio-cover.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const ORIGIN_OPS = ["healthcheck", "nexus.regions.list", "customers.list", "customers.get", "orders.list"] as const;

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
    else input[key] = "x".repeat(Math.max(1, Number(prop.minLength) || 1));
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

describe("taxjar manifest", () => {
  test("has bounded host, origin auth, version, and compiles", () => {
    expect(manifest.key).toBe("taxjar");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.categories).toEqual(["accounting"]);
    expect(manifest.network.allowedHosts).toEqual(["api.taxjar.com"]);
    expect(manifest.http.baseUrl).toBe("https://api.taxjar.com/v2");
    expect(manifest.http.auth.field).toBe("apiKey");
    expect(manifest.http.auth.value).toBe("Bearer {{apiKey}}");
    expect(manifest.http.headers).toEqual({ Accept: "application/json", "x-api-version": "2022-01-24" });
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("keeps the origin five operations", () => {
    for (const key of ORIGIN_OPS) {
      expect(operations[key], key).toBeDefined();
      expect(requestOf(key), key).toBeDefined();
    }
    expect(requestOf("healthcheck")).toMatchObject({ method: "GET", path: "/categories" });
    expect(requestOf("nexus.regions.list")).toMatchObject({ method: "GET", path: "/nexus/regions" });
    expect(requestOf("customers.list").path).toBe("/customers");
    expect(requestOf("customers.get").path).toBe("/customers/{{customerId}}");
    expect(requestOf("orders.list").path).toBe("/transactions/orders");
    expect((operations["customers.get"]!.inputSchema as { required: string[] }).required).toEqual(["customerId"]);
    expect((operations["orders.list"]!.inputSchema as { required: string[] }).required).toEqual([
      "fromTransactionDate",
      "toTransactionDate",
    ]);
  });

  test("covers every Composio TaxJar tool with a real request", () => {
    expect(Object.keys(COMPOSIO_TOOLS)).toHaveLength(21);
    expect(Object.keys(operations).length).toBe(22);
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

  test("puts JSON Content-Type only on bodies and keeps GET body-less", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as Record<string, unknown>;
      const method = String(request.method);
      const hdrs = (request.headers as Record<string, string> | undefined) ?? {};
      if (request.body !== undefined) {
        expect(hdrs["Content-Type"], key).toBe("application/json");
      } else {
        expect(hdrs["Content-Type"], key).toBeUndefined();
      }
      if (method === "GET" || method === "DELETE") expect(request.body, key).toBeUndefined();
    }
  });

  test("maps documented TaxJar paths and Composio tools", () => {
    expect(requestOf("categories.list")).toMatchObject({ method: "GET", path: "/categories" });
    expect(requestOf("taxes.calculate")).toMatchObject({ method: "POST", path: "/taxes" });
    expect(requestOf("rates.get").path).toBe("/rates/{{zip}}");
    expect(requestOf("summary.rates.list").path).toBe("/summary_rates");
    expect(requestOf("customers.create")).toMatchObject({ method: "POST", path: "/customers" });
    expect(requestOf("customers.update").path).toBe("/customers/{{customerId}}");
    expect(requestOf("customers.delete")).toMatchObject({ method: "DELETE", path: "/customers/{{customerId}}" });
    expect(requestOf("orders.get").path).toBe("/transactions/orders/{{transactionId}}");
    expect(requestOf("orders.create").path).toBe("/transactions/orders");
    expect(requestOf("orders.update").path).toBe("/transactions/orders/{{transactionId}}");
    expect(requestOf("orders.delete").path).toBe("/transactions/orders/{{transactionId}}");
    expect(requestOf("refunds.list").path).toBe("/transactions/refunds");
    expect(requestOf("refunds.get").path).toBe("/transactions/refunds/{{transactionId}}");
    expect(requestOf("refunds.create").path).toBe("/transactions/refunds");
    expect(requestOf("refunds.update").path).toBe("/transactions/refunds/{{transactionId}}");
    expect(requestOf("refunds.delete").path).toBe("/transactions/refunds/{{transactionId}}");
    expect(requestOf("validations.vat")).toMatchObject({ method: "GET", path: "/validation" });
    expect((requestOf("validations.vat").query as Record<string, string>).vat).toBe("{{vat}}");
    expect((requestOf("orders.list").query as Record<string, string>).provider).toBe("{{provider}}");
    expect((requestOf("taxes.calculate").body as Record<string, string>).to_country).toBe("{{to_country}}");
    expect((requestOf("customers.create").body as Record<string, string>).customer_id).toBe("{{customer_id}}");
  });

  test("does not add non-Composio address validation", () => {
    expect(operations["addresses.validate"]).toBeUndefined();
  });

  test("recipe operations equal runner operations", async () => {
    const recipe = await Bun.file(new URL("../../../../scripts/connector-gen/openconnector/recipes/taxjar/recipe.json", import.meta.url)).json();
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(Object.keys(operations).sort());
    expect([...recipe.selection.operations].sort()).toEqual(Object.keys(operations).sort());
    expect(recipe.manifest.version).toBe("0.2.0");
  });
});

describe("taxjar compiled handlers", () => {
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

  test("every operation dispatches a real HTTP request for required input", async () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as { method: string; path: string; success?: number[] };
      const input = dummyInput(operation.inputSchema as { properties?: Record<string, any>; required?: string[] });
      const { requests, result } = await invoke(key, input, () => jsonResponse({ ok: true }, request.success?.[0] ?? 200));
      expect(requests, key).toHaveLength(1);
      expect(requests[0]!.method, key).toBe(request.method);
      expect(new URL(requests[0]!.url).hostname, key).toBe("api.taxjar.com");
      expect(requests[0]!.headers.get("authorization"), key).toBe("Bearer dummy");
      expect(requests[0]!.headers.get("accept"), key).toBe("application/json");
      expect(requests[0]!.headers.get("x-api-version"), key).toBe("2022-01-24");
      expect(result).toMatchObject({ connector: "taxjar", action: key, source: "provider" });
    }
  });

  test("origin healthcheck still probes GET /categories", async () => {
    const { requests } = await invoke("healthcheck", {}, () => jsonResponse({ categories: [] }));
    expect(new URL(requests[0]!.url).pathname).toBe("/v2/categories");
    expect(requests[0]!.method).toBe("GET");
    expect(new URL(requests[0]!.url).search).toBe("");
  });

  test("optional query params are omitted when unset and encoded when set", async () => {
    const bare = await invoke("customers.list", {}, () => jsonResponse({ customers: [] }));
    expect(new URL(bare.requests[0]!.url).href).toBe("https://api.taxjar.com/v2/customers");
    const paged = await invoke("customers.list", { page: 2, per_page: 10 }, () => jsonResponse({ customers: [] }));
    const url = new URL(paged.requests[0]!.url);
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("per_page")).toBe("10");
    const withProvider = await invoke(
      "orders.list",
      { fromTransactionDate: "2024-01-01", toTransactionDate: "2024-01-31", provider: "api" },
      () => jsonResponse({ orders: [] }),
    );
    expect(new URL(withProvider.requests[0]!.url).searchParams.get("provider")).toBe("api");
  });

  test("taxes.calculate sends a JSON body and omits unset optionals", async () => {
    const { requests } = await invoke(
      "taxes.calculate",
      { to_country: "US", to_zip: "90002", to_state: "CA", shipping: 1.5, amount: 15 },
      () => jsonResponse({ tax: {} }),
    );
    expect(requests[0]!.method).toBe("POST");
    expect(new URL(requests[0]!.url).pathname).toBe("/v2/taxes");
    expect(requests[0]!.headers.get("content-type")).toBe("application/json");
    expect(await requests[0]!.json()).toEqual({
      to_country: "US",
      to_zip: "90002",
      to_state: "CA",
      shipping: 1.5,
      amount: 15,
    });
  });

  test("path segments are URL-encoded", async () => {
    const { requests } = await invoke("customers.get", { customerId: "a/b" }, () => jsonResponse({ customer: {} }));
    expect(new URL(requests[0]!.url).pathname).toBe("/v2/customers/a%2Fb");
    const rates = await invoke("rates.get", { zip: "90002" }, () => jsonResponse({ rate: {} }));
    expect(new URL(rates.requests[0]!.url).pathname).toBe("/v2/rates/90002");
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
      const expected = JSON.parse(readFileSync(join(dirname(join(caseDir, file)), raw.expected.resultFile), "utf8"));
      expect(deepEqual(result, expected), `${raw.id} ${JSON.stringify(result)}`).toBe(true);
    }
  });
});
