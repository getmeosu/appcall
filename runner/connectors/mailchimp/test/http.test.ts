import { describe, expect, it } from "bun:test";
import { extractDataCenter, parseMailchimpRateLimit, prop, isRecord } from "../src/http";

describe("extractDataCenter", () => {
  it("extracts data center from api key like us19abcdef1234", () => {
    expect(extractDataCenter("us19abcdef1234")).toBe("us19");
  });

  it("extracts data center from us1 key", () => {
    expect(extractDataCenter("us1abc123def")).toBe("us1");
  });

  it("extracts data center from eu1 key", () => {
    expect(extractDataCenter("eu1abc123def456")).toBe("eu1");
  });

  it("defaults to us1 for unrecognized format", () => {
    expect(extractDataCenter("invalid-key")).toBe("us1");
  });
});

describe("parseMailchimpRateLimit", () => {
  it("detects 429 with x-ratelimit-reset header in the future", () => {
    const reset = Math.floor(Date.now() / 1000) + 30;
    const result = parseMailchimpRateLimit(429, { "x-ratelimit-reset": String(reset) });
    expect(result.limited).toBe(true);
    expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(25);
    expect(result.retryAfterSeconds).toBeLessThanOrEqual(35);
  });

  it("detects 429 with past reset defaults to 10 seconds", () => {
    const result = parseMailchimpRateLimit(429, { "x-ratelimit-reset": "0" });
    expect(result.limited).toBe(true);
    expect(result.retryAfterSeconds).toBe(10);
  });

  it("detects 429 without reset header defaults to 10 seconds", () => {
    const result = parseMailchimpRateLimit(429, {});
    expect(result.limited).toBe(true);
    expect(result.retryAfterSeconds).toBe(10);
  });

  it("does not flag 200", () => {
    const result = parseMailchimpRateLimit(200, {});
    expect(result.limited).toBe(false);
    expect(result.retryAfterSeconds).toBe(0);
  });
});

describe("prop helper", () => {
  it("returns string value", () => {
    expect(prop({ email: "a@b.com" }, "email")).toBe("a@b.com");
  });

  it("returns empty string for missing key", () => {
    expect(prop({}, "missing")).toBe("");
  });

  it("returns fallback for missing key", () => {
    expect(prop({}, "missing", "default")).toBe("default");
  });

  it("returns empty string for non-string value", () => {
    expect(prop({ count: 42 }, "count")).toBe("");
  });
});

describe("isRecord helper", () => {
  it("returns true for plain objects", () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1 })).toBe(true);
  });

  it("returns false for null", () => {
    expect(isRecord(null)).toBe(false);
  });

  it("returns false for arrays", () => {
    expect(isRecord([1, 2, 3])).toBe(false);
  });

  it("returns false for primitives", () => {
    expect(isRecord("string")).toBe(false);
    expect(isRecord(42)).toBe(false);
    expect(isRecord(true)).toBe(false);
  });
});
