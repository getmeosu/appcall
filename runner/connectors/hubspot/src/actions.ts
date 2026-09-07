import { createHubSpotClient, parseHubSpotRateLimit } from "./http";
import { normalizeContact, normalizeCompany, normalizeDeal, normalizeTicket, parseContactsResponse } from "./objects";

export type CreateContactInput = { email?: string; firstName?: string; lastName?: string; phone?: string; company?: string; jobTitle?: string };
export type CreateCompanyInput = { name: string; domain?: string; industry?: string; city?: string; website?: string };
export type CreateDealInput = { name: string; amount?: number; stage?: string; closeDate?: string; pipeline?: string };
export type CreateTicketInput = { subject: string; content?: string; priority?: string; category?: string };
export type GetContactInput = { contactId: string };
export type UpdateContactInput = { contactId: string; email?: string; firstName?: string; lastName?: string; phone?: string; company?: string; jobTitle?: string };
export type DeleteContactInput = { contactId: string };
export type SearchContactsInput = { query?: string; filterGroups?: unknown[]; sorts?: unknown[]; properties?: string[]; limit?: number; after?: string };
export type GetCompanyInput = { companyId: string };
export type UpdateCompanyInput = { companyId: string; name?: string; domain?: string; industry?: string; city?: string; website?: string };
export type DeleteCompanyInput = { companyId: string };
export type GetDealInput = { dealId: string };
export type UpdateDealInput = { dealId: string; name?: string; amount?: number; stage?: string; closeDate?: string; pipeline?: string };
export type DeleteDealInput = { dealId: string };
export type GetTicketInput = { ticketId: string };
export type UpdateTicketInput = { ticketId: string; subject?: string; content?: string; priority?: string; category?: string };

export function createContact(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const payload = validateCreateContactInput(input);
    return createHubSpotClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined, operation: "contacts.create" })
      .fetchJSON("/crm/v3/objects/contacts", { method: "POST", body: JSON.stringify({ properties: toSnakeCaseProps(payload) }) })
      .then((result) => {
        if (result.status === 201) return { connector: "hubspot", action: "contacts.create", source: "connector", contact: normalizeContact(result.body as any) };
        throw handleError(result);
      });
  }
  return { connector: "hubspot", action: "contacts.create", source: "connector", validated: validateCreateContactInput(input) };
}

export function createCompany(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const payload = validateCreateCompanyInput(input);
    return createHubSpotClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined, operation: "companies.create" })
      .fetchJSON("/crm/v3/objects/companies", { method: "POST", body: JSON.stringify({ properties: toSnakeCaseProps(payload) }) })
      .then((result) => {
        if (result.status === 201) return { connector: "hubspot", action: "companies.create", source: "connector", company: normalizeCompany(result.body as any) };
        throw handleError(result);
      });
  }
  return { connector: "hubspot", action: "companies.create", source: "connector", validated: validateCreateCompanyInput(input) };
}

export function createDeal(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const payload = validateCreateDealInput(input);
    return createHubSpotClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined, operation: "deals.create" })
      .fetchJSON("/crm/v3/objects/deals", { method: "POST", body: JSON.stringify({ properties: { dealname: payload.name, amount: payload.amount ? String(payload.amount) : undefined, dealstage: payload.stage, closedate: payload.closeDate, pipeline: payload.pipeline } }) })
      .then((result) => {
        if (result.status === 201) return { connector: "hubspot", action: "deals.create", source: "connector", deal: normalizeDeal(result.body as any) };
        throw handleError(result);
      });
  }
  return { connector: "hubspot", action: "deals.create", source: "connector", validated: validateCreateDealInput(input) };
}

