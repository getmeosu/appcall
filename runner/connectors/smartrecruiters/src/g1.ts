/**
 * SmartRecruiters G1 — candidate + application workflow (15 ops, v0.4.0).
 *
 * All calls go to the Customer API on https://api.smartrecruiters.com with the
 * X-SmartToken header (createApiClient). Official references:
 *
 *   candidates.create                  POST  /candidates                                   candidatesadd-1
 *   applications.create                POST  /jobs/{jobId}/candidates                      candidatesaddtojob-1
 *   candidates.update                  PATCH /candidates/{id}                              candidatesupdate-1
 *   applications.get                   GET   /candidates/{id}/jobs/{jobId}                 candidatesgetapplication-1
 *   applications.update_status         PUT   /candidates/{id}/jobs/{jobId}/status          candidatesstatusupdate-1
 *   applications.status_history        GET   /candidates/{id}/jobs/{jobId}/status/history  candidatesstatushistorygetforjob-1
 *   candidates.tags.get                GET   /candidates/{id}/tags                         candidatestagsget-1
 *   candidates.tags.add                POST  /candidates/{id}/tags                         candidatestagsadd-1
 *   candidates.tags.replace            PUT   /candidates/{id}/tags                         candidatestagsreplace-1
 *   candidates.attachments.list        GET   /candidates/{id}/attachments                  candidatesattachmentslist-1
 *   applications.attachments.list      GET   /candidates/{id}/jobs/{jobId}/attachments     candidatesattachmentslistforjob-1
 *   applications.properties.get        GET   /candidates/{id}/jobs/{jobId}/properties      candidatespropertiesgetforjob-1
 *   applications.properties.update     PUT   /candidates/{id}/jobs/{jobId}/properties      candidatespropertiesvaluesbatchupdateforjob-1
 *   applications.screening_answers.get GET   /candidates/{id}/jobs/{jobId}/screening-answers candidatesscreening-answersget-1
 *   job_applications.get               GET   /job-applications-api/v202112/job-applications/{jobApplicationId}  job-applicationsgetbyid-1
 *
 * Effect keys (manifest):
 * - creates (candidates.create, applications.create): omitted; return the 201
 *   CandidateDetails with the raw upstream id.
 * - candidates.update: Reconcile → candidates.get [id]. Input is limited to
 *   firstName/lastName/email/phoneNumber, which candidates.get returns verbatim
 *   (location is flattened and web is not normalized, so neither is editable here).
 * - applications.update_status: Reconcile → applications.get [id, jobId]
 *   (status, subStatus, startsOn, reasonOfRejection/reasonOfWithdrawal).
 * - candidates.tags.add / candidates.tags.replace: Reconcile → candidates.tags.get [id].
 * - applications.properties.update: omitted (batch upsert of property values).
 *
 * Reconcile observes reuse the write input, so every observe reads only the
 * keys it needs (id / jobId) and ignores the rest.
 */
import { assertSafePathSegment } from "../../_shared/jobboard";
import { createApiClient } from "./http";
import { normalizeCandidate, type NormalizedCandidate } from "./objects";

export interface SmartRecruitersG1AuthInput {
  apiKey: string;
  /** Injected by tests; production leaves it unset. */
  fetch?: typeof fetch;
}

export const CANDIDATE_STATUSES = [
  "LEAD",
  "NEW",
  "IN_REVIEW",
  "INTERVIEW",
  "OFFERED",
  "HIRED",
  "REJECTED",
  "WITHDRAWN",
  "TRANSFERRED",
] as const;
export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];
const STATUS_SET = new Set<string>(CANDIDATE_STATUSES);
const REASON_STATUSES = new Set<string>(["REJECTED", "WITHDRAWN"]);

export const PROPERTY_CONTEXTS = ["PROFILE", "OFFER_FORM", "HIRE_FORM", "OFFER_APPROVAL_FORM"] as const;
const CONTEXT_SET = new Set<string>(PROPERTY_CONTEXTS);

const JOB_APPLICATIONS_BASE = "/job-applications-api/v202112/job-applications";

