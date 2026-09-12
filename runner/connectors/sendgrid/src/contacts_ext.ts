import { createSendGridClient, parseSendGridRateLimit } from "./http";
import { normalizeContact, normalizeList, type NormalizedContact, type NormalizedList } from "./objects";

// ─── contacts.upsert ─────────────────────────────────────────────────────────

export type ContactUpsertInput = {
  contacts: Array<{ email: string; firstName?: string; lastName?: string; customFields?: Record<string, unknown> }>;
  listIds?: string[];
};

export function validateContactUpsertInput(input: unknown): ContactUpsertInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  if (!Array.isArray(input.contacts) || input.contacts.length === 0) throw new Error("contacts must be a non-empty array");
  const contacts = (input.contacts as unknown[]).map((c, i) => {
    if (!isRecord(c)) throw new Error(`contacts[${i}] must be an object`);
    return {
      email: requireString(c.email, `contacts[${i}].email`),
      firstName: typeof c.firstName === "string" ? c.firstName : undefined,
      lastName: typeof c.lastName === "string" ? c.lastName : undefined,
      customFields: isRecord(c.customFields) ? c.customFields : undefined,
    };
  });
  return {
    contacts,
    listIds: Array.isArray(input.listIds) ? input.listIds.filter((v): v is string => typeof v === "string") : undefined,
  };
}

// ─── contacts.search ─────────────────────────────────────────────────────────

export type ContactSearchInput = { query: string; pageSize?: number };

export function validateContactSearchInput(input: unknown): ContactSearchInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return {
    query: requireString(input.query, "query"),
    pageSize: typeof input.pageSize === "number" ? input.pageSize : undefined,
  };
}

// ─── contacts.delete ─────────────────────────────────────────────────────────

export type ContactDeleteInput = { ids: string[] };

export function validateContactDeleteInput(input: unknown): ContactDeleteInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  if (!Array.isArray(input.ids) || input.ids.length === 0) throw new Error("ids must be a non-empty array");
  return { ids: (input.ids as unknown[]).filter((v): v is string => typeof v === "string") };
}

// ─── lists.create ─────────────────────────────────────────────────────────────

export type ListCreateInput = { name: string };

export function validateListCreateInput(input: unknown): ListCreateInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return { name: requireString(input.name, "name") };
}

// ─── lists.get ────────────────────────────────────────────────────────────────

export type ListGetInput = { listId: string };

export function validateListGetInput(input: unknown): ListGetInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return { listId: requireString(input.listId, "listId") };
}

// ─── lists.delete ─────────────────────────────────────────────────────────────

export type ListDeleteInput = { listId: string; deleteContacts?: boolean };

export function validateListDeleteInput(input: unknown): ListDeleteInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return {
    listId: requireString(input.listId, "listId"),
    deleteContacts: typeof input.deleteContacts === "boolean" ? input.deleteContacts : false,
  };
}

// ─── Client ───────────────────────────────────────────────────────────────────

