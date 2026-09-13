import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readRecipe } from "../recipes";
import { loadFixtureCases, runCandidateFixtures } from "../recipe-fixtures";
import { buildRecipeCatalog } from "../recipe-build";
import { emitVerifiedCatalog } from "../recipe-emit";

const source = process.env.APPCALL_OPENCONNECTOR_SOURCE;
describe("pinned recipe roundtrip", () => {
  test.skipIf(!source)("builds and emits Coda and Buildkite recipes with all fixtures", async () => {
    const out = join(tmpdir(), `appcall-recipe-roundtrip-${crypto.randomUUID()}`);
    try {
      const root = join(import.meta.dir, "..", "recipes");
      const recipes = await Promise.all(["coda", "buildkite"].map((id) => readRecipe(join(root, id))));
      const cases = new Map(recipes.map((recipe) => [recipe.providerId, loadFixtureCases(join(root, recipe.providerId, "fixtures", "cases"))]));
      const build = await buildRecipeCatalog({ recipes, asOf: "2026-09-13", snapshot: { root: source! }, recipeDirs: Object.fromEntries(recipes.map((r) => [r.providerId, join(root, r.providerId)])), fixtureCases: (r) => cases.get(r.providerId)! });
      expect(build.records.filter((r) => r.status === "ACCEPTED").map((r) => r.appcallId)).toEqual(["buildkite", "coda"]);
      expect(build.records.flatMap((r) => r.fixture ?? [])).toHaveLength(14);
      const report = await emitVerifiedCatalog(build, out);
      expect(report.accepted).toEqual(["buildkite", "coda"]);
      expect((report as any).asOf).toBe("2026-09-13");
      for (const id of report.accepted as string[]) {
        const rebuilt = (report as any).rebuilt.find((r: any) => r.appcallId === id);
        expect(rebuilt.sourceHashes).toBeTruthy();
        expect(rebuilt.recipeHash).toMatch(/^[a-f0-9]{64}$/);
        expect(rebuilt.fixture.every((f: any) => f.fixtureHashes.length > 0)).toBe(true);
      }
      for (const id of report.accepted as string[]) {
        expect(await readFile(join(out, id, "README.md"))).toBeTruthy();
        expect(await readFile(join(out, id, "recipe.json"))).toBeTruthy();
        const healthCase = id === "coda" ? "healthcheck-success.json" : "healthcheck.json";
        expect(await readFile(join(out, id, "fixtures", "cases", healthCase))).toBeTruthy();
      }
      expect(await readFile(join(out, "report.json"))).toBeTruthy();
      for (const id of report.accepted as string[]) {
        const emittedCases = loadFixtureCases(join(out, id, "fixtures", "cases"));
        const emittedManifest = await readFile(join(out, id, "manifest.json"), "utf8");
        expect((await runCandidateFixtures(emittedManifest, emittedCases)).every((r) => r.status === "passed")).toBe(true);
      }
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  });
});
