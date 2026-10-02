/**
 * Greenhouse object normalization.
 *
 * jobs.list uses the public Job Board shape ({ jobs: [...] }).
 * Authenticated Harvest list ops return a bare JSON array
 * (GET /v1/candidates, /v1/applications, /v1/users).
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

interface GreenhouseLocation {
  name?: string;
}

interface GreenhouseJob {
  id: number;
  title?: string;
  location?: GreenhouseLocation | null;
  departments?: Array<{ name?: string }> | null;
  updated_at?: string | null;
  absolute_url?: string | null;
  metadata?: Array<{
    name?: string;
    value?: string | null;
  }> | null;
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
  const location = job.location?.name ?? null;
  const department = job.departments?.[0]?.name ?? null;

  let jobType: string | null = null;
  if (job.metadata) {
    const typeMeta = job.metadata.find((m) => m.name === "Employment Type");
    if (typeMeta?.value) jobType = typeMeta.value;
  }

  return {
    id: `gh-job:${job.id}`,
    provider: "greenhouse",
    title: job.title ?? "",
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
