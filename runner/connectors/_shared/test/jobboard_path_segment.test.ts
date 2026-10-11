import { describe, expect, test } from "bun:test";
import { assertSafePathSegment } from "../jobboard";

describe("assertSafePathSegment", () => {
  test("accepts ordinary ids, including ones that contain dots", () => {
    for (const ok of ["abc", "J1", "5f0c7e2ab1cd2e0001d63a9a", "86272861-2022-40fa-aa21-ba081f329133", "v1.2", ".hidden", "a..b", "a.", "_", "-"]) {
      expect(assertSafePathSegment(ok, "id")).toBe(ok);
    }
    expect(assertSafePathSegment("  abc  ", "id")).toBe("abc");
  });

  test("rejects dot segments ('.', '..', '...', any run of dots)", () => {
    for (const bad of [".", "..", "...", "....", " .. ", "\t.\n"]) {
      expect(() => assertSafePathSegment(bad, "id")).toThrow("id must not be a dot segment");
    }
  });

  test("rejects empty and whitespace-only input", () => {
    for (const bad of ["", " ", "\t\n "]) {
      expect(() => assertSafePathSegment(bad, "id")).toThrow("id is required");
    }
  });

  test("rejects percent-encoded traversal and separators (input is never decoded)", () => {
    for (const bad of ["%2e%2e", "%2E%2E", "%2e", ".%2e", "%2f", "%2F", "a%2fb", "..%2f", "%5c"]) {
      expect(() => assertSafePathSegment(bad, "id")).toThrow("may only contain");
    }
  });

  test("rejects separators and other structure-changing characters", () => {
    for (const bad of ["a/b", "../x", "a\\b", "a@b", "a?b", "a#b", "a b", "a:b"]) {
      expect(() => assertSafePathSegment(bad, "id")).toThrow("may only contain");
    }
  });
});
