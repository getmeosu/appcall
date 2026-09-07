import { createApolloClient, parseApolloRateLimit, isRecord } from "./http";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function optString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function optNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function optBool(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function optStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((v): v is string => typeof v === "string");
}

type ConnectorError = { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } };

// apolloErrorDetail pulls a human-readable reason out of Apollo's error response
// body. Apollo returns either JSON ({"error":"..."} or {"errors":[...]}) or, for
// some auth failures, a plain-text string. Returns "" when nothing usable found.
function apolloErrorDetail(body: unknown): string {
  if (typeof body === "string") return body.trim();
  if (isRecord(body)) {
    const reason = body.error ?? body.message ?? body.errors;
    if (typeof reason === "string") return reason.trim();
    if (Array.isArray(reason)) return reason.filter((r): r is string => typeof r === "string").join("; ");
  }
  return "";
}

function handleError(status: number, headers: Record<string, string>, body: unknown, fallbackMessage: string): ConnectorError {
  const rl = parseApolloRateLimit(status, headers);
  if (rl.limited) {
    return { ok: false, error: { code: "CONNECTOR_RATE_LIMITED", message: "Apollo rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
  }
  // Preserve the upstream HTTP status and Apollo's own reason so the failure is
  // self-diagnosing (e.g. 401 invalid key vs 422 missing key) instead of generic.
  const detail = apolloErrorDetail(body);
  const message = detail
    ? `${fallbackMessage} (HTTP ${status}): ${detail}`
    : `${fallbackMessage} (HTTP ${status}).`;
  return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message } };
}

function throwIfError(result: ConnectorError): never {
  throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
}

// ─── people.search ────────────────────────────────────────────────────────────

export type PeopleSearchInput = {
  q_keywords?: string;
  person_titles?: string[];
  person_seniorities?: string[];
  person_locations?: string[];
  organization_domains?: string[];
  organization_num_employees_ranges?: string[];
  page?: number;
  per_page?: number;
};

export function validatePeopleSearchInput(input: unknown): PeopleSearchInput {
  if (!isRecord(input)) throw new Error("people.search input must be an object");
  return {
    q_keywords: optString(input.q_keywords),
    person_titles: optStringArray(input.person_titles),
    person_seniorities: optStringArray(input.person_seniorities),
    person_locations: optStringArray(input.person_locations),
    organization_domains: optStringArray(input.organization_domains),
    organization_num_employees_ranges: optStringArray(input.organization_num_employees_ranges),
    page: optNumber(input.page),
    per_page: optNumber(input.per_page),
  };
}

export function createPeopleClient(options: { apiKey: string; fetch?: typeof fetch }) {
  const client = createApolloClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "people.search" });
  return {
    async search(input: unknown) {
      const payload = validatePeopleSearchInput(input);
      const body: Record<string, unknown> = {};
      if (payload.q_keywords) body.q_keywords = payload.q_keywords;
      if (payload.person_titles) body.person_titles = payload.person_titles;
      if (payload.person_seniorities) body.person_seniorities = payload.person_seniorities;
      if (payload.person_locations) body.person_locations = payload.person_locations;
      if (payload.organization_domains) body.organization_domains = payload.organization_domains;
      if (payload.organization_num_employees_ranges) body.organization_num_employees_ranges = payload.organization_num_employees_ranges;
      if (payload.page !== undefined) body.page = payload.page;
      if (payload.per_page !== undefined) body.per_page = payload.per_page;
      // Apollo deprecated /mixed_people/search for API callers (HTTP 422). The
      // people-search API endpoint is /mixed_people/api_search.
      // https://docs.apollo.io/reference/people-api-search
      const response = await client.fetchJSON("/api/v1/mixed_people/api_search", { method: "POST", body: JSON.stringify(body) });
      if (response.status === 200) {
        const b = response.body as Record<string, unknown>;
        const people = Array.isArray(b.people) ? b.people : [];
        return { ok: true as const, people, pagination: isRecord(b.pagination) ? b.pagination : {} };
      }
      return handleError(response.status, response.headers, response.body, "Apollo rejected the people.search request.");
    },
  };
}

