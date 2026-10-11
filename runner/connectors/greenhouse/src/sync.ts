/**
 * Greenhouse list/get/write syncs (Harvest v3 + boards v1).
 *
 * jobs.list                    → public GET /v1/boards/{boardToken}/jobs
 * jobs.get                     → authenticated Harvest GET /v3/jobs?ids=
 * candidates.list              → authenticated GET /v3/candidates
 * candidates.get               → authenticated GET /v3/candidates?ids=
 * applications.list            → authenticated GET /v3/applications
 * applications.get             → authenticated GET /v3/applications/{id}
 * applications.move            → POST /v3/applications/{id}/move
 *                                (runner EffectPolicy Reconcile → applications.get)
 * applications.create          → POST /v3/applications
 *                                (runner EffectPolicy Idempotent → applications.get)
 * users.list                   → authenticated GET /v3/users
 * interviews.list              → authenticated GET /v3/interviews
 * job_interview_stages.list    → authenticated GET /v3/job_interview_stages
 */

import { createClient, createAuthClient } from "./http";
import { assertSafePathSegment } from "../../_shared/jobboard";
import {
  parseJobsResponse,
  parseJobGetResponse,
  parseCandidatesResponse,
  parseCandidateGetResponse,
  parseApplicationsResponse,
  parseApplicationGetResponse,
  parseUsersResponse,
  parseUserGetResponse,
  parseInterviewsResponse,
  parseJobInterviewStagesResponse,
  parseOffersResponse,
  parseOfferGetResponse,
  parseScorecardsResponse,
  parseScorecardGetResponse,
  parseDepartmentsResponse,
  parseOfficesResponse,
  parseSourcesResponse,
  parseCloseReasonsResponse,
  type NormalizedJob,
  type NormalizedCandidate,
  type NormalizedApplication,
  type NormalizedUser,
  type NormalizedInterview,
  type NormalizedJobInterviewStage,
  type NormalizedOffer,
  type NormalizedScorecard,
  type NormalizedDepartment,
  type NormalizedOffice,
  type NormalizedSource,
  type NormalizedCloseReason,
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
  clientId: string;
  clientSecret: string;
  /** Optional Greenhouse user id for the OAuth `sub` claim (Site Admin). */
  userId?: string;
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


function requireCursorNotPage(input: { page?: number; cursor?: string }, label: string): void {
  if (input.page != null) {
    throw new Error(`${label}: page is not supported on Harvest v3; pass cursor instead`);
  }
}

function createdAtFilter(input: { createdBefore?: string; createdAfter?: string }): string | undefined {
  if (input.createdAfter && input.createdBefore) {
    throw new Error("createdAfter and createdBefore cannot both be set on Harvest v3");
  }
  if (input.createdAfter) return `gte|${input.createdAfter}`;
  if (input.createdBefore) return `lt|${input.createdBefore}`;
  return undefined;
}

function updatedAtFilter(input: { updatedBefore?: string; updatedAfter?: string }): string | undefined {
  if (input.updatedAfter && input.updatedBefore) {
    throw new Error("updatedAfter and updatedBefore cannot both be set on Harvest v3");
  }
  if (input.updatedAfter) return `gte|${input.updatedAfter}`;
  if (input.updatedBefore) return `lt|${input.updatedBefore}`;
  return undefined;
}

function authClientOpts(input: GreenhouseAuthInput, operation: string) {
  return {
    clientId: input.clientId,
    clientSecret: input.clientSecret,
    userId: input.userId,
    fetch: input.fetch,
    operation,
  };
}


function asStageId(value: string | number | undefined, field: string): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.length > 0 && /^-?\d+$/.test(value)) {
    return Number(value);
  }
  throw new Error(`${field} is required`);
}

function optionalStageId(value: string | number | undefined): number | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && /^-?\d+$/.test(value)) return Number(value);
  throw new Error("stage/job id must be an integer");
}

// ---------------------------------------------------------------------------
// candidates.list — GET /v3/candidates
// ---------------------------------------------------------------------------

export interface ExecuteCandidatesListSyncInput extends GreenhouseAuthInput {
  perPage?: number;
  /** Harvest v3 cursor (from Link rel=next). */
  cursor?: string;
  /** @deprecated Harvest v3 removed page; passing page throws. */
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
  nextCursor: string | null;
}

