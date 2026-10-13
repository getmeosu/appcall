import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest);
const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });
const envelope = { data: { id: "sess_1", status: "running" }, meta: { requestId: "req_1" } };

describe("Airtop contract", () => {
  test("uses bearer auth on the documented host and omits unset query fields", async () => {
    const seen: Request[] = [];
    await actions["sessions.list"]!({
      apiKey: "secret",
      status: "running",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response(envelope);
      },
    });
    expect(seen[0].headers.get("authorization")).toBe("Bearer secret");
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(seen[0].url).toBe("https://api.airtop.ai/api/v1/sessions?status=running");
  });

  test("encodes path ids and does not follow a second request", async () => {
    const seen: Request[] = [];
    const result = await actions["windows.list"]!({
      apiKey: "tok",
      sessionId: "sess/a",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response(envelope);
      },
    });
    expect(new URL(seen[0].url).pathname).toBe("/api/v1/sessions/sess%2Fa/windows");
    expect(result.data).toEqual(envelope);
    expect(seen).toHaveLength(1);
  });

  test("creates a session with one JSON post and omits configuration when absent", async () => {
    const seen: Request[] = [];
    await actions["sessions.create"]!({
      apiKey: "tok",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response(envelope, 201);
      },
    });
    expect(seen[0].method).toBe("POST");
    expect(seen[0].headers.get("content-type")).toBe("application/json");
    expect(await seen[0].text()).toBe("{}");
  });

  test("nests click type and page-query configuration without empty objects", async () => {
    const seen: Request[] = [];
    const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(new Request(input, init));
      return response(envelope, 201);
    };
    await actions["windows.click"]!({
      apiKey: "tok",
      sessionId: "sess_1",
      windowId: "win_1",
      elementDescription: "The login button",
      fetch,
    });
    await actions["windows.query"]!({
      apiKey: "tok",
      sessionId: "sess_1",
      windowId: "win_1",
      prompt: "Summarize the page",
      configuration: { experimental: { includeVisualAnalysis: "enabled" } },
      fetch,
    });
    expect(JSON.parse(await seen[0].text())).toEqual({ elementDescription: "The login button" });
    expect(JSON.parse(await seen[1].text())).toEqual({
      configuration: { experimental: { includeVisualAnalysis: "enabled" } },
      prompt: "Summarize the page",
    });
  });

  test("forwards a proxy credential object on the create body", async () => {
    const seen: Request[] = [];
    await actions["sessions.create"]!({
      apiKey: "tok",
      configuration: { proxy: { url: "http://proxy.example:8080", username: "proxy-user" } },
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response(envelope, 201);
      },
    });
    expect(JSON.parse(await seen[0].text())).toEqual({
      configuration: { proxy: { url: "http://proxy.example:8080", username: "proxy-user" } },
    });
  });

  test("validates input, malformed output, 401, and 429", async () => {
    await expect(actions["windows.list"]!({
      apiKey: "tok",
      sessionId: "",
      fetch: async () => response(envelope),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["sessions.create"]!({
      apiKey: "tok",
      readinessTimeoutSeconds: 30,
      fetch: async () => response(envelope, 201),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["sessions.list"]!({
      apiKey: "secret",
      fetch: async () => response([], 200),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["sessions.list"]!({
      apiKey: "secret",
      fetch: async () => response({ detail: "bad key" }, 401),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR", message: "bad key" });
    await expect(actions["sessions.list"]!({
      apiKey: "secret",
      fetch: async () => response({}, 429, { "Retry-After": "4" }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });

  test("rejects dot path segments and keeps GET and DELETE body-less", async () => {
    expect(actions["sessions.terminate"]).toBeUndefined();
    await expect(actions["windows.list"]!({
      apiKey: "tok",
      sessionId: "..",
      fetch: async () => response(envelope),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    for (const [name, operation] of Object.entries(manifest.operations)) {
      const request = operation.request;
      expect(request?.method).not.toBe("HEAD");
      expect(operation.maxResponseBytes).toBeGreaterThanOrEqual(operation.maxInputBytes);
      expect(operation.timeoutMs).toBeGreaterThanOrEqual(1);
      expect(operation.timeoutMs).toBeLessThanOrEqual(300000);
      expect(operation.outputSchema.type).toBe("object");
      if (request?.method === "GET" || request?.method === "DELETE") {
        expect(request.body, name).toBeUndefined();
        expect(request.headers?.["Content-Type"], name).toBeUndefined();
      } else {
        expect(request?.headers?.["Content-Type"], name).toBe("application/json");
      }
    }
  });
});
