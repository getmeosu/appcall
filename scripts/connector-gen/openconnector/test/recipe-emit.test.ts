import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, cp, symlink, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { emitVerifiedCatalog } from "../recipe-emit";
import { readRecipe } from "../recipes";
import { loadFixtureCases } from "../recipe-fixtures";
import { buildRecipeCatalog } from "../recipe-build";

const valid = (overrides: Record<string, unknown> = {}) => ({
  providerId: "coda", appcallId: "coda", status: "ACCEPTED" as const, reasons: [],
  recipeDir: "coda", manifestBytes: "{}", recipeBytes: JSON.stringify({ schemaVersion: 1 }),
  sourceRoot: "/tmp", sourceHashes: { "recipe-emit-fixture": "bad" },
  fixtureRun: { candidateHash: "44136fa355b3678a1146ad16f7e8649e94fb4fc21e739e7f5d2d3c2a4e4f6f7e", cases: { smoke: "passed" as const } },
  ...overrides,
});

describe("verified recipe emission", () => {
  async function actualBuild(source: string, root: string) {
    const recipes = await Promise.all(["coda", "buildkite"].map((id) => readRecipe(join(root, id))));
    const dirs = Object.fromEntries(recipes.map((r) => [r.providerId, join(root, r.providerId)]));
    const cases = Object.fromEntries(recipes.map((r) => [r.providerId, loadFixtureCases(join(dirs[r.providerId]!, "fixtures/cases"))]));
    return buildRecipeCatalog({ recipes, asOf: "2026-09-13", snapshot: { root: source }, recipeDirs: dirs, fixtureCases: (r) => cases[r.providerId]! });
  }

  test.skipIf(!process.env.APPCALL_OPENCONNECTOR_SOURCE)("rejects external README and fixture ancestor symlinks before output", async () => {
    const source = process.env.APPCALL_OPENCONNECTOR_SOURCE!;
    const base = await mkdtemp(join(tmpdir(), "appcall-recipe-copy-"));
    const root = join(base, "recipes");
    await mkdir(root);
    for (const id of ["coda", "buildkite"]) await cp(join(import.meta.dir, "..", "recipes", id), join(root, id), { recursive: true });
    const build = await actualBuild(source, root);
    expect(build.records.filter((r) => r.status === "ACCEPTED")).toHaveLength(2);
    const outside = join(base, "outside"); await mkdir(outside); await writeFile(join(outside, "README.md"), "external");
    const originalReadme = await readFile(join(root, "coda", "README.md")); await unlink(join(root, "coda", "README.md")); await symlink(join(outside, "README.md"), join(root, "coda", "README.md"));
    await expect(emitVerifiedCatalog(build, join(tmpdir(), `appcall-symlink-readme-${crypto.randomUUID()}`))).rejects.toThrow();
    await unlink(join(root, "coda", "README.md")); await writeFile(join(root, "coda", "README.md"), originalReadme);
    const responseDir = join(root, "coda", "fixtures", "responses");
    const moved = join(base, "responses-real"); await cp(responseDir, moved, { recursive: true });
    await writeFile(join(root, "coda", "fixtures", "cases", "docs-list-success.json"), (await readFile(join(root, "coda", "fixtures", "cases", "docs-list-success.json"), "utf8")).replace("../responses/", "../responses-link/"));
    await symlink(moved, join(root, "coda", "fixtures", "responses-link"));
    await expect(emitVerifiedCatalog(build, join(tmpdir(), `appcall-symlink-fixture-${crypto.randomUUID()}`))).rejects.toThrow();
  });
  test("rejects forged accepted evidence", async () => {
    await expect(emitVerifiedCatalog({ records: [valid()], artifacts: {} }, join(tmpdir(), `emit-${crypto.randomUUID()}`))).rejects.toThrow("accepted result missing artifact");
  });
  test("rejects traversal identities", async () => {
    await expect(emitVerifiedCatalog({ records: [valid({ appcallId: "../escape", disposition: "HOLD" })], artifacts: {} }, join(tmpdir(), `emit-${crypto.randomUUID()}`))).rejects.toThrow("invalid connector identity");
  });
  test("emits a nonaccepted inventory without artifact evidence", async () => {
    const out = join(tmpdir(), `emit-${crypto.randomUUID()}`);
    const report = await emitVerifiedCatalog({ records: [{ providerId: "coda", appcallId: "coda", status: "HOLD", reasons: [] }], artifacts: {} }, out);
    expect(report.accepted).toEqual([]);
  });
});