export function searchPeople(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createPeopleClient({
      apiKey: input.apiKey,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).search(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "apollo", action: "people.search", source: "connector", people: result.people, pagination: result.pagination };
    });
  }
  return { connector: "apollo", action: "people.search", source: "connector", validated: validatePeopleSearchInput(input) };
}

// ─── people.match ─────────────────────────────────────────────────────────────

export type PeopleMatchInput = {
  id?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  domain?: string;
  organization_name?: string;
  linkedin_url?: string;
  reveal_personal_emails?: boolean;
  reveal_phone_number?: boolean;
  // webhook_url is injected server-side (by the Go control plane) when a phone
  // reveal is requested; Apollo POSTs the revealed number to it asynchronously.
  // It is never set by the end caller — see internal/actions/service.go.
  webhook_url?: string;
};

export function validatePeopleMatchInput(input: unknown): PeopleMatchInput {
  if (!isRecord(input)) throw new Error("people.match input must be an object");
  return {
    id: optString(input.id),
    first_name: optString(input.first_name),
    last_name: optString(input.last_name),
    email: optString(input.email),
    domain: optString(input.domain),
    organization_name: optString(input.organization_name),
    linkedin_url: optString(input.linkedin_url),
    reveal_personal_emails: optBool(input.reveal_personal_emails),
    reveal_phone_number: optBool(input.reveal_phone_number),
    webhook_url: optString(input.webhook_url),
  };
}

export function createPeopleMatchClient(options: { apiKey: string; fetch?: typeof fetch }) {
  const client = createApolloClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "people.match" });
  return {
    async match(input: unknown) {
      const payload = validatePeopleMatchInput(input);
      const body: Record<string, unknown> = {};
      if (payload.id) body.id = payload.id;
      if (payload.first_name) body.first_name = payload.first_name;
      if (payload.last_name) body.last_name = payload.last_name;
      if (payload.email) body.email = payload.email;
      if (payload.domain) body.domain = payload.domain;
      if (payload.organization_name) body.organization_name = payload.organization_name;
      if (payload.linkedin_url) body.linkedin_url = payload.linkedin_url;
      if (payload.reveal_personal_emails !== undefined) body.reveal_personal_emails = payload.reveal_personal_emails;
      if (payload.reveal_phone_number !== undefined) body.reveal_phone_number = payload.reveal_phone_number;
      // Apollo requires a webhook_url whenever reveal_phone_number is set (it
      // returns HTTP 400 otherwise). The URL is supplied server-side by the Go
      // control plane, never by the caller.
      if (payload.webhook_url) body.webhook_url = payload.webhook_url;
      const response = await client.fetchJSON("/api/v1/people/match", { method: "POST", body: JSON.stringify(body) });
      if (response.status === 200) {
        const b = response.body as Record<string, unknown>;
        return { ok: true as const, person: isRecord(b.person) ? b.person : b };
      }
      return handleError(response.status, response.headers, response.body, "Apollo rejected the people.match request.");
    },
  };
}

export function matchPerson(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createPeopleMatchClient({
      apiKey: input.apiKey,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).match(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "apollo", action: "people.match", source: "connector", person: result.person };
    });
  }
  return { connector: "apollo", action: "people.match", source: "connector", validated: validatePeopleMatchInput(input) };
}

// ─── people.bulk_match ────────────────────────────────────────────────────────

export type PeopleBulkMatchInput = { details: Record<string, unknown>[] };

export function validatePeopleBulkMatchInput(input: unknown): PeopleBulkMatchInput {
  if (!isRecord(input)) throw new Error("people.bulk_match input must be an object");
  if (!Array.isArray(input.details)) throw new Error("details is required");
  return { details: input.details.filter(isRecord) };
}

