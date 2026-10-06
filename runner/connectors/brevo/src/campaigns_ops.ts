import { createBrevoClient, brevoErrorDetail, parseBrevoRateLimit, prop, propNum, isRecord } from "./http";
import { normalizeCampaign } from "./objects";

// ─── emailCampaigns.create ────────────────────────────────────────────────────

export type CreateEmailCampaignInput = {
  name: string;
  subject: string;
  sender: { name: string; email: string };
  htmlContent?: string;
  htmlUrl?: string;
  scheduledAt?: string;
  recipients?: { listIds?: number[]; exclusionListIds?: number[] };
};

export function validateCreateEmailCampaignInput(input: unknown): CreateEmailCampaignInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  if (!isRecord(input.sender)) throw new Error("sender must be an object");
  return {
    name: requireString(input.name, "name"),
    subject: requireString(input.subject, "subject"),
    sender: {
      name: requireString((input.sender as Record<string, unknown>).name, "sender.name"),
      email: requireString((input.sender as Record<string, unknown>).email, "sender.email"),
    },
    htmlContent: typeof input.htmlContent === "string" ? input.htmlContent : undefined,
    htmlUrl: typeof input.htmlUrl === "string" ? input.htmlUrl : undefined,
    scheduledAt: typeof input.scheduledAt === "string" ? input.scheduledAt : undefined,
    recipients: isRecord(input.recipients) ? {
      listIds: Array.isArray((input.recipients as Record<string, unknown>).listIds)
        ? ((input.recipients as Record<string, unknown>).listIds as unknown[]).filter((v): v is number => typeof v === "number")
        : undefined,
      exclusionListIds: Array.isArray((input.recipients as Record<string, unknown>).exclusionListIds)
        ? ((input.recipients as Record<string, unknown>).exclusionListIds as unknown[]).filter((v): v is number => typeof v === "number")
        : undefined,
    } : undefined,
  };
}

// ─── emailCampaigns.send ──────────────────────────────────────────────────────

export type SendEmailCampaignInput = { campaignId: number };

export function validateSendEmailCampaignInput(input: unknown): SendEmailCampaignInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return { campaignId: requireNumber(input.campaignId, "campaignId") };
}

// ─── emailCampaigns.get ───────────────────────────────────────────────────────

export type GetEmailCampaignInput = { campaignId: number };

export function validateGetEmailCampaignInput(input: unknown): GetEmailCampaignInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return { campaignId: requireNumber(input.campaignId, "campaignId") };
}

export type UpdateEmailCampaignInput = {
  campaignId: number;
  name?: string;
  subject?: string;
  htmlContent?: string;
  htmlUrl?: string;
  scheduledAt?: string;
};
export function validateUpdateEmailCampaignInput(input: unknown): UpdateEmailCampaignInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return {
    campaignId: requireNumber(input.campaignId, "campaignId"),
    name: typeof input.name === "string" ? input.name : undefined,
    subject: typeof input.subject === "string" ? input.subject : undefined,
    htmlContent: typeof input.htmlContent === "string" ? input.htmlContent : undefined,
    htmlUrl: typeof input.htmlUrl === "string" ? input.htmlUrl : undefined,
    scheduledAt: typeof input.scheduledAt === "string" ? input.scheduledAt : undefined,
  };
}

export type DeleteEmailCampaignInput = { campaignId: number };
export function validateDeleteEmailCampaignInput(input: unknown): DeleteEmailCampaignInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return { campaignId: requireNumber(input.campaignId, "campaignId") };
}

export type SendTestEmailCampaignInput = { campaignId: number; emailTo: string[] };
export function validateSendTestEmailCampaignInput(input: unknown): SendTestEmailCampaignInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  const emailTo = Array.isArray(input.emailTo)
    ? (input.emailTo as unknown[]).filter((e): e is string => typeof e === "string" && e.length > 0)
    : [];
  if (emailTo.length === 0) throw new Error("emailTo must be a non-empty array of strings");
  return { campaignId: requireNumber(input.campaignId, "campaignId"), emailTo };
}

// ─── Client ───────────────────────────────────────────────────────────────────

