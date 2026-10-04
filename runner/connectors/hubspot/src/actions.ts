import { createHubSpotClient, parseHubSpotRateLimit } from "./http";
import {
  normalizeCall,
  normalizeCompany,
  normalizeContact,
  normalizeDeal,
  normalizeMeeting,
  normalizeNote,
  normalizeTask,
  normalizeTicket,
  parseCompaniesResponse,
  parseContactsResponse,
  parseDealsResponse,
  parseOwnersResponse,
  parsePipelinesResponse,
  parseTicketsResponse,
} from "./objects";

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
export type SearchCrmInput = { query?: string; filterGroups?: unknown[]; sorts?: unknown[]; properties?: string[]; limit?: number; after?: string };
export type CreateNoteInput = { body: string; timestamp?: string; ownerId?: string };
export type CreateMeetingInput = { title: string; body?: string; timestamp?: string; startTime?: string; endTime?: string; outcome?: string; ownerId?: string };
export type CreateCallInput = { title: string; body?: string; timestamp?: string; durationMs?: number; status?: string; direction?: string; ownerId?: string };
export type CreateTaskInput = { subject: string; body?: string; timestamp?: string; status?: string; priority?: string; type?: string; ownerId?: string };
export type ListOwnersInput = { email?: string; after?: string; limit?: number };
export type ListDealPipelinesInput = Record<string, never>;
export type CreateAssociationInput = {
  fromObjectType: string;
  fromId: string;
  toObjectType: string;
  toId: string;
  associationTypeId: number;
  associationCategory?: string;
};

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

export function searchCompanies(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const payload = validateSearchCrmInput(input, "search companies");
    return createHubSpotClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined, operation: "companies.search" })
      .fetchJSON("/crm/v3/objects/companies/search", { method: "POST", body: JSON.stringify(searchCrmBody(payload)) })
      .then((result) => {
        if (result.status === 200) {
          const parsed = parseCompaniesResponse(result.body);
          return {
            connector: "hubspot",
            action: "companies.search",
            source: "connector",
            companies: parsed.companies.map(normalizeCompany),
            total: isRecord(result.body) ? (result.body.total ?? 0) : 0,
            nextCursor: parsed.nextCursor,
          };
        }
        throw handleError(result);
      });
  }
  return { connector: "hubspot", action: "companies.search", source: "connector", validated: validateSearchCrmInput(input, "search companies") };
}

export function searchDeals(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const payload = validateSearchCrmInput(input, "search deals");
    return createHubSpotClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined, operation: "deals.search" })
      .fetchJSON("/crm/v3/objects/deals/search", { method: "POST", body: JSON.stringify(searchCrmBody(payload)) })
      .then((result) => {
        if (result.status === 200) {
          const parsed = parseDealsResponse(result.body);
          return {
            connector: "hubspot",
            action: "deals.search",
            source: "connector",
            deals: parsed.deals.map(normalizeDeal),
            total: isRecord(result.body) ? (result.body.total ?? 0) : 0,
            nextCursor: parsed.nextCursor,
          };
        }
        throw handleError(result);
      });
  }
  return { connector: "hubspot", action: "deals.search", source: "connector", validated: validateSearchCrmInput(input, "search deals") };
}

export function searchTickets(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const payload = validateSearchCrmInput(input, "search tickets");
    return createHubSpotClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined, operation: "tickets.search" })
      .fetchJSON("/crm/v3/objects/tickets/search", { method: "POST", body: JSON.stringify(searchCrmBody(payload)) })
      .then((result) => {
        if (result.status === 200) {
          const parsed = parseTicketsResponse(result.body);
          return {
            connector: "hubspot",
            action: "tickets.search",
            source: "connector",
            tickets: parsed.tickets.map(normalizeTicket),
            total: isRecord(result.body) ? (result.body.total ?? 0) : 0,
            nextCursor: parsed.nextCursor,
          };
        }
        throw handleError(result);
      });
  }
  return { connector: "hubspot", action: "tickets.search", source: "connector", validated: validateSearchCrmInput(input, "search tickets") };
}

