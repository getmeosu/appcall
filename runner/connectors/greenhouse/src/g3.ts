/**
 * Greenhouse G3 — 15 Harvest v3 ops (jobs/openings, hiring team, job notes).
 * Auth/client: GH-0 Bearer via createAuthClient. Paths under /v3 only.
 *
 * Effect keys are omitted on all 15 ops (linus lock):
 * - creates pass the 201 body through (top-level `id`)
 * - deletes return `{ ok: true }`; any non-2xx (incl. 404) → CONNECTOR_UPSTREAM_ERROR
 * - jobs.update: tip jobs.get is not an exact observe (normalized job drops
 *   notes/requisition_id/office_ids/department_id/custom_fields; v3 GET has no `anywhere`)
 * - openings.update / job_notes.update: no single-GET observe
 *
 * The Harvest user being assigned/authoring is never read from `userId`: that key is
 * the Greenhouse credential field (OAuth `sub`), which the service strips from caller
 * input and re-injects. Role-specific names (ownerUserId / hiringManagerUserId /
 * authorUserId) are wired to `user_id` instead.
 */
import { createAuthClient } from "./http";
import { assertSafePathSegment } from "../../_shared/jobboard";
import { customFieldsWire, type GreenhouseCustomFieldInput } from "./g1";

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

function optionalId(value: string | number | undefined | null, field: string): number | undefined {
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

function idArray(value: unknown, field: string): number[] | undefined {
  if (value == null) return undefined;
  if (!Array.isArray(value)) throw new Error(`${field} must be an array of ids`);
  return value.map((v, i) => {
    const n = optionalId(v as string | number, `${field}[${i}]`);
    if (n == null) throw new Error(`${field}[${i}] must be an integer`);
    return n;
  });
}

function stringArray(value: unknown, field: string): string[] | undefined {
  if (value == null) return undefined;
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string" || v.length === 0)) {
    throw new Error(`${field} must be an array of non-empty strings`);
  }
  return value as string[];
}

function joinIds(value: unknown): string | undefined {
  if (value == null || value === "") return undefined;
  if (Array.isArray(value)) {
    const parts = value.map((v) => String(v)).filter((s) => s.length > 0);
    return parts.length > 0 ? parts.join(",") : undefined;
  }
  return String(value);
}

function boolParam(value: unknown): string | undefined {
  return typeof value === "boolean" ? String(value) : undefined;
}

function perPageParam(value: unknown): string | undefined {
  return typeof value === "number" && Number.isFinite(value) ? String(Math.trunc(value)) : undefined;
}

function oneOf(value: unknown, allowed: readonly string[], field: string): string | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new Error(`${field} must be one of ${allowed.join("|")}`);
  }
  return value;
}

function listMeta(body: unknown, nextCursor: string | null) {
  return { items: Array.isArray(body) ? body : [], nextCursor };
}

async function deleteById(input: GreenhouseAuthInput & { id: string }, resource: string, operation: string) {
  const id = assertSafePathSegment(input.id, "id");
  const client = createAuthClient(authClientOpts(input, operation));
  await client.deleteJSON(`/${resource}/${id}`);
  return { ok: true as const };
}

export const JOB_OWNER_TYPES = ["recruiter", "coordinator", "sourcer"] as const;
export const CANDIDATE_RESPONSIBILITY = ["active", "inactive", "future", "all"] as const;
export const OPENING_STATUSES = ["open", "closed"] as const;
export const JOB_NOTE_VISIBILITY = ["admin_only_visible", "privately_visible"] as const;

// ---------------------------------------------------------------------------
// jobs.create / jobs.update
// ---------------------------------------------------------------------------