export function createTicket(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const payload = validateCreateTicketInput(input);
    return createHubSpotClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined, operation: "tickets.create" })
      .fetchJSON("/crm/v3/objects/tickets", { method: "POST", body: JSON.stringify({ properties: { subject: payload.subject, content: payload.content, hs_ticket_priority: payload.priority?.toUpperCase(), hs_ticket_category: payload.category?.toUpperCase() } }) })
      .then((result) => {
        if (result.status === 201) return { connector: "hubspot", action: "tickets.create", source: "connector", ticket: normalizeTicket(result.body as any) };
        throw handleError(result);
      });
  }
  return { connector: "hubspot", action: "tickets.create", source: "connector", validated: validateCreateTicketInput(input) };
}

export function getContact(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const payload = validateGetContactInput(input);
    return createHubSpotClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined, operation: "contacts.get" })
      .fetchJSON(`/crm/v3/objects/contacts/${encodeURIComponent(payload.contactId)}`, { method: "GET" })
      .then((result) => {
        if (result.status === 200) return { connector: "hubspot", action: "contacts.get", source: "connector", contact: normalizeContact(result.body as any) };
        throw handleError(result);
      });
  }
  return { connector: "hubspot", action: "contacts.get", source: "connector", validated: validateGetContactInput(input) };
}

export function updateContact(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const payload = validateUpdateContactInput(input);
    const { contactId, ...rest } = payload;
    return createHubSpotClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined, operation: "contacts.update" })
      .fetchJSON(`/crm/v3/objects/contacts/${encodeURIComponent(contactId)}`, { method: "PATCH", body: JSON.stringify({ properties: toSnakeCaseProps(rest as Record<string, unknown>) }) })
      .then((result) => {
        if (result.status === 200) return { connector: "hubspot", action: "contacts.update", source: "connector", contact: normalizeContact(result.body as any) };
        throw handleError(result);
      });
  }
  return { connector: "hubspot", action: "contacts.update", source: "connector", validated: validateUpdateContactInput(input) };
}

export function deleteContact(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const payload = validateDeleteContactInput(input);
    return createHubSpotClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined, operation: "contacts.delete" })
      .fetchJSON(`/crm/v3/objects/contacts/${encodeURIComponent(payload.contactId)}`, { method: "DELETE" })
      .then((result) => {
        if (result.status === 204) return { connector: "hubspot", action: "contacts.delete", source: "connector", deleted: true };
        throw handleError(result);
      });
  }
  return { connector: "hubspot", action: "contacts.delete", source: "connector", validated: validateDeleteContactInput(input) };
}

export function searchContacts(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const payload = validateSearchContactsInput(input);
    const body: Record<string, unknown> = {};
    if (payload.query) body.query = payload.query;
    if (payload.filterGroups) body.filterGroups = payload.filterGroups;
    if (payload.sorts) body.sorts = payload.sorts;
    if (payload.properties) body.properties = payload.properties;
    if (payload.limit != null) body.limit = payload.limit;
    if (payload.after) body.after = payload.after;
    return createHubSpotClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined, operation: "contacts.search" })
      .fetchJSON("/crm/v3/objects/contacts/search", { method: "POST", body: JSON.stringify(body) })
      .then((result) => {
        if (result.status === 200) {
          const parsed = parseContactsResponse(result.body);
          return {
            connector: "hubspot",
            action: "contacts.search",
            source: "connector",
            contacts: parsed.contacts.map(normalizeContact),
            total: isRecord(result.body) ? (result.body.total ?? 0) : 0,
            nextCursor: parsed.nextCursor,
          };
        }
        throw handleError(result);
      });
  }
  return { connector: "hubspot", action: "contacts.search", source: "connector", validated: validateSearchContactsInput(input) };
}

export function getCompany(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const payload = validateGetCompanyInput(input);
    return createHubSpotClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined, operation: "companies.get" })
      .fetchJSON(`/crm/v3/objects/companies/${encodeURIComponent(payload.companyId)}`, { method: "GET" })
      .then((result) => {
        if (result.status === 200) return { connector: "hubspot", action: "companies.get", source: "connector", company: normalizeCompany(result.body as any) };
        throw handleError(result);
      });
  }
  return { connector: "hubspot", action: "companies.get", source: "connector", validated: validateGetCompanyInput(input) };
}

