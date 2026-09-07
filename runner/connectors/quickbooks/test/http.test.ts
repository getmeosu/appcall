import { describe, expect, test } from "bun:test";
import { parseQuickBooksRateLimit, createQuickBooksClient } from "../src/http";

describe("quickbooks http - rate limit parsing", () => {
  test("parses 429 as rate limited with 30 second default retry", () => {
    const result = parseQuickBooksRateLimit(429, {});
    expect(result.limited).toBe(true);
    if (result.limited) {
      expect(result.retryAfterSeconds).toBe(30);
    }
  });

  test("parses 429 with rate-limit-remaining header", () => {
    const result = parseQuickBooksRateLimit(429, { "rate-limit-remaining": "0" });
    expect(result.limited).toBe(true);
    if (result.limited) {
      expect(result.retryAfterSeconds).toBe(30);
    }
  });

  test("returns not limited for 200", () => {
    expect(parseQuickBooksRateLimit(200, {})).toEqual({ limited: false });
  });

  test("returns not limited for 401", () => {
    expect(parseQuickBooksRateLimit(401, {})).toEqual({ limited: false });
  });

  test("returns not limited for 500", () => {
    expect(parseQuickBooksRateLimit(500, {})).toEqual({ limited: false });
  });
});

describe("quickbooks http - client creation", () => {
  test("creates client with correct base URL including realmId", () => {
    const client = createQuickBooksClient({
      accessToken: "test-token",
      realmId: "123456789",
      fetch: async () => new Response("{}", { status: 200 }),
    });

    expect(client.baseUrl).toBe("https://quickbooks.api.intuit.com/v3/company/123456789");
  });

  test("client fetchJSON sends Authorization header", async () => {
    const requests: Request[] = [];
    const client = createQuickBooksClient({
      accessToken: "test-access-token",
      realmId: "123456789",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return Response.json({ Invoice: [], totalCount: 0 });
      },
    });

    const result = await client.fetchJSON("/query?query=SELECT * FROM Invoice");

    expect(requests).toHaveLength(1);
    expect(requests[0].headers.get("Authorization")).toBe("Bearer test-access-token");
    expect(requests[0].headers.get("Content-Type")).toBe("application/json");
    expect(requests[0].url).toContain("quickbooks.api.intuit.com/v3/company/123456789");
    expect(result.status).toBe(200);
  });

  test("client fetchJSON parses JSON response body", async () => {
    const client = createQuickBooksClient({
      accessToken: "test-token",
      realmId: "123456789",
      fetch: async () => Response.json({ Invoice: [{ Id: "1" }], totalCount: 1 }),
    });

    const result = await client.fetchJSON("/query?query=SELECT * FROM Invoice");

    expect(result.body).toEqual({ Invoice: [{ Id: "1" }], totalCount: 1 });
  });

  test("client fetchJSON handles non-JSON response", async () => {
    const client = createQuickBooksClient({
      accessToken: "test-token",
      realmId: "123456789",
      fetch: async () => new Response("not json", { status: 200 }),
    });

    const result = await client.fetchJSON("/query?query=SELECT * FROM Invoice");

    expect(result.body).toBe("not json");
  });
});
