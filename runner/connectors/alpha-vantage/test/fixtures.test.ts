import { describe, expect, test } from "bun:test";
import { loadFixtureCases, runCandidateFixtures, verifyFixtureCoverage } from "../../../../scripts/connector-gen/openconnector/recipe-fixtures";
import manifest from "../manifest.json";
import recipe from "../../../../scripts/connector-gen/openconnector/recipes/alpha_vantage/recipe.json";

describe("alpha-vantage fixtures", () => {
  test("recipe operations equal runner operations and replay", async () => {
    expect(Object.keys(manifest.operations).sort()).toEqual(Object.keys(recipe.manifest.operations).sort());
    const cases = loadFixtureCases(new URL("../fixtures/cases", import.meta.url).pathname);
    const coverage = verifyFixtureCoverage(recipe, cases);
    expect(coverage.missing).toEqual([]);
    const runs = await runCandidateFixtures(JSON.stringify(manifest), cases);
    const failed = runs.filter((run) => run.status !== "passed");
    expect(failed).toEqual([]);
    expect(runs.length).toBeGreaterThan(0);
  });
});
