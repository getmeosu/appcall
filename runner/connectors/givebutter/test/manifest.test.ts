import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const ORIGIN_OPS = ["healthcheck", "campaigns.list", "campaigns.get", "contacts.list", "contacts.get"] as const;

const COMPOSIO_TOOLS: Record<string, string> = {
  GIVEBUTTER_ADD_CONTACT_TAGS: "contacts.tags.add",
  GIVEBUTTER_ADD_HOUSEHOLD_CONTACT: "households.contacts.add",
  GIVEBUTTER_ARCHIVE_CONTACT: "contacts.archive",
  GIVEBUTTER_CREATE_CAMPAIGN: "campaigns.create",
  GIVEBUTTER_CREATE_CAMPAIGN_TICKET: "campaigns.tickets.create",
  GIVEBUTTER_CREATE_CONTACT: "contacts.create",
  GIVEBUTTER_CREATE_CONTACT_ACTIVITY: "contacts.activities.create",
  GIVEBUTTER_CREATE_DISCOUNT_CODE: "campaigns.discount-codes.create",
  GIVEBUTTER_CREATE_FUND: "funds.create",
  GIVEBUTTER_CREATE_HOUSEHOLD: "households.create",
  GIVEBUTTER_CREATE_TRANSACTION: "transactions.create",
  GIVEBUTTER_CREATE_WEBHOOK: "webhooks.create",
  GIVEBUTTER_DELETE_CAMPAIGN: "campaigns.delete",
  GIVEBUTTER_DELETE_CONTACT_ACTIVITY: "contacts.activities.delete",
  GIVEBUTTER_DELETE_DISCOUNT_CODE: "campaigns.discount-codes.delete",
  GIVEBUTTER_DELETE_FUND: "funds.delete",
  GIVEBUTTER_DELETE_HOUSEHOLD: "households.delete",
  GIVEBUTTER_DELETE_WEBHOOK: "webhooks.delete",
  GIVEBUTTER_GET_CAMPAIGN: "campaigns.get",
  GIVEBUTTER_GET_CAMPAIGN_TICKET: "campaigns.tickets.get",
  GIVEBUTTER_GET_CONTACT: "contacts.get",
  GIVEBUTTER_GET_CONTACT_ACTIVITY: "contacts.activities.get",
  GIVEBUTTER_GET_DISCOUNT_CODE: "campaigns.discount-codes.get",
  GIVEBUTTER_GET_FUND: "funds.get",
  GIVEBUTTER_GET_HOUSEHOLD: "households.get",
  GIVEBUTTER_GET_MEMBERS: "campaigns.members.list",
  GIVEBUTTER_GET_PAYOUTS: "payouts.list",
  GIVEBUTTER_GET_PLANS: "plans.list",
  GIVEBUTTER_GET_TEAMS: "campaigns.teams.list",
  GIVEBUTTER_GET_TICKETS: "tickets.list",
  GIVEBUTTER_GET_TRANSACTIONS: "transactions.list",
  GIVEBUTTER_GET_WEBHOOK: "webhooks.get",
  GIVEBUTTER_GET_WEBHOOK_ACTIVITY: "webhooks.activities.get",
  GIVEBUTTER_GET_WEBHOOKS: "webhooks.list",
  GIVEBUTTER_LIST_CAMPAIGNS: "campaigns.list",
  GIVEBUTTER_LIST_CAMPAIGN_TICKETS: "campaigns.tickets.list",
  GIVEBUTTER_LIST_CONTACT_ACTIVITIES: "contacts.activities.list",
  GIVEBUTTER_LIST_CONTACTS: "contacts.list",
  GIVEBUTTER_LIST_DISCOUNT_CODES: "campaigns.discount-codes.list",
  GIVEBUTTER_LIST_FUNDS: "funds.list",
  GIVEBUTTER_LIST_HOUSEHOLD_CONTACTS: "households.contacts.list",
  GIVEBUTTER_LIST_HOUSEHOLDS: "households.list",
  GIVEBUTTER_LIST_MESSAGES: "messages.list",
  GIVEBUTTER_LIST_PLEDGES: "pledges.list",
  GIVEBUTTER_LIST_WEBHOOK_ACTIVITIES: "webhooks.activities.list",
  GIVEBUTTER_REMOVE_CONTACT_TAGS: "contacts.tags.remove",
  GIVEBUTTER_RESTORE_CONTACT: "contacts.restore",
  GIVEBUTTER_SYNC_CONTACT_TAGS: "contacts.tags.sync",
  GIVEBUTTER_UPDATE_CAMPAIGN: "campaigns.update",
  GIVEBUTTER_UPDATE_CAMPAIGN_PUT: "campaigns.update.put",
  GIVEBUTTER_UPDATE_CONTACT: "contacts.update",
  GIVEBUTTER_UPDATE_CONTACT_ACTIVITY: "contacts.activities.update",
  GIVEBUTTER_UPDATE_CONTACT_PUT: "contacts.update.put",
  GIVEBUTTER_UPDATE_DISCOUNT_CODE: "campaigns.discount-codes.update",
  GIVEBUTTER_UPDATE_FUND: "funds.update",
  GIVEBUTTER_UPDATE_HOUSEHOLD: "households.update",
  GIVEBUTTER_UPDATE_WEBHOOK: "webhooks.update",
  GIVEBUTTER_UPDATE_WEBHOOK_PUT: "webhooks.update.put",
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
    else if (prop.type === "array") input[key] = prop.items?.enum ? [prop.items.enum[0]] : ["a"];
    else if (prop.type === "object") input[key] = { id: 1 };
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

describe("givebutter manifest", () => {
  test("has bounded host, origin auth, version, and compiles", () => {
    expect(manifest.key).toBe("givebutter");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.network.allowedHosts).toEqual(["api.givebutter.com"]);
    expect(manifest.http.baseUrl).toBe("https://api.givebutter.com");
    expect(manifest.http.auth.value).toBe("Bearer {{apiKey}}");
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("keeps the origin five operations", () => {
    for (const key of ORIGIN_OPS) {
      expect(operations[key], key).toBeDefined();
      expect(String(requestOf(key).path).startsWith("/v1/"), key).toBe(true);
    }
    expect(requestOf("healthcheck")).toMatchObject({ method: "GET", path: "/v1/campaigns", query: { per_page: 1 } });
    expect(requestOf("campaigns.get").path).toBe("/v1/campaigns/{{campaign_id}}");
    expect(requestOf("contacts.get").path).toBe("/v1/contacts/{{contact_id}}");
    expect((operations["campaigns.get"]!.inputSchema as { required: string[] }).required).toEqual(["campaign_id"]);
  });

  test("covers every Composio Givebutter tool with a real request", () => {
    expect(Object.keys(COMPOSIO_TOOLS)).toHaveLength(58);
    expect(Object.keys(operations).length).toBe(59);
    for (const [slug, key] of Object.entries(COMPOSIO_TOOLS)) {
      expect(operations[key], slug).toBeDefined();
      expect(requestOf(key), slug).toBeDefined();
      expect(compiled.actions[key], slug).toBeTypeOf("function");
    }
    expect(operations["healthcheck"]).toBeDefined();
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
      expect(String(request.path).startsWith("/v1/"), key).toBe(true);
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

  test("puts Content-Type only on JSON bodies", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as Record<string, unknown>;
      const method = String(request.method);
      const headers = (request.headers as Record<string, string> | undefined) ?? {};
      if (request.body !== undefined) {
        expect(headers["Content-Type"], key).toBe("application/json");
      } else {
        expect(headers["Content-Type"], key).toBeUndefined();
      }
      if (method === "GET") expect(request.body, key).toBeUndefined();
    }
  });

  test("maps documented family paths and Composio aliases", () => {
    expect(requestOf("campaigns.tickets.create").path).toBe("/v1/campaigns/{{campaign}}/items/tickets");
    expect(requestOf("campaigns.tickets.get").path).toBe("/v1/campaigns/{{campaign}}/items/tickets/{{ticketId}}");
    expect(requestOf("contacts.tags.add").path).toBe("/v1/contacts/{{contact}}/tags/add");
    expect(requestOf("contacts.tags.remove").path).toBe("/v1/contacts/{{contact}}/tags/remove");
    expect(requestOf("contacts.tags.sync").path).toBe("/v1/contacts/{{contact}}/tags/sync");
    expect(requestOf("contacts.restore")).toMatchObject({ method: "PATCH", path: "/v1/contacts/{{contact}}/restore" });
    expect(requestOf("contacts.archive")).toMatchObject({ method: "DELETE", path: "/v1/contacts/{{contact_id}}" });
    expect(requestOf("campaigns.update").path).toBe("/v1/campaigns/{{campaign_id}}");
    expect(requestOf("campaigns.update.put").path).toBe("/v1/campaigns/{{campaign}}");
    expect(requestOf("contacts.update").path).toBe("/v1/contacts/{{contact_id}}");
    expect(requestOf("contacts.update.put").path).toBe("/v1/contacts/{{contact}}");
    expect(requestOf("webhooks.update").path).toBe("/v1/webhooks/{{id}}");
    expect(requestOf("webhooks.update.put").path).toBe("/v1/webhooks/{{webhook}}");
    expect(requestOf("transactions.create").body).toMatchObject({ method: "{{payment_method}}" });
    expect(requestOf("payouts.list").query).toMatchObject({ per_page: "{{limit}}" });
    expect(requestOf("transactions.list").query).toMatchObject({ per_page: "{{limit}}", scope: "{{scope}}" });
    expect(requestOf("campaigns.members.list").path).toBe("/v1/campaigns/{{campaign_id}}/members");
    expect(requestOf("campaigns.teams.list").path).toBe("/v1/campaigns/{{campaign_id}}/teams");
    expect(requestOf("tickets.list").path).toBe("/v1/tickets");
  });

  test("recipe operations equal runner operations", async () => {
    const recipe = await Bun.file(new URL("../../../../scripts/connector-gen/openconnector/recipes/givebutter/recipe.json", import.meta.url)).json();
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(Object.keys(operations).sort());
    expect([...recipe.selection.operations].sort()).toEqual(Object.keys(operations).sort());
    expect(recipe.manifest.version).toBe("0.2.0");
  });
});

describe("givebutter compiled handlers", () => {
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
      const request = operation.request as { method: string; path: string; success?: number[]; result?: unknown };
      const input = dummyInput(operation.inputSchema as { properties?: Record<string, any>; required?: string[] });
      const wants204 = Array.isArray(request.success) && request.success.includes(204) && request.result !== undefined;
      const { requests, result } = await invoke(key, input, () =>
        wants204 ? new Response("", { status: 204 }) : jsonResponse({ id: "ok" }),
      );
      expect(requests, key).toHaveLength(1);
      expect(requests[0]!.method, key).toBe(request.method);
      expect(new URL(requests[0]!.url).pathname.startsWith("/v1/"), key).toBe(true);
      expect(requests[0]!.headers.get("authorization"), key).toBe("Bearer dummy");
      expect(requests[0]!.headers.get("accept"), key).toBe("application/json");
      expect(result).toMatchObject({ connector: "givebutter", action: key, source: "provider" });
    }
  });

  test("origin healthcheck still probes /v1/campaigns?per_page=1", async () => {
    const { requests } = await invoke("healthcheck", {}, () => jsonResponse({ data: [], links: {}, meta: {} }));
    const url = new URL(requests[0]!.url);
    expect(url.pathname).toBe("/v1/campaigns");
    expect(url.search).toBe("?per_page=1");
  });

  test("transactions.create sends payment_method as method", async () => {
    const { requests } = await invoke(
      "transactions.create",
      { amount: 25, contact_id: 1001, transacted_at: "2026-02-13T15:30:00Z", payment_method: "cash", campaign_code: "annual" },
      () => jsonResponse({ id: "tx_1" }, 200),
    );
    expect(requests[0]!.method).toBe("POST");
    expect(new URL(requests[0]!.url).pathname).toBe("/v1/transactions");
    expect(await requests[0]!.json()).toEqual({
      amount: 25,
      contact_id: 1001,
      transacted_at: "2026-02-13T15:30:00Z",
      method: "cash",
      campaign_code: "annual",
    });
  });

  test("contacts.archive returns the static 204 envelope", async () => {
    const { requests, result } = await invoke("contacts.archive", { contact_id: "1001" }, () => new Response("", { status: 204 }));
    expect(requests[0]!.method).toBe("DELETE");
    expect(new URL(requests[0]!.url).pathname).toBe("/v1/contacts/1001");
    expect(result).toEqual({ connector: "givebutter", action: "contacts.archive", source: "provider", success: true });
  });

  test("contacts.restore patches /restore", async () => {
    const { requests } = await invoke("contacts.restore", { contact: 1001 }, () => jsonResponse({ id: "1001" }));
    expect(requests[0]!.method).toBe("PATCH");
    expect(new URL(requests[0]!.url).pathname).toBe("/v1/contacts/1001/restore");
  });

  test("campaigns.update.put uses integer campaign path", async () => {
    const { requests } = await invoke("campaigns.update.put", { campaign: 441507, title: "Annual Fund" }, () => jsonResponse({ id: "441507" }));
    expect(requests[0]!.method).toBe("PUT");
    expect(new URL(requests[0]!.url).pathname).toBe("/v1/campaigns/441507");
    expect(await requests[0]!.json()).toEqual({ title: "Annual Fund" });
  });

  test("runs fixtures against compiled handlers", async () => {
    const caseDir = join(import.meta.dir, "../fixtures/cases");
    const files = readdirSync(caseDir).filter((name) => name.endsWith(".json")).sort();
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) {
      const raw = JSON.parse(readFileSync(join(caseDir, file), "utf8")) as {
        id: string;
        operation: string;
        input: Record<string, unknown>;
        credentials: Record<string, string>;
        exchanges: Array<{
          request: { method: string; url: string; headers?: Record<string, string>; body: unknown };
          response: { status: number; headers?: Record<string, string>; bodyFile: string };
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
          if (got.get(headerKey) !== value) throw new Error(`${raw.id}: header ${headerKey}`);
        }
        const bodyBytes = readFileSync(join(dirname(join(caseDir, file)), expected.response.bodyFile));
        const status = expected.response.status;
        if (status === 204) return new Response(null, { status, headers: expected.response.headers });
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
      expect(deepEqual(result, expected), raw.id).toBe(true);
    }
  });
});
