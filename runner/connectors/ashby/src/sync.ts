/**
 * Ashby list/get/search/write syncs.
 *
 * jobs.list               → public GET /posting-api/job-board/{board}/jobs
 * candidates.list         → authenticated POST /candidate.list
 * applications.list       → authenticated POST /application.list
 * candidates.get          → authenticated POST /candidate.info
 * applications.get        → authenticated POST /application.info
 * candidates.search       → authenticated POST /candidate.search
 * interviews.list         → authenticated POST /interview.list
 * candidates.create       → POST /candidate.create
 *                           (runner EffectPolicy Idempotent → candidates.get)
 * applications.create     → POST /application.create
 *                           (runner EffectPolicy Idempotent → applications.get)
 * applications.move       → POST /application.changeStage
 *                           (runner EffectPolicy Reconcile → applications.get)
 * applications.reject     → POST /application.changeStage (Archived + archiveReasonId)
 *                           (runner EffectPolicy Reconcile → applications.get)
 * applications.hire       → POST /application.changeStage (Hired stage)
 *                           (runner EffectPolicy Reconcile → applications.get)
 * interviews.schedule     → authenticated POST /interviewSchedule.create
 * interviews.cancel       → authenticated POST /interviewSchedule.cancel
 */

import { createClient, createAuthClient } from "./http";
import {
  parseJobsResponse,
  parseCandidatesResponse,
  parseCandidateInfoResponse,
  parseApplicationsResponse,
  parseApplicationInfoResponse,
  parseInterviewsResponse,
  parseInterviewScheduleInfoResponse,
  type NormalizedJob,
  type NormalizedCandidate,
  type NormalizedApplication,
  type NormalizedInterview,
  type NormalizedInterviewSchedule,
} from "./objects";

export interface ExecuteJobsListSyncInput {
  boardName: string;
  /** Injected by tests; production leaves it unset. */
  fetch?: typeof fetch;
}

export interface ExecuteJobsListSyncOutput {
  jobs: NormalizedJob[];
}

export async function executeJobsListSync(
  input: ExecuteJobsListSyncInput,
): Promise<ExecuteJobsListSyncOutput> {
  const client = createClient({ boardName: input.boardName, fetch: input.fetch });
  const raw = await client.getJSON("/jobs");
  return { jobs: parseJobsResponse(raw) };
}

export interface AshbyAuthInput {
  apiKey: string;
  /** Injected by tests; production leaves it unset. */
  fetch?: typeof fetch;
}

function compactBody(params: Record<string, unknown>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    body[key] = value;
  }
  return body;
}

// ---------------------------------------------------------------------------
// candidates.list — POST /candidate.list
// ---------------------------------------------------------------------------

export interface ExecuteCandidatesListSyncInput extends AshbyAuthInput {
  limit?: number;
  cursor?: string;
  syncToken?: string;
  createdAfter?: string;
}

export interface ExecuteCandidatesListSyncOutput {
  candidates: NormalizedCandidate[];
  moreDataAvailable: boolean;
  nextCursor: string | null;
  syncToken: string | null;
}

export async function executeCandidatesListSync(
  input: ExecuteCandidatesListSyncInput,
): Promise<ExecuteCandidatesListSyncOutput> {
  const client = createAuthClient({
    apiKey: input.apiKey,
    fetch: input.fetch,
    operation: "candidates.list",
  });
  const raw = await client.postJSON(
    "/candidate.list",
    compactBody({
      limit: input.limit,
      cursor: input.cursor,
      syncToken: input.syncToken,
      createdAfter: input.createdAfter,
    }),
  );
  return parseCandidatesResponse(raw);
}

// ---------------------------------------------------------------------------
// applications.list — POST /application.list
// ---------------------------------------------------------------------------

export interface ExecuteApplicationsListSyncInput extends AshbyAuthInput {
  limit?: number;
  cursor?: string;
  syncToken?: string;
  createdAfter?: string;
  status?: string;
  jobId?: string;
}

export interface ExecuteApplicationsListSyncOutput {
  applications: NormalizedApplication[];
  moreDataAvailable: boolean;
  nextCursor: string | null;
  syncToken: string | null;
}