export async function executeCandidatesListSync(
  input: ExecuteCandidatesListSyncInput,
): Promise<ExecuteCandidatesListSyncOutput> {
  requireCursorNotPage(input, "candidates.list");
  const client = createAuthClient(authClientOpts(input, "candidates.list"));
  const path =
    "/candidates" +
    buildQuery({
      per_page: input.perPage != null ? String(input.perPage) : undefined,
      cursor: input.cursor,
      created_at: createdAtFilter(input),
      updated_at: updatedAtFilter(input),
      job_ids: input.jobId != null ? String(input.jobId) : undefined,
      email: input.email,
      candidate_ids: input.candidateIds,
    });
  const { body, nextCursor } = await client.getJSONWithMeta(path);
  return { ...parseCandidatesResponse(body), nextCursor };
}

// ---------------------------------------------------------------------------
// candidates.get — GET /v3/candidates/{id}
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
  const client = createAuthClient(authClientOpts(input, "candidates.get"));
  const raw = await client.getJSON(`/candidates?ids=${encodeURIComponent(id)}&per_page=1`);
  return parseCandidateGetResponse(raw);
}

// ---------------------------------------------------------------------------
// applications.list — GET /v3/applications
// ---------------------------------------------------------------------------

export interface ExecuteApplicationsListSyncInput extends GreenhouseAuthInput {
  perPage?: number;
  cursor?: string;
  /** @deprecated Harvest v3 removed page; passing page throws. */
  page?: number;
  createdBefore?: string;
  createdAfter?: string;
  lastActivityAfter?: string;
  jobId?: string | number;
  status?: string;
}

export interface ExecuteApplicationsListSyncOutput {
  applications: NormalizedApplication[];
  nextCursor: string | null;
}

export async function executeApplicationsListSync(
  input: ExecuteApplicationsListSyncInput,
): Promise<ExecuteApplicationsListSyncOutput> {
  requireCursorNotPage(input, "applications.list");
  const client = createAuthClient(authClientOpts(input, "applications.list"));
  const path =
    "/applications" +
    buildQuery({
      per_page: input.perPage != null ? String(input.perPage) : undefined,
      cursor: input.cursor,
      created_at: createdAtFilter(input),
      last_activity_at: input.lastActivityAfter ? `gte|${input.lastActivityAfter}` : undefined,
      job_ids: input.jobId != null ? String(input.jobId) : undefined,
      status: input.status,
    });
  const { body, nextCursor } = await client.getJSONWithMeta(path);
  return { ...parseApplicationsResponse(body), nextCursor };
}

// ---------------------------------------------------------------------------
// applications.get — GET /v3/applications/{id}
// ---------------------------------------------------------------------------

export interface ExecuteApplicationsGetSyncInput extends GreenhouseAuthInput {
  /** Harvest application id. */
  id: string;
}

export interface ExecuteApplicationsGetSyncOutput {
  application: NormalizedApplication | null;
}

export async function executeApplicationsGetSync(
  input: ExecuteApplicationsGetSyncInput,
): Promise<ExecuteApplicationsGetSyncOutput> {
  const id = assertSafePathSegment(input.id, "id");
  const client = createAuthClient(authClientOpts(input, "applications.get"));
  const raw = await client.getJSON(`/applications?ids=${encodeURIComponent(id)}&per_page=1`);
  return parseApplicationGetResponse(raw);
}

// ---------------------------------------------------------------------------
// applications.move — POST /v3/applications/{id}/move
// Runtime owns EffectPolicy Reconcile → applications.get (move returns 204).
// ---------------------------------------------------------------------------

export interface ExecuteApplicationsMoveSyncInput extends GreenhouseAuthInput {
  /** Harvest application id. */
  id: string;
  /** Current job interview stage id (required guard). */
  fromStageId: string | number;
  /** Destination stage within the same job (optional). */
  toStageId?: string | number;
  /** Transfer onto a different job (optional; lands on that job's first stage). */
  toJobId?: string | number;
  /** Optional user id to send stage-transition emails from. */
  emailFromUserId?: string | number;
}

export interface ExecuteApplicationsMoveSyncOutput {
  /** Placeholder; runner Reconcile replaces this with applications.get output. */
  application: null;
}

