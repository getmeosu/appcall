import { describe, expect, test } from "bun:test";
import { executeWorkableAction } from "../src/actions";

// SEC-PATH-2: the local assertSafePathSegment copy accepted "." and "..";
// actions now use the shared guard from _shared/jobboard.ts.
function recorder() {
  const calls: string[] = [];
  const fetch = (async (input: string | URL | Request) => {
    calls.push(String(input));
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { calls, fetch };
}

describe("workable path segment guard", () => {
  test("rejects '.' and '..' path values with zero fetches", async () => {
    for (const bad of [".", ".."]) {
      for (const [operation, input] of [
        ["candidates.get", { id: bad }],
        ["subscriptions.delete", { subscriptionId: bad }],
        ["employees.get", { employeeId: bad }],
      ] as const) {
        const { calls, fetch } = recorder();
        await expect(executeWorkableAction(operation, { account: "acme", accessToken: "t", ...input, fetch }))
          .rejects.toThrow("must not be a dot segment");
        expect(calls).toHaveLength(0);
      }
    }
  });

  test("rejects '.' and '..' as the account subdomain with zero fetches", async () => {
    for (const bad of [".", ".."]) {
      const { calls, fetch } = recorder();
      await expect(executeWorkableAction("candidates.get", { account: bad, accessToken: "t", id: "c1", fetch }))
        .rejects.toThrow("account must not be a dot segment");
      expect(calls).toHaveLength(0);
    }
  });

  test("still accepts ids with dots, underscores and hyphens", async () => {
    const { calls, fetch } = recorder();
    await executeWorkableAction("candidates.get", { account: "acme", accessToken: "t", id: "ce4.da_98-x", fetch });
    expect(calls.map((url) => new URL(url).pathname)).toEqual(["/spi/v3/candidates/ce4.da_98-x"]);
  });
});
