// runner/sena-e2e/safety.ts
// The single decision point for whether a send actually hits the wire and to
// whom. Pure and total: every path through the harness's send stage goes through
// resolveSend, so bulk-to-real-recipients is impossible unless every gate passes.
import type { HarnessConfig, SendMode } from "./config";

export type Channel = "email" | "dm";

export interface SendContext {
  processedSends: number;        // sends already performed this run (cap accounting)
  priorEvidenceGreen?: boolean;  // a prior live_single send + booking link succeeded
}

export interface SendDecision {
  shouldSend: boolean;
  recipient: string; // the recipient the caller MUST use (may be overridden)
  reason: string;
}

export function resolveSend(
  cfg: HarnessConfig,
  channel: Channel,
  intendedRecipient: string,
  ctx: SendContext,
): SendDecision {
  const mode: SendMode = cfg.sendMode;

  if (mode === "dry_run") {
    return { shouldSend: false, recipient: intendedRecipient, reason: "dry_run: composed only, not sent" };
  }

  if (mode === "live_single") {
    const target = channel === "email" ? cfg.testRecipientEmail : cfg.testRecipientProfile;
    if (!target) {
      throw new Error(`live_single requires a test recipient for channel "${channel}" (set TEST_RECIPIENT_EMAIL / TEST_RECIPIENT_PROFILE)`);
    }
    // Per-lead fan-out is bounded by the caller's per-lead loop; live_single only
    // ever targets the test recipient, so an extra send cannot reach a real lead.
    return { shouldSend: true, recipient: target, reason: "live_single: recipient overridden to test target" };
  }

  // mode === "live_bulk"
  if (!cfg.allowBulk) {
    throw new Error("live_bulk requires the --allow-bulk flag");
  }
  if (!ctx.priorEvidenceGreen) {
    throw new Error("live_bulk requires prior green evidence (a successful live_single send + booking link)");
  }
  if (ctx.processedSends >= cfg.maxLeads) {
    return { shouldSend: false, recipient: intendedRecipient, reason: `live_bulk: maxLeads cap (${cfg.maxLeads}) reached` };
  }
  return { shouldSend: true, recipient: intendedRecipient, reason: "live_bulk: gated send to real recipient" };
}
