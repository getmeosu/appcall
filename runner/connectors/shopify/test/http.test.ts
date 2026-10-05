import { describe, expect, test } from "bun:test";
import {
  createShopifyClient,
  parseShopifyRateLimit,
  SHOPIFY_ADMIN_API_PREFIX,
  SHOPIFY_API_VERSION,
} from "../src/http";

describe("parseShopifyRateLimit", () => {
  test("returns limited false for 200 with no rate limit header", () => {
    expect(parseShopifyRateLimit(200, {})).toEqual({ limited: false, retryAfterSeconds: 0 });
  });

  test("returns limited false for 200 with remaining capacity", () => {
    expect(parseShopifyRateLimit(200, { "x-shopify-shop-api-call-limit": "20/40" })).toEqual({
      limited: false,
      retryAfterSeconds: 0,
    });
  });

  test("returns limited true when call limit is fully consumed", () => {
    expect(parseShopifyRateLimit(200, { "x-shopify-shop-api-call-limit": "40/40" })).toEqual({
      limited: true,
      retryAfterSeconds: 2,
    });
  });

  test("returns limited true when call limit is exceeded", () => {
    expect(parseShopifyRateLimit(200, { "x-shopify-shop-api-call-limit": "41/40" })).toEqual({
      limited: true,
      retryAfterSeconds: 2,
    });
  });

  test("returns limited false for 200 with malformed rate limit header", () => {
    expect(parseShopifyRateLimit(200, { "x-shopify-shop-api-call-limit": "bad" })).toEqual({
      limited: false,
      retryAfterSeconds: 0,
    });
  });

  test("returns limited true with retry-after header on 429", () => {
    expect(parseShopifyRateLimit(429, { "retry-after": "5" })).toEqual({
      limited: true,
      retryAfterSeconds: 5,
    });
  });

  test("defaults to 2 seconds when retry-after header is missing on 429", () => {
    expect(parseShopifyRateLimit(429, {})).toEqual({
      limited: true,
      retryAfterSeconds: 2,
    });
  });

  test("defaults to 2 seconds when retry-after header is zero on 429", () => {
    expect(parseShopifyRateLimit(429, { "retry-after": "0" })).toEqual({
      limited: true,
      retryAfterSeconds: 2,
    });
  });

  test("returns limited false for non-429 status", () => {
    expect(parseShopifyRateLimit(401, {})).toEqual({ limited: false, retryAfterSeconds: 0 });
  });
});


describe("shopify Admin API version pin", () => {
  test("pins Admin API 2026-10 (2025-01 past support window)", () => {
    expect(SHOPIFY_API_VERSION).toBe("2026-10");
    expect(SHOPIFY_ADMIN_API_PREFIX).toBe("/admin/api/2026-10");
  });

  test("sends requests to /admin/api/2026-10/", async () => {
    const calls: { url: string; token: string | null }[] = [];
    const client = createShopifyClient({
      accessToken: "shpat_test-token",
      shopDomain: "my-test-store",
      fetch: (async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        calls.push({ url, token: new Headers(init?.headers).get("X-Shopify-Access-Token") });
        return new Response(JSON.stringify({ products: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }) as typeof fetch,
    });

    const res = await client.fetchJSON("/products.json");
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.origin).toBe("https://my-test-store.myshopify.com");
    expect(url.pathname).toBe("/admin/api/2026-10/products.json");
    expect(url.pathname.startsWith("/admin/api/2026-10/")).toBe(true);
    expect(calls[0].url).toContain("/admin/api/2026-10/");
    expect(calls[0].url).not.toContain("/admin/api/2025-01/");
    expect(calls[0].token).toBe("shpat_test-token");
  });
});
