import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import COMPOSIO_TOOLS from "./composio-cover.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const ORIGIN_OPS = ["healthcheck", "accounts.list", "accounts.get", "products.list", "memberships.list"] as const;

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
      else if (items.type === "object") input[key] = [{}];
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

describe("whop manifest", () => {
  test("has bounded host, origin auth, version, and compiles", () => {
    expect(manifest.key).toBe("whop");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.categories).toEqual(["payments"]);
    expect(manifest.network.allowedHosts).toEqual(["api.whop.com"]);
    expect(manifest.http.baseUrl).toBe("https://api.whop.com/api/v1");
    expect(manifest.http.auth.field).toBe("apiKey");
    expect(manifest.http.auth.value).toBe("Bearer {{apiKey}}");
    expect(manifest.http.headers).toEqual({ Accept: "application/json", "Api-Version-Date": "2026-07-01" });
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("keeps the origin five operations", () => {
    for (const key of ORIGIN_OPS) {
      expect(operations[key], key).toBeDefined();
      expect(requestOf(key), key).toBeDefined();
    }
    expect(requestOf("healthcheck")).toMatchObject({ method: "GET", path: "/accounts/me" });
    expect(requestOf("accounts.list").path).toBe("/accounts");
    expect(requestOf("accounts.get").path).toBe("/accounts/{{id}}");
    expect(requestOf("products.list").path).toBe("/products");
    expect((operations["products.list"]!.inputSchema as { required: string[] }).required).toEqual(["account_id"]);
    expect(requestOf("memberships.list").path).toBe("/memberships");
    expect((requestOf("memberships.list").query as Record<string, string>).account_id).toBe("{{account_id}}");
    expect((requestOf("memberships.list").query as Record<string, string>).company_id).toBe("{{company_id}}");
  });

  test("covers every Composio WHOP tool with a real request", () => {
    expect(Object.keys(COMPOSIO_TOOLS)).toHaveLength(19);
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

  test("maps documented Whop paths and Composio aliases", () => {
    expect(requestOf("access_tokens.create")).toMatchObject({ method: "POST", path: "/access_tokens" });
    expect(requestOf("files.create")).toMatchObject({ method: "POST", path: "/files" });
    expect(requestOf("files.get").path).toBe("/files/{{id}}");
    expect(requestOf("promo_codes.delete")).toMatchObject({ method: "DELETE", path: "/promo_codes/{{id}}" });
    expect(requestOf("apps.list").path).toBe("/apps");
    expect(requestOf("apps.get").path).toBe("/apps/{{id}}");
    expect(requestOf("authorized_users.list").path).toBe("/authorized_users");
    expect(requestOf("members.list").path).toBe("/members");
    expect(requestOf("members.get").path).toBe("/members/{{id}}");
    expect(requestOf("payment_methods.list").path).toBe("/payment_methods");
    expect(requestOf("payments.list").path).toBe("/payments");
    expect(requestOf("company_token_transactions.get").path).toBe("/company_token_transactions/{{id}}");
    expect(requestOf("plans.get").path).toBe("/plans/{{id}}");
    expect(requestOf("plans.update")).toMatchObject({ method: "PATCH", path: "/plans/{{id}}" });
    expect(requestOf("users.get").path).toBe("/users/{{id}}");
    expect((requestOf("apps.list").query as Record<string, string>).company_id).toBe("{{company_id}}");
    expect((requestOf("apps.list").query as Record<string, string>).account_id).toBe("{{account_id}}");
    expect((requestOf("plans.update").body as Record<string, string>).title).toBe("{{title}}");
    expect((requestOf("plans.update").body as Record<string, string>).id).toBeUndefined();
  });

  test("recipe operations equal runner operations", async () => {
    const recipe = await Bun.file(new URL("../../../../scripts/connector-gen/openconnector/recipes/whop/recipe.json", import.meta.url)).json();
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(Object.keys(operations).sort());
    expect([...recipe.selection.operations].sort()).toEqual(Object.keys(operations).sort());
    expect(recipe.manifest.version).toBe("0.2.0");
  });
});

describe("whop compiled handlers", () => {
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
    if (types === "boolean") return true;
    return { id: 1 };
  }

  test("every operation dispatches a real HTTP request for required input", async () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as { method: string; path: string; success?: number[] };
      const input = dummyInput(operation.inputSchema as { properties?: Record<string, any>; required?: string[] });
      const { requests, result } = await invoke(key, input, () => jsonResponse(dummyResponse(operation), request.success?.[0] ?? 200));
      expect(requests, key).toHaveLength(1);
      expect(requests[0]!.method, key).toBe(request.method);
      expect(new URL(requests[0]!.url).hostname, key).toBe("api.whop.com");
      expect(requests[0]!.headers.get("authorization"), key).toBe("Bearer dummy");
      expect(requests[0]!.headers.get("accept"), key).toBe("application/json");
      expect(requests[0]!.headers.get("api-version-date"), key).toBe("2026-07-01");
      expect(result).toMatchObject({ connector: "whop", action: key, source: "provider" });
    }
  });

  test("origin healthcheck still probes GET /accounts/me", async () => {
    const { requests } = await invoke("healthcheck", {}, () => jsonResponse({ id: "biz_xxxxxxxxxxxxxx" }));
    expect(new URL(requests[0]!.url).pathname).toBe("/api/v1/accounts/me");
    expect(requests[0]!.method).toBe("GET");
    expect(new URL(requests[0]!.url).search).toBe("");
  });

  test("optional query params are omitted when unset and encoded when set", async () => {
    const bare = await invoke("apps.list", {}, () => jsonResponse({ data: [], page_info: {} }));
    expect(new URL(bare.requests[0]!.url).href).toBe("https://api.whop.com/api/v1/apps");
    const filtered = await invoke(
      "apps.list",
      { company_id: "biz_xxxxxxxxxxxxxx", first: 2, verified_apps_only: true },
      () => jsonResponse({ data: [], page_info: {} }),
    );
    const url = new URL(filtered.requests[0]!.url);
    expect(url.pathname).toBe("/api/v1/apps");
    expect(url.searchParams.get("company_id")).toBe("biz_xxxxxxxxxxxxxx");
    expect(url.searchParams.get("first")).toBe("2");
    expect(url.searchParams.get("verified_apps_only")).toBe("true");
    expect(url.searchParams.has("query")).toBe(false);
  });

  test("memberships.list keeps origin account_id and forwards Composio company_id plus arrays", async () => {
    const origin = await invoke("memberships.list", { account_id: "biz_xxxxxxxxxxxxxx" }, () => jsonResponse({ data: [] }));
    expect(new URL(origin.requests[0]!.url).searchParams.get("account_id")).toBe("biz_xxxxxxxxxxxxxx");
    expect(new URL(origin.requests[0]!.url).searchParams.has("company_id")).toBe(false);
    const composio = await invoke(
      "memberships.list",
      { company_id: "biz_xxxxxxxxxxxxxx", statuses: ["active", "trialing"], plan_ids: ["plan_1"] },
      () => jsonResponse({ data: [] }),
    );
    const url = new URL(composio.requests[0]!.url);
    expect(url.searchParams.get("company_id")).toBe("biz_xxxxxxxxxxxxxx");
    expect(url.searchParams.getAll("statuses")).toEqual(["active", "trialing"]);
    expect(url.searchParams.getAll("plan_ids")).toEqual(["plan_1"]);
  });

  test("access_tokens.create posts JSON and drops unset fields", async () => {
    const { requests, result } = await invoke(
      "access_tokens.create",
      { user_id: "user_xxxxxxxxxxxxx", scoped_actions: ["chat:read"] },
      () => jsonResponse({ token: "jwt", expires_at: "2023-12-01T06:00:00.401Z" }),
    );
    expect(requests[0]!.method).toBe("POST");
    expect(new URL(requests[0]!.url).pathname).toBe("/api/v1/access_tokens");
    expect(requests[0]!.headers.get("content-type")).toBe("application/json");
    expect(await requests[0]!.json()).toEqual({ user_id: "user_xxxxxxxxxxxxx", scoped_actions: ["chat:read"] });
    expect(result).toMatchObject({ action: "access_tokens.create", data: { token: "jwt" } });
  });

  test("plans.update PATCHes body without repeating path id", async () => {
    const { requests } = await invoke(
      "plans.update",
      { id: "plan_xxxxxxxxxxxxx", title: "Pro", initial_price: 1999 },
      () => jsonResponse({ id: "plan_xxxxxxxxxxxxx", title: "Pro" }),
    );
    expect(requests[0]!.method).toBe("PATCH");
    expect(new URL(requests[0]!.url).pathname).toBe("/api/v1/plans/plan_xxxxxxxxxxxxx");
    expect(await requests[0]!.json()).toEqual({ title: "Pro", initial_price: 1999 });
  });

  test("promo_codes.delete returns the boolean payload under data", async () => {
    const { requests, result } = await invoke("promo_codes.delete", { id: "promo_xxxxxxxxxxxx" }, () => jsonResponse(true));
    expect(requests[0]!.method).toBe("DELETE");
    expect(new URL(requests[0]!.url).pathname).toBe("/api/v1/promo_codes/promo_xxxxxxxxxxxx");
    expect(result).toEqual({ connector: "whop", action: "promo_codes.delete", source: "provider", data: true });
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
