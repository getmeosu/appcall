import { describe, expect, it } from "bun:test";
import { loadFixtureCases, runCandidateFixtures } from "../../../../scripts/connector-gen/openconnector/recipe-fixtures";
import manifest from "../manifest.json";

describe("mailerlite fixtures", () => {
  it("replays authenticated fixture cases", async () => {
    const cases = loadFixtureCases(new URL("../fixtures/cases", import.meta.url).pathname);
    const runs = await runCandidateFixtures(JSON.stringify(manifest), cases);
    expect(runs.length).toBeGreaterThan(0);
    expect(runs.every((run) => run.status === "passed")).toBe(true);
    for (const run of runs) {
      if (run.status !== "passed") throw new Error(`${run.caseId}: ${run.error}`);
    }
  });

  it("covers every action operation", () => {
    const cases = loadFixtureCases(new URL("../fixtures/cases", import.meta.url).pathname);
    const actions = Object.entries(manifest.operations)
      .filter(([, op]) => (op as { kind?: string }).kind === "action")
      .map(([key]) => key)
      .sort();
    expect([...new Set(cases.map((c) => c.operation))].sort()).toEqual(actions);
  });
});
