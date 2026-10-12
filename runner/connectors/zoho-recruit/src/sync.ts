/**
 * Zoho Recruit list/get/search syncs.
 *
 * jobs.list          → GET /Job_Openings  (legacy NormalizedJob)
 * candidates.list    → GET /Candidates
 * candidates.get     → GET /Candidates/{id}
 * candidates.search  → GET /Candidates/search
 * job_openings.list  → GET /Job_Openings  (NormalizedJobOpening)
 * applications.list  → GET /Applications
 * interviews.list    → GET /Interviews
 *
 * ZR-1: list syncs accept the documented cvid / converted / approved / state
 * ($state) filters; candidates.search accepts converted / approved and no longer
 * sends the undocumented `fields`. Zoho returns at most 200 records per call
 * (per_page max 200; get-records.html).
 */

import { createClient } from "./http";
import { assertSafePathSegment } from "../../_shared/jobboard";
import {
  parseJobsResponse,
  parseCandidatesResponse,
  parseCandidateGetResponse,
  parseCandidatesSearchResponse,
  parseJobOpeningsResponse,
  parseApplicationsResponse,
  parseInterviewsResponse,
  type NormalizedJob,
  type NormalizedCandidate,
  type NormalizedJobOpening,
  type NormalizedApplication,
  type NormalizedInterview,
} from "./objects";

export interface ZohoRecruitAuthInput {
  accessToken: string;
  /** Connect-time data centre (com, eu, in, com.au, jp, ca, sa, com.cn); absent → com. */
  dataCenter?: string;
  /** Zoho token-response api_domain, when the stored credentials carry it (verified, never routed to). */
  api_domain?: string;
  apiDomain?: string;
  /** Injected by tests; production leaves it unset. */
  fetch?: typeof fetch;
}

function dataCenterOf(input: ZohoRecruitAuthInput): { dataCenter: unknown; apiDomains: unknown[] } {
  return { dataCenter: input.dataCenter, apiDomains: [input.api_domain, input.apiDomain] };
}

function invalidInput(message: string): never {
  throw { ok: false, code: "INVALID_ACTION_INPUT", message };
}

/**
 * Documented record filters (get-records.html / search-records.html):
 * converted and approved take true | false | both; $state takes draft | save;
 * cvid is a custom view id (positive integer). Anything else is rejected
 * before a request is built. Booleans are accepted for converted/approved.
 */
export interface ZohoRecruitRecordFilters {
  converted?: string | boolean;
  approved?: string | boolean;
}

export interface ZohoRecruitListFilters extends ZohoRecruitRecordFilters {
  cvid?: string | number;
  /** Sent as Zoho's `$state`. */
  state?: string;
}

function triState(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = typeof value === "boolean" ? String(value) : value;
  if (text === "true" || text === "false" || text === "both") return text;
  return invalidInput(`${field} must be one of: true, false, both`);
}

function recordFilterQuery(input: ZohoRecruitRecordFilters): Record<string, string | undefined> {
  return { converted: triState(input.converted, "converted"), approved: triState(input.approved, "approved") };
}

function listFilterQuery(input: ZohoRecruitListFilters): Record<string, string | undefined> {
  let cvid: string | undefined;
  if (input.cvid !== undefined && input.cvid !== null) {
    const text = typeof input.cvid === "number" ? (Number.isSafeInteger(input.cvid) ? String(input.cvid) : "") : input.cvid;
    if (typeof text !== "string" || !/^[1-9][0-9]{0,19}$/.test(text)) invalidInput("cvid must be a positive integer custom view id");
    cvid = text;
  }
  let state: string | undefined;
  if (input.state !== undefined && input.state !== null) {
    if (input.state !== "draft" && input.state !== "save") invalidInput("state must be one of: draft, save");
    state = input.state;
  }
  return { cvid, ...recordFilterQuery(input), $state: state };
}

function buildQuery(params: Record<string, string | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== "") qs.set(key, value);
  }
  const encoded = qs.toString();
  return encoded.length > 0 ? `?${encoded}` : "";
}

// ---------------------------------------------------------------------------
// jobs.list — legacy NormalizedJob from Job_Openings
// ---------------------------------------------------------------------------

export interface ExecuteJobsListSyncInput extends ZohoRecruitAuthInput {
  page?: number;
  perPage?: number;
}

export interface ExecuteJobsListSyncOutput {
  provider: "zoho-recruit";
  operation: "jobs.list";
  items: NormalizedJob[];
  total: number | null;
  hasMore: boolean;
  page: number | null;
}

