import { describe, expect, test } from "bun:test";
import { parseShopifyRateLimit } from "../src/http";

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
