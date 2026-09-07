import { createMailchimpClient, parseMailchimpRateLimit } from "./http";
import { normalizeContact } from "./objects";
import {
  validateGetMemberInput,
  validateUpdateMemberInput,
  validateUpsertMemberInput,
  validateDeleteMemberInput,
  validateAddMemberTagsInput,
  validateCreateListInput,
  validateGetListInput,
  createListsClient,
} from "./lists";
import {
  validateCreateCampaignInput,
  validateGetCampaignInput,
  validateSendCampaignInput,
  createCampaignsClient,
} from "./campaigns";

// ─── Existing: contacts.create ────────────────────────────────────────────────

export type CreateContactInput = { listId: string; email: string; firstName?: string; lastName?: string; status?: string };

export function createContact(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    const payload = validateCreateContactInput(input);
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createMailchimpClient({ apiKey: input.apiKey, fetch: fetchFn, operation: "contacts.create" })
      .fetchJSON(`/lists/${payload.listId}/members`, {
        method: "POST",
        body: JSON.stringify({
          email_address: payload.email,
          status: payload.status || "subscribed",
          merge_fields: { FNAME: payload.firstName || "", LNAME: payload.lastName || "" },
        }),
      })
      .then((result) => {
        if (result.status === 200) return { connector: "mailchimp", action: "contacts.create", source: "connector", contact: normalizeContact(result.body as any) };
        const rl = parseMailchimpRateLimit(result.status, result.headers);
        if (rl.limited) throw { ok: false, code: "CONNECTOR_RATE_LIMITED", message: "Mailchimp rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds };
        throw { ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: "Mailchimp rejected the request." };
      });
  }
  return { connector: "mailchimp", action: "contacts.create", source: "connector", validated: validateCreateContactInput(input) };
}

function validateCreateContactInput(input: unknown): CreateContactInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return {
    listId: requireString(input.listId, "listId"),
    email: requireString(input.email, "email"),
    firstName: typeof input.firstName === "string" ? input.firstName : undefined,
    lastName: typeof input.lastName === "string" ? input.lastName : undefined,
    status: typeof input.status === "string" ? input.status : undefined,
  };
}

// ─── lists.members.get ────────────────────────────────────────────────────────

export function getMember(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createListsClient({ apiKey: input.apiKey, fetch: fetchFn, operation: "lists.members.get" })
      .getMember(input)
      .then((result) => {
        if (result.ok) return { connector: "mailchimp", action: "lists.members.get", source: "connector", member: result.member };
        if (result.error.code === "CONNECTOR_RATE_LIMITED") throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
        throw { ok: false, code: result.error.code, message: result.error.message };
      });
  }
  return { connector: "mailchimp", action: "lists.members.get", source: "connector", validated: validateGetMemberInput(input) };
}

// ─── lists.members.update ─────────────────────────────────────────────────────

export function updateMember(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createListsClient({ apiKey: input.apiKey, fetch: fetchFn, operation: "lists.members.update" })
      .updateMember(input)
      .then((result) => {
        if (result.ok) return { connector: "mailchimp", action: "lists.members.update", source: "connector", member: result.member };
        if (result.error.code === "CONNECTOR_RATE_LIMITED") throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
        throw { ok: false, code: result.error.code, message: result.error.message };
      });
  }
  return { connector: "mailchimp", action: "lists.members.update", source: "connector", validated: validateUpdateMemberInput(input) };
}

// ─── lists.members.upsert ─────────────────────────────────────────────────────

export function upsertMember(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createListsClient({ apiKey: input.apiKey, fetch: fetchFn, operation: "lists.members.upsert" })
      .upsertMember(input)
      .then((result) => {
        if (result.ok) return { connector: "mailchimp", action: "lists.members.upsert", source: "connector", member: result.member };
        if (result.error.code === "CONNECTOR_RATE_LIMITED") throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
        throw { ok: false, code: result.error.code, message: result.error.message };
      });
  }
  return { connector: "mailchimp", action: "lists.members.upsert", source: "connector", validated: validateUpsertMemberInput(input) };
}

// ─── lists.members.delete ─────────────────────────────────────────────────────

