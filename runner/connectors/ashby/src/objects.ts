/**
 * Ashby object normalization.
 *
 * jobs.list uses the public posting-api shape ({ jobs: [...] }).
 * Authenticated list/info/search ops use Ashby's envelope:
 *   { success, results, moreDataAvailable?, nextCursor?, syncToken? }
 * where `results` is an array for *.list/*.search and a single object for *.info / mutate responses.
 */

export interface NormalizedJob {
  id: string;
  provider: string;
  title: string;
  location: string | null;
  department: string | null;
  employmentType: string | null;
  createdAt: string | null;
  /** Authenticated job.info fields (output additions for G2 Reconcile). */
  status: string | null;
  locationId: string | null;
  departmentId: string | null;
  defaultInterviewPlanId: string | null;
  customRequisitionId: string | null;
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
  /** Tag titles from candidate.info (G2 fold-in; output addition). */
  tags: string[];
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
  /** Source title from application.info (G2 fold-in; output addition). */
  source: string | null;
  /** Source UUID from application.info.source.id (G2 fold-in). */
  sourceId: string | null;
  /** Credited user UUID from application.info.creditedToUser.id (G2 fold-in). */
  creditedToUserId: string | null;
}

export interface NormalizedInterview {
  id: string;
  provider: string;
  title: string;
  externalTitle: string | null;
  isArchived: boolean;
  isDebrief: boolean | null;
  isFeedbackRequired: boolean | null;
  isFeedbackRequested: boolean | null;
  instructionsPlain: string | null;
  jobId: string | null;
  feedbackFormDefinitionId: string | null;
}

export interface NormalizedInterviewScheduleEvent {
  id: string | null;
  startTime: string | null;
  endTime: string | null;
  interviewId: string | null;
  interviewerEmails: string[];
}

export interface NormalizedInterviewSchedule {
  id: string;
  provider: string;
  status: string | null;
  applicationId: string | null;
  interviewStageId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  events: NormalizedInterviewScheduleEvent[];
}

