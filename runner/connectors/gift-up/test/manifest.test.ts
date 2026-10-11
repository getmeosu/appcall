import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const ORIGIN_OPS = ["healthcheck", "company.get", "gift-cards.list", "gift-cards.get", "orders.list"] as const;

const COMPOSIO_TOOLS: Record<string, string> = {
  GIFT_UP_ADD_ORDER_NOTE: "orders.notes.add",
  GIFT_UP_CREATE_ITEM: "items.create",
  GIFT_UP_CREATE_ITEM_GROUP: "item-groups.create",
  GIFT_UP_CREATE_ORDER: "orders.create",
  GIFT_UP_DELETE_ITEM: "items.delete",
  GIFT_UP_DELETE_ITEM_GROUP: "item-groups.delete",
  GIFT_UP_DELETE_WEBHOOK: "webhooks.delete",
  GIFT_UP_GET_CHECKOUT_SETTINGS: "settings.checkout.get",
  GIFT_UP_GET_COMPANY: "company.get",
  GIFT_UP_GET_EMAIL_SETTINGS: "settings.email.get",
  GIFT_UP_GET_GIFT_CARD: "gift-cards.get",
  GIFT_UP_GET_GIFT_CARD_SETTINGS: "settings.gift-card.get",
  GIFT_UP_GET_ITEM: "items.get",
  GIFT_UP_GET_ORDER: "orders.get",
  GIFT_UP_GET_PING: "ping.get",
  GIFT_UP_GET_REPORT_TRANSACTION: "reports.transactions.get",
  GIFT_UP_GET_SHIPPING_SETTINGS: "settings.shipping.get",
  GIFT_UP_GET_STRIPE_CONNECTION: "integrations.stripe.get",
  GIFT_UP_GET_WEBHOOK: "webhooks.get",
  GIFT_UP_LIST_GIFT_CARD_ARTWORK: "artwork.list",
  GIFT_UP_LIST_GIFT_CARDS: "gift-cards.list",
  GIFT_UP_LIST_ITEM_GROUPS: "item-groups.list",
  GIFT_UP_LIST_ITEMS: "items.list",
  GIFT_UP_LIST_LOCATIONS: "locations.list",
  GIFT_UP_LIST_PROMOTIONS: "promotions.list",
  GIFT_UP_LIST_REPORT_TRANSACTIONS: "reports.transactions.list",
  GIFT_UP_LIST_USERS: "users.list",
  GIFT_UP_LIST_WEBHOOKS: "webhooks.list",
  GIFT_UP_POST_PING: "ping.post",
  GIFT_UP_REACTIVATE_GIFT_CARD: "gift-cards.reactivate",
  GIFT_UP_REDEEM_GIFT_CARD: "gift-cards.redeem",
  GIFT_UP_REDEEM_GIFT_CARD_IN_FULL: "gift-cards.redeem-in-full",
  GIFT_UP_SUBSCRIBE_WEBHOOK: "webhooks.subscribe",
  GIFT_UP_TOP_UP_GIFT_CARD: "gift-cards.top-up",
  GIFT_UP_UNDO_REDEMPTION: "gift-cards.undo-redemption",
  GIFT_UP_UPDATE_EMAIL_SETTINGS: "settings.email.update",
  GIFT_UP_UPDATE_GIFT_CARD: "gift-cards.update",
  GIFT_UP_UPDATE_GIFT_CARD_SETTINGS: "settings.gift-card.update",
  GIFT_UP_UPDATE_ITEM: "items.update",
  GIFT_UP_UPDATE_ITEM_GROUP: "item-groups.update",
  GIFT_UP_UPDATE_ORDER: "orders.update",
  GIFT_UP_UPDATE_STRIPE_CONNECTION: "integrations.stripe.update",
  GIFT_UP_UPLOAD_ARTWORK: "artwork.upload",
  GIFT_UP_VOID_GIFT_CARD: "gift-cards.void",
};

const compiled = compileDeclarativeConnector(manifest as never);

function requestOf(key: string): Record<string, unknown> {
  return operations[key]!.request as Record<string, unknown>;
}