export async function executeJobsCreate(
  input: GreenhouseAuthInput & {
    templateJobId: string | number;
    numberOfOpenings: number;
    jobName?: string;
    jobPostName?: string;
    departmentId?: string | number;
    officeIds?: Array<string | number>;
    requisitionId?: string;
    notes?: string;
    openingIds?: string[];
    customFields?: GreenhouseCustomFieldInput[];
  },
) {
  const numberOfOpenings = input.numberOfOpenings;
  if (typeof numberOfOpenings !== "number" || !Number.isInteger(numberOfOpenings) || numberOfOpenings < 1) {
    throw new Error("numberOfOpenings is required (integer >= 1)");
  }
  const wire: Record<string, unknown> = {
    template_job_id: asId(input.templateJobId, "templateJobId"),
    number_of_openings: numberOfOpenings,
  };
  const jobName = optionalString(input.jobName);
  if (jobName != null) wire.job_name = jobName;
  const jobPostName = optionalString(input.jobPostName);
  if (jobPostName != null) wire.job_post_name = jobPostName;
  const departmentId = optionalId(input.departmentId, "departmentId");
  if (departmentId != null) wire.department_id = departmentId;
  const officeIds = idArray(input.officeIds, "officeIds");
  if (officeIds) wire.office_ids = officeIds;
  const requisitionId = optionalString(input.requisitionId);
  if (requisitionId != null) wire.requisition_id = requisitionId;
  const notes = optionalString(input.notes);
  if (notes != null) wire.notes = notes;
  const openingIds = stringArray(input.openingIds, "openingIds");
  if (openingIds) {
    if (openingIds.length > numberOfOpenings) {
      throw new Error("openingIds cannot exceed numberOfOpenings");
    }
    wire.opening_ids = openingIds;
  }
  const customFields = customFieldsWire(input.customFields);
  if (customFields) wire.custom_fields = customFields;
  const client = createAuthClient(authClientOpts(input, "jobs.create"));
  return (await client.postJSON("/jobs", wire)) as Record<string, unknown>;
}

