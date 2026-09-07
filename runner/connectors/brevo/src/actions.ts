import { createBrevoClient, brevoErrorDetail, parseBrevoRateLimit } from "./http";
import { normalizeContact } from "./objects";
import {
  createContactOpsClient,
  validateGetContactInput,
  validateUpdateContactInput,
  validateDeleteContactInput,
} from "./contact_ops";
import {
  createSmtpClient,
  validateSendEmailInput,
} from "./smtp";
import { isSmtpConfigured, sendSmtpEmail } from "../../_shared/smtp";
import {
  createListsOpsClient,
  validateCreateListInput,
  validateGetListInput,
  validateAddContactsToListInput,
  validateRemoveContactsFromListInput,
} from "./lists_ops";
import {
  createCampaignsOpsClient,
  validateCreateEmailCampaignInput,
  validateSendEmailCampaignInput,
  validateGetEmailCampaignInput,
} from "./campaigns_ops";

// ─── Existing: contacts.create ────────────────────────────────────────────────

export type CreateContactInput = { email: string; firstName?: string; lastName?: string; listIds?: number[]; attributes?: Record<string, unknown> };

export function createContact(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    const payload = validateCreateContactInput(input);
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createBrevoClient({ apiKey: input.apiKey, fetch: fetchFn, operation: "contacts.create" })
      .fetchJSON("/contacts", { method: "POST", body: JSON.stringify({ email: payload.email, firstName: payload.firstName, lastName: payload.lastName, listIds: payload.listIds, attributes: payload.attributes }) })
      .then((result) => {
        if (result.status === 201 || result.status === 200) return { connector: "brevo", action: "contacts.create", source: "connector", contact: normalizeContact(result.body as any) };
        const rl = parseBrevoRateLimit(result.status, result.headers);
        if (rl.limited) throw { ok: false, code: "CONNECTOR_RATE_LIMITED", message: "Brevo rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds };
        throw { ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: brevoErrorDetail(result.body, "Brevo rejected the request.") };
      });
  }
  return { connector: "brevo", action: "contacts.create", source: "connector", validated: validateCreateContactInput(input) };
}

function validateCreateContactInput(input: unknown): CreateContactInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return {
    email: requireString(input.email, "email"),
    firstName: typeof input.firstName === "string" ? input.firstName : undefined,
    lastName: typeof input.lastName === "string" ? input.lastName : undefined,
    listIds: Array.isArray(input.listIds) ? input.listIds.filter((v): v is number => typeof v === "number") : undefined,
    attributes: isRecord(input.attributes) ? input.attributes : undefined,
  };
}

// ─── New: contacts.get ────────────────────────────────────────────────────────

export function getContact(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createContactOpsClient({ apiKey: input.apiKey, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined })
      .get(input)
      .then((result) => {
        if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: (result.error as any).retryAfterSeconds };
        return { connector: "brevo", action: "contacts.get", source: "connector", contact: result.contact };
      });
  }
  return { connector: "brevo", action: "contacts.get", source: "connector", validated: validateGetContactInput(input) };
}

// ─── New: contacts.update ─────────────────────────────────────────────────────

export function updateContact(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createContactOpsClient({ apiKey: input.apiKey, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined })
      .update(input)
      .then((result) => {
        if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: (result.error as any).retryAfterSeconds };
        return { connector: "brevo", action: "contacts.update", source: "connector", updated: result.updated };
      });
  }
  return { connector: "brevo", action: "contacts.update", source: "connector", validated: validateUpdateContactInput(input) };
}

// ─── New: contacts.delete ─────────────────────────────────────────────────────

export function deleteContact(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createContactOpsClient({ apiKey: input.apiKey, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined })
      .delete(input)
      .then((result) => {
        if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: (result.error as any).retryAfterSeconds };
        return { connector: "brevo", action: "contacts.delete", source: "connector", deleted: result.deleted };
      });
  }
  return { connector: "brevo", action: "contacts.delete", source: "connector", validated: validateDeleteContactInput(input) };
}

// ─── New: smtp.email.send ─────────────────────────────────────────────────────

