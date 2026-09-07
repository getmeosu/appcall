// runner/sena-e2e/index.ts
// Entry point: bun run runner/sena-e2e/index.ts --mode=dry_run
import { loadConfig } from "./config";
import { Store } from "./state";
import { preflight, source, enrich, booking, send } from "./stages";

async function main() {
  const cfg = loadConfig();
  console.log(`[sena-e2e] mode=${cfg.sendMode} account=${cfg.externalAccountId} maxLeads=${cfg.maxLeads}`);
  if (cfg.sendMode === "live_bulk" && !cfg.allowBulk) {
    throw new Error("refusing live_bulk without --allow-bulk");
  }
  const store = new Store(cfg.stateDir);

  const conn = await preflight(cfg, store);
  console.log(`[sena-e2e] active connections: ${Object.keys(conn).join(", ") || "(none)"}`);

  // Source actor + input are env-driven so the harness stays provider-agnostic.
  const actorId = process.env.APIFY_ACTOR_ID ?? "";
  if (actorId) {
    await source(cfg, store, actorId, JSON.parse(process.env.APIFY_ACTOR_INPUT ?? "{}"));
  } else {
    console.warn("[sena-e2e] APIFY_ACTOR_ID unset — skipping source; seed leads.csv manually for P1");
  }

  await enrich(cfg, store);
  await booking(cfg, store, conn);
  await send(cfg, store, conn);

  console.log(`[sena-e2e] done. State in ${cfg.stateDir}/leads.csv and evidence.jsonl`);
}

main().catch((err) => { console.error("[sena-e2e] FAILED:", err.message); process.exit(1); });
