/**
 * SmartRecruiters G2 — jobs (15 ops, v0.5.0).
 *
 * Customer API calls use X-SmartToken on https://api.smartrecruiters.com
 * (createApiClient); postings.get uses the public Posting API client.
 *
 *   jobs.search              GET    /jobs                                  jobsall-1
 *   jobs.create              POST   /jobs                                  jobscreate-1
 *   jobs.update              PATCH  /jobs/{jobId} (JSON Patch)             jobspatch-1
 *   jobs.update_status       PUT    /jobs/{jobId}/status                   jobsstatusupdate-1
 *   jobs.status_history      GET    /jobs/{jobId}/status/history           jobsstatushistoryget-1
 *   jobs.hiring_team.get     GET    /jobs/{jobId}/hiring-team              jobshiring-teamget-1
 *   jobs.hiring_team.add     POST   /jobs/{jobId}/hiring-team              jobshiring-teamadd-1
 *   jobs.hiring_team.remove  DELETE /jobs/{jobId}/hiring-team/{userId}     jobshiring-teamremove-1
 *   jobs.note.get            GET    /jobs/{jobId}/note                     jobsnotesget-1
 *   jobs.note.update         PUT    /jobs/{jobId}/note                     jobsnotesupdate-1
 *   jobs.publish             POST   /jobs/{jobId}/publication              jobspublicationcreate-1
 *   jobs.unpublish           DELETE /jobs/{jobId}/publication              jobspublicationunpublish-1
 *   jobs.publications.list   GET    /jobs/{jobId}/publication              jobspublicationall-1
 *   jobs.positions.list      GET    /jobs/{jobId}/positions                jobspositionsall-1
 *   postings.get             GET    /v1/companies/{company}/postings/{id}  v1getposting
 *
 * Job ops take the job id as `id`, the same key jobs.get reads, so a
 * Reconcile observe can reuse the write input unchanged.
 *
 * Effect keys (manifest):
 * - jobs.create, jobs.hiring_team.add, jobs.publish: omitted (create).
 * - jobs.update: omitted. Upstream PATCH may trigger job approval, so jobs.get
 *   can lag and is not an exact observe. Inputs still narrowed to title/refNumber.
 * - jobs.update_status: Reconcile → jobs.get [id] (status).
 * - jobs.note.update: Reconcile → jobs.note.get [id] (content).
 * - jobs.hiring_team.remove, jobs.unpublish: omitted (delete). Any non-2xx,
 *   including 404, maps to CONNECTOR_UPSTREAM_ERROR.
 *
 * Job ids accept raw upstream ids or `sr-job:` (stripped before the upstream
 * call); hiring-team userId likewise accepts raw or `sr-user:` (users.list
 * form). Every job id this module emits uses the `sr-job:` prefix that
 * jobs.get / jobs.list already use.
 *
 * jobs.search pages by pageId only: the offset parameter is deprecated upstream
 * (400 DEPRECATED_OFFSET_USAGE) and the single-value status filter is
 * deprecated in favour of statuses.
 */
import { assertSafePathSegment } from "../../_shared/jobboard";
import { createApiClient, createClient } from "./http";
import { jobIdSegment, userIdSegment, userIdValue, withJobPrefix } from "./ids";
import { pageIdParam } from "./paging";
import { normalizeJob, type NormalizedJob } from "./objects";

export interface SmartRecruitersG2AuthInput {
  apiKey: string;
  /** Injected by tests; production leaves it unset. */
  fetch?: typeof fetch;
}

export const JOB_STATUSES = ["CREATED", "SOURCING", "FILLED", "INTERVIEW", "OFFER", "CANCELLED", "ON_HOLD"] as const;
export const POSTING_STATUSES = ["PUBLIC", "INTERNAL", "NOT_PUBLISHED", "PRIVATE"] as const;
export const HIRING_TEAM_ROLES = ["HIRING_MANAGER", "INTERVIEW_TEAM", "RECRUITER", "EXECUTIVE", "COORDINATOR"] as const;
export const COMPENSATION_PERIODS = ["HOURLY", "DAILY", "WEEKLY", "MONTHLY", "YEARLY"] as const;
const JOB_STATUS_SET = new Set<string>(JOB_STATUSES);
const POSTING_STATUS_SET = new Set<string>(POSTING_STATUSES);
const ROLE_SET = new Set<string>(HIRING_TEAM_ROLES);
const PERIOD_SET = new Set<string>(COMPENSATION_PERIODS);

