import { describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { parse } from "../catalog-cli";

describe("catalog CLI arguments", () => {
  test("rejects unknown flags", () => expect(() => parse(["--bogus"])).toThrow("unknown flag"));
  test("requires a valid as-of date", () => expect(() => parse(["--source", "x", "--recipes", "y", "--out", join(tmpdir(), "x"), "--as-of", "yesterday"])).toThrow("INVALID_ARGUMENTS"));
  test("accepts the complete bounded invocation", () => expect(parse(["--source", "x", "--recipes", "y", "--out", join(tmpdir(), "x"), "--as-of", "2026-09-13"])).toEqual({ source: "x", recipes: "y", out: join(tmpdir(), "x"), asOf: "2026-09-13" }));
});

const source = process.env.APPCALL_OPENCONNECTOR_SOURCE;
test.skipIf(!source)("runs the bulk build and writes a complete inventory report", { timeout: 30_000 }, async () => {
  const root = await mkdtemp(join(realpathSync(tmpdir()), "appcall-catalog-test-"));
  const recipes = join(root, "recipes");
  const out = join(tmpdir(), `appcall-catalog-out-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  try {
    await cp(join(import.meta.dir, "../recipes/coda"), join(recipes, "coda"), { recursive: true, dereference: false });
    await cp(join(import.meta.dir, "../recipes/buildkite"), join(recipes, "buildkite"), { recursive: true, dereference: false });
    const { runCatalog } = await import("../catalog-cli");
    const report = await runCatalog({ source: source!, recipes, out, asOf: "2026-09-13" });
    const disk = JSON.parse(await readFile(join(out, "report.json"), "utf8"));
    expect(report.inventoryCount).toBe(1498);
    expect(report.sourceInventory.providers).toHaveLength(1498);
    expect(report.acceptedCount).toBe(2);
    expect(disk.sourceInventory.providers).toHaveLength(1498);
    expect(disk.decisions).toHaveLength(1498);
    expect(disk.asOf).toBe("2026-09-13");
  } finally { await rm(root, { recursive: true, force: true }); await rm(out, { recursive: true, force: true }); }
});