export async function executeJobsUpdate(
  input: GreenhouseAuthInput & {
    id: string;
    name?: string;
    notes?: string;
    requisitionId?: string | null;
    officeIds?: Array<string | number>;
    departmentId?: string | number | null;
    anywhere?: boolean | null;
    customFields?: GreenhouseCustomFieldInput[];
  },
) {
  const id = assertSafePathSegment(input.id, "id");
  const wire: Record<string, unknown> = {};
  const name = optionalString(input.name);
  if (name != null) wire.name = name;
  if (typeof input.notes === "string") wire.notes = input.notes;
  if (input.requisitionId === null) wire.requisition_id = null;
  else {
    const requisitionId = optionalString(input.requisitionId);
    if (requisitionId != null) wire.requisition_id = requisitionId;
  }
  const officeIds = idArray(input.officeIds, "officeIds");
  if (officeIds) wire.office_ids = officeIds;
  if (input.departmentId === null) wire.department_id = null;
  else {
    const departmentId = optionalId(input.departmentId, "departmentId");
    if (departmentId != null) wire.department_id = departmentId;
  }
  if (typeof input.anywhere === "boolean" || input.anywhere === null) wire.anywhere = input.anywhere;
  const customFields = customFieldsWire(input.customFields);
  if (customFields) wire.custom_fields = customFields;
  if (Object.keys(wire).length === 0) {
    throw new Error("Provide at least one field to update");
  }
  const client = createAuthClient(authClientOpts(input, "jobs.update"));
  return (await client.patchJSON(`/jobs/${id}`, wire)) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// job_posts.list
// ---------------------------------------------------------------------------

export async function executeJobPostsList(
  input: GreenhouseAuthInput & {
    jobIds?: IdList;
    jobBoardIds?: IdList;
    active?: boolean;
    live?: boolean;
    internal?: boolean;
    featured?: boolean;
    ids?: IdList;
    perPage?: number;
    cursor?: string;
  },
) {
  const client = createAuthClient(authClientOpts(input, "job_posts.list"));
  const path =
    "/job_posts" +
    buildQuery({
      job_ids: joinIds(input.jobIds),
      job_board_ids: joinIds(input.jobBoardIds),
      active: boolParam(input.active),
      live: boolParam(input.live),
      internal: boolParam(input.internal),
      featured: boolParam(input.featured),
      ids: joinIds(input.ids),
      per_page: perPageParam(input.perPage),
      cursor: optionalString(input.cursor),
    });
  const { body, nextCursor } = await client.getJSONWithMeta(path);
  const listed = listMeta(body, nextCursor);
  return { jobPosts: listed.items, nextCursor: listed.nextCursor };
}

// ---------------------------------------------------------------------------
// openings
// ---------------------------------------------------------------------------

export async function executeOpeningsList(
  input: GreenhouseAuthInput & {
    jobIds?: IdList;
    applicationIds?: IdList;
    closeReasonIds?: IdList;
    open?: boolean;
    openingId?: string;
    ids?: IdList;
    perPage?: number;
    cursor?: string;
  },
) {
  const client = createAuthClient(authClientOpts(input, "openings.list"));
  const path =
    "/openings" +
    buildQuery({
      job_ids: joinIds(input.jobIds),
      application_ids: joinIds(input.applicationIds),
      close_reason_ids: joinIds(input.closeReasonIds),
      open: boolParam(input.open),
      opening_id: optionalString(input.openingId),
      ids: joinIds(input.ids),
      per_page: perPageParam(input.perPage),
      cursor: optionalString(input.cursor),
    });
  const { body, nextCursor } = await client.getJSONWithMeta(path);
  const listed = listMeta(body, nextCursor);
  return { openings: listed.items, nextCursor: listed.nextCursor };
}

export async function executeOpeningsCreate(
  input: GreenhouseAuthInput & {
    jobId: string | number;
    openingId?: string;
    customFields?: GreenhouseCustomFieldInput[];
  },
) {
  const wire: Record<string, unknown> = { job_id: asId(input.jobId, "jobId") };
  const openingId = optionalString(input.openingId);
  if (openingId != null) wire.opening_id = openingId;
  const customFields = customFieldsWire(input.customFields);
  if (customFields) wire.custom_fields = customFields;
  const client = createAuthClient(authClientOpts(input, "openings.create"));
  return (await client.postJSON("/openings", wire)) as Record<string, unknown>;
}

export async function executeOpeningsUpdate(
  input: GreenhouseAuthInput & {
    id: string;
    status?: string;
    closeReasonId?: string | number;
    targetStartOn?: string;
    openingId?: string;
    customFields?: GreenhouseCustomFieldInput[];
  },
) {
  const id = assertSafePathSegment(input.id, "id");
  const wire: Record<string, unknown> = {};
  const status = oneOf(input.status, OPENING_STATUSES, "status");
  if (status != null) wire.status = status;
  const closeReasonId = optionalId(input.closeReasonId, "closeReasonId");
  if (closeReasonId != null) wire.close_reason_id = closeReasonId;
  const targetStartOn = optionalString(input.targetStartOn);
  if (targetStartOn != null) wire.target_start_on = targetStartOn;
  const openingId = optionalString(input.openingId);
  if (openingId != null) wire.opening_id = openingId;
  const customFields = customFieldsWire(input.customFields);
  if (customFields) wire.custom_fields = customFields;
  if (Object.keys(wire).length === 0) {
    throw new Error("Provide at least one field to update");
  }
  const client = createAuthClient(authClientOpts(input, "openings.update"));
  return (await client.patchJSON(`/openings/${id}`, wire)) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// job_owners (recruiter / coordinator / sourcer)
// ---------------------------------------------------------------------------

export async function executeJobOwnersList(
  input: GreenhouseAuthInput & {
    jobIds?: IdList;
    userIds?: IdList;
    type?: string;
    ids?: IdList;
    perPage?: number;
    cursor?: string;
  },
) {
  const type = oneOf(input.type, JOB_OWNER_TYPES, "type");
  const client = createAuthClient(authClientOpts(input, "job_owners.list"));
  const path =
    "/job_owners" +
    buildQuery({
      job_ids: joinIds(input.jobIds),
      user_ids: joinIds(input.userIds),
      type,
      ids: joinIds(input.ids),
      per_page: perPageParam(input.perPage),
      cursor: optionalString(input.cursor),
    });
  const { body, nextCursor } = await client.getJSONWithMeta(path);
  const listed = listMeta(body, nextCursor);
  return { jobOwners: listed.items, nextCursor: listed.nextCursor };
}

export async function executeJobOwnersCreate(
  input: GreenhouseAuthInput & {
    jobId: string | number;
    ownerUserId: string | number;
    type: string;
    candidateResponsibility?: string;
  },
) {
  const type = oneOf(input.type, JOB_OWNER_TYPES, "type");
  if (type == null) throw new Error(`type is required (${JOB_OWNER_TYPES.join("|")})`);
  const candidateResponsibility = oneOf(
    input.candidateResponsibility,
    CANDIDATE_RESPONSIBILITY,
    "candidateResponsibility",
  );
  const wire: Record<string, unknown> = {
    job_id: asId(input.jobId, "jobId"),
    user_id: asId(input.ownerUserId, "ownerUserId"),
    type,
  };
  if (candidateResponsibility != null) wire.candidate_responsibility = candidateResponsibility;
  const client = createAuthClient(authClientOpts(input, "job_owners.create"));
  return (await client.postJSON("/job_owners", wire)) as Record<string, unknown>;
}

export async function executeJobOwnersDelete(input: GreenhouseAuthInput & { id: string }) {
  return deleteById(input, "job_owners", "job_owners.delete");
}

// ---------------------------------------------------------------------------
// job_hiring_managers
// ---------------------------------------------------------------------------

export async function executeJobHiringManagersList(
  input: GreenhouseAuthInput & {
    jobIds?: IdList;
    userIds?: IdList;
    ids?: IdList;
    perPage?: number;
    cursor?: string;
  },
) {
  const client = createAuthClient(authClientOpts(input, "job_hiring_managers.list"));
  const path =
    "/job_hiring_managers" +
    buildQuery({
      job_ids: joinIds(input.jobIds),
      user_ids: joinIds(input.userIds),
      ids: joinIds(input.ids),
      per_page: perPageParam(input.perPage),
      cursor: optionalString(input.cursor),
    });
  const { body, nextCursor } = await client.getJSONWithMeta(path);
  const listed = listMeta(body, nextCursor);
  return { jobHiringManagers: listed.items, nextCursor: listed.nextCursor };
}

export async function executeJobHiringManagersCreate(
  input: GreenhouseAuthInput & {
    jobId: string | number;
    hiringManagerUserId: string | number;
  },
) {
  const wire: Record<string, unknown> = {
    job_id: asId(input.jobId, "jobId"),
    user_id: asId(input.hiringManagerUserId, "hiringManagerUserId"),
  };
  const client = createAuthClient(authClientOpts(input, "job_hiring_managers.create"));
  return (await client.postJSON("/job_hiring_managers", wire)) as Record<string, unknown>;
}

export async function executeJobHiringManagersDelete(input: GreenhouseAuthInput & { id: string }) {
  return deleteById(input, "job_hiring_managers", "job_hiring_managers.delete");
}

// ---------------------------------------------------------------------------
// job_notes
// ---------------------------------------------------------------------------

export async function executeJobNotesList(
  input: GreenhouseAuthInput & {
    jobIds?: IdList;
    userIds?: IdList;
    visibility?: string;
    ids?: IdList;
    perPage?: number;
    cursor?: string;
  },
) {
  const visibility = oneOf(input.visibility, JOB_NOTE_VISIBILITY, "visibility");
  const client = createAuthClient(authClientOpts(input, "job_notes.list"));
  const path =
    "/job_notes" +
    buildQuery({
      job_ids: joinIds(input.jobIds),
      user_ids: joinIds(input.userIds),
      visibility,
      ids: joinIds(input.ids),
      per_page: perPageParam(input.perPage),
      cursor: optionalString(input.cursor),
    });
  const { body, nextCursor } = await client.getJSONWithMeta(path);
  const listed = listMeta(body, nextCursor);
  return { jobNotes: listed.items, nextCursor: listed.nextCursor };
}

export async function executeJobNotesCreate(
  input: GreenhouseAuthInput & {
    jobId: string | number;
    authorUserId: string | number;
    body: string;
    visibility: string;
  },
) {
  const visibility = oneOf(input.visibility, JOB_NOTE_VISIBILITY, "visibility");
  if (visibility == null) throw new Error(`visibility is required (${JOB_NOTE_VISIBILITY.join("|")})`);
  const wire: Record<string, unknown> = {
    job_id: asId(input.jobId, "jobId"),
    user_id: asId(input.authorUserId, "authorUserId"),
    body: requiredString(input.body, "body"),
    visibility,
  };
  const client = createAuthClient(authClientOpts(input, "job_notes.create"));
  return (await client.postJSON("/job_notes", wire)) as Record<string, unknown>;
}

export async function executeJobNotesUpdate(
  input: GreenhouseAuthInput & {
    id: string;
    body?: string;
    visibility?: string;
  },
) {
  const id = assertSafePathSegment(input.id, "id");
  const wire: Record<string, unknown> = {};
  const body = optionalString(input.body);
  if (body != null) wire.body = body;
  const visibility = oneOf(input.visibility, JOB_NOTE_VISIBILITY, "visibility");
  if (visibility != null) wire.visibility = visibility;
  if (Object.keys(wire).length === 0) {
    throw new Error("Provide body and/or visibility");
  }
  const client = createAuthClient(authClientOpts(input, "job_notes.update"));
  return (await client.patchJSON(`/job_notes/${id}`, wire)) as Record<string, unknown>;
}
