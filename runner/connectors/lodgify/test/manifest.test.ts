import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const ORIGIN_OPS = ["healthcheck", "properties.list", "properties.get", "rooms.list", "bookings.list", "bookings.get"] as const;

const COMPOSIO_TOOLS: Record<string, string> = {
  LODGIFY_CREATE_CALLMEBACK_REQUEST: "enquiries.callmeback.create",
  LODGIFY_CREATE_ENQUIRY: "enquiries.create",
  LODGIFY_DECLINE_ENQUIRY: "enquiries.decline",
  LODGIFY_DELETE_ENQUIRY: "enquiries.delete",
  LODGIFY_DELETE_RESERVATIONS: "reservations.delete",
  LODGIFY_GET_COUNTRIES: "countries.list",
  LODGIFY_GET_COUNTRY_BY_CODE: "countries.get",
  LODGIFY_GET_CURRENCY_BY_CODE: "currencies.get",
  LODGIFY_GET_DELETED_PROPERTIES: "properties.deleted.list",
  LODGIFY_GET_EXTERNAL_BOOKINGS: "bookings.external.list",
  LODGIFY_GET_MESSAGING_THREAD: "messaging.threads.get",
  LODGIFY_GET_PROPERTY_AVAILABILITY: "availability.property.get",
  LODGIFY_GET_ROOMTYPE_AVAILABILITY: "availability.room-type.get",
  LODGIFY_GET_UNREAD_COUNT: "reservations.unread.get",
  LODGIFY_GET_V1_AVAILABILITY: "availability.v1.list",
  LODGIFY_LIST_CURRENCIES: "currencies.list",
  LODGIFY_LIST_PROPERTIES: "properties.list",
  LODGIFY_LIST_RESERVATIONS: "reservations.list",
  LODGIFY_LIST_WEBHOOKS: "webhooks.list",
  LODGIFY_MARK_RESERVATIONS_NOT_REPLIED: "reservations.mark-not-replied",
  LODGIFY_MARK_RESERVATIONS_REPLIED: "reservations.mark-replied",
  LODGIFY_RECOVER_ENQUIRY: "enquiries.recover",
  LODGIFY_REOPEN_ENQUIRY: "enquiries.reopen",
  LODGIFY_SET_AVAILABILITY: "availability.set",
  LODGIFY_SUBSCRIBE_WEBHOOK: "webhooks.subscribe",
  LODGIFY_UNSUBSCRIBE_WEBHOOK: "webhooks.unsubscribe",
};

const CHANNEL_HOLES = [
  "LODGIFY_LIST_CHANNELS",
  "LODGIFY_LIST_CHANNEL_CONNECTIONS",
  "LODGIFY_LIST_CHANNEL_MAPPINGS",
  "LODGIFY_LIST_CHANNEL_RESERVATIONS",
] as const;

const compiled = compileDeclarativeConnector(manifest as never);

function requestOf(key: string): Record<string, unknown> {
  return operations[key]!.request as Record<string, unknown>;
}

