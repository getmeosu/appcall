/**
 * Recipe drift check for runner/connectors/recipes/<provider>/recipe.json.
 *
 * Each of those recipes embeds a full copy of its connector's manifest under
 * `recipe.manifest`. Nothing regenerates that copy, so it silently goes stale
 * when the connector's manifest.json changes (TikTok Ads shipped with 423 of
 * 424 embedded op bodies from before TT-0). This helper deep-compares the two
 * and lists every differing JSON path, so a connector test can fail on any
 * drift: op bodies, requiredScopes, auth.scopes, routes, sideEffects, schemas,
 * version, models, http, network, added or missing ops.
 *
 * Objects are compared key-order-insensitively (JSON semantics); arrays are
 * order-sensitive. A key that is present on one side and absent on the other
 * is drift, even if its value is null.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const CONNECTORS_ROOT = join(import.meta.dir, "..");

function kind(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function pathKey(base: string, key: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? `${base}.${key}` : `${base}[${JSON.stringify(key)}]`;
}

/** Every JSON path where `actual` differs from `expected`, in a stable order. */
export function jsonDrift(expected: unknown, actual: unknown, path = "$"): string[] {
  const ek = kind(expected);
  const ak = kind(actual);
  if (ek !== ak) return [`${path}: expected ${ek}, recipe has ${ak}`];
  if (ek === "array") {
    const e = expected as unknown[];
    const a = actual as unknown[];
    const out: string[] = [];
    if (e.length !== a.length) out.push(`${path}: expected length ${e.length}, recipe has ${a.length}`);
    for (let i = 0; i < Math.min(e.length, a.length); i++) out.push(...jsonDrift(e[i], a[i], `${path}[${i}]`));
    return out;
  }
  if (ek === "object") {
    const e = expected as Record<string, unknown>;
    const a = actual as Record<string, unknown>;
    const out: string[] = [];
    for (const key of [...new Set([...Object.keys(e), ...Object.keys(a)])].sort()) {
      const p = pathKey(path, key);
      if (!Object.hasOwn(a, key)) out.push(`${p}: missing from recipe`);
      else if (!Object.hasOwn(e, key)) out.push(`${p}: not in manifest.json`);
      else out.push(...jsonDrift(e[key], a[key], p));
    }
    return out;
  }
  return Object.is(expected, actual) ? [] : [`${path}: expected ${JSON.stringify(expected)}, recipe has ${JSON.stringify(actual)}`];
}

export type RecipeManifestPair = {
  recipePath: string;
  manifestPath: string;
  recipe: { appcallId?: unknown; manifest?: unknown; [key: string]: unknown };
  manifest: Record<string, unknown>;
};

/**
 * Load runner/connectors/recipes/<recipeDir>/recipe.json and
 * runner/connectors/<connectorDir>/manifest.json.
 */
export function loadRecipeManifestPair(recipeDir: string, connectorDir: string): RecipeManifestPair {
  const recipePath = join(CONNECTORS_ROOT, "recipes", recipeDir, "recipe.json");
  const manifestPath = join(CONNECTORS_ROOT, connectorDir, "manifest.json");
  return {
    recipePath,
    manifestPath,
    recipe: JSON.parse(readFileSync(recipePath, "utf8")),
    manifest: JSON.parse(readFileSync(manifestPath, "utf8")),
  };
}

/** Drift paths between the recipe's embedded manifest and manifest.json, rooted at `manifest`. */
export function recipeManifestDrift(pair: Pick<RecipeManifestPair, "recipe" | "manifest">): string[] {
  return jsonDrift(pair.manifest, pair.recipe.manifest, "manifest");
}
