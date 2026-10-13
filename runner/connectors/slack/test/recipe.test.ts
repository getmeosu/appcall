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
    const recipeOps = Object.keys(recipe.manifest.operations).sort();
    expect(typeof recipe.manifest.version).toBe("string");
    // The curated recipe is mirrored by the wave integrator. Every recipe
    // operation must exist in the runner manifest; the only operations the
    // recipe may still be missing are the declarative L2 depth additions.
    expect(recipeOps.filter((key) => !(key in operations))).toEqual([]);
    const pending = runnerOps.filter((key) => !(key in recipe.manifest.operations));
    // The recipe lags by exactly the declarative L2 depth additions until the
    // wave integrator mirrors them; afterwards it matches the runner exactly.
    expect([0, 55]).toContain(pending.length);
    for (const key of pending) {
      expect((operations[key] as { request?: unknown }).request, key).toBeDefined();
      expect(recipe.selection.operations).not.toContain(key);
      expect(Object.hasOwn(recipe.operationSources, key)).toBe(false);
    }
    expect(recipeOps).toEqual(runnerOps.filter((key) => !pending.includes(key)));
    expect([...recipe.selection.operations].sort()).toEqual(recipeOps);
    expect(Object.keys(recipe.operationSources).sort()).toEqual(recipeOps);
    expect(runnerOps).toHaveLength(223);
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