export function createPeopleBulkMatchClient(options: { apiKey: string; fetch?: typeof fetch }) {
  const client = createApolloClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "people.bulk_match" });
  return {
    async bulkMatch(input: unknown) {
      const payload = validatePeopleBulkMatchInput(input);
      const response = await client.fetchJSON("/api/v1/people/bulk_match", { method: "POST", body: JSON.stringify({ details: payload.details }) });
      if (response.status === 200) {
        const b = response.body as Record<string, unknown>;
        const matches = Array.isArray(b.matches) ? b.matches : Array.isArray(b.people) ? b.people : [];
        return { ok: true as const, matches };
      }
      return handleError(response.status, response.headers, response.body, "Apollo rejected the people.bulk_match request.");
    },
  };
}

export function bulkMatchPeople(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createPeopleBulkMatchClient({
      apiKey: input.apiKey,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).bulkMatch(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "apollo", action: "people.bulk_match", source: "connector", matches: result.matches };
    });
  }
  return { connector: "apollo", action: "people.bulk_match", source: "connector", validated: validatePeopleBulkMatchInput(input) };
}

// ─── organizations.search ────────────────────────────────────────────────────

export type OrganizationsSearchInput = {
  q_organization_name?: string;
  organization_locations?: string[];
  organization_num_employees_ranges?: string[];
  page?: number;
  per_page?: number;
};

export function validateOrganizationsSearchInput(input: unknown): OrganizationsSearchInput {
  if (!isRecord(input)) throw new Error("organizations.search input must be an object");
  return {
    q_organization_name: optString(input.q_organization_name),
    organization_locations: optStringArray(input.organization_locations),
    organization_num_employees_ranges: optStringArray(input.organization_num_employees_ranges),
    page: optNumber(input.page),
    per_page: optNumber(input.per_page),
  };
}

export function createOrganizationsSearchClient(options: { apiKey: string; fetch?: typeof fetch }) {
  const client = createApolloClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "organizations.search" });
  return {
    async search(input: unknown) {
      const payload = validateOrganizationsSearchInput(input);
      const body: Record<string, unknown> = {};
      if (payload.q_organization_name) body.q_organization_name = payload.q_organization_name;
      if (payload.organization_locations) body.organization_locations = payload.organization_locations;
      if (payload.organization_num_employees_ranges) body.organization_num_employees_ranges = payload.organization_num_employees_ranges;
      if (payload.page !== undefined) body.page = payload.page;
      if (payload.per_page !== undefined) body.per_page = payload.per_page;
      const response = await client.fetchJSON("/api/v1/mixed_companies/search", { method: "POST", body: JSON.stringify(body) });
      if (response.status === 200) {
        const b = response.body as Record<string, unknown>;
        const organizations = Array.isArray(b.organizations) ? b.organizations : [];
        return { ok: true as const, organizations, pagination: isRecord(b.pagination) ? b.pagination : {} };
      }
      return handleError(response.status, response.headers, response.body, "Apollo rejected the organizations.search request.");
    },
  };
}

export function searchOrganizations(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createOrganizationsSearchClient({
      apiKey: input.apiKey,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).search(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "apollo", action: "organizations.search", source: "connector", organizations: result.organizations, pagination: result.pagination };
    });
  }
  return { connector: "apollo", action: "organizations.search", source: "connector", validated: validateOrganizationsSearchInput(input) };
}

// ─── organizations.enrich ─────────────────────────────────────────────────────

export type OrganizationsEnrichInput = { domain: string };

export function validateOrganizationsEnrichInput(input: unknown): OrganizationsEnrichInput {
  if (!isRecord(input)) throw new Error("organizations.enrich input must be an object");
  return { domain: requireString(input.domain, "domain") };
}

export function createOrganizationsEnrichClient(options: { apiKey: string; fetch?: typeof fetch }) {
  const client = createApolloClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "organizations.enrich" });
  return {
    async enrich(input: unknown) {
      const payload = validateOrganizationsEnrichInput(input);
      const params = new URLSearchParams({ domain: payload.domain });
      const response = await client.fetchJSON(`/api/v1/organizations/enrich?${params.toString()}`);
      if (response.status === 200) {
        const b = response.body as Record<string, unknown>;
        const organization = isRecord(b.organization) ? b.organization : b;
        return { ok: true as const, organization };
      }
      return handleError(response.status, response.headers, response.body, "Apollo rejected the organizations.enrich request.");
    },
  };
}

