import { describe, expect, it } from "bun:test";
import { parseSendGridRateLimit, prop } from "../src/http";

describe("parseSendGridRateLimit", () => {
  it("detects 429 with x-ratelimit-reset in the future", () => {
    const futureReset = Math.floor(Date.now() / 1000) + 60;
    const result = parseSendGridRateLimit(429, { "x-ratelimit-reset": String(futureReset) });
    expect(result.limited).toBe(true);
    expect(result.retryAfterSeconds).toBe(60);
  });

  it("detects 429 with x-ratelimit-reset in the past, falls back to retry-after", () => {
    const pastReset = Math.floor(Date.now() / 1000) - 30;
    const result = parseSendGridRateLimit(429, { "x-ratelimit-reset": String(pastReset), "retry-after": "45" });
    expect(result.limited).toBe(true);
    expect(result.retryAfterSeconds).toBe(45);
  });

  it("detects 429 with retry-after when no x-ratelimit-reset", () => {
    const result = parseSendGridRateLimit(429, { "retry-after": "20" });
    expect(result.limited).toBe(true);
    expect(result.retryAfterSeconds).toBe(20);
  });

  it("defaults to 10 seconds when no headers on 429", () => {
    const result = parseSendGridRateLimit(429, {});
    expect(result.limited).toBe(true);
    expect(result.retryAfterSeconds).toBe(10);
  });

  it("defaults to 10 seconds when retry-after is zero on 429", () => {
    const pastReset = Math.floor(Date.now() / 1000) - 10;
    const result = parseSendGridRateLimit(429, { "x-ratelimit-reset": String(pastReset), "retry-after": "0" });
    expect(result.limited).toBe(true);
    expect(result.retryAfterSeconds).toBe(10);
  });

  it("does not flag 200", () => {
    const result = parseSendGridRateLimit(200, {});
    expect(result.limited).toBe(false);
    expect(result.retryAfterSeconds).toBe(0);
  });

  it("does not flag 401", () => {
    const result = parseSendGridRateLimit(401, {});
    expect(result.limited).toBe(false);
    expect(result.retryAfterSeconds).toBe(0);
  });

  it("does not flag 500", () => {
    const result = parseSendGridRateLimit(500, {});
    expect(result.limited).toBe(false);
    expect(result.retryAfterSeconds).toBe(0);
  });

  it("handles x-ratelimit-reset of 0", () => {
    const result = parseSendGridRateLimit(429, { "x-ratelimit-reset": "0", "retry-after": "15" });
    expect(result.limited).toBe(true);
    // reset=0, now > 0 so retryAfter = max(0, 0 - now) = 0, falls back to retry-after=15
    expect(result.retryAfterSeconds).toBe(15);
  });
});

describe("prop", () => {
  it("returns string value", () => {
    expect(prop({ name: "test" }, "name")).toBe("test");
  });

  it("returns empty string for missing key", () => {
    expect(prop({}, "name")).toBe("");
  });

  it("returns empty string for non-string value", () => {
    expect(prop({ name: 123 }, "name")).toBe("");
  });

  it("returns empty string for null value", () => {
    expect(prop({ name: null }, "name")).toBe("");
  });

  it("uses custom fallback", () => {
    expect(prop({}, "name", "default")).toBe("default");
  });

  it("returns actual string value even when fallback is provided", () => {
    expect(prop({ name: "actual" }, "name", "default")).toBe("actual");
  });
});
