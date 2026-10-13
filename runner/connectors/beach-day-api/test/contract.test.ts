import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import coverage from "../../beach-day-api.coverage.json";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest);
const json = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });

describe("Beach Day API contract", () => {
  test("maps every live tool to one JSON GET on beachdayapi.com", () => {
    const operations = manifest.operations;
    expect(Object.keys(operations).sort()).toEqual(coverage.mapped.map((row) => row.operation).sort());
    expect(coverage.missing_http).toEqual([]);
    expect(coverage.mapped.length + coverage.missing_still.length).toBe(coverage.composio_tools);
    expect(manifest.network.allowedHosts).toEqual(["beachdayapi.com"]);
    expect(manifest.http.baseUrl).toBe("https://beachdayapi.com/v1");
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
      expect(operation.request.body).toBeUndefined();
      expect(operation.request.baseUrl).toBeUndefined();
      expect(operation.responseFormat).toBe("json");
      expect(operation.outputSchema.type).toBe("object");
      expect(operation.inputSchema.type).toBe("object");
      expect(operation.title.length).toBeGreaterThan(0);
      expect(operation.description.length).toBeGreaterThan(0);
      expect(operation.maxResponseBytes).toBeGreaterThanOrEqual(operation.maxInputBytes);
      expect(operation.maxInputBytes).toBeLessThanOrEqual(26214400);
      expect(operation.timeoutMs).toBeGreaterThanOrEqual(1);
      expect(operation.timeoutMs).toBeLessThanOrEqual(300000);
      expect(actions[key]).toBeFunction();
    }
  });

  test("sends the bearer token and omits Content-Type on a body-less GET", async () => {
    const seen: Request[] = [];
    const result = await actions["countries.list"]!({
      apiKey: "secret-token",
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return json({ count: 1, results: [{ country: "Spain", beach_count: 2 }] });
      },
    });
    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe("GET");
    expect(seen[0].headers.get("authorization")).toBe("Bearer secret-token");
    expect(seen[0].headers.get("accept")).toBe("application/json");
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(await seen[0].text()).toBe("");
    expect(new URL(seen[0].url).pathname).toBe("/v1/countries/");
    expect(new URL(seen[0].url).search).toBe("");
    expect(result.data).toEqual({ count: 1, results: [{ country: "Spain", beach_count: 2 }] });
  });

  test("encodes the beach id and keeps scored on its own route", async () => {
    const seen: Request[] = [];
    await actions["beaches.get"]!({
      apiKey: "secret-token",
      beachId: 372,
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return json({ id: 372, name: "Malibu" });
      },
    });
    expect(new URL(seen[0].url).pathname).toBe("/v1/beaches/372/");
    const scored: Request[] = [];
    await actions["beaches.scored.list"]!({
      apiKey: "secret-token",
      limit: 2,
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        scored.push(new Request(input, init));
        return json({ count: 0, results: [] });
      },
    });
    const scoredUrl = new URL(scored[0].url);
    expect(scoredUrl.pathname).toBe("/v1/beaches/scored/");
    expect(scoredUrl.searchParams.get("limit")).toBe("2");
    expect(scoredUrl.searchParams.has("offset")).toBe(false);
  });

  test("omits unset search filters and sends documented query names", async () => {
    const seen: Request[] = [];
    await actions["beaches.search"]!({
      apiKey: "secret-token",
      search: "Malibu",
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return json({ count: 0, results: [] });
      },
    });
    const url = new URL(seen[0].url);
    expect(url.pathname).toBe("/v1/beaches/");
    expect(url.search).toBe("?search=Malibu");
    const paged: Request[] = [];
    await actions["beaches.conditions.list"]!({
      apiKey: "secret-token",
      beachId: 1,
      offset: 30,
      limit: 15,
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        paged.push(new Request(input, init));
        return json({ beach_id: 1, count: 0, results: [] });
      },
    });
    expect(new URL(paged[0].url).search).toBe("?offset=30&limit=15");
  });

  test("rejects bad input, malformed JSON, upstream failure, and rate limits", async () => {
    const fetch = async () => json({});
    await expect(actions["beaches.get"]!({ apiKey: "tok", fetch })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
    await expect(actions["beaches.get"]!({ apiKey: "tok", beachId: -1, fetch })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
    await expect(actions["beaches.get"]!({ apiKey: "tok", beachId: 1.5, fetch })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
    await expect(actions["beaches.search"]!({ apiKey: "tok", limit: 501, fetch })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
    await expect(actions["beaches.conditions.list"]!({ apiKey: "tok", beachId: 1, limit: 0, fetch })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
    await expect(actions["countries.list"]!({ apiKey: "tok", extra: true, fetch })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
    await expect(
      actions["countries.list"]!({ apiKey: "tok", fetch: async () => new Response("{", { status: 200 }) }),
    ).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["countries.list"]!({ apiKey: "tok", fetch: async () => json("not-an-object") })).rejects.toMatchObject({
      code: "CONNECTOR_RESPONSE_INVALID",
    });
    await expect(actions["countries.list"]!({ apiKey: "tok", fetch: async () => json({}, 401) })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
    await expect(
      actions["countries.list"]!({
        apiKey: "tok",
        fetch: async () => json({ detail: "Request was throttled" }, 429, { "Retry-After": "4" }),
      }),
    ).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });
});
