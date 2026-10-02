/**
 * Lever syncs.
 *
 * jobs.list                     → public GET /v0/postings/{site}
 * opportunities.list            → authenticated GET /v1/opportunities
 * opportunities.get             → authenticated GET /v1/opportunities/{id}
 * opportunities.interviews.list → authenticated GET /v1/opportunities/{id}/interviews
 * opportunities.feedback.list   → authenticated GET /v1/opportunities/{id}/feedback
 * opportunities.update_stage    → authenticated PUT /v1/opportunities/{id}/stage
 *                                 (runner EffectPolicy Reconcile → opportunities.get)
 * opportunities.archive         → authenticated PUT /v1/opportunities/{id}/archived
 *                                 (runner EffectPolicy Reconcile → opportunities.get)
 * archive_reasons.list          → authenticated GET /v1/archive_reasons
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
  parseArchiveReasonsResponse,
  parseStagesResponse,
  parseUsersResponse,
  type NormalizedJob,
  type NormalizedOpportunity,
  type NormalizedInterview,
  type NormalizedFeedback,
  type NormalizedArchiveReason,
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

function compactBody(params: Record<string, unknown>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    body[key] = value;
  }
  return body;
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

// ---------------------------------------------------------------------------
// opportunities.update_stage — PUT /v1/opportunities/{id}/stage
// Runtime owns EffectPolicy Reconcile → opportunities.get.
// Official Lever body field is `stage` (Stage UID), not stageId.
// ---------------------------------------------------------------------------

export interface ExecuteOpportunitiesUpdateStageSyncInput extends LeverAuthInput {
  /** Lever opportunity UID. */
  id: string;
  /** Destination stage UID (connector input); sent as Lever body field `stage`. */
  stageId: string;
  /** Optional perform_as user UID (query). */
  performAs?: string;
}

export interface ExecuteOpportunitiesMutateSyncOutput {
  /** Placeholder; runner Reconcile replaces this with opportunities.get output. */
  opportunity: null;
}

export async function executeOpportunitiesUpdateStageSync(
  input: ExecuteOpportunitiesUpdateStageSyncInput,
): Promise<ExecuteOpportunitiesMutateSyncOutput> {
  const id = assertSafePathSegment(input.id, "id");
  if (typeof input.stageId !== "string" || input.stageId.length === 0) {
    throw new Error("stageId is required");
  }
  const client = createAuthClient({
    apiKey: input.apiKey,
    region: input.region,
    fetch: input.fetch,
    operation: "opportunities.update_stage",
  });
  const path =
    `/opportunities/${id}/stage` +
    buildQuery({
      perform_as: input.performAs,
    });
  // Lever docs: Fields → stage (Stage UID). Knit/third-party "stageId" naming is
  // a misnomer for the request body; we keep camelCase stageId on the connector
  // input and map to the official `stage` body key.
  await client.putJSON(path, { stage: input.stageId });
  return { opportunity: null };
}

// ---------------------------------------------------------------------------
// opportunities.archive — PUT /v1/opportunities/{id}/archived
// Runtime owns EffectPolicy Reconcile → opportunities.get.
// Official Lever body field is `reason` (archive reason UID); null unarchives.
// ---------------------------------------------------------------------------

export interface ExecuteOpportunitiesArchiveSyncInput extends LeverAuthInput {
  /** Lever opportunity UID. */
  id: string;
  /** Archive reason UID; pass null to unarchive. */
  reason: string | null;
  /** Remove pending interviews when archiving (Lever default false). */
  cleanInterviews?: boolean;
  /** Optional requisition UID when archiving as Hired. */
  requisitionId?: string;
  /** Optional perform_as user UID (query). */
  performAs?: string;
}

export async function executeOpportunitiesArchiveSync(
  input: ExecuteOpportunitiesArchiveSyncInput,
): Promise<ExecuteOpportunitiesMutateSyncOutput> {
  const id = assertSafePathSegment(input.id, "id");
  if (input.reason !== null && (typeof input.reason !== "string" || input.reason.length === 0)) {
    throw new Error("reason is required (string UID or null to unarchive)");
  }
  const client = createAuthClient({
    apiKey: input.apiKey,
    region: input.region,
    fetch: input.fetch,
    operation: "opportunities.archive",
  });
  const path =
    `/opportunities/${id}/archived` +
    buildQuery({
      perform_as: input.performAs,
    });
  await client.putJSON(
    path,
    compactBody({
      reason: input.reason,
      cleanInterviews: input.cleanInterviews,
      requisitionId: input.requisitionId,
    }),
  );
  return { opportunity: null };
}

// ---------------------------------------------------------------------------
// archive_reasons.list — GET /v1/archive_reasons
// ---------------------------------------------------------------------------

export interface ExecuteArchiveReasonsListSyncInput extends LeverAuthInput {
  /** Optional filter: "hired" | "non-hired". */
  type?: string;
  limit?: number;
  offset?: string;
}

export interface ExecuteArchiveReasonsListSyncOutput {
  archiveReasons: NormalizedArchiveReason[];
  next: string | null;
  hasNext: boolean;
}

export async function executeArchiveReasonsListSync(
  input: ExecuteArchiveReasonsListSyncInput,
): Promise<ExecuteArchiveReasonsListSyncOutput> {
  const client = createAuthClient({
    apiKey: input.apiKey,
    region: input.region,
    fetch: input.fetch,
    operation: "archive_reasons.list",
  });
  const path =
    "/archive_reasons" +
    buildQuery({
      type: input.type,
      limit: input.limit != null ? String(input.limit) : undefined,
      offset: input.offset,
    });
  const raw = await client.getJSON(path);
  return parseArchiveReasonsResponse(raw);
}
