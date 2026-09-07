import { createHash } from "crypto";
import { createMailchimpClient, parseMailchimpRateLimit, prop, isRecord } from "./http";
import { normalizeContact, normalizeAudience } from "./objects";
import type { NormalizedContact, NormalizedAudience } from "./objects";

// ─── MD5 subscriber hash helper ──────────────────────────────────────────────
// Mailchimp identifies members by MD5 hash of lowercased email address.
function md5Hash(value: string): string {
  return createHash("md5").update(value.toLowerCase()).digest("hex");
}

// ─── Input types ─────────────────────────────────────────────────────────────

export type GetMemberInput = { listId: string; email: string };
export type UpdateMemberInput = { listId: string; email: string; firstName?: string; lastName?: string; status?: string; mergeFields?: Record<string, unknown> };
export type UpsertMemberInput = { listId: string; email: string; firstName?: string; lastName?: string; status?: string; mergeFields?: Record<string, unknown> };
export type DeleteMemberInput = { listId: string; email: string };
export type AddMemberTagsInput = { listId: string; email: string; tags: string[] };

export type CreateListInput = {
  name: string;
  permissionReminder: string;
  contactCompany: string;
  contactAddress1: string;
  contactCity: string;
  contactCountry: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  language?: string;
  emailTypeOption?: boolean;
};

export type GetListInput = { listId: string };

// ─── Validators ──────────────────────────────────────────────────────────────

export function validateGetMemberInput(input: unknown): GetMemberInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return {
    listId: requireString(input.listId, "listId"),
    email: requireString(input.email, "email"),
  };
}

export function validateUpdateMemberInput(input: unknown): UpdateMemberInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return {
    listId: requireString(input.listId, "listId"),
    email: requireString(input.email, "email"),
    firstName: typeof input.firstName === "string" ? input.firstName : undefined,
    lastName: typeof input.lastName === "string" ? input.lastName : undefined,
    status: typeof input.status === "string" ? input.status : undefined,
    mergeFields: isRecord(input.mergeFields) ? input.mergeFields : undefined,
  };
}

export function validateUpsertMemberInput(input: unknown): UpsertMemberInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return {
    listId: requireString(input.listId, "listId"),
    email: requireString(input.email, "email"),
    firstName: typeof input.firstName === "string" ? input.firstName : undefined,
    lastName: typeof input.lastName === "string" ? input.lastName : undefined,
    status: typeof input.status === "string" ? input.status : undefined,
    mergeFields: isRecord(input.mergeFields) ? input.mergeFields : undefined,
  };
}

export function validateDeleteMemberInput(input: unknown): DeleteMemberInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return {
    listId: requireString(input.listId, "listId"),
    email: requireString(input.email, "email"),
  };
}

export function validateAddMemberTagsInput(input: unknown): AddMemberTagsInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  if (!Array.isArray(input.tags) || input.tags.length === 0) throw new Error("tags must be a non-empty array");
  return {
    listId: requireString(input.listId, "listId"),
    email: requireString(input.email, "email"),
    tags: (input.tags as unknown[]).filter((t): t is string => typeof t === "string"),
  };
}

export function validateCreateListInput(input: unknown): CreateListInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return {
    name: requireString(input.name, "name"),
    permissionReminder: requireString(input.permissionReminder, "permissionReminder"),
    contactCompany: requireString(input.contactCompany, "contactCompany"),
    contactAddress1: requireString(input.contactAddress1, "contactAddress1"),
    contactCity: requireString(input.contactCity, "contactCity"),
    contactCountry: requireString(input.contactCountry, "contactCountry"),
    fromName: requireString(input.fromName, "fromName"),
    fromEmail: requireString(input.fromEmail, "fromEmail"),
    subject: requireString(input.subject, "subject"),
    language: typeof input.language === "string" ? input.language : undefined,
    emailTypeOption: typeof input.emailTypeOption === "boolean" ? input.emailTypeOption : false,
  };
}

export function validateGetListInput(input: unknown): GetListInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return { listId: requireString(input.listId, "listId") };
}

// ─── Client ──────────────────────────────────────────────────────────────────

