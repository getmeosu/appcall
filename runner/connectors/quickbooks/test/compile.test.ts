import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import COMPOSIO_TOOLS from "./composio-cover.json";

const operations = manifest.operations as Record<string, Record<string, any>>;
const compiled = compileDeclarativeConnector(manifest as never);
const ORIGIN_OPS = ["healthcheck", "invoices.list", "customers.list", "payments.list"] as const;
const ACCOUNTING_HOST = "quickbooks.api.intuit.com";
const PAYMENTS_HOST = "api.intuit.com";

function requestOf(key: string): Record<string, unknown> {
  return operations[key]!.request as Record<string, unknown>;
}

function dummyInput(schema: { properties?: Record<string, any>; required?: string[] }): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const key of schema.required ?? []) {
    const prop = schema.properties?.[key] ?? {};
    input[key] = dummyValue(key, prop);
  }
  return input;
}

function dummyFromSchema(schema: Record<string, any> | undefined): unknown {
  if (!schema) return { Id: "1" };
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
  if (schema.type === "array") return [dummyFromSchema(schema.items ?? {})];
  if (schema.type === "string") return "x";
  if (schema.type === "integer" || schema.type === "number") return 1;
  if (schema.type === "boolean") return true;
  if (schema.type === "null") return null;
  if (schema.type === "object" || schema.properties) {
    const object: Record<string, unknown> = {};
    for (const key of schema.required ?? Object.keys(schema.properties ?? {})) {
      object[key] = dummyFromSchema(schema.properties?.[key] ?? {});
    }
    if (Object.keys(object).length === 0) object.Id = "1";
    return object;
  }
  return { Id: "1" };
}

function dummyValue(key: string, prop: Record<string, any>): unknown {
  if (Array.isArray(prop.enum) && prop.enum.length > 0) return prop.enum[0];
  if (prop.type === "integer" || prop.type === "number") return Math.max(1, Number(prop.minimum ?? 1));
  if (prop.type === "boolean") return true;
  if (prop.type === "array") {
    const items = prop.items ?? {};
    if (items.type === "integer" || items.type === "number") return [1];
    if (items.type === "object") return [dummyInput(items)];
    return ["x"];
  }
  if (prop.type === "object") {
    const nested = dummyInput(prop);
    return Object.keys(nested).length === 0 ? { value: "1" } : nested;
  }
  if (key.toLowerCase().includes("email")) return "user@example.com";
  if (key === "query") return "SELECT * FROM Customer MAXRESULTS 1";
  return "x".repeat(Math.max(1, Number(prop.minLength ?? 1)));
}

function expectedHost(key: string): string {
  const base = String(requestOf(key).baseUrl ?? manifest.http.baseUrl);
  return new URL(base).hostname;
}

