import { createMailchimpClient, parseMailchimpRateLimit, isRecord } from "./http";
import { normalizeReport, parseOpensResponse, parseClicksResponse, parseUnsubscribedResponse } from "./objects";
import type { NormalizedReport, NormalizedOpen, NormalizedClick, NormalizedUnsubscribe } from "./objects";

export type CampaignReportInput = { campaignId: string };

export function validateCampaignReportInput(input: unknown): CampaignReportInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return { campaignId: requireString(input.campaignId, "campaignId") };
}

export function createReportsClient(options: { apiKey: string; fetch?: typeof fetch; operation?: string }) {
  const client = createMailchimpClient({ apiKey: options.apiKey, fetch: options.fetch, operation: options.operation ?? "reports.summary" });
  return {
    async getSummary(input: unknown): Promise<{ ok: true; report: NormalizedReport } | { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } }> {
      const payload = validateCampaignReportInput(input);
      const response = await client.fetchJSON(`/reports/${payload.campaignId}`);
      if (response.status === 200) return { ok: true, report: normalizeReport(response.body as Record<string, unknown>) };
      if (response.status === 404) return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Report not found." } };
      const rl = parseMailchimpRateLimit(response.status, response.headers);
      if (rl.limited) return { ok: false, error: { code: "CONNECTOR_RATE_LIMITED", message: "Mailchimp rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
      return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Mailchimp rejected the report summary request." } };
    },

    async getOpens(input: unknown): Promise<{ ok: true; opens: NormalizedOpen[] } | { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } }> {
      const payload = validateCampaignReportInput(input);
      const response = await client.fetchJSON(`/reports/${payload.campaignId}/open-details`);
      if (response.status === 200) return { ok: true, opens: parseOpensResponse(response.body).opens };
      if (response.status === 404) return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Report not found." } };
      const rl = parseMailchimpRateLimit(response.status, response.headers);
      if (rl.limited) return { ok: false, error: { code: "CONNECTOR_RATE_LIMITED", message: "Mailchimp rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
      return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Mailchimp rejected the report opens request." } };
    },

    async getClicks(input: unknown): Promise<{ ok: true; clicks: NormalizedClick[] } | { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } }> {
      const payload = validateCampaignReportInput(input);
      const response = await client.fetchJSON(`/reports/${payload.campaignId}/click-details`);
      if (response.status === 200) return { ok: true, clicks: parseClicksResponse(response.body).clicks };
      if (response.status === 404) return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Report not found." } };
      const rl = parseMailchimpRateLimit(response.status, response.headers);
      if (rl.limited) return { ok: false, error: { code: "CONNECTOR_RATE_LIMITED", message: "Mailchimp rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
      return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Mailchimp rejected the report clicks request." } };
    },

    async getUnsubscribed(input: unknown): Promise<{ ok: true; unsubscribed: NormalizedUnsubscribe[] } | { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } }> {
      const payload = validateCampaignReportInput(input);
      const response = await client.fetchJSON(`/reports/${payload.campaignId}/unsubscribed`);
      if (response.status === 200) return { ok: true, unsubscribed: parseUnsubscribedResponse(response.body).unsubscribed };
      if (response.status === 404) return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Report not found." } };
      const rl = parseMailchimpRateLimit(response.status, response.headers);
      if (rl.limited) return { ok: false, error: { code: "CONNECTOR_RATE_LIMITED", message: "Mailchimp rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
      return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Mailchimp rejected the report unsubscribed request." } };
    },
  };
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}