export async function executeApplicationsListSync(
  input: ExecuteApplicationsListSyncInput,
): Promise<ExecuteApplicationsListSyncOutput> {
  const client = createAuthClient({
    apiKey: input.apiKey,
    fetch: input.fetch,
    operation: "applications.list",
  });
  const raw = await client.postJSON(
    "/application.list",
    compactBody({
      limit: input.limit,
      cursor: input.cursor,
      syncToken: input.syncToken,
      createdAfter: input.createdAfter,
      status: input.status,
      jobId: input.jobId,
    }),
  );
  return parseApplicationsResponse(raw);
}

// ---------------------------------------------------------------------------
// candidates.get — POST /candidate.info
// ---------------------------------------------------------------------------

export interface ExecuteCandidatesGetSyncInput extends AshbyAuthInput {
  /** Ashby candidate UUID. Required unless externalMappingId is set. */
  id?: string;
  /** External mapping id (HRIS etc.). Alternative to id. */
  externalMappingId?: string;
}

export interface ExecuteCandidatesGetSyncOutput {
  candidate: NormalizedCandidate | null;
}

export async function executeCandidatesGetSync(
  input: ExecuteCandidatesGetSyncInput,
): Promise<ExecuteCandidatesGetSyncOutput> {
  const hasId = typeof input.id === "string" && input.id.length > 0;
  const hasExternal =
    typeof input.externalMappingId === "string" && input.externalMappingId.length > 0;
  if (!hasId && !hasExternal) {
    throw new Error("id or externalMappingId is required");
  }
  const client = createAuthClient({
    apiKey: input.apiKey,
    fetch: input.fetch,
    operation: "candidates.get",
  });
  const raw = await client.postJSON(
    "/candidate.info",
    compactBody({
      id: hasId ? input.id : undefined,
      externalMappingId: hasExternal ? input.externalMappingId : undefined,
    }),
  );
  return parseCandidateInfoResponse(raw);
}

// ---------------------------------------------------------------------------
// applications.get — POST /application.info
// ---------------------------------------------------------------------------

export interface ExecuteApplicationsGetSyncInput extends AshbyAuthInput {
  /** Ashby application UUID. Required unless submittedFormInstanceId / id is set. */
  applicationId?: string;
  /**
   * Alias for applicationId. Idempotent EffectPolicy observe injects top-level `id`
   * from the create primary response; accept it here so applications.create can
   * reconcile via applications.get without a separate id→applicationId remap.
   */
  id?: string;
  /** Submitted form instance id (from applicationForm.submit). Alternative to applicationId. */
  submittedFormInstanceId?: string;
}

export interface ExecuteApplicationsGetSyncOutput {
  application: NormalizedApplication | null;
}

export async function executeApplicationsGetSync(
  input: ExecuteApplicationsGetSyncInput,
): Promise<ExecuteApplicationsGetSyncOutput> {
  const hasAppId = typeof input.applicationId === "string" && input.applicationId.length > 0;
  const hasIdAlias = typeof input.id === "string" && input.id.length > 0;
  const hasFormId =
    typeof input.submittedFormInstanceId === "string" && input.submittedFormInstanceId.length > 0;
  if (!hasAppId && !hasIdAlias && !hasFormId) {
    throw new Error("applicationId or submittedFormInstanceId is required");
  }
  const client = createAuthClient({
    apiKey: input.apiKey,
    fetch: input.fetch,
    operation: "applications.get",
  });
  // Official Ashby precedence: when both are provided, lookup uses applicationId.
  // Idempotent observe supplies `id`; prefer applicationId when both present.
  const applicationId = hasAppId ? input.applicationId : hasIdAlias ? input.id : undefined;
  const raw = await client.postJSON(
    "/application.info",
    compactBody({
      applicationId,
      submittedFormInstanceId:
        hasFormId && applicationId == null ? input.submittedFormInstanceId : undefined,
    }),
  );
  return parseApplicationInfoResponse(raw);
}

// ---------------------------------------------------------------------------
// candidates.search — POST /candidate.search
// ---------------------------------------------------------------------------

export interface ExecuteCandidatesSearchSyncInput extends AshbyAuthInput {
  /** Candidate email (AND-combined with name when both set). */
  email?: string;
  /** Candidate name (AND-combined with email when both set). */
  name?: string;
}

