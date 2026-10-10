import { describe, expect, it, test } from "bun:test";
import { loadFixtureCases, runCandidateFixtures } from "../../../../scripts/connector-gen/openconnector/recipe-fixtures";
import manifest from "../manifest.json";
import websites from "../fixtures/websites.json";
import stats from "../fixtures/stats.json";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";

const actions = compileDeclarativeConnector(manifest).actions;
const response = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });

const actionKeys = Object.entries(manifest.operations)
  .filter(([, operation]) => (operation as { kind?: string }).kind === "action")
  .map(([key]) => key);

describe("Simple Analytics depth fixtures", () => {
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

describe("simple analytics declarative connector", () => {
  test("healthcheck takes empty operation input and sends both credentials", async () => {
    let seen: Request | undefined;
    const result = await actions.healthcheck!({
      apiKey: "key",
      userId: "user_1",
      fetch: async (url, init) => {
        seen = new Request(url, init);
        return response(websites);
      },
    });
    expect(seen?.url).toBe("https://simpleanalytics.com/api/websites");
    expect(seen?.headers.get("api-key")).toBe("key");
    expect(seen?.headers.get("user-id")).toBe("user_1");
    expect(result).toMatchObject({ source: "provider", status: "ok" });
  });
  test("stats encodes hostname and omits absent optionals", async () => {
    let seen: Request | undefined;
    const result = await actions["stats.get"]!({
      apiKey: "key",
      userId: "user_1",
      hostname: "example.com",
      fetch: async (url, init) => {
        seen = new Request(url, init);
        return response(stats);
      },
    });
    expect(seen?.url).toContain("/example.com.json");
    expect(new URL(seen!.url).searchParams.get("version")).toBe("6");
    expect(new URL(seen!.url).searchParams.has("start")).toBe(false);
    expect(result).toMatchObject({ stats });
  });
  test("rejects missing hostname and maps rate limits", async () => {
    let called = false;
    expect(() =>
      actions["stats.get"]!({
        apiKey: "key",
        userId: "user_1",
        fetch: async () => {
          called = true;
          return response({});
        },
      }),
    ).toThrow();
    expect(called).toBe(false);
    await expect(
      actions["websites.list"]!({
        apiKey: "key",
        userId: "user_1",
        fetch: async () => response({}, 429, { "retry-after": "9" }),
      }),
    ).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 9 });
  });
});
