import { describe, expect, test } from "bun:test";
import { outcomeOf } from "../../_shared/test/path_segment_harness";
import { careersSubdomain } from "../src/http";

// SEC-SETUP-1: the Careers Site host is <company>.recruitee.com, so the company
// must be one label there ("a.evil.example" used to add labels).
const BAD = [".", "..", "", " ", "%2e", "a.evil.example", "evil.example/x", "a/b", "a\\b", "a?b", "a@b", "-acme", "acme:443", "http://acme"];
const GOOD = ["acme", " acme ", "ACME", "acme.recruitee.com", "https://acme.recruitee.com/", "acme/"];

describe("recruitee careers company", () => {
  test("stored spellings normalize to one label", () => {
    for (const value of GOOD) expect(careersSubdomain(value)).toBe("acme");
  });
  test("bad spellings make no request", async () => {
    for (const value of BAD) {
      const result = await outcomeOf("recruitee", "jobs.list", { accessToken: "t", company: value }, "sync");
      expect({ value, calls: result.calls.length, ok: result.ok }).toEqual({ value, calls: 0, ok: false });
    }
  });
  test("a good spelling reaches <company>.recruitee.com", async () => {
    for (const value of GOOD) {
      const result = await outcomeOf("recruitee", "jobs.list", { accessToken: "t", company: value }, "sync");
      expect(result.calls.map((c) => new URL(c.url).hostname)).toEqual(["acme.recruitee.com"]);
    }
  });
});
