/**
 * SmartRecruiters object normalization.
 *
 * jobs.list uses the public company postings shape ({ content: [...] }).
 * Authenticated Customer API list ops return { content, totalFound, ... }
 * (GET /candidates, GET /users). candidates.get returns a bare CandidateDetails
 * object (GET /candidates/{id}).
 */

export interface NormalizedJob {
  id: string;
  provider: string;
  title: string;
  location: string | null;
  department: string | null;
  type: string | null;
  createdAt: string | null;
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

interface SRLocation {
  id?: string;
}

interface SRDepartment {
  id?: string;
  label?: string;
}

interface SRJob {
  id: string;
  title?: string | null;
  location?: SRLocation | null;
  department?: SRDepartment | null;
  type?: { id?: string; label?: string } | null;
  createdOn?: string | null;
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
    city?: string | null;
    region?: string | null;
    country?: string | null;
    countryCode?: string | null;
  };
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
    location: job.location?.id ?? null,
    department: job.department?.label ?? null,
    type: job.type?.label ?? null,
    createdAt: job.createdOn ?? null,
  };
}

interface SRJobsResponse {
  content?: SRJob[];
  totalFound?: number;
}

export function parseJobsResponse(raw: unknown): {
  jobs: NormalizedJob[];
  total: number | null;
} {
  const data = raw as SRJobsResponse;
  const jobs = Array.isArray(data.content) ? data.content : [];
  const total = data.totalFound ?? null;
  return { jobs: jobs.map(normalizeJob), total };
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
