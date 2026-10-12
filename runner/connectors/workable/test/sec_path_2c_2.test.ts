import { describe, expect, test } from "bun:test";
import { outcomeOf } from "../../_shared/test/path_segment_harness";
import manifest from "../manifest.json";

// SEC-PATH-2c-2: the account credential is the leftmost label of
// https://{account}.workable.com. Before this fix the manifest-driven actions
// rendered "." to https://..workable.com and the sync client accepted "a.b",
// "-a" and "a_b". Actions, syncs and the healthcheck now require one RFC 1123
// label and reject anything else with INVALID_ACTION_INPUT before any request.
const BAD = [".", "..", " . ", "", " ", "%2e", "%2E%2E", "-acme", "acme-", "a_b", "acme.evil", "acme.evil.com", "a b", "a".repeat(64)];
const OPS: Array<[string, Record<string, unknown>, "action" | "sync" | "healthcheck"]> = [
  ["departments.list", {}, "action"],
  ["employees.get", { employeeId: "E1" }, "action"],
  ["jobs.list", {}, "sync"],
  ["candidates.get", { id: "c1" }, "sync"],
  ["healthcheck", {}, "healthcheck"],
];

describe("workable SEC-PATH-2c-2 account host label", () => {
  for (const [op, extra, kind] of OPS) {
    test(`${kind} ${op} accepts a label, case-insensitively`, async () => {
      for (const [value, host] of [["acme", "acme.workable.com"], ["ACME", "acme.workable.com"], ["a1-b2", "a1-b2.workable.com"], ["a".repeat(63), `${"a".repeat(63)}.workable.com`]]) {
        const result = await outcomeOf("workable", op, { accessToken: "tok", ...extra, account: value }, kind);
        expect(result.calls.length, `${op} ${value}: ${result.code} ${result.message}`).toBeGreaterThan(0);
        expect(new URL(result.calls[0]!.url).hostname).toBe(host);
      }
    });
    test(`${kind} ${op} rejects invalid labels with 0 fetches`, async () => {
      for (const value of BAD) {
        const result = await outcomeOf("workable", op, { accessToken: "tok", ...extra, account: value }, kind);
        expect(result.calls, `${op} account=${JSON.stringify(value)}`).toEqual([]);
        expect(result.ok).toBe(false);
        expect(result.code, `${op} account=${JSON.stringify(value)}`).toBe("INVALID_ACTION_INPUT");
        expect(result.message).toMatch(/^account /);
      }
    });
  }

  test("every manifest action is behind the guard", async () => {
    const actions = Object.entries(manifest.operations as Record<string, { kind?: string }>).filter(([, spec]) => spec.kind === "action");
    expect(actions.length).toBeGreaterThan(10);
    for (const [op] of actions) {
      for (const value of [".", "acme.evil"]) {
        const result = await outcomeOf("workable", op, { ...{ accessToken: "tok" }, account: value });
        expect(result.calls, `${op} account=${value}`).toEqual([]);
        expect(result.code, `${op} account=${value}`).toBe("INVALID_ACTION_INPUT");
      }
    }
  });
});
