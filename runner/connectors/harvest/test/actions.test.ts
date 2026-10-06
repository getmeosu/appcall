import { describe, expect, it } from "bun:test";
import { loadFixtureCases, runCandidateFixtures } from "../../../../scripts/connector-gen/openconnector/recipe-fixtures";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const actionKeys = Object.entries(manifest.operations)
  .filter(([, operation]) => (operation as { kind?: string }).kind === "action")
  .map(([key]) => key);
const { actions } = compileDeclarativeConnector(manifest);

describe("Harvest depth fixtures", () => {
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

describe("Harvest auth and query contract", () => {
  const mock = (body: unknown, status = 200, headers?: HeadersInit) => {
    const calls: Request[] = [];
    const fetch = async (u: RequestInfo | URL, i?: RequestInit) => {
      calls.push(new Request(u, i));
      return new Response(JSON.stringify(body), { status, headers });
    };
    return { calls, fetch };
  };
  it("sends bearer plus Harvest-Account-Id", async () => {
    const m = mock({ id: 1 });
    await actions.healthcheck!({ apiKey: "harvest-secret", accountId: "123", fetch: m.fetch });
    expect(m.calls[0].url).toBe("https://api.harvestapp.com/v2/users/me");
    expect(m.calls[0].headers.get("authorization")).toBe("Bearer harvest-secret");
    expect(m.calls[0].headers.get("harvest-account-id")).toBe("123");
  });
  it("rejects invalid IDs and maps rate limits", async () => {
    await expect(actions["projects.list"]!({ apiKey: "x", accountId: "1", clientId: "bad", fetch: mock({}).fetch })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions.healthcheck!({ apiKey: "harvest-secret", accountId: "1", fetch: async () => new Response(JSON.stringify({ message: "harvest-secret" }), { status: 429, headers: { "Retry-After": "4" } }) })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });
});