export async function executeApplicationsMoveSync(
  input: ExecuteApplicationsMoveSyncInput,
): Promise<ExecuteApplicationsMoveSyncOutput> {
  const id = assertSafePathSegment(input.id, "id");
  const fromStageId = asStageId(input.fromStageId, "fromStageId");
  const body: Record<string, unknown> = { from_stage_id: fromStageId };
  const toStageId = optionalStageId(input.toStageId);
  const toJobId = optionalStageId(input.toJobId);
  const emailFromUserId = optionalStageId(input.emailFromUserId);
  if (toStageId != null) body.to_stage_id = toStageId;
  if (toJobId != null) body.to_job_id = toJobId;
  if (emailFromUserId != null) body.email_from_user_id = emailFromUserId;

  const client = createAuthClient(authClientOpts(input, "applications.move"));
  await client.postJSON(`/applications/${id}/move`, body);
  return { application: null };
}


// ---------------------------------------------------------------------------
// applications.create — POST /v3/applications
// Runtime owns EffectPolicy Idempotent → applications.get (create returns 201).
// ---------------------------------------------------------------------------

export interface ExecuteApplicationsCreateSyncInput extends GreenhouseAuthInput {
  /** Harvest candidate id to attach the application to. */
  candidateId: string | number;
  /** Harvest job id for a candidate application. */
  jobId: string | number;
  /** Optional initial interview stage id. */
  initialStageId?: string | number;
  /** Optional source id credited for this application. */
  sourceId?: string | number;
  /** Optional recruiter user id. */
  recruiterId?: string | number;
  /** Optional coordinator user id. */
  coordinatorId?: string | number;
  /** Optional referrer id. */
  referrerId?: string | number;
}

export interface ExecuteApplicationsCreateSyncOutput {
  /** Raw Harvest create payload; runner Idempotent replaces with applications.get. */
  id?: number | string;
  [key: string]: unknown;
}

export async function executeApplicationsCreateSync(
  input: ExecuteApplicationsCreateSyncInput,
): Promise<ExecuteApplicationsCreateSyncOutput> {
  const candidateId = asStageId(input.candidateId, "candidateId");
  const jobId = asStageId(input.jobId, "jobId");
  const body: Record<string, unknown> = {
    candidate_id: candidateId,
    job_id: jobId,
  };
  const initialStageId = optionalStageId(input.initialStageId);
  const sourceId = optionalStageId(input.sourceId);
  const recruiterId = optionalStageId(input.recruiterId);
  const coordinatorId = optionalStageId(input.coordinatorId);
  const referrerId = optionalStageId(input.referrerId);
  if (initialStageId != null) body.initial_stage_id = initialStageId;
  if (sourceId != null) body.source_id = sourceId;
  if (recruiterId != null) body.recruiter_id = recruiterId;
  if (coordinatorId != null) body.coordinator_id = coordinatorId;
  if (referrerId != null) body.referrer_id = referrerId;

  const client = createAuthClient(authClientOpts(input, "applications.create"));
  // POST only — runner EffectPolicy Idempotent observes via applications.get.
  return (await client.postJSON("/applications", body)) as ExecuteApplicationsCreateSyncOutput;
}

// ---------------------------------------------------------------------------
// users.list — GET /v3/users
// ---------------------------------------------------------------------------

export interface ExecuteUsersListSyncInput extends GreenhouseAuthInput {
  perPage?: number;
  cursor?: string;
  page?: number;
  createdBefore?: string;
  createdAfter?: string;
  updatedBefore?: string;
  updatedAfter?: string;
  email?: string;
  employeeId?: string;
}

export interface ExecuteUsersListSyncOutput {
  users: NormalizedUser[];
  nextCursor: string | null;
}

export async function executeUsersListSync(
  input: ExecuteUsersListSyncInput,
): Promise<ExecuteUsersListSyncOutput> {
  requireCursorNotPage(input, "users.list");
  const client = createAuthClient(authClientOpts(input, "users.list"));
  const path =
    "/users" +
    buildQuery({
      per_page: input.perPage != null ? String(input.perPage) : undefined,
      cursor: input.cursor,
      created_at: createdAtFilter(input),
      updated_at: updatedAtFilter(input),
      email: input.email,
      employee_id: input.employeeId,
    });
  const { body, nextCursor } = await client.getJSONWithMeta(path);
  return { ...parseUsersResponse(body), nextCursor };
}

// ---------------------------------------------------------------------------
// jobs.get — Harvest GET /v3/jobs/{id} (NOT boards)
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
  const client = createAuthClient(authClientOpts(input, "jobs.get"));
  const raw = await client.getJSON(`/jobs?ids=${encodeURIComponent(id)}&per_page=1`);
  return parseJobGetResponse(raw);
}

