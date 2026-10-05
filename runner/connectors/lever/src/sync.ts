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
 * opportunities.update          → resolve contact via GET opportunity, then
 *                                 PUT /v1/contacts/{contactId} (+ POST addTags);
 *                                 no generic PUT /opportunities/{id} exists.
 *                                 (runner EffectPolicy Reconcile → opportunities.get)
 * offers.get                    → GET /v1/opportunities/{id}/offers + client filter
 *                                 (no single-offer GET in the Offers reference)
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
  parseInterviewGetResponse,
  parseFeedbackResponse,
  parseFeedbackGetResponse,
  parseArchiveReasonsResponse,
  parseStagesResponse,
  parseUsersResponse,
  parseUserGetResponse,
  parseCandidateGetResponse,
  parseOffersResponse,
  parsePostingsResponse,
  parsePostingGetResponse,
  parseNotesResponse,
  parseRequisitionsResponse,
  type NormalizedJob,
  type NormalizedOpportunity,
  type NormalizedInterview,
  type NormalizedFeedback,
  type NormalizedArchiveReason,
  type NormalizedStage,
  type NormalizedUser,
  type NormalizedCandidate,
  type NormalizedOffer,
  type NormalizedPosting,
  type NormalizedNote,
  type NormalizedRequisition,
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

export interface ExecuteOpportunitiesUpdateSyncInput extends LeverAuthInput {
  id: string;
  name?: string;
  headline?: string;
  location?: string;
  emails?: string[];
  tags?: string[];
  performAs?: string;
}

export async function executeOpportunitiesUpdateSync(
  input: ExecuteOpportunitiesUpdateSyncInput,
): Promise<ExecuteOpportunitiesMutateSyncOutput> {
  const id = assertSafePathSegment(input.id, "id");
  const client = createAuthClient({
    apiKey: input.apiKey,
    region: input.region,
    fetch: input.fetch,
    operation: "opportunities.update",
  });
  const contactBody = compactBody({
    name: input.name,
    headline: input.headline,
    location: input.location,
    emails: input.emails,
  });
  const hasContactFields = Object.keys(contactBody).length > 0;
  const hasTags = Array.isArray(input.tags) && input.tags.length > 0;
  const performAsQuery = buildQuery({ perform_as: input.performAs });

  if (hasContactFields) {
    // Official docs: contact fields live on PUT /contacts/:contact, not on a
    // generic PUT /opportunities/:opportunity (that route is undocumented).
    const opportunityRaw = await client.getJSON(`/opportunities/${id}`);
    const envelope = opportunityRaw as { data?: { contact?: unknown } } | null;
    const contactId =
      envelope && typeof envelope === "object" && envelope.data != null
        ? envelope.data.contact
        : undefined;
    if (typeof contactId !== "string" || contactId.length === 0) {
      throw new Error("opportunity has no contact id; cannot update contact fields");
    }
    await client.putJSON(`/contacts/${assertSafePathSegment(contactId, "contactId")}${performAsQuery}`, contactBody);
  }

  if (hasTags) {
    // Tags are mutated via addTags / removeTags; there is no PUT that sets them.
    await client.postJSON(`/opportunities/${id}/addTags${performAsQuery}`, { tags: input.tags });
  }

  return { opportunity: null };
}

export interface ExecuteCandidatesGetSyncInput extends LeverAuthInput {
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
    region: input.region,
    fetch: input.fetch,
    operation: "candidates.get",
  });
  const raw = await client.getJSON(`/opportunities/${id}`);
  return parseCandidateGetResponse(raw);
}

export interface ExecuteInterviewsListSyncInput extends LeverAuthInput {
  opportunityId: string;
  limit?: number;
  offset?: string;
}

export interface ExecuteInterviewsListSyncOutput {
  interviews: NormalizedInterview[];
  next: string | null;
  hasNext: boolean;
}

