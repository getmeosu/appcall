// RECIPE-DRIFT-ALL: every recipe that embeds a copy of a runner connector's
// manifest.json under `manifest` must match it exactly (object key order is
// ignored by jsonDrift; arrays are order-sensitive). Covers both recipe dirs:
//   runner/connectors/recipes/<dir>/recipe.json
//   scripts/connector-gen/openconnector/recipes/<dir>/recipe.json
// Each recipe maps to runner/connectors/<appcallId>/manifest.json (appcallId
// uses "-", dirs use "_"). Recipes with no matching manifest are listed below
// and skipped explicitly; a new or removed one fails this test.
import { describe, expect, it } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { jsonDrift, recipeManifestDrift } from "../recipe_drift.ts";

const CONNECTORS = join(import.meta.dir, "..", "..");
const REPO = join(CONNECTORS, "..", "..");
const DIRS = {
  runner: join(CONNECTORS, "recipes"),
  openconnector: join(REPO, "scripts", "connector-gen", "openconnector", "recipes"),
} as const;
type Dir = keyof typeof DIRS;

/**
 * Pending allowlist: known drift whose sync lands on another branch. Each entry
 * must still drift (a synced entry fails below, so remove it when the sync merges).
 */
const PENDING: Record<Dir, Record<string, string>> = {
  runner: {
    tiktok_ads: "synced on 2dd45703 (fix/tiktok-ads-recipe-sync, unmerged); not re-synced here to avoid a conflict",
    slack: "sync waits on the FX-slack-2 rebase (0.6.2); slack depth is owned by Grok Build",
  },
  openconnector: {},
};

/** Recipes with no runner/connectors/<appcallId>/manifest.json (or no embedded manifest). */
const NO_MANIFEST: Record<Dir, string[]> = {
  runner: ["hubspot"],
  openconnector: [
  "a_leads",
  "abstract",
  "abuseipdb",
  "accuweather",
  "activecampaign",
  "adobe_commerce",
  "adyntel",
  "aerisweather",
  "aeroleads",
  "aifinmarket",
  "alt_text_generator_ai",
  "altiria",
  "ambee",
  "amplemarket",
  "anysearch",
  "apaleo",
  "api2pdf",
  "api_ninjas",
  "apiframe",
  "apiverve",
  "app_store_connect",
  "app_store_server",
  "appcircle",
  "appdrag",
  "apple_ads",
  "apple_maps",
  "apple_notary",
  "aroflo",
  "auth0_management",
  "autoblogger",
  "autotask",
  "aviationstack",
  "aws_s3",
  "aws_sts",
  "bark",
  "baserow",
  "beebole",
  "benchmark_email",
  "big_data_cloud",
  "bigpicture_io",
  "bitbucket",
  "bitquery",
  "blocknative",
  "bluesky",
  "brave_search",
  "braze",
  "browserless",
  "bt_mcp",
  "btcpay_server",
  "builtwith",
  "byteforms",
  "cal",
  "calendarific",
  "callerapi",
  "callrail",
  "carbone",
  "cartes",
  "castingwords",
  "celigo",
  "census_bureau",
  "censys",
  "central_station_crm",
  "chargify",
  "chat_api_for_whatsapp",
  "chatbotkit",
  "chatpdf",
  "chatwork",
  "checkout_com",
  "claid_ai",
  "clari_copilot",
  "classmarker",
  "clickhelp",
  "clickhouse",
  "clinicalkey",
  "cloudconvert",
  "cloudflare_browser_rendering",
  "cloudflare_dns",
  "cloudflare_email_routing",
  "cloudflare_mcp",
  "cloudflare_r2",
  "cloudflare_worker",
  "cloudinary",
  "cloudlayer",
  "cochrane",
  "codegen",
  "codemagic",
  "coderpad",
  "cohere",
  "datalust",
  "discourse",
  "google_maps",
  "httpsms",
  "ipdata_co",
  "klangio",
  "metabase",
  "neetodesk",
  "phantombuster",
  "ritekit",
  "sunoapi",
  "teable",
  "the_colony",
  "trilium",
  "viggle",
  "worksnaps",
  ],
};

type Entry = { dir: string; id: string; recipe: any; manifest?: Record<string, unknown> };

function load(kind: Dir): Entry[] {
  return readdirSync(DIRS[kind]).sort().flatMap((dir) => {
    const path = join(DIRS[kind], dir, "recipe.json");
    if (!existsSync(path)) return [];
    const recipe = JSON.parse(readFileSync(path, "utf8"));
    const id = typeof recipe.appcallId === "string" ? recipe.appcallId : dir.replaceAll("_", "-");
    const manifestPath = join(CONNECTORS, id, "manifest.json");
    const manifest = existsSync(manifestPath) && recipe.manifest ? JSON.parse(readFileSync(manifestPath, "utf8")) : undefined;
    return [{ dir, id, recipe, manifest }];
  });
}

for (const kind of Object.keys(DIRS) as Dir[]) {
  describe(`${kind} recipes embed the current manifest.json`, () => {
    const entries = load(kind);

    it("lists every recipe without a matching manifest explicitly", () => {
      expect(entries.filter((e) => !e.manifest).map((e) => e.dir)).toEqual([...NO_MANIFEST[kind]].sort());
    });

    for (const entry of entries.filter((e) => e.manifest)) {
      const pending = PENDING[kind][entry.dir];
      it(`${entry.dir} -> ${entry.id}${pending ? " (pending allowlist)" : ""}`, () => {
        expect(entry.recipe.manifest.key).toBe(entry.id);
        const drift = recipeManifestDrift({ recipe: entry.recipe, manifest: entry.manifest! });
        if (pending) expect(drift.length, `${entry.dir} is synced; drop its PENDING entry`).toBeGreaterThan(0);
        else expect(drift).toEqual([]);
      });
    }

    it("has no stale pending-allowlist entries", () => {
      const mapped = new Set(entries.filter((e) => e.manifest).map((e) => e.dir));
      for (const dir of Object.keys(PENDING[kind])) expect(mapped.has(dir), dir).toBe(true);
    });
  });
}

describe("drift helper", () => {
  it("ignores object key order but not array order or values", () => {
    expect(jsonDrift({ a: 1, b: { c: [1, 2], d: null } }, { b: { d: null, c: [1, 2] }, a: 1 })).toEqual([]);
    expect(jsonDrift({ b: [1, 2] }, { b: [2, 1] })).toHaveLength(2);
    expect(jsonDrift({ a: 1 }, { a: 1, x: null })).toEqual(["$.x: not in manifest.json"]);
  });
});
