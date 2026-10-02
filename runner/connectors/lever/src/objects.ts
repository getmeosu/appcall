/**
 * Lever object normalization.
 *
 * jobs.list uses the public postings shape (array of postings).
 * Authenticated list ops use Lever's collection envelope: { data, next, hasNext }.
 * opportunities.get uses the singular envelope: { data: opportunity }.
 * Nested reads (interviews/feedback) use the same collection envelope under
 * /opportunities/{id}/...
 */

export interface NormalizedJob {
  id: string;
  provider: string;
  title: string;
  location: string | null;
  team: string | null;
  commitment: string | null;
  description: string | null;
  url: string | null;
}

export interface NormalizedOpportunity {
  id: string;
  provider: string;
  name: string;
  headline: string | null;
  location: string | null;
  stageId: string | null;
  origin: string | null;
  ownerId: string | null;
  contactId: string | null;
  emails: string[];
  tags: string[];
  sources: string[];
  archived: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  urls: { list: string | null; show: string | null } | null;
}

export interface NormalizedStage {
  id: string;
  provider: string;
  name: string;
}

export interface NormalizedUser {
  id: string;
  provider: string;
  name: string;
  username: string | null;
  email: string | null;
  accessRole: string | null;
  photo: string | null;
  createdAt: string | null;
  deactivatedAt: string | null;
}

export interface NormalizedInterview {
  id: string;
  provider: string;
  opportunityId: string | null;
  panelId: string | null;
  subject: string;
  note: string | null;
  interviewerIds: string[];
  timezone: string | null;
  date: string | null;
  durationMinutes: number | null;
  location: string | null;
  stageId: string | null;
  userId: string | null;
  canceledAt: string | null;
  createdAt: string | null;
  postings: string[];
}

export interface NormalizedFeedbackField {
  id: string | null;
  type: string | null;
  text: string | null;
  value: unknown;
}

export interface NormalizedFeedback {
  id: string;
  provider: string;
  type: string | null;
  text: string;
  userId: string | null;
  panelId: string | null;
  interviewId: string | null;
  baseTemplateId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
  deletedAt: string | null;
  fields: NormalizedFeedbackField[];
}

interface LeverCategories {
  location?: string | null;
  team?: string | null;
  commitment?: string | null;
}

interface LeverContent {
  description?: string | null;
}