export function enrichOrganization(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createOrganizationsEnrichClient({
      apiKey: input.apiKey,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).enrich(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "apollo", action: "organizations.enrich", source: "connector", organization: result.organization };
    });
  }
  return { connector: "apollo", action: "organizations.enrich", source: "connector", validated: validateOrganizationsEnrichInput(input) };
}

// ─── organizations.bulk_enrich ────────────────────────────────────────────────

export type OrganizationsBulkEnrichInput = { domains: string[] };

export function validateOrganizationsBulkEnrichInput(input: unknown): OrganizationsBulkEnrichInput {
  if (!isRecord(input)) throw new Error("organizations.bulk_enrich input must be an object");
  if (!Array.isArray(input.domains)) throw new Error("domains is required");
  return { domains: input.domains.filter((v): v is string => typeof v === "string") };
}

export function createOrganizationsBulkEnrichClient(options: { apiKey: string; fetch?: typeof fetch }) {
  const client = createApolloClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "organizations.bulk_enrich" });
  return {
    async bulkEnrich(input: unknown) {
      const payload = validateOrganizationsBulkEnrichInput(input);
      const response = await client.fetchJSON("/api/v1/organizations/bulk_enrich", { method: "POST", body: JSON.stringify({ domains: payload.domains }) });
      if (response.status === 200) {
        const b = response.body as Record<string, unknown>;
        const organizations = Array.isArray(b.organizations) ? b.organizations : [];
        return { ok: true as const, organizations };
      }
      return handleError(response.status, response.headers, response.body, "Apollo rejected the organizations.bulk_enrich request.");
    },
  };
}

export function bulkEnrichOrganizations(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createOrganizationsBulkEnrichClient({
      apiKey: input.apiKey,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).bulkEnrich(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "apollo", action: "organizations.bulk_enrich", source: "connector", organizations: result.organizations };
    });
  }
  return { connector: "apollo", action: "organizations.bulk_enrich", source: "connector", validated: validateOrganizationsBulkEnrichInput(input) };
}

// ─── organizations.job_postings ───────────────────────────────────────────────

export type OrganizationsJobPostingsInput = { id: string };

export function validateOrganizationsJobPostingsInput(input: unknown): OrganizationsJobPostingsInput {
  if (!isRecord(input)) throw new Error("organizations.job_postings input must be an object");
  return { id: requireString(input.id, "id") };
}

export function createOrganizationsJobPostingsClient(options: { apiKey: string; fetch?: typeof fetch }) {
  const client = createApolloClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "organizations.job_postings" });
  return {
    async getJobPostings(input: unknown) {
      const payload = validateOrganizationsJobPostingsInput(input);
      const response = await client.fetchJSON(`/api/v1/organizations/${payload.id}/job_postings`);
      if (response.status === 200) {
        const b = response.body as Record<string, unknown>;
        const job_postings = Array.isArray(b.job_postings) ? b.job_postings : [];
        return { ok: true as const, job_postings };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Organization not found." } };
      }
      return handleError(response.status, response.headers, response.body, "Apollo rejected the organizations.job_postings request.");
    },
  };
}

export function getOrganizationJobPostings(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createOrganizationsJobPostingsClient({
      apiKey: input.apiKey,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).getJobPostings(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "apollo", action: "organizations.job_postings", source: "connector", job_postings: result.job_postings };
    });
  }
  return { connector: "apollo", action: "organizations.job_postings", source: "connector", validated: validateOrganizationsJobPostingsInput(input) };
}

// ─── contacts.create ──────────────────────────────────────────────────────────

export type ContactsCreateInput = {
  first_name: string;
  last_name: string;
  email?: string;
  title?: string;
  organization_name?: string;
  website_url?: string;
  direct_phone?: string;
  mobile_phone?: string;
  linkedin_url?: string;
  label_names?: string[];
};