function client(input: SmartRecruitersG2AuthInput, operation: string) {
  return createApiClient({ apiKey: input.apiKey, fetch: input.fetch, operation });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} must be a non-empty string`);
  return value;
}

function requiredString(value: unknown, field: string): string {
  const s = optionalString(value, field);
  if (s == null) throw new Error(`${field} is required`);
  return s;
}

function seg(value: unknown, field: string): string {
  if (typeof value !== "string") throw new Error(`${field} is required`);
  return assertSafePathSegment(value, field);
}

/** Job path id: raw or `sr-job:`-prefixed. */
function jobSeg(value: unknown, field = "id"): string {
  return jobIdSegment(value, field);
}

function label(value: unknown): string | null {
  return isRecord(value) ? str(value.label) : null;
}

function itemsOf(raw: unknown): { data: Record<string, unknown>; items: Record<string, unknown>[] } {
  const data = isRecord(raw) ? raw : {};
  return { data, items: Array.isArray(data.content) ? data.content.filter(isRecord) : [] };
}

function totalOf(data: Record<string, unknown>, items: unknown[]): number {
  return typeof data.totalFound === "number" ? data.totalFound : items.length;
}

function formatLocation(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const parts = [value.city, value.region, value.country].filter((p): p is string => typeof p === "string" && p.length > 0);
  return parts.length > 0 ? parts.join(", ") : null;
}

// ---------------------------------------------------------------------------
// jobs.search — GET /jobs (pageId paging)
// ---------------------------------------------------------------------------

export interface JobSummary {
  /** Prefixed SmartRecruiters job id (`sr-job:…`; accepted back as input `id`). */
  id: string;
  title: string | null;
  refNumber: string | null;
  status: string | null;
  postingStatus: string | null;
  department: string | null;
  departmentId: string | null;
  location: string | null;
  remote: boolean | null;
  language: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  lastActivityAt: string | null;
}

function jobSummary(job: Record<string, unknown>): JobSummary {
  const department = isRecord(job.department) ? job.department : {};
  const location = isRecord(job.location) ? job.location : null;
  const language = isRecord(job.language) ? job.language : {};
  return {
    id: withJobPrefix(job.id as string),
    title: str(job.title),
    refNumber: str(job.refNumber),
    status: str(job.status),
    postingStatus: str(job.postingStatus),
    department: str(department.label),
    departmentId: str(department.id),
    location: formatLocation(location),
    remote: location && typeof location.remote === "boolean" ? location.remote : null,
    language: str(language.code),
    createdAt: str(job.createdOn),
    updatedAt: str(job.updatedOn),
    lastActivityAt: str(job.lastActivityOn),
  };
}

export interface JobsSearchInput extends SmartRecruitersG2AuthInput {
  q?: string;
  limit?: number;
  pageId?: string;
  sort?: "default" | "job_id";
  city?: string[];
  department?: string[];
  updatedAfter?: string;
  lastActivityAfter?: string;
  language?: string;
  statuses?: Array<(typeof JOB_STATUSES)[number]>;
  postingStatus?: (typeof POSTING_STATUSES)[number];
  hiringTeamMemberId?: string[];
}

function stringArray(value: unknown, field: string): string[] | undefined {
  if (value == null) return undefined;
  if (!Array.isArray(value) || !value.every((v) => typeof v === "string" && v.length > 0)) {
    throw new Error(`${field} must be an array of non-empty strings`);
  }
  return value as string[];
}

export function buildJobsSearchQuery(input: JobsSearchInput): string {
  const qs = new URLSearchParams();
  const q = optionalString(input.q, "q");
  if (q) qs.set("q", q);
  if (input.limit != null) {
    if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100) throw new Error("limit must be 1-100");
    qs.set("limit", String(input.limit));
  }
  const pageId = pageIdParam(input.pageId, "pageId");
  if (input.sort != null && input.sort !== "default" && input.sort !== "job_id") {
    throw new Error("sort must be default or job_id");
  }
  if (pageId) {
    // Upstream: pageId paging only works with sort=job_id.
    if (input.sort === "default") throw new Error("pageId requires sort job_id");
    qs.set("pageId", pageId);
    qs.set("sort", "job_id");
  } else if (input.sort) {
    qs.set("sort", input.sort);
  }
  for (const c of stringArray(input.city, "city") ?? []) qs.append("city", c);
  for (const d of stringArray(input.department, "department") ?? []) qs.append("department", d);
  const updatedAfter = optionalString(input.updatedAfter, "updatedAfter");
  if (updatedAfter) qs.set("updatedAfter", updatedAfter);
  const lastActivityAfter = optionalString(input.lastActivityAfter, "lastActivityAfter");
  if (lastActivityAfter) qs.set("lastActivityAfter", lastActivityAfter);
  const language = optionalString(input.language, "language");
  if (language) qs.set("language", language);
  for (const s of stringArray(input.statuses, "statuses") ?? []) {
    if (!JOB_STATUS_SET.has(s)) throw new Error(`statuses must be within ${JOB_STATUSES.join(", ")}`);
    qs.append("statuses", s);
  }
  if (input.postingStatus != null) {
    if (!POSTING_STATUS_SET.has(input.postingStatus)) throw new Error(`postingStatus must be one of ${POSTING_STATUSES.join(", ")}`);
    qs.set("postingStatus", input.postingStatus);
  }
  // SR-ID-1: users.list emits sr-user:-prefixed ids; accept them and send the raw id.
  (stringArray(input.hiringTeamMemberId, "hiringTeamMemberId") ?? []).forEach((u, i) =>
    qs.append("hiringTeamMemberId", userIdValue(u, `hiringTeamMemberId[${i}]`)),
  );
  const encoded = qs.toString();
  return encoded ? `?${encoded}` : "";
}

export async function executeJobsSearch(
  input: JobsSearchInput,
): Promise<{ jobs: JobSummary[]; total: number | null; nextPageId: string | null }> {
  const page = await client(input, "jobs.search").getPage(`/jobs${buildJobsSearchQuery(input)}`);
  const { data, items } = itemsOf(page.data);
  return {
    jobs: items.filter((j) => str(j.id) != null).map(jobSummary),
    total: typeof data.totalFound === "number" ? data.totalFound : null,
    // Body nextPageId, else the Link rel="next" pageId (jobsall-1 documents both).
    nextPageId: page.nextPageId,
  };
}

// ---------------------------------------------------------------------------
// jobs.create — POST /jobs
// ---------------------------------------------------------------------------

export interface JobLocationInput {
  /** Predefined location identifier; mutually exclusive with the address fields. */
  identifier?: string;
  city?: string;
  countryCode?: string;
  regionCode?: string;
  region?: string;
  address?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
  remote?: boolean;
  hybrid?: boolean;
  hybridDescription?: string;
}

export interface JobAdSectionInput {
  title?: string;
  text?: string;
}

export interface JobsCreateInput extends SmartRecruitersG2AuthInput {
  title: string;
  refNumber?: string;
  targetHiringDate?: string;
  departmentId?: string;
  location: JobLocationInput;
  industryId: string;
  functionId: string;
  typeOfEmploymentId?: string;
  experienceLevelId: string;
  eeoCategoryId?: string;
  template?: boolean;
  compensation?: { min?: number; max?: number; currency?: string; period?: (typeof COMPENSATION_PERIODS)[number] };
  jobAd?: {
    language?: string;
    companyDescription?: JobAdSectionInput;
    jobDescription?: JobAdSectionInput;
    qualifications?: JobAdSectionInput;
    additionalInformation?: JobAdSectionInput;
    videoUrls?: string[];
  };
  properties?: Array<{ id: string; valueId?: string; valueExternalCode?: string; valueLabel?: string }>;
}

const ADDRESS_KEYS = ["city", "countryCode", "regionCode", "region", "address", "postalCode", "latitude", "longitude"] as const;

function buildLocation(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error("location is required");
  const out: Record<string, unknown> = {};
  const identifier = optionalString(value.identifier, "location.identifier");
  const hasAddress = ADDRESS_KEYS.some((k) => value[k] !== undefined);
  if (identifier) {
    if (hasAddress) throw new Error("location.identifier is mutually exclusive with address fields");
    out.identifier = identifier;
  } else {
    out.city = requiredString(value.city, "location.city");
    out.countryCode = requiredString(value.countryCode, "location.countryCode");
    for (const k of ADDRESS_KEYS) {
      if (k !== "city" && k !== "countryCode" && value[k] !== undefined) out[k] = value[k];
    }
  }
  for (const k of ["remote", "hybrid", "hybridDescription"] as const) {
    if (value[k] !== undefined) out[k] = value[k];
  }
  return out;
}

function idRef(value: unknown, field: string, required: boolean): { id: string } | undefined {
  const id = required ? requiredString(value, field) : optionalString(value, field);
  return id ? { id } : undefined;
}

function section(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  const out: Record<string, unknown> = {};
  if (typeof value.title === "string") out.title = value.title;
  if (typeof value.text === "string") out.text = value.text;
  return out;
}

/** Build the documented JobInput body. */
export function buildJobInput(input: JobsCreateInput): Record<string, unknown> {
  const body: Record<string, unknown> = { title: requiredString(input.title, "title") };
  const refNumber = optionalString(input.refNumber, "refNumber");
  if (refNumber) body.refNumber = refNumber;
  const target = optionalString(input.targetHiringDate, "targetHiringDate");
  if (target) body.targetHiringDate = target;
  const department = idRef(input.departmentId, "departmentId", false);
  if (department) body.department = department;
  body.location = buildLocation(input.location);
  body.industry = idRef(input.industryId, "industryId", true);
  body.function = idRef(input.functionId, "functionId", true);
  const toe = idRef(input.typeOfEmploymentId, "typeOfEmploymentId", false);
  if (toe) body.typeOfEmployment = toe;
  body.experienceLevel = idRef(input.experienceLevelId, "experienceLevelId", true);
  const eeo = idRef(input.eeoCategoryId, "eeoCategoryId", false);
  if (eeo) body.eeoCategory = eeo;
  if (typeof input.template === "boolean") body.template = input.template;
  if (input.compensation != null) {
    const c = input.compensation;
    if (!isRecord(c)) throw new Error("compensation must be an object");
    if (c.period != null && !PERIOD_SET.has(String(c.period))) throw new Error(`compensation.period must be one of ${COMPENSATION_PERIODS.join(", ")}`);
    const comp: Record<string, unknown> = {};
    for (const k of ["min", "max", "currency", "period"] as const) if (c[k] !== undefined) comp[k] = c[k];
    body.compensation = comp;
  }
  if (input.jobAd != null) {
    const ad = input.jobAd;
    if (!isRecord(ad)) throw new Error("jobAd must be an object");
    const sections: Record<string, unknown> = {};
    for (const k of ["companyDescription", "jobDescription", "qualifications", "additionalInformation"] as const) {
      const s = section(ad[k]);
      if (s) sections[k] = s;
    }
    if (Array.isArray(ad.videoUrls)) sections.videos = { urls: ad.videoUrls.filter((u) => typeof u === "string") };
    const jobAd: Record<string, unknown> = { sections };
    const language = optionalString(ad.language, "jobAd.language");
    if (language) jobAd.language = { code: language };
    body.jobAd = jobAd;
  }
  if (input.properties != null) {
    if (!Array.isArray(input.properties)) throw new Error("properties must be an array");
    body.properties = input.properties.map((p, i) => {
      if (!isRecord(p)) throw new Error(`properties[${i}] must be an object`);
      const id = requiredString(p.id, `properties[${i}].id`);
      if (p.valueId != null && p.valueExternalCode != null) {
        throw new Error(`properties[${i}] takes valueId or valueExternalCode, not both`);
      }
      const value: Record<string, unknown> = {};
      if (p.valueId != null) value.id = requiredString(p.valueId, `properties[${i}].valueId`);
      if (p.valueExternalCode != null) value.externalCode = requiredString(p.valueExternalCode, `properties[${i}].valueExternalCode`);
      if (p.valueLabel != null) value.label = requiredString(p.valueLabel, `properties[${i}].valueLabel`);
      return { id, value };
    });
  }
  return body;
}

export async function executeJobsCreate(input: JobsCreateInput): Promise<{ id: string; job: NormalizedJob }> {
  const body = buildJobInput(input);
  const raw = await client(input, "jobs.create").request("POST", "/jobs", body);
  if (!isRecord(raw) || str(raw.id) == null) {
    throw { ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: "SmartRecruiters create response is missing the job id." };
  }
  return { id: withJobPrefix(raw.id as string), job: normalizeJob(raw as Parameters<typeof normalizeJob>[0]) };
}

// ---------------------------------------------------------------------------
// jobs.update — PATCH /jobs/{jobId} (effect omitted: PATCH may trigger approval)
// ---------------------------------------------------------------------------

export const JOB_UPDATE_FIELDS = ["title", "refNumber"] as const;

/** RFC 6902 operations for the narrowed update; `add` sets or replaces a member. */
export function buildJobPatch(input: { title?: string; refNumber?: string }): Array<{ op: "add"; path: string; value: string }> {
  const ops: Array<{ op: "add"; path: string; value: string }> = [];
  for (const field of JOB_UPDATE_FIELDS) {
    const value = optionalString(input[field], field);
    if (value != null) ops.push({ op: "add", path: `/${field}`, value });
  }
  if (ops.length === 0) throw new Error("jobs.update needs title or refNumber");
  return ops;
}

export async function executeJobsUpdate(
  input: SmartRecruitersG2AuthInput & { id: string; title?: string; refNumber?: string },
): Promise<{ job: NormalizedJob | null }> {
  const id = jobSeg(input.id, "id");
  const patch = buildJobPatch(input);
  const raw = await client(input, "jobs.update").request("PATCH", `/jobs/${id}`, patch, "application/json-patch+json");
  return { job: isRecord(raw) && str(raw.id) ? normalizeJob(raw as Parameters<typeof normalizeJob>[0]) : null };
}

// ---------------------------------------------------------------------------
// jobs.update_status — PUT /jobs/{jobId}/status (Reconcile → jobs.get)
// ---------------------------------------------------------------------------

export async function executeJobsUpdateStatus(
  input: SmartRecruitersG2AuthInput & { id: string; status: (typeof JOB_STATUSES)[number] },
): Promise<{ status: string | null }> {
  const id = jobSeg(input.id, "id");
  if (typeof input.status !== "string" || !JOB_STATUS_SET.has(input.status)) {
    throw new Error(`status must be one of ${JOB_STATUSES.join(", ")}`);
  }
  const raw = await client(input, "jobs.update_status").request("PUT", `/jobs/${id}/status`, { status: input.status });
  return { status: isRecord(raw) ? str(raw.status) : null };
}

// ---------------------------------------------------------------------------
// jobs.status_history
// ---------------------------------------------------------------------------

export async function executeJobsStatusHistory(
  input: SmartRecruitersG2AuthInput & { id: string },
): Promise<{ history: Array<{ changedOn: string | null; status: string | null }>; total: number }> {
  const id = jobSeg(input.id, "id");
  const { data, items } = itemsOf(await client(input, "jobs.status_history").getJSON(`/jobs/${id}/status/history`));
  return { history: items.map((e) => ({ changedOn: str(e.changedOn), status: str(e.status) })), total: totalOf(data, items) };
}

// ---------------------------------------------------------------------------
// jobs.hiring_team.get / add / remove
// ---------------------------------------------------------------------------

export interface HiringTeamMember {
  /** User id. */
  id: string;
  role: string | null;
}

function member(raw: Record<string, unknown>): HiringTeamMember {
  return { id: raw.id as string, role: str(raw.role) };
}

export async function executeJobsHiringTeamGet(
  input: SmartRecruitersG2AuthInput & { id: string },
): Promise<{ members: HiringTeamMember[]; total: number }> {
  const id = jobSeg(input.id, "id");
  const { data, items } = itemsOf(await client(input, "jobs.hiring_team.get").getJSON(`/jobs/${id}/hiring-team`));
  const members = items.filter((m) => str(m.id) != null).map(member);
  return { members, total: totalOf(data, items) };
}

export async function executeJobsHiringTeamAdd(
  input: SmartRecruitersG2AuthInput & { id: string; userId: string; role: (typeof HIRING_TEAM_ROLES)[number] },
): Promise<{ jobId: string; member: HiringTeamMember }> {
  const id = jobSeg(input.id, "id");
  // Body field (SR-ID-1): raw or sr-user:-prefixed, sent raw; no path guard.
  const userId = userIdValue(input.userId, "userId");
  if (typeof input.role !== "string" || !ROLE_SET.has(input.role)) {
    throw new Error(`role must be one of ${HIRING_TEAM_ROLES.join(", ")}`);
  }
  const raw = await client(input, "jobs.hiring_team.add").request("POST", `/jobs/${id}/hiring-team`, { id: userId, role: input.role });
  const added = isRecord(raw) && str(raw.id) ? member(raw) : { id: userId, role: input.role };
  return { jobId: withJobPrefix(id), member: added };
}

export async function executeJobsHiringTeamRemove(
  input: SmartRecruitersG2AuthInput & { id: string; userId: string },
): Promise<{ ok: true }> {
  const id = jobSeg(input.id, "id");
  const userId = userIdSegment(input.userId, "userId");
  await client(input, "jobs.hiring_team.remove").request("DELETE", `/jobs/${id}/hiring-team/${userId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// jobs.note.get / update
// ---------------------------------------------------------------------------

function noteOf(raw: unknown): { content: string | null } {
  return { content: isRecord(raw) && typeof raw.content === "string" ? raw.content : null };
}

export async function executeJobsNoteGet(input: SmartRecruitersG2AuthInput & { id: string }): Promise<{ content: string | null }> {
  const id = jobSeg(input.id, "id");
  return noteOf(await client(input, "jobs.note.get").getJSON(`/jobs/${id}/note`));
}

export async function executeJobsNoteUpdate(
  input: SmartRecruitersG2AuthInput & { id: string; content: string },
): Promise<{ content: string | null }> {
  const id = jobSeg(input.id, "id");
  if (typeof input.content !== "string" || input.content.length > 20000) {
    throw new Error("content must be a string of at most 20000 characters");
  }
  return noteOf(await client(input, "jobs.note.update").request("PUT", `/jobs/${id}/note`, { content: input.content }));
}

// ---------------------------------------------------------------------------
// jobs.publish / unpublish / publications.list
// ---------------------------------------------------------------------------

export async function executeJobsPublish(
  input: SmartRecruitersG2AuthInput & {
    id: string;
    aggregators?: boolean;
    visibility?: "PUBLIC" | "INTERNAL";
    includeInternal?: boolean;
    delayPublicInDays?: number;
  },
): Promise<{ ok: true }> {
  const id = jobSeg(input.id, "id");
  const body: Record<string, unknown> = {};
  if (typeof input.aggregators === "boolean") body.aggregators = input.aggregators;
  if (input.visibility != null) {
    if (input.visibility !== "PUBLIC" && input.visibility !== "INTERNAL") throw new Error("visibility must be PUBLIC or INTERNAL");
    body.visibility = input.visibility;
  }
  if (typeof input.includeInternal === "boolean") body.includeInternal = input.includeInternal;
  if (input.delayPublicInDays != null) {
    if (!Number.isInteger(input.delayPublicInDays) || input.delayPublicInDays < 0) throw new Error("delayPublicInDays must be a non-negative integer");
    body.delayPublicInDays = input.delayPublicInDays;
  }
  await client(input, "jobs.publish").request("POST", `/jobs/${id}/publication`, body);
  return { ok: true };
}

export async function executeJobsUnpublish(input: SmartRecruitersG2AuthInput & { id: string }): Promise<{ ok: true }> {
  const id = jobSeg(input.id, "id");
  await client(input, "jobs.unpublish").request("DELETE", `/jobs/${id}/publication`);
  return { ok: true };
}

export interface Publication {
  sourceName: string | null;
  type: string | null;
  publishedOn: string | null;
  unpublishedOn: string | null;
  postingId: string | null;
}

export async function executeJobsPublicationsList(
  input: SmartRecruitersG2AuthInput & { id: string; activeOnly?: boolean },
): Promise<{ publications: Publication[] }> {
  const id = jobSeg(input.id, "id");
  const query = typeof input.activeOnly === "boolean" ? `?activeOnly=${input.activeOnly}` : "";
  const { items } = itemsOf(await client(input, "jobs.publications.list").getJSON(`/jobs/${id}/publication${query}`));
  return {
    publications: items.map((p) => ({
      sourceName: str(p.sourceName),
      type: str(p.type),
      publishedOn: str(p.publishedOn),
      unpublishedOn: str(p.unpublishedOn),
      postingId: str(p.postingId),
    })),
  };
}

// ---------------------------------------------------------------------------
// jobs.positions.list
// ---------------------------------------------------------------------------

export interface JobPosition {
  id: string | null;
  positionId: string | null;
  type: string | null;
  status: string | null;
  incumbentName: string | null;
  positionOpenDate: string | null;
  targetStartDate: string | null;
  createdOn: string | null;
  hiringManagerId: string | null;
}

function position(p: Record<string, unknown>): JobPosition {
  return {
    id: str(p.id),
    positionId: str(p.positionId),
    type: str(p.type),
    status: str(p.status),
    incumbentName: str(p.incumbentName),
    positionOpenDate: str(p.positionOpenDate),
    targetStartDate: str(p.targetStartDate),
    createdOn: str(p.createdOn),
    hiringManagerId: str(p.hiringManagerId),
  };
}

export async function executeJobsPositionsList(
  input: SmartRecruitersG2AuthInput & { id: string },
): Promise<{ positions: JobPosition[]; total: number; positionsPendingApproval: JobPosition[] }> {
  const id = jobSeg(input.id, "id");
  const { data, items } = itemsOf(await client(input, "jobs.positions.list").getJSON(`/jobs/${id}/positions`));
  const pending = Array.isArray(data.positionsPendingApproval) ? data.positionsPendingApproval.filter(isRecord) : [];
  return { positions: items.map(position), total: totalOf(data, items), positionsPendingApproval: pending.map(position) };
}

// ---------------------------------------------------------------------------
// postings.get — public GET /v1/companies/{company}/postings/{postingId}
// ---------------------------------------------------------------------------

export interface PostingDetails {
  id: string;
  uuid: string | null;
  jobId: string | null;
  jobAdId: string | null;
  title: string | null;
  refNumber: string | null;
  company: string | null;
  location: string | null;
  remote: boolean | null;
  department: string | null;
  function: string | null;
  industry: string | null;
  typeOfEmployment: string | null;
  experienceLevel: string | null;
  language: string | null;
  visibility: string | null;
  active: boolean | null;
  releasedAt: string | null;
  postingUrl: string | null;
  applyUrl: string | null;
  sections: Record<string, { title: string | null; text: string | null }>;
}

export async function executePostingsGet(input: {
  company: string;
  postingId: string;
  sourceTypeId?: string;
  sourceSubTypeId?: string;
  sourceId?: string;
  fetch?: typeof fetch;
}): Promise<{ posting: PostingDetails | null }> {
  const postingId = seg(input.postingId, "postingId");
  const qs = new URLSearchParams();
  for (const k of ["sourceTypeId", "sourceSubTypeId", "sourceId"] as const) {
    const v = optionalString(input[k], k);
    if (v) qs.set(k, v);
  }
  const query = qs.toString();
  const raw = await createClient({ company: input.company, fetch: input.fetch }).getJSON(
    `/postings/${postingId}${query ? `?${query}` : ""}`,
  );
  if (!isRecord(raw) || str(raw.id) == null) return { posting: null };
  const location = isRecord(raw.location) ? raw.location : null;
  const company = isRecord(raw.company) ? raw.company : {};
  const language = isRecord(raw.language) ? raw.language : {};
  const ad = isRecord(raw.jobAd) && isRecord(raw.jobAd.sections) ? raw.jobAd.sections : {};
  const sections: PostingDetails["sections"] = {};
  for (const k of ["companyDescription", "jobDescription", "qualifications", "additionalInformation"]) {
    const s = ad[k];
    if (isRecord(s)) sections[k] = { title: str(s.title), text: str(s.text) };
  }
  return {
    posting: {
      id: raw.id as string,
      uuid: str(raw.uuid),
      jobId: str(raw.jobId) ? withJobPrefix(str(raw.jobId)!) : null,
      jobAdId: str(raw.jobAdId),
      title: str(raw.name),
      refNumber: str(raw.refNumber),
      company: str(company.name),
      location: formatLocation(location),
      remote: location && typeof location.remote === "boolean" ? location.remote : null,
      department: label(raw.department),
      function: label(raw.function),
      industry: label(raw.industry),
      typeOfEmployment: label(raw.typeOfEmployment),
      experienceLevel: label(raw.experienceLevel),
      language: str(language.code),
      visibility: str(raw.visibility),
      active: typeof raw.active === "boolean" ? raw.active : null,
      releasedAt: str(raw.releasedDate),
      postingUrl: str(raw.postingUrl),
      applyUrl: str(raw.applyUrl),
      sections,
    },
  };
}