export function createNote(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const payload = validateCreateNoteInput(input);
    const properties: Record<string, unknown> = {
      hs_note_body: payload.body,
      hs_timestamp: payload.timestamp ?? String(Date.now()),
    };
    if (payload.ownerId) properties.hubspot_owner_id = payload.ownerId;
    return createHubSpotClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined, operation: "engagements.notes.create" })
      .fetchJSON("/crm/v3/objects/notes", { method: "POST", body: JSON.stringify({ properties }) })
      .then((result) => {
        if (result.status === 201 || result.status === 200) return { connector: "hubspot", action: "engagements.notes.create", source: "connector", note: normalizeNote(result.body as any) };
        throw handleError(result);
      });
  }
  return { connector: "hubspot", action: "engagements.notes.create", source: "connector", validated: validateCreateNoteInput(input) };
}

export function createMeeting(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const payload = validateCreateMeetingInput(input);
    const properties: Record<string, unknown> = {
      hs_meeting_title: payload.title,
      hs_timestamp: payload.timestamp ?? String(Date.now()),
    };
    if (payload.body) properties.hs_meeting_body = payload.body;
    if (payload.startTime) properties.hs_meeting_start_time = payload.startTime;
    if (payload.endTime) properties.hs_meeting_end_time = payload.endTime;
    if (payload.outcome) properties.hs_meeting_outcome = payload.outcome;
    if (payload.ownerId) properties.hubspot_owner_id = payload.ownerId;
    return createHubSpotClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined, operation: "engagements.meetings.create" })
      .fetchJSON("/crm/v3/objects/meetings", { method: "POST", body: JSON.stringify({ properties }) })
      .then((result) => {
        if (result.status === 201 || result.status === 200) return { connector: "hubspot", action: "engagements.meetings.create", source: "connector", meeting: normalizeMeeting(result.body as any) };
        throw handleError(result);
      });
  }
  return { connector: "hubspot", action: "engagements.meetings.create", source: "connector", validated: validateCreateMeetingInput(input) };
}

export function createCall(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const payload = validateCreateCallInput(input);
    const properties: Record<string, unknown> = {
      hs_call_title: payload.title,
      hs_timestamp: payload.timestamp ?? String(Date.now()),
    };
    if (payload.body) properties.hs_call_body = payload.body;
    if (payload.durationMs != null) properties.hs_call_duration = String(payload.durationMs);
    if (payload.status) properties.hs_call_status = payload.status.toUpperCase();
    if (payload.direction) properties.hs_call_direction = payload.direction.toUpperCase();
    if (payload.ownerId) properties.hubspot_owner_id = payload.ownerId;
    return createHubSpotClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined, operation: "engagements.calls.create" })
      .fetchJSON("/crm/v3/objects/calls", { method: "POST", body: JSON.stringify({ properties }) })
      .then((result) => {
        if (result.status === 201 || result.status === 200) return { connector: "hubspot", action: "engagements.calls.create", source: "connector", call: normalizeCall(result.body as any) };
        throw handleError(result);
      });
  }
  return { connector: "hubspot", action: "engagements.calls.create", source: "connector", validated: validateCreateCallInput(input) };
}

