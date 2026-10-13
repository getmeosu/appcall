import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import coverage from "../../cloro.coverage.json";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest);
const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });
const credentials = { apiKey: "fixture-api-key" };

describe("Cloro declarative contract", () => {
  test("uses bearer auth on the documented host", () => {
    expect(manifest.key).toBe("cloro");
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.http.baseUrl).toBe("https://api.cloro.dev");
    expect(manifest.network.allowedHosts).toEqual(["api.cloro.dev"]);
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "Authorization",
      value: "Bearer {{apiKey}}",
    });
    expect(manifest.auth.setup.fields.map((field: { key: string }) => field.key)).toEqual(["apiKey"]);
    expect(Object.keys(manifest.operations)).toHaveLength(12);
  });

  test("maps each single-route live tool and leaves multi-route tools unmapped", () => {
    expect(coverage.composio_tools).toBe(14);
    expect(coverage.index_tools).toBe(14);
    expect(coverage.missing_http).toEqual([]);
    expect(coverage.missing_still.map((item: { tool: string }) => item.tool)).toEqual([
      "CLORO_EXTRACT_AI_ANSWER",
      "CLORO_SEARCH_GOOGLE",
    ]);
    expect(coverage.mapped).toHaveLength(12);
    expect(coverage.mapped.length + coverage.missing_still.length).toBe(14);
    const seen = new Set<string>();
    for (const entry of coverage.mapped) {
      const operation = manifest.operations[entry.operation];
      expect(operation?.request?.method, entry.tool).toBe(entry.method);
      expect(operation?.request?.path, entry.tool).toBe(entry.path);
      expect(operation.request.path, entry.tool).toMatch(/^\/v1\/[A-Za-z0-9{}_/-]+$/);
      expect(operation.request.path.includes("://"), entry.tool).toBe(false);
      expect(operation.outputSchema.type, entry.tool).toBe("object");
      expect(operation.inputSchema.type, entry.tool).toBe("object");
      expect(operation.title.length, entry.tool).toBeGreaterThan(0);
      expect(operation.description.length, entry.tool).toBeGreaterThan(0);
      expect(operation.timeoutMs).toBeGreaterThanOrEqual(1);
      expect(operation.timeoutMs).toBeLessThanOrEqual(300000);
      expect(operation.maxInputBytes).toBeLessThanOrEqual(26214400);
      expect(operation.maxResponseBytes).toBeGreaterThanOrEqual(operation.maxInputBytes);
      expect(operation.responseFormat, entry.tool).toBe("json");
      expect(operation.request.success, entry.tool).toEqual([200]);
      expect(["read", "write"]).toContain(operation.sideEffect);
      if (operation.request.method === "GET") {
        expect(operation.request.body, entry.tool).toBeUndefined();
        expect(operation.request.headers, entry.tool).toBeUndefined();
      } else {
        expect(operation.request.headers["Content-Type"], entry.tool).toBe("application/json");
        expect(operation.request.body, entry.tool).toBeDefined();
      }
      seen.add(entry.operation);
    }
    expect([...seen].sort()).toEqual(Object.keys(manifest.operations).sort());
    expect(manifest.operations["async.task.submit"].sideEffect).toBe("write");
    expect(manifest.operations["async.task.batch"].sideEffect).toBe("write");
    expect(manifest.operations["chatgpt.extract"].timeoutMs).toBe(300000);
  });

  test("omits unset JSON fields and keeps false booleans", async () => {
    const seen: Request[] = [];
    await actions["chatgpt.extract"]!({
      ...credentials,
      prompt: "Hi",
      country: "US",
      disableWebSearch: false,
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response({ success: true, result: { text: "ok" } });
      },
    });
    expect(new URL(seen[0].url).pathname).toBe("/v1/monitor/chatgpt");
    expect(JSON.parse(await seen[0].text())).toEqual({
      prompt: "Hi",
      country: "US",
      disableWebSearch: false,
    });
  });

  test("sends the batch as a JSON array and the state list as country US", async () => {
    const seen: Request[] = [];
    const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(new Request(input, init));
      const url = new URL(String(input));
      if (url.pathname.endsWith("/batch")) {
        return response({ success: true, summary: { total: 1, succeeded: 1, failed: 0 }, results: [] });
      }
      return response([{ code: "CA", name: "California" }]);
    };
    await actions["async.task.batch"]!({
      ...credentials,
      tasks: [{ taskType: "GEMINI", payload: { prompt: "Hi", country: "US" } }],
      fetch,
    });
    await actions["states.list"]!({ ...credentials, fetch });
    await actions["countries.list"]!({ ...credentials, fetch });
    expect(JSON.parse(await seen[0].text())).toEqual([
      { taskType: "GEMINI", payload: { prompt: "Hi", country: "US" } },
    ]);
    expect(seen[0].headers.get("content-type")).toBe("application/json");
    expect(seen[1].url).toBe("https://api.cloro.dev/v1/states?country=US");
    expect(seen[1].headers.get("content-type")).toBeNull();
    expect(seen[2].url).toBe("https://api.cloro.dev/v1/countries");
  });

  test("posts redirect links to the fixed host and does not fetch them", async () => {
    const seen: Request[] = [];
    const result = await actions["google.redirect.resolve"]!({
      ...credentials,
      url: "https://evil.example/goto?url=1",
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response({ url: "https://example.com/dest" });
      },
    });
    expect(new URL(seen[0].url).hostname).toBe("api.cloro.dev");
    expect(new URL(seen[0].url).pathname).toBe("/v1/monitor/google/goto");
    expect(JSON.parse(await seen[0].text())).toEqual({ url: "https://evil.example/goto?url=1" });
    expect(result.data).toEqual({ url: "https://example.com/dest" });
  });

  test("wraps a JSON array and rejects a non-object monitor body", async () => {
    const listed = await actions["countries.list"]!({
      ...credentials,
      model: "grok",
      fetch: async () => response(["US", "DE"]),
    });
    expect(listed.data).toEqual(["US", "DE"]);
    await expect(actions["credits.get"]!({
      ...credentials,
      fetch: async () => response(["US"]),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["credits.get"]!({
      ...credentials,
      fetch: async () => new Response("", { status: 200 }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["credits.get"]!({
      ...credentials,
      fetch: async () => new Response("not-json", { status: 200, headers: { "content-type": "text/plain" } }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
  });

  test("validates input and classifies 401, 429, 204, and redirects", async () => {
    await expect(actions["chatgpt.extract"]!({
      ...credentials,
      prompt: "",
      country: "US",
      fetch: async () => response({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["chatgpt.extract"]!({
      ...credentials,
      prompt: "Hi",
      country: "US",
      state: "XX",
      fetch: async () => response({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["aimode.extract"]!({
      ...credentials,
      prompt: "Hi",
      fetch: async () => response({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["countries.list"]!({
      ...credentials,
      model: "bing",
      fetch: async () => response([]),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["async.task.batch"]!({
      ...credentials,
      tasks: [],
      fetch: async () => response({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["chatgpt.extract"]!({
      ...credentials,
      prompt: "Hi",
      country: "US",
      extra: true,
      fetch: async () => response({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["credits.get"]!({
      ...credentials,
      fetch: async () => response({ success: false, error: { message: "bad fixture-api-key" } }, 401),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR", message: "bad [REDACTED]" });
    await expect(actions["async.status"]!({
      ...credentials,
      fetch: async () => response({ success: false, error: { message: "slow down" } }, 429, { "Retry-After": "4" }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
    await expect(actions["credits.get"]!({
      ...credentials,
      fetch: async () => new Response("", { status: 204 }),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["credits.get"]!({
      ...credentials,
      fetch: async () => new Response("", { status: 302, headers: { location: "https://evil.example" } }),
    })).rejects.toMatchObject({ code: "OUTBOUND_REDIRECT_BLOCKED" });
  });

  test("does not call the network without the API key", async () => {
    let called = false;
    const result = await actions["credits.get"]!({
      fetch: async () => {
        called = true;
        return response({});
      },
    });
    expect(called).toBe(false);
    expect(result.source).toBe("connector");
  });
});
