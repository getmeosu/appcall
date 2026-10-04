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
  validateContactGetInput,
  validateListsListInput,
  validateListContactsListInput,
  validateListContactsAddInput,
  validateListContactsRemoveInput,
} from "./contacts_ext";
import {
  createTemplatesClient,
  createSuppressionClient,
  validateTemplateCreateInput,
  validateTemplateGetInput,
  validateBouncesListInput,
  validateTemplateListInput,
  validateTemplateUpdateInput,
  validateTemplateDeleteInput,
  validateSuppressionListInput,
} from "./templates";
import {
  createAdminClient,
  validateGlobalStatsInput,
  validateApiKeysListInput,
  validateAlertsListInput,
} from "./admin";

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

// ─── contacts.get ─────────────────────────────────────────────────────────────

export function getContact(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  return liveAction(input, "contacts.get", validateContactGetInput, (apiKey, fetchFn) =>
    createContactsExtClient({ apiKey, fetch: fetchFn }).get(input).then((result) => {
      throwFailed(result);
      return { connector: "sendgrid", action: "contacts.get", source: "connector", contact: result.contact };
    }));
}

// ─── lists.list.action ────────────────────────────────────────────────────────

export function listLists(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  return liveAction(input, "lists.list.action", validateListsListInput, (apiKey, fetchFn) =>
    createListsClient({ apiKey, fetch: fetchFn }).list(input).then((result) => {
      throwFailed(result);
      return { connector: "sendgrid", action: "lists.list.action", source: "connector", lists: result.lists };
    }));
}

// ─── lists.contacts.list ──────────────────────────────────────────────────────

export function listListContacts(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  return liveAction(input, "lists.contacts.list", validateListContactsListInput, (apiKey, fetchFn) =>
    createListsClient({ apiKey, fetch: fetchFn }).listContacts(input).then((result) => {
      throwFailed(result);
      return { connector: "sendgrid", action: "lists.contacts.list", source: "connector", contacts: result.contacts };
    }));
}

// ─── lists.contacts.add ───────────────────────────────────────────────────────

export function addListContacts(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  return liveAction(input, "lists.contacts.add", validateListContactsAddInput, (apiKey, fetchFn) =>
    createListsClient({ apiKey, fetch: fetchFn }).addContacts(input).then((result) => {
      throwFailed(result);
      return { connector: "sendgrid", action: "lists.contacts.add", source: "connector", jobId: result.jobId };
    }));
}

// ─── lists.contacts.remove ────────────────────────────────────────────────────

export function removeListContacts(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  return liveAction(input, "lists.contacts.remove", validateListContactsRemoveInput, (apiKey, fetchFn) =>
    createListsClient({ apiKey, fetch: fetchFn }).removeContacts(input).then((result) => {
      throwFailed(result);
      return { connector: "sendgrid", action: "lists.contacts.remove", source: "connector", jobId: result.jobId };
    }));
}

// ─── templates.list ───────────────────────────────────────────────────────────

export function listTemplates(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  return liveAction(input, "templates.list", validateTemplateListInput, (apiKey, fetchFn) =>
    createTemplatesClient({ apiKey, fetch: fetchFn }).list(input).then((result) => {
      throwFailed(result);
      return { connector: "sendgrid", action: "templates.list", source: "connector", templates: result.templates };
    }));
}

// ─── templates.update ─────────────────────────────────────────────────────────

export function updateTemplate(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  return liveAction(input, "templates.update", validateTemplateUpdateInput, (apiKey, fetchFn) =>
    createTemplatesClient({ apiKey, fetch: fetchFn }).update(input).then((result) => {
      throwFailed(result);
      return { connector: "sendgrid", action: "templates.update", source: "connector", template: result.template };
    }));
}

// ─── templates.delete ─────────────────────────────────────────────────────────

export function deleteTemplate(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  return liveAction(input, "templates.delete", validateTemplateDeleteInput, (apiKey, fetchFn) =>
    createTemplatesClient({ apiKey, fetch: fetchFn }).delete(input).then((result) => {
      throwFailed(result);
      return { connector: "sendgrid", action: "templates.delete", source: "connector", deleted: result.deleted };
    }));
}

// ─── stats.global.get ─────────────────────────────────────────────────────────