export async function executeInterviewsListSync(
  input: ExecuteInterviewsListSyncInput,
): Promise<ExecuteInterviewsListSyncOutput> {
  const opportunityId = assertSafePathSegment(input.opportunityId, "opportunityId");
  const client = createAuthClient({
    apiKey: input.apiKey,
    region: input.region,
    fetch: input.fetch,
    operation: "interviews.list",
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

export interface ExecuteInterviewsGetSyncInput extends LeverAuthInput {
  opportunityId: string;
  interviewId: string;
}

export interface ExecuteInterviewsGetSyncOutput {
  interview: NormalizedInterview | null;
}

export async function executeInterviewsGetSync(
  input: ExecuteInterviewsGetSyncInput,
): Promise<ExecuteInterviewsGetSyncOutput> {
  const opportunityId = assertSafePathSegment(input.opportunityId, "opportunityId");
  const interviewId = assertSafePathSegment(input.interviewId, "interviewId");
  const client = createAuthClient({
    apiKey: input.apiKey,
    region: input.region,
    fetch: input.fetch,
    operation: "interviews.get",
  });
  const raw = await client.getJSON(`/opportunities/${opportunityId}/interviews/${interviewId}`);
  return parseInterviewGetResponse(raw, opportunityId);
}

export interface ExecuteOffersListSyncInput extends LeverAuthInput {
  opportunityId: string;
  limit?: number;
  offset?: string;
}

export interface ExecuteOffersListSyncOutput {
  offers: NormalizedOffer[];
  next: string | null;
  hasNext: boolean;
}

export async function executeOffersListSync(
  input: ExecuteOffersListSyncInput,
): Promise<ExecuteOffersListSyncOutput> {
  const opportunityId = assertSafePathSegment(input.opportunityId, "opportunityId");
  const client = createAuthClient({
    apiKey: input.apiKey,
    region: input.region,
    fetch: input.fetch,
    operation: "offers.list",
  });
  const path =
    `/opportunities/${opportunityId}/offers` +
    buildQuery({
      limit: input.limit != null ? String(input.limit) : undefined,
      offset: input.offset,
    });
  const raw = await client.getJSON(path);
  return parseOffersResponse(raw);
}

export interface ExecuteOffersGetSyncInput extends LeverAuthInput {
  opportunityId: string;
  offerId: string;
}

export interface ExecuteOffersGetSyncOutput {
  offer: NormalizedOffer | null;
}

export async function executeOffersGetSync(
  input: ExecuteOffersGetSyncInput,
): Promise<ExecuteOffersGetSyncOutput> {
  const opportunityId = assertSafePathSegment(input.opportunityId, "opportunityId");
  const offerId = assertSafePathSegment(input.offerId, "offerId");
  const client = createAuthClient({
    apiKey: input.apiKey,
    region: input.region,
    fetch: input.fetch,
    operation: "offers.get",
  });
  // Official Offers reference lists only "List all offers" and "Download offer
  // file" — there is no GET /offers/{offerId}. Re-implement as list + filter.
  let offset: string | undefined;
  for (;;) {
    const path =
      `/opportunities/${opportunityId}/offers` +
      buildQuery({
        limit: "100",
        offset,
      });
    const raw = await client.getJSON(path);
    const parsed = parseOffersResponse(raw);
    const match = parsed.offers.find((offer) => offer.id === `lev-offer:${offerId}`);
    if (match) {
      return { offer: match };
    }
    if (!parsed.hasNext || parsed.next == null || parsed.next === "") {
      return { offer: null };
    }
    offset = parsed.next;
  }
}

export interface ExecutePostingsListSyncInput extends LeverAuthInput {
  state?: string;
  limit?: number;
  offset?: string;
}

export interface ExecutePostingsListSyncOutput {
  postings: NormalizedPosting[];
  next: string | null;
  hasNext: boolean;
}

export async function executePostingsListSync(
  input: ExecutePostingsListSyncInput,
): Promise<ExecutePostingsListSyncOutput> {
  const client = createAuthClient({
    apiKey: input.apiKey,
    region: input.region,
    fetch: input.fetch,
    operation: "postings.list",
  });
  const path =
    "/postings" +
    buildQuery({
      state: input.state,
      limit: input.limit != null ? String(input.limit) : undefined,
      offset: input.offset,
    });
  const raw = await client.getJSON(path);
  return parsePostingsResponse(raw);
}

export interface ExecutePostingsGetSyncInput extends LeverAuthInput {
  id: string;
}

export interface ExecutePostingsGetSyncOutput {
  posting: NormalizedPosting | null;
}

export async function executePostingsGetSync(
  input: ExecutePostingsGetSyncInput,
): Promise<ExecutePostingsGetSyncOutput> {
  const id = assertSafePathSegment(input.id, "id");
  const client = createAuthClient({
    apiKey: input.apiKey,
    region: input.region,
    fetch: input.fetch,
    operation: "postings.get",
  });
  const raw = await client.getJSON(`/postings/${id}`);
  return parsePostingGetResponse(raw);
}

export interface ExecuteNotesListSyncInput extends LeverAuthInput {
  opportunityId: string;
  limit?: number;
  offset?: string;
}

export interface ExecuteNotesListSyncOutput {
  notes: NormalizedNote[];
  next: string | null;
  hasNext: boolean;
}

export async function executeNotesListSync(
  input: ExecuteNotesListSyncInput,
): Promise<ExecuteNotesListSyncOutput> {
  const opportunityId = assertSafePathSegment(input.opportunityId, "opportunityId");
  const client = createAuthClient({
    apiKey: input.apiKey,
    region: input.region,
    fetch: input.fetch,
    operation: "notes.list",
  });
  const path =
    `/opportunities/${opportunityId}/notes` +
    buildQuery({
      limit: input.limit != null ? String(input.limit) : undefined,
      offset: input.offset,
    });
  const raw = await client.getJSON(path);
  return parseNotesResponse(raw);
}

export interface ExecuteUsersGetSyncInput extends LeverAuthInput {
  id: string;
}

export interface ExecuteUsersGetSyncOutput {
  user: NormalizedUser | null;
}

export async function executeUsersGetSync(
  input: ExecuteUsersGetSyncInput,
): Promise<ExecuteUsersGetSyncOutput> {
  const id = assertSafePathSegment(input.id, "id");
  const client = createAuthClient({
    apiKey: input.apiKey,
    region: input.region,
    fetch: input.fetch,
    operation: "users.get",
  });
  const raw = await client.getJSON(`/users/${id}`);
  return parseUserGetResponse(raw);
}

export interface ExecuteRequisitionsListSyncInput extends LeverAuthInput {
  limit?: number;
  offset?: string;
}

export interface ExecuteRequisitionsListSyncOutput {
  requisitions: NormalizedRequisition[];
  next: string | null;
  hasNext: boolean;
}

export async function executeRequisitionsListSync(
  input: ExecuteRequisitionsListSyncInput,
): Promise<ExecuteRequisitionsListSyncOutput> {
  const client = createAuthClient({
    apiKey: input.apiKey,
    region: input.region,
    fetch: input.fetch,
    operation: "requisitions.list",
  });
  const path =
    "/requisitions" +
    buildQuery({
      limit: input.limit != null ? String(input.limit) : undefined,
      offset: input.offset,
    });
  const raw = await client.getJSON(path);
  return parseRequisitionsResponse(raw);
}

export interface ExecuteFeedbackGetSyncInput extends LeverAuthInput {
  opportunityId: string;
  feedbackId: string;
}

export interface ExecuteFeedbackGetSyncOutput {
  feedback: NormalizedFeedback | null;
}

export async function executeFeedbackGetSync(
  input: ExecuteFeedbackGetSyncInput,
): Promise<ExecuteFeedbackGetSyncOutput> {
  const opportunityId = assertSafePathSegment(input.opportunityId, "opportunityId");
  const feedbackId = assertSafePathSegment(input.feedbackId, "feedbackId");
  const client = createAuthClient({
    apiKey: input.apiKey,
    region: input.region,
    fetch: input.fetch,
    operation: "feedback.get",
  });
  const raw = await client.getJSON(`/opportunities/${opportunityId}/feedback/${feedbackId}`);
  return parseFeedbackGetResponse(raw);
}
