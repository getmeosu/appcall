import type { HubSpotCrmObject } from "./http";
import { prop, propNum } from "./http";

export type NormalizedContact = {
  id: string;
  provider: "hubspot";
  providerContactId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string;
  website: string;
  jobTitle: string;
  city: string;
  state: string;
  country: string;
  ownerId: string;
  lifecycleStage: string;
  createdAt: string;
  updatedAt: string;
  modelVersion: "2026-05-16";
  raw: HubSpotCrmObject;
};

export function normalizeContact(c: HubSpotCrmObject): NormalizedContact {
  return {
    id: `hs-contact:${c.id}`,
    provider: "hubspot",
    providerContactId: c.id,
    firstName: prop(c, "firstname"),
    lastName: prop(c, "lastname"),
    email: prop(c, "email"),
    phone: prop(c, "phone"),
    company: prop(c, "company"),
    website: prop(c, "website"),
    jobTitle: prop(c, "jobtitle"),
    city: prop(c, "city"),
    state: prop(c, "state"),
    country: prop(c, "country"),
    ownerId: prop(c, "hubspot_owner_id"),
    lifecycleStage: prop(c, "lifecyclestage"),
    createdAt: c.createdAt ?? "",
    updatedAt: c.updatedAt ?? "",
    modelVersion: "2026-05-16",
    raw: c,
  };
}

export function parseContactsResponse(response: unknown): { contacts: HubSpotCrmObject[]; nextCursor: string | null } {
  if (!isRecord(response)) return { contacts: [], nextCursor: null };
  const results = response.results;
  if (!Array.isArray(results)) return { contacts: [], nextCursor: null };
  return {
    contacts: results.filter(isRecord) as HubSpotCrmObject[],
    nextCursor: extractAfter(response),
  };
}

export type NormalizedCompany = {
  id: string;
  provider: "hubspot";
  providerCompanyId: string;
  name: string;
  domain: string;
  industry: string;
  city: string;
  state: string;
  country: string;
  phone: string;
  website: string;
  description: string;
  numberOfEmployees: number;
  annualRevenue: number;
  ownerId: string;
  lifecycleStage: string;
  createdAt: string;
  updatedAt: string;
  modelVersion: "2026-05-16";
  raw: HubSpotCrmObject;
};

export function normalizeCompany(c: HubSpotCrmObject): NormalizedCompany {
  return {
    id: `hs-company:${c.id}`,
    provider: "hubspot",
    providerCompanyId: c.id,
    name: prop(c, "name"),
    domain: prop(c, "domain"),
    industry: prop(c, "industry"),
    city: prop(c, "city"),
    state: prop(c, "state"),
    country: prop(c, "country"),
    phone: prop(c, "phone"),
    website: prop(c, "website"),
    description: prop(c, "description"),
    numberOfEmployees: propNum(c, "numberofemployees"),
    annualRevenue: propNum(c, "annualrevenue"),
    ownerId: prop(c, "hubspot_owner_id"),
    lifecycleStage: prop(c, "lifecyclestage"),
    createdAt: c.createdAt ?? "",
    updatedAt: c.updatedAt ?? "",
    modelVersion: "2026-05-16",
    raw: c,
  };
}

export function parseCompaniesResponse(response: unknown): { companies: HubSpotCrmObject[]; nextCursor: string | null } {
  if (!isRecord(response)) return { companies: [], nextCursor: null };
  const results = response.results;
  if (!Array.isArray(results)) return { companies: [], nextCursor: null };
  return { companies: results.filter(isRecord) as HubSpotCrmObject[], nextCursor: extractAfter(response) };
}

export type NormalizedDeal = {
  id: string;
  provider: "hubspot";
  providerDealId: string;
  name: string;
  amount: number;
  stage: string;
  pipeline: string;
  closeDate: string;
  ownerId: string;
  description: string;
  dealType: string;
  probability: number;
  createdAt: string;
  updatedAt: string;
  modelVersion: "2026-05-16";
  raw: HubSpotCrmObject;
};

export function normalizeDeal(d: HubSpotCrmObject): NormalizedDeal {
  return {
    id: `hs-deal:${d.id}`,
    provider: "hubspot",
    providerDealId: d.id,
    name: prop(d, "dealname"),
    amount: propNum(d, "amount"),
    stage: prop(d, "dealstage"),
    pipeline: prop(d, "pipeline"),
    closeDate: prop(d, "closedate"),
    ownerId: prop(d, "hubspot_owner_id"),
    description: prop(d, "description"),
    dealType: prop(d, "dealtype"),
    probability: propNum(d, "hs_forecast_probability"),
    createdAt: d.createdAt ?? "",
    updatedAt: d.updatedAt ?? "",
    modelVersion: "2026-05-16",
    raw: d,
  };
}

export function parseDealsResponse(response: unknown): { deals: HubSpotCrmObject[]; nextCursor: string | null } {
  if (!isRecord(response)) return { deals: [], nextCursor: null };
  const results = response.results;
  if (!Array.isArray(results)) return { deals: [], nextCursor: null };
  return { deals: results.filter(isRecord) as HubSpotCrmObject[], nextCursor: extractAfter(response) };
}

export type NormalizedTicket = {
  id: string;
  provider: "hubspot";
  providerTicketId: string;
  subject: string;
  content: string;
  status: string;
  priority: string;
  category: string;
  pipeline: string;
  pipelineStage: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  modelVersion: "2026-05-16";
  raw: HubSpotCrmObject;
};

export function normalizeTicket(t: HubSpotCrmObject): NormalizedTicket {
  return {
    id: `hs-ticket:${t.id}`,
    provider: "hubspot",
    providerTicketId: t.id,
    subject: prop(t, "subject"),
    content: prop(t, "content"),
    status: prop(t, "hs_pipeline_stage"),
    priority: prop(t, "hs_ticket_priority"),
    category: prop(t, "hs_ticket_category"),
    pipeline: prop(t, "hs_pipeline"),
    pipelineStage: prop(t, "hs_pipeline_stage"),
    ownerId: prop(t, "hubspot_owner_id"),
    createdAt: t.createdAt ?? "",
    updatedAt: t.updatedAt ?? "",
    modelVersion: "2026-05-16",
    raw: t,
  };
}

export function parseTicketsResponse(response: unknown): { tickets: HubSpotCrmObject[]; nextCursor: string | null } {
  if (!isRecord(response)) return { tickets: [], nextCursor: null };
  const results = response.results;
  if (!Array.isArray(results)) return { tickets: [], nextCursor: null };
  return { tickets: results.filter(isRecord) as HubSpotCrmObject[], nextCursor: extractAfter(response) };
}

function extractAfter(response: Record<string, unknown>): string | null {
  const paging = response.paging;
  if (!isRecord(paging)) return null;
  const next = paging.next;
  if (!isRecord(next)) return null;
  const after = next.after;
  return typeof after === "string" && after.length > 0 ? after : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
