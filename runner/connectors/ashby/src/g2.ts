/**
 * Ashby G2 — 15 agent-tool ops (jobs internal/search/create/update/status,
 * templates, interview plan, postings, openings, close reasons).
 * All POST RPC against api.ashbyhq.com. Auth: tip createAuthClient.
 *
 * Effect keys (/workspace/parity-briefs/ashby-g2-selflock.md):
 * - jobs.create omits effect keys (creates always omit)
 * - jobs.update / jobs.set_status Reconcile → jobs.get
 * - job_postings.update Reconcile → job_postings.get
 * - openings.create omits effect keys (creates always omit)
 * - openings.update Reconcile → openings.get
 * - other creates omitted (none); reads omit
 */
import { createAuthClient } from "./http";

export interface AshbyAuthInput {
  apiKey: string;
  fetch?: typeof fetch;
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value === "string" && value.length > 0) return value;
  throw new Error(`${field} is required`);
}

function compactBody(params: Record<string, unknown>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    body[key] = value;
  }
  return body;
}

function listPaging(input: { limit?: number; cursor?: string; syncToken?: string }) {
  return compactBody({
    limit: input.limit,
    cursor: input.cursor,
    syncToken: input.syncToken,
  });
}

function asResults(raw: unknown): unknown {
  if (raw != null && typeof raw === "object" && !Array.isArray(raw)) {
    return (raw as { results?: unknown }).results ?? null;
  }
  return null;
}

function pageMeta(raw: unknown) {
  const data = (raw ?? {}) as {
    moreDataAvailable?: boolean;
    nextCursor?: string | null;
    syncToken?: string | null;
  };
  return {
    moreDataAvailable: data.moreDataAvailable === true,
    nextCursor: typeof data.nextCursor === "string" ? data.nextCursor : null,
    syncToken: typeof data.syncToken === "string" ? data.syncToken : null,
  };
}

function authClient(input: AshbyAuthInput, operation: string) {
  return createAuthClient({
    apiKey: input.apiKey,
    fetch: input.fetch,
    operation,
  });
}

// ---------------------------------------------------------------------------
// 1. jobs.list_internal — POST /job.list
// ---------------------------------------------------------------------------

export interface ExecuteJobsListInternalInput extends AshbyAuthInput {
  status?: string[];
  createdAfter?: number;
  openedAfter?: number;
  openedBefore?: number;
  closedAfter?: number;
  closedBefore?: number;
  includeUnpublishedJobPostingsIds?: boolean;
  expand?: string[];
  limit?: number;
  cursor?: string;
  syncToken?: string;
}

export async function executeJobsListInternal(input: ExecuteJobsListInternalInput) {
  const client = authClient(input, "jobs.list_internal");
  const raw = await client.postJSON(
    "/job.list",
    compactBody({
      status: input.status,
      createdAfter: input.createdAfter,
      openedAfter: input.openedAfter,
      openedBefore: input.openedBefore,
      closedAfter: input.closedAfter,
      closedBefore: input.closedBefore,
      includeUnpublishedJobPostingsIds: input.includeUnpublishedJobPostingsIds,
      expand: input.expand,
      ...listPaging(input),
    }),
  );
  const results = asResults(raw);
  return {
    jobs: Array.isArray(results) ? results : [],
    ...pageMeta(raw),
  };
}

// ---------------------------------------------------------------------------
// 2. jobs.search — POST /job.search
// ---------------------------------------------------------------------------

export interface ExecuteJobsSearchInput extends AshbyAuthInput {
  title?: string;
  requisitionId?: string;
  limit?: number;
}

export async function executeJobsSearch(input: ExecuteJobsSearchInput) {
  const title = typeof input.title === "string" && input.title.length > 0 ? input.title : undefined;
  const requisitionId =
    typeof input.requisitionId === "string" && input.requisitionId.length > 0
      ? input.requisitionId
      : undefined;
  if (!title && !requisitionId) {
    throw new Error("at least one of title or requisitionId is required");
  }
  const client = authClient(input, "jobs.search");
  const raw = await client.postJSON(
    "/job.search",
    compactBody({ title, requisitionId, limit: input.limit }),
  );
  const results = asResults(raw);
  return { jobs: Array.isArray(results) ? results : [] };
}

