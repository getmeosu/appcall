/**
 * Greenhouse G1 — 15 Harvest v3 ops (agent-tool reads + pipeline writes).
 * Auth/client: GH-0 Bearer via createAuthClient. Paths under /v3.
 */
import { createAuthClient } from "./http";
import { assertSafePathSegment } from "../../_shared/jobboard";

export interface GreenhouseAuthInput {
  clientId: string;
  clientSecret: string;
  userId?: string;
  fetch?: typeof fetch;
}

function authClientOpts(input: GreenhouseAuthInput, operation: string) {
  return {
    clientId: input.clientId,
    clientSecret: input.clientSecret,
    userId: input.userId,
    fetch: input.fetch,
    operation,
  };
}

function buildQuery(params: Record<string, string | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== "") qs.set(key, value);
  }
  const encoded = qs.toString();
  return encoded.length > 0 ? `?${encoded}` : "";
}

function asId(value: string | number | undefined, field: string): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.length > 0 && /^-?\d+$/.test(value)) return Number(value);
  throw new Error(`${field} is required`);
}

function optionalId(value: string | number | undefined): number | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && /^-?\d+$/.test(value)) return Number(value);
  throw new Error("id must be an integer");
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function optionalBool(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function joinIds(value: unknown): string | undefined {
  if (value == null || value === "") return undefined;
  if (Array.isArray(value)) {
    const parts = value.map((v) => String(v)).filter((s) => s.length > 0);
    return parts.length > 0 ? parts.join(",") : undefined;
  }
  return String(value);
}

function listMeta(body: unknown, nextCursor: string | null) {
  return { items: Array.isArray(body) ? body : [], nextCursor };
}

/** Harvest v3 custom field write entry: exactly one of name_key / custom_field_id, plus value. */
export type GreenhouseCustomFieldInput = Record<string, unknown>;

/**
 * Validate the Harvest v3 `custom_fields` write shape (array of
 * `{ name_key | custom_field_id, value }`) and return it for the wire.
 * Returns undefined when omitted; throws before network on the old object-map shape.
 */
export function customFieldsWire(value: unknown): GreenhouseCustomFieldInput[] | undefined {
  if (value == null) return undefined;
  if (!Array.isArray(value)) {
    throw new Error("customFields must be an array of { name_key | custom_field_id, value }");
  }
  return value.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`customFields[${index}] must be an object`);
    }
    const record = entry as Record<string, unknown>;
    const hasNameKey = typeof record.name_key === "string" && record.name_key.length > 0;
    const hasFieldId = typeof record.custom_field_id === "number" && Number.isInteger(record.custom_field_id);
    if (hasNameKey === hasFieldId) {
      throw new Error(
        `customFields[${index}] needs exactly one of name_key (string) or custom_field_id (integer)`,
      );
    }
    if (!("value" in record)) {
      throw new Error(`customFields[${index}].value is required (use null to clear)`);
    }
    return record;
  });
}

// ---------------------------------------------------------------------------
// applications.hire / applications.update
// ---------------------------------------------------------------------------

export interface HireApplicationInput extends GreenhouseAuthInput {
  id: string;
  startDate?: string;
  openingId?: string | number;
  closeReasonId?: string | number;
}

export async function executeApplicationsHire(input: HireApplicationInput) {
  const id = assertSafePathSegment(input.id, "id");
  const body: Record<string, unknown> = {};
  if (optionalString(input.startDate)) body.start_date = input.startDate;
  const openingId = optionalId(input.openingId);
  const closeReasonId = optionalId(input.closeReasonId);
  if (openingId != null) body.opening_id = openingId;
  if (closeReasonId != null) body.close_reason_id = closeReasonId;
  const client = createAuthClient(authClientOpts(input, "applications.hire"));
  await client.postJSON(`/applications/${id}/hire`, body);
  return { application: null };
}

