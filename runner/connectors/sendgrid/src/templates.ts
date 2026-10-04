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

export type TemplateListInput = { generations?: string; pageSize?: number; pageToken?: string };

export function validateTemplateListInput(input: unknown): TemplateListInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return {
    generations: typeof input.generations === "string" && input.generations.length ? input.generations : "legacy,dynamic",
    pageSize: typeof input.pageSize === "number" ? input.pageSize : 100,
    pageToken: typeof input.pageToken === "string" && input.pageToken.length ? input.pageToken : undefined,
  };
}

export type TemplateUpdateInput = { templateId: string; name: string };

export function validateTemplateUpdateInput(input: unknown): TemplateUpdateInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return { templateId: requireString(input.templateId, "templateId"), name: requireString(input.name, "name") };
}

export type TemplateDeleteInput = { templateId: string };

export function validateTemplateDeleteInput(input: unknown): TemplateDeleteInput {
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

export type SuppressionListInput = BouncesListInput & { email?: string };

export function validateSuppressionListInput(input: unknown): SuppressionListInput {
  const base = validateBouncesListInput(input);
  if (!isRecord(input)) return base;
  return { ...base, email: typeof input.email === "string" && input.email.length ? input.email : undefined };
}

export type NormalizedSpamReport = { email: string; ip: string; created: number; raw: Record<string, unknown> };
export type NormalizedUnsubscribe = { email: string; created: number; raw: Record<string, unknown> };
export type NormalizedInvalidEmail = { email: string; reason: string; created: number; raw: Record<string, unknown> };

export function normalizeSpamReport(b: Record<string, unknown>): NormalizedSpamReport {
  return { email: prop(b, "email"), ip: prop(b, "ip"), created: typeof b.created === "number" ? b.created : 0, raw: b };
}
export function normalizeUnsubscribe(b: Record<string, unknown>): NormalizedUnsubscribe {
  return { email: prop(b, "email"), created: typeof b.created === "number" ? b.created : 0, raw: b };
}
export function normalizeInvalidEmail(b: Record<string, unknown>): NormalizedInvalidEmail {
  return { email: prop(b, "email"), reason: prop(b, "reason"), created: typeof b.created === "number" ? b.created : 0, raw: b };
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

    async list(input: unknown) {
      const payload = validateTemplateListInput(input);
      const client = createSendGridClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "templates.list" });
      const params = new URLSearchParams();
      params.set("generations", payload.generations ?? "legacy,dynamic");
      params.set("page_size", String(payload.pageSize ?? 100));
      if (payload.pageToken) params.set("page_token", payload.pageToken);
      const response = await client.fetchJSON(`/templates?${params}`);
      if (response.status === 200) {
        const b = isRecord(response.body) ? response.body : {};
        const rows = Array.isArray(b.result) ? b.result : [];
        return { ok: true as const, templates: (rows as unknown[]).filter(isRecord).map(normalizeTemplate) };
      }
      const rl = parseSendGridRateLimit(response.status, response.headers);
      if (rl.limited) return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED" as const, message: "SendGrid rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: "SendGrid rejected the templates list request." } };
    },

    async update(input: unknown) {
      const payload = validateTemplateUpdateInput(input);
      const client = createSendGridClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "templates.update" });
      const response = await client.fetchJSON(`/templates/${encodeURIComponent(payload.templateId)}`, {
        method: "PATCH",
        body: JSON.stringify({ name: payload.name }),
      });
      if (response.status === 200) {
        const b = isRecord(response.body) ? response.body : {};
        return { ok: true as const, template: normalizeTemplate(b) };
      }
      if (response.status === 404) return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: "Template not found." } };
      const rl = parseSendGridRateLimit(response.status, response.headers);
      if (rl.limited) return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED" as const, message: "SendGrid rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: "SendGrid rejected the template update request." } };
    },

    async delete(input: unknown) {
      const payload = validateTemplateDeleteInput(input);
      const client = createSendGridClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "templates.delete" });
      const response = await client.fetchJSON(`/templates/${encodeURIComponent(payload.templateId)}`, { method: "DELETE" });
      if (response.status === 200 || response.status === 202 || response.status === 204) {
        return { ok: true as const, deleted: true };
      }
      if (response.status === 404) return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: "Template not found." } };
      const rl = parseSendGridRateLimit(response.status, response.headers);
      if (rl.limited) return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED" as const, message: "SendGrid rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: "SendGrid rejected the template delete request." } };
    },
  };
}

