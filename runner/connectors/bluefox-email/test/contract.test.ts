import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });

type Op = {
  kind?: string;
  sideEffect?: string;
  timeoutMs?: number;
  maxInputBytes?: number;
  maxResponseBytes?: number;
  title?: string;
  description?: string;
  responseFormat?: string;
  validationMode?: string;
  enforceOutputSchema?: boolean;
  inputSchema?: { type?: string; additionalProperties?: boolean };
  outputSchema?: { type?: string };
  request?: { method?: string; path?: string; body?: unknown; headers?: Record<string, string>; success?: number[] };
};

const operations = manifest.operations as Record<string, Op>;
const envelope = { status: 200, result: { email: "ada@example.com" } };

describe("BlueFox Email contract", () => {
  test("compiles bearer auth on the BlueFox host only", () => {
    expect(manifest.key).toBe("bluefox-email");
    expect(manifest.network.allowedHosts).toEqual(["api.bluefox.email"]);
    expect(manifest.http.baseUrl).toBe("https://api.bluefox.email/v1");
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "Authorization",
      value: "Bearer {{apiKey}}",
    });
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
    expect(Object.keys(operations).sort()).toEqual([
      "contacts.create",
      "contacts.delete",
      "contacts.get",
      "contacts.list",
      "contacts.update",
      "emails.send-transactional",
      "emails.send-triggered",
      "subscribers.get",
      "subscribers.list",
      "subscribers.subscribe",
      "subscribers.update",
    ]);
  });

  test("every action is one JSON route with a bounded object schema", () => {
    const routes: Record<string, [string, string, number[]]> = {
      "contacts.create": ["POST", "/contacts/{{project_id}}", [201]],
      "contacts.delete": ["DELETE", "/contacts/{{project_id}}/{{contact_email}}", [200]],
      "contacts.get": ["GET", "/contacts/{{project_id}}/{{contact_email}}", [200]],
      "contacts.list": ["GET", "/contacts/{{project_id}}", [200]],
      "contacts.update": ["PATCH", "/contacts/{{project_id}}/{{contact_email}}", [200]],
      "subscribers.get": ["GET", "/subscriber-lists/{{subscriber_list_id}}/{{subscriber_email}}", [200]],
      "subscribers.list": ["GET", "/subscriber-lists/{{subscriber_list_id}}", [200]],
      "subscribers.subscribe": ["POST", "/subscriber-lists/{{subscriber_list_id}}", [201]],
      "subscribers.update": ["PATCH", "/subscriber-lists/{{subscriber_list_id}}/{{subscriber_email}}", [200]],
      "emails.send-transactional": ["POST", "/send-transactional", [200]],
      "emails.send-triggered": ["POST", "/send-triggered", [200]],
    };
    expect(Object.keys(routes).sort()).toEqual(Object.keys(operations).sort());
    for (const [name, operation] of Object.entries(operations)) {
      const [method, path, success] = routes[name];
      expect(operation.kind, name).toBe("action");
      expect(operation.title, name).toBeString();
      expect(operation.description, name).toBeString();
      expect(operation.responseFormat, name).toBe("json");
      expect(operation.validationMode, name).toBe("strict-generated");
      expect(operation.enforceOutputSchema, name).toBe(true);
      expect(operation.inputSchema?.type, name).toBe("object");
      expect(operation.inputSchema?.additionalProperties, name).toBe(false);
      expect(operation.outputSchema?.type, name).toBe("object");
      expect(operation.timeoutMs, name).toBeGreaterThanOrEqual(1);
      expect(operation.timeoutMs, name).toBeLessThanOrEqual(300000);
      expect(operation.maxInputBytes, name).toBeLessThanOrEqual(26214400);
      expect(operation.maxResponseBytes ?? 0, name).toBeGreaterThanOrEqual(operation.maxInputBytes ?? 0);
      const request = operation.request;
      expect(request?.method, name).toBe(method);
      expect(request?.path, name).toBe(path);
      expect(request?.success, name).toEqual(success);
      expect(request?.path?.includes(" "), name).toBe(false);
      if (method === "GET" || method === "DELETE") {
        expect(request?.body, name).toBeUndefined();
        expect(request?.headers?.["Content-Type"], name).toBeUndefined();
        expect(operation.sideEffect, name).toBe(method === "DELETE" ? "destructive" : "read");
      } else {
        expect(request?.body, name).toBeDefined();
        expect(request?.headers?.["Content-Type"], name).toBe("application/json");
        expect(operation.sideEffect, name).toBe("write");
      }
    }
  });

  test("sends bearer auth, a flat contact body, and no content type on delete", async () => {
    const { actions } = compileDeclarativeConnector(manifest as never);
    const created: Request[] = [];
    await actions["contacts.create"]!({
      apiKey: "secret",
      project_id: "proj_1",
      fields: { email: "ada@example.com", plan: "pro" },
      fetch: async (input, init) => {
        created.push(new Request(input, init));
        return response({ status: 201, result: { email: "ada@example.com", plan: "pro" } }, 201);
      },
    });
    expect(created[0].url).toBe("https://api.bluefox.email/v1/contacts/proj_1");
    expect(created[0].method).toBe("POST");
    expect(created[0].headers.get("authorization")).toBe("Bearer secret");
    expect(created[0].headers.get("accept")).toBe("application/json");
    expect(created[0].headers.get("content-type")).toBe("application/json");
    expect(await created[0].text()).toBe('{"email":"ada@example.com","plan":"pro"}');

    const removed: Request[] = [];
    await actions["contacts.delete"]!({
      apiKey: "secret",
      project_id: "proj_1",
      contact_email: "ada@example.com",
      fetch: async (input, init) => {
        removed.push(new Request(input, init));
        return response(envelope);
      },
    });
    expect(new URL(removed[0].url).pathname).toBe("/v1/contacts/proj_1/ada%40example.com");
    expect(removed[0].method).toBe("DELETE");
    expect(removed[0].headers.get("content-type")).toBeNull();
    expect(removed[0].body).toBeNull();
  });

  test("lists one page and does not follow next", async () => {
    const { actions } = compileDeclarativeConnector(manifest as never);
    const seen: Request[] = [];
    const result = await actions["contacts.list"]!({
      apiKey: "secret",
      project_id: "proj/a",
      limit: 1,
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response({
          status: 200,
          result: { items: [{ email: "ada@example.com" }], count: 1, next: "https://evil.example/v1/contacts" },
        });
      },
    });
    const url = new URL(seen[0].url);
    expect(url.pathname).toBe("/v1/contacts/proj%2Fa");
    expect(url.searchParams.get("limit")).toBe("1");
    expect(url.searchParams.has("skip")).toBe(false);
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(seen[0].body).toBeNull();
    expect(result.data.result.items).toHaveLength(1);
    expect(seen).toHaveLength(1);
  });

  test("omits optional send fields and renames template ids", async () => {
    const { actions } = compileDeclarativeConnector(manifest as never);
    const seen: Request[] = [];
    await actions["emails.send-transactional"]!({
      apiKey: "secret",
      email: "ada@example.com",
      transactional_id: "txn_1",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response({ status: 200, result: { success: true } });
      },
    });
    expect(seen[0].url).toBe("https://api.bluefox.email/v1/send-transactional");
    expect(await seen[0].text()).toBe('{"email":"ada@example.com","transactionalId":"txn_1"}');

    const triggered: Request[] = [];
    await actions["emails.send-triggered"]!({
      apiKey: "secret",
      triggered_id: "trg_1",
      emails: ["ada@example.com"],
      fetch: async (input, init) => {
        triggered.push(new Request(input, init));
        return response({ status: 200, result: { success: true } });
      },
    });
    expect(triggered[0].url).toBe("https://api.bluefox.email/v1/send-triggered");
    expect(await triggered[0].text()).toBe('{"triggeredId":"trg_1","emails":["ada@example.com"]}');
  });

  test("rejects bad input, an empty body, an array, a 401, and a 429", async () => {
    const { actions } = compileDeclarativeConnector(manifest as never);
    let calls = 0;
    const fetch = async () => {
      calls += 1;
      return response(envelope);
    };
    const creds = { apiKey: "fixture-api-token" };
    await expect(actions["contacts.create"]!({ ...creds, project_id: "proj_1", fetch })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["contacts.create"]!({ ...creds, project_id: "proj_1", fields: { name: "Ada" }, fetch })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["contacts.update"]!({ ...creds, project_id: "proj_1", contact_email: "ada@example.com", fields: {}, fetch })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["contacts.get"]!({ ...creds, project_id: "proj_1", contact_email: "..", fetch })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["contacts.list"]!({ ...creds, project_id: "proj_1", limit: 31, fetch })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["subscribers.subscribe"]!({ ...creds, subscriber_list_id: "list_1", fields: { email: "ada@example.com", status: "paused" }, fetch })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["emails.send-triggered"]!({ ...creds, triggered_id: "trg_1", emails: [], fetch })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    expect(calls).toBe(0);
    await expect(actions["contacts.get"]!({ ...creds, project_id: "proj_1", contact_email: "ada@example.com", fetch: async () => new Response("", { status: 200 }) })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["contacts.get"]!({ ...creds, project_id: "proj_1", contact_email: "ada@example.com", fetch: async () => response([]) })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["contacts.get"]!({ ...creds, project_id: "proj_1", contact_email: "ada@example.com", fetch: async () => response({ status: 200 }) })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["contacts.get"]!({ ...creds, project_id: "proj_1", contact_email: "ada@example.com", fetch: async () => response({ status: 401, error: { message: "fixture-api-token" } }, 401) })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR", message: "[REDACTED]" });
    await expect(actions["subscribers.list"]!({ ...creds, subscriber_list_id: "list_1", fetch: async () => response({}, 429, { "Retry-After": "4" }) })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });
});
