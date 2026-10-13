import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest);
const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });

describe("Android Texter contract", () => {
  test("uses the X-API-Key header on the documented host", async () => {
    const seen: Request[] = [];
    await actions["devices.list"]!({
      apiKey: "atx_fixture",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response({ devices: [] });
      },
    });
    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe("GET");
    expect(seen[0].url).toBe("https://androidtexter.com/api/v1/devices");
    expect(seen[0].headers.get("x-api-key")).toBe("atx_fixture");
    expect(seen[0].headers.get("authorization")).toBeNull();
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(await seen[0].text()).toBe("");
  });

  test("encodes path ids and keeps list messages on one route", async () => {
    const seen: Request[] = [];
    const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(new Request(input, init));
      return response({ messages: [], page: 1, limit: 25 });
    };
    await actions["messages.history"]!({
      apiKey: "atx_fixture",
      phone: "+15551230000",
      page: 1,
      limit: 25,
      fetch,
    });
    await actions["quick-replies.delete"]!({
      apiKey: "atx_fixture",
      quickReplyId: "qr/1",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response({ success: true });
      },
    });
    await actions["messages.list"]!({ apiKey: "atx_fixture", page: 2, limit: 10, fetch });
    expect(new URL(seen[0].url).pathname).toBe("/api/v1/messages/history/%2B15551230000");
    expect(new URL(seen[1].url).pathname).toBe("/api/quick-replies/qr%2F1");
    expect(seen[1].method).toBe("DELETE");
    expect(seen[1].headers.get("content-type")).toBeNull();
    expect(new URL(seen[2].url).pathname).toBe("/api/messages");
    expect(new URL(seen[2].url).searchParams.get("direction")).toBeNull();
  });

  test("sends JSON only when a body is set and drops omitted fields", async () => {
    const seen: Request[] = [];
    await actions["messages.send"]!({
      apiKey: "atx_fixture",
      phone: "+14155551234",
      message: "Hello",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response({ message_id: "msg_1", status: "queued" });
      },
    });
    expect(seen[0].method).toBe("POST");
    expect(seen[0].headers.get("content-type")).toBe("application/json");
    expect(await seen[0].text()).toBe('{"phone":"+14155551234","message":"Hello"}');
  });

  test("rejects extra fields, empty ids, malformed JSON, 401, and 429", async () => {
    const fetch = async () => response({ devices: [] });
    await expect(actions["devices.list"]!({ apiKey: "atx_fixture", direction: "sent", fetch })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
    await expect(actions["messages.send"]!({ apiKey: "atx_fixture", phone: "", message: "Hi", fetch })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
    await expect(actions["devices.list"]!({ apiKey: "atx_fixture", fetch: async () => new Response("[]", { status: 200 }) })).rejects.toMatchObject({
      code: "CONNECTOR_RESPONSE_INVALID",
    });
    await expect(actions["devices.list"]!({ apiKey: "atx_fixture", fetch: async () => new Response("{", { status: 200 }) })).rejects.toMatchObject({
      code: "CONNECTOR_RESPONSE_INVALID",
    });
    await expect(actions["devices.list"]!({ apiKey: "atx_fixture", fetch: async () => response({ error: "unauthorized" }, 401) })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
    await expect(
      actions["devices.list"]!({
        apiKey: "atx_fixture",
        fetch: async () => response({ error: "slow down" }, 429, { "Retry-After": "4" }),
      }),
    ).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });

  test("budgets and auth stay inside the declarative limits", () => {
    expect(manifest.network.allowedHosts).toEqual(["androidtexter.com"]);
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "X-API-Key",
      value: "{{apiKey}}",
    });
    expect(manifest.http.baseUrl).toBe("https://androidtexter.com/api");
    for (const [key, operation] of Object.entries(manifest.operations)) {
      expect(operation.kind, key).toBe("action");
      expect(operation.outputSchema.type, key).toBe("object");
      expect(operation.maxResponseBytes, key).toBeGreaterThanOrEqual(operation.maxInputBytes);
      expect(operation.maxInputBytes, key).toBeLessThanOrEqual(26214400);
      expect(operation.timeoutMs, key).toBeGreaterThanOrEqual(1);
      expect(operation.timeoutMs, key).toBeLessThanOrEqual(300000);
      const method = operation.request.method;
      if (method === "GET" || method === "DELETE") {
        expect(operation.request.body, key).toBeUndefined();
        expect(operation.request.headers, key).toBeUndefined();
      } else {
        expect(operation.request.headers["Content-Type"], key).toBe("application/json");
        expect(operation.request.body, key).toBeDefined();
      }
    }
  });
});
