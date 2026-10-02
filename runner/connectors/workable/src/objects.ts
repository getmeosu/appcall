/**
 * Workable object normalization.
 */

export interface NormalizedJob {
  id: string;
  provider: string;
  title: string;
  state: string | null;
  url: string | null;
  location: string | null;
  department: string | null;
  type: string | null;
}

export interface NormalizedCandidate {
  id: string;
  provider: string;
  name: string;
  email: string | null;
  headline: string | null;
  stage: string | null;
  jobShortcode: string | null;
  jobTitle: string | null;
  disqualified: boolean | null;
  sourced: boolean | null;
  profileUrl: string | null;
  domain: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface NormalizedStage {
  id: string;
  provider: string;
  slug: string;
  name: string;
  kind: string | null;
  position: number | null;
}

export interface NormalizedMember {
  id: string;
  provider: string;
  name: string;
  email: string | null;
  headline: string | null;
  roles: string[];
  active: boolean | null;
}

interface WorkableLocation {
  city?: string;
  region?: string;
  country?: string;
}

interface WorkableJob {
  id: string;
  title?: string | null;
  state?: string | null;
  url?: string | null;
  location?: WorkableLocation | null;
  department?: { name?: string } | string | null;
  type?: string | null;
  employmentType?: string | null;
}

function formatLocation(location: WorkableLocation | null | undefined): string | null {
  if (!location) return null;
  const parts = [location.city, location.region, location.country].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

function departmentName(
  department: { name?: string } | string | null | undefined,
): string | null {
  if (department == null) return null;
  if (typeof department === "string") {
    const trimmed = department.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return department.name ?? null;
}

function asStringId(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.length > 0) return value;
  return null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.length > 0);
}

export function normalizeJob(job: WorkableJob): NormalizedJob {
  return {
    id: `wk-job:${job.id}`,
    provider: "workable",
    title: job.title ?? "",
    state: job.state ?? null,
    url: job.url ?? null,
    location: formatLocation(job.location),
    department: departmentName(job.department),
    type: job.type ?? job.employmentType ?? null,
  };
}

interface WorkableJobsResponse {
  jobs?: WorkableJob[];
}

export function parseJobsResponse(raw: unknown): NormalizedJob[] {
  const data = raw as WorkableJobsResponse;
  const jobs = Array.isArray(data.jobs) ? data.jobs : [];
  return jobs.map(normalizeJob);
}

interface WorkableCandidate {
  id: string | number;
  name?: string | null;
  email?: string | null;
  headline?: string | null;
  stage?: string | null;
  job?: { shortcode?: string | null; title?: string | null } | null;
  disqualified?: boolean | null;
  sourced?: boolean | null;
  profile_url?: string | null;
  domain?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export function normalizeCandidate(candidate: WorkableCandidate): NormalizedCandidate {
  const id = asStringId(candidate.id) ?? "";
  return {
    id: `wk-candidate:${id}`,
    provider: "workable",
    name: candidate.name ?? "",
    email: candidate.email ?? null,
    headline: candidate.headline ?? null,
    stage: candidate.stage ?? null,
    jobShortcode: candidate.job?.shortcode ?? null,
    jobTitle: candidate.job?.title ?? null,
    disqualified: typeof candidate.disqualified === "boolean" ? candidate.disqualified : null,
    sourced: typeof candidate.sourced === "boolean" ? candidate.sourced : null,
    profileUrl: candidate.profile_url ?? null,
    domain: candidate.domain ?? null,
    createdAt: candidate.created_at ?? null,
    updatedAt: candidate.updated_at ?? null,
  };
}

export function parseCandidatesResponse(raw: unknown): {
  candidates: NormalizedCandidate[];
  next: string | null;
} {
  const data = raw as {
    candidates?: WorkableCandidate[];
    paging?: { next?: string | null };
  };
  const candidates = Array.isArray(data.candidates) ? data.candidates : [];
  return {
    candidates: candidates.map(normalizeCandidate),
    next: data.paging?.next ?? null,
  };
}

interface WorkableStage {
  slug: string;
  name?: string | null;
  kind?: string | null;
  position?: number | null;
}

export function normalizeStage(stage: WorkableStage): NormalizedStage {
  return {
    id: `wk-stage:${stage.slug}`,
    provider: "workable",
    slug: stage.slug,
    name: stage.name ?? "",
    kind: stage.kind ?? null,
    position: typeof stage.position === "number" ? stage.position : null,
  };
}

export function parseStagesResponse(raw: unknown): { stages: NormalizedStage[] } {
  const data = raw as { stages?: WorkableStage[] };
  const stages = Array.isArray(data.stages) ? data.stages : [];
  return { stages: stages.map(normalizeStage) };
}

interface WorkableMember {
  id: string | number;
  name?: string | null;
  email?: string | null;
  headline?: string | null;
  roles?: unknown;
  role?: string | null;
  active?: boolean | null;
}

export function normalizeMember(member: WorkableMember): NormalizedMember {
  const id = asStringId(member.id) ?? "";
  let roles = asStringArray(member.roles);
  // Older SPI payloads expose a singular `role` / `hris_role`; fold them in.
  if (roles.length === 0 && typeof member.role === "string" && member.role.length > 0) {
    roles = [member.role];
  }
  return {
    id: `wk-member:${id}`,
    provider: "workable",
    name: member.name ?? "",
    email: member.email ?? null,
    headline: member.headline ?? null,
    roles,
    active: typeof member.active === "boolean" ? member.active : null,
  };
}

export function parseMembersResponse(raw: unknown): { members: NormalizedMember[] } {
  const data = raw as { members?: WorkableMember[] };
  const members = Array.isArray(data.members) ? data.members : [];
  return { members: members.map(normalizeMember) };
}