interface LeverPosting {
  id: string;
  text?: string | null;
  categories?: LeverCategories | null;
  content?: LeverContent | null;
  hostedUrl?: string | null;
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

function msToIso(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return new Date(value).toISOString();
}

export function normalizeJob(posting: LeverPosting): NormalizedJob {
  const categories = posting.categories ?? {};
  const content = posting.content ?? {};

  return {
    id: `lev-job:${posting.id}`,
    provider: "lever",
    title: posting.text ?? "",
    location: categories.location ?? null,
    team: categories.team ?? null,
    commitment: categories.commitment ?? null,
    description: content.description ?? null,
    url: posting.hostedUrl ?? null,
  };
}

export function parseJobsResponse(raw: unknown): NormalizedJob[] {
  const data = raw as LeverPosting[];
  const postings = Array.isArray(data) ? data : [];
  return postings.map(normalizeJob);
}

interface LeverOpportunity {
  id: string;
  name?: string | null;
  headline?: string | null;
  location?: string | null;
  stage?: string | null;
  origin?: string | null;
  owner?: string | null;
  contact?: string | null;
  emails?: unknown;
  tags?: unknown;
  sources?: unknown;
  archived?: { archivedAt?: number; reason?: string } | null;
  createdAt?: number | null;
  updatedAt?: number | null;
  urls?: { list?: string | null; show?: string | null } | null;
}

export function normalizeOpportunity(opp: LeverOpportunity): NormalizedOpportunity {
  const id = asStringId(opp.id) ?? "";
  return {
    id: `lev-opportunity:${id}`,
    provider: "lever",
    name: opp.name ?? "",
    headline: opp.headline ?? null,
    location: opp.location ?? null,
    stageId: opp.stage ?? null,
    origin: opp.origin ?? null,
    ownerId: opp.owner ?? null,
    contactId: opp.contact ?? null,
    emails: asStringArray(opp.emails),
    tags: asStringArray(opp.tags),
    sources: asStringArray(opp.sources),
    archived: opp.archived != null,
    createdAt: msToIso(opp.createdAt),
    updatedAt: msToIso(opp.updatedAt),
    urls: opp.urls
      ? { list: opp.urls.list ?? null, show: opp.urls.show ?? null }
      : null,
  };
}

export function parseOpportunitiesResponse(raw: unknown): {
  opportunities: NormalizedOpportunity[];
  next: string | null;
  hasNext: boolean;
} {
  const data = raw as {
    data?: LeverOpportunity[];
    next?: string | null;
    hasNext?: boolean;
  };
  const items = Array.isArray(data.data) ? data.data : [];
  return {
    opportunities: items.map(normalizeOpportunity),
    next: typeof data.next === "string" ? data.next : null,
    hasNext: data.hasNext === true,
  };
}

export function parseOpportunityGetResponse(raw: unknown): {
  opportunity: NormalizedOpportunity | null;
} {
  const envelope = raw as { data?: LeverOpportunity } | null;
  const opp = envelope && typeof envelope === "object" ? envelope.data : undefined;
  if (opp == null || typeof opp !== "object" || Array.isArray(opp)) {
    return { opportunity: null };
  }
  if (asStringId(opp.id) == null) {
    return { opportunity: null };
  }
  return { opportunity: normalizeOpportunity(opp) };
}

interface LeverStage {
  id: string;
  text?: string | null;
}

export function normalizeStage(stage: LeverStage): NormalizedStage {
  const id = asStringId(stage.id) ?? "";
  return {
    id: `lev-stage:${id}`,
    provider: "lever",
    name: stage.text ?? "",
  };
}

export function parseStagesResponse(raw: unknown): {
  stages: NormalizedStage[];
  next: string | null;
  hasNext: boolean;
} {
  const data = raw as {
    data?: LeverStage[];
    next?: string | null;
    hasNext?: boolean;
  };
  const items = Array.isArray(data.data) ? data.data : [];
  return {
    stages: items.map(normalizeStage),
    next: typeof data.next === "string" ? data.next : null,
    hasNext: data.hasNext === true,
  };
}

interface LeverUser {
  id: string;
  name?: string | null;
  username?: string | null;
  email?: string | null;
  accessRole?: string | null;
  photo?: string | null;
  createdAt?: number | null;
  deactivatedAt?: number | null;
}

export function normalizeUser(user: LeverUser): NormalizedUser {
  const id = asStringId(user.id) ?? "";
  return {
    id: `lev-user:${id}`,
    provider: "lever",
    name: user.name ?? "",
    username: user.username ?? null,
    email: user.email ?? null,
    accessRole: user.accessRole ?? null,
    photo: user.photo ?? null,
    createdAt: msToIso(user.createdAt),
    deactivatedAt: msToIso(user.deactivatedAt),
  };
}

export function parseUsersResponse(raw: unknown): {
  users: NormalizedUser[];
  next: string | null;
  hasNext: boolean;
} {
  const data = raw as {
    data?: LeverUser[];
    next?: string | null;
    hasNext?: boolean;
  };
  const items = Array.isArray(data.data) ? data.data : [];
  return {
    users: items.map(normalizeUser),
    next: typeof data.next === "string" ? data.next : null,
    hasNext: data.hasNext === true,
  };
}

interface LeverInterviewer {
  id?: string | null;
  email?: string | null;
  name?: string | null;
  feedbackTemplate?: string | null;
}

interface LeverInterview {
  id: string;
  panel?: string | null;
  subject?: string | null;
  note?: string | null;
  interviewers?: LeverInterviewer[] | null;
  timezone?: string | null;
  createdAt?: number | null;
  date?: number | null;
  duration?: number | null;
  location?: string | null;
  feedbackTemplate?: string | null;
  feedbackForms?: unknown;
  feedbackReminder?: string | null;
  user?: string | null;
  stage?: string | null;
  canceledAt?: number | null;
  postings?: unknown;
  gcalEventUrl?: string | null;
}

export function normalizeInterview(
  interview: LeverInterview,
  opportunityId?: string | null,
): NormalizedInterview {
  const id = asStringId(interview.id) ?? "";
  const interviewers = Array.isArray(interview.interviewers) ? interview.interviewers : [];
  return {
    id: `lev-interview:${id}`,
    provider: "lever",
    opportunityId: opportunityId ?? null,
    panelId: interview.panel ?? null,
    subject: interview.subject ?? "",
    note: interview.note ?? null,
    interviewerIds: interviewers
      .map((i) => asStringId(i?.id))
      .filter((v): v is string => v != null),
    timezone: interview.timezone ?? null,
    date: msToIso(interview.date),
    durationMinutes: typeof interview.duration === "number" && Number.isFinite(interview.duration)
      ? interview.duration
      : null,
    location: interview.location ?? null,
    stageId: interview.stage ?? null,
    userId: interview.user ?? null,
    canceledAt: msToIso(interview.canceledAt),
    createdAt: msToIso(interview.createdAt),
    postings: asStringArray(interview.postings),
  };
}

export function parseInterviewsResponse(
  raw: unknown,
  opportunityId?: string | null,
): {
  interviews: NormalizedInterview[];
  next: string | null;
  hasNext: boolean;
} {
  const data = raw as {
    data?: LeverInterview[];
    next?: string | null;
    hasNext?: boolean;
  };
  const items = Array.isArray(data.data) ? data.data : [];
  return {
    interviews: items.map((item) => normalizeInterview(item, opportunityId)),
    next: typeof data.next === "string" ? data.next : null,
    hasNext: data.hasNext === true,
  };
}

interface LeverFeedbackField {
  id?: string | null;
  type?: string | null;
  text?: string | null;
  value?: unknown;
}

interface LeverFeedback {
  id: string;
  type?: string | null;
  text?: string | null;
  instructions?: string | null;
  baseTemplateId?: string | null;
  fields?: LeverFeedbackField[] | null;
  user?: string | null;
  panel?: string | null;
  interview?: string | null;
  createdAt?: number | null;
  updatedAt?: number | null;
  completedAt?: number | null;
  deletedAt?: number | null;
}

export function normalizeFeedback(feedback: LeverFeedback): NormalizedFeedback {
  const id = asStringId(feedback.id) ?? "";
  const fields = Array.isArray(feedback.fields) ? feedback.fields : [];
  return {
    id: `lev-feedback:${id}`,
    provider: "lever",
    type: feedback.type ?? null,
    text: feedback.text ?? "",
    userId: feedback.user ?? null,
    panelId: feedback.panel ?? null,
    interviewId: feedback.interview ?? null,
    baseTemplateId: feedback.baseTemplateId ?? null,
    createdAt: msToIso(feedback.createdAt),
    updatedAt: msToIso(feedback.updatedAt),
    completedAt: msToIso(feedback.completedAt),
    deletedAt: msToIso(feedback.deletedAt),
    fields: fields.map((f) => ({
      id: f?.id ?? null,
      type: f?.type ?? null,
      text: f?.text ?? null,
      value: f?.value ?? null,
    })),
  };
}

export function parseFeedbackResponse(raw: unknown): {
  feedback: NormalizedFeedback[];
  next: string | null;
  hasNext: boolean;
} {
  const data = raw as {
    data?: LeverFeedback[];
    next?: string | null;
    hasNext?: boolean;
  };
  const items = Array.isArray(data.data) ? data.data : [];
  return {
    feedback: items.map(normalizeFeedback),
    next: typeof data.next === "string" ? data.next : null,
    hasNext: data.hasNext === true,
  };
}