export function validateContactsCreateInput(input: unknown): ContactsCreateInput {
  if (!isRecord(input)) throw new Error("contacts.create input must be an object");
  return {
    first_name: requireString(input.first_name, "first_name"),
    last_name: requireString(input.last_name, "last_name"),
    email: optString(input.email),
    title: optString(input.title),
    organization_name: optString(input.organization_name),
    website_url: optString(input.website_url),
    direct_phone: optString(input.direct_phone),
    mobile_phone: optString(input.mobile_phone),
    linkedin_url: optString(input.linkedin_url),
    label_names: optStringArray(input.label_names),
  };
}

export function createContactsClient(options: { apiKey: string; fetch?: typeof fetch }) {
  const createClient = createApolloClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "contacts.create" });
  const updateClient = createApolloClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "contacts.update" });
  const searchClient = createApolloClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "contacts.search" });
  return {
    async create(input: unknown) {
      const payload = validateContactsCreateInput(input);
      const body: Record<string, unknown> = { first_name: payload.first_name, last_name: payload.last_name };
      if (payload.email) body.email = payload.email;
      if (payload.title) body.title = payload.title;
      if (payload.organization_name) body.organization_name = payload.organization_name;
      if (payload.website_url) body.website_url = payload.website_url;
      if (payload.direct_phone) body.direct_phone = payload.direct_phone;
      if (payload.mobile_phone) body.mobile_phone = payload.mobile_phone;
      if (payload.linkedin_url) body.linkedin_url = payload.linkedin_url;
      if (payload.label_names) body.label_names = payload.label_names;
      const response = await createClient.fetchJSON("/api/v1/contacts", { method: "POST", body: JSON.stringify(body) });
      if (response.status === 200 || response.status === 201) {
        const b = response.body as Record<string, unknown>;
        const contact = isRecord(b.contact) ? b.contact : b;
        return { ok: true as const, contact };
      }
      return handleError(response.status, response.headers, response.body, "Apollo rejected the contacts.create request.");
    },

    async update(input: unknown) {
      if (!isRecord(input)) throw new Error("contacts.update input must be an object");
      const id = requireString(input.id, "id");
      const body: Record<string, unknown> = {};
      if (optString(input.first_name)) body.first_name = input.first_name;
      if (optString(input.last_name)) body.last_name = input.last_name;
      if (optString(input.email)) body.email = input.email;
      if (optString(input.title)) body.title = input.title;
      if (optString(input.organization_name)) body.organization_name = input.organization_name;
      if (optString(input.direct_phone)) body.direct_phone = input.direct_phone;
      if (optString(input.mobile_phone)) body.mobile_phone = input.mobile_phone;
      if (optString(input.linkedin_url)) body.linkedin_url = input.linkedin_url;
      if (optStringArray(input.label_names)) body.label_names = input.label_names;
      const response = await updateClient.fetchJSON(`/api/v1/contacts/${id}`, { method: "PUT", body: JSON.stringify(body) });
      if (response.status === 200) {
        const b = response.body as Record<string, unknown>;
        const contact = isRecord(b.contact) ? b.contact : b;
        return { ok: true as const, contact };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Contact not found." } };
      }
      return handleError(response.status, response.headers, response.body, "Apollo rejected the contacts.update request.");
    },

    async search(input: unknown) {
      if (!isRecord(input)) throw new Error("contacts.search input must be an object");
      const body: Record<string, unknown> = {};
      if (optString(input.q_keywords)) body.q_keywords = input.q_keywords;
      if (optString(input.email)) body.email = input.email;
      if (optNumber(input.page) !== undefined) body.page = input.page;
      if (optNumber(input.per_page) !== undefined) body.per_page = input.per_page;
      const response = await searchClient.fetchJSON("/api/v1/contacts/search", { method: "POST", body: JSON.stringify(body) });
      if (response.status === 200) {
        const b = response.body as Record<string, unknown>;
        const contacts = Array.isArray(b.contacts) ? b.contacts : [];
        return { ok: true as const, contacts, pagination: isRecord(b.pagination) ? b.pagination : {} };
      }
      return handleError(response.status, response.headers, response.body, "Apollo rejected the contacts.search request.");
    },
  };
}