function dummyInput(schema: { properties?: Record<string, any>; required?: string[] }): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const key of schema.required ?? []) {
    const prop = schema.properties?.[key] ?? {};
    if (key === "operations") input[key] = [{ op: "replace", path: "/name", value: "x" }];
    else if (key === "itemDetails") input[key] = [{ name: "Card", backingType: "Currency", price: 10, value: 10 }];
    else if (Array.isArray(prop.enum) && prop.enum.length > 0) input[key] = prop.enum[0];
    else if (prop.type === "integer" || prop.type === "number") input[key] = 1;
    else if (prop.type === "boolean") input[key] = true;
    else if (prop.type === "array") {
      const items = prop.items ?? {};
      input[key] = items.type === "object" ? [{ id: "a" }] : items.enum ? [items.enum[0]] : ["a"];
    } else if (prop.type === "object") input[key] = { id: 1 };
    else input[key] = key === "livePublicKey" ? "pk_live_x" : key === "liveSecretKey" ? "sk_live_x" : "x";
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

describe("gift-up manifest", () => {
  test("has bounded host, origin auth, version, and compiles", () => {
    expect(manifest.key).toBe("gift-up");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.network.allowedHosts).toEqual(["api.giftup.app"]);
    expect(manifest.http.baseUrl).toBe("https://api.giftup.app");
    expect(manifest.http.auth.value).toBe("Bearer {{apiKey}}");
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("keeps the origin five operations", () => {
    for (const key of ORIGIN_OPS) {
      expect(operations[key], key).toBeDefined();
      expect(String(requestOf(key).path).startsWith("/"), key).toBe(true);
    }
    expect(requestOf("healthcheck")).toMatchObject({ method: "GET", path: "/company" });
    expect(requestOf("company.get").path).toBe("/company");
    expect(requestOf("gift-cards.get").path).toBe("/gift-cards/{{code}}");
    expect(requestOf("gift-cards.list").path).toBe("/gift-cards");
    expect(requestOf("orders.list").path).toBe("/orders");
    expect((operations["gift-cards.get"]!.inputSchema as { required: string[] }).required).toEqual(["code"]);
  });

  test("covers every Composio Gift Up tool with a real request", () => {
    expect(Object.keys(COMPOSIO_TOOLS)).toHaveLength(44);
    expect(Object.keys(operations).length).toBe(46);
    for (const [slug, key] of Object.entries(COMPOSIO_TOOLS)) {
      expect(operations[key], slug).toBeDefined();
      expect(requestOf(key), slug).toBeDefined();
      expect(compiled.actions[key], slug).toBeTypeOf("function");
    }
    expect(operations["healthcheck"]).toBeDefined();
    expect(operations["orders.list"]).toBeDefined();
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

  test("puts JSON or JSON Patch Content-Type only on bodies", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as Record<string, unknown>;
      const method = String(request.method);
      const headers = (request.headers as Record<string, string> | undefined) ?? {};
      if (request.body !== undefined) {
        if (method === "PATCH") expect(headers["Content-Type"], key).toBe("application/json-patch+json");
        else expect(headers["Content-Type"], key).toBe("application/json");
      } else {
        expect(headers["Content-Type"], key).toBeUndefined();
      }
      if (method === "GET") expect(request.body, key).toBeUndefined();
    }
  });

  test("maps documented Gift Up paths and Composio aliases", () => {
    expect(requestOf("orders.notes.add").path).toBe("/orders/{{id}}/notes");
    expect(requestOf("items.create").path).toBe("/items");
    expect(requestOf("item-groups.create").path).toBe("/groups");
    expect(requestOf("webhooks.subscribe").path).toBe("/hooks/{{event}}/subscribe");
    expect(requestOf("gift-cards.redeem").path).toBe("/gift-cards/{{code}}/redeem");
    expect(requestOf("gift-cards.redeem-in-full").path).toBe("/gift-cards/{{code}}/redeem-in-full");
    expect(requestOf("gift-cards.top-up").path).toBe("/gift-cards/{{code}}/top-up");
    expect(requestOf("gift-cards.undo-redemption").path).toBe("/gift-cards/{{code}}/undo-redemption");
    expect(requestOf("gift-cards.void").path).toBe("/gift-cards/{{code}}/void");
    expect(requestOf("gift-cards.reactivate").path).toBe("/gift-cards/{{code}}/reactivate");
    expect(requestOf("integrations.stripe.update").path).toBe("/integrations/stripe/connection");
    expect(requestOf("artwork.upload").path).toBe("/settings/gift-card/artwork");
    expect(requestOf("artwork.list").path).toBe("/settings/gift-card/artwork");
    expect(requestOf("ping.get").path).toBe("/ping");
    expect(requestOf("ping.post").path).toBe("/ping");
    expect((requestOf("artwork.upload").body as Record<string, string>).url).toBe("{{Url}}");
    expect(requestOf("gift-cards.update").body).toBe("{{operations}}");
    expect((requestOf("gift-cards.list").query as Record<string, string>).status).toBe("{{status}}");
    expect((requestOf("reports.transactions.list").query as Record<string, string>).events).toBe("{{events}}");
  });

  test("recipe operations equal runner operations", async () => {
    const recipe = await Bun.file(new URL("../../../../scripts/connector-gen/openconnector/recipes/gift_up/recipe.json", import.meta.url)).json();
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(Object.keys(operations).sort());
    expect([...recipe.selection.operations].sort()).toEqual(Object.keys(operations).sort());
    expect(recipe.manifest.version).toBe("0.2.0");
  });
});

describe("gift-up compiled handlers", () => {
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
      const wantsEmpty = Array.isArray(request.success) && request.success.includes(204) && request.result !== undefined;
      const { requests, result } = await invoke(key, input, (req) => {
        if (key === "ping.get") return new Response("pong", { status: 200, headers: { "content-type": "text/plain" } });
        if (wantsEmpty) return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
        if (req.method === "POST" && new URL(req.url).pathname === "/ping") return jsonResponse({ ok: true });
        return jsonResponse({ id: "ok" });
      });
      expect(requests, key).toHaveLength(1);
      expect(requests[0]!.method, key).toBe(request.method);
      expect(new URL(requests[0]!.url).hostname, key).toBe("api.giftup.app");
      expect(requests[0]!.headers.get("authorization"), key).toBe("Bearer dummy");
      expect(requests[0]!.headers.get("accept"), key).toBe("application/json");
      expect(result).toMatchObject({ connector: "gift-up", action: key, source: "provider" });
    }
  });

  test("origin healthcheck still probes GET /company", async () => {
    const { requests } = await invoke("healthcheck", {}, () => jsonResponse({ id: "co", name: "Juicy Joes" }));
    expect(new URL(requests[0]!.url).pathname).toBe("/company");
    expect(requests[0]!.method).toBe("GET");
  });

  test("artwork.upload maps Url to url", async () => {
    const { requests } = await invoke("artwork.upload", { Url: "https://cdn.example.com/card.png" }, () => jsonResponse({}, 200));
    expect(requests[0]!.method).toBe("POST");
    expect(new URL(requests[0]!.url).pathname).toBe("/settings/gift-card/artwork");
    expect(await requests[0]!.json()).toEqual({ url: "https://cdn.example.com/card.png" });
  });

  test("gift-cards.update sends JSON Patch", async () => {
    const operationsBody = [{ op: "replace", path: "/title", value: "Steak" }];
    const { requests } = await invoke("gift-cards.update", { code: "ABC123", operations: operationsBody }, () => jsonResponse({ code: "ABC123" }));
    expect(requests[0]!.method).toBe("PATCH");
    expect(requests[0]!.headers.get("content-type")).toBe("application/json-patch+json");
    expect(new URL(requests[0]!.url).pathname).toBe("/gift-cards/ABC123");
    expect(await requests[0]!.json()).toEqual(operationsBody);
  });

  test("items.delete returns the static envelope", async () => {
    const { requests, result } = await invoke("items.delete", { id: "3fa85f64-5717-4562-b3fc-2c963f66afa6" }, () => new Response("", { status: 204 }));
    expect(requests[0]!.method).toBe("DELETE");
    expect(new URL(requests[0]!.url).pathname).toBe("/items/3fa85f64-5717-4562-b3fc-2c963f66afa6");
    expect(result).toEqual({ connector: "gift-up", action: "items.delete", source: "provider", success: true });
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