// ---------------------------------------------------------------------------
// 3. jobs.create — POST /job.create · no effect keys (create)
// ---------------------------------------------------------------------------

export interface ExecuteJobsCreateInput extends AshbyAuthInput {
  title: string;
  teamId: string;
  locationId: string;
  defaultInterviewPlanId?: string;
  jobTemplateId?: string;
  employmentType?: string;
  brandId?: string;
}

export async function executeJobsCreate(input: ExecuteJobsCreateInput) {
  const title = requireNonEmptyString(input.title, "title");
  const teamId = requireNonEmptyString(input.teamId, "teamId");
  const locationId = requireNonEmptyString(input.locationId, "locationId");
  const client = authClient(input, "jobs.create");
  const raw = await client.postJSON(
    "/job.create",
    compactBody({
      title,
      teamId,
      locationId,
      defaultInterviewPlanId: input.defaultInterviewPlanId,
      jobTemplateId: input.jobTemplateId,
      employmentType: input.employmentType,
      brandId: input.brandId,
    }),
  );
  const results = asResults(raw);
  if (results != null && typeof results === "object" && !Array.isArray(results)) {
    return results as Record<string, unknown>;
  }
  throw new Error("Ashby jobs.create response missing results object");
}

// ---------------------------------------------------------------------------
// 4. jobs.update — POST /job.update · Reconcile → jobs.get
// ---------------------------------------------------------------------------

export interface ExecuteJobsUpdateInput extends AshbyAuthInput {
  jobId: string;
  title?: string;
  teamId?: string | null;
  locationId?: string;
  defaultInterviewPlanId?: string;
  employmentType?: string;
  customRequisitionId?: string | null;
}

export async function executeJobsUpdate(input: ExecuteJobsUpdateInput) {
  const jobId = requireNonEmptyString(input.jobId, "jobId");
  const body: Record<string, unknown> = { jobId };
  let hasField = false;
  for (const key of [
    "title",
    "teamId",
    "locationId",
    "defaultInterviewPlanId",
    "employmentType",
    "customRequisitionId",
  ] as const) {
    if (input[key] !== undefined) {
      body[key] = input[key];
      hasField = true;
    }
  }
  if (!hasField) {
    throw new Error("at least one field other than jobId is required");
  }
  const client = authClient(input, "jobs.update");
  await client.postJSON("/job.update", body);
  return { job: null };
}

// ---------------------------------------------------------------------------
// 5. jobs.set_status — POST /job.setStatus · Reconcile → jobs.get
// ---------------------------------------------------------------------------

export interface ExecuteJobsSetStatusInput extends AshbyAuthInput {
  jobId: string;
  status: string;
  closeReasonId?: string;
}

export async function executeJobsSetStatus(input: ExecuteJobsSetStatusInput) {
  const jobId = requireNonEmptyString(input.jobId, "jobId");
  const status = requireNonEmptyString(input.status, "status");
  const client = authClient(input, "jobs.set_status");
  await client.postJSON(
    "/job.setStatus",
    compactBody({ jobId, status, closeReasonId: input.closeReasonId }),
  );
  return { job: null };
}

// ---------------------------------------------------------------------------
// 6. job_templates.list — POST /jobTemplate.list
// ---------------------------------------------------------------------------

export interface ExecuteJobTemplatesListInput extends AshbyAuthInput {
  expand?: string[];
  limit?: number;
  cursor?: string;
  syncToken?: string;
}

export async function executeJobTemplatesList(input: ExecuteJobTemplatesListInput) {
  const client = authClient(input, "job_templates.list");
  const raw = await client.postJSON(
    "/jobTemplate.list",
    compactBody({ expand: input.expand, ...listPaging(input) }),
  );
  const results = asResults(raw);
  return {
    jobTemplates: Array.isArray(results) ? results : [],
    ...pageMeta(raw),
  };
}

// ---------------------------------------------------------------------------
// 7. job_interview_plans.get — POST /jobInterviewPlan.info
// ---------------------------------------------------------------------------

