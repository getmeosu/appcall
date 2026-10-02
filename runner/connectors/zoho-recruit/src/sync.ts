/**
 * Zoho Recruit list syncs.
 *
 * jobs.list          → GET /Job_Openings  (legacy NormalizedJob)
 * candidates.list    → GET /Candidates
 * job_openings.list  → GET /Job_Openings  (NormalizedJobOpening)
 * applications.list  → GET /Applications
 */

import { createClient } from "./http";
import {
  parseJobsResponse,
  parseCandidatesResponse,
  parseJobOpeningsResponse,
  parseApplicationsResponse,
  type NormalizedJob,
  type NormalizedCandidate,
  type NormalizedJobOpening,
  type NormalizedApplication,
} from "./objects";

export interface ZohoRecruitAuthInput {
  accessToken: string;
  /** Injected by tests; production leaves it unset. */
  fetch?: typeof fetch;
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

export interface ExecuteCandidatesListSyncInput extends ZohoRecruitAuthInput {
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
  const client = createClient({
    accessToken: input.accessToken,
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

export interface ExecuteJobOpeningsListSyncInput extends ZohoRecruitAuthInput {
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
  const client = createClient({
    accessToken: input.accessToken,
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

export interface ExecuteApplicationsListSyncInput extends ZohoRecruitAuthInput {
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
  const client = createClient({
    accessToken: input.accessToken,
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