export function createCampaignsOpsClient(options: { apiKey: string; fetch?: typeof fetch }) {
  return {
    async createCampaign(input: unknown) {
      const payload = validateCreateEmailCampaignInput(input);
      const client = createBrevoClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "emailCampaigns.create" });
      const body: Record<string, unknown> = {
        name: payload.name,
        subject: payload.subject,
        sender: payload.sender,
      };
      if (payload.htmlContent !== undefined) body.htmlContent = payload.htmlContent;
      if (payload.htmlUrl !== undefined) body.htmlUrl = payload.htmlUrl;
      if (payload.scheduledAt !== undefined) body.scheduledAt = payload.scheduledAt;
      if (payload.recipients !== undefined) body.recipients = payload.recipients;

      const result = await client.fetchJSON("/emailCampaigns", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (result.status === 201 || result.status === 200) {
        const responseBody = isRecord(result.body) ? result.body : {};
        return { ok: true as const, campaign: normalizeCampaign(responseBody) };
      }
      const rl = parseBrevoRateLimit(result.status, result.headers);
      if (rl.limited) return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED" as const, message: "Brevo rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: brevoErrorDetail(result.body, "Brevo rejected the create email campaign request.") } };
    },

    async sendCampaign(input: unknown) {
      const payload = validateSendEmailCampaignInput(input);
      const client = createBrevoClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "emailCampaigns.send" });
      const result = await client.fetchJSON(`/emailCampaigns/${payload.campaignId}/sendNow`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      if (result.status === 204 || result.status === 200) {
        return { ok: true as const, sent: true };
      }
      const rl = parseBrevoRateLimit(result.status, result.headers);
      if (rl.limited) return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED" as const, message: "Brevo rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
      if (result.status === 404) return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: "Campaign not found." } };
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: brevoErrorDetail(result.body, "Brevo rejected the send campaign request.") } };
    },

    async getCampaign(input: unknown) {
      const payload = validateGetEmailCampaignInput(input);
      const client = createBrevoClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "emailCampaigns.get" });
      const result = await client.fetchJSON(`/emailCampaigns/${payload.campaignId}`);
      if (result.status === 200) {
        return { ok: true as const, campaign: normalizeCampaign(isRecord(result.body) ? result.body : {}) };
      }
      const rl = parseBrevoRateLimit(result.status, result.headers);
      if (rl.limited) return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED" as const, message: "Brevo rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
      if (result.status === 404) return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: "Campaign not found." } };
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: brevoErrorDetail(result.body, "Brevo rejected the get campaign request.") } };
    },

    async updateCampaign(input: unknown) {
      const payload = validateUpdateEmailCampaignInput(input);
      const client = createBrevoClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "emailCampaigns.update" });
      const body: Record<string, unknown> = {};
      if (payload.name !== undefined) body.name = payload.name;
      if (payload.subject !== undefined) body.subject = payload.subject;
      if (payload.htmlContent !== undefined) body.htmlContent = payload.htmlContent;
      if (payload.htmlUrl !== undefined) body.htmlUrl = payload.htmlUrl;
      if (payload.scheduledAt !== undefined) body.scheduledAt = payload.scheduledAt;
      const result = await client.fetchJSON(`/emailCampaigns/${payload.campaignId}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      if (result.status === 204 || result.status === 200) {
        return { ok: true as const, updated: true };
      }
      const rl = parseBrevoRateLimit(result.status, result.headers);
      if (rl.limited) return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED" as const, message: "Brevo rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
      if (result.status === 404) return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: "Campaign not found." } };
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: brevoErrorDetail(result.body, "Brevo rejected the update campaign request.") } };
    },

    async deleteCampaign(input: unknown) {
      const payload = validateDeleteEmailCampaignInput(input);
      const client = createBrevoClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "emailCampaigns.delete" });
      const result = await client.fetchJSON(`/emailCampaigns/${payload.campaignId}`, { method: "DELETE" });
      if (result.status === 204 || result.status === 200) {
        return { ok: true as const, deleted: true };
      }
      const rl = parseBrevoRateLimit(result.status, result.headers);
      if (rl.limited) return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED" as const, message: "Brevo rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
      if (result.status === 404) return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: "Campaign not found." } };
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: brevoErrorDetail(result.body, "Brevo rejected the delete campaign request.") } };
    },

    async sendTestCampaign(input: unknown) {
      const payload = validateSendTestEmailCampaignInput(input);
      const client = createBrevoClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "emailCampaigns.sendTest" });
      const result = await client.fetchJSON(`/emailCampaigns/${payload.campaignId}/sendTest`, {
        method: "POST",
        body: JSON.stringify({ emailTo: payload.emailTo }),
      });
      if (result.status === 204 || result.status === 200) {
        return { ok: true as const, sent: true };
      }
      const rl = parseBrevoRateLimit(result.status, result.headers);
      if (rl.limited) return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED" as const, message: "Brevo rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
      if (result.status === 404) return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: "Campaign not found." } };
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: brevoErrorDetail(result.body, "Brevo rejected the send test campaign request.") } };
    },
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function requireString(v: unknown, f: string): string {
  if (typeof v !== "string" || !v.length) throw new Error(`${f} is required`);
  return v;
}

function requireNumber(v: unknown, f: string): number {
  if (typeof v !== "number") throw new Error(`${f} must be a number`);
  return v;
}