export async function executeJobsListSync(
  input: ExecuteJobsListSyncInput,
): Promise<ExecuteJobsListSyncOutput> {
  const client = createClient({
    accessToken: input.accessToken,
    ...dataCenterOf(input),
    fetch: input.fetch,
    operation: "jobs.list",
  });
  const path =
    "/Job_Openings" +
    buildQuery({
      page: input.page != null ? String(input.page) : undefined,
      per_page: input.perPage != null ? String(input.perPage) : undefined,
    });
  const raw = await client.getJSON(path);
  const parsed = parseJobsResponse(raw);
  return {
    provider: "zoho-recruit",
    operation: "jobs.list",
    items: parsed.jobs,
    total: parsed.total,
    hasMore: parsed.hasMore,
    page: parsed.page,
  };
}

// ---------------------------------------------------------------------------
// candidates.list — GET /Candidates
// ---------------------------------------------------------------------------

export interface ExecuteCandidatesListSyncInput extends ZohoRecruitAuthInput, ZohoRecruitListFilters {
  page?: number;
  perPage?: number;
  fields?: string;
  sortBy?: string;
  sortOrder?: string;
}

export interface ExecuteCandidatesListSyncOutput {
  provider: "zoho-recruit";
  operation: "candidates.list";
  items: NormalizedCandidate[];
  total: number | null;
  hasMore: boolean;
  page: number | null;
}

export async function executeCandidatesListSync(
  input: ExecuteCandidatesListSyncInput,
): Promise<ExecuteCandidatesListSyncOutput> {
  const filters = listFilterQuery(input);
  const client = createClient({
    accessToken: input.accessToken,
    ...dataCenterOf(input),
    fetch: input.fetch,
    operation: "candidates.list",
  });
  const path =
    "/Candidates" +
    buildQuery({
      page: input.page != null ? String(input.page) : undefined,
      per_page: input.perPage != null ? String(input.perPage) : undefined,
      fields: input.fields,
      sort_by: input.sortBy,
      sort_order: input.sortOrder,
      ...filters,
    });
  const raw = await client.getJSON(path);
  const parsed = parseCandidatesResponse(raw);
  return {
    provider: "zoho-recruit",
    operation: "candidates.list",
    items: parsed.candidates,
    total: parsed.total,
    hasMore: parsed.hasMore,
    page: parsed.page,
  };
}

// ---------------------------------------------------------------------------
// job_openings.list — GET /Job_Openings
// ---------------------------------------------------------------------------

export interface ExecuteJobOpeningsListSyncInput extends ZohoRecruitAuthInput, ZohoRecruitListFilters {
  page?: number;
  perPage?: number;
  fields?: string;
  sortBy?: string;
  sortOrder?: string;
}

export interface ExecuteJobOpeningsListSyncOutput {
  provider: "zoho-recruit";
  operation: "job_openings.list";
  items: NormalizedJobOpening[];
  total: number | null;
  hasMore: boolean;
  page: number | null;
}

export async function executeJobOpeningsListSync(
  input: ExecuteJobOpeningsListSyncInput,
): Promise<ExecuteJobOpeningsListSyncOutput> {
  const filters = listFilterQuery(input);
  const client = createClient({
    accessToken: input.accessToken,
    ...dataCenterOf(input),
    fetch: input.fetch,
    operation: "job_openings.list",
  });
  const path =
    "/Job_Openings" +
    buildQuery({
      page: input.page != null ? String(input.page) : undefined,
      per_page: input.perPage != null ? String(input.perPage) : undefined,
      fields: input.fields,
      sort_by: input.sortBy,
      sort_order: input.sortOrder,
      ...filters,
    });
  const raw = await client.getJSON(path);
  const parsed = parseJobOpeningsResponse(raw);
  return {
    provider: "zoho-recruit",
    operation: "job_openings.list",
    items: parsed.jobOpenings,
    total: parsed.total,
    hasMore: parsed.hasMore,
    page: parsed.page,
  };
}

// ---------------------------------------------------------------------------
// applications.list — GET /Applications
// ---------------------------------------------------------------------------

export interface ExecuteApplicationsListSyncInput extends ZohoRecruitAuthInput, ZohoRecruitListFilters {
  page?: number;
  perPage?: number;
  fields?: string;
  sortBy?: string;
  sortOrder?: string;
}

export interface ExecuteApplicationsListSyncOutput {
  provider: "zoho-recruit";
  operation: "applications.list";
  items: NormalizedApplication[];
  total: number | null;
  hasMore: boolean;
  page: number | null;
}

export async function executeApplicationsListSync(
  input: ExecuteApplicationsListSyncInput,
): Promise<ExecuteApplicationsListSyncOutput> {
  const filters = listFilterQuery(input);
  const client = createClient({
    accessToken: input.accessToken,
    ...dataCenterOf(input),
    fetch: input.fetch,
    operation: "applications.list",
  });
  const path =
    "/Applications" +
    buildQuery({
      page: input.page != null ? String(input.page) : undefined,
      per_page: input.perPage != null ? String(input.perPage) : undefined,
      fields: input.fields,
      sort_by: input.sortBy,
      sort_order: input.sortOrder,
      ...filters,
    });
  const raw = await client.getJSON(path);
  const parsed = parseApplicationsResponse(raw);
  return {
    provider: "zoho-recruit",
    operation: "applications.list",
    items: parsed.applications,
    total: parsed.total,
    hasMore: parsed.hasMore,
    page: parsed.page,
  };
}