export function createSuppressionClient(options: { apiKey: string; fetch?: typeof fetch }) {
  return {
    async listBounces(input: unknown) {
      return listSuppressionArray({
        options,
        input,
        operation: "suppression.bounces.list",
        path: "/suppression/bounces",
        map: normalizeBounce,
        message: "SendGrid rejected the bounces list request.",
      }).then((result) => result.ok ? { ok: true as const, bounces: result.items } : result);
    },
    async listBlocks(input: unknown) {
      return listSuppressionArray({
        options,
        input,
        operation: "suppression.blocks.list",
        path: "/suppression/blocks",
        map: normalizeBounce,
        message: "SendGrid rejected the blocks list request.",
      }).then((result) => result.ok ? { ok: true as const, blocks: result.items } : result);
    },
    async listSpamReports(input: unknown) {
      return listSuppressionArray({
        options,
        input,
        operation: "suppression.spam_reports.list",
        path: "/suppression/spam_reports",
        map: normalizeSpamReport,
        message: "SendGrid rejected the spam reports list request.",
      }).then((result) => result.ok ? { ok: true as const, spamReports: result.items } : result);
    },
    async listUnsubscribes(input: unknown) {
      return listSuppressionArray({
        options,
        input,
        operation: "suppression.unsubscribes.list",
        path: "/suppression/unsubscribes",
        map: normalizeUnsubscribe,
        message: "SendGrid rejected the unsubscribes list request.",
        includeEmail: true,
      }).then((result) => result.ok ? { ok: true as const, unsubscribes: result.items } : result);
    },
    async listInvalidEmails(input: unknown) {
      return listSuppressionArray({
        options,
        input,
        operation: "suppression.invalid_emails.list",
        path: "/suppression/invalid_emails",
        map: normalizeInvalidEmail,
        message: "SendGrid rejected the invalid emails list request.",
      }).then((result) => result.ok ? { ok: true as const, invalidEmails: result.items } : result);
    },
  };
}

async function listSuppressionArray<T>(args: {
  options: { apiKey: string; fetch?: typeof fetch };
  input: unknown;
  operation: string;
  path: string;
  map: (row: Record<string, unknown>) => T;
  message: string;
  includeEmail?: boolean;
}) {
  const payload = validateSuppressionListInput(args.input);
  const client = createSendGridClient({ apiKey: args.options.apiKey, fetch: args.options.fetch, operation: args.operation });
  const params = new URLSearchParams();
  if (payload.startTime !== undefined) params.set("start_time", String(payload.startTime));
  if (payload.endTime !== undefined) params.set("end_time", String(payload.endTime));
  if (payload.limit !== undefined) params.set("limit", String(payload.limit));
  if (payload.offset !== undefined) params.set("offset", String(payload.offset));
  if (args.includeEmail && payload.email) params.set("email", payload.email);
  const qs = params.toString();
  const response = await client.fetchJSON(`${args.path}${qs ? "?" + qs : ""}`);
  if (response.status === 200) {
    const items = Array.isArray(response.body)
      ? (response.body as unknown[]).filter(isRecord).map(args.map)
      : [];
    return { ok: true as const, items };
  }
  const rl = parseSendGridRateLimit(response.status, response.headers);
  if (rl.limited) return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED" as const, message: "SendGrid rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
  return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: args.message } };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function requireString(v: unknown, f: string): string {
  if (typeof v !== "string" || !v.length) throw new Error(`${f} is required`);
  return v;
}
