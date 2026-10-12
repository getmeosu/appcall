// runner/sena-e2e/index.ts
// Entry point: bun run runner/sena-e2e/index.ts --mode=dry_run
import { loadConfig } from "./config";
import { Store } from "./state";
import { preflight, source, enrich, booking, send, runFailures } from "./stages";

async function main() {
  const cfg = loadConfig();
  console.log(`[sena-e2e] mode=${cfg.sendMode} account=${cfg.externalAccountId} maxLeads=${cfg.maxLeads}`);
  if (cfg.sendMode === "live_bulk" && !cfg.allowBulk) {
    throw new Error("refusing live_bulk without --allow-bulk");
  }
  const store = new Store(cfg.stateDir);

  const conn = await preflight(cfg, store);
  console.log(`[sena-e2e] active connections: ${Object.keys(conn).join(", ") || "(none)"}`);

  let sourceFailed: Array<{ lead_id: string; error_code: string }> = [];
  // Source actor + input are env-driven so the harness stays provider-agnostic.
  const actorId = process.env.APIFY_ACTOR_ID ?? "";
  if (actorId) {
    sourceFailed = (await source(cfg, store, actorId, JSON.parse(process.env.APIFY_ACTOR_INPUT ?? "{}"))).failed;
  } else {
    console.warn("[sena-e2e] APIFY_ACTOR_ID unset — skipping source; seed leads.csv manually for P1");
  }

  const enrichReport = await enrich(cfg, store);
  const bookingReport = await booking(cfg, store, conn);
  const sendReport = await send(cfg, store, conn);

  // SENA-ERR / SENA-ERR-2: any stage failure fails the run instead of being logged and dropped.
  const failures = runFailures({ source: sourceFailed, enrich: enrichReport.failed, booking: bookingReport.failed, send: sendReport.failed });
  if (failures) throw new Error(failures);
  console.log(`[sena-e2e] done. State in ${cfg.stateDir}/leads.csv and evidence.jsonl`);
}

main().catch((err) => { console.error("[sena-e2e] FAILED:", err.message); process.exit(1); });
