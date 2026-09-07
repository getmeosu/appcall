import { createTypeFormClient, parseTypeFormRateLimit, type TypeFormClient } from "./http";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TypeFormWebhook = {
  id: string;
  form_id: string;
  tag: string;
  url: string;
  enabled: boolean;
  verify_ssl?: boolean;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
};

export type NormalizedWebhook = {
  id: string;
  provider: "typeform";
  providerWebhookId: string;
  formId: string;
  tag: string;
  url: string;
  enabled: boolean;
  verifySsl: boolean;
  createdAt: string;
  updatedAt: string;
  modelVersion: "2026-05-17";
  raw: TypeFormWebhook;
};

export function normalizeWebhook(w: TypeFormWebhook): NormalizedWebhook {
  return {
    id: `tf-webhook:${w.id}`,
    provider: "typeform",
    providerWebhookId: w.id,
    formId: w.form_id ?? "",
    tag: w.tag ?? "",
    url: w.url ?? "",
    enabled: typeof w.enabled === "boolean" ? w.enabled : false,
    verifySsl: typeof w.verify_ssl === "boolean" ? w.verify_ssl : false,
    createdAt: w.created_at ?? "",
    updatedAt: w.updated_at ?? "",
    modelVersion: "2026-05-17",
    raw: w,
  };
}

// ─── Validation ───────────────────────────────────────────────────────────────

export type WebhooksCreateInput = { formId: string; tag: string; url: string; enabled?: boolean; verifySsl?: boolean; secret?: string };
export type WebhooksListInput = { formId: string };

export function validateWebhooksCreateInput(input: unknown): WebhooksCreateInput {
  if (!isRecord(input)) throw new Error("webhooks.create input must be an object");
  return {
    formId: requireString(input.formId, "formId"),
    tag: requireString(input.tag, "tag"),
    url: requireString(input.url, "url"),
    enabled: typeof input.enabled === "boolean" ? input.enabled : undefined,
    verifySsl: typeof input.verifySsl === "boolean" ? input.verifySsl : undefined,
    secret: typeof input.secret === "string" ? input.secret : undefined,
  };
}

export function validateWebhooksListInput(input: unknown): WebhooksListInput {
  if (!isRecord(input)) throw new Error("webhooks.list input must be an object");
  return { formId: requireString(input.formId, "formId") };
}

// ─── Client Factory ───────────────────────────────────────────────────────────

export function createWebhooksClient(options: { accessToken: string; fetch?: typeof fetch; typeFormClient?: TypeFormClient }) {
  const client = options.typeFormClient ?? createTypeFormClient({
    accessToken: options.accessToken,
    fetch: options.fetch,
    operation: "webhooks.create",
  });

  return {
    async create(input: unknown) {
      const payload = validateWebhooksCreateInput(input);
      const body: Record<string, unknown> = { url: payload.url };
      if (payload.enabled !== undefined) body.enabled = payload.enabled;
      if (payload.verifySsl !== undefined) body.verify_ssl = payload.verifySsl;
      if (payload.secret !== undefined) body.secret = payload.secret;
      const response = await client.fetchJSON(`/forms/${payload.formId}/webhooks/${payload.tag}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      const rateLimit = parseTypeFormRateLimit(response.status, response.headers);
      if (rateLimit.limited) {
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "Typeform rate limit exceeded.", retryAfterSeconds: rateLimit.retryAfterSeconds } };
      }
      if (response.status === 200 || response.status === 201) {
        return { ok: true as const, webhook: normalizeWebhook(response.body as TypeFormWebhook) };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Form not found." } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Typeform rejected the webhook create request." } };
    },

    async list(input: unknown) {
      const payload = validateWebhooksListInput(input);
      const response = await client.fetchJSON(`/forms/${payload.formId}/webhooks`);
      const rateLimit = parseTypeFormRateLimit(response.status, response.headers);
      if (rateLimit.limited) {
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "Typeform rate limit exceeded.", retryAfterSeconds: rateLimit.retryAfterSeconds } };
      }
      if (response.status === 200) {
        const body = isRecord(response.body) ? response.body : {};
        const items = Array.isArray(body.items) ? body.items : [];
        return { ok: true as const, webhooks: (items as TypeFormWebhook[]).map(normalizeWebhook) };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Form not found." } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Typeform rejected the webhooks list request." } };
    },
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
