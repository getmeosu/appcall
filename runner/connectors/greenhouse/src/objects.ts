/**
 * Greenhouse object normalization.
 *
 * jobs.list uses the public Job Board shape ({ jobs: [...] }).
 * jobs.get uses authenticated Harvest GET /v3/jobs/{id} (name/offices).
 * Authenticated Harvest list/get ops return bare JSON
 * (GET /v3/candidates, /v3/applications, /v3/users, /v3/interviews,
 *  /v3/job_interview_stages).
 */

export interface NormalizedJob {
  id: string;
  provider: string;
  title: string;
  location: string | null;
  department: string | null;
  jobType: string | null;
  updatedAt: string | null;
  url: string | null;
}

export interface NormalizedCandidate {
  id: string;
  provider: string;
  firstName: string | null;
  lastName: string | null;
  name: string;
  company: string | null;
  title: string | null;
  emails: string[];
  phones: string[];
  applicationIds: string[];
  tags: string[];
  recruiterId: string | null;
  coordinatorId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  lastActivityAt: string | null;
}

export interface NormalizedApplication {
  id: string;
  provider: string;
  candidateId: string | null;
  prospect: boolean;
  status: string | null;
  jobId: string | null;
  jobName: string | null;
  stageId: string | null;
  stageName: string | null;
  source: string | null;
  appliedAt: string | null;
  rejectedAt: string | null;
  lastActivityAt: string | null;
}

export interface NormalizedUser {
  id: string;
  provider: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  primaryEmail: string | null;
  emails: string[];
  employeeId: string | null;
  disabled: boolean;
  siteAdmin: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface NormalizedInterview {
  id: string;
  provider: string;
  applicationId: string | null;
  externalEventId: string | null;
  status: string | null;
  interviewId: string | null;
  interviewName: string | null;
  startsAt: string | null;
  endsAt: string | null;
  location: string | null;
  videoConferencingUrl: string | null;
  organizerId: string | null;
  interviewerIds: string[];
  createdAt: string | null;
  updatedAt: string | null;
}

interface GreenhouseLocation {
  name?: string;
}

interface GreenhouseJob {
  id: number | string;
  /** Job Board field. */
  title?: string | null;
  /** Harvest jobs field (GET /v3/jobs/{id}). */
  name?: string | null;
  location?: GreenhouseLocation | null;
  departments?: Array<{ name?: string | null }> | null;
  /** Harvest offices (preferred location source for jobs.get). */
  offices?: Array<{ name?: string | null; location?: GreenhouseLocation | null }> | null;
  updated_at?: string | null;
  absolute_url?: string | null;
  status?: string | null;
  metadata?: Array<{
    name?: string;
    value?: string | null;
  }> | null;
  keyed_custom_fields?: Record<
    string,
    { name?: string | null; type?: string | null; value?: string | null } | null
  > | null;
}

function asStringId(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.length > 0) return value;
  return null;
}

function asIso(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function contactValues(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  for (const item of list) {
    if (item == null || typeof item !== "object") continue;
    const value = (item as { value?: unknown }).value;
    if (typeof value === "string" && value.length > 0) out.push(value);
  }
  return out;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === "string" ? v : asStringId(v)))
    .filter((v): v is string => typeof v === "string" && v.length > 0);
}

export function normalizeJob(job: GreenhouseJob): NormalizedJob {
  const office = Array.isArray(job.offices) ? job.offices[0] : undefined;
  const location =
    job.location?.name ??
    office?.location?.name ??
    (typeof office?.name === "string" && office.name.length > 0 ? office.name : null);
  const department = job.departments?.[0]?.name ?? null;

  let jobType: string | null = null;
  if (job.metadata) {
    const typeMeta = job.metadata.find((m) => m.name === "Employment Type");
    if (typeMeta?.value) jobType = typeMeta.value;
  }
  if (!jobType && job.keyed_custom_fields) {
    const emp = job.keyed_custom_fields.employment_type;
    if (emp?.value) jobType = emp.value;
  }

  const title =
    (typeof job.title === "string" && job.title.length > 0 ? job.title : null) ??
    (typeof job.name === "string" ? job.name : "") ??
    "";

  const id = asStringId(job.id) ?? "";

  return {
    id: `gh-job:${id}`,
    provider: "greenhouse",
    title,
    location,
    department,
    jobType,
    updatedAt: job.updated_at ?? null,
    url: job.absolute_url ?? null,
  };
}

interface GreenhouseJobsResponse {
  jobs: GreenhouseJob[];
  meta?: { total?: number };
}

export function parseJobsResponse(raw: unknown): {
  jobs: NormalizedJob[];
  total: number | null;
} {
  const data = raw as GreenhouseJobsResponse;
  const jobs = (data.jobs ?? []).map(normalizeJob);
  const total = data.meta?.total ?? null;
  return { jobs, total };
}

