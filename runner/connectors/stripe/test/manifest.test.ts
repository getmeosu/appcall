import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import { binaryActions } from "../src/binary";
import COMPOSIO_TOOLS from "./composio-cover.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
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

function formObject(raw: string | null): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(raw ?? ""));
}

describe("stripe manifest", () => {
  test("has bounded host, Bearer secret-key auth, version, and compiles", () => {
    expect(manifest.key).toBe("stripe");
    expect(manifest.version).toBe("0.2.2");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.categories).toEqual(["payments"]);
    expect(manifest.network.allowedHosts).toEqual(["api.stripe.com", "files.stripe.com"]);
    expect(manifest.http.baseUrl).toBe("https://api.stripe.com");
    expect(manifest.http.auth.field).toBe("apiKey");
    expect(manifest.http.auth.in).toBe("header");
    expect(manifest.http.auth.name).toBe("Authorization");
    expect(manifest.http.auth.value).toBe("Bearer {{apiKey}}");
    expect(manifest.http.headers).toEqual({ Accept: "application/json", "Stripe-Version": "2026-09-30.endive" });
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("covers mapped Composio Stripe tools with real request blocks", () => {
    expect(Object.keys(COMPOSIO_TOOLS).length).toBeGreaterThanOrEqual(20);
    expect(Object.keys(operations).length).toBeGreaterThanOrEqual(21);
    for (const [slug, key] of Object.entries(COMPOSIO_TOOLS)) {
      expect(operations[key], slug).toBeDefined();
      if (binaryActions[key]) {
        expect(operations[key]!.request, slug).toBeUndefined();
        expect(binaryActions[key], slug).toBeTypeOf("function");
        continue;
      }
      expect(requestOf(key), slug).toBeDefined();
      expect(compiled.actions[key], slug).toBeTypeOf("function");
    }
    expect(operations.healthcheck).toBeDefined();
    expect(requestOf("healthcheck")).toMatchObject({ method: "GET", path: "/v1/balance" });
  });

  test("gives every action a real request, title, description, and object inputSchema", () => {
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind, key).toBe("action");
      expect(["read", "write", "destructive"], key).toContain(operation.sideEffect);
      expect(String(operation.title ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(0);
      expect((operation.inputSchema as { type?: string }).type, key).toBe("object");
      if (binaryActions[key]) {
        expect(operation.request, key).toBeUndefined();
        continue;
      }
      expect(operation.request, `${key} must declare a request block`).toBeDefined();
      const request = operation.request as Record<string, unknown>;
      expect(typeof request.method, key).toBe("string");
      expect(typeof request.path, key).toBe("string");
      expect(String(request.path).startsWith("/v1/") || String(request.path).startsWith("/v2/"), key).toBe(true);
    }
  });

  test("classifies mutating HTTP methods as write or destructive", () => {
    for (const [key, operation] of Object.entries(operations)) {
      if (!operation.request) {
        expect(binaryActions[key], key).toBeTypeOf("function");
        expect(operation.sideEffect, key).toBe(key === "files.create" ? "write" : "read");
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
      if (!operation.request) continue;
      const request = operation.request as Record<string, unknown>;
      const schema = operation.inputSchema as { required?: string[] };
      const placeholders = [...String(request.path ?? "").matchAll(/\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g)].map((match) => match[1]);
      for (const placeholder of placeholders) {
        expect(schema.required ?? [], `${key} path uses {{${placeholder}}}`).toContain(placeholder);
      }
    }
  });

  test("uses form or JSON bodies only when a body is set and keeps GET/DELETE body-less", () => {
    for (const [key, operation] of Object.entries(operations)) {
      if (!operation.request) continue;
      const request = operation.request as Record<string, unknown>;
      const method = String(request.method);
      const headers = (request.headers as Record<string, string> | undefined) ?? {};
      if (request.body !== undefined) {
        expect(["application/x-www-form-urlencoded", "application/json"], key).toContain(headers["Content-Type"]);
        if (headers["Content-Type"] === "application/x-www-form-urlencoded") expect(request.bodyEncoding, key).toBe("form");
        else expect(request.bodyEncoding, key).toBeUndefined();
      } else {
        expect(headers["Content-Type"], key).toBeUndefined();
      }
      if (method === "GET" || method === "DELETE") expect(request.body, key).toBeUndefined();
    }
  });

  test("maps official Stripe REST paths", () => {
    expect(requestOf("customers.create")).toMatchObject({ method: "POST", path: "/v1/customers" });
    expect(requestOf("customers.get").path).toBe("/v1/customers/{{customer}}");
    expect(requestOf("payment_intents.create").path).toBe("/v1/payment_intents");
    expect(requestOf("payment_intents.confirm").path).toBe("/v1/payment_intents/{{intent}}/confirm");
    expect(requestOf("subscriptions.cancel")).toMatchObject({ method: "DELETE", path: "/v1/subscriptions/{{subscription}}" });
    expect(requestOf("checkout.sessions.create").path).toBe("/v1/checkout/sessions");
    expect((requestOf("subscriptions.create").body as Record<string, string>)["items[0][price]"]).toBe("{{price}}");
    expect((requestOf("checkout.sessions.create").body as Record<string, string>)["line_items[0][price]"]).toBe("{{price}}");
    expect((requestOf("prices.create").body as Record<string, string>)["recurring[interval]"]).toBe("{{interval}}");
    expect(requestOf("account.get").path).toBe("/v1/account");
    expect(requestOf("balance.get").path).toBe("/v1/balance");
    expect(requestOf("terminal.readers.list").path).toBe("/v1/terminal/readers");
    expect(requestOf("tax.calculations.create").path).toBe("/v1/tax/calculations");
    expect(requestOf("billing.meters.create").path).toBe("/v1/billing/meters");
    expect(requestOf("accounts.persons.list").path).toBe("/v1/accounts/{{account}}/persons");
    expect(requestOf("v2.core.events.list").path).toBe("/v2/core/events");
    expect(requestOf("webhook_endpoints.list").path).toBe("/v1/webhook_endpoints");
    expect(requestOf("payment_intents.apply_customer_balance").path).toBe("/v1/payment_intents/{{intent}}/apply_customer_balance");
    expect(requestOf("billing.meter_event_sessions.create")).toMatchObject({ method: "POST", path: "/v2/billing/meter_event_session" });
    expect(requestOf("tax.associations.find").path).toBe("/v1/tax/associations/find");
    expect(requestOf("payment_records.report_refund").path).toBe("/v1/payment_records/{{id}}/report_refund");
    expect(requestOf("analytics.mrr.query").path).toBe("/v2/data/analytics/metric_query");
    expect(requestOf("subscriptions.migrate").path).toBe("/v1/subscriptions/{{subscription}}/migrate");
    expect(operations["files.create"]!.request).toBeUndefined();
    expect(operations["quotes.pdf"]!.request).toBeUndefined();
    expect((requestOf("v2.core.event_destinations.disable").headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });
});

describe("stripe compiled handlers", () => {
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
    const blob = JSON.stringify((operation.request as { result?: unknown }).result ?? {});
    // ST-0: invoices.upcoming.lines.list reads the lines list embedded in a preview invoice.
    if (blob.includes("response.lines.data")) {
      return { id: "upcoming_in_x", object: "invoice", lines: { object: "list", data: [{ id: "il_x" }], has_more: false } };
    }
    if (blob.includes("response.data") || blob.includes("response.has_more")) {
      return { object: "list", data: [{ id: "x" }], has_more: false };
    }
    if (blob.includes("response.deleted")) return { id: "x", object: "customer", deleted: true };
    return { id: "x", object: "customer" };
  }

  test("every operation dispatches a real HTTP request for required input", async () => {
    for (const [key, operation] of Object.entries(operations)) {
      if (!operation.request) continue;
      const request = operation.request as { method: string; path: string; success?: number[] };
      const input = dummyInput(operation.inputSchema as { properties?: Record<string, any>; required?: string[] });
      const { requests, result } = await invoke(key, input, () => jsonResponse(dummyResponse(operation), request.success?.[0] ?? 200));
      expect(requests, key).toHaveLength(1);
      expect(requests[0]!.method, key).toBe(request.method);
      expect(new URL(requests[0]!.url).hostname, key).toBe("api.stripe.com");
      expect(requests[0]!.headers.get("authorization"), key).toBe("Bearer dummy");
      expect(requests[0]!.headers.get("accept"), key).toBe("application/json");
      expect(requests[0]!.headers.get("stripe-version"), key).toBe("2026-09-30.endive");
      expect(result).toMatchObject({ connector: "stripe", action: key, source: "provider" });
    }
  });

  test("healthcheck probes GET /v1/balance and returns status ok", async () => {
    const { requests, result } = await invoke("healthcheck", {}, () => jsonResponse({ object: "balance", livemode: false }));
    expect(new URL(requests[0]!.url).href).toBe("https://api.stripe.com/v1/balance");
    expect(requests[0]!.method).toBe("GET");
    expect(result).toMatchObject({ status: "ok" });
  });

  test("sends the secret key as an Authorization Bearer header", async () => {
    const { requests } = await invoke("customers.list", {}, () => jsonResponse({ object: "list", data: [], has_more: false }));
    expect(requests[0]!.headers.get("authorization")).toBe("Bearer dummy");
    expect(new URL(requests[0]!.url).href).toBe("https://api.stripe.com/v1/customers");
  });

  test("omits unset list filters and encodes set ones", async () => {
    const bare = await invoke("customers.list", {}, () => jsonResponse({ object: "list", data: [], has_more: false }));
    expect(new URL(bare.requests[0]!.url).href).toBe("https://api.stripe.com/v1/customers");
    const filtered = await invoke("customers.list", { limit: 3, email: "a@b.com", starting_after: "cus_1" }, () => jsonResponse({ object: "list", data: [], has_more: false }));
    const url = new URL(filtered.requests[0]!.url);
    expect(url.searchParams.get("limit")).toBe("3");
    expect(url.searchParams.get("email")).toBe("a@b.com");
    expect(url.searchParams.get("starting_after")).toBe("cus_1");
    expect(url.searchParams.has("ending_before")).toBe(false);
  });

  test("posts form-urlencoded Stripe fields and flattens items[0][price]", async () => {
    const created = await invoke(
      "customers.create",
      { email: "jenny.rosen@example.com", name: "Jenny Rosen" },
      () => jsonResponse({ id: "cus_x", object: "customer" }),
    );
    expect(created.requests[0]!.headers.get("content-type")).toBe("application/x-www-form-urlencoded");
    expect(formObject(await created.requests[0]!.text())).toEqual({ email: "jenny.rosen@example.com", name: "Jenny Rosen" });
    const sub = await invoke(
      "subscriptions.create",
      { customer: "cus_1", price: "price_1", quantity: 2 },
      () => jsonResponse({ id: "sub_1", object: "subscription" }),
    );
    expect(formObject(await sub.requests[0]!.text())).toEqual({
      customer: "cus_1",
      "items[0][price]": "price_1",
      "items[0][quantity]": "2",
    });
  });

  test("maps 401 and 429 while keeping secrets out of errors", async () => {
    await expect(invoke("healthcheck", {}, () => jsonResponse({ error: { message: "secret", type: "invalid_request_error" } }, 401))).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
    await expect(
      invoke("healthcheck", {}, () => new Response(JSON.stringify({ error: { message: "slow" } }), { status: 429, headers: { "retry-after": "4", "content-type": "application/json" } })),
    ).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });

  test("rejects extra healthcheck fields before fetch", async () => {
    let calls = 0;
    await expect(
      invoke("healthcheck", { unexpected: true }, async () => {
        calls += 1;
        return jsonResponse({});
      }),
    ).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    expect(calls).toBe(0);
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
      if (binaryActions[raw.operation]) continue;
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
          const contentType = new Headers(init?.headers).get("content-type") ?? "";
          if (contentType.includes("application/x-www-form-urlencoded")) {
            const got = formObject(rawBody);
            const exp: Record<string, string> = {};
            for (const [k, v] of Object.entries(expected.request.body as Record<string, unknown>)) {
              if (v !== undefined && v !== null) exp[k] = String(v);
            }
            if (!deepEqual(got, exp)) throw new Error(`${raw.id}: form body mismatch ${rawBody} != ${JSON.stringify(exp)}`);
          } else if (!deepEqual(rawBody ? JSON.parse(rawBody) : null, expected.request.body)) {
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
        const encoded = (expected.response as { bodyBase64?: string }).bodyBase64;
        const bodyBytes = typeof encoded === "string"
          ? Buffer.from(encoded, "base64")
          : expected.response.bodyFile
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