export function validateContactsUpdateInput(input: unknown): { id: string } {
  if (!isRecord(input)) throw new Error("contacts.update input must be an object");
  return { id: requireString(input.id, "id") };
}

export function validateContactsSearchInput(input: unknown): Record<string, unknown> {
  if (!isRecord(input)) throw new Error("contacts.search input must be an object");
  return {};
}

export function createContact(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createContactsClient({
      apiKey: input.apiKey,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).create(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "apollo", action: "contacts.create", source: "connector", contact: result.contact };
    });
  }
  return { connector: "apollo", action: "contacts.create", source: "connector", validated: validateContactsCreateInput(input) };
}

export function updateContact(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createContactsClient({
      apiKey: input.apiKey,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).update(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "apollo", action: "contacts.update", source: "connector", contact: result.contact };
    });
  }
  return { connector: "apollo", action: "contacts.update", source: "connector", validated: validateContactsUpdateInput(input) };
}

export function searchContacts(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createContactsClient({
      apiKey: input.apiKey,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).search(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "apollo", action: "contacts.search", source: "connector", contacts: result.contacts, pagination: result.pagination };
    });
  }
  return { connector: "apollo", action: "contacts.search", source: "connector", validated: validateContactsSearchInput(input) };
}

// ─── accounts.create / accounts.update ───────────────────────────────────────

export type AccountsCreateInput = {
  name: string;
  domain?: string;
  phone_number?: string;
  raw_address?: string;
  linkedin_url?: string;
  website_url?: string;
  num_employees?: number;
  industry?: string;
  label_names?: string[];
};

export function validateAccountsCreateInput(input: unknown): AccountsCreateInput {
  if (!isRecord(input)) throw new Error("accounts.create input must be an object");
  return {
    name: requireString(input.name, "name"),
    domain: optString(input.domain),
    phone_number: optString(input.phone_number),
    raw_address: optString(input.raw_address),
    linkedin_url: optString(input.linkedin_url),
    website_url: optString(input.website_url),
    num_employees: optNumber(input.num_employees),
    industry: optString(input.industry),
    label_names: optStringArray(input.label_names),
  };
}

export function validateAccountsUpdateInput(input: unknown): { id: string } {
  if (!isRecord(input)) throw new Error("accounts.update input must be an object");
  return { id: requireString(input.id, "id") };
}

export function createAccountsClient(options: { apiKey: string; fetch?: typeof fetch }) {
  const createClient = createApolloClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "accounts.create" });
  const updateClient = createApolloClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "accounts.update" });
  return {
    async create(input: unknown) {
      const payload = validateAccountsCreateInput(input);
      const body: Record<string, unknown> = { name: payload.name };
      if (payload.domain) body.domain = payload.domain;
      if (payload.phone_number) body.phone_number = payload.phone_number;
      if (payload.raw_address) body.raw_address = payload.raw_address;
      if (payload.linkedin_url) body.linkedin_url = payload.linkedin_url;
      if (payload.website_url) body.website_url = payload.website_url;
      if (payload.num_employees !== undefined) body.num_employees = payload.num_employees;
      if (payload.industry) body.industry = payload.industry;
      if (payload.label_names) body.label_names = payload.label_names;
      const response = await createClient.fetchJSON("/api/v1/accounts", { method: "POST", body: JSON.stringify(body) });
      if (response.status === 200 || response.status === 201) {
        const b = response.body as Record<string, unknown>;
        const account = isRecord(b.account) ? b.account : b;
        return { ok: true as const, account };
      }
      return handleError(response.status, response.headers, response.body, "Apollo rejected the accounts.create request.");
    },

    async update(input: unknown) {
      if (!isRecord(input)) throw new Error("accounts.update input must be an object");
      const id = requireString(input.id, "id");
      const body: Record<string, unknown> = {};
      if (optString(input.name)) body.name = input.name;
      if (optString(input.domain)) body.domain = input.domain;
      if (optString(input.phone_number)) body.phone_number = input.phone_number;
      if (optString(input.raw_address)) body.raw_address = input.raw_address;
      if (optString(input.linkedin_url)) body.linkedin_url = input.linkedin_url;
      if (optString(input.website_url)) body.website_url = input.website_url;
      if (optNumber(input.num_employees) !== undefined) body.num_employees = input.num_employees;
      if (optString(input.industry)) body.industry = input.industry;
      const response = await updateClient.fetchJSON(`/api/v1/accounts/${id}`, { method: "PUT", body: JSON.stringify(body) });
      if (response.status === 200) {
        const b = response.body as Record<string, unknown>;
        const account = isRecord(b.account) ? b.account : b;
        return { ok: true as const, account };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Account not found." } };
      }
      return handleError(response.status, response.headers, response.body, "Apollo rejected the accounts.update request.");
    },
  };
}

