import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  loadFixtureCases,
  runCandidateFixtures,
  verifyFixtureCoverage,
} from "../../../../scripts/connector-gen/openconnector/recipe-fixtures.ts";

const root = join(import.meta.dir, "..");
const manifestBytes = readFileSync(join(root, "manifest.json"));
const manifest = JSON.parse(manifestBytes.toString("utf8"));

describe("bigml fixture replay", () => {
  it("replays every prepared fixture case against the compiled manifest", async () => {
    const cases = loadFixtureCases(join(root, "fixtures/cases"));
    verifyFixtureCoverage(manifest, cases);
    const runs = await runCandidateFixtures(manifestBytes, cases);
    const failed = runs.filter((run) => run.status !== "passed");
    expect(failed).toEqual([]);
    expect(runs.length).toBe(cases.length);
    expect(runs.length).toBeGreaterThan(20);
  });
});
