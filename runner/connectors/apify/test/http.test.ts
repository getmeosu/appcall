import { describe, expect, test } from "bun:test";
import { parseApifyRateLimit, createApifyClient } from "../src/http";

describe("parseApifyRateLimit", () => {
  test("returns limited=false for 200", () => {
    const result = parseApifyRateLimit(200, {});
    expect(result.limited).toBe(false);
    expect(result.retryAfterSeconds).toBe(0);
  });

  test("returns limited=true with retry-after for 429", () => {
    const result = parseApifyRateLimit(429, { "retry-after": "30" });
    expect(result.limited).toBe(true);
    expect(result.retryAfterSeconds).toBe(30);
  });

  test("defaults to 10s retry when retry-after header is missing on 429", () => {
    const result = parseApifyRateLimit(429, {});
    expect(result.limited).toBe(true);
    expect(result.retryAfterSeconds).toBe(10);
  });

  test("defaults to 10s retry when retry-after is zero", () => {
    const result = parseApifyRateLimit(429, { "retry-after": "0" });
    expect(result.limited).toBe(true);
    expect(result.retryAfterSeconds).toBe(10);
  });

  test("returns limited=false for 500", () => {
    const result = parseApifyRateLimit(500, {});
    expect(result.limited).toBe(false);
  });
});

describe("createApifyClient", () => {
  test("throws OUTBOUND_HOST_NOT_ALLOWED for disallowed host via custom fetchText", async () => {
    // createConnectorHttpClient only allows api.apify.com.
    // We test this by constructing a client and overriding the underlying fetch
    // to try to reach a disallowed host directly at the http layer.
    const { createConnectorHttpClient } = await import("../../../bun/src/http");
    const httpClient = createConnectorHttpClient({
      allowedHosts: ["api.apify.com"],
      maxResponseBytes: 65536,
      fetch: async () => new Response("ok", { status: 200 }),
    });
    await expect(
      httpClient.fetchText("https://evil.com/anything")
    ).rejects.toMatchObject({ code: "OUTBOUND_HOST_NOT_ALLOWED" });
  });

  test("sends Authorization: Bearer header", async () => {
    const requests: Request[] = [];
    const client = createApifyClient({
      apiKey: "apify_api_secret",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify({ data: {} }), { status: 200 });
      },
    });
    await client.fetchJSON("/acts?my=1");
    expect(requests).toHaveLength(1);
    expect(requests[0].headers.get("Authorization")).toBe("Bearer apify_api_secret");
    expect(requests[0].url).toBe("https://api.apify.com/v2/acts?my=1");
  });

  test("does not follow redirects", async () => {
    const client = createApifyClient({
      apiKey: "test-key",
      fetch: async () => new Response(null, {
        status: 302,
        headers: { Location: "https://api.apify.com/v2/acts" },
      }),
    });
    await expect(client.fetchJSON("/acts?my=1")).rejects.toMatchObject({
      code: "OUTBOUND_REDIRECT_BLOCKED",
    });
  });
});
