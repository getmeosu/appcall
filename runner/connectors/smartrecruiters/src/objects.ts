/**
 * SmartRecruiters object normalization.
 *
 * jobs.list / postings.list use the public company postings shape ({ content: [...] }).
 * jobs.get uses authenticated JobDetails (GET /jobs/{id}) — location is a full
 * city/region/country object; type comes from typeOfEmployment.
 * Authenticated Customer API list ops return { content, totalFound, ... }
 * (GET /candidates, GET /users). candidates.get returns a bare CandidateDetails
 * object (GET /candidates/{id}).
 * interviews.list returns { content: Interview[] } from Interviews API
 * (GET /interviews-api/v201904/interviews).
 */

export interface NormalizedJob {
  id: string;
  provider: string;
  title: string;
  location: string | null;
  department: string | null;
  type: string | null;
  status: string | null;
  postingStatus: string | null;
  refNumber: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface NormalizedCandidate {
  id: string;
  provider: string;
  firstName: string | null;
  lastName: string | null;
  name: string;
  email: string | null;
  phoneNumber: string | null;
  location: string | null;
  tags: string[];
  internal: boolean;
  primaryJobId: string | null;
  primaryJobTitle: string | null;
  primaryStatus: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface NormalizedUser {
  id: string;
  provider: string;
  firstName: string | null;
  lastName: string | null;
  name: string;
  email: string | null;
  role: string | null;
  active: boolean;
  language: string | null;
  updatedAt: string | null;
}

export interface NormalizedInterview {
  id: string;
  provider: string;
  candidateId: string | null;
  jobId: string | null;
  location: string | null;
  locationType: string | null;
  organizerId: string | null;
  timezone: string | null;
  title: string | null;
  interviewType: string | null;
  startsAt: string | null;
  endsAt: string | null;
  interviewerIds: string[];
  createdAt: string | null;
  refUrl: string | null;
  source: string | null;
}

interface SRLocation {
  id?: string;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  countryCode?: string | null;
}

interface SRDepartment {
  id?: string;
  label?: string;
}

interface SRProperty {
  id?: string;
  label?: string | null;
}

interface SRJob {
  id: string;
  title?: string | null;
  location?: SRLocation | null;
  department?: SRDepartment | null;
  /** Public posting employment type. */
  type?: { id?: string; label?: string } | null;
  /** Authenticated JobDetails employment type. */
  typeOfEmployment?: SRProperty | null;
  status?: string | null;
  postingStatus?: string | null;
  refNumber?: string | null;
  createdOn?: string | null;
  updatedOn?: string | null;
}

function asStringId(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.length > 0) return value;
  return null;
}

function asIso(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === "string" ? v : asStringId(v)))
    .filter((v): v is string => typeof v === "string" && v.length > 0);
}

function formatLocation(location: unknown): string | null {
  if (location == null || typeof location !== "object") return null;
  const loc = location as {
    id?: string | null;
    city?: string | null;
    region?: string | null;
    country?: string | null;
    countryCode?: string | null;
  };
  // Public postings often stash a display string in location.id.
  if (typeof loc.id === "string" && loc.id.length > 0) {
    const parts = [loc.city, loc.region, loc.country ?? loc.countryCode].filter(
      (p): p is string => typeof p === "string" && p.length > 0,
    );
    return parts.length > 0 ? parts.join(", ") : loc.id;
  }
  const parts = [loc.city, loc.region, loc.country ?? loc.countryCode].filter(
    (p): p is string => typeof p === "string" && p.length > 0,
  );
  return parts.length > 0 ? parts.join(", ") : null;
}

export function normalizeJob(job: SRJob): NormalizedJob {
  return {
    id: `sr-job:${job.id}`,
    provider: "smartrecruiters",
    title: job.title ?? "",
    location: formatLocation(job.location),
    department: job.department?.label ?? null,
    type: job.type?.label ?? job.typeOfEmployment?.label ?? null,
    status: job.status ?? null,
    postingStatus: job.postingStatus ?? null,
    refNumber: job.refNumber ?? null,
    createdAt: job.createdOn ?? null,
    updatedAt: job.updatedOn ?? null,
  };
}