interface GreenhouseCandidate {
  id: number | string;
  first_name?: string | null;
  last_name?: string | null;
  company?: string | null;
  title?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  last_activity?: string | null;
  email_addresses?: Array<{ value?: string | null; type?: string | null }> | null;
  phone_numbers?: Array<{ value?: string | null; type?: string | null }> | null;
  application_ids?: unknown;
  tags?: unknown;
  recruiter?: { id?: number | string | null } | null;
  coordinator?: { id?: number | string | null } | null;
}

export function normalizeCandidate(candidate: GreenhouseCandidate): NormalizedCandidate {
  const id = asStringId(candidate.id) ?? "";
  const firstName = candidate.first_name ?? null;
  const lastName = candidate.last_name ?? null;
  const nameParts = [firstName, lastName].filter(
    (p): p is string => typeof p === "string" && p.length > 0,
  );
  return {
    id: `gh-candidate:${id}`,
    provider: "greenhouse",
    firstName,
    lastName,
    name: nameParts.join(" "),
    company: candidate.company ?? null,
    title: candidate.title ?? null,
    emails: contactValues(candidate.email_addresses),
    phones: contactValues(candidate.phone_numbers),
    applicationIds: asStringArray(candidate.application_ids),
    tags: asStringArray(candidate.tags),
    recruiterId: asStringId(candidate.recruiter?.id ?? null),
    coordinatorId: asStringId(candidate.coordinator?.id ?? null),
    createdAt: asIso(candidate.created_at),
    updatedAt: asIso(candidate.updated_at),
    lastActivityAt: asIso(candidate.last_activity),
  };
}

export function parseCandidatesResponse(raw: unknown): {
  candidates: NormalizedCandidate[];
} {
  const items = Array.isArray(raw) ? (raw as GreenhouseCandidate[]) : [];
  return { candidates: items.map(normalizeCandidate) };
}

interface GreenhouseApplication {
  id: number | string;
  candidate_id?: number | string | null;
  prospect?: boolean | null;
  status?: string | null;
  applied_at?: string | null;
  rejected_at?: string | null;
  last_activity_at?: string | null;
  jobs?: Array<{ id?: number | string | null; name?: string | null }> | null;
  current_stage?: { id?: number | string | null; name?: string | null } | null;
  source?: { id?: number | string | null; public_name?: string | null } | null;
}

export function normalizeApplication(application: GreenhouseApplication): NormalizedApplication {
  const id = asStringId(application.id) ?? "";
  const firstJob = Array.isArray(application.jobs) ? application.jobs[0] : undefined;
  return {
    id: `gh-application:${id}`,
    provider: "greenhouse",
    candidateId: asStringId(application.candidate_id ?? null),
    prospect: application.prospect === true,
    status: application.status ?? null,
    jobId: asStringId(firstJob?.id ?? null),
    jobName: firstJob?.name ?? null,
    stageId: asStringId(application.current_stage?.id ?? null),
    stageName: application.current_stage?.name ?? null,
    source: application.source?.public_name ?? null,
    appliedAt: asIso(application.applied_at),
    rejectedAt: asIso(application.rejected_at),
    lastActivityAt: asIso(application.last_activity_at),
  };
}

export function parseApplicationsResponse(raw: unknown): {
  applications: NormalizedApplication[];
} {
  const items = Array.isArray(raw) ? (raw as GreenhouseApplication[]) : [];
  return { applications: items.map(normalizeApplication) };
}

interface GreenhouseUser {
  id: number | string;
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  primary_email_address?: string | null;
  emails?: unknown;
  employee_id?: string | null;
  disabled?: boolean | null;
  site_admin?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export function normalizeUser(user: GreenhouseUser): NormalizedUser {
  const id = asStringId(user.id) ?? "";
  const firstName = user.first_name ?? null;
  const lastName = user.last_name ?? null;
  const nameParts = [firstName, lastName].filter(
    (p): p is string => typeof p === "string" && p.length > 0,
  );
  const name =
    typeof user.name === "string" && user.name.length > 0 ? user.name : nameParts.join(" ");
  const emails = asStringArray(user.emails);
  if (emails.length === 0 && typeof user.primary_email_address === "string") {
    emails.push(user.primary_email_address);
  }
  return {
    id: `gh-user:${id}`,
    provider: "greenhouse",
    name,
    firstName,
    lastName,
    primaryEmail: user.primary_email_address ?? null,
    emails,
    employeeId: user.employee_id ?? null,
    disabled: user.disabled === true,
    siteAdmin: user.site_admin === true,
    createdAt: asIso(user.created_at),
    updatedAt: asIso(user.updated_at),
  };
}

export function parseUsersResponse(raw: unknown): {
  users: NormalizedUser[];
} {
  const items = Array.isArray(raw) ? (raw as GreenhouseUser[]) : [];
  return { users: items.map(normalizeUser) };
}

/** Harvest GET /v3/candidates/{id} returns the candidate object at the top level. */
export function parseCandidateGetResponse(raw: unknown): {
  candidate: NormalizedCandidate | null;
} {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { candidate: null };
  }
  const candidate = raw as GreenhouseCandidate;
  if (candidate.id == null || asStringId(candidate.id) == null) {
    return { candidate: null };
  }
  return { candidate: normalizeCandidate(candidate) };
}

