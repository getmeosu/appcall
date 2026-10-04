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
  validateUpdateListInput,
  validateDeleteListInput,
  validateGetListContactsInput,
  validateCreateFolderInput,
} from "./lists_ops";
import {
  createCampaignsOpsClient,
  validateCreateEmailCampaignInput,
  validateSendEmailCampaignInput,
  validateGetEmailCampaignInput,
  validateUpdateEmailCampaignInput,
  validateDeleteEmailCampaignInput,
  validateSendTestEmailCampaignInput,
} from "./campaigns_ops";
import { validateGetTemplateInput } from "./smtp";

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

function throwIfFailed<T extends { ok: true } | { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } }>(result: T): asserts result is T & { ok: true } {
  if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
}

export function updateList(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createListsOpsClient({ apiKey: input.apiKey, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined })
      .updateList(input)
      .then((result) => {
        throwIfFailed(result);
        return { connector: "brevo", action: "lists.update", source: "connector", updated: result.updated, listId: result.listId, name: result.name };
      });
  }
  return { connector: "brevo", action: "lists.update", source: "connector", validated: validateUpdateListInput(input) };
}

export function deleteList(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createListsOpsClient({ apiKey: input.apiKey, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined })
      .deleteList(input)
      .then((result) => {
        throwIfFailed(result);
        return { connector: "brevo", action: "lists.delete", source: "connector", deleted: result.deleted };
      });
  }
  return { connector: "brevo", action: "lists.delete", source: "connector", validated: validateDeleteListInput(input) };
}

export function getListContacts(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createListsOpsClient({ apiKey: input.apiKey, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined })
      .getListContacts(input)
      .then((result) => {
        throwIfFailed(result);
        return { connector: "brevo", action: "lists.getContacts", source: "connector", contacts: result.contacts, count: result.count };
      });
  }
  return { connector: "brevo", action: "lists.getContacts", source: "connector", validated: validateGetListContactsInput(input) };
}

export function listFolders(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createListsOpsClient({ apiKey: input.apiKey, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined })
      .listFolders(input)
      .then((result) => {
        throwIfFailed(result);
        return { connector: "brevo", action: "folders.list", source: "connector", folders: result.folders };
      });
  }
  return { connector: "brevo", action: "folders.list", source: "connector", validated: {} };
}

export function createFolder(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createListsOpsClient({ apiKey: input.apiKey, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined })
      .createFolder(input)
      .then((result) => {
        throwIfFailed(result);
        return { connector: "brevo", action: "folders.create", source: "connector", folder: result.folder };
      });
  }
  return { connector: "brevo", action: "folders.create", source: "connector", validated: validateCreateFolderInput(input) };
}

export function updateEmailCampaign(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createCampaignsOpsClient({ apiKey: input.apiKey, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined })
      .updateCampaign(input)
      .then((result) => {
        throwIfFailed(result);
        return { connector: "brevo", action: "emailCampaigns.update", source: "connector", updated: result.updated };
      });
  }
  return { connector: "brevo", action: "emailCampaigns.update", source: "connector", validated: validateUpdateEmailCampaignInput(input) };
}

export function deleteEmailCampaign(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createCampaignsOpsClient({ apiKey: input.apiKey, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined })
      .deleteCampaign(input)
      .then((result) => {
        throwIfFailed(result);
        return { connector: "brevo", action: "emailCampaigns.delete", source: "connector", deleted: result.deleted };
      });
  }
  return { connector: "brevo", action: "emailCampaigns.delete", source: "connector", validated: validateDeleteEmailCampaignInput(input) };
}

export function sendTestEmailCampaign(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createCampaignsOpsClient({ apiKey: input.apiKey, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined })
      .sendTestCampaign(input)
      .then((result) => {
        throwIfFailed(result);
        return { connector: "brevo", action: "emailCampaigns.sendTest", source: "connector", sent: result.sent };
      });
  }
  return { connector: "brevo", action: "emailCampaigns.sendTest", source: "connector", validated: validateSendTestEmailCampaignInput(input) };
}

export function listTemplates(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createSmtpClient({ apiKey: input.apiKey, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined })
      .listTemplates()
      .then((result) => {
        throwIfFailed(result);
        return { connector: "brevo", action: "smtp.templates.list", source: "connector", templates: result.templates, count: result.count };
      });
  }
  return { connector: "brevo", action: "smtp.templates.list", source: "connector", validated: {} };
}

export function getTemplate(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createSmtpClient({ apiKey: input.apiKey, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined })
      .getTemplate(input)
      .then((result) => {
        throwIfFailed(result);
        return { connector: "brevo", action: "smtp.templates.get", source: "connector", template: result.template };
      });
  }
  return { connector: "brevo", action: "smtp.templates.get", source: "connector", validated: validateGetTemplateInput(input) };
}

export function listSenders(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createSmtpClient({ apiKey: input.apiKey, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined })
      .listSenders()
      .then((result) => {
        throwIfFailed(result);
        return { connector: "brevo", action: "senders.list", source: "connector", senders: result.senders };
      });
  }
  return { connector: "brevo", action: "senders.list", source: "connector", validated: {} };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function requireString(v: unknown, f: string): string { if (typeof v !== "string" || !v.length) throw new Error(`${f} is required`); return v; }
function isRecord(v: unknown): v is Record<string, unknown> { return typeof v === "object" && v !== null && !Array.isArray(v); }