interface SRJobsResponse {
  content?: SRJob[];
  totalFound?: number;
  nextPageId?: string;
}

export function parseJobsResponse(raw: unknown): {
  jobs: NormalizedJob[];
  total: number | null;
  nextPageId: string | null;
} {
  const data = (raw ?? {}) as SRJobsResponse;
  const jobs = Array.isArray(data.content) ? data.content : [];
  return {
    jobs: jobs.map(normalizeJob),
    total: typeof data.totalFound === "number" ? data.totalFound : null,
    nextPageId: typeof data.nextPageId === "string" ? data.nextPageId : null,
  };
}

/** Alias for public Posting API list responses (same { content } shape). */
export function parsePostingsResponse(raw: unknown): {
  postings: NormalizedJob[];
  total: number | null;
} {
  const parsed = parseJobsResponse(raw);
  return { postings: parsed.jobs, total: parsed.total };
}

/** Authenticated GET /jobs/{id} returns JobDetails at the top level. */
export function parseJobGetResponse(raw: unknown): { job: NormalizedJob | null } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { job: null };
  }
  const job = raw as SRJob;
  if (asStringId(job.id) == null) {
    return { job: null };
  }
  return { job: normalizeJob(job) };
}

interface SRAssignmentJob {
  id?: string | null;
  title?: string | null;
}

interface SRAssignment {
  job?: SRAssignmentJob | null;
  status?: string | null;
  subStatus?: string | null;
}

interface SRCandidate {
  id: string;
  internal?: boolean | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phoneNumber?: string | null;
  createdOn?: string | null;
  updatedOn?: string | null;
  location?: unknown;
  tags?: unknown;
  primaryAssignment?: SRAssignment | null;
}

export function normalizeCandidate(candidate: SRCandidate): NormalizedCandidate {
  const id = asStringId(candidate.id) ?? "";
  const firstName = candidate.firstName ?? null;
  const lastName = candidate.lastName ?? null;
  const nameParts = [firstName, lastName].filter(
    (p): p is string => typeof p === "string" && p.length > 0,
  );
  const primary = candidate.primaryAssignment ?? null;
  return {
    id: `sr-candidate:${id}`,
    provider: "smartrecruiters",
    firstName,
    lastName,
    name: nameParts.join(" "),
    email: candidate.email ?? null,
    phoneNumber: candidate.phoneNumber ?? null,
    location: formatLocation(candidate.location),
    tags: asStringArray(candidate.tags),
    internal: candidate.internal === true,
    primaryJobId: asStringId(primary?.job?.id ?? null),
    primaryJobTitle: primary?.job?.title ?? null,
    primaryStatus: primary?.status ?? null,
    createdAt: asIso(candidate.createdOn),
    updatedAt: asIso(candidate.updatedOn),
  };
}

interface SRCandidatesResponse {
  content?: SRCandidate[];
  totalFound?: number;
  limit?: number;
  nextPageId?: string;
}

export function parseCandidatesResponse(raw: unknown): {
  candidates: NormalizedCandidate[];
  total: number | null;
  nextPageId: string | null;
} {
  const data = (raw ?? {}) as SRCandidatesResponse;
  const items = Array.isArray(data.content) ? data.content : [];
  return {
    candidates: items.map(normalizeCandidate),
    total: typeof data.totalFound === "number" ? data.totalFound : null,
    nextPageId: typeof data.nextPageId === "string" ? data.nextPageId : null,
  };
}

export function parseCandidateDetailsResponse(raw: unknown): {
  candidate: NormalizedCandidate | null;
} {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return { candidate: null };
  }
  const candidate = raw as SRCandidate;
  if (asStringId(candidate.id) == null) {
    return { candidate: null };
  }
  return { candidate: normalizeCandidate(candidate) };
}