export interface ExecuteCandidatesSearchSyncOutput {
  candidates: NormalizedCandidate[];
  moreDataAvailable: boolean;
  nextCursor: string | null;
  syncToken: string | null;
}

export async function executeCandidatesSearchSync(
  input: ExecuteCandidatesSearchSyncInput,
): Promise<ExecuteCandidatesSearchSyncOutput> {
  const hasEmail = typeof input.email === "string" && input.email.length > 0;
  const hasName = typeof input.name === "string" && input.name.length > 0;
  if (!hasEmail && !hasName) {
    throw new Error("email or name is required");
  }
  const client = createAuthClient({
    apiKey: input.apiKey,
    fetch: input.fetch,
    operation: "candidates.search",
  });
  const raw = await client.postJSON(
    "/candidate.search",
    compactBody({
      email: hasEmail ? input.email : undefined,
      name: hasName ? input.name : undefined,
    }),
  );
  return parseCandidatesResponse(raw);
}

// ---------------------------------------------------------------------------
// interviews.list — POST /interview.list
// ---------------------------------------------------------------------------

export interface ExecuteInterviewsListSyncInput extends AshbyAuthInput {
  limit?: number;
  cursor?: string;
  syncToken?: string;
}

export interface ExecuteInterviewsListSyncOutput {
  interviews: NormalizedInterview[];
  moreDataAvailable: boolean;
  nextCursor: string | null;
  syncToken: string | null;
}

export async function executeInterviewsListSync(
  input: ExecuteInterviewsListSyncInput,
): Promise<ExecuteInterviewsListSyncOutput> {
  const client = createAuthClient({
    apiKey: input.apiKey,
    fetch: input.fetch,
    operation: "interviews.list",
  });
  const raw = await client.postJSON(
    "/interview.list",
    compactBody({
      limit: input.limit,
      cursor: input.cursor,
      syncToken: input.syncToken,
    }),
  );
  return parseInterviewsResponse(raw);
}

// ---------------------------------------------------------------------------
// applications.move / reject / hire — POST /application.changeStage
// Runtime owns EffectPolicy Reconcile → applications.get
// ---------------------------------------------------------------------------

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value === "string" && value.length > 0) return value;
  throw new Error(`${field} is required`);
}

export interface ExecuteApplicationsChangeStageSyncInput extends AshbyAuthInput {
  /** Ashby application UUID. */
  applicationId: string;
  /** Destination interview stage UUID. */
  interviewStageId: string;
  /** Required when moving to an Archived stage (applications.reject). */
  archiveReasonId?: string;
  /** Optional archive email template when rejecting. */
  archiveEmail?: {
    communicationTemplateId: string;
    sendAt?: string;
  };
}

export type ExecuteApplicationsMoveSyncInput = ExecuteApplicationsChangeStageSyncInput;
export type ExecuteApplicationsRejectSyncInput = ExecuteApplicationsChangeStageSyncInput & {
  archiveReasonId: string;
};
export type ExecuteApplicationsHireSyncInput = ExecuteApplicationsChangeStageSyncInput;

export interface ExecuteApplicationsChangeStageSyncOutput {
  /** Placeholder; runner Reconcile replaces this with applications.get output. */
  application: null;
}

async function executeApplicationsChangeStageWrite(
  input: ExecuteApplicationsChangeStageSyncInput,
  operation: string,
  opts: { requireArchiveReason?: boolean } = {},
): Promise<ExecuteApplicationsChangeStageSyncOutput> {
  const applicationId = requireNonEmptyString(input.applicationId, "applicationId");
  const interviewStageId = requireNonEmptyString(input.interviewStageId, "interviewStageId");
  if (opts.requireArchiveReason) {
    requireNonEmptyString(input.archiveReasonId, "archiveReasonId");
  }

  const body = compactBody({
    applicationId,
    interviewStageId,
    archiveReasonId: input.archiveReasonId,
    archiveEmail: input.archiveEmail,
  });

  const client = createAuthClient({
    apiKey: input.apiKey,
    fetch: input.fetch,
    operation,
  });
  await client.postJSON("/application.changeStage", body);
  // Runner owns EffectPolicy Reconcile → applications.get.
  return { application: null };
}

