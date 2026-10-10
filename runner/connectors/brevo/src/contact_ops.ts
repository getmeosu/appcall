import { createBrevoClient, brevoErrorDetail, parseBrevoRateLimit, prop, propNum, isRecord } from "./http";
import { normalizeContact } from "./objects";

// ─── contacts.get ─────────────────────────────────────────────────────────────

export type GetContactInput = { identifier: string; identifierType?: string };

export function validateGetContactInput(input: unknown): GetContactInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  const identifierType = typeof input.identifierType === "string"
    ? input.identifierType
    : typeof input.identifier_type === "string"
      ? input.identifier_type
      : undefined;
  return {
    identifier: requireString(input.identifier, "identifier"),
    ...(identifierType ? { identifierType } : {}),
  };
}

export function createContactOpsClient(options: { apiKey: string; fetch?: typeof fetch }) {
  const client = createBrevoClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "contacts.get" });

  return {
    async get(input: unknown) {
      const payload = validateGetContactInput(input);
      const encoded = encodeURIComponent(payload.identifier);
      const result = await client.fetchJSON(`/contacts/${encoded}`, {
        query: payload.identifierType ? { identifierType: payload.identifierType } : undefined,
      });
      if (result.status === 200) {
        return { ok: true as const, contact: normalizeContact(result.body as Record<string, unknown>) };
      }
      const rl = parseBrevoRateLimit(result.status, result.headers);
      if (rl.limited) return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED" as const, message: "Brevo rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
      if (result.status === 404) return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: "Contact not found." } };
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: brevoErrorDetail(result.body, "Brevo rejected the get contact request.") } };
    },

    async update(input: unknown) {
      const payload = validateUpdateContactInput(input);
      const encoded = encodeURIComponent(payload.identifier);
      const body: Record<string, unknown> = {};
      if (payload.firstName !== undefined) body.firstName = payload.firstName;
      if (payload.lastName !== undefined) body.lastName = payload.lastName;
      if (payload.attributes !== undefined) body.attributes = payload.attributes;
      if (payload.listIds !== undefined) body.listIds = payload.listIds;
      if (payload.unlinkListIds !== undefined) body.unlinkListIds = payload.unlinkListIds;
      if (payload.extId !== undefined) body.ext_id = payload.extId;
      if (payload.emailBlacklisted !== undefined) body.emailBlacklisted = payload.emailBlacklisted;
      if (payload.smsBlacklisted !== undefined) body.smsBlacklisted = payload.smsBlacklisted;
      if (payload.smtpBlacklistSender !== undefined) body.smtpBlacklistSender = payload.smtpBlacklistSender;
      const clientForOp = createBrevoClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "contacts.update" });
      const result = await clientForOp.fetchJSON(`/contacts/${encoded}`, {
        method: "PUT",
        body: JSON.stringify(body),
        query: payload.identifierType ? { identifierType: payload.identifierType } : undefined,
      });
      if (result.status === 204) {
        return { ok: true as const, updated: true };
      }
      if (result.status === 200) {
        return { ok: true as const, updated: true };
      }
      const rl = parseBrevoRateLimit(result.status, result.headers);
      if (rl.limited) return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED" as const, message: "Brevo rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
      if (result.status === 404) return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: "Contact not found." } };
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: brevoErrorDetail(result.body, "Brevo rejected the update contact request.") } };
    },

    async delete(input: unknown) {
      const payload = validateDeleteContactInput(input);
      const encoded = encodeURIComponent(payload.identifier);
      const clientForOp = createBrevoClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "contacts.delete" });
      const result = await clientForOp.fetchJSON(`/contacts/${encoded}`, {
        method: "DELETE",
        query: payload.identifierType ? { identifierType: payload.identifierType } : undefined,
      });
      if (result.status === 204 || result.status === 200) {
        return { ok: true as const, deleted: true };
      }
      const rl = parseBrevoRateLimit(result.status, result.headers);
      if (rl.limited) return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED" as const, message: "Brevo rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
      if (result.status === 404) return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: "Contact not found." } };
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: brevoErrorDetail(result.body, "Brevo rejected the delete contact request.") } };
    },
  };
}

// ─── contacts.update ──────────────────────────────────────────────────────────

export type UpdateContactInput = {
  identifier: string;
  identifierType?: string;
  firstName?: string;
  lastName?: string;
  attributes?: Record<string, unknown>;
  listIds?: number[];
  unlinkListIds?: number[];
  extId?: string;
  emailBlacklisted?: boolean;
  smsBlacklisted?: boolean;
  smtpBlacklistSender?: string[];
};

export function validateUpdateContactInput(input: unknown): UpdateContactInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  const identifierType = typeof input.identifierType === "string"
    ? input.identifierType
    : typeof input.identifier_type === "string"
      ? input.identifier_type
      : undefined;
  const unlinkListIds = Array.isArray(input.unlinkListIds)
    ? (input.unlinkListIds as unknown[]).filter((v): v is number => typeof v === "number")
    : Array.isArray(input.unlink_list_ids)
      ? (input.unlink_list_ids as unknown[]).filter((v): v is number => typeof v === "number")
      : undefined;
  return {
    identifier: requireString(input.identifier, "identifier"),
    ...(identifierType ? { identifierType } : {}),
    firstName: typeof input.firstName === "string" ? input.firstName : undefined,
    lastName: typeof input.lastName === "string" ? input.lastName : undefined,
    attributes: isRecord(input.attributes) ? input.attributes : undefined,
    listIds: Array.isArray(input.listIds)
      ? (input.listIds as unknown[]).filter((v): v is number => typeof v === "number")
      : Array.isArray(input.list_ids)
        ? (input.list_ids as unknown[]).filter((v): v is number => typeof v === "number")
        : undefined,
    ...(unlinkListIds && unlinkListIds.length ? { unlinkListIds } : {}),
    ...(typeof input.ext_id === "string" ? { extId: input.ext_id } : typeof input.extId === "string" ? { extId: input.extId } : {}),
    ...(typeof input.email_blacklisted === "boolean" ? { emailBlacklisted: input.email_blacklisted } : typeof input.emailBlacklisted === "boolean" ? { emailBlacklisted: input.emailBlacklisted } : {}),
    ...(typeof input.sms_blacklisted === "boolean" ? { smsBlacklisted: input.sms_blacklisted } : typeof input.smsBlacklisted === "boolean" ? { smsBlacklisted: input.smsBlacklisted } : {}),
    ...(Array.isArray(input.smtp_blacklist_sender)
      ? { smtpBlacklistSender: (input.smtp_blacklist_sender as unknown[]).filter((v): v is string => typeof v === "string") }
      : Array.isArray(input.smtpBlacklistSender)
        ? { smtpBlacklistSender: (input.smtpBlacklistSender as unknown[]).filter((v): v is string => typeof v === "string") }
        : {}),
  };
}

// ─── contacts.delete ──────────────────────────────────────────────────────────

export type DeleteContactInput = { identifier: string; identifierType?: string };

export function validateDeleteContactInput(input: unknown): DeleteContactInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  const identifierType = typeof input.identifierType === "string"
    ? input.identifierType
    : typeof input.identifier_type === "string"
      ? input.identifier_type
      : undefined;
  return {
    identifier: requireString(input.identifier, "identifier"),
    ...(identifierType ? { identifierType } : {}),
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function requireString(v: unknown, f: string): string {
  if (typeof v !== "string" || !v.length) throw new Error(`${f} is required`);
  return v;
}
