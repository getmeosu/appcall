/**
 * Lever syncs.
 *
 * jobs.list                     → public GET /v0/postings/{site}
 * opportunities.list            → authenticated GET /v1/opportunities
 * opportunities.get             → authenticated GET /v1/opportunities/{id}
 * opportunities.interviews.list → authenticated GET /v1/opportunities/{id}/interviews
 * opportunities.feedback.list   → authenticated GET /v1/opportunities/{id}/feedback
 * stages.list                   → authenticated GET /v1/stages
 * users.list                    → authenticated GET /v1/users
 */

import { createClient, createAuthClient } from "./http";
import { assertSafePathSegment } from "../../_shared/jobboard";
import {
  parseJobsResponse,
  parseOpportunitiesResponse,
  parseOpportunityGetResponse,
  parseInterviewsResponse,
  parseFeedbackResponse,
  parseStagesResponse,
  parseUsersResponse,
  type NormalizedJob,
  type NormalizedOpportunity,
  type NormalizedInterview,
  type NormalizedFeedback,
  type NormalizedStage,
  type NormalizedUser,
} from "./objects";

export interface ExecuteJobsListSyncInput {
  site: string;
  /** Injected by tests; production leaves it unset. */
  fetch?: typeof fetch;
}

export interface ExecuteJobsListSyncOutput {
  jobs: NormalizedJob[];
}

export async function executeJobsListSync(
  input: ExecuteJobsListSyncInput,
): Promise<ExecuteJobsListSyncOutput> {
  const client = createClient({ site: input.site, fetch: input.fetch });
  const raw = await client.getJSON();
  return { jobs: parseJobsResponse(raw) };
}

