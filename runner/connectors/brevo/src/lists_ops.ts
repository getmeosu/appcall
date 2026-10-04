import { createBrevoClient, brevoErrorDetail, parseBrevoRateLimit, isRecord } from "./http";
import { normalizeFolder, normalizeList, parseContactsResponse, parseFoldersResponse } from "./objects";

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

export type UpdateListInput = { listId: number; name: string };
export function validateUpdateListInput(input: unknown): UpdateListInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return { listId: requireNumber(input.listId, "listId"), name: requireString(input.name, "name") };
}

export type DeleteListInput = { listId: number };
export function validateDeleteListInput(input: unknown): DeleteListInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return { listId: requireNumber(input.listId, "listId") };
}

export type GetListContactsInput = { listId: number; limit?: number; offset?: number };
export function validateGetListContactsInput(input: unknown): GetListContactsInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return {
    listId: requireNumber(input.listId, "listId"),
    limit: typeof input.limit === "number" ? input.limit : undefined,
    offset: typeof input.offset === "number" ? input.offset : undefined,
  };
}

export type CreateFolderInput = { name: string };
export function validateCreateFolderInput(input: unknown): CreateFolderInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return { name: requireString(input.name, "name") };
}

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

    async updateList(input: unknown) {
      const payload = validateUpdateListInput(input);
      const client = createBrevoClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "lists.update" });
      const result = await client.fetchJSON(`/contacts/lists/${payload.listId}`, {
        method: "PUT",
        body: JSON.stringify({ name: payload.name }),
      });
      if (result.status === 204 || result.status === 200) {
        return { ok: true as const, updated: true, listId: payload.listId, name: payload.name };
      }
      const rl = parseBrevoRateLimit(result.status, result.headers);
      if (rl.limited) return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED" as const, message: "Brevo rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
      if (result.status === 404) return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: "List not found." } };
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: brevoErrorDetail(result.body, "Brevo rejected the update list request.") } };
    },

    async deleteList(input: unknown) {
      const payload = validateDeleteListInput(input);
      const client = createBrevoClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "lists.delete" });
      const result = await client.fetchJSON(`/contacts/lists/${payload.listId}`, { method: "DELETE" });
      if (result.status === 204 || result.status === 200) {
        return { ok: true as const, deleted: true };
      }
      const rl = parseBrevoRateLimit(result.status, result.headers);
      if (rl.limited) return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED" as const, message: "Brevo rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
      if (result.status === 404) return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: "List not found." } };
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: brevoErrorDetail(result.body, "Brevo rejected the delete list request.") } };
    },

    async getListContacts(input: unknown) {
      const payload = validateGetListContactsInput(input);
      const client = createBrevoClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "lists.getContacts" });
      const params = new URLSearchParams();
      if (payload.limit !== undefined) params.set("limit", String(payload.limit));
      if (payload.offset !== undefined) params.set("offset", String(payload.offset));
      const query = params.toString();
      const result = await client.fetchJSON(`/contacts/lists/${payload.listId}/contacts${query ? `?${query}` : ""}`);
      if (result.status === 200) {
        const parsed = parseContactsResponse(result.body);
        return { ok: true as const, contacts: parsed.contacts, count: parsed.count };
      }
      const rl = parseBrevoRateLimit(result.status, result.headers);
      if (rl.limited) return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED" as const, message: "Brevo rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
      if (result.status === 404) return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: "List not found." } };
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: brevoErrorDetail(result.body, "Brevo rejected the list contacts request.") } };
    },

    async listFolders(input: unknown) {
      const client = createBrevoClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "folders.list" });
      const result = await client.fetchJSON("/contacts/folders");
      if (result.status === 200) {
        return { ok: true as const, folders: parseFoldersResponse(result.body).folders };
      }
      const rl = parseBrevoRateLimit(result.status, result.headers);
      if (rl.limited) return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED" as const, message: "Brevo rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: brevoErrorDetail(result.body, "Brevo rejected the list folders request.") } };
    },

    async createFolder(input: unknown) {
      const payload = validateCreateFolderInput(input);
      const client = createBrevoClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "folders.create" });
      const result = await client.fetchJSON("/contacts/folders", {
        method: "POST",
        body: JSON.stringify({ name: payload.name }),
      });
      if (result.status === 201 || result.status === 200) {
        const body = isRecord(result.body) ? result.body : {};
        return { ok: true as const, folder: normalizeFolder({ ...body, name: payload.name }) };
      }
      const rl = parseBrevoRateLimit(result.status, result.headers);
      if (rl.limited) return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED" as const, message: "Brevo rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: brevoErrorDetail(result.body, "Brevo rejected the create folder request.") } };
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
