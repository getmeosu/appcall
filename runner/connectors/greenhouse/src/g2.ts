/**
 * Greenhouse G2 — 15 Harvest v3 ops (candidate profile depth, merges/deletes,
 * attachments, educations/employments, tag dictionary, rejection details).
 * Auth/client: GH-0 Bearer via createAuthClient. Paths under /v3 only.
 *
 * Effect keys are omitted on all 15 ops (linus lock):
 * - creates pass the 201 body through (top-level `id`)
 * - deletes return `{ ok: true }`; any non-2xx (incl. 404) → CONNECTOR_UPSTREAM_ERROR
 * - candidates.merge is destructive (secondary permanently deleted)
 * - rejection_details.update has no single-GET observe
 */
import { createAuthClient } from "./http";
import { assertSafePathSegment } from "../../_shared/jobboard";

export interface GreenhouseAuthInput {
  clientId: string;
  clientSecret: string;
  userId?: string;
  fetch?: typeof fetch;
}

type IdList = string | number | Array<string | number>;

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

function optionalId(value: string | number | undefined, field: string): number | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && /^-?\d+$/.test(value)) return Number(value);
  throw new Error(`${field} must be an integer`);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function requiredString(value: unknown, field: string): string {
  const s = optionalString(value);
  if (s == null) throw new Error(`${field} is required`);
  return s;
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

function boolParam(value: unknown): string | undefined {
  return typeof value === "boolean" ? String(value) : undefined;
}

function perPageParam(value: unknown): string | undefined {
  return typeof value === "number" && Number.isFinite(value) ? String(Math.trunc(value)) : undefined;
}

async function deleteById(input: GreenhouseAuthInput & { id: string }, resource: string, operation: string) {
  const id = assertSafePathSegment(input.id, "id");
  const client = createAuthClient(authClientOpts(input, operation));
  await client.deleteJSON(`/${resource}/${id}`);
  return { ok: true as const };
}

export const ATTACHMENT_TYPES = [
  "resume",
  "cover_letter",
  "take_home_test",
  "offer_packet",
  "offer_letter",
  "signed_offer_letter",
  "other",
  "form_attachment",
  "midfunnel_agreement",
  "automated_agreement",
] as const;
const ATTACHMENT_TYPE_SET = new Set<string>(ATTACHMENT_TYPES);
const ATTACHMENT_VISIBILITY = new Set(["admin_only", "private", "public"]);

// ---------------------------------------------------------------------------
// candidates.merge / candidates.delete / applications.delete
// ---------------------------------------------------------------------------

export async function executeCandidatesMerge(
  input: GreenhouseAuthInput & {
    /** Primary (surviving) candidate id. */
    id: string;
    secondaryCandidateId: string | number;
  },
) {
  const id = assertSafePathSegment(input.id, "id");
  const secondary = asId(input.secondaryCandidateId, "secondaryCandidateId");
  if (String(secondary) === String(id)) {
    throw new Error("secondaryCandidateId must differ from id");
  }
  const client = createAuthClient(authClientOpts(input, "candidates.merge"));
  // 200 returns the surviving primary candidate (top-level id) — pass through.
  return (await client.postJSON(`/candidates/${id}/merge`, {
    secondary_candidate_id: secondary,
  })) as Record<string, unknown>;
}

export async function executeCandidatesDelete(input: GreenhouseAuthInput & { id: string }) {
  return deleteById(input, "candidates", "candidates.delete");
}

export async function executeApplicationsDelete(input: GreenhouseAuthInput & { id: string }) {
  return deleteById(input, "applications", "applications.delete");
}

// ---------------------------------------------------------------------------
// attachments
// ---------------------------------------------------------------------------

export async function executeAttachmentsList(
  input: GreenhouseAuthInput & {
    applicationIds?: IdList;
    candidateIds?: IdList;
    type?: string;
    ids?: IdList;
    perPage?: number;
    cursor?: string;
  },
) {
  const type = optionalString(input.type);
  if (type != null && !ATTACHMENT_TYPE_SET.has(type)) {
    throw new Error(`type must be one of ${ATTACHMENT_TYPES.join("|")}`);
  }
  const client = createAuthClient(authClientOpts(input, "attachments.list"));
  const path =
    "/attachments" +
    buildQuery({
      application_ids: joinIds(input.applicationIds),
      candidate_ids: joinIds(input.candidateIds),
      type,
      ids: joinIds(input.ids),
      per_page: perPageParam(input.perPage),
      cursor: optionalString(input.cursor),
    });
  const { body, nextCursor } = await client.getJSONWithMeta(path);
  const listed = listMeta(body, nextCursor);
  return { attachments: listed.items, nextCursor: listed.nextCursor };
}

export async function executeAttachmentsCreate(
  input: GreenhouseAuthInput & {
    applicationId: string | number;
    filename: string;
    type: string;
    content?: string;
    url?: string;
    visibility?: string;
  },
) {
  const applicationId = asId(input.applicationId, "applicationId");
  const filename = requiredString(input.filename, "filename");
  const type = requiredString(input.type, "type");
  if (!ATTACHMENT_TYPE_SET.has(type)) {
    throw new Error(`type must be one of ${ATTACHMENT_TYPES.join("|")}`);
  }
  const content = optionalString(input.content);
  const url = optionalString(input.url);
  if ((content == null) === (url == null)) {
    throw new Error("Provide exactly one of content (base64) or url");
  }
  const visibility = optionalString(input.visibility);
  if (visibility != null && !ATTACHMENT_VISIBILITY.has(visibility)) {
    throw new Error("visibility must be admin_only|private|public");
  }
  const wire: Record<string, unknown> = { application_id: applicationId, filename, type };
  if (content != null) wire.content = content;
  if (url != null) wire.url = url;
  if (visibility != null) wire.visibility = visibility;
  const client = createAuthClient(authClientOpts(input, "attachments.create"));
  // JSON body (not multipart); pass the 201 body through so `id` is top-level.
  return (await client.postJSON("/attachments", wire)) as Record<string, unknown>;
}

export async function executeAttachmentsDelete(input: GreenhouseAuthInput & { id: string }) {
  return deleteById(input, "attachments", "attachments.delete");
}

// ---------------------------------------------------------------------------
// candidate_educations
// ---------------------------------------------------------------------------

export async function executeCandidateEducationsList(
  input: GreenhouseAuthInput & {
    candidateIds?: IdList;
    latest?: boolean;
    ids?: IdList;
    perPage?: number;
    cursor?: string;
  },
) {
  const client = createAuthClient(authClientOpts(input, "candidate_educations.list"));
  const path =
    "/candidate_educations" +
    buildQuery({
      candidate_ids: joinIds(input.candidateIds),
      latest: boolParam(input.latest),
      ids: joinIds(input.ids),
      per_page: perPageParam(input.perPage),
      cursor: optionalString(input.cursor),
    });
  const { body, nextCursor } = await client.getJSONWithMeta(path);
  const listed = listMeta(body, nextCursor);
  return { candidateEducations: listed.items, nextCursor: listed.nextCursor };
}

function optionalBoundedInt(value: unknown, field: string, min: number, max: number): number | undefined {
  if (value == null || value === "") return undefined;
  const n = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`${field} must be an integer between ${min} and ${max}`);
  }
  return n;
}

