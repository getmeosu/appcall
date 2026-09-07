import { describe, expect, test } from "bun:test";
import visitorFixture from "../fixtures/visitor_identified.json";
import visitorPartialFixture from "../fixtures/visitor_identified_partial.json";
import {
  parseVisitors,
  getHealthcheck,
  validateVisitorsParseInput,
  validateHealthcheckInput,
} from "../src/actions";

// ─── visitors.parse ───────────────────────────────────────────────────────────

describe("parseVisitors", () => {
  test("validates input and returns normalized visitor (no network)", () => {
    const result = parseVisitors({ payload: visitorFixture });

    expect(result.connector).toBe("rb2b");
    expect(result.action).toBe("visitors.parse");
    expect(result.source).toBe("connector");
    expect(result.visitor).toBeDefined();
    const visitor = result.visitor as Record<string, unknown>;
    expect(visitor.firstName).toBe("John");
    expect(visitor.lastName).toBe("Smith");
    expect(visitor.fullName).toBe("John Smith");
    expect(visitor.workEmail).toBe("john.smith@acmecorp.com");
    expect(visitor.company).toBe("Acme Corp");
    expect(visitor.title).toBe("VP of Engineering");
    expect(visitor.location).toBe("San Francisco, California");
    expect(visitor.provider).toBe("rb2b");
    expect(visitor.modelVersion).toBe("2026-05-17");
  });

  test("works with partial payload", () => {
    const result = parseVisitors({ payload: visitorPartialFixture });

    expect(result.connector).toBe("rb2b");
    const visitor = result.visitor as Record<string, unknown>;
    expect(visitor.firstName).toBe("");
    expect(visitor.workEmail).toBe("someone@somecorp.io");
  });

  test("works with empty payload object", () => {
    const result = parseVisitors({ payload: {} });

    expect(result.connector).toBe("rb2b");
    const visitor = result.visitor as Record<string, unknown>;
    expect(visitor.firstName).toBe("");
    expect(visitor.id).toBe("rb2b-visitor:unknown");
  });

  test("works even when apiKey is present (no network call)", () => {
    const result = parseVisitors({ payload: visitorFixture, apiKey: "test-key" });

    expect(result.connector).toBe("rb2b");
    expect(result.action).toBe("visitors.parse");
    const visitor = result.visitor as Record<string, unknown>;
    expect(visitor.firstName).toBe("John");
  });

  test("throws when payload is missing", () => {
    expect(() => validateVisitorsParseInput({})).toThrow("payload is required");
  });

  test("throws when payload is not an object", () => {
    expect(() => validateVisitorsParseInput({ payload: "string" })).toThrow("payload is required");
  });

  test("throws when input is not an object", () => {
    expect(() => validateVisitorsParseInput("bad")).toThrow("visitors.parse input must be an object");
  });

  test("throws when input is null", () => {
    expect(() => validateVisitorsParseInput(null)).toThrow("visitors.parse input must be an object");
  });

  test("visitedPages from fixture have url and timestamp", () => {
    const result = parseVisitors({ payload: visitorFixture });
    const visitor = result.visitor as Record<string, unknown>;
    const pages = visitor.visitedPages as Array<{ url: string; timestamp: string }>;
    expect(pages).toHaveLength(2);
    expect(pages[0].url).toBe("https://example.com/pricing");
    expect(pages[1].url).toBe("https://example.com/");
  });
});

// ─── healthcheck ──────────────────────────────────────────────────────────────

describe("getHealthcheck", () => {
  test("returns ok status without credentials", () => {
    const result = getHealthcheck({});
    expect(result.connector).toBe("rb2b");
    expect(result.action).toBe("healthcheck");
    expect(result.source).toBe("connector");
    expect(result.status).toBe("ok");
  });

  test("throws when input is not an object", () => {
    expect(() => validateHealthcheckInput("bad")).toThrow("healthcheck input must be an object");
  });

  test("returns ok even when apiKey is present (no network call)", () => {
    const result = getHealthcheck({ apiKey: "test-key" });
    expect(result.status).toBe("ok");
  });
});
