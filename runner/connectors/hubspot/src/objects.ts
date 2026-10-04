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

export type NormalizedNote = {
  id: string;
  provider: "hubspot";
  providerNoteId: string;
  body: string;
  timestamp: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  raw: HubSpotCrmObject;
};

export function normalizeNote(n: HubSpotCrmObject): NormalizedNote {
  return {
    id: `hs-note:${n.id}`,
    provider: "hubspot",
    providerNoteId: n.id,
    body: prop(n, "hs_note_body"),
    timestamp: prop(n, "hs_timestamp"),
    ownerId: prop(n, "hubspot_owner_id"),
    createdAt: n.createdAt ?? "",
    updatedAt: n.updatedAt ?? "",
    raw: n,
  };
}

export type NormalizedMeeting = {
  id: string;
  provider: "hubspot";
  providerMeetingId: string;
  title: string;
  body: string;
  timestamp: string;
  startTime: string;
  endTime: string;
  outcome: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  raw: HubSpotCrmObject;
};

export function normalizeMeeting(m: HubSpotCrmObject): NormalizedMeeting {
  return {
    id: `hs-meeting:${m.id}`,
    provider: "hubspot",
    providerMeetingId: m.id,
    title: prop(m, "hs_meeting_title"),
    body: prop(m, "hs_meeting_body"),
    timestamp: prop(m, "hs_timestamp"),
    startTime: prop(m, "hs_meeting_start_time"),
    endTime: prop(m, "hs_meeting_end_time"),
    outcome: prop(m, "hs_meeting_outcome"),
    ownerId: prop(m, "hubspot_owner_id"),
    createdAt: m.createdAt ?? "",
    updatedAt: m.updatedAt ?? "",
    raw: m,
  };
}

export type NormalizedCall = {
  id: string;
  provider: "hubspot";
  providerCallId: string;
  title: string;
  body: string;
  timestamp: string;
  duration: string;
  status: string;
  direction: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  raw: HubSpotCrmObject;
};

export function normalizeCall(c: HubSpotCrmObject): NormalizedCall {
  return {
    id: `hs-call:${c.id}`,
    provider: "hubspot",
    providerCallId: c.id,
    title: prop(c, "hs_call_title"),
    body: prop(c, "hs_call_body"),
    timestamp: prop(c, "hs_timestamp"),
    duration: prop(c, "hs_call_duration"),
    status: prop(c, "hs_call_status"),
    direction: prop(c, "hs_call_direction"),
    ownerId: prop(c, "hubspot_owner_id"),
    createdAt: c.createdAt ?? "",
    updatedAt: c.updatedAt ?? "",
    raw: c,
  };
}

export type NormalizedTask = {
  id: string;
  provider: "hubspot";
  providerTaskId: string;
  subject: string;
  body: string;
  timestamp: string;
  status: string;
  priority: string;
  type: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  raw: HubSpotCrmObject;
};

export function normalizeTask(t: HubSpotCrmObject): NormalizedTask {
  return {
    id: `hs-task:${t.id}`,
    provider: "hubspot",
    providerTaskId: t.id,
    subject: prop(t, "hs_task_subject"),
    body: prop(t, "hs_task_body"),
    timestamp: prop(t, "hs_timestamp"),
    status: prop(t, "hs_task_status"),
    priority: prop(t, "hs_task_priority"),
    type: prop(t, "hs_task_type"),
    ownerId: prop(t, "hubspot_owner_id"),
    createdAt: t.createdAt ?? "",
    updatedAt: t.updatedAt ?? "",
    raw: t,
  };
}

export type NormalizedOwner = {
  id: string;
  provider: "hubspot";
  providerOwnerId: string;
  email: string;
  firstName: string;
  lastName: string;
  userId: number | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  raw: Record<string, unknown>;
};

export function normalizeOwner(o: Record<string, unknown>): NormalizedOwner {
  const providerOwnerId = typeof o.id === "string" ? o.id : String(o.id ?? "");
  return {
    id: `hs-owner:${providerOwnerId}`,
    provider: "hubspot",
    providerOwnerId,
    email: typeof o.email === "string" ? o.email : "",
    firstName: typeof o.firstName === "string" ? o.firstName : "",
    lastName: typeof o.lastName === "string" ? o.lastName : "",
    userId: typeof o.userId === "number" ? o.userId : null,
    archived: o.archived === true,
    createdAt: typeof o.createdAt === "string" ? o.createdAt : "",
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : "",
    raw: o,
  };
}

export function parseOwnersResponse(response: unknown): { owners: NormalizedOwner[]; nextCursor: string | null } {
  if (!isRecord(response) || !Array.isArray(response.results)) return { owners: [], nextCursor: null };
  return {
    owners: response.results.filter(isRecord).map(normalizeOwner),
    nextCursor: extractAfter(response),
  };
}

export type NormalizedPipelineStage = {
  id: string;
  label: string;
  displayOrder: number;
  metadata: Record<string, unknown>;
};

export type NormalizedPipeline = {
  id: string;
  label: string;
  displayOrder: number;
  archived: boolean;
  stages: NormalizedPipelineStage[];
  raw: Record<string, unknown>;
};

export function normalizePipeline(p: Record<string, unknown>): NormalizedPipeline {
  const stages = Array.isArray(p.stages) ? p.stages.filter(isRecord).map((stage) => ({
    id: typeof stage.id === "string" ? stage.id : "",
    label: typeof stage.label === "string" ? stage.label : "",
    displayOrder: typeof stage.displayOrder === "number" ? stage.displayOrder : 0,
    metadata: isRecord(stage.metadata) ? stage.metadata : {},
  })) : [];
  return {
    id: typeof p.id === "string" ? p.id : "",
    label: typeof p.label === "string" ? p.label : "",
    displayOrder: typeof p.displayOrder === "number" ? p.displayOrder : 0,
    archived: p.archived === true,
    stages,
    raw: p,
  };
}

export function parsePipelinesResponse(response: unknown): { pipelines: NormalizedPipeline[] } {
  if (!isRecord(response) || !Array.isArray(response.results)) return { pipelines: [] };
  return { pipelines: response.results.filter(isRecord).map(normalizePipeline) };
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
