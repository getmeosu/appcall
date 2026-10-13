import { describe, expect, it } from "bun:test";
import { loadFixtureCases, runCandidateFixtures } from "../../../../scripts/connector-gen/openconnector/recipe-fixtures";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const actionKeys = Object.entries(manifest.operations)
  .filter(([, operation]) => (operation as { kind?: string }).kind === "action")
  .map(([key]) => key);
const { actions } = compileDeclarativeConnector(manifest);

describe("Toggl Track depth fixtures", () => {
  it("compiles every HTTP action and skips EventOnly webhooks", () => {
    expect(Object.keys(actions).sort()).toEqual([...actionKeys].sort());
    for (const key of Object.keys(manifest.operations)) {
      if (key.startsWith("webhook.")) {
        expect(actions[key]).toBeUndefined();
        expect((manifest.operations as Record<string, { kind?: string }>)[key].kind).toBe("webhook");
      }
    }
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

  it("covers every declared action with a positive fixture and skips EventOnly webhooks", () => {
    const cases = loadFixtureCases(new URL("../fixtures/cases", import.meta.url).pathname);
    const positive = new Set(cases.filter((c) => c.expected.kind === "success").map((c) => c.operation));
    expect([...positive].sort()).toEqual([...actionKeys].sort());
    for (const key of Object.keys(manifest.operations)) {
      if (key.startsWith("webhook.")) {
        expect(positive.has(key)).toBe(false);
      }
    }
  });
});

describe("Toggl Track auth contract", () => {
  const mock = (body: unknown, status = 200, headers?: HeadersInit) => {
    const calls: Request[] = [];
    const fetch = async (u: RequestInfo | URL, i?: RequestInit) => {
      calls.push(new Request(u, i));
      return new Response(JSON.stringify(body), { status, headers });
    };
    return { calls, fetch };
  };
  it("uses Basic token auth", async () => {
    const m = mock({ id: 1 });
    await actions.healthcheck!({ apiKey: "tok-secret", fetch: m.fetch });
    expect(m.calls[0].url).toBe("https://api.track.toggl.com/api/v9/me");
    expect(m.calls[0].headers.get("authorization")).toBe(`Basic ${Buffer.from("tok-secret:api_token").toString("base64")}`);
  });
  it("rejects invalid workspace IDs", async () => {
    await expect(actions["projects.list"]!({ apiKey: "x", workspaceId: null, fetch: mock([]).fetch })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
  });
});

describe("Toggl Track depth contracts", () => {
  const mock = (body: unknown, status = 200) => {
    const calls: Request[] = [];
    const fetch = async (u: RequestInfo | URL, i?: RequestInit) => {
      calls.push(new Request(u, i));
      return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    };
    return { calls, fetch };
  };

  it("routes webhook and report operations to their own API bases", async () => {
    const webhook = mock({ id: 9 });
    await actions["webhookSubscriptions.delete"]!({
      apiKey: "tok",
      workspaceId: 12,
      subscriptionId: 9,
      fetch: webhook.fetch,
    });
    expect(webhook.calls[0].method).toBe("DELETE");
    expect(webhook.calls[0].url).toBe("https://api.track.toggl.com/webhooks/api/v1/subscriptions/12/9");

    const report = mock([]);
    await actions["reports.searchTimeEntries"]!({
      apiKey: "tok",
      workspaceId: 12,
      startDate: "2026-09-01",
      endDate: "2026-09-30",
      pageSize: 50,
      fetch: report.fetch,
    });
    expect(report.calls[0].url).toBe("https://api.track.toggl.com/reports/api/v3/workspace/12/search/time_entries");
    expect(await report.calls[0].json()).toEqual({
      start_date: "2026-09-01",
      end_date: "2026-09-30",
      page_size: 50,
    });
  });

  it("sends the bulk JSON Patch array with comma-separated ids", async () => {
    const m = mock({ success: [99, 100], failure: [] });
    await actions["timeEntries.patch"]!({
      apiKey: "tok",
      workspaceId: 12,
      timeEntryIds: "99,100",
      meta: true,
      patchInput: [{ op: "replace", path: "/description", value: "Deep work" }],
      fetch: m.fetch,
    });
    expect(m.calls[0].url).toBe("https://api.track.toggl.com/api/v9/workspaces/12/time_entries/99%2C100?meta=true");
    expect(await m.calls[0].json()).toEqual([{ op: "replace", path: "/description", value: "Deep work" }]);
  });

  it("renders invitation workspaces in the provider wire shape", async () => {
    const m = mock({ data: [] });
    await actions["invitations.create"]!({
      apiKey: "tok",
      organizationId: 7,
      emails: ["ada@example.com"],
      skipEmail: true,
      workspaces: [{ workspace_id: 12, admin: false }],
      fetch: m.fetch,
    });
    expect(await m.calls[0].json()).toEqual({
      emails: ["ada@example.com"],
      skip_email: true,
      workspaces: [{ workspace_id: 12, admin: false }],
    });
  });
});
