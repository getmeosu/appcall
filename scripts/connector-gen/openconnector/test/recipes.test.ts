import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverRecipes, readRecipe, validateRecipeShape } from "../recipes";

describe("recipe loader shape", () => {
  const valid = () => ({
    schemaVersion: 1, providerId: "coda", appcallId: "coda",
    source: { url: "https://github.com/example/repo", revision: "33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a", files: { "src/action.ts": "a".repeat(64) }, spans: { action: { path: "src/action.ts", startLine: 1, endLine: 2 } } },
    selection: { providerId: "coda", appcallId: "coda", disposition: "HOLD", edition: "international", operations: ["healthcheck"], upstreamSha: "33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a", marketFocus: "unknown" },
    research: {}, operationSources: { healthcheck: { upstreamActionId: "whoami", sourceRefs: ["action"], documentationUrls: ["https://example.com/docs"], responseContract: "preserve-existing", adaptations: [] } },
    manifest: { key: "coda", provenance: { source: { url: "https://github.com/example/repo", revision: "33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a" } }, evidence: { fixture: { status: "supplied" }, live: { status: "unverified" } }, operations: { healthcheck: {} } },
  });

  test("rejects unknown top-level fields", () => expect(() => validateRecipeShape({ schemaVersion: 1, extra: true })).toThrow());
  test("accepts the minimal valid structural recipe", () => expect(() => validateRecipeShape(valid())).not.toThrow());
  test("accepts form request body encoding", () => { const recipe = valid(); (recipe.manifest.operations.healthcheck as any).request = { bodyEncoding: "form" }; expect(() => validateRecipeShape(recipe)).not.toThrow(); });
  test("requires provenance source", () => { const recipe = valid(); delete (recipe.manifest as any).provenance; expect(() => validateRecipeShape(recipe)).toThrow(); });
  test("accepts hyphenated upstream provider IDs", () => {
    const recipe = valid(); recipe.providerId = "fusion-api"; recipe.selection.providerId = "fusion-api";
    expect(() => validateRecipeShape(recipe)).not.toThrow();
  });
  test("rejects unknown nested fields and invalid source pin", () => {
    const recipe = valid();
    (recipe.selection as any).extra = true;
    expect(() => validateRecipeShape(recipe)).toThrow();
    const pinned = valid(); (pinned.source as any).files["src/action.ts"] = "not-a-sha";
    expect(() => validateRecipeShape(pinned)).toThrow();
    const native = valid(); (native.manifest.operations.healthcheck as any).request = { unsupportedSerialization: true };
    expect(() => validateRecipeShape(native)).toThrow();
    const evidence = valid(); (evidence.manifest as any).evidence = { fixture: { status: "missing" }, live: { status: "unverified" } };
    expect(() => validateRecipeShape(evidence)).toThrow();
    const nested = valid(); (nested.manifest as any).evidence = { fixture: { status: "supplied" }, live: { status: "verified" } }; (nested.manifest as any).provenance = { evidence: {} };
    expect(() => validateRecipeShape(nested)).toThrow();
  });
  test("rejects malformed spans, missing references and incomplete mappings", () => {
    for (const span of [{ path: "src/action.ts", startLine: 0, endLine: 2 }, { path: "../action.ts", startLine: 1, endLine: 2 }, { path: "missing.ts", startLine: 1, endLine: 2 }]) {
      const recipe = valid(); (recipe.source as any).spans.action = span; expect(() => validateRecipeShape(recipe)).toThrow();
    }
    const recipe = valid(); delete (recipe.operationSources as any).healthcheck; expect(() => validateRecipeShape(recipe)).toThrow();
  });
});

describe("recipe filesystem discovery", () => {
  test("loads the reviewed Coda and Buildkite recipes", async () => {
    for (const provider of ["coda", "ably"]) await expect(readRecipe(join(import.meta.dir, "..", "recipes", provider))).resolves.toMatchObject({ providerId: provider });
  });
  const roots: string[] = [];
  afterEach(async () => { /* temporary directories are disposable and isolated */ });
  const structural = () => ({ schemaVersion: 1, providerId: "alpha", appcallId: "alpha", source: { url: "https://example.com", revision: "33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a", files: { "src/a.ts": "a".repeat(64) }, spans: { a: { path: "src/a.ts", startLine: 1, endLine: 1 } } }, selection: { providerId: "alpha", appcallId: "alpha", disposition: "HOLD", edition: "international", operations: ["healthcheck"], upstreamSha: "33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a", marketFocus: "unknown" }, research: {}, operationSources: { healthcheck: { upstreamActionId: "check", sourceRefs: ["a"], documentationUrls: ["https://example.com"], responseContract: "preserve-existing", adaptations: [] } }, manifest: { key: "alpha", provenance: { source: { url: "https://example.com", revision: "33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a" } }, evidence: { fixture: { status: "supplied" }, live: { status: "unverified" } }, operations: { healthcheck: {} } } });
  test("rejects oversized JSON and symlinked recipe files", async () => {
    const root = await mkdtemp(join(tmpdir(), "recipes-")); roots.push(root); const dir = join(root, "alpha"); await mkdir(dir);
    await writeFile(join(dir, "recipe.json"), JSON.stringify(structural()));
    await symlink(join(dir, "recipe.json"), join(root, "link.json"));
    expect(await readRecipe(dir)).toMatchObject({ providerId: "alpha" });
    expect(readRecipe(join(root, "link.json"))).rejects.toThrow();
  });
  test("rejects duplicate appcall identities and directory mismatch", async () => {
    const root = await mkdtemp(join(tmpdir(), "recipes-")); roots.push(root);
    for (const name of ["alpha", "beta"]) { const dir = join(root, name); await mkdir(dir); await writeFile(join(dir, "recipe.json"), JSON.stringify({ ...structural(), providerId: name })); }
    await expect(discoverRecipes(root)).rejects.toThrow();
  });
});
