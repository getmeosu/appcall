import { createMailchimpClient, parseMailchimpRateLimit, isRecord } from "./http";
import { normalizeTemplate, parseTemplatesResponse } from "./objects";
import type { NormalizedTemplate } from "./objects";

export type ListTemplatesInput = { count?: number; offset?: number };
export type GetTemplateInput = { templateId: string };

export function validateListTemplatesInput(input: unknown): ListTemplatesInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return {
    count: typeof input.count === "number" ? input.count : undefined,
    offset: typeof input.offset === "number" ? input.offset : undefined,
  };
}

export function validateGetTemplateInput(input: unknown): GetTemplateInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return { templateId: requireString(input.templateId, "templateId") };
}

export function createTemplatesClient(options: { apiKey: string; fetch?: typeof fetch; operation?: string }) {
  const client = createMailchimpClient({ apiKey: options.apiKey, fetch: options.fetch, operation: options.operation ?? "templates.list" });
  return {
    async listTemplates(input: unknown): Promise<{ ok: true; templates: NormalizedTemplate[] } | { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } }> {
      validateListTemplatesInput(input);
      const response = await client.fetchJSON("/templates");
      if (response.status === 200) return { ok: true, templates: parseTemplatesResponse(response.body).templates };
      const rl = parseMailchimpRateLimit(response.status, response.headers);
      if (rl.limited) return { ok: false, error: { code: "CONNECTOR_RATE_LIMITED", message: "Mailchimp rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
      return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Mailchimp rejected the list templates request." } };
    },

    async getTemplate(input: unknown): Promise<{ ok: true; template: NormalizedTemplate } | { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } }> {
      const payload = validateGetTemplateInput(input);
      const response = await client.fetchJSON(`/templates/${payload.templateId}`);
      if (response.status === 200) return { ok: true, template: normalizeTemplate(response.body as Record<string, unknown>) };
      if (response.status === 404) return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Template not found." } };
      const rl = parseMailchimpRateLimit(response.status, response.headers);
      if (rl.limited) return { ok: false, error: { code: "CONNECTOR_RATE_LIMITED", message: "Mailchimp rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
      return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Mailchimp rejected the get template request." } };
    },
  };
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}
