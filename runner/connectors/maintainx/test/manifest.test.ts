import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const ORIGIN_OPS = ["healthcheck", "locations.get", "locations.list", "users.list", "work-orders.list"] as const;

const COMPOSIO_TOOLS: Record<string, string> = {
  MAINTAINX_CREATE_CATEGORY: "categories.create",
  MAINTAINX_CREATE_LOCATION: "locations.create",
  MAINTAINX_CREATE_PROCEDURE_TEMPLATE: "procedure-templates.create",
  MAINTAINX_CREATE_WORK_ORDER: "work-orders.create",
  MAINTAINX_CREATE_WORK_ORDER_COMMENT: "work-orders.comments.create",
  MAINTAINX_CREATE_WORK_REQUEST: "work-requests.create",
  MAINTAINX_CREATE_WORK_REQUEST_PORTAL: "work-request-portals.create",
  MAINTAINX_DELETE_ASSETS: "assets.delete",
  MAINTAINX_DELETE_CATEGORY: "categories.delete",
  MAINTAINX_FIND_ENTITY: "entities.find",
  MAINTAINX_GET_CATEGORY: "categories.get",
  MAINTAINX_GET_LOCATION: "locations.get",
  MAINTAINX_GET_USER: "users.get",
  MAINTAINX_GET_VENDOR: "vendors.get",
  MAINTAINX_GET_WORKORDERS_COSTS: "work-orders.costs.get",
  MAINTAINX_LIST_ASSET_CRITICALITIES: "asset-criticalities.list",
  MAINTAINX_LIST_ASSETS: "assets.list",
  MAINTAINX_LIST_CATEGORIES: "categories.list",
  MAINTAINX_LIST_LOCATIONS: "locations.list",
  MAINTAINX_LIST_METERS: "meters.list",
  MAINTAINX_LIST_PARTS: "parts.list",
  MAINTAINX_LIST_PROCEDURE_TEMPLATES: "procedure-templates.list",
  MAINTAINX_LIST_TEAMS: "teams.list",
  MAINTAINX_LIST_WORK_ORDERS: "work-orders.list",
  MAINTAINX_LIST_WORK_REQUEST_PORTALS: "work-request-portals.list",
  MAINTAINX_LIST_WORK_REQUESTS: "work-requests.list",
  MAINTAINX_UPDATE_VENDORS_ATTACHMENT: "vendors.attachments.update",
  MAINTAINX_UPDATE_WORK_ORDER: "work-orders.update",
  MAINTAINX_UPDATE_WORK_ORDER_STATUS: "work-orders.status.update",
  MAINTAINX_UPDATE_WORK_REQUEST_PORTAL: "work-request-portals.update",
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
    else if (prop.type === "array") {
      const items = prop.items ?? {};
      input[key] = items.type === "object" ? [{ type: "USER", id: 1 }] : items.enum ? [items.enum[0]] : ["a"];
    } else if (prop.type === "object") input[key] = { id: 1 };
    else input[key] = key === "filename" ? "invoice.pdf" : "x";
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

describe("maintainx manifest", () => {
  test("has bounded host, origin auth, version, and compiles", () => {
    expect(manifest.key).toBe("maintainx");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.network.allowedHosts).toEqual(["api.getmaintainx.com"]);
    expect(manifest.http.baseUrl).toBe("https://api.getmaintainx.com/v1");
    expect(manifest.http.auth.value).toBe("Bearer {{apiKey}}");
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("keeps the origin five operations", () => {
    for (const key of ORIGIN_OPS) {
      expect(operations[key], key).toBeDefined();
      expect(String(requestOf(key).path).startsWith("/"), key).toBe(true);
    }
    expect(requestOf("healthcheck")).toMatchObject({ method: "GET", path: "/locations" });
    expect(requestOf("locations.get").path).toBe("/locations/{{id}}");
    expect(requestOf("locations.list").path).toBe("/locations");
    expect(requestOf("users.list").path).toBe("/users");
    expect(requestOf("work-orders.list").path).toBe("/workorders");
    expect((operations["locations.get"]!.inputSchema as { required: string[] }).required).toEqual(["id"]);
  });

  test("covers every Composio MaintainX tool with a real request", () => {
    expect(Object.keys(COMPOSIO_TOOLS)).toHaveLength(30);
    expect(Object.keys(operations).length).toBe(32);
    for (const [slug, key] of Object.entries(COMPOSIO_TOOLS)) {
      expect(operations[key], slug).toBeDefined();
      expect(requestOf(key), slug).toBeDefined();
      expect(compiled.actions[key], slug).toBeTypeOf("function");
    }
    expect(operations["healthcheck"]).toBeDefined();
    expect(operations["users.list"]).toBeDefined();
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

  test("puts JSON or octet-stream Content-Type only on bodies", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as Record<string, unknown>;
      const method = String(request.method);
      const headers = (request.headers as Record<string, string> | undefined) ?? {};
      if (request.body !== undefined) {
        if (request.bodyEncoding === "raw") expect(headers["Content-Type"], key).toBe("application/octet-stream");
        else expect(headers["Content-Type"], key).toBe("application/json");
      } else {
        expect(headers["Content-Type"], key).toBeUndefined();
      }
      if (method === "GET") expect(request.body, key).toBeUndefined();
    }
  });

  test("maps documented MaintainX paths and Composio aliases", () => {
    expect(requestOf("categories.create").path).toBe("/categories");
    expect(requestOf("locations.create").path).toBe("/locations");
    expect(requestOf("procedure-templates.create").path).toBe("/proceduretemplates");
    expect(requestOf("work-orders.create").path).toBe("/workorders");
    expect(requestOf("work-orders.comments.create").path).toBe("/workorders/{{work_order_id}}/comments");
    expect(requestOf("work-requests.create").path).toBe("/workrequests");
    expect(requestOf("work-request-portals.create").path).toBe("/workrequestportals");
    expect(requestOf("assets.delete").path).toBe("/assets/{{id}}");
    expect(requestOf("categories.delete").path).toBe("/categories/{{id}}");
    expect(requestOf("entities.find").path).toBe("/{{entity_type}}");
    expect(requestOf("categories.get").path).toBe("/categories/{{id}}");
    expect(requestOf("users.get").path).toBe("/users/{{id}}");
    expect(requestOf("vendors.get").path).toBe("/vendors/{{id}}");
    expect(requestOf("work-orders.costs.get").path).toBe("/workorders/{{id}}/costs");
    expect(requestOf("asset-criticalities.list").path).toBe("/assetcriticalities");
    expect(requestOf("assets.list").path).toBe("/assets");
    expect(requestOf("meters.list").path).toBe("/meters");
    expect(requestOf("parts.list").path).toBe("/parts");
    expect(requestOf("procedure-templates.list").path).toBe("/proceduretemplates");
    expect(requestOf("teams.list").path).toBe("/teams");
    expect(requestOf("work-request-portals.list").path).toBe("/workrequestportals");
    expect(requestOf("work-requests.list").path).toBe("/workrequests");
    expect(requestOf("vendors.attachments.update").path).toBe("/vendors/{{id}}/attachments/{{filename}}");
    expect(requestOf("work-orders.update").path).toBe("/workorders/{{workorder_id}}");
    expect(requestOf("work-orders.status.update").path).toBe("/workorders/{{workorder_id}}/status");
    expect(requestOf("work-request-portals.update").path).toBe("/workrequestportals/{{id}}");
    expect((requestOf("work-orders.create").body as Record<string, string>).assetId).toBe("{{asset_id}}");
    expect((requestOf("work-orders.list").query as Record<string, string>).notAssets).toBe("{{not_assets}}");
    expect((requestOf("assets.list").query as Record<string, string>).locationId).toBe("{{location_id}}");
    expect((requestOf("meters.list").query as Record<string, string>).measurementType).toBe("{{measurement_type}}");
    expect(requestOf("vendors.attachments.update").bodyEncoding).toBe("raw");
  });

  test("recipe operations equal runner operations", async () => {
    const recipe = await Bun.file(new URL("../../../../scripts/connector-gen/openconnector/recipes/maintainx/recipe.json", import.meta.url)).json();
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(Object.keys(operations).sort());
    expect([...recipe.selection.operations].sort()).toEqual(Object.keys(operations).sort());
    expect(recipe.manifest.version).toBe("0.2.0");
  });
});

describe("maintainx compiled handlers", () => {
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
      const { requests, result } = await invoke(key, input, () => {
        if (wantsEmpty) return new Response(null, { status: 204 });
        return jsonResponse({ id: "ok" });
      });
      expect(requests, key).toHaveLength(1);
      expect(requests[0]!.method, key).toBe(request.method);
      expect(new URL(requests[0]!.url).hostname, key).toBe("api.getmaintainx.com");
      expect(requests[0]!.headers.get("authorization"), key).toBe("Bearer dummy");
      expect(requests[0]!.headers.get("accept"), key).toBe("application/json");
      expect(result).toMatchObject({ connector: "maintainx", action: key, source: "provider" });
    }
  });

  test("origin healthcheck still probes GET /locations?limit=1", async () => {
    const { requests } = await invoke("healthcheck", {}, () => jsonResponse({ locations: [] }));
    expect(new URL(requests[0]!.url).pathname).toBe("/v1/locations");
    expect(new URL(requests[0]!.url).searchParams.get("limit")).toBe("1");
    expect(requests[0]!.method).toBe("GET");
  });

  test("work-orders.create maps Composio snake_case onto official camelCase", async () => {
    const { requests } = await invoke(
      "work-orders.create",
      { title: "Audit", asset_id: 42, location_id: 852, due_date: "2024-03-15T14:30:00Z" },
      () => jsonResponse({ id: 1 }),
    );
    expect(requests[0]!.method).toBe("POST");
    expect(new URL(requests[0]!.url).pathname).toBe("/v1/workorders");
    expect(await requests[0]!.json()).toEqual({
      title: "Audit",
      assetId: 42,
      locationId: 852,
      dueDate: "2024-03-15T14:30:00Z",
    });
  });

  test("entities.find dispatches GET /{entity_type}", async () => {
    const { requests } = await invoke("entities.find", { entity_type: "assets", limit: 5 }, () => jsonResponse({ assets: [] }));
    expect(requests[0]!.method).toBe("GET");
    expect(new URL(requests[0]!.url).pathname).toBe("/v1/assets");
    expect(new URL(requests[0]!.url).searchParams.get("limit")).toBe("5");
  });

  test("assets.delete returns the static envelope", async () => {
    const { requests, result } = await invoke("assets.delete", { id: 42 }, () => new Response(null, { status: 204 }));
    expect(requests[0]!.method).toBe("DELETE");
    expect(new URL(requests[0]!.url).pathname).toBe("/v1/assets/42");
    expect(result).toEqual({ connector: "maintainx", action: "assets.delete", source: "provider", success: true });
  });

  test("vendors.attachments.update sends a raw octet-stream body", async () => {
    const { requests } = await invoke(
      "vendors.attachments.update",
      { id: 3001, filename: "invoice.pdf", file: "JVBERi0x" },
      () => jsonResponse({ id: 88 }, 201),
    );
    expect(requests[0]!.method).toBe("PUT");
    expect(new URL(requests[0]!.url).pathname).toBe("/v1/vendors/3001/attachments/invoice.pdf");
    expect(requests[0]!.headers.get("content-type")).toBe("application/octet-stream");
    expect(await requests[0]!.text()).toBe("JVBERi0x");
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
