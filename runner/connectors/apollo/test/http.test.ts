import { describe, expect, test } from "bun:test";
import { parseApolloRateLimit, createApolloClient } from "../src/http";

describe("parseApolloRateLimit", () => {
  test("returns limited=false for non-429 status", () => {
    const result = parseApolloRateLimit(200, {});
    expect(result.limited).toBe(false);
    expect(result.retryAfterSeconds).toBe(0);
  });

  test("returns limited=true for 429 status with retry-after header", () => {
    const result = parseApolloRateLimit(429, { "retry-after": "30" });
    expect(result.limited).toBe(true);
    expect(result.retryAfterSeconds).toBe(30);
  });

  test("uses x-ratelimit-reset as fallback when retry-after absent", () => {
    const result = parseApolloRateLimit(429, { "x-ratelimit-reset": "45" });
    expect(result.limited).toBe(true);
    expect(result.retryAfterSeconds).toBe(45);
  });

  test("defaults to 60 when no retry header provided", () => {
    const result = parseApolloRateLimit(429, {});
    expect(result.limited).toBe(true);
    expect(result.retryAfterSeconds).toBe(60);
  });

  test("handles non-numeric retry-after by defaulting to 60", () => {
    const result = parseApolloRateLimit(429, { "retry-after": "bad-value" });
    expect(result.limited).toBe(true);
    expect(result.retryAfterSeconds).toBe(60);
  });
});

describe("createApolloClient", () => {
  test("sends X-Api-Key, Content-Type, and Cache-Control headers", async () => {
    const requests: Request[] = [];
    const client = createApolloClient({
      apiKey: "test_key_123",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      },
    });
    await client.fetchJSON("/api/v1/people/match", { method: "POST", body: JSON.stringify({}) });
    expect(requests).toHaveLength(1);
    expect(requests[0].headers.get("X-Api-Key")).toBe("test_key_123");
    expect(requests[0].headers.get("Content-Type")).toBe("application/json");
    expect(requests[0].headers.get("Cache-Control")).toBe("no-cache");
  });

  test("blocks requests to disallowed hosts", async () => {
    const client = createApolloClient({
      apiKey: "test_key",
      fetch: async () => new Response("{}", { status: 200 }),
    });
    await expect(client.fetchJSON("https://evil.example.com/api")).rejects.toThrow();
  });

  test("parses JSON response body", async () => {
    const client = createApolloClient({
      apiKey: "test_key",
      fetch: async () => new Response(JSON.stringify({ people: [], pagination: {} }), { status: 200 }),
    });
    const result = await client.fetchJSON("/api/v1/mixed_people/search", { method: "POST", body: "{}" });
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ people: [], pagination: {} });
  });

  test("returns raw string when response is not valid JSON", async () => {
    const client = createApolloClient({
      apiKey: "test_key",
      fetch: async () => new Response("not-json", { status: 500 }),
    });
    const result = await client.fetchJSON("/api/v1/test");
    expect(result.status).toBe(500);
    expect(result.body).toBe("not-json");
  });
});
