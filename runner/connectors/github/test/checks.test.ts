import { describe, expect, test } from "bun:test";
import listCheckRunsFixture from "../fixtures/list_check_runs.json";
import getCheckRunFixture from "../fixtures/get_check_run.json";
import listCheckSuitesFixture from "../fixtures/list_check_suites.json";
import { listCheckRunsForRef, getCheckRun, listCheckSuitesForRef } from "../src/actions";

describe("github checks actions", () => {
  test("listCheckRunsForRef validates input and marks connector-owned output", () => {
    const result = listCheckRunsForRef({ owner: "acme", repo: "app", ref: "main" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("checks.runs.list_for_ref");
    expect(result.validated).toEqual({ owner: "acme", repo: "app", ref: "main", checkName: undefined, status: undefined, filter: undefined, perPage: undefined, page: undefined });
  });

  test("listCheckRunsForRef missing ref throws", () => {
    expect(() => listCheckRunsForRef({ owner: "acme", repo: "app" })).toThrow("ref is required");
  });

  test("listCheckRunsForRef fetches check-runs for ref", async () => {
    const requests: Request[] = [];
    const result = await listCheckRunsForRef({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      ref: "main",
      fetch: async (input, init) => {
        const req = new Request(input, init);
        requests.push(req);
        return new Response(JSON.stringify(listCheckRunsFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.github.com/repos/acme/app/commits/main/check-runs");
    expect(requests[0].method).toBe("GET");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer ghp_test-token");
    expect(result.action).toBe("checks.runs.list_for_ref");
    expect(result.totalCount).toBe(1);
    expect((result.checkRuns as Record<string, unknown>[])[0].name).toBe("build");
    expect((result.checkRuns as Record<string, unknown>[])[0].conclusion).toBe("success");
  });

  test("listCheckRunsForRef maps 404", async () => {
    await expect(
      listCheckRunsForRef({
        accessToken: "ghp_test-token",
        owner: "acme",
        repo: "app",
        ref: "missing",
        fetch: async () => new Response(JSON.stringify({ message: "Not Found" }), { status: 404 }),
      })
    ).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("getCheckRun validates and fetches by id", async () => {
    const sync = getCheckRun({ owner: "acme", repo: "app", checkRunId: 42 });
    expect(sync.action).toBe("checks.runs.get");
    expect((sync.validated as Record<string, unknown>).checkRunId).toBe(42);

    const requests: Request[] = [];
    const result = await getCheckRun({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      checkRunId: 42,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(getCheckRunFixture), { status: 200 });
      },
    });
    expect(requests[0].url).toBe("https://api.github.com/repos/acme/app/check-runs/42");
    expect((result.checkRun as Record<string, unknown>).id).toBe(42);
    expect((result.checkRun as Record<string, unknown>).status).toBe("completed");
  });

  test("getCheckRun missing checkRunId throws", () => {
    expect(() => getCheckRun({ owner: "acme", repo: "app" })).toThrow("checkRunId must be a number");
  });

  test("listCheckSuitesForRef fetches check-suites for ref", async () => {
    const requests: Request[] = [];
    const result = await listCheckSuitesForRef({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      ref: "abc123",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(listCheckSuitesFixture), { status: 200 });
      },
    });
    expect(requests[0].url).toBe("https://api.github.com/repos/acme/app/commits/abc123/check-suites");
    expect(result.action).toBe("checks.suites.list_for_ref");
    expect(result.totalCount).toBe(1);
    expect((result.checkSuites as Record<string, unknown>[])[0].id).toBe(7);
  });
});
