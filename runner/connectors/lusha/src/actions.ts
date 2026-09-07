import { createLushaClient, parseLushaRateLimit, isRecord } from "./http";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function requireArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${field} is required and must be an array`);
  return value;
}

function handleError(status: number, headers: Record<string, string>, fallbackMessage: string): { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } } {
  const rl = parseLushaRateLimit(status, headers);
  if (rl.limited) {
    return { ok: false, error: { code: "CONNECTOR_RATE_LIMITED", message: "Lusha rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
  }
  return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: fallbackMessage } };
}

function throwIfError(result: { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } }): never {
  throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
}

// ─── person.enrich ────────────────────────────────────────────────────────────

export type PersonEnrichInput = {
  email?: string;
  linkedinUrl?: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  companyDomain?: string;
};

export function validatePersonEnrichInput(input: unknown): PersonEnrichInput {
  if (!isRecord(input)) throw new Error("person.enrich input must be an object");
  return {
    email: typeof input.email === "string" ? input.email : undefined,
    linkedinUrl: typeof input.linkedinUrl === "string" ? input.linkedinUrl : undefined,
    firstName: typeof input.firstName === "string" ? input.firstName : undefined,
    lastName: typeof input.lastName === "string" ? input.lastName : undefined,
    companyName: typeof input.companyName === "string" ? input.companyName : undefined,
    companyDomain: typeof input.companyDomain === "string" ? input.companyDomain : undefined,
  };
}

export function createPersonEnrichClient(options: { apiKey: string; fetch?: typeof fetch }) {
  const client = createLushaClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "person.enrich" });
  return {
    async enrich(input: unknown) {
      const payload = validatePersonEnrichInput(input);
      const params = new URLSearchParams();
      if (payload.email) params.set("email", payload.email);
      if (payload.linkedinUrl) params.set("linkedinUrl", payload.linkedinUrl);
      if (payload.firstName) params.set("firstName", payload.firstName);
      if (payload.lastName) params.set("lastName", payload.lastName);
      if (payload.companyName) params.set("companyName", payload.companyName);
      if (payload.companyDomain) params.set("companyDomain", payload.companyDomain);
      const query = params.toString();
      const response = await client.fetchJSON(`/v2/person${query ? `?${query}` : ""}`);
      if (response.status === 200) {
        return { ok: true as const, person: response.body };
      }
      return handleError(response.status, response.headers, "Lusha rejected the person.enrich request.");
    },
  };
}

export function enrichPerson(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createPersonEnrichClient({
      apiKey: input.apiKey,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).enrich(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "lusha", action: "person.enrich", source: "connector", person: result.person };
    });
  }
  return { connector: "lusha", action: "person.enrich", source: "connector", validated: validatePersonEnrichInput(input) };
}

// ─── company.enrich ───────────────────────────────────────────────────────────

export type CompanyEnrichInput = { domain?: string; companyName?: string };

export function validateCompanyEnrichInput(input: unknown): CompanyEnrichInput {
  if (!isRecord(input)) throw new Error("company.enrich input must be an object");
  return {
    domain: typeof input.domain === "string" ? input.domain : undefined,
    companyName: typeof input.companyName === "string" ? input.companyName : undefined,
  };
}

export function createCompanyEnrichClient(options: { apiKey: string; fetch?: typeof fetch }) {
  const client = createLushaClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "company.enrich" });
  return {
    async enrich(input: unknown) {
      const payload = validateCompanyEnrichInput(input);
      const params = new URLSearchParams();
      if (payload.domain) params.set("domain", payload.domain);
      if (payload.companyName) params.set("companyName", payload.companyName);
      const query = params.toString();
      const response = await client.fetchJSON(`/v2/company${query ? `?${query}` : ""}`);
      if (response.status === 200) {
        return { ok: true as const, company: response.body };
      }
      return handleError(response.status, response.headers, "Lusha rejected the company.enrich request.");
    },
  };
}

export function enrichCompany(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createCompanyEnrichClient({
      apiKey: input.apiKey,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).enrich(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "lusha", action: "company.enrich", source: "connector", company: result.company };
    });
  }
  return { connector: "lusha", action: "company.enrich", source: "connector", validated: validateCompanyEnrichInput(input) };
}

// ─── prospecting.contact.search ───────────────────────────────────────────────

export type ProspectingContactSearchInput = {
  name?: string;
  jobTitles?: string[];
  seniorities?: string[];
  departments?: string[];
  locations?: string[];
  companyDomains?: string[];
  companySizes?: string[];
  page?: number;
  size?: number;
};

export function validateProspectingContactSearchInput(input: unknown): ProspectingContactSearchInput {
  if (!isRecord(input)) throw new Error("prospecting.contact.search input must be an object");
  const payload: ProspectingContactSearchInput = {};
  if (typeof input.name === "string") payload.name = input.name;
  if (Array.isArray(input.jobTitles)) payload.jobTitles = input.jobTitles as string[];
  if (Array.isArray(input.seniorities)) payload.seniorities = input.seniorities as string[];
  if (Array.isArray(input.departments)) payload.departments = input.departments as string[];
  if (Array.isArray(input.locations)) payload.locations = input.locations as string[];
  if (Array.isArray(input.companyDomains)) payload.companyDomains = input.companyDomains as string[];
  if (Array.isArray(input.companySizes)) payload.companySizes = input.companySizes as string[];
  if (typeof input.page === "number") payload.page = input.page;
  if (typeof input.size === "number") payload.size = input.size;
  return payload;
}

export function createProspectingContactSearchClient(options: { apiKey: string; fetch?: typeof fetch }) {
  const client = createLushaClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "prospecting.contact.search" });
  return {
    async search(input: unknown) {
      const payload = validateProspectingContactSearchInput(input);
      const body: Record<string, unknown> = {};
      if (payload.name) body.name = payload.name;
      if (payload.jobTitles?.length) body.jobTitles = payload.jobTitles;
      if (payload.seniorities?.length) body.seniorities = payload.seniorities;
      if (payload.departments?.length) body.departments = payload.departments;
      if (payload.locations?.length) body.locations = payload.locations;
      if (payload.companyDomains?.length) body.companyDomains = payload.companyDomains;
      if (payload.companySizes?.length) body.companySizes = payload.companySizes;
      if (payload.page !== undefined || payload.size !== undefined) {
        body.pages = {};
        if (payload.page !== undefined) (body.pages as Record<string, unknown>).page = payload.page;
        if (payload.size !== undefined) (body.pages as Record<string, unknown>).size = payload.size;
      }
      const response = await client.fetchJSON("/prospecting/contact/search", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (response.status === 200) {
        const respBody = isRecord(response.body) ? response.body : {};
        const contacts = Array.isArray(respBody.contacts) ? respBody.contacts : [];
        const requestId = typeof respBody.requestId === "string" ? respBody.requestId : "";
        const totalResults = typeof respBody.totalResults === "number" ? respBody.totalResults : 0;
        return { ok: true as const, requestId, contacts, totalResults };
      }
      return handleError(response.status, response.headers, "Lusha rejected the prospecting.contact.search request.");
    },
  };
}

export function searchProspectingContacts(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createProspectingContactSearchClient({
      apiKey: input.apiKey,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).search(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "lusha", action: "prospecting.contact.search", source: "connector", requestId: result.requestId, contacts: result.contacts, totalResults: result.totalResults };
    });
  }
  return { connector: "lusha", action: "prospecting.contact.search", source: "connector", validated: validateProspectingContactSearchInput(input) };
}

// ─── prospecting.contact.enrich ───────────────────────────────────────────────

export type ProspectingContactEnrichInput = { requestId: string; contactIds: string[] };

export function validateProspectingContactEnrichInput(input: unknown): ProspectingContactEnrichInput {
  if (!isRecord(input)) throw new Error("prospecting.contact.enrich input must be an object");
  return {
    requestId: requireString(input.requestId, "requestId"),
    contactIds: requireArray(input.contactIds, "contactIds") as string[],
  };
}

export function createProspectingContactEnrichClient(options: { apiKey: string; fetch?: typeof fetch }) {
  const client = createLushaClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "prospecting.contact.enrich" });
  return {
    async enrich(input: unknown) {
      const payload = validateProspectingContactEnrichInput(input);
      const response = await client.fetchJSON("/prospecting/contact/enrich", {
        method: "POST",
        body: JSON.stringify({ requestId: payload.requestId, contactIds: payload.contactIds }),
      });
      if (response.status === 200) {
        const respBody = isRecord(response.body) ? response.body : {};
        const contacts = Array.isArray(respBody.contacts) ? respBody.contacts : [];
        return { ok: true as const, contacts };
      }
      return handleError(response.status, response.headers, "Lusha rejected the prospecting.contact.enrich request.");
    },
  };
}

export function enrichProspectingContacts(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createProspectingContactEnrichClient({
      apiKey: input.apiKey,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).enrich(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "lusha", action: "prospecting.contact.enrich", source: "connector", contacts: result.contacts };
    });
  }
  return { connector: "lusha", action: "prospecting.contact.enrich", source: "connector", validated: validateProspectingContactEnrichInput(input) };
}

// ─── prospecting.company.search ───────────────────────────────────────────────

export type ProspectingCompanySearchInput = {
  name?: string;
  domains?: string[];
  sizes?: string[];
  industries?: string[];
  locations?: string[];
  page?: number;
  size?: number;
};

export function validateProspectingCompanySearchInput(input: unknown): ProspectingCompanySearchInput {
  if (!isRecord(input)) throw new Error("prospecting.company.search input must be an object");
  const payload: ProspectingCompanySearchInput = {};
  if (typeof input.name === "string") payload.name = input.name;
  if (Array.isArray(input.domains)) payload.domains = input.domains as string[];
  if (Array.isArray(input.sizes)) payload.sizes = input.sizes as string[];
  if (Array.isArray(input.industries)) payload.industries = input.industries as string[];
  if (Array.isArray(input.locations)) payload.locations = input.locations as string[];
  if (typeof input.page === "number") payload.page = input.page;
  if (typeof input.size === "number") payload.size = input.size;
  return payload;
}

export function createProspectingCompanySearchClient(options: { apiKey: string; fetch?: typeof fetch }) {
  const client = createLushaClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "prospecting.company.search" });
  return {
    async search(input: unknown) {
      const payload = validateProspectingCompanySearchInput(input);
      const body: Record<string, unknown> = {};
      if (payload.name) body.name = payload.name;
      if (payload.domains?.length) body.domains = payload.domains;
      if (payload.sizes?.length) body.sizes = payload.sizes;
      if (payload.industries?.length) body.industries = payload.industries;
      if (payload.locations?.length) body.locations = payload.locations;
      if (payload.page !== undefined || payload.size !== undefined) {
        body.pages = {};
        if (payload.page !== undefined) (body.pages as Record<string, unknown>).page = payload.page;
        if (payload.size !== undefined) (body.pages as Record<string, unknown>).size = payload.size;
      }
      const response = await client.fetchJSON("/prospecting/company/search", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (response.status === 200) {
        const respBody = isRecord(response.body) ? response.body : {};
        const companies = Array.isArray(respBody.companies) ? respBody.companies : [];
        const requestId = typeof respBody.requestId === "string" ? respBody.requestId : "";
        const totalResults = typeof respBody.totalResults === "number" ? respBody.totalResults : 0;
        return { ok: true as const, requestId, companies, totalResults };
      }
      return handleError(response.status, response.headers, "Lusha rejected the prospecting.company.search request.");
    },
  };
}

export function searchProspectingCompanies(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createProspectingCompanySearchClient({
      apiKey: input.apiKey,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).search(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "lusha", action: "prospecting.company.search", source: "connector", requestId: result.requestId, companies: result.companies, totalResults: result.totalResults };
    });
  }
  return { connector: "lusha", action: "prospecting.company.search", source: "connector", validated: validateProspectingCompanySearchInput(input) };
}

// ─── prospecting.company.enrich ───────────────────────────────────────────────

export type ProspectingCompanyEnrichInput = { requestId: string; companyIds: string[] };

export function validateProspectingCompanyEnrichInput(input: unknown): ProspectingCompanyEnrichInput {
  if (!isRecord(input)) throw new Error("prospecting.company.enrich input must be an object");
  return {
    requestId: requireString(input.requestId, "requestId"),
    companyIds: requireArray(input.companyIds, "companyIds") as string[],
  };
}

export function createProspectingCompanyEnrichClient(options: { apiKey: string; fetch?: typeof fetch }) {
  const client = createLushaClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "prospecting.company.enrich" });
  return {
    async enrich(input: unknown) {
      const payload = validateProspectingCompanyEnrichInput(input);
      const response = await client.fetchJSON("/prospecting/company/enrich", {
        method: "POST",
        body: JSON.stringify({ requestId: payload.requestId, companyIds: payload.companyIds }),
      });
      if (response.status === 200) {
        const respBody = isRecord(response.body) ? response.body : {};
        const companies = Array.isArray(respBody.companies) ? respBody.companies : [];
        return { ok: true as const, companies };
      }
      return handleError(response.status, response.headers, "Lusha rejected the prospecting.company.enrich request.");
    },
  };
}

export function enrichProspectingCompanies(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createProspectingCompanyEnrichClient({
      apiKey: input.apiKey,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).enrich(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "lusha", action: "prospecting.company.enrich", source: "connector", companies: result.companies };
    });
  }
  return { connector: "lusha", action: "prospecting.company.enrich", source: "connector", validated: validateProspectingCompanyEnrichInput(input) };
}

// ─── bulk.person ──────────────────────────────────────────────────────────────

export type BulkPersonContact = {
  contactId?: string;
  email?: string;
  linkedinUrl?: string;
  fullName?: string;
  companyName?: string;
  companyDomain?: string;
};

export type BulkPersonInput = { contacts: BulkPersonContact[] };

export function validateBulkPersonInput(input: unknown): BulkPersonInput {
  if (!isRecord(input)) throw new Error("bulk.person input must be an object");
  const contacts = requireArray(input.contacts, "contacts");
  return {
    contacts: contacts.map((c, i) => {
      if (!isRecord(c)) throw new Error(`contacts[${i}] must be an object`);
      return {
        contactId: typeof c.contactId === "string" ? c.contactId : undefined,
        email: typeof c.email === "string" ? c.email : undefined,
        linkedinUrl: typeof c.linkedinUrl === "string" ? c.linkedinUrl : undefined,
        fullName: typeof c.fullName === "string" ? c.fullName : undefined,
        companyName: typeof c.companyName === "string" ? c.companyName : undefined,
        companyDomain: typeof c.companyDomain === "string" ? c.companyDomain : undefined,
      };
    }),
  };
}

export function createBulkPersonClient(options: { apiKey: string; fetch?: typeof fetch }) {
  const client = createLushaClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "bulk.person" });
  return {
    async enrich(input: unknown) {
      const payload = validateBulkPersonInput(input);
      const response = await client.fetchJSON("/v2/person", {
        method: "POST",
        body: JSON.stringify({ contacts: payload.contacts }),
      });
      if (response.status === 200) {
        const respBody = isRecord(response.body) ? response.body : {};
        const contacts = Array.isArray(respBody.contacts) ? respBody.contacts : [];
        const requestId = typeof respBody.requestId === "string" ? respBody.requestId : "";
        return { ok: true as const, contacts, requestId };
      }
      return handleError(response.status, response.headers, "Lusha rejected the bulk.person request.");
    },
  };
}

export function bulkEnrichPersons(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createBulkPersonClient({
      apiKey: input.apiKey,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).enrich(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "lusha", action: "bulk.person", source: "connector", contacts: result.contacts, requestId: result.requestId };
    });
  }
  return { connector: "lusha", action: "bulk.person", source: "connector", validated: validateBulkPersonInput(input) };
}

// ─── usage.get ────────────────────────────────────────────────────────────────

export function validateUsageGetInput(input: unknown): Record<string, never> {
  if (!isRecord(input)) throw new Error("usage.get input must be an object");
  return {};
}

export function createUsageGetClient(options: { apiKey: string; fetch?: typeof fetch }) {
  const client = createLushaClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "usage.get" });
  return {
    async get() {
      const response = await client.fetchJSON("/credits");
      if (response.status === 200) {
        return { ok: true as const, credits: response.body };
      }
      return handleError(response.status, response.headers, "Lusha rejected the usage.get request.");
    },
  };
}

export function getUsage(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createUsageGetClient({
      apiKey: input.apiKey,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).get().then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "lusha", action: "usage.get", source: "connector", credits: result.credits };
    });
  }
  return { connector: "lusha", action: "usage.get", source: "connector", validated: validateUsageGetInput(input) };
}
