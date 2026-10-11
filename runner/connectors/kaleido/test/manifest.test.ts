import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const ORIGIN_OPS = ["healthcheck", "memberships.list", "consortia.list", "consortia.get", "environments.list"] as const;

const COMPOSIO_TOOLS: Record<string, string> = {
  KALEIDO_ADD_IDENTITY_PROOF: "identity_proofs.create",
  KALEIDO_CREATE_API_KEY: "apikeys.create",
  KALEIDO_DELETE_API_KEY: "apikeys.delete",
  KALEIDO_DELETE_ORGANIZATION_IDENTITY_PROOF: "identity_proofs.delete",
  KALEIDO_GET_API_KEY: "apikeys.get",
  KALEIDO_GET_API_KEYS: "apikeys.list",
  KALEIDO_GET_APPLICATION_CREDENTIALS: "appcreds.list",
  KALEIDO_GET_BILLING_SUMMARY: "billing.summary.get",
  KALEIDO_GET_CONSORTIA: "consortia.list",
  KALEIDO_GET_EVENT_STREAMS: "event_streams.list",
  KALEIDO_GET_IDENTITY_PROOF: "identity_proofs.get",
  KALEIDO_GET_INVITATIONS: "invitations.list",
  KALEIDO_GET_MEMBERSHIPS: "memberships.list",
  KALEIDO_GET_ORGANIZATION: "orgs.get",
  KALEIDO_GET_ORGANIZATION_PLAN: "orgs.plan.get",
  KALEIDO_GET_ORGANIZATIONS: "orgs.list",
  KALEIDO_GET_ORG_BILLING_PROVIDER: "orgs.billing_provider.get",
  KALEIDO_GET_PLANS: "plans.list",
  KALEIDO_GET_REGIONS: "regions.list",
  KALEIDO_GET_RELEASES: "releases.list",
  KALEIDO_GET_ROLE_BY_ID: "roles.get",
  KALEIDO_GET_ROLES: "roles.list",
  KALEIDO_GET_SERVICES: "services.list",
  KALEIDO_GET_TOKEN_FACTORY_TOKENS: "token_factory.tokens.list",
  KALEIDO_GET_WALLET_ACCOUNT_NONCE: "wallets.accounts.get",
  KALEIDO_GET_WALLETS: "wallets.list",
  KALEIDO_UPDATE_ORGANIZATION: "orgs.update",
  KALEIDO_UPDATE_ORG_ROLE: "roles.update",
  KALEIDO_UPSERT_ORGANIZATION_ROLE: "roles.upsert",
};

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
    else if (prop.type === "object") input[key] = { type: "stripe" };
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