export async function executeCandidateEducationsCreate(
  input: GreenhouseAuthInput & {
    candidateId: string | number;
    schoolNameCustomFieldOptionId?: string | number;
    degreeCustomFieldOptionId?: string | number;
    disciplineCustomFieldOptionId?: string | number;
    startDate?: string;
    endDate?: string;
    startDateMonth?: number;
    startDateYear?: number;
    endDateMonth?: number;
    endDateYear?: number;
  },
) {
  const wire: Record<string, unknown> = { candidate_id: asId(input.candidateId, "candidateId") };
  const optionIds: Array<[keyof typeof input, string]> = [
    ["schoolNameCustomFieldOptionId", "school_name_custom_field_option_id"],
    ["degreeCustomFieldOptionId", "degree_custom_field_option_id"],
    ["disciplineCustomFieldOptionId", "discipline_custom_field_option_id"],
  ];
  for (const [camel, snake] of optionIds) {
    const v = optionalId(input[camel] as string | number | undefined, String(camel));
    if (v != null) wire[snake] = v;
  }

  for (const side of ["start", "end"] as const) {
    const date = optionalString(input[`${side}Date`]);
    const month = optionalBoundedInt(input[`${side}DateMonth`], `${side}DateMonth`, 1, 12);
    const year = optionalBoundedInt(input[`${side}DateYear`], `${side}DateYear`, 1900, 2100);
    if (date != null && (month != null || year != null)) {
      throw new Error(
        `Use either ${side}Date or ${side}DateMonth/${side}DateYear, not both`,
      );
    }
    if (date != null) wire[`${side}_date`] = date;
    if (month != null) wire[`${side}_date_month`] = month;
    if (year != null) wire[`${side}_date_year`] = year;
  }

  const client = createAuthClient(authClientOpts(input, "candidate_educations.create"));
  return (await client.postJSON("/candidate_educations", wire)) as Record<string, unknown>;
}

