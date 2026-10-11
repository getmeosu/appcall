import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import { senderWriteHandlers } from "../src/writes";
import COMPOSIO_TOOLS from "./composio-cover.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const ORIGIN_OPS = ["healthcheck", "groups.list", "groups.get", "subscribers.list", "campaigns.list"] as const;
const HANDWRITTEN = new Set(Object.keys(senderWriteHandlers));
const compiled = compileDeclarativeConnector(manifest as never);
const actions = { ...compiled.actions, ...senderWriteHandlers };

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
    else input[key] = key.includes("email") ? "ada@example.com" : "x";
  }
  return input;
}

describe("sender manifest", () => {
  test("has bounded host, origin auth, version, and compiles", () => {
    expect(manifest.key).toBe("sender");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.categories).toEqual(["email-marketing"]);
    expect(manifest.network.allowedHosts).toEqual(["api.sender.net"]);
    expect(manifest.http.baseUrl).toBe("https://api.sender.net/v2");
    expect(manifest.http.auth.field).toBe("apiKey");
    expect(manifest.http.auth.value).toBe("Bearer {{apiKey}}");
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    expect(manifest.http.errors.bodyErrorPaths).toEqual(["message"]);
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("keeps the origin five operations", () => {
    for (const key of ORIGIN_OPS) {
      expect(operations[key], key).toBeDefined();
      expect(requestOf(key), key).toBeDefined();
    }
    expect(requestOf("healthcheck")).toMatchObject({ method: "GET", path: "/groups" });
    expect((requestOf("healthcheck").query as Record<string, string>).limit).toBe("1");
    expect(requestOf("groups.list").path).toBe("/groups");
    expect(requestOf("groups.get").path).toBe("/groups/{{id}}");
    expect(requestOf("subscribers.list").path).toBe("/subscribers");
    expect(requestOf("campaigns.list").path).toBe("/campaigns");
    expect((operations["groups.get"]!.inputSchema as { required: string[] }).required).toEqual(["id"]);
  });

  test("covers every Composio Sender tool with a real request", () => {
    expect(Object.keys(COMPOSIO_TOOLS)).toHaveLength(8);
    expect(Object.keys(operations).length).toBe(20);
    for (const [slug, key] of Object.entries(COMPOSIO_TOOLS)) {
      expect(operations[key], slug).toBeDefined();
      expect(requestOf(key), slug).toBeDefined();
      expect(actions[key], slug).toBeTypeOf("function");
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
      if (method === "GET") expect(request.body, key).toBeUndefined();
    }
  });

  test("maps official Sender v2 paths and Composio aliases", () => {
    expect(requestOf("fields.list").path).toBe("/fields");
    expect(requestOf("fields.create").path).toBe("/fields");
    expect(requestOf("fields.create").method).toBe("POST");
    expect((requestOf("fields.create").body as Record<string, string>).title).toBe("{{title}}");
    expect((requestOf("fields.create").body as Record<string, string>).type).toBe("{{type}}");
    expect((operations["fields.create"]!.inputSchema as { properties: { type: { enum: string[] } } }).properties.type.enum).toEqual([
      "number",
      "text",
      "datetime",
    ]);
    expect(requestOf("workflows.list").path).toBe("/workflows");
    expect(requestOf("campaigns.get").path).toBe("/campaigns/{{campaign_id}}");
    expect(requestOf("subscribers.get").path).toBe("/subscribers/{{subscriber_id}}");
    expect(requestOf("subscribers.create").path).toBe("/subscribers");
    expect(requestOf("subscribers.create").method).toBe("POST");
    expect(requestOf("subscribers.update").path).toBe("/subscribers/{{subscriber_id}}");
    expect(requestOf("subscribers.update").method).toBe("PATCH");
    expect(requestOf("subscribers.delete").method).toBe("DELETE");
    expect(requestOf("subscribers.delete").body).toEqual({ subscribers: "{{subscribers}}" });
    expect(HANDWRITTEN.has("fields.create")).toBe(true);
    expect(HANDWRITTEN.has("subscribers.update")).toBe(true);
  });

  test("recipe operations equal runner operations", async () => {
    const recipe = await Bun.file(new URL("../../../../scripts/connector-gen/openconnector/recipes/sender/recipe.json", import.meta.url)).json();
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(Object.keys(operations).sort());
    expect([...recipe.selection.operations].sort()).toEqual(Object.keys(operations).sort());
    expect(recipe.manifest.version).toBe("0.2.0");
  });
});

describe("sender compiled handlers", () => {
  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  async function invoke(key: string, input: Record<string, unknown>, respond: (request: Request) => Promise<Response> | Response) {
    const requests: Request[] = [];
    const result = await actions[key]!({
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

  function dummyResponse(key: string, operation: Record<string, unknown>): unknown {
    if (key === "fields.create") {
      return { success: true, message: "Field successfully created", data: { id: "epxZye", title: "x", type: "text" } };
    }
    if (key === "subscribers.update") {
      return { success: true, message: "Success", data: [] };
    }
    if (key === "subscribers.create") {
      return { success: true, message: [], data: { id: "o2lk68Y", email: "ada@example.com" } };
    }
    const data = (operation.outputSchema as { properties?: { data?: { type?: unknown } } }).properties?.data;
    const types = data?.type;
    if (types === "array" || (Array.isArray(types) && types.includes("array"))) return [{ id: 1 }];
    return { data: { id: 1 } };
  }

  test("every operation dispatches a real HTTP request for required input", async () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as { method: string; path: string; success?: number[] };
      const input = dummyInput(operation.inputSchema as { properties?: Record<string, any>; required?: string[] });
      const { requests, result } = await invoke(key, input, () => jsonResponse(dummyResponse(key, operation), request.success?.[0] ?? 200));
      expect(requests, key).toHaveLength(1);
      expect(requests[0]!.method, key).toBe(request.method);
      expect(new URL(requests[0]!.url).hostname, key).toBe("api.sender.net");
      expect(new URL(requests[0]!.url).pathname.startsWith("/v2/"), key).toBe(true);
      expect(requests[0]!.headers.get("authorization"), key).toBe("Bearer dummy");
      expect(requests[0]!.headers.get("accept"), key).toBe("application/json");
      expect(result).toMatchObject({ connector: "sender", action: key, source: "provider" });
    }
  });

  test("origin healthcheck still probes GET /groups?limit=1", async () => {
    const { requests } = await invoke("healthcheck", {}, () => jsonResponse({ data: [] }));
    expect(new URL(requests[0]!.url).pathname).toBe("/v2/groups");
    expect(requests[0]!.method).toBe("GET");
    expect(new URL(requests[0]!.url).searchParams.get("limit")).toBe("1");
  });

  test("optional query params are omitted when unset and encoded when set", async () => {
    const bare = await invoke("workflows.list", {}, () => jsonResponse({ data: [] }));
    expect(new URL(bare.requests[0]!.url).href).toBe("https://api.sender.net/v2/workflows");
    const filtered = await invoke("workflows.list", { page: 2, limit: 20, status: "ACTIVE", title: "Welcome" }, () => jsonResponse({ data: [] }));
    const url = new URL(filtered.requests[0]!.url);
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("limit")).toBe("20");
    expect(url.searchParams.get("status")).toBe("ACTIVE");
    expect(url.searchParams.get("title")).toBe("Welcome");
  });

  test("subscribers.create sends official JSON and keeps empty message arrays as success", async () => {
    const { requests, result } = await invoke(
      "subscribers.create",
      {
        email: "ada@example.com",
        firstname: "Ada",
        lastname: "Lovelace",
        groups: ["eZVD4w"],
        fields: { "{$company}": "Analytical Engines" },
        phone: "+37060000000",
        trigger_automation: false,
      },
      () => jsonResponse({ success: true, message: [], data: { id: "o2lk68Y", email: "ada@example.com" } }),
    );
    expect(requests[0]!.method).toBe("POST");
    expect(new URL(requests[0]!.url).pathname).toBe("/v2/subscribers");
    expect(requests[0]!.headers.get("content-type")).toBe("application/json");
    expect(await requests[0]!.json()).toEqual({
      email: "ada@example.com",
      firstname: "Ada",
      lastname: "Lovelace",
      groups: ["eZVD4w"],
      fields: { "{$company}": "Analytical Engines" },
      phone: "+37060000000",
      trigger_automation: false,
    });
    expect(result).toMatchObject({ connector: "sender", action: "subscribers.create", source: "provider" });
  });

  test("fields.create treats official success message as success", async () => {
    const { requests, result } = await invoke(
      "fields.create",
      { title: "New text field", type: "text" },
      () => jsonResponse({ success: true, message: "Field successfully created", data: { id: "epxZye", title: "New text field", type: "text" } }),
    );
    expect(requests[0]!.method).toBe("POST");
    expect(new URL(requests[0]!.url).pathname).toBe("/v2/fields");
    expect(await requests[0]!.json()).toEqual({ title: "New text field", type: "text" });
    expect(result).toEqual({
      connector: "sender",
      action: "fields.create",
      source: "provider",
      data: { success: true, message: "Field successfully created", data: { id: "epxZye", title: "New text field", type: "text" } },
    });
  });

  test("subscribers.update PATCHes official fields and ignores success message", async () => {
    const { requests, result } = await invoke(
      "subscribers.update",
      { subscriber_id: "o2lk68Y", firstname: "Ada", groups: ["eZVD4w"], fields: { "{$company}": "Analytical Engines" } },
      () => jsonResponse({ success: true, message: "Success", data: [] }),
    );
    expect(requests[0]!.method).toBe("PATCH");
    expect(new URL(requests[0]!.url).pathname).toBe("/v2/subscribers/o2lk68Y");
    expect(await requests[0]!.json()).toEqual({
      firstname: "Ada",
      groups: ["eZVD4w"],
      fields: { "{$company}": "Analytical Engines" },
    });
    expect(result).toMatchObject({ connector: "sender", action: "subscribers.update", source: "provider" });
  });

  test("path segments are URL-encoded", async () => {
    const { requests } = await invoke("subscribers.get", { subscriber_id: "ada@example.com" }, () => jsonResponse({ data: { id: "o2lk68Y" } }));
    expect(new URL(requests[0]!.url).pathname).toBe("/v2/subscribers/ada%40example.com");
    const campaign = await invoke("campaigns.get", { campaign_id: "e1GpjV" }, () => jsonResponse({ data: { id: "e1GpjV" } }));
    expect(new URL(campaign.requests[0]!.url).pathname).toBe("/v2/campaigns/e1GpjV");
  });

  test("rejects invalid field type and missing ids", async () => {
    await expect(invoke("fields.create", { title: "x", type: "money" }, () => jsonResponse({}))).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
    await expect(invoke("subscribers.update", {}, () => jsonResponse({}))).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
    await expect(invoke("campaigns.get", {}, () => jsonResponse({}))).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
  });

  test("maps 401 and 429", async () => {
    await expect(invoke("healthcheck", {}, () => jsonResponse({ message: "Unauthorized" }, 401))).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
    await expect(
      invoke("healthcheck", {}, () => new Response("{}", { status: 429, headers: { "retry-after": "4", "content-type": "application/json" } })),
    ).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });

  test("origin false-success body still fails through bodyErrorPaths", async () => {
    await expect(invoke("healthcheck", {}, () => jsonResponse({ success: false, message: "Unauthorized" }))).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
  });
});
