import { createGraphClient, parseGraphRateLimit, type GraphClient } from "./http";

export type Contact = {
  id: string;
  displayName?: string;
  givenName?: string;
  surname?: string;
  emailAddresses?: { address?: string; name?: string }[];
  mobilePhone?: string;
  businessPhones?: string[];
  jobTitle?: string;
  companyName?: string;
  [key: string]: unknown;
};

export type NormalizedContact = {
  id: string;
  provider: "microsoft-365";
  providerContactId: string;
  displayName: string;
  givenName: string;
  surname: string;
  email: string;
  mobilePhone: string;
  jobTitle: string;
  companyName: string;
  modelVersion: "2026-05-16";
  raw: Contact;
};

export function normalizeContact(contact: Contact): NormalizedContact {
  return {
    id: `outlook:${contact.id}`,
    provider: "microsoft-365",
    providerContactId: contact.id,
    displayName: contact.displayName ?? "",
    givenName: contact.givenName ?? "",
    surname: contact.surname ?? "",
    email: contact.emailAddresses?.[0]?.address ?? "",
    mobilePhone: contact.mobilePhone ?? "",
    jobTitle: contact.jobTitle ?? "",
    companyName: contact.companyName ?? "",
    modelVersion: "2026-05-16",
    raw: contact,
  };
}

export function parseContactsResponse(response: unknown): { contacts: Contact[]; nextLink: string | null } {
  if (!isRecord(response)) return { contacts: [], nextLink: null };
  const value = response.value;
  if (!Array.isArray(value)) return { contacts: [], nextLink: null };
  return {
    contacts: value.filter(isRecord).map((c) => ({
      id: requireString(c.id, "id"),
      displayName: typeof c.displayName === "string" ? c.displayName : undefined,
      givenName: typeof c.givenName === "string" ? c.givenName : undefined,
      surname: typeof c.surname === "string" ? c.surname : undefined,
      emailAddresses: Array.isArray(c.emailAddresses) ? c.emailAddresses.filter(isRecord).map((e) => ({ address: typeof e.address === "string" ? e.address : undefined, name: typeof e.name === "string" ? e.name : undefined })) : undefined,
      mobilePhone: typeof c.mobilePhone === "string" ? c.mobilePhone : undefined,
      businessPhones: Array.isArray(c.businessPhones) ? c.businessPhones.filter((p): p is string => typeof p === "string") : undefined,
      jobTitle: typeof c.jobTitle === "string" ? c.jobTitle : undefined,
      companyName: typeof c.companyName === "string" ? c.companyName : undefined,
    })),
    nextLink: parseNextOdataLink(response),
  };
}

// ─── Create Contact ───────────────────────────────────────────────────────────

export type CreateContactInput = {
  givenName: string;
  surname?: string;
  emailAddresses?: string[];
  mobilePhone?: string;
  jobTitle?: string;
  companyName?: string;
};

export function validateCreateContactInput(input: unknown): CreateContactInput {
  if (!isRecord(input)) throw new Error("create contact input must be an object");
  return {
    givenName: requireString(input.givenName, "givenName"),
    surname: typeof input.surname === "string" ? input.surname : undefined,
    emailAddresses: Array.isArray(input.emailAddresses) ? (input.emailAddresses as unknown[]).filter((e): e is string => typeof e === "string") : undefined,
    mobilePhone: typeof input.mobilePhone === "string" ? input.mobilePhone : undefined,
    jobTitle: typeof input.jobTitle === "string" ? input.jobTitle : undefined,
    companyName: typeof input.companyName === "string" ? input.companyName : undefined,
  };
}

// ─── List Contacts ────────────────────────────────────────────────────────────

export type ListContactsInput = Record<string, never>;

export function validateListContactsInput(input: unknown): ListContactsInput {
  if (input !== undefined && !isRecord(input)) throw new Error("list contacts input must be an object or omitted");
  return {};
}

export function createContactsClient(options: { accessToken: string; fetch?: typeof fetch; graphClient?: GraphClient }) {
  const client = options.graphClient ?? createGraphClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "contacts.create" });

  return {
    async create(input: unknown) {
      const payload = validateCreateContactInput(input);
      const body: Record<string, unknown> = { givenName: payload.givenName };
      if (payload.surname) body.surname = payload.surname;
      if (payload.emailAddresses) body.emailAddresses = payload.emailAddresses.map((a) => ({ address: a, name: a }));
      if (payload.mobilePhone) body.mobilePhone = payload.mobilePhone;
      if (payload.jobTitle) body.jobTitle = payload.jobTitle;
      if (payload.companyName) body.companyName = payload.companyName;

      const response = await client.fetchJSON("/v1.0/me/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.status === 201) {
        return { ok: true as const, contact: normalizeContact(response.body as Contact) };
      }
      if (response.status === 429) {
        const rateLimit = parseGraphRateLimit(response.status, response.headers);
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "Graph rate limit exceeded.", retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Graph rejected the create contact request." } };
    },

    async list(_input: unknown) {
      const response = await client.fetchJSON("/v1.0/me/contacts");
      if (response.status === 200) {
        const parsed = parseContactsResponse(response.body);
        return { ok: true as const, contacts: parsed.contacts.map(normalizeContact) };
      }
      if (response.status === 429) {
        const rateLimit = parseGraphRateLimit(response.status, response.headers);
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "Graph rate limit exceeded.", retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Graph rejected the list contacts request." } };
    },
  };
}

function parseNextOdataLink(response: Record<string, unknown>): string | null {
  const link = response["@odata.nextLink"];
  return typeof link === "string" && link.length > 0 ? link : null;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