export interface ExecuteJobInterviewPlansGetInput extends AshbyAuthInput {
  jobId: string;
}

export async function executeJobInterviewPlansGet(input: ExecuteJobInterviewPlansGetInput) {
  const jobId = requireNonEmptyString(input.jobId, "jobId");
  const client = authClient(input, "job_interview_plans.get");
  const raw = await client.postJSON("/jobInterviewPlan.info", { jobId });
  return { interviewPlan: asResults(raw) };
}

// ---------------------------------------------------------------------------
// 8. job_postings.list — POST /jobPosting.list
// ---------------------------------------------------------------------------

export interface ExecuteJobPostingsListInput extends AshbyAuthInput {
  location?: string;
  department?: string;
  listedOnly?: boolean;
  includeUnpublishedJobPostings?: boolean;
  jobBoardId?: string;
}

export async function executeJobPostingsList(input: ExecuteJobPostingsListInput) {
  const client = authClient(input, "job_postings.list");
  const raw = await client.postJSON(
    "/jobPosting.list",
    compactBody({
      location: input.location,
      department: input.department,
      listedOnly: input.listedOnly,
      includeUnpublishedJobPostings: input.includeUnpublishedJobPostings,
      jobBoardId: input.jobBoardId,
    }),
  );
  const results = asResults(raw);
  return { jobPostings: Array.isArray(results) ? results : [] };
}

// ---------------------------------------------------------------------------
// 9. job_postings.get — POST /jobPosting.info (observe for job_postings.update)
// ---------------------------------------------------------------------------

export interface ExecuteJobPostingsGetInput extends AshbyAuthInput {
  jobPostingId: string;
  jobBoardId?: string;
  includeUnpublishedJobPostings?: boolean;
  expand?: string[];
}

export async function executeJobPostingsGet(input: ExecuteJobPostingsGetInput) {
  const jobPostingId = requireNonEmptyString(input.jobPostingId, "jobPostingId");
  const client = authClient(input, "job_postings.get");
  const raw = await client.postJSON(
    "/jobPosting.info",
    compactBody({
      jobPostingId,
      jobBoardId: input.jobBoardId,
      includeUnpublishedJobPostings: input.includeUnpublishedJobPostings,
      expand: input.expand,
    }),
  );
  return { jobPosting: asResults(raw) };
}

// ---------------------------------------------------------------------------
// 10. job_postings.update — POST /jobPosting.update · Reconcile → job_postings.get
// ---------------------------------------------------------------------------

export interface ExecuteJobPostingsUpdateInput extends AshbyAuthInput {
  jobPostingId: string;
  title?: string;
  workplaceType?: string;
  description?: { type: string; value: string } | string;
  suppressDescriptionOpening?: boolean;
  suppressDescriptionClosing?: boolean;
  applicationConfirmationEmailTemplateId?: string;
  includeUnpublishedJobPostings?: boolean;
}

export async function executeJobPostingsUpdate(input: ExecuteJobPostingsUpdateInput) {
  const jobPostingId = requireNonEmptyString(input.jobPostingId, "jobPostingId");
  const client = authClient(input, "job_postings.update");
  await client.postJSON(
    "/jobPosting.update",
    compactBody({
      jobPostingId,
      title: input.title,
      workplaceType: input.workplaceType,
      description: input.description,
      suppressDescriptionOpening: input.suppressDescriptionOpening,
      suppressDescriptionClosing: input.suppressDescriptionClosing,
      applicationConfirmationEmailTemplateId: input.applicationConfirmationEmailTemplateId,
      includeUnpublishedJobPostings: input.includeUnpublishedJobPostings,
    }),
  );
  return { jobPosting: null };
}

// ---------------------------------------------------------------------------
// 11. openings.get — POST /opening.info (observe for opening writes)
// ---------------------------------------------------------------------------

export interface ExecuteOpeningsGetInput extends AshbyAuthInput {
  /** Opening UUID. Required unless Idempotent observe supplies top-level `id`. */
  openingId?: string;
  /**
   * Alias for openingId. Idempotent EffectPolicy observe injects top-level `id`
   * from openings.create; accept it so reconcile works without remap.
   */
  id?: string;
}