interface AshbyJob {
  id: string;
  title?: string | null;
  locationName?: string | null;
  departmentName?: string | null;
  /**
   * Live public posting-api (jobs.list) returns `location` / `department` as
   * strings; authenticated job.info returns `location` as an object
   * ({ id, name, ... }, when expanded) and no department name.
   */
  location?: unknown;
  department?: unknown;
  employmentType?: string | null;
  descriptionHtml?: string | null;
  url?: string | null;
  publishedAt?: string | null;
  status?: string | null;
  locationId?: string | null;
  departmentId?: string | null;
  defaultInterviewPlanId?: string | null;
  customRequisitionId?: string | null;
  createdAt?: string | null;
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

function nameOf(value: unknown): string | null {
  if (typeof value === "string") return value.length > 0 ? value : null;
  if (value != null && typeof value === "object") {
    const name = (value as { name?: unknown }).name;
    return typeof name === "string" && name.length > 0 ? name : null;
  }
  return null;
}

export function normalizeJob(job: AshbyJob): NormalizedJob {
  return {
    id: `ash-job:${job.id}`,
    provider: "ashby",
    title: job.title ?? "",
    location: job.locationName ?? nameOf(job.location),
    department: job.departmentName ?? nameOf(job.department),
    employmentType: job.employmentType ?? null,
    createdAt: job.publishedAt ?? job.createdAt ?? null,
    status: job.status ?? null,
    locationId: asStringId(job.locationId ?? null),
    departmentId: asStringId(job.departmentId ?? null),
    defaultInterviewPlanId: asStringId(job.defaultInterviewPlanId ?? null),
    customRequisitionId:
      typeof job.customRequisitionId === "string" && job.customRequisitionId.length > 0
        ? job.customRequisitionId
        : null,
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
  tags?: unknown;
  createdAt?: string | null;
  updatedAt?: string | null;
}


function tagTitles(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const out: string[] = [];
  for (const item of tags) {
    if (typeof item === "string" && item.length > 0) {
      out.push(item);
      continue;
    }
    if (item != null && typeof item === "object") {
      const title = (item as { title?: unknown }).title;
      if (typeof title === "string" && title.length > 0) out.push(title);
    }
  }
  return out;
}

function sourceIdOf(source: unknown): string | null {
  if (source == null || typeof source !== "object") return null;
  return asStringId((source as { id?: unknown }).id ?? null);
}

function creditedToUserIdOf(user: unknown): string | null {
  if (user == null || typeof user !== "object") return null;
  return asStringId((user as { id?: unknown }).id ?? null);
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
    tags: tagTitles(candidate.tags),
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
  source?: unknown;
  creditedToUser?: unknown;
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
    source: sourceTitle(application.source),
    sourceId: sourceIdOf(application.source),
    creditedToUserId: creditedToUserIdOf(application.creditedToUser),
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

export function parseApplicationInfoResponse(raw: unknown): {
  application: NormalizedApplication | null;
} {
  const data = raw as AshbyListEnvelope;
  const result = data.results;
  if (result == null || typeof result !== "object" || Array.isArray(result)) {
    return { application: null };
  }
  return { application: normalizeApplication(result as AshbyApplication) };
}

interface AshbyInterview {
  id: string;
  title?: string | null;
  externalTitle?: string | null;
  isArchived?: boolean | null;
  isDebrief?: boolean | null;
  isFeedbackRequired?: boolean | null;
  isFeedbackRequested?: boolean | null;
  instructionsPlain?: string | null;
  jobId?: string | null;
  feedbackFormDefinitionId?: string | null;
}

export function normalizeInterview(interview: AshbyInterview): NormalizedInterview {
  const id = asStringId(interview.id) ?? "";
  return {
    id: `ash-interview:${id}`,
    provider: "ashby",
    title: interview.title ?? "",
    externalTitle: interview.externalTitle ?? null,
    isArchived: interview.isArchived === true,
    isDebrief: typeof interview.isDebrief === "boolean" ? interview.isDebrief : null,
    isFeedbackRequired:
      typeof interview.isFeedbackRequired === "boolean" ? interview.isFeedbackRequired : null,
    isFeedbackRequested:
      typeof interview.isFeedbackRequested === "boolean" ? interview.isFeedbackRequested : null,
    instructionsPlain: interview.instructionsPlain ?? null,
    jobId: asStringId(interview.jobId ?? null),
    feedbackFormDefinitionId: asStringId(interview.feedbackFormDefinitionId ?? null),
  };
}

export function parseInterviewsResponse(raw: unknown): {
  interviews: NormalizedInterview[];
  moreDataAvailable: boolean;
  nextCursor: string | null;
  syncToken: string | null;
} {
  const data = raw as AshbyListEnvelope;
  const items = Array.isArray(data.results) ? (data.results as AshbyInterview[]) : [];
  return {
    interviews: items.map(normalizeInterview),
    moreDataAvailable: data.moreDataAvailable === true,
    nextCursor: typeof data.nextCursor === "string" ? data.nextCursor : null,
    syncToken: typeof data.syncToken === "string" ? data.syncToken : null,
  };
}

interface AshbyInterviewScheduleEvent {
  id?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  interviewId?: string | null;
  interviewers?: Array<{ email?: string | null } | null> | null;
}

interface AshbyInterviewSchedule {
  id: string;
  status?: string | null;
  applicationId?: string | null;
  interviewStageId?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  interviewEvents?: AshbyInterviewScheduleEvent[] | null;
}

function normalizeInterviewScheduleEvent(
  event: AshbyInterviewScheduleEvent,
): NormalizedInterviewScheduleEvent {
  const emails: string[] = [];
  if (Array.isArray(event.interviewers)) {
    for (const interviewer of event.interviewers) {
      if (interviewer == null || typeof interviewer !== "object") continue;
      const email = interviewer.email;
      if (typeof email === "string" && email.length > 0) emails.push(email);
    }
  }
  return {
    id: asStringId(event.id ?? null),
    startTime: asIso(event.startTime),
    endTime: asIso(event.endTime),
    interviewId: asStringId(event.interviewId ?? null),
    interviewerEmails: emails,
  };
}

export function normalizeInterviewSchedule(
  schedule: AshbyInterviewSchedule,
): NormalizedInterviewSchedule {
  const id = asStringId(schedule.id) ?? "";
  const events = Array.isArray(schedule.interviewEvents)
    ? schedule.interviewEvents.map(normalizeInterviewScheduleEvent)
    : [];
  return {
    id: `ash-interview-schedule:${id}`,
    provider: "ashby",
    status: schedule.status ?? null,
    applicationId: asStringId(schedule.applicationId ?? null),
    interviewStageId: asStringId(schedule.interviewStageId ?? null),
    createdAt: asIso(schedule.createdAt),
    updatedAt: asIso(schedule.updatedAt),
    events,
  };
}

export function parseInterviewScheduleInfoResponse(raw: unknown): {
  interviewSchedule: NormalizedInterviewSchedule | null;
} {
  const data = raw as AshbyListEnvelope;
  const result = data.results;
  if (result == null || typeof result !== "object" || Array.isArray(result)) {
    return { interviewSchedule: null };
  }
  return { interviewSchedule: normalizeInterviewSchedule(result as AshbyInterviewSchedule) };
}

export function parseJobInfoResponse(raw: unknown): { job: NormalizedJob | null } {
  const data = raw as AshbyListEnvelope;
  const result = data.results;
  if (result == null || typeof result !== "object" || Array.isArray(result)) {
    return { job: null };
  }
  return { job: normalizeJob(result as AshbyJob) };
}

export function parseInterviewSchedulesResponse(raw: unknown): {
  interviewSchedules: NormalizedInterviewSchedule[];
  moreDataAvailable: boolean;
  nextCursor: string | null;
  syncToken: string | null;
} {
  const data = raw as AshbyListEnvelope;
  const items = Array.isArray(data.results) ? (data.results as AshbyInterviewSchedule[]) : [];
  return {
    interviewSchedules: items.map(normalizeInterviewSchedule),
    moreDataAvailable: data.moreDataAvailable === true,
    nextCursor: typeof data.nextCursor === "string" ? data.nextCursor : null,
    syncToken: typeof data.syncToken === "string" ? data.syncToken : null,
  };
}

export interface NormalizedOffer {
  id: string;
  provider: string;
  applicationId: string | null;
  acceptanceStatus: string | null;
  offerStatus: string | null;
  decidedAt: string | null;
  latestVersionId: string | null;
  startDate: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

interface AshbyOffer {
  id: string;
  applicationId?: string | null;
  acceptanceStatus?: string | null;
  offerStatus?: string | null;
  decidedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  /**
   * Live offer.list / offer.info carry no top-level createdAt/updatedAt; the
   * creation timestamp lives at latestVersion.createdAt.
   */
  latestVersion?: {
    id?: string | null;
    startDate?: string | null;
    createdAt?: string | null;
  } | null;
}

export function normalizeOffer(offer: AshbyOffer): NormalizedOffer {
  const id = asStringId(offer.id) ?? "";
  return {
    id: `ash-offer:${id}`,
    provider: "ashby",
    applicationId: asStringId(offer.applicationId ?? null),
    acceptanceStatus: offer.acceptanceStatus ?? null,
    offerStatus: offer.offerStatus ?? null,
    decidedAt: asIso(offer.decidedAt),
    latestVersionId: asStringId(offer.latestVersion?.id ?? null),
    startDate: asIso(offer.latestVersion?.startDate),
    createdAt: asIso(offer.createdAt) ?? asIso(offer.latestVersion?.createdAt),
    updatedAt: asIso(offer.updatedAt),
  };
}

export function parseOffersResponse(raw: unknown): {
  offers: NormalizedOffer[];
  moreDataAvailable: boolean;
  nextCursor: string | null;
  syncToken: string | null;
} {
  const data = raw as AshbyListEnvelope;
  const items = Array.isArray(data.results) ? (data.results as AshbyOffer[]) : [];
  return {
    offers: items.map(normalizeOffer),
    moreDataAvailable: data.moreDataAvailable === true,
    nextCursor: typeof data.nextCursor === "string" ? data.nextCursor : null,
    syncToken: typeof data.syncToken === "string" ? data.syncToken : null,
  };
}

export function parseOfferInfoResponse(raw: unknown): { offer: NormalizedOffer | null } {
  const data = raw as AshbyListEnvelope;
  const result = data.results;
  if (result == null || typeof result !== "object" || Array.isArray(result)) {
    return { offer: null };
  }
  return { offer: normalizeOffer(result as AshbyOffer) };
}

export interface NormalizedDepartment {
  id: string;
  provider: string;
  name: string;
  isArchived: boolean;
}

interface AshbyDepartment {
  id: string;
  name?: string | null;
  isArchived?: boolean | null;
}

export function normalizeDepartment(department: AshbyDepartment): NormalizedDepartment {
  return {
    id: `ash-department:${asStringId(department.id) ?? ""}`,
    provider: "ashby",
    name: department.name ?? "",
    isArchived: department.isArchived === true,
  };
}

export function parseDepartmentsResponse(raw: unknown): {
  departments: NormalizedDepartment[];
  moreDataAvailable: boolean;
  nextCursor: string | null;
  syncToken: string | null;
} {
  const data = raw as AshbyListEnvelope;
  const items = Array.isArray(data.results) ? (data.results as AshbyDepartment[]) : [];
  return {
    departments: items.map(normalizeDepartment),
    moreDataAvailable: data.moreDataAvailable === true,
    nextCursor: typeof data.nextCursor === "string" ? data.nextCursor : null,
    syncToken: typeof data.syncToken === "string" ? data.syncToken : null,
  };
}

export interface NormalizedUser {
  id: string;
  provider: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  globalRole: string | null;
  isEnabled: boolean;
}

interface AshbyUser {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  globalRole?: string | null;
  isEnabled?: boolean | null;
}

export function normalizeUser(user: AshbyUser): NormalizedUser {
  const firstName = user.firstName ?? null;
  const lastName = user.lastName ?? null;
  const nameParts = [firstName, lastName].filter(
    (p): p is string => typeof p === "string" && p.length > 0,
  );
  return {
    id: `ash-user:${asStringId(user.id) ?? ""}`,
    provider: "ashby",
    name: nameParts.join(" "),
    firstName,
    lastName,
    email: user.email ?? null,
    globalRole: user.globalRole ?? null,
    isEnabled: user.isEnabled !== false,
  };
}

export function parseUsersResponse(raw: unknown): {
  users: NormalizedUser[];
  moreDataAvailable: boolean;
  nextCursor: string | null;
  syncToken: string | null;
} {
  const data = raw as AshbyListEnvelope;
  const items = Array.isArray(data.results) ? (data.results as AshbyUser[]) : [];
  return {
    users: items.map(normalizeUser),
    moreDataAvailable: data.moreDataAvailable === true,
    nextCursor: typeof data.nextCursor === "string" ? data.nextCursor : null,
    syncToken: typeof data.syncToken === "string" ? data.syncToken : null,
  };
}

export interface NormalizedSource {
  id: string;
  provider: string;
  title: string;
  isArchived: boolean;
}

interface AshbySource {
  id: string;
  title?: string | null;
  isArchived?: boolean | null;
}

export function normalizeSource(source: AshbySource): NormalizedSource {
  return {
    id: `ash-source:${asStringId(source.id) ?? ""}`,
    provider: "ashby",
    title: source.title ?? "",
    isArchived: source.isArchived === true,
  };
}

export function parseSourcesResponse(raw: unknown): {
  sources: NormalizedSource[];
  moreDataAvailable: boolean;
  nextCursor: string | null;
  syncToken: string | null;
} {
  const data = raw as AshbyListEnvelope;
  const items = Array.isArray(data.results) ? (data.results as AshbySource[]) : [];
  return {
    sources: items.map(normalizeSource),
    moreDataAvailable: data.moreDataAvailable === true,
    nextCursor: typeof data.nextCursor === "string" ? data.nextCursor : null,
    syncToken: typeof data.syncToken === "string" ? data.syncToken : null,
  };
}

export interface NormalizedArchiveReason {
  id: string;
  provider: string;
  text: string;
  reasonType: string | null;
  isArchived: boolean;
}

interface AshbyArchiveReason {
  id: string;
  text?: string | null;
  reasonType?: string | null;
  isArchived?: boolean | null;
}

export function normalizeArchiveReason(reason: AshbyArchiveReason): NormalizedArchiveReason {
  return {
    id: `ash-archive-reason:${asStringId(reason.id) ?? ""}`,
    provider: "ashby",
    text: reason.text ?? "",
    reasonType: reason.reasonType ?? null,
    isArchived: reason.isArchived === true,
  };
}

export function parseArchiveReasonsResponse(raw: unknown): {
  archiveReasons: NormalizedArchiveReason[];
  moreDataAvailable: boolean;
  nextCursor: string | null;
  syncToken: string | null;
} {
  const data = raw as AshbyListEnvelope;
  const items = Array.isArray(data.results) ? (data.results as AshbyArchiveReason[]) : [];
  return {
    archiveReasons: items.map(normalizeArchiveReason),
    moreDataAvailable: data.moreDataAvailable === true,
    nextCursor: typeof data.nextCursor === "string" ? data.nextCursor : null,
    syncToken: typeof data.syncToken === "string" ? data.syncToken : null,
  };
}

export interface NormalizedInterviewStage {
  id: string;
  provider: string;
  title: string;
  type: string | null;
  orderInInterviewPlan: number | null;
  interviewPlanId: string | null;
}

interface AshbyInterviewStage {
  id: string;
  title?: string | null;
  type?: string | null;
  orderInInterviewPlan?: number | null;
  interviewPlanId?: string | null;
}

export function normalizeInterviewStage(stage: AshbyInterviewStage): NormalizedInterviewStage {
  return {
    id: `ash-interview-stage:${asStringId(stage.id) ?? ""}`,
    provider: "ashby",
    title: stage.title ?? "",
    type: stage.type ?? null,
    orderInInterviewPlan:
      typeof stage.orderInInterviewPlan === "number" && Number.isFinite(stage.orderInInterviewPlan)
        ? stage.orderInInterviewPlan
        : null,
    interviewPlanId: asStringId(stage.interviewPlanId ?? null),
  };
}

export function parseInterviewStagesResponse(raw: unknown): {
  interviewStages: NormalizedInterviewStage[];
  moreDataAvailable: boolean;
  nextCursor: string | null;
  syncToken: string | null;
} {
  const data = raw as AshbyListEnvelope;
  const items = Array.isArray(data.results) ? (data.results as AshbyInterviewStage[]) : [];
  return {
    interviewStages: items.map(normalizeInterviewStage),
    moreDataAvailable: data.moreDataAvailable === true,
    nextCursor: typeof data.nextCursor === "string" ? data.nextCursor : null,
    syncToken: typeof data.syncToken === "string" ? data.syncToken : null,
  };
}

export interface NormalizedOpening {
  id: string;
  provider: string;
  jobId: string | null;
  isOpen: boolean;
  openedAt: string | null;
  closedAt: string | null;
  identifier: string | null;
  /** G2 observe fields for openings.update / create (output additions). */
  description: string | null;
  teamId: string | null;
  targetHireDate: string | null;
  targetStartDate: string | null;
  isBackfill: boolean | null;
  employmentType: string | null;
  openingState: string | null;
}

/**
 * Live Ashby opening shape (opening.list / opening.info / opening.search /
 * opening.create / opening.update): top level carries id, openedAt, closedAt,
 * isArchived, closeReasonId, archivedAt, openingState; the version fields
 * (identifier, description, teamId, targetHireDate, targetStartDate,
 * isBackfill, employmentType, jobIds, locationIds, ...) are nested under
 * `latestVersion` (nullable). There is no top-level jobId or isOpen.
 * The legacy top-level keys are kept only as a fallback.
 */
interface AshbyOpeningVersion {
  id?: string | null;
  identifier?: string | null;
  description?: string | null;
  authorId?: string | null;
  createdAt?: string | null;
  teamId?: string | null;
  targetHireDate?: string | null;
  targetStartDate?: string | null;
  isBackfill?: boolean | null;
  employmentType?: string | null;
  jobIds?: unknown;
  locationIds?: unknown;
}

interface AshbyOpening {
  id: string;
  openedAt?: string | null;
  closedAt?: string | null;
  isArchived?: boolean | null;
  closeReasonId?: string | null;
  archivedAt?: string | null;
  openingState?: string | null;
  latestVersion?: AshbyOpeningVersion | null;
  /** Legacy top-level fallbacks (not in the live response). */
  jobId?: string | null;
  isOpen?: boolean | null;
  identifier?: string | null;
  description?: string | null;
  teamId?: string | null;
  targetHireDate?: string | null;
  targetStartDate?: string | null;
  isBackfill?: boolean | null;
  employmentType?: string | null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function firstStringId(list: unknown): string | null {
  if (!Array.isArray(list)) return null;
  for (const item of list) {
    const id = asStringId(item);
    if (id != null) return id;
  }
  return null;
}

export function normalizeOpening(opening: AshbyOpening): NormalizedOpening {
  const version: AshbyOpeningVersion =
    opening.latestVersion != null && typeof opening.latestVersion === "object"
      ? opening.latestVersion
      : {};
  const isBackfill =
    typeof version.isBackfill === "boolean"
      ? version.isBackfill
      : typeof opening.isBackfill === "boolean"
        ? opening.isBackfill
        : null;
  const openingState = nonEmptyString(opening.openingState);
  return {
    id: `ash-opening:${asStringId(opening.id) ?? ""}`,
    provider: "ashby",
    jobId: firstStringId(version.jobIds) ?? asStringId(opening.jobId ?? null),
    isOpen: typeof opening.isOpen === "boolean" ? opening.isOpen : openingState === "Open",
    openedAt: asIso(opening.openedAt),
    closedAt: asIso(opening.closedAt),
    identifier: nonEmptyString(version.identifier) ?? nonEmptyString(opening.identifier),
    description: nonEmptyString(version.description) ?? nonEmptyString(opening.description),
    teamId: asStringId(version.teamId ?? null) ?? asStringId(opening.teamId ?? null),
    targetHireDate:
      nonEmptyString(version.targetHireDate) ?? nonEmptyString(opening.targetHireDate),
    targetStartDate:
      nonEmptyString(version.targetStartDate) ?? nonEmptyString(opening.targetStartDate),
    isBackfill,
    employmentType:
      nonEmptyString(version.employmentType) ?? nonEmptyString(opening.employmentType),
    openingState,
  };
}

export function parseOpeningsResponse(raw: unknown): {
  openings: NormalizedOpening[];
  moreDataAvailable: boolean;
  nextCursor: string | null;
  syncToken: string | null;
} {
  const data = raw as AshbyListEnvelope;
  const items = Array.isArray(data.results) ? (data.results as AshbyOpening[]) : [];
  return {
    openings: items.map(normalizeOpening),
    moreDataAvailable: data.moreDataAvailable === true,
    nextCursor: typeof data.nextCursor === "string" ? data.nextCursor : null,
    syncToken: typeof data.syncToken === "string" ? data.syncToken : null,
  };
}
