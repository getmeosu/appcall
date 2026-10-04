import { createKlaviyoClient, parseKlaviyoRateLimit, prop, isRecord } from "./http";
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
};

export function validateCreateCampaignInput(input: unknown): CreateCampaignInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  const channel = typeof input.channel === "string" ? input.channel : "email";
  if (channel !== "email" && channel !== "sms") throw new Error("channel must be 'email' or 'sms'");
  return {
    name: requireString(input.name, "name"),
    channel: channel as "email" | "sms",
    listId: typeof input.listId === "string" ? input.listId : undefined,
    sendTime: typeof input.sendTime === "string" ? input.sendTime : undefined,
    fromEmail: typeof input.fromEmail === "string" ? input.fromEmail : undefined,
    fromLabel: typeof input.fromLabel === "string" ? input.fromLabel : undefined,
    subject: typeof input.subject === "string" ? input.subject : undefined,
  };
}

export async function createCampaignFromClient(
  options: { apiKey: string; fetch?: typeof fetch },
  input: unknown
): Promise<{ ok: true; campaign: NormalizedCampaign } | { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } }> {
  const payload = validateCreateCampaignInput(input);
  const client = createKlaviyoClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "campaigns.create" });
  const attrs: Record<string, unknown> = {
    name: payload.name,
    channel: payload.channel,
  };
  if (payload.sendTime) attrs.send_time = payload.sendTime;

  // Build the campaign message sub-object if email details provided
  const campaignMsg: Record<string, unknown> = {};
  if (payload.fromEmail) campaignMsg.from_email = payload.fromEmail;
  if (payload.fromLabel) campaignMsg.from_label = payload.fromLabel;
  if (payload.subject) campaignMsg.subject = payload.subject;
  if (Object.keys(campaignMsg).length > 0) attrs.campaign_messages = { data: [{ type: "campaign-message", attributes: campaignMsg }] };

  const relationships: Record<string, unknown> = {};
  if (payload.listId) {
    relationships.lists = { data: [{ type: "list", id: payload.listId }] };
  }

  const body: Record<string, unknown> = { data: { type: "campaign", attributes: attrs } };
  if (Object.keys(relationships).length > 0) (body.data as Record<string, unknown>).relationships = relationships;

  const result = await client.fetchJSON("/campaigns", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (result.status === 201 || result.status === 200) {
    const respBody = result.body as Record<string, unknown>;
    const data = isRecord(respBody.data) ? respBody.data : { id: "", attributes: { name: payload.name, channel: payload.channel, status: "draft" } };
    return { ok: true, campaign: normalizeCampaign(data) };
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
  return { campaignId: requireString(input.campaignId, "campaignId") };
}

export function validateUpdateCampaignInput(input: unknown): UpdateCampaignInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return {
    campaignId: requireString(input.campaignId, "campaignId"),
    name: typeof input.name === "string" ? input.name : undefined,
  };
}

export function validateSendCampaignInput(input: unknown): SendCampaignInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return { campaignId: requireString(input.campaignId, "campaignId") };
}

export async function getCampaignFromClient(
  options: { apiKey: string; fetch?: typeof fetch },
  input: unknown
): Promise<{ ok: true; campaign: NormalizedCampaign } | { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } }> {
  const payload = validateGetCampaignInput(input);
  const client = createKlaviyoClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "campaigns.get" });
  const result = await client.fetchJSON(`/campaigns/${payload.campaignId}`);
  if (result.status === 200) {
    const body = result.body as Record<string, unknown>;
    const data = isRecord(body.data) ? body.data : { id: payload.campaignId, attributes: {} };
    return { ok: true, campaign: normalizeCampaign(data) };
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
    const body = result.body as Record<string, unknown>;
    const data = isRecord(body.data) ? body.data : { id: payload.campaignId, attributes: attrs };
    return { ok: true, campaign: normalizeCampaign(data) };
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

function requireString(v: unknown, f: string): string {
  if (typeof v !== "string" || !v.length) throw new Error(`${f} is required`);
  return v;
}
