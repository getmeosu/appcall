import { createMailClient, validateMailSendInput } from "./mail";
import { isSmtpConfigured, sendSmtpEmail } from "../../_shared/smtp";
import {
  createContactsExtClient,
  createListsClient,
  validateContactUpsertInput,
  validateContactSearchInput,
  validateContactDeleteInput,
  validateListCreateInput,
  validateListGetInput,
  validateListDeleteInput,
} from "./contacts_ext";
import {
  createTemplatesClient,
  createSuppressionClient,
  validateTemplateCreateInput,
  validateTemplateGetInput,
  validateBouncesListInput,
} from "./templates";

// ─── Existing: contacts.create ───────────────────────────────────────────────

export type CreateContactInput = { email: string; firstName?: string; lastName?: string; listIds?: string[] };

export function createContact(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    const payload = validateCreateContactInput(input);
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createContactsExtClient({ apiKey: input.apiKey, fetch: fetchFn, operation: "contacts.create" })
      .upsert({
        contacts: [{ email: payload.email, firstName: payload.firstName, lastName: payload.lastName }],
        listIds: payload.listIds,
      })
      .then((result) => {
        if (!result.ok) {
          throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
        }
        return { connector: "sendgrid", action: "contacts.create", source: "connector", jobId: result.jobId };
      });
  }
  return { connector: "sendgrid", action: "contacts.create", source: "connector", validated: validateCreateContactInput(input) };
}

function validateCreateContactInput(input: unknown): CreateContactInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return {
    email: requireString(input.email, "email"),
    firstName: typeof input.firstName === "string" ? input.firstName : undefined,
    lastName: typeof input.lastName === "string" ? input.lastName : undefined,
    listIds: Array.isArray(input.listIds) ? input.listIds.filter((v): v is string => typeof v === "string") : undefined,
  };
}

// ─── New: mail.send ───────────────────────────────────────────────────────────

export function sendMail(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isSmtpConfigured(input)) {
    return sendSmtpEmail(input as Record<string, unknown>).then((result) => ({
      connector: "sendgrid",
      action: "mail.send",
      source: "smtp",
      ...result,
    }));
  }
  if (isRecord(input) && typeof input.apiKey === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createMailClient({ apiKey: input.apiKey, fetch: fetchFn }).send(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: (result.error as any).retryAfterSeconds };
      }
      return { connector: "sendgrid", action: "mail.send", source: "connector", messageId: result.messageId };
    });
  }
  return { connector: "sendgrid", action: "mail.send", source: "connector", validated: validateMailSendInput(input) };
}

// ─── New: contacts.upsert ─────────────────────────────────────────────────────

export function upsertContacts(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createContactsExtClient({ apiKey: input.apiKey, fetch: fetchFn }).upsert(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: (result.error as any).retryAfterSeconds };
      }
      return { connector: "sendgrid", action: "contacts.upsert", source: "connector", jobId: result.jobId };
    });
  }
  return { connector: "sendgrid", action: "contacts.upsert", source: "connector", validated: validateContactUpsertInput(input) };
}

// ─── New: contacts.search ─────────────────────────────────────────────────────

export function searchContacts(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createContactsExtClient({ apiKey: input.apiKey, fetch: fetchFn }).search(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: (result.error as any).retryAfterSeconds };
      }
      return { connector: "sendgrid", action: "contacts.search", source: "connector", contacts: result.contacts };
    });
  }
  return { connector: "sendgrid", action: "contacts.search", source: "connector", validated: validateContactSearchInput(input) };
}

// ─── New: contacts.delete ─────────────────────────────────────────────────────

export function deleteContacts(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createContactsExtClient({ apiKey: input.apiKey, fetch: fetchFn }).delete(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: (result.error as any).retryAfterSeconds };
      }
      return { connector: "sendgrid", action: "contacts.delete", source: "connector", jobId: result.jobId };
    });
  }
  return { connector: "sendgrid", action: "contacts.delete", source: "connector", validated: validateContactDeleteInput(input) };
}

// ─── New: lists.create ────────────────────────────────────────────────────────

export function createList(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createListsClient({ apiKey: input.apiKey, fetch: fetchFn }).create(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: (result.error as any).retryAfterSeconds };
      }
      return { connector: "sendgrid", action: "lists.create", source: "connector", list: result.list };
    });
  }
  return { connector: "sendgrid", action: "lists.create", source: "connector", validated: validateListCreateInput(input) };
}

// ─── New: lists.get ───────────────────────────────────────────────────────────

export function getList(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createListsClient({ apiKey: input.apiKey, fetch: fetchFn }).get(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: (result.error as any).retryAfterSeconds };
      }
      return { connector: "sendgrid", action: "lists.get", source: "connector", list: result.list };
    });
  }
  return { connector: "sendgrid", action: "lists.get", source: "connector", validated: validateListGetInput(input) };
}

// ─── New: lists.delete ────────────────────────────────────────────────────────

export function deleteList(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createListsClient({ apiKey: input.apiKey, fetch: fetchFn }).delete(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: (result.error as any).retryAfterSeconds };
      }
      return { connector: "sendgrid", action: "lists.delete", source: "connector", deleted: result.deleted };
    });
  }
  return { connector: "sendgrid", action: "lists.delete", source: "connector", validated: validateListDeleteInput(input) };
}

// ─── New: templates.create ────────────────────────────────────────────────────

export function createTemplate(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createTemplatesClient({ apiKey: input.apiKey, fetch: fetchFn }).create(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: (result.error as any).retryAfterSeconds };
      }
      return { connector: "sendgrid", action: "templates.create", source: "connector", template: result.template };
    });
  }
  return { connector: "sendgrid", action: "templates.create", source: "connector", validated: validateTemplateCreateInput(input) };
}

// ─── New: templates.get ───────────────────────────────────────────────────────

export function getTemplate(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createTemplatesClient({ apiKey: input.apiKey, fetch: fetchFn }).get(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: (result.error as any).retryAfterSeconds };
      }
      return { connector: "sendgrid", action: "templates.get", source: "connector", template: result.template };
    });
  }
  return { connector: "sendgrid", action: "templates.get", source: "connector", validated: validateTemplateGetInput(input) };
}

// ─── New: suppression.bounces.list ───────────────────────────────────────────

export function listBounces(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createSuppressionClient({ apiKey: input.apiKey, fetch: fetchFn }).listBounces(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: (result.error as any).retryAfterSeconds };
      }
      return { connector: "sendgrid", action: "suppression.bounces.list", source: "connector", bounces: result.bounces };
    });
  }
  return { connector: "sendgrid", action: "suppression.bounces.list", source: "connector", validated: validateBouncesListInput(input) };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function requireString(v: unknown, f: string): string { if (typeof v !== "string" || !v.length) throw new Error(`${f} is required`); return v; }
function isRecord(v: unknown): v is Record<string, unknown> { return typeof v === "object" && v !== null && !Array.isArray(v); }
