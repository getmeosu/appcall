import { missingCredentialFailure } from "../../../bun/src/credentials";
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
  validateUpdateListInput,
  validateDeleteListInput,
  validateCreateMemberNoteInput,
  createListsClient,
} from "./lists";
import {
  validateCreateCampaignInput,
  validateGetCampaignInput,
  validateSendCampaignInput,
  validateUnscheduleCampaignInput,
  validateScheduleCampaignInput,
  validateDeleteCampaignInput,
  validateReplicateCampaignInput,
  createCampaignsClient,
} from "./campaigns";
import { validateListTemplatesInput, validateGetTemplateInput, createTemplatesClient } from "./templates";
import { validateCampaignReportInput, createReportsClient } from "./reports";
import { validateListAutomationsInput, validateGetAutomationInput, createAutomationsClient } from "./automations";

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
  validateCreateContactInput(input);
  // PLAT-NOCRED-1: no credential fails closed, never a fake "validated" success.
  return Promise.reject(missingCredentialFailure());
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
  validateGetMemberInput(input);
  // PLAT-NOCRED-1: no credential fails closed, never a fake "validated" success.
  return Promise.reject(missingCredentialFailure());
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
  validateUpdateMemberInput(input);
  // PLAT-NOCRED-1: no credential fails closed, never a fake "validated" success.
  return Promise.reject(missingCredentialFailure());
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
  validateUpsertMemberInput(input);
  // PLAT-NOCRED-1: no credential fails closed, never a fake "validated" success.
  return Promise.reject(missingCredentialFailure());
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
  validateDeleteMemberInput(input);
  // PLAT-NOCRED-1: no credential fails closed, never a fake "validated" success.
  return Promise.reject(missingCredentialFailure());
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
  validateAddMemberTagsInput(input);
  // PLAT-NOCRED-1: no credential fails closed, never a fake "validated" success.
  return Promise.reject(missingCredentialFailure());
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
  validateCreateListInput(input);
  // PLAT-NOCRED-1: no credential fails closed, never a fake "validated" success.
  return Promise.reject(missingCredentialFailure());
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
  validateGetListInput(input);
  // PLAT-NOCRED-1: no credential fails closed, never a fake "validated" success.
  return Promise.reject(missingCredentialFailure());
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
  validateCreateCampaignInput(input);
  // PLAT-NOCRED-1: no credential fails closed, never a fake "validated" success.
  return Promise.reject(missingCredentialFailure());
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
  validateGetCampaignInput(input);
  // PLAT-NOCRED-1: no credential fails closed, never a fake "validated" success.
  return Promise.reject(missingCredentialFailure());
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
  validateSendCampaignInput(input);
  // PLAT-NOCRED-1: no credential fails closed, never a fake "validated" success.
  return Promise.reject(missingCredentialFailure());
}

export function unscheduleCampaign(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createCampaignsClient({ apiKey: input.apiKey, fetch: fetchFn, operation: "campaigns.unschedule" })
      .unscheduleCampaign(input)
      .then((result) => {
        if (result.ok) return { connector: "mailchimp", action: "campaigns.unschedule", source: "connector", unscheduled: true };
        throwConnectorError(result.error);
      });
  }
  validateUnscheduleCampaignInput(input);
  // PLAT-NOCRED-1: no credential fails closed, never a fake "validated" success.
  return Promise.reject(missingCredentialFailure());
}

export function scheduleCampaign(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createCampaignsClient({ apiKey: input.apiKey, fetch: fetchFn, operation: "campaigns.schedule" })
      .scheduleCampaign(input)
      .then((result) => {
        if (result.ok) return { connector: "mailchimp", action: "campaigns.schedule", source: "connector", scheduled: true };
        throwConnectorError(result.error);
      });
  }
  validateScheduleCampaignInput(input);
  // PLAT-NOCRED-1: no credential fails closed, never a fake "validated" success.
  return Promise.reject(missingCredentialFailure());
}

export function deleteCampaign(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createCampaignsClient({ apiKey: input.apiKey, fetch: fetchFn, operation: "campaigns.delete" })
      .deleteCampaign(input)
      .then((result) => {
        if (result.ok) return { connector: "mailchimp", action: "campaigns.delete", source: "connector", deleted: true };
        throwConnectorError(result.error);
      });
  }
  validateDeleteCampaignInput(input);
  // PLAT-NOCRED-1: no credential fails closed, never a fake "validated" success.
  return Promise.reject(missingCredentialFailure());
}

export function replicateCampaign(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createCampaignsClient({ apiKey: input.apiKey, fetch: fetchFn, operation: "campaigns.replicate" })
      .replicateCampaign(input)
      .then((result) => {
        if (result.ok) return { connector: "mailchimp", action: "campaigns.replicate", source: "connector", campaign: result.campaign };
        throwConnectorError(result.error);
      });
  }
  validateReplicateCampaignInput(input);
  // PLAT-NOCRED-1: no credential fails closed, never a fake "validated" success.
  return Promise.reject(missingCredentialFailure());
}

export function updateList(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createListsClient({ apiKey: input.apiKey, fetch: fetchFn, operation: "lists.update" })
      .updateList(input)
      .then((result) => {
        if (result.ok) return { connector: "mailchimp", action: "lists.update", source: "connector", audience: result.audience };
        throwConnectorError(result.error);
      });
  }
  validateUpdateListInput(input);
  // PLAT-NOCRED-1: no credential fails closed, never a fake "validated" success.
  return Promise.reject(missingCredentialFailure());
}

