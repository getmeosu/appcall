import { describe, expect, test } from "bun:test";
import { parseLushaRateLimit, createLushaClient } from "../src/http";

describe("parseLushaRateLimit", () => {
  test("returns not limited for 200", () => {
    const result = parseLushaRateLimit(200, {});
    expect(result.limited).toBe(false);
    expect(result.retryAfterSeconds).toBe(0);
  });

  test("returns limited for 429 with retry-after header", () => {
    const result = parseLushaRateLimit(429, { "retry-after": "60" });
    expect(result.limited).toBe(true);
    expect(result.retryAfterSeconds).toBe(60);
  });

  test("returns limited for 429 with x-rate-limit-reset header when retry-after absent", () => {
    const result = parseLushaRateLimit(429, { "x-rate-limit-reset": "30" });
    expect(result.limited).toBe(true);
    expect(result.retryAfterSeconds).toBe(30);
  });

  test("returns default 10s when 429 but no rate limit headers", () => {
    const result = parseLushaRateLimit(429, {});
    expect(result.limited).toBe(true);
    expect(result.retryAfterSeconds).toBe(10);
  });

  test("returns not limited for 500", () => {
    const result = parseLushaRateLimit(500, { "retry-after": "30" });
    expect(result.limited).toBe(false);
    expect(result.retryAfterSeconds).toBe(0);
  });
});

describe("createLushaClient", () => {
  test("sends api_key header on requests", async () => {
    const requests: Request[] = [];
    const client = createLushaClient({
      apiKey: "test_key_123",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify({ data: {} }), { status: 200 });
      },
    });
    await client.fetchJSON("/v2/person?email=test@example.com");
    expect(requests).toHaveLength(1);
    expect(requests[0].headers.get("api_key")).toBe("test_key_123");
    expect(requests[0].url).toBe("https://api.lusha.com/v2/person?email=test@example.com");
  });

  test("blocks disallowed hosts", async () => {
    const client = createLushaClient({
      apiKey: "test_key_123",
      fetch: async () => new Response("{}", { status: 200 }),
    });
    await expect(
      (client as unknown as { fetchJSON: (url: string) => Promise<unknown> }).fetchJSON.call(
        { ...client },
        "https://evil.com/v2/person"
      )
    ).rejects.toThrow();
  });

  test("parses JSON response body", async () => {
    const client = createLushaClient({
      apiKey: "test_key_123",
      fetch: async () => new Response(JSON.stringify({ data: { id: "abc" } }), { status: 200 }),
    });
    const result = await client.fetchJSON("/v2/person");
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ data: { id: "abc" } });
  });
});