describe("kaleido manifest", () => {
  test("has bounded host, origin auth, version, and compiles", () => {
    expect(manifest.key).toBe("kaleido");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.categories).toEqual(["dev-tools"]);
    expect(manifest.network.allowedHosts).toEqual(["console.kaleido.io"]);
    expect(manifest.http.baseUrl).toBe("https://console.kaleido.io/api/v1");
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
    expect(requestOf("healthcheck")).toMatchObject({ method: "GET", path: "/memberships" });
    expect(requestOf("memberships.list").path).toBe("/memberships");
    expect(requestOf("consortia.list").path).toBe("/consortia");
    expect(requestOf("consortia.get").path).toBe("/consortia/{{consortia_id}}");
    expect(requestOf("environments.list").path).toBe("/consortia/{{consortia_id}}/environments");
    expect((operations["consortia.get"]!.inputSchema as { required: string[] }).required).toEqual(["consortia_id"]);
  });

  test("covers every Composio Kaleido tool with a real request", () => {
    expect(Object.keys(COMPOSIO_TOOLS)).toHaveLength(29);
    expect(Object.keys(operations).length).toBe(32);
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

  test("maps documented Kaleido paths and Composio aliases", () => {
    expect(requestOf("apikeys.list").path).toBe("/apikeys");
    expect(requestOf("apikeys.get").path).toBe("/apikeys/{{apikey_id}}");
    expect(requestOf("apikeys.create").path).toBe("/apikeys");
    expect(requestOf("apikeys.delete").path).toBe("/apikeys/{{apikey_id}}");
    expect(requestOf("identity_proofs.create").path).toBe("/orgs/{{org_id}}/idproofs");
    expect(requestOf("billing.summary.get").path).toBe("/orgs/{{org_id}}/billing/summary");
    expect(requestOf("orgs.billing_provider.get").path).toBe("/orgs/{{org_id}}/billing/provider");
    expect(requestOf("orgs.plan.get").path).toBe("/orgs/{{org_id}}/plan");
    expect(requestOf("roles.upsert").path).toBe("/orgs/{{org_id}}/roles/{{role_id}}");
    expect(requestOf("roles.update").method).toBe("PATCH");
    expect(requestOf("roles.upsert").method).toBe("PUT");
    expect(requestOf("event_streams.list").path).toBe("/eventstreams");
    expect(requestOf("token_factory.tokens.list").path).toBe("/contracts");
    expect(requestOf("wallets.list").path).toBe("/wallets");
    expect(requestOf("wallets.accounts.get").path).toBe("/wallets/{{wallet_id}}/accounts/{{account_index}}");
    expect((requestOf("consortia.list").query as Record<string, string>).skip).toBe("{{skip}}");
    expect((requestOf("memberships.list").query as Record<string, string>).query).toBe("{{query}}");
    expect((requestOf("orgs.update").body as Record<string, string>).billing_account).toBe("{{billing_account}}");
  });

  test("recipe operations equal runner operations", async () => {
    const recipe = await Bun.file(new URL("../../../../scripts/connector-gen/openconnector/recipes/kaleido/recipe.json", import.meta.url)).json();
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(Object.keys(operations).sort());
    expect([...recipe.selection.operations].sort()).toEqual(Object.keys(operations).sort());
    expect(Object.keys(recipe.operationSources).sort()).toEqual(Object.keys(operations).sort());
    expect(recipe.manifest.version).toBe("0.2.0");
  });
});

describe("kaleido compiled handlers", () => {
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
    const data = (operation.outputSchema as { properties?: { data?: { type?: string } } }).properties?.data;
    if (data?.type === "array") return [{ _id: "ok" }];
    return { _id: "ok" };
  }

  test("every operation dispatches a real HTTP request for required input", async () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as { method: string; path: string; success?: number[] };
      const input = dummyInput(operation.inputSchema as { properties?: Record<string, any>; required?: string[] });
      const { requests, result } = await invoke(key, input, () => jsonResponse(dummyResponse(operation), request.success?.[0] ?? 200));
      expect(requests, key).toHaveLength(1);
      expect(requests[0]!.method, key).toBe(request.method);
      expect(new URL(requests[0]!.url).hostname, key).toBe("console.kaleido.io");
      expect(requests[0]!.headers.get("authorization"), key).toBe("Bearer dummy");
      expect(requests[0]!.headers.get("accept"), key).toBe("application/json");
      expect(result).toMatchObject({ connector: "kaleido", action: key, source: "provider" });
    }
  });

  test("origin healthcheck still probes GET /memberships", async () => {
    const { requests } = await invoke("healthcheck", {}, () => jsonResponse([]));
    expect(new URL(requests[0]!.url).pathname).toBe("/api/v1/memberships");
    expect(requests[0]!.method).toBe("GET");
    expect(new URL(requests[0]!.url).search).toBe("");
  });

  test("optional query params are omitted when unset and encoded when set", async () => {
    const bare = await invoke("consortia.list", {}, () => jsonResponse([]));
    expect(new URL(bare.requests[0]!.url).href).toBe("https://console.kaleido.io/api/v1/consortia");
    const filtered = await invoke("consortia.list", { skip: 10, limit: 5 }, () => jsonResponse([]));
    const url = new URL(filtered.requests[0]!.url);
    expect(url.searchParams.get("skip")).toBe("10");
    expect(url.searchParams.get("limit")).toBe("5");
    const billed = await invoke("billing.summary.get", { org_id: "u0orgabc12", year: "2025", month: "january" }, () => jsonResponse({}));
    const billing = new URL(billed.requests[0]!.url);
    expect(billing.pathname).toBe("/api/v1/orgs/u0orgabc12/billing/summary");
    expect(billing.searchParams.get("year")).toBe("2025");
    expect(billing.searchParams.get("month")).toBe("january");
  });

  test("path segments are URL-encoded", async () => {
    const { requests } = await invoke("orgs.get", { org_id: "a/b?c" }, () => jsonResponse({ _id: "a/b?c" }));
    expect(new URL(requests[0]!.url).pathname).toBe("/api/v1/orgs/a%2Fb%3Fc");
  });

  test("orgs.update sends nested billing_account objects", async () => {
    const { requests } = await invoke(
      "orgs.update",
      { org_id: "u0orgabc12", name: "Acme", waitlisted: false, billing_account: { type: "stripe", stripe_customer_id: "cus_x" } },
      () => jsonResponse({ _id: "u0orgabc12" }),
    );
    expect(requests[0]!.method).toBe("PATCH");
    expect(await requests[0]!.json()).toEqual({
      name: "Acme",
      waitlisted: false,
      billing_account: { type: "stripe", stripe_customer_id: "cus_x" },
    });
  });

  test("deletes return the static envelope", async () => {
    const { requests, result } = await invoke("apikeys.delete", { apikey_id: "u0apikey01" }, () => new Response(null, { status: 204 }));
    expect(requests[0]!.method).toBe("DELETE");
    expect(new URL(requests[0]!.url).pathname).toBe("/api/v1/apikeys/u0apikey01");
    expect(result).toEqual({ connector: "kaleido", action: "apikeys.delete", source: "provider", success: true });
  });

  test("maps 401 and 429", async () => {
    await expect(invoke("healthcheck", {}, () => jsonResponse({ errorMessage: "Unauthorized" }, 401))).rejects.toMatchObject({
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
