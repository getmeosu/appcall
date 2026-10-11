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