// ---------------------------------------------------------------------------
// candidates.get — GET /Candidates/{id}
// ---------------------------------------------------------------------------

export interface ExecuteCandidatesGetSyncInput extends ZohoRecruitAuthInput {
  /** Zoho Recruit candidate record id. */
  id: string;
  fields?: string;
}

export interface ExecuteCandidatesGetSyncOutput {
  provider: "zoho-recruit";
  operation: "candidates.get";
  candidate: NormalizedCandidate | null;
}

export async function executeCandidatesGetSync(
  input: ExecuteCandidatesGetSyncInput,
): Promise<ExecuteCandidatesGetSyncOutput> {
  const id = assertSafePathSegment(input.id, "id");
  const client = createClient({
    accessToken: input.accessToken,
    ...dataCenterOf(input),
    fetch: input.fetch,
    operation: "candidates.get",
  });
  const path =
    `/Candidates/${id}` +
    buildQuery({
      fields: input.fields,
    });
  const raw = await client.getJSON(path);
  const parsed = parseCandidateGetResponse(raw);
  return {
    provider: "zoho-recruit",
    operation: "candidates.get",
    candidate: parsed.candidate,
  };
}

// ---------------------------------------------------------------------------
// candidates.search — GET /Candidates/search
// ---------------------------------------------------------------------------

export interface ExecuteCandidatesSearchSyncInput extends ZohoRecruitAuthInput, ZohoRecruitRecordFilters {
  /** Zoho criteria string, e.g. `(Last_Name:contains:Smith)`. */
  criteria?: string;
  email?: string;
  phone?: string;
  /** Global word search (Zoho `word` param). */
  word?: string;
  page?: number;
  perPage?: number;
  /**
   * Ignored. `fields` is not a documented search parameter (search-records.html),
   * so it is no longer sent (ZR-1); still accepted so existing callers keep working.
   */
  fields?: string;
}

export interface ExecuteCandidatesSearchSyncOutput {
  provider: "zoho-recruit";
  operation: "candidates.search";
  items: NormalizedCandidate[];
  total: number | null;
  hasMore: boolean;
  page: number | null;
}

export async function executeCandidatesSearchSync(
  input: ExecuteCandidatesSearchSyncInput,
): Promise<ExecuteCandidatesSearchSyncOutput> {
  const filters = recordFilterQuery(input);
  const client = createClient({
    accessToken: input.accessToken,
    ...dataCenterOf(input),
    fetch: input.fetch,
    operation: "candidates.search",
  });
  const path =
    "/Candidates/search" +
    buildQuery({
      criteria: input.criteria,
      email: input.email,
      phone: input.phone,
      word: input.word,
      page: input.page != null ? String(input.page) : undefined,
      per_page: input.perPage != null ? String(input.perPage) : undefined,
      ...filters,
    });
  const raw = await client.getJSON(path);
  const parsed = parseCandidatesSearchResponse(raw);
  return {
    provider: "zoho-recruit",
    operation: "candidates.search",
    items: parsed.candidates,
    total: parsed.total,
    hasMore: parsed.hasMore,
    page: parsed.page,
  };
}

// ---------------------------------------------------------------------------
// interviews.list — GET /Interviews
// ---------------------------------------------------------------------------

export interface ExecuteInterviewsListSyncInput extends ZohoRecruitAuthInput, ZohoRecruitListFilters {
  page?: number;
  perPage?: number;
  fields?: string;
  sortBy?: string;
  sortOrder?: string;
}

export interface ExecuteInterviewsListSyncOutput {
  provider: "zoho-recruit";
  operation: "interviews.list";
  items: NormalizedInterview[];
  total: number | null;
  hasMore: boolean;
  page: number | null;
}

export async function executeInterviewsListSync(
  input: ExecuteInterviewsListSyncInput,
): Promise<ExecuteInterviewsListSyncOutput> {
  const filters = listFilterQuery(input);
  const client = createClient({
    accessToken: input.accessToken,
    ...dataCenterOf(input),
    fetch: input.fetch,
    operation: "interviews.list",
  });
  const path =
    "/Interviews" +
    buildQuery({
      page: input.page != null ? String(input.page) : undefined,
      per_page: input.perPage != null ? String(input.perPage) : undefined,
      fields: input.fields,
      sort_by: input.sortBy,
      sort_order: input.sortOrder,
      ...filters,
    });
  const raw = await client.getJSON(path);
  const parsed = parseInterviewsResponse(raw);
  return {
    provider: "zoho-recruit",
    operation: "interviews.list",
    items: parsed.interviews,
    total: parsed.total,
    hasMore: parsed.hasMore,
    page: parsed.page,
  };
}