export function createAccount(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createAccountsClient({
      apiKey: input.apiKey,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).create(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "apollo", action: "accounts.create", source: "connector", account: result.account };
    });
  }
  return { connector: "apollo", action: "accounts.create", source: "connector", validated: validateAccountsCreateInput(input) };
}

export function updateAccount(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createAccountsClient({
      apiKey: input.apiKey,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).update(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "apollo", action: "accounts.update", source: "connector", account: result.account };
    });
  }
  return { connector: "apollo", action: "accounts.update", source: "connector", validated: validateAccountsUpdateInput(input) };
}

// ─── sequences.search ─────────────────────────────────────────────────────────

export type SequencesSearchInput = { q_keywords?: string; active?: boolean; page?: number; per_page?: number };

export function validateSequencesSearchInput(input: unknown): SequencesSearchInput {
  if (!isRecord(input)) throw new Error("sequences.search input must be an object");
  return {
    q_keywords: optString(input.q_keywords),
    active: optBool(input.active),
    page: optNumber(input.page),
    per_page: optNumber(input.per_page),
  };
}

export function createSequencesClient(options: { apiKey: string; fetch?: typeof fetch }) {
  const searchClient = createApolloClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "sequences.search" });
  const addContactsClient = createApolloClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "sequences.add_contacts" });
  return {
    async search(input: unknown) {
      const payload = validateSequencesSearchInput(input);
      const body: Record<string, unknown> = {};
      if (payload.q_keywords) body.q_keywords = payload.q_keywords;
      if (payload.active !== undefined) body.active = payload.active;
      if (payload.page !== undefined) body.page = payload.page;
      if (payload.per_page !== undefined) body.per_page = payload.per_page;
      const response = await searchClient.fetchJSON("/api/v1/emailer_campaigns/search", { method: "POST", body: JSON.stringify(body) });
      if (response.status === 200) {
        const b = response.body as Record<string, unknown>;
        const sequences = Array.isArray(b.emailer_campaigns) ? b.emailer_campaigns : [];
        return { ok: true as const, sequences, pagination: isRecord(b.pagination) ? b.pagination : {} };
      }
      return handleError(response.status, response.headers, response.body, "Apollo rejected the sequences.search request.");
    },

    async addContacts(input: unknown) {
      if (!isRecord(input)) throw new Error("sequences.add_contacts input must be an object");
      const emailer_campaign_id = requireString(input.emailer_campaign_id, "emailer_campaign_id");
      if (!Array.isArray(input.contact_ids)) throw new Error("contact_ids is required");
      const contact_ids = input.contact_ids.filter((v): v is string => typeof v === "string");
      const body: Record<string, unknown> = { emailer_campaign_id, contact_ids };
      if (optString(input.send_email_from_email_account_id)) body.send_email_from_email_account_id = input.send_email_from_email_account_id;
      const response = await addContactsClient.fetchJSON(`/api/v1/emailer_campaigns/${emailer_campaign_id}/add_contact_ids`, { method: "POST", body: JSON.stringify(body) });
      if (response.status === 200) {
        const b = response.body as Record<string, unknown>;
        const contacts = Array.isArray(b.contacts) ? b.contacts : [];
        return { ok: true as const, contacts };
      }
      return handleError(response.status, response.headers, response.body, "Apollo rejected the sequences.add_contacts request.");
    },
  };
}