export function createContactsExtClient(options: { apiKey: string; fetch?: typeof fetch; operation?: string }) {
  return {
    async upsert(input: unknown) {
      const payload = validateContactUpsertInput(input);
      const client = createSendGridClient({
        apiKey: options.apiKey,
        fetch: options.fetch,
        operation: options.operation ?? "contacts.upsert",
      });
      const sgContacts = payload.contacts.map((c) => ({
        email: c.email,
        first_name: c.firstName,
        last_name: c.lastName,
        custom_fields: c.customFields,
      }));
      const body: Record<string, unknown> = { contacts: sgContacts };
      if (payload.listIds) body.list_ids = payload.listIds;
      const response = await client.fetchJSON("/marketing/contacts", { method: "PUT", body: JSON.stringify(body) });
      if (response.status === 200 || response.status === 201 || response.status === 202) {
        const b = isRecord(response.body) ? response.body : {};
        if (typeof b.job_id !== "string" || b.job_id.length === 0) {
          return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: "SendGrid did not return a queued job ID." } };
        }
        return { ok: true as const, jobId: b.job_id };
      }
      const rl = parseSendGridRateLimit(response.status, response.headers);
      if (rl.limited) return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED" as const, message: "SendGrid rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: "SendGrid rejected the contacts upsert request." } };
    },

    async search(input: unknown) {
      const payload = validateContactSearchInput(input);
      const client = createSendGridClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "contacts.search" });
      const body: Record<string, unknown> = { query: payload.query };
      if (payload.pageSize) body.page_size = payload.pageSize;
      const response = await client.fetchJSON("/marketing/contacts/search", { method: "POST", body: JSON.stringify(body) });
      if (response.status === 200) {
        const b = response.body as Record<string, unknown>;
        const contacts = Array.isArray(b.result) ? (b.result as Record<string, unknown>[]).map(normalizeContact) : [];
        return { ok: true as const, contacts };
      }
      const rl = parseSendGridRateLimit(response.status, response.headers);
      if (rl.limited) return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED" as const, message: "SendGrid rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: "SendGrid rejected the contacts search request." } };
    },

    async delete(input: unknown) {
      const payload = validateContactDeleteInput(input);
      const client = createSendGridClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "contacts.delete" });
      const idsParam = payload.ids.join(",");
      const response = await client.fetchJSON(`/marketing/contacts?ids=${encodeURIComponent(idsParam)}`, { method: "DELETE" });
      if (response.status === 202) {
        const b = response.body as Record<string, unknown>;
        return { ok: true as const, jobId: typeof b.job_id === "string" ? b.job_id : "" };
      }
      const rl = parseSendGridRateLimit(response.status, response.headers);
      if (rl.limited) return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED" as const, message: "SendGrid rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: "SendGrid rejected the contacts delete request." } };
    },
  };
}

export function createListsClient(options: { apiKey: string; fetch?: typeof fetch }) {
  return {
    async create(input: unknown) {
      const payload = validateListCreateInput(input);
      const client = createSendGridClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "lists.create" });
      const response = await client.fetchJSON("/marketing/lists", { method: "POST", body: JSON.stringify({ name: payload.name }) });
      if (response.status === 200 || response.status === 201) {
        const b = isRec(response.body) ? response.body : {};
        return { ok: true as const, list: normalizeList(b) };
      }
      const rl = parseSendGridRateLimit(response.status, response.headers);
      if (rl.limited) return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED" as const, message: "SendGrid rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: "SendGrid rejected the list create request." } };
    },

    async get(input: unknown) {
      const payload = validateListGetInput(input);
      const client = createSendGridClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "lists.get" });
      const response = await client.fetchJSON(`/marketing/lists/${encodeURIComponent(payload.listId)}`);
      if (response.status === 200) {
        const b = isRec(response.body) ? response.body : {};
        return { ok: true as const, list: normalizeList(b) };
      }
      if (response.status === 404) return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: "List not found." } };
      const rl = parseSendGridRateLimit(response.status, response.headers);
      if (rl.limited) return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED" as const, message: "SendGrid rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: "SendGrid rejected the list get request." } };
    },

    async delete(input: unknown) {
      const payload = validateListDeleteInput(input);
      const client = createSendGridClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "lists.delete" });
      const qp = payload.deleteContacts ? "?delete_contacts=true" : "";
      const response = await client.fetchJSON(`/marketing/lists/${encodeURIComponent(payload.listId)}${qp}`, { method: "DELETE" });
      if (response.status === 200 || response.status === 202 || response.status === 204) {
        return { ok: true as const, deleted: true };
      }
      if (response.status === 404) return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: "List not found." } };
      const rl = parseSendGridRateLimit(response.status, response.headers);
      if (rl.limited) return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED" as const, message: "SendGrid rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: "SendGrid rejected the list delete request." } };
    },
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function requireString(v: unknown, f: string): string {
  if (typeof v !== "string" || !v.length) throw new Error(`${f} is required`);
  return v;
}
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function isRec(v: unknown): v is Record<string, unknown> { return isRecord(v); }
