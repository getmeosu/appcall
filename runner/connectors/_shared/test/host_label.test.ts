import { describe, expect, test } from "bun:test";
import { assertHostLabel, isUnsafePathSegment } from "../jobboard";

// SEC-PATH-2c-2 shared guards.
describe("assertHostLabel", () => {
  test("accepts one RFC 1123 label in any case and returns it lowercased", () => {
    expect(assertHostLabel("acme", "subdomain")).toBe("acme");
    expect(assertHostLabel("ACME-01", "subdomain")).toBe("acme-01");
    expect(assertHostLabel(" acme ", "subdomain")).toBe("acme");
    expect(assertHostLabel("a", "subdomain")).toBe("a");
    expect(assertHostLabel("a".repeat(63), "subdomain")).toBe("a".repeat(63));
  });

  const cases: Array<[unknown, string]> = [
    [undefined, "is required"], [42, "is required"], ["", "is required"], ["   ", "is required"],
    [".", "must not be a dot segment"], ["..", "must not be a dot segment"], [" .. ", "must not be a dot segment"],
    ["%2e", "must be a single hostname label"], ["%2E%2E", "must be a single hostname label"], ["-acme", "must be a single hostname label"],
    ["acme-", "must be a single hostname label"], ["a_b", "must be a single hostname label"], ["acme.evil", "must be a single hostname label"],
    ["a b", "must be a single hostname label"], ["a/b", "must be a single hostname label"], ["a".repeat(64), "must be a single hostname label"],
    ["acme:443", "must be a single hostname label"], ["ac\u00e9me", "must be a single hostname label"],
  ];
  for (const [value, detail] of cases) {
    test(`rejects ${JSON.stringify(value)} as INVALID_ACTION_INPUT`, () => {
      let thrown: any;
      try { assertHostLabel(value, "subdomain"); } catch (error) { thrown = error; }
      expect(thrown?.code).toBe("INVALID_ACTION_INPUT");
      expect(thrown?.message).toContain(`subdomain ${detail}`);
    });
  }
});

describe("isUnsafePathSegment", () => {
  for (const bad of [undefined, 1, "", " ", "\t", ".", "..", " . ", "%2e", "%2E%2e", ".%2e", "%20", "a/b", "a\\b", "%2f", "a\u0000"]) {
    test(`flags ${JSON.stringify(bad)}`, () => expect(isUnsafePathSegment(bad)).toBe(true));
  }
  for (const ok of ["abc", "a.b", "...a", "uuid-1234", "a%2", "%zz"]) {
    test(`allows ${JSON.stringify(ok)}`, () => expect(isUnsafePathSegment(ok)).toBe(false));
  }
});