export function updateCompany(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const payload = validateUpdateCompanyInput(input);
    const { companyId, ...rest } = payload;
    return createHubSpotClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined, operation: "companies.update" })
      .fetchJSON(`/crm/v3/objects/companies/${encodeURIComponent(companyId)}`, { method: "PATCH", body: JSON.stringify({ properties: toSnakeCaseProps(rest as Record<string, unknown>) }) })
      .then((result) => {
        if (result.status === 200) return { connector: "hubspot", action: "companies.update", source: "connector", company: normalizeCompany(result.body as any) };
        throw handleError(result);
      });
  }
  return { connector: "hubspot", action: "companies.update", source: "connector", validated: validateUpdateCompanyInput(input) };
}

export function deleteCompany(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const payload = validateDeleteCompanyInput(input);
    return createHubSpotClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined, operation: "companies.delete" })
      .fetchJSON(`/crm/v3/objects/companies/${encodeURIComponent(payload.companyId)}`, { method: "DELETE" })
      .then((result) => {
        if (result.status === 204) return { connector: "hubspot", action: "companies.delete", source: "connector", deleted: true };
        throw handleError(result);
      });
  }
  return { connector: "hubspot", action: "companies.delete", source: "connector", validated: validateDeleteCompanyInput(input) };
}

export function getDeal(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const payload = validateGetDealInput(input);
    return createHubSpotClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined, operation: "deals.get" })
      .fetchJSON(`/crm/v3/objects/deals/${encodeURIComponent(payload.dealId)}`, { method: "GET" })
      .then((result) => {
        if (result.status === 200) return { connector: "hubspot", action: "deals.get", source: "connector", deal: normalizeDeal(result.body as any) };
        throw handleError(result);
      });
  }
  return { connector: "hubspot", action: "deals.get", source: "connector", validated: validateGetDealInput(input) };
}

export function updateDeal(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const payload = validateUpdateDealInput(input);
    const { dealId, name, amount, stage, closeDate, pipeline } = payload;
    const properties: Record<string, unknown> = {};
    if (name !== undefined) properties.dealname = name;
    if (amount !== undefined) properties.amount = String(amount);
    if (stage !== undefined) properties.dealstage = stage;
    if (closeDate !== undefined) properties.closedate = closeDate;
    if (pipeline !== undefined) properties.pipeline = pipeline;
    return createHubSpotClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined, operation: "deals.update" })
      .fetchJSON(`/crm/v3/objects/deals/${encodeURIComponent(dealId)}`, { method: "PATCH", body: JSON.stringify({ properties }) })
      .then((result) => {
        if (result.status === 200) return { connector: "hubspot", action: "deals.update", source: "connector", deal: normalizeDeal(result.body as any) };
        throw handleError(result);
      });
  }
  return { connector: "hubspot", action: "deals.update", source: "connector", validated: validateUpdateDealInput(input) };
}

export function deleteDeal(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const payload = validateDeleteDealInput(input);
    return createHubSpotClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined, operation: "deals.delete" })
      .fetchJSON(`/crm/v3/objects/deals/${encodeURIComponent(payload.dealId)}`, { method: "DELETE" })
      .then((result) => {
        if (result.status === 204) return { connector: "hubspot", action: "deals.delete", source: "connector", deleted: true };
        throw handleError(result);
      });
  }
  return { connector: "hubspot", action: "deals.delete", source: "connector", validated: validateDeleteDealInput(input) };
}

export function getTicket(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const payload = validateGetTicketInput(input);
    return createHubSpotClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined, operation: "tickets.get" })
      .fetchJSON(`/crm/v3/objects/tickets/${encodeURIComponent(payload.ticketId)}`, { method: "GET" })
      .then((result) => {
        if (result.status === 200) return { connector: "hubspot", action: "tickets.get", source: "connector", ticket: normalizeTicket(result.body as any) };
        throw handleError(result);
      });
  }
  return { connector: "hubspot", action: "tickets.get", source: "connector", validated: validateGetTicketInput(input) };
}

