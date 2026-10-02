/**
 * SmartRecruiters list/get syncs.
 *
 * jobs.list          → public GET /v1/companies/{company}/postings
 * postings.list      → public GET /v1/companies/{company}/postings (filtered)
 * jobs.get           → authenticated GET /jobs/{id}
 * candidates.list    → authenticated GET /candidates
 * candidates.get     → authenticated GET /candidates/{id}
 * users.list         → authenticated GET /users
 * interviews.list    → authenticated GET /interviews-api/v201904/interviews
 */

import { createClient, createAuthClient } from "./http";
import { assertSafePathSegment } from "../../_shared/jobboard";
import {
  parseJobsResponse,
  parsePostingsResponse,
  parseJobGetResponse,
  parseCandidatesResponse,
  parseCandidateDetailsResponse,
  parseUsersResponse,
  parseInterviewsResponse,
  type NormalizedJob,
  type NormalizedCandidate,
  type NormalizedUser,
  type NormalizedInterview,
} from "./objects";

export interface ExecuteJobsListSyncInput {
  company: string;
  /** Injected by tests; production leaves it unset. */
  fetch?: typeof fetch;
}

export interface ExecuteJobsListSyncOutput {
  jobs: NormalizedJob[];
  total: number | null;
}

export async function executeJobsListSync(
  input: ExecuteJobsListSyncInput,
): Promise<ExecuteJobsListSyncOutput> {
  const client = createClient({ company: input.company, fetch: input.fetch });
  const raw = await client.getJSON("/postings");
  const parsed = parseJobsResponse(raw);
  return { jobs: parsed.jobs, total: parsed.total };
}

export interface SmartRecruitersAuthInput {
  apiKey: string;
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
// postings.list — public GET /v1/companies/{company}/postings (with filters)
// ---------------------------------------------------------------------------

export interface ExecutePostingsListSyncInput {
  company: string;
  q?: string;
  limit?: number;
  offset?: number;
  country?: string;
  region?: string;
  city?: string;
  department?: string;
  /** Injected by tests; production leaves it unset. */
  fetch?: typeof fetch;
}

export interface ExecutePostingsListSyncOutput {
  postings: NormalizedJob[];
  total: number | null;
}

export async function executePostingsListSync(
  input: ExecutePostingsListSyncInput,
): Promise<ExecutePostingsListSyncOutput> {
  const client = createClient({ company: input.company, fetch: input.fetch });
  const path =
    "/postings" +
    buildQuery({
      q: input.q,
      limit: input.limit != null ? String(input.limit) : undefined,
      offset: input.offset != null ? String(input.offset) : undefined,
      country: input.country,
      region: input.region,
      city: input.city,
      department: input.department,
    });
  const raw = await client.getJSON(path);
  return parsePostingsResponse(raw);
}

// ---------------------------------------------------------------------------
// jobs.get — authenticated GET /jobs/{id}
// ---------------------------------------------------------------------------

export interface ExecuteJobsGetSyncInput extends SmartRecruitersAuthInput {
  /** SmartRecruiters job id. */
  id: string;
}

export interface ExecuteJobsGetSyncOutput {
  job: NormalizedJob | null;
}

export async function executeJobsGetSync(
  input: ExecuteJobsGetSyncInput,
): Promise<ExecuteJobsGetSyncOutput> {
  const id = assertSafePathSegment(input.id, "id");
  const client = createAuthClient({
    apiKey: input.apiKey,
    fetch: input.fetch,
    operation: "jobs.get",
  });
  const raw = await client.getJSON(`/jobs/${id}`);
  return parseJobGetResponse(raw);
}

// ---------------------------------------------------------------------------
// candidates.list — GET /candidates
// ---------------------------------------------------------------------------

export interface ExecuteCandidatesListSyncInput extends SmartRecruitersAuthInput {
  limit?: number;
  pageId?: string;
  q?: string;
  jobId?: string;
  updatedAfter?: string;
  status?: string;
}

export interface ExecuteCandidatesListSyncOutput {
  candidates: NormalizedCandidate[];
  total: number | null;
  nextPageId: string | null;
}

export async function executeCandidatesListSync(
  input: ExecuteCandidatesListSyncInput,
): Promise<ExecuteCandidatesListSyncOutput> {
  const client = createAuthClient({
    apiKey: input.apiKey,
    fetch: input.fetch,
    operation: "candidates.list",
  });
  const path =
    "/candidates" +
    buildQuery({
      limit: input.limit != null ? String(input.limit) : undefined,
      pageId: input.pageId,
      q: input.q,
      jobId: input.jobId,
      updatedAfter: input.updatedAfter,
      status: input.status,
    });
  const raw = await client.getJSON(path);
  return parseCandidatesResponse(raw);
}

// ---------------------------------------------------------------------------
// candidates.get — GET /candidates/{id}
// ---------------------------------------------------------------------------

export interface ExecuteCandidatesGetSyncInput extends SmartRecruitersAuthInput {
  /** SmartRecruiters candidate id. */
  id: string;
}

export interface ExecuteCandidatesGetSyncOutput {
  candidate: NormalizedCandidate | null;
}

export async function executeCandidatesGetSync(
  input: ExecuteCandidatesGetSyncInput,
): Promise<ExecuteCandidatesGetSyncOutput> {
  const id = assertSafePathSegment(input.id, "id");
  const client = createAuthClient({
    apiKey: input.apiKey,
    fetch: input.fetch,
    operation: "candidates.get",
  });
  const raw = await client.getJSON(`/candidates/${id}`);
  return parseCandidateDetailsResponse(raw);
}

// ---------------------------------------------------------------------------
// users.list — GET /users
// ---------------------------------------------------------------------------

export interface ExecuteUsersListSyncInput extends SmartRecruitersAuthInput {
  limit?: number;
  offset?: number;
  q?: string;
  updatedAfter?: string;
}

export interface ExecuteUsersListSyncOutput {
  users: NormalizedUser[];
  total: number | null;
}

export async function executeUsersListSync(
  input: ExecuteUsersListSyncInput,
): Promise<ExecuteUsersListSyncOutput> {
  const client = createAuthClient({
    apiKey: input.apiKey,
    fetch: input.fetch,
    operation: "users.list",
  });
  const path =
    "/users" +
    buildQuery({
      limit: input.limit != null ? String(input.limit) : undefined,
      offset: input.offset != null ? String(input.offset) : undefined,
      q: input.q,
      updatedAfter: input.updatedAfter,
    });
  const raw = await client.getJSON(path);
  return parseUsersResponse(raw);
}

// ---------------------------------------------------------------------------
// interviews.list — GET /interviews-api/v201904/interviews
// ---------------------------------------------------------------------------

export interface ExecuteInterviewsListSyncInput extends SmartRecruitersAuthInput {
  /** Required application id (GUID) — Interviews API requires applicationId. */
  applicationId: string;
}

export interface ExecuteInterviewsListSyncOutput {
  interviews: NormalizedInterview[];
}

export async function executeInterviewsListSync(
  input: ExecuteInterviewsListSyncInput,
): Promise<ExecuteInterviewsListSyncOutput> {
  if (typeof input.applicationId !== "string" || input.applicationId.length === 0) {
    throw new Error("applicationId is required");
  }
  const client = createAuthClient({
    apiKey: input.apiKey,
    fetch: input.fetch,
    operation: "interviews.list",
  });
  const path =
    "/interviews-api/v201904/interviews" +
    buildQuery({
      applicationId: input.applicationId,
    });
  const raw = await client.getJSON(path);
  return parseInterviewsResponse(raw);
}