function dummyInput(schema: { properties?: Record<string, any>; required?: string[] }): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const key of schema.required ?? []) {
    const prop = schema.properties?.[key] ?? {};
    if (key === "guest_breakdown") input[key] = { adults: 1 };
    else if (key === "items" || key === "reservations") input[key] = [{ id: 1, type: "Booking" }];
    else if (Array.isArray(prop.enum) && prop.enum.length > 0) input[key] = prop.enum[0];
    else if (prop.type === "integer" || prop.type === "number") input[key] = 1;
    else if (prop.type === "boolean") input[key] = true;
    else if (prop.type === "array") {
      const items = prop.items ?? {};
      input[key] = items.type === "object" ? [{ id: 1 }] : items.enum ? [items.enum[0]] : ["a"];
    } else if (prop.type === "object") input[key] = { id: 1 };
    else input[key] = key === "target_url" ? "https://example.com/hook" : "x";
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

describe("lodgify manifest", () => {
  test("has bounded host, origin auth, version, and compiles", () => {
    expect(manifest.key).toBe("lodgify");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.network.allowedHosts).toEqual(["api.lodgify.com"]);
    expect(manifest.http.baseUrl).toBe("https://api.lodgify.com");
    expect(manifest.http.auth.name).toBe("X-ApiKey");
    expect(manifest.http.auth.value).toBe("{{apiKey}}");
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("keeps the origin six operations", () => {
    for (const key of ORIGIN_OPS) {
      expect(operations[key], key).toBeDefined();
      expect(String(requestOf(key).path).startsWith("/"), key).toBe(true);
    }
    expect(requestOf("healthcheck")).toMatchObject({ method: "GET", path: "/v2/properties" });
    expect(requestOf("properties.list").path).toBe("/v2/properties");
    expect(requestOf("properties.get").path).toBe("/v2/properties/{{propertyId}}");
    expect(requestOf("rooms.list").path).toBe("/v2/properties/{{propertyId}}/rooms");
    expect(requestOf("bookings.list").path).toBe("/v2/reservations/bookings");
    expect(requestOf("bookings.get").path).toBe("/v2/reservations/bookings/{{bookingId}}");
    expect((operations["properties.list"]!.inputSchema as { properties: { size: { maximum: number } } }).properties.size.maximum).toBe(50);
  });

  test("covers documented Composio Lodgify HTTP tools with a real request", () => {
    expect(Object.keys(COMPOSIO_TOOLS)).toHaveLength(26);
    expect(Object.keys(operations).length).toBe(31);
    for (const [slug, key] of Object.entries(COMPOSIO_TOOLS)) {
      expect(operations[key], slug).toBeDefined();
      expect(requestOf(key), slug).toBeDefined();
      expect(compiled.actions[key], slug).toBeTypeOf("function");
    }
    expect(operations["healthcheck"]).toBeDefined();
    expect(operations["bookings.list"]).toBeDefined();
    expect(operations["channels.list"]).toBeUndefined();
    expect(CHANNEL_HOLES).toHaveLength(4);
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

  test("maps documented Lodgify paths and Composio aliases", () => {
    expect(requestOf("enquiries.create").path).toBe("/v1/reservation/enquiry");
    expect(requestOf("enquiries.callmeback.create").path).toBe("/v1/reservation/callmeback");
    expect(requestOf("enquiries.decline").path).toBe("/v1/reservation/enquiry/{{id}}/decline");
    expect(requestOf("enquiries.delete").path).toBe("/v1/reservation/enquiry/{{id}}");
    expect(requestOf("reservations.delete").path).toBe("/v1/reservation/delete");
    expect(requestOf("reservations.list").path).toBe("/v1/reservation");
    expect(requestOf("reservations.unread.get").path).toBe("/v1/reservation/not_read");
    expect(requestOf("availability.property.get").path).toBe("/v2/availability/{{propertyId}}");
    expect((requestOf("availability.property.get").query as Record<string, string>).start).toBe("{{periodStart}}");
    expect((requestOf("availability.property.get").query as Record<string, string>).end).toBe("{{periodEnd}}");
    expect(requestOf("availability.room-type.get").path).toBe("/v2/availability/{{propertyId}}/{{roomTypeId}}");
    expect(requestOf("availability.v1.list").path).toBe("/v1/availability");
    expect(requestOf("availability.set").path).toBe("/v1/availability/{{property_id}}/{{room_type_id}}/set");
    expect(requestOf("webhooks.list").path).toBe("/webhooks/v1/list");
    expect(requestOf("webhooks.subscribe").path).toBe("/webhooks/v1/subscribe");
    expect(requestOf("webhooks.unsubscribe").path).toBe("/webhooks/v1/unsubscribe");
    expect(requestOf("reservations.delete").body).toBe("{{reservations}}");
    expect(requestOf("reservations.mark-replied").body).toBe("{{items}}");
    expect(requestOf("webhooks.list").method).toBe("GET");
    expect(operations["webhooks.list"]!.sideEffect).toBe("read");
    expect(operations["webhooks.subscribe"]!.sideEffect).toBe("write");
    expect(operations["webhooks.unsubscribe"]!.kind).toBe("action");
  });

  test("recipe operations equal runner operations", async () => {
    const recipe = await Bun.file(new URL("../../../../scripts/connector-gen/openconnector/recipes/lodgify/recipe.json", import.meta.url)).json();
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(Object.keys(operations).sort());
    expect([...recipe.selection.operations].sort()).toEqual(Object.keys(operations).sort());
    expect(recipe.manifest.version).toBe("0.2.0");
  });
});

describe("lodgify compiled handlers", () => {
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
      const dataType = (operation.outputSchema as { properties?: { data?: { type?: string } } })?.properties?.data?.type;
      const { requests, result } = await invoke(key, input, () => {
        if (wantsEmpty) return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
        if (dataType === "array") return jsonResponse([]);
        return jsonResponse({ id: "ok" });
      });
      expect(requests, key).toHaveLength(1);
      expect(requests[0]!.method, key).toBe(request.method);
      expect(new URL(requests[0]!.url).hostname, key).toBe("api.lodgify.com");
      expect(requests[0]!.headers.get("x-apikey"), key).toBe("dummy");
      expect(requests[0]!.headers.get("accept"), key).toBe("application/json");
      expect(result).toMatchObject({ connector: "lodgify", action: key, source: "provider" });
    }
  });

  test("origin healthcheck still probes GET /v2/properties", async () => {
    const { requests } = await invoke("healthcheck", {}, () => jsonResponse({ count: 1, items: [] }));
    const url = new URL(requests[0]!.url);
    expect(url.pathname).toBe("/v2/properties");
    expect(url.searchParams.get("page")).toBe("1");
    expect(url.searchParams.get("size")).toBe("1");
    expect(url.searchParams.get("includeCount")).toBe("true");
    expect(requests[0]!.method).toBe("GET");
  });

  test("availability.property.get maps periodStart/periodEnd to start/end", async () => {
    const { requests } = await invoke(
      "availability.property.get",
      { propertyId: 409490, periodStart: "2026-06-01", periodEnd: "2026-06-30", includeDetails: true },
      () => jsonResponse([]),
    );
    const url = new URL(requests[0]!.url);
    expect(requests[0]!.method).toBe("GET");
    expect(url.pathname).toBe("/v2/availability/409490");
    expect(url.searchParams.get("start")).toBe("2026-06-01");
    expect(url.searchParams.get("end")).toBe("2026-06-30");
    expect(url.searchParams.get("includeDetails")).toBe("true");
  });

  test("reservations.delete posts a JSON array", async () => {
    const items = [{ id: 88001, type: "Booking" }];
    const { requests, result } = await invoke("reservations.delete", { reservations: items }, () => jsonResponse({}));
    expect(requests[0]!.method).toBe("POST");
    expect(new URL(requests[0]!.url).pathname).toBe("/v1/reservation/delete");
    expect(await requests[0]!.json()).toEqual(items);
    expect(result).toEqual({ connector: "lodgify", action: "reservations.delete", source: "provider", success: true });
  });

  test("webhooks.unsubscribe deletes with a JSON body", async () => {
    const { requests, result } = await invoke("webhooks.unsubscribe", { id: "wh_123" }, () => jsonResponse({}));
    expect(requests[0]!.method).toBe("DELETE");
    expect(new URL(requests[0]!.url).pathname).toBe("/webhooks/v1/unsubscribe");
    expect(requests[0]!.headers.get("content-type")).toBe("application/json");
    expect(await requests[0]!.json()).toEqual({ id: "wh_123" });
    expect(result).toEqual({ connector: "lodgify", action: "webhooks.unsubscribe", source: "provider", success: true });
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