export function deleteList(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createListsClient({ apiKey: input.apiKey, fetch: fetchFn, operation: "lists.delete" })
      .deleteList(input)
      .then((result) => {
        if (result.ok) return { connector: "mailchimp", action: "lists.delete", source: "connector", deleted: true };
        throwConnectorError(result.error);
      });
  }
  validateDeleteListInput(input);
  // PLAT-NOCRED-1: no credential fails closed, never a fake "validated" success.
  return Promise.reject(missingCredentialFailure());
}

export function createMemberNote(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createListsClient({ apiKey: input.apiKey, fetch: fetchFn, operation: "members.notes.create" })
      .createMemberNote(input)
      .then((result) => {
        if (result.ok) return { connector: "mailchimp", action: "members.notes.create", source: "connector", note: result.note };
        throwConnectorError(result.error);
      });
  }
  validateCreateMemberNoteInput(input);
  // PLAT-NOCRED-1: no credential fails closed, never a fake "validated" success.
  return Promise.reject(missingCredentialFailure());
}

export function listTemplates(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createTemplatesClient({ apiKey: input.apiKey, fetch: fetchFn, operation: "templates.list" })
      .listTemplates(input)
      .then((result) => {
        if (result.ok) return { connector: "mailchimp", action: "templates.list", source: "connector", templates: result.templates };
        throwConnectorError(result.error);
      });
  }
  validateListTemplatesInput(input);
  // PLAT-NOCRED-1: no credential fails closed, never a fake "validated" success.
  return Promise.reject(missingCredentialFailure());
}

export function getTemplate(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createTemplatesClient({ apiKey: input.apiKey, fetch: fetchFn, operation: "templates.get" })
      .getTemplate(input)
      .then((result) => {
        if (result.ok) return { connector: "mailchimp", action: "templates.get", source: "connector", template: result.template };
        throwConnectorError(result.error);
      });
  }
  validateGetTemplateInput(input);
  // PLAT-NOCRED-1: no credential fails closed, never a fake "validated" success.
  return Promise.reject(missingCredentialFailure());
}

export function getReportSummary(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createReportsClient({ apiKey: input.apiKey, fetch: fetchFn, operation: "reports.summary" })
      .getSummary(input)
      .then((result) => {
        if (result.ok) return { connector: "mailchimp", action: "reports.summary", source: "connector", report: result.report };
        throwConnectorError(result.error);
      });
  }
  validateCampaignReportInput(input);
  // PLAT-NOCRED-1: no credential fails closed, never a fake "validated" success.
  return Promise.reject(missingCredentialFailure());
}

export function getReportOpens(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createReportsClient({ apiKey: input.apiKey, fetch: fetchFn, operation: "reports.opens" })
      .getOpens(input)
      .then((result) => {
        if (result.ok) return { connector: "mailchimp", action: "reports.opens", source: "connector", opens: result.opens };
        throwConnectorError(result.error);
      });
  }
  validateCampaignReportInput(input);
  // PLAT-NOCRED-1: no credential fails closed, never a fake "validated" success.
  return Promise.reject(missingCredentialFailure());
}

export function getReportClicks(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createReportsClient({ apiKey: input.apiKey, fetch: fetchFn, operation: "reports.clicks" })
      .getClicks(input)
      .then((result) => {
        if (result.ok) return { connector: "mailchimp", action: "reports.clicks", source: "connector", clicks: result.clicks };
        throwConnectorError(result.error);
      });
  }
  validateCampaignReportInput(input);
  // PLAT-NOCRED-1: no credential fails closed, never a fake "validated" success.
  return Promise.reject(missingCredentialFailure());
}

export function getReportUnsubscribed(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createReportsClient({ apiKey: input.apiKey, fetch: fetchFn, operation: "reports.unsubscribed" })
      .getUnsubscribed(input)
      .then((result) => {
        if (result.ok) return { connector: "mailchimp", action: "reports.unsubscribed", source: "connector", unsubscribed: result.unsubscribed };
        throwConnectorError(result.error);
      });
  }
  validateCampaignReportInput(input);
  // PLAT-NOCRED-1: no credential fails closed, never a fake "validated" success.
  return Promise.reject(missingCredentialFailure());
}

export function listAutomations(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createAutomationsClient({ apiKey: input.apiKey, fetch: fetchFn, operation: "automations.list" })
      .listAutomations(input)
      .then((result) => {
        if (result.ok) return { connector: "mailchimp", action: "automations.list", source: "connector", automations: result.automations };
        throwConnectorError(result.error);
      });
  }
  validateListAutomationsInput(input);
  // PLAT-NOCRED-1: no credential fails closed, never a fake "validated" success.
  return Promise.reject(missingCredentialFailure());
}

export function getAutomation(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createAutomationsClient({ apiKey: input.apiKey, fetch: fetchFn, operation: "automations.get" })
      .getAutomation(input)
      .then((result) => {
        if (result.ok) return { connector: "mailchimp", action: "automations.get", source: "connector", automation: result.automation };
        throwConnectorError(result.error);
      });
  }
  validateGetAutomationInput(input);
  // PLAT-NOCRED-1: no credential fails closed, never a fake "validated" success.
  return Promise.reject(missingCredentialFailure());
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function throwConnectorError(error: { code: string; message: string; retryAfterSeconds?: number }): never {
  if (error.code === "CONNECTOR_RATE_LIMITED") {
    throw { ok: false, code: error.code, message: error.message, retryAfterSeconds: error.retryAfterSeconds };
  }
  throw { ok: false, code: error.code, message: error.message };
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function isRecord(v: unknown): v is Record<string, unknown> { return typeof v === "object" && v !== null && !Array.isArray(v); }
