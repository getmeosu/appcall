import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const ORIGIN_OPS = ["healthcheck", "fonts.list", "media.list", "writingStyles.list"] as const;

const COMPOSIO_TOOLS: Record<string, string> = {
  CARDLY_CREATE_CONTACT_LIST: "contactLists.create",
  CARDLY_CREATE_INVITATION: "invitations.create",
  CARDLY_CREATE_WEBHOOK: "webhooks.create",
  CARDLY_DELETE_INVITATION: "invitations.delete",
  CARDLY_DELETE_INVITATION_BY_EMAIL: "invitations.deleteByEmail",
  CARDLY_DELETE_USER: "users.delete",
  CARDLY_DELETE_USER_BY_EMAIL: "users.deleteByEmail",
  CARDLY_DELETE_WEBHOOK: "webhooks.delete",
  CARDLY_ECHO_REQUEST: "echo.request",
  CARDLY_GENERATE_PREVIEW: "orders.preview",
  CARDLY_GET_ARTWORK: "artwork.get",
  CARDLY_GET_WEBHOOK: "webhooks.get",
  CARDLY_LIST_ARTWORK: "artwork.list",
  CARDLY_LIST_CONTACT_LISTS: "contactLists.list",
  CARDLY_LIST_CREDIT_HISTORY: "account.creditHistory.list",
  CARDLY_LIST_DOODLES: "doodles.list",
  CARDLY_LIST_FONTS: "fonts.list",
  CARDLY_LIST_GIFT_CREDIT_HISTORY: "account.giftCreditHistory.list",
  CARDLY_LIST_INVITATIONS: "invitations.list",
  CARDLY_LIST_MEDIA: "media.list",
  CARDLY_LIST_ORDERS: "orders.list",
  CARDLY_LIST_TEMPLATES: "templates.list",
  CARDLY_LIST_USERS: "users.list",
  CARDLY_LIST_WEBHOOKS: "webhooks.list",
  CARDLY_LIST_WRITING_STYLES: "writingStyles.list",
  CARDLY_RETRIEVE_ACCOUNT_BALANCE: "account.balance.get",
  CARDLY_RETRIEVE_ORDER: "orders.get",
  CARDLY_RETRIEVE_USER: "users.get",
  CARDLY_UPDATE_WEBHOOK: "webhooks.update",
};

const compiled = compileDeclarativeConnector(manifest as never);

function requestOf(key: string): Record<string, unknown> {
  return operations[key]!.request as Record<string, unknown>;
}

function dummyValue(prop: Record<string, any>, key: string): unknown {
  if (Array.isArray(prop.enum) && prop.enum.length > 0) return prop.enum[0];
  if (prop.type === "integer" || prop.type === "number") return 1;
  if (prop.type === "boolean") return true;
  if (prop.type === "array") {
    const items = prop.items ?? {};
    return [dummyValue(items, key)];
  }
  if (prop.type === "object") return dummyInput(prop);
  if (key === "email") return "thor@avengers.com";
  if (key === "targetUrl") return "https://www.example.com/hook";
  if (key === "artwork") return "happy-birthday";
  return "x";
}

