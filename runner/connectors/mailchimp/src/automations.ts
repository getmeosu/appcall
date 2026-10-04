import { createMailchimpClient, parseMailchimpRateLimit, isRecord } from "./http";
import { normalizeAutomation, parseAutomationsResponse } from "./objects";
import type { NormalizedAutomation } from "./objects";

export type ListAutomationsInput = Record<string, never>;
export type GetAutomationInput = { automationId: string };

export function validateListAutomationsInput(input: unknown): ListAutomationsInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return {};
}

export function validateGetAutomationInput(input: unknown): GetAutomationInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return { automationId: requireString(input.automationId, "automationId") };
}

export function createAutomationsClient(options: { apiKey: string; fetch?: typeof fetch; operation?: string }) {
  const client = createMailchimpClient({ apiKey: options.apiKey, fetch: options.fetch, operation: options.operation ?? "automations.list" });
  return {
    async listAutomations(input: unknown): Promise<{ ok: true; automations: NormalizedAutomation[] } | { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } }> {
      validateListAutomationsInput(input);
      const response = await client.fetchJSON("/automations");
      if (response.status === 200) return { ok: true, automations: parseAutomationsResponse(response.body).automations };
      const rl = parseMailchimpRateLimit(response.status, response.headers);
      if (rl.limited) return { ok: false, error: { code: "CONNECTOR_RATE_LIMITED", message: "Mailchimp rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
      return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Mailchimp rejected the list automations request." } };
    },

    async getAutomation(input: unknown): Promise<{ ok: true; automation: NormalizedAutomation } | { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } }> {
      const payload = validateGetAutomationInput(input);
      const response = await client.fetchJSON(`/automations/${payload.automationId}`);
      if (response.status === 200) return { ok: true, automation: normalizeAutomation(response.body as Record<string, unknown>) };
      if (response.status === 404) return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Automation not found." } };
      const rl = parseMailchimpRateLimit(response.status, response.headers);
      if (rl.limited) return { ok: false, error: { code: "CONNECTOR_RATE_LIMITED", message: "Mailchimp rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
      return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Mailchimp rejected the get automation request." } };
    },
  };
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}
