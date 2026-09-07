import { describe, expect, test } from "bun:test";
import { parseWooCommerceRateLimit, prop, propStr, propNum } from "../src/http";

describe("parseWooCommerceRateLimit", () => {
  test("returns limited false for non-429 status", () => {
    expect(parseWooCommerceRateLimit(200, {})).toEqual({ limited: false, retryAfterSeconds: 0 });
  });

  test("returns limited false for 401 status", () => {
    expect(parseWooCommerceRateLimit(401, {})).toEqual({ limited: false, retryAfterSeconds: 0 });
  });

  test("returns limited true with retry-after header value on 429", () => {
    expect(parseWooCommerceRateLimit(429, { "retry-after": "60" })).toEqual({
      limited: true,
      retryAfterSeconds: 60,
    });
  });

  test("defaults to 10 seconds when retry-after header is missing on 429", () => {
    expect(parseWooCommerceRateLimit(429, {})).toEqual({
      limited: true,
      retryAfterSeconds: 10,
    });
  });

  test("defaults to 10 seconds when retry-after header is zero on 429", () => {
    expect(parseWooCommerceRateLimit(429, { "retry-after": "0" })).toEqual({
      limited: true,
      retryAfterSeconds: 10,
    });
  });

  test("defaults to 10 seconds when retry-after header is negative on 429", () => {
    expect(parseWooCommerceRateLimit(429, { "retry-after": "-5" })).toEqual({
      limited: true,
      retryAfterSeconds: 10,
    });
  });

  test("parses non-integer retry-after header on 429", () => {
    expect(parseWooCommerceRateLimit(429, { "retry-after": "15.5" })).toEqual({
      limited: true,
      retryAfterSeconds: 15.5,
    });
  });

  test("ignores retry-after header on non-429 status", () => {
    expect(parseWooCommerceRateLimit(200, { "retry-after": "60" })).toEqual({
      limited: false,
      retryAfterSeconds: 0,
    });
  });
});

describe("prop", () => {
  test("returns string value for existing string field", () => {
    expect(prop({ name: "T-Shirt" }, "name")).toBe("T-Shirt");
  });

  test("returns fallback for missing field", () => {
    expect(prop({ name: "T-Shirt" }, "missing")).toBe("");
  });

  test("returns custom fallback for missing field", () => {
    expect(prop({}, "status", "unknown")).toBe("unknown");
  });

  test("returns fallback for non-string field", () => {
    expect(prop({ count: 42 }, "count")).toBe("");
  });
});

describe("propStr", () => {
  test("returns string value for existing string field", () => {
    expect(propStr({ name: "T-Shirt" }, "name")).toBe("T-Shirt");
  });

  test("converts number to string", () => {
    expect(propStr({ id: 123 }, "id")).toBe("123");
  });

  test("returns fallback for missing field", () => {
    expect(propStr({}, "missing")).toBe("");
  });

  test("returns custom fallback for missing field", () => {
    expect(propStr({}, "id", "unknown")).toBe("unknown");
  });

  test("returns fallback for non-string non-number field", () => {
    expect(propStr({ bad: true }, "bad")).toBe("");
  });
});

describe("propNum", () => {
  test("returns number value for existing number field", () => {
    expect(propNum({ stock_quantity: 100 }, "stock_quantity")).toBe(100);
  });

  test("returns parsed number for string number field", () => {
    expect(propNum({ price: "29.99" }, "price")).toBe(29.99);
  });

  test("returns fallback for missing field", () => {
    expect(propNum({}, "missing")).toBe(0);
  });

  test("returns custom fallback for missing field", () => {
    expect(propNum({}, "missing", 42)).toBe(42);
  });

  test("returns fallback for NaN string", () => {
    expect(propNum({ bad: "not-a-number" }, "bad")).toBe(0);
  });

  test("returns fallback for non-number non-string field", () => {
    expect(propNum({ bad: true }, "bad")).toBe(0);
  });
});