export function sendEmail(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isSmtpConfigured(input)) {
    return sendSmtpEmail(input as Record<string, unknown>).then((result) => ({
      connector: "brevo",
      action: "smtp.email.send",
      source: "smtp",
      ...result,
    }));
  }
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createSmtpClient({ apiKey: input.apiKey, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined })
      .sendEmail(input)
      .then((result) => {
        if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: (result.error as any).retryAfterSeconds };
        return { connector: "brevo", action: "smtp.email.send", source: "connector", email: result.email };
      });
  }
  return { connector: "brevo", action: "smtp.email.send", source: "connector", validated: validateSendEmailInput(input) };
}

// ─── New: lists.create ────────────────────────────────────────────────────────

export function createList(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createListsOpsClient({ apiKey: input.apiKey, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined })
      .createList(input)
      .then((result) => {
        if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: (result.error as any).retryAfterSeconds };
        return { connector: "brevo", action: "lists.create", source: "connector", list: result.list };
      });
  }
  return { connector: "brevo", action: "lists.create", source: "connector", validated: validateCreateListInput(input) };
}

// ─── New: lists.get ───────────────────────────────────────────────────────────

export function getList(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createListsOpsClient({ apiKey: input.apiKey, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined })
      .getList(input)
      .then((result) => {
        if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: (result.error as any).retryAfterSeconds };
        return { connector: "brevo", action: "lists.get", source: "connector", list: result.list };
      });
  }
  return { connector: "brevo", action: "lists.get", source: "connector", validated: validateGetListInput(input) };
}

// ─── New: contacts.addToList ──────────────────────────────────────────────────

export function addContactsToList(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createListsOpsClient({ apiKey: input.apiKey, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined })
      .addContactsToList(input)
      .then((result) => {
        if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: (result.error as any).retryAfterSeconds };
        return { connector: "brevo", action: "contacts.addToList", source: "connector", contacts: result.contacts };
      });
  }
  return { connector: "brevo", action: "contacts.addToList", source: "connector", validated: validateAddContactsToListInput(input) };
}

// ─── New: contacts.removeFromList ─────────────────────────────────────────────

export function removeContactsFromList(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createListsOpsClient({ apiKey: input.apiKey, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined })
      .removeContactsFromList(input)
      .then((result) => {
        if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: (result.error as any).retryAfterSeconds };
        return { connector: "brevo", action: "contacts.removeFromList", source: "connector", removed: result.removed };
      });
  }
  return { connector: "brevo", action: "contacts.removeFromList", source: "connector", validated: validateRemoveContactsFromListInput(input) };
}

// ─── New: emailCampaigns.create ───────────────────────────────────────────────

export function createEmailCampaign(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createCampaignsOpsClient({ apiKey: input.apiKey, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined })
      .createCampaign(input)
      .then((result) => {
        if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: (result.error as any).retryAfterSeconds };
        return { connector: "brevo", action: "emailCampaigns.create", source: "connector", campaign: result.campaign };
      });
  }
  return { connector: "brevo", action: "emailCampaigns.create", source: "connector", validated: validateCreateEmailCampaignInput(input) };
}

// ─── New: emailCampaigns.send ─────────────────────────────────────────────────

export function sendEmailCampaign(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createCampaignsOpsClient({ apiKey: input.apiKey, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined })
      .sendCampaign(input)
      .then((result) => {
        if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: (result.error as any).retryAfterSeconds };
        return { connector: "brevo", action: "emailCampaigns.send", source: "connector", sent: result.sent };
      });
  }
  return { connector: "brevo", action: "emailCampaigns.send", source: "connector", validated: validateSendEmailCampaignInput(input) };
}

// ─── New: emailCampaigns.get ──────────────────────────────────────────────────

export function getEmailCampaign(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createCampaignsOpsClient({ apiKey: input.apiKey, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined })
      .getCampaign(input)
      .then((result) => {
        if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: (result.error as any).retryAfterSeconds };
        return { connector: "brevo", action: "emailCampaigns.get", source: "connector", campaign: result.campaign };
      });
  }
  return { connector: "brevo", action: "emailCampaigns.get", source: "connector", validated: validateGetEmailCampaignInput(input) };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function requireString(v: unknown, f: string): string { if (typeof v !== "string" || !v.length) throw new Error(`${f} is required`); return v; }
function isRecord(v: unknown): v is Record<string, unknown> { return typeof v === "object" && v !== null && !Array.isArray(v); }
