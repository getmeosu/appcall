import { createSendGridClient, parseSendGridRateLimit, prop, isRecord } from "./http";

// ─── Types ────────────────────────────────────────────────────────────────────

export type NormalizedTemplate = {
  id: string;
  provider: "sendgrid";
  providerTemplateId: string;
  name: string;
  generation: string;
  versions: unknown[];
  modelVersion: "2026-05-16";
  raw: Record<string, unknown>;
};

export function normalizeTemplate(t: Record<string, unknown>): NormalizedTemplate {
  return {
    id: `sg-template:${prop(t, "id")}`,
    provider: "sendgrid",
    providerTemplateId: prop(t, "id"),
    name: prop(t, "name"),
    generation: prop(t, "generation"),
    versions: Array.isArray(t.versions) ? t.versions : [],
    modelVersion: "2026-05-16",
    raw: t,
  };
}

// ─── templates.create ─────────────────────────────────────────────────────────

export type TemplateCreateInput = { name: string; generation?: string };

export function validateTemplateCreateInput(input: unknown): TemplateCreateInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return {
    name: requireString(input.name, "name"),
    generation: typeof input.generation === "string" ? input.generation : "dynamic",
  };
}

// ─── templates.get ────────────────────────────────────────────────────────────

export type TemplateGetInput = { templateId: string };

export function validateTemplateGetInput(input: unknown): TemplateGetInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return { templateId: requireString(input.templateId, "templateId") };
}

// ─── suppression.bounces.list ─────────────────────────────────────────────────

export type BouncesListInput = { startTime?: number; endTime?: number; limit?: number; offset?: number };

export type NormalizedBounce = {
  email: string;
  status: string;
  reason: string;
  created: number;
  raw: Record<string, unknown>;
};

export function normalizeBounce(b: Record<string, unknown>): NormalizedBounce {
  return {
    email: prop(b, "email"),
    status: prop(b, "status"),
    reason: prop(b, "reason"),
    created: typeof b.created === "number" ? b.created : 0,
    raw: b,
  };
}

export function validateBouncesListInput(input: unknown): BouncesListInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return {
    startTime: typeof input.startTime === "number" ? input.startTime : undefined,
    endTime: typeof input.endTime === "number" ? input.endTime : undefined,
    limit: typeof input.limit === "number" ? input.limit : undefined,
    offset: typeof input.offset === "number" ? input.offset : undefined,
  };
}

// ─── Client ───────────────────────────────────────────────────────────────────

export function createTemplatesClient(options: { apiKey: string; fetch?: typeof fetch }) {
  return {
    async create(input: unknown) {
      const payload = validateTemplateCreateInput(input);
      const client = createSendGridClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "templates.create" });
      const response = await client.fetchJSON("/templates", {
        method: "POST",
        body: JSON.stringify({ name: payload.name, generation: payload.generation ?? "dynamic" }),
      });
      if (response.status === 200 || response.status === 201) {
        const b = isRecord(response.body) ? response.body : {};
        return { ok: true as const, template: normalizeTemplate(b) };
      }
      const rl = parseSendGridRateLimit(response.status, response.headers);
      if (rl.limited) return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED" as const, message: "SendGrid rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: "SendGrid rejected the template create request." } };
    },

    async get(input: unknown) {
      const payload = validateTemplateGetInput(input);
      const client = createSendGridClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "templates.get" });
      const response = await client.fetchJSON(`/templates/${encodeURIComponent(payload.templateId)}`);
      if (response.status === 200) {
        const b = isRecord(response.body) ? response.body : {};
        return { ok: true as const, template: normalizeTemplate(b) };
      }
      if (response.status === 404) return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: "Template not found." } };
      const rl = parseSendGridRateLimit(response.status, response.headers);
      if (rl.limited) return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED" as const, message: "SendGrid rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: "SendGrid rejected the template get request." } };
    },
  };
}

export function createSuppressionClient(options: { apiKey: string; fetch?: typeof fetch }) {
  return {
    async listBounces(input: unknown) {
      const payload = validateBouncesListInput(input);
      const client = createSendGridClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "suppression.bounces.list" });
      const params = new URLSearchParams();
      if (payload.startTime !== undefined) params.set("start_time", String(payload.startTime));
      if (payload.endTime !== undefined) params.set("end_time", String(payload.endTime));
      if (payload.limit !== undefined) params.set("limit", String(payload.limit));
      if (payload.offset !== undefined) params.set("offset", String(payload.offset));
      const qs = params.toString();
      const response = await client.fetchJSON(`/suppression/bounces${qs ? "?" + qs : ""}`);
      if (response.status === 200) {
        const bounces = Array.isArray(response.body)
          ? (response.body as Record<string, unknown>[]).filter(isRecord).map(normalizeBounce)
          : [];
        return { ok: true as const, bounces };
      }
      const rl = parseSendGridRateLimit(response.status, response.headers);
      if (rl.limited) return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED" as const, message: "SendGrid rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: "SendGrid rejected the bounces list request." } };
    },
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function requireString(v: unknown, f: string): string {
  if (typeof v !== "string" || !v.length) throw new Error(`${f} is required`);
  return v;
}
