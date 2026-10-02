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
 * applications.move       → POST /application.changeStage then
 *                           EffectPolicy Reconcile via applications.get
 * applications.reject     → POST /application.changeStage (Archived + archiveReasonId)
 *                           then EffectPolicy Reconcile via applications.get
 * applications.hire       → POST /application.changeStage (Hired stage)
 *                           then EffectPolicy Reconcile via applications.get
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
  /** Ashby application UUID. Required unless submittedFormInstanceId is set. */
  applicationId?: string;
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
  const hasFormId =
    typeof input.submittedFormInstanceId === "string" && input.submittedFormInstanceId.length > 0;
  if (!hasAppId && !hasFormId) {
    throw new Error("applicationId or submittedFormInstanceId is required");
  }
  const client = createAuthClient({
    apiKey: input.apiKey,
    fetch: input.fetch,
    operation: "applications.get",
  });
  // Official Ashby precedence: when both are provided, lookup uses applicationId.
  const raw = await client.postJSON(
    "/application.info",
    compactBody({
      applicationId: hasAppId ? input.applicationId : undefined,
      submittedFormInstanceId: hasFormId && !hasAppId ? input.submittedFormInstanceId : undefined,
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
// EffectPolicy Reconcile → applications.get
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
  application: NormalizedApplication | null;
}

async function executeApplicationsChangeStageThenReconcile(
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

  // EffectPolicy::Reconcile — observe post-mutate state via applications.get.
  return executeApplicationsGetSync({
    apiKey: input.apiKey,
    applicationId,
    fetch: input.fetch,
  });
}

export async function executeApplicationsMoveSync(
  input: ExecuteApplicationsMoveSyncInput,
): Promise<ExecuteApplicationsChangeStageSyncOutput> {
  return executeApplicationsChangeStageThenReconcile(input, "applications.move");
}

export async function executeApplicationsRejectSync(
  input: ExecuteApplicationsRejectSyncInput,
): Promise<ExecuteApplicationsChangeStageSyncOutput> {
  return executeApplicationsChangeStageThenReconcile(input, "applications.reject", {
    requireArchiveReason: true,
  });
}

export async function executeApplicationsHireSync(
  input: ExecuteApplicationsHireSyncInput,
): Promise<ExecuteApplicationsChangeStageSyncOutput> {
  return executeApplicationsChangeStageThenReconcile(input, "applications.hire");
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
