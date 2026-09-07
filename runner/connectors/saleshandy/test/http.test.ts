import { describe, expect, test } from "bun:test";
import { parseSaleshandyRateLimit, createSaleshandyClient, isRecord, prop } from "../src/http";

describe("parseSaleshandyRateLimit", () => {
  test("returns limited=false for non-429 status", () => {
    expect(parseSaleshandyRateLimit(200, {})).toEqual({ limited: false, retryAfterSeconds: 0 });
    expect(parseSaleshandyRateLimit(500, {})).toEqual({ limited: false, retryAfterSeconds: 0 });
    expect(parseSaleshandyRateLimit(401, {})).toEqual({ limited: false, retryAfterSeconds: 0 });
  });

  test("returns limited=true with retry-after from header for 429", () => {
    expect(parseSaleshandyRateLimit(429, { "retry-after": "30" })).toEqual({ limited: true, retryAfterSeconds: 30 });
  });

  test("defaults retryAfterSeconds to 10 when retry-after header is missing", () => {
    expect(parseSaleshandyRateLimit(429, {})).toEqual({ limited: true, retryAfterSeconds: 10 });
  });

  test("defaults retryAfterSeconds to 10 when retry-after is 0", () => {
    expect(parseSaleshandyRateLimit(429, { "retry-after": "0" })).toEqual({ limited: true, retryAfterSeconds: 10 });
  });

  test("parses numeric string from retry-after", () => {
    expect(parseSaleshandyRateLimit(429, { "retry-after": "60" })).toEqual({ limited: true, retryAfterSeconds: 60 });
  });
});

describe("createSaleshandyClient", () => {
  test("sets x-api-key header on requests", async () => {
    const requests: Request[] = [];
    const client = createSaleshandyClient({
      apiKey: "test_api_key_123",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify({ data: {} }), { status: 200 });
      },
    });
    await client.fetchJSON("/v1/sequences");
    expect(requests).toHaveLength(1);
    expect(requests[0].headers.get("x-api-key")).toBe("test_api_key_123");
  });

  test("sends request to open-api.saleshandy.com", async () => {
    const requests: Request[] = [];
    const client = createSaleshandyClient({
      apiKey: "test_api_key_123",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response("{}", { status: 200 });
      },
    });
    await client.fetchJSON("/v1/sequences");
    expect(requests[0].url).toBe("https://open-api.saleshandy.com/v1/sequences");
  });

  test("rejects requests to disallowed hosts", async () => {
    const client = createSaleshandyClient({
      apiKey: "test_api_key_123",
      fetch: async () => new Response("{}", { status: 200 }),
    });
    await expect(
      // Attempt to fetch from an unauthorized host by bypassing through a mock
      // that creates a client internally with wrong host - test the real disallow mechanism
      (async () => {
        const { createConnectorHttpClient } = await import("../../../bun/src/http");
        const restricted = createConnectorHttpClient({
          allowedHosts: ["open-api.saleshandy.com"],
          maxResponseBytes: 65536,
          fetch: async () => new Response("{}", { status: 200 }),
        });
        return restricted.fetchText("https://evil.example.com/v1/sequences");
      })()
    ).rejects.toMatchObject({ code: "OUTBOUND_HOST_NOT_ALLOWED" });
  });

  test("parses JSON response body", async () => {
    const client = createSaleshandyClient({
      apiKey: "test_key",
      fetch: async () => new Response(JSON.stringify({ data: [{ id: "seq_001" }] }), { status: 200 }),
    });
    const response = await client.fetchJSON("/v1/sequences");
    expect(response.status).toBe(200);
    expect(isRecord(response.body)).toBe(true);
    const body = response.body as Record<string, unknown>;
    expect(Array.isArray(body.data)).toBe(true);
  });
});

describe("isRecord", () => {
  test("returns true for plain objects", () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1 })).toBe(true);
  });

  test("returns false for arrays", () => {
    expect(isRecord([])).toBe(false);
  });

  test("returns false for null", () => {
    expect(isRecord(null)).toBe(false);
  });

  test("returns false for primitives", () => {
    expect(isRecord("string")).toBe(false);
    expect(isRecord(42)).toBe(false);
    expect(isRecord(true)).toBe(false);
  });
});

describe("prop", () => {
  test("returns string value from object", () => {
    expect(prop({ name: "Alice" }, "name")).toBe("Alice");
  });

  test("returns fallback when field is missing", () => {
    expect(prop({}, "name")).toBe("");
    expect(prop({}, "name", "default")).toBe("default");
  });

  test("returns fallback when field is not a string", () => {
    expect(prop({ count: 5 }, "count")).toBe("");
  });
});