function client(input: SmartRecruitersG1AuthInput, operation: string) {
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

function totalOf(raw: Record<string, unknown>, items: unknown[]): number {
  return typeof raw.totalFound === "number" ? raw.totalFound : items.length;
}

function tagList(value: unknown, field: string, minItems: number): string[] {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array of strings`);
  if (value.length < minItems) throw new Error(`${field} must contain at least ${minItems} tag`);
  if (value.length > 100) throw new Error(`${field} accepts at most 100 tags`);
  return value.map((tag, i) => {
    if (typeof tag !== "string" || tag.length === 0 || tag.length > 150) {
      throw new Error(`${field}[${i}] must be a 1-150 character string`);
    }
    return tag;
  });
}

function pick(source: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (source[key] !== undefined) out[key] = source[key];
  }
  return out;
}

// ---------------------------------------------------------------------------
// candidates.create / applications.create (CandidateInput body)
// ---------------------------------------------------------------------------

export interface CandidateLocationInput {
  country?: string;
  countryCode?: string;
  regionCode?: string;
  region?: string;
  city?: string;
  lat?: number;
  lng?: number;
}

export interface WebProfileInput {
  skype?: string;
  linkedin?: string;
  facebook?: string;
  twitter?: string;
  website?: string;
}

export interface EducationInput {
  institution?: string;
  degree?: string;
  major?: string;
  current?: boolean;
  location?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
}

export interface ExperienceInput {
  title?: string;
  company?: string;
  current?: boolean;
  startDate?: string;
  endDate?: string;
  location?: string;
  description?: string;
}

export interface CandidateSourceInput {
  sourceTypeId: string;
  sourceSubTypeId?: string;
  sourceId: string;
}

export interface CandidateCreateFields {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string;
  location?: CandidateLocationInput;
  web?: WebProfileInput;
  tags?: string[];
  education?: EducationInput[];
  experience?: ExperienceInput[];
  sourceDetails?: CandidateSourceInput;
  internal?: boolean;
}

const LOCATION_KEYS = ["country", "countryCode", "regionCode", "region", "city", "lat", "lng"] as const;
const WEB_KEYS = ["skype", "linkedin", "facebook", "twitter", "website"] as const;
const EDUCATION_KEYS = ["institution", "degree", "major", "current", "location", "startDate", "endDate", "description"] as const;
const EXPERIENCE_KEYS = ["title", "company", "current", "startDate", "endDate", "location", "description"] as const;

/** Build the documented CandidateInput body from connector input (camelCase is the wire format). */
export function buildCandidateInput(input: CandidateCreateFields): Record<string, unknown> {
  const body: Record<string, unknown> = {
    firstName: requiredString(input.firstName, "firstName"),
    lastName: requiredString(input.lastName, "lastName"),
    email: requiredString(input.email, "email"),
  };
  const phone = optionalString(input.phoneNumber, "phoneNumber");
  if (phone) body.phoneNumber = phone;
  if (isRecord(input.location)) body.location = pick(input.location as Record<string, unknown>, LOCATION_KEYS);
  if (isRecord(input.web)) body.web = pick(input.web as Record<string, unknown>, WEB_KEYS);
  if (input.tags != null) body.tags = tagList(input.tags, "tags", 0);
  if (Array.isArray(input.education)) {
    body.education = input.education.filter(isRecord).map((e) => pick(e, EDUCATION_KEYS));
  }
  if (Array.isArray(input.experience)) {
    body.experience = input.experience.filter(isRecord).map((e) => pick(e, EXPERIENCE_KEYS));
  }
  if (input.sourceDetails != null) {
    const src = input.sourceDetails;
    if (!isRecord(src)) throw new Error("sourceDetails must be an object");
    const sourceDetails: Record<string, unknown> = {
      sourceTypeId: requiredString(src.sourceTypeId, "sourceDetails.sourceTypeId"),
      sourceId: requiredString(src.sourceId, "sourceDetails.sourceId"),
    };
    const sub = optionalString(src.sourceSubTypeId, "sourceDetails.sourceSubTypeId");
    if (sub) sourceDetails.sourceSubTypeId = sub;
    body.sourceDetails = sourceDetails;
  }
  if (typeof input.internal === "boolean") body.internal = input.internal;
  return body;
}

export interface CandidateCreatedOutput {
  /** Raw SmartRecruiters candidate id (use as `id` for every other G1 op). */
  id: string;
  candidate: NormalizedCandidate;
}

function createdCandidate(raw: unknown): CandidateCreatedOutput {
  if (!isRecord(raw) || str(raw.id) == null) {
    throw {
      ok: false,
      code: "CONNECTOR_UPSTREAM_ERROR",
      message: "SmartRecruiters create response is missing the candidate id.",
    };
  }
  return { id: raw.id as string, candidate: normalizeCandidate(raw as Parameters<typeof normalizeCandidate>[0]) };
}

export async function executeCandidatesCreate(
  input: SmartRecruitersG1AuthInput & CandidateCreateFields,
): Promise<CandidateCreatedOutput> {
  const body = buildCandidateInput(input);
  const raw = await client(input, "candidates.create").request("POST", "/candidates", body);
  return createdCandidate(raw);
}

export async function executeApplicationsCreate(
  input: SmartRecruitersG1AuthInput & CandidateCreateFields & { jobId: string },
): Promise<CandidateCreatedOutput & { jobId: string }> {
  const jobId = seg(input.jobId, "jobId");
  const body = buildCandidateInput(input);
  const raw = await client(input, "applications.create").request("POST", `/jobs/${jobId}/candidates`, body);
  return { ...createdCandidate(raw), jobId };
}

// ---------------------------------------------------------------------------
// candidates.update — PATCH /candidates/{id} (Reconcile → candidates.get)
// ---------------------------------------------------------------------------

export const CANDIDATE_UPDATE_FIELDS = ["firstName", "lastName", "email", "phoneNumber"] as const;

export async function executeCandidatesUpdate(
  input: SmartRecruitersG1AuthInput & {
    id: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    phoneNumber?: string;
  },
): Promise<{ candidate: NormalizedCandidate | null }> {
  const id = seg(input.id, "id");
  const body: Record<string, unknown> = {};
  for (const field of CANDIDATE_UPDATE_FIELDS) {
    const value = optionalString((input as Record<string, unknown>)[field], field);
    if (value != null) body[field] = value;
  }
  if (Object.keys(body).length === 0) {
    throw new Error("candidates.update needs at least one of firstName, lastName, email, phoneNumber");
  }
  const raw = await client(input, "candidates.update").request("PATCH", `/candidates/${id}`, body);
  return {
    candidate: isRecord(raw) && str(raw.id) ? normalizeCandidate(raw as Parameters<typeof normalizeCandidate>[0]) : null,
  };
}

// ---------------------------------------------------------------------------
// applications.get — GET /candidates/{id}/jobs/{jobId}
// ---------------------------------------------------------------------------

export interface NormalizedReason {
  id: string;
  label: string | null;
}

export interface NormalizedApplication {
  candidateId: string;
  jobId: string;
  /** Application UUID (input for interviews.list and job_applications.get). */
  applicationId: string | null;
  status: string | null;
  subStatus: string | null;
  startsOn: string | null;
  source: string | null;
  reasonOfRejection: NormalizedReason | null;
  reasonOfWithdrawal: NormalizedReason | null;
  url: string | null;
}

function reason(value: unknown): NormalizedReason | null {
  if (!isRecord(value) || str(value.id) == null) return null;
  return { id: value.id as string, label: str(value.label) };
}

export function normalizeApplication(raw: unknown, candidateId: string, jobId: string): NormalizedApplication | null {
  if (!isRecord(raw)) return null;
  return {
    candidateId,
    jobId,
    applicationId: str(raw.applicationId),
    status: str(raw.status),
    subStatus: str(raw.subStatus),
    startsOn: str(raw.startsOn),
    source: str(raw.source),
    reasonOfRejection: reason(raw.reasonOfRejection),
    reasonOfWithdrawal: reason(raw.reasonOfWithdrawal),
    url: str(raw.url),
  };
}

export async function executeApplicationsGet(
  input: SmartRecruitersG1AuthInput & { id: string; jobId: string },
): Promise<{ application: NormalizedApplication | null }> {
  const id = seg(input.id, "id");
  const jobId = seg(input.jobId, "jobId");
  const raw = await client(input, "applications.get").getJSON(`/candidates/${id}/jobs/${jobId}`);
  return { application: normalizeApplication(raw, id, jobId) };
}

// ---------------------------------------------------------------------------
// applications.update_status — PUT /candidates/{id}/jobs/{jobId}/status (204)
// Reconcile → applications.get [id, jobId]
// ---------------------------------------------------------------------------

export async function executeApplicationsUpdateStatus(
  input: SmartRecruitersG1AuthInput & {
    id: string;
    jobId: string;
    status: CandidateStatus;
    subStatus?: string;
    startsOn?: string;
    reason?: string;
  },
): Promise<{ ok: true }> {
  const id = seg(input.id, "id");
  const jobId = seg(input.jobId, "jobId");
  if (typeof input.status !== "string" || !STATUS_SET.has(input.status)) {
    throw new Error(`status must be one of ${CANDIDATE_STATUSES.join(", ")}`);
  }
  const body: Record<string, unknown> = { status: input.status };
  const subStatus = optionalString(input.subStatus, "subStatus");
  if (subStatus) body.subStatus = subStatus;
  const startsOn = optionalString(input.startsOn, "startsOn");
  if (startsOn) body.startsOn = startsOn;
  const reasonId = optionalString(input.reason, "reason");
  if (reasonId) {
    if (!REASON_STATUSES.has(input.status)) {
      throw new Error("reason is only supported for status REJECTED or WITHDRAWN");
    }
    body.reason = reasonId;
  }
  await client(input, "applications.update_status").request("PUT", `/candidates/${id}/jobs/${jobId}/status`, body);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// applications.status_history — GET /candidates/{id}/jobs/{jobId}/status/history
// ---------------------------------------------------------------------------

export interface StatusHistoryEntry {
  changedOn: string | null;
  status: string | null;
  subStatus: string | null;
}

export async function executeApplicationsStatusHistory(
  input: SmartRecruitersG1AuthInput & { id: string; jobId: string },
): Promise<{ history: StatusHistoryEntry[]; total: number }> {
  const id = seg(input.id, "id");
  const jobId = seg(input.jobId, "jobId");
  const raw = await client(input, "applications.status_history").getJSON(
    `/candidates/${id}/jobs/${jobId}/status/history`,
  );
  const data = isRecord(raw) ? raw : {};
  const items = Array.isArray(data.content) ? data.content.filter(isRecord) : [];
  return {
    history: items.map((e) => ({
      changedOn: str(e.changedOn),
      status: str(e.status),
      subStatus: str(e.subStatus),
    })),
    total: totalOf(data, items),
  };
}

// ---------------------------------------------------------------------------
// candidates.tags.get / add / replace
// ---------------------------------------------------------------------------

function parseTags(raw: unknown): { tags: string[] } {
  const tags = isRecord(raw) && Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === "string") : [];
  return { tags };
}

export async function executeCandidatesTagsGet(
  input: SmartRecruitersG1AuthInput & { id: string },
): Promise<{ tags: string[] }> {
  const id = seg(input.id, "id");
  return parseTags(await client(input, "candidates.tags.get").getJSON(`/candidates/${id}/tags`));
}

export async function executeCandidatesTagsAdd(
  input: SmartRecruitersG1AuthInput & { id: string; tags: string[] },
): Promise<{ tags: string[] }> {
  const id = seg(input.id, "id");
  const tags = tagList(input.tags, "tags", 1);
  return parseTags(await client(input, "candidates.tags.add").request("POST", `/candidates/${id}/tags`, { tags }));
}

export async function executeCandidatesTagsReplace(
  input: SmartRecruitersG1AuthInput & { id: string; tags: string[] },
): Promise<{ tags: string[] }> {
  const id = seg(input.id, "id");
  const tags = tagList(input.tags, "tags", 0);
  return parseTags(await client(input, "candidates.tags.replace").request("PUT", `/candidates/${id}/tags`, { tags }));
}

// ---------------------------------------------------------------------------
// candidates.attachments.list / applications.attachments.list
// ---------------------------------------------------------------------------

export interface NormalizedAttachment {
  id: string;
  name: string | null;
  type: string | null;
  contentType: string | null;
  /** Authenticated download URL (actions.download.url); binary download is not part of G1. */
  downloadUrl: string | null;
}

function parseAttachments(raw: unknown): { attachments: NormalizedAttachment[]; total: number } {
  const data = isRecord(raw) ? raw : {};
  const items = Array.isArray(data.content) ? data.content.filter(isRecord) : [];
  const attachments = items
    .filter((a) => str(a.id) != null)
    .map((a) => {
      const actions = isRecord(a.actions) ? a.actions : {};
      const download = isRecord(actions.download) ? actions.download : {};
      return {
        id: a.id as string,
        name: str(a.name),
        type: str(a.type),
        contentType: str(a.contentType),
        downloadUrl: str(download.url),
      };
    });
  return { attachments, total: totalOf(data, items) };
}

export async function executeCandidatesAttachmentsList(
  input: SmartRecruitersG1AuthInput & { id: string },
): Promise<{ attachments: NormalizedAttachment[]; total: number }> {
  const id = seg(input.id, "id");
  return parseAttachments(await client(input, "candidates.attachments.list").getJSON(`/candidates/${id}/attachments`));
}

export async function executeApplicationsAttachmentsList(
  input: SmartRecruitersG1AuthInput & { id: string; jobId: string },
): Promise<{ attachments: NormalizedAttachment[]; total: number }> {
  const id = seg(input.id, "id");
  const jobId = seg(input.jobId, "jobId");
  return parseAttachments(
    await client(input, "applications.attachments.list").getJSON(`/candidates/${id}/jobs/${jobId}/attachments`),
  );
}

// ---------------------------------------------------------------------------
// applications.properties.get / applications.properties.update
// ---------------------------------------------------------------------------

export interface NormalizedProperty {
  id: string;
  key: string | null;
  label: string | null;
  type: string | null;
  value: unknown;
  selectedValueLabels: Array<{ id: string; label: string | null }>;
}

export async function executeApplicationsPropertiesGet(
  input: SmartRecruitersG1AuthInput & {
    id: string;
    jobId: string;
    context?: (typeof PROPERTY_CONTEXTS)[number];
    includeMultiSelect?: boolean;
  },
): Promise<{ properties: NormalizedProperty[] }> {
  const id = seg(input.id, "id");
  const jobId = seg(input.jobId, "jobId");
  const qs = new URLSearchParams();
  if (input.context != null) {
    if (!CONTEXT_SET.has(input.context)) throw new Error(`context must be one of ${PROPERTY_CONTEXTS.join(", ")}`);
    qs.set("context", input.context);
  }
  if (typeof input.includeMultiSelect === "boolean") qs.set("includeMultiSelect", String(input.includeMultiSelect));
  const query = qs.toString();
  const raw = await client(input, "applications.properties.get").getJSON(
    `/candidates/${id}/jobs/${jobId}/properties${query ? `?${query}` : ""}`,
  );
  const data = isRecord(raw) ? raw : {};
  const items = Array.isArray(data.content) ? data.content.filter(isRecord) : [];
  return {
    properties: items
      .filter((p) => str(p.id) != null)
      .map((p) => ({
        id: p.id as string,
        key: str(p.key),
        label: str(p.label),
        type: str(p.type),
        value: p.value ?? null,
        selectedValueLabels: Array.isArray(p.selectedValueLabels)
          ? p.selectedValueLabels.filter(isRecord).filter((l) => str(l.id) != null).map((l) => ({ id: l.id as string, label: str(l.label) }))
          : [],
      })),
  };
}

export interface PropertyValueInput {
  id: string;
  /** TEXT, DATE (ISO date-time), COUNTRY (ISO-2 lower), REGION, USER (user id), SINGLE_SELECT (value id). */
  textValue?: string;
  /** NUMBER or PERCENT. */
  numberValue?: number;
  /** BOOLEAN. */
  booleanValue?: boolean;
  /** CURRENCY. */
  currencyValue?: { code: string; value: number };
  /** MULTI_SELECT option ids (empty array clears). */
  optionIds?: string[];
}

const VALUE_FIELDS = ["textValue", "numberValue", "booleanValue", "currencyValue", "optionIds"] as const;

/** Map typed connector entries onto the documented `[{ id, value }]` body; no value field → reset. */
export function buildPropertyValues(entries: unknown): Array<{ id: string; value?: unknown }> {
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > 100) {
    throw new Error("properties must be an array of 1-100 entries");
  }
  return entries.map((entry, i) => {
    if (!isRecord(entry)) throw new Error(`properties[${i}] must be an object`);
    const id = requiredString(entry.id, `properties[${i}].id`);
    const present = VALUE_FIELDS.filter((f) => entry[f] !== undefined);
    if (present.length > 1) throw new Error(`properties[${i}] takes at most one value field`);
    if (present.length === 0) return { id };
    const field = present[0]!;
    const v = entry[field];
    switch (field) {
      case "textValue":
        if (typeof v !== "string") throw new Error(`properties[${i}].textValue must be a string`);
        return { id, value: v };
      case "numberValue":
        if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`properties[${i}].numberValue must be a number`);
        return { id, value: v };
      case "booleanValue":
        if (typeof v !== "boolean") throw new Error(`properties[${i}].booleanValue must be a boolean`);
        return { id, value: v };
      case "currencyValue": {
        if (!isRecord(v) || typeof v.code !== "string" || typeof v.value !== "number") {
          throw new Error(`properties[${i}].currencyValue needs code (string) and value (number)`);
        }
        return { id, value: { code: v.code, value: v.value } };
      }
      case "optionIds": {
        if (!Array.isArray(v) || v.length > 200 || !v.every((x) => typeof x === "string" && x.length > 0)) {
          throw new Error(`properties[${i}].optionIds must be an array of up to 200 option ids`);
        }
        if (new Set(v).size !== v.length) throw new Error(`properties[${i}].optionIds must not repeat ids`);
        return { id, value: v };
      }
    }
    return { id };
  });
}

export async function executeApplicationsPropertiesUpdate(
  input: SmartRecruitersG1AuthInput & { id: string; jobId: string; properties: PropertyValueInput[] },
): Promise<{ ok: true; updated: number }> {
  const id = seg(input.id, "id");
  const jobId = seg(input.jobId, "jobId");
  const body = buildPropertyValues(input.properties);
  await client(input, "applications.properties.update").request("PUT", `/candidates/${id}/jobs/${jobId}/properties`, body);
  return { ok: true, updated: body.length };
}

// ---------------------------------------------------------------------------
// applications.screening_answers.get
// ---------------------------------------------------------------------------

export interface ScreeningAnswer {
  id: string;
  type: string | null;
  category: string | null;
  name: string | null;
  label: string | null;
  records: Array<{ fields: Array<{ id: string; label: string | null; values: Array<{ id: string; label: string | null }> }> }>;
}

export async function executeApplicationsScreeningAnswersGet(
  input: SmartRecruitersG1AuthInput & { id: string; jobId: string },
): Promise<{ answers: ScreeningAnswer[]; total: number }> {
  const id = seg(input.id, "id");
  const jobId = seg(input.jobId, "jobId");
  const raw = await client(input, "applications.screening_answers.get").getJSON(
    `/candidates/${id}/jobs/${jobId}/screening-answers`,
  );
  const data = isRecord(raw) ? raw : {};
  const items = Array.isArray(data.content) ? data.content.filter(isRecord) : [];
  const answers = items
    .filter((a) => str(a.id) != null)
    .map((a) => ({
      id: a.id as string,
      type: str(a.type),
      category: str(a.category),
      name: str(a.name),
      label: str(a.label),
      records: (Array.isArray(a.records) ? a.records.filter(isRecord) : []).map((r) => ({
        fields: (Array.isArray(r.fields) ? r.fields.filter(isRecord) : [])
          .filter((f) => str(f.id) != null)
          .map((f) => ({
            id: f.id as string,
            label: str(f.label),
            values: (Array.isArray(f.values) ? f.values.filter(isRecord) : [])
              .filter((v) => typeof v.id === "string")
              .map((v) => ({ id: v.id as string, label: str(v.label) })),
          })),
      })),
    }));
  return { answers, total: totalOf(data, items) };
}

// ---------------------------------------------------------------------------
// job_applications.get — GET /job-applications-api/v202112/job-applications/{id}
// ---------------------------------------------------------------------------

export interface NormalizedJobApplication {
  id: string;
  status: string | null;
  subStatus: string | null;
  /** Candidate profile id (same as the Candidates API candidate id). */
  profileId: string | null;
  jobId: string | null;
  sourceIdentifier: string | null;
  createdAt: string | null;
}

export async function executeJobApplicationsGet(
  input: SmartRecruitersG1AuthInput & { jobApplicationId: string },
): Promise<{ jobApplication: NormalizedJobApplication | null }> {
  const jobApplicationId = seg(input.jobApplicationId, "jobApplicationId");
  const raw = await client(input, "job_applications.get").getJSON(`${JOB_APPLICATIONS_BASE}/${jobApplicationId}`);
  if (!isRecord(raw)) return { jobApplication: null };
  return {
    jobApplication: {
      id: jobApplicationId,
      status: str(raw.status),
      subStatus: str(raw.subStatus),
      profileId: str(raw.profileId),
      jobId: str(raw.jobId),
      sourceIdentifier: str(raw.sourceIdentifier),
      createdAt: str(raw.createDate),
    },
  };
}
