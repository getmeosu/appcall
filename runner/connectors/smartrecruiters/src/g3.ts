/**
 * SmartRecruiters G3 — interviews, messages, offers, reviews, users (15 ops, v0.6.0).
 *
 * Customer API calls use X-SmartToken on https://api.smartrecruiters.com
 * (createApiClient). Official references:
 *
 *   interviews.create              POST   /interviews-api/v201904/interviews                 interviewscreate-1
 *   interviews.get                 GET    /interviews-api/v201904/interviews/{interviewId}   interviewsget-1
 *   interviews.update              PATCH  /interviews-api/v201904/interviews/{interviewId}   interviewsupdate-1
 *   interviews.delete              DELETE /interviews-api/v201904/interviews/{interviewId}   interviewsdelete-1
 *   interview_types.list           GET    /interviews-api/v201904/interview-types            typesget-1
 *   messages.share                 POST   /messages/shares                                   messagessharescreate-1
 *   messages.list                  GET    /messages                                          messagesfetch-1
 *   offers.list                    GET    /candidates/{id}/jobs/{jobId}/offers               candidatesoffersall
 *   offers.get                     GET    /candidates/{id}/jobs/{jobId}/offers/{offerId}     candidatesoffersget
 *   offers.search                  GET    /offers                                            candidatesoffersfind
 *   reviews.list                   GET    /reviews-api/v201910/reviews                       reviewsgetlist-1
 *   reviews.get                    GET    /reviews-api/v201910/reviews/{reviewId}            reviewsget-1
 *   scorecards.criteria.list       GET    /reviews-api/v201910/jobs/{jobId}/criteria         scorecardscriteriagetbyjobid
 *   users.get                      GET    /user-api/v201804/users/{id}                       usersget-2
 *   users.me                       GET    /user-api/v201804/users/me                         usersme-2
 *
 * Effect keys (manifest):
 * - interviews.create, messages.share: omitted (create).
 * - interviews.update: Reconcile → interviews.get [interviewId]. Inputs narrowed to
 *   location + timezone (the mutable fields interviews.get returns verbatim).
 *   Upstream also accepts candidate.status, but that field is deprecated (use
 *   timeslot.candidateStatus) and normalizeInterview does not surface it, so it is
 *   not exposed here.
 * - interviews.delete: omitted (delete). Non-2xx including 404 → CONNECTOR_UPSTREAM_ERROR.
 *
 * Id inputs go through the shared src/ids.ts helpers: job / candidate / user /
 * interview ids accept the raw upstream id or the `sr-job:` / `sr-candidate:` /
 * `sr-user:` / `sr-interview:` form the connector emits (one leading prefix is
 * stripped, then assertSafePathSegment). Offer and review ids have no prefixed
 * form. Ids this module emits carry their prefix: interviews.create id, and the
 * candidate / job / user references in messages.list and reviews.list/get.
 *
 * update/delete work only for interviews created via the Public API (official note).
 * offers.search requires Extended/Admin credentials (official note).
 * messages.list is ADMINISTRATOR-only (official note); its next cursor is read from
 * the Link header (rel="next" pageId) and returned as nextPageId.
 */
import { assertSafePathSegment } from "../../_shared/jobboard";
import { createApiClient } from "./http";
import {
  candidateIdSegment,
  candidateIdValue,
  interviewIdSegment,
  jobIdSegment,
  jobIdValue,
  userIdSegment,
  userIdValue,
  withCandidatePrefix,
  withInterviewPrefix,
  withJobPrefix,
  withUserPrefix,
} from "./ids";
import { pageIdParam } from "./paging";
import {
  normalizeInterview,
  normalizeUser,
  type NormalizedInterview,
  type NormalizedUser,
} from "./objects";

export interface SmartRecruitersG3AuthInput {
  apiKey: string;
  /** Injected by tests; production leaves it unset. */
  fetch?: typeof fetch;
}

const INTERVIEWS_BASE = "/interviews-api/v201904";
const REVIEWS_BASE = "/reviews-api/v201910";
const USERS_BASE = "/user-api/v201804/users";

export const ATTENDEE_STATUSES = ["accepted", "declined", "pending", "tentative"] as const;
export const OFFER_STATUSES = [
  "CREATED",
  "PENDING_APPROVAL",
  "APPROVED",
  "NOT_APPROVED",
  "PENDING_ACCEPTANCE",
  "ACCEPTED",
  "NOT_ACCEPTED",
  "ABANDONED",
] as const;
export const MESSAGE_VISIBILITIES = ["PRIVATE", "DIRECT", "OPEN", "EVERYONE"] as const;