describe("quickbooks declarative compile", () => {
  test("compiles native oauth2 type/scopes/setup auth and static Intuit hosts", () => {
    expect(manifest.key).toBe("quickbooks");
    expect(manifest.version).toBe("0.4.0");
    expect(manifest.auth.type).toBe("oauth2");
    expect(Object.keys(manifest.auth).sort()).toEqual(["scopes", "setup", "type"]);
    expect(manifest.auth.scopes).toEqual([
      "com.intuit.quickbooks.accounting",
      "com.intuit.quickbooks.payment",
    ]);
    expect(manifest.auth.setup.fields.find((field: { key: string }) => field.key === "realmId")).toMatchObject({
      required: true,
      secret: false,
    });
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    expect(manifest.http.headers["Content-Type"]).toBeUndefined();
    expect(manifest.network.allowedHosts).toContain(ACCOUNTING_HOST);
    expect(manifest.network.allowedHosts).toContain(PAYMENTS_HOST);
    expect(manifest.http.baseUrl).toBe("https://quickbooks.api.intuit.com/v3/company");
    expect(manifest.provenance.source.revision).toBe("33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a");
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("keeps origin operations with real HTTP requests", () => {
    for (const key of ORIGIN_OPS) {
      expect(operations[key], key).toBeDefined();
      expect(requestOf(key), key).toBeDefined();
      expect(String(requestOf(key).path)).toMatch(/^\//);
    }
    expect(requestOf("healthcheck")).toMatchObject({
      method: "GET",
      path: "/{{realmId}}/companyinfo/{{realmId}}",
    });
    expect(requestOf("invoices.list").method).toBe("GET");
    expect(requestOf("customers.list").path).toBe("/{{realmId}}/query");
    expect(requestOf("payments.list").query).toEqual({ query: "SELECT * FROM Payment ORDERBY MetaData.LastUpdatedTime", minorversion: "75" });
  });

  test("covers every Composio QuickBooks tool with a real request", () => {
    expect(Object.keys(COMPOSIO_TOOLS)).toHaveLength(114);
    for (const [slug, key] of Object.entries(COMPOSIO_TOOLS)) {
      expect(operations[key], slug).toBeDefined();
      expect(requestOf(key), slug).toBeDefined();
      if (operations[key]!.kind === "action") {
        expect(compiled.actions[key], slug).toBeTypeOf("function");
      }
    }
  });

  test("gives every operation a real request, title, description, and object inputSchema", () => {
    for (const [key, operation] of Object.entries(operations)) {
      expect(["action", "sync"], key).toContain(operation.kind);
      expect(String(operation.title ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(0);
      expect(operation.inputSchema?.type, key).toBe("object");
      expect(operation.request, `${key} must declare a request block`).toBeDefined();
      const request = operation.request as Record<string, unknown>;
      expect(typeof request.method, key).toBe("string");
      expect(String(request.path).startsWith("/"), key).toBe(true);
    }
  });

  test("classifies methods and keeps webhook event ops as read", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const method = String((operation.request as Record<string, unknown>).method);
      if (key.startsWith("webhook.")) {
        expect(operation.sideEffect, key).toBe("read");
        continue;
      }
      if (method === "GET") expect(operation.sideEffect, key).toBe("read");
      else if (method === "DELETE" || key === "items.delete") expect(operation.sideEffect, key).toBe("destructive");
      else expect(["write", "destructive"], key).toContain(operation.sideEffect);
    }
  });

  test("puts JSON Content-Type only on bodies and keeps GET/DELETE body-less", () => {
    expect(manifest.http.headers["Content-Type"]).toBeUndefined();
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
});

describe("quickbooks compiled handlers", () => {
  const jsonResponse = (body: unknown, status = 200) =>
    new Response(body == null ? null : JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });

  async function invoke(key: string, input: Record<string, unknown>, respond: (request: Request) => Promise<Response> | Response) {
    const requests: Request[] = [];
    const result = await compiled.actions[key]!({
      ...input,
      accessToken: "dummy",
      realmId: "1234567890",
      fetch: async (url: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(url, init);
        requests.push(request);
        return respond(request);
      },
    });
    return { requests, result };
  }

  test("every action dispatches a real HTTP request for required input", async () => {
    const actionKeys = Object.entries(operations)
      .filter(([, operation]) => operation.kind === "action")
      .map(([key]) => key);
    expect(actionKeys.length).toBe(115);
    for (const key of actionKeys) {
      const operation = operations[key]!;
      const request = operation.request as { method: string; path: string; success?: number[]; body?: unknown };
      const schema = operation.inputSchema ?? { properties: {} };
      const input = dummyInput(schema);
      if (schema.properties?.query && input.query === undefined) {
        input.query = "SELECT * FROM Customer MAXRESULTS 1";
      }
      const status = (request.success ?? [200]).find((code) => code !== 204) ?? 204;
      const dataSchema = (operation.outputSchema as { properties?: { data?: Record<string, any> } })?.properties?.data;
      const body = dummyFromSchema(dataSchema);
      let requests: Request[];
      let result: unknown;
      try {
        ({ requests, result } = await invoke(key, input, () => jsonResponse(body, status)));
      } catch (error) {
        throw new Error(`${key}: ${error instanceof Error ? error.message : JSON.stringify(error)}`);
      }
      expect(requests, key).toHaveLength(1);
      expect(requests[0]!.method, key).toBe(request.method);
      expect(new URL(requests[0]!.url).hostname, key).toBe(expectedHost(key));
      expect(requests[0]!.headers.get("authorization"), key).toBe("Bearer dummy");
      if (request.body === undefined) {
        expect(requests[0]!.headers.get("content-type"), key).toBeNull();
        expect(await requests[0]!.text(), key).toBe("");
      } else {
        expect(requests[0]!.headers.get("content-type"), key).toBe("application/json");
      }
      expect(result).toMatchObject({ connector: "quickbooks", action: key, source: "provider" });
    }
  });

  test("healthcheck probes companyinfo and accounting vs payments hosts", async () => {
    const health = await invoke("healthcheck", {}, () => jsonResponse({ CompanyInfo: { Id: "1" } }));
    expect(health.requests[0]!.method).toBe("GET");
    expect(new URL(health.requests[0]!.url).pathname).toBe("/v3/company/1234567890/companyinfo/1234567890");
    expect(health.requests[0]!.headers.get("content-type")).toBeNull();
    expect(health.result).toMatchObject({ status: "ok" });

    const customer = await invoke(
      "customers.create",
      { display_name: "Jane Doe" },
      () => jsonResponse({ Customer: { Id: "1" } }),
    );
    expect(customer.requests[0]!.method).toBe("POST");
    expect(new URL(customer.requests[0]!.url).hostname).toBe(ACCOUNTING_HOST);
    expect(new URL(customer.requests[0]!.url).pathname).toBe("/v3/company/1234567890/customer");
    expect(customer.requests[0]!.headers.get("content-type")).toBe("application/json");

    const charge = await invoke(
      "charges.capture",
      { charge_id: "EMU123", amount: "10.55" },
      () => jsonResponse({ id: "EMU123" }),
    );
    expect(new URL(charge.requests[0]!.url).hostname).toBe(PAYMENTS_HOST);
    expect(new URL(charge.requests[0]!.url).pathname).toBe("/quickbooks/v4/payments/charges/EMU123/capture");
    expect(await charge.requests[0]!.json()).toEqual({ amount: "10.55" });

    const deleted = await invoke(
      "bank_accounts.delete",
      { customer_id: "9", bank_account_id: "ba-1" },
      () => jsonResponse(null, 204),
    );
    expect(deleted.requests[0]!.method).toBe("DELETE");
    expect(await deleted.requests[0]!.text()).toBe("");
  });

  test("maps 401 and 429", async () => {
    await expect(invoke("healthcheck", {}, () => jsonResponse({ Fault: { Error: [{ Message: "nope" }] } }, 401))).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
    await expect(
      invoke("healthcheck", {}, () => new Response("{}", { status: 429, headers: { "retry-after": "4", "content-type": "application/json" } })),
    ).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });
});
