import { describe, expect, it } from "bun:test";
import { loadFixtureCases, runCandidateFixtures } from "../../../../scripts/connector-gen/openconnector/recipe-fixtures";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const actionKeys = Object.entries(manifest.operations)
  .filter(([, operation]) => (operation as { kind?: string }).kind === "action")
  .map(([key]) => key);

describe("Hashnode depth fixtures", () => {
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

const { actions } = compileDeclarativeConnector(manifest as never);

it("rejects GraphQL errors even on HTTP 200", async () => {
  await expect(
    actions["users.me"]!({
      apiKey: "fixture-api-token",
      fetch: async () => new Response(JSON.stringify({ data: null, errors: [{ message: "Unauthenticated" }] })),
    }),
  ).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
});

it("rejects missing required input before network", async () => {
  let called = false;
  try {
    await actions["posts.get"]!({
      apiKey: "fixture-api-token",
      fetch: async () => {
        called = true;
        return new Response("{}");
      },
    });
    throw new Error("unexpected success");
  } catch (error) {
    expect(error).toMatchObject({ code: "INVALID_ACTION_INPUT" });
  }
  expect(called).toBe(false);
});

it("omits optional cursor and exposes final-page state", async () => {
  const result = await actions["publications.list"]!({
    first: 1,
    apiKey: "fixture-api-token",
    fetch: async (_url: unknown, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body)).variables).toEqual({ first: 1 });
      return new Response(
        JSON.stringify({ data: { me: { publications: { edges: [], pageInfo: { endCursor: null, hasNextPage: false } } } } }),
      );
    },
  });
  expect(result).toMatchObject({ edges: [], hasNextPage: false });
  expect(result).not.toHaveProperty("nextCursor");
});
