import { createKlaviyoClient, parseKlaviyoRateLimit, isRecord } from "./http";
import { normalizeTemplate, parseTemplatesResponse } from "./objects";
import type { NormalizedTemplate } from "./objects";

export type GetTemplateInput = { templateId: string };

export function validateListTemplatesInput(input: unknown): Record<string, never> {
  if (!isRecord(input)) throw new Error("input must be an object");
  return {};
}

export function validateGetTemplateInput(input: unknown): GetTemplateInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return { templateId: requireString(input.templateId, "templateId") };
}

export async function listTemplatesFromClient(
  options: { apiKey: string; fetch?: typeof fetch },
  input: unknown
): Promise<{ ok: true; templates: NormalizedTemplate[] } | { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } }> {
  validateListTemplatesInput(input);
  const client = createKlaviyoClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "templates.list" });
  const result = await client.fetchJSON("/templates");
  if (result.status === 200) return { ok: true, templates: parseTemplatesResponse(result.body).templates };
  const rl = parseKlaviyoRateLimit(result.status, result.headers);
  if (rl.limited) return { ok: false, error: { code: "CONNECTOR_RATE_LIMITED", message: "Klaviyo rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
  return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Klaviyo rejected the list templates request." } };
}

export async function getTemplateFromClient(
  options: { apiKey: string; fetch?: typeof fetch },
  input: unknown
): Promise<{ ok: true; template: NormalizedTemplate } | { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } }> {
  const payload = validateGetTemplateInput(input);
  const client = createKlaviyoClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "templates.get" });
  const result = await client.fetchJSON(`/templates/${payload.templateId}`);
  if (result.status === 200) {
    const body = result.body as Record<string, unknown>;
    const data = isRecord(body.data) ? body.data : { id: payload.templateId, attributes: {} };
    return { ok: true, template: normalizeTemplate(data) };
  }
  const rl = parseKlaviyoRateLimit(result.status, result.headers);
  if (rl.limited) return { ok: false, error: { code: "CONNECTOR_RATE_LIMITED", message: "Klaviyo rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
  if (result.status === 404) return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Template not found." } };
  return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Klaviyo rejected the get template request." } };
}

function requireString(v: unknown, f: string): string {
  if (typeof v !== "string" || !v.length) throw new Error(`${f} is required`);
  return v;
}