export async function executeApplicationsMoveSync(
  input: ExecuteApplicationsMoveSyncInput,
): Promise<ExecuteApplicationsChangeStageSyncOutput> {
  return executeApplicationsChangeStageWrite(input, "applications.move");
}

export async function executeApplicationsRejectSync(
  input: ExecuteApplicationsRejectSyncInput,
): Promise<ExecuteApplicationsChangeStageSyncOutput> {
  return executeApplicationsChangeStageWrite(input, "applications.reject", {
    requireArchiveReason: true,
  });
}

export async function executeApplicationsHireSync(
  input: ExecuteApplicationsHireSyncInput,
): Promise<ExecuteApplicationsChangeStageSyncOutput> {
  return executeApplicationsChangeStageWrite(input, "applications.hire");
}

// ---------------------------------------------------------------------------
// candidates.create — POST /candidate.create
// Runtime owns EffectPolicy Idempotent → candidates.get
// ---------------------------------------------------------------------------

export interface ExecuteCandidatesCreateSyncInput extends AshbyAuthInput {
  /** Candidate full name (required by Ashby). */
  name: string;
  /** Primary personal email. */
  email?: string;
  /** Primary personal phone number. */
  phoneNumber?: string;
  /** LinkedIn profile URL. */
  linkedInUrl?: string;
  /** GitHub profile URL. */
  githubUrl?: string;
  /**
   * Website URL. AppCall field `websiteUrl` maps to Ashby native body field `website`
   * (official candidate.create schema).
   */
  websiteUrl?: string;
  /** Source UUID credited on the candidate. */
  sourceId?: string;
  /** User UUID the candidate is credited to. */
  creditedToUserId?: string;
}

export interface ExecuteCandidatesCreateSyncOutput {
  /** Raw Ashby results payload; runner Idempotent replaces with candidates.get. */
  id?: string;
  [key: string]: unknown;
}

function unwrapAshbyCreateResults(raw: unknown, label: string): Record<string, unknown> {
  if (raw != null && typeof raw === "object" && !Array.isArray(raw)) {
    const results = (raw as { results?: unknown }).results;
    if (results != null && typeof results === "object" && !Array.isArray(results)) {
      return results as Record<string, unknown>;
    }
  }
  throw new Error(`Ashby ${label} response missing results object`);
}

export async function executeCandidatesCreateSync(
  input: ExecuteCandidatesCreateSyncInput,
): Promise<ExecuteCandidatesCreateSyncOutput> {
  const name = requireNonEmptyString(input.name, "name");
  const body = compactBody({
    name,
    email: input.email,
    phoneNumber: input.phoneNumber,
    linkedInUrl: input.linkedInUrl,
    githubUrl: input.githubUrl,
    // Native Ashby field is `website`; AppCall exposes websiteUrl.
    website: input.websiteUrl,
    sourceId: input.sourceId,
    creditedToUserId: input.creditedToUserId,
  });

  const client = createAuthClient({
    apiKey: input.apiKey,
    fetch: input.fetch,
    operation: "candidates.create",
  });
  // POST only — runner EffectPolicy Idempotent observes via candidates.get.
  const raw = await client.postJSON("/candidate.create", body);
  return unwrapAshbyCreateResults(raw, "candidates.create");
}

// ---------------------------------------------------------------------------
// applications.create — POST /application.create
// Runtime owns EffectPolicy Idempotent → applications.get
// ---------------------------------------------------------------------------

export interface ExecuteApplicationsCreateSyncInput extends AshbyAuthInput {
  /** Ashby candidate UUID to consider for a job. */
  candidateId: string;
  /** Ashby job UUID. */
  jobId: string;
  /** Optional source UUID. */
  sourceId?: string;
  /** Optional user UUID credited for the application. */
  creditedToUserId?: string;
  /**
   * Optional interview stage UUID, or Ashby special string
   * `FirstPreInterviewScreen`.
   */
  interviewStageId?: string;
}

export interface ExecuteApplicationsCreateSyncOutput {
  /** Raw Ashby results payload; runner Idempotent replaces with applications.get. */
  id?: string;
  [key: string]: unknown;
}

