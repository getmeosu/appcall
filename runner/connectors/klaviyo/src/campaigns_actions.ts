import { createKlaviyoClient, firstString, parseKlaviyoRateLimit, prop, queryPath, isRecord } from "./http";
import { normalizeCampaign, type NormalizedCampaign } from "./objects";

// ─── campaigns.create ─────────────────────────────────────────────────────────

export type CreateCampaignInput = {
  name: string;
  channel: "email" | "sms";
  listId?: string;
  sendTime?: string;
  fromEmail?: string;
  fromLabel?: string;
  subject?: string;
  body?: string;
};

export function validateCreateCampaignInput(input: unknown): CreateCampaignInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  const channel = typeof input.channel === "string" ? input.channel : "email";
  if (channel !== "email" && channel !== "sms") throw new Error("channel must be 'email' or 'sms'");
  const out: CreateCampaignInput = {
    name: requireString(input.name, "name"),
    channel: channel as "email" | "sms",
    listId: typeof input.listId === "string" && input.listId.length > 0 ? input.listId : undefined,
    sendTime: typeof input.sendTime === "string" ? input.sendTime : undefined,
    fromEmail: typeof input.fromEmail === "string" ? input.fromEmail : undefined,
    fromLabel: typeof input.fromLabel === "string" ? input.fromLabel : undefined,
    subject: typeof input.subject === "string" ? input.subject : undefined,
    body: typeof input.body === "string" && input.body.length > 0 ? input.body : undefined,
  };
  // KV-1: audiences (with audiences.included) is REQUIRED for campaign create
  // (arch notes TF:183, TF:205 NEW-REQUIRED audiences.included); listId stays
  // optional in the manifest schema and is enforced here, before any HTTP call.
  if (out.listId === undefined) throw new Error("listId is required: Klaviyo campaigns need an audience (audiences.included)");
  // KV-1: SMS definitions need content.body (revision 2026-07-15 NEW-REQUIRED
  // definition.content.body, arch notes TF:205); fail before any HTTP call.
  if (out.channel === "sms" && out.body === undefined) throw new Error("body is required when channel is 'sms'");
  return out;
}

export async function createCampaignFromClient(
  options: { apiKey: string; fetch?: typeof fetch },
  input: unknown
): Promise<{ ok: true; campaign: NormalizedCampaign } | { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } }> {
  const rawData = isRecord(input) && isRecord(input.data) ? input.data : undefined;
  const payload = rawData ? { name: "", channel: "email" as const } : validateCreateCampaignInput(input);
  const client = createKlaviyoClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "campaigns.create" });
  // KV-0 (current REVISION, see ./revision): campaign messages carry their channel and
  // content under `definition` inside the `campaign-messages` attribute
  // (hyphen key), the audience goes in `audiences.included`, and a scheduled time
  // goes in a static `send_strategy`. The caller contract (inputs/outputs) is
  // unchanged; only the upstream body shape moved.
  const attrs: Record<string, unknown> = { name: payload.name };
  if ("listId" in payload && payload.listId) attrs.audiences = { included: [payload.listId] };
  if (payload.sendTime) attrs.send_strategy = { method: "static", datetime: payload.sendTime };

  const content: Record<string, unknown> = {};
  if (payload.subject) content.subject = payload.subject;
  if (payload.fromEmail) content.from_email = payload.fromEmail;
  if (payload.fromLabel) content.from_label = payload.fromLabel;
  if (payload.channel === "sms" && "body" in payload && payload.body) content.body = payload.body;
  attrs["campaign-messages"] = { data: [{ type: "campaign-message", attributes: { definition: { channel: payload.channel, content } } }] };

  const body: Record<string, unknown> = rawData ? { data: rawData } : { data: { type: "campaign", attributes: attrs } };

  const result = await client.fetchJSON("/campaigns", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (result.status === 201 || result.status === 200) {
    const respBody = isRecord(result.body) ? result.body : {};
    const data = isRecord(respBody.data) ? respBody.data : { id: "", attributes: { name: payload.name, status: "draft" } };
    const campaign = normalizeCampaign(data, respBody.included);
    // The response may omit `included`; the channel is then the one Klaviyo
    // just accepted in definition.channel (not for raw `data` passthrough).
    if (!campaign.channelId && !rawData) campaign.channelId = payload.channel;
    return { ok: true, campaign };
  }
  const rl = parseKlaviyoRateLimit(result.status, result.headers);
  if (rl.limited) return { ok: false, error: { code: "CONNECTOR_RATE_LIMITED", message: "Klaviyo rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
  return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Klaviyo rejected the create campaign request." } };
}

export type GetCampaignInput = { campaignId: string };
export type UpdateCampaignInput = { campaignId: string; name?: string };
export type SendCampaignInput = { campaignId: string };

export function validateGetCampaignInput(input: unknown): GetCampaignInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return { campaignId: firstString(input, ["campaignId", "id"], "campaignId") };
}

export function validateUpdateCampaignInput(input: unknown): UpdateCampaignInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return {
    campaignId: firstString(input, ["campaignId", "id"], "campaignId"),
    name: typeof input.name === "string" ? input.name : undefined,
  };
}