export function createListsClient(options: { apiKey: string; fetch?: typeof fetch; operation?: string }) {
  const client = createMailchimpClient({ apiKey: options.apiKey, fetch: options.fetch, operation: options.operation ?? "lists.members.get" });

  return {
    async getMember(input: unknown): Promise<{ ok: true; member: NormalizedContact } | { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } }> {
      const payload = validateGetMemberInput(input);
      const hash = md5Hash(payload.email);
      const response = await client.fetchJSON(`/lists/${payload.listId}/members/${hash}`);
      if (response.status === 200) return { ok: true, member: normalizeContact(response.body as Record<string, unknown>) };
      if (response.status === 404) return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Member not found." } };
      const rl = parseMailchimpRateLimit(response.status, response.headers);
      if (rl.limited) return { ok: false, error: { code: "CONNECTOR_RATE_LIMITED", message: "Mailchimp rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
      return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Mailchimp rejected the get member request." } };
    },

    async updateMember(input: unknown): Promise<{ ok: true; member: NormalizedContact } | { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } }> {
      const payload = validateUpdateMemberInput(input);
      const hash = md5Hash(payload.email);
      const body: Record<string, unknown> = {};
      if (payload.status) body.status = payload.status;
      const mergeFields: Record<string, unknown> = { ...(payload.mergeFields ?? {}) };
      if (payload.firstName !== undefined) mergeFields["FNAME"] = payload.firstName;
      if (payload.lastName !== undefined) mergeFields["LNAME"] = payload.lastName;
      if (Object.keys(mergeFields).length > 0) body.merge_fields = mergeFields;
      const response = await client.fetchJSON(`/lists/${payload.listId}/members/${hash}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      if (response.status === 200) return { ok: true, member: normalizeContact(response.body as Record<string, unknown>) };
      if (response.status === 404) return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Member not found." } };
      const rl = parseMailchimpRateLimit(response.status, response.headers);
      if (rl.limited) return { ok: false, error: { code: "CONNECTOR_RATE_LIMITED", message: "Mailchimp rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
      return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Mailchimp rejected the update member request." } };
    },

    async upsertMember(input: unknown): Promise<{ ok: true; member: NormalizedContact } | { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } }> {
      const payload = validateUpsertMemberInput(input);
      const hash = md5Hash(payload.email);
      const mergeFields: Record<string, unknown> = { ...(payload.mergeFields ?? {}) };
      if (payload.firstName !== undefined) mergeFields["FNAME"] = payload.firstName;
      if (payload.lastName !== undefined) mergeFields["LNAME"] = payload.lastName;
      const body: Record<string, unknown> = {
        email_address: payload.email,
        status_if_new: payload.status ?? "subscribed",
      };
      if (payload.status) body.status = payload.status;
      if (Object.keys(mergeFields).length > 0) body.merge_fields = mergeFields;
      const response = await client.fetchJSON(`/lists/${payload.listId}/members/${hash}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      if (response.status === 200) return { ok: true, member: normalizeContact(response.body as Record<string, unknown>) };
      const rl = parseMailchimpRateLimit(response.status, response.headers);
      if (rl.limited) return { ok: false, error: { code: "CONNECTOR_RATE_LIMITED", message: "Mailchimp rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
      return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Mailchimp rejected the upsert member request." } };
    },

    async deleteMember(input: unknown): Promise<{ ok: true; deleted: true } | { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } }> {
      const payload = validateDeleteMemberInput(input);
      const hash = md5Hash(payload.email);
      const response = await client.fetchJSON(`/lists/${payload.listId}/members/${hash}`, { method: "DELETE" });
      if (response.status === 204) return { ok: true, deleted: true };
      if (response.status === 404) return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Member not found." } };
      const rl = parseMailchimpRateLimit(response.status, response.headers);
      if (rl.limited) return { ok: false, error: { code: "CONNECTOR_RATE_LIMITED", message: "Mailchimp rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
      return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Mailchimp rejected the delete member request." } };
    },

    async addMemberTags(input: unknown): Promise<{ ok: true; updated: true } | { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } }> {
      const payload = validateAddMemberTagsInput(input);
      const hash = md5Hash(payload.email);
      const body = { tags: payload.tags.map((name) => ({ name, status: "active" })) };
      const response = await client.fetchJSON(`/lists/${payload.listId}/members/${hash}/tags`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (response.status === 204) return { ok: true, updated: true };
      const rl = parseMailchimpRateLimit(response.status, response.headers);
      if (rl.limited) return { ok: false, error: { code: "CONNECTOR_RATE_LIMITED", message: "Mailchimp rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
      return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Mailchimp rejected the add tags request." } };
    },

    async createList(input: unknown): Promise<{ ok: true; audience: NormalizedAudience } | { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } }> {
      const payload = validateCreateListInput(input);
      const body = {
        name: payload.name,
        permission_reminder: payload.permissionReminder,
        email_type_option: payload.emailTypeOption ?? false,
        contact: {
          company: payload.contactCompany,
          address1: payload.contactAddress1,
          city: payload.contactCity,
          country: payload.contactCountry,
        },
        campaign_defaults: {
          from_name: payload.fromName,
          from_email: payload.fromEmail,
          subject: payload.subject,
          language: payload.language ?? "en",
        },
      };
      const response = await client.fetchJSON("/lists", { method: "POST", body: JSON.stringify(body) });
      if (response.status === 200) return { ok: true, audience: normalizeAudience(response.body as Record<string, unknown>) };
      const rl = parseMailchimpRateLimit(response.status, response.headers);
      if (rl.limited) return { ok: false, error: { code: "CONNECTOR_RATE_LIMITED", message: "Mailchimp rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
      return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Mailchimp rejected the create list request." } };
    },

    async getList(input: unknown): Promise<{ ok: true; audience: NormalizedAudience } | { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } }> {
      const payload = validateGetListInput(input);
      const response = await client.fetchJSON(`/lists/${payload.listId}`);
      if (response.status === 200) return { ok: true, audience: normalizeAudience(response.body as Record<string, unknown>) };
      if (response.status === 404) return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "List not found." } };
      const rl = parseMailchimpRateLimit(response.status, response.headers);
      if (rl.limited) return { ok: false, error: { code: "CONNECTOR_RATE_LIMITED", message: "Mailchimp rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
      return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Mailchimp rejected the get list request." } };
    },
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}
