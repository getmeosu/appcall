import { describe, expect, it } from "bun:test";
import { parseLinkedInRateLimit, parsePagingLinks } from "../src/http";

describe("parseLinkedInRateLimit", () => {
  it("detects 429 with retry-after header", () => {
    const result = parseLinkedInRateLimit(429, { "retry-after": "60" });
    expect(result.limited).toBe(true);
    if (result.limited) expect(result.retryAfterSeconds).toBe(60);
  });

  it("detects 429 with Retry-After header", () => {
    const result = parseLinkedInRateLimit(429, { "Retry-After": "120" });
    expect(result.limited).toBe(true);
    if (result.limited) expect(result.retryAfterSeconds).toBe(120);
  });

  it("defaults to 30 seconds when no retry-after on 429", () => {
    const result = parseLinkedInRateLimit(429, {});
    expect(result.limited).toBe(true);
    if (result.limited) expect(result.retryAfterSeconds).toBe(30);
  });

  it("does not flag 200", () => {
    const result = parseLinkedInRateLimit(200, {});
    expect(result.limited).toBe(false);
  });

  it("does not flag 401", () => {
    const result = parseLinkedInRateLimit(401, {});
    expect(result.limited).toBe(false);
  });
});

describe("parsePagingLinks", () => {
  it("extracts next start from paging links", () => {
    const result = parsePagingLinks({
      paging: {
        count: 10,
        start: 0,
        links: [{ rel: "next", uri: "/v2/posts?start=50&count=10" }],
      },
    });
    expect(result.nextStart).toBe(50);
    expect(result.count).toBe(10);
  });

  it("returns null when no next link", () => {
    const result = parsePagingLinks({
      paging: { count: 5, start: 0, links: [] },
    });
    expect(result.nextStart).toBeNull();
  });

  it("returns null for missing paging", () => {
    expect(parsePagingLinks({}).nextStart).toBeNull();
    expect(parsePagingLinks(null).nextStart).toBeNull();
  });
});