// ---------------------------------------------------------------------------
// interviews.list — GET /v3/interviews (was /v1/scheduled_interviews)
// ---------------------------------------------------------------------------

export interface ExecuteInterviewsListSyncInput extends GreenhouseAuthInput {
  perPage?: number;
  cursor?: string;
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
  nextCursor: string | null;
}

export async function executeInterviewsListSync(
  input: ExecuteInterviewsListSyncInput,
): Promise<ExecuteInterviewsListSyncOutput> {
  requireCursorNotPage(input, "interviews.list");
  const client = createAuthClient(authClientOpts(input, "interviews.list"));
  const path =
    "/interviews" +
    buildQuery({
      per_page: input.perPage != null ? String(input.perPage) : undefined,
      cursor: input.cursor,
      application_ids: input.applicationId != null ? String(input.applicationId) : undefined,
      job_ids: input.jobId != null ? String(input.jobId) : undefined,
      created_at: createdAtFilter(input),
      updated_at: updatedAtFilter(input),
    });
  const { body, nextCursor } = await client.getJSONWithMeta(path);
  return { ...parseInterviewsResponse(body), nextCursor };
}

// ---------------------------------------------------------------------------
// job_interview_stages.list — GET /v3/job_interview_stages
// ---------------------------------------------------------------------------

export interface ExecuteJobInterviewStagesListSyncInput extends GreenhouseAuthInput {
  perPage?: number;
  jobIds?: string;
  ids?: string;
  active?: boolean;
}

export interface ExecuteJobInterviewStagesListSyncOutput {
  stages: NormalizedJobInterviewStage[];
}

export async function executeJobInterviewStagesListSync(
  input: ExecuteJobInterviewStagesListSyncInput,
): Promise<ExecuteJobInterviewStagesListSyncOutput> {
  const client = createAuthClient(authClientOpts(input, "job_interview_stages.list"));
  const path =
    "/job_interview_stages" +
    buildQuery({
      per_page: input.perPage != null ? String(input.perPage) : undefined,
      job_ids: input.jobIds,
      ids: input.ids,
      active: input.active == null ? undefined : input.active ? "true" : "false",
    });
  const raw = await client.getJSON(path);
  return parseJobInterviewStagesResponse(raw);
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value === "string" && value.length > 0) return value;
  throw new Error(`${field} is required`);
}

export interface ExecuteCandidatesCreateSyncInput extends GreenhouseAuthInput {
  firstName: string;
  lastName: string;
  company?: string;
  title?: string;
  email?: string;
  phone?: string;
  jobId?: string | number;
}

export interface ExecuteCandidatesCreateSyncOutput {
  id?: number | string;
  [key: string]: unknown;
}

export async function executeCandidatesCreateSync(
  input: ExecuteCandidatesCreateSyncInput,
): Promise<ExecuteCandidatesCreateSyncOutput> {
  const firstName = requireNonEmptyString(input.firstName, "firstName");
  const lastName = requireNonEmptyString(input.lastName, "lastName");
  const body: Record<string, unknown> = {
    first_name: firstName,
    last_name: lastName,
  };
  if (typeof input.company === "string" && input.company.length > 0) body.company = input.company;
  if (typeof input.title === "string" && input.title.length > 0) body.title = input.title;
  if (typeof input.email === "string" && input.email.length > 0) {
    body.email_addresses = [{ value: input.email, type: "personal" }];
  }
  if (typeof input.phone === "string" && input.phone.length > 0) {
    body.phone_numbers = [{ value: input.phone, type: "mobile" }];
  }
  const jobId = optionalStageId(input.jobId);
  if (jobId != null) body.applications = [{ job_id: jobId }];

  const client = createAuthClient(authClientOpts(input, "candidates.create"));
  return (await client.postJSON("/candidates", body)) as ExecuteCandidatesCreateSyncOutput;
}

export interface ExecuteCandidatesUpdateSyncInput extends GreenhouseAuthInput {
  id: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  title?: string;
}

export interface ExecuteCandidatesUpdateSyncOutput {
  candidate: null;
}