function dummyInput(schema: { properties?: Record<string, any>; required?: string[] }): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const key of schema.required ?? []) {
    input[key] = dummyValue(schema.properties?.[key] ?? {}, key);
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

describe("cardly manifest", () => {
  test("has bounded host, origin auth, version, and compiles", () => {
    expect(manifest.key).toBe("cardly");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.network.allowedHosts).toEqual(["api.card.ly"]);
    expect(manifest.http.baseUrl).toBe("https://api.card.ly/v2");
    expect(manifest.http.auth.name).toBe("API-Key");
    expect(manifest.http.auth.value).toBe("{{apiKey}}");
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("keeps the origin four operations", () => {
    for (const key of ORIGIN_OPS) {
      expect(operations[key], key).toBeDefined();
      expect(String(requestOf(key).path).startsWith("/"), key).toBe(true);
    }
    expect(requestOf("healthcheck")).toMatchObject({ method: "GET", path: "/account/balance" });
    expect(requestOf("fonts.list").path).toBe("/fonts");
    expect(requestOf("media.list").path).toBe("/media");
    expect(requestOf("writingStyles.list").path).toBe("/writing-styles");
    expect((requestOf("fonts.list").query as Record<string, string>).organisationOnly).toBe("{{organisationOnly}}");
    expect((requestOf("media.list").query as Record<string, string>).organisationOnly).toBe("{{organisationOnly}}");
  });

  test("covers every Composio Cardly tool with a real request", () => {
    expect(Object.keys(COMPOSIO_TOOLS)).toHaveLength(29);
    expect(Object.keys(operations).length).toBe(30);
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

  test("puts JSON Content-Type only on bodies", () => {
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

  test("maps documented Cardly paths and Composio aliases", () => {
    expect(requestOf("account.balance.get").path).toBe("/account/balance");
    expect(requestOf("account.creditHistory.list").path).toBe("/account/credit-history");
    expect(requestOf("account.giftCreditHistory.list").path).toBe("/account/gift-credit-history");
    expect((requestOf("account.creditHistory.list").query as Record<string, string>)["effectiveTime.gt"]).toBe("{{effectiveTimeGt}}");
    expect((requestOf("account.giftCreditHistory.list").query as Record<string, string>)["effectiveTime.lte"]).toBe("{{effectiveTimeLte}}");
    expect(requestOf("artwork.list").path).toBe("/art");
    expect(requestOf("artwork.get").path).toBe("/art/{{id}}");
    expect(requestOf("contactLists.create").path).toBe("/contact-lists");
    expect(requestOf("contactLists.list").path).toBe("/contact-lists");
    expect(requestOf("doodles.list").path).toBe("/doodles");
    expect(requestOf("echo.request").path).toBe("/echo");
    expect((requestOf("echo.request").query as Record<string, string>).test).toBe("{{test}}");
    expect((requestOf("echo.request").body as Record<string, string>).foo).toBe("{{foo}}");
    expect(requestOf("invitations.create").path).toBe("/invitations");
    expect(requestOf("invitations.delete").path).toBe("/invitations/{{id}}");
    expect(requestOf("invitations.deleteByEmail")).toMatchObject({ method: "DELETE", path: "/invitations" });
    expect((requestOf("invitations.deleteByEmail").body as Record<string, string>).email).toBe("{{email}}");
    expect(requestOf("orders.preview").path).toBe("/orders/preview");
    expect(requestOf("orders.get").path).toBe("/orders/{{id}}");
    expect(requestOf("templates.list").path).toBe("/templates");
    expect(requestOf("users.deleteByEmail")).toMatchObject({ method: "DELETE", path: "/users" });
    expect(requestOf("webhooks.create").path).toBe("/webhooks");
    expect(requestOf("webhooks.update")).toMatchObject({ method: "POST", path: "/webhooks/{{id}}" });
    expect(requestOf("webhooks.delete").path).toBe("/webhooks/{{id}}");
    expect((operations["orders.preview"]!.inputSchema as { required: string[] }).required).toEqual(["artwork", "recipient"]);
    expect((operations["webhooks.create"]!.inputSchema as { required: string[] }).required).toEqual(["targetUrl", "events"]);
    expect((operations["webhooks.update"]!.inputSchema as { required: string[] }).required).toEqual(["id", "targetUrl", "events"]);
  });

  test("recipe operations equal runner operations", async () => {
    const recipe = await Bun.file(new URL("../../../../scripts/connector-gen/openconnector/recipes/cardly/recipe.json", import.meta.url)).json();
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(Object.keys(operations).sort());
    expect([...recipe.selection.operations].sort()).toEqual(Object.keys(operations).sort());
    expect(recipe.manifest.version).toBe("0.2.0");
  });
});

describe("cardly compiled handlers", () => {
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
      const request = operation.request as { method: string; path: string };
      const input = dummyInput(operation.inputSchema as { properties?: Record<string, any>; required?: string[] });
      const { requests, result } = await invoke(key, input, () => jsonResponse({ state: { status: "OK" }, data: { id: "ok" } }));
      expect(requests, key).toHaveLength(1);
      expect(requests[0]!.method, key).toBe(request.method);
      expect(new URL(requests[0]!.url).hostname, key).toBe("api.card.ly");
      expect(requests[0]!.headers.get("api-key"), key).toBe("dummy");
      expect(requests[0]!.headers.get("accept"), key).toBe("application/json");
      expect(result).toMatchObject({ connector: "cardly", action: key, source: "provider" });
    }
  });

  test("origin healthcheck still probes GET /account/balance", async () => {
    const { requests } = await invoke("healthcheck", {}, () => jsonResponse({ data: { balance: 1 } }));
    expect(new URL(requests[0]!.url).pathname).toBe("/v2/account/balance");
    expect(requests[0]!.method).toBe("GET");
  });

  test("credit history maps camelCase filters onto dotted query names", async () => {
    const { requests } = await invoke(
      "account.creditHistory.list",
      { effectiveTimeGt: "2024-01-01 00:00:00", limit: 10 },
      () => jsonResponse({ data: { results: [] } }),
    );
    const url = new URL(requests[0]!.url);
    expect(url.pathname).toBe("/v2/account/credit-history");
    expect(url.searchParams.get("effectiveTime.gt")).toBe("2024-01-01 00:00:00");
    expect(url.searchParams.get("limit")).toBe("10");
    expect(url.searchParams.get("effectiveTime.lt")).toBeNull();
  });

  test("echo.request sends query test and JSON body", async () => {
    const { requests } = await invoke("echo.request", { test: "ping", foo: "bar", bar: ["A", "B"] }, () => jsonResponse({ data: {} }));
    expect(requests[0]!.method).toBe("POST");
    expect(new URL(requests[0]!.url).searchParams.get("test")).toBe("ping");
    expect(requests[0]!.headers.get("content-type")).toBe("application/json");
    expect(await requests[0]!.json()).toEqual({ foo: "bar", bar: ["A", "B"] });
  });

  test("invitations.deleteByEmail sends DELETE with an email body", async () => {
    const { requests } = await invoke("invitations.deleteByEmail", { email: "thor@avengers.com" }, () => jsonResponse({ data: {} }));
    expect(requests[0]!.method).toBe("DELETE");
    expect(new URL(requests[0]!.url).pathname).toBe("/v2/invitations");
    expect(await requests[0]!.json()).toEqual({ email: "thor@avengers.com" });
  });

  test("orders.preview posts nested recipient without path id", async () => {
    const recipient = {
      firstName: "Thor",
      address: "1 Main Street",
      city: "Brooklyn",
      region: "NY",
      postcode: "12345",
      country: "US",
    };
    const { requests } = await invoke("orders.preview", { artwork: "happy-birthday", recipient }, () => jsonResponse({ data: {} }));
    expect(requests[0]!.method).toBe("POST");
    expect(new URL(requests[0]!.url).pathname).toBe("/v2/orders/preview");
    expect(await requests[0]!.json()).toEqual({ artwork: "happy-birthday", recipient });
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
          if (got.get(headerKey) !== value) throw new Error(`${raw.id}: header ${headerKey}=${got.get(headerKey)}!=${value}`);
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
      expect(deepEqual(result, expected), `${raw.id} ${JSON.stringify(result)}`).toBe(true);
    }
  });
});
