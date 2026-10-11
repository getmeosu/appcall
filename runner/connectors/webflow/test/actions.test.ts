import { describe, expect, it } from "bun:test";
import { loadFixtureCases, runCandidateFixtures } from "../../../../scripts/connector-gen/openconnector/recipe-fixtures";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import sites from "../fixtures/sites.json";

const actionKeys = Object.entries(manifest.operations)
  .filter(([, operation]) => (operation as { kind?: string }).kind === "action")
  .map(([key]) => key);

describe("Webflow depth fixtures", () => {
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
const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });

describe("webflow HTTP contract", () => {
  it("includes provenance and evidence metadata", () => {
    expect(manifest.provenance.source).toEqual({
      url: "https://github.com/oomol-lab/open-connector",
      revision: "33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a",
    });
    expect(manifest.evidence).toEqual({ fixture: { status: "supplied" }, live: { status: "unverified" } });
  });

  it("healthcheck and site listing use bearer auth", async () => {
    const seen: Request[] = [];
    const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(new Request(input, init));
      return response(sites);
    };
    await actions.healthcheck!({ apiKey: "secret", fetch });
    await actions.list_sites!({ apiKey: "secret", fetch });
    expect(seen[0].headers.get("authorization")).toBe("Bearer secret");
    expect(seen[0].url).toBe("https://api.webflow.com/v2/sites");
  });

  it("escapes IDs and maps 401 and 429", async () => {
    const seen: Request[] = [];
    await actions.list_collections!({
      apiKey: "x",
      siteId: "a/b?c",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response({ collections: [] });
      },
    });
    expect(new URL(seen[0].url).pathname).toBe("/v2/sites/a%2Fb%3Fc/collections");
    await expect(actions.list_sites!({ apiKey: "x", fetch: async () => response({}, 401) })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
    await expect(
      actions.list_sites!({ apiKey: "x", fetch: async () => response({}, 429, { "retry-after": "4" }) }),
    ).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });
});