export function createTask(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const payload = validateCreateTaskInput(input);
    const properties: Record<string, unknown> = {
      hs_task_subject: payload.subject,
      hs_timestamp: payload.timestamp ?? String(Date.now()),
    };
    if (payload.body) properties.hs_task_body = payload.body;
    if (payload.status) properties.hs_task_status = payload.status.toUpperCase();
    if (payload.priority) properties.hs_task_priority = payload.priority.toUpperCase();
    if (payload.type) properties.hs_task_type = payload.type.toUpperCase();
    if (payload.ownerId) properties.hubspot_owner_id = payload.ownerId;
    return createHubSpotClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined, operation: "engagements.tasks.create" })
      .fetchJSON("/crm/v3/objects/tasks", { method: "POST", body: JSON.stringify({ properties }) })
      .then((result) => {
        if (result.status === 201 || result.status === 200) return { connector: "hubspot", action: "engagements.tasks.create", source: "connector", task: normalizeTask(result.body as any) };
        throw handleError(result);
      });
  }
  return { connector: "hubspot", action: "engagements.tasks.create", source: "connector", validated: validateCreateTaskInput(input) };
}

export function listOwners(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const payload = validateListOwnersInput(input);
    const params = new URLSearchParams();
    if (payload.limit != null) params.set("limit", String(payload.limit));
    if (payload.after) params.set("after", payload.after);
    if (payload.email) params.set("email", payload.email);
    const qs = params.toString();
    return createHubSpotClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined, operation: "owners.list" })
      .fetchJSON(`/crm/v3/owners${qs ? `?${qs}` : ""}`, { method: "GET" })
      .then((result) => {
        if (result.status === 200) {
          const parsed = parseOwnersResponse(result.body);
          return { connector: "hubspot", action: "owners.list", source: "connector", owners: parsed.owners, nextCursor: parsed.nextCursor };
        }
        throw handleError(result);
      });
  }
  return { connector: "hubspot", action: "owners.list", source: "connector", validated: validateListOwnersInput(input) };
}

export function listDealPipelines(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    validateListDealPipelinesInput(input);
    return createHubSpotClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined, operation: "pipelines.deals.list" })
      .fetchJSON("/crm/v3/pipelines/deals", { method: "GET" })
      .then((result) => {
        if (result.status === 200) {
          return { connector: "hubspot", action: "pipelines.deals.list", source: "connector", pipelines: parsePipelinesResponse(result.body).pipelines };
        }
        throw handleError(result);
      });
  }
  return { connector: "hubspot", action: "pipelines.deals.list", source: "connector", validated: validateListDealPipelinesInput(input) };
}

export function createAssociation(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const payload = validateCreateAssociationInput(input);
    const category = payload.associationCategory ?? "HUBSPOT_DEFINED";
    return createHubSpotClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined, operation: "associations.create" })
      .fetchJSON(
        `/crm/v4/objects/${encodeURIComponent(payload.fromObjectType)}/${encodeURIComponent(payload.fromId)}/associations/${encodeURIComponent(payload.toObjectType)}/${encodeURIComponent(payload.toId)}`,
        { method: "PUT", body: JSON.stringify([{ associationCategory: category, associationTypeId: payload.associationTypeId }]) },
      )
      .then((result) => {
        if (result.status === 201 || result.status === 200) {
          return {
            connector: "hubspot",
            action: "associations.create",
            source: "connector",
            association: {
              fromObjectType: payload.fromObjectType,
              fromId: payload.fromId,
              toObjectType: payload.toObjectType,
              toId: payload.toId,
              associationCategory: category,
              associationTypeId: payload.associationTypeId,
              raw: result.body,
            },
          };
        }
        throw handleError(result);
      });
  }
  return { connector: "hubspot", action: "associations.create", source: "connector", validated: validateCreateAssociationInput(input) };
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

function validateSearchCrmInput(input: unknown, label: string): SearchCrmInput {
  if (!isRecord(input)) throw new Error(`${label} input must be an object`);
  return {
    query: typeof input.query === "string" ? input.query : undefined,
    filterGroups: Array.isArray(input.filterGroups) ? input.filterGroups : undefined,
    sorts: Array.isArray(input.sorts) ? input.sorts : undefined,
    properties: Array.isArray(input.properties) ? input.properties.filter((p): p is string => typeof p === "string") : undefined,
    limit: typeof input.limit === "number" ? input.limit : undefined,
    after: typeof input.after === "string" ? input.after : undefined,
  };
}

