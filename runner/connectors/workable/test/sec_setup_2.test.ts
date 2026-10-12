import { describe, expect, test } from "bun:test";
import { outcomeOf } from "../../_shared/test/path_segment_harness";

// SEC-SETUP-2 (item 3): the account accepts https:// and the full host.
const GOOD = ["acme", "https://acme", "acme.workable.com", "https://ACME.workable.com/", "acme/"];
const BAD = ["http://acme", "acme.evil.com", "acme.workable.com.evil.com", "acme.workable.com/x", "https://"];
const OPS: Array<[string, Record<string, unknown>, "action" | "sync" | "healthcheck"]> = [
  ["departments.list", {}, "action"],
  ["jobs.list", {}, "sync"],
  ["healthcheck", {}, "healthcheck"],
];

describe("workable SEC-SETUP-2 account spellings", () => {
  for (const [op, extra, kind] of OPS) {
    test(`${kind} ${op} normalizes https:// and the full host`, async () => {
      for (const value of GOOD) {
        const result = await outcomeOf("workable", op, { accessToken: "tok", ...extra, account: value }, kind);
        expect(result.calls.length, `${op} ${value}`).toBeGreaterThan(0);
        expect(new URL(result.calls[0]!.url).hostname).toBe("acme.workable.com");
      }
    });
    test(`${kind} ${op} still rejects other shapes with 0 fetches`, async () => {
      for (const value of BAD) {
        const result = await outcomeOf("workable", op, { accessToken: "tok", ...extra, account: value }, kind);
        expect({ value, calls: result.calls.length, ok: result.ok }).toEqual({ value, calls: 0, ok: false });
      }
    });
  }
});