export interface UpdateApplicationInput extends GreenhouseAuthInput {
  id: string;
  sourceId?: string | number;
  referrerId?: string | number;
  recruiterId?: string | number;
  coordinatorId?: string | number;
  prospectPoolId?: string | number;
  prospectStageId?: string | number;
  customFields?: GreenhouseCustomFieldInput[];
}

export async function executeApplicationsUpdate(input: UpdateApplicationInput) {
  const id = assertSafePathSegment(input.id, "id");
  const body: Record<string, unknown> = {};
  const map: Array<[keyof UpdateApplicationInput, string]> = [
    ["sourceId", "source_id"],
    ["referrerId", "referrer_id"],
    ["recruiterId", "recruiter_id"],
    ["coordinatorId", "coordinator_id"],
    ["prospectPoolId", "prospect_pool_id"],
    ["prospectStageId", "prospect_stage_id"],
  ];
  for (const [camel, snake] of map) {
    const v = optionalId(input[camel] as string | number | undefined);
    if (v != null) body[snake] = v;
  }
  const customFields = customFieldsWire(input.customFields);
  if (customFields) body.custom_fields = customFields;
  const client = createAuthClient(authClientOpts(input, "applications.update"));
  await client.patchJSON(`/applications/${id}`, body);
  return { application: null };
}

// ---------------------------------------------------------------------------
// Dictionary / list agent tools
// ---------------------------------------------------------------------------

export async function executeApplicationStagesList(
  input: GreenhouseAuthInput & {
    applicationIds?: string | number | Array<string | number>;
    jobInterviewStageIds?: string | number | Array<string | number>;
    current?: boolean;
    ids?: string | number | Array<string | number>;
    perPage?: number;
    cursor?: string;
  },
) {
  const client = createAuthClient(authClientOpts(input, "application_stages.list"));
  const path =
    "/application_stages" +
    buildQuery({
      application_ids: joinIds(input.applicationIds),
      job_interview_stage_ids: joinIds(input.jobInterviewStageIds),
      current: input.current == null ? undefined : String(input.current),
      ids: joinIds(input.ids),
      per_page: input.perPage != null ? String(input.perPage) : undefined,
      cursor: input.cursor,
    });
  const { body, nextCursor } = await client.getJSONWithMeta(path);
  const listed = listMeta(body, nextCursor);
  return { applicationStages: listed.items, nextCursor: listed.nextCursor };
}

export async function executeRejectionReasonsList(
  input: GreenhouseAuthInput & {
    includeDefaults?: boolean;
    ids?: string | number | Array<string | number>;
    perPage?: number;
    cursor?: string;
  },
) {
  const client = createAuthClient(authClientOpts(input, "rejection_reasons.list"));
  const path =
    "/rejection_reasons" +
    buildQuery({
      include_defaults: input.includeDefaults == null ? undefined : String(input.includeDefaults),
      ids: joinIds(input.ids),
      per_page: input.perPage != null ? String(input.perPage) : undefined,
      cursor: input.cursor,
    });
  const { body, nextCursor } = await client.getJSONWithMeta(path);
  const listed = listMeta(body, nextCursor);
  return { rejectionReasons: listed.items, nextCursor: listed.nextCursor };
}

export async function executeRejectionDetailsList(
  input: GreenhouseAuthInput & {
    applicationIds?: string | number | Array<string | number>;
    rejectionReasonIds?: string | number | Array<string | number>;
    ids?: string | number | Array<string | number>;
    perPage?: number;
    cursor?: string;
  },
) {
  const client = createAuthClient(authClientOpts(input, "rejection_details.list"));
  const path =
    "/rejection_details" +
    buildQuery({
      application_ids: joinIds(input.applicationIds),
      rejection_reason_ids: joinIds(input.rejectionReasonIds),
      ids: joinIds(input.ids),
      per_page: input.perPage != null ? String(input.perPage) : undefined,
      cursor: input.cursor,
    });
  const { body, nextCursor } = await client.getJSONWithMeta(path);
  const listed = listMeta(body, nextCursor);
  return { rejectionDetails: listed.items, nextCursor: listed.nextCursor };
}