export async function executeCandidatesUpdateSync(
  input: ExecuteCandidatesUpdateSyncInput,
): Promise<ExecuteCandidatesUpdateSyncOutput> {
  const id = assertSafePathSegment(input.id, "id");
  const body: Record<string, unknown> = {};
  if (typeof input.firstName === "string" && input.firstName.length > 0) body.first_name = input.firstName;
  if (typeof input.lastName === "string" && input.lastName.length > 0) body.last_name = input.lastName;
  if (typeof input.company === "string" && input.company.length > 0) body.company = input.company;
  if (typeof input.title === "string" && input.title.length > 0) body.title = input.title;
  const client = createAuthClient(authClientOpts(input, "candidates.update"));
  await client.patchJSON(`/candidates/${id}`, body);
  return { candidate: null };
}

export interface ExecuteOffersListSyncInput extends GreenhouseAuthInput {
  perPage?: number;
  cursor?: string;
  page?: number;
  createdBefore?: string;
  createdAfter?: string;
  updatedBefore?: string;
  updatedAfter?: string;
  applicationId?: string | number;
  jobId?: string | number;
}

export interface ExecuteOffersListSyncOutput {
  offers: NormalizedOffer[];
  nextCursor: string | null;
}

export async function executeOffersListSync(
  input: ExecuteOffersListSyncInput,
): Promise<ExecuteOffersListSyncOutput> {
  requireCursorNotPage(input, "offers.list");
  const client = createAuthClient(authClientOpts(input, "offers.list"));
  const path =
    "/offers" +
    buildQuery({
      per_page: input.perPage != null ? String(input.perPage) : undefined,
      cursor: input.cursor,
      created_at: createdAtFilter(input),
      updated_at: updatedAtFilter(input),
      application_ids: input.applicationId != null ? String(input.applicationId) : undefined,
      job_ids: input.jobId != null ? String(input.jobId) : undefined,
    });
  const { body, nextCursor } = await client.getJSONWithMeta(path);
  return { ...parseOffersResponse(body), nextCursor };
}

export interface ExecuteOffersGetSyncInput extends GreenhouseAuthInput {
  id: string;
}

export interface ExecuteOffersGetSyncOutput {
  offer: NormalizedOffer | null;
}

export async function executeOffersGetSync(
  input: ExecuteOffersGetSyncInput,
): Promise<ExecuteOffersGetSyncOutput> {
  const id = assertSafePathSegment(input.id, "id");
  const client = createAuthClient(authClientOpts(input, "offers.get"));
  const raw = await client.getJSON(`/offers?ids=${encodeURIComponent(id)}&per_page=1`);
  return parseOfferGetResponse(raw);
}

export interface ExecuteScorecardsListSyncInput extends GreenhouseAuthInput {
  perPage?: number;
  cursor?: string;
  page?: number;
  createdBefore?: string;
  createdAfter?: string;
  updatedBefore?: string;
  updatedAfter?: string;
  applicationId?: string | number;
}

export interface ExecuteScorecardsListSyncOutput {
  scorecards: NormalizedScorecard[];
  nextCursor: string | null;
}

export async function executeScorecardsListSync(
  input: ExecuteScorecardsListSyncInput,
): Promise<ExecuteScorecardsListSyncOutput> {
  requireCursorNotPage(input, "scorecards.list");
  const client = createAuthClient(authClientOpts(input, "scorecards.list"));
  const path =
    "/scorecards" +
    buildQuery({
      per_page: input.perPage != null ? String(input.perPage) : undefined,
      cursor: input.cursor,
      created_at: createdAtFilter(input),
      updated_at: updatedAtFilter(input),
      application_ids: input.applicationId != null ? String(input.applicationId) : undefined,
    });
  const { body, nextCursor } = await client.getJSONWithMeta(path);
  return { ...parseScorecardsResponse(body), nextCursor };
}

export interface ExecuteScorecardsGetSyncInput extends GreenhouseAuthInput {
  id: string;
}

export interface ExecuteScorecardsGetSyncOutput {
  scorecard: NormalizedScorecard | null;
}

export async function executeScorecardsGetSync(
  input: ExecuteScorecardsGetSyncInput,
): Promise<ExecuteScorecardsGetSyncOutput> {
  const id = assertSafePathSegment(input.id, "id");
  const client = createAuthClient(authClientOpts(input, "scorecards.get"));
  const raw = await client.getJSON(`/scorecards?ids=${encodeURIComponent(id)}&per_page=1`);
  return parseScorecardGetResponse(raw);
}

export interface ExecuteDepartmentsListSyncInput extends GreenhouseAuthInput {
  perPage?: number;
}

