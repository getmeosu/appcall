import { describe, expect, test } from "bun:test";
import { assertNoTraversalSegment, encodePathSegment } from "../jobboard";

describe("assertNoTraversalSegment", () => {
  test("keeps provider ids with characters outside the strict charset, unchanged", () => {
    for (const ok of [
      "abc", "J1", "PROJ-123", "a+b@example.com", "urn:li:sponsoredAccount:123", "act_123",
      "ab+cd==", "557058:f58131cb-b67d-43c7-b30d-6b58d40bd077", "v1.2", "a..b", ".hidden",
      "name with spaces", " padded ", "%2e%2e", "ümlaut", "a?b#c",
    ]) {
      expect(assertNoTraversalSegment(ok, "id")).toBe(ok);
    }
  });

  test("stringifies finite numbers", () => {
    expect(assertNoTraversalSegment(10001, "id")).toBe("10001");
    expect(assertNoTraversalSegment(0, "id")).toBe("0");
  });

  test("rejects dot segments", () => {
    for (const bad of [".", "..", "...", " .. ", "\t.\t"]) {
      expect(() => assertNoTraversalSegment(bad, "id")).toThrow("id must not be a dot segment");
    }
  });

  test("rejects empty, whitespace-only and non-string values", () => {
    for (const bad of ["", " ", "\t\n", undefined, null, {}, [], Number.NaN, Number.POSITIVE_INFINITY, true]) {
      expect(() => assertNoTraversalSegment(bad, "id")).toThrow("id is required");
    }
  });

  test("rejects path separators", () => {
    for (const bad of ["a/b", "../x", "x/..", "/", "a\\b", "..\\x"]) {
      expect(() => assertNoTraversalSegment(bad, "id")).toThrow("id must not contain path separators");
    }
  });

  test("rejects control characters", () => {
    for (const bad of ["a\u0000b", "a\nb", "a\rb", "a\u007fb", "a\u0085b"]) {
      expect(() => assertNoTraversalSegment(bad, "id")).toThrow("id must not contain control characters");
    }
  });
});

describe("encodePathSegment", () => {
  test("guards then percent-encodes, so pre-encoded traversal cannot survive", () => {
    expect(encodePathSegment("a+b@example.com", "email")).toBe("a%2Bb%40example.com");
    expect(encodePathSegment("urn:li:person:1", "urn")).toBe("urn%3Ali%3Aperson%3A1");
    expect(encodePathSegment("%2e%2e", "id")).toBe("%252e%252e");
    expect(new URL(`https://api.example.test/v1/items/${encodePathSegment("%2e%2e", "id")}/x`).pathname)
      .toBe("/v1/items/%252e%252e/x");
    expect(() => encodePathSegment("..", "id")).toThrow("dot segment");
  });
});
