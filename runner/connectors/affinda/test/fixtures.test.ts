import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadFixtureCases, runCandidateFixtures, verifyFixtureCoverage } from "./recipe-fixtures";

const root = join(import.meta.dir, "..");
const manifestBytes = readFileSync(join(root, "manifest.json"));
const manifest = JSON.parse(manifestBytes.toString("utf8"));

describe("affinda fixture replay", () => {
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