export function updateTicket(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const payload = validateUpdateTicketInput(input);
    const { ticketId, subject, content, priority, category } = payload;
    const properties: Record<string, unknown> = {};
    if (subject !== undefined) properties.subject = subject;
    if (content !== undefined) properties.content = content;
    if (priority !== undefined) properties.hs_ticket_priority = priority.toUpperCase();
    if (category !== undefined) properties.hs_ticket_category = category.toUpperCase();
    return createHubSpotClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined, operation: "tickets.update" })
      .fetchJSON(`/crm/v3/objects/tickets/${encodeURIComponent(ticketId)}`, { method: "PATCH", body: JSON.stringify({ properties }) })
      .then((result) => {
        if (result.status === 200) return { connector: "hubspot", action: "tickets.update", source: "connector", ticket: normalizeTicket(result.body as any) };
        throw handleError(result);
      });
  }
  return { connector: "hubspot", action: "tickets.update", source: "connector", validated: validateUpdateTicketInput(input) };
}

function validateCreateContactInput(input: unknown): CreateContactInput {
  if (!isRecord(input)) throw new Error("create contact input must be an object");
  return {
    email: typeof input.email === "string" ? input.email : undefined,
    firstName: typeof input.firstName === "string" ? input.firstName : undefined,
    lastName: typeof input.lastName === "string" ? input.lastName : undefined,
    phone: typeof input.phone === "string" ? input.phone : undefined,
    company: typeof input.company === "string" ? input.company : undefined,
    jobTitle: typeof input.jobTitle === "string" ? input.jobTitle : undefined,
  };
}

function validateCreateCompanyInput(input: unknown): CreateCompanyInput {
  if (!isRecord(input)) throw new Error("create company input must be an object");
  return {
    name: requireString(input.name, "name"),
    domain: typeof input.domain === "string" ? input.domain : undefined,
    industry: typeof input.industry === "string" ? input.industry : undefined,
    city: typeof input.city === "string" ? input.city : undefined,
    website: typeof input.website === "string" ? input.website : undefined,
  };
}

function validateCreateDealInput(input: unknown): CreateDealInput {
  if (!isRecord(input)) throw new Error("create deal input must be an object");
  return {
    name: requireString(input.name, "name"),
    amount: typeof input.amount === "number" ? input.amount : undefined,
    stage: typeof input.stage === "string" ? input.stage : undefined,
    closeDate: typeof input.closeDate === "string" ? input.closeDate : undefined,
    pipeline: typeof input.pipeline === "string" ? input.pipeline : undefined,
  };
}

function validateCreateTicketInput(input: unknown): CreateTicketInput {
  if (!isRecord(input)) throw new Error("create ticket input must be an object");
  return {
    subject: requireString(input.subject, "subject"),
    content: typeof input.content === "string" ? input.content : undefined,
    priority: typeof input.priority === "string" ? input.priority : undefined,
    category: typeof input.category === "string" ? input.category : undefined,
  };
}

function validateGetContactInput(input: unknown): GetContactInput {
  if (!isRecord(input)) throw new Error("get contact input must be an object");
  return { contactId: requireString(input.contactId, "contactId") };
}

function validateUpdateContactInput(input: unknown): UpdateContactInput {
  if (!isRecord(input)) throw new Error("update contact input must be an object");
  return {
    contactId: requireString(input.contactId, "contactId"),
    email: typeof input.email === "string" ? input.email : undefined,
    firstName: typeof input.firstName === "string" ? input.firstName : undefined,
    lastName: typeof input.lastName === "string" ? input.lastName : undefined,
    phone: typeof input.phone === "string" ? input.phone : undefined,
    company: typeof input.company === "string" ? input.company : undefined,
    jobTitle: typeof input.jobTitle === "string" ? input.jobTitle : undefined,
  };
}

function validateDeleteContactInput(input: unknown): DeleteContactInput {
  if (!isRecord(input)) throw new Error("delete contact input must be an object");
  return { contactId: requireString(input.contactId, "contactId") };
}