const ATTENDEE_SET = new Set<string>(ATTENDEE_STATUSES);
const OFFER_STATUS_SET = new Set<string>(OFFER_STATUSES);

function client(input: SmartRecruitersG3AuthInput, operation: string) {
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

function prefixed(value: unknown, withPrefix: (raw: string) => string): string | null {
  const raw = str(value);
  return raw == null ? null : withPrefix(raw);
}

function itemsOf(raw: unknown): { data: Record<string, unknown>; items: Record<string, unknown>[] } {
  const data = isRecord(raw) ? raw : {};
  return { data, items: Array.isArray(data.content) ? data.content.filter(isRecord) : [] };
}

function totalOf(data: Record<string, unknown>, items: unknown[]): number {
  return typeof data.totalFound === "number" ? data.totalFound : items.length;
}

// ---------------------------------------------------------------------------
// interviews.create — POST /interviews-api/v201904/interviews (201)
// ---------------------------------------------------------------------------

export interface InterviewerInput {
  id: string;
  status: (typeof ATTENDEE_STATUSES)[number];
}

export interface TimeslotInput {
  startsOn: string;
  endsOn: string;
  interviewers: InterviewerInput[];
  interviewType?: string;
  title?: string;
  place?: string;
  candidateStatus?: (typeof ATTENDEE_STATUSES)[number];
  noShow?: boolean;
}

export interface InterviewsCreateInput extends SmartRecruitersG3AuthInput {
  candidateId: string;
  jobId: string;
  organizerId: string;
  timezone: string;
  timeslots: TimeslotInput[];
  location?: string;
  createdOn?: string;
  refUrl?: string;
  refId?: string;
}

function attendeeStatus(value: unknown, field: string): (typeof ATTENDEE_STATUSES)[number] {
  if (typeof value !== "string" || !ATTENDEE_SET.has(value)) {
    throw new Error(`${field} must be one of ${ATTENDEE_STATUSES.join(", ")}`);
  }
  return value as (typeof ATTENDEE_STATUSES)[number];
}

export function buildInterviewInput(input: InterviewsCreateInput): Record<string, unknown> {
  // Body fields (SR-ID-1): prefix stripped, id validated, no path guard.
  const candidateId = candidateIdValue(input.candidateId, "candidateId");
  const jobId = jobIdValue(input.jobId, "jobId");
  const organizerId = userIdValue(input.organizerId, "organizerId");
  const timezone = requiredString(input.timezone, "timezone");
  if (timezone.length > 100) throw new Error("timezone must be at most 100 characters");
  if (!Array.isArray(input.timeslots) || input.timeslots.length < 1 || input.timeslots.length > 50) {
    throw new Error("timeslots must contain 1-50 entries");
  }
  const timeslots = input.timeslots.map((slot, i) => {
    if (!isRecord(slot)) throw new Error(`timeslots[${i}] must be an object`);
    const startsOn = requiredString(slot.startsOn, `timeslots[${i}].startsOn`);
    const endsOn = requiredString(slot.endsOn, `timeslots[${i}].endsOn`);
    if (!Array.isArray(slot.interviewers) || slot.interviewers.length < 1 || slot.interviewers.length > 50) {
      throw new Error(`timeslots[${i}].interviewers must contain 1-50 entries`);
    }
    const interviewers = slot.interviewers.map((row, j) => {
      if (!isRecord(row)) throw new Error(`timeslots[${i}].interviewers[${j}] must be an object`);
      return {
        id: userIdValue(row.id, `timeslots[${i}].interviewers[${j}].id`),
        status: attendeeStatus(row.status, `timeslots[${i}].interviewers[${j}].status`),
      };
    });
    const out: Record<string, unknown> = { startsOn, endsOn, interviewers };
    const interviewType = optionalString(slot.interviewType, `timeslots[${i}].interviewType`);
    if (interviewType) {
      if (interviewType.length > 400) throw new Error(`timeslots[${i}].interviewType must be at most 400 characters`);
      out.interviewType = interviewType;
    }
    const title = optionalString(slot.title, `timeslots[${i}].title`);
    if (title) {
      if (title.length > 200) throw new Error(`timeslots[${i}].title must be at most 200 characters`);
      out.title = title;
    }
    const place = optionalString(slot.place, `timeslots[${i}].place`);
    if (place) {
      if (place.length > 500) throw new Error(`timeslots[${i}].place must be at most 500 characters`);
      out.place = place;
    }
    if (slot.candidateStatus != null) out.candidateStatus = attendeeStatus(slot.candidateStatus, `timeslots[${i}].candidateStatus`);
    if (typeof slot.noShow === "boolean") out.noShow = slot.noShow;
    return out;
  });
  const body: Record<string, unknown> = {
    candidate: { id: candidateId },
    jobId,
    organizerId,
    timezone,
    timeslots,
  };
  const location = optionalString(input.location, "location");
  if (location) {
    if (location.length > 500) throw new Error("location must be at most 500 characters");
    body.location = location;
  }
  const createdOn = optionalString(input.createdOn, "createdOn");
  if (createdOn) body.createdOn = createdOn;
  const refUrl = optionalString(input.refUrl, "refUrl");
  if (refUrl) body.refUrl = refUrl;
  const refId = optionalString(input.refId, "refId");
  if (refId) {
    if (refId.length > 200) throw new Error("refId must be at most 200 characters");
    body.refId = refId;
  }
  return body;
}

export async function executeInterviewsCreate(
  input: InterviewsCreateInput,
): Promise<{ id: string; interview: NormalizedInterview }> {
  const body = buildInterviewInput(input);
  const raw = await client(input, "interviews.create").request("POST", `${INTERVIEWS_BASE}/interviews`, body);
  if (!isRecord(raw) || str(raw.id) == null) {
    throw { ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: "SmartRecruiters create response is missing the interview id." };
  }
  return {
    id: withInterviewPrefix(raw.id as string),
    interview: normalizeInterview(raw as Parameters<typeof normalizeInterview>[0]),
  };
}

// ---------------------------------------------------------------------------
// interviews.get — GET /interviews-api/v201904/interviews/{interviewId}
// ---------------------------------------------------------------------------

export async function executeInterviewsGet(
  input: SmartRecruitersG3AuthInput & { interviewId: string },
): Promise<{ interview: NormalizedInterview | null }> {
  const interviewId = interviewIdSegment(input.interviewId, "interviewId");
  const raw = await client(input, "interviews.get").getJSON(`${INTERVIEWS_BASE}/interviews/${interviewId}`);
  if (!isRecord(raw) || str(raw.id) == null) return { interview: null };
  return { interview: normalizeInterview(raw as Parameters<typeof normalizeInterview>[0]) };
}

// ---------------------------------------------------------------------------
// interviews.update — PATCH (Reconcile → interviews.get [interviewId])
// Narrowed to location + timezone (observe returns those verbatim).
// ---------------------------------------------------------------------------

export async function executeInterviewsUpdate(
  input: SmartRecruitersG3AuthInput & { interviewId: string; location?: string; timezone?: string },
): Promise<{ ok: true }> {
  const interviewId = interviewIdSegment(input.interviewId, "interviewId");
  const body: Record<string, unknown> = {};
  const location = optionalString(input.location, "location");
  if (location != null) {
    if (location.length > 500) throw new Error("location must be at most 500 characters");
    body.location = location;
  }
  const timezone = optionalString(input.timezone, "timezone");
  if (timezone != null) {
    if (timezone.length > 100) throw new Error("timezone must be at most 100 characters");
    body.timezone = timezone;
  }
  if (Object.keys(body).length === 0) throw new Error("interviews.update needs location or timezone");
  await client(input, "interviews.update").request("PATCH", `${INTERVIEWS_BASE}/interviews/${interviewId}`, body);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// interviews.delete — DELETE (204)
// ---------------------------------------------------------------------------

export async function executeInterviewsDelete(
  input: SmartRecruitersG3AuthInput & { interviewId: string },
): Promise<{ ok: true }> {
  const interviewId = interviewIdSegment(input.interviewId, "interviewId");
  await client(input, "interviews.delete").request("DELETE", `${INTERVIEWS_BASE}/interviews/${interviewId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// interview_types.list — GET /interviews-api/v201904/interview-types
// ---------------------------------------------------------------------------

export async function executeInterviewTypesList(
  input: SmartRecruitersG3AuthInput,
): Promise<{ types: string[]; total: number }> {
  const raw = await client(input, "interview_types.list").getJSON(`${INTERVIEWS_BASE}/interview-types`);
  const types = Array.isArray(raw) ? raw.filter((t): t is string => typeof t === "string" && t.length > 0) : [];
  return { types, total: types.length };
}

// ---------------------------------------------------------------------------
// messages.share — POST /messages/shares (201)
// ---------------------------------------------------------------------------

export interface ShareWithInput {
  users?: string[];
  hiringTeamOf?: string[];
  everyone?: boolean;
  openNote?: boolean;
}

export async function executeMessagesShare(
  input: SmartRecruitersG3AuthInput & {
    content: string;
    correlationId?: string;
    shareWith?: ShareWithInput;
  },
): Promise<{ id: string | null; shareRequired: boolean | null }> {
  const content = requiredString(input.content, "content");
  if (content.length > 10000) throw new Error("content must be at most 10000 characters");
  const body: Record<string, unknown> = { content };
  const correlationId = optionalString(input.correlationId, "correlationId");
  if (correlationId) body.correlationId = correlationId;
  if (input.shareWith != null) {
    if (!isRecord(input.shareWith)) throw new Error("shareWith must be an object");
    const shareWith: Record<string, unknown> = {};
    if (input.shareWith.users != null) {
      if (!Array.isArray(input.shareWith.users)) throw new Error("shareWith.users must be an array of user ids");
      shareWith.users = input.shareWith.users.map((id, i) => userIdValue(id, `shareWith.users[${i}]`));
    }
    if (input.shareWith.hiringTeamOf != null) {
      if (!Array.isArray(input.shareWith.hiringTeamOf)) {
        throw new Error("shareWith.hiringTeamOf must be an array of job ids");
      }
      shareWith.hiringTeamOf = input.shareWith.hiringTeamOf.map((id, i) => jobIdValue(id, `shareWith.hiringTeamOf[${i}]`));
    }
    if (typeof input.shareWith.everyone === "boolean") shareWith.everyone = input.shareWith.everyone;
    if (typeof input.shareWith.openNote === "boolean") shareWith.openNote = input.shareWith.openNote;
    if (shareWith.everyone === true && shareWith.openNote === true) {
      throw new Error("shareWith.everyone and shareWith.openNote are mutually exclusive");
    }
    body.shareWith = shareWith;
  }
  const raw = await client(input, "messages.share").request("POST", "/messages/shares", body);
  return {
    id: isRecord(raw) ? str(raw.id) : null,
    shareRequired: isRecord(raw) && typeof raw.shareRequired === "boolean" ? raw.shareRequired : null,
  };
}

// ---------------------------------------------------------------------------
// messages.list — GET /messages (ADMINISTRATOR)
// ---------------------------------------------------------------------------

export interface MessageRow {
  content: string | null;
  createdOn: string | null;
  visibility: string | null;
  authorId: string | null;
  applications: Array<{ candidateId: string | null; jobId: string | null }>;
}

export async function executeMessagesList(
  input: SmartRecruitersG3AuthInput & {
    candidateId: string;
    jobId?: string;
    pageId?: string;
    limit?: number;
  },
): Promise<{ messages: MessageRow[]; total: number; nextPageId: string | null }> {
  const qs = new URLSearchParams();
  qs.set("candidateId", candidateIdValue(input.candidateId, "candidateId"));
  if (input.jobId != null) qs.set("jobId", jobIdValue(input.jobId, "jobId"));
  const pageId = pageIdParam(input.pageId, "pageId");
  if (pageId) qs.set("pageId", pageId);
  if (input.limit != null) {
    if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100) throw new Error("limit must be 1-100");
    qs.set("limit", String(input.limit));
  }
  // MessagesView is a bare array; the next cursor is only in the Link header
  // (rel="next" URL carrying pageId), per messagesfetch-1.
  const page = await client(input, "messages.list").getPage(`/messages?${qs.toString()}`);
  const raw = page.data;
  const rows = Array.isArray(raw) ? raw.filter(isRecord) : [];
  const messages = rows.map((m) => {
    const context = isRecord(m.context) ? m.context : {};
    const apps = Array.isArray(context.applications) ? context.applications.filter(isRecord) : [];
    return {
      content: typeof m.content === "string" ? m.content : null,
      createdOn: str(m.createdOn),
      visibility: str(m.visibility),
      authorId: prefixed(m.authorId, withUserPrefix),
      applications: apps.map((a) => ({
        candidateId: prefixed(a.candidateId, withCandidatePrefix),
        jobId: prefixed(a.jobId, withJobPrefix),
      })),
    };
  });
  return { messages, total: messages.length, nextPageId: page.nextPageId };
}

// ---------------------------------------------------------------------------
// offers.list / offers.get / offers.search
// ---------------------------------------------------------------------------

export interface OfferSummary {
  id: string;
  status: string | null;
  createdOn: string | null;
  updatedOn: string | null;
  properties: Record<string, string>;
}

function offerOf(raw: Record<string, unknown>): OfferSummary {
  const properties: Record<string, string> = {};
  if (isRecord(raw.properties)) {
    for (const [k, v] of Object.entries(raw.properties)) {
      if (typeof v === "string") properties[k] = v;
    }
  }
  return {
    id: raw.id as string,
    status: str(raw.status),
    createdOn: str(raw.createdOn),
    updatedOn: str(raw.updatedOn),
    properties,
  };
}

export async function executeOffersList(
  input: SmartRecruitersG3AuthInput & { id: string; jobId: string },
): Promise<{ offers: OfferSummary[]; total: number }> {
  const id = candidateIdSegment(input.id, "id");
  const jobId = jobIdSegment(input.jobId, "jobId");
  const { data, items } = itemsOf(await client(input, "offers.list").getJSON(`/candidates/${id}/jobs/${jobId}/offers`));
  const offers = items.filter((o) => str(o.id) != null).map(offerOf);
  return { offers, total: totalOf(data, offers) };
}

export async function executeOffersGet(
  input: SmartRecruitersG3AuthInput & { id: string; jobId: string; offerId: string },
): Promise<{ offer: OfferSummary | null }> {
  const id = candidateIdSegment(input.id, "id");
  const jobId = jobIdSegment(input.jobId, "jobId");
  const offerId = seg(input.offerId, "offerId");
  const raw = await client(input, "offers.get").getJSON(`/candidates/${id}/jobs/${jobId}/offers/${offerId}`);
  if (!isRecord(raw) || str(raw.id) == null) return { offer: null };
  return { offer: offerOf(raw) };
}

export async function executeOffersSearch(
  input: SmartRecruitersG3AuthInput & {
    limit?: number;
    offset?: number;
    createdAfter?: string;
    createdBefore?: string;
    age?: string;
    status?: Array<(typeof OFFER_STATUSES)[number]>;
  },
): Promise<{ offers: OfferSummary[]; total: number }> {
  const qs = new URLSearchParams();
  if (input.limit != null) {
    if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100) throw new Error("limit must be 1-100");
    qs.set("limit", String(input.limit));
  }
  if (input.offset != null) {
    if (!Number.isInteger(input.offset) || input.offset < 0) throw new Error("offset must be a non-negative integer");
    qs.set("offset", String(input.offset));
  }
  const createdAfter = optionalString(input.createdAfter, "createdAfter");
  if (createdAfter) qs.set("createdAfter", createdAfter);
  const createdBefore = optionalString(input.createdBefore, "createdBefore");
  if (createdBefore) qs.set("createdBefore", createdBefore);
  const age = optionalString(input.age, "age");
  if (age) qs.set("age", age);
  if (input.status != null) {
    if (!Array.isArray(input.status) || input.status.length === 0) throw new Error("status must be a non-empty array");
    for (const s of input.status) {
      if (typeof s !== "string" || !OFFER_STATUS_SET.has(s)) {
        throw new Error(`status must be within ${OFFER_STATUSES.join(", ")}`);
      }
      qs.append("status", s);
    }
  }
  const query = qs.toString();
  const { data, items } = itemsOf(await client(input, "offers.search").getJSON(`/offers${query ? `?${query}` : ""}`));
  const offers = items.filter((o) => str(o.id) != null).map(offerOf);
  return { offers, total: totalOf(data, offers) };
}

// ---------------------------------------------------------------------------
// reviews.list / reviews.get
// ---------------------------------------------------------------------------

export interface ReviewSummary {
  id: string;
  candidateId: string | null;
  jobId: string | null;
  reviewerId: string | null;
  overallRating: number | null;
  comment: string | null;
  createdOn: string | null;
  updatedOn: string | null;
}

function reviewOf(raw: Record<string, unknown>): ReviewSummary {
  return {
    id: raw.id as string,
    candidateId: prefixed(raw.candidateId, withCandidatePrefix),
    jobId: prefixed(raw.jobId, withJobPrefix),
    reviewerId: prefixed(raw.reviewerId, withUserPrefix),
    overallRating: typeof raw.overallRating === "number" ? raw.overallRating : null,
    comment: typeof raw.comment === "string" ? raw.comment : null,
    createdOn: str(raw.createdOn),
    updatedOn: str(raw.updatedOn),
  };
}

export async function executeReviewsList(
  input: SmartRecruitersG3AuthInput & { candidateId: string; jobId: string },
): Promise<{ reviews: ReviewSummary[]; total: number }> {
  const qs = new URLSearchParams();
  qs.set("candidateId", candidateIdValue(input.candidateId, "candidateId"));
  qs.set("jobId", jobIdValue(input.jobId, "jobId"));
  const raw = await client(input, "reviews.list").getJSON(`${REVIEWS_BASE}/reviews?${qs.toString()}`);
  const rows = Array.isArray(raw) ? raw.filter(isRecord).filter((r) => str(r.id) != null) : [];
  const reviews = rows.map(reviewOf);
  return { reviews, total: reviews.length };
}

export async function executeReviewsGet(
  input: SmartRecruitersG3AuthInput & { reviewId: string },
): Promise<{ review: ReviewSummary | null }> {
  const reviewId = seg(input.reviewId, "reviewId");
  const raw = await client(input, "reviews.get").getJSON(`${REVIEWS_BASE}/reviews/${reviewId}`);
  if (!isRecord(raw) || str(raw.id) == null) return { review: null };
  return { review: reviewOf(raw) };
}

// ---------------------------------------------------------------------------
// scorecards.criteria.list — GET /reviews-api/v201910/jobs/{jobId}/criteria
// ---------------------------------------------------------------------------

export interface ScorecardCriterion {
  name: string | null;
  description: string | null;
  questions: string[];
  assignedAll: boolean | null;
  steps: Array<{ stage: string | null; step: string | null }>;
}

export async function executeScorecardsCriteriaList(
  input: SmartRecruitersG3AuthInput & { jobId: string },
): Promise<{ criteria: ScorecardCriterion[]; total: number }> {
  const jobId = jobIdSegment(input.jobId, "jobId");
  const raw = await client(input, "scorecards.criteria.list").getJSON(`${REVIEWS_BASE}/jobs/${jobId}/criteria`);
  const data = isRecord(raw) ? raw : {};
  const rows = Array.isArray(data.jobCriteria) ? data.jobCriteria.filter(isRecord) : [];
  const criteria = rows.map((c) => {
    const assigned = isRecord(c.assignedSteps) ? c.assignedSteps : {};
    const steps = Array.isArray(assigned.steps) ? assigned.steps.filter(isRecord) : [];
    return {
      name: str(c.name),
      description: typeof c.description === "string" ? c.description : null,
      questions: Array.isArray(c.questions) ? c.questions.filter((q): q is string => typeof q === "string") : [],
      assignedAll: typeof assigned.all === "boolean" ? assigned.all : null,
      steps: steps.map((s) => ({ stage: str(s.stage), step: str(s.step) })),
    };
  });
  return { criteria, total: criteria.length };
}

// ---------------------------------------------------------------------------
// users.get / users.me
// ---------------------------------------------------------------------------

export async function executeUsersGet(
  input: SmartRecruitersG3AuthInput & { id: string },
): Promise<{ user: NormalizedUser | null }> {
  const id = userIdSegment(input.id, "id");
  const raw = await client(input, "users.get").getJSON(`${USERS_BASE}/${id}`);
  if (!isRecord(raw) || str(raw.id) == null) return { user: null };
  return { user: normalizeUser(raw as Parameters<typeof normalizeUser>[0]) };
}

export async function executeUsersMe(input: SmartRecruitersG3AuthInput): Promise<{ user: NormalizedUser | null }> {
  const raw = await client(input, "users.me").getJSON(`${USERS_BASE}/me`);
  if (!isRecord(raw) || str(raw.id) == null) return { user: null };
  return { user: normalizeUser(raw as Parameters<typeof normalizeUser>[0]) };
}
