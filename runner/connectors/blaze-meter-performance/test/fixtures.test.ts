import { describe, expect, it } from "bun:test";
import { loadFixtureCases, runCandidateFixtures } from "../../../../scripts/connector-gen/openconnector/recipe-fixtures";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, {
  kind?: string;
  request?: unknown;
  sideEffect?: string;
}>;

const declarativeActionKeys = Object.entries(operations)
  .filter(([, operation]) => operation.kind === "action" && operation.request !== undefined)
  .map(([key]) => key);

describe("blaze-meter-performance declarative depth fixtures", () => {
  it("replays every fixture case against the compiled manifest", async () => {
    const cases = loadFixtureCases(new URL("../fixtures/cases", import.meta.url).pathname);
    const runs = await runCandidateFixtures(JSON.stringify(manifest), cases);
    expect(runs.length).toBeGreaterThan(30);
    for (const run of runs) {
      if (run.status !== "passed") {
        throw new Error(`${run.caseId}: ${run.error}`);
      }
    }
  });

  it("covers every declarative action with a positive fixture", () => {
    const cases = loadFixtureCases(new URL("../fixtures/cases", import.meta.url).pathname);
    const positive = new Set(cases.filter((c) => c.expected.kind === "success").map((c) => c.operation));
    expect([...positive].sort()).toEqual([...declarativeActionKeys].sort());
  });

  it("declares side effects by intent", () => {
    for (const [key, operation] of Object.entries(operations)) {
      if (!operation.request) continue;
      expect(["read", "write", "destructive"], key).toContain(operation.sideEffect);
    }
  });
});
