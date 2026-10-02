/**
 * Greenhouse list/get syncs.
 *
 * jobs.list          → public GET /v1/boards/{boardToken}/jobs
 * jobs.get           → authenticated Harvest GET /v1/jobs/{id}
 * candidates.list    → authenticated GET /v1/candidates
 * candidates.get     → authenticated GET /v1/candidates/{id}
 * applications.list  → authenticated GET /v1/applications
 * users.list         → authenticated GET /v1/users
 * interviews.list    → authenticated GET /v1/scheduled_interviews
 */

import { createClient, createAuthClient } from "./http";
import { assertSafePathSegment } from "../../_shared/jobboard";
import {
  parseJobsResponse,
  parseJobGetResponse,
  parseCandidatesResponse,
  parseCandidateGetResponse,
  parseApplicationsResponse,
  parseUsersResponse,
  parseInterviewsResponse,
  type NormalizedJob,
  type NormalizedCandidate,
  type NormalizedApplication,
  type NormalizedUser,
  type NormalizedInterview,
} from "./objects";

export interface ExecuteJobsListSyncInput {
  boardToken: string;
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
  const client = createClient({ boardToken: input.boardToken, fetch: input.fetch });
  const raw = await client.getJSON("/jobs");
  return parseJobsResponse(raw);
}

export interface GreenhouseAuthInput {
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
// candidates.list — GET /v1/candidates
// ---------------------------------------------------------------------------

export interface ExecuteCandidatesListSyncInput extends GreenhouseAuthInput {
  perPage?: number;
  page?: number;
  createdBefore?: string;
  createdAfter?: string;
  updatedBefore?: string;
  updatedAfter?: string;
  jobId?: string | number;
  email?: string;
  candidateIds?: string;
}

export interface ExecuteCandidatesListSyncOutput {
  candidates: NormalizedCandidate[];
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
      per_page: input.perPage != null ? String(input.perPage) : undefined,
      page: input.page != null ? String(input.page) : undefined,
      created_before: input.createdBefore,
      created_after: input.createdAfter,
      updated_before: input.updatedBefore,
      updated_after: input.updatedAfter,
      job_id: input.jobId != null ? String(input.jobId) : undefined,
      email: input.email,
      candidate_ids: input.candidateIds,
    });
  const raw = await client.getJSON(path);
  return parseCandidatesResponse(raw);
}

// ---------------------------------------------------------------------------
// candidates.get — GET /v1/candidates/{id}
// ---------------------------------------------------------------------------

export interface ExecuteCandidatesGetSyncInput extends GreenhouseAuthInput {
  /** Harvest candidate id. */
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
  return parseCandidateGetResponse(raw);
}

// ---------------------------------------------------------------------------
// applications.list — GET /v1/applications
// ---------------------------------------------------------------------------

export interface ExecuteApplicationsListSyncInput extends GreenhouseAuthInput {
  perPage?: number;
  page?: number;
  createdBefore?: string;
  createdAfter?: string;
  lastActivityAfter?: string;
  jobId?: string | number;
  status?: string;
}

export interface ExecuteApplicationsListSyncOutput {
  applications: NormalizedApplication[];
}

export async function executeApplicationsListSync(
  input: ExecuteApplicationsListSyncInput,
): Promise<ExecuteApplicationsListSyncOutput> {
  const client = createAuthClient({
    apiKey: input.apiKey,
    fetch: input.fetch,
    operation: "applications.list",
  });
  const path =
    "/applications" +
    buildQuery({
      per_page: input.perPage != null ? String(input.perPage) : undefined,
      page: input.page != null ? String(input.page) : undefined,
      created_before: input.createdBefore,
      created_after: input.createdAfter,
      last_activity_after: input.lastActivityAfter,
      job_id: input.jobId != null ? String(input.jobId) : undefined,
      status: input.status,
    });
  const raw = await client.getJSON(path);
  return parseApplicationsResponse(raw);
}

// ---------------------------------------------------------------------------
// users.list — GET /v1/users
// ---------------------------------------------------------------------------

export interface ExecuteUsersListSyncInput extends GreenhouseAuthInput {
  perPage?: number;
  page?: number;
  email?: string;
  employeeId?: string;
  createdBefore?: string;
  createdAfter?: string;
  updatedBefore?: string;
  updatedAfter?: string;
}

export interface ExecuteUsersListSyncOutput {
  users: NormalizedUser[];
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
      per_page: input.perPage != null ? String(input.perPage) : undefined,
      page: input.page != null ? String(input.page) : undefined,
      email: input.email,
      employee_id: input.employeeId,
      created_before: input.createdBefore,
      created_after: input.createdAfter,
      updated_before: input.updatedBefore,
      updated_after: input.updatedAfter,
    });
  const raw = await client.getJSON(path);
  return parseUsersResponse(raw);
}

// ---------------------------------------------------------------------------
// jobs.get — Harvest GET /v1/jobs/{id} (NOT boards)
// ---------------------------------------------------------------------------

export interface ExecuteJobsGetSyncInput extends GreenhouseAuthInput {
  /** Harvest job id. */
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
// interviews.list — GET /v1/scheduled_interviews
// ---------------------------------------------------------------------------

export interface ExecuteInterviewsListSyncInput extends GreenhouseAuthInput {
  perPage?: number;
  page?: number;
  applicationId?: string | number;
  jobId?: string | number;
  createdBefore?: string;
  createdAfter?: string;
  updatedBefore?: string;
  updatedAfter?: string;
}

export interface ExecuteInterviewsListSyncOutput {
  interviews: NormalizedInterview[];
}

export async function executeInterviewsListSync(
  input: ExecuteInterviewsListSyncInput,
): Promise<ExecuteInterviewsListSyncOutput> {
  const client = createAuthClient({
    apiKey: input.apiKey,
    fetch: input.fetch,
    operation: "interviews.list",
  });
  const path =
    "/scheduled_interviews" +
    buildQuery({
      per_page: input.perPage != null ? String(input.perPage) : undefined,
      page: input.page != null ? String(input.page) : undefined,
      application_id: input.applicationId != null ? String(input.applicationId) : undefined,
      job_id: input.jobId != null ? String(input.jobId) : undefined,
      created_before: input.createdBefore,
      created_after: input.createdAfter,
      updated_before: input.updatedBefore,
      updated_after: input.updatedAfter,
    });
  const raw = await client.getJSON(path);
  return parseInterviewsResponse(raw);
}