export function validateSendCampaignInput(input: unknown): SendCampaignInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return { campaignId: firstString(input, ["campaignId", "id"], "campaignId") };
}

export async function getCampaignFromClient(
  options: { apiKey: string; fetch?: typeof fetch },
  input: unknown
): Promise<{ ok: true; campaign: NormalizedCampaign } | { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } }> {
  const payload = validateGetCampaignInput(input);
  const client = createKlaviyoClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "campaigns.get" });
  const result = await client.fetchJSON(queryPath(`/campaigns/${payload.campaignId}`, withCampaignMessages(input)));
  if (result.status === 200) {
    const body = isRecord(result.body) ? result.body : {};
    const data = isRecord(body.data) ? body.data : { id: payload.campaignId, attributes: {} };
    return { ok: true, campaign: normalizeCampaign(data, body.included) };
  }
  const rl = parseKlaviyoRateLimit(result.status, result.headers);
  if (rl.limited) return { ok: false, error: { code: "CONNECTOR_RATE_LIMITED", message: "Klaviyo rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
  if (result.status === 404) return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Campaign not found." } };
  return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Klaviyo rejected the get campaign request." } };
}

export async function updateCampaignFromClient(
  options: { apiKey: string; fetch?: typeof fetch },
  input: unknown
): Promise<{ ok: true; campaign: NormalizedCampaign } | { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } }> {
  const payload = validateUpdateCampaignInput(input);
  const client = createKlaviyoClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "campaigns.update" });
  const attrs: Record<string, unknown> = {};
  if (payload.name !== undefined) attrs.name = payload.name;
  const result = await client.fetchJSON(`/campaigns/${payload.campaignId}`, {
    method: "PATCH",
    body: JSON.stringify({ data: { type: "campaign", id: payload.campaignId, attributes: attrs } }),
  });
  if (result.status === 200) {
    const body = isRecord(result.body) ? result.body : {};
    const data = isRecord(body.data) ? body.data : { id: payload.campaignId, attributes: attrs };
    return { ok: true, campaign: normalizeCampaign(data, body.included) };
  }
  const rl = parseKlaviyoRateLimit(result.status, result.headers);
  if (rl.limited) return { ok: false, error: { code: "CONNECTOR_RATE_LIMITED", message: "Klaviyo rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
  if (result.status === 404) return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Campaign not found." } };
  return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Klaviyo rejected the update campaign request." } };
}

export async function sendCampaignFromClient(
  options: { apiKey: string; fetch?: typeof fetch },
  input: unknown
): Promise<{ ok: true; job: { id: string; status: string } } | { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } }> {
  const payload = validateSendCampaignInput(input);
  const client = createKlaviyoClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "campaigns.send" });
  const result = await client.fetchJSON("/campaign-send-jobs", {
    method: "POST",
    body: JSON.stringify({ data: { type: "campaign-send-job", id: payload.campaignId } }),
  });
  if (result.status === 202 || result.status === 201 || result.status === 200) {
    const body = result.body as Record<string, unknown>;
    const data = isRecord(body.data) ? body.data : { id: payload.campaignId, attributes: {} };
    const attrs = isRecord(data.attributes) ? data.attributes : {};
    return { ok: true, job: { id: typeof data.id === "string" ? data.id : payload.campaignId, status: typeof attrs.status === "string" ? attrs.status : "" } };
  }
  const rl = parseKlaviyoRateLimit(result.status, result.headers);
  if (rl.limited) return { ok: false, error: { code: "CONNECTOR_RATE_LIMITED", message: "Klaviyo rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
  if (result.status === 404) return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Campaign not found." } };
  return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Klaviyo rejected the send campaign request." } };
}

// KV-1: the channel lives on the campaign message (definition.channel), so
// campaigns.get asks for include=campaign-messages with a sparse fieldset of
// just definition.channel, unless the caller already set include.
function withCampaignMessages(input: unknown): Record<string, unknown> {
  const base: Record<string, unknown> = isRecord(input) ? { ...input } : {};
  const existing = typeof base.include === "string" ? base.include.split(",") : Array.isArray(base.include) ? base.include.filter((x): x is string => typeof x === "string") : [];
  if (existing.includes("campaign-messages")) return base;
  base.include = [...existing, "campaign-messages"];
  if (base["fields[campaign-message]"] === undefined) base["fields[campaign-message]"] = "definition.channel";
  return base;
}

function requireString(v: unknown, f: string): string {
  if (typeof v !== "string" || !v.length) throw new Error(`${f} is required`);
  return v;
}
