import { describe, expect, it } from "bun:test";
import { parseHubSpotRateLimit, parseNextPageCursor, prop, propNum, propBool } from "../src/http";
import rateLimited from "../fixtures/rate_limited.json";

describe("parseHubSpotRateLimit", () => {
  it("detects 429 with retry-after header", () => {
    const result = parseHubSpotRateLimit(429, { "retry-after": "30" });
    expect(result.limited).toBe(true);
    if (result.limited) expect(result.retryAfterSeconds).toBe(30);
  });

  it("detects 429 with Retry-After header", () => {
    const result = parseHubSpotRateLimit(429, { "Retry-After": "60" });
    expect(result.limited).toBe(true);
    if (result.limited) expect(result.retryAfterSeconds).toBe(60);
  });

  it("defaults to 10 seconds when no retry-after on 429", () => {
    const result = parseHubSpotRateLimit(429, {});
    expect(result.limited).toBe(true);
    if (result.limited) expect(result.retryAfterSeconds).toBe(10);
  });

  it("detects 403 with zero remaining", () => {
    const result = parseHubSpotRateLimit(403, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1700000000" });
    expect(result.limited).toBe(true);
  });

  it("does not flag 403 with remaining quota", () => {
    const result = parseHubSpotRateLimit(403, { "x-ratelimit-remaining": "50" });
    expect(result.limited).toBe(false);
  });

  it("does not flag 200", () => {
    const result = parseHubSpotRateLimit(200, {});
    expect(result.limited).toBe(false);
  });
});

describe("parseNextPageCursor", () => {
  it("extracts after cursor", () => {
    const cursor = parseNextPageCursor({ paging: { next: { after: "abc123" } } });
    expect(cursor).toBe("abc123");
  });

  it("returns null when no paging", () => {
    expect(parseNextPageCursor({})).toBeNull();
  });

  it("returns null for empty after", () => {
    expect(parseNextPageCursor({ paging: { next: { after: "" } } })).toBeNull();
  });

  it("returns null for non-object input", () => {
    expect(parseNextPageCursor("string")).toBeNull();
    expect(parseNextPageCursor(null)).toBeNull();
  });
});

describe("prop helper", () => {
  const obj = { id: "1", properties: { email: "a@b.com", phone: null }, createdAt: "", updatedAt: "", archived: false };

  it("returns string value", () => {
    expect(prop(obj as any, "email")).toBe("a@b.com");
  });

  it("returns empty string for null", () => {
    expect(prop(obj as any, "phone")).toBe("");
  });

  it("returns fallback for missing key", () => {
    expect(prop(obj as any, "missing")).toBe("");
    expect(prop(obj as any, "missing", "default")).toBe("default");
  });
});

describe("propNum helper", () => {
  const obj = { id: "1", properties: { amount: "50000", bad: "not-a-number" }, createdAt: "", updatedAt: "", archived: false };

  it("parses numeric string", () => {
    expect(propNum(obj as any, "amount")).toBe(50000);
  });

  it("returns fallback for non-numeric string", () => {
    expect(propNum(obj as any, "bad")).toBe(0);
    expect(propNum(obj as any, "missing")).toBe(0);
    expect(propNum(obj as any, "missing", 42)).toBe(42);
  });
});

describe("propBool helper", () => {
  const obj = { id: "1", properties: { active: "true", inactive: "false", other: "maybe" }, createdAt: "", updatedAt: "", archived: false };

  it("returns true for 'true' string", () => {
    expect(propBool(obj as any, "active")).toBe(true);
  });

  it("returns false for non-'true' string", () => {
    expect(propBool(obj as any, "inactive")).toBe(false);
    expect(propBool(obj as any, "other")).toBe(false);
  });
});
