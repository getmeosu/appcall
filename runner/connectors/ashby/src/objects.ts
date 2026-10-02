/**
 * Ashby object normalization.
 *
 * jobs.list uses the public posting-api shape ({ jobs: [...] }).
 * Authenticated list/info ops use Ashby's envelope:
 *   { success, results, moreDataAvailable?, nextCursor?, syncToken? }
 * where `results` is an array for *.list and a single object for *.info.
 */

export interface NormalizedJob {
  id: string;
  provider: string;
  title: string;
  location: string | null;
  department: string | null;
  employmentType: string | null;
  createdAt: string | null;
}

export interface NormalizedCandidate {
  id: string;
  provider: string;
  name: string;
  emails: string[];
  phones: string[];
  applicationIds: string[];
  profileUrl: string | null;
  source: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface NormalizedApplication {
  id: string;
  provider: string;
  status: string | null;
  candidateId: string | null;
  candidateName: string | null;
  jobId: string | null;
  jobTitle: string | null;
  stageId: string | null;
  stageTitle: string | null;
  archivedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

interface AshbyJob {
  id: string;
  title?: string | null;
  locationName?: string | null;
  departmentName?: string | null;
  employmentType?: string | null;
  descriptionHtml?: string | null;
  url?: string | null;
  publishedAt?: string | null;
}

function asStringId(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.length > 0) return value;
  return null;
}

function asIso(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

interface AshbyContactInfo {
  value?: string | null;
  type?: string | null;
  isPrimary?: boolean;
}

function contactValues(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  for (const item of list) {
    if (item == null || typeof item !== "object") continue;
    const value = (item as AshbyContactInfo).value;
    if (typeof value === "string" && value.length > 0) out.push(value);
  }
  return out;
}

function sourceTitle(source: unknown): string | null {
  if (source == null) return null;
  if (typeof source === "string") {
    const trimmed = source.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof source === "object") {
    const title = (source as { title?: unknown }).title;
    return typeof title === "string" && title.length > 0 ? title : null;
  }
  return null;
}

export function normalizeJob(job: AshbyJob): NormalizedJob {
  return {
    id: `ash-job:${job.id}`,
    provider: "ashby",
    title: job.title ?? "",
    location: job.locationName ?? null,
    department: job.departmentName ?? null,
    employmentType: job.employmentType ?? null,
    createdAt: job.publishedAt ?? null,
  };
}

interface AshbyJobsResponse {
  jobs?: AshbyJob[];
}

export function parseJobsResponse(raw: unknown): NormalizedJob[] {
  const data = raw as AshbyJobsResponse;
  const jobs = Array.isArray(data.jobs) ? data.jobs : [];
  return jobs.map(normalizeJob);
}

interface AshbyCandidate {
  id: string;
  name?: string | null;
  primaryEmailAddress?: AshbyContactInfo | null;
  emailAddresses?: AshbyContactInfo[] | null;
  primaryPhoneNumber?: AshbyContactInfo | null;
  phoneNumbers?: AshbyContactInfo[] | null;
  applicationIds?: unknown;
  profileUrl?: string | null;
  source?: unknown;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export function normalizeCandidate(candidate: AshbyCandidate): NormalizedCandidate {
  const id = asStringId(candidate.id) ?? "";
  const emails = contactValues(candidate.emailAddresses);
  if (emails.length === 0 && candidate.primaryEmailAddress?.value) {
    emails.push(candidate.primaryEmailAddress.value);
  }
  const phones = contactValues(candidate.phoneNumbers);
  if (phones.length === 0 && candidate.primaryPhoneNumber?.value) {
    phones.push(candidate.primaryPhoneNumber.value);
  }
  const applicationIds = Array.isArray(candidate.applicationIds)
    ? candidate.applicationIds
        .map((v) => asStringId(v))
        .filter((v): v is string => v != null)
    : [];

  return {
    id: `ash-candidate:${id}`,
    provider: "ashby",
    name: candidate.name ?? "",
    emails,
    phones,
    applicationIds,
    profileUrl: asIso(candidate.profileUrl),
    source: sourceTitle(candidate.source),
    createdAt: asIso(candidate.createdAt),
    updatedAt: asIso(candidate.updatedAt),
  };
}

interface AshbyListEnvelope {
  results?: unknown;
  moreDataAvailable?: boolean;
  nextCursor?: string | null;
  syncToken?: string | null;
}

export function parseCandidatesResponse(raw: unknown): {
  candidates: NormalizedCandidate[];
  moreDataAvailable: boolean;
  nextCursor: string | null;
  syncToken: string | null;
} {
  const data = raw as AshbyListEnvelope;
  const items = Array.isArray(data.results) ? (data.results as AshbyCandidate[]) : [];
  return {
    candidates: items.map(normalizeCandidate),
    moreDataAvailable: data.moreDataAvailable === true,
    nextCursor: typeof data.nextCursor === "string" ? data.nextCursor : null,
    syncToken: typeof data.syncToken === "string" ? data.syncToken : null,
  };
}

export function parseCandidateInfoResponse(raw: unknown): {
  candidate: NormalizedCandidate | null;
} {
  const data = raw as AshbyListEnvelope;
  const result = data.results;
  if (result == null || typeof result !== "object" || Array.isArray(result)) {
    return { candidate: null };
  }
  return { candidate: normalizeCandidate(result as AshbyCandidate) };
}

interface AshbyApplication {
  id: string;
  status?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  archivedAt?: string | null;
  candidate?: {
    id?: string | null;
    name?: string | null;
  } | null;
  job?: {
    id?: string | null;
    title?: string | null;
  } | null;
  currentInterviewStage?: {
    id?: string | null;
    title?: string | null;
  } | null;
}

export function normalizeApplication(application: AshbyApplication): NormalizedApplication {
  const id = asStringId(application.id) ?? "";
  return {
    id: `ash-application:${id}`,
    provider: "ashby",
    status: application.status ?? null,
    candidateId: asStringId(application.candidate?.id ?? null),
    candidateName: application.candidate?.name ?? null,
    jobId: asStringId(application.job?.id ?? null),
    jobTitle: application.job?.title ?? null,
    stageId: asStringId(application.currentInterviewStage?.id ?? null),
    stageTitle: application.currentInterviewStage?.title ?? null,
    archivedAt: asIso(application.archivedAt),
    createdAt: asIso(application.createdAt),
    updatedAt: asIso(application.updatedAt),
  };
}

export function parseApplicationsResponse(raw: unknown): {
  applications: NormalizedApplication[];
  moreDataAvailable: boolean;
  nextCursor: string | null;
  syncToken: string | null;
} {
  const data = raw as AshbyListEnvelope;
  const items = Array.isArray(data.results) ? (data.results as AshbyApplication[]) : [];
  return {
    applications: items.map(normalizeApplication),
    moreDataAvailable: data.moreDataAvailable === true,
    nextCursor: typeof data.nextCursor === "string" ? data.nextCursor : null,
    syncToken: typeof data.syncToken === "string" ? data.syncToken : null,
  };
}
