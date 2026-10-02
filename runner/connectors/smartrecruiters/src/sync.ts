/**
 * SmartRecruiters list/get syncs.
 *
 * jobs.list          → public GET /v1/companies/{company}/postings
 * candidates.list    → authenticated GET /candidates
 * candidates.get     → authenticated GET /candidates/{id}
 * users.list         → authenticated GET /users
 */

import { createClient, createAuthClient } from "./http";
import { assertSafePathSegment } from "../../_shared/jobboard";
import {
  parseJobsResponse,
  parseCandidatesResponse,
  parseCandidateDetailsResponse,
  parseUsersResponse,
  type NormalizedJob,
  type NormalizedCandidate,
  type NormalizedUser,
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
  return parseJobsResponse(raw);
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