export async function executeCandidateTagsList(
  input: GreenhouseAuthInput & {
    ids?: string | number | Array<string | number>;
    perPage?: number;
    cursor?: string;
  },
) {
  const client = createAuthClient(authClientOpts(input, "candidate_tags.list"));
  const path =
    "/candidate_tags" +
    buildQuery({
      ids: joinIds(input.ids),
      per_page: input.perPage != null ? String(input.perPage) : undefined,
      cursor: input.cursor,
    });
  const { body, nextCursor } = await client.getJSONWithMeta(path);
  const listed = listMeta(body, nextCursor);
  return { candidateTags: listed.items, nextCursor: listed.nextCursor };
}

export async function executeJobsListInternal(
  input: GreenhouseAuthInput & {
    status?: string;
    departmentId?: string | number;
    officeId?: string | number;
    requisitionId?: string;
    openedAt?: string;
    closedAt?: string;
    confidential?: boolean;
    ids?: string | number | Array<string | number>;
    perPage?: number;
    cursor?: string;
  },
) {
  const client = createAuthClient(authClientOpts(input, "jobs.list_internal"));
  const path =
    "/jobs" +
    buildQuery({
      status: optionalString(input.status),
      department_id: optionalId(input.departmentId)?.toString(),
      office_id: optionalId(input.officeId)?.toString(),
      requisition_id: optionalString(input.requisitionId),
      opened_at: optionalString(input.openedAt),
      closed_at: optionalString(input.closedAt),
      confidential: input.confidential == null ? undefined : String(input.confidential),
      ids: joinIds(input.ids),
      per_page: input.perPage != null ? String(input.perPage) : undefined,
      cursor: input.cursor,
    });
  const { body, nextCursor } = await client.getJSONWithMeta(path);
  const listed = listMeta(body, nextCursor);
  return { jobs: listed.items, nextCursor: listed.nextCursor };
}

// ---------------------------------------------------------------------------
// notes
// ---------------------------------------------------------------------------

const CREATE_VISIBILITY = new Set(["admin_only", "private", "public"]);
const LIST_VISIBILITY = new Set(["admin_only_visible", "privately_visible", "publicly_visible"]);
const NOTE_TYPES = new Set(["NOTE", "EMAIL", "ACTIVITY"]);
const RESPONSE_STATUSES = new Set(["accepted", "declined", "tentative", "needs_action"]);

export async function executeNotesCreate(
  input: GreenhouseAuthInput & {
    candidateId: string | number;
    body: string;
    visibility: string;
    noteType: string;
    applicationId?: string | number;
    subject?: string;
    userId?: string | number;
    emailFrom?: string | string[];
    emailTo?: string | string[];
    emailCc?: string | string[];
  },
) {
  if (typeof input.body !== "string" || input.body.length === 0) throw new Error("body is required");
  if (!CREATE_VISIBILITY.has(String(input.visibility))) {
    throw new Error("visibility must be admin_only, private, or public");
  }
  if (!NOTE_TYPES.has(String(input.noteType))) {
    throw new Error("noteType must be NOTE, EMAIL, or ACTIVITY");
  }
  const candidateId = asId(input.candidateId, "candidateId");
  const wire: Record<string, unknown> = {
    candidate_id: candidateId,
    body: input.body,
    visibility: input.visibility,
    note_type: input.noteType,
  };
  const applicationId = optionalId(input.applicationId);
  if (applicationId != null) wire.application_id = applicationId;
  const userId = optionalId(input.userId);
  if (userId != null) wire.user_id = userId;

  if (input.noteType === "EMAIL") {
    if (!optionalString(input.subject)) throw new Error("subject is required when noteType is EMAIL");
    wire.subject = input.subject;
    const from = Array.isArray(input.emailFrom) ? input.emailFrom : input.emailFrom != null ? [input.emailFrom] : null;
    const to = Array.isArray(input.emailTo) ? input.emailTo : input.emailTo != null ? [input.emailTo] : null;
    const cc = Array.isArray(input.emailCc) ? input.emailCc : input.emailCc != null ? [input.emailCc] : null;
    if (!from || from.length === 0) throw new Error("emailFrom is required when noteType is EMAIL");
    if (!to || to.length === 0) throw new Error("emailTo is required when noteType is EMAIL");
    if (!cc) throw new Error("emailCc is required when noteType is EMAIL");
    wire.email_from = from;
    wire.email_to = to;
    wire.email_cc = cc;
  } else {
    if (input.emailFrom != null || input.emailTo != null || input.emailCc != null) {
      throw new Error("emailFrom/emailTo/emailCc are only allowed when noteType is EMAIL");
    }
    if (optionalString(input.subject)) wire.subject = input.subject;
  }

  const client = createAuthClient(authClientOpts(input, "notes.create"));
  return (await client.postJSON("/notes", wire)) as Record<string, unknown>;
}