export function validateSequencesAddContactsInput(input: unknown): { emailer_campaign_id: string; contact_ids: string[] } {
  if (!isRecord(input)) throw new Error("sequences.add_contacts input must be an object");
  const emailer_campaign_id = requireString(input.emailer_campaign_id, "emailer_campaign_id");
  if (!Array.isArray(input.contact_ids)) throw new Error("contact_ids is required");
  return { emailer_campaign_id, contact_ids: input.contact_ids.filter((v): v is string => typeof v === "string") };
}

export function searchSequences(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createSequencesClient({
      apiKey: input.apiKey,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).search(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "apollo", action: "sequences.search", source: "connector", sequences: result.sequences, pagination: result.pagination };
    });
  }
  return { connector: "apollo", action: "sequences.search", source: "connector", validated: validateSequencesSearchInput(input) };
}

export function addContactsToSequence(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createSequencesClient({
      apiKey: input.apiKey,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).addContacts(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "apollo", action: "sequences.add_contacts", source: "connector", contacts: result.contacts };
    });
  }
  return { connector: "apollo", action: "sequences.add_contacts", source: "connector", validated: validateSequencesAddContactsInput(input) };
}

// ─── email_accounts.list ──────────────────────────────────────────────────────

export function validateEmailAccountsListInput(input: unknown): Record<string, never> {
  if (!isRecord(input)) throw new Error("email_accounts.list input must be an object");
  return {};
}

export function createEmailAccountsClient(options: { apiKey: string; fetch?: typeof fetch }) {
  const client = createApolloClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "email_accounts.list" });
  return {
    async list() {
      const response = await client.fetchJSON("/api/v1/email_accounts");
      if (response.status === 200) {
        const b = response.body as Record<string, unknown>;
        const email_accounts = Array.isArray(b.email_accounts) ? b.email_accounts : [];
        return { ok: true as const, email_accounts };
      }
      return handleError(response.status, response.headers, response.body, "Apollo rejected the email_accounts.list request.");
    },
  };
}

export function listEmailAccounts(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createEmailAccountsClient({
      apiKey: input.apiKey,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).list().then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "apollo", action: "email_accounts.list", source: "connector", email_accounts: result.email_accounts };
    });
  }
  return { connector: "apollo", action: "email_accounts.list", source: "connector", validated: validateEmailAccountsListInput(input) };
}

// ─── users.search ─────────────────────────────────────────────────────────────

export type UsersSearchInput = { q_keywords?: string; page?: number; per_page?: number };

export function validateUsersSearchInput(input: unknown): UsersSearchInput {
  if (!isRecord(input)) throw new Error("users.search input must be an object");
  return {
    q_keywords: optString(input.q_keywords),
    page: optNumber(input.page),
    per_page: optNumber(input.per_page),
  };
}

export function createUsersSearchClient(options: { apiKey: string; fetch?: typeof fetch }) {
  const client = createApolloClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "users.search" });
  return {
    async search(input: unknown) {
      const payload = validateUsersSearchInput(input);
      const params = new URLSearchParams();
      if (payload.q_keywords) params.set("q_keywords", payload.q_keywords);
      if (payload.page !== undefined) params.set("page", String(payload.page));
      if (payload.per_page !== undefined) params.set("per_page", String(payload.per_page));
      const query = params.toString();
      const response = await client.fetchJSON(`/api/v1/users/search${query ? `?${query}` : ""}`);
      if (response.status === 200) {
        const b = response.body as Record<string, unknown>;
        const users = Array.isArray(b.users) ? b.users : [];
        return { ok: true as const, users, pagination: isRecord(b.pagination) ? b.pagination : {} };
      }
      return handleError(response.status, response.headers, response.body, "Apollo rejected the users.search request.");
    },
  };
}

export function searchUsers(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createUsersSearchClient({
      apiKey: input.apiKey,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).search(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "apollo", action: "users.search", source: "connector", users: result.users, pagination: result.pagination };
    });
  }
  return { connector: "apollo", action: "users.search", source: "connector", validated: validateUsersSearchInput(input) };
}