export async function executeCandidateEducationsDelete(input: GreenhouseAuthInput & { id: string }) {
  return deleteById(input, "candidate_educations", "candidate_educations.delete");
}

// ---------------------------------------------------------------------------
// candidate_employments
// ---------------------------------------------------------------------------

export async function executeCandidateEmploymentsList(
  input: GreenhouseAuthInput & {
    candidateIds?: IdList;
    latest?: boolean;
    ids?: IdList;
    perPage?: number;
    cursor?: string;
  },
) {
  const client = createAuthClient(authClientOpts(input, "candidate_employments.list"));
  const path =
    "/candidate_employments" +
    buildQuery({
      candidate_ids: joinIds(input.candidateIds),
      latest: boolParam(input.latest),
      ids: joinIds(input.ids),
      per_page: perPageParam(input.perPage),
      cursor: optionalString(input.cursor),
    });
  const { body, nextCursor } = await client.getJSONWithMeta(path);
  const listed = listMeta(body, nextCursor);
  return { candidateEmployments: listed.items, nextCursor: listed.nextCursor };
}

export async function executeCandidateEmploymentsCreate(
  input: GreenhouseAuthInput & {
    candidateId: string | number;
    companyName: string;
    title: string;
    startDate: string;
    endDate?: string;
  },
) {
  const wire: Record<string, unknown> = {
    candidate_id: asId(input.candidateId, "candidateId"),
    company_name: requiredString(input.companyName, "companyName"),
    title: requiredString(input.title, "title"),
    start_date: requiredString(input.startDate, "startDate"),
  };
  const endDate = optionalString(input.endDate);
  if (endDate != null) wire.end_date = endDate;
  const client = createAuthClient(authClientOpts(input, "candidate_employments.create"));
  return (await client.postJSON("/candidate_employments", wire)) as Record<string, unknown>;
}

export async function executeCandidateEmploymentsDelete(input: GreenhouseAuthInput & { id: string }) {
  return deleteById(input, "candidate_employments", "candidate_employments.delete");
}

// ---------------------------------------------------------------------------
// candidate_tags (dictionary)
// ---------------------------------------------------------------------------

export async function executeCandidateTagsCreate(input: GreenhouseAuthInput & { name: string }) {
  const name = requiredString(input.name, "name");
  const client = createAuthClient(authClientOpts(input, "candidate_tags.create"));
  return (await client.postJSON("/candidate_tags", { name })) as Record<string, unknown>;
}

export async function executeCandidateTagsDelete(input: GreenhouseAuthInput & { id: string }) {
  return deleteById(input, "candidate_tags", "candidate_tags.delete");
}

// ---------------------------------------------------------------------------
// rejection_details.update
// ---------------------------------------------------------------------------

export async function executeRejectionDetailsUpdate(
  input: GreenhouseAuthInput & {
    /** Rejection-detail row id (not the application id). */
    id: string;
    rejectionReasonId?: string | number;
    customFields?: Array<Record<string, unknown>>;
  },
) {
  const id = assertSafePathSegment(input.id, "id");
  const wire: Record<string, unknown> = {};
  const reasonId = optionalId(input.rejectionReasonId, "rejectionReasonId");
  if (reasonId != null) wire.rejection_reason_id = reasonId;
  if (input.customFields != null) {
    if (!Array.isArray(input.customFields)) {
      throw new Error("customFields must be an array of { name_key | custom_field_id, value }");
    }
    wire.custom_fields = input.customFields;
  }
  if (Object.keys(wire).length === 0) {
    throw new Error("Provide rejectionReasonId and/or customFields");
  }
  const client = createAuthClient(authClientOpts(input, "rejection_details.update"));
  return (await client.patchJSON(`/rejection_details/${id}`, wire)) as Record<string, unknown>;
}
