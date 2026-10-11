import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import COMPOSIO_TOOLS from "./composio-cover.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const ORIGIN_OPS = ["healthcheck", "messages.history", "messages.publish", "presence.list", "stats.get"] as const;
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

describe("ably manifest", () => {
  test("has bounded host, origin auth, version, and compiles", () => {
    expect(manifest.key).toBe("ably");
    expect(manifest.version).toBe("0.3.0");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.categories).toEqual(["dev-tools"]);
    expect(manifest.network.allowedHosts).toEqual(["main.realtime.ably.net"]);
    expect(manifest.http.baseUrl).toBe("https://main.realtime.ably.net");
    expect(manifest.http.auth.name).toBe("Authorization");
    expect(manifest.http.auth.basic).toEqual({ username: "{{keyName}}", password: "{{keySecret}}" });
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("keeps the origin five operations", () => {
    for (const key of ORIGIN_OPS) {
      expect(operations[key], key).toBeDefined();
      expect(requestOf(key), key).toBeDefined();
    }
    expect(requestOf("healthcheck")).toMatchObject({ method: "GET", path: "/stats" });
    expect(requestOf("messages.history").path).toBe("/channels/{{channelId}}/messages");
    expect(requestOf("messages.publish").path).toBe("/channels/{{channelId}}/messages");
    expect(requestOf("presence.list").path).toBe("/channels/{{channelId}}/presence");
    expect(requestOf("stats.get").path).toBe("/stats");
    expect((operations["messages.history"]!.inputSchema as { required: string[] }).required).toEqual(["channelId"]);
    expect((operations["messages.publish"]!.inputSchema as { required: string[] }).required).toEqual(["channelId", "data"]);
    expect((operations["presence.list"]!.inputSchema as { required: string[] }).required).toEqual(["channelId"]);
  });

  test("covers every Composio Ably tool with a real request", () => {
    expect(Object.keys(COMPOSIO_TOOLS)).toHaveLength(25);
    expect(Object.keys(operations).length).toBe(26);
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

  test("maps documented Ably paths and Composio aliases", () => {
    expect(requestOf("channels.get").path).toBe("/channels/{{channel_id}}");
    expect(requestOf("channels.list").path).toBe("/channels");
    expect(requestOf("messages.batch_publish").path).toBe("/messages");
    expect(requestOf("messages.versions").path).toBe("/channels/{{channel_id}}/messages/{{serial}}/versions");
    expect(requestOf("presence.batch").path).toBe("/presence");
    expect(requestOf("presence.history").path).toBe("/channels/{{channel_id}}/presence/history");
    expect(requestOf("push.publish").path).toBe("/push/publish");
    expect(requestOf("push.batch_publish").path).toBe("/push/batch/publish");
    expect(requestOf("push.devices.register").path).toBe("/push/deviceRegistrations");
    expect(requestOf("push.devices.get").path).toBe("/push/deviceRegistrations/{{device_id}}");
    expect(requestOf("tokens.request").path).toBe("/keys/{{key_name}}/requestToken");
    expect(requestOf("time.get").path).toBe("/time");
    expect((requestOf("push.devices.register").body as Record<string, unknown>).formFactor).toBe("{{form_factor}}");
    expect((requestOf("push.publish").body as Record<string, unknown>).notification).toBe("{{push.notification}}");
    expect((requestOf("presence.batch").query as Record<string, string>).channels).toBe("{{channels}}");
    expect((requestOf("push.channel_subscriptions.delete").query as Record<string, string>).deviceId).toBe("{{device_id}}");
  });

  test("recipe operations equal runner operations", async () => {
    const recipe = await Bun.file(new URL("../../../../scripts/connector-gen/openconnector/recipes/ably/recipe.json", import.meta.url)).json();
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(Object.keys(operations).sort());
    expect([...recipe.selection.operations].sort()).toEqual(Object.keys(operations).sort());
    expect(recipe.manifest.version).toBe("0.3.0");
  });
});

describe("ably compiled handlers", () => {
  const jsonResponse = (body: unknown, status = 200) =>
    new Response(body === "" ? null : JSON.stringify(body), {
      status,
      headers: body === "" ? undefined : { "content-type": "application/json" },
    });

  async function invoke(key: string, input: Record<string, unknown>, respond: (request: Request) => Promise<Response> | Response) {
    const requests: Request[] = [];
    const result = await compiled.actions[key]!({
      keyName: "app.key",
      keySecret: "secret",
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
    if ((operation.request as { result?: unknown }).result !== undefined) return "";
    const data = (operation.outputSchema as { properties?: { data?: { type?: unknown; items?: { type?: unknown } } } }).properties?.data;
    const types = data?.type;
    const itemType = data?.items && typeof data.items === "object" ? (data.items as { type?: unknown }).type : undefined;
    if (types === "array" || (Array.isArray(types) && types.includes("array"))) {
      if (itemType === "string") return ["x"];
      if (itemType === "integer" || itemType === "number") return [1];
      return [{ id: 1 }];
    }
    return { id: 1 };
  }

  test("every operation dispatches a real HTTP request for required input", async () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as { method: string; path: string; success?: number[]; result?: unknown };
      const input = dummyInput(operation.inputSchema as { properties?: Record<string, any>; required?: string[] });
      const status = request.result !== undefined ? (request.success?.[0] ?? 204) : (request.success?.[0] ?? 200);
      const { requests, result } = await invoke(key, input, () => jsonResponse(dummyResponse(operation), status));
      expect(requests, key).toHaveLength(1);
      expect(requests[0]!.method, key).toBe(request.method);
      expect(new URL(requests[0]!.url).hostname, key).toBe("main.realtime.ably.net");
      expect(requests[0]!.headers.get("authorization"), key).toBe("Basic YXBwLmtleTpzZWNyZXQ=");
      expect(result).toMatchObject({ connector: "ably", action: key, source: "provider" });
    }
  });

  test("origin healthcheck still probes GET /stats?limit=1", async () => {
    const { requests } = await invoke("healthcheck", {}, () => jsonResponse([{ intervalId: "2026-09-13T00:00:00Z" }]));
    expect(new URL(requests[0]!.url).pathname).toBe("/stats");
    expect(requests[0]!.method).toBe("GET");
    expect(new URL(requests[0]!.url).searchParams.get("limit")).toBe("1");
  });

  test("optional query params are omitted when unset and encoded when set", async () => {
    const bare = await invoke("stats.get", {}, () => jsonResponse([]));
    expect(new URL(bare.requests[0]!.url).href).toBe("https://main.realtime.ably.net/stats");
    const filtered = await invoke("stats.get", { limit: 10, unit: "day", direction: "backwards" }, () => jsonResponse([]));
    const url = new URL(filtered.requests[0]!.url);
    expect(url.searchParams.get("limit")).toBe("10");
    expect(url.searchParams.get("unit")).toBe("day");
    expect(url.searchParams.get("direction")).toBe("backwards");
  });

  test("register maps form_factor and push_recipient onto Ably wire fields", async () => {
    const recipient = { transportType: "apns", deviceToken: "token" };
    const { requests } = await invoke(
      "push.devices.register",
      { id: "dev-1", platform: "ios", form_factor: "phone", push_recipient: recipient },
      () => jsonResponse({ id: "dev-1" }),
    );
    expect(requests[0]!.method).toBe("POST");
    expect(new URL(requests[0]!.url).pathname).toBe("/push/deviceRegistrations");
    expect(await requests[0]!.json()).toEqual({
      id: "dev-1",
      platform: "ios",
      formFactor: "phone",
      push: { recipient },
    });
  });

  test("push.publish flattens push.notification onto the Ably body", async () => {
    const { requests, result } = await invoke(
      "push.publish",
      { recipient: { clientId: "user-1" }, push: { notification: { title: "Hi", body: "There" } } },
      () => new Response(null, { status: 204 }),
    );
    expect(requests[0]!.method).toBe("POST");
    expect(new URL(requests[0]!.url).pathname).toBe("/push/publish");
    expect(await requests[0]!.json()).toEqual({
      recipient: { clientId: "user-1" },
      notification: { title: "Hi", body: "There" },
    });
    expect(result).toEqual({ connector: "ably", action: "push.publish", source: "provider", published: true });
  });

  test("batch presence history comma-joins the channel list", async () => {
    const { requests } = await invoke(
      "presence.batch_history",
      { channels: ["test-channel", "alerts"], limit: 50 },
      () => jsonResponse([]),
    );
    const url = new URL(requests[0]!.url);
    expect(url.pathname).toBe("/presence");
    expect(url.searchParams.get("channels")).toBe("test-channel,alerts");
    expect(url.searchParams.get("limit")).toBe("50");
  });

  test("path segments are URL-encoded", async () => {
    const { requests } = await invoke("channels.get", { channel_id: "pushenabled:foo" }, () => jsonResponse({ channelId: "pushenabled:foo" }));
    expect(new URL(requests[0]!.url).pathname).toBe("/channels/pushenabled%3Afoo");
  });

  test("maps 401 and 429", async () => {
    await expect(invoke("healthcheck", {}, () => jsonResponse({ message: "nope" }, 401))).rejects.toMatchObject({
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
