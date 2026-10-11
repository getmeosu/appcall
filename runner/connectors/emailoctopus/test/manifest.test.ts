import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import COMPOSIO_TOOLS from "./composio-cover.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const ORIGIN_OPS = ["healthcheck", "lists.list"] as const;
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
      else if (items.type === "object") input[key] = [dummyInput(items)];
      else input[key] = ["x"];
    } else if (prop.type === "object") input[key] = { id: 1 };
    else input[key] = "x".repeat(Math.max(1, Number(prop.minLength ?? 1)));
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

describe("emailoctopus manifest", () => {
  test("has bounded v2 host, bearer auth, version, and compiles", () => {
    expect(manifest.key).toBe("emailoctopus");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.categories).toEqual(["email-marketing"]);
    expect(manifest.network.allowedHosts).toEqual(["api.emailoctopus.com"]);
    expect(manifest.http.baseUrl).toBe("https://api.emailoctopus.com");
    expect(manifest.http.auth.field).toBe("apiKey");
    expect(manifest.http.auth.in).toBe("header");
    expect(manifest.http.auth.value).toBe("Bearer {{apiKey}}");
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("keeps the origin two operations", () => {
    for (const key of ORIGIN_OPS) {
      expect(operations[key], key).toBeDefined();
      expect(requestOf(key), key).toBeDefined();
    }
    expect(requestOf("healthcheck")).toMatchObject({ method: "GET", path: "/lists" });
    expect(requestOf("healthcheck").query).toEqual({ limit: "1" });
    expect(requestOf("lists.list")).toMatchObject({ method: "GET", path: "/lists" });
    expect((requestOf("lists.list").query as Record<string, string>).starting_after).toBe("{{starting_after}}");
    expect((requestOf("lists.list").query as Record<string, string>).page).toBeUndefined();
  });

  test("covers every Composio EmailOctopus tool with a real request", () => {
    expect(Object.keys(COMPOSIO_TOOLS)).toHaveLength(20);
    expect(Object.keys(operations).length).toBe(21);
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

  test("maps documented EmailOctopus v2 paths and Composio aliases", () => {
    expect(requestOf("lists.get").path).toBe("/lists/{{list_id}}");
    expect(requestOf("lists.create")).toMatchObject({ method: "POST", path: "/lists" });
    expect(requestOf("lists.update")).toMatchObject({ method: "PUT", path: "/lists/{{list_id}}" });
    expect(requestOf("lists.delete")).toMatchObject({ method: "DELETE", path: "/lists/{{list_id}}" });
    expect(requestOf("contacts.list").path).toBe("/lists/{{list_id}}/contacts");
    expect((requestOf("contacts.list").query as Record<string, string>)["created_at.gte"]).toBe("{{created_at_gte}}");
    expect((requestOf("contacts.list").query as Record<string, string>)["last_updated_at.lte"]).toBe("{{last_updated_at_lte}}");
    expect(requestOf("contacts.get").path).toBe("/lists/{{list_id}}/contacts/{{contact_id}}");
    expect(requestOf("contacts.create")).toMatchObject({ method: "POST", path: "/lists/{{list_id}}/contacts" });
    expect(requestOf("contacts.upsert")).toMatchObject({ method: "PUT", path: "/lists/{{list_id}}/contacts" });
    expect(requestOf("contacts.unsubscribe")).toMatchObject({ method: "PUT", path: "/lists/{{list_id}}/contacts/{{contact_id}}" });
    expect(requestOf("contacts.unsubscribe").body).toEqual({ status: "unsubscribed" });
    expect(requestOf("contacts.delete").path).toBe("/lists/{{list_id}}/contacts/{{contact_id}}");
    expect(requestOf("contacts.batch").path).toBe("/lists/{{list_id}}/contacts/batch");
    expect(requestOf("fields.create").path).toBe("/lists/{{list_id}}/fields");
    expect(requestOf("fields.update").path).toBe("/lists/{{list_id}}/fields/{{current_tag}}");
    expect(requestOf("fields.delete").path).toBe("/lists/{{list_id}}/fields/{{tag}}");
    expect(requestOf("tags.list").path).toBe("/lists/{{list_id}}/tags");
    expect(requestOf("tags.create").path).toBe("/lists/{{list_id}}/tags");
    expect(requestOf("tags.update").path).toBe("/lists/{{list_id}}/tags/{{tag}}");
    expect(requestOf("tags.update").body).toEqual({ tag: "{{new_tag}}" });
    expect(requestOf("tags.delete").path).toBe("/lists/{{list_id}}/tags/{{tag}}");
    expect(requestOf("campaigns.list").path).toBe("/campaigns");
  });

  test("recipe operations equal runner operations", async () => {
    const recipe = await Bun.file(new URL("../../../../scripts/connector-gen/openconnector/recipes/emailoctopus/recipe.json", import.meta.url)).json();
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(Object.keys(operations).sort());
    expect([...recipe.selection.operations].sort()).toEqual(Object.keys(operations).sort());
    expect(recipe.manifest.version).toBe("0.2.0");
    expect(recipe.manifest.http.baseUrl).toBe("https://api.emailoctopus.com");
  });
});

describe("emailoctopus compiled handlers", () => {
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
    return { id: 1 };
  }

  test("every operation dispatches a real HTTP request for required input", async () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as { method: string; path: string; success?: number[]; result?: unknown };
      const input = dummyInput(operation.inputSchema as { properties?: Record<string, any>; required?: string[] });
      const status = request.success?.[0] ?? 200;
      const respond = () =>
        status === 204 ? new Response(null, { status }) : jsonResponse(dummyResponse(operation), status);
      const { requests, result } = await invoke(key, input, respond);
      expect(requests, key).toHaveLength(1);
      expect(requests[0]!.method, key).toBe(request.method);
      expect(new URL(requests[0]!.url).hostname, key).toBe("api.emailoctopus.com");
      expect(requests[0]!.headers.get("authorization"), key).toBe("Bearer dummy");
      expect(requests[0]!.headers.get("accept"), key).toBe("application/json");
      expect(result).toMatchObject({ connector: "emailoctopus", action: key, source: "provider" });
    }
  });

  test("origin healthcheck still probes GET /lists?limit=1", async () => {
    const { requests } = await invoke("healthcheck", {}, () => jsonResponse({ data: [] }));
    expect(requests[0]!.method).toBe("GET");
    expect(requests[0]!.url).toBe("https://api.emailoctopus.com/lists?limit=1");
  });

  test("optional query params are omitted when unset and remapped when set", async () => {
    const bare = await invoke("contacts.list", { list_id: "list-1" }, () => jsonResponse({ data: [] }));
    expect(bare.requests[0]!.url).toBe("https://api.emailoctopus.com/lists/list-1/contacts");
    const filtered = await invoke(
      "contacts.list",
      {
        list_id: "list-1",
        limit: 10,
        tag: "vip",
        status: "subscribed",
        created_at_gte: "2024-01-19T12:14:28Z",
        last_updated_at_lte: "2024-02-01T00:00:00Z",
        starting_after: "cursor",
      },
      () => jsonResponse({ data: [] }),
    );
    const url = new URL(filtered.requests[0]!.url);
    expect(url.searchParams.get("limit")).toBe("10");
    expect(url.searchParams.get("tag")).toBe("vip");
    expect(url.searchParams.get("status")).toBe("subscribed");
    expect(url.searchParams.get("created_at.gte")).toBe("2024-01-19T12:14:28Z");
    expect(url.searchParams.get("last_updated_at.lte")).toBe("2024-02-01T00:00:00Z");
    expect(url.searchParams.get("starting_after")).toBe("cursor");
    expect(url.searchParams.has("created_at_gte")).toBe(false);
  });

  test("unsubscribe sends hardcoded unsubscribed status", async () => {
    const { requests } = await invoke(
      "contacts.unsubscribe",
      { list_id: "list-1", contact_id: "c1" },
      () => jsonResponse({ id: "c1", status: "unsubscribed" }),
    );
    expect(requests[0]!.method).toBe("PUT");
    expect(new URL(requests[0]!.url).pathname).toBe("/lists/list-1/contacts/c1");
    expect(await requests[0]!.json()).toEqual({ status: "unsubscribed" });
  });

  test("tags.update maps new_tag onto tag", async () => {
    const { requests } = await invoke(
      "tags.update",
      { list_id: "list-1", tag: "vip", new_tag: "priority" },
      () => jsonResponse({ tag: "priority" }),
    );
    expect(new URL(requests[0]!.url).pathname).toBe("/lists/list-1/tags/vip");
    expect(await requests[0]!.json()).toEqual({ tag: "priority" });
  });

  test("fields.update uses current_tag in the path", async () => {
    const { requests } = await invoke(
      "fields.update",
      { list_id: "list-1", current_tag: "Hometown", label: "City", tag: "City", type: "text" },
      () => jsonResponse({ tag: "City" }),
    );
    expect(requests[0]!.method).toBe("PUT");
    expect(new URL(requests[0]!.url).pathname).toBe("/lists/list-1/fields/Hometown");
    expect(await requests[0]!.json()).toEqual({ label: "City", tag: "City", type: "text" });
  });

  test("204 deletes return a deleted envelope", async () => {
    const { requests, result } = await invoke(
      "contacts.delete",
      { list_id: "list-1", contact_id: "c1" },
      () => new Response(null, { status: 204 }),
    );
    expect(requests[0]!.method).toBe("DELETE");
    expect(result).toEqual({
      connector: "emailoctopus",
      action: "contacts.delete",
      source: "provider",
      data: { deleted: true },
    });
  });

  test("maps 401 and 429", async () => {
    await expect(invoke("healthcheck", {}, () => jsonResponse({ detail: "Invalid key." }, 401))).rejects.toMatchObject({
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