function searchCrmBody(payload: SearchCrmInput): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (payload.query) body.query = payload.query;
  if (payload.filterGroups) body.filterGroups = payload.filterGroups;
  if (payload.sorts) body.sorts = payload.sorts;
  if (payload.properties) body.properties = payload.properties;
  if (payload.limit != null) body.limit = payload.limit;
  if (payload.after) body.after = payload.after;
  return body;
}

function toTimestampString(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.trunc(value));
  if (typeof value === "string" && value.length > 0) return value;
  return undefined;
}

function validateCreateNoteInput(input: unknown): CreateNoteInput {
  if (!isRecord(input)) throw new Error("create note input must be an object");
  return {
    body: requireString(input.body, "body"),
    timestamp: toTimestampString(input.timestamp),
    ownerId: typeof input.ownerId === "string" ? input.ownerId : undefined,
  };
}

function validateCreateMeetingInput(input: unknown): CreateMeetingInput {
  if (!isRecord(input)) throw new Error("create meeting input must be an object");
  return {
    title: requireString(input.title, "title"),
    body: typeof input.body === "string" ? input.body : undefined,
    timestamp: toTimestampString(input.timestamp),
    startTime: toTimestampString(input.startTime),
    endTime: toTimestampString(input.endTime),
    outcome: typeof input.outcome === "string" ? input.outcome : undefined,
    ownerId: typeof input.ownerId === "string" ? input.ownerId : undefined,
  };
}

function validateCreateCallInput(input: unknown): CreateCallInput {
  if (!isRecord(input)) throw new Error("create call input must be an object");
  return {
    title: requireString(input.title, "title"),
    body: typeof input.body === "string" ? input.body : undefined,
    timestamp: toTimestampString(input.timestamp),
    durationMs: typeof input.durationMs === "number" ? input.durationMs : undefined,
    status: typeof input.status === "string" ? input.status : undefined,
    direction: typeof input.direction === "string" ? input.direction : undefined,
    ownerId: typeof input.ownerId === "string" ? input.ownerId : undefined,
  };
}

function validateCreateTaskInput(input: unknown): CreateTaskInput {
  if (!isRecord(input)) throw new Error("create task input must be an object");
  return {
    subject: requireString(input.subject, "subject"),
    body: typeof input.body === "string" ? input.body : undefined,
    timestamp: toTimestampString(input.timestamp),
    status: typeof input.status === "string" ? input.status : undefined,
    priority: typeof input.priority === "string" ? input.priority : undefined,
    type: typeof input.type === "string" ? input.type : undefined,
    ownerId: typeof input.ownerId === "string" ? input.ownerId : undefined,
  };
}

function validateListOwnersInput(input: unknown): ListOwnersInput {
  if (!isRecord(input)) throw new Error("list owners input must be an object");
  return {
    email: typeof input.email === "string" ? input.email : undefined,
    after: typeof input.after === "string" ? input.after : undefined,
    limit: typeof input.limit === "number" ? input.limit : undefined,
  };
}

function validateListDealPipelinesInput(input: unknown): ListDealPipelinesInput {
  if (!isRecord(input)) throw new Error("list deal pipelines input must be an object");
  return {};
}

function validateCreateAssociationInput(input: unknown): CreateAssociationInput {
  if (!isRecord(input)) throw new Error("create association input must be an object");
  return {
    fromObjectType: requireString(input.fromObjectType, "fromObjectType"),
    fromId: requireString(input.fromId, "fromId"),
    toObjectType: requireString(input.toObjectType, "toObjectType"),
    toId: requireString(input.toId, "toId"),
    associationTypeId: requireNumber(input.associationTypeId, "associationTypeId"),
    associationCategory: typeof input.associationCategory === "string" ? input.associationCategory : undefined,
  };
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${field} is required`);
  return value;
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
