import { describe, expect, it } from "bun:test";
import { loadFixtureCases, runCandidateFixtures } from "../../../../scripts/connector-gen/openconnector/recipe-fixtures";
import manifest from "../manifest.json";

describe("Botsonic fixtures", () => {
  it("replays HTTP action fixtures and skips webhook operations", async () => {
    const cases = loadFixtureCases(new URL("../fixtures/cases", import.meta.url).pathname);
    const runs = await runCandidateFixtures(JSON.stringify(manifest), cases);
    expect(runs.length).toBeGreaterThan(0);
    expect(runs.every((run) => run.status === "passed")).toBe(true);
    for (const run of runs) {
      if (run.status !== "passed") {
        throw new Error(`${run.caseId}: ${run.error}`);
      }
    }
    const operations = manifest.operations as Record<string, { kind?: string }>;
    const actionKeys = Object.entries(operations)
      .filter(([, operation]) => operation.kind !== "webhook")
      .map(([key]) => key)
      .sort();
    const successOps = [...new Set(cases.filter((c) => c.expected.kind === "success").map((c) => c.operation))].sort();
    expect(successOps).toEqual(actionKeys);
    const webhookKeys = Object.entries(operations)
      .filter(([, operation]) => operation.kind === "webhook")
      .map(([key]) => key);
    expect(cases.some((c) => webhookKeys.includes(c.operation))).toBe(false);
  });
});