interface SRUser {
  id?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  role?: string | null;
  active?: boolean | null;
  updatedOn?: string | null;
  language?: { code?: string | null } | null;
}

export function normalizeUser(user: SRUser): NormalizedUser {
  const id = asStringId(user.id) ?? "";
  const firstName = user.firstName ?? null;
  const lastName = user.lastName ?? null;
  const nameParts = [firstName, lastName].filter(
    (p): p is string => typeof p === "string" && p.length > 0,
  );
  return {
    id: `sr-user:${id}`,
    provider: "smartrecruiters",
    firstName,
    lastName,
    name: nameParts.join(" "),
    email: user.email ?? null,
    role: user.role ?? null,
    active: user.active !== false,
    language: user.language?.code ?? null,
    updatedAt: asIso(user.updatedOn),
  };
}

interface SRUsersResponse {
  content?: SRUser[];
  totalFound?: number;
  limit?: number;
  offset?: number;
}

export function parseUsersResponse(raw: unknown): {
  users: NormalizedUser[];
  total: number | null;
} {
  const data = (raw ?? {}) as SRUsersResponse;
  const items = Array.isArray(data.content) ? data.content : [];
  return {
    users: items.map(normalizeUser),
    total: typeof data.totalFound === "number" ? data.totalFound : null,
  };
}

interface SRInterviewer {
  id?: string | null;
  status?: string | null;
}

interface SRTimeslot {
  id?: string | null;
  interviewType?: string | null;
  title?: string | null;
  place?: string | null;
  startsOn?: string | null;
  endsOn?: string | null;
  interviewers?: SRInterviewer[] | null;
  candidateStatus?: string | null;
  noShow?: boolean | null;
}

interface SRInterview {
  id?: string | null;
  candidate?: { id?: string | null; status?: string | null } | null;
  jobId?: string | null;
  location?: string | null;
  locationType?: string | null;
  organizerId?: string | null;
  timezone?: string | null;
  timeslots?: SRTimeslot[] | null;
  createdOn?: string | null;
  refUrl?: string | null;
  source?: string | null;
}

export function normalizeInterview(interview: SRInterview): NormalizedInterview {
  const id = asStringId(interview.id) ?? "";
  const firstSlot =
    Array.isArray(interview.timeslots) && interview.timeslots.length > 0
      ? interview.timeslots[0]
      : null;
  const interviewerIds: string[] = [];
  if (firstSlot && Array.isArray(firstSlot.interviewers)) {
    for (const row of firstSlot.interviewers) {
      const uid = asStringId(row?.id ?? null);
      if (uid) interviewerIds.push(uid);
    }
  }
  return {
    id: `sr-interview:${id}`,
    provider: "smartrecruiters",
    candidateId: asStringId(interview.candidate?.id ?? null),
    jobId: asStringId(interview.jobId ?? null),
    location: interview.location ?? null,
    locationType: interview.locationType ?? null,
    organizerId: asStringId(interview.organizerId ?? null),
    timezone: interview.timezone ?? null,
    title: firstSlot?.title ?? null,
    interviewType: firstSlot?.interviewType ?? null,
    startsAt: asIso(firstSlot?.startsOn),
    endsAt: asIso(firstSlot?.endsOn),
    interviewerIds,
    createdAt: asIso(interview.createdOn),
    refUrl:
      typeof interview.refUrl === "string" && interview.refUrl.length > 0
        ? interview.refUrl
        : null,
    source: interview.source ?? null,
  };
}

interface SRInterviewsResponse {
  content?: SRInterview[];
}

export function parseInterviewsResponse(raw: unknown): {
  interviews: NormalizedInterview[];
} {
  const data = (raw ?? {}) as SRInterviewsResponse;
  const items = Array.isArray(data.content) ? data.content : [];
  return { interviews: items.map(normalizeInterview) };
}