export async function executeNotesList(
  input: GreenhouseAuthInput & {
    candidateIds?: string | number | Array<string | number>;
    applicationIds?: string | number | Array<string | number>;
    userIds?: string | number | Array<string | number>;
    type?: string;
    visibility?: string;
    ids?: string | number | Array<string | number>;
    perPage?: number;
    cursor?: string;
  },
) {
  if (input.visibility != null && !LIST_VISIBILITY.has(String(input.visibility))) {
    throw new Error(
      "visibility filter must be admin_only_visible, privately_visible, or publicly_visible",
    );
  }
  const client = createAuthClient(authClientOpts(input, "notes.list"));
  const path =
    "/notes" +
    buildQuery({
      candidate_ids: joinIds(input.candidateIds),
      application_ids: joinIds(input.applicationIds),
      user_ids: joinIds(input.userIds),
      type: optionalString(input.type),
      visibility: optionalString(input.visibility),
      ids: joinIds(input.ids),
      per_page: input.perPage != null ? String(input.perPage) : undefined,
      cursor: input.cursor,
    });
  const { body, nextCursor } = await client.getJSONWithMeta(path);
  const listed = listMeta(body, nextCursor);
  return { notes: listed.items, nextCursor: listed.nextCursor };
}

// ---------------------------------------------------------------------------
// tags
// ---------------------------------------------------------------------------

export async function executeCandidatesApplyTag(
  input: GreenhouseAuthInput & {
    /** Candidate id (wire candidate_id). Effect keys omitted — no exact observe. */
    id: string | number;
    candidateTagId: string | number;
  },
) {
  const candidateId = asId(input.id, "id");
  const candidateTagId = asId(input.candidateTagId, "candidateTagId");
  const client = createAuthClient(authClientOpts(input, "candidates.apply_tag"));
  const raw = (await client.postJSON("/applied_candidate_tags", {
    candidate_id: candidateId,
    candidate_tag_id: candidateTagId,
  })) as Record<string, unknown>;
  return raw;
}

