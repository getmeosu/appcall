import { describe, expect, it } from "bun:test";
import { loadFixtureCases, runCandidateFixtures } from "../../../../scripts/connector-gen/openconnector/recipe-fixtures";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const actionKeys = Object.entries(manifest.operations)
  .filter(([, operation]) => (operation as { kind?: string }).kind === "action")
  .map(([key]) => key);

describe("Datadog depth fixtures", () => {
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
const json = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });

describe("Datadog curated reads", () => {
  it("sends both credentials on curated reads", async () => {
    const seen: Request[] = [];
    const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(new Request(input, init));
      const u = new URL(seen.at(-1)!.url);
      if (u.pathname.endsWith("/validate")) return json({ valid: true });
      if (u.pathname.endsWith("/monitor")) return json([{ id: 7 }]);
      if (u.pathname.includes("/monitor/")) return json({ id: 7 });
      return json({ metrics: ["cpu"] });
    };
    await actions.healthcheck!({ apiKey: "api-secret", applicationKey: "app-secret", fetch });
    await actions["monitors.list"]!({ apiKey: "api-secret", applicationKey: "app-secret", fetch });
    await actions["monitors.get"]!({ apiKey: "api-secret", applicationKey: "app-secret", monitorId: 7, fetch });
    await actions["metrics.list"]!({ apiKey: "api-secret", applicationKey: "app-secret", from: 1, fetch });
    expect(seen).toHaveLength(4);
    for (const request of seen) {
      expect(request.headers.get("dd-api-key")).toBe("api-secret");
      expect(request.headers.get("dd-application-key")).toBe("app-secret");
    }
    expect(new URL(seen[2]!.url).pathname).toBe("/api/v1/monitor/7");
  });

  it("omits absent filters and maps 401 and 429", async () => {
    const seen: Request[] = [];
    await actions["metrics.list"]!({
      apiKey: "a",
      applicationKey: "b",
      from: 1,
      fetch: async (i, x) => {
        seen.push(new Request(i, x));
        return json({ metrics: ["x"] });
      },
    });
    expect(new URL(seen[0]!.url).search).toBe("?from=1");
    await expect(
      actions["monitors.get"]!({ apiKey: "a", applicationKey: "b", monitorId: "7", fetch: async () => json({}) }),
    ).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(
      actions.healthcheck!({ apiKey: "secret", applicationKey: "app", fetch: async () => json({ error: "secret" }, 401) }),
    ).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(
      actions.healthcheck!({
        apiKey: "secret",
        applicationKey: "app",
        fetch: async () => json({ error: "secret" }, 429, { "Retry-After": "9" }),
      }),
    ).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 9 });
  });
});
