// runner/sena-e2e/stages.ts
// The funnel stages. Each is idempotent and advances a lead's `stage`. The send
// stage is the only one that can touch a real inbox, and only via resolveSend.
import type { HarnessConfig } from "./config";
import { Store, type Lead } from "./state";
import { resolveSend } from "./safety";
import { mcpCall, mcpListTools, listConnections, actionCall } from "./client";

const ISO_FALLBACK = "1970-01-01T00:00:00.000Z";
function now(): string {
  // Bun runtime has a real clock; this harness is not a replay layer.
  try { return new Date().toISOString(); } catch { return ISO_FALLBACK; }
}

export interface ConnMap { [connector: string]: string } // connector -> connection id

export async function preflight(cfg: HarnessConfig, store: Store): Promise<ConnMap> {
  const tools = await mcpListTools(cfg);
  const required = ["apollo", "brevo", "unipile", "apify"];
  const surfaceConnectors = new Set(tools.map((t) => t.split("__")[0]));
  const missing = required.filter((c) => !surfaceConnectors.has(c));
  if (missing.length) {
    console.warn(`[preflight] connectors with no exposed tools: ${missing.join(", ")} (NOT_RUN if unconnected)`);
  }
  // Surface sanity: nothing outside sena_mvt should appear.
  const SENA_MVT_CONNECTORS = new Set(["apollo", "brevo", "unipile", "apify", "rb2b", "google-workspace", "cal-com", "calendly", "googlemeet"]);
  const leaked = tools.map((t) => t.split("__")[0]).filter((c) => !SENA_MVT_CONNECTORS.has(c));
  if (leaked.length) throw new Error(`[preflight] capability profile leaked non-sena_mvt connectors: ${Array.from(new Set(leaked)).join(", ")}`);

  const conns = await listConnections(cfg);
  const map: ConnMap = {};
  for (const c of conns) if (c.status === "active") map[c.connector] = c.id;
  store.appendEvidence({ ts: now(), stage: "preflight", tool: "tools/list", request_id: "", status: "ok", mode: cfg.sendMode });
  return map;
}

export async function source(cfg: HarnessConfig, store: Store, actorId: string, actorInput: unknown): Promise<Lead[]> {
  const r = await mcpCall(cfg, "apify__actor__run_sync_get_dataset_items", { actorId, input: actorInput });
  store.appendEvidence({ ts: now(), stage: "source", tool: "apify__actor__run_sync_get_dataset_items", request_id: r.requestId, status: r.ok ? "ok" : "error", mode: cfg.sendMode });
  const items: any[] = Array.isArray(r.output) ? r.output : ((r.output as any)?.items ?? []);
  const leads: Lead[] = items.slice(0, cfg.maxLeads).map((it, i) => ({
    lead_id: String(it.id ?? i + 1),
    full_name: it.name ?? it.fullName ?? "",
    title: it.title ?? "",
    company: it.company ?? it.organization ?? "",
    linkedin_url: it.linkedinUrl ?? it.profileUrl ?? "",
    email: it.email ?? "",
    apollo_id: "",
    stage: "sourced",
    channel: it.email ? "email" : "dm",
    booking_url: "",
    last_request_id: r.requestId,
  }));
  // NOTE: source is destructive on re-run — it overwrites leads.csv, resetting stage/booking_url. Run source only at the start of a fresh batch.
  store.writeLeads(leads);
  return leads;
}

export async function enrich(cfg: HarnessConfig, store: Store): Promise<void> {
  const leads = store.readLeads();
  if (leads.length === 0) console.warn("[enrich] no leads in state — seed leads.csv or set APIFY_ACTOR_ID");
  for (const lead of leads) {
    if (lead.stage !== "sourced") continue;
    const r = await mcpCall(cfg, "apollo__people__match", { name: lead.full_name, organization_name: lead.company });
    const person: any = (r.output as any)?.person ?? {};
    if (person.email && !lead.email) lead.email = person.email;
    if (person.id) lead.apollo_id = person.id;
    lead.stage = "enriched";
    lead.last_request_id = r.requestId;
    store.appendEvidence({ ts: now(), stage: "enrich", tool: "apollo__people__match", request_id: r.requestId, status: r.ok ? "ok" : "error", mode: cfg.sendMode });
  }
  store.writeLeads(leads);
}

