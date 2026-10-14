import { describe, expect, it } from "bun:test";
import { loadFixtureCases, runCandidateFixtures } from "../../../../scripts/connector-gen/openconnector/recipe-fixtures";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const actionKeys = Object.entries(manifest.operations)
  .filter(([, operation]) => (operation as { kind?: string }).kind === "action")
  .map(([key]) => key);
const { actions } = compileDeclarativeConnector(manifest);

describe("Breathe depth fixtures", () => {
  it("compiles every HTTP action", () => {
    expect(Object.keys(actions).sort()).toEqual([...actionKeys].sort());
  });

  it("replays authenticated fixture cases", async () => {
    const cases = loadFixtureCases(new URL("../fixtures/cases", import.meta.url).pathname);
    const runs = await runCandidateFixtures(JSON.stringify(manifest), cases);
    expect(runs.length).toBeGreaterThan(0);
    for (const run of runs) {
      if (run.status !== "passed") {
        throw new Error(`${run.caseId}: ${run.error}`);
      }
    }
  });

  it("covers every declared action with a positive fixture", () => {
    const cases = loadFixtureCases(new URL("../fixtures/cases", import.meta.url).pathname);
    const positive = new Set(cases.filter((c) => c.expected.kind === "success").map((c) => c.operation));
    expect([...positive].sort()).toEqual([...actionKeys].sort());
  });
});

describe("Breathe request contracts", () => {
  const mock = (body: unknown, status = 200) => {
    const calls: Request[] = [];
    const fetch = async (u: RequestInfo | URL, i?: RequestInit) => {
      calls.push(new Request(u, i));
      return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    };
    return { calls, fetch };
  };

  it("authenticates every request with the X-API-KEY header", async () => {
    const m = mock({ account: { id: 42 } });
    await actions.healthcheck!({ apiKey: "tok-secret", fetch: m.fetch });
    expect(m.calls[0].url).toBe("https://api.breathehr.com/v1/account");
    expect(m.calls[0].headers.get("x-api-key")).toBe("tok-secret");
  });

  it("sends documented root-keyed JSON bodies for writes", async () => {
    const reject = mock({ leave_requests: [] });
    await actions["leaveRequests.reject"]!({
      apiKey: "tok",
      id: 12,
      rejectionReason: "Team is at capacity that week",
      fetch: reject.fetch,
    });
    expect(reject.calls[0].method).toBe("POST");
    expect(reject.calls[0].url).toBe("https://api.breathehr.com/v1/leave_requests/12/reject");
    expect(await reject.calls[0].json()).toEqual({
      leave_request: { rejection_reason: "Team is at capacity that week" },
    });

    const claim = mock({ employee_expense_claims: [] });
    await actions["employeeExpenseClaims.update"]!({
      apiKey: "tok",
      id: 51,
      approve: true,
      approverRejectorId: 7,
      fetch: claim.fetch,
    });
    expect(claim.calls[0].method).toBe("PUT");
    expect(await claim.calls[0].json()).toEqual({
      employee_expense_claims: { approve: true, approver_rejector_id: 7 },
    });
  });

  it("omits the body for approve and issues DELETE without a body", async () => {
    const approve = mock({ leave_requests: [] });
    await actions["leaveRequests.approve"]!({ apiKey: "tok", id: 11, fetch: approve.fetch });
    expect(approve.calls[0].method).toBe("POST");
    expect(approve.calls[0].url).toBe("https://api.breathehr.com/v1/leave_requests/11/approve");
    expect(await approve.calls[0].text()).toBe("");

    const remove = mock({ employee_expenses: [] });
    await actions["employeeExpenses.delete"]!({ apiKey: "tok", id: 41, fetch: remove.fetch });
    expect(remove.calls[0].method).toBe("DELETE");
    expect(remove.calls[0].url).toBe("https://api.breathehr.com/v1/employee_expenses/41");
    expect(await remove.calls[0].text()).toBe("");
  });

  it("forwards the documented query filters and omits absent ones", async () => {
    const filtered = mock({ employee_expenses: [] });
    await actions["employeeExpenses.list"]!({
      apiKey: "tok",
      employeeId: 7,
      showClaimed: false,
      fetch: filtered.fetch,
    });
    expect(filtered.calls[0].url).toBe(
      "https://api.breathehr.com/v1/employee_expenses?employee_id=7&show_claimed=false",
    );

    const divisions = mock({ divisions: [] });
    await actions["divisions.list"]!({ apiKey: "tok", fetch: divisions.fetch });
    expect(divisions.calls[0].url).toBe("https://api.breathehr.com/v1/divisions");
  });

  it("rejects invalid IDs before any network call", async () => {
    const m = mock({ leave_requests: [] });
    await expect(
      actions["leaveRequests.get"]!({ apiKey: "tok", id: null, fetch: m.fetch }),
    ).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    expect(m.calls).toHaveLength(0);
  });
});
