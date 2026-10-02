/**
 * Zoho Recruit object normalization.
 *
 * List/search responses share `{ data: [...], info: { count, page, more_records } }`.
 * GET-by-id returns `{ data: [record] }` (same envelope, usually one item).
 * The legacy jobs.list fixture used `has_more`; parsers accept both.
 */

export interface NormalizedJob {
  id: string;
  provider: string;
  title: string;
  jobType: string | null;
  hiringManager: string | null;
  description: string | null;
  status: string | null;
  createdAt: string | null;
}

export interface NormalizedCandidate {
  id: string;
  provider: string;
  firstName: string | null;
  lastName: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  status: string | null;
  currentEmployer: string | null;
  currentJobTitle: string | null;
  experienceYears: number | null;
  skillSet: string | null;
  ownerName: string | null;
  createdAt: string | null;
  modifiedAt: string | null;
}

export interface NormalizedJobOpening {
  id: string;
  provider: string;
  title: string;
  status: string | null;
  dateOpened: string | null;
  targetDate: string | null;
  industry: string | null;
  city: string | null;
  jobType: string | null;
  description: string | null;
  candidatesHired: number | null;
  candidatesAssociated: number | null;
  createdAt: string | null;
}

export interface NormalizedApplication {
  id: string;
  provider: string;
  status: string | null;
  email: string | null;
  origin: string | null;
  candidateId: string | null;
  candidateName: string | null;
  jobOpeningId: string | null;
  jobOpeningName: string | null;
  createdAt: string | null;
  modifiedAt: string | null;
}

interface ZohoNamedRef {
  name?: string | null;
  id?: string | null;
}

interface ZohoJob {
  id: string;
  Job_Title?: string | null;
  Posting_Title?: string | null;
  Job_Type?: string | null;
  Hiring_Manager?: ZohoNamedRef | null;
  Description?: string | null;
  Status?: string | null;
  Job_Opening_Status?: string | null;
  Created_Time?: string | null;
}

interface ZohoCandidate {
  id: string;
  First_Name?: string | null;
  Last_Name?: string | null;
  Email?: string | null;
  Phone?: string | null;
  Mobile?: string | null;
  Candidate_Status?: string | null;
  Current_Employer?: string | null;
  Current_Job_Title?: string | null;
  Experience_in_Years?: number | null;
  Skill_Set?: string | null;
  Candidate_Owner?: ZohoNamedRef | null;
  Created_Time?: string | null;
  Modified_Time?: string | null;
}

interface ZohoJobOpening {
  id: string;
  Posting_Title?: string | null;
  Job_Opening_Status?: string | null;
  Date_Opened?: string | null;
  Target_Date?: string | null;
  Industry?: string | null;
  City?: string | null;
  Job_Type?: string | null;
  Description?: string | null;
  No_of_Candidates_Hired?: number | null;
  No_of_Candidates_Associated?: number | null;
  Created_Time?: string | null;
}

interface ZohoApplication {
  id: string;
  Application_Status?: string | null;
  Email?: string | null;
  Origin?: string | null;
  Candidate_Name?: ZohoNamedRef | string | null;
  Job_Opening_Name?: ZohoNamedRef | string | null;
  Posting_Title?: ZohoNamedRef | string | null;
  Created_Time?: string | null;
  Modified_Time?: string | null;
}

interface ZohoListInfo {
  count?: number;
  page?: number;
  has_more?: boolean;
  more_records?: boolean;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function refName(value: ZohoNamedRef | string | null | undefined): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  const name = value.name?.trim();
  return name && name.length > 0 ? name : null;
}

