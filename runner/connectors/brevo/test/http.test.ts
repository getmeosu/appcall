import { describe, expect, test } from "bun:test";
import { parseBrevoRateLimit } from "../src/http";

describe("parseBrevoRateLimit", () => {
  test("returns limited false for non-429 status", () => {
    expect(parseBrevoRateLimit(200, {})).toEqual({ limited: false, retryAfterSeconds: 0 });
  });

  test("returns limited false for 401 status", () => {
    expect(parseBrevoRateLimit(401, {})).toEqual({ limited: false, retryAfterSeconds: 0 });
  });

  test("returns limited true with retry-after header value on 429", () => {
    expect(parseBrevoRateLimit(429, { "retry-after": "60" })).toEqual({
      limited: true,
      retryAfterSeconds: 60,
    });
  });

  test("defaults to 10 seconds when retry-after header is missing on 429", () => {
    expect(parseBrevoRateLimit(429, {})).toEqual({
      limited: true,
      retryAfterSeconds: 10,
    });
  });

  test("defaults to 10 seconds when retry-after header is zero on 429", () => {
    expect(parseBrevoRateLimit(429, { "retry-after": "0" })).toEqual({
      limited: true,
      retryAfterSeconds: 10,
    });
  });

  test("defaults to 10 seconds when retry-after header is negative on 429", () => {
    expect(parseBrevoRateLimit(429, { "retry-after": "-5" })).toEqual({
      limited: true,
      retryAfterSeconds: 10,
    });
  });

  test("parses non-integer retry-after header on 429", () => {
    expect(parseBrevoRateLimit(429, { "retry-after": "15.5" })).toEqual({
      limited: true,
      retryAfterSeconds: 15.5,
    });
  });

  test("ignores retry-after header on non-429 status", () => {
    expect(parseBrevoRateLimit(200, { "retry-after": "60" })).toEqual({
      limited: false,
      retryAfterSeconds: 0,
    });
  });
});