function validateSearchContactsInput(input: unknown): SearchContactsInput {
  if (!isRecord(input)) throw new Error("search contacts input must be an object");
  return {
    query: typeof input.query === "string" ? input.query : undefined,
    filterGroups: Array.isArray(input.filterGroups) ? input.filterGroups : undefined,
    sorts: Array.isArray(input.sorts) ? input.sorts : undefined,
    properties: Array.isArray(input.properties) ? input.properties.filter((p): p is string => typeof p === "string") : undefined,
    limit: typeof input.limit === "number" ? input.limit : undefined,
    after: typeof input.after === "string" ? input.after : undefined,
  };
}

function validateGetCompanyInput(input: unknown): GetCompanyInput {
  if (!isRecord(input)) throw new Error("get company input must be an object");
  return { companyId: requireString(input.companyId, "companyId") };
}

function validateUpdateCompanyInput(input: unknown): UpdateCompanyInput {
  if (!isRecord(input)) throw new Error("update company input must be an object");
  return {
    companyId: requireString(input.companyId, "companyId"),
    name: typeof input.name === "string" ? input.name : undefined,
    domain: typeof input.domain === "string" ? input.domain : undefined,
    industry: typeof input.industry === "string" ? input.industry : undefined,
    city: typeof input.city === "string" ? input.city : undefined,
    website: typeof input.website === "string" ? input.website : undefined,
  };
}

function validateDeleteCompanyInput(input: unknown): DeleteCompanyInput {
  if (!isRecord(input)) throw new Error("delete company input must be an object");
  return { companyId: requireString(input.companyId, "companyId") };
}

function validateGetDealInput(input: unknown): GetDealInput {
  if (!isRecord(input)) throw new Error("get deal input must be an object");
  return { dealId: requireString(input.dealId, "dealId") };
}

function validateUpdateDealInput(input: unknown): UpdateDealInput {
  if (!isRecord(input)) throw new Error("update deal input must be an object");
  return {
    dealId: requireString(input.dealId, "dealId"),
    name: typeof input.name === "string" ? input.name : undefined,
    amount: typeof input.amount === "number" ? input.amount : undefined,
    stage: typeof input.stage === "string" ? input.stage : undefined,
    closeDate: typeof input.closeDate === "string" ? input.closeDate : undefined,
    pipeline: typeof input.pipeline === "string" ? input.pipeline : undefined,
  };
}

function validateDeleteDealInput(input: unknown): DeleteDealInput {
  if (!isRecord(input)) throw new Error("delete deal input must be an object");
  return { dealId: requireString(input.dealId, "dealId") };
}

function validateGetTicketInput(input: unknown): GetTicketInput {
  if (!isRecord(input)) throw new Error("get ticket input must be an object");
  return { ticketId: requireString(input.ticketId, "ticketId") };
}

function validateUpdateTicketInput(input: unknown): UpdateTicketInput {
  if (!isRecord(input)) throw new Error("update ticket input must be an object");
  return {
    ticketId: requireString(input.ticketId, "ticketId"),
    subject: typeof input.subject === "string" ? input.subject : undefined,
    content: typeof input.content === "string" ? input.content : undefined,
    priority: typeof input.priority === "string" ? input.priority : undefined,
    category: typeof input.category === "string" ? input.category : undefined,
  };
}

function handleError(result: { status: number; headers: Record<string, string>; body: unknown }) {
  const rateLimit = parseHubSpotRateLimit(result.status, result.headers);
  if (rateLimit.limited) {
    return { ok: false, code: "CONNECTOR_RATE_LIMITED", message: "HubSpot rate limit exceeded.", retryAfterSeconds: rateLimit.retryAfterSeconds };
  }
  return { ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: "HubSpot rejected the request." };
}

function toSnakeCaseProps(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    result[key.replace(/([A-Z])/g, "_$1").toLowerCase()] = val;
  }
  return result;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