export function getGlobalStats(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  return liveAction(input, "stats.global.get", validateGlobalStatsInput, (apiKey, fetchFn) =>
    createAdminClient({ apiKey, fetch: fetchFn }).getGlobalStats(input).then((result) => {
      throwFailed(result);
      return { connector: "sendgrid", action: "stats.global.get", source: "connector", stats: result.stats };
    }));
}

// ─── suppression.blocks.list ──────────────────────────────────────────────────

export function listBlocks(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  return liveAction(input, "suppression.blocks.list", validateSuppressionListInput, (apiKey, fetchFn) =>
    createSuppressionClient({ apiKey, fetch: fetchFn }).listBlocks(input).then((result) => {
      throwFailed(result);
      return { connector: "sendgrid", action: "suppression.blocks.list", source: "connector", blocks: result.blocks };
    }));
}

// ─── suppression.spam_reports.list ────────────────────────────────────────────

export function listSpamReports(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  return liveAction(input, "suppression.spam_reports.list", validateSuppressionListInput, (apiKey, fetchFn) =>
    createSuppressionClient({ apiKey, fetch: fetchFn }).listSpamReports(input).then((result) => {
      throwFailed(result);
      return { connector: "sendgrid", action: "suppression.spam_reports.list", source: "connector", spamReports: result.spamReports };
    }));
}

// ─── suppression.unsubscribes.list ────────────────────────────────────────────

export function listUnsubscribes(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  return liveAction(input, "suppression.unsubscribes.list", validateSuppressionListInput, (apiKey, fetchFn) =>
    createSuppressionClient({ apiKey, fetch: fetchFn }).listUnsubscribes(input).then((result) => {
      throwFailed(result);
      return { connector: "sendgrid", action: "suppression.unsubscribes.list", source: "connector", unsubscribes: result.unsubscribes };
    }));
}

// ─── suppression.invalid_emails.list ──────────────────────────────────────────

export function listInvalidEmails(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  return liveAction(input, "suppression.invalid_emails.list", validateSuppressionListInput, (apiKey, fetchFn) =>
    createSuppressionClient({ apiKey, fetch: fetchFn }).listInvalidEmails(input).then((result) => {
      throwFailed(result);
      return { connector: "sendgrid", action: "suppression.invalid_emails.list", source: "connector", invalidEmails: result.invalidEmails };
    }));
}

// ─── api_keys.list ────────────────────────────────────────────────────────────

export function listApiKeys(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  return liveAction(input, "api_keys.list", validateApiKeysListInput, (apiKey, fetchFn) =>
    createAdminClient({ apiKey, fetch: fetchFn }).listApiKeys(input).then((result) => {
      throwFailed(result);
      return { connector: "sendgrid", action: "api_keys.list", source: "connector", apiKeys: result.apiKeys };
    }));
}

// ─── alerts.list ──────────────────────────────────────────────────────────────

export function listAlerts(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  return liveAction(input, "alerts.list", validateAlertsListInput, (apiKey, fetchFn) =>
    createAdminClient({ apiKey, fetch: fetchFn }).listAlerts(input).then((result) => {
      throwFailed(result);
      return { connector: "sendgrid", action: "alerts.list", source: "connector", alerts: result.alerts };
    }));
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function requireString(v: unknown, f: string): string { if (typeof v !== "string" || !v.length) throw new Error(`${f} is required`); return v; }
function isRecord(v: unknown): v is Record<string, unknown> { return typeof v === "object" && v !== null && !Array.isArray(v); }

function liveAction(
  input: unknown,
  action: string,
  validate: (input: unknown) => unknown,
  execute: (apiKey: string, fetchFn: typeof fetch | undefined) => Promise<Record<string, unknown>>,
): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return execute(input.apiKey, fetchFn);
  }
  return { connector: "sendgrid", action, source: "connector", validated: validate(input) };
}

function throwFailed(result: { ok: boolean; error?: { code: string; message: string; retryAfterSeconds?: number } }): asserts result is { ok: true } & typeof result {
  if (!result.ok) {
    throw { ok: false, code: result.error?.code, message: result.error?.message, retryAfterSeconds: result.error?.retryAfterSeconds };
  }
}
