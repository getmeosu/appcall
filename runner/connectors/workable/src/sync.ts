/**
 * Workable list/get syncs.
 *
 * jobs.list       → SPI GET /jobs
 * jobs.get        → SPI GET /jobs/{shortcode}
 * candidates.list → SPI GET /candidates
 * candidates.get  → SPI GET /candidates/{id}
 * stages.list     → SPI GET /stages
 * members.list    → SPI GET /members
 * events.list     → SPI GET /events
 */

import { createClient } from "./http";
import { assertSafePathSegment } from "../../_shared/jobboard";
import {
  parseJobsResponse,
  parseJobGetResponse,
  parseCandidatesResponse,
  parseCandidateGetResponse,
  parseStagesResponse,
  parseMembersResponse,
  parseEventsResponse,
  type NormalizedJob,
  type NormalizedCandidate,
  type NormalizedStage,
  type NormalizedMember,
  type NormalizedEvent,
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
// jobs.get — SPI /jobs/{shortcode}
// ---------------------------------------------------------------------------

export interface ExecuteJobsGetSyncInput extends WorkableAuthInput {
  /** Workable job shortcode (path param). */
  shortcode: string;
}

export interface ExecuteJobsGetSyncOutput {
  job: NormalizedJob | null;
}

export async function executeJobsGetSync(
  input: ExecuteJobsGetSyncInput,
): Promise<ExecuteJobsGetSyncOutput> {
  const shortcode = assertSafePathSegment(input.shortcode, "shortcode");
  const client = createClient({
    account: input.account,
    accessToken: input.accessToken,
    fetch: input.fetch,
    operation: "jobs.get",
  });
  const raw = await client.getJSON(`/jobs/${shortcode}`);
  return parseJobGetResponse(raw);
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
// candidates.get — SPI /candidates/{id}
// ---------------------------------------------------------------------------

export interface ExecuteCandidatesGetSyncInput extends WorkableAuthInput {
  /** Workable candidate id. */
  id: string;
}

export interface ExecuteCandidatesGetSyncOutput {
  candidate: NormalizedCandidate | null;
}

export async function executeCandidatesGetSync(
  input: ExecuteCandidatesGetSyncInput,
): Promise<ExecuteCandidatesGetSyncOutput> {
  const id = assertSafePathSegment(input.id, "id");
  const client = createClient({
    account: input.account,
    accessToken: input.accessToken,
    fetch: input.fetch,
    operation: "candidates.get",
  });
  const raw = await client.getJSON(`/candidates/${id}`);
  return parseCandidateGetResponse(raw);
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

// ---------------------------------------------------------------------------
// events.list — SPI /events
// ---------------------------------------------------------------------------

export interface ExecuteEventsListSyncInput extends WorkableAuthInput {
  type?: string;
  limit?: number;
  sinceId?: string;
  maxId?: string;
  startDate?: string;
  endDate?: string;
  candidateId?: string;
  shortcode?: string;
  memberId?: string;
  context?: string;
  includeCancelled?: boolean;
}

export interface ExecuteEventsListSyncOutput {
  events: NormalizedEvent[];
}

export async function executeEventsListSync(
  input: ExecuteEventsListSyncInput,
): Promise<ExecuteEventsListSyncOutput> {
  const client = createClient({
    account: input.account,
    accessToken: input.accessToken,
    fetch: input.fetch,
    operation: "events.list",
  });
  const path =
    "/events" +
    buildQuery({
      type: input.type,
      limit: input.limit != null ? String(input.limit) : undefined,
      since_id: input.sinceId,
      max_id: input.maxId,
      start_date: input.startDate,
      end_date: input.endDate,
      candidate_id: input.candidateId,
      shortcode: input.shortcode,
      member_id: input.memberId,
      context: input.context,
      include_cancelled:
        input.includeCancelled == null ? undefined : input.includeCancelled ? "true" : "false",
    });
  const raw = await client.getJSON(path);
  return parseEventsResponse(raw);
}