export async function executeCandidatesRemoveTag(
  input: GreenhouseAuthInput & {
    /** Applied-candidate-tag row id. */
    id: string;
  },
) {
  const id = assertSafePathSegment(input.id, "id");
  const client = createAuthClient(authClientOpts(input, "candidates.remove_tag"));
  await client.deleteJSON(`/applied_candidate_tags/${id}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// interviews
// ---------------------------------------------------------------------------

function mapInterviewers(interviewers: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(interviewers) || interviewers.length === 0) {
    throw new Error("interviewers is required");
  }
  return interviewers.map((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new Error(`interviewers[${index}] must be an object`);
    }
    const rec = row as Record<string, unknown>;
    const responseStatus = rec.responseStatus ?? rec.response_status;
    if (!RESPONSE_STATUSES.has(String(responseStatus))) {
      throw new Error(
        `interviewers[${index}].responseStatus must be accepted|declined|tentative|needs_action`,
      );
    }
    const out: Record<string, unknown> = { response_status: responseStatus };
    const userId = optionalId(rec.userId as string | number | undefined ?? rec.user_id as string | number | undefined);
    const email = optionalString(rec.email);
    const employeeId = optionalString(rec.employeeId ?? rec.employee_id);
    const ids = [userId != null, !!email, !!employeeId].filter(Boolean).length;
    if (ids !== 1) {
      throw new Error(
        `interviewers[${index}] must include exactly one of userId, email, or employeeId`,
      );
    }
    if (userId != null) out.user_id = userId;
    if (email) out.email = email;
    if (employeeId) out.employee_id = employeeId;
    return out;
  });
}

export async function executeInterviewsCreate(
  input: GreenhouseAuthInput & {
    applicationId: string | number;
    jobInterviewId: string | number;
    interviewers: unknown;
    startsAt: string;
    endsAt: string;
    externalEventId: string;
    location?: string;
    videoConferencingUrl?: string;
  },
) {
  const wire: Record<string, unknown> = {
    application_id: asId(input.applicationId, "applicationId"),
    job_interview_id: asId(input.jobInterviewId, "jobInterviewId"),
    interviewers: mapInterviewers(input.interviewers),
    starts_at: optionalString(input.startsAt) ?? (() => { throw new Error("startsAt is required"); })(),
    ends_at: optionalString(input.endsAt) ?? (() => { throw new Error("endsAt is required"); })(),
    external_event_id:
      optionalString(input.externalEventId) ?? (() => { throw new Error("externalEventId is required"); })(),
  };
  if (optionalString(input.location)) wire.location = input.location;
  if (optionalString(input.videoConferencingUrl)) {
    wire.video_conferencing_url = input.videoConferencingUrl;
  }
  const client = createAuthClient(authClientOpts(input, "interviews.create"));
  return (await client.postJSON("/interviews", wire)) as Record<string, unknown>;
}

export async function executeInterviewsUpdate(
  input: GreenhouseAuthInput & {
    id: string;
    startsAt?: string;
    endsAt?: string;
    location?: string;
    videoConferencingUrl?: string;
    interviewers?: unknown;
    externalEventId?: string;
  },
) {
  const id = assertSafePathSegment(input.id, "id");
  const wire: Record<string, unknown> = {};
  if (optionalString(input.startsAt)) wire.starts_at = input.startsAt;
  if (optionalString(input.endsAt)) wire.ends_at = input.endsAt;
  if (optionalString(input.location)) wire.location = input.location;
  if (optionalString(input.videoConferencingUrl)) {
    wire.video_conferencing_url = input.videoConferencingUrl;
  }
  if (optionalString(input.externalEventId)) wire.external_event_id = input.externalEventId;
  if (input.interviewers != null) wire.interviewers = mapInterviewers(input.interviewers);
  const client = createAuthClient(authClientOpts(input, "interviews.update"));
  await client.patchJSON(`/interviews/${id}`, wire);
  return { interview: null };
}

export async function executeInterviewsDelete(input: GreenhouseAuthInput & { id: string }) {
  const id = assertSafePathSegment(input.id, "id");
  const client = createAuthClient(authClientOpts(input, "interviews.delete"));
  await client.deleteJSON(`/interviews/${id}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// offers.create
// ---------------------------------------------------------------------------

export async function executeOffersCreate(
  input: GreenhouseAuthInput & {
    applicationId: string | number;
    startsOn?: string;
    customFields?: GreenhouseCustomFieldInput[];
  },
) {
  const wire: Record<string, unknown> = {
    application_id: asId(input.applicationId, "applicationId"),
  };
  if (optionalString(input.startsOn)) wire.starts_on = input.startsOn;
  const customFields = customFieldsWire(input.customFields);
  if (customFields) wire.custom_fields = customFields;
  const client = createAuthClient(authClientOpts(input, "offers.create"));
  // Pass the 201 body through (top-level id). Creates omit effect keys.
  return (await client.postJSON("/offers", wire)) as Record<string, unknown>;
}
