import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
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
      if (Array.isArray(items.enum) && items.enum.length > 0) input[key] = [items.enum[0]];
      else if (items.type === "object" || items.properties) input[key] = [dummyInput(items)];
      else if (items.type === "integer" || items.type === "number") input[key] = [1];
      else if (items.type === "boolean") input[key] = [true];
      else input[key] = ["x"];
    }
    else if (prop.type === "object") input[key] = { name: "x" };
    else input[key] = "x";
  }
  return input;
}

function jsonResponse(body: unknown, status = 200) {
  if (status === 204) return new Response(null, { status });
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

async function invoke(
  key: string,
  input: Record<string, unknown>,
  respond: (request: Request) => Promise<Response> | Response,
  credentials: Record<string, string> = { host: "us1.api.mailchimp.com", apiKey: "test-secret" },
) {
  const requests: Request[] = [];
  const result = await compiled.actions[key]!({
    ...credentials,
    ...input,
    fetch: async (url: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(url, init);
      requests.push(request);
      return respond(request);
    },
  });
  return { requests, result };
}

describe("mailchimp declarative compile", () => {
  test("requires stored host, compiles, and pins open-connector", () => {
    expect(manifest.key).toBe("mailchimp");
    expect(manifest.version).toBe("0.5.0");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.auth.type).toBe("oauth2");
    expect(manifest.auth.scopes).toEqual([]);
    expect(Object.keys(manifest.auth).sort()).toEqual(["scopes", "setup", "type"]);
    const fields = manifest.auth.setup.fields as Array<{ key: string; required?: boolean; secret?: boolean }>;
    expect(fields.find((field) => field.key === "host")).toMatchObject({ required: true, secret: false });
    expect(manifest.http.baseUrl).toBe("https://{{host}}/3.0");
    expect(manifest.network.allowedHosts).toEqual(["*.api.mailchimp.com", "{{host}}"]);
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "Authorization",
      basic: { username: "anystring", password: "{{apiKey}}" },
    });
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    expect(manifest.provenance.source.revision).toBe("33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a");
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("refuses host interpolation from an optional setup field", () => {
    const optionalHost = structuredClone(manifest) as typeof manifest & {
      auth: { setup: { fields: Array<{ required: boolean }> } };
    };
    optionalHost.auth.setup.fields[0]!.required = false;
    expect(() => compileDeclarativeConnector(optionalHost as never)).toThrow(/optional setup field/);
  });

  test("gives every action a request, title, description, and object inputSchema", () => {
    for (const [key, operation] of Object.entries(operations)) {
      if (operation.kind === "webhook") {
        expect(operation.sideEffect, key).toBe("read");
        expect(operation.request, key).toBeUndefined();
        continue;
      }
      if (operation.kind === "sync") {
        expect(operation.sideEffect, key).toBe("read");
        continue;
      }
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
      expect(compiled.actions[key], key).toBeTypeOf("function");
    }
  });

  test("classifies mutating HTTP methods as write and webhooks as read", () => {
    for (const [key, operation] of Object.entries(operations)) {
      if (operation.kind === "webhook") {
        expect(operation.sideEffect, key).toBe("read");
        continue;
      }
      if (!operation.request) continue;
      const method = String(requestOf(key).method);
      if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
        expect(["write", "destructive"], key).toContain(operation.sideEffect);
      } else {
        expect(operation.sideEffect, key).toBe("read");
      }
    }
  });

  test("only interpolates path placeholders the schema requires", () => {
    for (const [key, operation] of Object.entries(operations)) {
      if (!operation.request) continue;
      const request = operation.request as Record<string, unknown>;
      const schema = operation.inputSchema as { required?: string[] };
      const placeholders = [...String(request.path ?? "").matchAll(/\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g)].map(
        (match) => match[1],
      );
      for (const placeholder of placeholders) {
        expect(schema.required ?? [], `${key} path uses {{${placeholder}}}`).toContain(placeholder);
      }
    }
  });

  test("puts JSON Content-Type only on bodies and keeps GET/DELETE body-less", () => {
    const httpHeaders = (manifest.http.headers ?? {}) as Record<string, string>;
    expect(httpHeaders["Content-Type"]).toBeUndefined();
    expect(httpHeaders["content-type"]).toBeUndefined();
    for (const [key, operation] of Object.entries(operations)) {
      if (!operation.request) continue;
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

  test("covers missing Marketing REST segment endpoints", () => {
    expect(requestOf("segments.list")).toMatchObject({ method: "GET", path: "/segments" });
    expect(requestOf("segments.get")).toMatchObject({ method: "GET", path: "/segments/{{segment_id}}" });
    expect(requestOf("segments.create")).toMatchObject({ method: "POST", path: "/segments" });
    expect(requestOf("segments.update")).toMatchObject({ method: "PATCH", path: "/segments/{{segment_id}}" });
    expect(requestOf("segments.delete")).toMatchObject({ method: "DELETE", path: "/segments/{{segment_id}}" });
    expect(requestOf("segments.count")).toMatchObject({ method: "GET", path: "/segments/{{segment_id}}/count" });
    expect(requestOf("segments.snapshots.create")).toMatchObject({
      method: "POST",
      path: "/segments/{{segment_id}}/snapshots",
    });
    expect(requestOf("segments.snapshots.get")).toMatchObject({
      method: "GET",
      path: "/segments/{{segment_id}}/snapshots/{{snapshot_id}}",
    });
    expect(requestOf("segments.snapshots.members")).toMatchObject({
      method: "GET",
      path: "/segments/{{segment_id}}/snapshots/{{snapshot_id}}/members",
    });
    expect(requestOf("healthcheck")).toMatchObject({ method: "GET", path: "/" });
    expect(requestOf("campaigns.send")).toMatchObject({
      method: "POST",
      path: "/campaigns/{{campaignId}}/actions/send",
    });
    expect(requestOf("lists.get")).toMatchObject({ method: "GET", path: "/lists/{{listId}}" });
  });

  test("recipe operations equal runner operations and native auth is type/scopes/setup only", async () => {
    const recipe = await Bun.file(new URL("../../../../scripts/connector-gen/openconnector/recipes/mailchimp/recipe.json", import.meta.url)).json();
    expect(recipe.source.revision).toBe("33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a");
    expect(recipe.selection.upstreamSha).toBe("33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a");
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(Object.keys(operations).sort());
    expect([...recipe.selection.operations].sort()).toEqual(Object.keys(operations).sort());
    expect(Object.keys(recipe.operationSources).sort()).toEqual(Object.keys(operations).sort());
    expect(Object.keys(recipe.manifest.auth).sort()).toEqual(["scopes", "setup", "type"]);
    expect(recipe.manifest.auth.type).toBe("oauth2");
    expect(recipe.manifest.auth.scopes).toEqual([]);
    expect(recipe.manifest.version).toBe("0.5.0");
    expect(recipe.manifest.http.baseUrl).toBe("https://{{host}}/3.0");
    expect(recipe.manifest.network.allowedHosts).toEqual(["*.api.mailchimp.com", "{{host}}"]);
    expect(recipe.operationSources["lists.get"].upstreamActionId).toBe("get_list");
    expect(recipe.operationSources["lists.members.upsert"].upstreamActionId).toBe("upsert_member");
  });
});

describe("mailchimp compiled handlers", () => {
  test("every request-backed action dispatches HTTPS to the stored host", async () => {
    const keys = Object.entries(operations)
      .filter(([, operation]) => operation.kind === "action" && operation.request)
      .map(([key]) => key);
    expect(keys.length).toBeGreaterThan(300);
    for (const key of keys) {
      const request = requestOf(key);
      const status = Array.isArray(request.success) ? Number(request.success[0]) : 200;
      const input = dummyInput(operations[key]!.inputSchema as { properties?: Record<string, any>; required?: string[] });
      const { requests, result } = await invoke(key, input, () => jsonResponse({ account_name: "ok" }, status));
      expect(requests, key).toHaveLength(1);
      expect(requests[0]!.method, key).toBe(String(request.method));
      const url = new URL(requests[0]!.url);
      expect(url.protocol, key).toBe("https:");
      expect(url.hostname, key).toBe("us1.api.mailchimp.com");
      expect(url.pathname.startsWith("/3.0"), key).toBe(true);
      expect(requests[0]!.headers.get("authorization"), key).toBe(
        `Basic ${Buffer.from("anystring:test-secret", "utf8").toString("base64")}`,
      );
      expect(requests[0]!.headers.get("accept"), key).toBe("application/json");
      if (request.body !== undefined) {
        expect(requests[0]!.headers.get("content-type"), key).toContain("application/json");
        expect(await requests[0]!.clone().text(), key).not.toBe("");
      } else {
        expect(requests[0]!.headers.get("content-type"), key).toBeNull();
        expect(await requests[0]!.clone().text(), key).toBe("");
      }
      if (String(request.method) === "GET" || String(request.method) === "DELETE") {
        expect(await requests[0]!.clone().text(), key).toBe("");
      }
      expect(result).toMatchObject({ connector: "mailchimp", action: key, source: "provider" });
    }
  });

  test("healthcheck GET / uses the stored host and is body-less", async () => {
    const { requests, result } = await invoke("healthcheck", {}, () => jsonResponse({ account_name: "Demo" }));
    expect(requests[0]!.method).toBe("GET");
    expect(requests[0]!.url).toBe("https://us1.api.mailchimp.com/3.0/");
    expect(requests[0]!.headers.get("content-type")).toBeNull();
    expect(result).toMatchObject({
      connector: "mailchimp",
      action: "healthcheck",
      source: "provider",
      data: { account_name: "Demo" },
    });
  });

  test("interpolates a non-us1 data-center host from required setup", async () => {
    const { requests } = await invoke(
      "healthcheck",
      {},
      () => jsonResponse({ account_name: "EU" }),
      { host: "us6.api.mailchimp.com", apiKey: "test-secret" },
    );
    expect(requests[0]!.url).toBe("https://us6.api.mailchimp.com/3.0/");
  });

  test("segments.list requires list_id and stays body-less", async () => {
    const { requests } = await invoke("segments.list", { list_id: "abc123" }, () => jsonResponse({ segments: [] }));
    const url = new URL(requests[0]!.url);
    expect(requests[0]!.method).toBe("GET");
    expect(url.pathname).toBe("/3.0/segments");
    expect(url.searchParams.get("list_id")).toBe("abc123");
    expect(requests[0]!.headers.get("content-type")).toBeNull();
    await expect(invoke("segments.list", {}, () => jsonResponse({}))).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
  });

  test("segments.create sends JSON and segments.delete is body-less", async () => {
    const created = await invoke(
      "segments.create",
      { name: "VIPs", list_id: "abc123", definition: { match: "all", conditions: [] } },
      () => jsonResponse({ id: "seg1" }),
    );
    expect(created.requests[0]!.method).toBe("POST");
    expect(new URL(created.requests[0]!.url).pathname).toBe("/3.0/segments");
    expect(created.requests[0]!.headers.get("content-type")).toContain("application/json");
    expect(JSON.parse(await created.requests[0]!.clone().text())).toMatchObject({
      name: "VIPs",
      list_id: "abc123",
    });

    const deleted = await invoke("segments.delete", { segment_id: "seg1" }, () => jsonResponse(null, 204));
    expect(deleted.requests[0]!.method).toBe("DELETE");
    expect(new URL(deleted.requests[0]!.url).pathname).toBe("/3.0/segments/seg1");
    expect(deleted.requests[0]!.headers.get("content-type")).toBeNull();
    expect(await deleted.requests[0]!.text()).toBe("");
  });

  test("lists.get and campaigns.send hit Marketing REST paths", async () => {
    const list = await invoke("lists.get", { listId: "list001" }, () => jsonResponse({ id: "list001" }));
    expect(list.requests[0]!.method).toBe("GET");
    expect(new URL(list.requests[0]!.url).pathname).toBe("/3.0/lists/list001");

    const sent = await invoke("campaigns.send", { campaignId: "camp001" }, () => jsonResponse(null, 204));
    expect(sent.requests[0]!.method).toBe("POST");
    expect(new URL(sent.requests[0]!.url).pathname).toBe("/3.0/campaigns/camp001/actions/send");
    expect(sent.requests[0]!.headers.get("content-type")).toBeNull();
  });
});
