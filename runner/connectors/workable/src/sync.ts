/**
 * Workable list syncs.
 *
 * jobs.list       → SPI GET /jobs
 * candidates.list → SPI GET /candidates
 * stages.list     → SPI GET /stages
 * members.list    → SPI GET /members
 */

import { createClient } from "./http";
import {
  parseJobsResponse,
  parseCandidatesResponse,
  parseStagesResponse,
  parseMembersResponse,
  type NormalizedJob,
  type NormalizedCandidate,
  type NormalizedStage,
  type NormalizedMember,
} from "./objects";

export interface WorkableAuthInput {
  account: string;
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
// jobs.list
// ---------------------------------------------------------------------------

export interface ExecuteJobsListSyncInput extends WorkableAuthInput {}

export interface ExecuteJobsListSyncOutput {
  jobs: NormalizedJob[];
}

export async function executeJobsListSync(
  input: ExecuteJobsListSyncInput,
): Promise<ExecuteJobsListSyncOutput> {
  const client = createClient({
    account: input.account,
    accessToken: input.accessToken,
    fetch: input.fetch,
    operation: "jobs.list",
  });
  const raw = await client.getJSON("/jobs");
  return { jobs: parseJobsResponse(raw) };
}

// ---------------------------------------------------------------------------
// candidates.list
// ---------------------------------------------------------------------------

export interface ExecuteCandidatesListSyncInput extends WorkableAuthInput {
  email?: string;
  shortcode?: string;
  stage?: string;
  limit?: number;
  sinceId?: string;
  maxId?: string;
  createdAfter?: string;
  updatedAfter?: string;
}

export interface ExecuteCandidatesListSyncOutput {
  candidates: NormalizedCandidate[];
  next: string | null;
}

export async function executeCandidatesListSync(
  input: ExecuteCandidatesListSyncInput,
): Promise<ExecuteCandidatesListSyncOutput> {
  const client = createClient({
    account: input.account,
    accessToken: input.accessToken,
    fetch: input.fetch,
    operation: "candidates.list",
  });
  const path =
    "/candidates" +
    buildQuery({
      email: input.email,
      shortcode: input.shortcode,
      stage: input.stage,
      limit: input.limit != null ? String(input.limit) : undefined,
      since_id: input.sinceId,
      max_id: input.maxId,
      created_after: input.createdAfter,
      updated_after: input.updatedAfter,
    });
  const raw = await client.getJSON(path);
  return parseCandidatesResponse(raw);
}

// ---------------------------------------------------------------------------
// stages.list
// ---------------------------------------------------------------------------

export interface ExecuteStagesListSyncInput extends WorkableAuthInput {}

export interface ExecuteStagesListSyncOutput {
  stages: NormalizedStage[];
}

export async function executeStagesListSync(
  input: ExecuteStagesListSyncInput,
): Promise<ExecuteStagesListSyncOutput> {
  const client = createClient({
    account: input.account,
    accessToken: input.accessToken,
    fetch: input.fetch,
    operation: "stages.list",
  });
  const raw = await client.getJSON("/stages");
  return parseStagesResponse(raw);
}

// ---------------------------------------------------------------------------
// members.list
// ---------------------------------------------------------------------------

export interface ExecuteMembersListSyncInput extends WorkableAuthInput {
  limit?: number;
  sinceId?: string;
  maxId?: string;
  role?: string;
  shortcode?: string;
  email?: string;
  name?: string;
  status?: string;
}

export interface ExecuteMembersListSyncOutput {
  members: NormalizedMember[];
}

export async function executeMembersListSync(
  input: ExecuteMembersListSyncInput,
): Promise<ExecuteMembersListSyncOutput> {
  const client = createClient({
    account: input.account,
    accessToken: input.accessToken,
    fetch: input.fetch,
    operation: "members.list",
  });
  const path =
    "/members" +
    buildQuery({
      limit: input.limit != null ? String(input.limit) : undefined,
      since_id: input.sinceId,
      max_id: input.maxId,
      role: input.role,
      shortcode: input.shortcode,
      email: input.email,
      name: input.name,
      status: input.status,
    });
  const raw = await client.getJSON(path);
  return parseMembersResponse(raw);
}
