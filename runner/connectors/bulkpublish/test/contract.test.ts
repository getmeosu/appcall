import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import coverage from "../../bulkpublish.coverage.json";

const { actions } = compileDeclarativeConnector(manifest);
const json = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });

const platforms = { platforms: [{ platform: "x", displayName: "X", enabled: true }] };

describe("bulkpublish contract", () => {
  test("maps every live tool to one JSON GET on app.bulkpublish.com", () => {
    const operations = manifest.operations;
    expect(Object.keys(operations).sort()).toEqual(coverage.mapped.map((row) => row.operation).sort());
    expect(coverage.missing_http).toEqual([]);
    expect(coverage.missing_still).toEqual([]);
    expect(coverage.mapped.length + coverage.missing_still.length).toBe(coverage.composio_tools);
    expect(coverage.composio_tools).toBe(10);
    expect(coverage.index_tools).toBe(10);
    expect(manifest.network.allowedHosts).toEqual(["app.bulkpublish.com"]);
    expect(manifest.http.baseUrl).toBe("https://app.bulkpublish.com");
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "Authorization",
      value: "Bearer {{apiKey}}",
    });
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    for (const row of coverage.mapped) {
      const operation = operations[row.operation];
      expect(operation.request.method).toBe(row.method);
      expect(operation.request.path).toBe(row.path);
    }
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind).toBe("action");
      expect(operation.sideEffect).toBe("read");
      expect(operation.request.method).toBe("GET");
      expect(operation.request.path.startsWith("/")).toBe(true);
      expect(operation.responseFormat).toBe("json");
      expect(operation.validationMode).toBe("strict-generated");
      expect(operation.enforceOutputSchema).toBe(true);
      expect(operation.request.body).toBeUndefined();
      expect(operation.inputSchema.type).toBe("object");
      expect(operation.inputSchema.additionalProperties).toBe(false);
      expect(operation.outputSchema.type).toBe("object");
      expect(operation.title.length).toBeGreaterThan(0);
      expect(operation.description.length).toBeGreaterThan(0);
      expect(operation.maxResponseBytes).toBeGreaterThanOrEqual(operation.maxInputBytes);
      expect(operation.maxInputBytes).toBeLessThanOrEqual(26214400);
      expect(operation.timeoutMs).toBeGreaterThanOrEqual(1);
      expect(operation.timeoutMs).toBeLessThanOrEqual(300000);
      expect(JSON.stringify(operation.inputSchema)).not.toContain("\"url\"");
      expect(actions[key]).toBeFunction();
    }
    expect(operations["labels.list"].outputSchema.properties.data.type).toBe("array");
  });

  test("sends the bearer token and omits Content-Type on a body-less GET", async () => {
    const seen: Request[] = [];
    const result = await actions["platforms.list"]!({
      apiKey: "secret-token",
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return json(platforms);
      },
    });
    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe("GET");
    expect(seen[0].headers.get("authorization")).toBe("Bearer secret-token");
    expect(seen[0].headers.get("accept")).toBe("application/json");
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(new URL(seen[0].url).pathname).toBe("/api/platforms");
    expect(new URL(seen[0].url).search).toBe("");
    expect(await seen[0].text()).toBe("");
    expect(result.data).toEqual(platforms);
  });

  test("omits unset query parameters", async () => {
    const seen: Request[] = [];
    await actions["analytics.summary"]!({
      apiKey: "secret-token",
      from: "2026-04-01",
      to: "2026-04-08",
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return json({
          totalPosts: 0,
          published: 0,
          scheduled: 0,
          failed: 0,
          partial: 0,
          byPlatform: {},
          byDay: [],
          from: "2026-04-01",
          to: "2026-04-08",
        });
      },
    });
    expect(seen[0].url).toBe("https://app.bulkpublish.com/api/analytics/summary?from=2026-04-01&to=2026-04-08");
  });

  test("echoes validation when the API key is absent", async () => {
    let called = false;
    const echoed = await actions["platforms.list"]!({
      fetch: async () => {
        called = true;
        return json(platforms);
      },
    });
    expect(called).toBe(false);
    expect(echoed).toMatchObject({
      connector: "bulkpublish",
      action: "platforms.list",
      source: "connector",
    });
  });

  test("rejects bad input, malformed JSON, upstream failure, and rate limits", async () => {
    const fetch = async () => json(platforms);
    await expect(actions["analytics.summary"]!({ apiKey: "tok", from: "", to: "2026-04-08", fetch })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
    await expect(actions["posts.list"]!({ apiKey: "tok", page: 0, fetch })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
    await expect(actions["posts.list"]!({ apiKey: "tok", status: "archived", fetch })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
    await expect(actions["posts.list"]!({ apiKey: "tok", extra: true, fetch })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
    await expect(actions["platforms.list"]!({ apiKey: "tok", fetch: async () => json("not-json") })).rejects.toMatchObject({
      code: "CONNECTOR_RESPONSE_INVALID",
    });
    await expect(actions["platforms.list"]!({ apiKey: "tok", fetch: async () => json({}, 401) })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
    await expect(
      actions["platforms.list"]!({
        apiKey: "tok",
        fetch: async () => json({}, 429, { "Retry-After": "4" }),
      }),
    ).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });
});