export async function executeOpeningsGet(input: ExecuteOpeningsGetInput) {
  const hasOpeningId = typeof input.openingId === "string" && input.openingId.length > 0;
  const hasIdAlias = typeof input.id === "string" && input.id.length > 0;
  if (!hasOpeningId && !hasIdAlias) {
    throw new Error("openingId is required");
  }
  const openingId = hasOpeningId ? input.openingId! : input.id!;
  const client = authClient(input, "openings.get");
  const raw = await client.postJSON("/opening.info", { openingId });
  return { opening: asResults(raw) };
}

// ---------------------------------------------------------------------------
// 12. openings.search — POST /opening.search
// ---------------------------------------------------------------------------

export interface ExecuteOpeningsSearchInput extends AshbyAuthInput {
  identifier: string;
}

export async function executeOpeningsSearch(input: ExecuteOpeningsSearchInput) {
  const identifier = requireNonEmptyString(input.identifier, "identifier");
  const client = authClient(input, "openings.search");
  const raw = await client.postJSON("/opening.search", { identifier });
  const results = asResults(raw);
  return { openings: Array.isArray(results) ? results : [] };
}

// ---------------------------------------------------------------------------
// 13. openings.create — POST /opening.create · no effect keys (create)
// ---------------------------------------------------------------------------

export interface ExecuteOpeningsCreateInput extends AshbyAuthInput {
  identifier?: string;
  description?: string;
  teamId?: string;
  locationIds?: string[];
  jobIds?: string[];
  targetHireDate?: string;
  targetStartDate?: string;
  isBackfill?: boolean;
  employmentType?: string;
  openingState?: string;
}

export async function executeOpeningsCreate(input: ExecuteOpeningsCreateInput) {
  const client = authClient(input, "openings.create");
  const raw = await client.postJSON(
    "/opening.create",
    compactBody({
      identifier: input.identifier,
      description: input.description,
      teamId: input.teamId,
      locationIds: input.locationIds,
      jobIds: input.jobIds,
      targetHireDate: input.targetHireDate,
      targetStartDate: input.targetStartDate,
      isBackfill: input.isBackfill,
      employmentType: input.employmentType,
      openingState: input.openingState,
    }),
  );
  const results = asResults(raw);
  if (results != null && typeof results === "object" && !Array.isArray(results)) {
    return results as Record<string, unknown>;
  }
  throw new Error("Ashby openings.create response missing results object");
}

// ---------------------------------------------------------------------------
// 14. openings.update — POST /opening.update · Reconcile → openings.get
// ---------------------------------------------------------------------------

export interface ExecuteOpeningsUpdateInput extends AshbyAuthInput {
  openingId: string;
  identifier?: string;
  description?: string;
  teamId?: string;
  targetHireDate?: string;
  targetStartDate?: string;
  isBackfill?: boolean;
  employmentType?: string;
}

export async function executeOpeningsUpdate(input: ExecuteOpeningsUpdateInput) {
  const openingId = requireNonEmptyString(input.openingId, "openingId");
  const client = authClient(input, "openings.update");
  await client.postJSON(
    "/opening.update",
    compactBody({
      openingId,
      identifier: input.identifier,
      description: input.description,
      teamId: input.teamId,
      targetHireDate: input.targetHireDate,
      targetStartDate: input.targetStartDate,
      isBackfill: input.isBackfill,
      employmentType: input.employmentType,
    }),
  );
  return { opening: null };
}

// ---------------------------------------------------------------------------
// 15. close_reasons.list — POST /closeReason.list
// ---------------------------------------------------------------------------

export interface ExecuteCloseReasonsListInput extends AshbyAuthInput {
  includeArchived?: boolean;
}

export async function executeCloseReasonsList(input: ExecuteCloseReasonsListInput) {
  const client = authClient(input, "close_reasons.list");
  const raw = await client.postJSON(
    "/closeReason.list",
    compactBody({ includeArchived: input.includeArchived }),
  );
  const results = asResults(raw);
  return { closeReasons: Array.isArray(results) ? results : [] };
}
