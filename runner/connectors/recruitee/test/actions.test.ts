import { describe, expect, it } from "bun:test";
import { loadFixtureCases, runCandidateFixtures } from "../../../../scripts/connector-gen/openconnector/recipe-fixtures";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const operations = Object.entries(manifest.operations) as Array<
  [string, { kind?: string; request?: unknown; sideEffect?: string }]
>;
const httpActionKeys = operations
  .filter(([, operation]) => operation.kind === "action" && Boolean(operation.request))
  .map(([key]) => key);
const { actions } = compileDeclarativeConnector(manifest as never);

describe("Recruitee depth fixtures", () => {
  it("compiles every declarative HTTP action", () => {
    expect(Object.keys(actions).sort()).toEqual([...httpActionKeys].sort());
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

  it("covers every declarative action with a positive fixture", () => {
    const cases = loadFixtureCases(new URL("../fixtures/cases", import.meta.url).pathname);
    const positive = new Set(cases.filter((c) => c.expected.kind === "success").map((c) => c.operation));
    expect([...positive].sort()).toEqual([...httpActionKeys].sort());
  });

  it("declares side effects by HTTP method", () => {
    for (const [key, operation] of operations) {
      if (!operation.request) continue;
      const method = (operation.request as { method?: string }).method;
      const expected =
        method === "GET" ? "read" : method === "DELETE" ? "destructive" : "write";
      expect(`${key}:${operation.sideEffect}`).toBe(`${key}:${expected}`);
    }
  });

  it("rejects a missing required field before any fetch", async () => {
    let called = false;
    await expect(
      actions["candidates.create"]!({
        company: "acme",
        accessToken: "tok",
        fetch: async () => {
          called = true;
          return new Response("{}", { status: 201 });
        },
      }),
    ).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    expect(called).toBe(false);
  });

  it("fetches a public offer from the tenant careers host", async () => {
    let seen: Request | undefined;
    await actions["offers.public.get"]!({
      company: "acme",
      accessToken: "tok",
      identifier: "software-engineer",
      fetch: async (url: string, init?: RequestInit) => {
        seen = new Request(url, init);
        return new Response(JSON.stringify({ offer: { id: 1 } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });
    expect(new URL(seen!.url).hostname).toBe("acme.recruitee.com");
    expect(new URL(seen!.url).pathname).toBe("/api/offers/software-engineer");
    expect(seen!.headers.get("authorization")).toBe("Bearer tok");
  });

  it("omits absent optional query parameters", async () => {
    let seen: Request | undefined;
    await actions["tags.list"]!({
      company: "acme",
      accessToken: "tok",
      query: "eng",
      fetch: async (url: string, init?: RequestInit) => {
        seen = new Request(url, init);
        return new Response(JSON.stringify({ tags: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });
    const url = new URL(seen!.url);
    expect([...url.searchParams.keys()]).toEqual(["query"]);
    expect(url.searchParams.get("query")).toBe("eng");
  });
});
