import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import manifest from "../manifest.json";

const recipeCandidates = [
  join(import.meta.dir, "../../recipes/slack/recipe.json"),
  join(import.meta.dir, "../../../../../prepared/recipes/slack/recipe.json"),
];
const recipePath = recipeCandidates.find((path) => existsSync(path)) ?? recipeCandidates[0];
const operations = manifest.operations as Record<string, { kind?: string; sideEffect?: string }>;

describe("slack recipe parity", () => {
  it("keeps recipe operations equal to runner operations", () => {
    expect(existsSync(recipePath)).toBe(true);
    const recipe = JSON.parse(readFileSync(recipePath, "utf8")) as {
      selection: { operations: string[] };
      operationSources: Record<string, unknown>;
      manifest: { operations: Record<string, { kind?: string; sideEffect?: string }>; version: string };
    };
    const runnerOps = Object.keys(operations).sort();
    expect(recipe.manifest.version).toBe("0.6.0");
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(runnerOps);
    expect([...recipe.selection.operations].sort()).toEqual(runnerOps);
    expect(Object.keys(recipe.operationSources).sort()).toEqual(runnerOps);
    expect(runnerOps).toHaveLength(168);
  });

  it("marks every webhook operation sideEffect read", () => {
    const recipe = JSON.parse(readFileSync(recipePath, "utf8")) as {
      manifest: { operations: Record<string, { kind?: string; sideEffect?: string }> };
    };
    const webhookOps = Object.entries(operations)
      .filter(([, operation]) => operation.kind === "webhook")
      .map(([key]) => key)
      .sort();
    expect(webhookOps).toHaveLength(9);
    for (const key of webhookOps) {
      expect(operations[key]?.sideEffect).toBe("read");
      expect(recipe.manifest.operations[key]?.kind).toBe("webhook");
      expect(recipe.manifest.operations[key]?.sideEffect).toBe("read");
    }
  });
});