export async function executeApplicationsCreateSync(
  input: ExecuteApplicationsCreateSyncInput,
): Promise<ExecuteApplicationsCreateSyncOutput> {
  const candidateId = requireNonEmptyString(input.candidateId, "candidateId");
  const jobId = requireNonEmptyString(input.jobId, "jobId");
  const body = compactBody({
    candidateId,
    jobId,
    sourceId: input.sourceId,
    creditedToUserId: input.creditedToUserId,
    interviewStageId: input.interviewStageId,
  });

  const client = createAuthClient({
    apiKey: input.apiKey,
    fetch: input.fetch,
    operation: "applications.create",
  });
  // POST only — runner EffectPolicy Idempotent observes via applications.get.
  const raw = await client.postJSON("/application.create", body);
  return unwrapAshbyCreateResults(raw, "applications.create");
}


// ---------------------------------------------------------------------------
// interviews.schedule — POST /interviewSchedule.create
// ---------------------------------------------------------------------------

export interface InterviewScheduleEventInput {
  startTime: string;
  endTime: string;
  interviewers: Array<{ email: string; feedbackRequired?: boolean | null }>;
  interviewId?: string | null;
  extraData?: Record<string, string> | null;
}

export interface ExecuteInterviewsScheduleSyncInput extends AshbyAuthInput {
  applicationId: string;
  interviewEvents: InterviewScheduleEventInput[];
}

export interface ExecuteInterviewsScheduleSyncOutput {
  interviewSchedule: NormalizedInterviewSchedule | null;
}

export async function executeInterviewsScheduleSync(
  input: ExecuteInterviewsScheduleSyncInput,
): Promise<ExecuteInterviewsScheduleSyncOutput> {
  const applicationId = requireNonEmptyString(input.applicationId, "applicationId");
  if (!Array.isArray(input.interviewEvents) || input.interviewEvents.length === 0) {
    throw new Error("interviewEvents is required");
  }
  const interviewEvents: Record<string, unknown>[] = [];
  for (const event of input.interviewEvents) {
    const startTime = requireNonEmptyString(event?.startTime, "interviewEvents.startTime");
    const endTime = requireNonEmptyString(event?.endTime, "interviewEvents.endTime");
    if (!Array.isArray(event?.interviewers) || event.interviewers.length === 0) {
      throw new Error("interviewEvents.interviewers is required");
    }
    const interviewers: Record<string, unknown>[] = [];
    for (const interviewer of event.interviewers) {
      const email = requireNonEmptyString(interviewer?.email, "interviewEvents.interviewers.email");
      interviewers.push(
        compactBody({
          email,
          feedbackRequired: interviewer.feedbackRequired,
        }),
      );
    }
    interviewEvents.push(
      compactBody({
        startTime,
        endTime,
        interviewers,
        interviewId: event.interviewId,
        extraData: event.extraData,
      }),
    );
  }

  const client = createAuthClient({
    apiKey: input.apiKey,
    fetch: input.fetch,
    operation: "interviews.schedule",
  });
  const raw = await client.postJSON(
    "/interviewSchedule.create",
    { applicationId, interviewEvents },
  );
  return parseInterviewScheduleInfoResponse(raw);
}

// ---------------------------------------------------------------------------
// interviews.cancel — POST /interviewSchedule.cancel
// ---------------------------------------------------------------------------

export interface ExecuteInterviewsCancelSyncInput extends AshbyAuthInput {
  /** Ashby interview schedule UUID (maps to request body `id`). */
  interviewScheduleId: string;
  allowReschedule?: boolean | null;
}

export interface ExecuteInterviewsCancelSyncOutput {
  interviewSchedule: NormalizedInterviewSchedule | null;
}

export async function executeInterviewsCancelSync(
  input: ExecuteInterviewsCancelSyncInput,
): Promise<ExecuteInterviewsCancelSyncOutput> {
  const id = requireNonEmptyString(input.interviewScheduleId, "interviewScheduleId");
  const client = createAuthClient({
    apiKey: input.apiKey,
    fetch: input.fetch,
    operation: "interviews.cancel",
  });
  const raw = await client.postJSON(
    "/interviewSchedule.cancel",
    compactBody({
      id,
      allowReschedule: input.allowReschedule,
    }),
  );
  return parseInterviewScheduleInfoResponse(raw);
}
