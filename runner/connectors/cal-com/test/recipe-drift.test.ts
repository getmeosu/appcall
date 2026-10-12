// RECIPE-SYNC-2: recipes/cal_com/recipe.json embeds a full copy of
// manifest.json under `manifest`. This fails on any drift between the two, so a
// manifest change that isn't mirrored into the recipe can't land.
import { describe, expect, it } from "bun:test";
import { jsonDrift, loadRecipeManifestPair, recipeManifestDrift } from "../../_shared/recipe_drift.ts";

const pair = loadRecipeManifestPair("cal_com", "cal-com");
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

describe("cal-com recipe drift", () => {
  it("embeds exactly the current manifest.json", () => {
    expect(pair.recipe.appcallId).toBe("cal-com");
    expect(recipeManifestDrift(pair)).toEqual([]);
    expect(pair.recipe.manifest).toEqual(pair.manifest);
  });

  it("pins version 0.3.1 in both", () => {
    expect((pair.manifest as any).version).toBe("0.3.1");
    expect((pair.recipe.manifest as any).version).toBe("0.3.1");
  });

  describe("catches every kind of drift", () => {
    const ops = Object.keys((pair.manifest as any).operations);
    const op = "event_types.delete";
    const mutate = (fn: (embedded: any) => void) => {
      const recipe = clone(pair.recipe) as any;
      fn(recipe.manifest);
      return recipeManifestDrift({ recipe, manifest: pair.manifest });
    };

    it("has a sample op to mutate", () => {
      expect(ops).toContain(op);
      expect(ops).toHaveLength(175);
    });

    const cases: Array<[string, (m: any) => void, string]> = [
      ["version", (m) => { m.version = "0.3.0"; }, "manifest.version"],
      ["auth.scopes", (m) => { m.auth.scopes = []; }, "manifest.auth.scopes"],
      ["sideEffect", (m) => { m.operations[op].sideEffect = "write"; }, `manifest.operations["${op}"].sideEffect`],
      ["input schema", (m) => { m.operations[op].inputSchema.required = []; }, `manifest.operations["${op}"].inputSchema.required`],
      ["output schema", (m) => { m.operations[op].outputSchema = { type: "object" }; }, `manifest.operations["${op}"].outputSchema`],
      ["description", (m) => { m.operations[op].description += " (stale)"; }, `manifest.operations["${op}"].description`],
      ["stale request key on an op", (m) => { m.operations[op].request = { method: "DELETE" }; }, `manifest.operations["${op}"].request: not in manifest.json`],
      ["missing op", (m) => { delete m.operations[op]; }, `manifest.operations["${op}"]: missing from recipe`],
      ["extra op", (m) => { m.operations["ghost.op"] = {}; }, `manifest.operations["ghost.op"]: not in manifest.json`],
      ["models", (m) => { m.models = {}; }, "manifest.models"],
      ["stale top-level http", (m) => { m.http = {}; }, "manifest.http: not in manifest.json"],
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
    });
  });
});