export interface LeverAuthInput {
  apiKey: string;
  region: string;
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
// opportunities.list
// ---------------------------------------------------------------------------

export interface ExecuteOpportunitiesListSyncInput extends LeverAuthInput {
  limit?: number;
  offset?: string;
  email?: string;
  tag?: string;
  stageId?: string;
  postingId?: string;
  /** Lever accepts "true" | "false" | "all". */
  archived?: string;
}

export interface ExecuteOpportunitiesListSyncOutput {
  opportunities: NormalizedOpportunity[];
  next: string | null;
  hasNext: boolean;
}

export async function executeOpportunitiesListSync(
  input: ExecuteOpportunitiesListSyncInput,
): Promise<ExecuteOpportunitiesListSyncOutput> {
  const client = createAuthClient({
    apiKey: input.apiKey,
    region: input.region,
    fetch: input.fetch,
    operation: "opportunities.list",
  });
  const path =
    "/opportunities" +
    buildQuery({
      limit: input.limit != null ? String(input.limit) : undefined,
      offset: input.offset,
      email: input.email,
      tag: input.tag,
      stage_id: input.stageId,
      posting_id: input.postingId,
      archived: input.archived,
    });
  const raw = await client.getJSON(path);
  return parseOpportunitiesResponse(raw);
}

// ---------------------------------------------------------------------------
// opportunities.get — GET /v1/opportunities/{id}
// ---------------------------------------------------------------------------

export interface ExecuteOpportunitiesGetSyncInput extends LeverAuthInput {
  /** Lever opportunity UID. */
  id: string;
}

export interface ExecuteOpportunitiesGetSyncOutput {
  opportunity: NormalizedOpportunity | null;
}

export async function executeOpportunitiesGetSync(
  input: ExecuteOpportunitiesGetSyncInput,
): Promise<ExecuteOpportunitiesGetSyncOutput> {
  const id = assertSafePathSegment(input.id, "id");
  const client = createAuthClient({
    apiKey: input.apiKey,
    region: input.region,
    fetch: input.fetch,
    operation: "opportunities.get",
  });
  const raw = await client.getJSON(`/opportunities/${id}`);
  return parseOpportunityGetResponse(raw);
}

// ---------------------------------------------------------------------------
// opportunities.interviews.list — GET /v1/opportunities/{id}/interviews
// ---------------------------------------------------------------------------

export interface ExecuteOpportunitiesInterviewsListSyncInput extends LeverAuthInput {
  /** Lever opportunity UID. */
  opportunityId: string;
  limit?: number;
  offset?: string;
}

export interface ExecuteOpportunitiesInterviewsListSyncOutput {
  interviews: NormalizedInterview[];
  next: string | null;
  hasNext: boolean;
}

export async function executeOpportunitiesInterviewsListSync(
  input: ExecuteOpportunitiesInterviewsListSyncInput,
): Promise<ExecuteOpportunitiesInterviewsListSyncOutput> {
  const opportunityId = assertSafePathSegment(input.opportunityId, "opportunityId");
  const client = createAuthClient({
    apiKey: input.apiKey,
    region: input.region,
    fetch: input.fetch,
    operation: "opportunities.interviews.list",
  });
  const path =
    `/opportunities/${opportunityId}/interviews` +
    buildQuery({
      limit: input.limit != null ? String(input.limit) : undefined,
      offset: input.offset,
    });
  const raw = await client.getJSON(path);
  return parseInterviewsResponse(raw, opportunityId);
}

// ---------------------------------------------------------------------------
// opportunities.feedback.list — GET /v1/opportunities/{id}/feedback
// ---------------------------------------------------------------------------

export interface ExecuteOpportunitiesFeedbackListSyncInput extends LeverAuthInput {
  /** Lever opportunity UID. */
  opportunityId: string;
  limit?: number;
  offset?: string;
}

export interface ExecuteOpportunitiesFeedbackListSyncOutput {
  feedback: NormalizedFeedback[];
  next: string | null;
  hasNext: boolean;
}

export async function executeOpportunitiesFeedbackListSync(
  input: ExecuteOpportunitiesFeedbackListSyncInput,
): Promise<ExecuteOpportunitiesFeedbackListSyncOutput> {
  const opportunityId = assertSafePathSegment(input.opportunityId, "opportunityId");
  const client = createAuthClient({
    apiKey: input.apiKey,
    region: input.region,
    fetch: input.fetch,
    operation: "opportunities.feedback.list",
  });
  const path =
    `/opportunities/${opportunityId}/feedback` +
    buildQuery({
      limit: input.limit != null ? String(input.limit) : undefined,
      offset: input.offset,
    });
  const raw = await client.getJSON(path);
  return parseFeedbackResponse(raw);
}

// ---------------------------------------------------------------------------
// stages.list
// ---------------------------------------------------------------------------

export interface ExecuteStagesListSyncInput extends LeverAuthInput {
  limit?: number;
  offset?: string;
}

export interface ExecuteStagesListSyncOutput {
  stages: NormalizedStage[];
  next: string | null;
  hasNext: boolean;
}

export async function executeStagesListSync(
  input: ExecuteStagesListSyncInput,
): Promise<ExecuteStagesListSyncOutput> {
  const client = createAuthClient({
    apiKey: input.apiKey,
    region: input.region,
    fetch: input.fetch,
    operation: "stages.list",
  });
  const path =
    "/stages" +
    buildQuery({
      limit: input.limit != null ? String(input.limit) : undefined,
      offset: input.offset,
    });
  const raw = await client.getJSON(path);
  return parseStagesResponse(raw);
}

// ---------------------------------------------------------------------------
// users.list
// ---------------------------------------------------------------------------

export interface ExecuteUsersListSyncInput extends LeverAuthInput {
  limit?: number;
  offset?: string;
  email?: string;
  accessRole?: string;
}

export interface ExecuteUsersListSyncOutput {
  users: NormalizedUser[];
  next: string | null;
  hasNext: boolean;
}

export async function executeUsersListSync(
  input: ExecuteUsersListSyncInput,
): Promise<ExecuteUsersListSyncOutput> {
  const client = createAuthClient({
    apiKey: input.apiKey,
    region: input.region,
    fetch: input.fetch,
    operation: "users.list",
  });
  const path =
    "/users" +
    buildQuery({
      limit: input.limit != null ? String(input.limit) : undefined,
      offset: input.offset,
      email: input.email,
      access_role: input.accessRole,
    });
  const raw = await client.getJSON(path);
  return parseUsersResponse(raw);
}