export interface ExecuteDepartmentsListSyncOutput {
  departments: NormalizedDepartment[];
}

export async function executeDepartmentsListSync(
  input: ExecuteDepartmentsListSyncInput,
): Promise<ExecuteDepartmentsListSyncOutput> {
  const client = createAuthClient(authClientOpts(input, "departments.list"));
  const path =
    "/departments" +
    buildQuery({
      per_page: input.perPage != null ? String(input.perPage) : undefined,
    });
  const raw = await client.getJSON(path);
  return parseDepartmentsResponse(raw);
}

export interface ExecuteOfficesListSyncInput extends GreenhouseAuthInput {
  perPage?: number;
}

export interface ExecuteOfficesListSyncOutput {
  offices: NormalizedOffice[];
}

export async function executeOfficesListSync(
  input: ExecuteOfficesListSyncInput,
): Promise<ExecuteOfficesListSyncOutput> {
  const client = createAuthClient(authClientOpts(input, "offices.list"));
  const path =
    "/offices" +
    buildQuery({
      per_page: input.perPage != null ? String(input.perPage) : undefined,
    });
  const raw = await client.getJSON(path);
  return parseOfficesResponse(raw);
}

export interface ExecuteSourcesListSyncInput extends GreenhouseAuthInput {
  perPage?: number;
}

export interface ExecuteSourcesListSyncOutput {
  sources: NormalizedSource[];
}

export async function executeSourcesListSync(
  input: ExecuteSourcesListSyncInput,
): Promise<ExecuteSourcesListSyncOutput> {
  const client = createAuthClient(authClientOpts(input, "sources.list"));
  const path =
    "/sources" +
    buildQuery({
      per_page: input.perPage != null ? String(input.perPage) : undefined,
    });
  const raw = await client.getJSON(path);
  return parseSourcesResponse(raw);
}

export interface ExecuteCloseReasonsListSyncInput extends GreenhouseAuthInput {
  perPage?: number;
}

export interface ExecuteCloseReasonsListSyncOutput {
  closeReasons: NormalizedCloseReason[];
}

export async function executeCloseReasonsListSync(
  input: ExecuteCloseReasonsListSyncInput,
): Promise<ExecuteCloseReasonsListSyncOutput> {
  const client = createAuthClient(authClientOpts(input, "close_reasons.list"));
  const path =
    "/close_reasons" +
    buildQuery({
      per_page: input.perPage != null ? String(input.perPage) : undefined,
    });
  const raw = await client.getJSON(path);
  return parseCloseReasonsResponse(raw);
}

export interface ExecuteUsersGetSyncInput extends GreenhouseAuthInput {
  id: string;
}

export interface ExecuteUsersGetSyncOutput {
  user: NormalizedUser | null;
}

export async function executeUsersGetSync(
  input: ExecuteUsersGetSyncInput,
): Promise<ExecuteUsersGetSyncOutput> {
  const id = assertSafePathSegment(input.id, "id");
  const client = createAuthClient(authClientOpts(input, "users.get"));
  const raw = await client.getJSON(`/users?ids=${encodeURIComponent(id)}&per_page=1`);
  return parseUserGetResponse(raw);
}

export interface ExecuteApplicationsRejectSyncInput extends GreenhouseAuthInput {
  id: string;
  /** Required on Harvest v3. */
  rejectionReasonId: string | number;
  notes?: string;
  /** Optional rejection email payload (v3). */
  rejectionEmail?: Record<string, unknown>;
}

export interface ExecuteApplicationsRejectSyncOutput {
  application: null;
}

export async function executeApplicationsRejectSync(
  input: ExecuteApplicationsRejectSyncInput,
): Promise<ExecuteApplicationsRejectSyncOutput> {
  const id = assertSafePathSegment(input.id, "id");
  const rejectionReasonId = optionalStageId(input.rejectionReasonId);
  if (rejectionReasonId == null) {
    throw new Error("rejectionReasonId is required");
  }
  const body: Record<string, unknown> = { rejection_reason_id: rejectionReasonId };
  if (typeof input.notes === "string" && input.notes.length > 0) body.notes = input.notes;
  if (input.rejectionEmail && typeof input.rejectionEmail === "object") {
    body.rejection_email = input.rejectionEmail;
  }
  const client = createAuthClient(authClientOpts(input, "applications.reject"));
  await client.postJSON(`/applications/${id}/reject`, body);
  return { application: null };
}
