// TT-RECIPE-SYNC: recipes/tiktok_ads/recipe.json embeds a full copy of
// manifest.json under `manifest`. This fails on any drift between the two, so a
// manifest change that isn't mirrored into the recipe can't land.
import { describe, expect, it } from "bun:test";
import { jsonDrift, loadRecipeManifestPair, recipeManifestDrift } from "../../_shared/recipe_drift.ts";

const pair = loadRecipeManifestPair("tiktok_ads", "tiktok-ads");
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

describe("tiktok-ads recipe drift", () => {
  it("embeds exactly the current manifest.json", () => {
    expect(pair.recipe.appcallId).toBe("tiktok-ads");
    expect(recipeManifestDrift(pair)).toEqual([]);
    expect(pair.recipe.manifest).toEqual(pair.manifest);
  });

  it("pins version 0.8.2 and empty connect-time scopes in both", () => {
    const embedded = pair.recipe.manifest as any;
    expect((pair.manifest as any).version).toBe("0.8.2");
    expect(embedded.version).toBe("0.8.2");
    expect((pair.manifest as any).auth.scopes).toEqual([]);
    expect(embedded.auth.scopes).toEqual([]);
    expect(JSON.stringify(embedded)).not.toContain("ad.management");
  });

  describe("catches every kind of drift", () => {
    const ops = Object.keys((pair.manifest as any).operations);
    const op = "catalogs.videos.get";
    const mutate = (fn: (embedded: any) => void) => {
      const recipe = clone(pair.recipe) as any;
      fn(recipe.manifest);
      return recipeManifestDrift({ recipe, manifest: pair.manifest });
    };

    it("has a sample op to mutate", () => {
      expect(ops).toContain(op);
      expect(ops).toHaveLength(424);
    });

    const cases: Array<[string, (m: any) => void, string]> = [
      ["version", (m) => { m.version = "0.8.1"; }, "manifest.version"],
      ["fake connect-time scopes", (m) => { m.auth.scopes = ["ad.management", "ad.read"]; }, "manifest.auth.scopes"],
      ["requiredScopes", (m) => { m.operations[op].requiredScopes = []; }, `manifest.operations["${op}"].requiredScopes`],
      ["route", (m) => { m.operations[op].request.path = "/stale/path/"; }, `manifest.operations["${op}"].request.path`],
      ["sideEffect", (m) => { m.operations["comments.delete"].sideEffect = "write"; }, `manifest.operations["comments.delete"].sideEffect`],
      ["input schema", (m) => { m.operations[op].inputSchema.required = ["catalogId"]; }, `manifest.operations["${op}"].inputSchema.required`],
      ["output schema", (m) => { m.operations[op].outputSchema = { type: "object" }; }, `manifest.operations["${op}"].outputSchema`],
      ["description", (m) => { m.operations[op].description += " (stale)"; }, `manifest.operations["${op}"].description`],
      ["extra key on an op", (m) => { m.operations[op].idempotent = true; }, `manifest.operations["${op}"].idempotent: not in manifest.json`],
      ["missing op", (m) => { delete m.operations[op]; }, `manifest.operations["${op}"]: missing from recipe`],
      ["extra op", (m) => { m.operations["ghost.op"] = {}; }, `manifest.operations["ghost.op"]: not in manifest.json`],
      ["models", (m) => { m.models = {}; }, "manifest.models"],
      ["http", (m) => { m.http = { ...m.http, stale: true }; }, "manifest.http.stale"],
    ];
    for (const [name, fn, path] of cases) {
      it(`flags ${name}`, () => {
        const drift = mutate(fn);
        expect(drift.length).toBeGreaterThan(0);
        expect(drift.some((line) => line.startsWith(path))).toBe(true);
      });
    }

    it("ignores object key order but not array order", () => {
      expect(jsonDrift({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 })).toEqual([]);
      expect(jsonDrift({ b: [1, 2] }, { b: [2, 1] })).toHaveLength(2);
      expect(jsonDrift({ a: null }, {})).toEqual(["$.a: missing from recipe"]);
    });
  });
});
