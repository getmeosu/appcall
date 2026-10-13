import { describe, expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import { loadFixtureCases, runCandidateFixtures } from "./recipe-fixtures";
import manifest from "../manifest.json";

const actionKeys = Object.entries(manifest.operations)
  .filter(([, operation]) => (operation as { kind?: string }).kind === "action")
  .map(([key]) => key);

describe("Aryn depth fixtures", () => {
  it("compiles and replays authenticated fixture cases", async () => {
    expect(compileDeclarativeConnector(manifest as never).key).toBe("aryn");
    const cases = loadFixtureCases(new URL("../fixtures/cases", import.meta.url).pathname);
    const runs = await runCandidateFixtures(JSON.stringify(manifest), cases);
    expect(runs.length).toBe(actionKeys.length);
    for (const run of runs) {
      if (run.status !== "passed") {
        throw new Error(`${run.caseId}: ${run.error}`);
      }
    }
  });

  it("covers every declared action with one success fixture", () => {
    const cases = loadFixtureCases(new URL("../fixtures/cases", import.meta.url).pathname);
    const positive = new Set(cases.filter((entry) => entry.expected.kind === "success").map((entry) => entry.operation));
    expect([...positive].sort()).toEqual([...actionKeys].sort());
    expect(cases.filter((entry) => entry.expected.kind === "success")).toHaveLength(actionKeys.length);
  });
});
