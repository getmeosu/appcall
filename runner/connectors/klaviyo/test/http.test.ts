import { describe, expect, it } from "bun:test";
import { parseKlaviyoRateLimit, extractCursorFromUrl, parseNextCursor, prop, isRecord } from "../src/http";

describe("parseKlaviyoRateLimit", () => {
  it("detects 429 rate limit", () => {
    const result = parseKlaviyoRateLimit(429, {});
    expect(result.limited).toBe(true);
    expect(result.retryAfterSeconds).toBe(30);
  });

  it("does not flag 200", () => {
    const result = parseKlaviyoRateLimit(200, {});
    expect(result.limited).toBe(false);
    expect(result.retryAfterSeconds).toBe(0);
  });

  it("does not flag 401", () => {
    const result = parseKlaviyoRateLimit(401, {});
    expect(result.limited).toBe(false);
  });

  it("does not flag 500", () => {
    const result = parseKlaviyoRateLimit(500, {});
    expect(result.limited).toBe(false);
  });

  it("ignores headers (always returns 30 for 429)", () => {
    const result = parseKlaviyoRateLimit(429, { "retry-after": "120" });
    expect(result.limited).toBe(true);
    expect(result.retryAfterSeconds).toBe(30);
  });
});

describe("extractCursorFromUrl", () => {
  it("extracts cursor from URL-encoded page[cursor] param", () => {
    const result = extractCursorFromUrl(
      "https://a.klaviyo.com/api/profiles/?page%5Bcursor%5D=xyz_cursor_abc"
    );
    expect(result).toBe("xyz_cursor_abc");
  });

  it("extracts cursor from URL with additional query params", () => {
    const result = extractCursorFromUrl(
      "https://a.klaviyo.com/api/profiles/?page%5Bcursor%5D=abc123&sort=-created"
    );
    expect(result).toBe("abc123");
  });

  it("returns null when cursor parameter is absent", () => {
    const result = extractCursorFromUrl("https://a.klaviyo.com/api/profiles/");
    expect(result).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractCursorFromUrl("")).toBeNull();
  });

  it("returns null for URL without encoding", () => {
    // The regex specifically looks for the encoded form
    expect(extractCursorFromUrl("https://a.klaviyo.com/api/profiles/?page[cursor]=abc")).toBeNull();
  });
});

describe("parseNextCursor", () => {
  it("returns the next URL from response.links.next", () => {
    const result = parseNextCursor({
      links: { next: "https://a.klaviyo.com/api/profiles/?page%5Bcursor%5D=abc" },
    });
    expect(result).toBe("https://a.klaviyo.com/api/profiles/?page%5Bcursor%5D=abc");
  });

  it("returns null when links is missing", () => {
    expect(parseNextCursor({})).toBeNull();
  });

  it("returns null when links is not a record", () => {
    expect(parseNextCursor({ links: "string" })).toBeNull();
  });

  it("returns null when next is empty string", () => {
    expect(parseNextCursor({ links: { next: "" } })).toBeNull();
  });

  it("returns null for non-object input", () => {
    expect(parseNextCursor(null)).toBeNull();
    expect(parseNextCursor("string")).toBeNull();
    expect(parseNextCursor(42)).toBeNull();
  });
});

describe("prop helper", () => {
  it("returns string value when present", () => {
    expect(prop({ name: "Alice" }, "name")).toBe("Alice");
  });

  it("returns fallback when field is missing", () => {
    expect(prop({}, "name")).toBe("");
  });

  it("returns fallback when field is not a string", () => {
    expect(prop({ name: 42 }, "name")).toBe("");
    expect(prop({ name: null }, "name")).toBe("");
  });

  it("uses custom fallback", () => {
    expect(prop({}, "name", "unknown")).toBe("unknown");
  });
});

describe("isRecord", () => {
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