function refId(value: ZohoNamedRef | string | null | undefined): string | null {
  if (value == null || typeof value === "string") return null;
  const id = value.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

function parseListMeta(info: ZohoListInfo | undefined): {
  total: number | null;
  hasMore: boolean;
  page: number | null;
} {
  return {
    total: asNumber(info?.count),
    hasMore: info?.more_records ?? info?.has_more ?? false,
    page: asNumber(info?.page),
  };
}

export function normalizeJob(job: ZohoJob): NormalizedJob {
  return {
    id: `zr-job:${job.id}`,
    provider: "zoho-recruit",
    title: job.Job_Title ?? job.Posting_Title ?? "",
    jobType: job.Job_Type ?? null,
    hiringManager: job.Hiring_Manager?.name ?? null,
    description: job.Description ?? null,
    status: job.Status ?? job.Job_Opening_Status ?? null,
    createdAt: job.Created_Time ?? null,
  };
}

export function parseJobsResponse(raw: unknown): {
  jobs: NormalizedJob[];
  total: number | null;
  hasMore: boolean;
  page: number | null;
} {
  if (!raw || typeof raw !== "object") return { jobs: [], total: null, hasMore: false, page: null };
  const data = raw as { data?: ZohoJob[]; info?: ZohoListInfo };
  const jobs = Array.isArray(data.data) ? data.data : [];
  return {
    jobs: jobs.map(normalizeJob),
    ...parseListMeta(data.info),
  };
}

export function normalizeCandidate(candidate: ZohoCandidate): NormalizedCandidate {
  const firstName = candidate.First_Name ?? null;
  const lastName = candidate.Last_Name ?? null;
  const parts = [firstName, lastName].filter((p): p is string => typeof p === "string" && p.length > 0);
  return {
    id: `zr-candidate:${candidate.id}`,
    provider: "zoho-recruit",
    firstName,
    lastName,
    name: parts.join(" "),
    email: candidate.Email ?? null,
    phone: candidate.Mobile ?? candidate.Phone ?? null,
    status: candidate.Candidate_Status ?? null,
    currentEmployer: candidate.Current_Employer ?? null,
    currentJobTitle: candidate.Current_Job_Title ?? null,
    experienceYears: asNumber(candidate.Experience_in_Years),
    skillSet: candidate.Skill_Set ?? null,
    ownerName: candidate.Candidate_Owner?.name ?? null,
    createdAt: candidate.Created_Time ?? null,
    modifiedAt: candidate.Modified_Time ?? null,
  };
}

export function parseCandidatesResponse(raw: unknown): {
  candidates: NormalizedCandidate[];
  total: number | null;
  hasMore: boolean;
  page: number | null;
} {
  if (!raw || typeof raw !== "object") {
    return { candidates: [], total: null, hasMore: false, page: null };
  }
  const data = raw as { data?: ZohoCandidate[]; info?: ZohoListInfo };
  const candidates = Array.isArray(data.data) ? data.data : [];
  return {
    candidates: candidates.map(normalizeCandidate),
    ...parseListMeta(data.info),
  };
}

export function normalizeJobOpening(opening: ZohoJobOpening): NormalizedJobOpening {
  return {
    id: `zr-job-opening:${opening.id}`,
    provider: "zoho-recruit",
    title: opening.Posting_Title ?? "",
    status: opening.Job_Opening_Status ?? null,
    dateOpened: opening.Date_Opened ?? null,
    targetDate: opening.Target_Date ?? null,
    industry: opening.Industry ?? null,
    city: opening.City ?? null,
    jobType: opening.Job_Type ?? null,
    description: opening.Description ?? null,
    candidatesHired: asNumber(opening.No_of_Candidates_Hired),
    candidatesAssociated: asNumber(opening.No_of_Candidates_Associated),
    createdAt: opening.Created_Time ?? null,
  };
}

export function parseJobOpeningsResponse(raw: unknown): {
  jobOpenings: NormalizedJobOpening[];
  total: number | null;
  hasMore: boolean;
  page: number | null;
} {
  if (!raw || typeof raw !== "object") {
    return { jobOpenings: [], total: null, hasMore: false, page: null };
  }
  const data = raw as { data?: ZohoJobOpening[]; info?: ZohoListInfo };
  const jobOpenings = Array.isArray(data.data) ? data.data : [];
  return {
    jobOpenings: jobOpenings.map(normalizeJobOpening),
    ...parseListMeta(data.info),
  };
}

export function normalizeApplication(application: ZohoApplication): NormalizedApplication {
  return {
    id: `zr-application:${application.id}`,
    provider: "zoho-recruit",
    status: application.Application_Status ?? null,
    email: application.Email ?? null,
    origin: application.Origin ?? null,
    candidateId: refId(application.Candidate_Name),
    candidateName: refName(application.Candidate_Name),
    jobOpeningId: refId(application.Job_Opening_Name) ?? refId(application.Posting_Title),
    jobOpeningName: refName(application.Job_Opening_Name) ?? refName(application.Posting_Title),
    createdAt: application.Created_Time ?? null,
    modifiedAt: application.Modified_Time ?? null,
  };
}

export function parseApplicationsResponse(raw: unknown): {
  applications: NormalizedApplication[];
  total: number | null;
  hasMore: boolean;
  page: number | null;
} {
  if (!raw || typeof raw !== "object") {
    return { applications: [], total: null, hasMore: false, page: null };
  }
  const data = raw as { data?: ZohoApplication[]; info?: ZohoListInfo };
  const applications = Array.isArray(data.data) ? data.data : [];
  return {
    applications: applications.map(normalizeApplication),
    ...parseListMeta(data.info),
  };
}


export interface NormalizedInterview {
  id: string;
  provider: string;
  name: string;
  status: string | null;
  candidateId: string | null;
  candidateName: string | null;
  jobOpeningId: string | null;
  jobOpeningName: string | null;
  interviewerIds: string[];
  interviewerNames: string[];
  startsAt: string | null;
  endsAt: string | null;
  location: string | null;
  createdAt: string | null;
  modifiedAt: string | null;
}

interface ZohoInterview {
  id: string;
  Interview_Name?: string | null;
  Interview_Status?: string | null;
  Status?: string | null;
  Candidate_Name?: ZohoNamedRef | string | null;
  Posting_Title?: ZohoNamedRef | string | null;
  Job_Opening_Name?: ZohoNamedRef | string | null;
  Interviewer?: ZohoNamedRef | ZohoNamedRef[] | string | null;
  Start_DateTime?: string | null;
  End_DateTime?: string | null;
  Location?: string | null;
  Created_Time?: string | null;
  Modified_Time?: string | null;
}

function interviewers(value: ZohoInterview["Interviewer"]): {
  ids: string[];
  names: string[];
} {
  const ids: string[] = [];
  const names: string[] = [];
  const rows: Array<ZohoNamedRef | string | null | undefined> = Array.isArray(value)
    ? value
    : value != null
      ? [value]
      : [];
  for (const row of rows) {
    const id = refId(row);
    const name = refName(row);
    if (id) ids.push(id);
    if (name) names.push(name);
  }
  return { ids, names };
}

/** GET /Candidates/{id} returns `{ data: [candidate] }`. */
export function parseCandidateGetResponse(raw: unknown): {
  candidate: NormalizedCandidate | null;
} {
  if (!raw || typeof raw !== "object") return { candidate: null };
  const data = raw as { data?: ZohoCandidate[] | ZohoCandidate };
  const record = Array.isArray(data.data) ? data.data[0] : data.data;
  if (!record || typeof record !== "object" || typeof record.id !== "string" || record.id.length === 0) {
    return { candidate: null };
  }
  return { candidate: normalizeCandidate(record) };
}

/** GET /Candidates/search shares the list envelope. */
export function parseCandidatesSearchResponse(raw: unknown): {
  candidates: NormalizedCandidate[];
  total: number | null;
  hasMore: boolean;
  page: number | null;
} {
  return parseCandidatesResponse(raw);
}

export function normalizeInterview(interview: ZohoInterview): NormalizedInterview {
  const people = interviewers(interview.Interviewer);
  return {
    id: `zr-interview:${interview.id}`,
    provider: "zoho-recruit",
    name: interview.Interview_Name ?? "",
    status: interview.Interview_Status ?? interview.Status ?? null,
    candidateId: refId(interview.Candidate_Name),
    candidateName: refName(interview.Candidate_Name),
    jobOpeningId: refId(interview.Posting_Title) ?? refId(interview.Job_Opening_Name),
    jobOpeningName: refName(interview.Posting_Title) ?? refName(interview.Job_Opening_Name),
    interviewerIds: people.ids,
    interviewerNames: people.names,
    startsAt: interview.Start_DateTime ?? null,
    endsAt: interview.End_DateTime ?? null,
    location: interview.Location ?? null,
    createdAt: interview.Created_Time ?? null,
    modifiedAt: interview.Modified_Time ?? null,
  };
}

export function parseInterviewsResponse(raw: unknown): {
  interviews: NormalizedInterview[];
  total: number | null;
  hasMore: boolean;
  page: number | null;
} {
  if (!raw || typeof raw !== "object") {
    return { interviews: [], total: null, hasMore: false, page: null };
  }
  const data = raw as { data?: ZohoInterview[]; info?: ZohoListInfo };
  const interviews = Array.isArray(data.data) ? data.data : [];
  return {
    interviews: interviews.map(normalizeInterview),
    ...parseListMeta(data.info),
  };
}
