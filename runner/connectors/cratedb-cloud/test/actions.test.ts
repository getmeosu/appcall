import { describe, expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import { loadFixtureCases, runCandidateFixtures } from "../../../../scripts/connector-gen/openconnector/recipe-fixtures";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest as never);
const actionKeys = Object.entries(manifest.operations)
  .filter(([, operation]) => (operation as { kind?: string }).kind === "action")
  .map(([name]) => name);
const webhookKeys = Object.entries(manifest.operations)
  .filter(([, operation]) => (operation as { kind?: string }).kind === "webhook")
  .map(([name]) => name);

describe("cratedb-cloud connector surface", () => {
  it("compiles one handler per HTTP action", () => {
    expect(Object.keys(actions).sort()).toEqual(actionKeys.sort());
  });

  it("does not compile EventOnly webhook operations into action handlers", () => {
    for (const name of webhookKeys) expect(actions[name]).toBeUndefined();
  });

  it("replays fixture cases", async () => {
    const cases = loadFixtureCases(new URL("../fixtures/cases", import.meta.url).pathname);
    const runs = await runCandidateFixtures(JSON.stringify(manifest), cases);
    expect(runs.length).toBeGreaterThan(0);
    expect(runs.every((run) => run.status === "passed")).toBe(true);
    for (const run of runs) {
      if (run.status !== "passed") throw new Error(`${run.caseId}: ${run.error}`);
    }
  });
});