export interface ComposedMessage { subject: string; html: string; dm: string; }
export function composeFor(lead: Lead, bookingUrl: string): ComposedMessage {
  const link = bookingUrl || "{{booking_url}}";
  return {
    subject: `${lead.full_name?.split(" ")[0] ?? "there"}, a quick demo?`,
    html: `<p>Hi ${lead.full_name},</p><p>Saw your work at ${lead.company}. Worth a quick demo? Grab a slot: <a href="${link}">${link}</a></p>`,
    dm: `Hi ${lead.full_name?.split(" ")[0] ?? "there"} — would a short demo be useful? You can book here: ${link}`,
  };
}

export async function booking(cfg: HarnessConfig, store: Store, conn: ConnMap): Promise<void> {
  const calId = conn["calendly"];
  if (!calId) { console.warn("[booking] no active calendly connection — NOT_RUN"); return; }
  if (!cfg.calendlyToken || !cfg.calendlyEventType) { console.warn("[booking] CALENDLY_TOKEN/EVENT_TYPE missing — NOT_RUN"); return; }
  const leads = store.readLeads();
  for (const lead of leads) {
    if (lead.stage !== "enriched") continue;
    const r = await actionCall(cfg, calId, "scheduling_links.create",
      { owner: cfg.calendlyEventType, max_event_count: 1 }, cfg.calendlyToken);
    const url = (r.output as any)?.booking_url ?? (r.output as any)?.resource?.booking_url ?? "";
    lead.booking_url = url;
    lead.stage = "booking_ready";
    lead.last_request_id = r.requestId;
    store.appendEvidence({ ts: now(), stage: "booking", tool: "calendly:scheduling_links.create", request_id: r.requestId, status: r.ok ? "ok" : "error", mode: cfg.sendMode });
  }
  store.writeLeads(leads);
}

export async function send(cfg: HarnessConfig, store: Store, conn: ConnMap): Promise<void> {
  const leads = store.readLeads();
  const priorEvidenceGreen = store.priorEvidenceGreen();
  let processedSends = 0;
  for (const lead of leads) {
    if (lead.stage !== "booking_ready") continue;
    const msg = composeFor(lead, lead.booking_url);
    let attempted = false;

    if (lead.email) {
      attempted = true;
      const decision = resolveSend(cfg, "email", lead.email, { processedSends, priorEvidenceGreen });
      console.log(`[send/email] ${decision.reason} -> ${decision.recipient}`);
      if (decision.shouldSend) {
        const r = await mcpCall(cfg, "brevo__smtp__email__send", {
          to: [{ email: decision.recipient }], subject: msg.subject, htmlContent: msg.html,
        });
        processedSends++;
        store.appendEvidence({ ts: now(), stage: "send", tool: "brevo__smtp__email__send", request_id: r.requestId, status: r.ok ? "ok" : "error", mode: cfg.sendMode });
      } else {
        store.appendEvidence({ ts: now(), stage: "send", tool: "brevo__smtp__email__send", request_id: "", status: "skipped", mode: cfg.sendMode });
      }
    } else if (lead.linkedin_url && conn["unipile"]) {
      attempted = true;
      const decision = resolveSend(cfg, "dm", lead.linkedin_url, { processedSends, priorEvidenceGreen });
      console.log(`[send/dm] ${decision.reason} -> ${decision.recipient}`);
      if (decision.shouldSend) {
        const r = await mcpCall(cfg, "unipile__messages__send", { profile_url: decision.recipient, text: msg.dm });
        processedSends++;
        store.appendEvidence({ ts: now(), stage: "send", tool: "unipile__messages__send", request_id: r.requestId, status: r.ok ? "ok" : "error", mode: cfg.sendMode });
      } else {
        store.appendEvidence({ ts: now(), stage: "send", tool: "unipile__messages__send", request_id: "", status: "skipped", mode: cfg.sendMode });
      }
    } else {
      // No contactable channel: no email, and no linkedin_url + active unipile connection.
      // Leave the lead at booking_ready so a re-run can retry once a channel exists.
      console.warn(`[send] no contactable channel for lead_id=${lead.lead_id} — leaving at booking_ready (no email; no linkedin_url or no active unipile connection)`);
      store.appendEvidence({ ts: now(), stage: "send", tool: "send", request_id: "", status: "skipped", mode: cfg.sendMode });
    }

    if (attempted) lead.stage = "sent";
  }
  store.writeLeads(leads);
}