export function deleteMember(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createListsClient({ apiKey: input.apiKey, fetch: fetchFn, operation: "lists.members.delete" })
      .deleteMember(input)
      .then((result) => {
        if (result.ok) return { connector: "mailchimp", action: "lists.members.delete", source: "connector", deleted: true };
        if (result.error.code === "CONNECTOR_RATE_LIMITED") throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
        throw { ok: false, code: result.error.code, message: result.error.message };
      });
  }
  return { connector: "mailchimp", action: "lists.members.delete", source: "connector", validated: validateDeleteMemberInput(input) };
}

// ─── lists.members.tags.add ───────────────────────────────────────────────────

export function addMemberTags(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createListsClient({ apiKey: input.apiKey, fetch: fetchFn, operation: "lists.members.tags.add" })
      .addMemberTags(input)
      .then((result) => {
        if (result.ok) return { connector: "mailchimp", action: "lists.members.tags.add", source: "connector", updated: true };
        if (result.error.code === "CONNECTOR_RATE_LIMITED") throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
        throw { ok: false, code: result.error.code, message: result.error.message };
      });
  }
  return { connector: "mailchimp", action: "lists.members.tags.add", source: "connector", validated: validateAddMemberTagsInput(input) };
}

// ─── lists.create ─────────────────────────────────────────────────────────────

export function createList(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createListsClient({ apiKey: input.apiKey, fetch: fetchFn, operation: "lists.create" })
      .createList(input)
      .then((result) => {
        if (result.ok) return { connector: "mailchimp", action: "lists.create", source: "connector", audience: result.audience };
        if (result.error.code === "CONNECTOR_RATE_LIMITED") throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
        throw { ok: false, code: result.error.code, message: result.error.message };
      });
  }
  return { connector: "mailchimp", action: "lists.create", source: "connector", validated: validateCreateListInput(input) };
}

// ─── lists.get ────────────────────────────────────────────────────────────────

export function getList(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createListsClient({ apiKey: input.apiKey, fetch: fetchFn, operation: "lists.get" })
      .getList(input)
      .then((result) => {
        if (result.ok) return { connector: "mailchimp", action: "lists.get", source: "connector", audience: result.audience };
        if (result.error.code === "CONNECTOR_RATE_LIMITED") throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
        throw { ok: false, code: result.error.code, message: result.error.message };
      });
  }
  return { connector: "mailchimp", action: "lists.get", source: "connector", validated: validateGetListInput(input) };
}

// ─── campaigns.create ─────────────────────────────────────────────────────────

export function createCampaign(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createCampaignsClient({ apiKey: input.apiKey, fetch: fetchFn, operation: "campaigns.create" })
      .createCampaign(input)
      .then((result) => {
        if (result.ok) return { connector: "mailchimp", action: "campaigns.create", source: "connector", campaign: result.campaign };
        if (result.error.code === "CONNECTOR_RATE_LIMITED") throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
        throw { ok: false, code: result.error.code, message: result.error.message };
      });
  }
  return { connector: "mailchimp", action: "campaigns.create", source: "connector", validated: validateCreateCampaignInput(input) };
}

// ─── campaigns.get ────────────────────────────────────────────────────────────

export function getCampaign(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createCampaignsClient({ apiKey: input.apiKey, fetch: fetchFn, operation: "campaigns.get" })
      .getCampaign(input)
      .then((result) => {
        if (result.ok) return { connector: "mailchimp", action: "campaigns.get", source: "connector", campaign: result.campaign };
        if (result.error.code === "CONNECTOR_RATE_LIMITED") throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
        throw { ok: false, code: result.error.code, message: result.error.message };
      });
  }
  return { connector: "mailchimp", action: "campaigns.get", source: "connector", validated: validateGetCampaignInput(input) };
}

// ─── campaigns.send ───────────────────────────────────────────────────────────

export function sendCampaign(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createCampaignsClient({ apiKey: input.apiKey, fetch: fetchFn, operation: "campaigns.send" })
      .sendCampaign(input)
      .then((result) => {
        if (result.ok) return { connector: "mailchimp", action: "campaigns.send", source: "connector", sent: true };
        if (result.error.code === "CONNECTOR_RATE_LIMITED") throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
        throw { ok: false, code: result.error.code, message: result.error.message };
      });
  }
  return { connector: "mailchimp", action: "campaigns.send", source: "connector", validated: validateSendCampaignInput(input) };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function isRecord(v: unknown): v is Record<string, unknown> { return typeof v === "object" && v !== null && !Array.isArray(v); }
