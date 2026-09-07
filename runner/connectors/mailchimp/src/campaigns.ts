import { createMailchimpClient, parseMailchimpRateLimit, isRecord } from "./http";
import { normalizeCampaign } from "./objects";
import type { NormalizedCampaign } from "./objects";

// ─── Input types ─────────────────────────────────────────────────────────────

export type CreateCampaignInput = {
  type: string;
  listId: string;
  subjectLine: string;
  title: string;
  fromName: string;
  replyTo: string;
  previewText?: string;
};

export type GetCampaignInput = { campaignId: string };

export type SendCampaignInput = { campaignId: string };

// ─── Validators ──────────────────────────────────────────────────────────────

export function validateCreateCampaignInput(input: unknown): CreateCampaignInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return {
    type: requireString(input.type, "type"),
    listId: requireString(input.listId, "listId"),
    subjectLine: requireString(input.subjectLine, "subjectLine"),
    title: requireString(input.title, "title"),
    fromName: requireString(input.fromName, "fromName"),
    replyTo: requireString(input.replyTo, "replyTo"),
    previewText: typeof input.previewText === "string" ? input.previewText : undefined,
  };
}

export function validateGetCampaignInput(input: unknown): GetCampaignInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return { campaignId: requireString(input.campaignId, "campaignId") };
}

export function validateSendCampaignInput(input: unknown): SendCampaignInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return { campaignId: requireString(input.campaignId, "campaignId") };
}

// ─── Client ──────────────────────────────────────────────────────────────────

export function createCampaignsClient(options: { apiKey: string; fetch?: typeof fetch; operation?: string }) {
  const client = createMailchimpClient({ apiKey: options.apiKey, fetch: options.fetch, operation: options.operation ?? "campaigns.create" });

  return {
    async createCampaign(input: unknown): Promise<{ ok: true; campaign: NormalizedCampaign } | { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } }> {
      const payload = validateCreateCampaignInput(input);
      const body = {
        type: payload.type,
        recipients: { list_id: payload.listId },
        settings: {
          subject_line: payload.subjectLine,
          title: payload.title,
          from_name: payload.fromName,
          reply_to: payload.replyTo,
          preview_text: payload.previewText ?? "",
        },
      };
      const response = await client.fetchJSON("/campaigns", { method: "POST", body: JSON.stringify(body) });
      if (response.status === 200) return { ok: true, campaign: normalizeCampaign(response.body as Record<string, unknown>) };
      const rl = parseMailchimpRateLimit(response.status, response.headers);
      if (rl.limited) return { ok: false, error: { code: "CONNECTOR_RATE_LIMITED", message: "Mailchimp rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
      return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Mailchimp rejected the create campaign request." } };
    },

    async getCampaign(input: unknown): Promise<{ ok: true; campaign: NormalizedCampaign } | { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } }> {
      const payload = validateGetCampaignInput(input);
      const response = await client.fetchJSON(`/campaigns/${payload.campaignId}`);
      if (response.status === 200) return { ok: true, campaign: normalizeCampaign(response.body as Record<string, unknown>) };
      if (response.status === 404) return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Campaign not found." } };
      const rl = parseMailchimpRateLimit(response.status, response.headers);
      if (rl.limited) return { ok: false, error: { code: "CONNECTOR_RATE_LIMITED", message: "Mailchimp rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
      return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Mailchimp rejected the get campaign request." } };
    },

    async sendCampaign(input: unknown): Promise<{ ok: true; sent: true } | { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } }> {
      const payload = validateSendCampaignInput(input);
      const response = await client.fetchJSON(`/campaigns/${payload.campaignId}/actions/send`, { method: "POST" });
      if (response.status === 204) return { ok: true, sent: true };
      if (response.status === 404) return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Campaign not found." } };
      const rl = parseMailchimpRateLimit(response.status, response.headers);
      if (rl.limited) return { ok: false, error: { code: "CONNECTOR_RATE_LIMITED", message: "Mailchimp rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
      return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Mailchimp rejected the send campaign request." } };
    },
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}
