import { describe, expect, it, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import { loadFixtureCases, runCandidateFixtures } from "../../../../scripts/connector-gen/openconnector/recipe-fixtures";
import manifest from "../manifest.json";
import user from "../fixtures/user.json";
import list from "../fixtures/list.json";

const { actions } = compileDeclarativeConnector(manifest);
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const actionKeys = Object.entries(manifest.operations)
  .filter(([, operation]) => (operation as { kind?: string }).kind === "action")
  .map(([key]) => key);

describe("folk HTTP contract", () => {
  test("healthcheck uses bearer auth", async () => {
    const seen: Request[] = [];
    const result = await actions.healthcheck!({ apiKey: "secret", fetch: async (input, init) => { seen.push(new Request(input, init)); return response(user); } });
    expect(seen[0].url).toBe("https://api.folk.app/v1/users/me");
    expect(seen[0].headers.get("authorization")).toBe("Bearer secret");
    expect(result).toMatchObject({ user: user.data, source: "provider" });
  });
  test("preserves pagination metadata and never follows nextLink", async () => {
    const seen: Request[] = [];
    const result = await actions["people.list"]!({ apiKey: "secret", limit: 10, cursor: "a b", fetch: async (input, init) => { seen.push(new Request(input, init)); return response(list); } });
    const url = new URL(seen[0].url);
    expect(url.searchParams.get("cursor")).toBe("a b");
    expect(result).toMatchObject({ people: list.data, pagination: { nextLink: list.pagination.nextLink }, source: "provider" });
    expect(seen).toHaveLength(1);
  });
  test("maps 401 and malformed output safely", async () => {
    await expect(actions["users.list"]!({ apiKey: "secret", fetch: async () => response({message:"no"},401) })).rejects.toMatchObject({code:"CONNECTOR_UPSTREAM_ERROR"});
    await expect(actions["users.list"]!({ apiKey: "secret", fetch: async () => response({data:{}}) })).rejects.toMatchObject({code:"CONNECTOR_RESPONSE_INVALID"});
  });
});

describe("folk depth fixtures", () => {
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
