import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import COMPOSIO_TOOLS from "./composio-cover.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const ORIGIN_OPS = ["healthcheck", "campaigns.list", "campaigns.get", "lists.list", "accounts.list"] as const;
const READS = new Set([
  "healthcheck",
  "campaigns.list",
  "campaigns.get",
  "lists.list",
  "accounts.list",
  "auth.check",
  "lists.leads.list",
  "lists.companies.list",
  "lists.for_lead",
  "webhooks.list",
  "webhooks.get",
  "conversations.list",
  "leads.get",
  "network.list",
  "stats.get",
]);
const WRITES = new Set(["lists.create", "lists.leads.add", "tags.create", "webhooks.create", "webhooks.update"]);
const DESTRUCTIVE = new Set(["webhooks.delete"]);

const compiled = compileDeclarativeConnector(manifest as never);

function requestOf(key: string): Record<string, unknown> {
  return operations[key]!.request as Record<string, unknown>;
}

function dummyInput(schema: { properties?: Record<string, any>; required?: string[] }): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const key of schema.required ?? []) {
    const prop = schema.properties?.[key] ?? {};
    if (Array.isArray(prop.enum) && prop.enum.length > 0) input[key] = prop.enum[0];
    else if (prop.type === "integer" || prop.type === "number") input[key] = key === "pageNumber" ? 0 : 1;
    else if (prop.type === "boolean") input[key] = true;
    else if (prop.type === "array") {
      const items = prop.items ?? {};
      if (items.type === "integer" || items.type === "number") input[key] = [1];
      else if (items.type === "object") input[key] = [dummyInput(items)];
      else if (Array.isArray(items.enum) && items.enum.length > 0) input[key] = [items.enum[0]];
      else input[key] = ["x"];
    } else if (prop.type === "object") input[key] = dummyInput(prop);
    else input[key] = String(key).toLowerCase().includes("url") ? "https://www.linkedin.com/in/jane-doe" : "x";
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

describe("heyreach manifest", () => {
  test("has bounded host, origin auth, version, and compiles", () => {
    expect(manifest.key).toBe("heyreach");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.categories).toEqual(["crm"]);
    expect(manifest.network.allowedHosts).toEqual(["api.heyreach.io"]);
    expect(manifest.http.baseUrl).toBe("https://api.heyreach.io/api/public");
    expect(manifest.http.auth.field).toBe("apiKey");
    expect(manifest.http.auth.name).toBe("X-API-KEY");
    expect(manifest.http.auth.value).toBe("{{apiKey}}");
    expect(manifest.http.headers).toEqual({ Accept: "application/json", "Content-Type": "application/json" });
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("keeps the origin five operations", () => {
    for (const key of ORIGIN_OPS) {
      expect(operations[key], key).toBeDefined();
      expect(requestOf(key), key).toBeDefined();
    }
    expect(requestOf("healthcheck")).toMatchObject({ method: "POST", path: "/campaign/GetAll" });
    expect(requestOf("campaigns.list").path).toBe("/campaign/GetAll");
    expect(requestOf("campaigns.get")).toMatchObject({ method: "GET", path: "/campaign/GetById" });
    expect(requestOf("lists.list").path).toBe("/list/GetAll");
    expect(requestOf("accounts.list").path).toBe("/li_account/GetAll");
    expect((operations["campaigns.get"]!.inputSchema as { required: string[] }).required).toEqual(["campaignId"]);
  });

  test("covers every Composio HeyReach tool with a real request", () => {
    expect(Object.keys(COMPOSIO_TOOLS)).toHaveLength(19);
    expect(Object.keys(operations).length).toBe(21);
    for (const [slug, key] of Object.entries(COMPOSIO_TOOLS)) {
      expect(operations[key], slug).toBeDefined();
      expect(requestOf(key), slug).toBeDefined();
      expect(compiled.actions[key], slug).toBeTypeOf("function");
    }
    expect(operations.healthcheck).toBeDefined();
    expect(operations["campaigns.get"]).toBeDefined();
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

  test("classifies HeyReach POST reads as read and mutating methods by effect", () => {
    expect(READS.size + WRITES.size + DESTRUCTIVE.size).toBe(Object.keys(operations).length);
    for (const [key, operation] of Object.entries(operations)) {
      if (DESTRUCTIVE.has(key)) expect(operation.sideEffect, key).toBe("destructive");
      else if (WRITES.has(key)) expect(operation.sideEffect, key).toBe("write");
      else {
        expect(READS.has(key), key).toBe(true);
        expect(operation.sideEffect, key).toBe("read");
      }
    }
  });

  test("maps documented HeyReach paths and Composio aliases", () => {
    expect(requestOf("auth.check").path).toBe("/auth/CheckApiKey");
    expect(requestOf("lists.create").path).toBe("/list/CreateEmptyList");
    expect(requestOf("lists.leads.add").path).toBe("/list/AddLeadsToListV2");
    expect(requestOf("lists.leads.list").path).toBe("/list/GetLeadsFromList");
    expect(requestOf("lists.companies.list").path).toBe("/list/GetCompaniesFromList");
    expect(requestOf("lists.for_lead").path).toBe("/list/GetListsForLead");
    expect(requestOf("tags.create").path).toBe("/lead_tags/CreateTags");
    expect(requestOf("webhooks.create").path).toBe("/webhooks/CreateWebhook");
    expect(requestOf("webhooks.delete").path).toBe("/webhooks/DeleteWebhook");
    expect(requestOf("webhooks.list").path).toBe("/webhooks/GetAllWebhooks");
    expect(requestOf("webhooks.get").path).toBe("/webhooks/GetWebhookById");
    expect(requestOf("webhooks.update").path).toBe("/webhooks/UpdateWebhook");
    expect(requestOf("conversations.list").path).toBe("/inbox/GetConversationsV2");
    expect(requestOf("leads.get").path).toBe("/lead/GetLead");
    expect(requestOf("network.list").path).toBe("/MyNetwork/GetMyNetworkForSender");
    expect(requestOf("stats.get").path).toBe("/stats/GetOverallStats");
    expect((requestOf("stats.get").body as Record<string, string>).startDate).toBe("{{dateFrom}}");
    expect((requestOf("stats.get").body as Record<string, string>).endDate).toBe("{{dateTo}}");
  });

  test("recipe operations equal runner operations", async () => {
    const recipe = await Bun.file(new URL("../../../../scripts/connector-gen/openconnector/recipes/heyreach/recipe.json", import.meta.url)).json();
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(Object.keys(operations).sort());
    expect([...recipe.selection.operations].sort()).toEqual(Object.keys(operations).sort());
    expect(recipe.manifest.version).toBe("0.2.0");
  });
});

describe("heyreach compiled handlers", () => {
  const jsonResponse = (body: unknown, status = 200) =>
    new Response(body === "" ? "" : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

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
      const request = operation.request as { method: string; path: string; success?: number[] };
      const input = dummyInput(operation.inputSchema as { properties?: Record<string, any>; required?: string[] });
      const { requests, result } = await invoke(key, input, () => jsonResponse(dummyResponse(operation), request.success?.[0] ?? 200));
      expect(requests, key).toHaveLength(1);
      expect(requests[0]!.method, key).toBe(request.method);
      expect(new URL(requests[0]!.url).hostname, key).toBe("api.heyreach.io");
      expect(requests[0]!.headers.get("x-api-key"), key).toBe("dummy");
      expect(requests[0]!.headers.get("accept"), key).toBe("application/json");
      expect(result).toMatchObject({ connector: "heyreach", action: key, source: "provider" });
    }
  });

  test("origin healthcheck still probes POST /campaign/GetAll", async () => {
    const { requests } = await invoke("healthcheck", {}, () => jsonResponse({ totalCount: 0, items: [] }));
    expect(new URL(requests[0]!.url).pathname).toBe("/api/public/campaign/GetAll");
    expect(requests[0]!.method).toBe("POST");
    expect(await requests[0]!.json()).toEqual({ limit: 1, offset: 0 });
  });

  test("auth.check accepts an empty 200 body", async () => {
    const { requests, result } = await invoke("auth.check", {}, () => new Response("", { status: 200 }));
    expect(new URL(requests[0]!.url).pathname).toBe("/api/public/auth/CheckApiKey");
    expect(requests[0]!.method).toBe("GET");
    expect(result).toEqual({ connector: "heyreach", action: "auth.check", source: "provider", data: { valid: true } });
  });

  test("optional campaign filters are omitted when unset and sent when set", async () => {
    const bare = await invoke("campaigns.list", { offset: 0, limit: 10 }, () => jsonResponse({ items: [] }));
    expect(await bare.requests[0]!.json()).toEqual({ limit: 10, offset: 0 });
    const filtered = await invoke(
      "campaigns.list",
      { offset: 0, limit: 10, keyword: "Q3", statuses: ["PAUSED"], accountIds: [7] },
      () => jsonResponse({ items: [] }),
    );
    expect(await filtered.requests[0]!.json()).toEqual({
      accountIds: [7],
      keyword: "Q3",
      limit: 10,
      offset: 0,
      statuses: ["PAUSED"],
    });
  });

  test("stats.get maps dateFrom/dateTo to startDate/endDate", async () => {
    const { requests } = await invoke(
      "stats.get",
      { accountIds: [1], campaignIds: [], dateFrom: "2024-01-01T00:00:00Z", dateTo: "2024-01-31T23:59:59Z" },
      () => jsonResponse({ overallStats: {} }),
    );
    expect(await requests[0]!.json()).toEqual({
      accountIds: [1],
      campaignIds: [],
      endDate: "2024-01-31T23:59:59Z",
      startDate: "2024-01-01T00:00:00Z",
    });
  });

  test("maps 401 and 429", async () => {
    await expect(invoke("healthcheck", {}, () => jsonResponse({ message: "Invalid API key" }, 401))).rejects.toMatchObject({
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
