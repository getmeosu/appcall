import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { writeFile } from "node:fs/promises";
import { inventoryCatalog } from "./inventory";
import { discoverRecipes } from "./recipes";
import { loadFixtureCases } from "./recipe-fixtures";
import { buildRecipeCatalog } from "./recipe-build";
import { emitVerifiedCatalog } from "./recipe-emit";

type Args = { source: string; recipes: string; out: string; asOf: string };
const usage = "usage: bun catalog-cli.ts --source SNAPSHOT --recipes RECIPE_DIR --out /tmp/DIR --as-of YYYY-MM-DD";
export function parse(argv: string[]): Args {
  const allowed = new Set(["--source", "--recipes", "--out", "--as-of"]);
  const out: Partial<Args> = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (!allowed.has(flag)) throw new Error(`INVALID_ARGUMENTS: unknown flag ${flag}`);
    const value = argv[++i];
    if (!value || value.startsWith("--")) throw new Error(`INVALID_ARGUMENTS: missing value for ${flag}`);
    if (flag === "--source") out.source = value;
    if (flag === "--recipes") out.recipes = value;
    if (flag === "--out") out.out = value;
    if (flag === "--as-of") out.asOf = value;
  }
  if (!out.source || !out.recipes || !out.out || !out.asOf || !/^\d{4}-\d{2}-\d{2}$/.test(out.asOf)) throw new Error(`INVALID_ARGUMENTS: ${usage}`);
  const target = resolve(out.out);
  if (resolve(target, "..") !== resolve(tmpdir())) throw new Error("UNSAFE_OUTPUT: --out must be a direct child of the staging temp directory");
  return out as Args;
}

export async function runCatalog(args: Args) {
  const inventory = await inventoryCatalog({ sourceRoot: args.source });
  const recipes = await discoverRecipes(args.recipes);
  const byProvider = Object.fromEntries(recipes.map((r) => [r.providerId, join(args.recipes, r.providerId)]));
  const build = await buildRecipeCatalog({
    recipes,
    asOf: args.asOf,
    snapshot: { root: args.source, inventory: inventory.providers.map((p) => ({ providerId: p.providerId, appcallId: p.existingAppCallId })) },
    recipeDirs: byProvider,
    fixtureCases: (recipe) => loadFixtureCases(join(byProvider[recipe.providerId]!, "fixtures", "cases")),
  });
  if (build.records.some((r) => r.status === "FAILED")) throw new Error(`CATALOG_FAILED: ${JSON.stringify(build.records.filter((r) => r.status === "FAILED"))}`);
  const report = await emitVerifiedCatalog(build, args.out);
  const rebuiltById = new Map((report.rebuilt as Array<{ appcallId: string }>).map((row) => [row.appcallId, row]));
  const decisions = build.records.map((row) => rebuiltById.get(row.appcallId) ?? row);
  const counts = Object.fromEntries(["ACCEPTED", "HOLD", "EXCLUDE", "FAILED"].map((status) => [status, decisions.filter((row) => row.status === status).length]));
  const fullReport = { ...report, sourceInventory: inventory, decisions, inventoryCount: inventory.counts.providers, acceptedCount: report.accepted.length, counts };
  await writeFile(join(args.out, "report.json"), JSON.stringify(fullReport, null, 2) + "\n");
  return fullReport;
}

if (import.meta.main) {
  try { console.log(JSON.stringify(await runCatalog(parse(Bun.argv.slice(2))), null, 2)); }
  catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exit(2); }
}