/** Harvest GET /v3/jobs/{id} returns the job object at the top level. */
export function parseJobGetResponse(raw: unknown): { job: NormalizedJob | null } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { job: null };
  }
  const job = raw as GreenhouseJob;
  if (job.id == null || asStringId(job.id) == null) {
    return { job: null };
  }
  return { job: normalizeJob(job) };
}

interface GreenhouseInterviewTime {
  date_time?: string | null;
  date?: string | null;
}

interface GreenhouseInterview {
  id: number | string;
  application_id?: number | string | null;
  external_event_id?: string | null;
  status?: string | null;
  location?: string | null;
  video_conferencing_url?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  start?: GreenhouseInterviewTime | null;
  end?: GreenhouseInterviewTime | null;
  interview?: { id?: number | string | null; name?: string | null } | null;
  organizer?: { id?: number | string | null } | null;
  interviewers?: Array<{ user_id?: number | string | null; id?: number | string | null }> | null;
}

function interviewTimestamp(slot: GreenhouseInterviewTime | null | undefined): string | null {
  if (!slot || typeof slot !== "object") return null;
  if (typeof slot.date_time === "string" && slot.date_time.length > 0) return slot.date_time;
  if (typeof slot.date === "string" && slot.date.length > 0) return slot.date;
  return null;
}

export function normalizeInterview(interview: GreenhouseInterview): NormalizedInterview {
  const id = asStringId(interview.id) ?? "";
  const interviewerIds: string[] = [];
  if (Array.isArray(interview.interviewers)) {
    for (const row of interview.interviewers) {
      const uid = asStringId(row?.user_id ?? row?.id ?? null);
      if (uid) interviewerIds.push(uid);
    }
  }
  return {
    id: `gh-interview:${id}`,
    provider: "greenhouse",
    applicationId: asStringId(interview.application_id ?? null),
    externalEventId:
      typeof interview.external_event_id === "string" && interview.external_event_id.length > 0
        ? interview.external_event_id
        : null,
    status: interview.status ?? null,
    interviewId: asStringId(interview.interview?.id ?? null),
    interviewName: interview.interview?.name ?? null,
    startsAt: interviewTimestamp(interview.start),
    endsAt: interviewTimestamp(interview.end),
    location: interview.location ?? null,
    videoConferencingUrl: interview.video_conferencing_url ?? null,
    organizerId: asStringId(interview.organizer?.id ?? null),
    interviewerIds,
    createdAt: asIso(interview.created_at),
    updatedAt: asIso(interview.updated_at),
  };
}

export function parseInterviewsResponse(raw: unknown): {
  interviews: NormalizedInterview[];
} {
  const items = Array.isArray(raw) ? (raw as GreenhouseInterview[]) : [];
  return { interviews: items.map(normalizeInterview) };
}

export interface NormalizedJobInterviewStage {
  id: string;
  provider: string;
  name: string;
  jobId: string | null;
  sortOrder: number | null;
  active: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

interface GreenhouseJobInterviewStage {
  id: number | string;
  name?: string | null;
  job_id?: number | string | null;
  sort_order?: number | null;
  active?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export function normalizeJobInterviewStage(
  stage: GreenhouseJobInterviewStage,
): NormalizedJobInterviewStage {
  const id = asStringId(stage.id) ?? "";
  return {
    id: `gh-job-interview-stage:${id}`,
    provider: "greenhouse",
    name: typeof stage.name === "string" ? stage.name : "",
    jobId: asStringId(stage.job_id ?? null),
    sortOrder: typeof stage.sort_order === "number" && Number.isFinite(stage.sort_order)
      ? stage.sort_order
      : null,
    active: stage.active === true,
    createdAt: asIso(stage.created_at),
    updatedAt: asIso(stage.updated_at),
  };
}

export function parseJobInterviewStagesResponse(raw: unknown): {
  stages: NormalizedJobInterviewStage[];
} {
  const items = Array.isArray(raw) ? (raw as GreenhouseJobInterviewStage[]) : [];
  return { stages: items.map(normalizeJobInterviewStage) };
}

/** Harvest GET /v3/applications/{id} returns the application object at the top level. */
export function parseApplicationGetResponse(raw: unknown): {
  application: NormalizedApplication | null;
} {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { application: null };
  }
  const application = raw as GreenhouseApplication;
  if (application.id == null || asStringId(application.id) == null) {
    return { application: null };
  }
  return { application: normalizeApplication(application) };
}
