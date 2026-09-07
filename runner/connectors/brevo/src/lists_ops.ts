import { createBrevoClient, brevoErrorDetail, parseBrevoRateLimit, prop, propNum, isRecord } from "./http";
import { normalizeList } from "./objects";

// ─── lists.create ─────────────────────────────────────────────────────────────

export type CreateListInput = { name: string; folderId: number };

export function validateCreateListInput(input: unknown): CreateListInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return {
    name: requireString(input.name, "name"),
    folderId: requireNumber(input.folderId, "folderId"),
  };
}

// ─── lists.get ────────────────────────────────────────────────────────────────

export type GetListInput = { listId: number };

export function validateGetListInput(input: unknown): GetListInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return { listId: requireNumber(input.listId, "listId") };
}

// ─── contacts.addToList ───────────────────────────────────────────────────────

export type AddContactsToListInput = { listId: number; emails: string[] };

export function validateAddContactsToListInput(input: unknown): AddContactsToListInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  const emails = Array.isArray(input.emails)
    ? (input.emails as unknown[]).filter((e): e is string => typeof e === "string" && e.length > 0)
    : [];
  if (emails.length === 0) throw new Error("emails must be a non-empty array of strings");
  return { listId: requireNumber(input.listId, "listId"), emails };
}

// ─── contacts.removeFromList ──────────────────────────────────────────────────

export type RemoveContactsFromListInput = { listId: number; emails?: string[]; all?: boolean };

export function validateRemoveContactsFromListInput(input: unknown): RemoveContactsFromListInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  const emails = Array.isArray(input.emails)
    ? (input.emails as unknown[]).filter((e): e is string => typeof e === "string" && e.length > 0)
    : undefined;
  const all = typeof input.all === "boolean" ? input.all : undefined;
  if (!emails?.length && !all) throw new Error("either emails or all:true is required");
  return { listId: requireNumber(input.listId, "listId"), emails, all };
}

// ─── Client ───────────────────────────────────────────────────────────────────

export function createListsOpsClient(options: { apiKey: string; fetch?: typeof fetch }) {
  return {
    async createList(input: unknown) {
      const payload = validateCreateListInput(input);
      const client = createBrevoClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "lists.create" });
      const result = await client.fetchJSON("/contacts/lists", {
        method: "POST",
        body: JSON.stringify({ name: payload.name, folderId: payload.folderId }),
      });
      if (result.status === 201 || result.status === 200) {
        const body = result.body as Record<string, unknown>;
        return { ok: true as const, list: normalizeList(body) };
      }
      const rl = parseBrevoRateLimit(result.status, result.headers);
      if (rl.limited) return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED" as const, message: "Brevo rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: brevoErrorDetail(result.body, "Brevo rejected the create list request.") } };
    },

    async getList(input: unknown) {
      const payload = validateGetListInput(input);
      const client = createBrevoClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "lists.get" });
      const result = await client.fetchJSON(`/contacts/lists/${payload.listId}`);
      if (result.status === 200) {
        return { ok: true as const, list: normalizeList(result.body as Record<string, unknown>) };
      }
      const rl = parseBrevoRateLimit(result.status, result.headers);
      if (rl.limited) return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED" as const, message: "Brevo rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
      if (result.status === 404) return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: "List not found." } };
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: brevoErrorDetail(result.body, "Brevo rejected the get list request.") } };
    },

    async addContactsToList(input: unknown) {
      const payload = validateAddContactsToListInput(input);
      const client = createBrevoClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "contacts.addToList" });
      const result = await client.fetchJSON(`/contacts/lists/${payload.listId}/contacts/add`, {
        method: "POST",
        body: JSON.stringify({ emails: payload.emails }),
      });
      if (result.status === 201 || result.status === 200) {
        const body = isRecord(result.body) ? result.body : {};
        return {
          ok: true as const,
          contacts: {
            successEmails: Array.isArray(body.contacts) ? body.contacts : [],
            failureEmails: isRecord(body.failure) ? body.failure : {},
          },
        };
      }
      const rl = parseBrevoRateLimit(result.status, result.headers);
      if (rl.limited) return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED" as const, message: "Brevo rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: brevoErrorDetail(result.body, "Brevo rejected the add contacts to list request.") } };
    },

    async removeContactsFromList(input: unknown) {
      const payload = validateRemoveContactsFromListInput(input);
      const client = createBrevoClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "contacts.removeFromList" });
      const body: Record<string, unknown> = {};
      if (payload.all) {
        body.all = true;
      } else {
        body.emails = payload.emails;
      }
      const result = await client.fetchJSON(`/contacts/lists/${payload.listId}/contacts/remove`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (result.status === 201 || result.status === 200) {
        return { ok: true as const, removed: true };
      }
      const rl = parseBrevoRateLimit(result.status, result.headers);
      if (rl.limited) return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED" as const, message: "Brevo rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
      if (result.status === 404) return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: "List not found." } };
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: brevoErrorDetail(result.body, "Brevo rejected the remove contacts from list request.") } };
    },
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function requireString(v: unknown, f: string): string {
  if (typeof v !== "string" || !v.length) throw new Error(`${f} is required`);
  return v;
}

function requireNumber(v: unknown, f: string): number {
  if (typeof v !== "number") throw new Error(`${f} must be a number`);
  return v;
}
